"use strict";

/**
 * Centralized Express error handler middleware.
 *
 * Mount LAST in server.js:
 *
 * app.use(errorHandler);
 *
 * Any route that calls next(error) or throws inside an
 * async handler should eventually reach this middleware.
 */

const {
  loggingService,
} = require(
  "../services/infrastructure"
);

/**
 * Create an application error with structured metadata.
 *
 * Example:
 *
 * throw createError(
 *   "Environment not found",
 *   404,
 *   "ENVIRONMENT_NOT_FOUND",
 *   {
 *     environmentId,
 *   }
 * );
 */
function createError(
  message,
  status = 500,
  code = null,
  metadata = {}
) {
  const error =
    new Error(message);

  error.status =
    status;

  if (code) {
    error.code =
      code;
  }

  if (
    metadata &&
    typeof metadata ===
      "object"
  ) {
    Object.assign(
      error,
      metadata
    );
  }

  return error;
}

/**
 * Only expose known-safe structured fields.
 *
 * Never serialize the Error object directly.
 */
function buildErrorDetails(
  error
) {
  const details = {};

  const safeFields = [
    "field",

    "entitlement",
    "plan",

    "limit",
    "currentUsage",
    "requestedIncrease",
    "projectedUsage",

    "subscriptionStatus",

    "environmentId",
    "organizationId",

    "resourceType",
    "resourceId",

    "retryAfter",
  ];

  for (
    const field
    of safeFields
  ) {
    if (
      error[field] !==
        undefined
    ) {
      details[field] =
        error[field];
    }
  }

  return details;
}

/**
 * Centralized API error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(
  err,
  req,
  res,
  next
) {
  const status =
    Number(
      err.status ||
      err.statusCode ||
      500
    );

  const normalizedStatus =
    Number.isInteger(
      status
    ) &&
    status >= 400 &&
    status <= 599
      ? status
      : 500;

  const isClientError =
    normalizedStatus >= 400 &&
    normalizedStatus < 500;

  const code =
    err.code ||
    (
      normalizedStatus >= 500
        ? "INTERNAL_ERROR"
        : "REQUEST_ERROR"
    );

  const organizationId =
    req.context
      ?.organizationId ||
    req.auth
      ?.organizationId
      ?.toString?.() ||
    null;

  const environmentId =
    req.context
      ?.environmentId ||
    null;

  const tenantId =
    req.context
      ?.tenantId ||
    req.auth
      ?.tenantId ||
    req.tenant
      ?.id ||
    null;

  const logPayload = {
    status:
      normalizedStatus,

    code,

    method:
      req.method,

    path:
      req.path,

    organizationId,
    environmentId,
    tenantId,

    correlationId:
      req.correlationId ||
      null,

    requestId:
      req.context
        ?.requestId ||
      null,

    message:
      err.message,
  };

  if (isClientError) {
    loggingService.warn(
      "[api]",
      logPayload
    );
  } else {
    loggingService.error(
      "[api]",
      {
        ...logPayload,
        stack:
          err.stack,
      }
    );
  }

  /**
   * Never expose internal error messages in production
   * for server-side failures.
   */
  const responseMessage =
    isClientError ||
    process.env.NODE_ENV !==
      "production"
      ? err.message
      : "Internal server error";

  const details =
    buildErrorDetails(
      err
    );

  const response = {
    error:
      responseMessage,

    code,

    correlationId:
      req.correlationId ||
      undefined,
  };

  if (
    Object.keys(
      details
    ).length > 0
  ) {
    response.details =
      details;
  }

  /**
   * Standard retry hint.
   */
  if (
    err.retryAfter !==
      undefined
  ) {
    res.setHeader(
      "Retry-After",
      String(
        err.retryAfter
      )
    );
  }

  return res
    .status(
      normalizedStatus
    )
    .json(
      response
    );
}

module.exports = {
  errorHandler,
  createError,
};