"use strict";

/**
 * Provider-neutral identifier helpers.
 *
 * Phase 13:
 * Runtime services must not depend on Mongoose merely to validate
 * legacy Mongo ObjectId-shaped identifiers.
 */

function isLegacyObjectId(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  return /^[0-9a-f]{24}$/i.test(
    String(
      value
    ).trim()
  );
}


function isNonEmptyIdentifier(
  value
) {
  return (
    value !== null &&
    value !== undefined &&
    String(
      value
    ).trim().length >
      0
  );
}


module.exports = {
  isLegacyObjectId,
  isNonEmptyIdentifier,
};
