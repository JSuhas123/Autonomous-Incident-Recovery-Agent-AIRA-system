"use strict";

/**
 * AIRA Recovery Decision Engine
 *
 * Phase 7.9
 *
 * Integrates the complete recovery decision pipeline.
 *
 * Pipeline:
 *
 * Diagnosis
 *   ↓
 * Playbook Discovery
 *   ↓
 * Applicability
 *   ↓
 * Action Risk
 *   ↓
 * Rollback Evaluation
 *   ↓
 * Policy Eligibility
 *   ↓
 * Approval Requirement
 *   ↓
 * Final Deterministic Ranking
 *   ↓
 * Canonical Recovery Decision
 *
 * SAFETY:
 *
 * - never executes playbooks
 * - never authorizes execution
 * - never bypasses policy
 * - never invents playbooks
 */

const crypto =
  require(
    "node:crypto"
  );

const playbookDiscoveryService =
  require(
    "./playbookDiscoveryService"
  );

const playbookApplicabilityService =
  require(
    "./playbookApplicabilityService"
  );

const actionRiskAnalysisService =
  require(
    "./actionRiskAnalysisService"
  );

const rollbackEvaluationService =
  require(
    "./rollbackEvaluationService"
  );

const policyEligibilityService =
  require(
    "./policyEligibilityService"
  );

const approvalRequirementService =
  require(
    "./approvalRequirementService"
  );

const recoveryCandidateRankingService =
  require(
    "./recoveryCandidateRankingService"
  );

const {
  createRecoveryDecision,
  RECOVERY_DECISION,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
  REVERSIBILITY,
} =
  require(
    "./recoveryDecisionContracts"
  );

const DECISION_ENGINE_VERSION =
  "phase7.9-v1";

