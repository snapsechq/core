# 1. Strategies & Execution Flow

## Overview

`@snapsechq/authentication` provides a strategy-driven authentication pipeline. Rather than having disparate authentication logic scattered across microservices, incoming requests are evaluated through standardized strategy handlers.

```
                      Incoming Request
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Authorization Header]             [x-service-key Header]
            │                                 │
   ┌────────┴────────┐                        │
   ▼                 ▼                        ▼
 [JWT Strategy]  [API Key Strategy]   [Internal Strategy]
   │                 │                        │
   └────────┬────────┴────────────────────────┘
            ▼
   ┌─────────────────┐
   │ Success Context │  ──> Attach to req.user / req.auth
   └─────────────────┘
```

---

## Supported Strategies

### 1. JWT Strategy (`jwt`)
- **Trigger**: `Authorization: Bearer <jwt-token>`
- **Mechanism**: Validates asymmetric RSA RS256 signatures using the Auth service public key (`jwtRS256.key.pub`).
- **Verifications**:
  - Token expiration (`exp`).
  - Active tenant/organization membership.
  - License status: Checks if the organization license is active and unexpired. If expired, raises a specific `LICENSE_EXPIRED` error.
- **Output**: Attaches the decoded user profile to `req.user`.

### 2. API Key Strategy (`api_key`)
- **Trigger**: `Authorization: Bearer <api-key>` or `x-api-key: <api-key>`
- **Mechanism**: Used by automation, CLI tools, and CI/CD integrations. Delegates validation via HTTP POST to the central Auth service endpoint (`/api/v1/auth/validate-api-key`).
- **Caching**: Employs short-lived in-memory caching to avoid round-trip performance bottlenecks on repeated requests.

### 3. Internal Strategy (`internal`)
- **Trigger**: `x-service-key: <key>` header or query parameter
- **Mechanism**: Designed for trusted inter-service communication (e.g., Scanner communicating with VM, or ASM calling Notification service).
- **Behavior**: Compares the incoming key against the microservice's `SERVICE_KEY` secret. Bypasses user-level token checks and marks `req.service_req = true` and `req.user.role = "InternalService"`.

### 4. Intermediary Gateway Strategy (`intermediary`)
- **Trigger**: `x-user-id`, `x-user-role`, `x-org-id` with gateway signature.
- **Mechanism**: Used when an API Gateway performs initial auth termination and forwards pre-authenticated user metadata with a shared gateway secret.

---

## Strategy Chaining & Fast-Fail

When a middleware specifies multiple modes (such as `mode: ["internal", "jwt", "api_key"]`):

1. **Sequential Evaluation**: The engine tests each strategy in the order specified.
2. **Missing vs. Invalid Credentials**:
   - If a strategy finds its corresponding credentials **missing** (e.g. no `x-service-key` header present), it quietly skips and yields to the next strategy in the list.
   - If credentials **are provided but invalid or expired** (e.g., a malformed or expired JWT token), the chain halts immediately (fast-fail) and returns an HTTP 401 Unauthorized error. It does not fall back to other strategies.
3. **Success**: Once a strategy successfully authenticates the caller, execution continues to role verification and route handlers.

---

[⬅️ Previous: Table of Contents](./0-table-of-contents.md) | [Next: 2. Service Configuration & Initialization ➡️](./2-service-configuration.md)
