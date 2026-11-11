# Snapsec Integration Module (`@snapsechq/core/integration`)

Developer guide for consuming the integration, provider, and configuration resolver infrastructure across Snapsec microservices.

---

## 1. Overview & Architecture

The `@snapsechq/core/integration` package provides a unified, decoupled interface for interacting with third-party service providers (Version Control Systems such as GitHub and GitLab, and Cloud Infrastructure providers such as AWS, GCP, Azure, and Oracle Cloud).

The package is built on three core abstractions that work together:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Snapsec Microservice                             │
│                  (Controller / Background Worker / Service)                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                      1. getProvider("github")
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ConfigResolver (Proxy)                             │
│            Wraps the Provider and intercepts every method call             │
└───────────────┬─────────────────────────────────────────────┬───────────────┘
                │ options.instanceId                          │ options.config
                ▼                                             │ (Direct credentials)
┌───────────────────────────────┐                             │
│          Integration          │                             │
│ - Connects to MongoDB         │                             │
│ - Loads `integrations` doc    │                             │
│ - Decrypts credentials (AES)  │                             │
└───────────────┬───────────────┘                             │
                │ resolved config                             │
                ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Target Provider (e.g. GithubProvider)                  │
│       - Pure API execution logic (Axios, REST, SDKs)                        │
│       - Completely decoupled from MongoDB and storage models                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Raw API Response
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Provider Parser (e.g. GithubParser)                    │
│       - Normalizes responses into Snapsec standard schema:                  │
│         { type, value, properties }                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Three Abstractions

1. **`Integration` (`integration.js`)**:
   - Manages the MongoDB connection pool (`MongoClient`) to the `integrations` database.
   - Handles connection lifecycle, reconnects with exponential backoff and jitter, and graceful teardown.
   - Retrieves integration instances from the `integrations` collection by `_id`.
   - Automatically decrypts AES-256-CBC encrypted credential configurations via `decryptConfig()`.
   - Serves as the factory entry point: `integration.getProvider(integrationId)`.

2. **`Provider` & `ProviderRegistry` (`providers/provider.js`, `base.provider.js`)**:
   - Maintains the registry of all supported providers (`aws`, `azure`, `gcp`, `oracle`, `github`, `gitlab`).
   - Validates provider availability via `Provider.isProviderAvailable(integrationId)`.
   - Houses provider classes that contain pure communication and validation logic without any dependency on MongoDB or persistence layers.

3. **`ConfigResolver` (`config-resolver.js`)**:
   - Creates a dynamic JavaScript `Proxy` around the provider instance.
   - Intercepts method calls to determine how configuration credentials should be supplied:
     - **Instance-based**: If an `instanceId` is passed (and `config` is omitted), `ConfigResolver` queries MongoDB via `integration.getIntegration({ id: options.instanceId })`, decrypts the stored configuration, and passes it into the provider method.
     - **Direct-based**: If `config` is passed directly in the options, `ConfigResolver` forwards it immediately, bypassing MongoDB lookup entirely.

---

## 2. Package Installation & Imports

Configure your `.npmrc` to authenticate with GitHub Packages (`npm.pkg.github.com/@snapsechq`), then install `@snapsechq/core`:

```bash
npm install @snapsechq/core
```

Import the module using ESM:

```javascript
// Default import
import Integration from "@snapsechq/core/integration";

// Named imports
import {
    Integration,
    Provider,
    ProviderRegistry,
    BaseProvider,
    GithubProvider,
    GithubParser,
    GitlabProvider,
    GitlabParser,
    AwsProvider,
    AzureProvider,
    GcpProvider,
    OracleProvider,
    decrypt,
    decryptConfig
} from "@snapsechq/core/integration";
```

---

## 3. Initialization

Instantiate `Integration` with your MongoDB connection details. Microservices should initialize a single shared instance during application bootstrap.

### Constructor Parameters

