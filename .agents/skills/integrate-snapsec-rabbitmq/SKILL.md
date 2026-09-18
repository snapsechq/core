---
name: integrate-snapsec-rabbitmq
description: Guides migrating and integrating backend microservices (e.g., ASM, VS, WAS, AssetInventory, notify, Auth, VM) to use @snapsechq/rabbitmq from backend/core. Covers the zero-refactoring adapter pattern for both CommonJS and ES Modules, connection resilience, Docker BuildKit secret mounts, and PM2 verification.
---

# Integrate Snapsec RabbitMQ Skill

This skill provides a complete, battle-tested runbook for migrating any Snapsec microservice (e.g., `backend/ASM`, `backend/VS`, `backend/was`, `backend/AssetInventory`, `backend/notify`, `backend/Auth`) to use the centralized message broker package: **`@snapsechq/rabbitmq`**.

`@snapsechq/rabbitmq` centralizes and standardizes RabbitMQ messaging across all microservices:
1. **Dedicated Confirm Channel**: Uses `createConfirmChannel` for reliable publishing with acknowledgment.
2. **Consumer Channel Pooling**: Allocates isolated channels per consumer with prefetch throttling (`prefetch: 10`).
3. **Resilient Reconnection**: Exponential backoff with jitter (`MAX_RETRIES: 8`, initial delay 1s) prevents thundering herds.
4. **Automatic Consumer Recovery**: Re-asserts topology and restarts active consumers (`restartConsumers()`) after connection drops.
5. **Dual Module Support**: Full, first-class support for both CommonJS (`require`) and ES Modules (`import`).

---

## Canonical Reference Implementations

