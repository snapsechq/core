import Redis from "ioredis";
import { BaseCache } from "./base.cache.js";
import { buildRedisUrl } from "./url.js";
import { serialize, deserialize } from "./serializer.js";

const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;

export class RedisCache extends BaseCache {
    constructor(config = {}) {
        super(config);
        this.storage = "redis";
        this.url = buildRedisUrl(config);
        this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : DEFAULT_MAX_RETRIES;
        this.initialBackoffMs = config.initialBackoffMs !== undefined ? config.initialBackoffMs : DEFAULT_INITIAL_BACKOFF_MS;

        this.subscribers = new Map(); // channel -> Set<Function>
        this.dequeueWorkers = new Set(); // Set<{ active: boolean }>
        this.isConnected = false;

        this.client = config.redisClient || null;
        this.subscriber = config.subscriberClient || null;

        // Auto-connect unless explicitly disabled (e.g. in tests)
        if (config.autoConnect !== false && (!this.client || !this.subscriber)) {
            this.connect();
        } else if (this.client) {
            this.isConnected = true;
            this.setupSubscriberEvents();
        }
    }

    /**
     * Initializes Redis command and subscriber clients with exponential backoff retry.
     */
    connect() {
        if (this.client && this.subscriber) {
            return this.client;
        }

        const retryStrategy = (times) => {
            if (this.maxRetries !== null && times > this.maxRetries) {
                this.logger.error(`[RedisCache] Connection failed after ${this.maxRetries} attempts.`);
                return null;
            }
            const jitter = Math.random() * 200;
            const delay = this.initialBackoffMs * Math.pow(2, times - 1) + jitter;
            this.logger.warn?.(`[RedisCache] Retrying connection in ${Math.round(delay / 1000)}s (attempt ${times})...`);
            return delay;
        };

        const redisOptions = {
            retryStrategy,
            maxRetriesPerRequest: null,
            lazyConnect: this.config.lazyConnect || false,
            ...(this.config.ioredisOptions || {})
        };

        if (!this.client) {
            this.client = new Redis(this.url, redisOptions);
            this.client.on("connect", () => {
                this.isConnected = true;
                this.logger.info?.("[RedisCache] Command client connected successfully.");
            });
            this.client.on("error", (err) => {
                this.logger.error("[RedisCache] Connection error:", err.message);
            });
            this.client.on("close", () => {
                this.isConnected = false;
                this.logger.warn?.("[RedisCache] Connection closed.");
            });
        }

        if (!this.subscriber) {
            this.subscriber = new Redis(this.url, redisOptions);
            this.subscriber.on("error", (err) => {
                this.logger.error("[RedisCache] Subscriber connection error:", err.message);
            });
        }

        this.setupSubscriberEvents();
        return this.client;
    }

    setupSubscriberEvents() {
        if (!this.subscriber || this.subscriber._hasSubscriberHandlerAttached) {
            return;
        }

        this.subscriber.on("message", (channel, message) => {
            const callbacks = this.subscribers.get(channel);
            if (callbacks && callbacks.size > 0) {
                const parsed = deserialize(message);
                callbacks.forEach((cb) => {
                    try {
                        cb(parsed);
                    } catch (err) {
                        this.logger.error(`[RedisCache] Error executing callback for channel ${channel}:`, err.message);
                    }
                });
            }
        });

        this.subscriber._hasSubscriberHandlerAttached = true;
    }

    // --- Key-Value Operations ---

    async get(key) {
        const data = await this.client.get(key);
        return deserialize(data);
    }

    async set(key, value, ttlSeconds = null) {
        const stringValue = serialize(value);
        if (ttlSeconds !== null && ttlSeconds !== undefined) {
            return await this.client.set(key, stringValue, "EX", Number(ttlSeconds));
        }
        return await this.client.set(key, stringValue);
    }

    async setnx(key, value, ttlSeconds = null) {
        const stringValue = serialize(value);
        if (ttlSeconds !== null && ttlSeconds !== undefined) {
            return await this.client.set(key, stringValue, "EX", Number(ttlSeconds), "NX");
        }
        return await this.client.set(key, stringValue, "NX");
    }

    async del(...keys) {
        const flatKeys = keys.flat();
        if (flatKeys.length === 0) return 0;
        return await this.client.del(...flatKeys);
    }

    async exists(...keys) {
        const flatKeys = keys.flat();
        if (flatKeys.length === 0) return 0;
        return await this.client.exists(...flatKeys);
    }

    async expire(key, seconds) {
        return await this.client.expire(key, Number(seconds));
    }

    async ttl(key) {
        return await this.client.ttl(key);
    }

    async incr(key) {
        return await this.client.incr(key);
    }