```javascript
const integration = new Integration(options);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | `string` | `undefined` | Full MongoDB connection string (takes precedence if provided). |
| `MONGODB_HOST` | `string` | `undefined` | MongoDB host address (used when `MONGODB_URI` is omitted). |
| `MONGODB_PORT` | `number\|string` | `undefined` | MongoDB port. |
| `MONGODB_USER` | `string` | `undefined` | MongoDB username for authentication. |
| `MONGODB_PASS` | `string` | `undefined` | MongoDB password for authentication. |
| `INTEGRATIONS_DB` | `string` | `"integrations"` | Database name containing the `integrations` collection. |
| `AUTH_SOURCE` | `string` | `"admin"` | MongoDB authentication database. |
| `REPLICA_SET` | `string` | `undefined` | Replica set name (if connecting to a replica set). |
| `mongoOptions` | `object` | `{ maxPoolSize: 10, minPoolSize: 2, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000, family: 4 }` | Custom `MongoClient` options. |
| `retryConfig` | `object` | `{ maxRetries: 5, initialRetryDelayMs: 1000, maxRetryDelayMs: 10000 }` | Exponential backoff connection retry config. |
| `ENCRYPTION_KEY`| `string` | `process.env.ENCRYPTION_KEY` | 32+ character key used to decrypt AES-256-CBC encrypted credentials. |

### Microservice Singleton Setup Example

Create a dedicated loader or service module (e.g. `src/services/integration.service.js`):

```javascript
import { Integration } from "@snapsechq/core/integration";

let integrationInstance = null;

export async function initIntegrationClient() {
    if (integrationInstance && integrationInstance.isConnected()) {
        return integrationInstance;
    }

    integrationInstance = new Integration({
        MONGODB_URI: process.env.MONGODB_URI,
        INTEGRATIONS_DB: process.env.INTEGRATIONS_DB || "integrations",
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        mongoOptions: {
            maxPoolSize: 15,
            minPoolSize: 2,
        },
        retryConfig: {
            maxRetries: 5,
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 10000,
        }
    });

    await integrationInstance.connect();
    return integrationInstance;
}

export function getIntegrationClient() {
    if (!integrationInstance || !integrationInstance.isConnected()) {
        throw new Error("Integration client is not initialized. Call initIntegrationClient() first.");
    }
    return integrationInstance;
}

export async function closeIntegrationClient() {
    if (integrationInstance) {
        await integrationInstance.disconnect();
        integrationInstance = null;
    }
}
```

### Lifecycle Methods

- `await integration.connect()`: Connects to MongoDB using configured retries and event listeners.
- `integration.isConnected()`: Returns `true` if connected and topology is active.
- `await integration.disconnect(force = false)`: Gracefully closes the connection pool.
- `integration.getClient()`: Returns underlying `MongoClient` instance (throws if not connected).
- `integration.getDb()`: Returns database instance.
- `integration.getCollection(collectionName = "integrations")`: Returns MongoDB collection handle.

---

## 4. Getting Providers

Obtain a provider using `integration.getProvider(integrationId)`:

```javascript
const github = await integration.getProvider("github");
const gitlab = await integration.getProvider("gitlab");
```

### Resolution Flow

1. Microservice calls `integration.getProvider("github")`.
2. `Integration` delegates to `Provider.getProvider("github", { integration: this })`.
3. `Provider.isProviderAvailable("github")` validates the slug (case-insensitive) against `ProviderRegistry`.
4. If supported, `ConfigResolver.create(ProviderClass, { integration })` returns a Proxy wrapping the provider class with automatic credential resolution.
5. If unsupported, throws: `Error: <integrationId> is not supported.`

### Supported Providers Registry

| Key | Provider Class | Category | Capabilities / Supported Methods |
|---|---|---|---|
| `"github"` | `GithubProvider` | VCS / SCM | `getRepositories`, `getPullRequests`, `getBranches`, `getCommits`, `verifyIntegrationConfig` |
| `"gitlab"` | `GitlabProvider` | VCS / SCM | `getProjects`, `getMergeRequests`, `getBranches`, `getCommits`, `verifyIntegrationConfig` |
| `"aws"` | `AwsProvider` | Cloud | `verifyIntegrationConfig` |
| `"azure"` | `AzureProvider` | Cloud | `verifyIntegrationConfig` |
| `"gcp"` | `GcpProvider` | Cloud | `verifyIntegrationConfig` |
| `"oracle"` | `OracleProvider` | Cloud | `getCompartments`, `verifyIntegrationConfig` |

### Provider Availability Check

To verify if an integration type is supported before requesting a provider:

```javascript
import { Provider } from "@snapsechq/core/integration";

