# Authentication Guide (@snapsechq/core)

This guide covers how caller identity is verified across Snapsec services, the available authentication strategies, how to initialize the authentication suite, and how to consume preconfigured Express middlewares from `@snapsechq/core`.

---

## Table of Contents

1. [Strategies & Execution Flow](./1-strategies-and-flow.md)
   - The 4 core strategies: JWT, API Key, Internal Service Key, Intermediary Gateway.
   - Strategy chaining and credential evaluation flow.
2. [Service Configuration & Initialization](./2-service-configuration.md)
   - Factory setup using `createAuth(config)`.
   - Configuration parameters (RSA keys, service secrets, Auth service URL).
   - Integration example using `@snapsechq/core`.
3. [Express Middlewares & Request Context](./3-express-middlewares-and-context.md)
   - Preconfigured middlewares (`requireAdmin`, `requireWriteAccess`, `requireAuth`, etc.).
   - Request decoration (`req.user`, `req.auth`, `req.service_req`).
   - Standardized error codes and license expiration handling.

---

[⬅️ Previous: Setup and Usage](../setup-and-usage/0-table-of-contents.md) | [Next: 1. Strategies & Execution Flow ➡️](./1-strategies-and-flow.md)
