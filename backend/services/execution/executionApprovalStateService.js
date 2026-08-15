"use strict";

/**
 * AIRA Execution Approval State Service
 *
 * Phase 8.3
 *
 * Resolves the real approval state for an execution authorization request.
 *
 * Checks:
 *
 * - whether approval is required
 * - tenant/environment scope
 * - approval decision linkage
 * - approval status
 * - expiration
 * - approval subject identity
 * - optional approver authorization
 *
 * DOES NOT:
 *
 * - grant execution authorization
 * - execute playbooks
 * - create approvals
 */

const {
  EXECUTION_APPROVAL_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionApprovalStateService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async resolve(
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

    // ========================================================================
    // 1. APPROVAL NOT REQUIRED
    // ========================================================================

    if (
      input.approvalRequired !==
      true
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .NOT_REQUIRED,

        satisfied:
          true,

        approval:
          null,

        reasons: [
          "Recovery decision does not require approval.",
        ],

        warnings:
          [],

        checkedAt:
          this.resolveNow(
            dependencies
          ),

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    // ========================================================================
    // 2. APPROVAL REPOSITORY REQUIRED
    // ========================================================================

    if (
      typeof dependencies
        .getApproval !==
      "function"
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .PENDING,

        satisfied:
          false,

        approval:
          null,

        reasons: [
          "Approval is required but approval state could not be resolved.",
        ],

        warnings:
          [],

        checkedAt:
          this.resolveNow(
            dependencies
          ),

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    // ========================================================================
    // 3. LOAD APPROVAL
    // ========================================================================

    const approval =
      await dependencies
        .getApproval({
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

          candidateId:
            input.selectedCandidateId,

          playbookId:
            input.selectedPlaybookId,
        });

    if (
      !approval
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .PENDING,

        satisfied:
          false,

        approval:
          null,

        reasons: [
          "Required approval does not exist.",
        ],

        warnings:
          [],

        checkedAt:
          this.resolveNow(
            dependencies
          ),

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    // ========================================================================
    // 4. SCOPE VALIDATION
    // ========================================================================

    if (
      approval.organizationId &&
      String(
        approval.organizationId
      ) !==
      String(
        input.organizationId
      )
    ) {
      reasons.push(
        "Approval belongs to a different organization."
      );
    }

    if (
      approval.environmentId &&
      String(
        approval.environmentId
      ) !==
      String(
        input.environmentId
      )
    ) {
      reasons.push(
        "Approval belongs to a different environment."
      );
    }

    if (
      approval.incidentId &&
      String(
        approval.incidentId
      ) !==
      String(
        input.incidentId
      )
    ) {
      reasons.push(
        "Approval belongs to a different incident."
      );
    }

    // ========================================================================
    // 5. RECOVERY DECISION LINKAGE
    // ========================================================================

    const approvalDecisionId =
      approval.recoveryDecisionId ||
      approval.decisionId ||
      null;

    if (
      approvalDecisionId &&
      String(
        approvalDecisionId
      ) !==
      String(
        input.recoveryDecisionId
      )
    ) {
      reasons.push(
        "Approval references a different recovery decision."
      );
    }

    if (
      approval.recoveryDecisionRevision !==
        undefined &&
      approval.recoveryDecisionRevision !==
        null &&
      input.recoveryDecisionRevision !==
        undefined &&
      input.recoveryDecisionRevision !==
        null &&
      Number(
        approval.recoveryDecisionRevision
      ) !==
      Number(
        input.recoveryDecisionRevision
      )
    ) {
      reasons.push(
        "Approval references a stale recovery decision revision."
      );
    }

    // ========================================================================
    // 6. CANDIDATE / PLAYBOOK LINKAGE
    // ========================================================================

    if (
      approval.candidateId &&
      input.selectedCandidateId &&
      String(
        approval.candidateId
      ) !==
      String(
        input.selectedCandidateId
      )
    ) {
      reasons.push(
        "Approval references a different recovery candidate."
      );
    }

    if (
      approval.playbookId &&
      input.selectedPlaybookId &&
      String(
        approval.playbookId
      ) !==
      String(
        input.selectedPlaybookId
      )
    ) {
      reasons.push(
        "Approval references a different playbook."
      );
    }

    // ========================================================================
    // 7. HARD LINKAGE FAILURE
    // ========================================================================

    if (
      reasons.length >
      0
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .REJECTED,

        satisfied:
          false,

        approval:
          this.sanitizeApproval(
            approval
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
          this.resolveNow(
            dependencies
          ),

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    // ========================================================================
    // 8. EXPIRATION
    // ========================================================================

    const now =
      this.resolveNow(
        dependencies
      );

    if (
      approval.expiresAt
    ) {
      const expiresAt =
        new Date(
          approval.expiresAt
        );

      if (
        Number.isNaN(
          expiresAt.getTime()
        )
      ) {
        warnings.push(
          "Approval expiration timestamp is invalid."
        );
      } else if (
        expiresAt.getTime() <=
        now.getTime()
      ) {
        return {
          state:
            EXECUTION_APPROVAL_STATE
              .EXPIRED,

          satisfied:
            false,

          approval:
            this.sanitizeApproval(
              approval
            ),

          reasons: [
            "Approval has expired.",
          ],

          warnings:
            uniqueStrings(
              warnings
            ),

          checkedAt:
            now,

          executionAuthorized:
            false,

          approvalStateVersion:
            "phase8.3-v1",
        };
      }
    }

    // ========================================================================
    // 9. APPROVAL STATUS
    // ========================================================================

    const status =
      normalizeText(
        approval.status ||
        approval.state ||
        approval.decision
      );

    if (
      [
        "approved",
        "approve",
        "accepted",
      ].includes(
        status
      )
    ) {
      // ----------------------------------------------------------------------
      // OPTIONAL APPROVER VALIDATION
      // ----------------------------------------------------------------------

      if (
        typeof dependencies
          .validateApprover ===
        "function"
      ) {
        const approverResult =
          await dependencies
            .validateApprover({
              approval,

              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,
            });

        if (
          approverResult
            ?.valid ===
          false
        ) {
          return {
            state:
              EXECUTION_APPROVAL_STATE
                .REJECTED,

            satisfied:
              false,

            approval:
              this.sanitizeApproval(
                approval
              ),

            reasons:
              uniqueStrings(
                approverResult
                  ?.reasons ||
                [
                  "Approver is not authorized for this recovery action.",
                ]
              ),

            warnings:
              uniqueStrings(
                approverResult
                  ?.warnings ||
                []
              ),

            checkedAt:
              now,

            executionAuthorized:
              false,

            approvalStateVersion:
              "phase8.3-v1",
          };
        }
      }

      return {
        state:
          EXECUTION_APPROVAL_STATE
            .APPROVED,

        satisfied:
          true,

        approval:
          this.sanitizeApproval(
            approval
          ),

        reasons: [
          "Required approval is valid and approved.",
        ],

        warnings:
          uniqueStrings(
            warnings
          ),

        checkedAt:
          now,

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    if (
      [
        "rejected",
        "reject",
        "denied",
      ].includes(
        status
      )
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .REJECTED,

        satisfied:
          false,

        approval:
          this.sanitizeApproval(
            approval
          ),

        reasons: [
          "Recovery approval was rejected.",
        ],

        warnings:
          uniqueStrings(
            warnings
          ),

        checkedAt:
          now,

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    if (
      [
        "expired",
      ].includes(
        status
      )
    ) {
      return {
        state:
          EXECUTION_APPROVAL_STATE
            .EXPIRED,

        satisfied:
          false,

        approval:
          this.sanitizeApproval(
            approval
          ),

        reasons: [
          "Recovery approval is marked expired.",
        ],

        warnings:
          uniqueStrings(
            warnings
          ),

        checkedAt:
          now,

        executionAuthorized:
          false,

        approvalStateVersion:
          "phase8.3-v1",
      };
    }

    // ========================================================================
    // 10. DEFAULT PENDING
    // ========================================================================

    return {
      state:
        EXECUTION_APPROVAL_STATE
          .PENDING,

      satisfied:
        false,

      approval:
        this.sanitizeApproval(
          approval
        ),

      reasons: [
        "Recovery approval has not yet been granted.",
      ],

      warnings:
        uniqueStrings(
          warnings
        ),

      checkedAt:
        now,

      executionAuthorized:
        false,

      approvalStateVersion:
        "phase8.3-v1",
    };
  }

  // ==========================================================================
  // SANITIZE APPROVAL
  // ==========================================================================

  sanitizeApproval(
    approval
  ) {
    if (
      !approval
    ) {
      return null;
    }

    return {
      approvalId:
        approval.approvalId ||
        approval._id ||
        null,

      organizationId:
        approval.organizationId ||
        null,

      environmentId:
        approval.environmentId ||
        null,

      incidentId:
        approval.incidentId ||
        null,

      recoveryDecisionId:
        approval.recoveryDecisionId ||
        approval.decisionId ||
        null,

      recoveryDecisionRevision:
        approval.recoveryDecisionRevision ??
        null,

      candidateId:
        approval.candidateId ||
        null,

      playbookId:
        approval.playbookId ||
        null,

      status:
        approval.status ||
        approval.state ||
        approval.decision ||
        null,

      approvedBy:
        approval.approvedBy ||
        approval.approverId ||
        null,

      approvedAt:
        approval.approvedAt ||
        null,

      expiresAt:
        approval.expiresAt ||
        null,
    };
  }

  // ==========================================================================
  // TIME
  // ==========================================================================

  resolveNow(
    dependencies
  ) {
    const now =
      dependencies.now
        ? new Date(
            dependencies.now
          )
        : new Date();

    if (
      Number.isNaN(
        now.getTime()
      )
    ) {
      return new Date();
    }

    return now;
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
          "Execution approval state input is required"
        ),
        {
          code:
            "EXECUTION_APPROVAL_INPUT_REQUIRED",
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
          "Execution approval state requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_APPROVAL_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution approval state requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_APPROVAL_RECOVERY_DECISION_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution approval state cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_APPROVAL_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

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

module.exports =
  new ExecutionApprovalStateService();

module.exports
  .ExecutionApprovalStateService =
  ExecutionApprovalStateService;