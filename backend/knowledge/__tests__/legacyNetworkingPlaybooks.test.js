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


const NETWORKING_PLAYBOOK_ROOT =
  path.resolve(
    __dirname,
    '..',
    '..',
    'playbooks',
    'catalogue',
    'networking'
  );


const PLAYBOOKS =
  Object.freeze([
    {
      file:
        'pb-net-dns-failure-001.yaml',

      playbookId:
        'PB-NET-DNS-FAILURE-001',

      expectedRunbooks: [
        'RB-NET-INVESTIGATE-DNS',
        'RB-NET-INVESTIGATE-CONNECTIVITY',
        'RB-NET-VERIFY-DNS',
      ],
    },

    {
      file:
        'pb-net-ingress-failure-001.yaml',

      playbookId:
        'PB-NET-INGRESS-FAILURE-001',

      expectedRunbooks: [
        'RB-NET-INVESTIGATE-CONNECTIVITY',
        'RB-NET-INVESTIGATE-PORT',
        'RB-NET-INVESTIGATE-UPSTREAM',
        'RB-NET-INVESTIGATE-LOAD-BALANCER',
        'RB-NET-INVESTIGATE-TLS',
        'RB-NET-VERIFY-CONNECTIVITY',
        'RB-NET-VERIFY-UPSTREAM',
      ],
    },

    {
      file:
        'pb-net-tls-expiry-001.yaml',

      playbookId:
        'PB-NET-TLS-EXPIRY-001',

      expectedRunbooks: [
        'RB-NET-INVESTIGATE-TLS',
        'RB-NET-INVESTIGATE-CONNECTIVITY',
        'RB-NET-VERIFY-TLS',
      ],
    },
  ]);


function loadPlaybook(
  file
) {
  const absolute =
    path.join(
      NETWORKING_PLAYBOOK_ROOT,
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
  const result =
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
        reference?.runbookId
      ) {
        result.push(
          reference.runbookId
        );
      }
    }
  }

  return result;
}


describe(
  'Phase 13.12 — modernized legacy Networking playbooks',
  () => {

    test(
      'all three legacy Networking playbooks are version 2',
      () => {
        for (
          const definition
          of PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            playbook.playbookId
          ).toBe(
            definition.playbookId
          );

          expect(
            playbook.semver
          ).toBe(
            '2.0.0'
          );
        }
      }
    );


    test(
      'legacy Networking playbooks no longer use Kubernetes pod restart',
      () => {
        for (
          const definition
          of PLAYBOOKS
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
            'RB-K8S-POD-RESTART'
          );
        }
      }
    );


    test(
      'legacy Networking playbooks use dedicated Networking runbooks',
      () => {
        for (
          const definition
          of PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            referencedRunbooks(
              playbook
            )
          ).toEqual(
            definition.expectedRunbooks
          );
        }
      }
    );


    test(
      'all referenced knowledge belongs to Networking namespace',
      () => {
        for (
          const definition
          of PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          for (
            const runbookId
            of referencedRunbooks(
              playbook
            )
          ) {
            expect(
              runbookId.startsWith(
                'RB-NET-'
              )
            ).toBe(
              true
            );
          }
        }
      }
    );


    test(
      'modernized playbooks remain DRAFT and MANUAL',
      () => {
        for (
          const definition
          of PLAYBOOKS
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
            playbook.approval?.mode
          ).toBe(
            'MANUAL'
          );
        }
      }
    );


    test(
      'modernized playbooks require an external diagnostic target',
      () => {
        for (
          const definition
          of PLAYBOOKS
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
      'modernized playbooks expose canonical owner and scope',
      () => {
        for (
          const definition
          of PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          expect(
            playbook.owner
              ?.ownerType
          ).toBe(
            'system'
          );

          expect(
            playbook.owner
              ?.ownerId
          ).toBe(
            'aira-core'
          );

          expect(
            playbook.owner
              ?.name
          ).toBeTruthy();

          expect(
            playbook.owner
              ?.team
          ).toBe(
            'networking-reliability'
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


    test(
      'modernized playbooks no longer claim unsupported autonomous recovery',
      () => {
        for (
          const definition
          of PLAYBOOKS
        ) {
          const playbook =
            loadPlaybook(
              definition.file
            );

          for (
            const stage
            of playbook.stages ||
            []
          ) {
            expect(
              stage.type
            ).not.toBe(
              'RECOVERY'
            );
          }
        }
      }
    );
  }
);