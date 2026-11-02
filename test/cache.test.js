import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    createCache,
    Cache,
    BaseCache,
    RedisCache,
    MemoryCache,
    buildRedisUrl,
    serialize,
    deserialize,
    cache,
} from "../src/cache/index.js";

describe("@snapsechq/cache", () => {
    describe("buildRedisUrl", () => {
        const originalEnv = { ...process.env };

        beforeEach(() => {
            delete process.env.REDIS_URL;
            delete process.env.REDIS_HOST;
            delete process.env.REDIS_PORT;
            delete process.env.REDIS_PASSWORD;
            delete process.env.REDIS_PASS;
            delete process.env.REDIS_USERNAME;
            delete process.env.REDIS_USER;
            delete process.env.REDIS_DB;
            delete process.env.REDIS_PROTOCOL;
        });

        afterEach(() => {
            process.env = { ...originalEnv };
        });

        it("returns direct string URL when provided as a string", () => {
            const url = buildRedisUrl("redis://custom-host:6379");
            expect(url).toBe("redis://custom-host:6379");
        });

        it("returns config.url if provided", () => {
            const url = buildRedisUrl({ url: "rediss://:secret@cache.cloud.com:6380/2" });
            expect(url).toBe("rediss://:secret@cache.cloud.com:6380/2");
        });

        it("builds URL from discrete parameters", () => {
            const url = buildRedisUrl({
                host: "redis.internal",
                port: 6380,
                password: "mySecretPassword",
                db: 3,
            });
            expect(url).toBe("redis://:mySecretPassword@redis.internal:6380/3");
        });

        it("includes username and password when both provided", () => {
            const url = buildRedisUrl({
                username: "snapsec",
                password: "p@ssword:123",
                host: "cluster.redis",
                port: 6379,
            });
            expect(url).toBe("redis://snapsec:p%40ssword%3A123@cluster.redis:6379");
        });

        it("falls back to default localhost:6379", () => {
            const url = buildRedisUrl({});
            expect(url).toBe("redis://localhost:6379");
        });

        it("falls back to environment variables", () => {
            process.env.REDIS_HOST = "env.redis.host";
            process.env.REDIS_PORT = "6381";
            process.env.REDIS_PASSWORD = "envPassword";
            process.env.REDIS_DB = "5";

            const url = buildRedisUrl();
            expect(url).toBe("redis://:envPassword@env.redis.host:6381/5");
        });

        it("uses REDIS_URL from env when valid connection string", () => {
            process.env.REDIS_URL = "redis://env-direct:6379/1";
            const url = buildRedisUrl();
            expect(url).toBe("redis://env-direct:6379/1");
        });
    });

    describe("Serializer", () => {
        it("serializes and deserializes objects properly", () => {
            const data = { id: 1, name: "SnapSec", active: true };
            const serialized = serialize(data);
            expect(typeof serialized).toBe("string");
            expect(deserialize(serialized)).toEqual(data);
        });

        it("serializes and deserializes arrays", () => {
            const list = ["apple", 123, { nested: true }];
            const serialized = serialize(list);
            expect(deserialize(serialized)).toEqual(list);
        });

        it("handles primitives and null/undefined values", () => {
            expect(serialize(null)).toBeNull();
            expect(serialize(undefined)).toBeUndefined();
            expect(serialize(42)).toBe("42");
            expect(serialize("hello")).toBe("hello");

            expect(deserialize(null)).toBeNull();
            expect(deserialize(undefined)).toBeNull();
            expect(deserialize("42")).toBe(42);
            expect(deserialize("raw-string")).toBe("raw-string");
        });
    });

    describe("Factory and Classes", () => {
        it("creates MemoryCache when storage: memory", () => {
            const mem = createCache({ storage: "memory" });
            expect(mem).toBeInstanceOf(MemoryCache);
            expect(mem).toBeInstanceOf(BaseCache);
            expect(mem.storage).toBe("memory");
        });

        it("creates RedisCache by default with autoConnect: false", () => {
            const r = createCache({ storage: "redis", autoConnect: false });
            expect(r).toBeInstanceOf(RedisCache);
            expect(r).toBeInstanceOf(BaseCache);
            expect(r.storage).toBe("redis");
        });

        it("Cache.create creates an instance", () => {
            const inst = Cache.create({ storage: "memory" });
            expect(inst).toBeInstanceOf(MemoryCache);
        });

        it("Cache.getInstance returns singleton", () => {
            Cache.resetInstance();
            const inst1 = Cache.getInstance({ storage: "memory" });
            const inst2 = Cache.getInstance();
            expect(inst1).toBe(inst2);
            Cache.resetInstance();
        });
    });

    describe("MemoryCache Full API Suite", () => {
        let memCache;

        beforeEach(() => {
            memCache = new MemoryCache();
        });

        afterEach(async () => {
            await memCache.close();
        });

        describe("Key-Value Operations", () => {
            it("sets and gets string, number, and object values", async () => {
                await memCache.set("strKey", "active");
                expect(await memCache.get("strKey")).toBe("active");

                await memCache.set("numKey", 100);
                expect(await memCache.get("numKey")).toBe(100);

                const obj = { userId: "user-123", role: "admin" };
                await memCache.set("objKey", obj);
                expect(await memCache.get("objKey")).toEqual(obj);
            });

            it("handles expiration TTL", async () => {
                await memCache.set("tempKey", "temporary", 1);
                expect(await memCache.get("tempKey")).toBe("temporary");
                const ttl = await memCache.ttl("tempKey");
                expect(ttl).toBeGreaterThanOrEqual(0);

                await memCache.expire("tempKey", 100);
                expect(await memCache.ttl("tempKey")).toBeGreaterThan(50);

                // Expired manually by setting negative TTL
                await memCache.expire("tempKey", -1);
                expect(await memCache.get("tempKey")).toBeNull();
                expect(await memCache.exists("tempKey")).toBe(0);
            });

            it("setnx sets only when key does not exist", async () => {
                const res1 = await memCache.setnx("uniqueKey", "first");
                expect(res1).toBe(1);
                expect(await memCache.get("uniqueKey")).toBe("first");

                const res2 = await memCache.setnx("uniqueKey", "second");
                expect(res2).toBe(0);
                expect(await memCache.get("uniqueKey")).toBe("first");
            });

            it("del and exists track key presence", async () => {
                await memCache.set("k1", "v1");
                await memCache.set("k2", "v2");

                expect(await memCache.exists("k1", "k2", "nonexistent")).toBe(2);
                const deleted = await memCache.del("k1", "k2");
                expect(deleted).toBe(2);
                expect(await memCache.exists("k1")).toBe(0);
            });

            it("incr, incrby, decr, decrby manipulate counters", async () => {
                expect(await memCache.incr("counter")).toBe(1);
                expect(await memCache.incrby("counter", 5)).toBe(6);
                expect(await memCache.decr("counter")).toBe(5);
                expect(await memCache.decrby("counter", 3)).toBe(2);
            });

            it("mset and mget handle batch entries", async () => {
                await memCache.mset({
                    batch1: { a: 1 },
                    batch2: { b: 2 },
                });

                const values = await memCache.mget("batch1", "batch2", "missing");
                expect(values).toEqual([{ a: 1 }, { b: 2 }, null]);
            });
        });

        describe("Pub/Sub Pattern", () => {
            it("subscribes to channels, receives messages, and unsubscribes", async () => {
                const received = [];
                const callback = (msg) => {
                    received.push(msg);
                };

                const unsubscribe = await memCache.subscribe("scan:updates", callback);

                await memCache.publish("scan:updates", { progress: 50, status: "running" });
                await memCache.publish("scan:updates", { progress: 100, status: "completed" });

                expect(received).toEqual([
                    { progress: 50, status: "running" },
                    { progress: 100, status: "completed" },
                ]);

                await unsubscribe();
                await memCache.publish("scan:updates", { progress: 0 });
                expect(received.length).toBe(2);
            });
        });

        describe("Queue Pattern (Worker / FIFO)", () => {
            it("enqueues and dequeues once in FIFO order (LPUSH / RPOP)", async () => {
                await memCache.enqueue("job_queue", { id: 1 });
                await memCache.enqueue("job_queue", { id: 2 });

                const item1 = await memCache.dequeueOnce("job_queue");
                const item2 = await memCache.dequeueOnce("job_queue");
                const item3 = await memCache.dequeueOnce("job_queue", 0);

                expect(item1).toEqual({ id: 1 });
                expect(item2).toEqual({ id: 2 });
                expect(item3).toBeNull();
            });

            it("continuous dequeue worker processes tasks and can be stopped", async () => {
                const processed = [];
                const stopWorker = await memCache.dequeue("task_queue", async (task) => {
                    processed.push(task);
                }, 1);

                await memCache.enqueue("task_queue", { task: "A" });
                await memCache.enqueue("task_queue", { task: "B" });

                // Allow worker tick
                await new Promise((r) => setTimeout(r, 50));

                expect(processed).toEqual([{ task: "A" }, { task: "B" }]);

                stopWorker();
                await memCache.enqueue("task_queue", { task: "C" });
                await new Promise((r) => setTimeout(r, 50));
                expect(processed.length).toBe(2);
            });
        });

        describe("Hash Operations", () => {
            it("supports single field hset, hget, and hexists", async () => {
                await memCache.hset("user:100", "name", "John Doe");
                await memCache.hset("user:100", "meta", { verified: true });

                expect(await memCache.hget("user:100", "name")).toBe("John Doe");
                expect(await memCache.hget("user:100", "meta")).toEqual({ verified: true });
                expect(await memCache.hexists("user:100", "name")).toBe(1);
                expect(await memCache.hexists("user:100", "missing")).toBe(0);
            });

            it("supports object dictionary in hset and hgetall", async () => {
                const config = { retries: 3, notifications: { email: true } };
                await memCache.hset("project:config", config);

                const retrieved = await memCache.hgetall("project:config");
                expect(retrieved).toEqual(config);
            });

            it("hdel removes specified fields", async () => {
                await memCache.hset("project:config", { a: 1, b: 2, c: 3 });
                const deleted = await memCache.hdel("project:config", "a", "b");
                expect(deleted).toBe(2);
                expect(await memCache.hexists("project:config", "a")).toBe(0);
                expect(await memCache.hexists("project:config", "c")).toBe(1);
            });
        });

        describe("Utility Operations", () => {
            it("lists keys matching patterns", async () => {
                await memCache.set("project:1", "val");
                await memCache.set("project:2", "val");
                await memCache.set("other:key", "val");

                const projectKeys = await memCache.keys("project:*");
                expect(projectKeys.sort()).toEqual(["project:1", "project:2"]);
            });

            it("ping returns PONG and flush clears cache", async () => {
                expect(await memCache.ping()).toBe("PONG");

                await memCache.set("k1", "v1");
                await memCache.flush();
                expect(await memCache.get("k1")).toBeNull();
            });
        });
    });

    describe("RedisCache with Mocked ioredis", () => {
        let mockClient;
        let mockSubscriber;
        let redisCache;

        beforeEach(() => {
            mockClient = {
                get: vi.fn().mockResolvedValue(JSON.stringify({ test: "data" })),
                set: vi.fn().mockResolvedValue("OK"),
                del: vi.fn().mockResolvedValue(1),
                exists: vi.fn().mockResolvedValue(1),
                expire: vi.fn().mockResolvedValue(1),
                ttl: vi.fn().mockResolvedValue(3600),
                incr: vi.fn().mockResolvedValue(2),
                incrby: vi.fn().mockResolvedValue(10),
                decr: vi.fn().mockResolvedValue(1),
                decrby: vi.fn().mockResolvedValue(5),
                mget: vi.fn().mockResolvedValue([JSON.stringify({ a: 1 }), null]),
                mset: vi.fn().mockResolvedValue("OK"),
                publish: vi.fn().mockResolvedValue(1),
                lpush: vi.fn().mockResolvedValue(1),
                brpop: vi.fn().mockResolvedValue(["queue", JSON.stringify({ item: "pop" })]),
                hset: vi.fn().mockResolvedValue(1),
                hget: vi.fn().mockResolvedValue(JSON.stringify({ field: "val" })),
                hgetall: vi.fn().mockResolvedValue({
                    status: "active",
                    count: "5",
                }),
                hdel: vi.fn().mockResolvedValue(1),
                hexists: vi.fn().mockResolvedValue(1),
                keys: vi.fn().mockResolvedValue(["k1", "k2"]),
                flushdb: vi.fn().mockResolvedValue("OK"),
                ping: vi.fn().mockResolvedValue("PONG"),
                quit: vi.fn().mockResolvedValue("OK"),
                on: vi.fn(),
            };

            mockSubscriber = {
                subscribe: vi.fn().mockResolvedValue("OK"),
                unsubscribe: vi.fn().mockResolvedValue("OK"),
                quit: vi.fn().mockResolvedValue("OK"),
                on: vi.fn(),
            };

            redisCache = new RedisCache({
                redisClient: mockClient,
                subscriberClient: mockSubscriber,
                autoConnect: false,
            });
        });

        it("calls client.get and deserializes result", async () => {
            const result = await redisCache.get("testKey");
            expect(mockClient.get).toHaveBeenCalledWith("testKey");
            expect(result).toEqual({ test: "data" });
        });

        it("calls client.set with TTL when provided", async () => {
            await redisCache.set("session:123", { userId: "abc" }, 3600);
            expect(mockClient.set).toHaveBeenCalledWith(
                "session:123",
                JSON.stringify({ userId: "abc" }),
                "EX",
                3600
            );
        });

        it("calls client.set with NX for setnx", async () => {
            await redisCache.setnx("lock:scan", "token", 60);
            expect(mockClient.set).toHaveBeenCalledWith(
                "lock:scan",
                "token",
                "EX",
                60,
                "NX"
            );
        });

        it("calls del, exists, incr, decr, ttl, expire", async () => {
            await redisCache.del("k1", "k2");
            expect(mockClient.del).toHaveBeenCalledWith("k1", "k2");

            await redisCache.exists("k1");
            expect(mockClient.exists).toHaveBeenCalledWith("k1");

            await redisCache.incr("c");
            expect(mockClient.incr).toHaveBeenCalledWith("c");

            await redisCache.decr("c");
            expect(mockClient.decr).toHaveBeenCalledWith("c");

            await redisCache.expire("k", 10);
            expect(mockClient.expire).toHaveBeenCalledWith("k", 10);

            await redisCache.ttl("k");
            expect(mockClient.ttl).toHaveBeenCalledWith("k");
        });

        it("calls mget and mset with serialized values", async () => {
            const res = await redisCache.mget("a", "b");
            expect(mockClient.mget).toHaveBeenCalledWith("a", "b");
            expect(res).toEqual([{ a: 1 }, null]);

            await redisCache.mset({ k1: { val: 1 }, k2: "str" });
            expect(mockClient.mset).toHaveBeenCalledWith("k1", JSON.stringify({ val: 1 }), "k2", "str");
        });

        it("publishes message to subscriber channel", async () => {
            await redisCache.publish("events", { event: "created" });
            expect(mockClient.publish).toHaveBeenCalledWith("events", JSON.stringify({ event: "created" }));
        });

        it("subscribes using subscriber client and returns unsubscribe function", async () => {
            const cb = vi.fn();
            const unsub = await redisCache.subscribe("events", cb);
            expect(mockSubscriber.subscribe).toHaveBeenCalledWith("events");

            await unsub();
            expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("events");
        });

        it("enqueues via lpush and dequeues once via brpop", async () => {
            await redisCache.enqueue("tasks", { id: "task-1" });
            expect(mockClient.lpush).toHaveBeenCalledWith("tasks", JSON.stringify({ id: "task-1" }));

            const item = await redisCache.dequeueOnce("tasks", 5);
            expect(mockClient.brpop).toHaveBeenCalledWith("tasks", 5);
            expect(item).toEqual({ item: "pop" });
        });

        it("supports hash operations: hset, hget, hgetall, hdel, hexists", async () => {
            await redisCache.hset("config", { retries: 3 });
            expect(mockClient.hset).toHaveBeenCalledWith("config", { retries: "3" });

            const item = await redisCache.hget("config", "retries");
            expect(mockClient.hget).toHaveBeenCalledWith("config", "retries");
            expect(item).toEqual({ field: "val" });

            const all = await redisCache.hgetall("config");
            expect(mockClient.hgetall).toHaveBeenCalledWith("config");
            expect(all).toEqual({ status: "active", count: 5 });

            await redisCache.hdel("config", "retries");
            expect(mockClient.hdel).toHaveBeenCalledWith("config", "retries");

            await redisCache.hexists("config", "retries");
            expect(mockClient.hexists).toHaveBeenCalledWith("config", "retries");
        });

        it("disconnects and cleans up both clients", async () => {
            await redisCache.disconnect();
            expect(mockClient.quit).toHaveBeenCalled();
            expect(mockSubscriber.quit).toHaveBeenCalled();
        });
    });
});
