"use strict";

const crypto =
  require("node:crypto");

const https =
  require("node:https");

const http =
  require("node:http");

const {
  URL,
} =
  require("node:url");

const {
  makeStubAdapter,
} =
  require(
    "../adapterInterface"
  );

const {
  assertSafeHost,
} =
  require(
    "../../../utils/ssrfGuard"
  );

const PROVIDER =
  "webhook_outgoing";

const CAPABILITIES = [
  "send_notifications",
];

const METHOD_ALLOW =
  new Set([
    "POST",
    "PUT",
    "PATCH",
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
      return {
        valid:
          false,

        errors: [
          "config must be an object",
        ],
      };
    }

    if (
      !config.targetUrl
    ) {
      errors.push(
        "targetUrl is required"
      );
    } else {
      try {
        const url =
          new URL(
            config.targetUrl
          );

        if (
          ![
            "http:",
            "https:",
          ].includes(
            url.protocol
          )
        ) {
          errors.push(
            "targetUrl must use http or https"
          );
        }

        try {
          assertSafeHost(
            url.hostname
          );
        } catch (
          error
        ) {
          errors.push(
            error.message ||
            "targetUrl points to an unsafe host"
          );
        }
      } catch {
        errors.push(
          "targetUrl is not a valid URL"
        );
      }
    }

    if (
      config.method &&
      !METHOD_ALLOW.has(
        String(
          config.method
        ).toUpperCase()
      )
    ) {
      errors.push(
        "method must be POST, PUT, or PATCH"
      );
    }

    if (
      config.customHeaders !==
        undefined &&
      (
        !config.customHeaders ||
        typeof config.customHeaders !==
          "object" ||
        Array.isArray(
          config.customHeaders
        )
      )
    ) {
      errors.push(
        "customHeaders must be an object"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  },

  async testConnection(
    connection
  ) {
    const {
      targetUrl,
    } =
      connection
        .nonSecretConfig ??
      {};

    if (!targetUrl) {
      return {
        success:
          false,

        detail:
          "No targetUrl configured",
      };
    }

    try {
      const startedAt =
        Date.now();

      const response =
        await post(
          targetUrl,
          {
            test:
              true,

            source:
              "aira",

            timestamp:
              new Date()
                .toISOString(),
          },
          connection
        );

      return {
        success:
          true,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          `Webhook endpoint returned HTTP ${response.statusCode}`,
      };
    } catch (
      error
    ) {
      return {
        success:
          false,

        detail:
          error.message,
      };
    }
  },

  async getHealth(
    connection
  ) {
    const result =
      await this
        .testConnection(
          connection
        );

    return {
      status:
        result.success
          ? "healthy"
          : "unhealthy",

      latencyMs:
        result.latencyMs ??
        null,

      detail:
        result.detail,
    };
  },

  async sendNotification(
    connection,
    notification
  ) {
    const {
      targetUrl,
    } =
      connection
        .nonSecretConfig ??
      {};

    if (!targetUrl) {
      throw Object.assign(
        new Error(
          "No targetUrl configured"
        ),
        {
          code:
            "WEBHOOK_TARGET_URL_MISSING",
        }
      );
    }

    const result =
      await post(
        targetUrl,
        notification,
        connection
      );

    return {
      success:
        true,

      statusCode:
        result.statusCode,
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

async function post(
  targetUrl,
  body,
  connection
) {
  const {
    customHeaders = {},
    method = "POST",
  } =
    connection
      .nonSecretConfig ??
    {};

  const parsed =
    new URL(
      targetUrl
    );

  assertSafeHost(
    parsed.hostname
  );

  const normalizedMethod =
    String(
      method
    ).toUpperCase();

  if (
    !METHOD_ALLOW.has(
      normalizedMethod
    )
  ) {
    throw Object.assign(
      new Error(
        "Unsupported webhook method"
      ),
      {
        code:
          "WEBHOOK_METHOD_NOT_ALLOWED",
      }
    );
  }

  const payload =
    JSON.stringify(
      body
    );

  const headers = {
    "Content-Type":
      "application/json",

    "Content-Length":
      Buffer.byteLength(
        payload
      ),

    ...customHeaders,
  };

  /*
   * Never permit user-configured secret/auth headers
   * through nonSecretConfig.
   */
  for (
    const key
    of Object.keys(
      headers
    )
  ) {
    if (
      /authorization|cookie|proxy-authorization|x-api-key|api-key/i.test(
        key
      )
    ) {
      delete headers[
        key
      ];
    }
  }

  const secret =
    connection
      ?._decryptedSecret;

  if (secret) {
    const signature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          payload
        )
        .digest(
          "hex"
        );

    headers[
      "X-AIRA-Signature"
    ] =
      `sha256=${signature}`;
  }

  const transport =
    parsed.protocol ===
    "https:"
      ? https
      : http;

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const request =
        transport.request(
          {
            protocol:
              parsed.protocol,

            hostname:
              parsed.hostname,

            port:
              parsed.port ||
              (
                parsed.protocol ===
                "https:"
                  ? 443
                  : 80
              ),

            path:
              `${parsed.pathname}${parsed.search}`,

            method:
              normalizedMethod,

            headers,
          },
          (response) => {
            let responseBytes =
              0;

            response.on(
              "data",
              (chunk) => {
                responseBytes +=
                  chunk.length;

                /*
                 * Never allow a webhook test/notification to
                 * buffer an unlimited remote response.
                 */
                if (
                  responseBytes >
                  1024 *
                    1024
                ) {
                  response.destroy(
                    new Error(
                      "Webhook response exceeded maximum size"
                    )
                  );
                }
              }
            );

            response.on(
              "end",
              () => {
                const statusCode =
                  response
                    .statusCode ??
                  0;

                if (
                  statusCode <
                    200 ||
                  statusCode >=
                    300
                ) {
                  return reject(
                    Object.assign(
                      new Error(
                        `HTTP ${statusCode}`
                      ),
                      {
                        statusCode,

                        code:
                          "WEBHOOK_REMOTE_ERROR",
                      }
                    )
                  );
                }

                return resolve({
                  statusCode,
                });
              }
            );
          }
        );

      request.on(
        "error",
        reject
      );

      request.setTimeout(
        10000,
        () => {
          request.destroy(
            Object.assign(
              new Error(
                "Request timed out"
              ),
              {
                code:
                  "WEBHOOK_REQUEST_TIMEOUT",
              }
            )
          );
        }
      );

      request.write(
        payload
      );

      request.end();
    }
  );
}

module.exports =
  adapter;