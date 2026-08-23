"use strict";

require(
  "dotenv"
).config();

const MigrationDomainRegistry =
  require(
    "../persistence/migration/MigrationDomainRegistry"
  );

const MigrationStateStore =
  require(
    "../persistence/migration/MigrationStateStore"
  );

const MigrationCheckpointStore =
  require(
    "../persistence/migration/MigrationCheckpointStore"
  );

const MigrationVerificationStore =
  require(
    "../persistence/migration/MigrationVerificationStore"
  );

const ShadowReadObservationStore =
  require(
    "../persistence/migration/ShadowReadObservationStore"
  );

const MongoRetirementScanner =
  require(
    "../persistence/migration/MongoRetirementScanner"
  );

const PostgresIdentityResolver =
  require(
    "../persistence/postgres/PostgresIdentityResolver"
  );

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

async function main() {
  const args =
    parseArgs(
      process.argv.slice(
        2
      )
    );

  if (
    !args.organization ||
    !args.environment
  ) {
    throw Object.assign(
      new Error(
        "--organization and --environment are required"
      ),
      {
        code:
          "PHASE13_STATUS_SCOPE_REQUIRED",
      }
    );
  }

  const pool =
    getPostgresPool();

  const client =
    await pool.connect();

  let resolved;

  try {
    const resolver =
      new PostgresIdentityResolver();

    resolved =
      await resolver
        .resolveScope(
          client,
          {
            organizationId:
              args.organization,

            environmentId:
              args.environment,
          }
        );
  } finally {
    client.release();
  }

  const scope = {
    organizationId:
      String(
        resolved.organizationUuid
      ),

    environmentId:
      String(
        resolved.environmentUuid
      ),
  };

  const registry =
    new MigrationDomainRegistry();

  const stateStore =
    new MigrationStateStore();

  const checkpointStore =
    new MigrationCheckpointStore();

  const verificationStore =
    new MigrationVerificationStore();

  const shadowStore =
    new ShadowReadObservationStore();

  const migrationSummary =
    await loadMigrationSummary(
      pool
    );

  const domainReports = [];

  for (
    const definition
    of registry.list()
  ) {
    if (
      definition.migrationMode ===
      "derived"
    ) {
      domainReports.push({
        domain:
          definition.name,

        mode:
          "derived",

        backfill:
          "N/A",

        verification:
          "N/A",

        phase:
          "derived",

        shadow:
          "N/A",

        cutoverEligible:
          false,
      });

      continue;
    }

    const state =
      await stateStore.get(
        scope,
        definition.name
      );

    const checkpoint =
      definition
        .requiresBackfill
        ? await checkpointStore.get(
            scope,
            definition.name
          )
        : null;

    const verification =
      definition
        .requiresVerification
        ? await verificationStore.latest(
            scope,
            definition.name
          )
        : null;

    const shadow =
      definition
        .shadowEligible
        ? await shadowStore.summary(
            scope,
            definition.name
          )
        : null;

    domainReports.push({
      domain:
        definition.name,

      mode:
        definition
          .migrationMode,

      backfill:
        !definition
          .requiresBackfill
          ? "N/A"
          : checkpoint
              ?.completed ===
            true
            ? "PASS"
            : "PENDING",

      verification:
        !definition
          .requiresVerification
          ? "N/A"
          : verification
              ?.passed ===
            true
            ? "PASS"
            : verification
              ? "FAIL"
              : "PENDING",

      phase:
        state
          ?.phase ||
        "uninitialized",

      shadow:
        !definition
          .shadowEligible
          ? "N/A"
          : formatShadow(
              shadow
            ),

      cutoverEligible:
        definition
          .cutoverEligible,
    });
  }

  const mongoReport =
    new MongoRetirementScanner()
      .scan();

  printReport({
    migrationSummary,

    registry,

    domainReports,

    mongoReport,
  });

  if (
    args.strict &&
    !isPhase13Ready({
      migrationSummary,
      domainReports,
      mongoReport,
    })
  ) {
    process.exitCode =
      2;
  }
}

