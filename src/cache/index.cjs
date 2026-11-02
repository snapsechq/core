/**
 * SnapSec Cache Utility
 * CommonJS Entrypoint
 */
const Redis = require("ioredis");

function serialize(value) {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

function deserialize(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function buildRedisUrl(config = {}) {
    if (typeof config === "string") {
        return config;
    }

    if (config.url) {
        return config.url;
    }

    if (process.env.REDIS_URL && (process.env.REDIS_URL.startsWith("redis://") || process.env.REDIS_URL.startsWith("rediss://"))) {
        return process.env.REDIS_URL;
    }

    const protocol = config.protocol || process.env.REDIS_PROTOCOL || "redis";
    const host = config.host || process.env.REDIS_HOST || (process.env.REDIS_URL && !process.env.REDIS_URL.includes("://") ? process.env.REDIS_URL : "localhost");
    const port = config.port || process.env.REDIS_PORT || 6379;
    const password = config.password !== undefined ? config.password : (process.env.REDIS_PASSWORD || process.env.REDIS_PASS || "");
    const username = config.username !== undefined ? config.username : (process.env.REDIS_USERNAME || process.env.REDIS_USER || "");
    const db = config.db !== undefined ? config.db : (process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined);

    let auth = "";
    if (username && password) {
        auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    } else if (password) {
        auth = `:${encodeURIComponent(password)}@`;
    }

    const dbPart = db !== undefined && db !== null && db !== "" ? `/${db}` : "";

    return `${protocol}://${auth}${host}:${port}${dbPart}`;
}

class BaseCache {
    constructor(config = {}) {
        this.config = config;
        this.storage = config.storage || "redis";
        this.logger = config.logger || console;
    }

    async get(key) { throw new Error("Method get() must be implemented."); }
    async set(key, value, ttlSeconds = null) { throw new Error("Method set() must be implemented."); }
    async setnx(key, value, ttlSeconds = null) { throw new Error("Method setnx() must be implemented."); }
    async del(...keys) { throw new Error("Method del() must be implemented."); }
    async exists(...keys) { throw new Error("Method exists() must be implemented."); }
    async expire(key, seconds) { throw new Error("Method expire() must be implemented."); }
    async ttl(key) { throw new Error("Method ttl() must be implemented."); }
    async incr(key) { throw new Error("Method incr() must be implemented."); }
    async incrby(key, count) { throw new Error("Method incrby() must be implemented."); }
    async decr(key) { throw new Error("Method decr() must be implemented."); }
    async decrby(key, count) { throw new Error("Method decrby() must be implemented."); }
    async mget(...keys) { throw new Error("Method mget() must be implemented."); }
    async mset(entries) { throw new Error("Method mset() must be implemented."); }
    async publish(channel, message) { throw new Error("Method publish() must be implemented."); }
    async subscribe(channel, callback) { throw new Error("Method subscribe() must be implemented."); }
    async unsubscribe(channel, callback) { throw new Error("Method unsubscribe() must be implemented."); }
    async enqueue(queue, message) { throw new Error("Method enqueue() must be implemented."); }
    async dequeue(queue, callback, timeout = 0) { throw new Error("Method dequeue() must be implemented."); }
    async dequeueOnce(queue, timeout = 0) { throw new Error("Method dequeueOnce() must be implemented."); }
    async hset(key, fieldOrObject, value) { throw new Error("Method hset() must be implemented."); }
    async hget(key, field) { throw new Error("Method hget() must be implemented."); }
    async hgetall(key) { throw new Error("Method hgetall() must be implemented."); }
    async hdel(key, ...fields) { throw new Error("Method hdel() must be implemented."); }
    async hexists(key, field) { throw new Error("Method hexists() must be implemented."); }
    async keys(pattern = "*") { throw new Error("Method keys() must be implemented."); }
    async flush() { throw new Error("Method flush() must be implemented."); }
    async ping() { throw new Error("Method ping() must be implemented."); }
    async disconnect() { throw new Error("Method disconnect() must be implemented."); }
    async close() { return this.disconnect(); }
}

const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;

class RedisCache extends BaseCache {
    constructor(config = {}) {
        super(config);
        this.storage = "redis";
        this.url = buildRedisUrl(config);
        this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : DEFAULT_MAX_RETRIES;
        this.initialBackoffMs = config.initialBackoffMs !== undefined ? config.initialBackoffMs : DEFAULT_INITIAL_BACKOFF_MS;

        this.subscribers = new Map();
        this.dequeueWorkers = new Set();
        this.isConnected = false;

        this.client = config.redisClient || null;
        this.subscriber = config.subscriberClient || null;

        if (config.autoConnect !== false && (!this.client || !this.subscriber)) {
            this.connect();
        } else if (this.client) {
            this.isConnected = true;
            this.setupSubscriberEvents();
        }
    }

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
                        await new Promise((r) => setTimeout(r, 250));
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
        const result = await this.client.brpop(queue, timeout);
        if (result && result.length >= 2) {
            return deserialize(result[1]);
        }
        return null;
    }

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

class MemoryCache extends BaseCache {
    constructor(config = {}) {
        super(config);
        this.storage = "memory";
        this.store = new Map();
        this.hashes = new Map();
        this.lists = new Map();
        this.subscribers = new Map();
        this.dequeueWorkers = new Set();
        this.queueEvents = new Map();
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
        if (entry) return 0;
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

    async enqueue(queue, message) {
        if (!this.lists.has(queue)) {
            this.lists.set(queue, []);
        }
        this.lists.get(queue).unshift(serialize(message));

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

function createCache(config = {}) {
    const storage = (config.storage || process.env.CACHE_STORAGE || "redis").toLowerCase();
    if (storage === "memory") {
        return new MemoryCache(config);
    }
    return new RedisCache(config);
}

class Cache {
    static instance = null;

    static create(config = {}) {
        return createCache(config);
    }

    static getInstance(config = {}) {
        if (!Cache.instance) {
            Cache.instance = createCache(config);
        }
        return Cache.instance;
    }

    static resetInstance() {
        if (Cache.instance) {
            Cache.instance.close?.();
            Cache.instance = null;
        }
    }
}

let defaultInstance = null;
const cache = new Proxy({}, {
    get(target, prop) {
        if (!defaultInstance) {
            defaultInstance = Cache.getInstance();
        }
        const val = defaultInstance[prop];
        return typeof val === "function" ? val.bind(defaultInstance) : val;
    }
});

const redisService = cache;

module.exports = {
    createCache,
    Cache,
    cache,
    redisService,
    BaseCache,
    RedisCache,
    MemoryCache,
    buildRedisUrl,
    serialize,
    deserialize,
};
module.exports.default = cache;