if (Provider.isProviderAvailable("github")) {
    const provider = await integration.getProvider("github");
}
```

---

## 5. Using Integration Instances (`instanceId`)

In standard microservice operations (API requests, scan tasks, background worker queues), services receive an `instanceId` corresponding to a document in MongoDB's `integrations` collection.

When you pass `instanceId` in the method options, `ConfigResolver` transparently handles the database query and credential decryption.

### Flow

1. You call `await github.getRepositories({ instanceId: "654c8a9f1b2c3d4e5f6a7b8c" })`.
2. `ConfigResolver` notices `options.config` is absent and `options.instanceId` is present.
3. `ConfigResolver` calls `integration.getIntegration({ id: options.instanceId })`.
4. `Integration` queries `_id: new ObjectId(instanceId)`.
5. Stored encrypted fields in `integration.config` are decrypted with `AES-256-CBC`.
6. `ConfigResolver` merges the decrypted `config` into the call arguments and executes `GithubProvider.getRepositories`.

### Realistic Service Example

```javascript
import { getIntegrationClient } from "../services/integration.service.js";

export async function handleListRepositories(req, res) {
    try {
        const { instanceId } = req.params;
        const { page = 1, limit = 20, org } = req.query;

        const integration = getIntegrationClient();
        const github = await integration.getProvider("github");

        // ConfigResolver automatically resolves config from MongoDB using instanceId
        const repositories = await github.getRepositories({
            instanceId,
            org,
            page: parseInt(page, 10),
            per_page: parseInt(limit, 10),
        });

        return res.status(200).json({ success: true, data: repositories });
    } catch (error) {
        if (error.message.includes("Integration not found")) {
            return res.status(404).json({ success: false, error: error.message });
        }
        return res.status(500).json({ success: false, error: error.message });
    }
}
```

---

## 6. Using Direct Configuration (`config`)

When handling credential verification, OAuth callbacks, ephemeral webhooks, or test suites, you can pass credentials directly via `config`.

When `config` is provided, `ConfigResolver` **bypasses MongoDB completely**.

### Realistic Verification Example

```javascript
import { getIntegrationClient } from "../services/integration.service.js";

export async function handleVerifyGitHubCredentials(req, res) {
    try {
        const { token, baseUrl } = req.body;

        const integration = getIntegrationClient();
        const github = await integration.getProvider("github");

        // Pass config directly - skips MongoDB lookup
        const isValid = await github.verifyIntegrationConfig({
            config: {
                token,
                baseUrl: baseUrl || "https://api.github.com",
            },
            timeout: 8000,
        });

        return res.status(200).json({ success: true, valid: isValid });
    } catch (error) {
        return res.status(400).json({
            success: false,
            error: error.message,
        });
    }
}
```

### Direct Configuration Structure

Provider methods accept credentials under standard field names or under a provider-keyed object:

```javascript
// Flat credentials
const repos = await github.getRepositories({
    config: {
        token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        baseUrl: "https://api.github.com" // Optional (for GitHub Enterprise Server)
    },
    org: "snapsechq"
});

// Or nested under provider key
const reposNested = await github.getRepositories({
    config: {
        github: {
            token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        }
    }
});
```

Accepted credential field aliases for GitHub and GitLab:
- Token: `pat`, `accessToken`, `access_token`, `token`
- Base URL: `base_url`, `baseUrl`, `githubUrl` / `gitlabUrl`

---

## 7. Provider Methods Reference

### GitHub Provider (`GithubProvider`)

#### 1. `getRepositories(config, params)`
Fetches repositories accessible to the authenticated token.

```javascript
const repos = await github.getRepositories({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    org: "snapsechq",            // Optional: organization name (defaults to /user/repos)
    page: 1,                    // Optional (default: 1)
    per_page: 30,               // Optional (default: 30, alias: limit)
    sort: "updated",            // Optional: "created", "updated", "pushed", "full_name"
    direction: "desc",          // Optional: "asc", "desc"
    type: "all",                // Optional: "all", "owner", "public", "private", "member"
    visibility: "all",          // Optional: "all", "public", "private"
    affiliation: "owner,collaborator" // Optional
});
```

#### 2. `getBranches(config, params)`
Fetches branches for a repository.

```javascript
const branches = await github.getBranches({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    repo: "snapsechq/core",      // Required: "owner/repo" or use separate owner & repo
    protected: true,            // Optional: filter protected branches
    page: 1,
    per_page: 30
});
```

#### 3. `getPullRequests(config, params)`
Fetches pull requests for a specific repository or global PRs for the user.

```javascript
// Specific repository PRs
const prs = await github.getPullRequests({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    repo: "snapsechq/core",      // "owner/repo"
    state: "open",              // Optional: "open", "closed", "all" (default: "open")
    sort: "created",            // Optional: "created", "updated", "popularity", "long-running"
    direction: "desc",          // Optional: "asc", "desc"
    page: 1,
    per_page: 20
});

