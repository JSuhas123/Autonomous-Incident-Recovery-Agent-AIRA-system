"use strict";

const AuditEvent =
  require(
    "../../models/AuditEvent"
  );

const crypto =
  require(
    "node:crypto"
  );


const MAX_CHAIN_WRITE_RETRIES =
  5;


const FORBIDDEN_KEYS =
  new Set([
    "password",
    "passwd",
    "passwordhash",

    "secret",
    "clientsecret",
    "apisecret",

    "token",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "bearertoken",
    "csrftoken",

    "authorization",
    "cookie",
    "set-cookie",

    "apikey",
    "api_key",

    "privatekey",
    "private_key",

    "credential",
    "credentials",
  ]);


// ============================================================================
// CANONICALIZATION / REDACTION
// ============================================================================

function isForbiddenKey(
  key
) {
  const normalized =
    String(
      key
    )
      .replace(
        /[^a-z0-9]/gi,
        ""
      )
      .toLowerCase();


  return FORBIDDEN_KEYS
    .has(
      normalized
    );
}


function sanitizeAuditValue(
  value,
  depth =
    0
) {
  if (
    depth >
    10
  ) {
    return "[MAX_DEPTH]";
  }


  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  if (
    Buffer.isBuffer(
      value
    )
  ) {
    return "[BUFFER_REDACTED]";
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (
        item
      ) =>
        sanitizeAuditValue(
          item,
          depth +
            1
        )
    );
  }


  if (
    typeof value ===
      "object"
  ) {
    const output =
      {};


    for (
      const [
        key,
        childValue,
      ]
      of Object.entries(
        value
      )
    ) {
      if (
        isForbiddenKey(
          key
        )
      ) {
        continue;
      }


      output[key] =
        sanitizeAuditValue(
          childValue,
          depth +
            1
        );
    }


    return output;
  }


  if (
    typeof value ===
      "bigint"
  ) {
    return value
      .toString();
  }


  return value;
}


function canonicalize(
  value
) {
  if (
    value ===
      null
  ) {
    return "null";
  }


  if (
    value ===
      undefined
  ) {
    return '"[UNDEFINED]"';
  }


  if (
    value instanceof
    Date
  ) {
    return JSON.stringify(
      value
        .toISOString()
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          (
            item
          ) =>
            canonicalize(
              item
            )
        )
        .join(
          ","
        ) +
      "]"
    );
  }


  if (
    typeof value ===
      "object"
  ) {
    const keys =
      Object.keys(
        value
      )
        .sort();


    return (
      "{" +
      keys
        .map(
          (
            key
          ) =>
            JSON.stringify(
              key
            ) +
            ":" +
            canonicalize(
              value[
                key
              ]
            )
        )
        .join(
          ","
        ) +
      "}"
    );
  }


  if (
    typeof value ===
      "bigint"
  ) {
    return JSON.stringify(
      value
        .toString()
    );
  }


  return JSON.stringify(
    value
  );
}


function timingSafeHexEqual(
  left,
  right
) {
  if (
    typeof left !==
      "string" ||
    typeof right !==
      "string" ||
    !/^[a-f0-9]+$/i
      .test(
        left
      ) ||
    !/^[a-f0-9]+$/i
      .test(
        right
      )
  ) {
    return false;
  }


  const leftBuffer =
    Buffer.from(
      left,
      "hex"
    );


  const rightBuffer =
    Buffer.from(
      right,
      "hex"
    );


  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }


  return crypto
    .timingSafeEqual(
      leftBuffer,
      rightBuffer
    );
}


// ============================================================================
// AUDIT SERVICE
// ============================================================================

class AuditService {
  // ==========================================================================
  // SECRET
  // ==========================================================================

  static _getAuditSecret() {
    const secret =
      process.env
        .AUDIT_SECRET;


    if (
      !secret
    ) {
      throw Object.assign(
        new Error(
          "AUDIT_SECRET is required for audit integrity"
        ),
        {
          code:
            "AUDIT_SECRET_MISSING",

          executionAuthorized:
            false,
        }
      );
    }


    return String(
      secret
    );
  }


