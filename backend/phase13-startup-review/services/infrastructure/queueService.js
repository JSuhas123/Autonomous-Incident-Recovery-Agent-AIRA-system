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
  constructor(
    options = {}
  ) {
    this.connection =
      null;

    this.channel =
      null;

    this.connected =
      false;


    // ========================================================================
    // PHASE 11.6 — PUBLISHER LOAD PROTECTION
    // ========================================================================

    this.maxInFlightPublishes =
      this.normalizePositiveInteger(
        options.maxInFlightPublishes ??
        process.env
          .QUEUE_MAX_IN_FLIGHT_PUBLISHES,
        100
      );


    this.publishDrainTimeoutMs =
      this.normalizePositiveInteger(
        options.publishDrainTimeoutMs ??
        process.env
          .QUEUE_PUBLISH_DRAIN_TIMEOUT_MS,
        5000
      );


    this.publishRetryAfterMs =
      this.normalizePositiveInteger(
        options.publishRetryAfterMs ??
        process.env
          .QUEUE_PUBLISH_RETRY_AFTER_MS,
        1000
      );


    this.defaultConsumerPrefetch =
      this.normalizePositiveInteger(
        options.defaultConsumerPrefetch ??
        process.env
          .QUEUE_DEFAULT_PREFETCH,
        1
      );


    this.maxConsumerPrefetch =
      this.normalizePositiveInteger(
        options.maxConsumerPrefetch ??
        process.env
          .QUEUE_MAX_PREFETCH,
        100
      );


    this.inFlightPublishes =
      0;

    this.publisherBlocked =
      false;

    this.publisherBlockedUntil =
      0;

    this.backpressureEvents =
      0;

    this.saturationRejects =
      0;

    this.lastBackpressureAt =
      null;


    // ========================================================================
    // CANONICAL EVENT TOPICS
    // ========================================================================

    this.topics =
      Object.freeze({
        SIGNAL_RECEIVED:
          "signal.received",

        TELEMETRY_INGESTED:
          "telemetry.ingested",

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

        INCIDENT_ANALYZED:
          "incident.analyzed",

        DECISION_PROPOSED:
          "decision.proposed",

        ACTION_APPROVED:
          "action.approved",

        ACTION_REJECTED:
          "action.rejected",

        ACTION_EXECUTED:
          "action.executed",

        ACTION_FAILED:
          "action.failed",

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
        error
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

          retryable:
            true,
        }
      );
    }


    // ========================================================================
    // PHASE 11.6 — ADMISSION / SATURATION GUARD
    // ========================================================================

    if (
      this.inFlightPublishes >=
      this.maxInFlightPublishes
    ) {
      this.saturationRejects +=
        1;


      throw Object.assign(
        new Error(
          `Queue publisher saturated: ${this.inFlightPublishes}/${this.maxInFlightPublishes} publishes in flight`
        ),
        {
          code:
            "QUEUE_PUBLISH_SATURATED",

          retryable:
            true,

          retryAfterMs:
            this.publishRetryAfterMs,

          inFlight:
            this.inFlightPublishes,

          maxInFlight:
            this.maxInFlightPublishes,

          executionAuthorized:
            false,
        }
      );
    }


    /*
     * If RabbitMQ previously signalled write-buffer pressure,
     * temporarily reject new publishers until the drain event clears it.
     */
    if (
      this.publisherBlocked &&
      Date.now() <
      this.publisherBlockedUntil
    ) {
      this.saturationRejects +=
        1;


      throw Object.assign(
        new Error(
          "RabbitMQ publisher is applying backpressure"
        ),
        {
          code:
            "QUEUE_PUBLISH_BACKPRESSURE_ACTIVE",

          retryable:
            true,

          retryAfterMs:
            Math.max(
              1,
              this.publisherBlockedUntil -
              Date.now()
            ),

          executionAuthorized:
            false,
        }
      );
    }


    this.inFlightPublishes +=
      1;


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


      /*
       * IMPORTANT:
       *
       * amqplib channel.publish() returning false does NOT mean
       * the message failed.
       *
       * It means the writable buffer reached its high-water mark.
       *
       * The message has already been accepted into the client-side
       * buffer.
       *
       * Retrying this event immediately could therefore cause a
       * duplicate publish.
       */
      const writable =
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


      let backpressured =
        false;


      if (
        writable ===
        false
      ) {
        backpressured =
          true;

        this.backpressureEvents +=
          1;

        this.lastBackpressureAt =
          new Date();

        this.publisherBlocked =
          true;

        this.publisherBlockedUntil =
          Date.now() +
          this.publishDrainTimeoutMs;


        /*
         * Wait for the writable stream to drain.
         *
         * This does NOT republish the current event.
         */
        await this
          .waitForPublisherDrain();
      }


      console.log(
        `[queue] → ${topic} | eventId=${eventId} | correlationId=${correlationId}${
          backpressured
            ? " | backpressure=drained"
            : ""
        }`
      );


      return {
        eventId,

        correlationId,

        timestamp,

        topic,

        backpressured,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      console.error(
        `[queue] Publish error on topic "${topic}":`,
        error.message
      );

      throw error;
    } finally {
      this.inFlightPublishes =
        Math.max(
          0,
          this.inFlightPublishes -
          1
        );
    }
  }


  // ==========================================================================
  // PUBLISHER DRAIN
  // ==========================================================================

  async waitForPublisherDrain() {
    if (
      !this.channel
    ) {
      throw Object.assign(
        new Error(
          "Queue channel unavailable while waiting for publisher drain"
        ),
        {
          code:
            "QUEUE_CHANNEL_UNAVAILABLE",

          retryable:
            true,

          executionAuthorized:
            false,
        }
      );
    }


    /*
     * Some channel mocks/tests may not expose EventEmitter methods.
     */
    if (
      typeof this.channel.once !==
      "function"
    ) {
      this.publisherBlocked =
        false;

      this.publisherBlockedUntil =
        0;

      return {
        drained:
          true,

        simulated:
          true,
      };
    }


    await new Promise(
      (
        resolve,
        reject
      ) => {
        let settled =
          false;


        const finish =
          (
            error =
              null
          ) => {
            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            clearTimeout(
              timer
            );


            if (
              error
            ) {
              reject(
                error
              );
            } else {
              resolve();
            }
          };


        const timer =
          setTimeout(
            () => {
              finish(
                Object.assign(
                  new Error(
                    `RabbitMQ publisher drain timed out after ${this.publishDrainTimeoutMs}ms`
                  ),
                  {
                    code:
                      "QUEUE_BACKPRESSURE_DRAIN_TIMEOUT",

                    retryable:
                      true,

                    retryAfterMs:
                      this.publishRetryAfterMs,

                    executionAuthorized:
                      false,
                  }
                )
              );
            },
            this.publishDrainTimeoutMs
          );


        this.channel
          .once(
            "drain",
            () => {
              this.publisherBlocked =
                false;

              this.publisherBlockedUntil =
                0;

              finish();
            }
          );
      }
    );


    return {
      drained:
        true,
    };
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

          retryable:
            true,
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

          retryable:
            false,
        }
      );
    }


    try {
      /*
       * Phase 11.6 consumer load protection.
       *
       * Consumer-prefetch cannot exceed the configured global cap.
       */
      const requestedPrefetch =
        this.normalizePositiveInteger(
          opts.prefetch,
          this.defaultConsumerPrefetch
        );


      const prefetch =
        Math.min(
          requestedPrefetch,
          this.maxConsumerPrefetch
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
        `[queue] Subscribing to ${topic} via ${resolvedName} prefetch=${prefetch}`
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
      throw Object.assign(
        new Error(
          "Queue service not connected"
        ),
        {
          code:
            "QUEUE_NOT_CONNECTED",

          retryable:
            true,
        }
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
      throw Object.assign(
        new Error(
          "Queue service not connected"
        ),
        {
          code:
            "QUEUE_NOT_CONNECTED",

          retryable:
            true,
        }
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
      throw Object.assign(
        new Error(
          "Queue service not connected"
        ),
        {
          code:
            "QUEUE_NOT_CONNECTED",

          retryable:
            true,
        }
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
  // PHASE 11.6 — LOAD STATUS
  // ==========================================================================

  getLoadStatus() {
    const saturated =
      this.inFlightPublishes >=
      this.maxInFlightPublishes;


    return {
      connected:
        this.connected,

      inFlightPublishes:
        this.inFlightPublishes,

      maxInFlightPublishes:
        this.maxInFlightPublishes,

      saturated,

      publisherBlocked:
        this.publisherBlocked,

      publisherBlockedUntil:
        this.publisherBlockedUntil ||
        null,

      backpressureEvents:
        this.backpressureEvents,

      saturationRejects:
        this.saturationRejects,

      lastBackpressureAt:
        this.lastBackpressureAt,

      publishDrainTimeoutMs:
        this.publishDrainTimeoutMs,

      publishRetryAfterMs:
        this.publishRetryAfterMs,

      defaultConsumerPrefetch:
        this.defaultConsumerPrefetch,

      maxConsumerPrefetch:
        this.maxConsumerPrefetch,

      executionAuthorized:
        false,
    };
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


  normalizePositiveInteger(
    value,
    fallback
  ) {
    const parsed =
      Number(
        value
      );


    if (
      !Number.isFinite(
        parsed
      ) ||
      parsed <=
        0
    ) {
      return fallback;
    }


    return Math.max(
      1,
      Math.floor(
        parsed
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

      this.inFlightPublishes =
        0;

      this.publisherBlocked =
        false;

      this.publisherBlockedUntil =
        0;


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

      executionAuthorized:
        false,
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

  getLoadStatus:
    () => ({
      connected:
        false,

      inFlightPublishes:
        0,

      maxInFlightPublishes:
        0,

      saturated:
        false,

      publisherBlocked:
        false,

      backpressureEvents:
        0,

      saturationRejects:
        0,

      executionAuthorized:
        false,
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