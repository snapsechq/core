# 3. Express Middlewares & Request Context

## Preconfigured Middleware Suite

`createAuth` returns preconfigured Express middlewares that enforce standard authorization boundaries across Snapsec:

| Middleware | Allowed Modes | Role Restrictions | Common Use Case |
| :--- | :--- | :--- | :--- |
| `requireAuth` | `internal`, `jwt`, `api_key` | All valid authenticated users | Standard endpoints where any logged-in user has read access. |
| `requireAdmin` | `internal`, `jwt`, `api_key` | `Platform Admin`, `Super`, `Admin` | System-wide settings, user management, license configurations. |
| `requireManager` | `internal`, `jwt`, `api_key` | Admins + `Manager` | Remediation workflows, assigning vulnerabilities, triggering scans. |
| `requireMember` | `internal`, `jwt`, `api_key` | Admins, Managers, `Developer` | General team operations. Excludes read-only external auditors. |
| `requireWriteAccess` | `internal`, `jwt`, `api_key` | Forbids: `Auditor` | Any mutation endpoint that read-only auditors cannot execute. |
| `requireNonDeveloper`| `internal`, `jwt`, `api_key` | Forbids: `Developer`, `Auditor` | Restricted management actions (e.g. risk acceptance). |
| `optionalAuth` | `jwt`, `api_key` | None (non-blocking) | Public endpoints that enrich data if caller is authenticated. |
| `authenticateService`| `internal`, `jwt`, `api_key` | Dynamic per options | Inter-service sync endpoints. |

---

## Route Usage Example

```javascript
const express = require("express");
const router = express.Router();
const {
  requireAuth,
  requireAdmin,
  requireWriteAccess,
} = require("../middlewares/auth");

// Any authenticated identity can fetch listings
router.get("/vulnerabilities", requireAuth, vulnerabilityController.list);

// Any member except auditors can update vulnerability status
router.patch("/vulnerabilities/:id", requireWriteAccess, vulnerabilityController.update);

// Only administrators can permanently delete a vulnerability
router.delete("/vulnerabilities/:id", requireAdmin, vulnerabilityController.remove);

module.exports = router;
```

---

## Custom Middleware Builder (`auth`)

If an endpoint needs unique roles or custom configuration, invoke `auth()` directly:

```javascript
const { auth } = authSuite;

router.post(
  "/reports/export",
  auth({
    mode: ["jwt", "api_key"],
    roles: ["Admin", "Manager"],
    requiredOrgAccess: "VM",
  }),
  reportController.exportData
);
```

---

## Request Decoration (`req.user`, `req.auth`)

When a request successfully passes authentication, the middleware decorates the Express `req` object:

```javascript
// Normalized User Object
req.user = {
  _id: "64e3f89a1c2d3e4f5a6b7c8d",
  email: "developer@snapsec.co",
  name: "Alice Smith",
  role: "Developer",
  currentOrgId: "org_9876543210",
  orgs: ["org_9876543210", "org_1122334455"],
};

// Raw Auth Result & Strategy Metadata
req.auth = {
  strategy: "jwt", // "jwt" | "api_key" | "internal" | "intermediary"
  user: req.user,
  token: "eyJhbGciOiJSUzI1NiIs...",
};

// Inter-Service Flags (true if request came via x-service-key)
req.service_req = true;
req.authenticatedService = { role: "InternalService", name: "scanner" };
```

---

## Standard Error Formats

When authentication or role validation fails, the middleware immediately halts execution and responds with standard JSON schemas:

### 401 Unauthorized (Invalid or Missing Credentials)
```json
{
  "success": false,
  "error": "Unauthorized: invalid or expired token"
}
```

### 401 License Expired
If an authenticated user's organization subscription has lapsed:
```json
{
  "success": false,
  "error": "Organization license has expired",
  "errorCode": "LICENSE_EXPIRED",
  "licenseExpiry": "2026-08-31T23:59:59.999Z"
}
```

### 403 Forbidden (Insufficient Role)
```json
{
  "success": false,
  "error": "Forbidden: insufficient role"
}
```

---

[⬅️ Previous: 2. Service Configuration & Initialization](./2-service-configuration.md) | [Next: Authorization ➡️](../authorization/0-table-of-contents.md)
