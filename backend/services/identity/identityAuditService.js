"use strict";

const crypto =
  require(
    "node:crypto"
  );

const AuthenticationAuditEvent =
  require(
    "../../models/AuthenticationAuditEvent"
  );


const MAX_CHAIN_WRITE_RETRIES =
  5;


const FORBIDDEN_KEYS =
  new Set([
    "password",
    "passwd",
    "passwordhash",

    "secret",
    "apisecret",
    "clientsecret",

    "token",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "bearertoken",
    "csrftoken",

    "authorization",

    "cookie",
    "setcookie",

    "apikey",

    "privatekey",

    "credential",
    "credentials",
  ]);


// ============================================================================
// SANITIZATION
// ============================================================================

function normalizeKey(
  key
) {
  return String(
    key
  )
    .replace(
      /[^a-z0-9]/gi,
      ""
    )
    .toLowerCase();
}


function sanitizeMetadata(
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
        sanitizeMetadata(
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
    const out =
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
        FORBIDDEN_KEYS
          .has(
            normalizeKey(
              key
            )
          )
      ) {
        continue;
      }


      out[key] =
        sanitizeMetadata(
          childValue,
          depth +
            1
        );
    }


    return out;
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


  return JSON.stringify(
    value
  );
}


// ============================================================================
// SIGNING
// ============================================================================

function getAuditSecret() {
  const secret =
    process.env
      .AUTH_AUDIT_SECRET ||
    process.env
      .AUDIT_SECRET;


  if (
    !secret
  ) {
    throw Object.assign(
      new Error(
        "AUTH_AUDIT_SECRET or AUDIT_SECRET is required"
      ),
      {
        code:
          "AUTH_AUDIT_SECRET_MISSING",

        executionAuthorized:
          false,
      }
    );
  }


  return String(
    secret
  );
}


function immutableContent(
  event
) {
  return {
    eventId:
      event.eventId,

    eventType:
      event.eventType,

    outcome:
      event.outcome,

    userId:
      event.userId
        ?.toString?.() ||
      null,

    organizationId:
      event.organizationId
        ?.toString?.() ||
      null,

    sessionId:
      event.sessionId
        ?.toString?.() ||
      null,

    reasonCode:
      event.reasonCode ||
      null,

    requestId:
      event.requestId ||
      null,

    correlationId:
      event.correlationId ||
      null,

    ipHash:
      event.ipHash ||
      null,

    userAgentHash:
      event.userAgentHash ||
      null,

    chainIndex:
      Number(
        event.chainIndex
      ),

    previousEventHash:
      event.previousEventHash ||
      null,

    metadata:
      sanitizeMetadata(
        event.metadata ||
        null
      ),
  };
}


function computeSignature(
  event
) {
  return crypto
    .createHmac(
      "sha256",
      getAuditSecret()
    )
    .update(
      canonicalize(
        immutableContent(
          event
        )
      )
    )
    .digest(
      "hex"
    );
}


function computeEventHash(
  event
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      canonicalize({
        ...immutableContent(
          event
        ),

        signature:
          event.signature,
      })
    )
    .digest(
      "hex"
    );
}


// ============================================================================
// RECORD
// ============================================================================

async function record(
  eventType,
  outcome,
  opts =
    {}
) {
  try {
    for (
      let attempt =
        1;
      attempt <=
        MAX_CHAIN_WRITE_RETRIES;
      attempt++
    ) {
      try {
        const last =
          await AuthenticationAuditEvent
            .findOne({})
            .sort({
              chainIndex:
                -1,

              createdAt:
                -1,
            });


        const eventData = {
          eventId:
            crypto
              .randomUUID(),

          eventType,

          outcome,

          userId:
            opts.userId ||
            null,

          organizationId:
            opts.organizationId ||
            null,

          sessionId:
            opts.sessionId ||
            null,

          reasonCode:
            opts.reasonCode ||
            null,

          requestId:
            opts.requestId ||
            null,

          correlationId:
            opts.correlationId ||
            null,

          ipHash:
            opts.ipHash ||
            null,

          userAgentHash:
            opts.userAgentHash ||
            null,

          metadata:
            opts.metadata
              ? sanitizeMetadata(
                  opts.metadata
                )
              : null,

          chainIndex:
            (
              Number(
                last
                  ?.chainIndex
              ) ||
              0
            ) +
            1,

          previousEventHash:
            last
              ?.eventHash ||
            null,
        };


        eventData.signature =
          computeSignature(
            eventData
          );


        eventData.eventHash =
          computeEventHash(
            eventData
          );


        await AuthenticationAuditEvent
          .create(
            eventData
          );


        return {
          recorded:
            true,

          eventId:
            eventData.eventId,

          chainIndex:
            eventData.chainIndex,

          executionAuthorized:
            false,
        };
      } catch (
        error
      ) {
        if (
          error
            ?.code ===
            11000 &&
          attempt <
            MAX_CHAIN_WRITE_RETRIES
        ) {
          continue;
        }


        throw error;
      }
    }


    throw Object.assign(
      new Error(
        "Unable to append authentication audit event"
      ),
      {
        code:
          "AUTH_AUDIT_CHAIN_APPEND_CONFLICT",

        executionAuthorized:
          false,
      }
    );
  } catch (
    error
  ) {
    /*
     * Authentication remains available even if audit storage
     * temporarily fails.
     *
     * This does NOT manufacture a successful audit record.
     */
    console.error(
      "[identity-audit] Failed to record event:",
      error.message
    );


    return {
      recorded:
        false,

      error:
        error.code ||
        "AUTH_AUDIT_WRITE_FAILED",

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// VERIFY
// ============================================================================

async function verifyIntegrity() {
  try {
    const events =
      await AuthenticationAuditEvent
        .find({})
        .sort({
          chainIndex:
            1,

          createdAt:
            1,
        });


    let valid =
      true;


    const results =
      [];


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


      const signature =
        computeSignature(
          event
        );


      const eventHash =
        computeEventHash(
          event
        );


      const signatureValid =
        event.signature ===
        signature;


      const hashValid =
        event.eventHash ===
        eventHash;


      const chainValid =
        index ===
          0
          ? !event
              .previousEventHash
          : (
              event
                .previousEventHash ===
                events[
                  index -
                    1
                ]
                  .eventHash &&
              Number(
                event
                  .chainIndex
              ) ===
                Number(
                  events[
                    index -
                      1
                  ]
                    .chainIndex
                ) +
                  1
            );


      const eventValid =
        signatureValid &&
        hashValid &&
        chainValid;


      if (
        !eventValid
      ) {
        valid =
          false;
      }


      results.push({
        eventId:
          event.eventId,

        chainIndex:
          event.chainIndex,

        signatureValid,

        hashValid,

        chainValid,

        valid:
          eventValid,
      });
    }


    return {
      valid,

      totalEvents:
        events.length,

      results,

      executionAuthorized:
        false,
    };
  } catch (
    error
  ) {
    return {
      valid:
        false,

      error:
        error.code ||
        error.message,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  record,

  sanitizeMetadata,

  verifyIntegrity,

  computeSignature,

  computeEventHash,
};