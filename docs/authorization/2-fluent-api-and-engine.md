# 2. Fluent API & Engine Usage

## The Default `authorization` Engine

`@snapsechq/authorization` exports a default singleton instance, `authorization`, that provides a fluent builder syntax for checking and enforcing access control.

```javascript
const { authorization } = require("@snapsechq/authorization");
```

---

## 1. Enforcing Permissions (`require`)

Use `.require(action)` when an unauthorized request must immediately abort. If authorization fails, `.require()` throws a typed error (`ForbiddenError` or `UnauthorizedError`).

```javascript
async function updateVulnerability(req, res, next) {
  try {
    const vulnerability = await Vulnerability.findById(req.params.id);
    if (!vulnerability) {
      return res.status(404).json({ success: false, error: "Vulnerability not found" });
    }

    // Evaluates Super Role -> Global RBAC -> VulnerabilityPolicy
    await authorization
      .resource(vulnerability, "vulnerability")
      .for(req.user)
      .require("update");

    // Access granted: apply mutation
    Object.assign(vulnerability, req.body);
    await vulnerability.save();

    res.json({ success: true, data: vulnerability });
  } catch (err) {
    next(err);
  }
}
```

---

## 2. Boolean Checks (`can`)

Use `.can(action)` when you need a non-throwing check (e.g. to filter UI actions, conditionally return sensitive fields, or filter query results):

```javascript
const canDelete = await authorization
  .resource(vulnerability, "vulnerability")
  .for(req.user)
  .can("delete");

if (canDelete) {
  // Show delete option or execute destructive cleanup
}
```

---

## 3. Passing Runtime Context (`withContext`)

Certain policies require additional context to evaluate state transitions—such as requested status changes, source IP, or assigned team IDs. Pass these through `.withContext()`:

```javascript
await authorization
  .resource(assessment, "assessment")
  .for(req.user)
  .withContext({
    targetStatus: req.body.status, // e.g. "COMPLETED"
    ip: req.ip,
  })
  .require("update");
```

---

## 4. Convenience Methods

The builder provides shorthand convenience methods for standard CRUD actions:

```javascript
const builder = authorization.resource(asset, "asset").for(req.user);

await builder.canRead();    // Alias for builder.can("read")
await builder.canCreate();  // Alias for builder.can("create")
await builder.canUpdate();  // Alias for builder.can("update")
await builder.canDelete();  // Alias for builder.can("delete")
```

---

## 5. Direct Engine Calls

If you prefer direct programmatic invocation without the fluent builder, use the engine's core methods:

```javascript
// Boolean check
const allowed = await authorization.can(req.user, "update", vulnerability);

// Enforce and throw on failure
await authorization.require(req.user, "delete", vulnerability);

// Detailed inspection result
const result = await authorization.check({
  user: req.user,
  resource: vulnerability,
  resourceType: "vulnerability",
  action: "update",
  context: { targetStatus: "RESOLVED" },
});

console.log(result);
// Output:
// {
//   granted: true,
//   reason: "POLICY_ALLOWED",
//   permission: "vulnerability:update",
//   resource: "vulnerability",
//   action: "update"
// }
```

---

[⬅️ Previous: 1. The 3-Layer Authorization Model](./1-three-layer-model.md) | [Next: 3. Resource Policies & Custom Rules ➡️](./3-resource-policies-and-custom-rules.md)
