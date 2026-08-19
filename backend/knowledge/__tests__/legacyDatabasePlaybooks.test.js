'use strict';

const fs =
  require(
    'fs'
  );

const path =
  require(
    'path'
  );

const yaml =
  require(
    'js-yaml'
  );


const DATABASE_PLAYBOOK_ROOT =
  path.resolve(
    __dirname,
    '..',
    '..',
    'playbooks',
    'catalogue',
    'databases'
  );


const LEGACY_DATABASE_PLAYBOOKS =
  Object.freeze([
    {
      file:
        'pb-db-conn-exhaust-001.yaml',

      playbookId:
        'PB-DB-CONN-EXHAUST-001',

      expectedRunbooks: [
        'RB-DB-INVESTIGATE-CONNECTIONS',
        'RB-DB-VERIFY-CONNECTION-POOL',
      ],
    },

    {
      file:
        'pb-db-disk-pressure-001.yaml',

      playbookId:
        'PB-DB-DISK-PRESSURE-001',

      expectedRunbooks: [
        'RB-DB-INVESTIGATE-STORAGE',
        'RB-DB-VERIFY-STORAGE',
      ],
    },

    {
      file:
        'pb-db-replication-lag-001.yaml',

      playbookId:
        'PB-DB-REPLICATION-LAG-001',

      expectedRunbooks: [
        'RB-DB-INVESTIGATE-REPLICATION',
        'RB-DB-VERIFY-REPLICATION',
      ],
    },
  ]);


function loadPlaybook(
  file
) {
  const absolute =
    path.join(
      DATABASE_PLAYBOOK_ROOT,
      file
    );

  return yaml.load(
    fs.readFileSync(
      absolute,
      'utf8'
    )
  );
}


function referencedRunbooks(
  playbook
) {
  const ids =
    [];

  for (
    const stage
    of playbook.stages ||
    []
  ) {
    for (
      const reference
      of stage.runbooks ||
      []
    ) {
      if (
        reference
          ?.runbookId
      ) {
        ids.push(
          reference.runbookId
        );
      }
    }
  }

  return ids;
}


describe(
  'Phase 13.11J — modernized legacy database playbooks',
  () => {

    test(
      'legacy database playbooks no longer reference RB-DB-FAILOVER',
      () => {
        for (
          const definition
          of LEGACY_DATABASE_PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            referencedRunbooks(
              playbook
            )
          ).not.toContain(
            'RB-DB-FAILOVER'
          );
        }
      }
    );


    test(
      'legacy database playbooks reference dedicated diagnostic runbooks',
      () => {
        for (
          const definition
          of LEGACY_DATABASE_PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          const references =
            referencedRunbooks(
              playbook
            );

          expect(
            references
          ).toEqual(
            definition
              .expectedRunbooks
          );
        }
      }
    );


    test(
      'modernized database playbooks remain draft and manual',
      () => {
        for (
          const definition
          of LEGACY_DATABASE_PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            playbook.lifecycle
          ).toBe(
            'DRAFT'
          );

          expect(
            playbook.approval
              ?.mode
          ).toBe(
            'MANUAL'
          );
        }
      }
    );


    test(
      'modernized playbooks use external database target evidence',
      () => {
        for (
          const definition
          of LEGACY_DATABASE_PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            playbook.requiredEvidence
          ).toContain(
            'resource.targetId'
          );

          for (
            const stage
            of playbook.stages ||
            []
          ) {
            for (
              const reference
              of stage.runbooks ||
              []
            ) {
              expect(
                reference
                  .parameterMappings
                  ?.targetId
              ).toBe(
                '${incident.resource.targetId}'
              );
            }
          }
        }
      }
    );


    test(
      'modernized database playbooks expose complete ownership and scope',
      () => {
        for (
          const definition
          of LEGACY_DATABASE_PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            playbook.owner
              ?.name
          ).toBeTruthy();

          expect(
            playbook.owner
              ?.team
          ).toBe(
            'database-reliability'
          );

          expect(
            playbook.scope
              ?.environments
              ?.length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );
  }
);