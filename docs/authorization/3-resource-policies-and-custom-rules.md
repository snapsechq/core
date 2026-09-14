# 3. Resource Policies & Custom Rules

## Built-in Resource Policies

`@snapsechq/authorization` includes pre-built policy handlers for core Snapsec entities:

| Policy | Resource Key | Built-in Rules & Guardrails |
| :--- | :--- | :--- |
| `AssessmentPolicy` | `assessment` | Enforces organization boundary. Prevents updates to assessments in `COMPLETED` or `LOCKED` states unless the user is an Admin or Super user. |
| `VulnerabilityPolicy` | `vulnerability` | Enforces tenant isolation. Ensures `Developer` can view and remediate assigned vulnerabilities, but restricts risk acceptance and permanent deletion to `Admin` and `Manager` roles. |
| `AssetPolicy` | `asset` | Enforces tenant boundary and restricts bulk asset deletion or critical tag removal to Admins. |

---

## Defining Custom Policies

When creating a new microservice or introducing a new domain model (e.g. `Report`, `Integration`, `ScanJob`), implement a policy class that defines methods for each action.

### 1. Implement Policy Class

Each method accepts `{ user, resource, context }` and returns either a boolean or an object with `{ granted: boolean, reason?: string }`:

```javascript
class ReportPolicy {
  async read({ user, resource }) {
    // Ensure resource belongs to user's active organization
    return resource.orgId === user.currentOrgId;
  }

  async update({ user, resource, context }) {
    if (resource.orgId !== user.currentOrgId) {
      return { granted: false, reason: "TENANT_MISMATCH" };
    }

    // Admins and Managers have full edit rights
    if (["Admin", "Manager"].includes(user.role)) {
      return true;
    }

    // Authors can edit their own draft reports
    if (resource.createdBy === user._id && resource.status === "DRAFT") {
      return true;
    }

    return {
      granted: false,
      reason: "Cannot edit reports created by other team members or finalized reports",
    };
  }

  async delete({ user, resource }) {
    // Only admins can delete reports
    return ["Admin", "Super"].includes(user.role);
  }
}
```

### 2. Register Policy with `defaultPolicyRegistry`

Register the policy instance with the global registry:

```javascript
const { defaultPolicyRegistry, authorization } = require("@snapsechq/authorization");

defaultPolicyRegistry.register("report", new ReportPolicy());

// Now any controller in the service can evaluate 'report' rules:
await authorization
  .resource(reportDoc, "report")
  .for(req.user)
  .require("update");
```

---

## Error Handling & Express Error Middleware

When an authorization check fails via `.require()`, the engine throws one of two typed errors:

- `UnauthorizedError`: Caller is not authenticated (missing `req.user`).
- `ForbiddenError`: Caller lacks RBAC permissions or failed a resource policy.

### Centralized Express Error Handler

Mount an Express error-handling middleware to format authorization errors automatically:

```javascript
const { ForbiddenError, UnauthorizedError } = require("@snapsechq/authorization");

app.use((err, req, res, next) => {
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      success: false,
      error: err.message,
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      success: false,
      error: err.message,
      reason: err.details?.reason,
      resource: err.details?.resource,
      action: err.details?.action,
    });
  }

  // Fallback for unhandled errors
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});
```

---

[⬅️ Previous: 2. Fluent API & Engine Usage](./2-fluent-api-and-engine.md) | [Back to Start: Table of Contents ➡️](../0-table-of-contents.md)
