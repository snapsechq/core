import { BaseCache } from "./base.cache.js";
import { serialize, deserialize } from "./serializer.js";

/**
 * In-Memory Cache Driver
 * Fully implements the BaseCache interface for fast unit tests and non-Redis environments.
 */
export class MemoryCache extends BaseCache {
    constructor(config = {}) {
        super(config);
        this.storage = "memory";
        this.store = new Map(); // key -> { value: string, expiresAt: number|null }
        this.hashes = new Map(); // key -> Map<field, string>
        this.lists = new Map(); // key -> Array<string>
        this.subscribers = new Map(); // channel -> Set<Function>
        this.dequeueWorkers = new Set(); // Set<{ active: boolean }>
        this.queueEvents = new Map(); // key -> Set<Function>
        this.isConnected = true;
    }

    _isExpired(entry) {
        if (!entry) return true;
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            return true;
        }
        return false;
    }

    _cleanKey(key) {
        const entry = this.store.get(key);
        if (entry && this._isExpired(entry)) {
            this.store.delete(key);
            return null;
        }
        return entry;
    }

    // --- Key-Value Operations ---

    async get(key) {
        const entry = this._cleanKey(key);
        if (!entry) return null;
        return deserialize(entry.value);
    }

    async set(key, value, ttlSeconds = null) {
        const expiresAt = ttlSeconds !== null && ttlSeconds !== undefined
            ? Date.now() + Number(ttlSeconds) * 1000
            : null;
        this.store.set(key, {
            value: serialize(value),
            expiresAt,
        });
        return "OK";
    }

    async setnx(key, value, ttlSeconds = null) {
        const entry = this._cleanKey(key);
        if (entry) {
            return 0;
        }
        await this.set(key, value, ttlSeconds);
        return 1;
    }

    async del(...keys) {
        const flatKeys = keys.flat();
        let deleted = 0;
        for (const k of flatKeys) {
            if (this.store.delete(k)) deleted++;
            if (this.hashes.delete(k)) deleted++;
            if (this.lists.delete(k)) deleted++;
        }
        return deleted;
    }

    async exists(...keys) {
        const flatKeys = keys.flat();
        let count = 0;
        for (const k of flatKeys) {
            if (this._cleanKey(k) || this.hashes.has(k) || this.lists.has(k)) {
                count++;
            }
        }
        return count;
    }

    async expire(key, seconds) {
        const entry = this._cleanKey(key);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + Number(seconds) * 1000;
        return 1;
    }

    async ttl(key) {
        const entry = this._cleanKey(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        const diff = Math.ceil((entry.expiresAt - Date.now()) / 1000);
        return diff > 0 ? diff : -2;
    }

    async incr(key) {
        return this.incrby(key, 1);
    }

    async incrby(key, count) {
        const entry = this._cleanKey(key);
        let current = 0;
        if (entry) {
            current = Number(deserialize(entry.value)) || 0;
        }
        const newVal = current + Number(count);
        this.store.set(key, {
            value: serialize(newVal),
            expiresAt: entry ? entry.expiresAt : null,
        });
        return newVal;
    }

    async decr(key) {
        return this.decrby(key, 1);
    }

    async decrby(key, count) {
        return this.incrby(key, -Number(count));
    }

    async mget(...keys) {
        const flatKeys = keys.flat();
        return flatKeys.map((k) => {
            const entry = this._cleanKey(k);
            return entry ? deserialize(entry.value) : null;
        });
    }

    async mset(entries) {
        if (Array.isArray(entries)) {
            for (const item of entries) {
                if (Array.isArray(item)) {
                    await this.set(item[0], item[1]);
                }
            }
        } else if (typeof entries === "object" && entries !== null) {
            for (const [k, v] of Object.entries(entries)) {
                await this.set(k, v);
            }
        }
        return "OK";
    }

    // --- Pub/Sub Operations ---

    async publish(channel, message) {
        const callbacks = this.subscribers.get(channel);
        if (!callbacks || callbacks.size === 0) return 0;
        const cloned = deserialize(serialize(message));
        callbacks.forEach((cb) => {
            try {
                cb(cloned);
            } catch (err) {
                this.logger.error(`[MemoryCache] Callback error for channel ${channel}:`, err.message);
            }
        });
        return callbacks.size;
    }

    async subscribe(channel, callback) {
        if (!this.subscribers.has(channel)) {
            this.subscribers.set(channel, new Set());
        }
        this.subscribers.get(channel).add(callback);
        return async () => this.unsubscribe(channel, callback);
    }

    async unsubscribe(channel, callback) {
        const callbacks = this.subscribers.get(channel);
        if (callbacks) {
            if (callback) {
                callbacks.delete(callback);
            } else {
                callbacks.clear();
            }
            if (callbacks.size === 0) {
                this.subscribers.delete(channel);
            }
        }
    }

    // --- Queue Operations (LPUSH / BRPOP) ---

    async enqueue(queue, message) {
        if (!this.lists.has(queue)) {
            this.lists.set(queue, []);
        }
        // LPUSH: push to the front (index 0)
        this.lists.get(queue).unshift(serialize(message));

        // Notify any waiting listeners
        const waiters = this.queueEvents.get(queue);
        if (waiters && waiters.size > 0) {
            const nextWaiter = waiters.values().next().value;
            waiters.delete(nextWaiter);
            nextWaiter();
        }
        return this.lists.get(queue).length;
    }

    async dequeue(queue, callback, timeout = 0) {
        const worker = { active: true };
        this.dequeueWorkers.add(worker);

        const processLoop = async () => {
            while (worker.active) {
                try {
                    const item = await this.dequeueOnce(queue, timeout || 1);
                    if (item !== null && worker.active) {
                        await callback(item);
                    }
                } catch (err) {
                    if (worker.active) {
                        this.logger.error?.(`[MemoryCache] Dequeue error on queue ${queue}:`, err.message);
                        await new Promise((r) => setTimeout(r, 100));
                    }
                }
            }
        };

        processLoop();

        return () => {
            worker.active = false;
            this.dequeueWorkers.delete(worker);
        };
    }

    async dequeueOnce(queue, timeout = 0) {
        const list = this.lists.get(queue);
        if (list && list.length > 0) {
            // RPOP: pop from the end
            return deserialize(list.pop());
        }

        if (timeout <= 0) {
            return null;
        }

        return new Promise((resolve) => {
            let timer = null;
            const cleanup = () => {
                if (timer) clearTimeout(timer);
                const waiters = this.queueEvents.get(queue);
                if (waiters) waiters.delete(onItem);
            };

            const onItem = () => {
                cleanup();
                const currentList = this.lists.get(queue);
                if (currentList && currentList.length > 0) {
                    resolve(deserialize(currentList.pop()));
                } else {
                    resolve(null);
                }
            };

            if (!this.queueEvents.has(queue)) {
                this.queueEvents.set(queue, new Set());
            }
            this.queueEvents.get(queue).add(onItem);

            if (timeout > 0) {
                timer = setTimeout(() => {
                    cleanup();
                    resolve(null);
                }, timeout * 1000);
            }
        });
    }

    // --- Hash Operations ---

    async hset(key, fieldOrObject, value) {
        if (!this.hashes.has(key)) {
            this.hashes.set(key, new Map());
        }
        const hashMap = this.hashes.get(key);

        if (typeof fieldOrObject === "object" && fieldOrObject !== null && value === undefined) {
            for (const [f, v] of Object.entries(fieldOrObject)) {
                hashMap.set(f, serialize(v));
            }
            return Object.keys(fieldOrObject).length;
        }

        hashMap.set(fieldOrObject, serialize(value));
        return 1;
    }

    async hget(key, field) {
        const hashMap = this.hashes.get(key);
        if (!hashMap || !hashMap.has(field)) return null;
        return deserialize(hashMap.get(field));
    }

    async hgetall(key) {
        const hashMap = this.hashes.get(key);
        if (!hashMap) return {};
        const result = {};
        for (const [f, v] of hashMap.entries()) {
            result[f] = deserialize(v);
        }
        return result;
    }

    async hdel(key, ...fields) {
        const hashMap = this.hashes.get(key);
        if (!hashMap) return 0;
        const flatFields = fields.flat();
        let deleted = 0;
        for (const f of flatFields) {
            if (hashMap.delete(f)) deleted++;
        }
        return deleted;
    }

    async hexists(key, field) {
        const hashMap = this.hashes.get(key);
        if (!hashMap) return 0;
        return hashMap.has(field) ? 1 : 0;
    }

    // --- Utility Operations ---

    async keys(pattern = "*") {
        const allKeys = new Set([
            ...this.store.keys(),
            ...this.hashes.keys(),
            ...this.lists.keys(),
        ]);

        if (pattern === "*") {
            return Array.from(allKeys).filter((k) => this._cleanKey(k) || this.hashes.has(k) || this.lists.has(k));
        }

        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return Array.from(allKeys).filter((k) => regex.test(k) && (this._cleanKey(k) || this.hashes.has(k) || this.lists.has(k)));
    }

    async flush() {
        this.store.clear();
        this.hashes.clear();
        this.lists.clear();
        return "OK";
    }

    async flushdb() {
        return this.flush();
    }

    async clear() {
        return this.flush();
    }

    async ping() {
        return "PONG";
    }

    async disconnect() {
        for (const worker of this.dequeueWorkers) {
            worker.active = false;
        }
        this.dequeueWorkers.clear();
        this.queueEvents.clear();
        this.subscribers.clear();
        this.isConnected = false;
    }

    async close() {
        return this.disconnect();
    }
}
