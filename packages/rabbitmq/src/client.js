import amqp from "amqplib";
import { buildRabbitmqUrl } from "./url.js";

const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;
const DEFAULT_PREFETCH = 10;

/**
 * Enterprise-grade RabbitMQ Client with auto-reconnection, channel pooling, and consumer recovery.
 */
export class RabbitMQ {
    constructor(config = {}) {
        this.config = config;
        this.connection = null;
        this.publishChannel = null; // Dedicated confirm channel for publishing
        this.consumerChannels = new Map(); // Map of consumerTag to dedicated channel
        this.consumers = []; // Store consumer configurations for seamless reconnect restarts
        this.exchangeTypes = {
            direct: "direct",
            topic: "topic",
            fanout: "fanout",
        };

        this.url = buildRabbitmqUrl(config);
        this.reconnectAttempt = 0;
        this.reconnectPromise = null;
        this.maxRetries = config.maxRetries || DEFAULT_MAX_RETRIES;
        this.initialBackoffMs = config.initialBackoffMs || DEFAULT_INITIAL_BACKOFF_MS;
        this.prefetch = config.prefetch || DEFAULT_PREFETCH;
        this.logger = config.logger || console;
        this.isClosing = false;

        // Auto-connect by default unless explicitly disabled (e.g. in unit tests)
        if (config.autoConnect !== false) {
            this.connect().catch((err) => {
                this.logger.error("[RabbitMQ] Initial connection failed:", err.message);
                this.reconnect();
            });
        }
    }

    /**
     * Singleton accessor
     */
    static getInstance(config = {}) {
        if (!RabbitMQ.instance) {
            RabbitMQ.instance = new RabbitMQ(config);
        }
        return RabbitMQ.instance;
    }

    /**
     * Handles disconnections and safely schedules reconnection.
     */
    handleDisconnect() {
        if (this.isClosing) {
            return;
        }

        if (this.connection) {
            try {
                this.connection.removeAllListeners("error");
                this.connection.on("error", () => {});
                this.connection.removeAllListeners("close");
                this.connection.on("close", () => {});
                this.connection.close().catch(() => {});
            } catch (err) {
                // Ignore close errors during disconnect recovery
            }
            this.connection = null;
        }

        this.publishChannel = null;
        this.consumerChannels.clear();
        this.reconnect();
    }

    /**
     * Exponential backoff reconnection loop with jitter.
     */
    reconnect() {
        if (this.isClosing) {
            return Promise.resolve();
        }

        if (this.reconnectPromise) {
            return this.reconnectPromise;
        }

        this.reconnectPromise = (async () => {
            let delay = this.initialBackoffMs;
            while (this.reconnectAttempt < this.maxRetries) {
                if (this.isClosing) return;

                this.reconnectAttempt++;
                this.logger.log(`[RabbitMQ] Connecting to broker (Attempt ${this.reconnectAttempt}/${this.maxRetries})...`);
                try {
                    await this.connect();
                    this.reconnectAttempt = 0;
                    this.reconnectPromise = null;
                    return;
                } catch (err) {
                    this.logger.error(`[RabbitMQ] Connection attempt ${this.reconnectAttempt} failed: ${err.message}`);
                    if (this.reconnectAttempt >= this.maxRetries) {
                        this.logger.error(`[RabbitMQ] Could not establish connection after ${this.maxRetries} attempts.`);
                        this.reconnectPromise = null;
                        if (this.config.exitOnFailure !== false) {
                            process.exit(1);
                        }
                        throw new Error(`RabbitMQ connection failed after ${this.maxRetries} attempts: ${err.message}`);
                    }
                    const jitter = Math.random() * 200;
                    const nextDelay = delay * 2 + jitter;
                    this.logger.log(`[RabbitMQ] Retrying in ${Math.round(nextDelay / 1000)}s...`);
                    await new Promise((resolve) => setTimeout(resolve, nextDelay));
                    delay = nextDelay;
                }
            }
        })();

        return this.reconnectPromise;
    }

    /**
     * Dedicated publish channel initialization (confirm channel).
     */
    async createPublishChannel() {
        if (this.publishChannel) return this.publishChannel;

        this.publishChannel = await this.connection.createConfirmChannel();

        this.publishChannel.on("error", (err) => {
            this.logger.error("[RabbitMQ] Publish channel error:", err.message);
            this.publishChannel = null;
            this.handleDisconnect();
        });

        this.publishChannel.on("close", () => {
            this.logger.log("[RabbitMQ] Publish channel closed");
            this.publishChannel = null;
            this.handleDisconnect();
        });

        return this.publishChannel;
    }

