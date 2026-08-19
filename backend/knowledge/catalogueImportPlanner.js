'use strict';

/**
 * AIRA Catalogue Import Planner
 *
 * Phase 13.9
 *
 * Safely compares generated catalogue knowledge against the
 * physical production catalogue BEFORE any files are imported.
 *
 * IMPORTANT:
 *
 * This module is READ-ONLY.
 *
 * It does NOT:
 * - copy files
 * - overwrite files
 * - delete files
 * - activate Playbooks
 * - activate Runbooks
 * - mutate the physical catalogue
 *
 * Classification:
 *
 * NEW
 *   No existing definition uses the generated ID and the destination
 *   file does not already exist.
 *
 * EXISTING_IDENTICAL
 *   The same ID already exists and the canonical YAML content is
 *   semantically identical.
 *
 * ID_CONFLICT
 *   The generated ID already exists, but its definition differs.
 *
 * FILE_CONFLICT
 *   The intended destination file already exists but represents
 *   different knowledge.
 */

const fs =
  require(
    'fs'
  );

const path =
  require(
    'path'
  );

const yaml =
  require(
    'js-yaml'
  );


// ============================================================================
// CONSTANTS
// ============================================================================

const IMPORT_CLASSIFICATION =
  Object.freeze({
    NEW:
      'NEW',

    EXISTING_IDENTICAL:
      'EXISTING_IDENTICAL',

    ID_CONFLICT:
      'ID_CONFLICT',

    FILE_CONFLICT:
      'FILE_CONFLICT',
  });


const DEFAULT_BACKEND_ROOT =
  path.resolve(
    __dirname,
    '..'
  );


const DEFAULT_GENERATED_ROOT =
  path.resolve(
    __dirname,
    '.generated',
    'phase-13-kubernetes-pack'
  );


const DEFAULT_PLAYBOOK_ROOT =
  path.resolve(
    DEFAULT_BACKEND_ROOT,
    'playbooks',
    'catalogue'
  );


const DEFAULT_RUNBOOK_ROOT =
  path.resolve(
    DEFAULT_BACKEND_ROOT,
    'runbooks',
    'definitions'
  );


// ============================================================================
// HELPERS
// ============================================================================

function normalizePath(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /\\/g,
      '/'
    );
}


function walkYamlFiles(
  root
) {
  if (
    !root ||
    !fs.existsSync(
      root
    )
  ) {
    return [];
  }

  const results =
    [];

  const visit =
    currentPath => {
      let names;

      try {
        /*
         * Deliberately avoid Dirent.isDirectory().
         *
         * On Windows + OneDrive/reparse-point backed directories,
         * Dirent metadata can fail to classify nested catalogue folders
         * correctly. AIRA already encountered this with the Phase-13
         * physical catalogue scanner.
         *
         * fs.statSync() asks Windows for the actual target type.
         */
        names =
          fs.readdirSync(
            currentPath
          );
      } catch (
        error
      ) {
        const wrapped =
          new Error(
            `Unable to read catalogue directory "${currentPath}": ${error.message}`
          );

        wrapped.code =
          'CATALOGUE_IMPORT_DIRECTORY_READ_FAILED';

        throw wrapped;
      }

      for (
        const name
        of names
      ) {
        const absolutePath =
          path.join(
            currentPath,
            name
          );

        let stat;

        try {
          stat =
            fs.statSync(
              absolutePath
            );
        } catch (
          error
        ) {
          const wrapped =
            new Error(
              `Unable to inspect catalogue path "${absolutePath}": ${error.message}`
            );

          wrapped.code =
            'CATALOGUE_IMPORT_PATH_STAT_FAILED';

          throw wrapped;
        }

        if (
          stat.isDirectory()
        ) {
          visit(
            absolutePath
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
          absolutePath
        );
      }
    };

  visit(
    root
  );

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


function readYaml(
  filePath
) {
  const raw =
    fs.readFileSync(
      filePath,
      'utf8'
    );

  const parsed =
    yaml.load(
      raw
    );

  if (
    !parsed ||
    typeof parsed !== 'object'
  ) {
    throw new Error(
      `Invalid YAML object: ${filePath}`
    );
  }

  return parsed;
}


function detectKind(
  document,
  filePath
) {
  if (
    document?.playbookId
  ) {
    return 'PLAYBOOK';
  }

  if (
    document?.runbookId
  ) {
    return 'RUNBOOK';
  }

  const normalized =
    normalizePath(
      filePath
    )
      .toLowerCase();

  if (
    normalized.includes(
      '/playbooks/'
    )
  ) {
    return 'PLAYBOOK';
  }

  if (
    normalized.includes(
      '/runbooks/'
    )
  ) {
    return 'RUNBOOK';
  }

  return 'UNKNOWN';
}


function getDefinitionId(
  document,
  kind
) {
  if (
    kind === 'PLAYBOOK'
  ) {
    return (
      document?.playbookId ||
      document?.id ||
      null
    );
  }

  if (
    kind === 'RUNBOOK'
  ) {
    return (
      document?.runbookId ||
      document?.id ||
      null
    );
  }

  return (
    document?.playbookId ||
    document?.runbookId ||
    document?.id ||
    null
  );
}


// ============================================================================
// CANONICAL COMPARISON
// ============================================================================

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
    value &&
    typeof value === 'object'
  ) {
    const result =
      {};

    for (
      const key
      of Object.keys(
        value
      )
        .sort()
    ) {
      result[
        key
      ] =
        canonicalize(
          value[
            key
          ]
        );
    }

    return result;
  }

  return value;
}


