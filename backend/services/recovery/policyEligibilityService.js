"use strict";

/**
 * AIRA Policy Eligibility Service
 *
 * Phase 7.7
 *
 * Evaluates recovery candidates against policy constraints.
 *
 * Responsibilities:
 *
 * - evaluate explicit deny rules
 * - evaluate environment restrictions
 * - evaluate risk thresholds
 * - evaluate destructive-action restrictions
 * - evaluate action-tier restrictions
 * - evaluate maintenance-window restrictions
 * - determine whether approval is required by policy
 *
 * DOES NOT:
 *
 * - approve execution
 * - execute playbooks
 * - bypass policy engine
 * - mutate infrastructure
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  POLICY_STATUS,
  APPROVAL_MODE,
} =
  require(
    "./recoveryDecisionContracts"
  );

class PolicyEligibilityService {
  constructor(
    options = {}
  ) {
    this.defaultMaxRiskScore =
      clamp01(
        options.defaultMaxRiskScore ??
        0.8
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async evaluateCandidates(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const evaluated =
      [];

    for (
      const candidate
      of input.candidates
    ) {
      evaluated.push(
        await this.evaluateCandidate({
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

    const eligible =
      evaluated.filter(
        (
          candidate
        ) =>
          candidate
            .policy
            .status ===
          POLICY_STATUS
            .ELIGIBLE
      );

    const approvalRequired =
      evaluated.filter(
        (
          candidate
        ) =>
          candidate
            .policy
            .status ===
          POLICY_STATUS
            .REQUIRES_APPROVAL
      );

    const blocked =
      evaluated.filter(
        (
          candidate
        ) =>
          candidate
            .policy
            .status ===
          POLICY_STATUS
            .BLOCKED
      );

    return {
      candidates:
        evaluated,

      eligibleCandidates:
        eligible,

      approvalRequiredCandidates:
        approvalRequired,

      blockedCandidates:
        blocked,

      eligibleCount:
        eligible.length,

      approvalRequiredCount:
        approvalRequired.length,

      blockedCount:
        blocked.length,

      evaluationVersion:
        "phase7.7-v1",

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SINGLE CANDIDATE
  // ==========================================================================

  async evaluateCandidate({
    candidate,
    context,
    diagnosis,
    dependencies,
  }) {
    const reasons =
      [];

    const policyIds =
      [];

    let blocked =
      false;

    let requiresApproval =
      false;

    // ------------------------------------------------------------------------
    // 1. EXTERNAL POLICY ENGINE
    // ------------------------------------------------------------------------

    if (
      typeof dependencies
        .policyEvaluator ===
      "function"
    ) {
      const external =
        await dependencies
          .policyEvaluator({
            candidate,
            context,
            diagnosis,
          });

      if (
        external
          ?.blocked ===
        true
      ) {
        blocked =
          true;
      }

      if (
        external
          ?.requiresApproval ===
        true
      ) {
        requiresApproval =
          true;
      }

      reasons.push(
        ...normalizeArray(
          external?.reasons
        )
      );

      policyIds.push(
        ...normalizeArray(
          external?.policyIds
        )
      );
    }

    // ------------------------------------------------------------------------
    // 2. EXPLICIT DENY
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.metadata
        ?.policyDenied ===
      true
    ) {
      blocked =
        true;

      reasons.push(
        "Candidate is explicitly denied by policy metadata."
      );
    }

    // ------------------------------------------------------------------------
    // 3. ENVIRONMENT RESTRICTIONS
    // ------------------------------------------------------------------------

    const environment =
      normalizeText(
        context.environment ||
        context.environmentName ||
        context
          .incident
          ?.environment
      );

    const deniedEnvironments =
      normalizeStrings(
        candidate
          ?.metadata
          ?.deniedEnvironments
      );

    if (
      environment &&
      deniedEnvironments.includes(
        environment
      )
    ) {
      blocked =
        true;

      reasons.push(
        `Recovery action is denied in environment ${environment}.`
      );
    }

    const approvalEnvironments =
      normalizeStrings(
        candidate
          ?.metadata
          ?.approvalRequiredEnvironments
      );

    if (
      environment &&
      approvalEnvironments.includes(
        environment
      )
    ) {
      requiresApproval =
        true;

      reasons.push(
        `Environment ${environment} requires approval.`
      );
    }

    // ------------------------------------------------------------------------
    // 4. ACTION RISK LIMIT
    // ------------------------------------------------------------------------

    const actionRiskScore =
      clamp01(
        candidate
          ?.actionRisk
          ?.score
      );

    const maxRiskScore =
      clamp01(
        candidate
          ?.metadata
          ?.maxAllowedRiskScore ??
        this.defaultMaxRiskScore
      );

    if (
      actionRiskScore >
      maxRiskScore
    ) {
      blocked =
        true;

      reasons.push(
        `Action risk ${actionRiskScore} exceeds policy maximum ${maxRiskScore}.`
      );
    }

    // ------------------------------------------------------------------------
    // 5. DESTRUCTIVE ACTION POLICY
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.metadata
        ?.destructive ===
      true
    ) {
      if (
        candidate
          ?.metadata
          ?.allowDestructive !==
        true
      ) {
        blocked =
          true;

        reasons.push(
          "Destructive action is not permitted by policy."
        );
      } else {
        requiresApproval =
          true;

        reasons.push(
          "Destructive action is permitted only with approval."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 6. ACTION TIER
    // ------------------------------------------------------------------------

    const actionTier =
      normalizeText(
        candidate
          ?.metadata
          ?.actionTier
      );

    if (
      [
        "tier3",
        "tier4",
        "critical",
      ].includes(
        actionTier
      )
    ) {
      requiresApproval =
        true;

      reasons.push(
        `Action tier ${actionTier} requires approval.`
      );
    }

    if (
      candidate
        ?.metadata
        ?.blockedActionTier ===
      true
    ) {
      blocked =
        true;

      reasons.push(
        "Action tier is blocked by policy."
      );
    }

    // ------------------------------------------------------------------------
    // 7. PRODUCTION GUARD
    // ------------------------------------------------------------------------

    if (
      environment ===
        "production" &&
      candidate
        ?.metadata
        ?.productionAllowed ===
        false
    ) {
      blocked =
        true;

      reasons.push(
        "Playbook is not permitted in production."
      );
    }

    if (
      environment ===
        "production" &&
      candidate
        ?.metadata
        ?.productionApprovalRequired ===
        true
    ) {
      requiresApproval =
        true;

      reasons.push(
        "Production execution requires approval."
      );
    }

    // ------------------------------------------------------------------------
    // 8. MAINTENANCE WINDOW
    // ------------------------------------------------------------------------

    const maintenance =
      await this.evaluateMaintenanceWindow(
        candidate,
        context,
        dependencies
      );

    if (
      maintenance.blocked
    ) {
      blocked =
        true;
    }

    if (
      maintenance.requiresApproval
    ) {
      requiresApproval =
        true;
    }

    reasons.push(
      ...maintenance.reasons
    );

    // ------------------------------------------------------------------------
    // FINAL STATUS
    // ------------------------------------------------------------------------

    let policyStatus =
      POLICY_STATUS
        .ELIGIBLE;

    let candidateStatus =
      candidate.status;

    if (
      blocked
    ) {
      policyStatus =
        POLICY_STATUS
          .BLOCKED;

      candidateStatus =
        CANDIDATE_STATUS
          .POLICY_BLOCKED;
    } else if (
      requiresApproval
    ) {
      policyStatus =
        POLICY_STATUS
          .REQUIRES_APPROVAL;

      candidateStatus =
        CANDIDATE_STATUS
          .APPROVAL_REQUIRED;
    }

    return createRecoveryCandidate({
      ...candidate,

      status:
        candidateStatus,

      policy: {
        status:
          policyStatus,

        policyIds:
          uniqueStrings(
            policyIds
          ),

        reasons:
          uniqueStrings(
            reasons
          ),
      },

      approval: {
        ...(
          candidate.approval ||
          {}
        ),

        required:
          requiresApproval,

        mode:
          requiresApproval
            ? (
                candidate
                  ?.approval
                  ?.mode &&
                candidate
                  .approval
                  .mode !==
                  APPROVAL_MODE
                    .NONE
                  ? candidate
                      .approval
                      .mode
                  : APPROVAL_MODE
                      .HUMAN
              )
            : (
                candidate
                  ?.approval
                  ?.mode ||
                APPROVAL_MODE
                  .NONE
              ),

        reasons:
          uniqueStrings([
            ...normalizeArray(
              candidate
                ?.approval
                ?.reasons
            ),

            ...(
              requiresApproval
                ? reasons
                : []
            ),
          ]),
      },

      metadata: {
        ...(
          candidate.metadata ||
          {}
        ),

        policyEvaluationVersion:
          "phase7.7-v1",
      },

      executionAuthorized:
        false,
    });
  }

  // ==========================================================================
  // MAINTENANCE WINDOW
  // ==========================================================================

  async evaluateMaintenanceWindow(
    candidate,
    context,
    dependencies
  ) {
    if (
      candidate
        ?.metadata
        ?.maintenanceWindowRequired !==
      true
    ) {
      return {
        blocked:
          false,

        requiresApproval:
          false,

        reasons:
          [],
      };
    }

    if (
      typeof dependencies
        .maintenanceWindowEvaluator !==
      "function"
    ) {
      return {
        blocked:
          false,

        requiresApproval:
          true,

        reasons: [
          "Maintenance window is required but could not be verified automatically.",
        ],
      };
    }

    const result =
      await dependencies
        .maintenanceWindowEvaluator({
          candidate,
          context,
        });

    if (
      result
        ?.allowed ===
      true
    ) {
      return {
        blocked:
          false,

        requiresApproval:
          false,

        reasons: [
          result.reason ||
          "Current time is inside an approved maintenance window.",
        ],
      };
    }

    if (
      result
        ?.requiresApproval ===
      true
    ) {
      return {
        blocked:
          false,

        requiresApproval:
          true,

        reasons: [
          result.reason ||
          "Outside maintenance window; approval is required.",
        ],
      };
    }

    return {
      blocked:
        true,

      requiresApproval:
        false,

      reasons: [
        result
          ?.reason ||
        "Current time is outside the permitted maintenance window.",
      ],
    };
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
          "Policy eligibility input is required"
        ),
        {
          code:
            "POLICY_ELIGIBILITY_INPUT_REQUIRED",
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
          "Policy eligibility requires candidates"
        ),
        {
          code:
            "POLICY_ELIGIBILITY_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Policy eligibility cannot receive execution authorization"
        ),
        {
          code:
            "POLICY_ELIGIBILITY_UNSAFE_INPUT",
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

function normalizeStrings(
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
          (
            value
          ) =>
            String(
              value
            )
              .trim()
              .toLowerCase()
        )
    ),
  ];
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
  new PolicyEligibilityService();

module.exports
  .PolicyEligibilityService =
  PolicyEligibilityService;