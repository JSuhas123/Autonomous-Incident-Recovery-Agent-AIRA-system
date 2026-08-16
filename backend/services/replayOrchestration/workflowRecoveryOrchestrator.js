"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.4.3
 * WORKFLOW RECOVERY ORCHESTRATOR
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Take the durable recovery plan produced by WorkflowRecoveryPlanner and
 * convert it into the exact next workflow intent that should be resumed.
 *
 *
 *     Durable Evidence
 *           ↓
 * WorkflowRecoveryPlanner
 *           ↓
 *       Replay Plan
 *           ↓
 * WorkflowRecoveryOrchestrator
 *           ↓
 *   canonical replay job
 *           ↓
 * existing durable workflow boundary
 *
 *
 * IMPORTANT
 * ---------
 *
 * Replay does NOT mean:
 *
 *     "run everything again"
 *
 * Replay means:
 *
 *     determine the first safe incomplete stage
 *                 ↓
 *     reconstruct that stage's immutable identity
 *                 ↓
 *     submit it to the existing durable workflow boundary
 *
 *
 * SAFETY
 * ------
 *
 * This service NEVER:
 *
 * - grants infrastructure execution authority
 * - calls ExecutionWorker directly
 * - calls VerificationWorker directly
 * - calls LifecycleWorker directly
 * - executes Kubernetes / Docker / cloud actions
 * - bypasses policy
 * - bypasses authorization
 * - bypasses idempotency
 *
 * ============================================================================
 */

const workflowRecoveryPlanner =
  require(
    "./workflowRecoveryPlanner"
  );

const {
  REPLAY_DECISION,
  REPLAY_SAFETY,
  REPLAY_MODE,
  assertReplayRequest,
  assertNoReplayExecutionAuthority,
  assertExecutableReplayPlan,
} =
  require(
    "./replayOrchestrationContracts"
  );

const {
  RUNTIME_STAGE,
} =
  require(
    "../recoveryRuntime/recoveryRuntimeContracts"
  );


