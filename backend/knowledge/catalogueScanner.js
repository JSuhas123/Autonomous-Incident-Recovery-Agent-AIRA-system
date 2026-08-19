"use strict";

/**
 * AIRA Knowledge Catalogue Scanner
 *
 * Phase 13.2
 *
 * Read-only scanner for physical Playbook and Runbook YAML definitions.
 *
 * Responsibilities:
 *
 * - discover catalogue files recursively
 * - extract canonical IDs
 * - identify duplicates
 * - identify missing Runbook references
 * - identify orphan Runbooks
 * - report naming quality
 *
 * SAFETY:
 *
 * This service NEVER modifies catalogue files.
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
  validatePlaybookId,
  validateRunbookId,
  validatePlaybookFilename,
  validateRunbookFilename,
} =
  require(
    "./catalogueNaming"
  );

// ============================================================================
// BACKEND ROOT RESOLUTION
// ============================================================================

function resolveBackendRoot(
  explicitRoot = null
) {
  const candidates =
    [
      explicitRoot,

      /*
       * Normal case:
       *
       * backend/
       *   knowledge/
       *     catalogueScanner.js
       */
      path.resolve(
        __dirname,
        ".."
      ),

      /*
       * Jest / CLI started inside backend.
       */
      process.cwd(),

      /*
       * Jest / CLI started from repository root.
       */
      path.resolve(
        process.cwd(),
        "backend"
      ),
    ]
      .filter(
        Boolean
      )
      .map(
        (
          candidate
        ) =>
          path.resolve(
            candidate
          )
      );

  const unique =
    Array.from(
      new Set(
        candidates
      )
    );

  for (
    const candidate
    of unique
  ) {
    const playbookDirectory =
      path.join(
        candidate,
        "playbooks",
        "catalogue"
      );

    const runbookDirectory =
      path.join(
        candidate,
        "runbooks",
        "definitions"
      );

    if (
      fs.existsSync(
        playbookDirectory
      ) &&
      fs.existsSync(
        runbookDirectory
      )
    ) {
      return candidate;
    }
  }

  const error =
    new Error(
      [
        "Unable to locate AIRA backend catalogue root.",
        "",
        "Expected directories:",
        "  playbooks/catalogue",
        "  runbooks/definitions",
        "",
        "Checked:",
        ...unique.map(
          (
            candidate
          ) =>
            `  ${candidate}`
        ),
      ]
        .join(
          "\n"
        )
    );

  error.code =
    "KNOWLEDGE_CATALOGUE_ROOT_NOT_FOUND";

  throw error;
}

// ============================================================================
// WALK YAML FILES
// ============================================================================

function walkYamlFiles(
  directory
) {
  if (
    !directory ||
    !fs.existsSync(
      directory
    )
  ) {
    return [];
  }

  const results =
    [];

  let names;

  try {
    /*
     * Deliberately read plain filenames instead of relying on Dirent
     * classification.
     *
     * Some Windows/OneDrive/reparse-point combinations can return Dirent
     * metadata that does not reliably identify nested catalogue folders.
     * fs.statSync() below resolves the actual filesystem object.
     */
    names =
      fs.readdirSync(
        directory
      );
  } catch (
    error
  ) {
    const wrapped =
      new Error(
        `Unable to read catalogue directory "${directory}": ${error.message}`
      );

    wrapped.code =
      "KNOWLEDGE_CATALOGUE_DIRECTORY_READ_FAILED";

    throw wrapped;
  }

  for (
    const name
    of names
  ) {
    const absolute =
      path.join(
        directory,
        name
      );

    let stat;

    try {
      stat =
        fs.statSync(
          absolute
        );
    } catch (
      error
    ) {
      /*
       * A transient/inaccessible file must not make the scanner silently
       * report zero definitions. Surface the exact path instead.
       */
      const wrapped =
        new Error(
          `Unable to inspect catalogue path "${absolute}": ${error.message}`
        );

      wrapped.code =
        "KNOWLEDGE_CATALOGUE_PATH_STAT_FAILED";

      throw wrapped;
    }

    if (
      stat.isDirectory()
    ) {
      results.push(
        ...walkYamlFiles(
          absolute
        )
      );

      continue;
    }

    if (
      !stat.isFile()
    ) {
      continue;
    }

    if (
      !/\.ya?ml$/i
        .test(
          name
        )
    ) {
      continue;
    }

    results.push(
      absolute
    );
  }

  return results
    .sort(
      (
        first,
        second
      ) =>
        first.localeCompare(
          second
        )
    );
}

