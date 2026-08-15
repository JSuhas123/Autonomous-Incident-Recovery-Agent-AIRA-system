"use strict";

const {
  RuntimeStaleOperationDetector,
  DETECTION_CLASS,
} =
  require(
    "../runtimeStaleOperationDetector"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

function checkpoint(
  overrides = {}
) {
  return {
    _id:
      "checkpoint-1",

    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    operationKey:
      "operation-1",

    stage:
      RUNTIME_STAGE
        .VERIFICATION,

    status:
      CHECKPOINT_STATUS
        .PENDING,

    owner: {
      workerId:
        null,

      claimToken:
        null,

      leaseExpiresAt:
        null,
    },

    interruption: {
      interrupted:
        false,

      reason:
        null,
    },

    error: {
      retryable:
        false,
    },

    resumeSafety:
      RESUME_SAFETY
        .UNKNOWN,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function repository(
  items = []
) {
  return {
    find:
      jest.fn(
        async () =>
          items
      ),
  };
}

describe(
  "RuntimeStaleOperationDetector",
  () => {
    test(
      "processing checkpoint with valid lease is live",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
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
                    "2026-08-15T11:00:00.000Z"
                  ),
              },
            }),
            {
              now:
                new Date(
                  "2026-08-15T10:00:00.000Z"
                ),
            }
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .LIVE
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            false
          );
      }
    );

    test(
      "expired processing lease is stale",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              status:
                CHECKPOINT_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "dead-worker",

                claimToken:
                  "dead-claim",

                leaseExpiresAt:
                  new Date(
                    "2026-08-15T09:00:00.000Z"
                  ),
              },
            }),
            {
              now:
                new Date(
                  "2026-08-15T10:00:00.000Z"
                ),
            }
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .STALE
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "expired execution requires reconciliation",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              status:
                CHECKPOINT_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "dead-worker",

                claimToken:
                  "dead-claim",

                leaseExpiresAt:
                  new Date(
                    "2026-08-15T09:00:00.000Z"
                  ),
              },
            }),
            {
              now:
                new Date(
                  "2026-08-15T10:00:00.000Z"
                ),
            }
          );

        expect(
          result.mutationReconciliationRequired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "abandoned verification is recovery candidate",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              status:
                CHECKPOINT_STATUS
                  .ABANDONED,
            })
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .ABANDONED
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "waiting checkpoint is not automatically recovered",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              status:
                CHECKPOINT_STATUS
                  .WAITING,
            })
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .WAITING
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            false
          );
      }
    );

    test(
      "pending checkpoint is recovery candidate",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              status:
                CHECKPOINT_STATUS
                  .PENDING,
            })
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .PENDING
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "completed checkpoint is terminal",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              status:
                CHECKPOINT_STATUS
                  .COMPLETED,
            })
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .COMPLETED
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            false
          );
      }
    );

    test(
      "safe retryable failed verification is recovery candidate",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,

              status:
                CHECKPOINT_STATUS
                  .FAILED,

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              error: {
                retryable:
                  true,
              },
            })
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "failed execution is never automatic runtime recovery candidate",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              status:
                CHECKPOINT_STATUS
                  .FAILED,

              resumeSafety:
                RESUME_SAFETY
                  .SAFE,

              error: {
                retryable:
                  true,
              },
            })
          );

        expect(
          result.recoveryCandidate
        )
          .toBe(
            false
          );
      }
    );

    test(
      "inconclusive execution requires reconciliation",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        const result =
          detector.classify(
            checkpoint({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              status:
                CHECKPOINT_STATUS
                  .INCONCLUSIVE,
            })
          );

        expect(
          result.classification
        )
          .toBe(
            DETECTION_CLASS
              .INCONCLUSIVE
          );

        expect(
          result.mutationReconciliationRequired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "scan separates stale and live checkpoints",
      async () => {
        const repo =
          repository([
            checkpoint({
              _id:
                "live",

              operationKey:
                "live-op",

              status:
                CHECKPOINT_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "worker-live",

                claimToken:
                  "claim-live",

                leaseExpiresAt:
                  new Date(
                    "2026-08-15T11:00:00.000Z"
                  ),
              },
            }),

            checkpoint({
              _id:
                "stale",

              operationKey:
                "stale-op",

              status:
                CHECKPOINT_STATUS
                  .PROCESSING,

              owner: {
                workerId:
                  "worker-dead",

                claimToken:
                  "claim-dead",

                leaseExpiresAt:
                  new Date(
                    "2026-08-15T09:00:00.000Z"
                  ),
              },
            }),
          ]);

        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        const result =
          await detector.scan({
            now:
              new Date(
                "2026-08-15T10:00:00.000Z"
              ),

            executionAuthorized:
              false,
          });

        expect(
          result.scanned
        )
          .toBe(
            2
          );

        expect(
          result.live
        )
          .toHaveLength(
            1
          );

        expect(
          result.stale
        )
          .toHaveLength(
            1
          );

        expect(
          result.recoverableCandidates
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "recoverable scan uses constrained status filter",
      async () => {
        const repo =
          repository([]);

        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repo,
          });

        await detector.scan({
          organizationId:
            "org-1",

          environmentId:
            "prod",

          onlyRecoverable:
            true,

          executionAuthorized:
            false,
        });

        const filter =
          repo.find
            .mock
            .calls[0][0];

        expect(
          filter.organizationId
        )
          .toBe(
            "org-1"
          );

        expect(
          filter.environmentId
        )
          .toBe(
            "prod"
          );

        expect(
          filter.status.$in
        )
          .toContain(
            CHECKPOINT_STATUS
              .PROCESSING
          );

        expect(
          filter.status.$in
        )
          .not
          .toContain(
            CHECKPOINT_STATUS
              .COMPLETED
          );
      }
    );

    test(
      "detector rejects execution authorization",
      async () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        await expect(
          detector.scan({
            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION",
          });
      }
    );

    test(
      "checkpoint containing execution authorization is rejected",
      () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository(),
          });

        expect(
          () =>
            detector.classify(
              checkpoint({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RUNTIME_STALE_UNSAFE_CHECKPOINT",
            })
          );
      }
    );

    test(
      "detector results never start infrastructure execution",
      async () => {
        const detector =
          new RuntimeStaleOperationDetector({
            RuntimeRecoveryCheckpoint:
              repository([
                checkpoint(),
              ]),
          });

        const result =
          await detector.scan({
            executionAuthorized:
              false,
          });

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.items[0]
            .executionStarted
        )
          .toBe(
            false
          );
      }
    );
  }
);