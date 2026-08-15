"use strict";

const amqp =
  require(
    "amqplib"
  );

const crypto =
  require(
    "crypto"
  );

// ============================================================================
// HELPERS
// ============================================================================

function redactUrl(
  url
) {
  try {
    const parsed =
      new URL(
        url
      );

    if (
      parsed.password
    ) {
      parsed.password =
        "***";
    }

    if (
      parsed.username
    ) {
      parsed.username =
        "***";
    }

    return parsed
      .toString();
  } catch {
    return "[redacted]";
  }
}

// ============================================================================
// QUEUE SERVICE
// ============================================================================

class QueueService {
  constructor() {
    this.connection =
      null;

    this.channel =
      null;

    this.connected =
      false;

    // ========================================================================
    // CANONICAL EVENT TOPICS
    // ========================================================================

    this.topics =
      Object.freeze({
        // --------------------------------------------------------------------
        // SIGNAL / TELEMETRY
        // --------------------------------------------------------------------

        SIGNAL_RECEIVED:
          "signal.received",

        TELEMETRY_INGESTED:
          "telemetry.ingested",

        // --------------------------------------------------------------------
        // INCIDENT LIFECYCLE
        // --------------------------------------------------------------------

        INCIDENT_DETECTED:
          "incident.detected",
        
         DIAGNOSIS_REQUESTED:
    "diagnosis.requested",

  DIAGNOSIS_COMPLETED:
    "diagnosis.completed",

  DIAGNOSIS_FAILED:
    "diagnosis.failed",
    
        INCIDENT_UPDATED:
          "incident.updated",

        INCIDENT_ACKNOWLEDGED:
          "incident.acknowledged",

        INCIDENT_INVESTIGATING:
          "incident.investigating",

        INCIDENT_RECOVERING:
          "incident.recovering",

        INCIDENT_RESOLVED:
          "incident.resolved",

        INCIDENT_CLOSED:
          "incident.closed",

        INCIDENT_REOPENED:
          "incident.reopened",

        INCIDENT_ASSIGNED:
          "incident.assigned",

        INCIDENT_UNASSIGNED:
          "incident.unassigned",

        INCIDENT_SEVERITY_ESCALATED:
          "incident.severity_escalated",

        // --------------------------------------------------------------------
        // AGENT INTELLIGENCE
        // --------------------------------------------------------------------

        INCIDENT_ANALYZED:
          "incident.analyzed",

        // --------------------------------------------------------------------
        // DECISION
        // --------------------------------------------------------------------

        DECISION_PROPOSED:
          "decision.proposed",

        // --------------------------------------------------------------------
        // APPROVALS
        // --------------------------------------------------------------------

        ACTION_APPROVED:
          "action.approved",

        ACTION_REJECTED:
          "action.rejected",

        // --------------------------------------------------------------------
        // EXECUTION
        // --------------------------------------------------------------------

        ACTION_EXECUTED:
          "action.executed",

        ACTION_FAILED:
          "action.failed",

        // --------------------------------------------------------------------
        // OTHER PLATFORM EVENTS
        // --------------------------------------------------------------------

        AUDIT_EVENTS:
          "audit.events",

        ALERT_CREATED:
          "alert.created",
      });

    // ========================================================================
    // DEAD LETTER
    // ========================================================================

    this.dlx = {
      exchange:
        "dlx.main",

      queue:
        "dlx.queue",
    };
  }

  // ==========================================================================
  // CONNECT
  // ==========================================================================