  // ==========================================================================
  // IMMUTABLE CONTENT
  // ==========================================================================

  static _immutableContent(
    event
  ) {
    return {
      eventId:
        String(
          event.eventId
        ),

      tenantId:
        String(
          event.tenantId
        ),

      organizationId:
        event.organizationId
          ?.toString?.() ||
        null,

      environmentId:
        event.environmentId
          ?.toString?.() ||
        null,

      chainIndex:
        Number(
          event.chainIndex
        ),

      timestamp:
        event.timestamp instanceof
        Date
          ? event.timestamp
              .toISOString()
          : new Date(
              event.timestamp
            )
              .toISOString(),

      eventType:
        event.eventType,

      principal:
        event.principal,

      principalId:
        event.principalId ||
        null,

      action:
        event.action ||
        null,

      serviceId:
        event.serviceId ||
        null,

      correlationId:
        event.correlationId ||
        null,

      actionDetails:
        sanitizeAuditValue(
          event.actionDetails ||
          null
        ),

      payload:
        sanitizeAuditValue(
          event.payload ||
          null
        ),

      metadata:
        sanitizeAuditValue(
          event.metadata ||
          null
        ),

      previousEventHash:
        event.previousEventHash ||
        null,
    };
  }


  // ==========================================================================
  // CRYPTO
  // ==========================================================================

  static _computeSignature(
    event
  ) {
    const canonical =
      canonicalize(
        this
          ._immutableContent(
            event
          )
      );


    return crypto
      .createHmac(
        "sha256",
        this
          ._getAuditSecret()
      )
      .update(
        canonical,
        "utf8"
      )
      .digest(
        "hex"
      );
  }


  static _computeEventHash(
    event
  ) {
    const data = {
      ...this
        ._immutableContent(
          event
        ),

      signature:
        event.signature,
    };


    return crypto
      .createHash(
        "sha256"
      )
      .update(
        canonicalize(
          data
        ),
        "utf8"
      )
      .digest(
        "hex"
      );
  }


  // ==========================================================================
  // RECORD
  // ==========================================================================

  static async recordEvent(
    tenantId,
    eventType,
    payload,
    context =
      {}
  ) {
    if (
      !tenantId
    ) {
      throw Object.assign(
        new Error(
          "tenantId is required for audit event"
        ),
        {
          code:
            "AUDIT_TENANT_REQUIRED",

          executionAuthorized:
            false,
        }
      );
    }


    for (
      let attempt =
        1;
      attempt <=
        MAX_CHAIN_WRITE_RETRIES;
      attempt++
    ) {
      try {
        const lastEvent =
          await AuditEvent
            .findOne({
              tenantId,
            })
            .sort({
              chainIndex:
                -1,

              timestamp:
                -1,
            });


        const previousEventHash =
          lastEvent
            ?.eventHash ||
          null;


        const chainIndex =
          (
            Number(
              lastEvent
                ?.chainIndex
            ) ||
            0
          ) +
          1;


        const eventId =
          crypto
            .randomUUID();


        const timestamp =
          new Date();


        const safePayload =
          sanitizeAuditValue(
            payload
          );


        const safeMetadata =
          sanitizeAuditValue(
            context
              .metadata ||
            null
          );


        const eventData = {
          eventId,

          tenantId:
            String(
              tenantId
            ),

          organizationId:
            context
              .organizationId ||
            null,

          environmentId:
            context
              .environmentId ||
            null,

          chainIndex,

          timestamp,

          eventType,

          principal:
            context
              .principal ||
            "system",

          principalId:
            context
              .principalId ||
            context
              .userId ||
            "system",

          action:
            context
              .action ||
            null,

          serviceId:
            context
              .serviceId ||
            null,

          actionDetails:
            sanitizeAuditValue(
              context
                .actionDetails ||
              null
            ),

          payload:
            safePayload,

          metadata:
            safeMetadata,

          correlationId:
            context
              .correlationId ||
            crypto
              .randomUUID(),

          previousEventHash,

          status:
            "created",
        };


        eventData.signature =
          this
            ._computeSignature(
              eventData
            );


        eventData.eventHash =
          this
            ._computeEventHash(
              eventData
            );


        const auditEvent =
          new AuditEvent(
            eventData
          );


        await auditEvent
          .save();


        console.log(
          `[audit] ✓ Recorded ${eventType} | eventId=${eventId} | tenant=${tenantId} | chain=${chainIndex}`
        );


        return auditEvent;
      } catch (
        error
      ) {
        /*
         * Two writers can race for the same chainIndex.
         *
         * The unique tenantId+chainIndex index allows one writer
         * to win. The other fetches the new chain tail and retries.
         */
        if (
          error
            ?.code ===
            11000 &&
          attempt <
            MAX_CHAIN_WRITE_RETRIES
        ) {
          continue;
        }


        console.error(
          "[audit] Error recording event:",
          error.message
        );


        if (
          error.executionAuthorized ===
          undefined
        ) {
          error.executionAuthorized =
            false;
        }


        throw error;
      }
    }


    throw Object.assign(
      new Error(
        "Unable to append audit event after concurrent write retries"
      ),
      {
        code:
          "AUDIT_CHAIN_APPEND_CONFLICT",

        retryable:
          true,

        executionAuthorized:
          false,
      }
    );
  }


