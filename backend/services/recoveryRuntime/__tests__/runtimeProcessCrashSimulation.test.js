"use strict";

const {
  RuntimeResumeStateResolver,
} =
  require(
    "../runtimeResumeStateResolver"
  );

const {
  RuntimeRecoveryCoordinator,
} =
  require(
    "../runtimeRecoveryCoordinator"
  );

const {
  RuntimeRecoveryWorker,
} =
  require(
    "../../../workers/runtimeRecoveryWorker"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  RESUME_SAFETY,
  INTERRUPTION_REASON,
} =
  require(
    "../recoveryRuntimeContracts"
  );

const {
  DETECTION_CLASS,
} =
  require(
    "../runtimeStaleOperationDetector"
  );

// ============================================================================
// HELPERS
// ============================================================================

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
        .PROCESSING,

    workflowIdentity: {
      diagnosisId:
        "diagnosis-1",

      diagnosisRevision:
        1,

      executionRequestId:
        "execution-request-1",

      verificationId:
        "verification-1",

      lifecycleId:
        "lifecycle-1",
    },

    owner: {
      workerId:
        "worker-before-crash",

      claimToken:
        "claim-before-crash",

      claimedAt:
        new Date(
          "2026-08-15T10:00:00.000Z"
        ),

      heartbeatAt:
        new Date(
          "2026-08-15T10:00:00.000Z"
        ),

      leaseExpiresAt:
        new Date(
          "2026-08-15T10:01:00.000Z"
        ),
    },

    interruption: {
      interrupted:
        false,

      reason:
        null,

      detectedAt:
        null,
    },

    resumeSafety:
      RESUME_SAFETY
        .SAFE,

    error: {
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

function detection(
  overrides = {}
) {
  return {
    checkpointId:
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
        .PROCESSING,

    classification:
      DETECTION_CLASS
        .STALE,

    recoveryCandidate:
      true,

    mutationReconciliationRequired:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

function persistence({
  found,
  abandoned,
} = {}) {
  return {
    findByIdentity:
      jest.fn(
        async () =>
          found ||
          null
      ),

    markAbandoned:
      jest.fn(
        async () =>
          abandoned || {
            abandoned:
              false,

            checkpoint:
              null,

            executionAuthorized:
              false,
          }
      ),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe(
  "Runtime Process Crash Simulation",
  () => {
    test(
      "crashed verification becomes resumable after lease expiry",
      async () => {
        const abandonedCheckpoint =
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

            interruption: {
              interrupted:
                true,

              reason:
                INTERRUPTION_REASON
                  .LEASE_EXPIRED,

              detectedAt:
                new Date(
                  "2026-08-15T10:02:00.000Z"
                ),
            },
          });

        const resolver =
          new RuntimeResumeStateResolver();

        const result =
          resolver.resolve({
            checkpoint:
              abandonedCheckpoint,

            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),

            executionAuthorized:
              false,
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .RESUME
          );

        expect(
          result.resumeSafety
        )
          .toBe(
            RESUME_SAFETY
              .SAFE
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
      "crashed lifecycle becomes resumable after lease expiry",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .LIFECYCLE,

                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),

            executionAuthorized:
              false,
          });

        expect(
          result.decision
        )
          .toBe(
            RESUME_DECISION
              .RESUME
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
      "crashed recovery decision becomes resumable",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const result =
          resolver.resolve({
            checkpoint:
              checkpoint({
                stage:
                  RUNTIME_STAGE
                    .RECOVERY_DECISION,

                status:
                  CHECKPOINT_STATUS
                    .ABANDONED,

                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),

            executionAuthorized:
              false,
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
      "crashed execution is never automatically resumable",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

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

                /*
                 * Even if some bad caller persisted SAFE, the resolver must
                 * still force reconciliation because the stage itself is
                 * mutating.
                 */
                resumeSafety:
                  RESUME_SAFETY
                    .SAFE,
              }),

            executionAuthorized:
              false,
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

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "expired execution PROCESSING checkpoint requires reconciliation",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const result =
          resolver.resolve({
            now:
              new Date(
                "2026-08-15T10:05:00.000Z"
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
                    "dead-execution-worker",

                  claimToken:
                    "dead-claim",

                  leaseExpiresAt:
                    new Date(
                      "2026-08-15T10:01:00.000Z"
                    ),
                },
              }),

            executionAuthorized:
              false,
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
      "live worker is not treated as crashed",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const result =
          resolver.resolve({
            now:
              new Date(
                "2026-08-15T10:00:30.000Z"
              ),

            checkpoint:
              checkpoint({
                status:
                  CHECKPOINT_STATUS
                    .PROCESSING,

                owner: {
                  workerId:
                    "still-alive",

                  claimToken:
                    "live-claim",

                  leaseExpiresAt:
                    new Date(
                      "2026-08-15T10:01:00.000Z"
                    ),
                },
              }),

            executionAuthorized:
              false,
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
      "restart coordinator marks stale verification abandoned before resolving resume",
      async () => {
        const processing =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .VERIFICATION,

            status:
              CHECKPOINT_STATUS
                .PROCESSING,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const abandoned =
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

            interruption: {
              interrupted:
                true,

              reason:
                INTERRUPTION_REASON
                  .LEASE_EXPIRED,
            },
          });

        const persist =
          persistence({
            found:
              processing,

            abandoned: {
              abandoned:
                true,

              checkpoint:
                abandoned,

              executionAuthorized:
                false,
            },
          });

        const detector = {
          scan:
            jest.fn(
              async () => ({
                scanned:
                  1,

                items: [
                  detection({
                    stage:
                      RUNTIME_STAGE
                        .VERIFICATION,
                  }),
                ],

                executionAuthorized:
                  false,
              })
            ),
        };

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence:
              persist,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const result =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),

            executionAuthorized:
              false,
          });

        expect(
          persist.markAbandoned
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.resume
        )
          .toHaveLength(
            1
          );

        expect(
          result.resume[0]
            .decision
        )
          .toBe(
            RESUME_DECISION
              .RESUME
          );
      }
    );

    test(
      "restart coordinator routes stale execution to manual intervention",
      async () => {
        const processing =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .EXECUTION,

            status:
              CHECKPOINT_STATUS
                .PROCESSING,

            resumeSafety:
              RESUME_SAFETY
                .UNKNOWN,
          });

        const abandoned =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .EXECUTION,

            status:
              CHECKPOINT_STATUS
                .ABANDONED,

            resumeSafety:
              RESUME_SAFETY
                .REQUIRES_RECONCILIATION,

            interruption: {
              interrupted:
                true,

              reason:
                INTERRUPTION_REASON
                  .LEASE_EXPIRED,
            },
          });

        const persist =
          persistence({
            found:
              processing,

            abandoned: {
              abandoned:
                true,

              checkpoint:
                abandoned,
            },
          });

        const detector = {
          scan:
            jest.fn(
              async () => ({
                scanned:
                  1,

                items: [
                  detection({
                    stage:
                      RUNTIME_STAGE
                        .EXECUTION,

                    mutationReconciliationRequired:
                      true,
                  }),
                ],
              })
            ),
        };

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence:
              persist,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const result =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),
          });

        expect(
          result.manualIntervention
        )
          .toHaveLength(
            1
          );

        expect(
          result.manualIntervention[0]
            .mutationReconciliationRequired
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
      "runtime recovery worker dispatches crashed verification through protected worker",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,

                executionAuthorized:
                  false,
              })
            ),
        };

        const recoveryWorker =
          new RuntimeRecoveryWorker({
            verificationWorker,

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const result =
          await recoveryWorker.process({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            operationKey:
              "verification-op",

            stage:
              RUNTIME_STAGE
                .VERIFICATION,

            decision:
              RESUME_DECISION
                .RESUME,

            workflowIdentity: {
              executionRequestId:
                "execution-request-1",

              verificationId:
                "verification-1",
            },

            resumePayload: {
              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-hash-1",

              verificationPlan: {
                planId:
                  "verification-plan-1",

                planHash:
                  "verification-hash-1",
              },
            },

            executionAuthorized:
              false,
          });

        expect(
          verificationWorker.process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.dispatched
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
      "runtime recovery worker never dispatches crashed execution",
      async () => {
        const verificationWorker = {
          process:
            jest.fn(),
        };

        const lifecycleWorker = {
          process:
            jest.fn(),
        };

        const recoveryDecisionWorker = {
          process:
            jest.fn(),
        };

        const recoveryWorker =
          new RuntimeRecoveryWorker({
            verificationWorker,
            lifecycleWorker,
            recoveryDecisionWorker,
          });

        const result =
          await recoveryWorker.process({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            operationKey:
              "execution-op",

            stage:
              RUNTIME_STAGE
                .EXECUTION,

            decision:
              RESUME_DECISION
                .RESUME,

            workflowIdentity: {
              executionRequestId:
                "execution-request-1",
            },

            executionAuthorized:
              false,
          });

        expect(
          result.dispatched
        )
          .toBe(
            false
          );

        expect(
          result.manualIntervention
        )
          .toBe(
            true
          );

        expect(
          result.reason
        )
          .toBe(
            "EXECUTION_RUNTIME_REPLAY_FORBIDDEN"
          );

        expect(
          verificationWorker.process
        )
          .not
          .toHaveBeenCalled();

        expect(
          lifecycleWorker.process
        )
          .not
          .toHaveBeenCalled();

        expect(
          recoveryDecisionWorker.process
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "crash recovery never creates execution authorization",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const stages = [
          RUNTIME_STAGE
            .RECOVERY_DECISION,

          RUNTIME_STAGE
            .EXECUTION,

          RUNTIME_STAGE
            .VERIFICATION,

          RUNTIME_STAGE
            .LIFECYCLE,
        ];

        for (
          const stage
          of stages
        ) {
          const result =
            resolver.resolve({
              checkpoint:
                checkpoint({
                  stage,

                  status:
                    CHECKPOINT_STATUS
                      .ABANDONED,

                  resumeSafety:
                    stage ===
                      RUNTIME_STAGE
                        .EXECUTION
                      ? RESUME_SAFETY
                          .REQUIRES_RECONCILIATION
                      : RESUME_SAFETY
                          .SAFE,
                }),

              executionAuthorized:
                false,
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