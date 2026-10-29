# 5. Contributing & Adding New Packages

This guide details the procedure for contributing new modules, platform utilities, and features to `@snapsechq/core`, writing comprehensive unit tests, and releasing updates across the Snapsec microservice ecosystem.

---

## 1. Single-Package Architecture & Distribution Model

Snapsec backend services (`VM`, `ASM`, `Auth`, `AssetInventory`, `auto-pentest`, etc.) do not install individual packages (such as `@snapsechq/auth` or `@snapsechq/rabbitmq`). All shared platform infrastructure is centralized into a single package: **`@snapsechq/core`**.

### The Downstream Upgrade Pattern

When a new capability or module is added to `@snapsechq/core`, microservices do not install a new dependency. Instead, they update their existing core dependency:

```bash
# Update core in a target microservice
npm i @snapsechq/core@latest

# Or bulk update across all microservices via the Snapsec CLI
snap pkg update
```

Because downstream services consume `@snapsechq/core`, any new feature module you build is distributed as part of `@snapsechq/core`.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @snapsechq/core                                │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  Authentication  │  │  Authorization   │  │         RabbitMQ          │  │
│  │  (src/auth...)   │  │  (src/authz...)  │  │      (src/rabbitmq)       │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │        NEW MODULE (e.g., src/integration, src/cache, src/logger)      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                      npm i @snapsechq/core@latest
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       ▼                               ▼                               ▼
  backend/VM                      backend/ASM                     backend/Auth
```

---

## 2. Directory Architecture: Single Source (`src/` & `test/`)

All code in this repository is strictly organized into `src/` and `test/`:

```text
backend/core/
├── package.json              <-- Root package definition (@snapsechq/core)
├── vitest.config.js          <-- Test discovery configuration (test/**/*.test.js)
├── src/                      <-- SINGLE SOURCE (Published to GitHub Packages)
│   ├── authentication/       <-- Authentication strategies, middleware & token verification
│   ├── authorization/        <-- 3-layer authorization engine, roles, permissions, policies
│   ├── rabbitmq/             <-- Resilient message broker & adapter utilities
│   ├── integration/          <-- Cloud provider integration utilities (AWS, Azure, GCP, Oracle)
│   ├── <new-module>/         <-- Your new module implementation
│   ├── index.js              <-- ESM root export entrypoint
│   └── index.cjs             <-- CommonJS root export entrypoint
└── test/                     <-- ALL UNIT TESTS (Vitest)
    ├── authentication.test.js
    ├── authorization.test.js
    ├── rabbitmq.test.js
    ├── root-exports.test.js
    └── <new-module>.test.js   <-- Your new module unit test suite
```

### Purpose of Each Directory

1. **[`src/`](../../src) (Source of Truth)**:
   - Root [`package.json`](../../package.json) specifies `"files": ["src"]`. When GitHub Actions runs `npm publish`, **all files inside `src/` are packaged and published to GitHub Packages**.
   - Downstream microservices execute code directly from `src/`.
   - All modules live exclusively in `src/<module>/`. There is no duplication or copy-pasting into secondary package directories.

2. **[`test/`](../../test) (Vitest Unit Test Suite)**:
   - [`vitest.config.js`](../../vitest.config.js) discovers tests using:
     ```javascript
     include: ["test/**/*.test.js"]
     ```
   - Unit tests import directly from `../src/<module>/index.js`.
   - CI runs `pnpm test` against `test/` before every release.

---

## 3. Step-by-Step: Adding a New Module

Follow this workflow to add a new capability (e.g. `cache`) to `@snapsechq/core`.

### Step 1: Implement the Code in `src/`

Create a dedicated folder for your module inside `src/`:

```text
src/<new-module>/
├── index.js          <-- ESM entrypoint
├── index.cjs         <-- CommonJS entrypoint
└── ... (internal classes, helpers, strategies)
```

Snapsec microservices use both ECMAScript Modules (ESM) and CommonJS. You must provide dual support:

1. **ESM Entrypoint (`src/<new-module>/index.js`)**:
   ```javascript
   import { CacheClient } from "./client.js";

   export { CacheClient };
   export const createCache = (options) => new CacheClient(options);
   export default createCache;
   ```

2. **CommonJS Entrypoint (`src/<new-module>/index.cjs`)**:
   ```javascript
   // Ensure CommonJS compatibility for services using require()
   class CacheClient {
     // ...
   }

   function createCache(options) {
     return new CacheClient(options);
   }

   module.exports = createCache;
   module.exports.createCache = createCache;
   module.exports.CacheClient = CacheClient;
   module.exports.default = createCache;
   ```

### Step 2: Register Exports in Root `package.json`

Open the root [`package.json`](../../package.json) and add the module subpath export under `"exports"`:

```json
"exports": {
  ".": {
    "import": "./src/index.js",
    "require": "./src/index.cjs"
  },
  "./authentication": {
    "import": "./src/authentication/index.js",
    "require": "./src/authentication/index.cjs"
  },
  "./authorization": {
    "import": "./src/authorization/index.js",
    "require": "./src/authorization/index.cjs"
  },
  "./rabbitmq": {
    "import": "./src/rabbitmq/index.js",
    "require": "./src/rabbitmq/index.cjs"
  },
  "./<new-module>": {
    "import": "./src/<new-module>/index.js",
    "require": "./src/<new-module>/index.cjs"
  }
}
```

If the module relies on new third-party dependencies (e.g. `ioredis`), install them via:
```bash
pnpm add <dep>
# or
npm i <dep>
```

### Step 3: Re-export from Core Root (Optional but Recommended)

If the module is a primary platform utility, expose it from the root entrypoints so microservices can import it directly from `@snapsechq/core`:

* In [`src/index.js`](../../src/index.js):
  ```javascript
  export * from "./<new-module>/index.js";
  ```
* In [`src/index.cjs`](../../src/index.cjs):
  ```javascript
  const newModule = require("./<new-module>/index.cjs");
  module.exports.createCache = newModule.createCache;
  ```

---

## 4. Writing Unit Tests

All unit test suites are executed via Vitest before every release.

### Step 1: Create the Test Suite File

Place your test file inside `test/<new-module>.test.js`:

```javascript
import { describe, it, expect, vi } from "vitest";
import { createCache, CacheClient } from "../src/<new-module>/index.js";

