"use strict";


const crypto =
  require(
    "node:crypto"
  );


function canonicalize(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      canonicalize
    );
  }


  if (
    value
    &&
    typeof value ===
      "object"
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          output,
          key
        ) => {
          output[key] =
            canonicalize(
              value[key]
            );

          return output;
        },

        {}
      );
  }


  return value;
}


function hashObject(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        canonicalize(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


function assert(
  condition,
  code,
  message,
  details =
    {}
) {
  if (
    !condition
  ) {
    throw Object.assign(
      new Error(
        message
      ),

      {
        name:
          "Phase24CertificationError",

        code,

        details,

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }
}


function certificationResult(
  input = {}
) {
  const result = {
    phase:
      "24",

    version:
      input.version,

    certificationType:
      input.certificationType,

    status:
      input.passed
        ? "PASS"
        : "FAIL",

    passed:
      input.passed ===
      true,

    checks:
      input.checks ||
      [],

    executionAuthorized:
      false,

    productionCertified:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };


  result.certificationHash =
    hashObject(
      result
    );


  return result;
}


module.exports = {
  canonicalize,

  hashObject,

  assert,

  certificationResult,
};