"use strict";

/**
 * Provider-neutral incident fingerprint builder.
 *
 * This logic deliberately lives outside models/Incident so runtime
 * services do not need to load Mongoose merely to calculate identity.
 */
function buildFingerprint({
  organizationId,
  environmentId,
  serviceId,
  monitorId = null,
  errorCode = null,
  source = "monitor",
  correlationGroupId = null,
  signalFingerprint = null,
}) {
  if (!organizationId) {
    throw new Error(
      "organizationId is required to build incident fingerprint"
    );
  }

  if (!environmentId) {
    throw new Error(
      "environmentId is required to build incident fingerprint"
    );
  }

  if (!serviceId) {
    throw new Error(
      "serviceId is required to build incident fingerprint"
    );
  }

  /*
   * Correlated incidents use the correlation group as their
   * strongest stable identity.
   */
  if (
    correlationGroupId
  ) {
    return [
      organizationId,
      environmentId,
      serviceId,
      "correlation",
      correlationGroupId,
    ]
      .map(
        String
      )
      .join(
        "::"
      );
  }

  /*
   * Provider-neutral signal incident.
   */
  if (
    signalFingerprint &&
    !monitorId
  ) {
    return [
      organizationId,
      environmentId,
      serviceId,
      source,
      signalFingerprint,
    ]
      .map(
        String
      )
      .join(
        "::"
      );
  }

  /*
   * Legacy monitor incident identity.
   *
   * Keep this exactly compatible with existing incidents.
   */
  return [
    organizationId,
    environmentId,
    serviceId,
    monitorId ||
      "no-monitor",
    source,
    errorCode ||
      "http_failure",
  ]
    .map(
      String
    )
    .join(
      "::"
    );
}

module.exports = {
  buildFingerprint,
};