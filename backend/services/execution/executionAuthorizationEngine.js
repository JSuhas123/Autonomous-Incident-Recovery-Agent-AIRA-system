"use strict";

/**
 * AIRA Execution Authorization Engine
 *
 * Phase 8.9
 *
 * Integrates:
 *
 * Freshness
 *   ↓
 * Approval State
 *   ↓
 * Final Policy Revalidation
 *   ↓
 * Kill Switch / Emergency Gate
 *   ↓
 * Idempotency
 *   ↓
 * Distributed Lease
 *   ↓
 * Execution Plan
 *   ↓
 * Canonical Authorization Decision
 *
 * THIS IS THE FIRST PHASE 8 COMPONENT THAT MAY RETURN:
 *
 * authorizationGranted: true
 *
 * but only when every gate succeeds.
 *
 * DOES NOT EXECUTE THE PLAN.
 */

const crypto =
  require(
    "node:crypto"
  );

const executionFreshnessService =
  require(
    "./executionFreshnessService"
  );

const executionApprovalStateService =
  require(
    "./executionApprovalStateService"
  );

const executionPolicyRevalidationService =
  require(
    "./executionPolicyRevalidationService"
  );

const executionKillSwitchGateService =
  require(
    "./executionKillSwitchGateService"
  );

const executionIdempotencyGateService =
  require(
    "./executionIdempotencyGateService"
  );

const executionLeaseService =
  require(
    "./executionLeaseService"
  );

const executionPlanBuilderService =
  require(
    "./executionPlanBuilderService"
  );

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
  createExecutionAuthorization,
  assertExecutionAuthorization,
} =
  require(
    "./executionAuthorizationContracts"
  );

const AUTHORIZATION_ENGINE_VERSION =
  "phase8.9-v1";

class ExecutionAuthorizationEngine {
  constructor(
    options = {}
  ) {
    this.freshnessService =
      options.freshnessService ||
      executionFreshnessService;

    this.approvalService =
      options.approvalService ||
      executionApprovalStateService;

    this.policyService =
      options.policyService ||
      executionPolicyRevalidationService;

    this.killSwitchService =
      options.killSwitchService ||
      executionKillSwitchGateService;

    this.idempotencyService =
      options.idempotencyService ||
      executionIdempotencyGateService;

    this.leaseService =
      options.leaseService ||
      executionLeaseService;

    this.planBuilder =
      options.planBuilder ||
      executionPlanBuilderService;

    this.authorizationTtlMs =
      Number.isFinite(
        Number(
          options.authorizationTtlMs
        )
      )
        ? Math.max(
            1000,
            Number(
              options.authorizationTtlMs
            )
          )
        : 60 * 1000;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async authorize(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const startedAt =
      new Date();

    const authorizationId =
      input.authorizationId ||
      this.generateAuthorizationId(
        input
      );

    const trace =
      [];

    let lease =
      null;

    // ========================================================================
    // 1. FRESHNESS
    // ========================================================================

    const freshness =
      await this.runStage({
        name:
          "freshness",

        trace,

        execute:
          () =>
            this.freshnessService
              .validate(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  recoveryDecisionRevision:
                    input.recoveryDecisionRevision,

                  diagnosisId:
                    input.diagnosisId,

                  diagnosisRevision:
                    input.diagnosisRevision,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  recoveryDecision:
                    input.recoveryDecision,

                  generatedAt:
                    input
                      .recoveryDecision
                      ?.generatedAt ||
                    input.generatedAt,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .freshness ||
                dependencies
              ),
      });

    if (
      freshness.state ===
      EXECUTION_FRESHNESS_STATE
        .EXPIRED
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .EXPIRED,
        freshness,
        trace,
        startedAt,
        reasons:
          freshness.reasons,
      });
    }

