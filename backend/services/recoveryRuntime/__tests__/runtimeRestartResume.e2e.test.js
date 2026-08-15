"use strict";

const {
  RuntimeRecoveryCoordinator,
} =
  require(
    "../runtimeRecoveryCoordinator"
  );

const {
  RuntimeResumeStateResolver,
} =
  require(
    "../runtimeResumeStateResolver"
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
// FIXTURES
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

      recoveryDecisionId:
        "recovery-1",

      executionRequestId:
        "execution-request-1",

      verificationId:
        "verification-1",

      lifecycleId:
        "lifecycle-1",
    },

    owner: {
      workerId:
        "dead-worker",

      claimToken:
        "dead-claim",

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

    result:
      null,

    error: {
      retryable:
        false,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function staleDetection(
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

function createDetector(
  item
) {
  return {
    scan:
      jest.fn(
        async () => ({
          scanned:
            1,

          items: [
            item,
          ],

          recoverableCandidates: [
            item,
          ],

          executionStarted:
            false,

          executionAuthorized:
            false,
        })
      ),
  };
}

function createPersistence({
  processingCheckpoint,
  abandonedCheckpoint,
}) {
  let current =
    processingCheckpoint;

  return {
    findByIdentity:
      jest.fn(
        async () =>
          current
      ),

    markAbandoned:
      jest.fn(
        async () => {
          current =
            abandonedCheckpoint;

          return {
            abandoned:
              true,

            checkpoint:
              current,

            executionAuthorized:
              false,
          };
        }
      ),
  };
}

// ============================================================================
// VERIFICATION E2E
// ============================================================================

describe(
  "Phase 11.2 Restart / Resume E2E",
  () => {
    test(
      "crashed verification resumes through protected verification worker",
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

              detectedAt:
                new Date(
                  "2026-08-15T10:02:00.000Z"
                ),
            },
          });

        const detector =
          createDetector(
            staleDetection({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,
            })
          );

        const persistence =
          createPersistence({
            processingCheckpoint:
              processing,

            abandonedCheckpoint:
              abandoned,
          });

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const recoveryPlan =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),

            executionAuthorized:
              false,
          });

        expect(
          recoveryPlan.resume
        )
          .toHaveLength(
            1
          );

        const verificationWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,

                success:
                  true,

                verificationStarted:
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

        const plan = {
          ...recoveryPlan.resume[0],

          workflowIdentity:
            abandoned.workflowIdentity,

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
        };

        const resumed =
          await recoveryWorker
            .process(
              plan
            );

        expect(
          persistence
            .markAbandoned
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          verificationWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          resumed.dispatched
        )
          .toBe(
            true
          );

        expect(
          resumed.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // LIFECYCLE E2E
    // ========================================================================

    test(
      "crashed lifecycle resumes through protected lifecycle worker",
      async () => {
        const processing =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .LIFECYCLE,

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
                .LIFECYCLE,

            status:
              CHECKPOINT_STATUS
                .ABANDONED,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const detector =
          createDetector(
            staleDetection({
              stage:
                RUNTIME_STAGE
                  .LIFECYCLE,
            })
          );

        const persistence =
          createPersistence({
            processingCheckpoint:
              processing,

            abandonedCheckpoint:
              abandoned,
          });

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const recoveryPlan =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),
          });

        expect(
          recoveryPlan.resume
        )
          .toHaveLength(
            1
          );

        const lifecycleWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,

                type:
                  "NO_ACTION",

                recoveryStarted:
                  false,

                rollbackStarted:
                  false,

                executionStarted:
                  false,

                executionAuthorized:
                  false,
              })
            ),
        };

        const recoveryWorker =
          new RuntimeRecoveryWorker({
            lifecycleWorker,

            verificationWorker: {
              process:
                jest.fn(),
            },

            recoveryDecisionWorker: {
              process:
                jest.fn(),
            },
          });

        const plan = {
          ...recoveryPlan.resume[0],

          workflowIdentity:
            abandoned.workflowIdentity,

          resumePayload: {
            lifecycleIntent:
              "PROCESS_VERIFICATION_OUTCOME",
          },

          executionAuthorized:
            false,
        };

        const resumed =
          await recoveryWorker.process(
            plan
          );

        expect(
          lifecycleWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          resumed.dispatched
        )
          .toBe(
            true
          );

        expect(
          resumed.executionStarted
        )
          .toBe(
            false
          );

        expect(
          resumed.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // RECOVERY DECISION E2E
    // ========================================================================

    test(
      "crashed recovery decision resumes through protected recovery worker",
      async () => {
        const processing =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .RECOVERY_DECISION,

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
                .RECOVERY_DECISION,

            status:
              CHECKPOINT_STATUS
                .ABANDONED,

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const detector =
          createDetector(
            staleDetection({
              stage:
                RUNTIME_STAGE
                  .RECOVERY_DECISION,
            })
          );

        const persistence =
          createPersistence({
            processingCheckpoint:
              processing,

            abandonedCheckpoint:
              abandoned,
          });

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const recoveryPlan =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),
          });

        expect(
          recoveryPlan.resume
        )
          .toHaveLength(
            1
          );

        const recoveryDecisionWorker = {
          process:
            jest.fn(
              async () => ({
                processed:
                  true,

                success:
                  true,

                executionAuthorized:
                  false,
              })
            ),
        };

        const runtimeWorker =
          new RuntimeRecoveryWorker({
            recoveryDecisionWorker,

            verificationWorker: {
              process:
                jest.fn(),
            },

            lifecycleWorker: {
              process:
                jest.fn(),
            },
          });

        const plan = {
          ...recoveryPlan.resume[0],

          workflowIdentity:
            abandoned.workflowIdentity,

          resumePayload: {
            diagnosis: {
              diagnosisId:
                "diagnosis-1",

              revision:
                1,
            },

            safetyGate: {
              passed:
                true,
            },
          },

          executionAuthorized:
            false,
        };

        const resumed =
          await runtimeWorker.process(
            plan
          );

        expect(
          recoveryDecisionWorker
            .process
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          resumed.dispatched
        )
          .toBe(
            true
          );

        expect(
          resumed.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // EXECUTION E2E
    // ========================================================================

    test(
      "crashed execution ends in manual reconciliation and is never dispatched",
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

        const detector =
          createDetector(
            staleDetection({
              stage:
                RUNTIME_STAGE
                  .EXECUTION,

              mutationReconciliationRequired:
                true,
            })
          );

        const persistence =
          createPersistence({
            processingCheckpoint:
              processing,

            abandonedCheckpoint:
              abandoned,
          });

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence,

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const recoveryPlan =
          await coordinator.recover({
            now:
              new Date(
                "2026-08-15T10:02:00.000Z"
              ),
          });

        expect(
          recoveryPlan
            .manualIntervention
        )
          .toHaveLength(
            1
          );

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

        const runtimeWorker =
          new RuntimeRecoveryWorker({
            verificationWorker,
            lifecycleWorker,
            recoveryDecisionWorker,
          });

        const plan = {
          ...recoveryPlan
            .manualIntervention[0],

          workflowIdentity:
            abandoned.workflowIdentity,

          executionAuthorized:
            false,
        };

        const resumed =
          await runtimeWorker.process(
            plan
          );

        expect(
          resumed.dispatched
        )
          .toBe(
            false
          );

        expect(
          resumed.manualIntervention
        )
          .toBe(
            true
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

        expect(
          resumed.executionStarted
        )
          .toBe(
            false
          );

        expect(
          resumed.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // COMPLETED CHECKPOINT
    // ========================================================================

    test(
      "completed work is skipped after restart",
      async () => {
        const completed =
          checkpoint({
            stage:
              RUNTIME_STAGE
                .VERIFICATION,

            status:
              CHECKPOINT_STATUS
                .COMPLETED,

            result: {
              verificationId:
                "verification-1",

              success:
                true,
            },

            resumeSafety:
              RESUME_SAFETY
                .SAFE,
          });

        const resolver =
          new RuntimeResumeStateResolver();

        const resolution =
          resolver.resolve({
            checkpoint:
              completed,

            executionAuthorized:
              false,
          });

        expect(
          resolution.decision
        )
          .toBe(
            RESUME_DECISION
              .SKIP_COMPLETED
          );

        expect(
          resolution.previousResult
        )
          .toEqual({
            verificationId:
              "verification-1",

            success:
              true,
          });
      }
    );

    // ========================================================================
    // LIVE CHECKPOINT
    // ========================================================================

    test(
      "restart does not steal work from worker whose lease is still alive",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const resolution =
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
                    "worker-still-running",

                  claimToken:
                    "live-claim",

                  leaseExpiresAt:
                    new Date(
                      "2026-08-15T10:05:00.000Z"
                    ),
                },
              }),

            executionAuthorized:
              false,
          });

        expect(
          resolution.decision
        )
          .toBe(
            RESUME_DECISION
              .WAIT
          );
      }
    );

    // ========================================================================
    // UNKNOWN SAFETY
    // ========================================================================

    test(
      "unknown non-execution recovery safety fails closed",
      () => {
        const resolver =
          new RuntimeResumeStateResolver();

        const resolution =
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

            executionAuthorized:
              false,
          });

        expect(
          resolution.decision
        )
          .toBe(
            RESUME_DECISION
              .BLOCK
          );

        expect(
          resolution.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    // ========================================================================
    // GLOBAL SAFETY
    // ========================================================================

    test(
      "restart resume pipeline never manufactures execution authorization",
      async () => {
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
          });

        const detector =
          createDetector(
            staleDetection({
              stage:
                RUNTIME_STAGE
                  .VERIFICATION,
            })
          );

        const coordinator =
          new RuntimeRecoveryCoordinator({
            detector,

            persistence:
              createPersistence({
                processingCheckpoint:
                  checkpoint(),

                abandonedCheckpoint:
                  abandoned,
              }),

            resolver:
              new RuntimeResumeStateResolver(),
          });

        const result =
          await coordinator.recover({
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

        for (
          const plan
          of result.plans
        ) {
          expect(
            plan.executionStarted
          )
            .toBe(
              false
            );

          expect(
            plan.executionAuthorized
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);