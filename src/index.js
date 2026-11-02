/**
 * SnapSec Core (Unified Package)
 * ESM Entrypoint
 */
export * from "./authentication/index.js";
export * from "./authorization/index.js";
export * from "./rabbitmq/index.js";
export * from "./integration/index.js";
export * from "./cache/index.js";

import createAuth from "./authentication/index.js";
import authorization from "./authorization/index.js";
import mqbroker from "./rabbitmq/index.js";
import { Integration, Provider, BaseProvider, capability, GithubProvider, GitlabProvider, GithubParser, GitlabParser } from "./integration/index.js";
import cache, { createCache, Cache, RedisCache, MemoryCache, BaseCache, redisService } from "./cache/index.js";

function snapsecCore(...args) {
    return createAuth(...args);
}

Object.assign(snapsecCore, {
    createAuth,
    authorization,
    mqbroker,
    Integration,
    Provider,
    GithubProvider,
    GitlabProvider,
    GithubParser,
    GitlabParser,
    BaseProvider,
    capability,
    cache,
    createCache,
    Cache,
    RedisCache,
    MemoryCache,
    BaseCache,
    redisService,
});

export {
    createAuth,
    authorization,
    mqbroker,
    Integration,
    Provider,
    GithubProvider,
    GitlabProvider,
    GithubParser,
    GitlabParser,
    BaseProvider,
    capability,
    cache,
    createCache,
    Cache,
    RedisCache,
    MemoryCache,
    BaseCache,
    redisService,
};
export default snapsecCore;