    if (
      freshness.fresh !==
      true
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .STALE,
        freshness,
        trace,
        startedAt,
        reasons:
          freshness.reasons,
      });
    }

    // ========================================================================
    // 2. APPROVAL STATE
    // ========================================================================

    const approval =
      await this.runStage({
        name:
          "approval_state",

        trace,

        execute:
          () =>
            this.approvalService
              .resolve(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  recoveryDecisionRevision:
                    input.recoveryDecisionRevision,

                  selectedCandidateId:
                    input.selectedCandidateId,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  approvalRequired:
                    input
                      .recoveryDecision
                      ?.approvalRequired ===
                    true,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .approval ||
                dependencies
              ),
      });

    if (
      approval.state ===
      EXECUTION_APPROVAL_STATE
        .REJECTED
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        trace,
        startedAt,
        reasons:
          approval.reasons,
      });
    }

    if (
      approval.state ===
      EXECUTION_APPROVAL_STATE
        .EXPIRED
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .EXPIRED,
        freshness,
        approval,
        trace,
        startedAt,
        reasons:
          approval.reasons,
      });
    }

    if (
      approval.satisfied !==
      true
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .REQUIRES_APPROVAL,
        freshness,
        approval,
        trace,
        startedAt,
        reasons:
          approval.reasons,
      });
    }

    // ========================================================================
    // 3. FINAL POLICY REVALIDATION
    // ========================================================================

    const policy =
      await this.runStage({
        name:
          "policy_revalidation",

        trace,

        execute:
          () =>
            this.policyService
              .validate(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  recoveryDecisionRevision:
                    input.recoveryDecisionRevision,

                  selectedCandidateId:
                    input.selectedCandidateId,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  recoveryDecision:
                    input.recoveryDecision,

                  selectedCandidate:
                    input.selectedCandidate,

                  context:
                    input.context,

                  environment:
                    input.environment,

                  approvalSatisfied:
                    approval.satisfied ===
                    true,

                  policyRevision:
                    input.policyRevision,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .policy ||
                dependencies
              ),
      });

    if (
      policy.state ===
      EXECUTION_POLICY_STATE
        .DENIED
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        policy,
        trace,
        startedAt,
        reasons:
          policy.reasons,
      });
    }

    if (
      policy.state ===
      EXECUTION_POLICY_STATE
        .REQUIRES_APPROVAL
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .REQUIRES_APPROVAL,
        freshness,
        approval,
        policy,
        trace,
        startedAt,
        reasons:
          policy.reasons,
      });
    }

    if (
      policy.state !==
      EXECUTION_POLICY_STATE
        .ALLOWED
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        policy,
        trace,
        startedAt,
        reasons: [
          "Execution policy state is not explicitly allowed.",
          ...(
            policy.reasons ||
            []
          ),
        ],
      });
    }

    // ========================================================================
    // 4. KILL SWITCH
    // ========================================================================

    const killSwitch =
      await this.runStage({
        name:
          "kill_switch",

        trace,

        execute:
          () =>
            this.killSwitchService
              .evaluate(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  selectedCandidate:
                    input.selectedCandidate,

                  playbook:
                    input.playbook,

                  actionType:
                    input.actionType,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .killSwitch ||
                dependencies
              ),
      });

    if (
      killSwitch.allowed !==
      true
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        policy,
        killSwitch,
        trace,
        startedAt,
        reasons:
          killSwitch.reasons,
      });
    }

    // ========================================================================
    // 5. IDEMPOTENCY
    // ========================================================================

    const idempotency =
      await this.runStage({
        name:
          "idempotency",

        trace,

        execute:
          () =>
            this.idempotencyService
              .evaluate(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  recoveryDecisionRevision:
                    input.recoveryDecisionRevision,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  idempotencyKey:
                    input.idempotencyKey,

                  retryAllowed:
                    input.retryAllowed ===
                    true,

                  maxAttempts:
                    input.maxAttempts,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .idempotency ||
                dependencies
              ),
      });

    if (
      idempotency.allowed !==
      true
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        policy,
        killSwitch,
        idempotency,
        trace,
        startedAt,
        reasons:
          idempotency.reasons,
      });
    }

    // ========================================================================
    // 6. DISTRIBUTED LEASE
    // ========================================================================

    lease =
      await this.runStage({
        name:
          "execution_lease",

        trace,

        execute:
          () =>
            this.leaseService
              .acquire(
                {
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  selectedCandidate:
                    input.selectedCandidate,

                  context:
                    input.context,

                  resourceId:
                    input.resourceId,

                  lockKey:
                    input.lockKey,

                  ownerId:
                    input.ownerId,

                  ttlMs:
                    input.leaseTtlMs,

                  executionAuthorized:
                    false,
                },

                dependencies
                  .lease ||
                dependencies
              ),
      });

    if (
      lease.acquired !==
      true
    ) {
      return this.buildBlockedAuthorization({
        input,
        authorizationId,
        decision:
          AUTHORIZATION_DECISION
            .BLOCKED,
        freshness,
        approval,
        policy,
        killSwitch,
        idempotency,
        lease,
        trace,
        startedAt,
        reasons:
          lease.reasons,
      });
    }

    // ========================================================================
    // 7. EXECUTION PLAN
    // ========================================================================

    let plan;

    try {
      plan =
        await this.runStage({
          name:
            "execution_plan",

          trace,

          execute:
            async () =>
              this.planBuilder
                .build({
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  recoveryDecisionId:
                    input.recoveryDecisionId,

                  recoveryDecisionRevision:
                    input.recoveryDecisionRevision,

                  selectedCandidateId:
                    input.selectedCandidateId,

                  selectedPlaybookId:
                    input.selectedPlaybookId,

                  selectedCandidate:
                    input.selectedCandidate,

                  playbook:
                    input.playbook,

                  actionType:
                    input.actionType,

                  resourceType:
                    input.resourceType,

                  resourceId:
                    input.resourceId,

                  context:
                    input.context,

                  parameters:
                    input.parameters,

                  executionAuthorized:
                    false,
                }),
        });
    } catch (
      error
    ) {
      await this.safeReleaseLease(
        lease,
        dependencies
      );

      throw error;
    }

    // ========================================================================
    // 8. AUTHORIZATION
    // ========================================================================

    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
        this.authorizationTtlMs
      );

    const authorization =
      createExecutionAuthorization({
        authorizationId,

        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        incidentId:
          input.incidentId,

        recoveryDecisionId:
          input.recoveryDecisionId,

        recoveryDecisionRevision:
          input.recoveryDecisionRevision,

        selectedCandidateId:
          input.selectedCandidateId,

        selectedPlaybookId:
          input.selectedPlaybookId,

        decision:
          AUTHORIZATION_DECISION
            .AUTHORIZED,

        status:
          AUTHORIZATION_STATUS
            .AUTHORIZED,

        approvalState:
          approval.state,

        policyState:
          policy.state,

        freshnessState:
          freshness.state,

        killSwitchState:
          killSwitch.state,

        lockState:
          EXECUTION_LOCK_STATE
            .ACQUIRED,

        idempotencyState:
          idempotency.state,

        validFrom:
          now,

        expiresAt,

        authorizedAt:
          now,

        reasons: [
          "All Phase 8 execution authorization gates passed.",
        ],

        warnings: [
          ...(
            freshness.warnings ||
            []
          ),

          ...(
            approval.warnings ||
            []
          ),

          ...(
            policy.warnings ||
            []
          ),

          ...(
            killSwitch.warnings ||
            []
          ),

          ...(
            idempotency.warnings ||
            []
          ),

          ...(
            lease.warnings ||
            []
          ),
        ],

        metadata: {
          engineVersion:
            AUTHORIZATION_ENGINE_VERSION,

          planId:
            plan.planId,

          planHash:
            plan.planHash,

          idempotencyKey:
            idempotency
              .idempotencyKey,

          leaseKey:
            lease.leaseKey,

          leaseOwnerId:
            lease.ownerId,

          stageTrace:
            trace,
        },
      });

    assertExecutionAuthorization(
      authorization
    );

    const completedAt =
      new Date();

    return {
      authorization,

      authorizationGranted:
        true,

      executionPlan:
        plan,

      lease,

      freshness,

      approval,

      policy,

      killSwitch,

      idempotency,

      trace,

      startedAt,

      completedAt,

      executionStarted:
        false,
    };
  }

  // ==========================================================================
  // BLOCKED RESULT
  // ==========================================================================

  buildBlockedAuthorization({
    input,
    authorizationId,
    decision,
    freshness = null,
    approval = null,
    policy = null,
    killSwitch = null,
    idempotency = null,
    lease = null,
    trace,
    startedAt,
    reasons = [],
  }) {
    const completedAt =
      new Date();

    const authorization =
      createExecutionAuthorization({
        authorizationId,

        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        incidentId:
          input.incidentId,

        recoveryDecisionId:
          input.recoveryDecisionId,

        recoveryDecisionRevision:
          input.recoveryDecisionRevision,

        selectedCandidateId:
          input.selectedCandidateId,

        selectedPlaybookId:
          input.selectedPlaybookId,

        decision,

        status:
          decision ===
            AUTHORIZATION_DECISION
              .EXPIRED
            ? AUTHORIZATION_STATUS
                .EXPIRED
            : AUTHORIZATION_STATUS
                .BLOCKED,

        approvalState:
          approval
            ?.state ||
          EXECUTION_APPROVAL_STATE
            .NOT_REQUIRED,

        policyState:
          policy
            ?.state ||
          EXECUTION_POLICY_STATE
            .UNKNOWN,

        freshnessState:
          freshness
            ?.state ||
          EXECUTION_FRESHNESS_STATE
            .UNKNOWN,

        killSwitchState:
          killSwitch
            ?.state ||
          KILL_SWITCH_STATE
            .UNKNOWN,

        lockState:
          lease
            ?.state ||
          EXECUTION_LOCK_STATE
            .NOT_REQUIRED,

        idempotencyState:
          idempotency
            ?.state ||
          IDEMPOTENCY_STATE
            .UNKNOWN,

        reasons:
          reasons,

        warnings: [
          ...(
            freshness
              ?.warnings ||
            []
          ),

          ...(
            approval
              ?.warnings ||
            []
          ),

          ...(
            policy
              ?.warnings ||
            []
          ),

          ...(
            killSwitch
              ?.warnings ||
            []
          ),

          ...(
            idempotency
              ?.warnings ||
            []
          ),

          ...(
            lease
              ?.warnings ||
            []
          ),
        ],

        metadata: {
          engineVersion:
            AUTHORIZATION_ENGINE_VERSION,

          stageTrace:
            trace,
        },
      });

    assertExecutionAuthorization(
      authorization
    );

    return {
      authorization,

      authorizationGranted:
        false,

      executionPlan:
        null,

      lease:
        lease ||
        null,

      freshness,

      approval,

      policy,

      killSwitch,

      idempotency,

      trace,

      startedAt,

      completedAt,

      executionStarted:
        false,
    };
  }

  // ==========================================================================
  // STAGE RUNNER
  // ==========================================================================

  async runStage({
    name,
    execute,
    trace,
  }) {
    const startedAt =
      new Date();

    try {
      const result =
        await execute();

      const completedAt =
        new Date();

      trace.push({
        stage:
          name,

        status:
          "SUCCESS",

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),
      });

      return result;
    } catch (
      error
    ) {
      const completedAt =
        new Date();

      trace.push({
        stage:
          name,

        status:
          "FAILED",

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),

        error: {
          code:
            error.code ||
            "EXECUTION_AUTHORIZATION_STAGE_FAILED",

          message:
            error.message,
        },
      });

      throw Object.assign(
        error,
        {
          authorizationStage:
            name,
        }
      );
    }
  }

  // ==========================================================================
  // SAFE LEASE RELEASE
  // ==========================================================================

  async safeReleaseLease(
    lease,
    dependencies
  ) {
    if (
      !lease
    ) {
      return;
    }

    try {
      await this.leaseService
        .release(
          lease,
          dependencies
            .lease ||
          dependencies
        );
    } catch (
      error
    ) {
      console.error(
        "[execution-authorization] Failed to release lease:",
        error.message
      );
    }
  }

  // ==========================================================================
  // AUTHORIZATION ID
  // ==========================================================================

  generateAuthorizationId(
    input
  ) {
    return (
      "execa_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.recoveryDecisionId,
            input.recoveryDecisionRevision ??
              "none",
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization input is required"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.selectedCandidateId
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization requires selectedCandidateId"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_CANDIDATE_REQUIRED",
        }
      );
    }

    if (
      !input.selectedPlaybookId
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization requires selectedPlaybookId"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_PLAYBOOK_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecision ||
      !input.selectedCandidate ||
      !input.playbook
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization requires recovery decision, candidate and playbook"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_CONTEXT_REQUIRED",
        }
      );
    }

    /*
     * Phase 7 must never pre-authorize Phase 8.
     */
    if (
      input.executionAuthorized ===
      true ||
      input.recoveryDecision
        ?.executionAuthorized ===
        true ||
      input.selectedCandidate
        ?.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Execution authorization received upstream execution authorization"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ENGINE_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionAuthorizationEngine();

module.exports
  .ExecutionAuthorizationEngine =
  ExecutionAuthorizationEngine;

module.exports
  .AUTHORIZATION_ENGINE_VERSION =
  AUTHORIZATION_ENGINE_VERSION;