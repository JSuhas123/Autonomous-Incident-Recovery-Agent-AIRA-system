"use strict";

/**
 * AIRA Execution Freshness Service
 *
 * Phase 8.2
 *
 * Validates whether a recovery decision is still fresh enough
 * to be considered for authorization.
 *
 * Checks:
 *
 * - recovery decision revision
 * - current recovery decision identity
 * - diagnosis revision
 * - incident state
 * - decision age / TTL
 * - selected playbook identity
 * - environment scope
 * - organization scope
 *
 * DOES NOT:
 *
 * - authorize execution
 * - approve execution
 * - execute playbooks
 */

const {
  EXECUTION_FRESHNESS_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionFreshnessService {
  constructor(
    options = {}
  ) {
    this.maximumDecisionAgeMs =
      Number.isFinite(
        Number(
          options.maximumDecisionAgeMs
        )
      )
        ? Math.max(
            1000,
            Number(
              options.maximumDecisionAgeMs
            )
          )
        : 5 * 60 * 1000;
  }

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

    let state =
      EXECUTION_FRESHNESS_STATE
        .FRESH;

    const now =
      dependencies.now
        ? new Date(
            dependencies.now
          )
        : new Date();

    // ========================================================================
    // 1. SCOPE VALIDATION
    // ========================================================================

    const scopeResult =
      this.validateScope(
        input
      );

    if (
      !scopeResult.valid
    ) {
      reasons.push(
        ...scopeResult.reasons
      );

      state =
        EXECUTION_FRESHNESS_STATE
          .STALE;
    }

    // ========================================================================
    // 2. CURRENT RECOVERY DECISION
    // ========================================================================

    if (
      typeof dependencies
        .getCurrentRecoveryDecision ===
      "function"
    ) {
      const currentDecision =
        await dependencies
          .getCurrentRecoveryDecision({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        !currentDecision
      ) {
        reasons.push(
          "No current recovery decision exists for the incident."
        );

        state =
          EXECUTION_FRESHNESS_STATE
            .STALE;
      } else {
        if (
          input
            .recoveryDecisionId &&
          String(
            currentDecision
              .decisionId ||
            currentDecision
              ._id
          ) !==
          String(
            input
              .recoveryDecisionId
          )
        ) {
          reasons.push(
            "Recovery decision is no longer the current decision."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }

        if (
          input
            .recoveryDecisionRevision !==
            null &&
          input
            .recoveryDecisionRevision !==
            undefined &&
          Number(
            currentDecision
              .revision
          ) !==
          Number(
            input
              .recoveryDecisionRevision
          )
        ) {
          reasons.push(
            "Recovery decision revision is stale."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }
      }
    }

    // ========================================================================
    // 3. DIAGNOSIS REVISION
    // ========================================================================

    if (
      typeof dependencies
        .getCurrentDiagnosis ===
      "function"
    ) {
      const diagnosis =
        await dependencies
          .getCurrentDiagnosis({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        diagnosis
      ) {
        if (
          input
            .diagnosisId &&
          String(
            diagnosis
              .diagnosisId ||
            diagnosis
              ._id
          ) !==
          String(
            input
              .diagnosisId
          )
        ) {
          reasons.push(
            "Recovery authorization references an outdated diagnosis."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }

        if (
          input
            .diagnosisRevision !==
            null &&
          input
            .diagnosisRevision !==
            undefined &&
          Number(
            diagnosis.revision
          ) !==
          Number(
            input
              .diagnosisRevision
          )
        ) {
          reasons.push(
            "Diagnosis revision changed after recovery decision."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }
      }
    }

    // ========================================================================
    // 4. INCIDENT STATE
    // ========================================================================

    if (
      typeof dependencies
        .getIncident ===
      "function"
    ) {
      const incident =
        await dependencies
          .getIncident({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        !incident
      ) {
        reasons.push(
          "Incident no longer exists."
        );

        state =
          EXECUTION_FRESHNESS_STATE
            .STALE;
      } else {
        const incidentStatus =
          normalizeText(
            incident.status
          );

        if (
          [
            "resolved",
            "closed",
            "recovered",
          ].includes(
            incidentStatus
          )
        ) {
          reasons.push(
            `Incident is already ${incidentStatus}.`
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }
      }
    }

    // ========================================================================
    // 5. DECISION AGE
    // ========================================================================

    const generatedAt =
      input.generatedAt ||
      input.recoveryDecision
        ?.generatedAt ||
      input.recoveryDecision
        ?.createdAt ||
      null;

    if (
      generatedAt
    ) {
      const generatedDate =
        new Date(
          generatedAt
        );

      if (
        Number.isNaN(
          generatedDate
            .getTime()
        )
      ) {
        reasons.push(
          "Recovery decision timestamp is invalid."
        );

        state =
          EXECUTION_FRESHNESS_STATE
            .UNKNOWN;
      } else {
        const ageMs =
          now.getTime() -
          generatedDate.getTime();

        if (
          ageMs >
          this.maximumDecisionAgeMs
        ) {
          reasons.push(
            `Recovery decision age ${ageMs}ms exceeds maximum ${this.maximumDecisionAgeMs}ms.`
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .EXPIRED;
        }

        if (
          ageMs <
          0
        ) {
          warnings.push(
            "Recovery decision timestamp is in the future."
          );
        }
      }
    } else {
      warnings.push(
        "Recovery decision timestamp is unavailable."
      );
    }

    // ========================================================================
    // 6. PLAYBOOK IDENTITY
    // ========================================================================

    if (
      typeof dependencies
        .getPlaybook ===
      "function" &&
      input.selectedPlaybookId
    ) {
      const playbook =
        await dependencies
          .getPlaybook({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            playbookId:
              input.selectedPlaybookId,
          });

      if (
        !playbook
      ) {
        reasons.push(
          "Selected playbook no longer exists."
        );

        state =
          EXECUTION_FRESHNESS_STATE
            .STALE;
      } else {
        if (
          playbook.enabled ===
          false
        ) {
          reasons.push(
            "Selected playbook has been disabled."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }

        if (
          playbook.status &&
          normalizeText(
            playbook.status
          ) !==
          "approved"
        ) {
          reasons.push(
            "Selected playbook is no longer approved."
          );

          state =
            EXECUTION_FRESHNESS_STATE
              .STALE;
        }
      }
    }

    // ========================================================================
    // FINAL
    // ========================================================================

    return {
      state,

      fresh:
        state ===
        EXECUTION_FRESHNESS_STATE
          .FRESH,

      stale:
        state ===
        EXECUTION_FRESHNESS_STATE
          .STALE,

      expired:
        state ===
        EXECUTION_FRESHNESS_STATE
          .EXPIRED,

      reasons:
        uniqueStrings(
          reasons
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      checkedAt:
        now,

      maximumDecisionAgeMs:
        this.maximumDecisionAgeMs,

      executionAuthorized:
        false,

      freshnessVersion:
        "phase8.2-v1",
    };
  }

  // ==========================================================================
  // SCOPE
  // ==========================================================================

  validateScope(
    input
  ) {
    const reasons =
      [];

    const recoveryDecision =
      input.recoveryDecision ||
      {};

    if (
      recoveryDecision
        .organizationId &&
      String(
        recoveryDecision
          .organizationId
      ) !==
      String(
        input.organizationId
      )
    ) {
      reasons.push(
        "Recovery decision organization does not match execution scope."
      );
    }

    if (
      recoveryDecision
        .environmentId &&
      String(
        recoveryDecision
          .environmentId
      ) !==
      String(
        input.environmentId
      )
    ) {
      reasons.push(
        "Recovery decision environment does not match execution scope."
      );
    }

    if (
      recoveryDecision
        .incidentId &&
      String(
        recoveryDecision
          .incidentId
      ) !==
      String(
        input.incidentId
      )
    ) {
      reasons.push(
        "Recovery decision incident does not match execution scope."
      );
    }

    return {
      valid:
        reasons.length ===
        0,

      reasons,
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
          "Execution freshness input is required"
        ),
        {
          code:
            "EXECUTION_FRESHNESS_INPUT_REQUIRED",
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
          "Execution freshness requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_FRESHNESS_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution freshness requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_FRESHNESS_DECISION_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution freshness cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_FRESHNESS_UNSAFE_INPUT",
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
  new ExecutionFreshnessService();

module.exports
  .ExecutionFreshnessService =
  ExecutionFreshnessService;