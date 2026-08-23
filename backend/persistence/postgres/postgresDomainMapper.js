"use strict";

const crypto =
  require(
    "node:crypto"
  );

function normalizeId(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value.toHexString ===
    "function"
  ) {
    return value.toHexString();
  }

  return String(
    value
  );
}

function createApplicationId() {
  /*
   * Keep 24-character identifier compatibility during migration.
   *
   * PostgreSQL still owns the actual relational primary key as UUID.
   */
  return crypto
    .randomBytes(
      12
    )
    .toString(
      "hex"
    );
}

function serializeDocument(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value || {}
    )
  );
}

function reviveDocument(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      reviveDocument
    );
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return value;
  }

  const output = {};

  for (
    const [
      key,
      item,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      typeof item ===
        "string" &&
      /At$/.test(
        key
      ) &&
      /^\d{4}-\d{2}-\d{2}T/.test(
        item
      )
    ) {
      const parsed =
        new Date(
          item
        );

      output[key] =
        Number.isNaN(
          parsed.getTime()
        )
          ? item
          : parsed;

      continue;
    }

    output[key] =
      reviveDocument(
        item
      );
  }

  return output;
}

function translatePostgresError(
  error
) {
  if (
    error?.code ===
    "23505"
  ) {
    error.postgresCode =
      error.code;

    /*
     * Existing incident service already handles Mongo duplicate-key
     * code 11000 as its concurrency retry signal.
     */
    error.code =
      11000;
  }

  return error;
}

module.exports = {
  normalizeId,

  createApplicationId,

  serializeDocument,

  reviveDocument,

  translatePostgresError,
};