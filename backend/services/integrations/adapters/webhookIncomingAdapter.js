"use strict";

const crypto =
  require("node:crypto");

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "webhook_incoming";

const CAPABILITIES = [
  "receive_events",
  "normalize_events",
];

const SUPPORTED_ALGOS =
  new Set([
    "sha256",
  ]);

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

  async validateConfiguration(
    config = {}
  ) {
    const errors = [];

    if (
      !config ||
      typeof config !==
        "object" ||
      Array.isArray(
        config
      )
    ) {
      errors.push(
        "config must be an object"
      );

      return {
        valid:
          false,

        errors,
      };
    }

    return {
      valid:
        true,

      errors: [],
    };
  },

  async testConnection(
    _connection
  ) {
    return {
      success:
        true,

      latencyMs:
        0,

      detail:
        "Incoming webhook endpoint is ready.",
    };
  },

  async getHealth(
    _connection
  ) {
    return {
      status:
        "healthy",

      detail:
        "Incoming webhook endpoint is available.",
    };
  },

  async receiveEvent(
    connection,
    rawPayload,
    headers = {}
  ) {
    const secret =
      connection
        ?._decryptedSecret;

    if (secret) {
      const signatureHeader =
        headers[
          "x-aira-signature"
        ] ??
        headers[
          "x-hub-signature-256"
        ] ??
        "";

      const [
        algorithm,
        providedSignature,
      ] =
        String(
          signatureHeader
        ).split("=");

      if (
        !SUPPORTED_ALGOS.has(
          algorithm
        )
      ) {
        throw Object.assign(
          new Error(
            "Invalid or missing signature algorithm"
          ),
          {
            status:
              401,

            code:
              "WEBHOOK_SIGNATURE_ALGORITHM_INVALID",
          }
        );
      }

      if (
        !providedSignature
      ) {
        throw Object.assign(
          new Error(
            "Webhook signature is missing"
          ),
          {
            status:
              401,

            code:
              "WEBHOOK_SIGNATURE_MISSING",
          }
        );
      }

      const body =
        typeof rawPayload ===
        "string"
          ? rawPayload
          : JSON.stringify(
              rawPayload
            );

      const expected =
        crypto
          .createHmac(
            "sha256",
            secret
          )
          .update(
            body
          )
          .digest(
            "hex"
          );

      const expectedBuffer =
        Buffer.from(
          expected,
          "utf8"
        );

      const providedBuffer =
        Buffer.from(
          providedSignature,
          "utf8"
        );

      /*
       * timingSafeEqual throws if buffer sizes differ.
       */
      if (
        expectedBuffer.length !==
        providedBuffer.length
      ) {
        throw Object.assign(
          new Error(
            "Signature mismatch"
          ),
          {
            status:
              401,

            code:
              "WEBHOOK_SIGNATURE_MISMATCH",
          }
        );
      }

      if (
        !crypto.timingSafeEqual(
          expectedBuffer,
          providedBuffer
        )
      ) {
        throw Object.assign(
          new Error(
            "Signature mismatch"
          ),
          {
            status:
              401,

            code:
              "WEBHOOK_SIGNATURE_MISMATCH",
          }
        );
      }
    }

    return this
      .normalizeEvent(
        rawPayload
      );
  },

  normalizeEvent(
    rawEvent
  ) {
    const event =
      rawEvent &&
      typeof rawEvent ===
        "object" &&
      !Array.isArray(
        rawEvent
      )
        ? rawEvent
        : {
            value:
              rawEvent,
          };

    return {
      provider:
        PROVIDER,

      eventType:
        event.eventType ??
        event.event_type ??
        "webhook.event",

      title:
        event.title ??
        event.summary ??
        "Incoming webhook event",

      severity:
        normalizeSeverity(
          event.severity
        ),

      service:
        event.service ??
        null,

      status:
        event.status ??
        null,

      labels:
        event.labels ??
        {},

      annotations:
        event.annotations ??
        {},

      rawPayload:
        event,

      receivedAt:
        new Date()
          .toISOString(),
    };
  },

  async revoke() {
    return {
      success:
        true,

      remoteRevocationRequired:
        false,
    };
  },
};

function normalizeSeverity(
  severity
) {
  const value =
    String(
      severity ||
      "info"
    )
      .trim()
      .toLowerCase();

  if (
    [
      "critical",
      "fatal",
      "page",
      "sev1",
      "p1",
    ].includes(
      value
    )
  ) {
    return "critical";
  }

  if (
    [
      "warning",
      "warn",
      "sev2",
      "sev3",
      "p2",
      "p3",
    ].includes(
      value
    )
  ) {
    return "warning";
  }

  return "info";
}

module.exports =
  adapter;