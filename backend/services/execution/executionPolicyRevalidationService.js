"use strict";

/**
 * AIRA Execution Policy Revalidation Service
 *
 * Phase 8.4
 *
 * Revalidates policy immediately before execution authorization.
 *
 * Checks:
 *
 * - current organization policy
 * - environment restrictions
 * - protected service restrictions
 * - destructive action restrictions
 * - maintenance-window policy
 * - action-tier policy
 * - explicit deny rules
 * - policy revision drift
 *
 * DOES NOT:
 *
 * - authorize execution
 * - execute playbooks
 * - approve requests
 */

const {
  EXECUTION_POLICY_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionPolicyRevalidationService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async validate(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const reasons =
      [];

    const warnings =
      [];

    const policyIds =
      [];

    let state =
      EXECUTION_POLICY_STATE
        .ALLOWED;

    // ========================================================================
    // 1. RECOVERY DECISION POLICY STATE
    // ========================================================================

    const recoveryPolicyStatus =
      normalizeText(
        input
          ?.recoveryDecision
          ?.policyStatus
      );

    if (
      recoveryPolicyStatus ===
      "blocked"
    ) {
      reasons.push(
        "Recovery decision is policy-blocked."
      );

      state =
        EXECUTION_POLICY_STATE
          .DENIED;
    }

    // ========================================================================
    // 2. EXPLICIT EXECUTION DENY
    // ========================================================================

    if (
      input
        ?.selectedCandidate
        ?.metadata
        ?.executionDenied ===
      true
    ) {
      reasons.push(
        "Selected recovery candidate explicitly denies execution."
      );

      state =
        EXECUTION_POLICY_STATE
          .DENIED;
    }

    // ========================================================================
    // 3. ENVIRONMENT RESTRICTIONS
    // ========================================================================

    const environment =
      normalizeText(
        input.environment ||
        input.context
          ?.environment ||
        input.context
          ?.environmentName
      );

    const deniedEnvironments =
      normalizeStrings(
        input
          ?.selectedCandidate
          ?.metadata
          ?.deniedEnvironments
      );

    if (
      environment &&
      deniedEnvironments.includes(
        environment
      )
    ) {
      reasons.push(
        `Execution is denied in environment ${environment}.`
      );

      state =
        EXECUTION_POLICY_STATE
          .DENIED;
    }

    // ========================================================================
    // 4. PRODUCTION RESTRICTIONS
    // ========================================================================

    if (
      environment ===
        "production"
    ) {
      if (
        input
          ?.selectedCandidate
          ?.metadata
          ?.productionAllowed ===
        false
      ) {
        reasons.push(
          "Selected action is not allowed in production."
        );

        state =
          EXECUTION_POLICY_STATE
            .DENIED;
      }

      if (
        input
          ?.selectedCandidate
          ?.metadata
          ?.productionApprovalRequired ===
        true &&
        input.approvalSatisfied !==
        true
      ) {
        reasons.push(
          "Production execution requires approval."
        );

        state =
          EXECUTION_POLICY_STATE
            .REQUIRES_APPROVAL;
      }
    }

    // ========================================================================
    // 5. DESTRUCTIVE ACTION
    // ========================================================================

    if (
      input
        ?.selectedCandidate
        ?.metadata
        ?.destructive ===
      true
    ) {
      if (
        input
          ?.selectedCandidate
          ?.metadata
          ?.allowDestructive !==
        true
      ) {
        reasons.push(
          "Destructive action is denied by execution policy."
        );

        state =
          EXECUTION_POLICY_STATE
            .DENIED;
      } else if (
        input.approvalSatisfied !==
        true
      ) {
        reasons.push(
          "Destructive execution requires valid approval."
        );

        state =
          EXECUTION_POLICY_STATE
            .REQUIRES_APPROVAL;
      }
    }

    // ========================================================================
    // 6. ACTION TIER
    // ========================================================================

    const actionTier =
      normalizeText(
        input
          ?.selectedCandidate
          ?.metadata
          ?.actionTier
      );

    if (
      [
        "tier4",
        "manual_only",
      ].includes(
        actionTier
      )
    ) {
      reasons.push(
        `Action tier ${actionTier} cannot be executed automatically.`
      );

      state =
        EXECUTION_POLICY_STATE
          .DENIED;
    }

    if (
      [
        "tier2",
        "tier3",
      ].includes(
        actionTier
      ) &&
      input.approvalSatisfied !==
        true
    ) {
      reasons.push(
        `Action tier ${actionTier} requires approval.`
      );

      if (
        state !==
        EXECUTION_POLICY_STATE
          .DENIED
      ) {
        state =
          EXECUTION_POLICY_STATE
            .REQUIRES_APPROVAL;
      }
    }

    // ========================================================================
    // 7. PROTECTED SERVICE
    // ========================================================================

    if (
      input
        ?.context
        ?.service
        ?.protected ===
      true
    ) {
      if (
        input.approvalSatisfied !==
        true
      ) {
        reasons.push(
          "Protected service requires approval before execution."
        );

        if (
          state !==
          EXECUTION_POLICY_STATE
            .DENIED
        ) {
          state =
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL;
        }
      }
    }

    // ========================================================================
    // 8. CURRENT POLICY ENGINE
    // ========================================================================

    if (
      typeof dependencies
        .evaluatePolicy ===
      "function"
    ) {
      const result =
        await dependencies
          .evaluatePolicy({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            recoveryDecisionId:
              input.recoveryDecisionId,

            selectedCandidateId:
              input.selectedCandidateId,

            selectedPlaybookId:
              input.selectedPlaybookId,

            selectedCandidate:
              input.selectedCandidate,

            context:
              input.context,

            approvalSatisfied:
              input.approvalSatisfied ===
              true,
          });

      policyIds.push(
        ...normalizeArray(
          result
            ?.policyIds
        )
      );

      reasons.push(
        ...normalizeArray(
          result
            ?.reasons
        )
      );

      warnings.push(
        ...normalizeArray(
          result
            ?.warnings
        )
      );

      if (
        result
          ?.allowed ===
        false ||
        result
          ?.denied ===
        true
      ) {
        state =
          EXECUTION_POLICY_STATE
            .DENIED;
      } else if (
        result
          ?.requiresApproval ===
        true &&
        input.approvalSatisfied !==
          true
      ) {
        if (
          state !==
          EXECUTION_POLICY_STATE
            .DENIED
        ) {
          state =
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL;
        }
      }
    }

    // ========================================================================
    // 9. MAINTENANCE WINDOW
    // ========================================================================

    if (
      input
        ?.selectedCandidate
        ?.metadata
        ?.maintenanceWindowRequired ===
      true
    ) {
      if (
        typeof dependencies
          .validateMaintenanceWindow !==
        "function"
      ) {
        warnings.push(
          "Maintenance window is required but could not be verified."
        );

        if (
          state !==
          EXECUTION_POLICY_STATE
            .DENIED
        ) {
          state =
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL;
        }
      } else {
        const maintenance =
          await dependencies
            .validateMaintenanceWindow({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              candidate:
                input.selectedCandidate,

              context:
                input.context,
            });

        if (
          maintenance
            ?.allowed !==
          true
        ) {
          if (
            maintenance
              ?.requiresApproval ===
            true &&
            input.approvalSatisfied !==
              true
          ) {
            reasons.push(
              maintenance.reason ||
              "Execution is outside the maintenance window and requires approval."
            );

            if (
              state !==
              EXECUTION_POLICY_STATE
                .DENIED
            ) {
              state =
                EXECUTION_POLICY_STATE
                  .REQUIRES_APPROVAL;
            }
          } else {
            reasons.push(
              maintenance
                ?.reason ||
              "Execution is outside the allowed maintenance window."
            );

            state =
              EXECUTION_POLICY_STATE
                .DENIED;
          }
        }
      }
    }

    // ========================================================================
    // 10. POLICY REVISION DRIFT
    // ========================================================================

    if (
      typeof dependencies
        .getCurrentPolicyRevision ===
      "function" &&
      input.policyRevision !==
        undefined &&
      input.policyRevision !==
        null
    ) {
      const currentRevision =
        await dependencies
          .getCurrentPolicyRevision({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,
          });

      if (
        currentRevision !==
          undefined &&
        currentRevision !==
          null &&
        String(
          currentRevision
        ) !==
        String(
          input.policyRevision
        )
      ) {
        warnings.push(
          "Policy revision changed since recovery evaluation."
        );

        if (
          typeof dependencies
            .evaluatePolicy !==
          "function"
        ) {
          state =
            EXECUTION_POLICY_STATE
              .UNKNOWN;

          reasons.push(
            "Policy changed and could not be revalidated."
          );
        }
      }
    }

    // ========================================================================
    // FINAL
    // ========================================================================

    return {
      state,

      allowed:
        state ===
        EXECUTION_POLICY_STATE
          .ALLOWED,

      denied:
        state ===
        EXECUTION_POLICY_STATE
          .DENIED,

      requiresApproval:
        state ===
        EXECUTION_POLICY_STATE
          .REQUIRES_APPROVAL,

      policyIds:
        uniqueStrings(
          policyIds
        ),

      reasons:
        uniqueStrings(
          reasons
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      checkedAt:
        new Date(),

      executionAuthorized:
        false,

      policyRevalidationVersion:
        "phase8.4-v1",
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
          "Execution policy revalidation input is required"
        ),
        {
          code:
            "EXECUTION_POLICY_INPUT_REQUIRED",
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
          "Execution policy revalidation requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_POLICY_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution policy revalidation requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_POLICY_RECOVERY_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.selectedPlaybookId
    ) {
      throw Object.assign(
        new Error(
          "Execution policy revalidation requires selectedPlaybookId"
        ),
        {
          code:
            "EXECUTION_POLICY_PLAYBOOK_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution policy revalidation cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_POLICY_UNSAFE_INPUT",
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
    return "";
  }

  return String(
    value
  )
    .trim()
    .toLowerCase();
}

function normalizeStrings(
  value
) {
  return [
    ...new Set(
      normalizeArray(
        value
      )
        .filter(
          Boolean
        )
        .map(
          (
            item
          ) =>
            normalizeText(
              item
            )
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

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionPolicyRevalidationService();

module.exports
  .ExecutionPolicyRevalidationService =
  ExecutionPolicyRevalidationService;