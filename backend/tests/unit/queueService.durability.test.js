"use strict";

/**
 * Verifies that AIRA's shared agent queues are always declared as
 * durable, non-exclusive, and non-auto-delete.
 */

const { QueueService } = require("../../services/infrastructure/queueService");

// ── helpers ──────────────────────────────────────────────────────────────────

function makeChannelSpy() {
  const calls = { assertQueue: [] };
  return {
    calls,
    on: jest.fn(),
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn(async (name, opts) => {
      calls.assertQueue.push({ name, opts });
      return {};
    }),
    bindQueue: jest.fn().mockResolvedValue({}),
    prefetch: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue({}),
  };
}

function makeConnectionSpy(channel) {
  return {
    on: jest.fn(),
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue({}),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("QueueService – queue durability", () => {
  let service;
  let channelSpy;

  beforeEach(async () => {
    channelSpy = makeChannelSpy();
    const connSpy = makeConnectionSpy(channelSpy);

    // Bypass actual TCP connection
    const amqp = require("amqplib");
    jest.spyOn(amqp, "connect").mockResolvedValue(connSpy);

    service = new QueueService();
    await service.connect("amqp://test");
  });

  afterEach(() => jest.restoreAllMocks());

  // ── DLX queue ──────────────────────────────────────────────────────────────

  test("dead-letter queue is durable", () => {
    const dlxCall = channelSpy.calls.assertQueue.find((c) =>
      c.name.startsWith("dlx.")
    );
    expect(dlxCall).toBeDefined();
    expect(dlxCall.opts.durable).toBe(true);
  });

  // ── named consumer queues (durable shared workers) ─────────────────────────

  const sharedQueues = [
    { topic: "incident.detected",  queueName: "durable-analysis-agent" },
    { topic: "incident.analyzed",  queueName: "durable-decision-agent" },
    { topic: "action.approved",    queueName: "durable-action-agent"   },
  ];

  test.each(sharedQueues)(
    "named queue '$queueName' is durable, non-exclusive, non-autoDelete",
    async ({ topic, queueName }) => {
      await service.consumeEvents(topic, queueName, jest.fn(), { prefetch: 1 });

      const call = channelSpy.calls.assertQueue.find((c) => c.name === queueName);
      expect(call).toBeDefined();
      expect(call.opts.durable).toBe(true);
      expect(call.opts.exclusive).toBe(false);
      expect(call.opts.autoDelete).toBe(false);
    }
  );

  // ── unnamed (exclusive temp) queues ───────────────────────────────────────

  test("unnamed consumer queue is exclusive and auto-delete (not shared)", async () => {
    await service.consumeEvents("some.topic", jest.fn());

    const call = channelSpy.calls.assertQueue.find(
      (c) => c.name === "queue.some.topic.tmp"
    );
    expect(call).toBeDefined();
    expect(call.opts.durable).toBe(false);
    expect(call.opts.exclusive).toBe(true);
    expect(call.opts.autoDelete).toBe(true);
  });

  // ── never allow the banned pattern ────────────────────────────────────────

  test("no queue is declared with durable:false AND exclusive:false", async () => {
    // Register all three agent queues
    for (const { topic, queueName } of sharedQueues) {
      await service.consumeEvents(topic, queueName, jest.fn(), { prefetch: 1 });
    }

    const banned = channelSpy.calls.assertQueue.filter(
      (c) => c.opts.durable === false && c.opts.exclusive === false
    );
    expect(banned).toHaveLength(0);
  });

  // ── persistent messages ────────────────────────────────────────────────────

  test("publishEvent sends persistent messages", async () => {
    channelSpy.publish = jest.fn().mockReturnValue(true);

    await service.publishEvent("incident.detected", { id: "test-1" });

    const [, , , pubOpts] = channelSpy.publish.mock.calls[0];
    expect(pubOpts.persistent).toBe(true);
  });
});
