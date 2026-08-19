"use strict";

jest.mock(
  "../../persistence/repositories",
  () => ({
    recoveryDecisionRepository: {
      createRun:
        jest.fn(),

      findCurrent:
        jest.fn(),

      saveDecision:
        jest.fn(),

      createDecision:
        jest.fn(),

      saveRun:
        jest.fn(),
    },

    persistenceTransactionManager: {
      run:
        jest.fn(
          async (
            work
          ) =>
            work({
              kind:
                "test",

              id:
                "tx",
            })
        ),
    },
  })
);

const repositories =
  require(
    "../../persistence/repositories"
  );

const {
  RecoveryDecisionPersistenceService,
} =
  require(
    "../../services/recovery/recoveryDecisionPersistenceService"
  );

describe(
  "RecoveryDecisionPersistenceService",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );

    test(
      "revision and superseding writes remain inside one transaction",
      async () => {
        const previous = {
          _id:
            "decision-old",

          revision:
            2,

          isCurrent:
            true,

          status:
            "current",
        };

        const run = {
          _id:
            "run-1",

          runId:
            "recovery-run-1",
        };

        const current = {
          _id:
            "decision-new",

          revision:
            3,

          isCurrent:
            true,
        };

        repositories
          .recoveryDecisionRepository
          .createRun
          .mockResolvedValue(
            run
          );

        repositories
          .recoveryDecisionRepository
          .findCurrent
          .mockResolvedValue(
            previous
          );

        repositories
          .recoveryDecisionRepository
          .createDecision
          .mockResolvedValue(
            current
          );

        const service =
          new RecoveryDecisionPersistenceService();

        const result =
          await service
            .persist({
              engineResult: {
                decision: {
                  decisionId:
                    "decision-new",

                  decision:
                    "RECOVER",

                  selectedCandidateId:
                    "candidate-1",

                  selectedPlaybookId:
                    "playbook-1",

                  confidence:
                    0.9,

                  candidates:
                    [],

                  rejectedCandidates:
                    [],

                  reasons:
                    [],

                  unknowns:
                    [],

                  metadata:
                    {},
                },

                executionAuthorized:
                  false,
              },

              criticResult: {
                rejected:
                  false,

                requiresManualReview:
                  false,

                executionAuthorized:
                  false,
              },

              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",
            });

        expect(
          result.revision
        ).toBe(
          3
        );

        expect(
          previous.isCurrent
        ).toBe(
          false
        );

        expect(
          previous.status
        ).toBe(
          "superseded"
        );

        expect(
          previous
            .supersededByDecisionId
        ).toBe(
          "decision-new"
        );

        expect(
          repositories
            .recoveryDecisionRepository
            .saveDecision
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          repositories
            .persistenceTransactionManager
            .run
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      "unsafe execution authorization is rejected",
      async () => {
        const service =
          new RecoveryDecisionPersistenceService();

        await expect(
          service.persist({
            engineResult: {
              decision: {
                decisionId:
                  "decision-1",

                executionAuthorized:
                  true,
              },
            },

            criticResult: {
              executionAuthorized:
                false,
            },

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          })
        ).rejects.toMatchObject({
          code:
            "RECOVERY_PERSISTENCE_UNSAFE_INPUT",
        });
      }
    );
  }
);