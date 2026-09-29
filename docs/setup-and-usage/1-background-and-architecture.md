# 1. Background & Architecture

## The Multi-Service Dilemma

Snapsec's backend architecture comprises between 13 and 17 microservices (including VM, ASM, Auth, WAS, AssetInventory, etc). Historically, each microservice maintained its own copy of:
- JWT parsing, public key reading, and asymmetric RS256 token verification.
- API key validation requests to the central Auth service.
- Inter-service secret verification (`x-service-key`).
- User role definitions, permission mapping, and access check middlewares.

```
       ┌─────────────────────────────────────────────────────────────┐
       │                       HISTORICAL STATE                      │
       ├─────────────────┬─────────────────────────┬─────────────────┤
       │    VM Service   │        ASM Service      │    VS Service   │
       │  - Auth logic   │  - Auth logic (copied)  │  - Auth logic   │
       │  - RBAC logic   │  - RBAC logic (copied)  │  - RBAC logic   │
       │  - Middleware   │  - Middleware (copied)  │  - Middleware   │
       └─────────────────┴─────────────────────────┴─────────────────┘
                                      ▲
                         When refactoring or patching:
                         Must update 13 to 17 codebases!
```

This model produced several critical drawbacks:
1. **Maintenance Bottlenecks**: Any change to token expiration handling, organization licensing, or role schemas required manually touching and redeploying 13+ services.
2. **Logic Drift**: Microservices drifted over time. Different services accepted different header formats, returned inconsistent HTTP error schemas, and handled missing tokens differently.
3. **Security Risks**: Vulnerability fixes applied to one service frequently failed to propagate to other services.

---

## The Snapsec Core Solution

Snapsec Core resolves this issue by consolidating authentication, authorization, and message broker logic into a single, unified npm package published under the `@snapsechq` organization: **`@snapsechq/core`**.

```
                            ┌────────────────────────┐
                            │    @snapsechq/core     │
                            │   (Unified Package)    │
                            └───────────┬────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼                      ▼                      ▼
           Authentication         Authorization             RabbitMQ
       - RS256 JWT Verify      - 3-Layer Engine       - Confirm Channel
       - API Key Validation    - Global RBAC          - Connection Resilience
       - Inter-Service Auth    - Resource Policies    - Consumer Pooling
       - Auth Middlewares      - Fluent Policy API    - Topology Management
                 │                      │                      │
                 └──────────────────────┼──────────────────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               ▼                        ▼                        ▼
       backend/VM Service       backend/ASM Service      backend/VS Service
       - @snapsechq/core        - @snapsechq/core        - @snapsechq/core
       - Zero duplicate auth    - Zero duplicate auth    - Zero duplicate broker
```

1. **Authentication Module**: Responsible for verifying caller identity across four distinct strategies (JWT, API Keys, Internal Service Keys, and Intermediary Gateway headers).
2. **Authorization Module**: Responsible for determining whether an authenticated caller has permission to perform an action on a specific resource using a 3-layer authorization model.
3. **RabbitMQ Module**: Responsible for providing resilient message queuing, confirm publishing, connection retries with exponential backoff, and consumer pool management.

Each microservice installs `@snapsechq/core` as a standard dependency and imports only the modules it needs.

---

[⬅️ Previous: Table of Contents](./0-table-of-contents.md) | [Next: 2. GitHub Packages & .npmrc Setup ➡️](./2-github-packages-and-npmrc.md)
