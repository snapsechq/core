import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("amqplib", () => ({
    default: {
        connect: vi.fn(),
    },
    connect: vi.fn(),
}));

import { RabbitMQ, createMqBroker, buildRabbitmqUrl } from "../src/index.js";

describe("@snapsechq/rabbitmq", () => {
    describe("buildRabbitmqUrl", () => {
        it("returns direct string URL when provided as string", () => {
            const url = buildRabbitmqUrl("amqp://custom-host:5672");
            expect(url).toBe("amqp://custom-host:5672");
        });

        it("returns config.url if provided", () => {
            const url = buildRabbitmqUrl({ url: "amqp://user:pass@remote:5672/vhost" });
            expect(url).toBe("amqp://user:pass@remote:5672/vhost");
        });

        it("builds URL from discrete parameters with defaults", () => {
            const url = buildRabbitmqUrl({
                user: "admin",
                pass: "secret",
                host: "rabbitmq.internal",
                port: 5672,
            });
            expect(url).toBe("amqp://admin:secret@rabbitmq.internal:5672");
        });

        it("handles custom virtual host with leading slash", () => {
            const url = buildRabbitmqUrl({
                user: "app",
                pass: "pwd",
                host: "10.0.0.5",
                port: 5672,
                vhost: "staging",
            });
            expect(url).toBe("amqp://app:pwd@10.0.0.5:5672/staging");
        });

        it("supports amqps protocol", () => {
            const url = buildRabbitmqUrl({
                protocol: "amqps",
                user: "cloud",
                pass: "token",
                host: "rmq.cloud.com",
                port: 5671,
            });
            expect(url).toBe("amqps://cloud:token@rmq.cloud.com:5671");
        });
    });

    describe("RabbitMQ Class and Factory", () => {
        it("creates an instance via createMqBroker with autoConnect: false", () => {
            const broker = createMqBroker({
                url: "amqp://localhost:5672",
                autoConnect: false,
                maxRetries: 5,
                prefetch: 20,
            });

            expect(broker).toBeInstanceOf(RabbitMQ);
            expect(broker.maxRetries).toBe(5);
            expect(broker.prefetch).toBe(20);
            expect(broker.exchangeTypes).toEqual({
                direct: "direct",
                topic: "topic",
                fanout: "fanout",
            });
        });

        it("registers consumers tracking array properly", async () => {
            const broker = createMqBroker({ autoConnect: false });

            // Mock an active connection and channel
            const mockChannel = {
                assertExchange: vi.fn().mockResolvedValue(true),
                assertQueue: vi.fn().mockResolvedValue({ queue: "test-queue" }),
                bindQueue: vi.fn().mockResolvedValue(true),
                consume: vi.fn().mockResolvedValue({ consumerTag: "tag-123" }),
                prefetch: vi.fn().mockResolvedValue(true),
                on: vi.fn(),
            };

            broker.connection = {
                createChannel: vi.fn().mockResolvedValue(mockChannel),
            };

            const callback = vi.fn();
            await broker.consume("test-exchange", "test.key", callback, "test-queue");

            expect(broker.consumers.length).toBe(1);
            expect(broker.consumers[0].method).toBe("consume");
            expect(broker.consumers[0].exchange).toBe("test-exchange");
            expect(broker.consumers[0].queueName).toBe("test-queue");
            expect(broker.consumers[0].consumerTag).toBe("tag-123");
        });

        it("publishes message to topic exchange using publish channel", async () => {
            const broker = createMqBroker({ autoConnect: false });

            const mockPublishChannel = {
                assertExchange: vi.fn().mockResolvedValue(true),
                publish: vi.fn().mockReturnValue(true),
            };
            broker.publishChannel = mockPublishChannel;

            const payload = { eventId: "123", status: "success" };
            await broker.publish("events", "item.created", payload);

            expect(mockPublishChannel.assertExchange).toHaveBeenCalledWith("events", "topic", { durable: true });
            expect(mockPublishChannel.publish).toHaveBeenCalledWith(
                "events",
                "item.created",
                Buffer.from(JSON.stringify(payload)),
                { persistent: true }
            );
        });

        it("sends message directly to queue", async () => {
            const broker = createMqBroker({ autoConnect: false });

            const mockPublishChannel = {
                assertQueue: vi.fn().mockResolvedValue(true),
                sendToQueue: vi.fn().mockReturnValue(true),
            };
            broker.publishChannel = mockPublishChannel;

            const payload = { taskId: "task-abc" };
            await broker.send("task_queue", payload);

            expect(mockPublishChannel.assertQueue).toHaveBeenCalledWith(
                "task_queue",
                expect.objectContaining({ durable: true })
            );
            expect(mockPublishChannel.sendToQueue).toHaveBeenCalledWith(
                "task_queue",
                Buffer.from(JSON.stringify(payload)),
                { persistent: true }
            );
        });

        it("cleans up on close", async () => {
            const broker = createMqBroker({ autoConnect: false });

            const mockPublishChannel = { close: vi.fn().mockResolvedValue(true) };
            const mockConn = { close: vi.fn().mockResolvedValue(true), removeAllListeners: vi.fn() };

            broker.publishChannel = mockPublishChannel;
            broker.connection = mockConn;

            await broker.close();

            expect(broker.isClosing).toBe(true);
            expect(mockPublishChannel.close).toHaveBeenCalled();
            expect(mockConn.close).toHaveBeenCalled();
            expect(broker.publishChannel).toBeNull();
            expect(broker.connection).toBeNull();
        });
    });
});