// ============================================================================
// YAML LOAD
// ============================================================================

function loadYaml(
  file
) {
  try {
    const raw =
      fs.readFileSync(
        file,
        "utf8"
      );

    const document =
      yaml.load(
        raw
      );

    return {
      valid:
        true,

      document:
        document &&
        typeof document ===
          "object"
          ? document
          : {},

      error:
        null,
    };
  } catch (
    error
  ) {
    return {
      valid:
        false,

      document:
        null,

      error:
        error.message,
    };
  }
}

// ============================================================================
// PLAYBOOK -> RUNBOOK REFERENCES
// ============================================================================

function collectRunbookReferences(
  playbook
) {
  const references =
    [];

  // ==========================================================================
  // STAGE RUNBOOK REFERENCES
  // ==========================================================================

  const stages =
    Array.isArray(
      playbook
        ?.stages
    )
      ? playbook.stages
      : [];

  for (
    const stage
    of stages
  ) {
    const runbooks =
      Array.isArray(
        stage
          ?.runbooks
      )
        ? stage.runbooks
        : [];

    for (
      const reference
      of runbooks
    ) {
      const runbookId =
        typeof reference ===
          "string"
          ? reference
          : reference
              ?.runbookId;

      if (
        !runbookId
      ) {
        continue;
      }

      references.push({
        relationType:
          "STAGE",

        runbookId:
          String(
            runbookId
          )
            .trim()
            .toUpperCase(),

        stageId:
          stage
            ?.id ||
          null,

        stageName:
          stage
            ?.name ||
          null,

        stageType:
          stage
            ?.type ||
          null,

        required:
          typeof reference ===
            "object"
            ? reference
                ?.required !==
              false
            : true,

        versionConstraint:
          typeof reference ===
            "object"
            ? reference
                ?.versionConstraint ||
              null
            : null,

        parameterMappings:
          typeof reference ===
            "object" &&
          reference
            ?.parameterMappings &&
          typeof reference
            .parameterMappings ===
            "object"
            ? reference
                .parameterMappings
            : {},
      });
    }
  }

  // ==========================================================================
  // TOP-LEVEL ROLLBACK RUNBOOK REFERENCE
  // ==========================================================================

  const rollback =
    playbook
      ?.rollback;

  if (
    rollback &&
    typeof rollback ===
      "object" &&
    rollback
      ?.runbook &&
    typeof rollback
      .runbook ===
      "object" &&
    rollback
      .runbook
      ?.runbookId
  ) {
    references.push({
      relationType:
        "ROLLBACK",

      runbookId:
        String(
          rollback
            .runbook
            .runbookId
        )
          .trim()
          .toUpperCase(),

      stageId:
        null,

      stageName:
        "Playbook Rollback",

      stageType:
        "ROLLBACK",

      required:
        true,

      versionConstraint:
        rollback
          .runbook
          ?.versionConstraint ||
        null,

      parameterMappings:
        rollback
          .runbook
          ?.parameterMappings &&
        typeof rollback
          .runbook
          .parameterMappings ===
          "object"
          ? rollback
              .runbook
              .parameterMappings
          : {},
    });
  }

  return references;
}

// ============================================================================
// PATH HELPERS
// ============================================================================

function relativeToBackend(
  backendRoot,
  file
) {
  return path
    .relative(
      backendRoot,
      file
    )
    .replace(
      /\\/g,
      "/"
    );
}

// ============================================================================
// DUPLICATES
// ============================================================================

function findDuplicates(
  records,
  idField
) {
  const grouped =
    new Map();

  for (
    const record
    of records
  ) {
    const id =
      record[
        idField
      ];

    if (
      !id
    ) {
      continue;
    }

    if (
      !grouped.has(
        id
      )
    ) {
      grouped.set(
        id,
        []
      );
    }

    grouped
      .get(
        id
      )
      .push(
        record.file
      );
  }

  return Array
    .from(
      grouped.entries()
    )
    .filter(
      (
        [
          ,
          files,
        ]
      ) =>
        files.length >
        1
    )
    .map(
      (
        [
          id,
          files,
        ]
      ) => ({
        id,

        files,
      })
    );
}

// ============================================================================
// SCAN CATALOGUE
// ============================================================================