    /**
     * Dedicated channel initialization per consumer with prefetch.
     */
    async createConsumerChannel(consumerTag) {
        const channel = await this.connection.createChannel();
        await channel.prefetch(this.prefetch);

        channel.on("error", (err) => {
            this.logger.error(`[RabbitMQ] Consumer channel error (${consumerTag}):`, err.message);
            this.consumerChannels.delete(consumerTag);
            this.handleDisconnect();
        });

        channel.on("close", () => {
            this.logger.log(`[RabbitMQ] Consumer channel closed (${consumerTag})`);
            this.consumerChannels.delete(consumerTag);
            this.handleDisconnect();
        });

        this.consumerChannels.set(consumerTag, channel);
        return channel;
    }

    /**
     * Establishes AMQP connection and re-attaches publish channel and consumers.
     */
    async connect() {
        if (this.connection && this.publishChannel) return;

        if (this.connection) {
            try {
                this.connection.removeAllListeners("error");
                this.connection.on("error", () => {});
                this.connection.removeAllListeners("close");
                this.connection.on("close", () => {});
                await this.connection.close();
            } catch (err) {
                // Ignore close error
            }
            this.connection = null;
        }

        this.connection = await amqp.connect(this.url);
        this.logger.log("[RabbitMQ] Connection established successfully.");

        this.connection.on("error", (err) => {
            this.logger.error("[RabbitMQ] Connection error:", err.message);
            this.handleDisconnect();
        });

        this.connection.on("close", () => {
            this.logger.warn("[RabbitMQ] Connection lost. Broker will attempt automatic reconnection...");
            this.handleDisconnect();
        });

        await this.createPublishChannel();
        await this.restartConsumers();
    }

    /**
     * Restores all registered consumers after a reconnection.
     */
    async restartConsumers() {
        const consumers = [...this.consumers];
        this.consumers = [];
        this.consumerChannels.clear();
        let i = 0;
        try {
            for (; i < consumers.length; i++) {
                const consumer = consumers[i];
                if (consumer.method === "consume") {
                    await this.consume(consumer.exchange, consumer.bindingKey, consumer.callback, consumer.queueName);
                } else if (consumer.method === "receive") {
                    await this.receive(consumer.queue, consumer.callback);
                } else if (consumer.method === "intercept") {
                    await this.intercept(consumer.exchange, consumer.callback);
                }
            }
        } catch (error) {
            for (let j = i; j < consumers.length; j++) {
                this.consumers.push(consumers[j]);
            }
            throw error;
        }
    }

    /**
     * Direct point-to-point queue publish.
     */
    async send(queue, message, options = {}) {
        if (!this.publishChannel) {
            await this.reconnect();
        }
        await this._assertQueue(
            queue,
            this.exchangeTypes.direct,
            { durable: true, arguments: { "x-queue-mode": "lazy" }, ...options },
            this.publishChannel
        );
        return this.publishChannel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
    }

