"use strict";

const {
  sessionAuthMiddleware,
} = require(
  "./sessionAuthMiddleware"
);

const dualAuthMiddleware =
  require(
    "./dualAuthMiddleware"
  );

const {
  requestContextMiddleware,
} = require(
  "./requestContextMiddleware"
);

const {
  environmentContextMiddleware,
  optionalEnvironmentContextMiddleware,
} = require(
  "./environmentContextMiddleware"
);

/**
 * Browser session + canonical organization context.
 *
 * Use for organization-wide endpoints:
 *
 * members
 * teams
 * environments
 * subscription
 * organization settings
 */
const browserOrganizationContext = [
  sessionAuthMiddleware,
  requestContextMiddleware,
];

/**
 * Browser session + canonical organization +
 * required environment.
 *
 * Use for environment-owned operational resources:
 *
 * incidents
 * services
 * monitors
 * Kubernetes
 * executions
 */
const browserEnvironmentContext = [
  sessionAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,
];

/**
 * Browser session + organization +
 * optional explicit environment.
 */
const browserOptionalEnvironmentContext = [
  sessionAuthMiddleware,
  requestContextMiddleware,
  optionalEnvironmentContextMiddleware,
];

/**
 * Browser session OR machine HMAC +
 * canonical organization.
 */
const dualOrganizationContext = [
  dualAuthMiddleware,
  requestContextMiddleware,
];

/**
 * Browser OR machine auth +
 * canonical organization +
 * required environment.
 *
 * Only use this when the integration/machine client has
 * a trustworthy environment-selection mechanism.
 */
const dualEnvironmentContext = [
  dualAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,
];

module.exports = {
  browserOrganizationContext,
  browserEnvironmentContext,
  browserOptionalEnvironmentContext,
  dualOrganizationContext,
  dualEnvironmentContext,
};