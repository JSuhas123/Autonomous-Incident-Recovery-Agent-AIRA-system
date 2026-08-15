"use strict";

/**
 * AIRA Recovery Decision Critic
 *
 * Phase 7.10
 *
 * Independent deterministic validation layer for recovery decisions.
 *
 * Runs AFTER RecoveryDecisionEngine.
 *
 * Responsibilities:
 *
 * - validate decision / candidate consistency
 * - validate applicability
 * - validate policy state
 * - validate approval requirements
 * - validate action risk
 * - validate rollback / reversibility
 * - validate ranking
 * - detect unsafe execution authorization
 * - detect contradictory recovery decisions
 *
 * DOES NOT:
 *
 * - execute recovery actions
 * - authorize execution
 * - modify policy
 * - select a different playbook
 * - silently repair unsafe decisions
 */

const {
  RECOVERY_DECISION,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
  REVERSIBILITY,
} =
  require(
    "./recoveryDecisionContracts"
  );

// ============================================================================
// CRITIC DECISIONS
// ============================================================================

const CRITIC_DECISION =
  Object.freeze({
    ACCEPT:
      "ACCEPT",

    REJECT:
      "REJECT",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",
  });

const CRITIC_VERSION =
  "phase7.10-v1";

class RecoveryDecisionCritic {
  constructor(
    options = {}
  ) {
    this.maximumAutomaticRisk =
      clamp01(
        options.maximumAutomaticRisk ??
        0.65
      );

    this.minimumRankingScore =
      clamp01(
        options.minimumRankingScore ??
        0.55
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async review(
    engineResult,
    context = {}
  ) {
    this.assertInput(
      engineResult
    );

    const startedAt =
      new Date();

    const decision =
      engineResult.decision;

    const selected =
      engineResult
        .selectedCandidate ||
      this.findSelectedCandidate(
        engineResult
      );

    const violations =
      [];

    const warnings =
      [];

    // ========================================================================
    // 1. ABSOLUTE EXECUTION SAFETY
    // ========================================================================

    this.checkExecutionAuthorization({
      engineResult,
      decision,
      selected,
      violations,
    });

    // ========================================================================
    // 2. DECISION SHAPE
    // ========================================================================

    this.checkDecisionShape({
      decision,
      selected,
      violations,
    });

    // ========================================================================
    // 3. SELECTED CANDIDATE VALIDATION
    // ========================================================================

    if (
      selected
    ) {
      this.checkCandidateIdentity({
        decision,
        selected,
        violations,
      });

      this.checkApplicability({
        selected,
        violations,
      });

      this.checkPolicy({
        decision,
        selected,
        violations,
      });

      this.checkRisk({
        decision,
        selected,
        violations,
        warnings,
      });

      this.checkRollback({
        decision,
        selected,
        violations,
        warnings,
      });

      this.checkApproval({
        decision,
        selected,
        violations,
      });

      this.checkRanking({
        decision,
        selected,
        engineResult,
        violations,
        warnings,
      });
    }

    // ========================================================================
    // 4. NO SAFE ACTION
    // ========================================================================

    this.checkNoSafeAction({
      decision,
      selected,
      violations,
    });

    // ========================================================================
    // 5. MANUAL INTERVENTION
    // ========================================================================

    this.checkManualIntervention({
      decision,
      selected,
      warnings,
    });

    // ========================================================================
    // 6. OPTIONAL EXTERNAL SAFETY VALIDATOR
    // ========================================================================

    if (
      typeof context
        .safetyValidator ===
      "function"
    ) {
      const external =
        await context
          .safetyValidator({
            decision,

            selectedCandidate:
              selected,

            candidates:
              engineResult
                .candidates ||
              [],
          });

      if (
        external
          ?.safe ===
        false
      ) {
        violations.push(
          ...normalizeMessages(
            external.violations,
            "External recovery safety validation failed."
          )
        );
      }

      warnings.push(
        ...normalizeMessages(
          external?.warnings
        )
      );
    }

    // ========================================================================
    // 7. FINAL CRITIC DECISION
    // ========================================================================

    const criticDecision =
      this.resolveCriticDecision({
        decision,
        violations,
        warnings,
      });

    const completedAt =
      new Date();

    return {
      criticDecision,

      accepted:
        criticDecision ===
        CRITIC_DECISION
          .ACCEPT,

      requiresManualReview:
        criticDecision ===
        CRITIC_DECISION
          .MANUAL_REVIEW,

      rejected:
        criticDecision ===
        CRITIC_DECISION
          .REJECT,

      violations:
        uniqueStrings(
          violations
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      reviewedDecision:
        decision.decision,

      selectedCandidateId:
        selected
          ?.candidateId ||
        null,

      selectedPlaybookId:
        selected
          ?.playbookId ||
        null,

      criticVersion:
        CRITIC_VERSION,

      startedAt,

      completedAt,

      durationMs:
        Math.max(
          0,
          completedAt -
          startedAt
        ),

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // VALIDATE ALIAS
  // ==========================================================================

  /**
   * Compatibility alias.
   *
   * Allows:
   *
   * critic.review(...)
   *
   * and:
   *
   * critic.validate(...)
   *
   * to use the same deterministic critic implementation.
   */
  async validate(
    engineResult,
    context = {}
  ) {
    return this.review(
      engineResult,
      context
    );
  }

  // ==========================================================================
  // EXECUTION AUTHORIZATION
  // ==========================================================================

  checkExecutionAuthorization({
    engineResult,
    decision,
    selected,
    violations,
  }) {
    if (
      engineResult
        ?.executionAuthorized ===
      true
    ) {
      violations.push(
        "Recovery engine result illegally contains execution authorization."
      );
    }

    if (
      decision
        ?.executionAuthorized ===
      true
    ) {
      violations.push(
        "Recovery decision illegally contains execution authorization."
      );
    }

    if (
      selected
        ?.executionAuthorized ===
      true
    ) {
      violations.push(
        "Selected recovery candidate illegally contains execution authorization."
      );
    }
  }

  // ==========================================================================
  // DECISION SHAPE
  // ==========================================================================

  checkDecisionShape({
    decision,
    selected,
    violations,
  }) {
    const selectedRequired = [
      RECOVERY_DECISION
        .RECOMMEND_PLAYBOOK,

      RECOVERY_DECISION
        .REQUIRE_APPROVAL,
    ];

    if (
      selectedRequired.includes(
        decision.decision
      ) &&
      !selected
    ) {
      violations.push(
        `${decision.decision} requires a selected recovery candidate.`
      );
    }

    if (
      selectedRequired.includes(
        decision.decision
      ) &&
      !decision
        .selectedPlaybookId
    ) {
      violations.push(
        `${decision.decision} requires selectedPlaybookId.`
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .NO_SAFE_ACTION &&
      selected
    ) {
      violations.push(
        "NO_SAFE_ACTION must not contain a selected recovery candidate."
      );
    }
  }

  // ==========================================================================
  // CANDIDATE IDENTITY
  // ==========================================================================

  checkCandidateIdentity({
    decision,
    selected,
    violations,
  }) {
    if (
      decision
        .selectedCandidateId &&
      selected
        .candidateId &&
      String(
        decision
          .selectedCandidateId
      ) !==
      String(
        selected
          .candidateId
      )
    ) {
      violations.push(
        "Selected candidate ID does not match recovery decision."
      );
    }

    if (
      decision
        .selectedPlaybookId &&
      selected
        .playbookId &&
      String(
        decision
          .selectedPlaybookId
      ) !==
      String(
        selected
          .playbookId
      )
    ) {
      violations.push(
        "Selected playbook ID does not match recovery decision."
      );
    }
  }

  // ==========================================================================
  // APPLICABILITY
  // ==========================================================================

  checkApplicability({
    selected,
    violations,
  }) {
    if (
      selected
        ?.applicability
        ?.applicable ===
      false
    ) {
      violations.push(
        "Selected recovery candidate is not applicable."
      );
    }

    const unsafeStatuses = [
      CANDIDATE_STATUS
        .INAPPLICABLE,

      CANDIDATE_STATUS
        .PRECONDITION_FAILED,

      CANDIDATE_STATUS
        .REJECTED,

      CANDIDATE_STATUS
        .RISK_BLOCKED,

      CANDIDATE_STATUS
        .POLICY_BLOCKED,
    ]
      .filter(
        Boolean
      );

    if (
      unsafeStatuses.includes(
        selected.status
      )
    ) {
      violations.push(
        `Selected recovery candidate has unsafe status ${selected.status}.`
      );
    }
  }

  // ==========================================================================
  // POLICY
  // ==========================================================================

  checkPolicy({
    decision,
    selected,
    violations,
  }) {
    const policyStatus =
      selected
        ?.policy
        ?.status;

    if (
      policyStatus ===
      POLICY_STATUS
        .BLOCKED
    ) {
      violations.push(
        "Selected recovery candidate is blocked by policy."
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      policyStatus ===
        POLICY_STATUS
          .REQUIRES_APPROVAL
    ) {
      violations.push(
        "Recovery decision recommends automatic playbook handling even though policy requires approval."
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .REQUIRE_APPROVAL &&
      policyStatus ===
        POLICY_STATUS
          .BLOCKED
    ) {
      violations.push(
        "Policy-blocked recovery candidate cannot enter approval workflow."
      );
    }
  }

  // ==========================================================================
  // RISK
  // ==========================================================================

  checkRisk({
    decision,
    selected,
    violations,
    warnings,
  }) {
    const score =
      clamp01(
        selected
          ?.actionRisk
          ?.score
      );

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      score >
        this.maximumAutomaticRisk
    ) {
      violations.push(
        `Automatic recovery recommendation exceeds critic risk limit ${this.maximumAutomaticRisk}.`
      );
    }

    if (
      score >=
      0.5
    ) {
      warnings.push(
        `Selected recovery candidate has action-risk score ${score}.`
      );
    }
  }

  // ==========================================================================
  // ROLLBACK
  // ==========================================================================

  checkRollback({
    decision,
    selected,
    violations,
    warnings,
  }) {
    const rollback =
      selected.rollback ||
      {};

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      rollback.reversibility ===
        REVERSIBILITY
          .NONE
    ) {
      violations.push(
        "Irreversible recovery action cannot be automatically recommended."
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      rollback.reversibility ===
        REVERSIBILITY
          .UNKNOWN
    ) {
      warnings.push(
        "Automatically recommended recovery has unknown reversibility."
      );
    }

    if (
      rollback.available ===
        true &&
      rollback.reversibility ===
        REVERSIBILITY
          .NONE
    ) {
      violations.push(
        "Rollback state is contradictory: rollback is available but action is marked irreversible."
      );
    }

    const riskScore =
      clamp01(
        selected
          ?.actionRisk
          ?.score
      );

    if (
      rollback.available ===
        false &&
      riskScore >=
        0.5
    ) {
      warnings.push(
        "Elevated-risk recovery candidate has no verified rollback path."
      );
    }
  }

  // ==========================================================================
  // APPROVAL
  // ==========================================================================

  checkApproval({
    decision,
    selected,
    violations,
  }) {
    const approval =
      selected.approval ||
      {};

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      approval.required ===
        true
    ) {
      violations.push(
        "Recovery decision recommends playbook although candidate requires approval."
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .REQUIRE_APPROVAL &&
      approval.required !==
        true
    ) {
      violations.push(
        "Recovery decision requires approval but selected candidate does not require approval."
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK &&
      [
        APPROVAL_MODE
          .HUMAN,

        APPROVAL_MODE
          .MULTI_PARTY,

        APPROVAL_MODE
          .MANUAL_ONLY,
      ].includes(
        approval.mode
      )
    ) {
      violations.push(
        `Automatic recovery recommendation conflicts with approval mode ${approval.mode}.`
      );
    }

    if (
      decision.decision ===
        RECOVERY_DECISION
          .REQUIRE_APPROVAL &&
      approval.mode ===
        APPROVAL_MODE
          .MANUAL_ONLY
    ) {
      violations.push(
        "Manual-only recovery cannot enter normal approval workflow."
      );
    }

    if (
      approval.mode ===
        APPROVAL_MODE
          .MANUAL_ONLY &&
      decision.decision !==
        RECOVERY_DECISION
          .MANUAL_INTERVENTION
    ) {
      violations.push(
        "Manual-only recovery candidate must resolve to MANUAL_INTERVENTION."
      );
    }
  }

  // ==========================================================================
  // RANKING
  // ==========================================================================

  checkRanking({
    decision,
    selected,
    engineResult,
    violations,
    warnings,
  }) {
    const score =
      clamp01(
        selected
          ?.ranking
          ?.score
      );

    if (
      [
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK,

        RECOVERY_DECISION
          .REQUIRE_APPROVAL,
      ].includes(
        decision.decision
      ) &&
      score <
        this.minimumRankingScore
    ) {
      violations.push(
        `Selected recovery candidate ranking score ${score} is below critic minimum ${this.minimumRankingScore}.`
      );
    }

    if (
      score <
        0.7
    ) {
      warnings.push(
        `Selected recovery candidate has moderate ranking confidence ${score}.`
      );
    }

    // ------------------------------------------------------------------------
    // VERIFY SELECTED CANDIDATE IS ACTUALLY TOP-RANKED
    // ------------------------------------------------------------------------

    const candidates =
      Array.isArray(
        engineResult
          ?.candidates
      )
        ? engineResult
            .candidates
        : [];

    const ranked =
      candidates
        .filter(
          (
            candidate
          ) =>
            Number.isFinite(
              Number(
                candidate
                  ?.ranking
                  ?.rank
              )
            )
        )
        .sort(
          (
            left,
            right
          ) =>
            Number(
              left
                .ranking
                .rank
            ) -
            Number(
              right
                .ranking
                .rank
            )
        );

    if (
      ranked.length >
        0
    ) {
      const top =
        ranked[0];

      if (
        top
          ?.candidateId &&
        selected
          ?.candidateId &&
        String(
          top.candidateId
        ) !==
        String(
          selected.candidateId
        )
      ) {
        violations.push(
          "Selected recovery candidate is not the highest-ranked eligible candidate."
        );
      }
    }
  }

  // ==========================================================================
  // NO SAFE ACTION
  // ==========================================================================

  checkNoSafeAction({
    decision,
    selected,
    violations,
  }) {
    if (
      decision.decision !==
      RECOVERY_DECISION
        .NO_SAFE_ACTION
    ) {
      return;
    }

    if (
      decision
        .selectedCandidateId ||
      decision
        .selectedPlaybookId ||
      selected
    ) {
      violations.push(
        "NO_SAFE_ACTION contains an unexpected selected recovery candidate."
      );
    }
  }

  // ==========================================================================
  // MANUAL INTERVENTION
  // ==========================================================================

  checkManualIntervention({
    decision,
    selected,
    warnings,
  }) {
    if (
      decision.decision !==
      RECOVERY_DECISION
        .MANUAL_INTERVENTION
    ) {
      return;
    }

    if (
      selected
    ) {
      warnings.push(
        "Manual intervention decision retains a candidate for operator context only."
      );
    }
  }

  // ==========================================================================
  // CRITIC DECISION
  // ==========================================================================

  resolveCriticDecision({
    decision,
    violations,
    warnings,
  }) {
    if (
      violations.length >
      0
    ) {
      return CRITIC_DECISION
        .REJECT;
    }

    /*
     * MANUAL_INTERVENTION is already conservative.
     * Warnings do not make it unsafe.
     */
    if (
      decision.decision ===
      RECOVERY_DECISION
        .MANUAL_INTERVENTION
    ) {
      return CRITIC_DECISION
        .ACCEPT;
    }

    /*
     * NO_SAFE_ACTION is also conservative.
     */
    if (
      decision.decision ===
      RECOVERY_DECISION
        .NO_SAFE_ACTION
    ) {
      return CRITIC_DECISION
        .ACCEPT;
    }

    /*
     * REQUIRE_APPROVAL already has a human safety boundary.
     *
     * Warnings remain visible but do not reject the decision.
     */
    if (
      decision.decision ===
      RECOVERY_DECISION
        .REQUIRE_APPROVAL
    ) {
      return CRITIC_DECISION
        .ACCEPT;
    }

    /*
     * An automatic recommendation containing warnings should be
     * escalated instead of automatically trusted.
     */
    if (
      warnings.length >
        0 &&
      decision.decision ===
        RECOVERY_DECISION
          .RECOMMEND_PLAYBOOK
    ) {
      return CRITIC_DECISION
        .MANUAL_REVIEW;
    }

    return CRITIC_DECISION
      .ACCEPT;
  }

  // ==========================================================================
  // FIND SELECTED CANDIDATE
  // ==========================================================================

  findSelectedCandidate(
    engineResult
  ) {
    const selectedId =
      engineResult
        ?.decision
        ?.selectedCandidateId;

    const selectedPlaybookId =
      engineResult
        ?.decision
        ?.selectedPlaybookId;

    const candidates =
      Array.isArray(
        engineResult
          ?.candidates
      )
        ? engineResult
            .candidates
        : [];

    if (
      selectedId
    ) {
      const match =
        candidates.find(
          (
            candidate
          ) =>
            String(
              candidate
                ?.candidateId
            ) ===
            String(
              selectedId
            )
        );

      if (
        match
      ) {
        return match;
      }
    }

    if (
      selectedPlaybookId
    ) {
      return (
        candidates.find(
          (
            candidate
          ) =>
            String(
              candidate
                ?.playbookId
            ) ===
            String(
              selectedPlaybookId
            )
        ) ||
        null
      );
    }

    return null;
  }

  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  assertInput(
    engineResult
  ) {
    if (
      !engineResult ||
      typeof engineResult !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Recovery critic input is required"
        ),
        {
          code:
            "RECOVERY_CRITIC_INPUT_REQUIRED",
        }
      );
    }

    if (
      !engineResult.decision
    ) {
      throw Object.assign(
        new Error(
          "Recovery critic requires recovery decision"
        ),
        {
          code:
            "RECOVERY_CRITIC_DECISION_REQUIRED",
        }
      );
    }

    if (
      !engineResult
        .decision
        .decision
    ) {
      throw Object.assign(
        new Error(
          "Recovery critic requires canonical decision type"
        ),
        {
          code:
            "RECOVERY_CRITIC_DECISION_TYPE_REQUIRED",
        }
      );
    }
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

function normalizeMessages(
  values,
  fallback = null
) {
  if (
    Array.isArray(
      values
    )
  ) {
    return values
      .filter(
        Boolean
      )
      .map(
        String
      );
  }

  if (
    values
  ) {
    return [
      String(
        values
      ),
    ];
  }

  return fallback
    ? [
        fallback,
      ]
    : [];
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
}

// ============================================================================
// EXPORT
// ============================================================================

const recoveryDecisionCritic =
  new RecoveryDecisionCritic();

module.exports =
  recoveryDecisionCritic;

module.exports.RecoveryDecisionCritic =
  RecoveryDecisionCritic;

module.exports.CRITIC_DECISION =
  CRITIC_DECISION;

module.exports.CRITIC_VERSION =
  CRITIC_VERSION;

/*
 * Compatibility alias.
 *
 * Some earlier Phase 7 code/tests referred to this as CRITIC_STATUS.
 * Both now point at the exact same immutable contract.
 */
module.exports.CRITIC_STATUS =
  CRITIC_DECISION;