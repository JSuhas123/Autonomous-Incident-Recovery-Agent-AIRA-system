"use strict";

/**
 * ============================================================================
 * PHASE 11.12 — STRUCTURED LOGGING COMPATIBILITY FACADE
 * ============================================================================
 *
 * The canonical sink is now:
 *
 *   services/infrastructure/loggingService.js
 *
 * Existing callers may continue using StructuredLoggingService.
 */

const loggingService =
  require(
    "../infrastructure/loggingService"
  );


class StructuredLoggingService {
  constructor(
    serviceName =
      "decision-engine"
  ) {
    this.serviceName =
      serviceName;
  }


  log(
    level,
    message,
    context =
      {}
  ) {
    return loggingService
      .log(
        level,
        message,
        {
          component:
            context.component ||
            this.serviceName,

          ...context,
        }
      );
  }


  logDecision(
    tenantId,
    decisionId,
    action,
    confidence,
    tier,
    context =
      {}
  ) {
    return this
      .log(
        "info",
        "Decision made",
        {
          tenantId,

          decisionId,

          action,

          confidence:
            Number.isFinite(
              Number(
                confidence
              )
            )
              ? Number(
                  confidence
                )
              : null,

          tier,

          ...context,
        }
      );
  }


  logActionExecution(
    tenantId,
    actionId,
    decisionId,
    action,
    result,
    context =
      {}
  ) {
    return this
      .log(
        result ===
          "SUCCESS"
          ? "info"
          : "warn",
        `Action ${result}`,
        {
          tenantId,

          actionId,

          decisionId,

          action,

          result,

          ...context,
        }
      );
  }


  logSecurityEvent(
    tenantId,
    eventType,
    message,
    context =
      {}
  ) {
    return this
      .log(
        "warn",
        `Security: ${eventType}`,
        {
          tenantId,

          eventType,

          securityMessage:
            message,

          ...context,
        }
      );
  }


  logError(
    message,
    error,
    context =
      {}
  ) {
    return this
      .log(
        "error",
        message,
        {
          error,

          ...context,
        }
      );
  }


  logPerformance(
    component,
    operation,
    durationMs,
    context =
      {}
  ) {
    const duration =
      Number(
        durationMs
      ) ||
      0;


    return this
      .log(
        duration >
          1000
          ? "warn"
          : "debug",
        `Performance: ${component}/${operation}`,
        {
          component,

          operation,

          durationMs:
            duration,

          performanceClass:
            duration >
            1000
              ? "slow"
              : "normal",

          ...context,
        }
      );
  }


  getStatus() {
    return {
      serviceName:
        this.serviceName,

      canonicalSink:
        "infrastructure/loggingService",

      executionAuthorized:
        false,
    };
  }
}


const instances =
  new Map();


function getStructuredLoggingService(
  serviceName =
    "decision-engine"
) {
  if (
    !instances.has(
      serviceName
    )
  ) {
    instances.set(
      serviceName,
      new StructuredLoggingService(
        serviceName
      )
    );
  }


  return instances
    .get(
      serviceName
    );
}


module.exports = {
  StructuredLoggingService,

  getStructuredLoggingService,
};