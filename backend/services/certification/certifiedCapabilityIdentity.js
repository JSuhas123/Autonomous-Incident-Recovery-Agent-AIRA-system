"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  CERTIFICATION_SCOPE_VERSION,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  assertValidCertifiedCapability,
} =
  require(
    "../../contracts/certification/certifiedCapabilityContract"
  );


/**
 * Builds the canonical identity of exactly what has been certified.
 *
 * Changing the failure mode, recovery strategy, resource capability,
 * playbook/version, domain or constraints creates a different identity.
 *
 * This prevents evidence for one recovery variant from silently being
 * reused to qualify another recovery variant.
 */
function buildCertifiedCapabilityIdentity(
  input
) {
  const validated =
    assertValidCertifiedCapability(
      input
    );


  const normalizedConstraints =
    normalizeValue(
      validated.constraints ||
      {}
    );


  const identityPayload =
    Object.freeze({
      identityVersion:
        CERTIFICATION_SCOPE_VERSION,

      capabilityKey:
        validated.capabilityKey,

      provider:
        validated.provider,

      resourceType:
        validated.resourceType,

      failureMode:
        validated.failureMode,

      recoveryStrategy:
        validated.recoveryStrategy,

      resourceCapability:
        validated.resourceCapability,

      playbookId:
        validated.playbookId,

      playbookVersion:
        String(
          validated.playbookVersion
        ),

      domain:
        validated.domain,

      constraints:
        normalizedConstraints,
    });


  const canonical =
    stableStringify(
      identityPayload
    );


  const fingerprint =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        canonical,
        "utf8"
      )
      .digest(
        "hex"
      );


  return Object.freeze({
    capabilityKey:
      validated.capabilityKey,

    identityVersion:
      CERTIFICATION_SCOPE_VERSION,

    fingerprint,

    canonical,

    scope:
      identityPayload,

    executionAuthorized:
      false,
  });
}


function sameCertifiedCapability(
  left,
  right
) {
  return (
    buildCertifiedCapabilityIdentity(
      left
    )
      .fingerprint ===

    buildCertifiedCapabilityIdentity(
      right
    )
      .fingerprint
  );
}


function stableStringify(
  value
) {
  return JSON.stringify(
    normalizeValue(
      value
    )
  );
}


function normalizeValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      normalizeValue
    );
  }


  if (
    value &&
    typeof value ===
      "object" &&
    !(
      value instanceof Date
    )
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          if (
            value[key] !==
              undefined
          ) {
            result[key] =
              normalizeValue(
                value[key]
              );
          }

          return result;
        },
        {}
      );
  }


  if (
    value instanceof Date
  ) {
    return value
      .toISOString();
  }


  return value;
}


module.exports = {
  buildCertifiedCapabilityIdentity,

  sameCertifiedCapability,

  stableStringify,
};