async function loadMigrationSummary(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          COUNT(*)::integer
            AS applied_count,

          MAX(version)
            AS latest_version

        FROM aira_schema_migrations
      `
    );

  return {
    applied:
      Number(
        result.rows[0]
          ?.applied_count ||
        0
      ),

    latest:
      result.rows[0]
        ?.latest_version ||
      null,
  };
}

function formatShadow(
  summary
) {
  if (
    !summary ||
    summary.total ===
      0
  ) {
    return "NO_DATA";
  }

  if (
    summary.mismatched >
      0 ||
    summary.errors >
      0
  ) {
    return (
      `WARN(${summary.matched}/` +
      `${summary.total},` +
      `m=${summary.mismatched},` +
      `e=${summary.errors})`
    );
  }

  return (
    `PASS(${summary.matched}/` +
    `${summary.total})`
  );
}

function isPhase13Ready({
  migrationSummary,
  domainReports,
  mongoReport,
}) {
  const schemaReady =
    migrationSummary.applied >=
      13;

  const physicalReady =
    domainReports
      .filter(
        report =>
          report.mode ===
          "write"
      )
      .every(
        report =>
          (
            report.backfill ===
              "PASS"
          ) &&
          (
            report.verification ===
              "PASS"
          )
      );

  return (
    schemaReady &&
    physicalReady &&
    mongoReport.ready
  );
}

function printReport({
  migrationSummary,
  registry,
  domainReports,
  mongoReport,
}) {
  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "AIRA PHASE 13 STATUS"
  );

  console.log(
    "============================================================"
  );

  console.log(
    ""
  );

  console.log(
    "POSTGRESQL"
  );

  console.log(
    `  Applied migrations: ${migrationSummary.applied}`
  );

  console.log(
    `  Latest migration:   ${migrationSummary.latest || "NONE"}`
  );

  console.log(
    ""
  );

  console.log(
    "MIGRATION REGISTRY"
  );

  console.log(
    `  Total domains:       ${registry.names().length}`
  );

  console.log(
    `  Writable domains:    ${registry.writable().length}`
  );

  console.log(
    `  Derived domains:     ${registry.derived().length}`
  );

  console.log(
    `  Backfillable:        ${registry.backfillable().length}`
  );

  console.log(
    `  Verifiable:          ${registry.verifiable().length}`
  );

  console.log(
    `  Shadow eligible:     ${registry.shadowEligible().length}`
  );

  console.log(
    ""
  );

  console.log(
    "DOMAIN STATUS"
  );

  console.table(
    domainReports
  );

  console.log(
    ""
  );

  console.log(
    "MONGO RETIREMENT"
  );

  console.log(
    `  Runtime files scanned:      ${mongoReport.summary.scannedFiles}`
  );

  console.log(
    `  Direct model imports:       ${mongoReport.summary.directModelImports}`
  );

  console.log(
    `  Files importing models:     ${mongoReport.summary.directModelFiles}`
  );

  console.log(
    `  Mongoose runtime imports:   ${mongoReport.summary.mongooseRuntimeImports}`
  );

  console.log(
    `  Mongoose connection uses:   ${mongoReport.summary.mongooseConnections}`
  );

  console.log(
    `  Total retirement blockers:  ${mongoReport.summary.totalBlockers}`
  );

  console.log(
    `  Mongo retirement ready:     ${mongoReport.ready ? "YES" : "NO"}`
  );

  if (
    mongoReport.files
      .directModelFiles
      .length >
    0
  ) {
    console.log(
      ""
    );

    console.log(
      "TOP DIRECT MODEL FILES"
    );

    for (
      const file
      of mongoReport.files
        .directModelFiles
        .slice(
          0,
          25
        )
    ) {
      console.log(
        `  - ${file}`
      );
    }
  }

  console.log(
    ""
  );

  console.log(
    "============================================================"
  );
}

function parseArgs(
  argv
) {
  const result = {
    organization:
      null,

    environment:
      null,

    strict:
      false,
  };

  for (
    let index = 0;
    index <
    argv.length;
    index +=
      1
  ) {
    const token =
      argv[index];

    switch (
      token
    ) {
      case "--organization":
        result.organization =
          argv[
            ++index
          ];

        break;

      case "--environment":
        result.environment =
          argv[
            ++index
          ];

        break;

      case "--strict":
        result.strict =
          true;

        break;

      default:
        throw Object.assign(
          new Error(
            `Unknown Phase 13 status argument: ${token}`
          ),
          {
            code:
              "PHASE13_STATUS_ARGUMENT_INVALID",
          }
        );
    }
  }

  return result;
}

main()
  .catch(
    error => {
      console.error(
        "[postgres-phase13-status] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,
        }
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await closePostgresPool()
        .catch(
          () => {}
        );
    }
  );