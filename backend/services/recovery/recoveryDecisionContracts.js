"use strict";

/**
 * AIRA Recovery Decision Contracts
 *
 * Phase 7.1
 *
 * Canonical contracts shared by:
 *
 * - playbook discovery
 * - applicability evaluation
 * - candidate ranking
 * - risk analysis
 * - rollback evaluation
 * - policy evaluation
 * - approval resolution
 * - recovery decision engine
 *
 * SAFETY:
 *
 * These contracts describe decisions only.
 * They never authorize execution.
 */

// ============================================================================
// RECOVERY DECISION
// ============================================================================

const RECOVERY_DECISION =
  Object.freeze({
    RECOMMEND_PLAYBOOK:
      "RECOMMEND_PLAYBOOK",

    REQUIRE_APPROVAL:
      "REQUIRE_APPROVAL",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",

    MONITOR_ONLY:
      "MONITOR_ONLY",

    NO_SAFE_ACTION:
      "NO_SAFE_ACTION",

    REJECTED:
      "REJECTED",
  });

// ============================================================================
// CANDIDATE STATUS
// ============================================================================

const CANDIDATE_STATUS =
  Object.freeze({
    DISCOVERED:
      "DISCOVERED",

    APPLICABLE:
      "APPLICABLE",

    INAPPLICABLE:
      "INAPPLICABLE",

    POLICY_BLOCKED:
      "POLICY_BLOCKED",

    PRECONDITION_FAILED:
      "PRECONDITION_FAILED",

    RISK_BLOCKED:
      "RISK_BLOCKED",

    APPROVAL_REQUIRED:
      "APPROVAL_REQUIRED",

    RECOMMENDED:
      "RECOMMENDED",

    REJECTED:
      "REJECTED",
  });

// ============================================================================
// ACTION RISK
// ============================================================================

const ACTION_RISK =
  Object.freeze({
    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    CRITICAL:
      "CRITICAL",
  });

// ============================================================================
// REVERSIBILITY
// ============================================================================

