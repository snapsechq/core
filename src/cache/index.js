import { BaseCache } from "./base.cache.js";
import { RedisCache } from "./redis.cache.js";
import { MemoryCache } from "./memory.cache.js";
import { buildRedisUrl } from "./url.js";
import { serialize, deserialize } from "./serializer.js";

/**
 * Factory function to create a cache instance.
 *
 * @param {Object} [config={}]
 * @param {string} [config.storage="redis"] - Storage type ("redis" or "memory")
 * @param {string} [config.url] - Redis connection URL
 * @param {string} [config.host] - Redis host
 * @param {number|string} [config.port] - Redis port
 * @param {string} [config.password] - Redis password
 * @param {string} [config.username] - Redis username
 * @param {number|string} [config.db] - Redis DB index
 * @param {boolean} [config.autoConnect=true] - Auto-connect to Redis
 * @returns {RedisCache|MemoryCache}
 */
export function createCache(config = {}) {
    const storage = (config.storage || process.env.CACHE_STORAGE || "redis").toLowerCase();
    if (storage === "memory") {
        return new MemoryCache(config);
    }
    return new RedisCache(config);
}

let defaultInstance = null;

export class Cache {
    static instance = null;

    static create(config = {}) {
        return createCache(config);
    }

    static getInstance(config = {}) {
        if (!Cache.instance) {
            Cache.instance = createCache(config);
            defaultInstance = Cache.instance;
        }
        return Cache.instance;
    }

    static setInstance(inst) {
        Cache.instance = inst;
        defaultInstance = inst;
    }

    static resetInstance() {
        if (Cache.instance) {
            Cache.instance.close?.();
            Cache.instance = null;
        }
        if (defaultInstance) {
            defaultInstance.close?.();
            defaultInstance = null;
        }
    }
}

export const cache = new Proxy({}, {
    get(target, prop) {
        if (!defaultInstance) {
            defaultInstance = Cache.getInstance();
        }
        const val = defaultInstance[prop];
        return typeof val === "function" ? val.bind(defaultInstance) : val;
    },
    set(target, prop, value) {
        if (!defaultInstance) {
            defaultInstance = Cache.getInstance();
        }
        defaultInstance[prop] = value;
        return true;
    }
});

// Alias for backwards compatibility with existing backend services using redisService
export const redisService = cache;

export {
    BaseCache,
    RedisCache,
    MemoryCache,
    buildRedisUrl,
    serialize,
    deserialize,
};

export default cache;
