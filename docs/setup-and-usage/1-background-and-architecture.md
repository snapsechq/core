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

Snapsec Core resolves this issue by isolating authentication and authorization into two standalone, versioned npm packages published under the `@snapsechq` organization:

```
                            ┌────────────────────────┐
                            │      Snapsec Core      │
                            │       (Monorepo)       │
                            └───────────┬────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
     @snapsechq/authentication                     @snapsechq/authorization
     - RS256 JWT Verification                      - 3-Layer Authorization Engine
     - API Key Validation                          - Global Role-Based Access Control
     - Inter-Service Auth                          - Resource Policies (VM, ASM, Asset)
     - Preconfigured Middlewares                   - Fluent Policy Builder API
                 │                                             │
                 └──────────────────────┬──────────────────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               ▼                        ▼                        ▼
       backend/VM Service       backend/ASM Service      backend/VS Service
       - npm dependency         - npm dependency         - npm dependency
       - Zero duplicate auth    - Zero duplicate auth    - Zero duplicate auth
```

1. **`@snapsechq/authentication`**: Responsible for verifying caller identity across four distinct strategies (JWT, API Keys, Internal Service Keys, and Intermediary Gateway headers).
2. **`@snapsechq/authorization`**: Responsible for determining whether an authenticated caller has permission to perform an action on a specific resource using a 3-layer authorization model.

Each microservice installs these packages as standard dependencies and passes its own configuration secrets upon initialization.

---

[⬅️ Previous: Table of Contents](./0-table-of-contents.md) | [Next: 2. GitHub Packages & .npmrc Setup ➡️](./2-github-packages-and-npmrc.md)
