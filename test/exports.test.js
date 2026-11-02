import { describe, it, expect } from "vitest";
import {
    createAuth,
    authorization,
    Roles,
    Permissions,
    createMqBroker,
    Integration,
    Provider,
    GithubProvider,
    GitlabProvider,
    createCache,
    cache,
    Cache,
    RedisCache,
    MemoryCache,
    BaseCache,
    redisService,
} from "../src/index.js";
import coreCjs from "../src/index.cjs";

describe("Snapsec Core Unified Package Root Exports", () => {
    describe("ESM Root Exports", () => {
        it("exports createAuth factory", () => {
            expect(typeof createAuth).toBe("function");
        });

        it("exports authorization engine and constants", () => {
            expect(authorization).toBeDefined();
            expect(typeof authorization.can).toBe("function");
            expect(typeof authorization.require).toBe("function");
            expect(Roles).toBeDefined();
            expect(Roles.ADMIN).toBe("Admin");
            expect(Permissions).toBeDefined();
        });

        it("exports createMqBroker factory", () => {
            expect(typeof createMqBroker).toBe("function");
        });

        it("exports Integration, Provider, and code repository providers", () => {
            expect(Integration).toBeDefined();
            expect(typeof Integration).toBe("function");
            expect(Provider).toBeDefined();
            expect(typeof Provider).toBe("function");
            expect(GithubProvider).toBeDefined();
            expect(typeof GithubProvider).toBe("function");
            expect(GitlabProvider).toBeDefined();
            expect(typeof GitlabProvider).toBe("function");
        });

        it("exports Cache factory, classes, and singletons", () => {
            expect(typeof createCache).toBe("function");
            expect(Cache).toBeDefined();
            expect(typeof Cache.create).toBe("function");
            expect(typeof Cache.getInstance).toBe("function");
            expect(RedisCache).toBeDefined();
            expect(MemoryCache).toBeDefined();
            expect(BaseCache).toBeDefined();
            expect(cache).toBeDefined();
            expect(redisService).toBeDefined();
        });
    });

    describe("CommonJS Root Exports", () => {
        it("exports createAuth factory", () => {
            expect(typeof coreCjs.createAuth).toBe("function");
        });

        it("exports authorization engine and constants", () => {
            expect(coreCjs.authorization).toBeDefined();
            expect(typeof coreCjs.authorization.can).toBe("function");
            expect(typeof coreCjs.authorization.require).toBe("function");
            expect(coreCjs.Roles).toBeDefined();
            expect(coreCjs.Roles.ADMIN).toBe("Admin");
            expect(coreCjs.Permissions).toBeDefined();
        });

        it("exports createMqBroker factory", () => {
            expect(typeof coreCjs.createMqBroker).toBe("function");
        });

        it("exports Cache factory, classes, and singletons", () => {
            expect(typeof coreCjs.createCache).toBe("function");
            expect(coreCjs.Cache).toBeDefined();
            expect(typeof coreCjs.Cache.create).toBe("function");
            expect(typeof coreCjs.Cache.getInstance).toBe("function");
            expect(coreCjs.RedisCache).toBeDefined();
            expect(coreCjs.MemoryCache).toBeDefined();
            expect(coreCjs.BaseCache).toBeDefined();
            expect(coreCjs.cache).toBeDefined();
            expect(coreCjs.redisService).toBeDefined();
        });
    });
});
