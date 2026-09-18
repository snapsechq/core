---
name: integrate-snapsec-authentication
description: Guides the migration and integration of backend microservices (e.g., AIM, ASM, WAS, AssetInventory, VS) to use @snapsechq/authentication from backend/core. Use whenever the user asks to integrate, migrate, configure, or troubleshoot authentication in any Snapsec microservice.
---

# Integrate Snapsec Authentication Skill

This skill provides a step-by-step runbook for integrating `@snapsechq/authentication` into any Snapsec backend microservice (e.g., `backend/ASM`, `backend/WAS`, `backend/AssetInventory`, `backend/VS`, `backend/AIM`).

`@snapsechq/authentication` standardizes multi-strategy authentication, RS256 token verification, organization license verification, internal service key handshakes, API key validation, and request decoration across the entire Snapsec platform.

---

## Architecture Overview

`@snapsechq/authentication` provides a unified strategy-driven authentication pipeline:

```
                      Incoming Request
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Authorization Header]             [x-service-key Header]
            │                                 │
   ┌────────┴────────┐                        │
   ▼                 ▼                        ▼
 [JWT Strategy]  [API Key Strategy]   [Internal Strategy]
   │                 │                        │
   └────────┬────────┴────────────────────────┘
            ▼
   ┌─────────────────┐
   │ Success Context │  ──> Attach to req.user / req.auth
   └─────────────────┘
```

### Supported Strategies
1. **JWT Strategy (`jwt`)**:
   - Validates asymmetric RSA RS256 signatures via Auth service public key (`jwtRS256.key.pub`).
   - Verifies expiration, active tenant/organization membership, and active license status.
2. **API Key Strategy (`api_key`)**:
   - Validates automated client/CI/CD keys against Auth service (`/api/v1/auth/validate-api-key`) with short-lived in-memory caching.
3. **Internal Strategy (`internal`)**:
   - Validates `x-service-key` header against the microservice's `SERVICE_KEY`.
   - Bypasses user token checks, sets `req.service_req = true` and `req.user.role = "InternalService"`.
4. **Intermediary Strategy (`intermediary`)**:
   - Validates gateway-forwarded identities (`x-user-id`, `x-user-role`, `x-org-id`) signed with gateway secret.

---

## Canonical Reference Implementations
- **Reference Service**: `backend/VM/src/middlewares/auth/index.js`
- **Core Package**: `backend/core/packages/authentication`
- **Documentation**: `backend/core/docs/authentication/`

---

## Step-by-Step Migration Guide

### Step 1: Verify Prerequisites & Install Package

1. **Verify npm registry**: Ensure `.npmrc` is configured with GitHub Packages access:
   ```ini
   @snapsechq:registry=https://npm.pkg.github.com
   ```
2. **Install package in target service directory**:
   - **Locally**:
     ```bash
     cd backend/<ServiceName>
     npm i @snapsechq/authentication
     ```
   - **In Docker (CI / Staging / Production)**:
     ```bash
     npm ci
     ```
   > **Important**: Do **not** use `--legacy-peer-deps`, `--force`, or other installation flags. Use standard `npm i` locally and clean `npm ci` in Docker containers.
3. **Verify Environment Variables**:
   Confirm that the microservice's configuration (e.g., `src/config/app-config.js` or `.env`) includes:
   - `PUBLIC_KEY_PATH`: Absolute or relative path to `jwtRS256.key.pub`
   - `SERVICE_KEY`: Secret string for inter-service RPC
   - `AUTH_SERVICE_URL`: URL of the Auth service (e.g. `http://localhost:11000` or `http://auth:11000`)

---

### Step 2: Clean Up Legacy & Duplicate Strategy Files

Inspect `backend/<ServiceName>/src/middlewares/auth/` (or equivalent):
1. Delete obsolete `strategies/` directory if present:
   ```powershell
   Remove-Item -Recurse -Force "src/middlewares/auth/strategies"
   ```
2. Remove obsolete direct dependencies from `package.json` if they were only used for manual JWT parsing:
   - `jsonwebtoken`, `express-jwt`, `express-oauth2-jwt-bearer`, `jwt-decode`

---

### Step 3: Configure Auth Suite Middleware (`src/middlewares/auth/index.js`)

Create or update `src/middlewares/auth/index.js` to instantiate `createAuth`:

