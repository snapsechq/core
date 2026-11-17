import crypto from "crypto";
import { MongoClient, ObjectId } from "mongodb";
import { Provider } from "./providers/provider.js";

const DEFAULT_OPTIONS = {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
};

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    initialRetryDelayMs: 1000,
    maxRetryDelayMs: 10000
};


const ALGORITHM = "aes-256-cbc";
const DEFAULT_ENCRYPTION_KEY = "your-secret-key-at-least-32-chars-long";

export function decrypt(text, keyString = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY) {
    if (!text || typeof text !== "string") return text;

    try {
        const parts = text.split(":");
        if (parts.length !== 2) return text;
        const [ivHex, encryptedText] = parts;
        if (!ivHex || !encryptedText || ivHex.length !== 32) return text;

        const iv = Buffer.from(ivHex, "hex");
        const key = crypto.createHash("sha256").update(keyString).digest();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch {
        return text;
    }
}

export function decryptConfig(config, keyString = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY) {
    if (!config) return config;
    const configObj = config.toObject ? config.toObject() : config;
    if (typeof configObj !== "object") return configObj;

    const decryptedConfig = Array.isArray(configObj) ? [] : {};
    for (const [key, value] of Object.entries(configObj)) {
        if (value !== undefined && value !== null) {
            if (typeof value === "object") {
                decryptedConfig[key] = decryptConfig(value, keyString);
            } else if (typeof value === "string") {
                decryptedConfig[key] = decrypt(value, keyString);
            } else {
                decryptedConfig[key] = value;
            }
        }
    }
    return decryptedConfig;
}

export class Integration {

    constructor({
        MONGODB_URI,
        MONGODB_HOST,
        MONGODB_PORT,
        MONGODB_USER,
        MONGODB_PASS,
        INTEGRATIONS_DB = "integrations",
        AUTH_SOURCE = "admin",
        REPLICA_SET,
        mongoOptions = {},
        retryConfig = {},
        ENCRYPTION_KEY
    } = {}) {
        this.dbName = INTEGRATIONS_DB;

        if (MONGODB_URI) {
            this.uri = MONGODB_URI;
        } else if (MONGODB_HOST && MONGODB_PORT) {
            const authPart = MONGODB_USER && MONGODB_PASS
                ? `${encodeURIComponent(MONGODB_USER)}:${encodeURIComponent(MONGODB_PASS)}@`
                : "";

            const queryParams = [];
            if (MONGODB_USER && AUTH_SOURCE) {
                queryParams.push(`authSource=${AUTH_SOURCE}`);
            }
            if (REPLICA_SET) {
                queryParams.push(`replicaSet=${REPLICA_SET}`);
            }

            const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
            this.uri = `mongodb://${authPart}${MONGODB_HOST}:${MONGODB_PORT}/${INTEGRATIONS_DB}${queryString}`;
        } else {
            this.uri = `mongodb://127.0.0.1:27017/${INTEGRATIONS_DB}`;
        }

        this.mongoOptions = {
            ...DEFAULT_OPTIONS,
            ...mongoOptions
        };

        this.retryConfig = {
            ...DEFAULT_RETRY_CONFIG,
            ...retryConfig
        };

        this.client = null;
        this.db = null;
        this.connection = null; // Alias to client for backward compatibility
        this.connectingPromise = null;
        this.encryptionKey = ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;

        if (!Integration._defaultInstance) {
            Integration._defaultInstance = this;
        }
    }

    _setupClientListeners(client) {
        client.on("open", () => {
            console.log("[Integration][MongoDB] Connection opened successfully.");
        });

        client.on("close", () => {
            console.log("[Integration][MongoDB] Connection closed.");
        });

        client.on("error", (err) => {
            console.error("[Integration][MongoDB] Connection error:", err.message);
        });

        client.on("serverOpening", (event) => {
            console.log(`[Integration][MongoDB] Server opening: ${event.address}`);
        });

        client.on("serverClosed", (event) => {
            console.warn(`[Integration][MongoDB] Server closed: ${event.address}`);
        });

        client.on("topologyClosed", () => {
            console.warn("[Integration][MongoDB] Topology closed.");
        });
    }

    async connect() {
        if (this.client && this.isConnected()) {
            return this.client;
        }

        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        const { maxRetries, initialRetryDelayMs, maxRetryDelayMs } = this.retryConfig;
        let delay = initialRetryDelayMs;

        this.connectingPromise = (async () => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[Integration][MongoDB] Connecting to database (Attempt ${attempt}/${maxRetries})...`);

                    const client = new MongoClient(this.uri, this.mongoOptions);
                    this._setupClientListeners(client);

                    await client.connect();

                    this.client = client;
                    this.connection = client;
                    this.db = client.db(this.dbName);

                    console.log("[Integration][MongoDB] Connected successfully!");
                    return this.client;
                } catch (error) {
                    console.error(`[Integration][MongoDB] Connection attempt ${attempt} failed: ${error.message}`);

                    if (attempt >= maxRetries) {
                        const failureMsg = `[Integration][MongoDB] Could not establish connection after ${maxRetries} attempts: ${error.message}`;
                        console.error(failureMsg);
                        throw new Error(failureMsg);
                    }

                    const jitter = Math.random() * 200;
                    const nextDelay = Math.min(delay * 2, maxRetryDelayMs) + jitter;
                    console.log(`[Integration][MongoDB] Retrying in ${Math.round(nextDelay / 1000)}s...`);
                    await new Promise(resolve => setTimeout(resolve, nextDelay));
                    delay = nextDelay;
                }
            }
        })();

        try {
            return await this.connectingPromise;
        } finally {
            this.connectingPromise = null;
        }
    }

    async disconnect(force = false) {
        if (this.connectingPromise) {
            try {
                await this.connectingPromise;
            } catch {
                // Ignore in-flight failure during teardown
            }
        }

        if (this.client) {
            try {
                await this.client.close(force);
            } catch (err) {
                console.error("[Integration][MongoDB] Error during disconnect:", err.message);
                throw err;
            } finally {
                this.client = null;
                this.connection = null;
                this.db = null;
            }
        }
    }

    isConnected() {
        return Boolean(this.client && this.client.topology && !this.client.topology.isDestroyed());
    }

    getClient() {
        if (!this.isConnected()) {
            throw new Error("[Integration][MongoDB] Client is not connected. Call connect() first.");
        }
        return this.client;
    }

    // Alias for getClient
    getConnection() {
        return this.getClient();
    }

    getDb() {
        if (!this.db) {
            throw new Error("[Integration][MongoDB] Database is not initialized. Call connect() first.");
        }
        return this.db;
    }

    getCollection(collectionName = "integrations") {
        return this.getDb().collection(collectionName);
    }

    async getIntegration({ id, decrypt: shouldDecrypt = true }) {
        try {
            const collection = this.getCollection("integrations");
            const query = typeof id === "string" && ObjectId.isValid(id)
                ? { _id: new ObjectId(id) }
                : { _id: id };

            const integration = await collection.findOne(query);
            if (integration && shouldDecrypt && integration.config) {
                integration.config = decryptConfig(integration.config, this.encryptionKey);
            }
            return integration;
        } catch (error) {
            console.error(`[Integration][MongoDB] Error getting integration by id: ${error.message}`);
            throw error;
        }
    }

    async getProvider(integrationId) {
        const provider = await Provider.getProvider(integrationId, { integration: this });

        return provider;
    }

    /**
     * Internal helper to check environment variables for AI keys
     */
    static _hasEnvAiKeys() {
        const envKeys = [
            process.env.OPENAI_API_KEY,
            process.env.ANTHROPIC_API_KEY,
            process.env.GEMINI_API_KEY,
            process.env.DEEPSEEK_API_KEY,
            process.env.SNAPIQ_API_KEY
        ].filter(Boolean);
        return envKeys.length > 0;
    }

    /**
     * Check if AI capabilities are configured and healthy for an organization.
     * Checks automations database (adapterconfigs) and integrations database (integrations),
     * with optional environment fallback.
     *
     * @param {Object} params
     * @param {string} params.orgId - Organization ID
     * @param {boolean} [params.checkHealth=false] - Whether to perform a live health check ping
     * @param {string} [params.automationsDb] - Database name for automations (defaults to process.env.AUTOMATIONS_DB or "automations")
     * @returns {Promise<boolean>}
     */
    async isAiConnected({ orgId, checkHealth = false, automationsDb = process.env.AUTOMATIONS_DB || "automations" } = {}) {
        if (!orgId) {
            return false;
        }

        const AI_TYPES = ["openai", "claude", "anthropic", "gemini", "google", "deepseek", "snapiq", "openrouter"];

        const orgQuery = typeof orgId === "string" && ObjectId.isValid(orgId)
            ? { $or: [{ orgId: String(orgId) }, { orgId: new ObjectId(orgId) }] }
            : { orgId: String(orgId) };

        try {
            if (!this.isConnected()) {
                await this.connect();
            }
        } catch (connErr) {
            console.warn(`[Integration] Could not connect to MongoDB in isAiConnected:`, connErr.message);
            return Integration._hasEnvAiKeys();
        }

        try {
            // 1. Check automations DB (adapterconfigs collection)
            const autoDb = this.client.db(automationsDb);
            const adapterConfigsCol = autoDb.collection("adapterconfigs");
            const adapters = await adapterConfigsCol.find({
                ...orgQuery,
                $or: [
                    { type: { $in: AI_TYPES } },
                    { category: { $in: ["AI", "ai", "ai-provider"] } },
                    { adapter_type: "ai-provider" }
                ]
            }).toArray();

            for (const adapter of adapters) {
                const status = String(adapter.status || "active").toLowerCase().trim();
                if (["inactive", "disabled", "error", "failed"].includes(status)) {
                    continue;
                }

                let configObj = adapter.config || {};
                if (typeof configObj === "string") {
                    try {
                        configObj = JSON.parse(configObj);
                    } catch {
                        // ignore JSON parse error
                    }
                }

                const atype = String(adapter.type || "").toLowerCase().trim();
                const apiKey = adapter.apiKey || adapter.masterKey || adapter.token ||
                    configObj.apiKey || configObj.masterKey || configObj.token;

                if (atype === "snapiq") {
                    const masterKey = adapter.masterKey || adapter.apiKey || configObj.masterKey || configObj.apiKey;
                    const endpoint = adapter.endpoint || adapter.baseUrl || configObj.endpoint || configObj.baseUrl;
                    if (masterKey && String(masterKey).trim() && endpoint && String(endpoint).trim()) {
                        return true;
                    }
                } else if (apiKey && String(apiKey).trim().length > 0) {
                    return true;
                }
            }
        } catch (err) {
            console.warn(`[Integration] Error querying automations.adapterconfigs:`, err.message);
        }

        try {
            // 2. Check integrations DB (integrations collection)
            const integrationsCol = this.getCollection("integrations");
            const integrations = await integrationsCol.find({
                ...orgQuery,
                $or: [
                    { integrationId: { $in: [...AI_TYPES, "ai"] } },
                    { category: { $in: ["AI", "ai"] } }
                ]
            }).toArray();

            for (const item of integrations) {
                const status = String(item.status || "").toLowerCase().trim();
                if (["failed", "refresh_error", "disabled", "inactive"].includes(status)) {
                    continue;
                }
                if (item.config && typeof item.config === "object" && Object.keys(item.config).length > 0) {
                    return true;
                }
            }
        } catch (err) {
            console.warn(`[Integration] Error querying integrations.integrations:`, err.message);
        }

        // 3. Fallback to process.env keys (useful for standalone / test environments)
        if (Integration._hasEnvAiKeys()) {
            return true;
        }

        return false;
    }

    /**
     * Static helper for isAiConnected.
     * Can be invoked directly as `Integration.isAiConnected({ orgId })`.
     * Uses the default/active Integration instance or creates a transient one.
     */
    static async isAiConnected({ orgId, checkHealth = false, client = null, automationsDb } = {}) {
        const inst = client || Integration._defaultInstance || new Integration();
        return await inst.isAiConnected({ orgId, checkHealth, automationsDb });
    }
}
