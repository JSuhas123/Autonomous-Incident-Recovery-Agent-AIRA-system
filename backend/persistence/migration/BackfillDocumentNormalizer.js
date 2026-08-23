"use strict";

/**
 * Phase 13.5B
 *
 * Converts Mongo/Mongoose source records into plain,
 * migration-safe JavaScript objects.
 */

class BackfillDocumentNormalizer {
  normalize(
    source
  ) {
    if (
      source === null ||
      source === undefined
    ) {
      return source;
    }

    const plain =
      this.toPlainObject(
        source
      );

    const normalized =
      this.normalizeValue(
        plain
      );

    if (
      normalized &&
      typeof normalized ===
        "object" &&
      !Array.isArray(
        normalized
      )
    ) {
      delete normalized.__v;

      if (
        normalized._id !==
          undefined &&
        normalized._id !==
          null
      ) {
        normalized._id =
          this.normalizeIdentifier(
            normalized._id
          );

        normalized.legacyMongoId =
          normalized.legacyMongoId ||
          normalized._id;
      }
    }

    return normalized;
  }

  toPlainObject(
    source
  ) {
    if (
      source &&
      typeof source.toObject ===
        "function"
    ) {
      return source.toObject({
        depopulate:
          true,

        getters:
          false,

        virtuals:
          false,

        versionKey:
          false,
      });
    }

    if (
      source &&
      typeof source ===
        "object"
    ) {
      return {
        ...source,
      };
    }

    return source;
  }

  normalizeValue(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return value;
    }

    if (
      value instanceof Date
    ) {
      return new Date(
        value.getTime()
      );
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
      return value.map(
        (
          item
        ) =>
          this.normalizeValue(
            item
          )
      );
    }

    if (
      typeof value ===
        "object"
    ) {
      const output = {};

      for (
        const [
          key,
          nestedValue,
        ]
        of Object.entries(
          value
        )
      ) {
        if (
          key ===
            "__v" ||
          key ===
            "$__" ||
          key ===
            "_doc"
        ) {
          continue;
        }

        output[key] =
          this.normalizeValue(
            nestedValue
          );
      }

      return output;
    }

    return value;
  }

  normalizeIdentifier(
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
      return value
        .toHexString();
    }

    return String(
      value
    );
  }
}

module.exports =
  BackfillDocumentNormalizer;