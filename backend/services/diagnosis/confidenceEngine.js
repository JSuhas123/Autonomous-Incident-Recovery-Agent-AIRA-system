"use strict";

/**
 * AIRA Diagnosis Confidence Engine
 *
 * Phase 6.11
 *
 * Deterministic trust aggregation for diagnosis.
 *
 * This engine is deliberately NOT an LLM.
 *
 * It combines:
 *
 * - evidence completeness
 * - symptom confidence
 * - topology confidence
 * - change confidence
 * - historical confidence
 * - root cause confidence
 * - verification confidence
 * - critic verdict
 * - competing hypotheses
 * - contradictions
 * - missing evidence
 *
 * The purpose is to answer:
 *
 * "How much should AIRA trust this diagnosis?"
 *
 * Important:
 *
 * diagnosis confidence != incident risk
 *
 * High-risk incident + low diagnosis confidence is valid.
 * Low-risk incident + high diagnosis confidence is valid.
 */

const VERIFICATION_STATUS =
  Object.freeze({
    VERIFIED:
      "VERIFIED",

    DOWNGRADED:
      "DOWNGRADED",

    REJECTED:
      "REJECTED",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });

const CONFIDENCE_BAND =
  Object.freeze({
    VERY_LOW:
      "VERY_LOW",

    LOW:
      "LOW",

    MODERATE:
      "MODERATE",

    HIGH:
      "HIGH",

    VERY_HIGH:
      "VERY_HIGH",
  });

const DIAGNOSIS_DECISION =
  Object.freeze({
    TRUSTED:
      "TRUSTED",

    PROVISIONAL:
      "PROVISIONAL",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",

    REJECTED:
      "REJECTED",
  });

