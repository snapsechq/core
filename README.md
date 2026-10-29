# Snapsec Core (`@snapsechq/core`)

Centralized platform utilities and security packages for the Snapsec microservice architecture.

## Overview

`@snapsechq/core` provides unified, battle-tested services used across all Snapsec backend microservices:

* **Authentication (`./authentication`)**: Multi-strategy authentication middleware supporting RS256 JWT validation, API Keys, Internal Service Keys, and Intermediary Gateway tokens.
* **Authorization (`./authorization`)**: Declarative 3-layer authorization engine (`require`, `can`, resource policies, global RBAC matrices).
* **RabbitMQ (`./rabbitmq`)**: Resilient message broker client with dedicated confirm channel, consumer channel pooling, and exponential backoff retry logic.
* **Integration (`./integration`)**: Multi-cloud provider integration infrastructure (AWS, Azure, GCP, Oracle Cloud).

---

## Architecture & Source Layout

All module source code is organized under `src/` and tested via Vitest under `test/`:

```text
backend/core/
├── package.json              <-- Root package definition (@snapsechq/core)
├── vitest.config.js          <-- Vitest runner configuration
├── src/                      <-- Source code (files packaged and published)
│   ├── authentication/
│   ├── authorization/
│   ├── rabbitmq/
│   ├── integration/
│   ├── index.js              <-- ESM entrypoint
│   └── index.cjs             <-- CommonJS entrypoint
└── test/                     <-- Unit test suites
    ├── authentication.test.js
    ├── authorization.test.js
    ├── rabbitmq.test.js
    └── root-exports.test.js
```

---

## Development & Testing

### Install Dependencies
```bash
pnpm install
# or
npm install
```

### Run All Unit Tests
```bash
pnpm test
# or
npm test
```

### Run in Watch Mode
```bash
npm run test:watch
```

---

## Consuming in Microservices

### 1. Configure `.npmrc`
Snapsec Core is published to GitHub Packages (`npm.pkg.github.com/@snapsechq`). Configure your machine's user-level `.npmrc` (`~/.npmrc` or `C:\Users\<user>\.npmrc`):

```ini
@snapsechq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Install Package
```bash
npm install @snapsechq/core
```

### 3. Usage Examples
```javascript
// Import unified platform utilities
const { createAuth, authorization, createMqBroker } = require("@snapsechq/core");

// Or use subpath imports
const { createAuth } = require("@snapsechq/core/authentication");
const { authorization } = require("@snapsechq/core/authorization");
const { createMqBroker } = require("@snapsechq/core/rabbitmq");
```

---

## Publishing a Release

Releases are published automatically via GitHub Actions whenever a semantic version tag is pushed:

```bash
# Bump version and create git tag
npm version minor   # or patch / major

# Push commit and tag to trigger CI/CD publish
git push origin master --follow-tags
```

Once published, update microservices platform-wide:
```bash
snap pkg update
```

---

## Documentation

Full architectural documentation and integration runbooks are available in the [`docs/`](./docs/0-table-of-contents.md) directory:
* [Setup & Usage Guide](./docs/setup-and-usage/0-table-of-contents.md)
* [Authentication Architecture](./docs/authentication/0-table-of-contents.md)
* [Authorization Architecture](./docs/authorization/0-table-of-contents.md)
* [RabbitMQ Architecture](./docs/rabbitmq/0-table-of-contents.md)
* [Contributing & Adding Modules](./docs/setup-and-usage/5-contributions.md)
