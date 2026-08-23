"use strict";

require(
  "dotenv"
).config();

const mongoose =
  require(
    "mongoose"
  );

const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const BackfillIdentityBootstrapper =
  require(
    "../persistence/migration/BackfillIdentityBootstrapper"
  );

const DomainVerificationAdapterRegistry =
  require(
    "../persistence/migration/DomainVerificationAdapterRegistry"
  );

const MigrationVerificationStore =
  require(
    "../persistence/migration/MigrationVerificationStore"
  );

const MigrationVerifier =
  require(
    "../persistence/migration/MigrationVerifier"
  );

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

    sampleLimit:
      null,

    persistResult:
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

      case "--sample-limit":
        args.sampleLimit =
          Number.parseInt(
            argv[
              index + 1
            ],
            10
          );

        index += 1;
        break;

      case "--no-persist":
        args.persistResult =
          false;
        break;

      default:
        throw Object.assign(
          new Error(
            `Unknown verification argument: ${token}`
          ),
          {
            code:
              "MIGRATION_VERIFICATION_CLI_ARGUMENT_INVALID",
          }
        );
    }
  }

  return args;
}

function assertArgs(
  args,
  registry
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
    !args.domain
  ) {
    throw Object.assign(
      new Error(
        "--domain is required"
      ),
      {
        code:
          "MIGRATION_VERIFICATION_DOMAIN_REQUIRED",
      }
    );
  }

  registry.get(
    args.domain
  );

  if (
    args.sampleLimit !==
      null &&
    (
      !Number.isInteger(
        args.sampleLimit
      ) ||
      args.sampleLimit <
        1
    )
  ) {
    throw Object.assign(
      new Error(
        "--sample-limit must be positive"
      ),
      {
        code:
          "MIGRATION_VERIFICATION_SAMPLE_LIMIT_INVALID",
      }
    );
  }
}

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
        "MONGODB_URI or MONGO_URI is required"
      ),
      {
        code:
          "MONGODB_URI_REQUIRED",
      }
    );
  }

  if (
    mongoose.connection
      .readyState ===
    1
  ) {
    return;
  }

  await mongoose.connect(
    mongoUri
  );

  console.log(
    "[postgres-verify] MongoDB connected"
  );
}

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
        "[postgres-verify] MongoDB disconnected"
      );
    }
  } catch (
    error
  ) {
    console.error(
      "[postgres-verify] MongoDB disconnect failed:",
      error.message
    );
  }

  try {
    await closePostgresPool();
  } catch (
    error
  ) {
    console.error(
      "[postgres-verify] PostgreSQL pool close failed:",
      error.message
    );
  }
}

function printHeader(
  args
) {
  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "AIRA POSTGRESQL VERIFICATION"
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
    `Domain:       ${args.domain}`
  );

  console.log(
    `Sample limit: ${args.sampleLimit ?? "FULL"}`
  );

  console.log(
    `Persist:      ${args.persistResult}`
  );

  console.log(
    "============================================================"
  );

  console.log(
    ""
  );
}

function printResult(
  result
) {
  console.log(
    ""
  );

  console.log(
    "============================================================"
  );

  console.log(
    "VERIFICATION RESULT"
  );

  console.log(
    "============================================================"
  );

  console.log(
    `Domain:           ${result.domain}`
  );

  console.log(
    `Mongo count:      ${result.sourceCount}`
  );

  console.log(
    `PostgreSQL count: ${result.targetCount}`
  );

  console.log(
    `Checked:          ${result.checkedCount}`
  );

  console.log(
    `Mismatches:       ${result.mismatchCount}`
  );

  console.log(
    `Count parity:     ${result.countParity ? "PASS" : "FAIL"}`
  );

  console.log(
    `Overall parity:   ${result.passed ? "PASS" : "FAIL"}`
  );

  if (
    result.mismatches &&
    result.mismatches.length >
      0
  ) {
    console.log(
      ""
    );

    console.log(
      "MISMATCHES"
    );

    console.log(
      "------------------------------------------------------------"
    );

    for (
      const mismatch
      of result.mismatches
        .slice(
          0,
          20
        )
    ) {
      console.log(
        JSON.stringify(
          mismatch,
          null,
          2
        )
      );
    }
  }

  console.log(
    "============================================================"
  );

  console.log(
    ""
  );
}

async function main() {
  if (
    String(
      process.env
        .POSTGRES_ENABLED
    )
      .trim()
      .toLowerCase() !==
    "true"
  ) {
    throw Object.assign(
      new Error(
        "POSTGRES_ENABLED=true is required"
      ),
      {
        code:
          "POSTGRES_DISABLED",
      }
    );
  }

  const registry =
    new DomainVerificationAdapterRegistry();

  const args =
    parseArgs(
      process.argv.slice(
        2
      )
    );

  assertArgs(
    args,
    registry
  );

  await connectMongo();

  printHeader(
    args
  );

  const identityBootstrapper =
    new BackfillIdentityBootstrapper();

  const identityContext =
    await identityBootstrapper
      .resolve({
        organizationId:
          args.organizationId,

        environmentId:
          args.environmentId,

        tenantId:
          args.tenantId,
      });

  const adapter =
    registry.get(
      args.domain
    );

  const verifier =
    new MigrationVerifier({
      verificationStore:
        new MigrationVerificationStore(),
    });

  const result =
    await verifier.verify({
      domain:
        args.domain,

      adapter,

      sourceScope:
        identityContext
          .sourceScope,

      repositoryScope:
        identityContext
          .repositoryScope,

      controlScope:
        identityContext
          .controlScope,

      sampleLimit:
        args.sampleLimit,

      persistResult:
        args.persistResult,
    });

  printResult(
    result
  );

  if (
    !result.passed
  ) {
    process.exitCode =
      2;
  }

  return result;
}

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
          "[postgres-verify] FAILED:",
          {
            code:
              error.code ||
              "MIGRATION_VERIFICATION_FAILED",

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
  printResult,
  main,
};