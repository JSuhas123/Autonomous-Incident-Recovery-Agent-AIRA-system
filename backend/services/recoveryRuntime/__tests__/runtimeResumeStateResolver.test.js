"use strict";

const {
  RuntimeResumeStateResolver,
} =
  require(
    "../runtimeResumeStateResolver"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntimeContracts"
  );

function checkpoint(
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
      "operation-1",

    stage:
      RUNTIME_STAGE
        .VERIFICATION,

    status:
      CHECKPOINT_STATUS
        .PENDING,

    resumeSafety:
      RESUME_SAFETY
        .UNKNOWN,

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
      code:
        null,

      message:
        null,

      retryable:
        false,
    },

    result:
      null,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "RuntimeResumeStateResolver",
  () => {
    let resolver;

    beforeEach(
      () => {
        resolver =
          new RuntimeResumeStateResolver();
      }
    );

    test(
      "missing checkpoint starts untouched stage",
      () => {
        const result =
          resolver.resolve({
            stage:
              RUNTIME_STAGE
                .VERIFICATION,

            checkpoint:
              null,

            executionAuthorized:
              false,
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .START
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
      "pending checkpoint may start",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .PENDING,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .START
          );
      }
    );

    test(
      "completed checkpoint is never rerun",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .COMPLETED,

                result: {
                  verificationId:
                    "verification-1",
                },
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .SKIP_COMPLETED
          );

        expect(
          result.previousResult
        )
          .toEqual({
            verificationId:
              "verification-1",
          });
      }
    );

    test(
      "live processing lease waits for current owner",
      () => {
        const now =
          new Date(
            "2026-08-15T10:00:00.000Z"
          );

        const result =
          resolver.resolve({
            now,

            checkpoint:
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
                      "2026-08-15T10:05:00.000Z"
                    ),
                },
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .WAIT
          );
      }
    );

    test(
      "expired execution processing requires manual intervention",
      () => {
        const result =
          resolver.resolve({
            now:
              new Date(
                "2026-08-15T10:10:00.000Z"
              ),

            checkpoint:
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
                      "2026-08-15T10:00:00.000Z"
                    ),
                },
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .MANUAL_INTERVENTION
          );

        expect(
          result.resumeSafety
        )
          .toBe(
            RESUME_SAFETY
              .REQUIRES_RECONCILIATION
          );
      }
    );

    test(
      "abandoned execution is never blindly resumed",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .EXECUTION,

                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "safe abandoned verification may resume",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .VERIFICATION,

                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .RESUME
          );
      }
    );

    test(
      "unknown abandoned verification is blocked",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .VERIFICATION,

                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,

                resumeSafety:
                  RESUME_SAFETY
                    .UNKNOWN,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .BLOCK
          );
      }
    );

    test(
      "retryable safe failed verification may retry",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
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
                  code:
                    "TEMPORARY_PROVIDER_FAILURE",

                  retryable:
                    true,
                },
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .RETRY_SAFE
          );
      }
    );

    test(
      "retryable failed execution is not runtime retried",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
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
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .BLOCK
          );
      }
    );

    test(
      "non-retryable failed stage is blocked",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .FAILED,

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,

                error: {
                  retryable:
                    false,
                },
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .BLOCK
          );
      }
    );

    test(
      "waiting checkpoint remains waiting",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .WAITING,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .WAIT
          );
      }
    );

    test(
      "inconclusive execution requires manual intervention",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .EXECUTION,

                status:
                  CHECKPOINT_STATUS
                    .INCONCLUSIVE,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "inconclusive verification fails closed",
      () => {
        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .VERIFICATION,

                status:
                  CHECKPOINT_STATUS
                    .INCONCLUSIVE,
              }),
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .BLOCK
          );
      }
    );

    test(
      "resolver rejects execution authorization",
      () => {
        expect(
          () =>
            resolver.resolve({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RUNTIME_RECOVERY_UNSAFE_AUTHORIZATION",
            })
          );
      }
    );

    test(
      "resolver rejects checkpoint containing execution authorization",
      () => {
        expect(
          () =>
            resolver.resolve({
              checkpoint:
                checkpoint({
                  executionAuthorized:
                    true,
                }),
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RUNTIME_RESUME_UNSAFE_CHECKPOINT",
            })
          );
      }
    );

    test(
      "all resolver outputs keep execution authorization false",
      () => {
        const cases = [
          checkpoint({
            status:
              CHECKPOINT_STATUS
                .PENDING,
          }),

          checkpoint({
            status:
              CHECKPOINT_STATUS
                .WAITING,
          }),

          checkpoint({
            status:
              CHECKPOINT_STATUS
                .COMPLETED,
          }),

          checkpoint({
            status:
              CHECKPOINT_STATUS
                .FAILED,
          }),
        ];

        for (
          const item
          of cases
        ) {
          const result =
            resolver.resolve({
              checkpoint:
                item,
            });

          expect(
            result.executionAuthorized
          )
            .toBe(
              false
            );

          expect(
            result.executionStarted
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);