  async connect(
    url =
      process.env
        .RABBITMQ_URL ||
      "amqp://localhost"
  ) {
    try {
      console.log(
        `[queue] Connecting to ${redactUrl(
          url
        )}...`
      );

      const connectionPromise =
        amqp.connect(
          url
        );

      const timeoutPromise =
        new Promise(
          (
            _,
            reject
          ) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "RabbitMQ connection timeout"
                  )
                ),
              2000
            )
        );

      try {
        this.connection =
          await Promise
            .race([
              connectionPromise,

              timeoutPromise,
            ]);
      } catch (
        timeoutError
      ) {
        console.warn(
          `[queue] RabbitMQ connection timeout (non-fatal): ${redactUrl(
            url
          )}`
        );

        this.connected =
          false;

        return this;
      }

      this.connection
        .on(
          "error",
          (
            error
          ) => {
            console.warn(
              "[queue] Connection error:",
              error.message
            );

            this.connected =
              false;
          }
        );

      this.connection
        .on(
          "close",
          () => {
            console.log(
              "[queue] Connection closed"
            );

            this.connected =
              false;
          }
        );

      this.channel =
        await this
          .connection
          .createChannel();

      this.channel
        .on(
          "close",
          async () => {
            console.warn(
              "[queue] Channel closed; reconnecting..."
            );

            this.connected =
              false;

            try {
              if (
                this.connection
              ) {
                this.channel =
                  await this
                    .connection
                    .createChannel();

                this.connected =
                  true;

                console.log(
                  "[queue] ✓ Channel reconnected"
                );
              }
            } catch (
              error
            ) {
              console.error(
                "[queue] Channel reconnect failed:",
                error.message
              );
            }
          }
        );

      // ======================================================================
      // DLX
      // ======================================================================

      await this
        .channel
        .assertExchange(
          this.dlx
            .exchange,
          "direct",
          {
            durable:
              true,
          }
        );

      await this
        .channel
        .assertQueue(
          this.dlx
            .queue,
          {
            durable:
              true,
          }
        );

      await this
        .channel
        .bindQueue(
          this.dlx
            .queue,
          this.dlx
            .exchange,
          "dead-letter"
        );

      this.connected =
        true;

      console.log(
        "[queue] ✓ Connected to RabbitMQ"
      );

      return this;
    } catch (
      error
    ) {
      console.warn(
        `[queue] RabbitMQ connection failed (non-fatal): ${error.message}`
      );

      this.connected =
        false;

      return this;
    }
  }

  // ==========================================================================
  // PUBLISH
  // ==========================================================================

  async publishEvent(
    topic,
    payload,
    options = {}
  ) {
    if (
      !this.connected ||
      !this.channel
    ) {
      throw Object.assign(
        new Error(
          "Queue service not connected"
        ),
        {
          code:
            "QUEUE_NOT_CONNECTED",
        }
      );
    }

    try {
      const eventId =
        options.eventId ||
        crypto
          .randomUUID();

      const timestamp =
        options.timestamp ||
        Date.now();

      const correlationId =
        options
          .correlationId ||
        crypto
          .randomUUID();

      const priority =
        this
          .normalizePriority(
            options.priority
          );

      const message = {
        eventId,

        topic,

        payload,

        tenantId:
          options
            .tenantId ||
          null,

        organizationId:
          options
            .organizationId ||
          null,

        environmentId:
          options
            .environmentId ||
          null,

        correlationId,

        timestamp,

        priority,

        schemaVersion:
          options
            .schemaVersion ||
          1,
      };

      const buffer =
        Buffer.from(
          JSON.stringify(
            message
          )
        );

      await this
        .channel
        .assertExchange(
          topic,
          "topic",
          {
            durable:
              true,
          }
        );

      const published =
        this
          .channel
          .publish(
            topic,
            "",
            buffer,
            {
              persistent:
                true,

              contentType:
                "application/json",

              contentEncoding:
                "utf-8",

              messageId:
                eventId,

              correlationId,

              timestamp:
                Math.floor(
                  timestamp /
                  1000
                ),

              headers: {
                "x-event-id":
                  eventId,

                "x-correlation-id":
                  correlationId,

                "x-tenant-id":
                  options
                    .tenantId ||
                  "default",

                "x-organization-id":
                  options
                    .organizationId ||
                  "",

                "x-environment-id":
                  options
                    .environmentId ||
                  "",

                "x-schema-version":
                  options
                    .schemaVersion ||
                  1,
              },

              priority,
            }
          );

      /*
       * amqplib returns false when its write buffer has reached
       * the high-water mark.
       *
       * Do not silently drop operational events.
       */
      if (
        !published
      ) {
        throw Object.assign(
          new Error(
            `[queue] BACKPRESSURE: Publisher buffer full for event ${eventId} on topic ${topic}`
          ),
          {
            code:
              "QUEUE_BACKPRESSURE",
          }
        );
      }

      console.log(
        `[queue] → ${topic} | eventId=${eventId} | correlationId=${correlationId}`
      );

      return {
        eventId,

        correlationId,

        timestamp,

        topic,
      };
    } catch (
      error
    ) {
      console.error(
        `[queue] Publish error on topic "${topic}":`,
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // CONSUME
  // ==========================================================================

  async consumeEvents(
    topic,
    queueNameOrHandler,
    handlerOrOptions,
    options = {}
  ) {
    if (
      !this.connected ||
      !this.channel
    ) {
      throw Object.assign(
        new Error(
          "Queue service not connected"
        ),
        {
          code:
            "QUEUE_NOT_CONNECTED",
        }
      );
    }

    let queueName;
    let handler;
    let opts;

    if (
      typeof queueNameOrHandler ===
      "function"
    ) {
      queueName =
        null;

      handler =
        queueNameOrHandler;

      opts =
        handlerOrOptions ||
        {};
    } else {
      queueName =
        queueNameOrHandler;

      handler =
        handlerOrOptions;

      opts =
        options;
    }

    if (
      typeof handler !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Queue consumer handler must be a function"
        ),
        {
          code:
            "QUEUE_HANDLER_REQUIRED",
        }
      );
    }

    try {
      const prefetch =
        Math.max(
          1,
          Number(
            opts.prefetch
          ) ||
          1
        );

      const isDurable =
        Boolean(
          queueName
        );

      const resolvedName =
        queueName ||
        `queue.${topic}.${crypto
          .randomUUID()
          .slice(
            0,
            8
          )}.tmp`;

      await this
        .channel
        .assertExchange(
          topic,
          "topic",
          {
            durable:
              true,
          }
        );

      await this
        .channel
        .assertQueue(
          resolvedName,
          {
            durable:
              isDurable,

            exclusive:
              !isDurable,

            autoDelete:
              !isDurable,

            deadLetterExchange:
              isDurable
                ? this.dlx
                    .exchange
                : undefined,

            deadLetterRoutingKey:
              isDurable
                ? "dead-letter"
                : undefined,

            arguments:
              isDurable
                ? {
                    "x-message-ttl":
                      3600000,
                  }
                : undefined,
          }
        );

      await this
        .channel
        .bindQueue(
          resolvedName,
          topic,
          "#"
        );

      await this
        .channel
        .prefetch(
          prefetch
        );

      console.log(
        `[queue] Subscribing to ${topic} via ${resolvedName}`
      );

      await this
        .channel
        .consume(
          resolvedName,
          async (
            message
          ) => {
            if (
              !message
            ) {
              return;
            }

            const headers =
              message
                .properties
                .headers ||
              {};

            const eventId =
              headers[
                "x-event-id"
              ] ||
              message
                .properties
                .messageId ||
              null;

            const correlationId =
              headers[
                "x-correlation-id"
              ] ||
              message
                .properties
                .correlationId ||
              null;

            const tenantId =
              headers[
                "x-tenant-id"
              ] ||
              null;

            const organizationId =
              headers[
                "x-organization-id"
              ] ||
              null;

            const environmentId =
              headers[
                "x-environment-id"
              ] ||
              null;

            try {
              const content =
                JSON.parse(
                  message
                    .content
                    .toString()
                );

              console.log(
                `[queue] ← ${topic} | eventId=${eventId} | correlationId=${correlationId}`
              );

              let settled =
                false;

              const ack =
                () => {
                  if (
                    settled
                  ) {
                    return;
                  }

                  settled =
                    true;

                  this.channel
                    .ack(
                      message
                    );
                };

              const nack =
                (
                  requeue =
                    true
                ) => {
                  if (
                    settled
                  ) {
                    return;
                  }

                  settled =
                    true;

                  this.channel
                    .nack(
                      message,
                      false,
                      requeue
                    );
                };

              await handler({
                eventId,

                correlationId,

                tenantId,

                organizationId,

                environmentId,

                timestamp:
                  content.timestamp,

                topic,

                payload:
                  content.payload,

                message:
                  content,

                ack,

                nack,
              });

              /*
               * Preserve backwards compatibility:
               *
               * Existing handlers may call ack themselves.
               * New handlers that simply return successfully are
               * automatically acknowledged.
               */
              if (
                !settled
              ) {
                ack();
              }
            } catch (
              error
            ) {
              console.error(
                `[queue] Handler error on ${topic} (eventId=${eventId}):`,
                error.message
              );

              /*
               * retryable === false sends the message to DLX
               * for durable queues.
               */
              const requeue =
                error
                  .retryable !==
                false;

              this.channel
                .nack(
                  message,
                  false,
                  requeue
                );
            }
          },
          {
            noAck:
              false,
          }
        );

      return resolvedName;
    } catch (
      error
    ) {
      console.error(
        `[queue] Consume error on topic "${topic}":`,
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // CREATE PERSISTENT QUEUE
  // ==========================================================================

  async createPersistentQueue(
    queueName,
    topic,
    options = {}
  ) {
    if (
      !this.connected ||
      !this.channel
    ) {
      throw new Error(
        "Queue service not connected"
      );
    }

    try {
      const durable =
        options.durable !==
        false;

      await this
        .channel
        .assertExchange(
          topic,
          "topic",
          {
            durable:
              true,
          }
        );

      await this
        .channel
        .assertQueue(
          queueName,
          {
            durable,

            deadLetterExchange:
              options
                .deadLetterExchange ||
              this.dlx
                .exchange,

            deadLetterRoutingKey:
              "dead-letter",

            arguments: {
              "x-message-ttl":
                options
                  .messageTtlMs ||
                86400000,
            },
          }
        );

      await this
        .channel
        .bindQueue(
          queueName,
          topic,
          "#"
        );

      console.log(
        `[queue] ✓ Created persistent queue: ${queueName}`
      );

      return queueName;
    } catch (
      error
    ) {
      console.error(
        `[queue] Error creating queue "${queueName}":`,
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // PURGE
  // ==========================================================================

  async purgeQueue(
    queueName
  ) {
    if (
      !this.connected ||
      !this.channel
    ) {
      throw new Error(
        "Queue service not connected"
      );
    }

    try {
      await this
        .channel
        .purgeQueue(
          queueName
        );

      console.log(
        `[queue] ✓ Purged ${queueName}`
      );
    } catch (
      error
    ) {
      console.error(
        `[queue] Error purging queue "${queueName}":`,
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  async getQueueStats(
    queueName
  ) {
    if (
      !this.connected ||
      !this.channel
    ) {
      throw new Error(
        "Queue service not connected"
      );
    }

    try {
      const result =
        await this
          .channel
          .checkQueue(
            queueName
          );

      return {
        queue:
          queueName,

        messageCount:
          result
            .messageCount,

        consumerCount:
          result
            .consumerCount,
      };
    } catch (
      error
    ) {
      console.error(
        `[queue] Error getting stats for queue "${queueName}":`,
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // PRIORITY
  // ==========================================================================

  normalizePriority(
    value
  ) {
    const parsed =
      Number(
        value
      );

    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return 5;
    }

    return Math.min(
      10,
      Math.max(
        0,
        Math.round(
          parsed
        )
      )
    );
  }

  // ==========================================================================
  // DISCONNECT
  // ==========================================================================

  async disconnect() {
    try {
      if (
        this.channel
      ) {
        await this
          .channel
          .close();
      }

      if (
        this.connection
      ) {
        await this
          .connection
          .close();
      }

      this.channel =
        null;

      this.connection =
        null;

      this.connected =
        false;

      console.log(
        "[queue] ✓ Disconnected from RabbitMQ"
      );
    } catch (
      error
    ) {
      console.error(
        "[queue] Error disconnecting:",
        error.message
      );

      throw error;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

let useMockFallback =
  false;

// ============================================================================
// MOCK
// ============================================================================

const inMemoryMock = {
  connected:
    false,

  topics:
    {},

  publishEvent:
    async () => ({
      published:
        false,

      reason:
        "MOCK_QUEUE",
    }),

  consumeEvents:
    async () =>
      null,

  createPersistentQueue:
    async () =>
      null,

  purgeQueue:
    async () => {},

  getQueueStats:
    async () => ({
      messageCount:
        0,

      consumerCount:
        0,
    }),

  disconnect:
    async () => {},

  isConnected:
    () =>
      false,
};

// ============================================================================
// GET SINGLETON
// ============================================================================

async function getQueueService(
  url
) {
  if (
    useMockFallback
  ) {
    return inMemoryMock;
  }

  if (
    !instance
  ) {
    instance =
      new QueueService();

    await instance
      .connect(
        url
      );
  }

  return instance;
}

// ============================================================================
// MOCK FALLBACK
// ============================================================================

function setMockFallback() {
  useMockFallback =
    true;

  instance =
    null;
}

function clearMockFallback() {
  useMockFallback =
    false;

  instance =
    null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  QueueService,

  getQueueService,

  setMockFallback,

  clearMockFallback,
};