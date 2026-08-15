"use strict";

const {
  ExecutionAuthorizationPersistenceService,
} =
  require(
    "../executionAuthorizationPersistenceService"
  );

describe(
  "ExecutionAuthorizationPersistenceService",
  () => {
    test(
      "rejects missing engine result",
      async () => {
        const service =
          new ExecutionAuthorizationPersistenceService();

        await expect(
          service.persist({
            criticResult: {
              accepted:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_PERSISTENCE_ENGINE_RESULT_REQUIRED",
          });
      }
    );

    test(
      "rejects missing critic result",
      async () => {
        const service =
          new ExecutionAuthorizationPersistenceService();

        await expect(
          service.persist({
            engineResult: {
              authorization: {
                authorizationId:
                  "auth-1",
              },
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_PERSISTENCE_CRITIC_REQUIRED",
          });
      }
    );

    test(
      "rejects incomplete authorization scope",
      async () => {
        const service =
          new ExecutionAuthorizationPersistenceService();

        await expect(
          service.persist({
            engineResult: {
              authorization: {
                authorizationId:
                  "auth-1",
              },
            },

            criticResult: {
              accepted:
                true,
            },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_PERSISTENCE_SCOPE_REQUIRED",
          });
      }
    );

    test(
      "execution request IDs are unique",
      () => {
        const service =
          new ExecutionAuthorizationPersistenceService();

        const first =
          service
            .generateExecutionRequestId({
              authorizationId:
                "auth-1",

              planHash:
                "planhash-1",
            });

        const second =
          service
            .generateExecutionRequestId({
              authorizationId:
                "auth-1",

              planHash:
                "planhash-1",
            });

        expect(
          first
        )
          .toMatch(
            /^execreq_/
          );

        expect(
          second
        )
          .toMatch(
            /^execreq_/
          );

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );
  }
);