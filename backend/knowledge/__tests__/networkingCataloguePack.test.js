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
  NETWORKING_RUNBOOKS,
  NETWORKING_PLAYBOOKS,
} =
  require(
    '../networkingCataloguePackDefinitions'
  );

const {
  ALLOWED_ACTIONS,
  validateDefinitionSet,
  buildRunbookDocument,
  buildPlaybookDocument,
  generateNetworkingPack,
} =
  require(
    '../networkingCataloguePackGenerator'
  );


describe(
  'Phase 13.12 — Networking catalogue pack',
  () => {

    test(
      'contains exactly twenty runbooks and twelve playbooks',
      () => {
        expect(
          NETWORKING_RUNBOOKS
        ).toHaveLength(
          20
        );

        expect(
          NETWORKING_PLAYBOOKS
        ).toHaveLength(
          12
        );
      }
    );


    test(
      'definition set passes generator validation',
      () => {
        expect(
          validateDefinitionSet()
        ).toEqual({
          valid:
            true,

          errors:
            [],
        });
      }
    );


    test(
      'allowlist contains exactly ten networking actions',
      () => {
        expect(
          ALLOWED_ACTIONS.size
        ).toBe(
          10
        );
      }
    );


    test(
      'all generated IDs are unique',
      () => {
        const ids = [
          ...NETWORKING_RUNBOOKS.map(
            item =>
              item.runbookId
          ),

          ...NETWORKING_PLAYBOOKS.map(
            item =>
              item.playbookId
          ),
        ];

        expect(
          new Set(
            ids
          ).size
        ).toBe(
          32
        );
      }
    );


    test(
      'canonical Runbooks preserve Phase-13 depth',
      () => {
        for (
          const definition
          of NETWORKING_RUNBOOKS
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
            document.owner?.name
          ).toBeTruthy();

          expect(
            document.owner?.team
          ).toBe(
            'networking-reliability'
          );

          expect(
            document.scope
              ?.environments
              ?.length
          ).toBeGreaterThan(
            0
          );

          expect(
            document.risk?.level
          ).toBe(
            'LOW'
          );

          expect(
            document.risk?.reversible
          ).toBe(
            true
          );

          expect(
            document.steps.length
          ).toBeGreaterThan(
            0
          );

          expect(
            document.auditConfig
              ?.redactSensitiveValues
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'canonical Playbooks remain draft and manual',
      () => {
        for (
          const definition
          of NETWORKING_PLAYBOOKS
        ) {
          const document =
            buildPlaybookDocument(
              definition
            );

          expect(
            document.lifecycle
          ).toBe(
            'DRAFT'
          );

          expect(
            document.approval
              ?.mode
          ).toBe(
            'MANUAL'
          );

          expect(
            document.policy
              ?.required
          ).toBe(
            true
          );

          expect(
            document.conditions
              ?.minimumConfidence
          ).toBeGreaterThanOrEqual(
            0.7
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
      'generates exactly thirty-two staging YAML files',
      () => {
        const root =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              'aira-network-pack-'
            )
          );

        try {
          const result =
            generateNetworkingPack({
              outputRoot:
                root,

              clean:
                true,
            });

          expect(
            result.counts
          ).toEqual({
            runbooks:
              20,

            playbooks:
              12,

            total:
              32,
          });

          const files =
            [];

          function walk(
            directory
          ) {
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
          }

          walk(
            root
          );

          expect(
            files
          ).toHaveLength(
            32
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
      'does not duplicate legacy Networking playbook IDs',
      () => {
        const ids =
          NETWORKING_PLAYBOOKS.map(
            item =>
              item.playbookId
          );

        expect(
          ids
        ).not.toContain(
          'PB-NET-DNS-FAILURE-001'
        );

        expect(
          ids
        ).not.toContain(
          'PB-NET-INGRESS-FAILURE-001'
        );

        expect(
          ids
        ).not.toContain(
          'PB-NET-TLS-EXPIRY-001'
        );
      }
    );
  }
);