    /**
     * Topic exchange publish.
     */
    async publish(exchange, routingKey, message, options = {}) {
        if (!this.publishChannel) {
            await this.reconnect();
        }
        await this._assertExchange(exchange, this.exchangeTypes.topic, { durable: true, ...options }, this.publishChannel);
        return this.publishChannel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), { persistent: true });
    }

    /**
     * Consume messages from a topic exchange queue.
     */
    async consume(exchange, bindingKey, callback, queueName = "", options = {}) {
        if (!this.connection) {
            await this.reconnect();
        }
        const channel = await this.createConsumerChannel(`consume-${exchange}-${queueName}`);
        await this._assertExchange(exchange, this.exchangeTypes.topic, { durable: true }, channel);
        const queue = await channel.assertQueue(queueName, {
            durable: true,
            arguments: { "x-queue-mode": "lazy" },
            ...options,
        });
        await channel.bindQueue(queue.queue, exchange, bindingKey);
        const { consumerTag } = await channel.consume(
            queue.queue,
            (msg) => {
                if (!msg) return;
                try {
                    const content = msg.content.toString();
                    const parsed = JSON.parse(content);
                    callback(parsed, msg, channel);
                } catch (err) {
                    this.logger.error(`[RabbitMQ] Consumer error (consume, ${queue.queue}):`, err.message);
                    channel.nack(msg, false, false);
                }
            },
            { noAck: false }
        );
        this.consumers.push({ method: "consume", exchange, bindingKey, callback, queueName, consumerTag });
        return { consumerTag, channel };
    }

    /**
     * Direct point-to-point queue consumer.
     */
    async receive(queue, callback, options = {}) {
        if (!this.connection) {
            await this.reconnect();
        }
        const channel = await this.createConsumerChannel(`receive-${queue}`);
        await this._assertQueue(
            queue,
            this.exchangeTypes.direct,
            { durable: true, arguments: { "x-queue-mode": "lazy" }, ...options },
            channel
        );
        const { consumerTag } = await channel.consume(
            queue,
            (msg) => {
                if (!msg) return;
                try {
                    const content = msg.content.toString();
                    const parsed = JSON.parse(content);
                    callback(parsed, msg, channel);
                } catch (err) {
                    this.logger.error(`[RabbitMQ] Consumer error (receive, ${queue}):`, err.message);
                    channel.nack(msg, false, false);
                }
            },
            { noAck: false }
        );
        this.consumers.push({ method: "receive", queue, callback, consumerTag });
        return { consumerTag, channel };
    }

    /**
     * Fanout broadcast publish to all subscribers.
     */
    async broadcast(exchange, message, options = {}) {
        if (!this.publishChannel) {
            await this.reconnect();
        }
        await this._assertExchange(exchange, this.exchangeTypes.fanout, { durable: true, ...options }, this.publishChannel);
        return this.publishChannel.publish(exchange, "", Buffer.from(JSON.stringify(message)), { persistent: true });
    }

    /**
     * Fanout broadcast listener using a transient queue.
     */
    async intercept(exchange, callback, options = {}) {
        if (!this.connection) {
            await this.reconnect();
        }
        const channel = await this.createConsumerChannel(`intercept-${exchange}`);
        await this._assertExchange(exchange, this.exchangeTypes.fanout, { durable: true }, channel);
        const queue = await channel.assertQueue("", {
            durable: true,
            arguments: { "x-queue-mode": "lazy" },
            ...options,
        });
        await channel.bindQueue(queue.queue, exchange, "");
        const { consumerTag } = await channel.consume(
            queue.queue,
            (msg) => {
                if (!msg) return;
                try {
                    const content = msg.content.toString();
                    const parsed = JSON.parse(content);
                    callback(parsed, msg, channel);
                } catch (err) {
                    this.logger.error(`[RabbitMQ] Consumer error (intercept, ${exchange}):`, err.message);
                    channel.nack(msg, false, false);
                }
            },
            { noAck: false }
        );
        this.consumers.push({ method: "intercept", exchange, callback, consumerTag });
        return { consumerTag, channel };
    }

    /**
     * Clean disconnect and graceful shutdown.
     */
    async close() {
        this.isClosing = true;
        this.reconnectPromise = null;

        for (const [tag, channel] of this.consumerChannels.entries()) {
            try {
                await channel.close();
            } catch (err) {
                // Ignore channel close error
            }
        }
        this.consumerChannels.clear();

        if (this.publishChannel) {
            try {
                await this.publishChannel.close();
            } catch (err) {
                // Ignore publish channel close error
            }
            this.publishChannel = null;
        }

        if (this.connection) {
            try {
                this.connection.removeAllListeners();
                await this.connection.close();
            } catch (err) {
                // Ignore connection close error
            }
            this.connection = null;
        }
    }

    async _assertQueue(queue, type, options, channel) {
        if (!channel) {
            throw new Error("Channel is not initialized.");
        }
        await channel.assertQueue(queue, options);
    }

    async _assertExchange(exchange, type, options, channel) {
        if (!channel) {
            throw new Error("Channel is not initialized.");
        }
        await channel.assertExchange(exchange, type, options);
    }
}

/**
 * Factory function to create a configured RabbitMQ broker instance.
 */
export function createMqBroker(config = {}) {
    return new RabbitMQ(config);
}

/**
 * Default lazy singleton instance
 */
let defaultInstance = null;
export const mqbroker = new Proxy({}, {
    get(target, prop) {
        if (!defaultInstance) {
            defaultInstance = RabbitMQ.getInstance();
        }
        const val = defaultInstance[prop];
        return typeof val === "function" ? val.bind(defaultInstance) : val;
    }
});
