"use strict";

/**
 * AIRA Runtime Recovery Worker
 *
 * Phase 11.2.7
 *
 * Responsibilities:
 *
 * - consume RuntimeRecoveryCoordinator plans
 * - dispatch only safe non-execution workflow resumes
 * - preserve all existing worker idempotency boundaries
 * - never replay infrastructure execution automatically
 *
 * SAFETY:
 *
 * - EXECUTION stage is NEVER automatically dispatched
 * - MANUAL_INTERVENTION and BLOCK are terminal worker outcomes
 * - WAIT and SKIP_COMPLETED perform no work
 * - this worker never grants execution authorization
 */

const recoveryDecisionWorker =
  require(
    "./recoveryDecisionWorker"
  );

const verificationWorker =
  require(
    "./verificationWorker"
  );

const lifecycleWorker =
  require(
    "./lifecycleWorker"
  );

const {
  RUNTIME_STAGE,
  RESUME_DECISION,
  assertNoExecutionAuthorization,
} =
  require(
    "../services/recoveryRuntime/recoveryRuntimeContracts"
  );

class RuntimeRecoveryWorker {
  constructor(
    options = {}
  ) {
    this.recoveryDecisionWorker =
      options.recoveryDecisionWorker ||
      recoveryDecisionWorker;

    this.verificationWorker =
      options.verificationWorker ||
      verificationWorker;

    this.lifecycleWorker =
      options.lifecycleWorker ||
      lifecycleWorker;
  }

  // ==========================================================================
  // PROCESS
  // ==========================================================================

