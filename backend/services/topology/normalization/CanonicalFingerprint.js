"use strict";

const crypto = require(
  "node:crypto"
);


function canonicalFingerprint(
  value
) {
  const canonical =
    stableStringify(
      value
    );


  return crypto
    .createHash(
      "sha256"
    )
    .update(
      canonical
    )
    .digest(
      "hex"
    );
}


function stableStringify(
  value
) {
  return JSON.stringify(
    sortValue(
      value
    )
  );
}


function sortValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortValue
    );
  }


  if (
    value &&
    typeof value ===
      "object" &&
    !(
      value instanceof
      Date
    )
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            sortValue(
              value[key]
            );


          return result;
        },
        {}
      );
  }


  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  return value;
}


module.exports = {
  canonicalFingerprint,
  stableStringify,
};