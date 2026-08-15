"use strict";

/**
 * AIRA Recovery Fallback Service
 *
 * Phase 7.14
 *
 * Converts recovery failure / uncertainty states into explicit,
 * deterministic safe outcomes.
 *
 * Handles:
 *
 * - no discovered playbook
 * - no applicable playbook
 * - all candidates risk-blocked
 * - all candidates policy-blocked
 * - critic rejection
 * - missing rollback
 * - degraded recovery infrastructure
 * - insufficient diagnosis certainty
 *
 * DOES NOT:
 *
 * - execute recovery
 * - authorize execution
 * - invent commands
 */

const {
  createRecoveryDecision,
  RECOVERY_DECISION,
  POLICY_STATUS,
  APPROVAL_MODE,
  REVERSIBILITY,
} =
  require(
    "./recoveryDecisionContracts"
  );

class RecoveryFallbackService {
  resolve(
    input = {}
  ) {
    const reason =
      input.reason ||
      "unknown";

    const context =
      input.context ||
      {};

    const diagnosis =
      input.diagnosis ||
      {};

    const criticResult =
      input.criticResult ||
      null;

    const candidates =
      Array.isArray(
        input.candidates
      )
        ? input.candidates
        : [];

    switch (
      reason
    ) {
      // ======================================================================
      // NO PLAYBOOK EXISTS
      // ======================================================================

      case "NO_DISCOVERED_PLAYBOOK":
        return this.buildNoSafeAction({
          input,

          reasons: [
            "No approved playbook matches the verified diagnosis.",
            "AIRA will not invent recovery commands dynamically.",
          ],

          unknowns: [
            "A new approved playbook may be required for this failure mode.",
          ],
        });

      // ======================================================================
      // NOTHING APPLICABLE
      // ======================================================================

      case "NO_APPLICABLE_PLAYBOOK":
        return this.buildNoSafeAction({
          input,

          reasons: [
            "Approved playbooks exist, but none satisfy current applicability or precondition checks.",
          ],

          unknowns:
            this.extractFailedPreconditions(
              candidates
            ),
        });

      // ======================================================================
      // ALL ACTIONS TOO RISKY
      // ======================================================================

      case "ALL_RISK_BLOCKED":
        return this.buildManual({
          input,

          reasons: [
            "All recovery candidates exceed safe automated action-risk limits.",
          ],

          unknowns: [
            "Operator judgment is required before attempting remediation.",
          ],
        });

      // ======================================================================
      // POLICY BLOCK
      // ======================================================================

      case "ALL_POLICY_BLOCKED":
        return this.buildNoSafeAction({
          input,

          reasons: [
            "All recovery candidates are blocked by policy.",
          ],

          unknowns:
            this.extractPolicyReasons(
              candidates
            ),
        });

      // ======================================================================
      // CRITIC REJECTED
      // ======================================================================

      case "CRITIC_REJECTED":
        return this.buildManual({
          input,

          reasons: [
            "Recovery critic rejected the proposed recovery decision.",
            ...(
              criticResult
                ?.violations ||
              []
            ),
          ],

          unknowns:
            criticResult
              ?.warnings ||
            [],
        });

      // ======================================================================
      // CRITIC MANUAL REVIEW
      // ======================================================================

      case "CRITIC_MANUAL_REVIEW":
        return this.buildManual({
          input,

          reasons: [
            "Recovery critic requires manual review before proceeding.",
            ...(
              criticResult
                ?.warnings ||
              []
            ),
          ],
        });

      // ======================================================================
      // DIAGNOSIS NOT READY
      // ======================================================================

      case "DIAGNOSIS_INSUFFICIENT":
        return this.buildCollectEvidence({
          input,

          reasons: [
            "Diagnosis does not contain enough evidence for safe recovery evaluation.",
          ],

          unknowns:
            diagnosis
              ?.unknowns ||
            [],
        });

      // ======================================================================
      // RECOVERY SYSTEM DEGRADED
      // ======================================================================

      case "RECOVERY_SYSTEM_DEGRADED":
        return this.buildManual({
          input,

          reasons: [
            "Recovery decision infrastructure is degraded or unavailable.",
          ],

          unknowns: [
            input.error
              ?.message ||
            "Recovery subsystem failure.",
          ],
        });

      // ======================================================================
      // INCIDENT ALREADY HEALTHY
      // ======================================================================

      case "INCIDENT_RECOVERED":
        return this.buildMonitor({
          input,

          reasons: [
            "Incident appears recovered; recovery action is no longer required.",
          ],
        });

      // ======================================================================
      // DEFAULT SAFE FALLBACK
      // ======================================================================

      default:
        return this.buildManual({
          input,

          reasons: [
            "AIRA could not establish a safe recovery action.",
          ],

          unknowns: [
            `Unhandled recovery fallback reason: ${reason}`,
          ],
        });
    }
  }

  // ==========================================================================
  // NO SAFE ACTION
  // ==========================================================================

