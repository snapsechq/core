---
name: integrate-snapsec-authorization
description: Guides migrating and integrating backend microservices (e.g., AIM, ASM, WAS, AssetInventory, VS) to use @snapsechq/authorization from backend/core. Covers the 3-layer authorization model, fluent API (.require/.can), declarative controller checks, service layer checks, custom resource policies, eliminating procedural role checks, and error handling.
---

# Integrate Snapsec Authorization Skill

This skill provides a comprehensive runbook for migrating any Snapsec backend microservice (e.g., `backend/ASM`, `backend/WAS`, `backend/AssetInventory`, `backend/VS`, `backend/AIM`) to `@snapsechq/authorization`.

`@snapsechq/authorization` centralizes and standardizes authorization across all microservices via a 3-layer model:
1. **Layer 1: Identity & Super Role Bypass** (Fast path for `Super` and `Platform Admin`).
2. **Layer 2: Global Role-Based Access Control (RBAC)** (Coarse-grained action checks against the canonical role matrix).
3. **Layer 3: Contextual Resource-Level Policies** (Fine-grained multi-tenancy, collaborator, assignee, and ownership rules).

---

## Canonical Reference Implementations
- **Reference Middleware**: `backend/VM/src/middlewares/auth/index.js`
- **Reference Controller**: `backend/VM/src/controllers/assessment.controller.js`
- **Reference Service**: `backend/VM/src/services/vuln.service.js`
- **Core Package**: `backend/core/packages/authorization`
- **Documentation**: `backend/core/docs/authorization/`

---

## Strict Rules & Anti-Patterns (BANNED)

Before writing any authorization code, adhere strictly to these rules:

1. ❌ **NEVER use relative path fallbacks to core** (e.g., `require("../../../../core/packages/authorization")`):
   - Relative paths break on staging and production Docker containers where directory hierarchies differ from local dev.
   - **ALWAYS** import directly from the npm package:
     ```javascript
     const { authorization, Roles, Permissions } = require("@snapsechq/authorization");
     ```
2. ❌ **NEVER write procedural role string comparisons**:
   - Do NOT write: `if (role === "admin" || role === "Manager")` or `if (["Admin", "Manager"].includes(role))`.
   - **ALWAYS** use canonical constants and helpers:
     ```javascript
     const { Roles, hasRoleAccess, hasAnyRole } = require("@snapsechq/authorization");
     if (hasRoleAccess(role, Roles.MANAGER)) { ... }
     ```
3. ❌ **NEVER maintain duplicate service-level access helper functions**:
   - Delete legacy procedural helpers (e.g. `hasAssessmentAccess`, `checkUserAccess`, `isAuthorized`).
   - Replace them with declarative engine checks:
     ```javascript
     await authorization.resource(resource, "resource_type").for(user).require("read");
     ```
4. ❌ **NEVER bypass Layer 1 or Layer 3**:
   - Layer 1 ensures `Super` and `Platform Admin` always have emergency/platform access.
   - Layer 3 guarantees strict multi-tenant isolation (`resource.orgId === user.currentOrgId`).

---

## Step-by-Step Migration Guide

### Step 1: Install `@snapsechq/authorization`

- **Locally**:
  ```bash
  cd backend/<ServiceName>
  npm i @snapsechq/authorization
  ```
- **In Docker (CI / Staging / Production)**:
  ```bash
  npm ci
  ```
> **Important**: Do **not** use `--legacy-peer-deps`, `--force`, or any other flags. Use standard `npm i` locally and clean `npm ci` in Docker containers.

---

### Step 2: Global Error Handler Integration

Ensure the Express application intercepts `UnauthorizedError` and `ForbiddenError` thrown by `.require()`:

In `src/middlewares/error-handler.js` (or `app.js`):
```javascript
const { UnauthorizedError, ForbiddenError } = require("@snapsechq/authorization");

function errorHandler(err, req, res, next) {
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      success: false,
      error: err.message || "Unauthorized: authentication required",
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      success: false,
      error: err.message || "Forbidden: access denied",
      reason: err.details?.reason,
      permission: err.details?.permission,
    });
  }

  // Handle other errors...
  next(err);
}

module.exports = errorHandler;
```

---

### Step 3: Re-export Authorization Primitives & Route Guards

In `src/middlewares/auth/index.js`, re-export all core authorization primitives and route-level guards:

```javascript
const authz = require("@snapsechq/authorization");

const {
  authorization,
  AuthorizationEngine,
  Roles,
  ROLE_HIERARCHY,
  hasRoleAccess,
  hasAnyRole,
  hasForbiddenRole,
  extractUserRoles,
  Actions,
  Resources,
  Permissions,
  DefaultRolePermissions,
  hasPermission,
  hasAllPermissions,
  ForbiddenError,
  UnauthorizedError,
  isSuperOrPlatformAdmin,
  isSameOrganization,
  isCollaborator,
  isOwner,
} = authz;

/**
 * Route-level permission guard
 * e.g. requirePermission(Permissions.ASSESSMENT_DELETE)
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized: authentication required" });
    }
    if (!hasPermission(user, permission)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: missing required permission ${permission}`,
      });
    }
    next();
  };
}

/**
 * Route-level role hierarchy guard
 * e.g. requireRole(Roles.ADMIN) allows Platform Admin, Super, Admin
 */
