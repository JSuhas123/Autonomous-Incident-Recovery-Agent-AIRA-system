"use strict";

/**
 * Phase 18.16
 *
 * Deterministic candidate ranking.
 *
 * Retrieval finds candidates.
 * Ranking orders candidates.
 * Neither operation authorizes execution.
 */
class KnowledgeRetrievalRankingEngine {
  rank({
    candidates = [],
    hypothesis = null,
    evidenceAssessment = null,
    availableCapabilities = [],
    historicalEffectiveness = {},
    resourceContext = null,
  } = {}) {
    const available =
      new Set(
        Array.isArray(
          availableCapabilities
        )
          ? availableCapabilities
          : []
      );

    const ranked =
      (Array.isArray(candidates)
        ? candidates
        : []
      ).map(
        (candidate) =>
          this._score({
            candidate,
            hypothesis,
            evidenceAssessment,
            available,
            historicalEffectiveness,
            resourceContext,
          })
      );

    ranked.sort(
      (a, b) =>
        b.score -
          a.score ||
        String(
          a.playbookId
        ).localeCompare(
          String(
            b.playbookId
          )
        )
    );

    return {
      candidates:
        ranked,

      bestCandidate:
        ranked.find(
          (candidate) =>
            candidate.eligible
        ) || null,

      executionAuthorized:
        false,
    };
  }

  _score({
    candidate,
    hypothesis,
    evidenceAssessment,
    available,
    historicalEffectiveness,
    resourceContext,
  }) {
    const playbookId =
      candidate.playbookId ||
      candidate.id ||
      candidate.playbookKey ||
      null;

    const requiredCapabilities =
      normalizeArray(
        candidate.requiredCapabilities ||
        candidate.capabilities?.required
      );

    const missingCapabilities =
      requiredCapabilities.filter(
        (capability) =>
          !available.has(
            capability
          )
      );

    const capabilityScore =
      requiredCapabilities.length === 0
        ? 1
        : (
            requiredCapabilities.length -
            missingCapabilities.length
          ) /
          requiredCapabilities.length;

    const hypothesisScore =
      this._hypothesisScore(
        candidate,
        hypothesis
      );

    const evidenceScore =
      clamp(
        evidenceAssessment
          ?.confidence ?? 0
      );

    const historical =
      historicalEffectiveness[
        playbookId
      ] || null;

    const historicalScore =
      clamp(
        historical
          ?.effectivenessScore ?? 0
      );

    const reversibilityScore =
      rollbackScore(
        candidate
      );

    const structuralScore =
      resourceScore(
        candidate,
        resourceContext
      );

    const riskScore =
      inverseRiskScore(
        candidate
      );

    /**
     * Keeps the existing AIRA philosophy:
     *
     * diagnosis/evidence/applicability dominate.
     * Historical success is supportive, not authoritative.
     */
    const score =
      clamp(
        hypothesisScore * 0.30 +
        evidenceScore * 0.25 +
        capabilityScore * 0.15 +
        historicalScore * 0.10 +
        reversibilityScore * 0.08 +
        structuralScore * 0.07 +
        riskScore * 0.05
      );

    const evidenceComplete =
      evidenceAssessment
        ?.complete !== false;

    const eligible =
      missingCapabilities.length === 0 &&
      evidenceComplete &&
      candidate.disabled !== true &&
      candidate.lifecycle !==
        "DISABLED" &&
      candidate.lifecycle !==
        "DEPRECATED";

    const blockReasons = [];

    if (
      missingCapabilities.length
    ) {
      blockReasons.push(
        "MISSING_CAPABILITY"
      );
    }

    if (!evidenceComplete) {
      blockReasons.push(
        "MISSING_REQUIRED_EVIDENCE"
      );
    }

    if (
      candidate.disabled === true ||
      candidate.lifecycle ===
        "DISABLED"
    ) {
      blockReasons.push(
        "PLAYBOOK_DISABLED"
      );
    }

    if (
      candidate.lifecycle ===
      "DEPRECATED"
    ) {
      blockReasons.push(
        "PLAYBOOK_DEPRECATED"
      );
    }

    return {
      playbookId,

      score,

      eligible,

      blockReasons,

      components: {
        hypothesisScore,
        evidenceScore,
        capabilityScore,
        historicalScore,
        reversibilityScore,
        structuralScore,
        riskScore,
      },

      missingCapabilities,

      executionAuthorized:
        false,
    };
  }

  _hypothesisScore(
    candidate,
    hypothesis
  ) {
    if (!hypothesis) {
      return 0;
    }

    const references =
      normalizeArray(
        hypothesis
          .recommendedPlaybooks
      );

    const candidateId =
      candidate.playbookId ||
      candidate.id ||
      candidate.playbookKey;

    const explicitlyRecommended =
      references.some(
        (reference) =>
          reference ===
            candidateId ||
          reference.playbookId ===
            candidateId ||
          reference.id ===
            candidateId
      );

    if (explicitlyRecommended) {
      return clamp(
        hypothesis.confidence ??
        1
      );
    }

    return clamp(
      (
        hypothesis.confidence ??
        0
      ) * 0.5
    );
  }
}

function rollbackScore(
  candidate
) {
  const rollback =
    candidate.rollback;

  if (!rollback) {
    return 0;
  }

  if (
    rollback.available === false ||
    rollback.strategy === "NONE"
  ) {
    return 0;
  }

  return 1;
}

function resourceScore(
  candidate,
  resourceContext
) {
  if (!resourceContext) {
    return 0;
  }

  const expected =
    normalizeArray(
      candidate.resourceTypes ||
      candidate.applicableResourceTypes
    );

  if (!expected.length) {
    return 0.5;
  }

  const actual =
    resourceContext.resourceType ||
    resourceContext.resource
      ?.resourceType ||
    resourceContext.resource
      ?.type;

  return expected.includes(
    actual
  )
    ? 1
    : 0;
}

function inverseRiskScore(
  candidate
) {
  const risk =
    String(
      candidate.risk?.level ||
      candidate.riskLevel ||
      "MEDIUM"
    ).toUpperCase();

  return {
    LOW: 1,
    MEDIUM: 0.75,
    HIGH: 0.40,
    CRITICAL: 0.10,
  }[risk] ?? 0.5;
}

function normalizeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function clamp(
  value
) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}

module.exports =
  KnowledgeRetrievalRankingEngine;