'use strict';

const fs =
  require(
    'fs'
  );

const os =
  require(
    'os'
  );

const path =
  require(
    'path'
  );

const yaml =
  require(
    'js-yaml'
  );

const {
  DATABASE_RUNBOOKS,
  DATABASE_PLAYBOOKS,
} =
  require(
    '../databaseCataloguePackDefinitions'
  );

const {
  ALLOWED_ACTIONS,
  validateDefinitionSet,
  buildRunbookDocument,
  buildPlaybookDocument,
  generateDatabasePack,
} =
  require(
    '../databaseCataloguePackGenerator'
  );


describe(
  'Phase 13.11 — Database catalogue pack generation',
  () => {

    test(
      'definition set passes generator safety validation',
      () => {
        const result =
          validateDefinitionSet();

        expect(
          result
        ).toEqual({
          valid:
            true,

          errors:
            [],
        });
      }
    );


    test(
      'allowlist contains exactly the 21 database capabilities',
      () => {
        expect(
          ALLOWED_ACTIONS.size
        ).toBe(
          21
        );
      }
    );


    test(
      'canonical runbooks contain ownership and scope',
      () => {
        for (
          const definition
          of DATABASE_RUNBOOKS
        ) {
          const document =
            buildRunbookDocument(
              definition
            );

          expect(
            document.apiVersion
          ).toBe(
            'aira.io/v1'
          );

          expect(
            document.kind
          ).toBe(
            'Runbook'
          );

          expect(
            document.owner
          ).toEqual(
            expect.objectContaining({
              ownerType:
                expect.any(
                  String
                ),

              ownerId:
                expect.any(
                  String
                ),

              name:
                expect.any(
                  String
                ),

              team:
                expect.any(
                  String
                ),
            })
          );

          expect(
            document.scope
          ).toEqual(
            expect.objectContaining({
              environments:
                expect.any(
                  Array
                ),

              services:
                expect.any(
                  Array
                ),
            })
          );

          expect(
            document.steps.length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );


    test(
      'canonical playbooks contain production-depth metadata',
      () => {
        for (
          const definition
          of DATABASE_PLAYBOOKS
        ) {
          const document =
            buildPlaybookDocument(
              definition
            );

          expect(
            document.apiVersion
          ).toBe(
            'aira.io/v1'
          );

          expect(
            document.kind
          ).toBe(
            'Playbook'
          );

          expect(
            document.owner
              .name
              .length
          ).toBeGreaterThan(
            0
          );

          expect(
            document.scope
              .environments
              .length
          ).toBeGreaterThan(
            0
          );

          expect(
            document.conditions
              .minimumConfidence
          ).toBeGreaterThanOrEqual(
            0.7
          );

          expect(
            document.policy
              .required
          ).toBe(
            true
          );

          expect(
            document.approval
              .mode
          ).toBe(
            'MANUAL'
          );

          expect(
            document.stages.length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );


    test(
      'generates exactly 30 physical staging YAML files',
      () => {
        const root =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              'aira-db-pack-'
            )
          );

        try {
          const result =
            generateDatabasePack({
              outputRoot:
                root,

              clean:
                true,
            });

          expect(
            result.counts
          ).toEqual({
            runbooks:
              21,

            playbooks:
              9,

            total:
              30,
          });

          const files =
            [];

          const walk =
            directory => {
              for (
                const name
                of fs.readdirSync(
                  directory
                )
              ) {
                const absolute =
                  path.join(
                    directory,
                    name
                  );

                const stat =
                  fs.statSync(
                    absolute
                  );

                if (
                  stat.isDirectory()
                ) {
                  walk(
                    absolute
                  );

                  continue;
                }

                if (
                  /\.ya?ml$/i.test(
                    name
                  )
                ) {
                  files.push(
                    absolute
                  );
                }
              }
            };

          walk(
            root
          );

          expect(
            files
          ).toHaveLength(
            30
          );

          for (
            const file
            of files
          ) {
            const parsed =
              yaml.load(
                fs.readFileSync(
                  file,
                  'utf8'
                )
              );

            expect(
              parsed
            ).toBeTruthy();

            expect(
              parsed.apiVersion
            ).toBe(
              'aira.io/v1'
            );
          }
        } finally {
          fs.rmSync(
            root,
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
      'generated pack does not contain raw database credentials',
      () => {
        for (
          const definition
          of DATABASE_RUNBOOKS
        ) {
          const serialized =
            JSON.stringify(
              buildRunbookDocument(
                definition
              )
            );

          expect(
            serialized
          ).not.toMatch(
            /passwordRef|connectionString|mongodb:\/\/|postgres:\/\/|mysql:\/\//i
          );
        }
      }
    );
  }
);