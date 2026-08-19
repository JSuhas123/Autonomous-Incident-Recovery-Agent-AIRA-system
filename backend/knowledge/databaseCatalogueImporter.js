'use strict';

/**
 * Phase 13.11I — Database Catalogue Importer
 *
 * Promotes the already-generated and validated database knowledge pack
 * into AIRA's physical catalogue.
 *
 * SAFETY:
 * - fail closed
 * - never overwrite conflicting definitions
 * - refuse duplicate IDs
 * - refuse destination file conflicts
 * - identical definitions may be skipped
 * - staging remains separate from production catalogue
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    '..'
  );

const GENERATED_ROOT =
  path.resolve(
    __dirname,
    '.generated',
    'phase-13-database-pack'
  );

const GENERATED_PLAYBOOK_ROOT =
  path.join(
    GENERATED_ROOT,
    'playbooks'
  );

const GENERATED_RUNBOOK_ROOT =
  path.join(
    GENERATED_ROOT,
    'runbooks'
  );

const PHYSICAL_PLAYBOOK_ROOT =
  path.join(
    BACKEND_ROOT,
    'playbooks',
    'catalogue'
  );

const PHYSICAL_RUNBOOK_ROOT =
  path.join(
    BACKEND_ROOT,
    'runbooks',
    'definitions'
  );


// ============================================================================
// FILE HELPERS
// ============================================================================

function walkYamlFiles(
  root
) {
  if (
    !fs.existsSync(
      root
    )
  ) {
    return [];
  }

  const result = [];

  function walk(
    current
  ) {
    for (
      const name
      of fs.readdirSync(
        current
      )
    ) {
      const absolute =
        path.join(
          current,
          name
        );

      const stat =
        fs.statSync(
          absolute
        );

      if (
        stat.isDirectory()
      ) {
        walk(
          absolute
        );

        continue;
      }

      if (
        /\.ya?ml$/i.test(
          name
        )
      ) {
        result.push(
          absolute
        );
      }
    }
  }

  walk(
    root
  );

  return result.sort();
}


function readYaml(
  file
) {
  return yaml.load(
    fs.readFileSync(
      file,
      'utf8'
    )
  );
}


function definitionId(
  document
) {
  return (
    document?.playbookId ||
    document?.runbookId ||
    document?.id ||
    null
  );
}


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
    typeof value ===
      'object'
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            canonicalize(
              value[key]
            );

          return result;
        },
        {}
      );
  }

  return value;
}


function documentsEqual(
  left,
  right
) {
  return (
    JSON.stringify(
      canonicalize(
        left
      )
    ) ===
    JSON.stringify(
      canonicalize(
        right
      )
    )
  );
}


// ============================================================================
// PHYSICAL INDEX
// ============================================================================

function buildPhysicalIndex() {
  const byId =
    new Map();

  const byFile =
    new Map();

  function ingest(
    root,
    kind
  ) {
    for (
      const file
      of walkYamlFiles(
        root
      )
    ) {
      const document =
        readYaml(
          file
        );

      const id =
        definitionId(
          document
        );

      const entry = {
        id,
        kind,
        file,
        document,
      };

      if (
        id
      ) {
        if (
          byId.has(
            id
          )
        ) {
          const existing =
            byId.get(
              id
            );

          throw new Error(
            `Physical catalogue already contains duplicate ID ${id}: ${existing.file} and ${file}`
          );
        }

        byId.set(
          id,
          entry
        );
      }

      byFile.set(
        path.resolve(
          file
        ),
        entry
      );
    }
  }

  ingest(
    PHYSICAL_PLAYBOOK_ROOT,
    'PLAYBOOK'
  );

  ingest(
    PHYSICAL_RUNBOOK_ROOT,
    'RUNBOOK'
  );

  return {
    byId,
    byFile,
  };
}


// ============================================================================
// GENERATED DEFINITIONS
// ============================================================================

function loadGeneratedDefinitions() {
  const definitions = [];

  function ingest(
    generatedRoot,
    physicalRoot,
    kind
  ) {
    for (
      const source
      of walkYamlFiles(
        generatedRoot
      )
    ) {
      const document =
        readYaml(
          source
        );

      const id =
        definitionId(
          document
        );

      if (
        !id
      ) {
        throw new Error(
          `Generated ${kind} has no definition ID: ${source}`
        );
      }

      const relative =
        path.relative(
          generatedRoot,
          source
        );

      if (
        relative.startsWith(
          '..'
        ) ||
        path.isAbsolute(
          relative
        )
      ) {
        throw new Error(
          `Generated ${kind} escapes staging root: ${source}`
        );
      }

      const destination =
        path.resolve(
          physicalRoot,
          relative
        );

      const relativeDestination =
        path.relative(
          physicalRoot,
          destination
        );

      if (
        relativeDestination.startsWith(
          '..'
        ) ||
        path.isAbsolute(
          relativeDestination
        )
      ) {
        throw new Error(
          `Unsafe catalogue destination: ${destination}`
        );
      }

      definitions.push({
        id,
        kind,
        source,
        destination,
        relative,
        document,
      });
    }
  }

  ingest(
    GENERATED_PLAYBOOK_ROOT,
    PHYSICAL_PLAYBOOK_ROOT,
    'PLAYBOOK'
  );

  ingest(
    GENERATED_RUNBOOK_ROOT,
    PHYSICAL_RUNBOOK_ROOT,
    'RUNBOOK'
  );

  return definitions;
}


// ============================================================================
// PLAN
// ============================================================================

function buildDatabaseImportPlan() {
  const physical =
    buildPhysicalIndex();

  const generated =
    loadGeneratedDefinitions();

  const seenGeneratedIds =
    new Set();

  const entries = [];


  for (
    const item
    of generated
  ) {
    if (
      seenGeneratedIds.has(
        item.id
      )
    ) {
      entries.push({
        ...item,

        classification:
          'ID_CONFLICT',

        reason:
          'Generated staging pack contains duplicate definition ID.',
      });

      continue;
    }

    seenGeneratedIds.add(
      item.id
    );


    const existingById =
      physical.byId.get(
        item.id
      );

    const existingByFile =
      physical.byFile.get(
        path.resolve(
          item.destination
        )
      );


    if (
      existingById
    ) {
      if (
        path.resolve(
          existingById.file
        ) ===
          path.resolve(
            item.destination
          ) &&
        documentsEqual(
          existingById.document,
          item.document
        )
      ) {
        entries.push({
          ...item,

          classification:
            'EXISTING_IDENTICAL',

          reason:
            'Definition already exists at destination with identical canonical content.',
        });

        continue;
      }

      entries.push({
        ...item,

        classification:
          'ID_CONFLICT',

        reason:
          `Definition ID already exists at ${existingById.file}.`,
      });

      continue;
    }


    if (
      existingByFile
    ) {
      entries.push({
        ...item,

        classification:
          'FILE_CONFLICT',

        reason:
          `Destination file already belongs to ${existingByFile.id || 'another definition'}.`,
      });

      continue;
    }


    if (
      fs.existsSync(
        item.destination
      )
    ) {
      entries.push({
        ...item,

        classification:
          'FILE_CONFLICT',

        reason:
          'Destination path already exists but is not safely indexed as this definition.',
      });

      continue;
    }


    entries.push({
      ...item,

      classification:
        'NEW',

      reason:
        'No matching definition ID or destination file exists.',
    });
  }


  const counts = {
    NEW:
      0,

    EXISTING_IDENTICAL:
      0,

    ID_CONFLICT:
      0,

    FILE_CONFLICT:
      0,
  };


  for (
    const entry
    of entries
  ) {
    counts[
      entry.classification
    ] += 1;
  }


  const safeToImport =
    counts.ID_CONFLICT ===
      0 &&
    counts.FILE_CONFLICT ===
      0;


  return {
    generatedRoot:
      GENERATED_ROOT,

    entries,

    counts,

    generatedCounts: {
      playbooks:
        generated.filter(
          item =>
            item.kind ===
            'PLAYBOOK'
        ).length,

      runbooks:
        generated.filter(
          item =>
            item.kind ===
            'RUNBOOK'
        ).length,

      total:
        generated.length,
    },

    safeToImport,
  };
}


// ============================================================================
// IMPORT
// ============================================================================

function importDatabasePack(
  options = {}
) {
  const plan =
    buildDatabaseImportPlan();

  if (
    !plan.safeToImport
  ) {
    const error =
      new Error(
        'Database catalogue import refused because conflicts were detected.'
      );

    error.plan =
      plan;

    throw error;
  }


  if (
    options.dryRun ===
    true
  ) {
    return {
      ...plan,

      imported:
        [],

      skipped:
        plan.entries
          .filter(
            entry =>
              entry.classification ===
              'EXISTING_IDENTICAL'
          )
          .map(
            entry =>
              entry.id
          ),

      dryRun:
        true,
    };
  }


  const imported = [];
  const skipped = [];


  for (
    const entry
    of plan.entries
  ) {
    if (
      entry.classification ===
      'EXISTING_IDENTICAL'
    ) {
      skipped.push(
        entry.id
      );

      continue;
    }


    if (
      entry.classification !==
      'NEW'
    ) {
      throw new Error(
        `Unexpected import classification ${entry.classification} for ${entry.id}`
      );
    }


    fs.mkdirSync(
      path.dirname(
        entry.destination
      ),
      {
        recursive:
          true,
      }
    );


    /*
     * COPY THE ALREADY-VALIDATED YAML.
     *
     * Do not regenerate here.
     */
    fs.copyFileSync(
      entry.source,
      entry.destination,
      fs.constants.COPYFILE_EXCL
    );


    imported.push({
      id:
        entry.id,

      kind:
        entry.kind,

      source:
        entry.source,

      destination:
        entry.destination,
    });
  }


  return {
    ...plan,

    imported,

    skipped,

    dryRun:
      false,
  };
}


