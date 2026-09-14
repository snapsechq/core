# 2. Service Configuration & Initialization

## The `createAuth` Factory

The `@snapsechq/authentication` package does not rely on global singletons or hardcoded secrets. Instead, it exports a factory function, `createAuth(config)`, which allows each microservice to inject its local keys and environment variables.

### Configuration Parameters

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `publicKeyPath` | `string` | Optional* | Absolute path to the RSA RS256 public key file (`jwtRS256.key.pub`). |
| `publicKey` | `string` | Optional* | Raw RSA public key string (alternative to `publicKeyPath`). |
| `serviceKey` | `string` | Required | Shared secret for authenticating inter-service requests via `x-service-key`. |
| `authServiceUrl` | `string` | Required | Base URL of the central Auth microservice (e.g. `http://auth:11000`) for API key validation. |
| `requiredOrgAccess` | `string` | Optional | Module code that callers must have access to (e.g., `"VM"`, `"ASM"`). |
| `activityOrigin` | `string` | Optional | Module identifier tag added to audit logs (e.g., `"vm"`, `"asm"`). |
| `onActivityLog` | `Function` | Optional | Async callback `async (event) => {}` invoked to emit audit events. |
| `customStrategies` | `object` | Optional | Dictionary of custom strategy handlers if extending the auth pipeline. |

*\* Either `publicKeyPath` or `publicKey` must be supplied if using the `jwt` strategy.*

---

## Standard Integration Pattern

Inside each microservice's authentication middleware file (typically `src/middlewares/auth/index.js` or `src/middlewares/auth.js`):

```javascript
const path = require("path");
const { createAuth } = require("@snapsechq/authentication");

const authSuite = createAuth({
  // Path to the shared RSA public key
  publicKeyPath: path.join(__dirname, "../../../keys/jwtRS256.key.pub"),

  // Environment variables
  serviceKey: process.env.SERVICE_KEY,
  authServiceUrl: process.env.AUTH_SERVICE_URL,

  // Service identity and defaults
  requiredOrgAccess: "VM",
  activityOrigin: "vm",

  // Optional audit hook
  onActivityLog: async (logEntry) => {
    // Publish logEntry to message queue or audit store if needed
  },
});

module.exports = {
  auth: authSuite.auth,
  requireAdmin: authSuite.requireAdmin,
  requireManager: authSuite.requireManager,
  requireMember: authSuite.requireMember,
  requireWriteAccess: authSuite.requireWriteAccess,
  requireNonDeveloper: authSuite.requireNonDeveloper,
  requireAuth: authSuite.requireAuth,
  optionalAuth: authSuite.optionalAuth,
  authenticateService: authSuite.authenticateService,
};
```

---

## Migration from Legacy Code

Prior to `@snapsechq/authentication`, microservices contained a `strategies/` directory with `jwt.strategy.js`, `apiKey.strategy.js`, and `internal.strategy.js` manually maintained in their own codebase.

When migrating a microservice:
1. Delete the local `src/middlewares/auth/strategies/` folder.
2. Replace `src/middlewares/auth/index.js` with the `createAuth` setup shown above.
3. Keep all existing route imports (`const { requireAdmin, requireAuth } = require("./middlewares/auth")`) intact—the exported API signatures remain 100% compatible.

---

[⬅️ Previous: 1. Strategies & Execution Flow](./1-strategies-and-flow.md) | [Next: 3. Express Middlewares & Request Context ➡️](./3-express-middlewares-and-context.md)