// Global pull requests created by the user (searched across GitHub)
const myPrs = await github.getPullRequests({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    state: "open"
});
```

#### 4. `getCommits(config, params)`
Fetches commit history for a repository.

```javascript
const commits = await github.getCommits({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    repo: "snapsechq/core",
    sha: "main",                // Optional: branch name or commit SHA
    path: "src/integration",    // Optional: filter commits modifying a file path
    since: "2026-01-01T00:00:00Z", // Optional: ISO date string
    until: "2026-11-01T00:00:00Z", // Optional: ISO date string
    page: 1,
    per_page: 25
});
```

#### 5. `verifyIntegrationConfig(params)`
Verifies token validity against the GitHub API (`/user`).

```javascript
await github.verifyIntegrationConfig({
    config: { token: "ghp_xxxx" },
    skipLiveCheck: false,       // Set true to validate formatting without making network calls
    timeout: 10000
});
```

---

### GitLab Provider (`GitlabProvider`)

GitLab provider methods mirror the capabilities of GitHub:

```javascript
const gitlab = await integration.getProvider("gitlab");

// 1. Get Projects
const projects = await gitlab.getProjects({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    group: "snapsechq-group",   // Optional: GitLab group path
    membership: true,           // Optional: only projects user is a member of
    page: 1,
    per_page: 20
});

// 2. Get Merge Requests
const mrs = await gitlab.getMergeRequests({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    project: "snapsechq/backend", // Project ID or path
    state: "opened"               // "opened", "closed", "locked", "merged", "all"
});

// 3. Get Branches
const branches = await gitlab.getBranches({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    project: "snapsechq/backend",
    search: "feature/"
});

// 4. Get Commits
const commits = await gitlab.getCommits({
    instanceId: "654c8a9f1b2c3d4e5f6a7b8c",
    project: "snapsechq/backend",
    ref_name: "main"
});
```

---

### Cloud Providers (`AwsProvider`, `AzureProvider`, `GcpProvider`, `OracleProvider`)

Cloud providers focus on configuration verification and infrastructure inspection:

```javascript
// AWS Configuration Verification
const aws = await integration.getProvider("aws");
await aws.verifyIntegrationConfig({
    config: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1"
    }
});

// GCP Configuration Verification
const gcp = await integration.getProvider("gcp");
await gcp.verifyIntegrationConfig({
    config: {
        serviceAccountKey: JSON.stringify({
            client_email: "service-account@project.iam.gserviceaccount.com",
            private_key: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
            project_id: "snapsec-prod"
        })
    }
});

