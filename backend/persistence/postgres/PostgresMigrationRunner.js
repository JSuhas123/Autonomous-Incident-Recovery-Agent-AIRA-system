"use strict";

const crypto =
  require(
    "node:crypto"
  );

const fs =
  require(
    "node:fs/promises"
  );

const path =
  require(
    "node:path"
  );

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );

const {
  getPostgresConfig,
} =
  require(
    "../../config/postgres"
  );

class PostgresMigrationRunner {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;

    this.migrationsDirectory =
      options
        .migrationsDirectory ||
      path.join(
        __dirname,
        "migrations"
      );

    this.lockId =
      options.lockId ||
      getPostgresConfig()
        .migration
        .lockId;
  }

  async migrate() {
    const activePool =
      this.pool ||
      getPostgresPool();

    const client =
      await activePool
        .connect();

    try {
      await client
        .query(
          "SELECT pg_advisory_lock($1)",
          [
            this.lockId,
          ]
        );

      await this
        .ensureMigrationTable(
          client
        );

      const migrations =
        await this
          .loadMigrations();

      const applied =
        await this
          .loadAppliedMigrations(
            client
          );

      const results =
        [];

      for (
        const migration
        of migrations
      ) {
        const existing =
          applied.get(
            migration.version
          );

        if (
          existing
        ) {
          if (
            existing.checksum !==
            migration.checksum
          ) {
            throw Object.assign(
              new Error(
                `Migration checksum mismatch: ${migration.filename}`
              ),
              {
                code:
                  "POSTGRES_MIGRATION_CHECKSUM_MISMATCH",

                migration:
                  migration.filename,
              }
            );
          }

          results.push({
            version:
              migration.version,

            filename:
              migration.filename,

            status:
              "already_applied",
          });

          continue;
        }

        const result =
          await this
            .applyMigration(
              client,
              migration
            );

        results.push(
          result
        );
      }

      return {
        successful:
          true,

        total:
          migrations.length,

        applied:
          results.filter(
            (
              item
            ) =>
              item.status ===
              "applied"
          ).length,

        skipped:
          results.filter(
            (
              item
            ) =>
              item.status ===
              "already_applied"
          ).length,

        migrations:
          results,
      };
    } finally {
      try {
        await client
          .query(
            "SELECT pg_advisory_unlock($1)",
            [
              this.lockId,
            ]
          );
      } finally {
        client.release();
      }
    }
  }

  async ensureMigrationTable(
    client
  ) {
    await client
      .query(`
        CREATE TABLE IF NOT EXISTS aira_schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          filename TEXT NOT NULL,
          checksum CHAR(64) NOT NULL,
          execution_ms INTEGER NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
  }

  async loadAppliedMigrations(
    client
  ) {
    const result =
      await client
        .query(`
          SELECT
            version,
            filename,
            checksum,
            execution_ms,
            applied_at
          FROM aira_schema_migrations
          ORDER BY version ASC
        `);

    return new Map(
      result.rows.map(
        (
          row
        ) => [
          row.version,
          row,
        ]
      )
    );
  }

  async loadMigrations() {
    let entries;

    try {
      entries =
        await fs
          .readdir(
            this
              .migrationsDirectory,
            {
              withFileTypes:
                true,
            }
          );
    } catch (
      error
    ) {
      if (
        error.code ===
        "ENOENT"
      ) {
        return [];
      }

      throw error;
    }

    const filenames =
      entries
        .filter(
          (
            entry
          ) =>
            entry.isFile() &&
            entry.name
              .endsWith(
                ".sql"
              )
        )
        .map(
          (
            entry
          ) =>
            entry.name
        )
        .sort();

    const migrations =
      [];

    for (
      const filename
      of filenames
    ) {
      const parsed =
        parseMigrationFilename(
          filename
        );

      const fullPath =
        path.join(
          this
            .migrationsDirectory,
          filename
        );

      const sql =
        await fs
          .readFile(
            fullPath,
            "utf8"
          );

      if (
        sql.trim() ===
        ""
      ) {
        throw Object.assign(
          new Error(
            `Migration is empty: ${filename}`
          ),
          {
            code:
              "POSTGRES_MIGRATION_EMPTY",
          }
        );
      }

      migrations.push({
        ...parsed,

        filename,

        fullPath,

        sql,

        checksum:
          createChecksum(
            sql
          ),
      });
    }

    assertUniqueVersions(
      migrations
    );

    return migrations;
  }

  async applyMigration(
    client,
    migration
  ) {
    const startedAt =
      Date.now();

    await client
      .query(
        "BEGIN"
      );

    try {
      await client
        .query(
          migration.sql
        );

      const executionMs =
        Date.now() -
        startedAt;

      await client
        .query(
          `
            INSERT INTO aira_schema_migrations (
              version,
              filename,
              checksum,
              execution_ms
            )
            VALUES ($1, $2, $3, $4)
          `,
          [
            migration.version,
            migration.filename,
            migration.checksum,
            executionMs,
          ]
        );

      await client
        .query(
          "COMMIT"
        );

      console.log(
        `[postgres-migration] ✓ ${migration.filename}`
      );

      return {
        version:
          migration.version,

        filename:
          migration.filename,

        status:
          "applied",

        executionMs,
      };
    } catch (
      error
    ) {
      try {
        await client
          .query(
            "ROLLBACK"
          );
      } catch (
        rollbackError
      ) {
        error
          .rollbackError =
          rollbackError;
      }

      error.migration =
        migration.filename;

      throw error;
    }
  }
}

function parseMigrationFilename(
  filename
) {
  const match =
    String(
      filename
    )
      .match(
        /^([0-9]{4,})_([a-zA-Z0-9_-]+)\.sql$/
      );

  if (
    !match
  ) {
    throw Object.assign(
      new Error(
        `Invalid PostgreSQL migration filename: ${filename}`
      ),
      {
        code:
          "POSTGRES_MIGRATION_FILENAME_INVALID",
      }
    );
  }

  return {
    version:
      match[1],

    name:
      match[2],
  };
}

function createChecksum(
  sql
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      sql
    )
    .digest(
      "hex"
    );
}

function assertUniqueVersions(
  migrations
) {
  const versions =
    new Set();

  for (
    const migration
    of migrations
  ) {
    if (
      versions.has(
        migration.version
      )
    ) {
      throw Object.assign(
        new Error(
          `Duplicate PostgreSQL migration version: ${migration.version}`
        ),
        {
          code:
            "POSTGRES_MIGRATION_VERSION_DUPLICATE",
        }
      );
    }

    versions.add(
      migration.version
    );
  }
}

module.exports =
  PostgresMigrationRunner;

module.exports
  .parseMigrationFilename =
  parseMigrationFilename;

module.exports
  .createChecksum =
  createChecksum;