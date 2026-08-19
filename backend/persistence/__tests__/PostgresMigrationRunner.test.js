"use strict";

const fs =
  require(
    "node:fs/promises"
  );

const os =
  require(
    "node:os"
  );

const path =
  require(
    "node:path"
  );

const PostgresMigrationRunner =
  require(
    "../postgres/PostgresMigrationRunner"
  );

const {
  parseMigrationFilename,
  createChecksum,
} =
  require(
    "../postgres/PostgresMigrationRunner"
  );

describe(
  "PostgresMigrationRunner",
  () => {
    test(
      "parses valid migration filename",
      () => {
        expect(
          parseMigrationFilename(
            "0001_initial_schema.sql"
          )
        ).toEqual({
          version:
            "0001",

          name:
            "initial_schema",
        });
      }
    );

    test(
      "rejects invalid migration filename",
      () => {
        expect(
          () =>
            parseMigrationFilename(
              "initial.sql"
            )
        ).toThrow(
          "Invalid PostgreSQL migration filename"
        );
      }
    );

    test(
      "checksum is deterministic",
      () => {
        const sql =
          "CREATE TABLE test (id INT);";

        expect(
          createChecksum(
            sql
          )
        ).toBe(
          createChecksum(
            sql
          )
        );

        expect(
          createChecksum(
            sql
          )
        ).toHaveLength(
          64
        );
      }
    );

    test(
      "loads migrations in deterministic order",
      async () => {
        const directory =
          await fs
            .mkdtemp(
              path.join(
                os.tmpdir(),
                "aira-postgres-migrations-"
              )
            );

        try {
          await fs
            .writeFile(
              path.join(
                directory,
                "0002_second.sql"
              ),
              "SELECT 2;",
              "utf8"
            );

          await fs
            .writeFile(
              path.join(
                directory,
                "0001_first.sql"
              ),
              "SELECT 1;",
              "utf8"
            );

          const runner =
            new PostgresMigrationRunner({
              pool:
                {},

              migrationsDirectory:
                directory,

              lockId:
                1,
            });

          const migrations =
            await runner
              .loadMigrations();

          expect(
            migrations.map(
              (
                migration
              ) =>
                migration.version
            )
          ).toEqual([
            "0001",
            "0002",
          ]);
        } finally {
          await fs
            .rm(
              directory,
              {
                recursive:
                  true,

                force:
                  true,
              }
            );
        }
      }
    );

    test(
      "rejects duplicate migration versions",
      async () => {
        const directory =
          await fs
            .mkdtemp(
              path.join(
                os.tmpdir(),
                "aira-postgres-duplicate-"
              )
            );

        try {
          await fs
            .writeFile(
              path.join(
                directory,
                "0001_first.sql"
              ),
              "SELECT 1;"
            );

          await fs
            .writeFile(
              path.join(
                directory,
                "0001_second.sql"
              ),
              "SELECT 2;"
            );

          const runner =
            new PostgresMigrationRunner({
              pool:
                {},

              migrationsDirectory:
                directory,

              lockId:
                1,
            });

          await expect(
            runner
              .loadMigrations()
          ).rejects.toMatchObject({
            code:
              "POSTGRES_MIGRATION_VERSION_DUPLICATE",
          });
        } finally {
          await fs
            .rm(
              directory,
              {
                recursive:
                  true,

                force:
                  true,
              }
            );
        }
      }
    );
  }
);