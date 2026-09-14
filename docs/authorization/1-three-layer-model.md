# 1. The 3-Layer Authorization Model

## Architectural Overview

Snapsec separates identity authentication from authorization decisions. While authentication validates *who* is making the request, authorization determines *whether* that identity has permission to perform a specific action on a specific resource.

To provide both performance and granular security, `@snapsechq/authorization` uses a three-layer evaluation pipeline:

```
                    Incoming Authorization Request
                    authorization.resource(entity)
                       .for(user).require(action)
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │        LAYER 1: Identity & Super Role Bypass        │
        └──────────────────────────┬──────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                 Is Super?                     Not Super
                    │                             │
                    ▼                             ▼
              [Allow Access]     ┌──────────────────────────────────┐
                                 │   LAYER 2: Global RBAC Check     │
                                 └────────────────┬─────────────────┘
                                                  │
                                   ┌──────────────┴──────────────┐
                             Role Has Perm?               Role Lacks Perm
                                   │                             │
                                   ▼                             ▼
              ┌──────────────────────────────────────────┐ [Deny: 403 Forbidden]
              │      LAYER 3: Contextual Resource Policy  │
              └────────────────────┬─────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
             Policy Passes                 Policy Fails
                    │                             │
                    ▼                             ▼
              [Allow Access]              [Deny: 403 Forbidden]
```

---

## The Three Layers in Detail

### Layer 1: Identity & Super Role Bypass
- **Purpose**: Fast-path execution for universal platform administrators.
- **Rules**:
  - If no user context exists: Denied with `UNAUTHENTICATED`.
  - If the user holds the `Super` or `Platform Admin` role: Immediately granted with `SUPER_ROLE_BYPASS`. No further RBAC or policy checks are necessary.

### Layer 2: Global Role-Based Access Control (RBAC)
- **Purpose**: Broad coarse-grained capability checks before executing expensive database or resource inspections.
- **Rules**:
  - Compares the user's role against the action permission key (`resourceType:action`, e.g. `vulnerability:delete` or `assessment:update`).
  - Roles like `Auditor` are restricted from all write/delete actions at this layer, preventing unnecessary policy evaluation.

### Layer 3: Contextual Resource-Level Policies
- **Purpose**: Fine-grained contextual rules based on the state and attributes of the target entity.
- **Rules**:
  - **Tenant Isolation**: Ensures `resource.orgId === user.currentOrgId`.
  - **Ownership & Assignment**: Grants `Developer` permissions to edit items specifically assigned to them, while preventing them from editing unassigned items.
  - **State Guardrails**: Prevents modifications to frozen, archived, or locked entities (e.g. completed assessments).

---

[⬅️ Previous: Table of Contents](./0-table-of-contents.md) | [Next: 2. Fluent API & Engine Usage ➡️](./2-fluent-api-and-engine.md)