// Oracle Cloud Compartments
const oracle = await integration.getProvider("oracle");
const compartments = await oracle.getCompartments({
    config: {
        tenancyId: "ocid1.tenancy.oc1..xxxx",
        userId: "ocid1.user.oc1..xxxx",
        keyFingerprint: "20:3b:97:13:...",
        keyValue: "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
        region: "us-ashburn-1"
    }
});
```

---

## 8. Data Parsing & Normalization

External API responses vary significantly across providers (e.g. GitHub uses `full_name` and `stargazers_count`, while GitLab uses `path_with_namespace` and `star_count`).

`GithubParser` and `GitlabParser` normalize external payloads into Snapsec's standard schema:

```javascript
{
    type: string,      // Entity type: "respository", "pull_request", "branch", "commit"
    value: string,     // Standard human identifier (e.g. "org/repo", "org/repo#12", "org/repo:main")
    properties: Object // Normalized entity attributes
}
```

### Normalized Schemas

#### 1. Repository (`type: "respository"`)

```javascript
{
    type: "respository",
    value: "snapsechq/core",
    properties: {
        id: 12345678,
        name: "core",
        fullName: "snapsechq/core",
        description: "SnapSec Core Platform Utilities",
        owner: {
            id: 98765,
            login: "snapsechq",
            type: "Organization",
            avatarUrl: "https://avatars.githubusercontent.com/u/98765",
            htmlUrl: "https://github.com/snapsechq"
        },
        htmlUrl: "https://github.com/snapsechq/core",
        cloneUrl: "https://github.com/snapsechq/core.git",
        sshUrl: "git@github.com:snapsechq/core.git",
        defaultBranch: "main",
        visibility: "private",
        isPrivate: true,
        isFork: false,
        isArchived: false,
        isDisabled: false,
        primaryLanguage: "JavaScript",
        languages: ["JavaScript"],
        topics: ["security", "core"],
        size: 1024,
        starsCount: 42,
        forksCount: 5,
        openIssuesCount: 2,
        watchersCount: 42,
        license: {
            key: "apache-2.0",
            name: "Apache License 2.0",
            spdxId: "Apache-2.0",
            url: "https://api.github.com/licenses/apache-2.0"
        },
        createdAt: "2026-01-01T12:00:00Z",
        updatedAt: "2026-11-11T10:00:00Z",
        pushedAt: "2026-11-11T10:00:00Z"
    }
}
```

#### 2. Pull Request / Merge Request (`type: "pull_request"`)

```javascript
{
    type: "pull_request",
    value: "snapsechq/core#42",
    properties: {
        id: 99887766,
        number: 42,
        title: "feat: add config-resolver abstraction",
        state: "open",
        isDraft: false,
        isLocked: false,
        isMerged: false,
        repository: "snapsechq/core",
        author: {
            id: 112233,
            login: "developer",
            avatarUrl: "https://avatars.githubusercontent.com/u/112233",
            htmlUrl: "https://github.com/developer"
        },
        body: "Detailed description of changes...",
        htmlUrl: "https://github.com/snapsechq/core/pull/42",
        head: {
            ref: "feat/config-resolver",
            sha: "a1b2c3d4e5f6...",
            repo: "snapsechq/core"
        },
        base: {
            ref: "main",
            sha: "f6e5d4c3b2a1...",
            repo: "snapsechq/core"
        },
        labels: ["enhancement"],
        assignees: [],
        requestedReviewers: [],
        createdAt: "2026-11-10T14:00:00Z",
        updatedAt: "2026-11-11T09:00:00Z",
        closedAt: null,
        mergedAt: null
    }
}
```

#### 3. Branch (`type: "branch"`)

```javascript
{
    type: "branch",
    value: "snapsechq/core:main",
    properties: {
        name: "main",
        repository: "snapsechq/core",
        isProtected: true,
        commit: {
            sha: "7d8e9f...",
            url: "https://api.github.com/repos/snapsechq/core/commits/7d8e9f..."
        },
        protectionUrl: "https://api.github.com/repos/snapsechq/core/branches/main/protection"
    }
}
```

#### 4. Commit (`type: "commit"`)

```javascript
{
    type: "commit",
    value: "snapsechq/core@7d8e9f...",
    properties: {
        sha: "7d8e9f0123456789...",
        repository: "snapsechq/core",
        message: "feat: integration proxy resolver",
        author: {
            name: "Dev Engineer",
            email: "dev@snapsec.co",
            date: "2026-11-11T12:00:00Z",
            login: "devengineer"
        },
        committer: {
            name: "GitHub",
            email: "noreply@github.com",
            date: "2026-11-11T12:00:00Z"
        },
        htmlUrl: "https://github.com/snapsechq/core/commit/7d8e9f...",
        isVerified: true,
        parents: ["1a2b3c..."]
    }
}
```

---

## 9. Error Handling

### Error Types & Messages

The following table summarizes standard errors thrown by `@snapsechq/core/integration`:

| Error Scenario | Thrown Message / Condition | HTTP Code | Recommended Service Handling |
|---|---|---|---|
| **Unsupported Provider** | `Error: <provider> is not supported.` | `400 Bad Request` | Validate provider key before calling `getProvider()`. |
| **Missing Instance** | `Error: Integration not found: <instanceId>` | `404 Not Found` | Verify MongoDB `_id` exists in `integrations` collection. |
| **Not Connected** | `Error: [Integration][MongoDB] Client is not connected. Call connect() first.` | `500 Internal Server Error` | Ensure application bootstrap awaits `integration.connect()`. |
| **Missing Token** | `Error: Personal Access Token (PAT) is required` | `400 Bad Request` | Verify integration credentials contain token/pat. |
| **Invalid Credential** | `Error: Invalid GitHub Configuration: Bad credentials` | `401 Unauthorized` | Prompt user to reconnect integration with valid token. |
| **Missing Repository** | `Error: Repository is required to fetch branches (e.g. ?repo=owner/name...)` | `400 Bad Request` | Validate route parameters before executing method. |
| **Malformed URL** | `Error: Base URL must be a valid HTTP or HTTPS URL` | `400 Bad Request` | Validate custom Enterprise URLs. |

### Robust Controller Error Handling Pattern

```javascript
import { getIntegrationClient } from "../services/integration.service.js";

