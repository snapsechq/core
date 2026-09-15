# 3. Service Migration & Adapter Pattern

## The Zero-Refactoring Strategy

In a large microservice like `backend/VM`, over **40+ workers, controllers, and services** directly import the local broker service:

```javascript
const { mqbroker } = require('../../services/rabbitmq.service');
```

Refactoring every single call site across dozens of files would introduce unnecessary risk and require extensive regression testing.

Instead, we employ the **Adapter Pattern**:
1. Keep the microservice's entry file at `src/services/rabbitmq.service.js`.
2. Delete the 291 lines of duplicate connection and channel pooling boilerplate.
3. Replace it with a clean, 7-line wrapper delegating directly to `@snapsechq/rabbitmq`.

---

## Migration Implementations

### CommonJS Services (e.g. `backend/VM`)

Inside `backend/VM/src/services/rabbitmq.service.js`:

```javascript
/**
 * RabbitMQ Broker for VM Service
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
const utils = require("../utils/utils");

const mqbroker = createMqBroker({
    url: utils.buildRabbitmqUrl(),
});

module.exports = { mqbroker };
```

### ES Module Services (e.g. `backend/ASM`, `backend/AssetInventory`, `backend/Auth`)

Inside `src/services/rabbitmq.service.js` (or `services/rabbitmq.service.js`):

```javascript
import { createMqBroker } from "@snapsechq/rabbitmq";
import { buildRabbitmqUrl } from "../utils/utils.js";

export const mqbroker = createMqBroker({
    url: buildRabbitmqUrl(),
});

export default mqbroker;
```

---

## Benefits of the Adapter Pattern

| Aspect | Without Adapter (Mass Refactor) | With Adapter Pattern |
| :--- | :--- | :--- |
| **Files Modified** | 40+ files per microservice | Exactly **1 file** (`rabbitmq.service.js`) |
| **Breaking Risk** | High (relative path breakages, import syntax errors) | Zero (existing consumer contracts preserved) |
| **Migration Time** | Hours per service | 2 minutes per service |
| **Centralization** | Partial | 100% (underlying engine powered by core) |

---

## Package Installation & CI/CD Docker Builds

### 1. Adding Dependency
In the microservice `package.json`:

```json
"dependencies": {
  "@snapsechq/rabbitmq": "^0.1.0"
}
```

Install using `--legacy-peer-deps` to bypass Mongoose peer dependency conflicts:

```bash
npm install @snapsechq/rabbitmq --legacy-peer-deps
```

### 2. Dockerfile BuildKit Secret Mount
Because `@snapsechq/rabbitmq` is hosted on GitHub Packages, ensure the microservice's `Dockerfile` mounts the `github_pat` secret during `npm ci`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine

# Install PM2 globally
RUN npm install -g pm2

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using BuildKit secret mount for GitHub Packages access
RUN --mount=type=secret,id=github_pat \
    echo "@snapsechq:registry=https://npm.pkg.github.com" > ~/.npmrc \
    && echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/github_pat)" >> ~/.npmrc \
    && npm ci --legacy-peer-deps \
    && rm -f ~/.npmrc

# Copy source code
COPY . .

CMD ["pm2-runtime", "ecosystem.config.js"]
```

---

## Runtime Verification

After updating the adapter, restart the service and check the logs:

```bash
pm2 restart vm
pm2 logs vm --lines 40 --nostream
```

Expected log output confirming clean connection:
```text
[+] (MONGODB) Connected to the database vm
[RabbitMQ] Connection established successfully.
VM server running on port 11001
[+] General workers started.
```

---

[⬅️ Previous: 2. Messaging Patterns & API](./2-messaging-patterns-and-api.md) | [Back to Start: Main Table of Contents ➡️](../0-table-of-contents.md)