class WorkflowRecoveryOrchestrator {
  constructor(
    options = {}
  ) {
    this.planner =
      options.planner ||
      workflowRecoveryPlanner;

    /*
     * Durable dispatch boundary.
     *
     * This is intentionally injected.
     *
     * Phase 11.4 must not invent another queue/outbox implementation.
     *
     * Later integration can point this at the canonical Phase 11.3
     * durable handoff service.
     *
     * Contract:
     *
     * async dispatchReplay({
     *   stage,
     *   job,
     *   plan,
     *   request,
     * })
     */
    this.dispatchReplay =
      options.dispatchReplay ||
      null;

    this.now =
      options.now ||
      (() =>
        new Date());
  }


  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async recover(
    request = {},
    dependencies = {}
  ) {
    assertReplayRequest(
      request
    );

    assertNoReplayExecutionAuthority(
      request,
      "Workflow replay request"
    );

    const plan =
      await this.planner
        .plan(
          request
        );

    assertNoReplayExecutionAuthority(
      plan,
      "Workflow replay plan"
    );


    // ========================================================================
    // INSPECT-ONLY MODE
    // ========================================================================

    if (
      request.mode ===
        REPLAY_MODE
          .INSPECT_ONLY
    ) {
      return this.buildPassiveResult({
        request,

        plan,

        outcome:
          "INSPECTED",

        reason:
          plan.reason,
      });
    }


    // ========================================================================
    // NOTHING TO DO
    // ========================================================================

    if (
      plan.decision ===
        REPLAY_DECISION
          .NO_ACTION
    ) {
      return this.buildPassiveResult({
        request,

        plan,

        outcome:
          "NO_ACTION",

        reason:
          plan.reason,
      });
    }


    // ========================================================================
    // RECONCILIATION REQUIRED
    // ========================================================================

    if (
      plan.decision ===
        REPLAY_DECISION
          .RECONCILE
    ) {
      return this.buildPassiveResult({
        request,

        plan,

        outcome:
          "RECONCILIATION_REQUIRED",

        reason:
          plan.reason,

        reconciliationRequired:
          true,
      });
    }


    // ========================================================================
    // MANUAL REVIEW REQUIRED
    // ========================================================================

    if (
      plan.decision ===
        REPLAY_DECISION
          .MANUAL_REVIEW
    ) {
      return this.buildPassiveResult({
        request,

        plan,

        outcome:
          "MANUAL_REVIEW_REQUIRED",

        reason:
          plan.reason,

        manualReviewRequired:
          true,
      });
    }


    // ========================================================================
    // BLOCKED
    // ========================================================================

    if (
      plan.decision ===
        REPLAY_DECISION
          .BLOCK
    ) {
      return this.buildPassiveResult({
        request,

        plan,

        outcome:
          "BLOCKED",

        reason:
          plan.reason,

        blocked:
          true,
      });
    }


    // ========================================================================
    // ONLY SAFE RESUME REACHES THIS POINT
    // ========================================================================

    assertExecutableReplayPlan(
      plan
    );

    const job =
      this.reconstructJob({
        request,

        plan,
      });

    assertNoReplayExecutionAuthority(
      job,
      "Reconstructed replay job"
    );

    this.assertStageJob({
      stage:
        plan.resumeStage,

      job,
    });

    const dispatcher =
      dependencies
        .dispatchReplay ||
      this.dispatchReplay;

    if (
      typeof dispatcher !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "Workflow replay durable dispatcher is not configured"
        ),
        {
          code:
            "REPLAY_DISPATCHER_NOT_CONFIGURED",

          retryable:
            false,
        }
      );
    }

    const dispatchResult =
      await dispatcher({
        stage:
          plan.resumeStage,

        job,

        plan,

        request: {
          organizationId:
            request.organizationId,

          environmentId:
            request.environmentId,

          incidentId:
            request.incidentId,

          source:
            request.source,

          mode:
            request.mode,

          replayRequestId:
            request.replayRequestId ||
            null,

          correlationId:
            request.correlationId ||
            null,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });

    assertNoReplayExecutionAuthority(
      dispatchResult,
      "Replay dispatch result"
    );

    return {
      processed:
        true,

      replayed:
        true,

      dispatched:
        true,

      outcome:
        "RESUME_DISPATCHED",

      resumeStage:
        plan.resumeStage,

      reason:
        plan.reason,

      safety:
        plan.safety,

      plan,

      job,

      dispatchResult:
        dispatchResult ||
        null,

      recoveredAt:
        this.now(),

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // JOB RECONSTRUCTION
  // ==========================================================================

  reconstructJob({
    request,
    plan,
  }) {
    const snapshot =
      plan.snapshot ||
      {};

    const base = {
      organizationId:
        request.organizationId,

      environmentId:
        request.environmentId,

      incidentId:
        request.incidentId,

      correlationId:
        request.correlationId ||
        this.resolveCorrelationId(
          snapshot
        ) ||
        request.incidentId,

      replay: {
        replayRequestId:
          request.replayRequestId ||
          null,

        source:
          request.source,

        mode:
          request.mode,

        reason:
          plan.reason,

        resumeStage:
          plan.resumeStage,

        requestedAt:
          this.now(),
      },

      /*
       * Absolutely never convert replay into execution authority.
       */
      executionAuthorized:
        false,
    };


    switch (
      plan.resumeStage
    ) {
      case RUNTIME_STAGE
        .EXECUTION:
        return this.buildExecutionJob({
          base,

          snapshot,
        });


      case RUNTIME_STAGE
        .VERIFICATION:
        return this.buildVerificationJob({
          base,

          snapshot,
        });


      case RUNTIME_STAGE
        .LIFECYCLE:
        return this.buildLifecycleJob({
          base,

          snapshot,
        });


      default:
        throw Object.assign(
          new Error(
            `Unsupported replay resume stage: ${plan.resumeStage}`
          ),
          {
            code:
              "REPLAY_STAGE_UNSUPPORTED",

            resumeStage:
              plan.resumeStage,

            retryable:
              false,
          }
        );
    }
  }


  // ==========================================================================
  // EXECUTION JOB
  // ==========================================================================

  buildExecutionJob({
    base,
    snapshot,
  }) {
    const execution =
      snapshot
        .executionRequest ||
      {};

    /*
     * Execution replay is deliberately conservative.
     *
     * We carry persisted identity/reference information only.
     *
     * authorizationId is a REFERENCE.
     *
     * It does NOT mean authorization is granted.
     *
     * ExecutionWorker must reload and validate the authorization record.
     */
    return {
      ...base,

      executionRequestId:
        this.firstValue(
          execution
            .executionRequestId,
          execution
            .requestId
        ),

      executionPlanId:
        this.firstValue(
          execution
            .executionPlanId,
          execution
            .planId,
          execution
            .executionPlan
            ?.executionPlanId,
          execution
            .executionPlan
            ?.planId
        ),

      executionPlanHash:
        this.firstValue(
          execution
            .executionPlanHash,
          execution
            .planHash,
          execution
            .executionPlan
            ?.executionPlanHash,
          execution
            .executionPlan
            ?.planHash
        ),

      executionPlan:
        execution
          .executionPlan ||
        null,

      authorizationId:
        execution
          .authorizationId ||
        null,

      recoveryDecisionId:
        execution
          .recoveryDecisionId ||
        null,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // VERIFICATION JOB
  // ==========================================================================

  buildVerificationJob({
    base,
    snapshot,
  }) {
    const execution =
      snapshot
        .executionRequest ||
      {};

    const verification =
      snapshot
        .verification ||
      {};

    return {
      ...base,

      executionRequestId:
        this.firstValue(
          execution
            .executionRequestId,
          execution
            .requestId,
          verification
            .executionRequestId
        ),

      executionPlanId:
        this.firstValue(
          execution
            .executionPlanId,
          execution
            .planId,
          execution
            .executionPlan
            ?.executionPlanId,
          execution
            .executionPlan
            ?.planId
        ),

      executionPlanHash:
        this.firstValue(
          execution
            .executionPlanHash,
          execution
            .planHash,
          execution
            .executionPlan
            ?.executionPlanHash,
          execution
            .executionPlan
            ?.planHash
        ),

      executionPlan:
        execution
          .executionPlan ||
        null,

      verificationId:
        this.firstValue(
          verification
            .verificationId,
          verification
            .verificationRequestId,
          execution
            .verificationId,
          execution
            .verificationRequestId
        ),

      verificationPlanId:
        this.firstValue(
          verification
            .verificationPlanId,
          verification
            .planId,
          verification
            .verificationPlan
            ?.verificationPlanId,
          verification
            .verificationPlan
            ?.planId,
          execution
            .verificationPlanId
        ),

      verificationPlanHash:
        this.firstValue(
          verification
            .verificationPlanHash,
          verification
            .planHash,
          verification
            .verificationPlan
            ?.verificationPlanHash,
          verification
            .verificationPlan
            ?.planHash,
          execution
            .verificationPlanHash
        ),

      verificationPlan:
        verification
          .verificationPlan ||
        execution
          .verificationPlan ||
        null,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // LIFECYCLE JOB
  // ==========================================================================

  buildLifecycleJob({
    base,
    snapshot,
  }) {
    const execution =
      snapshot
        .executionRequest ||
      {};

    const verification =
      snapshot
        .verification ||
      {};

    return {
      ...base,

      executionRequestId:
        this.firstValue(
          verification
            .executionRequestId,
          execution
            .executionRequestId,
          execution
            .requestId
        ),

      verificationId:
        this.firstValue(
          verification
            .verificationId,
          verification
            .verificationRequestId
        ),

      verificationPlanId:
        this.firstValue(
          verification
            .verificationPlanId,
          verification
            .planId,
          verification
            .verificationPlan
            ?.verificationPlanId,
          verification
            .verificationPlan
            ?.planId
        ),

      verificationPlanHash:
        this.firstValue(
          verification
            .verificationPlanHash,
          verification
            .planHash,
          verification
            .verificationPlan
            ?.verificationPlanHash,
          verification
            .verificationPlan
            ?.planHash
        ),

      verificationOutcome:
        this.resolveVerificationOutcome(
          verification
        ),

      verification: {
        verificationId:
          this.firstValue(
            verification
              .verificationId,
            verification
              .verificationRequestId
          ),

        verificationPlanId:
          this.firstValue(
            verification
              .verificationPlanId,
            verification
              .planId
          ),

        verificationPlanHash:
          this.firstValue(
            verification
              .verificationPlanHash,
            verification
              .planHash
          ),

        outcome:
          this.resolveVerificationOutcome(
            verification
          ),
      },

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // STAGE VALIDATION
  // ==========================================================================

  assertStageJob({
    stage,
    job,
  }) {
    const commonFields = [
      "organizationId",
      "environmentId",
      "incidentId",
    ];

    for (
      const field
      of commonFields
    ) {
      this.assertField({
        stage,

        field,

        value:
          job[field],
      });
    }


    if (
      stage ===
      RUNTIME_STAGE
        .EXECUTION
    ) {
      for (
        const field
        of [
          "executionRequestId",
          "executionPlanId",
          "executionPlanHash",
        ]
      ) {
        this.assertField({
          stage,

          field,

          value:
            job[field],
        });
      }

      return true;
    }


    if (
      stage ===
      RUNTIME_STAGE
        .VERIFICATION
    ) {
      for (
        const field
        of [
          "executionRequestId",
          "executionPlanId",
          "executionPlanHash",
          "verificationId",
          "verificationPlanId",
          "verificationPlanHash",
        ]
      ) {
        this.assertField({
          stage,

          field,

          value:
            job[field],
        });
      }

      return true;
    }


    if (
      stage ===
      RUNTIME_STAGE
        .LIFECYCLE
    ) {
      for (
        const field
        of [
          "executionRequestId",
          "verificationId",
          "verificationPlanId",
          "verificationPlanHash",
          "verificationOutcome",
        ]
      ) {
        this.assertField({
          stage,

          field,

          value:
            job[field],
        });
      }

      return true;
    }


    throw Object.assign(
      new Error(
        `Unsupported replay stage: ${stage}`
      ),
      {
        code:
          "REPLAY_STAGE_UNSUPPORTED",

        stage,

        retryable:
          false,
      }
    );
  }


  assertField({
    stage,
    field,
    value,
  }) {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      throw Object.assign(
        new Error(
          `Replay stage ${stage} requires ${field}`
        ),
        {
          code:
            "REPLAY_JOB_IDENTITY_REQUIRED",

          stage,

          field,

          retryable:
            false,
        }
      );
    }

    return true;
  }


  // ==========================================================================
  // PASSIVE OUTCOMES
  // ==========================================================================

  buildPassiveResult({
    request,
    plan,
    outcome,
    reason,
    reconciliationRequired =
      false,
    manualReviewRequired =
      false,
    blocked =
      false,
  }) {
    return {
      processed:
        true,

      replayed:
        false,

      dispatched:
        false,

      outcome,

      reason:
        reason ||
        null,

      resumeStage:
        plan
          .resumeStage ||
        null,

      safety:
        plan
          .safety ||
        null,

      reconciliationRequired,

      manualReviewRequired,

      blocked,

      plan,

      replayRequestId:
        request
          .replayRequestId ||
        null,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // HELPERS
  // ==========================================================================

  resolveCorrelationId(
    snapshot
  ) {
    const candidates = [
      snapshot
        ?.executionRequest
        ?.correlationId,

      snapshot
        ?.verification
        ?.correlationId,

      snapshot
        ?.lifecycle
        ?.correlationId,

      snapshot
        ?.outboxEvents
        ?.[0]
        ?.correlationId,
    ];

    return this.firstValue(
      ...candidates
    );
  }


  resolveVerificationOutcome(
    verification
  ) {
    return this.firstValue(
      verification
        ?.verificationOutcome,

      verification
        ?.outcome,

      verification
        ?.decision,

      verification
        ?.result
        ?.outcome,

      verification
        ?.result
        ?.decision
    );
  }


  firstValue(
    ...values
  ) {
    for (
      const value
      of values
    ) {
      if (
        value !==
          undefined &&
        value !==
          null &&
        value !==
          ""
      ) {
        return value;
      }
    }

    return null;
  }
}


module.exports =
  new WorkflowRecoveryOrchestrator();

module.exports
  .WorkflowRecoveryOrchestrator =
  WorkflowRecoveryOrchestrator;