  buildNoSafeAction({
    input,
    reasons,
    unknowns = [],
  }) {
    return this.wrap(
      createRecoveryDecision({
        decisionId:
          input.decisionId ||
          null,

        incidentId:
          input.incidentId ||
          input.context
            ?.incidentId ||
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

        decision:
          RECOVERY_DECISION
            .NO_SAFE_ACTION,

        selectedCandidateId:
          null,

        selectedPlaybookId:
          null,

        confidence:
          0,

        candidates:
          input.candidates ||
          [],

        reasons,

        unknowns,

        policyStatus:
          POLICY_STATUS
            .UNKNOWN,

        approvalRequired:
          false,

        approvalMode:
          APPROVAL_MODE
            .NONE,

        rollbackAvailable:
          false,

        reversibility:
          REVERSIBILITY
            .UNKNOWN,

        metadata: {
          fallback:
            true,

          fallbackReason:
            input.reason ||
            null,

          fallbackVersion:
            "phase7.14-v1",
        },

        executionAuthorized:
          false,
      })
    );
  }

  // ==========================================================================
  // MANUAL
  // ==========================================================================

  buildManual({
    input,
    reasons,
    unknowns = [],
  }) {
    return this.wrap(
      createRecoveryDecision({
        decisionId:
          input.decisionId ||
          null,

        incidentId:
          input.incidentId ||
          input.context
            ?.incidentId ||
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

        decision:
          RECOVERY_DECISION
            .MANUAL_INTERVENTION,

        confidence:
          0,

        candidates:
          input.candidates ||
          [],

        reasons,

        unknowns,

        policyStatus:
          POLICY_STATUS
            .UNKNOWN,

        approvalRequired:
          true,

        approvalMode:
          APPROVAL_MODE
            .MANUAL_ONLY,

        rollbackAvailable:
          false,

        reversibility:
          REVERSIBILITY
            .UNKNOWN,

        metadata: {
          fallback:
            true,

          fallbackReason:
            input.reason ||
            null,

          fallbackVersion:
            "phase7.14-v1",
        },

        executionAuthorized:
          false,
      })
    );
  }

  // ==========================================================================
  // COLLECT MORE EVIDENCE
  // ==========================================================================

  buildCollectEvidence({
    input,
    reasons,
    unknowns = [],
  }) {
    return this.wrap(
      createRecoveryDecision({
        decisionId:
          input.decisionId ||
          null,

        incidentId:
          input.incidentId ||
          input.context
            ?.incidentId ||
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

        decision:
          RECOVERY_DECISION
            .COLLECT_MORE_EVIDENCE,

        confidence:
          0,

        candidates:
          input.candidates ||
          [],

        reasons,

        unknowns,

        policyStatus:
          POLICY_STATUS
            .UNKNOWN,

        approvalRequired:
          false,

        approvalMode:
          APPROVAL_MODE
            .NONE,

        rollbackAvailable:
          false,

        reversibility:
          REVERSIBILITY
            .UNKNOWN,

        metadata: {
          fallback:
            true,

          fallbackReason:
            input.reason ||
            null,

          fallbackVersion:
            "phase7.14-v1",
        },

        executionAuthorized:
          false,
      })
    );
  }

  // ==========================================================================
  // MONITOR
  // ==========================================================================

  buildMonitor({
    input,
    reasons,
  }) {
    return this.wrap(
      createRecoveryDecision({
        decisionId:
          input.decisionId ||
          null,

        incidentId:
          input.incidentId ||
          input.context
            ?.incidentId ||
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

        decision:
          RECOVERY_DECISION
            .MONITOR_ONLY,

        confidence:
          1,

        candidates:
          [],

        reasons,

        unknowns:
          [],

        policyStatus:
          POLICY_STATUS
            .UNKNOWN,

        approvalRequired:
          false,

        approvalMode:
          APPROVAL_MODE
            .NONE,

        rollbackAvailable:
          false,

        reversibility:
          REVERSIBILITY
            .UNKNOWN,

        metadata: {
          fallback:
            true,

          fallbackReason:
            input.reason ||
            null,

          fallbackVersion:
            "phase7.14-v1",
        },

        executionAuthorized:
          false,
      })
    );
  }

  // ==========================================================================
  // WRAP
  // ==========================================================================

  wrap(
    decision
  ) {
    return {
      decision,

      selectedCandidate:
        null,

      candidates:
        decision.candidates ||
        [],

      fallback:
        true,

      fallbackReason:
        decision
          ?.metadata
          ?.fallbackReason ||
        null,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // EXTRACTION
  // ==========================================================================

  extractFailedPreconditions(
    candidates
  ) {
    return uniqueStrings(
      candidates.flatMap(
        (
          candidate
        ) =>
          candidate
            ?.applicability
            ?.failedPreconditions ||
          []
      )
    );
  }

  extractPolicyReasons(
    candidates
  ) {
    return uniqueStrings(
      candidates.flatMap(
        (
          candidate
        ) =>
          candidate
            ?.policy
            ?.reasons ||
          []
      )
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

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
  new RecoveryFallbackService();

module.exports
  .RecoveryFallbackService =
  RecoveryFallbackService;