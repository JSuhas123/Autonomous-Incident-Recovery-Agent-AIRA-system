"use strict";

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_DECISION,
  RESUME_SAFETY,

  assertRuntimeStage,
  assertCheckpointStatus,
  assertResumeDecision,
  assertResumeSafety,

  isTerminalCheckpointStatus,
  isActiveCheckpointStatus,
  isResumableStage,

  requiresReconciliationBeforeResume,

  assertNoExecutionAuthorization,
} =
  require(
    "../recoveryRuntimeContracts"
  );

describe(
  "Runtime Recovery Contracts",
  () => {
    test(
      "all protected workflow stages are resumable",
      () => {
        for (
          const stage
          of [
            RUNTIME_STAGE
              .RECOVERY_DECISION,

            RUNTIME_STAGE
              .EXECUTION,

            RUNTIME_STAGE
              .VERIFICATION,

            RUNTIME_STAGE
              .LIFECYCLE,
          ]
        ) {
          expect(
            isResumableStage(
              stage
            )
          )
            .toBe(
              true
            );
        }
      }
    );

    test(
      "completed checkpoint is terminal",
      () => {
        expect(
          isTerminalCheckpointStatus(
            CHECKPOINT_STATUS
              .COMPLETED
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "failed checkpoint is terminal",
      () => {
        expect(
          isTerminalCheckpointStatus(
            CHECKPOINT_STATUS
              .FAILED
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "processing checkpoint remains active",
      () => {
        expect(
          isActiveCheckpointStatus(
            CHECKPOINT_STATUS
              .PROCESSING
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "waiting checkpoint remains active",
      () => {
        expect(
          isActiveCheckpointStatus(
            CHECKPOINT_STATUS
              .WAITING
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "interrupted execution requires reconciliation",
      () => {
        expect(
          requiresReconciliationBeforeResume(
            RUNTIME_STAGE
              .EXECUTION,

            CHECKPOINT_STATUS
              .PROCESSING
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "abandoned execution requires reconciliation",
      () => {
        expect(
          requiresReconciliationBeforeResume(
            RUNTIME_STAGE
              .EXECUTION,

            CHECKPOINT_STATUS
              .ABANDONED
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "verification processing does not automatically require mutation reconciliation",
      () => {
        expect(
          requiresReconciliationBeforeResume(
            RUNTIME_STAGE
              .VERIFICATION,

            CHECKPOINT_STATUS
              .PROCESSING
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects invalid runtime stage",
      () => {
        expect(
          () =>
            assertRuntimeStage(
              "RAW_SHELL"
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RUNTIME_STAGE_INVALID",
            })
          );
      }
    );

    test(
      "rejects invalid checkpoint status",
      () => {
        expect(
          () =>
            assertCheckpointStatus(
              "RUN_AGAIN"
            )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "RUNTIME_CHECKPOINT_STATUS_INVALID",
            })
          );
      }
    );

    test(
      "valid resume decision is accepted",
      () => {
        expect(
          assertResumeDecision(
            RESUME_DECISION
              .MANUAL_INTERVENTION
          )
        )
          .toBe(
            RESUME_DECISION
              .MANUAL_INTERVENTION
          );
      }
    );

    test(
      "valid resume safety is accepted",
      () => {
        expect(
          assertResumeSafety(
            RESUME_SAFETY
              .REQUIRES_RECONCILIATION
          )
        )
          .toBe(
            RESUME_SAFETY
              .REQUIRES_RECONCILIATION
          );
      }
    );

    test(
      "runtime recovery never accepts execution authorization",
      () => {
        expect(
          () =>
            assertNoExecutionAuthorization({
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
      "safe input keeps authorization false",
      () => {
        expect(
          assertNoExecutionAuthorization({
            executionAuthorized:
              false,
          })
        )
          .toBe(
            true
          );
      }
    );
  }
);