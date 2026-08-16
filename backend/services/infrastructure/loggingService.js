"use strict";

/**
 * ============================================================================
 * PHASE 11.12 — CANONICAL STRUCTURED LOGGING SERVICE
 * ============================================================================
 */

const winston =
  require(
    "winston"
  );

const path =
  require(
    "path"
  );

const fs =
  require(
    "fs"
  );


const FORBIDDEN_KEYS =
  new Set([
    "password",
    "passwd",
    "passwordhash",

    "secret",
    "secretkey",
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


function sanitizeContext(
  value,
  depth =
    0
) {
  if (
    depth >
    8
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
    Error
  ) {
    return {
      name:
        value.name,

      message:
        value.message,

      code:
        value.code ||
        null,

      stack:
        value.stack,
    };
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
        child
      ) =>
        sanitizeContext(
          child,
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
        child,
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
        output[
          key
        ] =
          "[REDACTED]";

        continue;
      }


      output[
        key
      ] =
        sanitizeContext(
          child,
          depth +
            1
        );
    }


    return output;
  }


  return value;
}


class LoggingService {
  constructor() {
    const logsDir =
      path.join(
        __dirname,
        "../../logs"
      );


    if (
      !fs.existsSync(
        logsDir
      )
    ) {
      fs.mkdirSync(
        logsDir,
        {
          recursive:
            true,
        }
      );
    }


    const jsonFormat =
      winston.format.combine(
        winston
          .format
          .timestamp(),

        winston
          .format
          .errors({
            stack:
              true,
          }),

        winston
          .format
          .printf(
            (
              info
            ) => {
              const context =
                sanitizeContext(
                  info.context ||
                  {}
                );


              return JSON.stringify({
                timestamp:
                  info.timestamp,

                level:
                  String(
                    info.level
                  )
                    .toUpperCase(),

                service:
                  "aira",

                environment:
                  process.env
                    .NODE_ENV ||
                  "development",

                component:
                  info.component ||
                  context.component ||
                  "aira",

                correlationId:
                  info.correlationId ||
                  context.correlationId ||
                  null,

                tenantId:
                  info.tenantId ||
                  context.tenantId ||
                  null,

                message:
                  String(
                    info.message ||
                    ""
                  ),

                context,
              });
            }
          )
      );


    const transports = [
      new winston
        .transports
        .Console({
          format:
            process.env.NODE_ENV ===
            "production"
              ? jsonFormat
              : winston
                  .format
                  .combine(
                    winston
                      .format
                      .colorize(),

                    winston
                      .format
                      .simple()
                  ),
        }),
    ];


    /*
     * Container platforms normally collect stdout/stderr.
     *
     * File logging remains available for local/self-hosted
     * deployments but is not mandatory in production.
     */
    if (
      process.env
        .LOG_TO_FILE !==
      "false"
    ) {
      transports.push(
        new winston
          .transports
          .File({
            filename:
              path.join(
                logsDir,
                "combined.log"
              ),

            maxsize:
              5 *
              1024 *
              1024,

            maxFiles:
              10,

            format:
              jsonFormat,
          })
      );


      transports.push(
        new winston
          .transports
          .File({
            filename:
              path.join(
                logsDir,
                "error.log"
              ),

            level:
              "error",

            maxsize:
              5 *
              1024 *
              1024,

            maxFiles:
              10,

            format:
              jsonFormat,
          })
      );
    }


    this.logger =
      winston
        .createLogger({
          level:
            process.env
              .LOG_LEVEL ||
            "info",

          defaultMeta: {
            service:
              "aira",
          },

          transports,
        });
  }


  log(
    level,
    message,
    context =
      {}
  ) {
    const safe =
      sanitizeContext(
        context
      );


    this.logger
      .log({
        level:
          String(
            level ||
            "info"
          )
            .toLowerCase(),

        message:
          String(
            message ||
            ""
          ),

        component:
          safe.component ||
          "aira",

        correlationId:
          safe.correlationId ||
          null,

        tenantId:
          safe.tenantId ||
          null,

        context:
          safe,
      });


    return {
      logged:
        true,

      executionAuthorized:
        false,
    };
  }


  logStructured({
    level =
      "info",
    message =
      "",
    component =
      "aira",
    correlationId =
      null,
    tenantId =
      null,
    ...context
  } = {}) {
    return this
      .log(
        level,
        message,
        {
          component,
          correlationId,
          tenantId,
          ...context,
        }
      );
  }


  info(
    message,
    context =
      {}
  ) {
    return this
      .log(
        "info",
        message,
        context
      );
  }


  warn(
    message,
    context =
      {}
  ) {
    return this
      .log(
        "warn",
        message,
        context
      );
  }


  error(
    message,
    context =
      {}
  ) {
    return this
      .log(
        "error",
        message,
        context
      );
  }


  debug(
    message,
    context =
      {}
  ) {
    return this
      .log(
        "debug",
        message,
        context
      );
  }


  logDecision(
    decisionId,
    message,
    context =
      {}
  ) {
    return this
      .info(
        message,
        {
          component:
            "decision-engine",

          decisionId,

          ...context,
        }
      );
  }


  logAction(
    actionId,
    message,
    context =
      {}
  ) {
    return this
      .info(
        message,
        {
          component:
            "action-executor",

          actionId,

          ...context,
        }
      );
  }


  logPolicy(
    policyVersion,
    message,
    context =
      {}
  ) {
    return this
      .info(
        message,
        {
          component:
            "policy-engine",

          policyVersion,

          ...context,
        }
      );
  }


  logQueue(
    eventId,
    message,
    context =
      {}
  ) {
    return this
      .info(
        message,
        {
          component:
            "queue-service",

          eventId,

          ...context,
        }
      );
  }


  createComponentLogger(
    component
  ) {
    return {
      info:
        (
          message,
          context =
            {}
        ) =>
          this
            .info(
              message,
              {
                component,
                ...context,
              }
            ),

      warn:
        (
          message,
          context =
            {}
        ) =>
          this
            .warn(
              message,
              {
                component,
                ...context,
              }
            ),

      error:
        (
          message,
          context =
            {}
        ) =>
          this
            .error(
              message,
              {
                component,
                ...context,
              }
            ),

      debug:
        (
          message,
          context =
            {}
        ) =>
          this
            .debug(
              message,
              {
                component,
                ...context,
              }
            ),
    };
  }


  sanitizeContext(
    value
  ) {
    return sanitizeContext(
      value
    );
  }


  getStatus() {
    return {
      level:
        this.logger
          .level,

      transports:
        this.logger
          .transports
          .length,

      structured:
        true,

      redaction:
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new LoggingService();

module.exports
  .LoggingService =
  LoggingService;

module.exports
  .sanitizeContext =
  sanitizeContext;