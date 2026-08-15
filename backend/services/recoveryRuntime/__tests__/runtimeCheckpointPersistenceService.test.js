"use strict";

const {
  RuntimeCheckpointPersistenceService,
} =
  require(
    "../runtimeCheckpointPersistenceService"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  INTERRUPTION_REASON,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    operationKey:
      "execution:request-1",

    stage:
      RUNTIME_STAGE
        .EXECUTION,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function checkpoint(
  overrides = {}
) {
  return {
    _id:
      "checkpoint-1",

    ...baseInput(),

    status:
      CHECKPOINT_STATUS
        .PROCESSING,

    owner: {
      workerId:
        "worker-1",

      claimToken:
        "claim-1",

      leaseExpiresAt:
        new Date(
          Date.now() +
          60000
        ),
    },

    ...overrides,
  };
}

function repository(
  options = {}
) {
  return {
    create:
      jest.fn(
        async () =>
          options.created ||
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .PENDING,
          })
      ),

    findOne:
      jest.fn(
        async () =>
          options.found ||
          null
      ),

    findOneAndUpdate:
      jest.fn(
        async () =>
          options.updated ||
          null
      ),
  };
}

describe(
  "RuntimeCheckpointPersistenceService",
  () => {
    test(
      "creates durable checkpoint",
      async () => {
        const repo =
          repository();

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        const result =
          await service
            .ensureCheckpoint(
              baseInput()
            );

        expect(
          result.created
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate checkpoint creation returns existing record",
      async () => {
        const existing =
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .PENDING,
          });

        const repo =
          repository({
            found:
              existing,
          });

        repo.create =
          jest.fn(
            async () => {
              throw Object.assign(
                new Error(
                  "duplicate"
                ),
                {
                  code:
                    11000,
                }
              );
            }
          );

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        const result =
          await service
            .ensureCheckpoint(
              baseInput()
            );

        expect(
          result.created
        )
          .toBe(
            false
          );

        expect(
          result.checkpoint
        )
          .toBe(
            existing
          );
      }
    );

    test(
      "worker may claim pending checkpoint",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint(),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        const result =
          await service.claim(
            baseInput({
              workerId:
                "worker-1",

              claimToken:
                "claim-1",
            })
          );

        expect(
          result.claimed
        )
          .toBe(
            true
          );

        expect(
          result.claimToken
        )
          .toBe(
            "claim-1"
          );
      }
    );

    test(
      "claim increments attempt count",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint(),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service.claim(
          baseInput({
            workerId:
              "worker-1",
          })
        );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1];

        expect(
          update.$inc
        )
          .toEqual({
            attempt:
              1,
          });
      }
    );

    test(
      "heartbeat uses owner and claim token fencing",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint(),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service.heartbeat(
          baseInput({
            workerId:
              "worker-1",

            claimToken:
              "claim-1",
          })
        );

        const filter =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][0];

        expect(
          filter
        )
          .toMatchObject({
            status:
              CHECKPOINT_STATUS
                .PROCESSING,

            "owner.workerId":
              "worker-1",

            "owner.claimToken":
              "claim-1",
          });
      }
    );

    test(
      "complete clears runtime ownership",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service.complete(
          baseInput({
            workerId:
              "worker-1",

            claimToken:
              "claim-1",

            result: {
              success:
                true,
            },
          })
        );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1]
            .$set;

        expect(
          update.status
        )
          .toBe(
            CHECKPOINT_STATUS
              .COMPLETED
          );

        expect(
          update["owner.workerId"]
        )
          .toBeNull();

        expect(
          update["owner.claimToken"]
        )
          .toBeNull();
      }
    );

    test(
      "result cannot persist execution authorization",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .COMPLETED,
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service.complete(
          baseInput({
            workerId:
              "worker-1",

            claimToken:
              "claim-1",

            result: {
              success:
                true,

              executionAuthorized:
                true,
            },
          })
        );

        const persistedResult =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1]
            .$set
            .result;

        expect(
          persistedResult
            .executionAuthorized
        )
          .toBeUndefined();
      }
    );

    test(
      "failure persists error without reusable ownership",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .FAILED,
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service.fail(
          baseInput({
            workerId:
              "worker-1",

            claimToken:
              "claim-1",

            error: {
              code:
                "TEMPORARY_FAILURE",

              message:
                "temporary",

              retryable:
                true,
            },
          })
        );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1]
            .$set;

        expect(
          update.status
        )
          .toBe(
            CHECKPOINT_STATUS
              .FAILED
          );

        expect(
          update["error.retryable"]
        )
          .toBe(
            true
          );
      }
    );

    test(
      "expired processing checkpoint may be marked abandoned",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        const result =
          await service
            .markAbandoned(
              baseInput({
                reason:
                  INTERRUPTION_REASON
                    .LEASE_EXPIRED,
              })
            );

        expect(
          result.abandoned
        )
          .toBe(
            true
          );

        const filter =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][0];

        expect(
          filter.status
        )
          .toBe(
            CHECKPOINT_STATUS
              .PROCESSING
          );

        expect(
          filter[
            "owner.leaseExpiresAt"
          ]
        )
          .toBeDefined();
      }
    );

    test(
      "abandoned checkpoint records interruption",
      async () => {
        const repo =
          repository({
            updated:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await service
          .markAbandoned(
            baseInput({
              reason:
                INTERRUPTION_REASON
                  .WORKER_CRASHED,

              resumeSafety:
                RESUME_SAFETY
                  .REQUIRES_RECONCILIATION,
            })
          );

        const update =
          repo
            .findOneAndUpdate
            .mock
            .calls[0][1]
            .$set;

        expect(
          update[
            "interruption.interrupted"
          ]
        )
          .toBe(
            true
          );

        expect(
          update[
            "interruption.reason"
          ]
        )
          .toBe(
            INTERRUPTION_REASON
              .WORKER_CRASHED
          );
      }
    );

    test(
      "stale worker cannot complete checkpoint",
      async () => {
        const repo =
          repository({
            updated:
              null,

            found:
              checkpoint({
                owner: {
                  workerId:
                    "worker-2",

                  claimToken:
                    "claim-2",
                },
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await expect(
          service.complete(
            baseInput({
              workerId:
                "worker-1",

              claimToken:
                "claim-1",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_CHECKPOINT_OWNER_MISMATCH",
          });
      }
    );

    test(
      "stale claim token cannot heartbeat checkpoint",
      async () => {
        const repo =
          repository({
            updated:
              null,

            found:
              checkpoint({
                owner: {
                  workerId:
                    "worker-1",

                  claimToken:
                    "claim-new",
                },
              }),
          });

        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await expect(
          service.heartbeat(
            baseInput({
              workerId:
                "worker-1",

              claimToken:
                "claim-old",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_CHECKPOINT_CLAIM_TOKEN_MISMATCH",
          });
      }
    );

    test(
      "runtime persistence rejects execution authorization",
      async () => {
        const service =
          new RuntimeCheckpointPersistenceService({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        await expect(
          service.ensureCheckpoint(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION",
          });
      }
    );
  }
);