class ConfidenceEngine {
  evaluate(
    input = {}
  ) {
    const normalized =
      this.normalizeInput(
        input
      );

    const base =
      this.calculateBaseConfidence(
        normalized
      );

    const adjustments =
      this.calculateAdjustments(
        normalized
      );

    const finalConfidence =
  Number(
    clamp01(
      base.baseConfidence +
      adjustments.totalAdjustment
    )
      .toFixed(
        4
      )
  );

    const band =
      confidenceToBand(
        finalConfidence
      );

    const decision =
      this.determineDecision(
        normalized,
        finalConfidence
      );

    return {
      confidence:
        finalConfidence,

      band,

      decision,

      components:
        base.components,

      baseConfidence:
        base.baseConfidence,

      adjustments:
        adjustments.adjustments,

      totalAdjustment:
        adjustments.totalAdjustment,

      diagnostics: {
        verificationStatus:
          normalized
            .verificationStatus,

        hypothesisCount:
          normalized
            .hypotheses
            .length,

        contradictionCount:
          normalized
            .contradictionCount,

        missingEvidenceCount:
          normalized
            .missingEvidenceCount,

        competingHypotheses:
          normalized
            .competingHypotheses,

        acceptedHypothesisId:
          normalized
            .acceptedHypothesisId,
      },

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizeInput(
    input
  ) {
    const rootCause =
      input
        .rootCauseAnalysis ||
      {};

    const verification =
      input
        .verification ||
      {};

    const hypotheses =
      normalizeArray(
        rootCause
          .hypotheses ||
        input.hypotheses
      );

    const primary =
      rootCause
        .primaryHypothesis ||
      hypotheses[0] ||
      null;

    return {
      evidenceCompleteness:
        clamp01(
          input
            .evidenceCompleteness ??
          input
            .evidence
            ?.completeness ??
          0
        ),

      symptomConfidence:
        clamp01OrNull(
          input
            .symptomConfidence ??
          input
            .symptomAnalysis
            ?.symptomConfidence
        ),

      topologyConfidence:
        clamp01OrNull(
          input
            .topologyConfidence ??
          input
            .topologyAnalysis
            ?.topologyConfidence
        ),

      changeConfidence:
        clamp01OrNull(
          input
            .changeConfidence ??
          input
            .changeAnalysis
            ?.changeConfidence
        ),

      historicalConfidence:
        clamp01OrNull(
          input
            .historicalConfidence ??
          input
            .historicalAnalysis
            ?.historyConfidence
        ),

      rootCauseConfidence:
        clamp01(
          input
            .rootCauseConfidence ??
          rootCause
            .diagnosisConfidence ??
          primary
            ?.confidence ??
          0
        ),

      verificationConfidence:
        clamp01(
          input
            .verificationConfidence ??
          verification
            .verificationConfidence ??
          0
        ),

      verificationStatus:
        verification
          .verificationStatus ||
        input
          .verificationStatus ||
        VERIFICATION_STATUS
          .INCONCLUSIVE,

      hypotheses,

      primaryHypothesis:
        primary,

      acceptedHypothesisId:
        verification
          .acceptedHypothesisId ||
        input
          .acceptedHypothesisId ||
        null,

      contradictionCount:
        countContradictions(
          input,
          verification,
          hypotheses
        ),

      missingEvidenceCount:
        normalizeArray(
          input
            .missingEvidence ||
          input
            .evidence
            ?.missingEvidence
        )
          .length,

      competingHypotheses:
        this.detectCompetingHypotheses(
          hypotheses
        ),

      falsePositiveSuspected:
        Boolean(
          input
            .falsePositiveSuspected
        ),

      agentFailures:
        Number(
          input
            .agentFailures ||
          0
        ),

      agentPartials:
        Number(
          input
            .agentPartials ||
          0
        ),
    };
  }

  // ==========================================================================
  // BASE CONFIDENCE
  // ==========================================================================

  calculateBaseConfidence(
    input
  ) {
    const weighted =
      [];

    pushWeighted(
      weighted,
      "evidenceCompleteness",
      input
        .evidenceCompleteness,
      0.25
    );

    pushWeighted(
      weighted,
      "symptomConfidence",
      input
        .symptomConfidence,
      0.1
    );

    pushWeighted(
      weighted,
      "topologyConfidence",
      input
        .topologyConfidence,
      0.1
    );

    pushWeighted(
      weighted,
      "changeConfidence",
      input
        .changeConfidence,
      0.05
    );

    pushWeighted(
      weighted,
      "historicalConfidence",
      input
        .historicalConfidence,
      0.05
    );

    pushWeighted(
      weighted,
      "rootCauseConfidence",
      input
        .rootCauseConfidence,
      0.25
    );

    pushWeighted(
      weighted,
      "verificationConfidence",
      input
        .verificationConfidence,
      0.2
    );

    const totalWeight =
      weighted.reduce(
        (
          sum,
          item
        ) =>
          sum +
          item.weight,
        0
      );

    const weightedScore =
      weighted.reduce(
        (
          sum,
          item
        ) =>
          sum +
          item.value *
            item.weight,
        0
      );

    const baseConfidence =
      totalWeight >
        0
        ? weightedScore /
          totalWeight
        : 0;

    return {
      baseConfidence:
        Number(
          baseConfidence
            .toFixed(
              4
            )
        ),

      components:
        weighted,
    };
  }

  // ==========================================================================
  // ADJUSTMENTS
  // ==========================================================================

  calculateAdjustments(
    input
  ) {
    const adjustments =
      [];

    // ------------------------------------------------------------------------
    // Verification verdict
    // ------------------------------------------------------------------------

    switch (
      input
        .verificationStatus
    ) {
      case VERIFICATION_STATUS
        .VERIFIED:
        adjustments.push({
          reason:
            "critic_verified",

          value:
            0.08,
        });

        break;

      case VERIFICATION_STATUS
        .DOWNGRADED:
        adjustments.push({
          reason:
            "critic_downgraded",

          value:
            -0.12,
        });

        break;

      case VERIFICATION_STATUS
        .REJECTED:
        adjustments.push({
          reason:
            "critic_rejected",

          value:
            -0.6,
        });

        break;

      case VERIFICATION_STATUS
        .INCONCLUSIVE:
      default:
        adjustments.push({
          reason:
            "critic_inconclusive",

          value:
            -0.15,
        });
    }

    // ------------------------------------------------------------------------
    // Missing evidence
    // ------------------------------------------------------------------------

    if (
      input
        .missingEvidenceCount >
      0
    ) {
      adjustments.push({
        reason:
          "missing_evidence",

        value:
          -Math.min(
            0.2,
            input
              .missingEvidenceCount *
              0.03
          ),
      });
    }

    // ------------------------------------------------------------------------
    // Contradictions
    // ------------------------------------------------------------------------

    if (
      input
        .contradictionCount >
      0
    ) {
      adjustments.push({
        reason:
          "contradictory_evidence",

        value:
          -Math.min(
            0.3,
            input
              .contradictionCount *
              0.06
          ),
      });
    }

    // ------------------------------------------------------------------------
    // Multiple close hypotheses
    // ------------------------------------------------------------------------

    if (
      input
        .competingHypotheses
    ) {
      adjustments.push({
        reason:
          "competing_hypotheses",

        value:
          -0.12,
      });
    }

    // ------------------------------------------------------------------------
    // No hypotheses
    // ------------------------------------------------------------------------

    if (
      input
        .hypotheses
        .length ===
      0
    ) {
      adjustments.push({
        reason:
          "no_root_cause_hypothesis",

        value:
          -0.35,
      });
    }

    // ------------------------------------------------------------------------
    // Accepted hypothesis missing
    // ------------------------------------------------------------------------

    if (
      input
        .verificationStatus ===
        VERIFICATION_STATUS
          .VERIFIED &&
      !input
        .acceptedHypothesisId
    ) {
      adjustments.push({
        reason:
          "verified_without_accepted_hypothesis",

        value:
          -0.1,
      });
    }

    // ------------------------------------------------------------------------
    // False positive
    // ------------------------------------------------------------------------

    if (
      input
        .falsePositiveSuspected
    ) {
      adjustments.push({
        reason:
          "false_positive_suspected",

        value:
          -0.25,
      });
    }

    // ------------------------------------------------------------------------
    // Agent failures
    // ------------------------------------------------------------------------

    if (
      input.agentFailures >
      0
    ) {
      adjustments.push({
        reason:
          "agent_failures",

        value:
          -Math.min(
            0.3,
            input.agentFailures *
              0.1
          ),
      });
    }

    if (
      input.agentPartials >
      0
    ) {
      adjustments.push({
        reason:
          "partial_agent_results",

        value:
          -Math.min(
            0.15,
            input.agentPartials *
              0.05
          ),
      });
    }

    // ------------------------------------------------------------------------
    // Very poor evidence floor
    // ------------------------------------------------------------------------

    if (
      input
        .evidenceCompleteness <
      0.2
    ) {
      adjustments.push({
        reason:
          "evidence_critically_incomplete",

        value:
          -0.2,
      });
    }

    // ------------------------------------------------------------------------
    // Strong verified diagnosis bonus
    // ------------------------------------------------------------------------

    if (
      input
        .verificationStatus ===
        VERIFICATION_STATUS
          .VERIFIED &&
      input
        .evidenceCompleteness >=
        0.8 &&
      input
        .rootCauseConfidence >=
        0.8 &&
      input
        .verificationConfidence >=
        0.75 &&
      input
        .contradictionCount ===
        0 &&
      !input
        .competingHypotheses
    ) {
      adjustments.push({
        reason:
          "strong_verified_convergence",

        value:
          0.05,
      });
    }

    const totalAdjustment =
      Number(
        adjustments
          .reduce(
            (
              total,
              item
            ) =>
              total +
              item.value,
            0
          )
          .toFixed(
            4
          )
      );

    return {
      adjustments,

      totalAdjustment,
    };
  }

  // ==========================================================================
  // COMPETING HYPOTHESES
  // ==========================================================================

  detectCompetingHypotheses(
    hypotheses
  ) {
    if (
      hypotheses.length <
      2
    ) {
      return false;
    }

    const sorted =
      [
        ...hypotheses,
      ]
        .sort(
          (
            first,
            second
          ) =>
            (
              second
                .confidence ||
              0
            ) -
            (
              first
                .confidence ||
              0
            )
        );

    const first =
      clamp01(
        sorted[0]
          ?.confidence ||
        0
      );

    const second =
      clamp01(
        sorted[1]
          ?.confidence ||
        0
      );

    return (
      second >=
        0.4 &&
      Math.abs(
        first -
        second
      ) <
        0.12
    );
  }

  // ==========================================================================
  // DECISION
  // ==========================================================================

  determineDecision(
    input,
    confidence
  ) {
    if (
      input
        .verificationStatus ===
      VERIFICATION_STATUS
        .REJECTED
    ) {
      return DIAGNOSIS_DECISION
        .REJECTED;
    }

    if (
      input
        .falsePositiveSuspected
    ) {
      return DIAGNOSIS_DECISION
        .MANUAL_REVIEW;
    }

    if (
      input
        .evidenceCompleteness <
      0.25
    ) {
      return DIAGNOSIS_DECISION
        .COLLECT_MORE_EVIDENCE;
    }

    if (
      input
        .verificationStatus ===
        VERIFICATION_STATUS
          .INCONCLUSIVE
    ) {
      return confidence >=
        0.6
        ? DIAGNOSIS_DECISION
            .PROVISIONAL
        : DIAGNOSIS_DECISION
            .COLLECT_MORE_EVIDENCE;
    }

    if (
      input
        .competingHypotheses
    ) {
      return DIAGNOSIS_DECISION
        .PROVISIONAL;
    }

    if (
      confidence >=
        0.8 &&
      input
        .verificationStatus ===
        VERIFICATION_STATUS
          .VERIFIED
    ) {
      return DIAGNOSIS_DECISION
        .TRUSTED;
    }

    if (
      confidence >=
      0.55
    ) {
      return DIAGNOSIS_DECISION
        .PROVISIONAL;
    }

    return DIAGNOSIS_DECISION
      .COLLECT_MORE_EVIDENCE;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function pushWeighted(
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

  target.push({
    name,

    value:
      clamp01(
        value
      ),

    weight,
  });
}

function countContradictions(
  input,
  verification,
  hypotheses
) {
  const direct =
    normalizeArray(
      input
        .contradictions
    )
      .length;

  const verificationCount =
    normalizeArray(
      verification
        .contradictions
    )
      .length;

  const reviewCount =
    normalizeArray(
      verification
        .hypothesisReviews
    )
      .reduce(
        (
          total,
          review
        ) =>
          total +
          normalizeArray(
            review
              .validContradictingEvidence
          )
            .length,
        0
      );

  const hypothesisCount =
    normalizeArray(
      hypotheses
    )
      .reduce(
        (
          total,
          hypothesis
        ) =>
          total +
          normalizeArray(
            hypothesis
              .evidenceAgainst
          )
            .length +
          normalizeArray(
            hypothesis
              .contradictions
          )
            .length,
        0
      );

  return (
    direct +
    verificationCount +
    reviewCount +
    hypothesisCount
  );
}

function confidenceToBand(
  confidence
) {
  if (
    confidence >=
    0.9
  ) {
    return CONFIDENCE_BAND
      .VERY_HIGH;
  }

  if (
    confidence >=
    0.75
  ) {
    return CONFIDENCE_BAND
      .HIGH;
  }

  if (
    confidence >=
    0.5
  ) {
    return CONFIDENCE_BAND
      .MODERATE;
  }

  if (
    confidence >=
    0.25
  ) {
    return CONFIDENCE_BAND
      .LOW;
  }

  return CONFIDENCE_BAND
    .VERY_LOW;
}

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

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

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ConfidenceEngine();

module.exports
  .ConfidenceEngine =
  ConfidenceEngine;

module.exports
  .VERIFICATION_STATUS =
  VERIFICATION_STATUS;

module.exports
  .CONFIDENCE_BAND =
  CONFIDENCE_BAND;

module.exports
  .DIAGNOSIS_DECISION =
  DIAGNOSIS_DECISION;