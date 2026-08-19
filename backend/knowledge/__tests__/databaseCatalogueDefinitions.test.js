'use strict';

const {
  DATABASE_RUNBOOKS,
  DATABASE_PLAYBOOKS,
} =
  require(
    '../databaseCataloguePackDefinitions'
  );

const {
  DATABASE_CAPABILITIES,
} =
  require(
    '../databaseCapabilityMatrix'
  );


describe(
  'Phase 13.11 — Database catalogue definitions',
  () => {

    test(
      'contains expected pack size',
      () => {
        expect(
          DATABASE_RUNBOOKS
        ).toHaveLength(
          21
        );

        expect(
          DATABASE_PLAYBOOKS
        ).toHaveLength(
          9
        );
      }
    );


    test(
      'all generated IDs are unique',
      () => {
        const ids = [
          ...DATABASE_RUNBOOKS.map(
            item =>
              item.runbookId
          ),

          ...DATABASE_PLAYBOOKS.map(
            item =>
              item.playbookId
          ),
        ];

        expect(
          new Set(
            ids
          ).size
        ).toBe(
          ids.length
        );
      }
    );


    test(
      'all runbooks are external-target scoped',
      () => {
        for (
          const runbook
          of DATABASE_RUNBOOKS
        ) {
          expect(
            runbook.parameters
              .some(
                parameter =>
                  parameter.name ===
                    'targetId' &&
                  parameter.required ===
                    true
              )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'all runbook actions belong to approved database capability surface',
      () => {
        const allowed =
          new Set(
            DATABASE_CAPABILITIES.map(
              capability =>
                capability.handlerKey
            )
          );

        for (
          const runbook
          of DATABASE_RUNBOOKS
        ) {
          for (
            const currentStep
            of runbook.steps
          ) {
            const key =
              `${currentStep.type}/${currentStep.action}`;

            expect(
              allowed.has(
                key
              )
            ).toBe(
              true
            );
          }
        }
      }
    );


    test(
      'database pack contains no mutation actions',
      () => {
        const dangerous =
          /delete|drop|update|alter|truncate|kill|terminate|promote|failover|flush|restart|reconfigure|write|execute_sql/i;

        for (
          const runbook
          of DATABASE_RUNBOOKS
        ) {
          for (
            const currentStep
            of runbook.steps
          ) {
            expect(
              `${currentStep.type}/${currentStep.action}`
            ).not.toMatch(
              dangerous
            );
          }
        }
      }
    );


    test(
      'every playbook references valid generated runbooks',
      () => {
        const generated =
          new Set(
            DATABASE_RUNBOOKS.map(
              runbook =>
                runbook.runbookId
            )
          );

        for (
          const playbook
          of DATABASE_PLAYBOOKS
        ) {
          for (
            const currentStage
            of playbook.stages
          ) {
            for (
              const reference
              of currentStage.runbooks
            ) {
              expect(
                generated.has(
                  reference.runbookId
                )
              ).toBe(
                true
              );
            }
          }
        }
      }
    );


    test(
      'does not duplicate the three existing database playbooks',
      () => {
        const ids =
          DATABASE_PLAYBOOKS.map(
            playbook =>
              playbook.playbookId
          );

        expect(
          ids
        ).not.toContain(
          'PB-DB-CONN-EXHAUST-001'
        );

        expect(
          ids
        ).not.toContain(
          'PB-DB-DISK-PRESSURE-001'
        );

        expect(
          ids
        ).not.toContain(
          'PB-DB-REPLICATION-LAG-001'
        );
      }
    );


    test(
      'all playbooks remain draft and manually approved',
      () => {
        for (
          const playbook
          of DATABASE_PLAYBOOKS
        ) {
          expect(
            playbook.lifecycle
          ).toBe(
            'DRAFT'
          );

          expect(
            playbook.approvalMode
          ).toBe(
            'MANUAL'
          );
        }
      }
    );
  }
);