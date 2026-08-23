"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );

const PostgresIdentityResolver =
  require(
    "./PostgresIdentityResolver"
  );

class PostgresTenantScope {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();
  }

  async run(
    scope,
    work,
    transaction = null
  ) {
    if (
      typeof work !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "PostgreSQL scoped work function is required"
        ),
        {
          code:
            "POSTGRES_SCOPE_WORK_REQUIRED",
        }
      );
    }

    if (
      transaction
        ?.kind ===
      "postgres"
    ) {
      return this.runOnClient(
        transaction.client,
        scope,
        work,
        false
      );
    }

    const pool =
      this.pool ||
      getPostgresPool();

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const result =
        await this.runOnClient(
          client,
          scope,
          work,
          true
        );

      await client.query(
        "COMMIT"
      );

      return result;
    } catch (
      error
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (
        rollbackError
      ) {
        error.rollbackError =
          rollbackError;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async runOnClient(
    client,
    scope,
    work,
    _ownsTransaction
  ) {
    const resolved =
      await this.identityResolver
        .resolveScope(
          client,
          scope
        );

    await client.query(
      `
        SELECT
          set_config(
            'aira.organization_id',
            $1,
            true
          ),
          set_config(
            'aira.environment_id',
            $2,
            true
          )
      `,
      [
        String(
          resolved
            .organizationUuid
        ),

        String(
          resolved
            .environmentUuid
        ),
      ]
    );

    return work(
      client,
      resolved
    );
  }
}

module.exports =
  PostgresTenantScope;