  // ==========================================================================
  // VERIFY SINGLE EVENT
  // ==========================================================================

  static async verifyEvent(
    event,
    options =
      {}
  ) {
    try {
      if (
        !event
      ) {
        return {
          valid:
            false,

          reason:
            "AUDIT_EVENT_REQUIRED",

          executionAuthorized:
            false,
        };
      }


      const expectedSignature =
        this
          ._computeSignature(
            event
          );


      if (
        !timingSafeHexEqual(
          event.signature,
          expectedSignature
        )
      ) {
        return {
          valid:
            false,

          reason:
            "SIGNATURE_MISMATCH",

          eventId:
            event.eventId,

          executionAuthorized:
            false,
        };
      }


      const expectedEventHash =
        this
          ._computeEventHash(
            event
          );


      if (
        !timingSafeHexEqual(
          event.eventHash,
          expectedEventHash
        )
      ) {
        return {
          valid:
            false,

          reason:
            "EVENT_HASH_MISMATCH",

          eventId:
            event.eventId,

          executionAuthorized:
            false,
        };
      }


      if (
        options
          .verifyPredecessor !==
          false &&
        event
          .previousEventHash
      ) {
        const previousEvent =
          await AuditEvent
            .findOne({
              tenantId:
                event
                  .tenantId,

              eventHash:
                event
                  .previousEventHash,

              chainIndex:
                Number(
                  event
                    .chainIndex
                ) -
                1,
            });


        if (
          !previousEvent
        ) {
          return {
            valid:
              false,

            reason:
              "CHAIN_PREDECESSOR_MISSING",

            eventId:
              event.eventId,

            executionAuthorized:
              false,
          };
        }
      }


      /*
       * Verification is READ-ONLY.
       *
       * We do not mutate event.status because audit events are
       * append-only.
       */
      return {
        valid:
          true,

        eventId:
          event.eventId,

        chainIndex:
          event.chainIndex,

        executionAuthorized:
          false,
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
          error.code ||
          error.message,

        eventId:
          event
            ?.eventId,

        executionAuthorized:
          false,
      };
    }
  }


  // ==========================================================================
  // VERIFY COMPLETE TENANT CHAIN
  // ==========================================================================