  async process(
    plan = {},
    dependencies = {}
  ) {
    this.assertPlan(
      plan
    );

    // ========================================================================
    // NO-ACTION DECISIONS
    // ========================================================================

    if (
      [
        RESUME_DECISION
          .WAIT,

        RESUME_DECISION
          .SKIP_COMPLETED,

        RESUME_DECISION
          .MANUAL_INTERVENTION,

        RESUME_DECISION
          .BLOCK,
      ].includes(
        plan.decision
      )
    ) {
      return {
        processed:
          true,

        dispatched:
          false,

        stage:
          plan.stage,

        decision:
          plan.decision,

        reason:
          plan.reason ||
          null,

        previousResult:
          plan.previousResult ||
          null,

        manualIntervention:
          plan.decision ===
          RESUME_DECISION
            .MANUAL_INTERVENTION,

        blocked:
          plan.decision ===
          RESUME_DECISION
            .BLOCK,

        waiting:
          plan.decision ===
          RESUME_DECISION
            .WAIT,

        skipped:
          plan.decision ===
          RESUME_DECISION
            .SKIP_COMPLETED,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // ========================================================================
    // ONLY THESE DECISIONS MAY DISPATCH
    // ========================================================================

    if (
      ![
        RESUME_DECISION
          .START,

        RESUME_DECISION
          .RESUME,

        RESUME_DECISION
          .RETRY_SAFE,
      ].includes(
        plan.decision
      )
    ) {
      throw createError(
        "Unsupported runtime recovery decision",
        "RUNTIME_RECOVERY_WORKER_DECISION_UNSUPPORTED"
      );
    }

    // ========================================================================
    // EXECUTION HARD BLOCK
    //
    // Runtime crash recovery is NOT allowed to re-run infrastructure
    // mutations. Execution recovery requires reconciliation/manual flow.
    // ========================================================================

    if (
      plan.stage ===
      RUNTIME_STAGE
        .EXECUTION
    ) {
      return {
        processed:
          true,

        dispatched:
          false,

        stage:
          plan.stage,

        decision:
          RESUME_DECISION
            .MANUAL_INTERVENTION,

        reason:
          "EXECUTION_RUNTIME_REPLAY_FORBIDDEN",

        mutationReconciliationRequired:
          true,

        manualIntervention:
          true,

        executionStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // ========================================================================
    // BUILD SAFE JOB
    // ========================================================================

    const job =
      this.buildJob(
        plan
      );

    // ========================================================================
    // DISPATCH THROUGH EXISTING PROTECTED WORKERS
    //
    // These workers already have Phase 11.1 idempotency protection.
    // ========================================================================

    if (
      plan.stage ===
      RUNTIME_STAGE
        .RECOVERY_DECISION
    ) {
      const result =
        await this.recoveryDecisionWorker
          .process(
            job,
            dependencies
          );

      return this.dispatchResult({
        plan,
        result,
      });
    }

    if (
      plan.stage ===
      RUNTIME_STAGE
        .VERIFICATION
    ) {
      const result =
        await this.verificationWorker
          .process(
            job,
            dependencies
          );

      return this.dispatchResult({
        plan,
        result,
      });
    }

    if (
      plan.stage ===
      RUNTIME_STAGE
        .LIFECYCLE
    ) {
      const result =
        await this.lifecycleWorker
          .process(
            job,
            dependencies
          );

      return this.dispatchResult({
        plan,
        result,
      });
    }

    throw createError(
      "Runtime recovery stage is unsupported",
      "RUNTIME_RECOVERY_WORKER_STAGE_UNSUPPORTED"
    );
  }

  // ==========================================================================
  // JOB RECONSTRUCTION
  // ==========================================================================

  buildJob(
    plan
  ) {
    const identity =
      plan.workflowIdentity ||
      {};

    const job = {
      organizationId:
        plan.organizationId,

      environmentId:
        plan.environmentId,

      incidentId:
        plan.incidentId,

      correlationId:
        plan.incidentId,

      executionAuthorized:
        false,
    };

    // ========================================================================
    // RECOVERY DECISION
    // ========================================================================

    if (
      plan.stage ===
      RUNTIME_STAGE
        .RECOVERY_DECISION
    ) {
      job.diagnosisId =
        identity.diagnosisId;

      job.diagnosisRevision =
        identity.diagnosisRevision;

      if (
        plan.resumePayload
          ?.diagnosis
      ) {
        job.diagnosis =
          plan.resumePayload
            .diagnosis;
      }

      if (
        plan.resumePayload
          ?.safetyGate
      ) {
        job.safetyGate =
          plan.resumePayload
            .safetyGate;
      }

      if (
        plan.resumePayload
          ?.context
      ) {
        job.context =
          plan.resumePayload
            .context;
      }
    }

    // ========================================================================
    // VERIFICATION
    // ========================================================================

    if (
      plan.stage ===
      RUNTIME_STAGE
        .VERIFICATION
    ) {
      job.executionRequestId =
        identity.executionRequestId;

      job.verificationId =
        identity.verificationId ||
        null;

      job.verificationPlanId =
        plan.resumePayload
          ?.verificationPlanId ||
        identity.verificationPlanId ||
        null;

      job.verificationPlanHash =
        plan.resumePayload
          ?.verificationPlanHash ||
        identity.verificationPlanHash ||
        null;

      job.verificationPlan =
        plan.resumePayload
          ?.verificationPlan ||
        null;

      job.executionResult =
        plan.resumePayload
          ?.executionResult ||
        null;

      job.context =
        plan.resumePayload
          ?.context ||
        null;
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    if (
      plan.stage ===
      RUNTIME_STAGE
        .LIFECYCLE
    ) {
      job.verificationId =
        identity.verificationId;

      job.lifecycleId =
        identity.lifecycleId ||
        null;

      job.lifecycleIntent =
        plan.resumePayload
          ?.lifecycleIntent ||
        "PROCESS_VERIFICATION_OUTCOME";

      job.lifecycleContext =
        plan.resumePayload
          ?.lifecycleContext ||
        null;
    }

    return job;
  }

  // ==========================================================================
  // DISPATCH RESULT
  // ==========================================================================

  dispatchResult({
    plan,
    result,
  }) {
    return {
      processed:
        true,

      dispatched:
        true,

      stage:
        plan.stage,

      decision:
        plan.decision,

      workerResult:
        result,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertPlan(
    plan
  ) {
    if (
      !plan ||
      typeof plan !==
        "object" ||
      Object.keys(
        plan
      ).length ===
        0
    ) {
      throw createError(
        "Runtime recovery plan is required",
        "RUNTIME_RECOVERY_WORKER_PLAN_REQUIRED"
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
        "stage",
        "decision",
      ]
    ) {
      if (
        !plan[field]
      ) {
        throw createError(
          `Runtime recovery plan requires ${field}`,
          "RUNTIME_RECOVERY_WORKER_PLAN_SCOPE_REQUIRED"
        );
      }
    }

    assertNoExecutionAuthorization(
      plan
    );

    if (
      plan.executionStarted ===
      true
    ) {
      throw createError(
        "Runtime recovery plan cannot pre-start execution",
        "RUNTIME_RECOVERY_WORKER_UNSAFE_EXECUTION"
      );
    }
  }
}

function createError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}

module.exports =
  new RuntimeRecoveryWorker();

module.exports
  .RuntimeRecoveryWorker =
  RuntimeRecoveryWorker;