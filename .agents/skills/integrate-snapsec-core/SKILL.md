---
name: integrate-snapsec-core
description: Guides the migration and integration of backend microservices (e.g. ASM, VS, WAS, AssetInventory) to use @snapsechq/authentication and @snapsechq/authorization from backend/core. Use whenever the user asks to integrate, migrate, or update a microservice with Snapsec Core authentication or authorization.
---

# Integrate Snapsec Core Skill

This skill provides the end-to-end runbook for migrating any Snapsec microservice (e.g., `backend/ASM`, `backend/VS`, `backend/was`, `backend/AssetInventory`) to use the centralized packages from `backend/core`:
- `@snapsechq/authentication`: Multi-strategy authentication (JWT RS256, API Key, Internal Service Key, Intermediary).
- `@snapsechq/authorization`: 3-layer authorization engine (Identity/Super -> Global RBAC -> Contextual Resource Policy).
- `@snapsechq/rabbitmq`: Centralized resilient message broker (dedicated confirm channels, pooling, backoff retry, consumer recovery).

---

## Reference Implementations & Documentation

Before and during migration, consult these canonical sources:
- **Reference Implementation (Auth)**: [backend/VM/src/middlewares/auth/index.js](../../../../VM/src/middlewares/auth/index.js)
- **Reference Implementation (RabbitMQ)**: [backend/VM/src/services/rabbitmq.service.js](../../../../VM/src/services/rabbitmq.service.js)
- **Core Architecture Docs**: [docs/0-table-of-contents.md](../../../docs/0-table-of-contents.md)
  - [Setup & Usage Guide](../../../docs/setup-and-usage/0-table-of-contents.md)
  - [Authentication Guide](../../../docs/authentication/0-table-of-contents.md)
  - [Authorization Guide](../../../docs/authorization/0-table-of-contents.md)
  - [RabbitMQ Guide](../../../docs/rabbitmq/0-table-of-contents.md)

---

## Migration Workflow

Follow these sequential steps when migrating a microservice:

### Step 1: Check Prerequisites & Package Installation
1. Verify that user `.npmrc` (`C:\Users\<user>\.npmrc` on Windows, `~/.npmrc` on Linux) has GitHub Packages access with `@snapsechq:registry=https://npm.pkg.github.com`.
2. In the target microservice directory (`backend/<ServiceName>`), install the packages:
   - **Locally**:
     ```bash
     npm i @snapsechq/authentication @snapsechq/authorization
     ```
   - **In Docker (CI / Staging / Production)**:
     ```bash
     npm ci
     ```
   > **Important**: Do **not** use `--legacy-peer-deps`, `--force`, or any other flags. Use standard `npm i` locally and clean `npm ci` in Docker containers.

### Step 2: Authentication Integration (The VM Blueprint)
1. **Locate and Clean Duplicate Strategies**:
   - Inspect `backend/<ServiceName>/src/middlewares/auth/` (or equivalent).
   - If a `strategies/` folder exists with duplicated files (`jwt.strategy.js`, `apiKey.strategy.js`, `internal.strategy.js`), delete that directory:
     ```powershell
     Remove-Item -Recurse -Force "src/middlewares/auth/strategies"
     ```
2. **Refactor Auth Middleware (`src/middlewares/auth/index.js`)**:
   - Import `createAuth` from `@snapsechq/authentication`.
   - Instantiate `createAuth` using the service's existing config:
     ```javascript
     const createAuth = require("@snapsechq/authentication");
     const { appConfig } = require("../../config/app-config"); // adjust path

     const authSuite = createAuth({
       publicKeyPath: appConfig.PUBLIC_KEY_PATH,
       serviceKey: appConfig.SERVICE_KEY,
       authServiceUrl: appConfig.AUTH_SERVICE_URL,
       requiredOrgAccess: "<SERVICE_MODULE_CODE>", // e.g. "ASM", "WAS", "AI"
       activityOrigin: "<service_name_lowercase>",  // e.g. "asm", "was", "ai"
       onActivityLog: async (log) => {
         // Service-specific activity log publishing (e.g. RabbitMQ/Kafka)
       },
     });
     ```
3. **Preserve Backward-Compatible Exports**:
   - To avoid breaking dozens of route controllers in the microservice, re-export all standard and legacy functions:
     ```javascript
     module.exports = authSuite.auth;
     module.exports.auth = authSuite.auth;
     module.exports.requireAdmin = authSuite.requireAdmin;
     module.exports.requireManager = authSuite.requireManager;
     module.exports.requireMember = authSuite.requireMember;
     module.exports.requireWriteAccess = authSuite.requireWriteAccess;
     module.exports.requireNonDeveloper = authSuite.requireNonDeveloper;
     module.exports.requireAuth = authSuite.requireAuth;
     module.exports.optionalAuth = authSuite.optionalAuth;
     module.exports.authenticateService = authSuite.authenticateService;

     // Keep any service-specific custom helpers if previously exported:
     // e.g., module.exports.hasRoleAccess = hasRoleAccess;
     // module.exports.ROLE_HIERARCHY = ROLE_HIERARCHY;
     ```

### Step 3: Authorization Integration
1. **Import the Engine**:
   ```javascript
   const { authorization, defaultPolicyRegistry } = require("@snapsechq/authorization");
   ```
2. **Evaluate Access on Resource Endpoints**:
   - In controllers or route handlers, enforce access using the fluent API:
     ```javascript
     // Enforce access: throws ForbiddenError (403) or UnauthorizedError (401)
     await authorization
       .resource(targetEntity, "<resource_type>")
       .for(req.user)
       .require("<action>"); // "read", "create", "update", "delete", etc.
     ```
3. **Register Custom Policies if Needed**:
   - If the microservice manages entities without a built-in policy in core (e.g. `ScanJob`, `AssetGroup`, `CloudAccount`), define a policy class:
     ```javascript
     class TargetPolicy {
       async update({ user, resource }) {
         if (resource.orgId !== user.currentOrgId) return false;
         return ["Admin", "Manager"].includes(user.role);
       }
     }
     defaultPolicyRegistry.register("target", new TargetPolicy());
     ```
4. **Mount Centralized Error Handler**:
   - Ensure the Express app handles `ForbiddenError` and `UnauthorizedError`:
     ```javascript
     const { ForbiddenError, UnauthorizedError } = require("@snapsechq/authorization");

     app.use((err, req, res, next) => {
       if (err instanceof UnauthorizedError) {
         return res.status(401).json({ success: false, error: err.message });
       }
       if (err instanceof ForbiddenError) {
         return res.status(403).json({
           success: false,
           error: err.message,
           reason: err.details?.reason,
         });
       }
       next(err);
     });
     ```

### Step 4: Verification & Smoke Test
1. Restart the service in PM2:
   ```bash
   pm2 restart <service-name>
   ```
2. Check PM2 logs for clean boot:
   ```bash
   pm2 logs <service-name> --lines 40 --nostream
   ```
3. Test an endpoint using `curl` or Postman:
   - With valid JWT -> 200 OK
   - Without token -> 401 Unauthorized
   - With auditor token on write endpoint -> 403 Forbidden
