"use strict";

const crypto =
  require(
    "node:crypto"
  );

const https =
  require(
    "node:https"
  );

const http =
  require(
    "node:http"
  );

const {
  URL,
} =
  require(
    "node:url"
  );

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


const LOOPBACK_HOSTS =
  new Set([
    "localhost",
    "127.0.0.1",
    "::1",
  ]);


// ============================================================================
// ADAPTER
// ============================================================================

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),


  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

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
        } else {
          try {
            await assertTargetAllowed(
              url,
              {
                nonSecretConfig:
                  config,

                metadata: {
                  reliabilityLab:
                    config
                      .reliabilityLab ===
                    true,

                  safetyClass:
                    config
                      .safetyClass ||
                    null,

                  production:
                    false,
                },
              }
            );
          } catch (
            error
          ) {
            errors.push(
              error.message ||
              "targetUrl points to an unsafe host"
            );
          }
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


  // ==========================================================================
  // CONNECTION TEST
  // ==========================================================================

  async testConnection(
    connection
  ) {
    const {
      targetUrl,
    } =
      connection
        ?.nonSecretConfig ??
      {};


    if (!targetUrl) {
      return {
        success:
          false,

        provider:
          PROVIDER,

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

            phase:
              "21.10B",

            timestamp:
              new Date()
                .toISOString(),
          },

          connection
        );


      return {
        success:
          true,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          `Webhook endpoint returned HTTP ${response.statusCode}`,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      return {
        success:
          false,

        provider:
          PROVIDER,

        latencyMs:
          null,

        detail:
          error.message,

        code:
          error.code ||
          "WEBHOOK_CONNECTION_FAILED",

        executionAuthorized:
          false,
      };
    }
  },


  // ==========================================================================
  // HEALTH
  // ==========================================================================

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

      executionAuthorized:
        false,
    };
  },


  // ==========================================================================
  // NOTIFICATION
  // ==========================================================================

  async sendNotification(
    connection,
    notification
  ) {
    const {
      targetUrl,
    } =
      connection
        ?.nonSecretConfig ??
      {};


    if (!targetUrl) {
      throw Object.assign(
        new Error(
          "No targetUrl configured"
        ),

        {
          code:
            "WEBHOOK_TARGET_URL_MISSING",

          executionAuthorized:
            false,
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

      executionAuthorized:
        false,
    };
  },


  // ==========================================================================
  // REVOCATION
  // ==========================================================================

  async revoke() {
    return {
      success:
        true,

      remoteRevocationRequired:
        false,

      executionAuthorized:
        false,
    };
  },
};


// ============================================================================
// REQUEST
// ============================================================================

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
      ?.nonSecretConfig ??
    {};


  const parsed =
    new URL(
      targetUrl
    );


  if (
    ![
      "http:",
      "https:",
    ].includes(
      parsed.protocol
    )
  ) {
    throw Object.assign(
      new Error(
        "Webhook target must use HTTP or HTTPS"
      ),

      {
        code:
          "WEBHOOK_PROTOCOL_NOT_ALLOWED",

        executionAuthorized:
          false,
      }
    );
  }


  /*
   * IMPORTANT:
   *
   * The SSRF guard is asynchronous because DNS resolution is
   * part of the safety decision.
   *
   * It MUST be awaited before opening the socket.
   */
  await assertTargetAllowed(
    parsed,
    connection
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

        executionAuthorized:
          false,
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

    "Connection":
      "keep-alive",

    ...customHeaders,
  };


  /*
   * Authentication material must never be supplied through
   * nonSecretConfig.
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

          (
            response
          ) => {
            let responseBytes =
              0;


            response.on(
              "data",

              (
                chunk
              ) => {
                responseBytes +=
                  chunk.length;


                if (
                  responseBytes >
                  1024 *
                    1024
                ) {
                  response.destroy(
                    Object.assign(
                      new Error(
                        "Webhook response exceeded maximum size"
                      ),

                      {
                        code:
                          "WEBHOOK_RESPONSE_TOO_LARGE",

                        executionAuthorized:
                          false,
                      }
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
                          statusCode ===
                          429
                            ? "WEBHOOK_RATE_LIMITED"
                            : "WEBHOOK_REMOTE_ERROR",

                        executionAuthorized:
                          false,
                      }
                    )
                  );
                }


                return resolve({
                  statusCode,

                  executionAuthorized:
                    false,
                });
              }
            );
          }
        );


      request.on(
        "error",

        (
          error
        ) => {
          reject(
            Object.assign(
              error,

              {
                executionAuthorized:
                  false,
              }
            )
          );
        }
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

                executionAuthorized:
                  false,
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


// ============================================================================
// SSRF + RELIABILITY LAB SAFETY
// ============================================================================

async function assertTargetAllowed(
  parsed,
  connection
) {
  if (
    isExplicitReliabilityLabLoopback(
      parsed,
      connection
    )
  ) {
    return;
  }


  await assertSafeHost(
    parsed.hostname
  );
}


function isExplicitReliabilityLabLoopback(
  parsed,
  connection
) {
  const config =
    connection
      ?.nonSecretConfig ||
    {};


  const metadata =
    connection
      ?.metadata ||
    {};


  const hostname =
    String(
      parsed.hostname ||
      ""
    )
      .replace(
        /^\[|\]$/g,
        ""
      )
      .toLowerCase();


  /*
   * Production can NEVER use this exception.
   */
  if (
    String(
      process.env.NODE_ENV ||
      ""
    )
      .toLowerCase() ===
    "production"
  ) {
    return false;
  }


  /*
   * The process itself must explicitly be running as the
   * Reliability Lab.
   */
  if (
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .toLowerCase() !==
    "true"
  ) {
    return false;
  }


  /*
   * The connection must independently identify itself as
   * LAB_ONLY.
   */
  if (
    config
      .reliabilityLabLoopback !==
      true ||
    config
      .reliabilityLab !==
      true ||
    String(
      config
        .safetyClass ||
      ""
    )
      .toUpperCase() !==
      "LAB_ONLY"
  ) {
    return false;
  }


  if (
    metadata
      .reliabilityLab !==
      true ||
    String(
      metadata
        .safetyClass ||
      ""
    )
      .toUpperCase() !==
      "LAB_ONLY" ||
    metadata
      .production ===
      true
  ) {
    return false;
  }


  /*
   * Even the lab exception permits ONLY loopback.
   * Private networks such as 10/8, 172.16/12 and 192.168/16
   * remain prohibited.
   */
  if (
    !LOOPBACK_HOSTS.has(
      hostname
    )
  ) {
    return false;
  }


  return true;
}


// ============================================================================
// TEST INTROSPECTION
// ============================================================================

adapter.assertTargetAllowed =
  assertTargetAllowed;


adapter.isExplicitReliabilityLabLoopback =
  isExplicitReliabilityLabLoopback;


// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  adapter;