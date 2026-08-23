"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );

class PostgresTenantContext {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;
  }

  async run(
    tenantId,
    work,
    transaction = null
  ) {
    if (
      !tenantId
    ) {
      throw Object.assign(
        new Error(
          "PostgreSQL tenant context requires tenantId"
        ),
        {
          code:
            "POSTGRES_TENANT_REQUIRED",
        }
      );
    }

    if (
      typeof work !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "PostgreSQL tenant work function is required"
        ),
        {
          code:
            "POSTGRES_TENANT_WORK_REQUIRED",
        }
      );
    }

    if (
      transaction?.kind ===
      "postgres"
    ) {
      await this.setTenant(
        transaction.client,
        tenantId
      );

      return work(
        transaction.client
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

      await this.setTenant(
        client,
        tenantId
      );

      const result =
        await work(
          client
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

  async setTenant(
    client,
    tenantId
  ) {
    await client.query(
      `
        SELECT set_config(
          'aira.tenant_public_id',
          $1,
          true
        )
      `,
      [
        String(
          tenantId
        ),
      ]
    );
  }
}

module.exports =
  PostgresTenantContext;