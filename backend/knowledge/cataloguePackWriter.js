"use strict";

/**
 * AIRA Knowledge Pack Writer
 *
 * Phase 13.7
 *
 * Safe filesystem writer used by future Knowledge Pack generators.
 *
 * CRITICAL SAFETY RULES:
 *
 * - CREATE ONLY by default
 * - NEVER silently overwrite existing YAML
 * - Validate quality BEFORE writing
 * - Restrict writes to approved catalogue roots
 * - Reject path traversal
 * - Atomic file creation
 *
 * This is an AUTHORING utility.
 * It is not part of infrastructure execution.
 */

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const yaml =
  require(
    "js-yaml"
  );

const {
  resolveBackendRoot,
} =
  require(
    "./catalogueScanner"
  );

const {
  validateCatalogueDefinitionQuality,
} =
  require(
    "./catalogueQualityPolicy"
  );


const ALLOWED_ROOTS =
  Object.freeze({
    PLAYBOOK:
      path.join(
        "playbooks",
        "catalogue"
      ),

    RUNBOOK:
      path.join(
        "runbooks",
        "definitions"
      ),
  });


// ============================================================================
// HELPERS
// ============================================================================

function _definitionKind(
  definition
) {
  return String(
    definition
      ?.kind ||
    ""
  )
    .trim()
    .toUpperCase();
}


function _assertSafeRelativePath(
  relativePath
) {
  if (
    !relativePath ||
    typeof relativePath !==
      "string"
  ) {
    throw Object.assign(
      new Error(
        "Knowledge pack output path is required."
      ),
      {
        code:
          "KNOWLEDGE_PACK_PATH_REQUIRED",
      }
    );
  }

  const normalized =
    path.normalize(
      relativePath
    );

  if (
    path.isAbsolute(
      normalized
    ) ||
    normalized ===
      ".." ||
    normalized.startsWith(
      `..${path.sep}`
    )
  ) {
    throw Object.assign(
      new Error(
        `Unsafe knowledge pack path: ${relativePath}`
      ),
      {
        code:
          "KNOWLEDGE_PACK_PATH_UNSAFE",
      }
    );
  }

  if (
    !/\.ya?ml$/i
      .test(
        normalized
      )
  ) {
    throw Object.assign(
      new Error(
        "Knowledge pack definitions must use .yaml or .yml files."
      ),
      {
        code:
          "KNOWLEDGE_PACK_YAML_REQUIRED",
      }
    );
  }

  return normalized;
}