```javascript
/**
 * Unified Authentication Middleware for <ServiceName>
 * Powered by @snapsechq/authentication
 */
const createAuth = require("@snapsechq/authentication");
const { appConfig } = require("../../config/app-config"); // Adjust path as needed

const authSuite = createAuth({
  publicKeyPath: appConfig.PUBLIC_KEY_PATH,
  serviceKey: appConfig.SERVICE_KEY,
  authServiceUrl: appConfig.AUTH_SERVICE_URL,
  requiredOrgAccess: "<SERVICE_CODE>", // e.g. "VM", "ASM", "WAS", "AIM"
  activityOrigin: "<service_name>",    // e.g. "vm", "asm", "was", "aim"
  onActivityLog: async (log) => {
    try {
      // Dispatch activity log to RabbitMQ broker if service uses it
      const { mqbroker } = require("../../services/rabbitmq.service");
      if (mqbroker?.publish) {
        await mqbroker.publish("activitylogs", "activitylogs.all", log);
      }
    } catch (err) {
      console.error("Failed to publish activity log:", err?.message || err);
    }
  },
});

/**
 * Strategy-based auth middlewares
 */
const requireApiKeyAuth = authSuite.auth({
  mode: ["api_key", "internal"],
});

// Primary default export (preserves legacy calling convention: `auth(...)` or `auth`)
module.exports = authSuite.auth;
module.exports.auth = authSuite.auth;

// Standard guard exports
module.exports.requireAuth = authSuite.requireAuth;
module.exports.optionalAuth = authSuite.optionalAuth;
module.exports.requireApiKeyAuth = requireApiKeyAuth;
module.exports.authenticateService = authSuite.authenticateService;

// Role-based convenience guards (backwards-compatible)
module.exports.requireAdmin = authSuite.requireAdmin;
module.exports.requireManager = authSuite.requireManager;
module.exports.requireMember = authSuite.requireMember;
module.exports.requireWriteAccess = authSuite.requireWriteAccess;
module.exports.requireNonDeveloper = authSuite.requireNonDeveloper;
```

---

### Step 4: Route Protection in Express Routes

Update router files (`src/routes/*.js`) to use the standardized guards:

```javascript
const express = require("express");
const router = express.Router();
const {
  requireAuth,
  requireWriteAccess,
  requireAdmin,
  requireApiKeyAuth,
} = require("../middlewares/auth");

// 1. Any authenticated user can read listings
router.get("/items", requireAuth, itemController.list);

// 2. Write endpoints forbid read-only Auditors
router.post("/items", requireWriteAccess, itemController.create);
router.patch("/items/:id", requireWriteAccess, itemController.update);

// 3. Destructive actions require Administrator privileges
router.delete("/items/:id", requireAdmin, itemController.delete);

// 4. Automation / CLI / Worker endpoints support API keys & service keys
router.post("/sync", requireApiKeyAuth, syncController.handle);

module.exports = router;
```

---

### Step 5: Request Context Decoration

Once authentication succeeds, the following context is attached to Express `req`:

```javascript
req.user = {
  id: "64a...",              // User ID (synced with _id and userId)
  userId: "64a...",
  email: "user@example.com",
  role: "Admin",             // "Super", "Platform Admin", "Admin", "Manager", "Developer", "Auditor"
  currentOrgId: "64b...",    // Currently active Organization ID
  orgId: "64b...",
  orgRole: "Admin",          // Role within this specific organization
  license: {                 // Current organization license
    status: "active",
    plan: "enterprise",
    validUntil: "2027-01-01T00:00:00.000Z"
  }
};

// If authenticated via x-service-key:
req.service_req = true;
req.user = { role: "InternalService", isService: true };
```

---

### Step 6: Verification & Smoke Testing

1. **Verify Process Startup**:
   Restart the service under PM2:
   ```bash
   pm2 restart <service-name>
   pm2 logs <service-name> --lines 40 --nostream
   ```
2. **Smoke Test Matrix**:
   - **No credentials**: `GET /api/v1/...` -> `401 Unauthorized`
   - **Valid Bearer JWT**: `GET /api/v1/...` -> `200 OK` (with `req.user` populated)
   - **Auditor Token on Write**: `POST /api/v1/...` with `requireWriteAccess` -> `403 Forbidden`
   - **Internal Service Key**: `GET /api/v1/...` with `x-service-key: <key>` -> `200 OK`