function semanticFingerprint(
  document
) {
  return JSON.stringify(
    canonicalize(
      document
    )
  );
}


function documentsEqual(
  left,
  right
) {
  return (
    semanticFingerprint(
      left
    ) ===
    semanticFingerprint(
      right
    )
  );
}


// ============================================================================
// PHYSICAL CATALOGUE INDEX
// ============================================================================

function buildPhysicalIndex(
  options = {}
) {
  const playbookRoot =
    options.playbookRoot ||
    DEFAULT_PLAYBOOK_ROOT;

  const runbookRoot =
    options.runbookRoot ||
    DEFAULT_RUNBOOK_ROOT;

  const byId =
    new Map();

  const byDestination =
    new Map();

  const entries =
    [];


  const register =
    (
      filePath,
      kind,
      root
    ) => {
      const document =
        readYaml(
          filePath
        );

      const id =
        getDefinitionId(
          document,
          kind
        );

      const relativePath =
        normalizePath(
          path.relative(
            root,
            filePath
          )
        );

      const destinationKey =
        `${kind}:${relativePath}`;

      const entry = {
        id,
        kind,
        filePath,
        relativePath,
        destinationKey,
        document,
      };

      entries.push(
        entry
      );

      if (
        id
      ) {
        if (
          !byId.has(
            id
          )
        ) {
          byId.set(
            id,
            []
          );
        }

        byId
          .get(
            id
          )
          .push(
            entry
          );
      }

      byDestination.set(
        destinationKey,
        entry
      );
    };


  for (
    const filePath
    of walkYamlFiles(
      playbookRoot
    )
  ) {
    register(
      filePath,
      'PLAYBOOK',
      playbookRoot
    );
  }


  for (
    const filePath
    of walkYamlFiles(
      runbookRoot
    )
  ) {
    register(
      filePath,
      'RUNBOOK',
      runbookRoot
    );
  }


  return {
    playbookRoot,
    runbookRoot,

    entries,

    byId,
    byDestination,

    counts: {
      playbooks:
        entries.filter(
          entry =>
            entry.kind ===
            'PLAYBOOK'
        ).length,

      runbooks:
        entries.filter(
          entry =>
            entry.kind ===
            'RUNBOOK'
        ).length,

      total:
        entries.length,
    },
  };
}


// ============================================================================
// GENERATED PACK
// ============================================================================