    async incrby(key, count) {
        return await this.client.incrby(key, Number(count));
    }

    async decr(key) {
        return await this.client.decr(key);
    }

    async decrby(key, count) {
        return await this.client.decrby(key, Number(count));
    }

    async mget(...keys) {
        const flatKeys = keys.flat();
        if (flatKeys.length === 0) return [];
        const results = await this.client.mget(...flatKeys);
        return results.map(deserialize);
    }

    async mset(entries) {
        let args = [];
        if (Array.isArray(entries)) {
            for (const item of entries) {
                if (Array.isArray(item)) {
                    args.push(item[0], serialize(item[1]));
                }
            }
        } else if (typeof entries === "object" && entries !== null) {
            for (const [k, v] of Object.entries(entries)) {
                args.push(k, serialize(v));
            }
        }
        if (args.length === 0) return "OK";
        return await this.client.mset(...args);
    }

    // --- Pub/Sub Operations ---

    async publish(channel, message) {
        const stringMessage = serialize(message);
        return await this.client.publish(channel, stringMessage);
    }

    async subscribe(channel, callback) {
        if (!this.subscribers.has(channel)) {
            this.subscribers.set(channel, new Set());
            await this.subscriber.subscribe(channel);
        }
        this.subscribers.get(channel).add(callback);

        // Return unsubscribe function for convenience
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
                await this.subscriber.unsubscribe(channel);
            }
        }
    }

    // --- Queue Operations (List-based) ---

    async enqueue(queue, message) {
        const stringMessage = serialize(message);
        return await this.client.lpush(queue, stringMessage);
    }

    async dequeue(queue, callback, timeout = 0) {
        const worker = { active: true };
        this.dequeueWorkers.add(worker);

        const processLoop = async () => {
            while (worker.active) {
                try {
                    const result = await this.client.brpop(queue, timeout);
                    if (result && worker.active) {
                        const [, message] = result;
                        const parsed = deserialize(message);
                        await callback(parsed);
                    }
                } catch (err) {
                    if (worker.active) {
                        this.logger.error?.(`[RedisCache] Dequeue error on queue ${queue}:`, err.message);
                        // Brief pause to avoid aggressive retry loops on fatal connection failures
                        await new Promise((r) => setTimeout(r, 250));
                    }
                }
            }
        };

        // Fire-and-forget worker loop
        processLoop();

        // Return cancel/stop function
        return () => {
            worker.active = false;
            this.dequeueWorkers.delete(worker);
        };
    }

    async dequeueOnce(queue, timeout = 0) {
        const result = await this.client.brpop(queue, timeout);
        if (result && result.length >= 2) {
            return deserialize(result[1]);
        }
        return null;
    }

    // --- Hash Operations ---

    async hset(key, fieldOrObject, value) {
        if (typeof fieldOrObject === "object" && fieldOrObject !== null && value === undefined) {
            const serializedObj = {};
            for (const [f, v] of Object.entries(fieldOrObject)) {
                serializedObj[f] = serialize(v);
            }
            return await this.client.hset(key, serializedObj);
        }

        const stringValue = serialize(value);
        return await this.client.hset(key, fieldOrObject, stringValue);
    }

    async hget(key, field) {
        const data = await this.client.hget(key, field);
        return deserialize(data);
    }

    async hgetall(key) {
        const data = await this.client.hgetall(key);
        if (!data || Object.keys(data).length === 0) {
            return {};
        }
        const result = {};
        for (const [field, val] of Object.entries(data)) {
            result[field] = deserialize(val);
        }
        return result;
    }

    async hdel(key, ...fields) {
        const flatFields = fields.flat();
        if (flatFields.length === 0) return 0;
        return await this.client.hdel(key, ...flatFields);
    }

    async hexists(key, field) {
        return await this.client.hexists(key, field);
    }

    // --- Utility Operations ---

    async keys(pattern = "*") {
        return await this.client.keys(pattern);
    }

    async flush() {
        return await this.client.flushdb();
    }

    async flushdb() {
        return await this.client.flushdb();
    }

    async clear() {
        return await this.flush();
    }

    async ping() {
        return await this.client.ping();
    }

    async disconnect() {
        for (const worker of this.dequeueWorkers) {
            worker.active = false;
        }
        this.dequeueWorkers.clear();

        const closePromises = [];
        if (this.subscriber) {
            closePromises.push(
                this.subscriber.quit().catch(() => this.subscriber.disconnect?.())
            );
        }
        if (this.client) {
            closePromises.push(
                this.client.quit().catch(() => this.client.disconnect?.())
            );
        }

        await Promise.allSettled(closePromises);
        this.isConnected = false;
    }

    async close() {
        return this.disconnect();
    }
}
