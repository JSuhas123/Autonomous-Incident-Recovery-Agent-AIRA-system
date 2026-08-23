"use strict";

require(
  "dotenv"
).config();

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

const MigrationStateStore =
  require(
    "../persistence/migration/MigrationStateStore"
  );

const MigrationCutoverPolicy =
  require(
    "../persistence/migration/MigrationCutoverPolicy"
  );

const MigrationDomainRegistry =
  require(
    "../persistence/migration/MigrationDomainRegistry"
  );

async function main() {
  const args =
    parseArgs(
      process.argv
        .slice(
          2
        )
    );

  validateArgs(
    args
  );

  const resolver =
    new PostgresIdentityResolver();

  const pool =
    getPostgresPool();

  const client =
    await pool
      .connect();

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

  /*
   * Migration state tables use PostgreSQL tenancy identity.
   */
  const stateScope = {
    organizationId:
      resolved.organizationUuid,

    environmentId:
      resolved.environmentUuid,
  };

  const stateStore =
    new MigrationStateStore();

  const policy =
    new MigrationCutoverPolicy();

  const registry =
    new MigrationDomainRegistry();

  if (
    !registry.has(
      args.domain
    )
  ) {
    throw Object.assign(
      new Error(
        `Unknown migration domain: ${args.domain}`
      ),
      {
        code:
          "MIGRATION_DOMAIN_UNKNOWN",
      }
    );
  }

  const current =
    await stateStore
      .get(
        stateScope,
        args.domain
      );

  if (
    !current
  ) {
    throw Object.assign(
      new Error(
        `Migration state not initialized for domain: ${args.domain}`
      ),
      {
        code:
          "MIGRATION_STATE_NOT_INITIALIZED",
      }
    );
  }

  if (
    args.action ===
    "status"
  ) {
    printState(
      current
    );

    return;
  }

  if (
    args.action ===
    "enable"
  ) {
    policy
      .assertTransition(
        current.phase,
        "shadow"
      );

    if (
      current
        .backfill_complete !==
      true
    ) {
      throw Object.assign(
        new Error(
          "Cannot enable shadow mode before backfill is complete"
        ),
        {
          code:
            "MIGRATION_BACKFILL_INCOMPLETE",
        }
      );
    }

    if (
      current
        .verification_complete !==
      true
    ) {
      throw Object.assign(
        new Error(
          "Cannot enable shadow mode before verification passes"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_INCOMPLETE",
        }
      );
    }

    const next =
      await stateStore
        .transition(
          stateScope,
          args.domain,
          "shadow",
          {
            readBackend:
              "mongo",

            shadowReadsEnabled:
              true,

            rollbackAllowed:
              true,

            metadata: {
              shadowEnabledAt:
                new Date()
                  .toISOString(),

              shadowEnabledBy:
                "postgres-shadow-cli",
            },
          }
        );

    console.log(
      "\n[postgres-shadow] Shadow mode ENABLED\n"
    );

    printState(
      next
    );

    return;
  }

  if (
    args.action ===
    "disable"
  ) {
    policy
      .assertTransition(
        current.phase,
        "verified"
      );

    const next =
      await stateStore
        .transition(
          stateScope,
          args.domain,
          "verified",
          {
            readBackend:
              "mongo",

            shadowReadsEnabled:
              false,

            metadata: {
              shadowDisabledAt:
                new Date()
                  .toISOString(),

              shadowDisabledBy:
                "postgres-shadow-cli",
            },
          }
        );

    console.log(
      "\n[postgres-shadow] Shadow mode DISABLED\n"
    );

    printState(
      next
    );

    return;
  }

  throw Object.assign(
    new Error(
      `Unsupported shadow action: ${args.action}`
    ),
    {
      code:
        "MIGRATION_SHADOW_ACTION_INVALID",
    }
  );
}

function parseArgs(
  argv
) {
  const result = {
    action:
      argv[0] ||
      "status",

    organization:
      null,

    environment:
      null,

    domain:
      null,
  };

  for (
    let index = 1;
    index <
    argv.length;
    index +=
      1
  ) {
    const current =
      argv[
        index
      ];

    const next =
      argv[
        index +
        1
      ];

    if (
      current ===
      "--organization"
    ) {
      result.organization =
        next;

      index +=
        1;

      continue;
    }

    if (
      current ===
      "--environment"
    ) {
      result.environment =
        next;

      index +=
        1;

      continue;
    }

    if (
      current ===
      "--domain"
    ) {
      result.domain =
        next;

      index +=
        1;
    }
  }

  return result;
}

function validateArgs(
  args
) {
  if (
    ![
      "status",
      "enable",
      "disable",
    ].includes(
      args.action
    )
  ) {
    throw Object.assign(
      new Error(
        "Action must be status, enable or disable"
      ),
      {
        code:
          "MIGRATION_SHADOW_ACTION_INVALID",
      }
    );
  }

  if (
    !args.organization ||
    !args.environment ||
    !args.domain
  ) {
    throw Object.assign(
      new Error(
        "--organization, --environment and --domain are required"
      ),
      {
        code:
          "MIGRATION_SHADOW_ARGUMENT_REQUIRED",
      }
    );
  }
}

function printState(
  state
) {
  console.log(
    "============================================================"
  );

  console.log(
    "AIRA MIGRATION DOMAIN STATE"
  );

  console.log(
    "============================================================"
  );

  console.log(
    `Domain:                ${state.domain}`
  );

  console.log(
    `Phase:                 ${state.phase}`
  );

  console.log(
    `Read backend:          ${state.read_backend}`
  );

  console.log(
    `Shadow reads enabled:  ${state.shadow_reads_enabled}`
  );

  console.log(
    `Backfill complete:     ${state.backfill_complete}`
  );

  console.log(
    `Verification complete: ${state.verification_complete}`
  );

  console.log(
    `Cutover complete:      ${state.cutover_complete}`
  );

  console.log(
    `Rollback allowed:      ${state.rollback_allowed}`
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
        "[postgres-shadow] FAILED:",
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
