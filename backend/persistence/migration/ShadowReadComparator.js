"use strict";

const crypto =
  require(
    "node:crypto"
  );

/**
 * Phase 13.5C
 *
 * Deterministic Mongo-primary / PostgreSQL-shadow comparator.
 *
 * Important:
 *
 * - null <-> null is a valid match
 * - null <-> record is a mismatch
 * - adapters are only invoked for actual records
 * - comparison never mutates source/target values
 */
class ShadowReadComparator {
  compare({
    source,
    target,
    adapter = null,
  } = {}) {
    /*
     * ============================================================
     * NULL SEMANTICS
     * ============================================================
     *
     * A missing record in both databases is still parity.
     *
     * Do this BEFORE calling verification adapters because many
     * domain canonicalizers expect actual documents.
     */

    if (
      source ===
        null &&
      target ===
        null
    ) {
      const serialized =
        stableStringify(
          null
        );

      const checksum =
        hash(
          serialized
        );

      return {
        match:
          true,

        sourceHash:
          checksum,

        targetHash:
          checksum,

        source:
          null,

        target:
          null,

        differences:
          [],
      };
    }

    /*
     * One side missing and the other present is a real mismatch.
     */
    if (
      source ===
        null ||
      target ===
        null
    ) {
      const canonicalSource =
        source ===
          null
          ? null
          : this
              .canonicalize(
                source,
                adapter,
                "source"
              );

      const canonicalTarget =
        target ===
          null
          ? null
          : this
              .canonicalize(
                target,
                adapter,
                "target"
              );

      const sourceJson =
        stableStringify(
          canonicalSource
        );

      const targetJson =
        stableStringify(
          canonicalTarget
        );

      return {
        match:
          false,

        sourceHash:
          hash(
            sourceJson
          ),

        targetHash:
          hash(
            targetJson
          ),

        source:
          canonicalSource,

        target:
          canonicalTarget,

        differences:
          [
            {
              path:
                "$",

              source:
                canonicalSource,

              target:
                canonicalTarget,

              type:
                source ===
                  null
                  ? "SOURCE_MISSING"
                  : "TARGET_MISSING",
            },
          ],
      };
    }

    /*
     * ============================================================
     * NORMAL RECORD COMPARISON
     * ============================================================
     */

    const canonicalSource =
      this.canonicalize(
        source,
        adapter,
        "source"
      );

    const canonicalTarget =
      this.canonicalize(
        target,
        adapter,
        "target"
      );

    const sourceJson =
      stableStringify(
        canonicalSource
      );

    const targetJson =
      stableStringify(
        canonicalTarget
      );

    const match =
      sourceJson ===
      targetJson;

    return {
      match,

      sourceHash:
        hash(
          sourceJson
        ),

      targetHash:
        hash(
          targetJson
        ),

      source:
        canonicalSource,

      target:
        canonicalTarget,

      differences:
        match
          ? []
          : diffValues(
              canonicalSource,
              canonicalTarget
            ),
    };
  }

  canonicalize(
    value,
    adapter,
    side
  ) {
    /*
     * Undefined is normalized into null before adapter invocation.
     */
    if (
      value ===
        undefined ||
      value ===
        null
    ) {
      return null;
    }

    if (
      side ===
        "source" &&
      typeof adapter
        ?.canonicalizeSource ===
        "function"
    ) {
      return normalize(
        adapter
          .canonicalizeSource(
            value
          )
      );
    }

    if (
      side ===
        "target" &&
      typeof adapter
        ?.canonicalizeTarget ===
        "function"
    ) {
      return normalize(
        adapter
          .canonicalizeTarget(
            value
          )
      );
    }

    return normalize(
      value
    );
  }
}


// ============================================================================
// STABLE SERIALIZATION
// ============================================================================

function stableStringify(
  value
) {
  return JSON.stringify(
    sortObject(
      normalize(
        value
      )
    )
  );
}


function sortObject(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortObject
    );
  }

  if (
    value ===
      null ||
    value ===
      undefined ||
    typeof value !==
      "object"
  ) {
    return value;
  }

  return Object.keys(
    value
  )
    .sort()
    .reduce(
      (
        output,
        key
      ) => {
        output[
          key
        ] =
          sortObject(
            value[
              key
            ]
          );

        return output;
      },
      {}
    );
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalize(
  value
) {
  if (
    value ===
      undefined
  ) {
    return null;
  }

  if (
    value ===
      null
  ) {
    return null;
  }

  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString();
  }

  if (
    typeof value
      ?.toHexString ===
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
      normalize
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    const output =
      {};

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
        key ===
          "__v"
      ) {
        continue;
      }

      output[
        key
      ] =
        normalize(
          item
        );
    }

    return output;
  }

  return value;
}


// ============================================================================
// HASHING
// ============================================================================

function hash(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value
      )
    )
    .digest(
      "hex"
    );
}


// ============================================================================
// STRUCTURAL DIFF
// ============================================================================

function diffValues(
  source,
  target,
  path = ""
) {
  const differences =
    [];

  if (
    Object.is(
      source,
      target
    )
  ) {
    return differences;
  }

  /*
   * Handle null/undefined before Object.keys/Object traversal.
   */
  if (
    source ===
      null ||
    source ===
      undefined ||
    target ===
      null ||
    target ===
      undefined
  ) {
    differences.push({
      path:
        path ||
        "$",

      source:
        source ??
        null,

      target:
        target ??
        null,
    });

    return differences;
  }

  if (
    typeof source !==
      "object" ||
    typeof target !==
      "object"
  ) {
    differences.push({
      path:
        path ||
        "$",

      source,

      target,
    });

    return differences;
  }

  if (
    Array.isArray(
      source
    ) ||
    Array.isArray(
      target
    )
  ) {
    if (
      !Array.isArray(
        source
      ) ||
      !Array.isArray(
        target
      )
    ) {
      differences.push({
        path:
          path ||
          "$",

        source,

        target,
      });

      return differences;
    }

    const maxLength =
      Math.max(
        source.length,
        target.length
      );

    for (
      let index = 0;
      index <
      maxLength;
      index +=
        1
    ) {
      differences.push(
        ...diffValues(
          source[
            index
          ],

          target[
            index
          ],

          `${path}[${index}]`
        )
      );
    }

    return differences;
  }

  const keys =
    new Set([
      ...Object.keys(
        source
      ),

      ...Object.keys(
        target
      ),
    ]);

  for (
    const key
    of keys
  ) {
    const nextPath =
      path
        ? `${path}.${key}`
        : key;

    differences.push(
      ...diffValues(
        source[
          key
        ],

        target[
          key
        ],

        nextPath
      )
    );
  }

  return differences;
}


module.exports =
  ShadowReadComparator;

module.exports
  .stableStringify =
  stableStringify;

module.exports
  .diffValues =
  diffValues;