function loadGeneratedPack(
  options = {}
) {
  const generatedRoot =
    options.generatedRoot ||
    DEFAULT_GENERATED_ROOT;

  const generatedPlaybookRoot =
    path.join(
      generatedRoot,
      'playbooks'
    );

  const generatedRunbookRoot =
    path.join(
      generatedRoot,
      'runbooks'
    );

  const entries =
    [];


  const register =
    (
      filePath,
      kind,
      root
    ) => {
      const document =
        readYaml(
          filePath
        );

      const id =
        getDefinitionId(
          document,
          kind
        );

      if (
        !id
      ) {
        throw new Error(
          `Generated ${kind} has no definition ID: ${filePath}`
        );
      }

      const relativePath =
        normalizePath(
          path.relative(
            root,
            filePath
          )
        );

      entries.push({
        id,
        kind,
        filePath,
        relativePath,
        document,
      });
    };


  for (
    const filePath
    of walkYamlFiles(
      generatedPlaybookRoot
    )
  ) {
    register(
      filePath,
      'PLAYBOOK',
      generatedPlaybookRoot
    );
  }


  for (
    const filePath
    of walkYamlFiles(
      generatedRunbookRoot
    )
  ) {
    register(
      filePath,
      'RUNBOOK',
      generatedRunbookRoot
    );
  }


  return {
    generatedRoot,

    entries,

    counts: {
      playbooks:
        entries.filter(
          entry =>
            entry.kind ===
            'PLAYBOOK'
        ).length,

      runbooks:
        entries.filter(
          entry =>
            entry.kind ===
            'RUNBOOK'
        ).length,

      total:
        entries.length,
    },
  };
}


// ============================================================================
// CLASSIFICATION
// ============================================================================

function classifyGeneratedEntry(
  generatedEntry,
  physicalIndex
) {
  const existingById =
    physicalIndex
      .byId
      .get(
        generatedEntry.id
      ) ||
    [];

  const destinationKey =
    `${
      generatedEntry.kind
    }:${
      generatedEntry.relativePath
    }`;

  const existingAtDestination =
    physicalIndex
      .byDestination
      .get(
        destinationKey
      ) ||
    null;


  // --------------------------------------------------------------------------
  // Existing ID
  // --------------------------------------------------------------------------

  if (
    existingById.length >
    0
  ) {
    const identical =
      existingById.find(
        existing =>
          documentsEqual(
            existing.document,
            generatedEntry.document
          )
      );

    if (
      identical
    ) {
      return {
        classification:
          IMPORT_CLASSIFICATION
            .EXISTING_IDENTICAL,

        reason:
          'Definition ID already exists with semantically identical content.',

        existing:
          identical,
      };
    }

    return {
      classification:
        IMPORT_CLASSIFICATION
          .ID_CONFLICT,

      reason:
        'Definition ID already exists but generated content differs.',

      existing:
        existingById[
          0
        ],
    };
  }


  // --------------------------------------------------------------------------
  // Existing destination file
  // --------------------------------------------------------------------------

  if (
    existingAtDestination
  ) {
    if (
      documentsEqual(
        existingAtDestination
          .document,

        generatedEntry
          .document
      )
    ) {
      return {
        classification:
          IMPORT_CLASSIFICATION
            .EXISTING_IDENTICAL,

        reason:
          'Destination file already contains semantically identical knowledge.',

        existing:
          existingAtDestination,
      };
    }

    return {
      classification:
        IMPORT_CLASSIFICATION
          .FILE_CONFLICT,

      reason:
        'Destination file already exists and contains different knowledge.',

      existing:
        existingAtDestination,
    };
  }


  // --------------------------------------------------------------------------
  // New
  // --------------------------------------------------------------------------

  return {
    classification:
      IMPORT_CLASSIFICATION
        .NEW,

    reason:
      'No matching definition ID or destination file exists.',

    existing:
      null,
  };
}


// ============================================================================
// BUILD IMPORT PLAN
// ============================================================================

function buildCatalogueImportPlan(
  options = {}
) {
  const physical =
    buildPhysicalIndex(
      options
    );

  const generated =
    loadGeneratedPack(
      options
    );

  const items =
    generated
      .entries
      .map(
        generatedEntry => {
          const result =
            classifyGeneratedEntry(
              generatedEntry,
              physical
            );

          const destinationRoot =
            generatedEntry.kind ===
            'PLAYBOOK'
              ? physical.playbookRoot
              : physical.runbookRoot;

          const destinationPath =
            path.join(
              destinationRoot,
              generatedEntry.relativePath
            );

          return {
            id:
              generatedEntry.id,

            kind:
              generatedEntry.kind,

            sourcePath:
              generatedEntry.filePath,

            relativePath:
              generatedEntry.relativePath,

            destinationPath,

            classification:
              result.classification,

            reason:
              result.reason,

            existingPath:
              result.existing
                ?.filePath ||
              null,
          };
        }
      );


  const count =
    classification =>
      items.filter(
        item =>
          item.classification ===
          classification
      ).length;


  const counts = {
    generated:
      items.length,

    new:
      count(
        IMPORT_CLASSIFICATION
          .NEW
      ),

    existingIdentical:
      count(
        IMPORT_CLASSIFICATION
          .EXISTING_IDENTICAL
      ),

    idConflicts:
      count(
        IMPORT_CLASSIFICATION
          .ID_CONFLICT
      ),

    fileConflicts:
      count(
        IMPORT_CLASSIFICATION
          .FILE_CONFLICT
      ),
  };


  const safeToImport =
    (
      counts.idConflicts ===
      0
    ) &&
    (
      counts.fileConflicts ===
      0
    );


  return {
    generatedRoot:
      generated.generatedRoot,

    physicalCatalogue: {
      playbookRoot:
        physical.playbookRoot,

      runbookRoot:
        physical.runbookRoot,

      counts:
        physical.counts,
    },

    generatedCounts:
      generated.counts,

    counts,

    safeToImport,

    items,
  };
}


