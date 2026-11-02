/**
 * Builds a Redis connection URL from discrete parameters or environment variables.
 *
 * @param {Object|string} [config]
 * @param {string} [config.url] - Direct URL override (e.g. redis://:pass@host:6379/0)
 * @param {string} [config.host] - Redis host (or REDIS_HOST / REDIS_URL)
 * @param {string|number} [config.port] - Redis port (or REDIS_PORT)
 * @param {string} [config.password] - Redis password (or REDIS_PASSWORD / REDIS_PASS)
 * @param {string} [config.username] - Redis username (or REDIS_USERNAME / REDIS_USER)
 * @param {string|number} [config.db] - Redis database index (or REDIS_DB)
 * @param {string} [config.protocol] - Protocol ("redis" or "rediss")
 * @returns {string} Fully formed Redis connection URL
 */
export function buildRedisUrl(config = {}) {
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