class RecoveryDecisionEngine {
  constructor(
    options = {}
  ) {
    this.discoveryService =
      options.discoveryService ||
      playbookDiscoveryService;

    this.applicabilityService =
      options.applicabilityService ||
      playbookApplicabilityService;

    this.riskService =
      options.riskService ||
      actionRiskAnalysisService;

    this.rollbackService =
      options.rollbackService ||
      rollbackEvaluationService;

    this.policyService =
      options.policyService ||
      policyEligibilityService;

    this.approvalService =
      options.approvalService ||
      approvalRequirementService;

    this.rankingService =
      options.rankingService ||
      recoveryCandidateRankingService;

    this.minimumDecisionScore =
      clamp01(
        options.minimumDecisionScore ??
        0.55
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async decide(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const startedAt =
      new Date();

    const decisionId =
      this.createDecisionId(
        input
      );

    const stageTrace =
      [];

    const diagnosis =
      input.diagnosis;

    const context =
      input.context ||
      {};

    const safetyGate =
      input.safetyGate ||
      context.safetyGate ||
      null;

    // ========================================================================
    // 1. PHASE 6 SAFETY BOUNDARY
    // ========================================================================

    this.assertDiagnosisEligible({
      diagnosis,
      safetyGate,
      input,
    });

    // ========================================================================
    // 2. PLAYBOOK DISCOVERY
    // ========================================================================

    const discovery =
      await this.runStage({
        name:
          "playbook_discovery",

        trace:
          stageTrace,

        execute:
          () =>
            this.discoveryService
              .discover(
                {
                  organizationId:
                    input.organizationId ||
                    context.organizationId,

                  environmentId:
                    input.environmentId ||
                    context.environmentId,

                  diagnosis,

                  safetyGate,

                  context,

                  incident:
                    context.incident,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    if (
      discovery.noCandidates ||
      discovery.candidateCount ===
        0
    ) {
      return this.buildNoSafeAction({
        decisionId,
        input,
        stageTrace,
        startedAt,
        reason:
          "No approved playbook matched the verified diagnosis.",
      });
    }

    // ========================================================================
    // 3. APPLICABILITY
    // ========================================================================

    const applicability =
      await this.runStage({
        name:
          "playbook_applicability",

        trace:
          stageTrace,

        execute:
          () =>
            this.applicabilityService
              .evaluateCandidates(
                {
                  diagnosis,

                  context,

                  candidates:
                    discovery.candidates,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    if (
      applicability
        .applicableCount ===
      0
    ) {
      return this.buildNoSafeAction({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          applicability.candidates,

        reason:
          "Approved playbooks were discovered but none satisfied applicability and precondition checks.",
      });
    }

    // ========================================================================
    // 4. ACTION RISK
    // ========================================================================

    const risk =
      await this.runStage({
        name:
          "action_risk",

        trace:
          stageTrace,

        execute:
          () =>
            this.riskService
              .analyzeCandidates(
                {
                  diagnosis,

                  context,

                  candidates:
                    applicability
                      .applicableCandidates,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    if (
      risk.allowedCount ===
      0
    ) {
      return this.buildNoSafeAction({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          risk.candidates,

        reason:
          "All applicable recovery candidates exceeded action-risk limits.",
      });
    }

    // ========================================================================
    // 5. ROLLBACK / REVERSIBILITY
    // ========================================================================

    const rollback =
      await this.runStage({
        name:
          "rollback_evaluation",

        trace:
          stageTrace,

        execute:
          () =>
            this.rollbackService
              .evaluateCandidates(
                {
                  diagnosis,

                  context,

                  candidates:
                    risk
                      .allowedCandidates,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    // ========================================================================
    // 6. POLICY ELIGIBILITY
    // ========================================================================

    const policy =
      await this.runStage({
        name:
          "policy_eligibility",

        trace:
          stageTrace,

        execute:
          () =>
            this.policyService
              .evaluateCandidates(
                {
                  diagnosis,

                  context,

                  candidates:
                    rollback.candidates,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    const policyEligible =
      policy.candidates.filter(
        (
          candidate
        ) =>
          candidate
            .policy
            ?.status !==
          POLICY_STATUS
            .BLOCKED
      );

    if (
      policyEligible.length ===
      0
    ) {
      return this.buildNoSafeAction({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          policy.candidates,

        reason:
          "All recovery candidates were blocked by policy.",
      });
    }

    // ========================================================================
    // 7. APPROVAL REQUIREMENT
    // ========================================================================

    const approval =
      await this.runStage({
        name:
          "approval_resolution",

        trace:
          stageTrace,

        execute:
          () =>
            this.approvalService
              .resolveCandidates(
                {
                  diagnosis,

                  context,

                  candidates:
                    policyEligible,

                  executionAuthorized:
                    false,
                },

                dependencies
              ),
      });

    // ========================================================================
    // 8. FINAL RANKING
    // ========================================================================

    const ranking =
      await this.runStage({
        name:
          "final_ranking",

        trace:
          stageTrace,

        execute:
          async () =>
            this.rankingService
              .rankCandidates({
                candidates:
                  approval.candidates,

                executionAuthorized:
                  false,
              }),
      });

    if (
      ranking.rankedCount ===
        0 ||
      !ranking.topCandidate
    ) {
      return this.buildNoSafeAction({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          approval.candidates,

        reason:
          "No recovery candidate remained eligible after final ranking.",
      });
    }

    // ========================================================================
    // 9. SELECT TOP CANDIDATE
    // ========================================================================

    const selected =
      ranking.topCandidate;

    const selectedScore =
      clamp01(
        selected
          ?.ranking
          ?.score
      );

    if (
      selectedScore <
      this.minimumDecisionScore
    ) {
      return this.buildManualDecision({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          ranking.candidates,

        reason:
          `Best recovery candidate score ${selectedScore} is below minimum decision threshold ${this.minimumDecisionScore}.`,
      });
    }

    // ========================================================================
    // 10. MANUAL-ONLY
    // ========================================================================

    if (
      selected
        ?.approval
        ?.mode ===
      APPROVAL_MODE
        .MANUAL_ONLY
    ) {
      return this.buildManualDecision({
        decisionId,
        input,
        stageTrace,
        startedAt,
        candidates:
          ranking.candidates,

        selected,

        reason:
          "Selected recovery candidate is restricted to manual-only handling.",
      });
    }

    // ========================================================================
    // 11. REQUIRES APPROVAL
    // ========================================================================

    if (
      selected
        ?.approval
        ?.required ===
      true
    ) {
      return this.buildDecision({
        decisionId,
        input,

        decision:
          RECOVERY_DECISION
            .REQUIRE_APPROVAL,

        selected,

        candidates:
          ranking.candidates,

        reasons: [
          "Highest-ranked safe recovery candidate requires approval.",
          ...(
            selected
              ?.approval
              ?.reasons ||
            []
          ),
        ],

        stageTrace,
        startedAt,
      });
    }

    // ========================================================================
    // 12. RECOMMEND PLAYBOOK
    // ========================================================================

    return this.buildDecision({
      decisionId,
      input,

      decision:
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK,

      selected,

      candidates:
        ranking.candidates,

      reasons: [
        "Highest-ranked recovery candidate passed applicability, risk, rollback, policy, approval, and ranking checks.",
      ],

      stageTrace,
      startedAt,
    });
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
            "RECOVERY_DECISION_STAGE_FAILED",

          message:
            error.message,
        },
      });

      throw Object.assign(
        error,
        {
          recoveryStage:
            name,
        }
      );
    }
  }

  // ==========================================================================
  // BUILD NORMAL DECISION
  // ==========================================================================

  buildDecision({
    decisionId,
    input,
    decision,
    selected,
    candidates,
    reasons,
    stageTrace,
    startedAt,
  }) {
    const completedAt =
      new Date();

    const result =
      createRecoveryDecision({
        decisionId,

        incidentId:
          input.context
            ?.incidentId ||
          input.context
            ?.incident
            ?._id ||
          input.incidentId ||
          null,

        diagnosisId:
          input.diagnosisId ||
          input.diagnosis
            ?.diagnosisId ||
          null,

        diagnosisRevision:
          input.diagnosisRevision ??
          input.diagnosis
            ?.revision ??
          null,

        decision,

        selectedCandidateId:
          selected
            ?.candidateId ||
          null,

        selectedPlaybookId:
          selected
            ?.playbookId ||
          null,

        confidence:
          selected
            ?.ranking
            ?.score ||
          0,

        candidates,

        rejectedCandidates:
          candidates.filter(
            (
              candidate
            ) =>
              [
                CANDIDATE_STATUS
                  .REJECTED,

                CANDIDATE_STATUS
                  .POLICY_BLOCKED,

                CANDIDATE_STATUS
                  .PRECONDITION_FAILED,

                CANDIDATE_STATUS
                  .RISK_BLOCKED,
              ].includes(
                candidate.status
              )
          ),

        reasons,

        policyStatus:
          selected
            ?.policy
            ?.status ||
          POLICY_STATUS
            .UNKNOWN,

        riskLevel:
          selected
            ?.actionRisk
            ?.level,

        approvalRequired:
          Boolean(
            selected
              ?.approval
              ?.required
          ),

        approvalMode:
          selected
            ?.approval
            ?.mode ||
          APPROVAL_MODE
            .NONE,

        rollbackAvailable:
          Boolean(
            selected
              ?.rollback
              ?.available
          ),

        reversibility:
          selected
            ?.rollback
            ?.reversibility ||
          REVERSIBILITY
            .UNKNOWN,

        generatedAt:
          completedAt,

        metadata: {
          engineVersion:
            DECISION_ENGINE_VERSION,

          stageTrace,

          startedAt,

          completedAt,

          durationMs:
            Math.max(
              0,
              completedAt -
              startedAt
            ),

          safetyGateDecision:
            input
              ?.safetyGate
              ?.decision ||
            input
              ?.context
              ?.safetyGate
              ?.decision ||
            null,
        },

        executionAuthorized:
          false,
      });

    return {
      decision:
        result,

      selectedCandidate:
        selected,

      candidates,

      stageTrace,

      startedAt,

      completedAt,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // NO SAFE ACTION
  // ==========================================================================

  buildNoSafeAction({
    decisionId,
    input,
    stageTrace,
    startedAt,
    candidates = [],
    reason,
  }) {
    return this.buildDecision({
      decisionId,
      input,

      decision:
        RECOVERY_DECISION
          .NO_SAFE_ACTION,

      selected:
        null,

      candidates,

      reasons: [
        reason ||
        "No safe recovery action is currently available.",
      ],

      stageTrace,
      startedAt,
    });
  }

  // ==========================================================================
  // MANUAL DECISION
  // ==========================================================================

  buildManualDecision({
    decisionId,
    input,
    stageTrace,
    startedAt,
    candidates = [],
    selected = null,
    reason,
  }) {
    return this.buildDecision({
      decisionId,
      input,

      decision:
        RECOVERY_DECISION
          .MANUAL_INTERVENTION,

      selected,

      candidates,

      reasons: [
        reason ||
        "Recovery requires manual operator intervention.",
      ],

      stageTrace,
      startedAt,
    });
  }

  // ==========================================================================
  // PHASE 6 SAFETY CHECK
  // ==========================================================================

  assertDiagnosisEligible({
    diagnosis,
    safetyGate,
    input,
  }) {
    if (
      safetyGate
        ?.decision !==
      "ALLOW_EVALUATION"
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision cannot start because diagnosis safety gate did not allow evaluation"
        ),
        {
          code:
            "RECOVERY_DECISION_DIAGNOSIS_NOT_ELIGIBLE",

          safetyGateDecision:
            safetyGate
              ?.decision ||
            null,
        }
      );
    }

    if (
      diagnosis
        ?.recommendedNextStep
        ?.type !==
      "EVALUATE_PLAYBOOK"
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis does not request playbook evaluation"
        ),
        {
          code:
            "RECOVERY_DECISION_NEXT_STEP_INVALID",
        }
      );
    }

    if (
      input.executionAuthorized ===
        true ||
      diagnosis
        ?.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision received unsafe execution authorization"
        ),
        {
          code:
            "RECOVERY_DECISION_UNSAFE_INPUT",
        }
      );
    }
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
          "Recovery decision input is required"
        ),
        {
          code:
            "RECOVERY_DECISION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision requires diagnosis"
        ),
        {
          code:
            "RECOVERY_DECISION_DIAGNOSIS_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // DECISION ID
  // ==========================================================================

  createDecisionId(
    input
  ) {
    const incidentId =
      input
        ?.context
        ?.incidentId ||
      input
        ?.context
        ?.incident
        ?._id ||
      input.incidentId ||
      "unknown";

    return (
      "recovery_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          `${incidentId}:${Date.now()}:${crypto.randomUUID()}`
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
}

// ============================================================================
// HELPERS
// ============================================================================

function clamp01(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new RecoveryDecisionEngine();

module.exports
  .RecoveryDecisionEngine =
  RecoveryDecisionEngine;

module.exports
  .DECISION_ENGINE_VERSION =
  DECISION_ENGINE_VERSION;