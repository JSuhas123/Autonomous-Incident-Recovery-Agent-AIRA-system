'use strict';

/**
 * AIRA Catalogue Importer
 *
 * Phase 13.9
 *
 * Safely imports generated knowledge-pack definitions into the
 * physical AIRA catalogue.
 *
 * GUARANTEES:
 *
 * - planner must report SAFE TO IMPORT
 * - only NEW definitions are written
 * - existing files are NEVER overwritten
 * - source YAML is parsed before import
 * - destination paths are constrained to catalogue roots
 * - exclusive filesystem writes use flag "wx"
 * - partial imports are rolled back if a write fails
 * - EXISTING_IDENTICAL entries are skipped
 * - conflicts cause fail-closed behaviour
 *
 * This utility imports KNOWLEDGE ONLY.
 *
 * It does NOT:
 * - activate lifecycle states
 * - register handlers
 * - execute Runbooks
 * - mutate infrastructure
 */

const fs =
  require(
    'fs'
  );

const path =
  require(
    'path'
  );

const {
  IMPORT_CLASSIFICATION,
  buildCatalogueImportPlan,
  readYaml,
} =
  require(
    './catalogueImportPlanner'
  );


// ============================================================================
// SAFETY HELPERS
// ============================================================================

function assertDestinationInsideRoot(
  destinationPath,
  allowedRoot
) {
  const resolvedDestination =
    path.resolve(
      destinationPath
    );

  const resolvedRoot =
    path.resolve(
      allowedRoot
    );

  const relative =
    path.relative(
      resolvedRoot,
      resolvedDestination
    );

  if (
    relative ===
      '' ||
    (
      !relative.startsWith(
        '..'
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  ) {
    return;
  }

  const error =
    new Error(
      `Import destination escapes catalogue root: ${destinationPath}`
    );

  error.code =
    'CATALOGUE_IMPORT_ROOT_ESCAPE';

  throw error;
}


function assertImportPlanSafe(
  plan
) {
  if (
    !plan
  ) {
    const error =
      new Error(
        'Catalogue import plan is required.'
      );

    error.code =
      'CATALOGUE_IMPORT_PLAN_REQUIRED';

    throw error;
  }

  if (
    plan.safeToImport !==
    true
  ) {
    const error =
      new Error(
        'Catalogue import blocked because the import plan contains conflicts.'
      );

    error.code =
      'CATALOGUE_IMPORT_CONFLICT';

    throw error;
  }

  const unsupported =
    plan.items.filter(
      item =>
        !Object.values(
          IMPORT_CLASSIFICATION
        ).includes(
          item.classification
        )
    );

  if (
    unsupported.length >
    0
  ) {
    const error =
      new Error(
        'Catalogue import plan contains unsupported classifications.'
      );

    error.code =
      'CATALOGUE_IMPORT_CLASSIFICATION_INVALID';

    throw error;
  }
}


// ============================================================================
// PREFLIGHT
// ============================================================================

function buildImportPreflight(
  options = {}
) {
  const plan =
    options.plan ||
    buildCatalogueImportPlan(
      options
    );

  assertImportPlanSafe(
    plan
  );

  const newItems =
    plan.items.filter(
      item =>
        item.classification ===
        IMPORT_CLASSIFICATION.NEW
    );

  const skipped =
    plan.items.filter(
      item =>
        item.classification ===
        IMPORT_CLASSIFICATION.EXISTING_IDENTICAL
    );

  const prepared =
    [];

  for (
    const item
    of newItems
  ) {
    const allowedRoot =
      item.kind ===
        'PLAYBOOK'
        ? plan
            .physicalCatalogue
            .playbookRoot
        : plan
            .physicalCatalogue
            .runbookRoot;

    assertDestinationInsideRoot(
      item.destinationPath,
      allowedRoot
    );

    if (
      !fs.existsSync(
        item.sourcePath
      )
    ) {
      const error =
        new Error(
          `Generated source does not exist: ${item.sourcePath}`
        );

      error.code =
        'CATALOGUE_IMPORT_SOURCE_MISSING';

      throw error;
    }

    /*
     * Parse every YAML document during preflight.
     *
     * If one generated document is malformed, NOTHING is imported.
     */
    const document =
      readYaml(
        item.sourcePath
      );

    const sourceId =
      item.kind ===
        'PLAYBOOK'
        ? document
            ?.playbookId
        : document
            ?.runbookId;

    if (
      sourceId !==
      item.id
    ) {
      const error =
        new Error(
          `Generated source ID mismatch for ${item.id}. Found ${sourceId || 'none'}.`
        );

      error.code =
        'CATALOGUE_IMPORT_SOURCE_ID_MISMATCH';

      throw error;
    }

    /*
     * Destination must still be absent immediately before import.
     *
     * This protects against filesystem changes that occurred after
     * the planner was executed.
     */
    if (
      fs.existsSync(
        item.destinationPath
      )
    ) {
      const error =
        new Error(
          `Destination appeared after planning: ${item.destinationPath}`
        );

      error.code =
        'CATALOGUE_IMPORT_DESTINATION_EXISTS';

      throw error;
    }

    const raw =
      fs.readFileSync(
        item.sourcePath,
        'utf8'
      );

    prepared.push({
      ...item,

      raw,
    });
  }

  return {
    plan,

    prepared,

    skipped,

    counts: {
      totalGenerated:
        plan.items.length,

      new:
        prepared.length,

      skippedIdentical:
        skipped.length,
    },
  };
}


// ============================================================================
// DRY RUN
// ============================================================================

function dryRunCatalogueImport(
  options = {}
) {
  const preflight =
    buildImportPreflight(
      options
    );

  return {
    applied:
      false,

    dryRun:
      true,

    counts:
      preflight.counts,

    items:
      preflight.prepared.map(
        item => ({
          id:
            item.id,

          kind:
            item.kind,

          sourcePath:
            item.sourcePath,

          destinationPath:
            item.destinationPath,

          status:
            'WOULD_CREATE',
        })
      ),

    skipped:
      preflight.skipped,
  };
}


// ============================================================================
// APPLY IMPORT
// ============================================================================

function importCatalogue(
  options = {}
) {
  const preflight =
    buildImportPreflight(
      options
    );

  const created =
    [];

  try {
    for (
      const item
      of preflight.prepared
    ) {
      fs.mkdirSync(
        path.dirname(
          item.destinationPath
        ),
        {
          recursive:
            true,
        }
      );

      /*
       * wx = create exclusively.
       *
       * Even if another process creates the target between preflight
       * and this write, Node refuses to overwrite it.
       */
      fs.writeFileSync(
        item.destinationPath,
        item.raw,
        {
          encoding:
            'utf8',

          flag:
            'wx',
        }
      );

      created.push({
        id:
          item.id,

        kind:
          item.kind,

        sourcePath:
          item.sourcePath,

        destinationPath:
          item.destinationPath,

        status:
          'CREATED',
      });
    }

    return {
      applied:
        true,

      dryRun:
        false,

      counts: {
        totalGenerated:
          preflight.counts
            .totalGenerated,

        created:
          created.length,

        skippedIdentical:
          preflight.counts
            .skippedIdentical,
      },

      created,

      skipped:
        preflight.skipped,
    };
  } catch (
    error
  ) {
    /*
     * Roll back only files created by THIS invocation.
     *
     * Never touch anything that existed before the import.
     */
    const rollbackErrors =
      [];

    for (
      const item
      of [
        ...created,
      ].reverse()
    ) {
      try {
        if (
          fs.existsSync(
            item.destinationPath
          )
        ) {
          fs.unlinkSync(
            item.destinationPath
          );
        }
      } catch (
        rollbackError
      ) {
        rollbackErrors.push({
          destinationPath:
            item.destinationPath,

          error:
            rollbackError.message,
        });
      }
    }

    const wrapped =
      new Error(
        `Catalogue import failed and rollback was attempted: ${error.message}`
      );

    wrapped.code =
      'CATALOGUE_IMPORT_FAILED';

    wrapped.cause =
      error;

    wrapped.createdBeforeFailure =
      created;

    wrapped.rollbackErrors =
      rollbackErrors;

    throw wrapped;
  }
}


// ============================================================================
// REPORTING
// ============================================================================

function printDryRun(
  result
) {
  console.log(
    '\n========================================'
  );

  console.log(
    'AIRA CATALOGUE IMPORT — DRY RUN'
  );

  console.log(
    '========================================'
  );

  console.log(
    `\nGenerated:         ${result.counts.totalGenerated}`
  );

  console.log(
    `Would create:      ${result.counts.new}`
  );

  console.log(
    `Existing identical:${result.counts.skippedIdentical}`
  );

  console.log(
    '\nOperations:'
  );

  for (
    const item
    of result.items
  ) {
    console.log(
      `\n[WOULD_CREATE] ${item.id}`
    );

    console.log(
      `  ${item.destinationPath}`
    );
  }

  console.log(
    '\nNo physical catalogue files were modified.\n'
  );
}


function printImportResult(
  result
) {
  console.log(
    '\n========================================'
  );

  console.log(
    'AIRA CATALOGUE IMPORT COMPLETE'
  );

  console.log(
    '========================================'
  );

  console.log(
    `\nGenerated:          ${result.counts.totalGenerated}`
  );

  console.log(
    `Created:            ${result.counts.created}`
  );

  console.log(
    `Existing identical: ${result.counts.skippedIdentical}`
  );

  console.log(
    '\nCreated definitions:'
  );

  for (
    const item
    of result.created
  ) {
    console.log(
      `\n[CREATED] ${item.id}`
    );

    console.log(
      `  ${item.destinationPath}`
    );
  }

  console.log(
    '\nImport completed without overwriting existing knowledge.\n'
  );
}


// ============================================================================
// CLI
// ============================================================================

if (
  require.main ===
  module
) {
  const args =
    process.argv.slice(
      2
    );

  const apply =
    args.includes(
      '--apply'
    );

  try {
    if (
      !apply
    ) {
      const result =
        dryRunCatalogueImport();

      printDryRun(
        result
      );

      console.log(
        'Use --apply to perform the import.'
      );
    } else {
      const result =
        importCatalogue();

      printImportResult(
        result
      );
    }
  } catch (
    error
  ) {
    console.error(
      '\n[catalogue-import] FAILED'
    );

    console.error(
      error.stack ||
      error.message ||
      error
    );

    if (
      Array.isArray(
        error.rollbackErrors
      ) &&
      error.rollbackErrors.length >
        0
    ) {
      console.error(
        '\nRollback errors:'
      );

      for (
        const rollbackError
        of error.rollbackErrors
      ) {
        console.error(
          rollbackError
        );
      }
    }

    process.exitCode =
      1;
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  assertDestinationInsideRoot,
  assertImportPlanSafe,
  buildImportPreflight,

  dryRunCatalogueImport,
  importCatalogue,

  printDryRun,
  printImportResult,
};