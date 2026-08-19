"use strict";

jest.mock(
  "../../persistence/repositories",
  () => ({
    runtimeRecoveryCheckpointRepository:
      {},
  })
);

const {
  RUNTIME_STAGE,
} =
  require(
    "../../services/recoveryRuntime/recoveryRuntimeContracts"
  );

const {
  RuntimeCheckpointPersistenceService,
} =
  require(
    "../../services/recoveryRuntime/runtimeCheckpointPersistenceService"
  );

const {
  CHECKPOINT_STATUS,
} =
  require(
    "../../services/recoveryRuntime/recoveryRuntimeContracts"
  );

function input(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    operationKey:
      "operation-1",

    stage:
  RUNTIME_STAGE
    .RECOVERY_DECISION,

    ...overrides,
  };
}

describe(
  "RuntimeCheckpointPersistenceService",
  () => {
    test(
      "duplicate ensure returns existing checkpoint instead of creating another",
      async () => {
        const existing = {
          _id:
            "checkpoint-1",

          status:
            CHECKPOINT_STATUS
              .PENDING,
        };

        const repository = {
          create:
            jest
              .fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "duplicate"
                  ),
                  {
                    code:
                      11000,
                  }
                )
              ),

          findOne:
            jest
              .fn()
              .mockResolvedValue(
                existing
              ),
        };

        const service =
          new RuntimeCheckpointPersistenceService({
            repository,
          });

        const result =
          await service
            .ensureCheckpoint(
              input()
            );

        expect(
          result.created
        ).toBe(
          false
        );

        expect(
          result.checkpoint
        ).toBe(
          existing
        );
      }
    );

    test(
      "claim is atomic and increments attempt",
      async () => {
        const checkpoint = {
          _id:
            "checkpoint-1",

          status:
            CHECKPOINT_STATUS
              .PROCESSING,
        };

        const repository = {
          findOneAndUpdate:
            jest
              .fn()
              .mockResolvedValue(
                checkpoint
              ),
        };

        const service =
          new RuntimeCheckpointPersistenceService({
            repository,
          });

        const result =
          await service
            .claim(
              input({
                workerId:
                  "worker-1",
              })
            );

        expect(
          result.claimed
        ).toBe(
          true
        );

        const [
          filter,
          update,
        ] =
          repository
            .findOneAndUpdate
            .mock.calls[0];

        expect(
          filter.status.$in
        ).toEqual(
          expect.arrayContaining([
            CHECKPOINT_STATUS
              .PENDING,

            CHECKPOINT_STATUS
              .ABANDONED,
          ])
        );

        expect(
          update.$inc.attempt
        ).toBe(
          1
        );

        expect(
          update
            .$set[
              "owner.workerId"
            ]
        ).toBe(
          "worker-1"
        );

        expect(
          update
            .$set[
              "owner.claimToken"
            ]
        ).toBeTruthy();
      }
    );

    test(
      "stale worker is fenced when ownership no longer matches",
      async () => {
        const repository = {
          findOneAndUpdate:
            jest
              .fn()
              .mockResolvedValue(
                null
              ),

          findOne:
            jest
              .fn()
              .mockResolvedValue({
                status:
                  CHECKPOINT_STATUS
                    .PROCESSING,

                owner: {
                  workerId:
                    "other-worker",

                  claimToken:
                    "other-token",
                },
              }),
        };

        const service =
          new RuntimeCheckpointPersistenceService({
            repository,
          });

        await expect(
          service.heartbeat(
            input({
              workerId:
                "worker-1",

              claimToken:
                "token-1",
            })
          )
        ).rejects.toMatchObject({
          code:
            "RUNTIME_CHECKPOINT_OWNER_MISMATCH",
        });
      }
    );

    test(
      "stale claim token is fenced",
      async () => {
        const repository = {
          findOneAndUpdate:
            jest
              .fn()
              .mockResolvedValue(
                null
              ),

          findOne:
            jest
              .fn()
              .mockResolvedValue({
                status:
                  CHECKPOINT_STATUS
                    .PROCESSING,

                owner: {
                  workerId:
                    "worker-1",

                  claimToken:
                    "new-token",
                },
              }),
        };

        const service =
          new RuntimeCheckpointPersistenceService({
            repository,
          });

        await expect(
          service.heartbeat(
            input({
              workerId:
                "worker-1",

              claimToken:
                "old-token",
            })
          )
        ).rejects.toMatchObject({
          code:
            "RUNTIME_CHECKPOINT_CLAIM_TOKEN_MISMATCH",
        });
      }
    );

    test(
      "completed result strips executionAuthorized",
      async () => {
        const repository = {
          findOneAndUpdate:
            jest
              .fn()
              .mockImplementation(
                async (
                  _filter,
                  update
                ) => ({
                  result:
                    update.$set
                      .result,
                })
              ),
        };

        const service =
          new RuntimeCheckpointPersistenceService({
            repository,
          });

        await service.complete(
          input({
            workerId:
              "worker-1",

            claimToken:
              "token-1",

            result: {
              success:
                true,

              executionAuthorized:
                true,
            },
          })
        );

        const [
          ,
          update,
        ] =
          repository
            .findOneAndUpdate
            .mock.calls[0];

        expect(
          update
            .$set
            .result
            .executionAuthorized
        ).toBeUndefined();
      }
    );
  }
);