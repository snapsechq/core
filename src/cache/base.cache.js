/**
 * Abstract Base Cache Interface
 * Defines the standardized contract implemented by all cache storage drivers.
 */
export class BaseCache {
    constructor(config = {}) {
        this.config = config;
        this.storage = config.storage || "redis";
        this.logger = config.logger || console;
    }

    async get(key) {
        throw new Error("Method get() must be implemented.");
    }

    async set(key, value, ttlSeconds = null) {
        throw new Error("Method set() must be implemented.");
    }

    async setnx(key, value, ttlSeconds = null) {
        throw new Error("Method setnx() must be implemented.");
    }

    async del(...keys) {
        throw new Error("Method del() must be implemented.");
    }

    async exists(...keys) {
        throw new Error("Method exists() must be implemented.");
    }

    async expire(key, seconds) {
        throw new Error("Method expire() must be implemented.");
    }

    async ttl(key) {
        throw new Error("Method ttl() must be implemented.");
    }

    async incr(key) {
        throw new Error("Method incr() must be implemented.");
    }

    async incrby(key, count) {
        throw new Error("Method incrby() must be implemented.");
    }

    async decr(key) {
        throw new Error("Method decr() must be implemented.");
    }

    async decrby(key, count) {
        throw new Error("Method decrby() must be implemented.");
    }

    async mget(...keys) {
        throw new Error("Method mget() must be implemented.");
    }

    async mset(entries) {
        throw new Error("Method mset() must be implemented.");
    }

    async publish(channel, message) {
        throw new Error("Method publish() must be implemented.");
    }

    async subscribe(channel, callback) {
        throw new Error("Method subscribe() must be implemented.");
    }

    async unsubscribe(channel, callback) {
        throw new Error("Method unsubscribe() must be implemented.");
    }

    async enqueue(queue, message) {
        throw new Error("Method enqueue() must be implemented.");
    }

    async dequeue(queue, callback, timeout = 0) {
        throw new Error("Method dequeue() must be implemented.");
    }

    async dequeueOnce(queue, timeout = 0) {
        throw new Error("Method dequeueOnce() must be implemented.");
    }

    async hset(key, fieldOrObject, value) {
        throw new Error("Method hset() must be implemented.");
    }

    async hget(key, field) {
        throw new Error("Method hget() must be implemented.");
    }

    async hgetall(key) {
        throw new Error("Method hgetall() must be implemented.");
    }

    async hdel(key, ...fields) {
        throw new Error("Method hdel() must be implemented.");
    }

    async hexists(key, field) {
        throw new Error("Method hexists() must be implemented.");
    }

    async keys(pattern = "*") {
        throw new Error("Method keys() must be implemented.");
    }

    async flush() {
        throw new Error("Method flush() must be implemented.");
    }

    async ping() {
        throw new Error("Method ping() must be implemented.");
    }

    async disconnect() {
        throw new Error("Method disconnect() must be implemented.");
    }

    async close() {
        return this.disconnect();
    }
}