// ============================================================================
// REPORTING
// ============================================================================

function printPlan(
  plan
) {
  console.log(
    '\n========================================'
  );

  console.log(
    'AIRA DATABASE CATALOGUE IMPORT PLAN'
  );

  console.log(
    '========================================\n'
  );

  console.log(
    'Generated pack:'
  );

  console.log(
    `  Playbooks: ${plan.generatedCounts.playbooks}`
  );

  console.log(
    `  Runbooks:  ${plan.generatedCounts.runbooks}`
  );

  console.log(
    `  Total:     ${plan.generatedCounts.total}`
  );


  console.log(
    '\nClassification:'
  );

  console.log(
    `  NEW:                ${plan.counts.NEW}`
  );

  console.log(
    `  EXISTING_IDENTICAL: ${plan.counts.EXISTING_IDENTICAL}`
  );

  console.log(
    `  ID_CONFLICT:        ${plan.counts.ID_CONFLICT}`
  );

  console.log(
    `  FILE_CONFLICT:      ${plan.counts.FILE_CONFLICT}`
  );


  console.log(
    '\nDefinitions:\n'
  );


  for (
    const entry
    of plan.entries
  ) {
    console.log(
      `[${entry.classification}] ${entry.id}`
    );

    console.log(
      `  Kind: ${entry.kind}`
    );

    console.log(
      `  Destination: ${entry.destination}`
    );

    console.log(
      `  Reason: ${entry.reason}\n`
    );
  }


  console.log(
    '----------------------------------------'
  );

  console.log(
    `SAFE TO IMPORT: ${
      plan.safeToImport
        ? 'YES'
        : 'NO'
    }`
  );

  console.log(
    '----------------------------------------'
  );
}