function _assertInside(
  target,
  allowedRoot
) {
  const relative =
    path.relative(
      allowedRoot,
      target
    );

  if (
    relative ===
      "" ||
    (
      !relative.startsWith(
        ".."
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  ) {
    return;
  }

  throw Object.assign(
    new Error(
      `Knowledge pack target escapes allowed catalogue root: ${target}`
    ),
    {
      code:
        "KNOWLEDGE_PACK_ROOT_ESCAPE",
    }
  );
}


// ============================================================================
// PLAN
// ============================================================================

function planCatalogueWrite({
  definition,
  relativePath,
  backendRoot = null,
} = {}) {
  const root =
    resolveBackendRoot(
      backendRoot
    );

  const kind =
    _definitionKind(
      definition
    );

  if (
    !ALLOWED_ROOTS[
      kind
    ]
  ) {
    throw Object.assign(
      new Error(
        `Unsupported knowledge definition kind: ${kind || "UNKNOWN"}`
      ),
      {
        code:
          "KNOWLEDGE_PACK_KIND_UNSUPPORTED",
      }
    );
  }

  const safeRelativePath =
    _assertSafeRelativePath(
      relativePath
    );

  const allowedRoot =
    path.resolve(
      root,
      ALLOWED_ROOTS[
        kind
      ]
    );

  const target =
    path.resolve(
      allowedRoot,
      safeRelativePath
    );

  _assertInside(
    target,
    allowedRoot
  );

  const quality =
    validateCatalogueDefinitionQuality(
      definition
    );

  return {
    backendRoot:
      root,

    kind,

    allowedRoot,

    relativePath:
      safeRelativePath
        .replace(
          /\\/g,
          "/"
        ),

    target,

    exists:
      fs.existsSync(
        target
      ),

    quality,

    writable:
      quality.valid &&
      !fs.existsSync(
        target
      ),
  };
}


// ============================================================================
// CREATE ONE
// ============================================================================

function writeCatalogueDefinition({
  definition,
  relativePath,
  backendRoot = null,
  dryRun = false,
} = {}) {
  const plan =
    planCatalogueWrite({
      definition,
      relativePath,
      backendRoot,
    });

  if (
    !plan
      .quality
      .valid
  ) {
    const error =
      new Error(
        `Knowledge definition failed quality validation: ${relativePath}`
      );

    error.code =
      "KNOWLEDGE_PACK_QUALITY_FAILED";

    error.diagnostics =
      plan
        .quality
        .diagnostics;

    throw error;
  }

  if (
    plan.exists
  ) {
    return {
      status:
        "SKIPPED_EXISTS",

      written:
        false,

      target:
        plan.target,

      relativePath:
        plan.relativePath,

      quality:
        plan.quality,
    };
  }

  if (
    dryRun
  ) {
    return {
      status:
        "DRY_RUN_CREATE",

      written:
        false,

      target:
        plan.target,

      relativePath:
        plan.relativePath,

      quality:
        plan.quality,
    };
  }

  fs.mkdirSync(
    path.dirname(
      plan.target
    ),
    {
      recursive:
        true,
    }
  );

  const serialized =
    yaml.dump(
      definition,
      {
        noRefs:
          true,

        lineWidth:
          100,

        noCompatMode:
          true,

        sortKeys:
          false,
      }
    );

  /*
   * wx = create file exclusively.
   *
   * Even if another process creates the file between existsSync() and
   * writeFileSync(), Node will refuse to overwrite it.
   */
  try {
    fs.writeFileSync(
      plan.target,
      serialized,
      {
        encoding:
          "utf8",

        flag:
          "wx",
      }
    );
  } catch (
    error
  ) {
    if (
      error
        ?.code ===
      "EEXIST"
    ) {
      return {
        status:
          "SKIPPED_EXISTS",

        written:
          false,

        target:
          plan.target,

        relativePath:
          plan.relativePath,

        quality:
          plan.quality,
      };
    }

    throw error;
  }

  return {
    status:
      "CREATED",

    written:
      true,

    target:
      plan.target,

    relativePath:
      plan.relativePath,

    quality:
      plan.quality,
  };
}


// ============================================================================
// WRITE PACK
// ============================================================================

function writeKnowledgePack(
  definitions,
  options = {}
) {
  if (
    !Array.isArray(
      definitions
    )
  ) {
    throw Object.assign(
      new Error(
        "Knowledge pack definitions must be an array."
      ),
      {
        code:
          "KNOWLEDGE_PACK_ARRAY_REQUIRED",
      }
    );
  }

  /*
   * Validate and plan EVERYTHING before writing ANYTHING.
   *
   * This prevents half-written packs caused by a bad definition late
   * in the input array.
   */
  const plans =
    definitions
      .map(
        (
          entry
        ) =>
          planCatalogueWrite({
            definition:
              entry
                .definition,

            relativePath:
              entry
                .relativePath,

            backendRoot:
              options
                .backendRoot ||
              null,
          })
      );

  const invalid =
    plans
      .filter(
        (
          plan
        ) =>
          !plan
            .quality
            .valid
      );

  if (
    invalid.length >
    0
  ) {
    const error =
      new Error(
        `${invalid.length} knowledge definition(s) failed quality validation. No files were written.`
      );

    error.code =
      "KNOWLEDGE_PACK_VALIDATION_FAILED";

    error.invalid =
      invalid.map(
        (
          plan
        ) => ({
          relativePath:
            plan
              .relativePath,

          diagnostics:
            plan
              .quality
              .diagnostics,
        })
      );

    throw error;
  }

  const results =
    definitions
      .map(
        (
          entry
        ) =>
          writeCatalogueDefinition({
            definition:
              entry
                .definition,

            relativePath:
              entry
                .relativePath,

            backendRoot:
              options
                .backendRoot ||
              null,

            dryRun:
              options
                .dryRun ===
              true,
          })
      );

  return {
    total:
      results.length,

    created:
      results
        .filter(
          (
            result
          ) =>
            result.status ===
            "CREATED"
        )
        .length,

    skippedExisting:
      results
        .filter(
          (
            result
          ) =>
            result.status ===
            "SKIPPED_EXISTS"
        )
        .length,

    dryRunCreates:
      results
        .filter(
          (
            result
          ) =>
            result.status ===
            "DRY_RUN_CREATE"
        )
        .length,

    results,
  };
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ALLOWED_ROOTS,

  planCatalogueWrite,
  writeCatalogueDefinition,
  writeKnowledgePack,
};