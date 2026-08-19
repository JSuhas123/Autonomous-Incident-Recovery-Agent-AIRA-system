"use strict";

const PersistenceTransactionManager =
  require(
    "./PersistenceTransactionManager"
  );

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

const VALID_ISOLATION_LEVELS =
  new Set([
    "READ COMMITTED",
    "REPEATABLE READ",
    "SERIALIZABLE",
  ]);

class PostgresPersistenceTransactionManager
  extends PersistenceTransactionManager {
  constructor(
    options = {}
  ) {
    super();

    this.pool =
      options.pool ||
      null;

    this.isolationLevel =
      normalizeIsolationLevel(
        options.isolationLevel ||
        process.env
          .POSTGRES_TRANSACTION_ISOLATION ||
        "READ COMMITTED"
      );
  }

  async run(
    work
  ) {
    if (
      typeof work !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Transaction work function is required"
        ),
        {
          code:
            "PERSISTENCE_TRANSACTION_WORK_REQUIRED",
        }
      );
    }

    const activePool =
      this.pool ||
      getPostgresPool();

    const client =
      await activePool
        .connect();

    let transactionStarted =
      false;

    try {
      await client
        .query(
          `BEGIN ISOLATION LEVEL ${this.isolationLevel}`
        );

      transactionStarted =
        true;

      const result =
        await work({
          kind:
            "postgres",

          client,
        });

      await client
        .query(
          "COMMIT"
        );

      transactionStarted =
        false;

      return result;
    } catch (
      error
    ) {
      if (
        transactionStarted
      ) {
        try {
          await client
            .query(
              "ROLLBACK"
            );
        } catch (
          rollbackError
        ) {
          console.error(
            "[postgres] Transaction rollback failed:",
            rollbackError
          );

          error
            .rollbackError =
            rollbackError;
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeIsolationLevel(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    !VALID_ISOLATION_LEVELS
      .has(
        normalized
      )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported PostgreSQL transaction isolation level: ${value}`
      ),
      {
        code:
          "POSTGRES_TRANSACTION_ISOLATION_INVALID",
      }
    );
  }

  return normalized;
}

module.exports =
  PostgresPersistenceTransactionManager;

module.exports
  .normalizeIsolationLevel =
  normalizeIsolationLevel;