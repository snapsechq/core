# 1. Overview & Architecture

## The Problem: Duplicated Messaging Logic

In Snapsec's microservice architecture, multiple backend services (VM, ASM, AssetInventory, Auth, VS, etc) rely heavily on RabbitMQ for asynchronous event streams, background jobs, and worker task distribution.

Previously, each microservice copy-pasted an entire 291-line `RabbitMQ` class into its codebase (e.g. `src/services/rabbitmq.service.js`). This approach created multiple pain points:

1. **Duplicate Reconnection Bugs**: Patches to connection drop handling, socket error cleanup, or backoff delays had to be manually synced across repositories.
2. **Channel Contention**: Without standardized channel pooling, services risked mixing publishing channels with blocking consumer listeners.
3. **Inconsistent Module Support**: Some services used CommonJS (`require`), while others used ES Modules (`import`), leading to diverging implementations.

`@snapsechq/rabbitmq` resolves this by providing a unified, battle-tested broker package inside the `backend/core` monorepo.

---

## Core Broker Architecture

`@snapsechq/rabbitmq` is built on top of `amqplib` and implements an enterprise-grade architecture:

```
                          ┌──────────────────────────┐
                          │    @snapsechq/rabbitmq   │
                          │      createMqBroker()    │
                          └─────────────┬────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │      AMQP Connection Pool     │
                        │    amqp.connect(url, opts)    │
                        └───────────────┬───────────────┘
                                        │
               ┌────────────────────────┴────────────────────────┐
               ▼                                                 ▼
    ┌──────────────────────┐                          ┌──────────────────────┐
    │ Dedicated Publish    │                          │ Consumer Channel Map │
    │ Confirm Channel      │                          │ (Map per consumerTag)│
    └──────────┬───────────┘                          └──────────┬───────────┘
               │                                                 │
               │ createConfirmChannel()                          │ createChannel()
               │ await .publish() / .send()                      │ .prefetch(10)
               ▼                                                 ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                         RabbitMQ Cluster                               │
    │  Exchanges: Direct, Topic, Fanout  |  Queues: Lazy, Durable, Bound     │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## Key Resilience Features

### 1. Dedicated Publish Channel (Confirm Channel)
The broker maintains a dedicated `publishChannel` initialized via `connection.createConfirmChannel()`. This guarantees that message publication never competes with heavy consumer workloads or blocks on long-running unacknowledged message queues.

### 2. Consumer Channel Isolation & Prefetch Throttling
Every consumer subscription (`consume`, `receive`, `intercept`) creates its own isolated AMQP channel (`createConsumerChannel`) tracked in an internal `consumerChannels` map:
- **Prefetch Limit (`10`)**: Constrains unacknowledged messages to prevent worker processes from running out of memory during bursts.
- **Tag Tracking**: Channels are individually indexed by `consumerTag` for clean teardown.

### 3. Exponential Backoff with Jitter
When network interruptions or broker restarts occur:
- The broker does not immediately overwhelm the network with immediate retries.
- It applies an exponential backoff loop (`INITIAL_BACKOFF_MS = 1000`) up to `MAX_RETRIES = 8`.
- A random jitter (`Math.random() * 200`) is added to each interval to prevent thundering herd problems across microservice replicas.

### 4. Automatic Consumer Recovery (`restartConsumers`)
Upon successful reconnection, the broker automatically iterates over its registered consumer registry (`this.consumers`), re-asserts all topic exchanges and queues, re-binds routing keys, and resumes listening without requiring a service restart.

---

[⬅️ Previous: Table of Contents](./0-table-of-contents.md) | [Next: 2. Messaging Patterns & API ➡️](./2-messaging-patterns-and-api.md)