// ============================================================================
// REPORTING
// ============================================================================

function printCatalogueImportPlan(
  plan
) {
  console.log(
    '\n========================================'
  );

  console.log(
    'AIRA CATALOGUE IMPORT PLAN'
  );

  console.log(
    '========================================'
  );


  console.log(
    '\nPhysical catalogue:'
  );

  console.log(
    `  Playbooks: ${
      plan.physicalCatalogue
        .counts
        .playbooks
    }`
  );

  console.log(
    `  Runbooks:  ${
      plan.physicalCatalogue
        .counts
        .runbooks
    }`
  );

  console.log(
    `  Total:     ${
      plan.physicalCatalogue
        .counts
        .total
    }`
  );


  console.log(
    '\nGenerated pack:'
  );

  console.log(
    `  Playbooks: ${
      plan.generatedCounts
        .playbooks
    }`
  );

  console.log(
    `  Runbooks:  ${
      plan.generatedCounts
        .runbooks
    }`
  );

  console.log(
    `  Total:     ${
      plan.generatedCounts
        .total
    }`
  );


  console.log(
    '\nClassification:'
  );

  console.log(
    `  NEW:                ${
      plan.counts.new
    }`
  );

  console.log(
    `  EXISTING_IDENTICAL: ${
      plan.counts.existingIdentical
    }`
  );

  console.log(
    `  ID_CONFLICT:        ${
      plan.counts.idConflicts
    }`
  );

  console.log(
    `  FILE_CONFLICT:      ${
      plan.counts.fileConflicts
    }`
  );


  console.log(
    '\nDefinitions:'
  );


  for (
    const item
    of plan.items
  ) {
    console.log(
      `\n[${item.classification}] ${item.id}`
    );

    console.log(
      `  Kind: ${item.kind}`
    );

    console.log(
      `  Destination: ${item.destinationPath}`
    );

    console.log(
      `  Reason: ${item.reason}`
    );

    if (
      item.existingPath
    ) {
      console.log(
        `  Existing: ${item.existingPath}`
      );
    }
  }


  console.log(
    '\n----------------------------------------'
  );

  console.log(
    `SAFE TO IMPORT: ${
      plan.safeToImport
        ? 'YES'
        : 'NO'
    }`
  );

  console.log(
    '----------------------------------------\n'
  );
}


// ============================================================================
// CLI
// ============================================================================

if (
  require.main ===
  module
) {
  try {
    const plan =
      buildCatalogueImportPlan();

    printCatalogueImportPlan(
      plan
    );

    if (
      !plan.safeToImport
    ) {
      process.exitCode =
        1;
    }
  } catch (
    error
  ) {
    console.error(
      '\n[catalogue-import-planner] Failed'
    );

    console.error(
      error.stack ||
      error.message ||
      error
    );

    process.exitCode =
      1;
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  IMPORT_CLASSIFICATION,

  DEFAULT_BACKEND_ROOT,
  DEFAULT_GENERATED_ROOT,
  DEFAULT_PLAYBOOK_ROOT,
  DEFAULT_RUNBOOK_ROOT,

  walkYamlFiles,
  readYaml,
  detectKind,
  getDefinitionId,

  canonicalize,
  semanticFingerprint,
  documentsEqual,

  buildPhysicalIndex,
  loadGeneratedPack,
  classifyGeneratedEntry,
  buildCatalogueImportPlan,
  printCatalogueImportPlan,
};