const REVERSIBILITY =
  Object.freeze({
    FULL:
      "FULL",

    PARTIAL:
      "PARTIAL",

    NONE:
      "NONE",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// APPROVAL MODE
// ============================================================================

const APPROVAL_MODE =
  Object.freeze({
    NONE:
      "NONE",

    HUMAN:
      "HUMAN",

    MULTI_PARTY:
      "MULTI_PARTY",

    MANUAL_ONLY:
      "MANUAL_ONLY",
  });

// ============================================================================
// POLICY STATUS
// ============================================================================

const POLICY_STATUS =
  Object.freeze({
    ELIGIBLE:
      "ELIGIBLE",

    BLOCKED:
      "BLOCKED",

    REQUIRES_APPROVAL:
      "REQUIRES_APPROVAL",

    UNKNOWN:
      "UNKNOWN",
  });

// ============================================================================
// CREATE CANDIDATE
// ============================================================================

function createRecoveryCandidate(
  input = {}
) {
  if (
    !input.playbookId
  ) {
    throw Object.assign(
      new Error(
        "Recovery candidate requires playbookId"
      ),
      {
        code:
          "RECOVERY_CANDIDATE_PLAYBOOK_REQUIRED",
      }
    );
  }

  return {
    candidateId:
      input.candidateId ||
      `candidate:${String(input.playbookId)}`,

    playbookId:
      String(
        input.playbookId
      ),

    playbookVersion:
      input.playbookVersion ||
      null,

    title:
      input.title ||
      null,

    description:
      input.description ||
      null,

    category:
      input.category ||
      null,

    status:
      normalizeEnum(
        input.status,
        CANDIDATE_STATUS,
        CANDIDATE_STATUS
          .DISCOVERED
      ),

    // ------------------------------------------------------------------------
    // DIAGNOSIS MATCH
    // ------------------------------------------------------------------------

    diagnosisMatch: {
      score:
        clamp01(
          input
            .diagnosisMatch
            ?.score ??
          input
            .diagnosisMatchScore
        ),

      reasons:
        normalizeArray(
          input
            .diagnosisMatch
            ?.reasons ||
          input
            .diagnosisMatchReasons
        ),
    },

    // ------------------------------------------------------------------------
    // APPLICABILITY
    // ------------------------------------------------------------------------

    applicability: {
      applicable:
        input
          .applicability
          ?.applicable ??
        null,

      score:
        clamp01OrNull(
          input
            .applicability
            ?.score
        ),

      reasons:
        normalizeArray(
          input
            .applicability
            ?.reasons
        ),

      failedPreconditions:
        normalizeArray(
          input
            .applicability
            ?.failedPreconditions
        ),
    },

    // ------------------------------------------------------------------------
    // POLICY
    // ------------------------------------------------------------------------

    policy: {
      status:
        normalizeEnum(
          input
            .policy
            ?.status,
          POLICY_STATUS,
          POLICY_STATUS
            .UNKNOWN
        ),

      policyIds:
        normalizeArray(
          input
            .policy
            ?.policyIds
        ),

      reasons:
        normalizeArray(
          input
            .policy
            ?.reasons
        ),
    },

    // ------------------------------------------------------------------------
    // ACTION RISK
    // ------------------------------------------------------------------------

    actionRisk: {
  level:
    normalizeEnum(
      input
        .actionRisk
        ?.level,
      ACTION_RISK,
      ACTION_RISK
        .MEDIUM
    ),

  score:
    clamp01(
      input
        .actionRisk
        ?.score
    ),

  reasons:
    normalizeArray(
      input
        .actionRisk
        ?.reasons
    ),

  dimensions:
    normalizeArray(
      input
        .actionRisk
        ?.dimensions
    )
      .map(
        (
          dimension
        ) => ({
          name:
            dimension
              ?.name ||
            null,

          value:
            clamp01(
              dimension
                ?.value
            ),

          weight:
            clamp01(
              dimension
                ?.weight
            ),
        })
      )
      .filter(
        (
          dimension
        ) =>
          Boolean(
            dimension.name
          )
      ),
},

    // ------------------------------------------------------------------------
    // ROLLBACK
    // ------------------------------------------------------------------------

    rollback: {
      available:
        input
          .rollback
          ?.available ??
        false,

      reversibility:
        normalizeEnum(
          input
            .rollback
            ?.reversibility,
          REVERSIBILITY,
          REVERSIBILITY
            .UNKNOWN
        ),

      rollbackPlaybookId:
        input
          .rollback
          ?.rollbackPlaybookId ||
        null,

      reasons:
        normalizeArray(
          input
            .rollback
            ?.reasons
        ),
    },

    // ------------------------------------------------------------------------
    // APPROVAL
    // ------------------------------------------------------------------------

    approval: {
      required:
        Boolean(
          input
            .approval
            ?.required
        ),

      mode:
        normalizeEnum(
          input
            .approval
            ?.mode,
          APPROVAL_MODE,
          APPROVAL_MODE
            .NONE
        ),

      reasons:
        normalizeArray(
          input
            .approval
            ?.reasons
        ),
    },

    // ------------------------------------------------------------------------
    // HISTORICAL EFFECTIVENESS
    // ------------------------------------------------------------------------

    historicalEffectiveness: {
      score:
        clamp01OrNull(
          input
            .historicalEffectiveness
            ?.score
        ),

      successfulExecutions:
        Math.max(
          0,
          Number(
            input
              .historicalEffectiveness
              ?.successfulExecutions ||
            0
          )
        ),

      failedExecutions:
        Math.max(
          0,
          Number(
            input
              .historicalEffectiveness
              ?.failedExecutions ||
            0
          )
        ),
    },

    // ------------------------------------------------------------------------
    // FINAL RANKING
    // ------------------------------------------------------------------------

    ranking: {
      score:
        clamp01OrNull(
          input
            .ranking
            ?.score
        ),

      rank:
        Number.isFinite(
          Number(
            input
              .ranking
              ?.rank
          )
        )
          ? Number(
              input
                .ranking
                .rank
            )
          : null,

      reasons:
        normalizeArray(
          input
            .ranking
            ?.reasons
        ),
    },

    metadata:
      input.metadata ||
      {},

    /*
     * Candidate discovery or ranking can NEVER authorize execution.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// CREATE RECOVERY DECISION
// ============================================================================

function createRecoveryDecision(
  input = {}
) {
  const candidates =
    normalizeArray(
      input.candidates
    );

  return {
    decisionId:
      input.decisionId ||
      null,

    incidentId:
      input.incidentId
        ? String(
            input.incidentId
          )
        : null,

    diagnosisId:
      input.diagnosisId
        ? String(
            input.diagnosisId
          )
        : null,

    diagnosisRevision:
      input.diagnosisRevision ??
      null,

    decision:
      normalizeEnum(
        input.decision,
        RECOVERY_DECISION,
        RECOVERY_DECISION
          .NO_SAFE_ACTION
      ),

    selectedCandidateId:
      input.selectedCandidateId ||
      null,

    selectedPlaybookId:
      input.selectedPlaybookId ||
      null,

    confidence:
      clamp01(
        input.confidence
      ),

    candidates,

    rejectedCandidates:
      normalizeArray(
        input.rejectedCandidates
      ),

    reasons:
      normalizeArray(
        input.reasons
      ),

    unknowns:
      normalizeArray(
        input.unknowns
      ),

    policyStatus:
      normalizeEnum(
        input.policyStatus,
        POLICY_STATUS,
        POLICY_STATUS
          .UNKNOWN
      ),

    riskLevel:
      normalizeEnum(
        input.riskLevel,
        ACTION_RISK,
        ACTION_RISK
          .MEDIUM
      ),

    approvalRequired:
      Boolean(
        input.approvalRequired
      ),

    approvalMode:
      normalizeEnum(
        input.approvalMode,
        APPROVAL_MODE,
        APPROVAL_MODE
          .NONE
      ),

    rollbackAvailable:
      Boolean(
        input.rollbackAvailable
      ),

    reversibility:
      normalizeEnum(
        input.reversibility,
        REVERSIBILITY,
        REVERSIBILITY
          .UNKNOWN
      ),

    generatedAt:
      input.generatedAt ||
      new Date(),

    metadata:
      input.metadata ||
      {},

    /*
     * Phase 7 does not execute.
     */
    executionAuthorized:
      false,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateRecoveryCandidate(
  candidate
) {
  const errors =
    [];

  if (
    !candidate
      ?.playbookId
  ) {
    errors.push(
      "playbookId is required"
    );
  }

  if (
    !Object.values(
      CANDIDATE_STATUS
    )
      .includes(
        candidate
          ?.status
      )
  ) {
    errors.push(
      "invalid candidate status"
    );
  }

  if (
    candidate
      ?.executionAuthorized ===
    true
  ) {
    errors.push(
      "recovery candidate cannot authorize execution"
    );
  }

  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}

function validateRecoveryDecision(
  decision
) {
  const errors =
    [];

  if (
    !Object.values(
      RECOVERY_DECISION
    )
      .includes(
        decision
          ?.decision
      )
  ) {
    errors.push(
      "invalid recovery decision"
    );
  }

  if (
    decision
      ?.executionAuthorized ===
    true
  ) {
    errors.push(
      "recovery decision cannot authorize execution"
    );
  }

  if (
    decision
      ?.decision ===
      RECOVERY_DECISION
        .RECOMMEND_PLAYBOOK &&
    !decision
      ?.selectedPlaybookId
  ) {
    errors.push(
      "RECOMMEND_PLAYBOOK requires selectedPlaybookId"
    );
  }

  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

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
    value === null ||
    value === undefined ||
    value === ""
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

function normalizeEnum(
  value,
  enumObject,
  fallback
) {
  if (
    Object.values(
      enumObject
    )
      .includes(
        value
      )
  ) {
    return value;
  }

  return fallback;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  RECOVERY_DECISION,
  CANDIDATE_STATUS,
  ACTION_RISK,
  REVERSIBILITY,
  APPROVAL_MODE,
  POLICY_STATUS,

  createRecoveryCandidate,
  createRecoveryDecision,

  validateRecoveryCandidate,
  validateRecoveryDecision,
};