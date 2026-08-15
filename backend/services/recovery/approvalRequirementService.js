"use strict";

/**
 * AIRA Approval Requirement Service
 *
 * Phase 7.8
 *
 * Centralizes approval decisions for recovery candidates.
 *
 * Inputs considered:
 *
 * - policy result
 * - action risk
 * - production environment
 * - service criticality
 * - destructive actions
 * - rollback availability
 * - reversibility
 * - action tier
 * - explicit organization requirements
 *
 * DOES NOT:
 *
 * - approve itself
 * - execute playbooks
 * - bypass policy
 * - authorize execution
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  APPROVAL_MODE,
  POLICY_STATUS,
  ACTION_RISK,
  REVERSIBILITY,
} =
  require(
    "./recoveryDecisionContracts"
  );

class ApprovalRequirementService {
  constructor(
    options = {}
  ) {
    this.highRiskThreshold =
      clamp01(
        options.highRiskThreshold ??
        0.65
      );

    this.multiPartyRiskThreshold =
      clamp01(
        options.multiPartyRiskThreshold ??
        0.85
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async resolveCandidates(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const resolved =
      [];

    for (
      const candidate
      of input.candidates
    ) {
      resolved.push(
        await this.resolveCandidate({
          candidate,
          context:
            input.context ||
            {},
          diagnosis:
            input.diagnosis ||
            {},
          dependencies,
        })
      );
    }

    const automatic =
      resolved.filter(
        (
          candidate
        ) =>
          candidate
            .approval
            .required ===
          false
      );

    const approvalRequired =
      resolved.filter(
        (
          candidate
        ) =>
          candidate
            .approval
            .required ===
          true
      );

    const human =
      approvalRequired.filter(
        (
          candidate
        ) =>
          candidate
            .approval
            .mode ===
          APPROVAL_MODE
            .HUMAN
      );

    const multiParty =
      approvalRequired.filter(
        (
          candidate
        ) =>
          candidate
            .approval
            .mode ===
          APPROVAL_MODE
            .MULTI_PARTY
      );

    const manualOnly =
      approvalRequired.filter(
        (
          candidate
        ) =>
          candidate
            .approval
            .mode ===
          APPROVAL_MODE
            .MANUAL_ONLY
      );

    return {
      candidates:
        resolved,

      automaticCandidates:
        automatic,

      approvalRequiredCandidates:
        approvalRequired,

      humanApprovalCandidates:
        human,

      multiPartyApprovalCandidates:
        multiParty,

      manualOnlyCandidates:
        manualOnly,

      automaticCount:
        automatic.length,

      approvalRequiredCount:
        approvalRequired.length,

      resolutionVersion:
        "phase7.8-v1",

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SINGLE CANDIDATE
  // ==========================================================================

  async resolveCandidate({
    candidate,
    context,
    diagnosis,
    dependencies,
  }) {
    const reasons =
      [];

    let required =
      false;

    let mode =
      APPROVAL_MODE
        .NONE;

    // ------------------------------------------------------------------------
    // 1. POLICY
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.policy
        ?.status ===
      POLICY_STATUS
        .BLOCKED
    ) {
      return createRecoveryCandidate({
        ...candidate,

        status:
          CANDIDATE_STATUS
            .POLICY_BLOCKED,

        approval: {
          required:
            false,

          mode:
            APPROVAL_MODE
              .NONE,

          reasons: [
            "Candidate is policy-blocked and cannot proceed to approval.",
          ],
        },

        executionAuthorized:
          false,
      });
    }

    if (
      candidate
        ?.policy
        ?.status ===
      POLICY_STATUS
        .REQUIRES_APPROVAL
    ) {
      required =
        true;

      mode =
        APPROVAL_MODE
          .HUMAN;

      reasons.push(
        "Policy requires human approval."
      );
    }

    // ------------------------------------------------------------------------
    // 2. ACTION RISK
    // ------------------------------------------------------------------------

    const riskScore =
      clamp01(
        candidate
          ?.actionRisk
          ?.score
      );

    if (
      riskScore >=
      this.multiPartyRiskThreshold
    ) {
      required =
        true;

      mode =
        APPROVAL_MODE
          .MULTI_PARTY;

      reasons.push(
        `Action risk ${riskScore} requires multi-party approval.`
      );
    } else if (
      riskScore >=
      this.highRiskThreshold
    ) {
      required =
        true;

      mode =
        maxApprovalMode(
          mode,
          APPROVAL_MODE
            .HUMAN
        );

      reasons.push(
        `Action risk ${riskScore} requires approval.`
      );
    }

    // ------------------------------------------------------------------------
    // 3. CRITICAL ACTION RISK LEVEL
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.actionRisk
        ?.level ===
      ACTION_RISK
        .CRITICAL
    ) {
      required =
        true;

      mode =
        APPROVAL_MODE
          .MULTI_PARTY;

      reasons.push(
        "Critical action-risk level requires multi-party approval."
      );
    }

    // ------------------------------------------------------------------------
    // 4. DESTRUCTIVE ACTIONS
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.metadata
        ?.destructive ===
      true
    ) {
      required =
        true;

      mode =
        maxApprovalMode(
          mode,
          APPROVAL_MODE
            .MULTI_PARTY
        );

      reasons.push(
        "Destructive recovery action requires multi-party approval."
      );
    }

    // ------------------------------------------------------------------------
    // 5. PRODUCTION ENVIRONMENT
    // ------------------------------------------------------------------------

    const environment =
      normalizeText(
        context.environment ||
        context.environmentName ||
        context
          .incident
          ?.environment
      );

    if (
      environment ===
      "production"
    ) {
      if (
        candidate
          ?.metadata
          ?.productionApprovalRequired ===
        true
      ) {
        required =
          true;

        mode =
          maxApprovalMode(
            mode,
            APPROVAL_MODE
              .HUMAN
          );

        reasons.push(
          "Production environment requires approval."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 6. SERVICE CRITICALITY
    // ------------------------------------------------------------------------

    const criticality =
      normalizeText(
        context
          .service
          ?.criticality ||
        diagnosis
          ?.risk
          ?.criticality
      );

    if (
      criticality ===
      "critical"
    ) {
      const candidateRisk =
        clamp01(
          candidate
            ?.actionRisk
            ?.score
        );

      if (
        candidateRisk >=
        0.5
      ) {
        required =
          true;

        mode =
          maxApprovalMode(
            mode,
            APPROVAL_MODE
              .HUMAN
          );

        reasons.push(
          "Recovery affects a critical service."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 7. ROLLBACK / REVERSIBILITY
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.rollback
        ?.reversibility ===
      REVERSIBILITY
        .NONE
    ) {
      required =
        true;

      mode =
        APPROVAL_MODE
          .MULTI_PARTY;

      reasons.push(
        "Irreversible recovery action requires multi-party approval."
      );
    }

    if (
      candidate
        ?.rollback
        ?.reversibility ===
        REVERSIBILITY
          .UNKNOWN ||
      (
        candidate
          ?.rollback
          ?.available ===
        false &&
        riskScore >=
        0.5
      )
    ) {
      required =
        true;

      mode =
        maxApprovalMode(
          mode,
          APPROVAL_MODE
            .HUMAN
        );

      reasons.push(
        "Rollback capability is insufficiently verified."
      );
    }

    // ------------------------------------------------------------------------
    // 8. ACTION TIER
    // ------------------------------------------------------------------------

    const actionTier =
      normalizeText(
        candidate
          ?.metadata
          ?.actionTier
      );

    switch (
      actionTier
    ) {
      case "tier1":
        break;

      case "tier2":
        required =
          true;

        mode =
          maxApprovalMode(
            mode,
            APPROVAL_MODE
              .HUMAN
          );

        reasons.push(
          "Tier 2 action requires human approval."
        );

        break;

      case "tier3":
        required =
          true;

        mode =
          maxApprovalMode(
            mode,
            APPROVAL_MODE
              .MULTI_PARTY
          );

        reasons.push(
          "Tier 3 action requires multi-party approval."
        );

        break;

      case "tier4":
      case "manual_only":
        required =
          true;

        mode =
          APPROVAL_MODE
            .MANUAL_ONLY;

        reasons.push(
          "Action tier requires manual-only handling."
        );

        break;

      default:
        break;
    }

    // ------------------------------------------------------------------------
    // 9. ORGANIZATION APPROVAL RULES
    // ------------------------------------------------------------------------

    if (
      typeof dependencies
        .approvalPolicyEvaluator ===
      "function"
    ) {
      const external =
        await dependencies
          .approvalPolicyEvaluator({
            candidate,
            context,
            diagnosis,
          });

      if (
        external
          ?.required ===
        true
      ) {
        required =
          true;

        mode =
          maxApprovalMode(
            mode,
            normalizeApprovalMode(
              external.mode
            )
          );

        reasons.push(
          ...normalizeArray(
            external.reasons
          )
        );
      }

      if (
        external
          ?.manualOnly ===
        true
      ) {
        required =
          true;

        mode =
          APPROVAL_MODE
            .MANUAL_ONLY;

        reasons.push(
          "Organization approval policy requires manual-only handling."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 10. EXPLICIT MANUAL OVERRIDE
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.metadata
        ?.manualOnly ===
      true
    ) {
      required =
        true;

      mode =
        APPROVAL_MODE
          .MANUAL_ONLY;

      reasons.push(
        "Candidate explicitly requires manual handling."
      );
    }

    // ------------------------------------------------------------------------
    // FINAL STATUS
    // ------------------------------------------------------------------------

    let status =
      candidate.status;

    if (
      required &&
      status ===
      CANDIDATE_STATUS
        .APPLICABLE
    ) {
      status =
        CANDIDATE_STATUS
          .APPROVAL_REQUIRED;
    }

    if (
      !required &&
      status ===
      CANDIDATE_STATUS
        .APPROVAL_REQUIRED
    ) {
      status =
        CANDIDATE_STATUS
          .APPLICABLE;
    }

    return createRecoveryCandidate({
      ...candidate,

      status,

      approval: {
        required,

        mode:
          required
            ? mode
            : APPROVAL_MODE
                .NONE,

        reasons:
          uniqueStrings([
            ...normalizeArray(
              candidate
                ?.approval
                ?.reasons
            ),

            ...reasons,
          ]),
      },

      metadata: {
        ...(
          candidate.metadata ||
          {}
        ),

        approvalResolutionVersion:
          "phase7.8-v1",
      },

      executionAuthorized:
        false,
    });
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
          "Approval resolution input is required"
        ),
        {
          code:
            "APPROVAL_RESOLUTION_INPUT_REQUIRED",
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
          "Approval resolution requires candidates"
        ),
        {
          code:
            "APPROVAL_RESOLUTION_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Approval resolution cannot receive execution authorization"
        ),
        {
          code:
            "APPROVAL_RESOLUTION_UNSAFE_INPUT",
        }
      );
    }
  }
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

function normalizeText(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();

  return normalized ||
    null;
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

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
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

function normalizeApprovalMode(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    Object.values(
      APPROVAL_MODE
    )
      .includes(
        normalized
      )
  ) {
    return normalized;
  }

  return APPROVAL_MODE
    .HUMAN;
}

function approvalModeRank(
  mode
) {
  switch (
    mode
  ) {
    case APPROVAL_MODE
      .NONE:
      return 0;

    case APPROVAL_MODE
      .HUMAN:
      return 1;

    case APPROVAL_MODE
      .MULTI_PARTY:
      return 2;

    case APPROVAL_MODE
      .MANUAL_ONLY:
      return 3;

    default:
      return 0;
  }
}

function maxApprovalMode(
  first,
  second
) {
  return approvalModeRank(
    first
  ) >=
    approvalModeRank(
      second
    )
    ? first
    : second;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ApprovalRequirementService();

module.exports
  .ApprovalRequirementService =
  ApprovalRequirementService;