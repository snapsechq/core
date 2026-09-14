# Authorization Guide (@snapsechq/authorization)

This guide covers Snapsec's multi-layer authorization system, how to perform permission checks using the fluent API engine, how to inspect resources against built-in policies, and how to define custom domain rules.

---

## Table of Contents

1. [The 3-Layer Authorization Model](./1-three-layer-model.md)
   - Layer 1: Identity verification & Super Admin universal bypass.
   - Layer 2: Global Role-Based Access Control (RBAC).
   - Layer 3: Contextual Resource-Level Policies.
2. [Fluent API & Engine Usage](./2-fluent-api-and-engine.md)
   - Executing checks with `authorization.resource(...).for(...).require(...)`.
   - Boolean checks using `.can(...)`.
   - Context injection (`.withContext(...)`) and typed error handling (`ForbiddenError`, `UnauthorizedError`).
3. [Resource Policies & Custom Rules](./3-resource-policies-and-custom-rules.md)
   - Built-in policies: `AssessmentPolicy`, `VulnerabilityPolicy`, `AssetPolicy`.
   - Creating custom policies and registering them with `PolicyRegistry`.
   - Express controller error handling integration.

---

[⬅️ Previous: Authentication](../authentication/0-table-of-contents.md) | [Next: 1. The 3-Layer Authorization Model ➡️](./1-three-layer-model.md)
