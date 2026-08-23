"use strict";

require(
  "dotenv"
).config();

const PostgresIdentityResolver =
  require(
    "../persistence/postgres/PostgresIdentityResolver"
  );

const MigrationReadinessGate =
  require(
    "../persistence/migration/MigrationReadinessGate"
  );

const MigrationDomainRegistry =
  require(
    "../persistence/migration/MigrationDomainRegistry"
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

  validateArgs(
    args
  );

  const domainRegistry =
    new MigrationDomainRegistry();

  const domains =
    args.domain ===
      "all"
      ? domainRegistry
          .names()
      : [
          args.domain,
        ];

  const resolver =
    new PostgresIdentityResolver();

  const pool =
    getPostgresPool();

  const client =
    await pool.connect();

  let resolved;

  try {
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

  const gate =
    new MigrationReadinessGate({
      minimumComparisons:
        args.minimumComparisons,

      maximumMismatchRate:
        args.maximumMismatchRate,

      maximumErrorRate:
        args.maximumErrorRate,
    });

  const reports =
    [];

  for (
    const domain
    of domains
  ) {
    try {
      const report =
        await gate.evaluate({
          scope,
          domain,
        });

      reports.push(
        report
      );
    } catch (
      error
    ) {
      reports.push({
        domain,

        ready:
          false,

        blockers: [
          error.code ||
          "READINESS_EVALUATION_FAILED",
        ],

        error: {
          code:
            error.code ||
            null,

          message:
            error.message,
        },
      });
    }
  }

  printReports(
    reports
  );

  if (
    reports.some(
      (
        report
      ) =>
        !report.ready
    )
  ) {
    process.exitCode =
      2;
  }
}

function parseArgs(
  argv
) {
  const result = {
    organization:
      null,

    environment:
      null,

    domain:
      "incidents",

    minimumComparisons:
      undefined,

    maximumMismatchRate:
      undefined,

    maximumErrorRate:
      undefined,
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

    const value =
      argv[
        index + 1
      ];

    switch (
      token
    ) {
      case "--organization":
        result.organization =
          value;

        index +=
          1;

        break;

      case "--environment":
        result.environment =
          value;

        index +=
          1;

        break;

      case "--domain":
        result.domain =
          value;

        index +=
          1;

        break;

      case "--min-comparisons":
        result.minimumComparisons =
          Number.parseInt(
            value,
            10
          );

        index +=
          1;

        break;

      case "--max-mismatch-rate":
        result.maximumMismatchRate =
          Number(
            value
          );

        index +=
          1;

        break;

      case "--max-error-rate":
        result.maximumErrorRate =
          Number(
            value
          );

        index +=
          1;

        break;

      default:
        throw Object.assign(
          new Error(
            `Unknown readiness argument: ${token}`
          ),
          {
            code:
              "MIGRATION_READINESS_ARGUMENT_INVALID",
          }
        );
    }
  }

  return result;
}

function validateArgs(
  args
) {
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
          "MIGRATION_READINESS_SCOPE_REQUIRED",
      }
    );
  }
}

function printReports(
  reports
) {
  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "AIRA POSTGRESQL SHADOW READINESS"
  );

  console.log(
    "============================================================"
  );

  for (
    const report
    of reports
  ) {
    console.log(
      ""
    );

    console.log(
      `Domain: ${report.domain}`
    );

    console.log(
      `Ready:  ${report.ready ? "YES" : "NO"}`
    );

    if (
      report.state
    ) {
      console.log(
        `Phase:  ${report.state.phase}`
      );

      console.log(
        `Backend: ${report.state.readBackend}`
      );
    }

    if (
      report.shadow
    ) {
      console.log(
        `Observations: ${report.shadow.total}`
      );

      console.log(
        `Matches:      ${report.shadow.matched}`
      );

      console.log(
        `Mismatches:   ${report.shadow.mismatched}`
      );

      console.log(
        `Errors:       ${report.shadow.errors}`
      );

      console.log(
        `Mismatch rate: ${report.shadow.mismatchRate}`
      );

      console.log(
        `Error rate:    ${report.shadow.errorRate}`
      );
    }

    if (
      report.blockers
        ?.length
    ) {
      console.log(
        `Blockers: ${report.blockers.join(", ")}`
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

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[postgres-shadow-readiness] FAILED:",
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