Before and during migration, consult these canonical sources:
- **Reference CommonJS Adapter**: `backend/VM/src/services/rabbitmq.service.js`
- **Core Architecture Docs**: `backend/core/docs/rabbitmq/`
  - [Overview & Architecture](file:///backend/core/docs/rabbitmq/1-overview-and-architecture.md)
  - [Messaging Patterns & API](file:///backend/core/docs/rabbitmq/2-messaging-patterns-and-api.md)
  - [Service Migration & Adapter Pattern](file:///backend/core/docs/rabbitmq/3-service-migration-and-adapter-pattern.md)
- **Core Package Implementation**: `backend/core/packages/rabbitmq/`

---

## Strict Rules & Anti-Patterns (BANNED)

Adhere strictly to these rules during migration:

1. ❌ **NEVER refactor 40+ import statements across workers, controllers, and services**:
   - Every microservice already imports `{ mqbroker }` from its local `services/rabbitmq.service.js`.
   - **ALWAYS use the Adapter Pattern**: Replace the internal 291-line `RabbitMQ` class inside `services/rabbitmq.service.js` with an adapter delegating to `@snapsechq/rabbitmq`.
   - Modifying every worker and controller introduces massive regression risk. Exactly **one file** (`rabbitmq.service.js`) should change.

2. ❌ **NEVER hardcode RabbitMQ URLs or passwords in code**:
   - **ALWAYS** use the built-in `buildRabbitmqUrl()` utility from `@snapsechq/rabbitmq` or delegate to the service's existing `utils.buildRabbitmqUrl()`.

3. ❌ **NEVER commit tokens or `.npmrc` files into git**:
   - **ALWAYS** use Docker BuildKit secret mounts (`--mount=type=secret,id=github_pat`) in Dockerfiles.

4. ❌ **NEVER use `--force` or `--legacy-peer-deps` unless resolving peer conflicts**:
   - Use standard `npm i @snapsechq/rabbitmq` locally and clean `npm ci` in Docker containers.

5. ✅ **ALWAYS update the Dockerfile syntax and Node version to latest standard**:
   - Ensure the Dockerfile starts with `# syntax=docker/dockerfile:1` (enables BuildKit 1.7 secret mounts) and uses `FROM node:24-alpine` (standardized across all SnapSec services).

---

## Step-by-Step Migration Guide

### Step 1: Detect Module System & Existing Implementation

Inspect the target microservice `package.json` and existing broker file:
- Check if `type: "module"` is declared in `package.json`:
  - **ESM Services** (e.g., `backend/ASM`, `backend/AssetInventory`): uses `import` / `export`.
  - **CommonJS Services** (e.g., `backend/VM`, `backend/VS`, `backend/Auth`): uses `require()` / `module.exports`.
- Locate the existing RabbitMQ broker file (typically `services/rabbitmq.service.js` or `src/services/rabbitmq.service.js`).
- Verify it defines the legacy 291-line `RabbitMQ` class and exports `mqbroker`.

---

### Step 2: Install `@snapsechq/rabbitmq`

In the target microservice directory (`backend/<ServiceName>`):

```bash
npm install @snapsechq/rabbitmq
```

Ensure user `.npmrc` has GitHub Packages configured with `@snapsechq:registry=https://npm.pkg.github.com`.

---

### Step 3: Implement the Zero-Refactoring Adapter

Replace the entire contents of the microservice's `rabbitmq.service.js` with the corresponding adapter below.

#### Option A: CommonJS Microservices (e.g., `VM`, `VS`, `Auth`)

Replace `src/services/rabbitmq.service.js` with:

```javascript
/**
 * RabbitMQ Broker for <ServiceName>
 * Powered by @snapsechq/rabbitmq
 */
let rabbitmqCore;
try {
    rabbitmqCore = require("@snapsechq/rabbitmq");
} catch (e) {
    // Local monorepo fallback during development
    rabbitmqCore = require("../../../core/packages/rabbitmq/src/index.cjs");
}

const { createMqBroker } = rabbitmqCore;
const utils = require("../utils/utils"); // Adjust path if needed

const mqbroker = createMqBroker({
    url: utils.buildRabbitmqUrl(),
});

module.exports = { mqbroker };
```

#### Option B: ES Module Microservices (e.g., `ASM`, `AssetInventory`)

Replace `services/rabbitmq.service.js` with:

```javascript
/**
 * RabbitMQ Broker for <ServiceName>
 * Powered by @snapsechq/rabbitmq
 */
import { createMqBroker } from "@snapsechq/rabbitmq";
import { buildRabbitmqUrl } from "../utils/utils.js"; // Adjust path if needed

export const mqbroker = createMqBroker({
    url: buildRabbitmqUrl(),
});

export default mqbroker;
```

> **Why this works**: All existing worker files, cron jobs, and controllers continue calling `mqbroker.publish()`, `mqbroker.consume()`, `mqbroker.send()`, or `mqbroker.receive()` with zero changes to their code.

---

### Step 4: Dockerfile & CI/CD Setup

To ensure container builds in GitHub Actions can authenticate with GitHub Packages to install `@snapsechq/rabbitmq`:

1. **Update `Dockerfile`**:
   Ensure `npm ci` runs inside a BuildKit secret mount:
   ```dockerfile
   # syntax=docker/dockerfile:1.7
   FROM node:24-alpine

   WORKDIR /app
   COPY package*.json ./

   # Install dependencies using BuildKit secret mount
   RUN --mount=type=secret,id=github_pat \
       TOKEN=$(cat /run/secrets/github_pat 2>/dev/null || true) \
       && if [ -z "$TOKEN" ]; then \
            echo "ERROR: /run/secrets/github_pat is empty or missing!" >&2; \
            echo "Please ensure GITHUB_PAT secret is configured in GitHub repository or environment secrets." >&2; \
            exit 1; \
          fi \
       && echo "@snapsechq:registry=https://npm.pkg.github.com" > ~/.npmrc \
       && echo "//npm.pkg.github.com/:_authToken=${TOKEN}" >> ~/.npmrc \
       && npm ci \
       && rm -f ~/.npmrc

   COPY . .
   CMD ["pm2-runtime", "ecosystem.config.js"]
   ```

2. **Update `.github/workflows/deploy.yml`**:
   Ensure `docker/build-push-action` passes the secret:
   ```yaml
         - name: Build and push Docker image
           uses: docker/build-push-action@v6
           with:
             context: .
             platforms: linux/amd64
             push: true
             tags: ...
             secrets: |
               github_pat=${{ secrets.GITHUB_PAT || secrets.GITHUB_TOKEN }}
   ```

---

### Step 5: Messaging API Quick Reference

The adapter provides the full `@snapsechq/rabbitmq` API:

#### 1. Topic Exchange (Domain Events)
```javascript
// Publishing an event:
await mqbroker.publish("snapsec.events", "vuln.detected", { vulnId: "V-123", severity: "HIGH" });

// Consuming an event:
await mqbroker.consume("snapsec.events", "vuln.*", "vm-vuln-worker", async (msg) => {
    console.log("Processed event:", msg);
});
```

#### 2. Direct Queue (Worker Task Distribution)
```javascript
// Sending a task:
await mqbroker.send("scan-jobs", { target: "example.com", profileId: 42 });

// Processing tasks:
await mqbroker.receive("scan-jobs", async (task) => {
    await executeScan(task);
});
```

#### 3. Fanout Broadcast (Cluster-Wide Notifications)
```javascript
// Broadcasting:
await mqbroker.broadcast("config.reload", { timestamp: Date.now() });

// Listening to broadcast:
await mqbroker.intercept("config.reload", "vm-instance-1", async (notice) => {
    await reloadConfig();
});
```

---

### Step 6: Runtime Verification & Smoke Testing

1. **Restart the Service in PM2**:
   ```bash
   pm2 restart <service-name>
   ```

2. **Verify Logs**:
   ```bash
   pm2 logs <service-name> --lines 40 --nostream
   ```
   Look for the confirmation log:
   ```text
   [RabbitMQ] Connection established successfully.
   ```

3. **Verify Worker Processes**:
   If the service has background worker processes (e.g. `vm-workers-general`, `asm-ticket-worker`), ensure they all transition to `online` status and bind their consumers without errors.
