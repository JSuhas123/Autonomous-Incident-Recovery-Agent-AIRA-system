"use strict";

require(
  "dotenv"
).config();

const mongoose =
  require(
    "mongoose"
  );

const BackfillRunner =
  require(
    "../persistence/migration/BackfillRunner"
  );

const MigrationDomainRegistry =
  require(
    "../persistence/migration/MigrationDomainRegistry"
  );

const {
  getMigrationConfig,
} =
  require(
    "../config/migration"
  );

const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(
  argv
) {
  const args = {
    organizationId:
      null,

    environmentId:
      null,

    tenantId:
      null,

    domain:
      null,

    batchSize:
      undefined,

    failurePolicy:
      undefined,

    maxDocuments:
      undefined,

    dryRun:
      false,

    resume:
      true,
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const token =
      argv[index];

    switch (
      token
    ) {
      case "--organization":
        args.organizationId =
          argv[
            index + 1
          ];

        index += 1;
        break;

      case "--environment":
        args.environmentId =
          argv[
            index + 1
          ];

        index += 1;
        break;

      case "--tenant":
        args.tenantId =
          argv[
            index + 1
          ];

        index += 1;
        break;

      case "--domain":
        args.domain =
          argv[
            index + 1
          ];

        index += 1;
        break;

      case "--batch-size":
        args.batchSize =
          Number.parseInt(
            argv[
              index + 1
            ],
            10
          );

        index += 1;
        break;

      case "--failure-policy":
        args.failurePolicy =
          argv[
            index + 1
          ];

        index += 1;
        break;

      case "--max-documents":
        args.maxDocuments =
          Number.parseInt(
            argv[
              index + 1
            ],
            10
          );

        index += 1;
        break;

      case "--dry-run":
        args.dryRun =
          true;
        break;

      case "--resume":
        args.resume =
          true;
        break;

      case "--no-resume":
        args.resume =
          false;
        break;

      default:
        throw Object.assign(
          new Error(
            `Unknown backfill argument: ${token}`
          ),
          {
            code:
              "MIGRATION_CLI_ARGUMENT_INVALID",
          }
        );
    }
  }

  return args;
}

// ============================================================================
// ARGUMENT VALIDATION
// ============================================================================

function assertArgs(
  args
) {
  if (
    !args.organizationId
  ) {
    throw Object.assign(
      new Error(
        "--organization is required"
      ),
      {
        code:
          "MIGRATION_ORGANIZATION_REQUIRED",
      }
    );
  }

  if (
    !args.environmentId
  ) {
    throw Object.assign(
      new Error(
        "--environment is required"
      ),
      {
        code:
          "MIGRATION_ENVIRONMENT_REQUIRED",
      }
    );
  }

  if (
    args.batchSize !==
      undefined &&
    (
      !Number.isInteger(
        args.batchSize
      ) ||
      args.batchSize < 1 ||
      args.batchSize > 5000
    )
  ) {
    throw Object.assign(
      new Error(
        "--batch-size must be between 1 and 5000"
      ),
      {
        code:
          "MIGRATION_BATCH_SIZE_INVALID",
      }
    );
  }

  if (
    args.maxDocuments !==
      undefined &&
    (
      !Number.isInteger(
        args.maxDocuments
      ) ||
      args.maxDocuments < 1
    )
  ) {
    throw Object.assign(
      new Error(
        "--max-documents must be positive"
      ),
      {
        code:
          "MIGRATION_MAX_DOCUMENTS_INVALID",
      }
    );
  }

  if (
    args.failurePolicy !==
      undefined &&
    ![
      "fail-fast",
      "continue",
    ]
      .includes(
        args.failurePolicy
      )
  ) {
    throw Object.assign(
      new Error(
        "--failure-policy must be fail-fast or continue"
      ),
      {
        code:
          "MIGRATION_FAILURE_POLICY_INVALID",
      }
    );
  }

  if (
    args.domain
  ) {
    const registry =
      new MigrationDomainRegistry();

    registry.get(
      args.domain
    );
  }
}

// ============================================================================
// MONGODB CONNECTION
// ============================================================================

async function connectMongo() {
  const mongoUri =
    process.env
      .MONGODB_URI ||
    process.env
      .MONGO_URI;

  if (
    !mongoUri
  ) {
    throw Object.assign(
      new Error(
        "MONGODB_URI or MONGO_URI is required for backfill"
      ),
      {
        code:
          "MONGODB_URI_REQUIRED",
      }
    );
  }

  /*
   * Avoid reconnecting when this script is invoked from tests
   * or another process that already established Mongoose.
   *
   * readyState:
   *
   * 0 = disconnected
   * 1 = connected
   * 2 = connecting
   * 3 = disconnecting
   */
  if (
    mongoose.connection
      .readyState ===
    1
  ) {
    return;
  }

  if (
    mongoose.connection
      .readyState ===
    2
  ) {
    await new Promise(
      (
        resolve,
        reject
      ) => {
        mongoose.connection
          .once(
            "connected",
            resolve
          );

        mongoose.connection
          .once(
            "error",
            reject
          );
      }
    );

    return;
  }

  await mongoose.connect(
    mongoUri
  );

  console.log(
    "[postgres-backfill] MongoDB connected"
  );
}

