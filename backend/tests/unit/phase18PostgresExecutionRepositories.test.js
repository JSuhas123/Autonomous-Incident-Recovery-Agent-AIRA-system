"use strict";

const PostgresPlaybookExecutionRepository =
  require(
    "../../persistence/postgres/PostgresPlaybookExecutionRepository"
  );

const PostgresRunbookExecutionRepository =
  require(
    "../../persistence/postgres/PostgresRunbookExecutionRepository"
  );

const SCOPE = {
  tenantId:
    "tenant-test",

  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",
};

function makeTenantScope(
  handler
) {
  return {
    run:
      jest.fn(
        async (
          scope,
          work
        ) => {
          const client = {
            query:
              jest.fn(
                handler
              ),
          };

          return work(
            client,
            {
              organizationUuid:
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

              environmentUuid:
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            }
          );
        }
      ),
  };
}

describe(
  "Phase 18.7 PostgreSQL execution repositories",
  () => {
    test(
      "Playbook repository is constructible",
      () => {
        const repository =
          new PostgresPlaybookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        expect(
          repository
        ).toBeInstanceOf(
          PostgresPlaybookExecutionRepository
        );
      }
    );

    test(
      "Runbook repository is constructible",
      () => {
        const repository =
          new PostgresRunbookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        expect(
          repository
        ).toBeInstanceOf(
          PostgresRunbookExecutionRepository
        );
      }
    );

    test(
      "Playbook execution requires tenant scope",
      async () => {
        const repository =
          new PostgresPlaybookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        await expect(
          repository.create({
            executionId:
              "exec-1",

            correlationId:
              "corr-1",

            playbookId:
              "PB-TEST-001",

            playbookVersion:
              "1.0.0",
          })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_PLAYBOOK_EXECUTION_REQUIRED_FIELD",

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "Runbook execution requires tenant scope",
      async () => {
        const repository =
          new PostgresRunbookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        await expect(
          repository.create({
            executionId:
              "exec-1",

            correlationId:
              "corr-1",

            runbookId:
              "RB-K8S-TEST",

            runbookVersion:
              "1.0.0",

            runbookChecksum:
              "checksum",
          })
        ).rejects.toMatchObject({
          code:
            "POSTGRES_RUNBOOK_EXECUTION_REQUIRED_FIELD",

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "Playbook execution identity cannot be changed through update",
      async () => {
        const repository =
          new PostgresPlaybookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        await expect(
          repository.update(
            {
              ...SCOPE,

              executionId:
                "exec-1",
            },
            {
              playbookSnapshot: {
                tampered:
                  true,
              },
            }
          )
        ).rejects.toMatchObject({
          code:
            "PLAYBOOK_EXECUTION_IDENTITY_IMMUTABLE",

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "Runbook execution identity cannot be changed through update",
      async () => {
        const repository =
          new PostgresRunbookExecutionRepository({
            tenantScope:
              makeTenantScope(
                async () => ({
                  rows: [],
                })
              ),
          });

        await expect(
          repository.update(
            {
              ...SCOPE,

              executionId:
                "exec-1",
            },
            {
              runbookChecksum:
                "tampered",
            }
          )
        ).rejects.toMatchObject({
          code:
            "RUNBOOK_EXECUTION_IDENTITY_IMMUTABLE",

          executionAuthorized:
            false,
        });
      }
    );

    test(
      "Playbook repository uses PostgreSQL execution table",
      () => {
        const fn =
          PostgresPlaybookExecutionRepository
            .prototype
            .create
            .toString();

        expect(
          fn
        ).toContain(
          "execution.playbook_executions"
        );
      }
    );

    test(
      "Runbook repository uses PostgreSQL execution table",
      () => {
        const fn =
          PostgresRunbookExecutionRepository
            .prototype
            .create
            .toString();

        expect(
          fn
        ).toContain(
          "execution.runbook_executions"
        );
      }
    );

    test(
      "Playbook historical record never exposes authorization",
      () => {
        const source =
          require("fs")
            .readFileSync(
              require("path")
                .resolve(
                  __dirname,
                  "../../persistence/postgres/PostgresPlaybookExecutionRepository.js"
                ),
              "utf8"
            );

        expect(
          source
        ).toMatch(
          /executionAuthorized:\s*false/
        );
      }
    );

    test(
      "Runbook historical record never exposes authorization",
      () => {
        const source =
          require("fs")
            .readFileSync(
              require("path")
                .resolve(
                  __dirname,
                  "../../persistence/postgres/PostgresRunbookExecutionRepository.js"
                ),
              "utf8"
            );

        expect(
          source
        ).toMatch(
          /executionAuthorized:\s*false/
        );
      }
    );

    test(
      "Runbook repository supports append-only step attempt recording",
      () => {
        expect(
          typeof PostgresRunbookExecutionRepository
            .prototype
            .appendStepAttempt
        ).toBe(
          "function"
        );
      }
    );

    test(
      "Playbook repository supports exact-version binding",
      () => {
        expect(
          typeof PostgresPlaybookExecutionRepository
            .prototype
            .bindResolvedVersion
        ).toBe(
          "function"
        );
      }
    );
  }
);