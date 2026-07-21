const amqp = require("amqplib");
const crypto = require("crypto");

class QueueService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.connected = false;

    // Topics for event-driven pipeline
    this.topics = {
      SIGNAL_RECEIVED: "signal.received",
      TELEMETRY_INGESTED: "telemetry.ingested",
      INCIDENT_DETECTED: "incident.detected",
      INCIDENT_ANALYZED: "incident.analyzed",
      DECISION_PROPOSED: "decision.proposed",
      ACTION_APPROVED: "action.approved",
      ACTION_REJECTED: "action.rejected",
      ACTION_EXECUTED: "action.executed",
      ACTION_FAILED: "action.failed",
      AUDIT_EVENTS: "audit.events",
      ALERT_CREATED: "alert.created",
    };

    // Dead-letter exchanges for failed events
    this.dlx = {
      exchange: "dlx.main",
      queue: "dlx.queue",
    };
  }

  /**
   * Connect to RabbitMQ server
   * @param {string} url - RabbitMQ connection URL (default: amqp://localhost)
   */
  async connect(url = process.env.RABBITMQ_URL || "amqp://localhost") {
    try {
      console.log(`[queue] Connecting to ${url}...`);
      
      // Set a timeout for the connection attempt
      const connectionPromise = amqp.connect(url);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RabbitMQ connection timeout")), 2000)
      );

      try {
        this.connection = await Promise.race([connectionPromise, timeoutPromise]);
      } catch (timeoutError) {
        // Connection timed out - this is non-fatal
        console.warn(`[queue] RabbitMQ connection timeout (non-fatal): ${url}`);
        this.connected = false;
        return this;
      }

      this.connection.on("error", (error) => {
        console.warn("[queue] Connection error:", error.message);
        this.connected = false;
      });

      this.connection.on("close", () => {
        console.log("[queue] Connection closed");
        this.connected = false;
      });

      this.channel = await this.connection.createChannel();

      // Set up dead-letter exchange
      await this.channel.assertExchange(this.dlx.exchange, "direct", {
        durable: true,
      });
      await this.channel.assertQueue(this.dlx.queue, {
        durable: true,
        deadLetterExchange: "",
      });
      await this.channel.bindQueue(
        this.dlx.queue,
        this.dlx.exchange,
        "dead-letter"
      );

      this.connected = true;
      console.log("[queue] ✓ Connected to RabbitMQ");
      return this;
    } catch (error) {
      console.warn(`[queue] RabbitMQ connection failed (non-fatal): ${error.message}`);
      // Return with disconnected state - allowing server to continue
      this.connected = false;
      return this;
    }
  }

  /**
   * Publish an event to a topic
   * @param {string} topic - Topic name (use this.topics)
   * @param {object} payload - Event payload
   * @param {object} options - Publication options {tenantId, correlationId, priority}
   */
  async publishEvent(topic, payload, options = {}) {
    if (!this.connected) {
      throw new Error("Queue service not connected");
    }

    try {
      const eventId = crypto.randomUUID();
      const timestamp = Date.now();
      const correlationId = options.correlationId || crypto.randomUUID();

      const message = {
        eventId,
        topic,
        payload,
        tenantId: options.tenantId,
        correlationId,
        timestamp,
        priority: options.priority || 5, // 0-10, higher = more urgent
      };

      const buffer = Buffer.from(JSON.stringify(message));

      // Assert the exchange exists
      await this.channel.assertExchange(topic, "topic", { durable: true });

      const published = this.channel.publish(topic, "", buffer, {
        persistent: true,
        contentType: "application/json",
        headers: {
          "x-event-id": eventId,
          "x-correlation-id": correlationId,
          "x-tenant-id": options.tenantId || "default",
        },
        priority: options.priority || 5,
      });

      // BACKPRESSURE ENFORCEMENT: Fail fast if buffer full
      // Do NOT silently drop messages - this is a data loss risk
      if (!published) {
        throw new Error(
          `[queue] BACKPRESSURE: Publisher buffer full, cannot accept event ${eventId} on topic ${topic}. ` +
          `Please retry or check queue depth. This is intentional - messages must not be silently dropped.`
        );
      }

      console.log(
        `[queue] → ${topic} | eventId=${eventId} | correlationId=${correlationId}`
      );
      return { eventId, correlationId };
    } catch (error) {
      console.error(
        `[queue] Publish error on topic "${topic}":`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Consume events from a topic (handler receives incoming events)
   * @param {string} topic - Topic name
   * @param {function} handler - Async function(message) to process event
   * @param {object} options - Consumption options {queueName, prefetch}
   */
  async consumeEvents(topic, handler, options = {}) {
    if (!this.connected) {
      throw new Error("Queue service not connected");
    }

    try {
      const queueName =
        options.queueName || `queue.${topic}.${Date.now()}`;
      const prefetch = options.prefetch || 1; // Process one message at a time for safety

      // Assert exchange and queue
      await this.channel.assertExchange(topic, "topic", { durable: true });
      await this.channel.assertQueue(queueName, {
        durable: false,
        deadLetterExchange: this.dlx.exchange,
        arguments: {
          "x-message-ttl": 3600000, // 1 hour TTL
        },
      });

      // Bind queue to topic (consume all messages)
      await this.channel.bindQueue(queueName, topic, "#");

      // Set prefetch (how many messages to prefetch before ACK)
      await this.channel.prefetch(prefetch);

      console.log(`[queue] Subscribing to ${topic} via ${queueName}`);

      // Consume messages
      await this.channel.consume(
        queueName,
        async (message) => {
          if (!message) return;

          const eventId = message.properties.headers["x-event-id"];
          const correlationId = message.properties.headers["x-correlation-id"];
          const tenantId = message.properties.headers["x-tenant-id"];

          try {
            const content = JSON.parse(message.content.toString());
            console.log(
              `[queue] ← ${topic} | eventId=${eventId} | correlationId=${correlationId}`
            );

            // Call handler
            await handler({
              eventId,
              correlationId,
              tenantId,
              timestamp: content.timestamp,
              topic,
              payload: content.payload,
              ack: () => this.channel.ack(message),
              nack: (requeue = true) =>
                this.channel.nack(message, false, requeue),
            });
          } catch (error) {
            console.error(
              `[queue] Handler error on ${topic} (eventId=${eventId}):`,
              error.message
            );
            // NACK and requeue on error (max 5 retries before DLX)
            this.channel.nack(message, false, error.retryable !== false);
          }
        },
        { noAck: false }
      );

      return queueName;
    } catch (error) {
      console.error(
        `[queue] Consume error on topic "${topic}":`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Create a durable queue for persistent consumers (e.g., analytics)
   * @param {string} queueName - Unique queue name
   * @param {string} topic - Topic to bind to
   * @param {object} options - {durable, deadLetterExchange}
   */
  async createPersistentQueue(queueName, topic, options = {}) {
    if (!this.connected) {
      throw new Error("Queue service not connected");
    }

    try {
      const durable = options.durable !== false;

      await this.channel.assertExchange(topic, "topic", { durable: true });
      await this.channel.assertQueue(queueName, {
        durable,
        deadLetterExchange: options.deadLetterExchange || this.dlx.exchange,
        arguments: {
          "x-message-ttl": 86400000, // 24 hour TTL
        },
      });

      await this.channel.bindQueue(queueName, topic, "#");

      console.log(`[queue] ✓ Created persistent queue: ${queueName}`);
      return queueName;
    } catch (error) {
      console.error(`[queue] Error creating queue "${queueName}":`, error.message);
      throw error;
    }
  }

  /**
   * Purge a queue (delete all messages)
   * @param {string} queueName - Queue to purge
   */
  async purgeQueue(queueName) {
    if (!this.connected) {
      throw new Error("Queue service not connected");
    }

    try {
      await this.channel.purgeQueue(queueName);
      console.log(`[queue] ✓ Purged ${queueName}`);
    } catch (error) {
      console.error(`[queue] Error purging queue "${queueName}":`, error.message);
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   */
  async getQueueStats(queueName) {
    if (!this.connected) {
      throw new Error("Queue service not connected");
    }

    try {
      const result = await this.channel.checkQueue(queueName);
      return {
        queue: queueName,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
      };
    } catch (error) {
      console.error(
        `[queue] Error getting stats for queue "${queueName}":`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.connected = false;
      console.log("[queue] ✓ Disconnected from RabbitMQ");
    } catch (error) {
      console.error("[queue] Error disconnecting:", error.message);
      throw error;
    }
  }
}

// Singleton instance
let instance = null;
let useMockFallback = false;

async function getQueueService(url) {
  if (useMockFallback) {
    // Return mock service when real service fails
    return require("../../tests/mocks/mockQueueService");
  }
  
  if (!instance) {
    instance = new QueueService();
    await instance.connect(url);
  }
  return instance;
}

/**
 * Set fallback to mock queue service
 * Call this when RabbitMQ connection fails
 */
function setMockFallback() {
  useMockFallback = true;
  instance = null; // Clear the failed instance
}

module.exports = {
  QueueService,
  getQueueService,
  setMockFallback,
};
