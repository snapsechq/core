# Snapsec Core Architecture & Integration Guide

This documentation provides the complete setup, integration, and architecture guide for the Snapsec Core packages (`@snapsechq/authentication`, `@snapsechq/authorization`, and `@snapsechq/rabbitmq`).

It explains why and how duplicate authentication, authorization, and message broker logic was extracted from 13+ microservices into a centralized, versioned package suite, how to authenticate requests, how to enforce standardized role- and resource-level authorization, and how to orchestrate resilient messaging.

---

## Documentation Topics

The documentation is organized into four dedicated topic directories:

### 1. [Setup and Usage](./setup-and-usage/0-table-of-contents.md)
Contains environment setup, token management, installation instructions, and troubleshooting.
- [1. Background & Architecture](./setup-and-usage/1-background-and-architecture.md): The motivation behind core and the problem of duplicate logic across 13–17 services.
- [2. GitHub Packages & .npmrc Setup](./setup-and-usage/2-github-packages-and-npmrc.md): Generating GitHub PAT tokens, scope selection (`read:packages`), and user `.npmrc` configuration on Windows & Linux.
- [3. Installation & Troubleshooting](./setup-and-usage/3-installation-and-troubleshooting.md): Microservice installation, bypassing Mongoose 5/6 conflicts with `--legacy-peer-deps`, and local `file:` testing workflows.

### 2. [Authentication (@snapsechq/authentication)](./authentication/0-table-of-contents.md)
Covers token verification, authentication strategies, and Express middleware integration.
- [1. Strategies & Execution Flow](./authentication/1-strategies-and-flow.md): The 4 core strategies (`jwt`, `api_key`, `internal`, `intermediary`) and credential evaluation order.
- [2. Service Configuration & Initialization](./authentication/2-service-configuration.md): The `createAuth` factory, configuration options, and migrating legacy microservice middlewares.
- [3. Express Middlewares & Request Context](./authentication/3-express-middlewares-and-context.md): Preconfigured middlewares (`requireAdmin`, `requireWriteAccess`, `requireAuth`), `req.user` decoration, and license expiration handling.

### 3. [Authorization (@snapsechq/authorization)](./authorization/0-table-of-contents.md)
Covers access control, permission matrices, resource policies, and fluent rule checking.
- [1. The 3-Layer Authorization Model](./authorization/1-three-layer-model.md): Identity/Super bypass -> Global RBAC -> Contextual resource policies.
- [2. Fluent API & Engine Usage](./authorization/2-fluent-api-and-engine.md): Enforcing permissions with `.require()`, `.can()`, and `.withContext()`.
- [3. Resource Policies & Custom Rules](./authorization/3-resource-policies-and-custom-rules.md): Built-in policies (`assessment`, `vulnerability`, `asset`), registering custom policies via `PolicyRegistry`, and error handling.

### 4. [RabbitMQ (@snapsechq/rabbitmq)](./rabbitmq/0-table-of-contents.md)
Covers message broker architecture, confirm channels, messaging patterns, connection resilience, and zero-refactoring microservice migration.
- [1. Overview & Architecture](./rabbitmq/1-overview-and-architecture.md): Centralized broker motivations, dedicated confirm channel, consumer channel pooling, and exponential backoff retry logic.
- [2. Messaging Patterns & API](./rabbitmq/2-messaging-patterns-and-api.md): Topic exchange (asynchronous domain events), Direct queue (worker tasks), Fanout broadcast, and URL helper API.
- [3. Service Migration & Adapter Pattern](./rabbitmq/3-service-migration-and-adapter-pattern.md): Zero-refactoring adapter pattern in microservices, preserving 40+ imports, Docker BuildKit secret mount, and PM2 verification.

---

[Next: 1. Setup and Usage ➡️](./setup-and-usage/0-table-of-contents.md)
