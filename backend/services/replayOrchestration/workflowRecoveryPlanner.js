"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.4.2
 * WORKFLOW RECOVERY PLANNER
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Reconstruct the durable state of one recovery workflow and determine:
 *
 * - is the workflow already complete?
 * - what stage completed?
 * - what stage is incomplete?
 * - can AIRA safely resume automatically?
 * - must AIRA reconcile ambiguous state?
 * - is human review required?
 * - is replay forbidden?
 *
 *
 * IMPORTANT
 * ---------
 *
 * This service does NOT:
 *
 * - execute infrastructure
 * - invoke workers
 * - publish RabbitMQ messages
 * - create execution authorization
 *
 * It only produces a deterministic replay plan.
 *
 * ============================================================================
 */
const RuntimeRecoveryCheckpoint =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
  );

const ExecutionRequest =
  require(
    "../../models/ExecutionRequest"
  );

const RecoveryVerification =
  require(
    "../../models/RecoveryVerification"
  );

const IncidentLifecycle =
  require(
    "../../models/IncidentLifecycle"
  );

const WorkflowOutboxEvent =
  require(
    "../../models/WorkflowOutboxEvent"
  );

const {
  REPLAY_DECISION,
  REPLAY_SAFETY,
  REPLAY_REASON,
  assertNoReplayExecutionAuthority,
} =
  require(
    "./replayOrchestrationContracts"
  );

const {
  RUNTIME_STAGE,
  RESUME_SAFETY,
} =
  require(
    "../recoveryRuntime/recoveryRuntimeContracts"
  );