// ============================================================================
// CONNECTION CLEANUP
// ============================================================================

async function closeConnections() {
  try {
    if (
      mongoose.connection
        .readyState !==
      0
    ) {
      await mongoose
        .disconnect();

      console.log(
        "[postgres-backfill] MongoDB disconnected"
      );
    }
  } catch (
    error
  ) {
    console.error(
      "[postgres-backfill] MongoDB disconnect failed:",
      error.message
    );
  }

  try {
    await closePostgresPool();
  } catch (
    error
  ) {
    console.error(
      "[postgres-backfill] PostgreSQL pool close failed:",
      error.message
    );
  }
}

// ============================================================================
// OUTPUT
// ============================================================================

function printHeader(
  args,
  config
) {
  const registry =
    new MigrationDomainRegistry();

  const domains =
    args.domain
      ? [
          args.domain,
        ]
      : registry.names();

  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "AIRA POSTGRESQL BACKFILL"
  );

  console.log(
    "============================================================"
  );

  console.log(
    `Organization: ${args.organizationId}`
  );

  console.log(
    `Environment:  ${args.environmentId}`
  );

  console.log(
    `Tenant:       ${args.tenantId || "(resolved automatically)"}`
  );

  console.log(
    `Domains:      ${domains.join(", ")}`
  );

  console.log(
    `Batch size:   ${args.batchSize ?? config.batchSize}`
  );

  console.log(
    `Failure:      ${args.failurePolicy ?? config.failurePolicy}`
  );

  console.log(
    `Dry run:      ${args.dryRun === true}`
  );

  console.log(
    `Resume:       ${args.resume === true}`
  );

  console.log(
    `Max docs:     ${args.maxDocuments ?? config.maxDocuments ?? "unlimited"}`
  );

  console.log(
    "============================================================"
  );

  console.log(
    ""
  );
}

function printSummary(
  result
) {
  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "BACKFILL SUMMARY"
  );

  console.log(
    "============================================================"
  );

  for (
    const domainResult
    of result.results
  ) {
    console.log(
      [
        domainResult.domain,

        `scanned=${domainResult.scanned || 0}`,

        `migrated=${domainResult.migrated || 0}`,

        `skipped=${domainResult.skipped || 0}`,

        `failed=${domainResult.failed || 0}`,

        `completed=${domainResult.completed === true}`,

        domainResult.derived
          ? "derived=true"
          : null,

        domainResult.dryRun
          ? "dryRun=true"
          : null,
      ]
        .filter(
          Boolean
        )
        .join(
          " | "
        )
    );
  }

  console.log(
    "------------------------------------------------------------"
  );

  console.log(
    `Domains:   ${result.totals.domains}`
  );

  console.log(
    `Completed: ${result.totals.completed}`
  );

  console.log(
    `Scanned:   ${result.totals.scanned}`
  );

  console.log(
    `Migrated:  ${result.totals.migrated}`
  );

  console.log(
    `Skipped:   ${result.totals.skipped}`
  );

  console.log(
    `Failed:    ${result.totals.failed}`
  );

  console.log(
    "============================================================"
  );

  console.log(
    ""
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args =
    parseArgs(
      process.argv.slice(
        2
      )
    );

  assertArgs(
    args
  );

  const config =
    getMigrationConfig();

  if (
    !args.dryRun &&
    config.mode !==
      "backfill"
  ) {
    throw Object.assign(
      new Error(
        "Real backfill requires MIGRATION_MODE=backfill"
      ),
      {
        code:
          "MIGRATION_BACKFILL_MODE_REQUIRED",
      }
    );
  }

  /*
   * Mongo is always the Phase 13.5B source.
   *
   * Therefore even a dry run requires an active Mongo connection.
   */
  await connectMongo();

  printHeader(
    args,
    config
  );

  const runner =
    new BackfillRunner();

  const result =
    await runner.run({
      organizationId:
        args.organizationId,

      environmentId:
        args.environmentId,

      tenantId:
        args.tenantId,

      domain:
        args.domain,

      dryRun:
        args.dryRun,

      batchSize:
        args.batchSize,

      failurePolicy:
        args.failurePolicy,

      maxDocuments:
        args.maxDocuments,

      resume:
        args.resume,
    });

  printSummary(
    result
  );

  if (
    result.totals.failed >
    0
  ) {
    process.exitCode =
      2;
  }

  return result;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

if (
  require.main ===
  module
) {
  main()
    .catch(
      (
        error
      ) => {
        console.error(
          "[postgres-backfill] FAILED:",
          {
            code:
              error.code ||
              "MIGRATION_BACKFILL_FAILED",

            message:
              error.message,

            migrationContext:
              error.migrationContext ||
              null,
          }
        );

        process.exitCode =
          1;
      }
    )
    .finally(
      async () => {
        await closeConnections();
      }
    );
}

module.exports = {
  parseArgs,
  assertArgs,

  connectMongo,
  closeConnections,

  printHeader,
  printSummary,

  main,
};