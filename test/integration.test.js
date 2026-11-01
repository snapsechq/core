import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { ObjectId } from "mongodb";

import {
    Integration,
    decrypt,
    decryptConfig,
    Provider,
    ProviderRegistry,
    GcpProvider,
    AwsProvider,
    AzureProvider,
    OracleProvider
} from "../src/integration/index.js";

// Helper to encrypt text using the same algorithm and key as integration.js
function encryptHelper(text, keyString = "your-secret-key-at-least-32-chars-long") {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash("sha256").update(keyString).digest();
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
}

describe("@snapsechq/core - Integration Module", () => {
    describe("Module Exports", () => {
        it("exports Integration class as named and default export", async () => {
            const defaultExport = (await import("../src/integration/index.js")).default;
            expect(Integration).toBeDefined();
            expect(typeof Integration).toBe("function");
            expect(defaultExport).toBe(Integration);
        });

        it("exports encryption and decryption utilities", () => {
            expect(typeof decrypt).toBe("function");
            expect(typeof decryptConfig).toBe("function");
        });

        it("exports Provider class and ProviderRegistry", () => {
            expect(Provider).toBeDefined();
            expect(typeof Provider.isProviderAvailable).toBe("function");
            expect(typeof Provider.getProvider).toBe("function");
            expect(typeof Provider.verifyIntegrationConfig).toBe("function");

            expect(ProviderRegistry).toBeDefined();
            expect(ProviderRegistry.aws).toBe(AwsProvider);
            expect(ProviderRegistry.azure).toBe(AzureProvider);
            expect(ProviderRegistry.gcp).toBe(GcpProvider);
            expect(ProviderRegistry.oracle).toBe(OracleProvider);
        });

        it("exports all specific provider classes", () => {
            expect(AwsProvider).toBeDefined();
            expect(AzureProvider).toBeDefined();
            expect(GcpProvider).toBeDefined();
            expect(OracleProvider).toBeDefined();
        });
    });

    describe("Decryption Utilities (decrypt & decryptConfig)", () => {
        const testKey = "test-secret-key-32-characters-ok!";

        it("decrypts AES-256-CBC encrypted string with default key", () => {
            const secret = "super-secret-aws-token";
            const encrypted = encryptHelper(secret);
            const decrypted = decrypt(encrypted);
            expect(decrypted).toBe(secret);
        });

        it("decrypts string with a custom key", () => {
            const secret = "custom-key-secret-12345";
            const encrypted = encryptHelper(secret, testKey);
            const decrypted = decrypt(encrypted, testKey);
            expect(decrypted).toBe(secret);
        });

        it("returns original text if input is not a string", () => {
            expect(decrypt(null)).toBeNull();
            expect(decrypt(undefined)).toBeUndefined();
            expect(decrypt(12345)).toBe(12345);
            expect(decrypt({ foo: "bar" })).toEqual({ foo: "bar" });
        });

        it("returns original text if format does not match iv:ciphertext", () => {
            expect(decrypt("plaintext-string")).toBe("plaintext-string");
            expect(decrypt("too:many:colons:here")).toBe("too:many:colons:here");
            expect(decrypt(":missing-iv")).toBe(":missing-iv");
            expect(decrypt("missing-cipher:")).toBe("missing-cipher:");
            expect(decrypt("shortiv:abc1234")).toBe("shortiv:abc1234");
        });

        it("returns original text on decryption decipher error", () => {
            // Valid 32-char hex IV, but corrupted hex ciphertext
            const invalidCipher = "0123456789abcdef0123456789abcdef:not-valid-hex-ciphertext";
            expect(decrypt(invalidCipher)).toBe(invalidCipher);
        });

        it("decryptConfig recursively decrypts nested configuration objects", () => {
            const config = {
                appName: "test-app",
                aws: {
                    accessKeyId: encryptHelper("AKIA123456789"),
                    secretAccessKey: encryptHelper("SECRET987654321"),
                    region: "us-east-1", // unencrypted string stays unchanged
                    port: 443,
                    enabled: true,
                },
                metadata: {
                    tags: [encryptHelper("tag1"), "tag2"],
                },
            };

            const decrypted = decryptConfig(config);
            expect(decrypted.appName).toBe("test-app");
            expect(decrypted.aws.accessKeyId).toBe("AKIA123456789");
            expect(decrypted.aws.secretAccessKey).toBe("SECRET987654321");
            expect(decrypted.aws.region).toBe("us-east-1");
            expect(decrypted.aws.port).toBe(443);
            expect(decrypted.aws.enabled).toBe(true);
            expect(decrypted.metadata.tags).toEqual(["tag1", "tag2"]);
        });

        it("decryptConfig supports Mongoose toObject conversion", () => {
            const mockDoc = {
                toObject: () => ({
                    apiKey: encryptHelper("api-key-value"),
                    num: 42,
                }),
            };

            const decrypted = decryptConfig(mockDoc);
            expect(decrypted).toEqual({
                apiKey: "api-key-value",
                num: 42,
            });
        });

        it("decryptConfig handles null, undefined, arrays, and primitives gracefully", () => {
            expect(decryptConfig(null)).toBeNull();
            expect(decryptConfig(undefined)).toBeUndefined();
            expect(decryptConfig(123)).toBe(123);
            expect(decryptConfig("string")).toBe("string");

            const arr = [encryptHelper("val1"), encryptHelper("val2")];
            const decryptedArr = decryptConfig(arr);
            expect(decryptedArr).toEqual(["val1", "val2"]);
        });
    });

    describe("Provider Registry & Base Provider", () => {
        it("isProviderAvailable returns true for supported providers (case-insensitive)", () => {
            expect(Provider.isProviderAvailable("aws")).toBe(true);
            expect(Provider.isProviderAvailable("AWS")).toBe(true);
            expect(Provider.isProviderAvailable("gcp")).toBe(true);
            expect(Provider.isProviderAvailable("GCP")).toBe(true);
            expect(Provider.isProviderAvailable("azure")).toBe(true);
            expect(Provider.isProviderAvailable("Azure")).toBe(true);
            expect(Provider.isProviderAvailable("oracle")).toBe(true);
            expect(Provider.isProviderAvailable("ORACLE")).toBe(true);
        });

        it("isProviderAvailable returns false for unsupported or invalid inputs", () => {
            expect(Provider.isProviderAvailable("digitalocean")).toBe(false);
            expect(Provider.isProviderAvailable("")).toBe(false);
            expect(Provider.isProviderAvailable(null)).toBe(false);
            expect(Provider.isProviderAvailable(undefined)).toBe(false);
            expect(Provider.isProviderAvailable(123)).toBe(false);
        });

        it("getProvider returns provider class for valid integrationId", () => {
            expect(Provider.getProvider({ integrationId: "aws" })).toBe(AwsProvider);
            expect(Provider.getProvider({ integrationId: "azure" })).toBe(AzureProvider);
            expect(Provider.getProvider({ integrationId: "gcp" })).toBe(GcpProvider);
            expect(Provider.getProvider({ integrationId: "oracle" })).toBe(OracleProvider);
        });

        it("getProvider throws for unsupported integrationId", () => {
            expect(() => Provider.getProvider({ integrationId: "unknown-cloud" }))
                .toThrow("unknown-cloud is not supported.");
        });

        it("verifyIntegrationConfig delegates with (integrationId, config) positional args", async () => {
            const result = await Provider.verifyIntegrationConfig("aws", {
                accessKeyId: "test-key",
                secretAccessKey: "test-secret",
                region: "us-east-1",
            });
            expect(result).toBe(true);
        });

        it("verifyIntegrationConfig delegates with object params containing config property", async () => {
            const result = await Provider.verifyIntegrationConfig({
                integrationId: "aws",
                config: {
                    accessKeyId: "test-key",
                    secretAccessKey: "test-secret",
                },
            });
            expect(result).toBe(true);
        });

        it("verifyIntegrationConfig delegates with flat object params", async () => {
            const result = await Provider.verifyIntegrationConfig({
                integrationId: "aws",
                accessKeyId: "test-key",
                secretAccessKey: "test-secret",
            });
            expect(result).toBe(true);
        });
    });

    describe("AwsProvider", () => {
        it("validates successfully with accessKeyId, secretAccessKey, and region", async () => {
            const result = await AwsProvider.verifyIntegrationConfig({
                accessKeyId: "AKIAIOSFODNN7EXAMPLE",
                secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                region: "eu-central-1",
            });
            expect(result).toBe(true);
        });

        it("validates successfully when region is omitted (backward compatible)", async () => {
            const result = await AwsProvider.verifyIntegrationConfig({
                accessKeyId: "AKIAIOSFODNN7EXAMPLE",
                secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            });
            expect(result).toBe(true);
        });

        it("accepts nested config under { aws: { ... } }", async () => {
            const result = await AwsProvider.verifyIntegrationConfig({
                aws: {
                    accessKeyId: "AKIA12345",
                    secretAccessKey: "SEC12345",
                    region: "us-west-2",
                },
            });
            expect(result).toBe(true);
        });

        it("accepts alternative field aliases for credentials", async () => {
            const res1 = await AwsProvider.verifyIntegrationConfig({
                access_key: "AKIA12345",
                secret_access_key: "SEC12345",
            });
            expect(res1).toBe(true);

            const res2 = await AwsProvider.verifyIntegrationConfig({
                accessKey: "AKIA12345",
                secretKey: "SEC12345",
            });
            expect(res2).toBe(true);
        });

        it("throws when accessKeyId is missing or blank", async () => {
            await expect(AwsProvider.verifyIntegrationConfig({ secretAccessKey: "valid-secret" }))
                .rejects.toThrow("Access Key ID is required for AWS Adapter");

            await expect(AwsProvider.verifyIntegrationConfig({ accessKeyId: "  ", secretAccessKey: "valid-secret" }))
                .rejects.toThrow("Access Key ID is required for AWS Adapter");

            await expect(AwsProvider.verifyIntegrationConfig({}))
                .rejects.toThrow("Access Key ID is required for AWS Adapter");
        });

        it("throws when secretAccessKey is missing or blank", async () => {
            await expect(AwsProvider.verifyIntegrationConfig({ accessKeyId: "valid-key" }))
                .rejects.toThrow("Secret Access Key is required for AWS Adapter");

            await expect(AwsProvider.verifyIntegrationConfig({ accessKeyId: "valid-key", secretAccessKey: "  " }))
                .rejects.toThrow("Secret Access Key is required for AWS Adapter");
        });
    });

    describe("AzureProvider", () => {
        const validAzure = {
            ApplicationID: "app-id-123",
            KeyValue: "client-secret-xyz",
            DirectoryID: "dir-tenant-456",
            SubscriptionID: "sub-id-789",
        };

        it("validates successfully with all required Azure fields", async () => {
            const result = await AzureProvider.verifyIntegrationConfig(validAzure);
            expect(result).toBe(true);
        });

        it("accepts nested config under { azure: { ... } }", async () => {
            const result = await AzureProvider.verifyIntegrationConfig({ azure: validAzure });
            expect(result).toBe(true);
        });

        it("accepts alternative camelCase and snake_case aliases", async () => {
            const result = await AzureProvider.verifyIntegrationConfig({
                application_id: "app-1",
                key_value: "key-1",
                directory_id: "dir-1",
                subscription_id: "sub-1",
            });
            expect(result).toBe(true);
        });

        it("throws when ApplicationID is missing or blank", async () => {
            const { ApplicationID, ...rest } = validAzure;
            await expect(AzureProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Application ID is required for Azure Adapter");
            await expect(AzureProvider.verifyIntegrationConfig({ ...rest, ApplicationID: "   " }))
                .rejects.toThrow("Application ID is required for Azure Adapter");
        });

        it("throws when KeyValue is missing or blank", async () => {
            const { KeyValue, ...rest } = validAzure;
            await expect(AzureProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Key Value (Client Secret) is required for Azure Adapter");
        });

        it("throws when DirectoryID is missing or blank", async () => {
            const { DirectoryID, ...rest } = validAzure;
            await expect(AzureProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Directory ID is required for Azure Adapter");
        });

        it("throws when SubscriptionID is missing or blank", async () => {
            const { SubscriptionID, ...rest } = validAzure;
            await expect(AzureProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Subscription ID is required for Azure Adapter");
        });
    });

    describe("GcpProvider", () => {
        const validServiceAccount = {
            type: "service_account",
            project_id: "test-gcp-project",
            private_key_id: "key-123",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
            client_email: "test-sa@test-gcp-project.iam.gserviceaccount.com",
            client_id: "1234567890",
        };

        it("throws when serviceAccountKey is missing", async () => {
            await expect(GcpProvider.verifyIntegrationConfig({}))
                .rejects.toThrow("Service Account Key (JSON) is required for GCP Adapter");
        });

        it("throws when serviceAccountKey is not valid JSON string", async () => {
            await expect(GcpProvider.verifyIntegrationConfig({ serviceAccountKey: "{ not-json" }))
                .rejects.toThrow("Service Account Key must be valid JSON");
        });

        it("throws when serviceAccountKey is missing client_email or private_key", async () => {
            await expect(GcpProvider.verifyIntegrationConfig({
                serviceAccountKey: JSON.stringify({ client_email: "a@b.com" }),
            })).rejects.toThrow("Service Account Key is missing required fields (client_email or private_key)");

            await expect(GcpProvider.verifyIntegrationConfig({
                serviceAccountKey: JSON.stringify({ private_key: "some-key" }),
            })).rejects.toThrow("Service Account Key is missing required fields (client_email or private_key)");
        });

        it("throws when projectId is missing from both config and serviceAccountKey", async () => {
            const saWithoutProject = {
                client_email: "sa@example.com",
                private_key: "key-content",
            };
            await expect(GcpProvider.verifyIntegrationConfig({
                serviceAccountKey: saWithoutProject,
            })).rejects.toThrow("Project ID is required");
        });

        it("validates successfully with serviceAccountKey object and projectId", async () => {
            const result = await GcpProvider.verifyIntegrationConfig({
                serviceAccountKey: validServiceAccount,
                projectId: "test-gcp-project",
            });
            expect(result).toBe(true);
        });

        it("validates successfully with serviceAccountKey JSON string and inherited project_id", async () => {
            const result = await GcpProvider.verifyIntegrationConfig({
                gcp: {
                    serviceAccountKey: JSON.stringify(validServiceAccount),
                },
            });
            expect(result).toBe(true);
        });
    });

    describe("OracleProvider", () => {
        const validOracle = {
            tenancyId: "ocid1.tenancy.oc1..aaaaaaaaxxx",
            userId: "ocid1.user.oc1..aaaaaaayyy",
            keyFingerprint: "20:3b:97:13:55:1c:5b:0d:d3:37:d8:50:4e:c5:3a:34",
            keyValue: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAt...\n-----END RSA PRIVATE KEY-----",
            region: "us-ashburn-1",
        };

        it("validates successfully with all required Oracle parameters", async () => {
            const result = await OracleProvider.verifyIntegrationConfig(validOracle);
            expect(result).toBe(true);
        });

        it("accepts nested config under { oracle: { ... } }", async () => {
            const result = await OracleProvider.verifyIntegrationConfig({ oracle: validOracle });
            expect(result).toBe(true);
        });

        it("accepts snake_case aliases and works without region", async () => {
            const result = await OracleProvider.verifyIntegrationConfig({
                tenancy_id: validOracle.tenancyId,
                user_id: validOracle.userId,
                key_fingerprint: validOracle.keyFingerprint,
                key_value: validOracle.keyValue,
            });
            expect(result).toBe(true);
        });

        it("throws when tenancyId is missing or blank", async () => {
            const { tenancyId, ...rest } = validOracle;
            await expect(OracleProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Tenancy ID is required for Oracle OCI Adapter");
        });

        it("throws when userId is missing or blank", async () => {
            const { userId, ...rest } = validOracle;
            await expect(OracleProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("User ID is required for Oracle OCI Adapter");
        });

        it("throws when keyFingerprint is missing or blank", async () => {
            const { keyFingerprint, ...rest } = validOracle;
            await expect(OracleProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Key Fingerprint is required for Oracle OCI Adapter");
        });

        it("throws when keyValue is missing or blank", async () => {
            const { keyValue, ...rest } = validOracle;
            await expect(OracleProvider.verifyIntegrationConfig(rest))
                .rejects.toThrow("Key Value (Private Key) is required for Oracle OCI Adapter");
        });
    });

    describe("Integration Class", () => {
        it("constructs default MongoDB URI when no parameters provided", () => {
            const integration = new Integration();
            expect(integration.uri).toBe("mongodb://127.0.0.1:27017/integrations");
            expect(integration.dbName).toBe("integrations");
        });

        it("uses explicit MONGODB_URI when provided", () => {
            const customUri = "mongodb+srv://cluster0.example.mongodb.net/prod_integrations";
            const integration = new Integration({
                MONGODB_URI: customUri,
                INTEGRATIONS_DB: "prod_integrations",
            });
            expect(integration.uri).toBe(customUri);
            expect(integration.dbName).toBe("prod_integrations");
        });

        it("builds MongoDB URI from discrete host and port", () => {
            const integration = new Integration({
                MONGODB_HOST: "mongo.internal",
                MONGODB_PORT: 27018,
                INTEGRATIONS_DB: "custom_db",
            });
            expect(integration.uri).toBe("mongodb://mongo.internal:27018/custom_db");
        });

        it("builds authenticated MongoDB URI with query parameters", () => {
            const integration = new Integration({
                MONGODB_HOST: "mongo.internal",
                MONGODB_PORT: 27017,
                MONGODB_USER: "myuser",
                MONGODB_PASS: "p@ss:word",
                AUTH_SOURCE: "admin",
                REPLICA_SET: "rs0",
                INTEGRATIONS_DB: "testdb",
            });
            expect(integration.uri).toContain("mongodb://myuser:p%40ss%3Aword@mongo.internal:27017/testdb");
            expect(integration.uri).toContain("authSource=admin");
            expect(integration.uri).toContain("replicaSet=rs0");
        });

        it("isConnected returns false when client is not initialized or topology destroyed", () => {
            const integration = new Integration();
            expect(integration.isConnected()).toBe(false);

            integration.client = {
                topology: {
                    isDestroyed: () => true,
                },
            };
            expect(integration.isConnected()).toBe(false);

            integration.client.topology.isDestroyed = () => false;
            expect(integration.isConnected()).toBe(true);
        });

        it("getClient, getConnection, and getDb throw if not connected", () => {
            const integration = new Integration();
            expect(() => integration.getClient()).toThrow("Client is not connected. Call connect() first.");
            expect(() => integration.getConnection()).toThrow("Client is not connected. Call connect() first.");
            expect(() => integration.getDb()).toThrow("Database is not initialized. Call connect() first.");
        });

        it("getClient and getDb return client and db when connected", () => {
            const integration = new Integration();
            const mockClient = {
                topology: { isDestroyed: () => false },
            };
            const mockDb = { name: "integrations" };

            integration.client = mockClient;
            integration.db = mockDb;

            expect(integration.getClient()).toBe(mockClient);
            expect(integration.getConnection()).toBe(mockClient);
            expect(integration.getDb()).toBe(mockDb);
        });

        it("getCollection delegates to db.collection", () => {
            const integration = new Integration();
            const mockCollection = { find: vi.fn() };
            const mockDb = {
                collection: vi.fn().mockReturnValue(mockCollection),
            };

            integration.client = { topology: { isDestroyed: () => false } };
            integration.db = mockDb;

            const col = integration.getCollection("custom_collection");
            expect(mockDb.collection).toHaveBeenCalledWith("custom_collection");
            expect(col).toBe(mockCollection);
        });

        it("disconnect closes client and resets internal references", async () => {
            const integration = new Integration();
            const closeFn = vi.fn().mockResolvedValue(true);
            integration.client = { close: closeFn };
            integration.connection = integration.client;
            integration.db = { collection: vi.fn() };

            await integration.disconnect();

            expect(closeFn).toHaveBeenCalled();
            expect(integration.client).toBeNull();
            expect(integration.connection).toBeNull();
            expect(integration.db).toBeNull();
        });

        it("getIntegrationById queries by ObjectId for valid 24-char hex id and decrypts config", async () => {
            const integration = new Integration();
            const testId = new ObjectId().toString();

            const rawSecret = "super-secret-aws-key";
            const mockDoc = {
                _id: new ObjectId(testId),
                name: "My AWS Integration",
                integrationId: "aws",
                config: {
                    aws: {
                        accessKeyId: "AKIA123",
                        secretAccessKey: encryptHelper(rawSecret),
                        region: "us-east-1",
                    },
                },
            };

            const mockFindOne = vi.fn().mockResolvedValue(mockDoc);
            const mockCollection = { findOne: mockFindOne };
            integration.client = { topology: { isDestroyed: () => false } };
            integration.db = { collection: vi.fn().mockReturnValue(mockCollection) };

            const result = await integration.getIntegrationById({ id: testId, decrypt: true });

            expect(mockFindOne).toHaveBeenCalledWith({ _id: new ObjectId(testId) });
            expect(result.config.aws.secretAccessKey).toBe(rawSecret);
            expect(result.config.aws.region).toBe("us-east-1");
        });

        it("getIntegrationById does not decrypt config when decrypt: false", async () => {
            const integration = new Integration();
            const rawId = "custom-string-id-not-object-id";
            const encryptedSecret = encryptHelper("plain-secret");

            const mockDoc = {
                _id: rawId,
                name: "Custom Integration",
                config: {
                    token: encryptedSecret,
                },
            };

            const mockFindOne = vi.fn().mockResolvedValue(mockDoc);
            integration.client = { topology: { isDestroyed: () => false } };
            integration.db = { collection: vi.fn().mockReturnValue({ findOne: mockFindOne }) };

            const result = await integration.getIntegrationById({ id: rawId, decrypt: false });

            expect(mockFindOne).toHaveBeenCalledWith({ _id: rawId });
            expect(result.config.token).toBe(encryptedSecret);
        });

        it("getIntegrationById handles null document gracefully", async () => {
            const integration = new Integration();
            const mockFindOne = vi.fn().mockResolvedValue(null);
            integration.client = { topology: { isDestroyed: () => false } };
            integration.db = { collection: vi.fn().mockReturnValue({ findOne: mockFindOne }) };

            const result = await integration.getIntegrationById({ id: "missing-id" });
            expect(result).toBeNull();
        });

        it("Integration static verifyIntegrationConfig proxies to Provider", async () => {
            const result = await Integration.verifyIntegrationConfig("aws", {
                accessKeyId: "AKIA-KEY",
                secretAccessKey: "SECRET-VAL",
                region: "ap-south-1",
            });
            expect(result).toBe(true);
        });
    });
});

