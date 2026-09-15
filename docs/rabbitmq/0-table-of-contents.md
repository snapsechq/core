# RabbitMQ Guide (@snapsechq/rabbitmq)

This guide covers Snapsec's centralized RabbitMQ messaging infrastructure, connection resilience, messaging patterns (Topic, Direct, Fanout), and how microservices consume `@snapsechq/rabbitmq` with zero refactoring.

---

## Table of Contents

1. [Overview & Architecture](./1-overview-and-architecture.md)
   - Architectural motivation: eliminating duplicate broker implementations across microservices.
   - Channel management: dedicated confirm publish channel and consumer channel pooling.
   - Resilience: exponential backoff with jitter and automatic consumer recovery.
2. [Messaging Patterns & API](./2-messaging-patterns-and-api.md)
   - Topic Exchange (`publish` / `consume`): asynchronous inter-service domain events.
   - Direct Queues (`send` / `receive`): worker task distribution.
   - Fanout Broadcast (`broadcast` / `intercept`): ephemeral cluster notifications.
   - Connection URL builder and Dual Module support (CommonJS & ESM).
3. [Service Migration & Adapter Pattern](./3-service-migration-and-adapter-pattern.md)
   - Non-breaking adapter pattern: replacing 291 lines of duplicate code with 7 lines.
   - Preserving 40+ existing imports across workers, controllers, and services.
   - Docker BuildKit and PM2 runtime verification.

---

[⬅️ Previous: Authorization](../authorization/0-table-of-contents.md) | [Next: 1. Overview & Architecture ➡️](./1-overview-and-architecture.md)
