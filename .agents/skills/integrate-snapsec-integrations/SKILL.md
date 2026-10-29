---
name: integrations-skill
description: Guides the setup, consumption, and integration of @snapsechq/integration and its cloud providers (GCP, AWS, Azure, Oracle) across SnapSec backend microservices and workers.
---

# SnapSec Integrations & Providers Skill

This skill documents how to integrate, configure, and consume the standardized `@snapsechq/integration` library across SnapSec backend microservices (e.g., `cspm-service`, `integration-service`, `AssetInventory`, `VM`, `auto-pentest`).

---

## 1. Overview & Architecture

The `@snapsechq/integration` package provides a unified database client and provider engine to:
- Connect directly to the centralized `integrations` MongoDB database using the native driver (`MongoClient`).
- Query installed integration instances and configurations.
- Verify credentials and configuration parameters for cloud and security providers (`gcp`, `aws`, `azure`, `oracle`).
- Eliminate redundant connector boilerplate across scanning workers and microservices.

```text
Microservice / Worker
      │
      ├──> Provider.verifyIntegrationConfig(type, config)  --> Validates credentials before save
      │
      └──> Integration.getIntegrationById({ id })          --> Fetches credentials for scan execution
                 │
                 ▼
         [ MongoDB: integrations ]
```

---

## 2. Installation & Local Development

### Production Consumption (GitHub Packages)
Ensure `~/.npmrc` contains access to GitHub Packages:
```ini
@snapsechq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```
Install in target microservice:
```bash
npm install @snapsechq/integration
```

### Local Development Linking
When developing or testing changes in `packages/core`:
1. In `backend/<service>/package.json`, add to `devDependencies`:
   ```json
   "devDependencies": {
     "@snapsechq/integration": "file:../../packages/core/packages/integration"
   }
   ```
2. Symlink or link locally:
   ```bash
   ln -sfn /path/to/dev-setup/packages/core/packages/integration node_modules/@snapsechq/integration
   ```

---

## 3. Integration Client (`Integration`)

The `Integration` class manages an isolated connection pool to MongoDB and provides query helpers.

### Initializing the Client
Import and initialize with environment variables or connection parameters:

```javascript
import { Integration } from "@snapsechq/integration";

// Option A: Component-based parameters
export const integrationClient = new Integration({
    MONGODB_HOST: process.env.MONGODB_HOST || "localhost",
    MONGODB_PORT: process.env.MONGODB_PORT || 27017,
    MONGODB_USER: process.env.MONGODB_USER,
    MONGODB_PASS: process.env.MONGODB_PASS,
    INTEGRATIONS_DB: process.env.DB_NAME || "integrations",
    AUTH_SOURCE: "admin",
    REPLICA_SET: process.env.REPLICA_SET, // optional e.g. "rs0"
    retryConfig: {
        maxRetries: 5,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 10000
    }
});

// Option B: Direct Connection URI
export const integrationClientFromUri = new Integration({
    MONGODB_URI: process.env.MONGODB_URI
});
```

### Connection Lifecycle

```javascript
// Connect on application boot (with automatic exponential backoff retry)
await integrationClient.connect();

// Check connection status
if (integrationClient.isConnected()) {
    console.log("Integrations client connected");
}

// Graceful shutdown on SIGTERM / SIGINT
await integrationClient.disconnect();
```

### Querying Integration Documents

Retrieve an integration instance by its MongoDB `_id` (supports string hex ID or `ObjectId`):

```javascript
const integration = await integrationClient.getIntegrationById({ id: instanceId });

if (!integration) {
    throw new Error(`Integration instance ${instanceId} not found`);
}

console.log("Found integration:", integration.userProvidedName, integration.integrationId);
```

### Direct Database Access
Access the underlying native `Db` or collection:
```javascript
const db = integrationClient.getDb();
const collection = integrationClient.getCollection("integrations");
const logsCollection = integrationClient.getCollection("integrationLogs");
```

---

## 4. Provider Engine (`Provider`)

The `Provider` registry provides configuration validation for all supported integrations.

### Supported Providers
| Identifier | Provider Class | Required Fields | Verification Method |
| :--- | :--- | :--- | :--- |
| `gcp` | `GcpProvider` | `serviceAccountKey` (JSON), `projectId` | OAuth JWT token fetch via `googleapis` |
| `aws` | `AwsProvider` | `accessKeyId`, `secretAccessKey` | Non-empty credential validation |
| `azure` | `AzureProvider` | `ApplicationID`, `KeyValue`, `DirectoryID`, `SubscriptionID` | Non-empty credential validation |
| `oracle` | `OracleProvider` | `tenancyId`, `userId`, `keyFingerprint`, `keyValue` (PEM), `region` | Tenancy compartment lookup via `oci-sdk` |

### Using the Provider Registry

```javascript
import { Provider } from "@snapsechq/integration";

// 1. Check if provider is supported
if (Provider.isProviderAvailable("gcp")) {
    console.log("GCP is supported");
}

// 2. Resolve provider class dynamically
const provider = Provider.getProvider({ integrationId: "aws" });
```

### Verifying Integration Configurations
Always verify credentials prior to persisting an integration in the database:

```javascript
import { Provider } from "@snapsechq/integration";

// Verify configuration dynamically
try {
    await Provider.verifyIntegrationConfig("gcp", {
        serviceAccountKey: "{ ... }",
        projectId: "my-gcp-project"
    });
    console.log("GCP Credentials valid!");
} catch (error) {
    // Throws descriptive error if validation fails
    console.error("Verification failed:", error.message);
}
```

Or call specific provider classes directly:
```javascript
import { AwsProvider, AzureProvider } from "@snapsechq/integration";

await AwsProvider.verifyIntegrationConfig({
    accessKeyId: "AKIA...",
    secretAccessKey: "..."
});

await AzureProvider.verifyIntegrationConfig({
    ApplicationID: "00000000-0000-0000-0000-000000000000",
    KeyValue: "client_secret",
    DirectoryID: "00000000-0000-0000-0000-000000000000",
    SubscriptionID: "00000000-0000-0000-0000-000000000000"
});
```

---

## 5. Microservice Integration Patterns

### Pattern 1: Singleton Service Client (`src/services/integration-client.service.js`)
Create a singleton client in the consuming microservice:

```javascript
import { Integration } from "@snapsechq/integration";
import { Config } from "../config/env.js";

class IntegrationClientService {
    constructor() {
        this.client = new Integration({
            MONGODB_HOST: Config.get("MONGODB_HOST"),
            MONGODB_PORT: Config.get("MONGODB_PORT"),
            MONGODB_USER: Config.get("MONGODB_USER"),
            MONGODB_PASS: Config.get("MONGODB_PASS"),
            INTEGRATIONS_DB: "integrations",
            AUTH_SOURCE: "admin",
            REPLICA_SET: Config.get("REPLICA_SET")
        });
    }

    async init() {
        await this.client.connect();
    }

    async getInstance(id) {
        return await this.client.getIntegrationById({ id });
    }
}

export const integrationClientService = new IntegrationClientService();
```

Initialize inside `src/app.js` or `src/setup/setup-app.js`:
```javascript
import { integrationClientService } from "./services/integration-client.service.js";

await integrationClientService.init();
```

---

### Pattern 2: Installation Controller Credential Verification
In controllers handling adapter/integration install requests:

```javascript
import { Provider } from "@snapsechq/integration";
import { ApiError } from "../errors/api-error.js";

static installAdapter = catchError(async (req, res, next) => {
    const { orgId } = req.authenticatedService;
    const { integrationId } = req.params;
    const { userProvidedName, ...config } = req.body;

    // 1. Verify credentials with provider engine
    try {
        await Provider.verifyIntegrationConfig(integrationId, config);
    } catch (err) {
        throw ApiError.badRequest(`Credential verification failed: ${err.message}`);
    }

    // 2. Delegate to Service layer to persist instance
    const result = await IntegrationService.installAdapter({
        orgId,
        integrationId,
        userProvidedName,
        config
    });

    return ApiResponse.created(res, { data: result.data }, "Installed successfully");
});
```

---

### Pattern 3: Scan Workers & Asset Ingestion Consumers
When background workers (RabbitMQ/BullMQ) process refresh or scan jobs:

```javascript
import { integrationClientService } from "../services/integration-client.service.js";
import { decryptConfig } from "../utils/crypto.js"; // Decrypt if stored encrypted

export async function processScanJob(job) {
    const { orgId, integrationId, instanceId } = job.data;

    // 1. Fetch fresh integration record from integrations DB
    const instance = await integrationClientService.getInstance(instanceId);
    if (!instance) {
        throw new Error(`Instance ${instanceId} no longer exists`);
    }

    // 2. Extract provider config
    const rawConfig = instance.config?.[integrationId] || instance.config;
    const decryptedConfig = decryptConfig(rawConfig);

    // 3. Pass decrypted credentials to scanner connector
    switch (integrationId) {
        case "gcp":
            return await runGcpScan({ orgId, credentials: decryptedConfig });
        case "aws":
            return await runAwsScan({ orgId, credentials: decryptedConfig });
        case "azure":
            return await runAzureScan({ orgId, credentials: decryptedConfig });
        case "oracle":
            return await runOracleScan({ orgId, credentials: decryptedConfig });
        default:
            throw new Error(`Unsupported scanner adapter: ${integrationId}`);
    }
}
```

---

## 6. Troubleshooting & Gotchas

1. **`ERR_MODULE_NOT_FOUND: Cannot find package 'mongodb'`**
   - Ensure `mongodb` is installed in `packages/core/packages/integration` (`npm install mongodb`).
2. **Missing required fields during verification**
   - Provider verification expects either a flat config object `{ serviceAccountKey, projectId }` or nested under the provider key `{ gcp: { ... } }`. Both forms are automatically normalized by `extractConfig`.
3. **Mongoose vs MongoDB Driver**
   - `@snapsechq/integration` uses the native `mongodb` driver (`MongoClient`, `ObjectId`) to avoid schema conflicts or Mongoose model overwrite errors across different microservices.
   - When querying by `_id`, pass the string ID directly to `getIntegrationById({ id })`. The method automatically converts valid hex strings to `new ObjectId(id)`.
4. **PEM Private Key Line Breaks**
   - When passing RSA private keys (e.g. for GCP or Oracle), ensure newline characters (`\n`) are preserved and not escaped as literal `\\n` strings.