function scanCatalogue(
  options = {}
) {
  const backendRoot =
    resolveBackendRoot(
      options.backendRoot ||
      null
    );

  const playbookRoot =
    options.playbookRoot
      ? path.resolve(
          options.playbookRoot
        )
      : path.join(
          backendRoot,
          "playbooks",
          "catalogue"
        );

  const runbookRoot =
    options.runbookRoot
      ? path.resolve(
          options.runbookRoot
        )
      : path.join(
          backendRoot,
          "runbooks",
          "definitions"
        );

  if (
    !fs.existsSync(
      playbookRoot
    )
  ) {
    const error =
      new Error(
        `Playbook catalogue directory does not exist: ${playbookRoot}`
      );

    error.code =
      "PLAYBOOK_CATALOGUE_NOT_FOUND";

    throw error;
  }

  if (
    !fs.existsSync(
      runbookRoot
    )
  ) {
    const error =
      new Error(
        `Runbook definitions directory does not exist: ${runbookRoot}`
      );

    error.code =
      "RUNBOOK_CATALOGUE_NOT_FOUND";

    throw error;
  }

  const playbookFiles =
    walkYamlFiles(
      playbookRoot
    );

  const runbookFiles =
    walkYamlFiles(
      runbookRoot
    );

  const playbooks =
    [];

  const runbooks =
    [];

  const parseErrors =
    [];

  // ==========================================================================
  // PLAYBOOKS
  // ==========================================================================

  for (
    const file
    of playbookFiles
  ) {
    const loaded =
      loadYaml(
        file
      );

    const relativeFile =
      relativeToBackend(
        backendRoot,
        file
      );

    if (
      !loaded.valid
    ) {
      parseErrors.push({
        type:
          "PLAYBOOK",

        file:
          relativeFile,

        error:
          loaded.error,
      });

      continue;
    }

    const document =
      loaded.document;

    const playbookId =
      document
        ?.playbookId
        ? String(
            document.playbookId
          )
            .trim()
            .toUpperCase()
        : null;

    const naming =
      validatePlaybookId(
        playbookId
      );

    playbooks.push({
      type:
        "PLAYBOOK",

      playbookId,

      name:
        document
          ?.name ||
        null,

      description:
        document
          ?.description ||
        null,

      semver:
        document
          ?.semver ||
        null,

      lifecycle:
        document
          ?.lifecycle ||
        null,

      apiVersion:
        document
          ?.apiVersion ||
        null,

      kind:
        document
          ?.kind ||
        null,

      tags:
        Array.isArray(
          document
            ?.tags
        )
          ? document.tags
          : [],

      file:
        relativeFile,

      filename:
        path.basename(
          file
        ),

      filenameValid:
        validatePlaybookFilename(
          path.basename(
            file
          )
        ),

      naming,

      runbookRefs:
        collectRunbookReferences(
          document
        ),
    });
  }

  // ==========================================================================
  // RUNBOOKS
  // ==========================================================================

  for (
    const file
    of runbookFiles
  ) {
    const loaded =
      loadYaml(
        file
      );

    const relativeFile =
      relativeToBackend(
        backendRoot,
        file
      );

    if (
      !loaded.valid
    ) {
      parseErrors.push({
        type:
          "RUNBOOK",

        file:
          relativeFile,

        error:
          loaded.error,
      });

      continue;
    }

    const document =
      loaded.document;

    const runbookId =
      document
        ?.runbookId
        ? String(
            document.runbookId
          )
            .trim()
            .toUpperCase()
        : null;

    const naming =
      validateRunbookId(
        runbookId
      );

    runbooks.push({
      type:
        "RUNBOOK",

      runbookId,

      name:
        document
          ?.name ||
        null,

      description:
        document
          ?.description ||
        null,

      semver:
        document
          ?.semver ||
        null,

      lifecycle:
        document
          ?.lifecycle ||
        null,

      apiVersion:
        document
          ?.apiVersion ||
        null,

      kind:
        document
          ?.kind ||
        null,

      tags:
        Array.isArray(
          document
            ?.tags
        )
          ? document.tags
          : [],

      file:
        relativeFile,

      filename:
        path.basename(
          file
        ),

      filenameValid:
        validateRunbookFilename(
          path.basename(
            file
          )
        ),

      naming,
    });
  }

  // ==========================================================================
  // RELATIONSHIP INTEGRITY
  // ==========================================================================

  const runbookIds =
    new Set(
      runbooks
        .map(
          (
            runbook
          ) =>
            runbook
              .runbookId
        )
        .filter(
          Boolean
        )
    );

  const referencedRunbookIds =
    new Set();

  const missingRunbookReferences =
    [];

  for (
    const playbook
    of playbooks
  ) {
    for (
      const reference
      of playbook
        .runbookRefs
    ) {
      referencedRunbookIds
        .add(
          reference
            .runbookId
        );

      if (
        !runbookIds
          .has(
            reference
              .runbookId
          )
      ) {
        missingRunbookReferences
          .push({
            playbookId:
              playbook
                .playbookId,

            runbookId:
              reference
                .runbookId,

            stageId:
              reference
                .stageId,

            stageName:
              reference
                .stageName,

            stageType:
              reference
                .stageType,

            required:
              reference
                .required,

            versionConstraint:
              reference
                .versionConstraint,

            file:
              playbook
                .file,
          });
      }
    }
  }

  // ==========================================================================
  // ORPHANS
  // ==========================================================================

  const orphanRunbooks =
    runbooks
      .filter(
        (
          runbook
        ) =>
          runbook
            .runbookId &&
          !referencedRunbookIds
            .has(
              runbook
                .runbookId
            )
      )
      .map(
        (
          runbook
        ) => ({
          runbookId:
            runbook
              .runbookId,

          file:
            runbook
              .file,
        })
      );

  // ==========================================================================
  // NAMING INTEGRITY
  // ==========================================================================

  const invalidNames = [
    ...playbooks
      .filter(
        (
          item
        ) =>
          !item
            .naming
            .valid
      )
      .map(
        (
          item
        ) => ({
          type:
            "PLAYBOOK",

          id:
            item
              .playbookId,

          file:
            item
              .file,

          errors:
            item
              .naming
              .errors,
        })
      ),

    ...runbooks
      .filter(
        (
          item
        ) =>
          !item
            .naming
            .valid
      )
      .map(
        (
          item
        ) => ({
          type:
            "RUNBOOK",

          id:
            item
              .runbookId,

          file:
            item
              .file,

          errors:
            item
              .naming
              .errors,
        })
      ),
  ];

  const legacyNames = [
    ...playbooks
      .filter(
        (
          item
        ) =>
          item
            .naming
            .classification ===
          "LEGACY_VALID"
      )
      .map(
        (
          item
        ) => ({
          type:
            "PLAYBOOK",

          id:
            item
              .playbookId,

          canonicalId:
            item
              .naming
              .canonicalId,

          file:
            item
              .file,
        })
      ),

    ...runbooks
      .filter(
        (
          item
        ) =>
          item
            .naming
            .classification ===
          "LEGACY_VALID"
      )
      .map(
        (
          item
        ) => ({
          type:
            "RUNBOOK",

          id:
            item
              .runbookId,

          canonicalId:
            item
              .naming
              .canonicalId,

          file:
            item
              .file,
        })
      ),
  ];

  const filenameIssues = [
    ...playbooks
      .filter(
        (
          item
        ) =>
          !item
            .filenameValid
      )
      .map(
        (
          item
        ) => ({
          type:
            "PLAYBOOK",

          id:
            item
              .playbookId,

          file:
            item
              .file,
        })
      ),

    ...runbooks
      .filter(
        (
          item
        ) =>
          !item
            .filenameValid
      )
      .map(
        (
          item
        ) => ({
          type:
            "RUNBOOK",

          id:
            item
              .runbookId,

          file:
            item
              .file,
        })
      ),
  ];

  // ==========================================================================
  // RESULT
  // ==========================================================================

  return {
    backendRoot,

    playbookRoot,

    runbookRoot,

    discoveredFiles: {
      playbooks:
        playbookFiles.length,

      runbooks:
        runbookFiles.length,

      total:
        playbookFiles.length +
        runbookFiles.length,
    },

    playbooks,

    runbooks,

    integrity: {
      parseErrors,

      duplicatePlaybookIds:
        findDuplicates(
          playbooks,
          "playbookId"
        ),

      duplicateRunbookIds:
        findDuplicates(
          runbooks,
          "runbookId"
        ),

      invalidNames,

      legacyNames,

      filenameIssues,

      missingRunbookReferences,

      orphanRunbooks,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  resolveBackendRoot,
  walkYamlFiles,
  loadYaml,
  collectRunbookReferences,
  scanCatalogue,
};