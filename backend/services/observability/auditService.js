"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  auditRepository,
} =
  require(
    "../../persistence/repositories"
  );

class AuditService {
  // ==========================================================================
  // RECORD
  // ==========================================================================

  static async recordEvent(
    tenantId,
    eventType,
    payload,
    context = {}
  ) {
    try {
      if (
        !tenantId
      ) {
        throw Object.assign(
          new Error(
            "tenantId is required for audit events"
          ),
          {
            code:
              "AUDIT_TENANT_REQUIRED",
          }
        );
      }

      if (
        !eventType
      ) {
        throw Object.assign(
          new Error(
            "eventType is required for audit events"
          ),
          {
            code:
              "AUDIT_EVENT_TYPE_REQUIRED",
          }
        );
      }

      const lastEvent =
        await auditRepository
          .findLatestForTenant(
            tenantId
          );

      const previousEventHash =
        lastEvent
          ? lastEvent.eventHash
          : null;

      const eventId =
        crypto
          .randomUUID();

      const timestamp =
        Date.now();

      const signature =
        this._computeSignature(
          tenantId,
          payload,
          timestamp
        );

      const data = {
        eventId,

        tenantId,

        eventType,

        payload,

        signature,

        previousEventHash,

        principal:
          context.principal ||
          "system",

        principalId:
          context.principalId ||
          context.userId ||
          "system",

        userId:
          context.userId,

        ipAddress:
          context.ipAddress,

        correlationId:
          context.correlationId ||
          crypto
            .randomUUID(),

        timestamp,

        status:
          "created",
      };

      /*
       * Compute the complete custody hash BEFORE persistence.
       *
       * AuditRepository is append-only and intentionally has no update
       * method.
       */
      data.eventHash =
        this._computeEventHash(
          data
        );

      const auditEvent =
        await auditRepository
          .create(
            data
          );

      console.log(
        `[audit] ✓ Recorded ${eventType} | eventId=${eventId} | tenant=${tenantId}`
      );

      return auditEvent;
    } catch (
      error
    ) {
      console.error(
        "[audit] Error recording event:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // SIGNATURE
  // ==========================================================================

  static _computeSignature(
    tenantId,
    payload,
    timestamp
  ) {
    const timestampMs =
      timestamp instanceof
        Date
        ? timestamp.getTime()
        : timestamp;

    const message =
      JSON.stringify(
        payload
      ) +
      tenantId +
      timestampMs;

    const secret =
      process.env
        .AUDIT_SECRET;

    if (
      !secret
    ) {
      throw new Error(
        "AUDIT_SECRET environment variable is not set. Cannot compute audit signature without a secret."
      );
    }

    return crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(
        message
      )
      .digest(
        "hex"
      );
  }

  static _computeEventHash(
    event
  ) {
    const data =
      event.eventId +
      event.tenantId +
      event.eventType +
      JSON.stringify(
        event.payload
      ) +
      event.signature;

    return crypto
      .createHash(
        "sha256"
      )
      .update(
        data
      )
      .digest(
        "hex"
      );
  }

  // ==========================================================================
  // VERIFY ONE
  // ==========================================================================

  static async verifyEvent(
    event
  ) {
    try {
      const expectedSignature =
        this._computeSignature(
          event.tenantId,
          event.payload,
          event.timestamp
        );

      const actualBuffer =
        Buffer.from(
          event.signature ||
          "",
          "utf8"
        );

      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "utf8"
        );

      /*
       * timingSafeEqual throws when lengths differ.
       */
      if (
        actualBuffer.length !==
        expectedBuffer.length
      ) {
        return {
          valid:
            false,

          reason:
            "Signature mismatch",

          eventId:
            event.eventId,
        };
      }

      const signatureValid =
        crypto
          .timingSafeEqual(
            actualBuffer,
            expectedBuffer
          );

      if (
        !signatureValid
      ) {
        console.warn(
          `[audit] Signature mismatch for event ${event.eventId} | tenant=${event.tenantId}`
        );

        return {
          valid:
            false,

          reason:
            "Signature mismatch",

          eventId:
            event.eventId,
        };
      }

      if (
        event.previousEventHash
      ) {
        const previousEvent =
          await auditRepository
            .findOne({
              tenantId:
                event.tenantId,

              eventHash:
                event
                  .previousEventHash,
            });

        if (
          !previousEvent
        ) {
          console.warn(
            `[audit] Chain-of-custody broken for event ${event.eventId}`
          );

          return {
            valid:
              false,

            reason:
              "Chain-of-custody broken",

            eventId:
              event.eventId,
          };
        }
      }

      /*
       * Verification is intentionally READ-ONLY.
       *
       * Previous code changed event.status to "verified", which conflicts
       * with the append-only immutable AuditEvent contract.
       */
      return {
        valid:
          true,

        eventId:
          event.eventId,
      };
    } catch (
      error
    ) {
      console.error(
        "[audit] Error verifying event:",
        error.message
      );

      return {
        valid:
          false,

        reason:
          error.message,

        eventId:
          event?.eventId,
      };
    }
  }

  // ==========================================================================
  // CORRELATION TRAIL
  // ==========================================================================

  static async getAuditTrail(
    tenantId,
    correlationId
  ) {
    try {
      const events =
        await auditRepository
          .list(
            {
              tenantId,

              correlationId,
            },
            {
              sort: {
                timestamp:
                  1,
              },
            }
          );

      console.log(
        `[audit] Retrieved ${events.length} events for correlationId=${correlationId}`
      );

      const verified =
        [];

      for (
        const event
        of events
      ) {
        const verification =
          await this
            .verifyEvent(
              event
            );

        verified.push({
          ...toPlain(
            event
          ),

          verification,
        });
      }

      return verified;
    } catch (
      error
    ) {
      console.error(
        "[audit] Error getting audit trail:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // FULL INTEGRITY
  // ==========================================================================

  static async verifyAuditIntegrity(
    tenantId
  ) {
    try {
      const events =
        await auditRepository
          .list(
            {
              tenantId,
            },
            {
              sort: {
                timestamp:
                  1,
              },
            }
          );

      let integrityValid =
        true;

      const verificationResults =
        [];

      for (
        let index = 0;
        index <
        events.length;
        index +=
          1
      ) {
        const event =
          events[index];

        const verification =
          await this
            .verifyEvent(
              event
            );

        verificationResults
          .push(
            verification
          );

        if (
          !verification.valid
        ) {
          integrityValid =
            false;
        }

        if (
          index >
          0
        ) {
          const previousEvent =
            events[
              index -
              1
            ];

          if (
            event.previousEventHash !==
            previousEvent.eventHash
          ) {
            console.warn(
              `[audit] Chain broken between events ${previousEvent.eventId} → ${event.eventId}`
            );

            integrityValid =
              false;

            verificationResults[
              index
            ].chainValid =
              false;
          } else {
            verificationResults[
              index
            ].chainValid =
              true;
          }
        }
      }

      const report = {
        tenantId,

        totalEvents:
          events.length,

        integrityValid,

        verificationResults,

        timestamp:
          Date.now(),
      };

      console.log(
        `[audit] ✓ Integrity check: ${integrityValid ? "VALID" : "INVALID"} (${events.length} events)`
      );

      return report;
    } catch (
      error
    ) {
      console.error(
        "[audit] Error verifying integrity:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // TYPE QUERY
  // ==========================================================================

  static async getEventsByType(
    tenantId,
    eventType,
    limit = 100
  ) {
    try {
      const events =
        await auditRepository
          .list(
            {
              tenantId,

              eventType,
            },
            {
              sort: {
                timestamp:
                  -1,
              },

              limit,
            }
          );

      console.log(
        `[audit] Retrieved ${events.length} ${eventType} events for tenant=${tenantId}`
      );

      return events;
    } catch (
      error
    ) {
      console.error(
        "[audit] Error getting events by type:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  static async exportAuditLog(
    tenantId,
    filters = {}
  ) {
    try {
      const query = {
        tenantId,
      };

      if (
        filters.startDate ||
        filters.endDate
      ) {
        query.timestamp =
          {};

        if (
          filters.startDate
        ) {
          query
            .timestamp
            .$gte =
            new Date(
              filters.startDate
            )
              .getTime();
        }

        if (
          filters.endDate
        ) {
          query
            .timestamp
            .$lte =
            new Date(
              filters.endDate
            )
              .getTime();
        }
      }

      if (
        filters.eventType
      ) {
        query.eventType =
          filters.eventType;
      }

      if (
        filters.correlationId
      ) {
        query.correlationId =
          filters.correlationId;
      }

      const events =
        await auditRepository
          .list(
            query,
            {
              sort: {
                timestamp:
                  1,
              },
            }
          );

      console.log(
        `[audit] Exported ${events.length} audit events for tenant=${tenantId}`
      );

      return events;
    } catch (
      error
    ) {
      console.error(
        "[audit] Error exporting audit log:",
        error.message
      );

      throw error;
    }
  }

  // ==========================================================================
  // COMPATIBILITY HELPERS
  // ==========================================================================

  static signMessage(
    data,
    secret
  ) {
    const message =
      JSON.stringify(
        data
      );

    return crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(
        message
      )
      .digest(
        "hex"
      );
  }

  static verifySignature(
    data,
    signature,
    secret =
      process.env
        .AUDIT_SECRET
  ) {
    if (
      !signature ||
      !secret
    ) {
      return false;
    }

    const expectedSignature =
      this.signMessage(
        data,
        secret
      );

    const actual =
      Buffer.from(
        signature
      );

    const expected =
      Buffer.from(
        expectedSignature
      );

    if (
      actual.length !==
      expected.length
    ) {
      return false;
    }

    try {
      return crypto
        .timingSafeEqual(
          actual,
          expected
        );
    } catch (
      error
    ) {
      return false;
    }
  }

  static createAuditEntry(
    tenantId,
    userId,
    action,
    resourceId,
    changes,
    secret
  ) {
    const timestamp =
      Date.now();

    const entry = {
      tenantId,

      userId,

      action,

      resourceId,

      changes,

      timestamp,
    };

    entry.signature =
      this.signMessage(
        entry,
        secret
      );

    return entry;
  }
}

function toPlain(
  event
) {
  if (
    event &&
    typeof event.toJSON ===
      "function"
  ) {
    return event
      .toJSON();
  }

  if (
    event &&
    typeof event.toObject ===
      "function"
  ) {
    return event
      .toObject();
  }

  return {
    ...event,
  };
}

module.exports =
  AuditService;