// ============================================================================
// CLI
// ============================================================================

function runCli() {
  const args =
    process.argv.slice(
      2
    );

  const apply =
    args.includes(
      '--apply'
    );


  try {
    const plan =
      buildDatabaseImportPlan();

    printPlan(
      plan
    );


    if (
      !apply
    ) {
      console.log(
        '\nPlanning only. No catalogue files were changed.'
      );

      console.log(
        'Use --apply only after the complete validation suite is green.'
      );

      return;
    }


    if (
      !plan.safeToImport
    ) {
      console.error(
        '\nImport refused.'
      );

      process.exitCode =
        1;

      return;
    }


    const result =
      importDatabasePack();


    console.log(
      '\nDatabase catalogue import completed.'
    );

    console.log(
      `Imported: ${result.imported.length}`
    );

    console.log(
      `Skipped identical: ${result.skipped.length}`
    );
  } catch (
    error
  ) {
    console.error(
      '\n[database-import] Failed'
    );

    console.error(
      error.message
    );

    process.exitCode =
      1;
  }
}


if (
  require.main ===
  module
) {
  runCli();
}


module.exports = {
  GENERATED_ROOT,
  PHYSICAL_PLAYBOOK_ROOT,
  PHYSICAL_RUNBOOK_ROOT,

  walkYamlFiles,
  readYaml,
  definitionId,
  documentsEqual,

  buildPhysicalIndex,
  loadGeneratedDefinitions,
  buildDatabaseImportPlan,
  importDatabasePack,
};