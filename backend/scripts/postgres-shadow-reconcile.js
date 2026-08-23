"use strict";

require("dotenv").config();

const PostgresIdentityResolver =
  require(
    "../persistence/postgres/PostgresIdentityResolver"
  );

const MigrationStateStore =
  require(
    "../persistence/migration/MigrationStateStore"
  );

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const SUPPORTED_DOMAINS = [
  "incidents",
  "incidentEvents",
  "incidentLifecycle",
  "incidentLifecycleTransitions",
  "signals",
];

async function main() {
  const args =
    parseArgs(
      process.argv.slice(2)
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
          "MIGRATION_RECONCILE_SCOPE_REQUIRED",
      }
    );
  }

  const domains =
    args.domains.length
      ? args.domains
      : SUPPORTED_DOMAINS;

  for (
    const domain
    of domains
  ) {
    if (
      !SUPPORTED_DOMAINS.includes(
        domain
      )
    ) {
      throw Object.assign(
        new Error(
          `Unsupported reconcile domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_RECONCILE_DOMAIN_INVALID",
        }
      );
    }
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

  const store =
    new MigrationStateStore();

  console.log(
    "\n============================================================"
  );

  console.log(
    "AIRA MIGRATION STATE RECONCILIATION"
  );

  console.log(
    "============================================================"
  );

  for (
    const domain
    of domains
  ) {
    let state =
      await store.get(
        scope,
        domain
      );

    if (!state) {
      state =
        await store.ensure(
          scope,
          domain
        );

      console.log(
        `${domain}: initialized -> ${state.phase}`
      );
    }

    state =
      await reconcileToVerified({
        store,
        scope,
        domain,
        state,
      });

    if (
      args.enableShadow &&
      state.phase ===
        "verified"
    ) {
      state =
        await store.transition(
          scope,
          domain,
          "shadow",
          {
            readBackend:
              "mongo",

            shadowReadsEnabled:
              true,

            rollbackAllowed:
              true,

            metadata: {
              reconciledBy:
                "postgres-shadow-reconcile",

              enabledAt:
                new Date()
                  .toISOString(),
            },
          }
        );
    }

    console.log(
      `${domain}: phase=${state.phase} shadow=${state.shadow_reads_enabled}`
    );
  }

  console.log(
    "============================================================\n"
  );
}

async function reconcileToVerified({
  store,
  scope,
  domain,
  state,
}) {
  if (
    state.phase ===
      "pending"
  ) {
    state =
      await store.transition(
        scope,
        domain,
        "backfilling",
        {
          readBackend:
            "mongo",

          shadowReadsEnabled:
            false,
        }
      );
  }

  if (
    state.phase ===
      "backfilling"
  ) {
    state =
      await store.transition(
        scope,
        domain,
        "backfilled",
        {
          backfillComplete:
            true,

          readBackend:
            "mongo",

          shadowReadsEnabled:
            false,

          metadata: {
            reconciledFromCompletedBackfill:
              true,
          },
        }
      );
  }

  if (
    state.phase ===
      "backfilled"
  ) {
    state =
      await store.transition(
        scope,
        domain,
        "verifying",
        {
          readBackend:
            "mongo",

          shadowReadsEnabled:
            false,
        }
      );
  }

  if (
    state.phase ===
      "verifying"
  ) {
    state =
      await store.transition(
        scope,
        domain,
        "verified",
        {
          verificationComplete:
            true,

          readBackend:
            "mongo",

          shadowReadsEnabled:
            false,

          rollbackAllowed:
            true,

          metadata: {
            reconciledFromCompletedVerification:
              true,
          },
        }
      );
  }

  return state;
}

function parseArgs(
  argv
) {
  const result = {
    organization:
      null,

    environment:
      null,

    domains: [],

    enableShadow:
      false,
  };

  for (
    let i = 0;
    i < argv.length;
    i += 1
  ) {
    switch (
      argv[i]
    ) {
      case "--organization":
        result.organization =
          argv[
            ++i
          ];

        break;

      case "--environment":
        result.environment =
          argv[
            ++i
          ];

        break;

      case "--domains":
        result.domains =
          String(
            argv[
              ++i
            ] ||
            ""
          )
            .split(",")
            .map(
              (
                value
              ) =>
                value.trim()
            )
            .filter(
              Boolean
            );

        break;

      case "--enable-shadow":
        result.enableShadow =
          true;

        break;

      default:
        throw Object.assign(
          new Error(
            `Unknown argument: ${argv[i]}`
          ),
          {
            code:
              "MIGRATION_RECONCILE_ARGUMENT_INVALID",
          }
        );
    }
  }

  return result;
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[postgres-shadow-reconcile] FAILED:",
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
  