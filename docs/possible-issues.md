# Troubleshooting & Known Possible Issues

This document tracks known runtime issues, breaking changes, and crash symptoms that can occur across Snapsec microservices as a result of platform and package refactoring, along with step-by-step remedies.

---

## Issue 1: `MODULE_NOT_FOUND` on `@snapsechq/rabbitmq`, `@snapsechq/authorization`, or `@snapsechq/authentication`

### 1. Symptoms & Error Log
During service boot or PM2 process startup, the microservice crashes immediately with an unhandled exception:

```text
Error: Cannot find module '@snapsechq/rabbitmq'
Require stack:
- /app/src/services/rabbitmq.service.js
- /app/app.js
- /app/server.js
  code: 'MODULE_NOT_FOUND',
  requireStack: [ ... ]
```
*(Or similarly for `@snapsechq/authorization` or `@snapsechq/authentication`)*

### 2. Root Cause
In earlier versions of Snapsec Core, packages were distributed as independent npm packages:
* `@snapsechq/authentication`
* `@snapsechq/authorization`
* `@snapsechq/rabbitmq`

All packages have now been consolidated into the single unified platform package: **`@snapsechq/core`**. The standalone packages are no longer published or installed in microservice `node_modules`. If any file in a microservice attempts to require or import one of the old package names, Node.js cannot resolve the path and crashes with `MODULE_NOT_FOUND`.

---

### 3. Suggested Fixes

#### Fix A: Update the Import Statement (Recommended)

Replace the legacy import with either the **Root Export** or the **Subpath Export** from `@snapsechq/core`:

##### For RabbitMQ:
```javascript
// ❌ OLD (Will crash):
const { buildRabbitmqUrl, createMqBroker, mqbroker } = require("@snapsechq/rabbitmq");

// ✅ NEW Option 1 (Root import):
const { buildRabbitmqUrl, createMqBroker, mqbroker } = require("@snapsechq/core");

// ✅ NEW Option 2 (Subpath import):
const { buildRabbitmqUrl, createMqBroker, mqbroker } = require("@snapsechq/core/rabbitmq");
```

##### For Authorization:
```javascript
// ❌ OLD (Will crash):
const { authorization, Roles, Permissions, ForbiddenError } = require("@snapsechq/authorization");

// ✅ NEW Option 1 (Root import):
const { authorization, Roles, Permissions, ForbiddenError } = require("@snapsechq/core");

// ✅ NEW Option 2 (Subpath import):
const { authorization, Roles, Permissions, ForbiddenError } = require("@snapsechq/core/authorization");
```

##### For Authentication:
```javascript
// ❌ OLD (Will crash):
const { createAuth } = require("@snapsechq/authentication");

// ✅ NEW Option 1 (Root import):
const { createAuth } = require("@snapsechq/core");

// ✅ NEW Option 2 (Subpath import):
const { createAuth } = require("@snapsechq/core/authentication");
```

---

#### Fix B: Ensure `@snapsechq/core` is Installed

Check the microservice's `package.json`. If it references the old package or is missing `@snapsechq/core`, update it:

```bash
cd "backend/<ServiceName>"

# Remove legacy package references if present
npm uninstall @snapsechq/rabbitmq @snapsechq/authorization @snapsechq/authentication

# Install the latest unified core package
npm i @snapsechq/core@latest
```

---

### 4. How to Detect Legacy Imports Across All Services

Run this PowerShell command from the `dev-setup` root to instantly locate any remaining legacy package imports across all backend microservices:

```powershell
Get-ChildItem -Path "backend" -Recurse -Include "*.js","*.cjs","*.mjs" -Exclude "node_modules" | Select-String -Pattern '["'']@snapsechq/(rabbitmq|authorization|authentication)["'']'
```

If any matches are returned, update those files to import from `@snapsechq/core` as shown above.

---

## Related Documentation
* [1. Background & Architecture](./setup-and-usage/1-background-and-architecture.md)
* [2. Messaging Patterns & API](./rabbitmq/2-messaging-patterns-and-api.md)
* [5. Contributing & Adding Packages](./setup-and-usage/5-contributions.md)

