"use strict";

/**
 * AIRA Recovery Candidate Ranking Service
 *
 * Phase 7.4
 *
 * Deterministically ranks applicable recovery candidates.
 *
 * This is NOT an LLM ranking layer.
 *
 * Ranking considers:
 *
 * - diagnosis relevance
 * - applicability
 * - historical effectiveness
 * - reversibility
 * - policy eligibility
 * - action risk
 * - approval burden
 *
 * IMPORTANT:
 *
 * At Phase 7.4 some downstream dimensions may still be UNKNOWN.
 * Missing dimensions are excluded from the weighted denominator instead
 * of being treated as zero.
 *
 * This allows candidates to be ranked now and re-ranked later after:
 *
 * 7.5 Action Risk
 * 7.6 Rollback Evaluation
 * 7.7 Policy Eligibility
 * 7.8 Approval Resolution
 *
 * SAFETY:
 *
 * - no execution
 * - no execution authorization
 * - no policy bypass
 * - no LLM choosing a playbook
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  ACTION_RISK,
  REVERSIBILITY,
  APPROVAL_MODE,
  POLICY_STATUS,
} =
  require(
    "./recoveryDecisionContracts"
  );

const DEFAULT_WEIGHTS =
  Object.freeze({
    diagnosisMatch:
      0.30,

    applicability:
      0.25,

    historicalEffectiveness:
      0.15,

    reversibility:
      0.10,

    policy:
      0.10,

    actionRisk:
      0.07,

    approval:
      0.03,
  });

class RecoveryCandidateRankingService {
  constructor(
    options = {}
  ) {
    this.weights =
      this.normalizeWeights(
        options.weights ||
        DEFAULT_WEIGHTS
      );

    this.minimumRankableApplicability =
      clamp01(
        options
          .minimumRankableApplicability ??
        0.5
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  rankCandidates(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const candidates =
      input.candidates;

    const ranked =
      [];

    const rejected =
      [];

    for (
      const candidate
      of candidates
    ) {
      const eligibility =
        this.isRankable(
          candidate
        );

      if (
        !eligibility.rankable
      ) {
        rejected.push(
          createRecoveryCandidate({
            ...candidate,

            status:
              candidate.status ===
              CANDIDATE_STATUS
                .APPLICABLE
                ? CANDIDATE_STATUS
                    .REJECTED
                : candidate.status,

            ranking: {
              score:
                null,

              rank:
                null,

              reasons:
                eligibility.reasons,
            },

            executionAuthorized:
              false,
          })
        );

        continue;
      }

      const score =
        this.calculateScore(
          candidate
        );

      ranked.push(
        createRecoveryCandidate({
          ...candidate,

          ranking: {
            score:
              score.score,

            rank:
              null,

            reasons:
              score.reasons,
          },

          executionAuthorized:
            false,
        })
      );
    }

    // ------------------------------------------------------------------------
    // DETERMINISTIC ORDER
    // ------------------------------------------------------------------------

    ranked.sort(
      (
        left,
        right
      ) => {
        const scoreDifference =
          (
            right
              .ranking
              .score ||
            0
          ) -
          (
            left
              .ranking
              .score ||
            0
          );

        if (
          scoreDifference !==
          0
        ) {
          return scoreDifference;
        }

        /*
         * Stable deterministic tie-breaker.
         */
        return String(
          left.playbookId
        )
          .localeCompare(
            String(
              right.playbookId
            )
          );
      }
    );

    const withRanks =
      ranked.map(
        (
          candidate,
          index
        ) =>
          createRecoveryCandidate({
            ...candidate,

            ranking: {
              ...candidate.ranking,

              rank:
                index +
                1,
            },

            executionAuthorized:
              false,
          })
      );

    return {
      candidates:
        withRanks,

      rejectedCandidates:
        rejected,

      rankedCount:
        withRanks.length,

      rejectedCount:
        rejected.length,

      topCandidate:
        withRanks[0] ||
        null,

      rankingVersion:
        "phase7.4-v1",

      weights:
        {
          ...this.weights,
        },

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // RANKABILITY
  // ==========================================================================

  isRankable(
  candidate
) {
  const reasons =
    [];

  if (
    !candidate
      ?.playbookId
  ) {
    reasons.push(
      "Candidate has no playbookId."
    );
  }

  if (
    candidate
      ?.executionAuthorized ===
    true
  ) {
    reasons.push(
      "Candidate contains invalid execution authorization."
    );
  }

  // ------------------------------------------------------------------------
  // RANKABLE STATES
  // ------------------------------------------------------------------------

  /*
   * IMPORTANT:
   *
   * APPROVAL_REQUIRED is still a valid recovery candidate.
   *
   * It must remain rankable so the RecoveryDecisionEngine can produce:
   *
   * REQUIRE_APPROVAL
   *
   * instead of incorrectly producing:
   *
   * NO_SAFE_ACTION
   */

  const rankableStatuses = [
    CANDIDATE_STATUS
      .APPLICABLE,

    CANDIDATE_STATUS
      .APPROVAL_REQUIRED,
  ];

  if (
    !rankableStatuses.includes(
      candidate
        ?.status
    )
  ) {
    reasons.push(
      `Candidate status ${candidate?.status || "UNKNOWN"} is not rankable.`
    );
  }

  // ------------------------------------------------------------------------
  // APPLICABILITY
  // ------------------------------------------------------------------------

  const applicability =
    clamp01OrNull(
      candidate
        ?.applicability
        ?.score
    );

  if (
    applicability !==
      null &&
    applicability <
      this
        .minimumRankableApplicability
  ) {
    reasons.push(
      `Applicability score ${applicability} is below minimum ${this.minimumRankableApplicability}.`
    );
  }

  if (
    candidate
      ?.applicability
      ?.applicable ===
    false
  ) {
    reasons.push(
      "Candidate is explicitly marked inapplicable."
    );
  }

  // ------------------------------------------------------------------------
  // HARD POLICY BLOCK
  // ------------------------------------------------------------------------

  if (
    candidate
      ?.policy
      ?.status ===
    POLICY_STATUS
      .BLOCKED
  ) {
    reasons.push(
      "Candidate is blocked by policy."
    );
  }

  // ------------------------------------------------------------------------
  // HARD RISK BLOCK
  // ------------------------------------------------------------------------

  if (
    candidate
      ?.status ===
    CANDIDATE_STATUS
      .RISK_BLOCKED
  ) {
    reasons.push(
      "Candidate is blocked by action risk."
    );
  }

  // ------------------------------------------------------------------------
  // PRECONDITION FAILURE
  // ------------------------------------------------------------------------

  if (
    candidate
      ?.status ===
    CANDIDATE_STATUS
      .PRECONDITION_FAILED
  ) {
    reasons.push(
      "Candidate failed recovery preconditions."
    );
  }

  // ------------------------------------------------------------------------
  // POLICY BLOCK STATUS
  // ------------------------------------------------------------------------

  if (
    candidate
      ?.status ===
    CANDIDATE_STATUS
      .POLICY_BLOCKED
  ) {
    reasons.push(
      "Candidate status indicates policy block."
    );
  }

  return {
    rankable:
      reasons.length ===
      0,

    reasons,
  };
}

  // ==========================================================================
  // SCORE
  // ==========================================================================

  calculateScore(
    candidate
  ) {
    const components =
      [];

    // ------------------------------------------------------------------------
    // DIAGNOSIS MATCH
    // ------------------------------------------------------------------------

    this.pushComponent(
      components,
      "diagnosisMatch",
      clamp01OrNull(
        candidate
          .diagnosisMatch
          ?.score
      ),
      this.weights
        .diagnosisMatch
    );

    // ------------------------------------------------------------------------
    // APPLICABILITY
    // ------------------------------------------------------------------------

    this.pushComponent(
      components,
      "applicability",
      clamp01OrNull(
        candidate
          .applicability
          ?.score
      ),
      this.weights
        .applicability
    );

    // ------------------------------------------------------------------------
    // HISTORICAL EFFECTIVENESS
    // ------------------------------------------------------------------------

    const historical =
      this.calculateHistoricalScore(
        candidate
      );

    this.pushComponent(
      components,
      "historicalEffectiveness",
      historical,
      this.weights
        .historicalEffectiveness
    );

    // ------------------------------------------------------------------------
    // REVERSIBILITY
    // ------------------------------------------------------------------------

    const reversibility =
      this.calculateReversibilityScore(
        candidate
      );

    this.pushComponent(
      components,
      "reversibility",
      reversibility,
      this.weights
        .reversibility
    );

    // ------------------------------------------------------------------------
    // POLICY
    // ------------------------------------------------------------------------

    const policyScore =
      this.calculatePolicyScore(
        candidate
      );

    this.pushComponent(
      components,
      "policy",
      policyScore,
      this.weights
        .policy
    );

    // ------------------------------------------------------------------------
    // ACTION RISK
    // ------------------------------------------------------------------------

    const riskScore =
      this.calculateActionRiskScore(
        candidate
      );

    this.pushComponent(
      components,
      "actionRisk",
      riskScore,
      this.weights
        .actionRisk
    );

    // ------------------------------------------------------------------------
    // APPROVAL BURDEN
    // ------------------------------------------------------------------------

    const approvalScore =
      this.calculateApprovalScore(
        candidate
      );

    this.pushComponent(
      components,
      "approval",
      approvalScore,
      this.weights
        .approval
    );

    // ------------------------------------------------------------------------
    // WEIGHTED AVERAGE
    // ------------------------------------------------------------------------

    const totalWeight =
      components.reduce(
        (
          total,
          component
        ) =>
          total +
          component.weight,
        0
      );

    const weightedTotal =
      components.reduce(
        (
          total,
          component
        ) =>
          total +
          component.value *
            component.weight,
        0
      );

    const score =
      totalWeight >
        0
        ? weightedTotal /
          totalWeight
        : 0;

    const reasons =
      components.map(
        (
          component
        ) =>
          `${component.name}=${roundScore(component.value)} (weight=${roundScore(component.weight)})`
      );

    return {
      score:
        roundScore(
          clamp01(
            score
          )
        ),

      components,

      reasons,
    };
  }

  // ==========================================================================
  // HISTORICAL EFFECTIVENESS
  // ==========================================================================

  calculateHistoricalScore(
    candidate
  ) {
    const explicit =
      clamp01OrNull(
        candidate
          ?.historicalEffectiveness
          ?.score
      );

    if (
      explicit !==
      null
    ) {
      return explicit;
    }

    const successes =
      Number(
        candidate
          ?.historicalEffectiveness
          ?.successfulExecutions ||
        0
      );

    const failures =
      Number(
        candidate
          ?.historicalEffectiveness
          ?.failedExecutions ||
        0
      );

    const total =
      successes +
      failures;

    if (
      total <=
      0
    ) {
      return null;
    }

    /*
     * Bayesian-style smoothing.
     *
     * Prevents:
     *
     * 1 success / 0 failures => 1.0 certainty
     *
     * We use one prior success + one prior failure.
     */

    return clamp01(
      (
        successes +
        1
      ) /
      (
        total +
        2
      )
    );
  }

  // ==========================================================================
  // REVERSIBILITY
  // ==========================================================================

  calculateReversibilityScore(
    candidate
  ) {
    const rollback =
      candidate
        ?.rollback ||
      {};

    switch (
      rollback
        .reversibility
    ) {
      case REVERSIBILITY
        .FULL:
        return 1;

      case REVERSIBILITY
        .PARTIAL:
        return 0.6;

      case REVERSIBILITY
        .NONE:
        return 0;

      case REVERSIBILITY
        .UNKNOWN:
      default:
        /*
         * Not evaluated yet.
         */
        return null;
    }
  }

  // ==========================================================================
  // POLICY
  // ==========================================================================

  calculatePolicyScore(
    candidate
  ) {
    switch (
      candidate
        ?.policy
        ?.status
    ) {
      case POLICY_STATUS
        .ELIGIBLE:
        return 1;

      case POLICY_STATUS
        .REQUIRES_APPROVAL:
        return 0.65;

      case POLICY_STATUS
        .BLOCKED:
        return 0;

      case POLICY_STATUS
        .UNKNOWN:
      default:
        return null;
    }
  }

  // ==========================================================================
  // ACTION RISK
  // ==========================================================================

  calculateActionRiskScore(
    candidate
  ) {
    const risk =
      candidate
        ?.actionRisk ||
      {};

    const explicit =
      clamp01OrNull(
        risk.score
      );

    /*
     * Candidate actionRisk.score represents operational RISK,
     * where 1 = highest risk.
     *
     * Ranking wants SAFETY desirability:
     *
     * safety = 1 - risk
     */

    if (
      explicit !==
      null
    ) {
      return 1 -
        explicit;
    }

    switch (
      risk.level
    ) {
      case ACTION_RISK
        .LOW:
        return 0.9;

      case ACTION_RISK
        .MEDIUM:
        return 0.65;

      case ACTION_RISK
        .HIGH:
        return 0.3;

      case ACTION_RISK
        .CRITICAL:
        return 0;

      default:
        return null;
    }
  }

  // ==========================================================================
  // APPROVAL
  // ==========================================================================

  calculateApprovalScore(
    candidate
  ) {
    const approval =
      candidate
        ?.approval ||
      {};

    if (
      approval.required ===
      false &&
      (
        approval.mode ===
          APPROVAL_MODE
            .NONE ||
        !approval.mode
      )
    ) {
      return 1;
    }

    switch (
      approval.mode
    ) {
      case APPROVAL_MODE
        .NONE:
        return 1;

      case APPROVAL_MODE
        .HUMAN:
        return 0.7;

      case APPROVAL_MODE
        .MULTI_PARTY:
        return 0.4;

      case APPROVAL_MODE
        .MANUAL_ONLY:
        return 0.15;

      default:
        return null;
    }
  }

  // ==========================================================================
  // COMPONENT HELPER
  // ==========================================================================

  pushComponent(
    target,
    name,
    value,
    weight
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return;
    }

    if (
      weight <=
      0
    ) {
      return;
    }

    target.push({
      name,

      value:
        clamp01(
          value
        ),

      weight,
    });
  }

  // ==========================================================================
  // WEIGHTS
  // ==========================================================================

  normalizeWeights(
    input
  ) {
    const output =
      {};

    for (
      const key
      of Object.keys(
        DEFAULT_WEIGHTS
      )
    ) {
      const value =
        Number(
          input[key]
        );

      output[key] =
        Number.isFinite(
          value
        ) &&
        value >=
          0
          ? value
          : DEFAULT_WEIGHTS[
              key
            ];
    }

    const total =
      Object
        .values(
          output
        )
        .reduce(
          (
            sum,
            value
          ) =>
            sum +
            value,
          0
        );

    if (
      total <=
      0
    ) {
      return {
        ...DEFAULT_WEIGHTS,
      };
    }

    /*
     * Normalize to 1.0.
     */

    for (
      const key
      of Object.keys(
        output
      )
    ) {
      output[key] =
        output[key] /
        total;
    }

    return output;
  }

  // ==========================================================================
  // INPUT VALIDATION
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
          "Recovery ranking input is required"
        ),
        {
          code:
            "RECOVERY_RANKING_INPUT_REQUIRED",
        }
      );
    }

    if (
      !Array.isArray(
        input.candidates
      )
    ) {
      throw Object.assign(
        new Error(
          "Recovery ranking requires candidates"
        ),
        {
          code:
            "RECOVERY_RANKING_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery ranking cannot receive execution authorization"
        ),
        {
          code:
            "RECOVERY_RANKING_UNSAFE_INPUT",
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

function clamp01OrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  return clamp01(
    number
  );
}

function roundScore(
  value
) {
  return Math.round(
    Number(
      value
    ) *
    10000
  ) /
    10000;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new RecoveryCandidateRankingService();

module.exports
  .RecoveryCandidateRankingService =
  RecoveryCandidateRankingService;

module.exports
  .DEFAULT_WEIGHTS =
  DEFAULT_WEIGHTS;