function requireRole(minimumRole) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({ success: false, error: "Unauthorized: authentication required" });
    }
    if (!hasRoleAccess(userRole, minimumRole)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: role '${userRole}' does not satisfy minimum role '${minimumRole}'`,
      });
    }
    next();
  };
}

/**
 * Route-level policy evaluation guard
 * e.g. requirePolicy("assessment", "read", req => getAssessment(req.params.id))
 */
function requirePolicy(resourceType, action, getResourceFn) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized: authentication required" });
      }
      const resource = typeof getResourceFn === "function"
        ? await getResourceFn(req)
        : (req[resourceType] || req.params);

      const result = await authorization.check({
        user,
        resource,
        resourceType,
        action,
        context: { req },
      });

      if (!result.granted) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: ${result.reason || "access denied"}`,
          permission: result.permission,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// Export guards & primitives
module.exports.requirePermission = requirePermission;
module.exports.requireRole = requireRole;
module.exports.requirePolicy = requirePolicy;

module.exports.authorization = authorization;
module.exports.Roles = Roles;
module.exports.Permissions = Permissions;
module.exports.ForbiddenError = ForbiddenError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.hasRoleAccess = hasRoleAccess;
module.exports.hasAnyRole = hasAnyRole;
module.exports.isSuperOrPlatformAdmin = isSuperOrPlatformAdmin;
module.exports.isSameOrganization = isSameOrganization;
module.exports.isCollaborator = isCollaborator;
module.exports.isOwner = isOwner;
```

---

### Step 4: Controller Layer Enforcement Pattern (`.require()`)

In controllers, replace ad-hoc checks with the declarative fluent API. When using `.require()`, it automatically throws `ForbiddenError` (403) or `UnauthorizedError` (401) on denial.

```javascript
const { authorization, Roles } = require("@snapsechq/authorization");

static getDetails = catchError(async (req, res) => {
  const token = req.user || parseJwt(req.headers.authorization);

  // 1. Early tenant validation if resource has not been fetched yet
  if (req.params.orgId) {
    await authorization
      .resource({ orgId: req.params.orgId }, "assessment")
      .for(token)
      .require("read");
  }

  // 2. Fetch resource
  const item = await itemService.findById(req.params.id);
  if (!item) {
    return apiResponse.notFoundResponse(res, "Item not found");
  }

  // 3. Complete resource-level policy check
  await authorization
    .resource(item, "assessment")
    .for(token)
    .require("read");

  return apiResponse.successResponseWithData(res, "Operation success", item);
});
```

---

### Step 5: Service Layer Enforcement Pattern (`.can()`)

In service layers where functions return error result objects (e.g. `{ error: "FORBIDDEN" }`) rather than throwing exceptions, use `.can()`:

```javascript
const { authorization, Roles } = require("@snapsechq/authorization");

async function getVulnerabilitiesBySeverity({ assessmentId, orgId, role, email, userId, severity }) {
  // Fetch resource metadata needed for policy evaluation
  const assessment = await Assessments.findOne(
    { _id: assessmentId, orgId },
    { orgId: 1, collaborators: 1 }
  ).lean();

  if (!assessment) {
    return { error: "NOT_FOUND" };
  }

  // Evaluate access via authorization engine
  const access = await authorization
    .resource(assessment, "assessment")
    .for({ orgId, role, email, id: userId, _id: userId })
    .can("read");

  if (!access) {
    return { error: "FORBIDDEN" };
  }

  // Apply role-specific data scoping (e.g. Developers only see assigned items)
  const isDeveloper = String(role || "").toLowerCase() === Roles.DEVELOPER.toLowerCase();
  const developerScope = isDeveloper && email ? { "assignee.email": email } : {};

  const query = { assessmentId, orgId, ...developerScope };
  const items = await Vulnerabilities.find(query).lean();

  return { data: items };
}
```

---

### Step 6: Registering Custom Service Policies

If the microservice manages custom domain models that do not have a built-in policy in core (e.g. `ScanJob`, `AssetGroup`, `CloudAccount`), register a custom policy class:

```javascript
const { defaultPolicyRegistry, BaseResourcePolicy, isSuperOrPlatformAdmin, isSameOrganization } = require("@snapsechq/authorization");

class CloudAccountPolicy extends BaseResourcePolicy {
  async read({ user, resource, context }) {
    if (isSuperOrPlatformAdmin(user)) return true;
    if (!isSameOrganization(user, resource)) return false;
    return true; // All members in the same org can view
  }

  async update({ user, resource, context }) {
    if (isSuperOrPlatformAdmin(user)) return true;
    if (!isSameOrganization(user, resource)) return false;
    // Only Admin and Manager can modify cloud integrations
    return ["Admin", "Manager"].includes(user.role);
  }

  async delete({ user, resource, context }) {
    if (isSuperOrPlatformAdmin(user)) return true;
    if (!isSameOrganization(user, resource)) return false;
    // Only Admin can delete cloud integrations
    return user.role === "Admin";
  }
}

// Register policy with the default registry
defaultPolicyRegistry.register("cloud_account", new CloudAccountPolicy());
```

---

### Step 7: Verification & Testing Checklist

Always verify the migrated service:
1. **Syntax & Dependencies**: Run linting or syntax checks:
   ```bash
   node -c src/middlewares/auth/index.js
   ```
2. **PM2 Service Boot**:
   ```bash
   pm2 restart <service-name>
   pm2 logs <service-name> --lines 40 --nostream
   ```
3. **Authorization Test Scenarios**:
   - **Super/Platform Admin**: Can read/write/delete any resource across any org (`SUPER_ROLE_BYPASS`).
   - **Tenant Isolation**: User in Org A attempting to access resource in Org B receives `403 Forbidden`.
   - **Auditor Restrictions**: Auditor receives `403 Forbidden` on mutation actions (`create`, `update`, `delete`).
   - **Collaborator Scoping**: User added to `collaborators` list can read resource even if not the owner.
   - **Developer Scoping**: Developer only receives resources assigned to them.
