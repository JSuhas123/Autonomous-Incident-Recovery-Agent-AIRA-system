"use strict";

jest.mock(
  "../../persistence/repositories",
  () => ({
    executionAuthorizationRepository: {
      createAuthorization:
        jest.fn(),

      createExecutionRequest:
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
  ExecutionAuthorizationPersistenceService,
} =
  require(
    "../../services/execution/executionAuthorizationPersistenceService"
  );

function buildEngineResult(
  granted = true
) {
  return {
    authorizationGranted:
      granted,

    authorization: {
      authorizationId:
        "auth-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      recoveryDecisionId:
        "recovery-1",

      recoveryDecisionRevision:
        1,

      selectedCandidateId:
        "candidate-1",

      selectedPlaybookId:
        "playbook-1",

      decision:
        granted
          ? "AUTHORIZED"
          : "BLOCKED",

      status:
        granted
          ? "authorized"
          : "blocked",

      authorizationGranted:
        granted,

      metadata:
        {},
    },

    executionPlan:
      granted
        ? {
            planId:
              "plan-1",

            planHash:
              "hash-1",
          }
        : null,

    idempotency: {
      retryAllowed:
        false,
    },
  };
}

describe(
  "ExecutionAuthorizationPersistenceService",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );

    test(
      "critic rejection never creates an execution request",
      async () => {
        repositories
          .executionAuthorizationRepository
          .createAuthorization
          .mockResolvedValue({
            authorizationId:
              "auth-1",
          });

        const service =
          new ExecutionAuthorizationPersistenceService();

        const result =
          await service
            .persist({
              engineResult:
                buildEngineResult(
                  true
                ),

              criticResult: {
                accepted:
                  false,

                authorizationGranted:
                  false,
              },
            });

        expect(
          result.requestCreated
        ).toBe(
          false
        );

        expect(
          result.authorizationGranted
        ).toBe(
          false
        );

        expect(
          repositories
            .executionAuthorizationRepository
            .createExecutionRequest
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "authorization and execution request are created inside one transaction",
      async () => {
        repositories
          .executionAuthorizationRepository
          .createAuthorization
          .mockResolvedValue({
            authorizationId:
              "auth-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            recoveryDecisionId:
              "recovery-1",

            recoveryDecisionRevision:
              1,

            selectedCandidateId:
              "candidate-1",

            selectedPlaybookId:
              "playbook-1",

            idempotencyKey:
              "idem-1",

            leaseKey:
              "lease-1",
          });

        repositories
          .executionAuthorizationRepository
          .createExecutionRequest
          .mockResolvedValue({
            executionRequestId:
              "request-1",
          });

        const service =
          new ExecutionAuthorizationPersistenceService();

        const result =
          await service
            .persist({
              engineResult:
                buildEngineResult(
                  true
                ),

              criticResult: {
                accepted:
                  true,

                authorizationGranted:
                  true,
              },
            });

        expect(
          repositories
            .persistenceTransactionManager
            .run
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.requestCreated
        ).toBe(
          true
        );

        expect(
          result.executionStarted
        ).toBe(
          false
        );
      }
    );
  }
);