  static async verifyAuditIntegrity(
    tenantId
  ) {
    const events =
      await AuditEvent
        .find({
          tenantId,
        })
        .sort({
          chainIndex:
            1,

          timestamp:
            1,
        });


    const verificationResults =
      [];


    let integrityValid =
      true;


    for (
      let index =
        0;
      index <
        events.length;
      index++
    ) {
      const event =
        events[
          index
        ];


      const verification =
        await this
          .verifyEvent(
            event,
            {
              verifyPredecessor:
                false,
            }
          );


      const expectedIndex =
        index ===
          0
          ? Number(
              event
                .chainIndex
            )
          : Number(
              events[
                index -
                1
              ]
                .chainIndex
            ) +
            1;


      const chainIndexValid =
        index ===
          0
          ? Number(
              event
                .chainIndex
            ) >=
            1
          : Number(
              event
                .chainIndex
            ) ===
            expectedIndex;


      const predecessorValid =
        index ===
          0
          ? event
              .previousEventHash ===
            null ||
            event
              .previousEventHash ===
            undefined
          : event
              .previousEventHash ===
            events[
              index -
                1
            ]
              .eventHash;


      const valid =
        verification.valid &&
        chainIndexValid &&
        predecessorValid;


      if (
        !valid
      ) {
        integrityValid =
          false;
      }


      verificationResults
        .push({
          ...verification,

          chainIndexValid,

          predecessorValid,

          valid,
        });
    }


    return {
      tenantId,

      totalEvents:
        events.length,

      integrityValid,

      verificationResults,

      timestamp:
        Date.now(),

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // AUDIT TRAIL
  // ==========================================================================

  static async getAuditTrail(
    tenantId,
    correlationId
  ) {
    const events =
      await AuditEvent
        .find({
          tenantId,

          correlationId,
        })
        .sort({
          chainIndex:
            1,

          timestamp:
            1,
        });


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
        ...event
          .toJSON(),

        verification,
      });
    }


    return verified;
  }


  // ==========================================================================
  // QUERY
  // ==========================================================================

  static async getEventsByType(
    tenantId,
    eventType,
    limit =
      100
  ) {
    const safeLimit =
      Math.min(
        1000,
        Math.max(
          1,
          Number(
            limit
          ) ||
          100
        )
      );


    return AuditEvent
      .find({
        tenantId,

        eventType,
      })
      .sort({
        chainIndex:
          -1,
      })
      .limit(
        safeLimit
      );
  }


  static async exportAuditLog(
    tenantId,
    filters =
      {}
  ) {
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
        query.timestamp.$gte =
          new Date(
            filters.startDate
          );
      }


      if (
        filters.endDate
      ) {
        query.timestamp.$lte =
          new Date(
            filters.endDate
          );
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
        filters
          .correlationId;
    }


    return AuditEvent
      .find(
        query
      )
      .sort({
        chainIndex:
          1,

        timestamp:
          1,
      });
  }


  // ==========================================================================
  // COMPATIBILITY CRYPTO HELPERS
  // ==========================================================================

  static signMessage(
    data,
    secret
  ) {
    if (
      !secret
    ) {
      throw Object.assign(
        new Error(
          "Audit signing secret is required"
        ),
        {
          code:
            "AUDIT_SECRET_MISSING",

          executionAuthorized:
            false,
        }
      );
    }


    return crypto
      .createHmac(
        "sha256",
        String(
          secret
        )
      )
      .update(
        canonicalize(
          sanitizeAuditValue(
            data
          )
        )
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


    const expected =
      this
        .signMessage(
          data,
          secret
        );


    return timingSafeHexEqual(
      signature,
      expected
    );
  }


  static createAuditEntry(
    tenantId,
    userId,
    action,
    resourceId,
    changes,
    secret
  ) {
    const entry = {
      tenantId,

      userId,

      action,

      resourceId,

      changes:
        sanitizeAuditValue(
          changes
        ),

      timestamp:
        Date.now(),
    };


    entry.signature =
      this
        .signMessage(
          entry,
          secret
        );


    return {
      ...entry,

      executionAuthorized:
        false,
    };
  }


  static sanitizeAuditValue(
    value
  ) {
    return sanitizeAuditValue(
      value
    );
  }


  static canonicalize(
    value
  ) {
    return canonicalize(
      value
    );
  }
}


module.exports =
  AuditService;