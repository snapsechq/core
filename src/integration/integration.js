import crypto from "crypto";
import { MongoClient, ObjectId } from "mongodb";
import { Provider } from "./providers/provider.js";
import { supportedIntegrations, getSupportedIntegrations, getCategories, getIntegrationDefinition } from "./definitions/index.js";

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

export function decrypt(text, keyString = Integration._defaultInstance?.encryptionKey) {
    if (!text || typeof text !== "string") return text;

    const parts = text.split(":");
    if (parts.length !== 2) return text;
    const [ivHex, encryptedText] = parts;
    if (!ivHex || !encryptedText || ivHex.length !== 32) return text;

    const keyToUse = keyString || Integration._defaultInstance?.encryptionKey;
    if (!keyToUse) {
        throw new Error("[Integration] Encryption key is required for decryption.");
    }

    try {
        const iv = Buffer.from(ivHex, "hex");
        const key = crypto.createHash("sha256").update(keyToUse).digest();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch {
        return text;
    }
}

export function decryptConfig(config, keyString = Integration._defaultInstance?.encryptionKey) {
    if (!config) return config;
    const keyToUse = keyString || Integration._defaultInstance?.encryptionKey;
    if (!keyToUse) {
        throw new Error("[Integration] Encryption key is required for decryption.");
    }

    const configObj = config.toObject ? config.toObject() : config;
    if (typeof configObj !== "object") return configObj;

    const decryptedConfig = Array.isArray(configObj) ? [] : {};
    for (const [key, value] of Object.entries(configObj)) {
        if (value !== undefined && value !== null) {
            if (typeof value === "object") {
                decryptedConfig[key] = decryptConfig(value, keyToUse);
            } else if (typeof value === "string") {
                decryptedConfig[key] = decrypt(value, keyToUse);
            } else {
                decryptedConfig[key] = value;
            }
        }
    }
    return decryptedConfig;
}

export class Integration {

    constructor({
        client,
        db,
        uri,
        MONGODB_URI,
        MONGODB_HOST,
        MONGODB_PORT,
        MONGODB_USER,
        MONGODB_PASS,
        INTEGRATIONS_DB,
        dbName,
        AUTH_SOURCE,
        authSource,
        REPLICA_SET,
        replicaSet,
        mongoOptions = {},
        retryConfig = {},
        ENCRYPTION_KEY,
        encryptionKey
    } = {}) {
        const targetDb = dbName || INTEGRATIONS_DB || "integrations";
        this.dbName = targetDb;

        this.client = null;
        this.db = null;
        this.connection = null; // Alias to client for backward compatibility
        this.connectingPromise = null;
        this.encryptionKey = encryptionKey || ENCRYPTION_KEY || null;

        // 1. Direct Mongo client provided (e.g. from mongoose.connection.client)
        if (client) {
            this.client = client;
            this.db = db || (typeof client.db === "function" ? client.db(targetDb) : null);
            this.connection = client;
            this.uri = null;
        } else if (db) {
            this.db = db;
            this.client = db.client || null;
            this.connection = this.client;
            this.uri = null;
        } else {
            // 2. Explicit connection URI or parameters
            const rawUri = uri || MONGODB_URI;
            const host = MONGODB_HOST;
            const port = MONGODB_PORT;
            const user = MONGODB_USER;
            const pass = MONGODB_PASS;
            const authSrc = authSource || AUTH_SOURCE || "admin";
            const replSet = replicaSet || REPLICA_SET;

            if (rawUri) {
                let parsedUri = rawUri;
                if (targetDb) {
                    parsedUri = parsedUri.replace(/\/[^/?]+(\?|$)/, `/${targetDb}$1`);
                }
                this.uri = parsedUri;
            } else if (host && port) {
                const authPart = user && pass
                    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
                    : "";
                const queryParams = [];
                if (user && authSrc) {
                    queryParams.push(`authSource=${authSrc}`);
                }
                if (replSet) {
                    queryParams.push(`replicaSet=${replSet}`);
                }
                const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
                this.uri = `mongodb://${authPart}${host}:${port}/${targetDb}${queryString}`;
            } else if (user && pass) {
                const authPart = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
                this.uri = `mongodb://${authPart}127.0.0.1:27017/${targetDb}`;
            } else {
                this.uri = null;
            }
        }

        this.mongoOptions = {
            ...DEFAULT_OPTIONS,
            ...mongoOptions
        };

        this.retryConfig = {
            ...DEFAULT_RETRY_CONFIG,
            ...retryConfig
        };

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

        if (!this.uri) {
            throw new Error(
                "[Integration] Cannot connect: database configuration is missing."
            );
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
        if (!this.db && this.client && typeof this.client.db === "function") {
            this.db = this.client.db(this.databaseName || "integrations");
        }
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

    async getIntegrationById(params) {
        return await this.getIntegration(params);
    }

    async getProvider(integrationId) {
        const provider = await Provider.getProvider(integrationId, { integration: this });

        return provider;
    }

    /**
     * Fetch all active AI integrations for an organization.
     *
     * @param {Object} params
     * @param {string} params.orgId
     * @param {boolean} [params.decrypt=true]
     * @returns {Promise<Array<Object>>}
     */
    async getAiIntegrations({ orgId, decrypt: shouldDecrypt = true } = {}) {
        if (!orgId) return [];
        if (!this.isConnected() && !this.db) {
            await this.connect();
        }

        const AI_TYPES = ["openai", "claude", "anthropic", "gemini", "google", "deepseek", "snapiq", "openrouter"];
        const orgQuery = typeof orgId === "string" && ObjectId.isValid(orgId)
            ? { $or: [{ orgId: String(orgId) }, { orgId: new ObjectId(orgId) }] }
            : { orgId: String(orgId) };

        try {
            const collection = this.getCollection("integrations");
            const list = await collection.find({
                ...orgQuery,
                $or: [
                    { category: { $in: ["AI", "ai", "ai-provider"] } },
                    { integrationId: { $in: [...AI_TYPES, "ai"] } }
                ],
                status: { $nin: ["failed", "refresh_error", "disabled", "inactive"] }
            }).sort({ createdAt: -1 }).toArray();

            return list.map(item => {
                if (shouldDecrypt && item.config) {
                    item.config = decryptConfig(item.config, this.encryptionKey);
                }
                return item;
            });
        } catch (err) {
            console.warn(`[Integration] Error querying getAiIntegrations:`, err.message);
            return [];
        }
    }

    /**
     * Fetch decrypted credentials and configuration for an AI model provider.
     *
     * @param {Object} params
     * @param {string} params.orgId
     * @param {string} [params.provider] - Optional specific provider ("openai", "claude", "deepseek", etc.)
     * @param {boolean} [params.decrypt=true]
     * @returns {Promise<Object|null>}
     */
    async getAiModelConfig({ orgId, provider, decrypt: shouldDecrypt = true } = {}) {
        if (!orgId) return null;
        const integrations = await this.getAiIntegrations({ orgId, decrypt: shouldDecrypt });
        if (!integrations || integrations.length === 0) return null;

        let matched = null;
        if (provider) {
            const target = String(provider).toLowerCase().trim();
            matched = integrations.find(i => (i.integrationId || "").toLowerCase() === target);
        }
        if (!matched) {
            matched = integrations[0]; // fallback to first available active AI integration
        }
        if (!matched) return null;

        const idKey = (matched.integrationId || "").toLowerCase();
        const conf = matched.config?.[idKey] || matched.config || {};
        return {
            _id: matched._id,
            integrationId: matched.integrationId,
            type: matched.integrationId,
            name: matched.name,
            apiKey: conf.apiKey || conf.masterKey || conf.token,
            masterKey: conf.masterKey || conf.apiKey,
            endpoint: conf.endpoint || conf.baseUrl,
            model: conf.model,
            models: conf.models || [],
            config: conf
        };
    }

    /**
     * Initialize or reconfigure the shared singleton Integration instance.
     * Host services call this once at startup (e.g. in database/connection.js or connect-db.js).
     *
     * @param {Object} config
     * @param {MongoClient|Object} [config.client] - Existing active MongoDB client (e.g. mongoose.connection.client)
     * @param {Db} [config.db] - Target database instance
     * @param {string} [config.uri] - MongoDB connection string
     * @param {string} [config.dbName="integrations"] - Database name
     * @param {string} [config.encryptionKey] - Secret key for decryption
     * @returns {Integration}
     */
    static init(config = {}) {
        const inst = new Integration(config);
        Integration._defaultInstance = inst;
        return inst;
    }

    static configure(config = {}) {
        return Integration.init(config);
    }

    static setClient(client, dbName = "integrations", encryptionKey) {
        return Integration.init({ client, dbName, encryptionKey });
    }

    static getDefaultInstance() {
        return Integration._defaultInstance || null;
    }

    static reset() {
        Integration._defaultInstance = null;
    }

    /**
     * Check if AI capabilities are configured and healthy for an organization.
     * Evaluates installed integrations and verifies if any has category "AI".
     *
     * @param {Object} params
     * @param {string} params.orgId - Organization ID
     * @returns {Promise<boolean>}
     */
    async isAiConnected({ orgId } = {}) {
        if (!orgId) {
            return false;
        }

        const orgQuery = typeof orgId === "string" && ObjectId.isValid(orgId)
            ? { $or: [{ orgId: String(orgId) }, { orgId: new ObjectId(orgId) }] }
            : { orgId: String(orgId) };

        try {
            if (!this.isConnected()) {
                await this.connect();
            }
        } catch (connErr) {
            console.warn(`[Integration] Could not connect to MongoDB in isAiConnected:`, connErr.message);
            return false;
        }

        const staticList = Array.isArray(supportedIntegrations.integrations)
            ? supportedIntegrations.integrations
            : [];

        try {
            // Primary check: get integrations for the organization
            const integrationsCol = this.getCollection("integrations");
            const integrations = await integrationsCol.find({
                ...orgQuery,
                status: { $nin: ["failed", "refresh_error", "disabled", "inactive"] }
            }).toArray();

            for (const item of integrations) {
                const status = String(item.status || "").toLowerCase().trim();
                if (["failed", "refresh_error", "disabled", "inactive"].includes(status)) {
                    continue;
                }

                const instanceId = String(item.integrationId || item.type || "").toLowerCase().trim();
                const staticConfig = staticList.find(a => (a.id || "").toLowerCase() === instanceId);

                // Populate category field using supported integrations definitions or document category
                let categories = [];
                if (Array.isArray(item.category) && item.category.length > 0) {
                    categories = item.category;
                } else if (staticConfig && Array.isArray(staticConfig.category)) {
                    categories = staticConfig.category;
                }

                // If category includes "AI" return true
                if (categories.some(cat => String(cat).toUpperCase() === "AI")) {
                    return true;
                }
            }
        } catch (err) {
            console.warn(`[Integration] Error querying integrations:`, err.message);
        }

        return false;
    }

    /**
     * Update status and error message of an integration record in the database.
     *
     * @param {Object} params
     * @param {string|ObjectId} [params.id] - Document _id
     * @param {string} [params.orgId] - Organization ID
     * @param {string} [params.integrationId] - Integration provider slug (e.g. "deepseek", "openai")
     * @param {string} params.status - New status (e.g. "installed", "failed")
     * @param {string} [params.errMessage=""] - Reason or error message
     * @returns {Promise<any>}
     */
    async updateIntegrationStatus({ id, orgId, integrationId, status, errMessage = "" } = {}) {
        if (!this.isConnected() && !this.db) {
            await this.connect();
        }
        const collection = this.getCollection("integrations");
        const filter = {};
        if (id) {
            filter._id = typeof id === "string" && ObjectId.isValid(id) ? new ObjectId(id) : id;
        }
        if (orgId) {
            const orgQuery = typeof orgId === "string" && ObjectId.isValid(orgId)
                ? { $or: [{ orgId: String(orgId) }, { orgId: new ObjectId(orgId) }] }
                : { orgId: String(orgId) };
            Object.assign(filter, orgQuery);
        }
        if (integrationId) {
            filter.$or = [{ integrationId }, { type: integrationId }];
        }
        return await collection.updateOne(filter, {
            $set: {
                status,
                errMessage,
                updatedAt: new Date()
            }
        });
    }

    /**
     * Live verify AI credentials for an organization and active provider.
     * Fetches and decrypts credentials, invokes Provider.verifyIntegrationConfig,
     * and on failure updates the integration status in MongoDB to 'failed' and throws.
     *
     * @param {Object} params
     * @param {string} params.orgId
     * @param {string} [params.provider]
     * @returns {Promise<boolean>}
     */
    async verifyAiCredentials({ orgId, provider } = {}) {
        if (!orgId) return false;
        if (!this.isConnected() && !this.db) {
            await this.connect();
        }

        const config = await this.getAiModelConfig({ orgId, provider, decrypt: true });
        if (!config) {
            throw new Error("[Integration] No AI provider configuration found for organization.");
        }

        let providerId = (config.integrationId || provider || "").toLowerCase().trim();
        if (providerId.includes("/")) {
            providerId = providerId.split("/")[0].toLowerCase().trim();
        }

        const PROVIDER_ALIASES = {
            anthropic: "claude",
            google: "gemini",
            litellm: "snapiq"
        };
        const resolvedProviderId = PROVIDER_ALIASES[providerId] || providerId;

        if (!Provider.isProviderAvailable(resolvedProviderId)) {
            return true;
        }

        try {
            await Provider.verifyIntegrationConfig(resolvedProviderId, config);
            return true;
        } catch (error) {
            try {
                await this.updateIntegrationStatus({
                    orgId,
                    integrationId: providerId,
                    status: "failed",
                    errMessage: `API key invalid or revoked: ${error.message}`
                });
            } catch (dbErr) {
                console.warn(`[Integration] Could not update failed status in database:`, dbErr.message);
            }

            throw new Error(`AI provider '${resolvedProviderId}' credentials are invalid or revoked: ${error.message}`);
        }
    }

    /**
     * Static helper for isAiConnected.
     * Can be invoked directly as `Integration.isAiConnected({ orgId })`.
     * Uses the default/active Integration instance or provided client/instance.
     */
    static async isAiConnected({ orgId, client = null } = {}) {
        const inst = client instanceof Integration
            ? client
            : (client ? new Integration({ client }) : Integration._defaultInstance);
        if (!inst) {
            throw new Error(
                "[Integration] Integration is not initialized."
            );
        }
        return await inst.isAiConnected({ orgId });
    }

    /**
     * Static helper for verifyAiCredentials.
     */
    static async verifyAiCredentials({ orgId, provider, client = null } = {}) {
        const inst = client instanceof Integration
            ? client
            : (client ? new Integration({ client }) : Integration._defaultInstance);
        if (!inst) {
            throw new Error("[Integration] Integration is not initialized.");
        }
        return await inst.verifyAiCredentials({ orgId, provider });
    }

    /**
     * Static helper for updateIntegrationStatus.
     */
    static async updateIntegrationStatus(params = {}) {
        const client = params.client;
        const inst = client instanceof Integration
            ? client
            : (client ? new Integration({ client }) : Integration._defaultInstance);
        if (!inst) {
            throw new Error("[Integration] Integration is not initialized.");
        }
        return await inst.updateIntegrationStatus(params);
    }

    /**
     * Static helper for getAiModelConfig.
     */
    static async getAiModelConfig({ orgId, provider, client = null, decrypt = true } = {}) {
        const inst = client instanceof Integration
            ? client
            : (client ? new Integration({ client }) : Integration._defaultInstance);
        if (!inst) {
            throw new Error(
                "[Integration] Integration is not initialized."
            );
        }
        return await inst.getAiModelConfig({ orgId, provider, decrypt });
    }

    /**
     * Static helper for getAiIntegrations.
     */
    static async getAiIntegrations({ orgId, client = null, decrypt = true } = {}) {
        const inst = client instanceof Integration
            ? client
            : (client ? new Integration({ client }) : Integration._defaultInstance);
        if (!inst) {
            throw new Error(
                "[Integration] Integration is not initialized."
            );
        }
        return await inst.getAiIntegrations({ orgId, decrypt });
    }
}

Integration.getSupportedIntegrations = getSupportedIntegrations;
Integration.getCategories = getCategories;
Integration.getIntegrationDefinition = getIntegrationDefinition;