describe("@snapsechq/<new-module>", () => {
  describe("Initialization", () => {
    it("instantiates correctly with valid configuration", () => {
      const client = createCache({ host: "localhost", port: 6379 });
      expect(client).toBeInstanceOf(CacheClient);
    });

    it("throws when mandatory parameters are missing", () => {
      expect(() => createCache({})).toThrow(/Missing required parameter/);
    });
  });

  describe("Operations", () => {
    it("handles basic operations gracefully", async () => {
      const client = createCache({ host: "localhost" });
      await client.set("key", "value");
      const val = await client.get("key");
      expect(val).toBe("value");
    });
  });
});
```

### Step 2: Update Root Export Tests

If the module is re-exported from the package root, open [`test/root-exports.test.js`](../../test/root-exports.test.js) and add assertions verifying that root ESM and CommonJS exports correctly surface the new module:

```javascript
describe("ESM Root Exports", () => {
  it("exports <new-module> factory", () => {
    expect(typeof createCache).toBe("function");
  });
});

describe("CommonJS Root Exports", () => {
  it("exports <new-module> factory", () => {
    expect(typeof coreCjs.createCache).toBe("function");
  });
});
```

### Step 3: Run the Test Suite Locally

Run Vitest to verify all tests pass:

```bash
cd "backend/core"

# Run all unit tests once
npm test

# Or run Vitest in interactive watch mode
npm run test:watch
```

Ensure all test files (`test/*.test.js`) pass cleanly with 100% success.

---

## 5. Local Integration Testing in Microservices

Before publishing to GitHub Packages, verify your changes in an actual downstream service (e.g. `backend/VM` or `backend/ASM`).

1. Open `backend/<ServiceName>/package.json` and point the dependency to the local folder:
   ```json
   {
     "dependencies": {
       "@snapsechq/core": "file:../core"
     }
   }
   ```
2. Re-install in the microservice:
   ```bash
   cd "backend/<ServiceName>"
   npm install
   ```
3. Test your new module in the microservice code:
   ```javascript
   const { createCache } = require("@snapsechq/core");
   // Or subpath import:
   const { createCache } = require("@snapsechq/core/cache");
   ```
4. Verify the microservice starts and operates without errors.

> [!CAUTION]
> **Revert `file:` references before pushing!**  
> Never commit `file:` references in any microservice `package.json`. Always revert the dependency to the semver range (e.g., `"^0.2.3"`) prior to pushing or opening a pull request.

---

## 6. Release and Downstream Propagation

Once the code and tests are verified:

### Step 1: Commit Your Changes
```bash
cd "backend/core"
git add .
git commit -m "feat(<module>): add <module> utility to @snapsechq/core"
```

### Step 2: Bump Version & Generate Git Tag
Use `npm version` to bump the version in `package.json` and generate an annotated git tag:
```bash
# For backward-compatible feature additions (e.g. 0.2.3 -> 0.3.0)
npm version minor

# For bug fixes / patches (e.g. 0.2.3 -> 0.2.4)
npm version patch
```

### Step 3: Push to GitHub Remote
```bash
git push origin master --follow-tags
```

The GitHub Actions workflow (`CI & Publish to GitHub Packages`) will automatically:
1. Run `pnpm test` against all test suites in `test/`.
2. Publish `@snapsechq/core` to GitHub Packages under `@snapsechq/core@<new-version>`.

### Step 4: Update Microservices
Update consumer services to consume the newly published module:
```bash
# Inside a specific microservice (e.g., backend/VM)
npm i @snapsechq/core@latest

# Or update all microservices across the platform
snap pkg update
```

---

[⬅️ Previous: 4. Versioning & Publishing](./4-versioning-and-publishing.md) | [Back to Start: 0. Table of Contents ➡️](./0-table-of-contents.md)