class WorkflowRecoveryPlanner {
  constructor(
    options = {}
  ) {
    this.RuntimeCheckpoint =
  options.RuntimeCheckpoint ||
  options.RuntimeRecoveryCheckpoint ||
  RuntimeRecoveryCheckpoint;

    this.ExecutionRequest =
      options.ExecutionRequest ||
      ExecutionRequest;

    this.RecoveryVerification =
      options.RecoveryVerification ||
      RecoveryVerification;

    this.IncidentLifecycle =
      options.IncidentLifecycle ||
      IncidentLifecycle;

    this.WorkflowOutboxEvent =
      options.WorkflowOutboxEvent ||
      WorkflowOutboxEvent;
  }


  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async plan(
    request = {}
  ) {
    this.assertScope(
      request
    );

    assertNoReplayExecutionAuthority(
      request,
      "Workflow recovery request"
    );

    const snapshot =
      await this.buildSnapshot(
        request
      );

    const plan =
      this.evaluateSnapshot(
        snapshot
      );

    assertNoReplayExecutionAuthority(
      plan,
      "Workflow recovery plan"
    );

    return {
      ...plan,

      snapshot,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // SNAPSHOT
  // ==========================================================================

  async buildSnapshot({
    organizationId,
    environmentId,
    incidentId,
  }) {
    const scope = {
      organizationId,
      environmentId,
      incidentId,
    };

    const [
      checkpoints,
      executionRequest,
      verification,
      lifecycle,
      outboxEvents,
    ] =
      await Promise.all([
        this.RuntimeCheckpoint
          .find(
            scope
          )
          .sort({
            updatedAt:
              -1,
          })
          .lean(),

        this.ExecutionRequest
          .findOne(
            scope
          )
          .sort({
            updatedAt:
              -1,
          })
          .lean(),

        this.RecoveryVerification
          .findOne(
            scope
          )
          .sort({
            updatedAt:
              -1,
          })
          .lean(),

        this.IncidentLifecycle
          .findOne(
            scope
          )
          .sort({
            updatedAt:
              -1,
          })
          .lean(),

        this.WorkflowOutboxEvent
          .find(
            scope
          )
          .sort({
            createdAt:
              1,
          })
          .lean(),
      ]);

    return {
      scope,

      checkpoints:
        Array.isArray(
          checkpoints
        )
          ? checkpoints
          : [],

      executionRequest:
        executionRequest ||
        null,

      verification:
        verification ||
        null,

      lifecycle:
        lifecycle ||
        null,

      outboxEvents:
        Array.isArray(
          outboxEvents
        )
          ? outboxEvents
          : [],

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // EVALUATION
  // ==========================================================================

  evaluateSnapshot(
    snapshot
  ) {
    const checkpointMap =
      this.indexCheckpoints(
        snapshot
          .checkpoints
      );

    const lifecycleCheckpoint =
      checkpointMap[
        RUNTIME_STAGE
          .LIFECYCLE
      ];

    const verificationCheckpoint =
      checkpointMap[
        RUNTIME_STAGE
          .VERIFICATION
      ];

    const executionCheckpoint =
      checkpointMap[
        RUNTIME_STAGE
          .EXECUTION
      ];

    const recoveryCheckpoint =
      checkpointMap[
        RUNTIME_STAGE
          .RECOVERY_DECISION
      ];


    // ========================================================================
    // 1. WORKFLOW ALREADY COMPLETE
    // ========================================================================

    if (
      this.isLifecycleComplete({
        lifecycle:
          snapshot.lifecycle,

        checkpoint:
          lifecycleCheckpoint,
      })
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .NO_ACTION,

        safety:
          REPLAY_SAFETY
            .SAFE,

        resumeStage:
          null,

        reason:
          REPLAY_REASON
            .WORKFLOW_ALREADY_COMPLETE,
      });
    }


    // ========================================================================
    // 2. LIFECYCLE NOT COMPLETE, BUT VERIFICATION COMPLETE
    // ========================================================================

    if (
      this.isCheckpointCompleted(
        verificationCheckpoint
      ) ||
      this.isVerificationComplete(
        snapshot.verification
      )
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .RESUME,

        safety:
          REPLAY_SAFETY
            .SAFE,

        resumeStage:
          RUNTIME_STAGE
            .LIFECYCLE,

        reason:
          "VERIFICATION_COMPLETE_LIFECYCLE_INCOMPLETE",
      });
    }


    // ========================================================================
    // 3. EXECUTION DEFINITELY COMPLETE
    // ========================================================================

    if (
      this.isCheckpointCompleted(
        executionCheckpoint
      ) ||
      this.isExecutionDefinitelyComplete(
        snapshot.executionRequest
      )
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .RESUME,

        safety:
          REPLAY_SAFETY
            .SAFE,

        resumeStage:
          RUNTIME_STAGE
            .VERIFICATION,

        reason:
          "EXECUTION_COMPLETE_VERIFICATION_INCOMPLETE",
      });
    }


    // ========================================================================
    // 4. EXECUTION AMBIGUOUS
    // ========================================================================

    if (
      this.isExecutionAmbiguous({
        executionRequest:
          snapshot.executionRequest,

        checkpoint:
          executionCheckpoint,
      })
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .RECONCILE,

        safety:
          REPLAY_SAFETY
            .RECONCILE_REQUIRED,

        resumeStage:
          RUNTIME_STAGE
            .EXECUTION,

        reason:
          REPLAY_REASON
            .AMBIGUOUS_EXECUTION_STATE,
      });
    }


    // ========================================================================
    // 5. CHECKPOINT EXPLICITLY REQUIRES MANUAL RESUME
    // ========================================================================

    const unsafeCheckpoint =
      this.findManualCheckpoint(
        snapshot
          .checkpoints
      );

    if (
      unsafeCheckpoint
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .MANUAL_REVIEW,

        safety:
          REPLAY_SAFETY
            .MANUAL_REQUIRED,

        resumeStage:
          unsafeCheckpoint
            .stage ||
          null,

        reason:
          "CHECKPOINT_REQUIRES_MANUAL_RESUME",
      });
    }


    // ========================================================================
    // 6. RECOVERY DECISION COMPLETE
    // ========================================================================

    if (
      this.isCheckpointCompleted(
        recoveryCheckpoint
      )
    ) {
      return this.buildPlan({
        decision:
          REPLAY_DECISION
            .RESUME,

        safety:
          REPLAY_SAFETY
            .SAFE,

        resumeStage:
          RUNTIME_STAGE
            .EXECUTION,

        reason:
          "RECOVERY_DECISION_COMPLETE_EXECUTION_INCOMPLETE",
      });
    }


    // ========================================================================
    // 7. NOTHING RELIABLE ENOUGH TO RESUME
    // ========================================================================

    return this.buildPlan({
      decision:
        REPLAY_DECISION
          .MANUAL_REVIEW,

      safety:
        REPLAY_SAFETY
          .UNKNOWN,

      resumeStage:
        null,

      reason:
        REPLAY_REASON
          .MISSING_DURABLE_EVIDENCE,
    });
  }


  // ==========================================================================
  // CHECKPOINT INDEX
  // ==========================================================================

  indexCheckpoints(
    checkpoints = []
  ) {
    const map =
      {};

    for (
      const checkpoint
      of checkpoints
    ) {
      if (
        !checkpoint ||
        !checkpoint.stage
      ) {
        continue;
      }

      /*
       * Snapshot is already sorted newest-first.
       *
       * Preserve first record for each stage.
       */
      if (
        !map[
          checkpoint.stage
        ]
      ) {
        map[
          checkpoint.stage
        ] =
          checkpoint;
      }
    }

    return map;
  }


  // ==========================================================================
  // CHECKPOINT HELPERS
  // ==========================================================================

  isCheckpointCompleted(
    checkpoint
  ) {
    if (
      !checkpoint
    ) {
      return false;
    }

    return [
      "COMPLETED",
      "SUCCEEDED",
      "SUCCESS",
    ].includes(
      checkpoint.status
    );
  }


 findManualCheckpoint(
  checkpoints = []
) {
  return checkpoints
    .find(
      (
        checkpoint
      ) => {
        if (
          !checkpoint
        ) {
          return false;
        }

        const resumeSafety =
          String(
            checkpoint
              .resumeSafety ||
            ""
          )
            .trim()
            .toUpperCase();

        /*
         * ================================================================
         * PHASE 11.4 MANUAL-RECOVERY NORMALIZATION
         * ================================================================
         *
         * Phase 11.4 must consume existing Phase 11.2 checkpoints rather
         * than forcing older checkpoint records to adopt a new vocabulary.
         *
         * Therefore recognize the semantic manual/unsafe states regardless
         * of whether the runtime contract exposes them as:
         *
         *   MANUAL
         *   MANUAL_REQUIRED
         *   REQUIRES_MANUAL
         *   MANUAL_REVIEW
         *   UNSAFE
         *
         * SAFE is deliberately NOT included.
         */

        const explicitManualStates =
          new Set([
            "MANUAL",
            "MANUAL_REQUIRED",
            "REQUIRES_MANUAL",
            "MANUAL_REVIEW",
            "UNSAFE",
          ]);

        if (
          explicitManualStates
            .has(
              resumeSafety
            )
        ) {
          return true;
        }

        /*
         * Also honor any canonical values exported by the existing
         * recoveryRuntimeContracts module without assuming its property
         * names.
         */
        const contractManualStates =
          Object
            .values(
              RESUME_SAFETY ||
              {}
            )
            .map(
              (
                value
              ) =>
                String(
                  value
                )
                  .trim()
                  .toUpperCase()
            )
            .filter(
              (
                value
              ) =>
                value.includes(
                  "MANUAL"
                ) ||
                value.includes(
                  "UNSAFE"
                )
            );

        return contractManualStates
          .includes(
            resumeSafety
          );
      }
    ) ||
    null;
}


  // ==========================================================================
  // EXECUTION STATE
  // ==========================================================================

  isExecutionDefinitelyComplete(
    executionRequest
  ) {
    if (
      !executionRequest
    ) {
      return false;
    }

    return [
      "COMPLETED",
      "SUCCEEDED",
      "SUCCESS",
      "EXECUTED",
    ].includes(
      executionRequest.status
    );
  }


  isExecutionAmbiguous({
    executionRequest,
    checkpoint,
  }) {
    /*
     * Dangerous state:
     *
     * checkpoint says processing/running
     * but no durable final execution result exists.
     *
     * Infrastructure mutation MAY already have occurred.
     *
     * Never blindly replay execution.
     */

    const checkpointRunning =
      checkpoint &&
      [
        "PROCESSING",
        "RUNNING",
        "CLAIMED",
      ].includes(
        checkpoint.status
      );

    const executionUnresolved =
      executionRequest &&
      [
        "PROCESSING",
        "RUNNING",
        "EXECUTING",
        "UNKNOWN",
      ].includes(
        executionRequest.status
      );

    return (
      checkpointRunning ||
      executionUnresolved
    );
  }


  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  isVerificationComplete(
    verification
  ) {
    if (
      !verification
    ) {
      return false;
    }

    /*
     * A verification result may be terminal even when it says recovery
     * failed or was inconclusive.
     *
     * Lifecycle still needs to process that outcome.
     */
    return [
      "COMPLETED",
      "VERIFIED",
      "FAILED",
      "INCONCLUSIVE",
      "RECOVERED",
      "NOT_RECOVERED",
    ].includes(
      verification.status ||
      verification.outcome
    );
  }


  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  isLifecycleComplete({
    lifecycle,
    checkpoint,
  }) {
    if (
      this.isCheckpointCompleted(
        checkpoint
      )
    ) {
      return true;
    }

    if (
      !lifecycle
    ) {
      return false;
    }

    return [
      "CLOSED",
      "RESOLVED",
      "COMPLETED",
      "TERMINAL",
    ].includes(
      lifecycle.status ||
      lifecycle.state
    );
  }


  // ==========================================================================
  // PLAN
  // ==========================================================================

  buildPlan({
    decision,
    safety,
    resumeStage,
    reason,
  }) {
    return {
      decision,

      safety,

      resumeStage,

      reason,

      replayRequired:
        decision ===
          REPLAY_DECISION
            .RESUME,

      reconciliationRequired:
        decision ===
          REPLAY_DECISION
            .RECONCILE,

      manualReviewRequired:
        decision ===
          REPLAY_DECISION
            .MANUAL_REVIEW,

      blocked:
        decision ===
          REPLAY_DECISION
            .BLOCK,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertScope(
    request
  ) {
    if (
      !request ||
      typeof request !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Workflow recovery request is required"
        ),
        {
          code:
            "REPLAY_RECOVERY_REQUEST_REQUIRED",
        }
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
      ]
    ) {
      if (
        request[field] ===
          undefined ||
        request[field] ===
          null ||
        request[field] ===
          ""
      ) {
        throw Object.assign(
          new Error(
            `Workflow recovery requires ${field}`
          ),
          {
            code:
              "REPLAY_RECOVERY_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    return true;
  }
}


module.exports =
  new WorkflowRecoveryPlanner();

module.exports
  .WorkflowRecoveryPlanner =
  WorkflowRecoveryPlanner;