"use strict";

const EnvironmentService = require(
  "../services/core/environmentService"
);
const { isDatabaseIdentifier } = require("../utils/identifier");

const ENVIRONMENT_HEADER =
  "x-aira-environment-id";

/**
 * Resolve an environment explicitly requested by the client.
 *
 * The environment MUST belong to the active organization.
 */
async function resolveRequestedEnvironment(
  organizationId,
  requestedEnvironmentId
) {
  if (!isDatabaseIdentifier(requestedEnvironmentId)) {
    return {
      error: {
        status:
          400,

        body: {
          error:
            "Invalid environment identifier",

          code:
            "INVALID_ENVIRONMENT_ID",
        },
      },
    };
  }

  const environment =
    await EnvironmentService
      .getByIdForOrganization(
        requestedEnvironmentId,
        organizationId
      );

  if (!environment) {
    /*
     * Return 404 regardless of whether the environment exists
     * under another organization.
     *
     * This avoids cross-tenant information leakage.
     */
    return {
      error: {
        status:
          404,

        body: {
          error:
            "Environment not found",

          code:
            "ENVIRONMENT_NOT_FOUND",
        },
      },
    };
  }

  return {
    environment,
  };
}

/**
 * Required environment context.
 *
 * Resolution order:
 *
 * 1. X-AIRA-Environment-Id header
 * 2. ?environmentId=
 * 3. organization's default environment
 * 4. first active environment
 */
async function environmentContextMiddleware(
  req,
  res,
  next
) {
  try {
    if (!req.context) {
      return res
        .status(500)
        .json({
          error:
            "Request context is unavailable",

          code:
            "REQUEST_CONTEXT_MISSING",
        });
    }

    const organizationId =
      req.context
        .organizationId;

    if (!organizationId) {
      return res
        .status(403)
        .json({
          error:
            "No active organization",

          code:
            "NO_ACTIVE_ORGANIZATION",
        });
    }

    const requestedEnvironmentId =
      req.headers[
        ENVIRONMENT_HEADER
      ] ||
      req.query
        .environmentId ||
      null;

    let environment =
      null;

    if (
      requestedEnvironmentId
    ) {
      const result =
        await resolveRequestedEnvironment(
          organizationId,
          requestedEnvironmentId
        );

      if (result.error) {
        return res
          .status(
            result.error
              .status
          )
          .json(
            result.error
              .body
          );
      }

      environment =
        result.environment;
    }

    /*
     * No explicit environment requested.
     * Resolve organization's configured default.
     */
    if (!environment) {
      environment =
        await EnvironmentService
          .getDefaultForOrganization(
            req.context
              .organization
          );
    }

    if (!environment) {
      return res
        .status(409)
        .json({
          error:
            "Organization has no active environment",

          code:
            "NO_ACTIVE_ENVIRONMENT",
        });
    }

    req.context
      .environmentId =
      environment._id
        .toString();

    req.context
      .environment =
      environment;

    /*
     * Helpful for debugging and frontend validation.
     */
    res.setHeader(
      "X-AIRA-Environment-Id",
      environment._id
        .toString()
    );

    return next();
  } catch (error) {
    console.error(
      "[environment-context] Failed:",
      error.message
    );

    return next(error);
  }
}

/**
 * Optional environment context.
 *
 * Organization-level endpoints do not always need an
 * environment. When no environment is requested this
 * middleware simply continues.
 */
async function optionalEnvironmentContextMiddleware(
  req,
  res,
  next
) {
  try {
    if (
      !req.context
        ?.organizationId
    ) {
      return next();
    }

    const requestedEnvironmentId =
      req.headers[
        ENVIRONMENT_HEADER
      ] ||
      req.query
        .environmentId ||
      null;

    if (
      !requestedEnvironmentId
    ) {
      return next();
    }

    const result =
      await resolveRequestedEnvironment(
        req.context
          .organizationId,
        requestedEnvironmentId
      );

    if (result.error) {
      return res
        .status(
          result.error.status
        )
        .json(
          result.error.body
        );
    }

    req.context
      .environmentId =
      result.environment
        ._id
        .toString();

    req.context
      .environment =
      result.environment;

    res.setHeader(
      "X-AIRA-Environment-Id",
      result.environment
        ._id
        .toString()
    );

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  environmentContextMiddleware,
  optionalEnvironmentContextMiddleware,
  ENVIRONMENT_HEADER,
};