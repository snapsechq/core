# 2. Messaging Patterns & API

`@snapsechq/rabbitmq` provides a clean, unified API covering the three primary AMQP messaging topologies: **Topic Exchanges**, **Direct Queues**, and **Fanout Broadcasts**.

---

## 1. Topic Exchange (Domain Events)

Used for asynchronous inter-service domain event streaming (such as `vuln.events`, `notification`, `vm`, `asm`).

### Publishing Events (`publish`)
Publishes a JSON payload to a named topic exchange with persistent delivery:

```javascript
await mqbroker.publish("vuln.events", "vuln.enriched", {
  vulnId: "65d8a...",
  severity: "CRITICAL",
  timestamp: new Date().toISOString(),
});
```

### Consuming Events (`consume`)
Subscribes to messages matching a routing key pattern. Messages are automatically parsed from JSON and delivered to the callback. If an uncaught error occurs in the callback, the message is safely rejected (`channel.nack`):

```javascript
await mqbroker.consume(
  "vuln.events",          // Exchange name
  "vuln.*",               // Binding key pattern
  async (data, msg, ch) => {
    console.log("Received vuln event:", data);
    ch.ack(msg);          // Acknowledge after processing
  },
  "vm-vuln-event-queue"   // Queue name
);
```

---

## 2. Direct Queue (Point-to-Point Task Queues)

Used for point-to-point worker task distribution (such as heavyweight background analysis or report compilation).

### Sending Tasks (`send`)
Pushes a message directly to a durable, lazy queue:

```javascript
await mqbroker.send("dashboard_recompute_queue", {
  orgId: "org_123",
  recomputeType: "vulnerability-stats",
});
```

### Receiving Tasks (`receive`)
Listens to a specific point-to-point queue with automatic error handling:

```javascript
await mqbroker.receive("dashboard_recompute_queue", async (data, msg, ch) => {
  await analyticsEngine.recompute(data.orgId);
  ch.ack(msg);
});
```

---

## 3. Fanout Broadcast (Cluster-Wide Notifications)

Used when all running instances of a service or ephemeral worker should receive an identical copy of a broadcast message.

### Broadcasting (`broadcast`)

```javascript
await mqbroker.broadcast("config.reload", { reloadAt: Date.now() });
```

### Intercepting (`intercept`)
Subscribes to a fanout exchange using an auto-generated, transient queue:

```javascript
await mqbroker.intercept("config.reload", async (data, msg, ch) => {
  await configManager.refresh();
  ch.ack(msg);
});
```

---

## 4. Connection Configuration & URL Builder

### `buildRabbitmqUrl`
Constructs a valid AMQP connection string from parameters or environment variables:

```javascript
const { buildRabbitmqUrl } = require("@snapsechq/rabbitmq");

// From discrete config object
const url = buildRabbitmqUrl({
  user: "snapsec",
  pass: "secret",
  host: "rabbitmq.internal",
  port: 5672,
  vhost: "production",
});
// Output: amqp://snapsec:secret@rabbitmq.internal:5672/production

// Fallback to process.env.RABBITMQ_URL or process.env.RABBITMQ_HOST/USER/PASS
const defaultUrl = buildRabbitmqUrl();
```

---

## 5. Dual Module Support (ESM & CommonJS)

The package supports both module standards natively without transpilation issues:

### CommonJS (Node.js / Express Services)
```javascript
const { createMqBroker, mqbroker } = require("@snapsechq/rabbitmq");

const customBroker = createMqBroker({
  url: "amqp://localhost:5672",
  maxRetries: 10,
  prefetch: 15,
});
```

### ES Modules (Modern Services & Tools)
```javascript
import { createMqBroker, mqbroker } from "@snapsechq/rabbitmq";

const customBroker = createMqBroker({
  url: process.env.RABBITMQ_URL,
});
```

---

## 6. Graceful Shutdown

When a service receives a termination signal (`SIGTERM` / `SIGINT`), invoke `close()` to flush uncommitted confirms and close all open channels:

```javascript
process.on("SIGTERM", async () => {
  console.log("Shutting down RabbitMQ broker...");
  await mqbroker.close();
  process.exit(0);
});
```

---

[⬅️ Previous: 1. Overview & Architecture](./1-overview-and-architecture.md) | [Next: 3. Service Migration & Adapter Pattern ➡️](./3-service-migration-and-adapter-pattern.md)