export async function getRepoBranchesController(req, res) {
    const { instanceId } = req.params;
    const { repo } = req.query;

    if (!repo) {
        return res.status(400).json({
            success: false,
            error: "Query parameter 'repo' (owner/name) is required.",
        });
    }

    try {
        const integration = getIntegrationClient();
        const github = await integration.getProvider("github");

        const branches = await github.getBranches({
            instanceId,
            repo,
        });

        return res.status(200).json({ success: true, data: branches });
    } catch (error) {
        const message = error.message;

        if (message.includes("Integration not found")) {
            return res.status(404).json({ success: false, error: message });
        }
        if (message.includes("is not supported")) {
            return res.status(400).json({ success: false, error: message });
        }
        if (message.includes("Personal Access Token (PAT) is required")) {
            return res.status(400).json({ success: false, error: "Integration credentials missing access token." });
        }
        if (error.response?.status === 401 || message.includes("Bad credentials")) {
            return res.status(401).json({ success: false, error: "Upstream provider authentication failed. Reconnect your integration." });
        }
        if (error.response?.status === 404) {
            return res.status(404).json({ success: false, error: `Repository '${repo}' not found on provider.` });
        }

        return res.status(500).json({ success: false, error: "Failed to fetch repository branches." });
    }
}
```

---

## 10. Best Practices

### 1. Reuse a Single `Integration` Instance
Do not call `new Integration()` inside Express route handlers or Celery/RabbitMQ job consumers. Instantiating multiple clients creates redundant MongoDB connection pools and exhausts database sockets. Initialize once at service startup and export a singleton accessor.

### 2. Avoid Redundant Database Lookups
If a worker job or preceding pipeline stage already loaded and decrypted the integration credentials, pass `{ config }` directly to the provider methods instead of re-passing `instanceId`. This avoids unnecessary MongoDB queries and decryption overhead:

```javascript
// Upstream message already contains decrypted config
async function processScanJob(jobPayload) {
    const { providerType, decryptedConfig, repository } = jobPayload;
    const provider = await integration.getProvider(providerType);

    // Call directly with config, skipping database roundtrips:
    const commits = await provider.getCommits({
        config: decryptedConfig,
        repo: repository,
        limit: 10
    });
}
```

### 3. Keep Provider Implementations Independent of Storage
When writing tests or adding new provider capabilities, never introduce database or Mongoose queries into provider classes (`GithubProvider`, `AwsProvider`, etc.). Provider classes should operate purely on options and configurations passed into their arguments.

### 4. Always Configure `ENCRYPTION_KEY`
Ensure `ENCRYPTION_KEY` is injected via Kubernetes Secrets or Docker environment variables. The integration module falls back to a default key if omitted, which must never be allowed in production environments.

### 5. Graceful Teardown
Register process termination hooks to disconnect from MongoDB cleanly when the service stops:

```javascript
async function handleShutdown(signal) {
    console.log(`Received ${signal}. Shutting down integration client...`);
    try {
        await closeIntegrationClient();
    } finally {
        process.exit(0);
    }
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
```

