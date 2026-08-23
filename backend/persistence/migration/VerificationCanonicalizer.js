"use strict";

const crypto =
  require(
    "node:crypto"
  );

/**
 * Phase 13.5C
 *
 * Converts Mongo and PostgreSQL representations into a stable,
 * deterministic comparison form.
 *
 * IMPORTANT:
 *
 * Verification compares domain meaning, not database internals.
 */
class VerificationCanonicalizer {
  canonicalize(
    value,
    options = {}
  ) {
    const ignoredFields =
      new Set(
        options.ignoredFields ||
        [
          "_id",
          "__v",

          "id",
          "databaseId",

          "legacyMongoId",

          "createdAt",
          "updatedAt",

          "created_at",
          "updated_at",
        ]
      );

    return this
      .normalizeValue(
        value,
        ignoredFields
      );
  }

  normalizeValue(
    value,
    ignoredFields
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (
      value instanceof Date
    ) {
      return value
        .toISOString();
    }

    if (
      typeof value.toHexString ===
      "function"
    ) {
      return value
        .toHexString();
    }

    if (
      Array.isArray(
        value
      )
    ) {
      return value
        .map(
          (
            item
          ) =>
            this.normalizeValue(
              item,
              ignoredFields
            )
        );
    }

    if (
      typeof value ===
      "object"
    ) {
      const source =
        typeof value.toObject ===
          "function"
          ? value.toObject({
              getters:
                false,

              virtuals:
                false,

              versionKey:
                false,
            })
          : value;

      const output =
        {};

      const keys =
        Object.keys(
          source
        )
          .filter(
            (
              key
            ) =>
              !ignoredFields
                .has(
                  key
                )
          )
          .sort();

      for (
        const key
        of keys
      ) {
        const nested =
          source[
            key
          ];

        if (
          nested ===
          undefined
        ) {
          continue;
        }

        output[key] =
          this.normalizeValue(
            nested,
            ignoredFields
          );
      }

      return output;
    }

    if (
      typeof value ===
      "number"
    ) {
      if (
        Number.isNaN(
          value
        )
      ) {
        return null;
      }

      return value;
    }

    if (
      typeof value ===
      "boolean"
    ) {
      return value;
    }

    return String(
      value
    );
  }

  stableStringify(
    value,
    options = {}
  ) {
    return JSON.stringify(
      this.canonicalize(
        value,
        options
      )
    );
  }

  checksum(
    value,
    options = {}
  ) {
    return crypto
      .createHash(
        "sha256"
      )
      .update(
        this.stableStringify(
          value,
          options
        )
      )
      .digest(
        "hex"
      );
  }

  equivalent(
    first,
    second,
    options = {}
  ) {
    return (
      this.checksum(
        first,
        options
      ) ===
      this.checksum(
        second,
        options
      )
    );
  }
}

module.exports =
  VerificationCanonicalizer;