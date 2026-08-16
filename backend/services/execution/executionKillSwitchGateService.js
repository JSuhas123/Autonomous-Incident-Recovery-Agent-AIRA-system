"use strict";

/**
 * AIRA Execution Kill-Switch Gate Service
 *
 * Phase 8.5
 *
 * Final operational shutdown gate before execution authorization.
 *
 * Checks:
 *
 * - global actions enabled
 * - emergency mode
 * - per-action restriction
 * - optional tenant execution stop
 * - optional environment execution stop
 * - recovery-specific execution disable
 *
 * DOES NOT:
 *
 * - authorize execution
 * - execute playbooks
 * - modify kill-switch state
 */

const {
  KILL_SWITCH_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionKillSwitchGateService {
  async evaluate(
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
      KILL_SWITCH_STATE
        .ENABLED;

    // ========================================================================
    // 1. PRIMARY KILL-SWITCH MANAGER
    // ========================================================================

    if (
      typeof dependencies
        .getKillSwitchManager !==
      "function"
    ) {
      warnings.push(
        "Kill-switch manager is unavailable."
      );

      return {
        state:
          KILL_SWITCH_STATE
            .UNKNOWN,

        allowed:
          false,

        blocked:
          true,

        reasons: [
          "Execution cannot proceed because kill-switch state is unknown.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.5-v1",
      };
    }

    const manager =
      await dependencies
        .getKillSwitchManager();

    if (
      !manager
    ) {
      return {
        state:
          KILL_SWITCH_STATE
            .UNKNOWN,

        allowed:
          false,

        blocked:
          true,

        reasons: [
          "Kill-switch manager could not be resolved.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.5-v1",
      };
    }

    // ========================================================================
    // 2. GLOBAL ACTIONS ENABLED
    // ========================================================================

    if (
      typeof manager
        .areActionsEnabled ===
      "function"
    ) {
      const enabled =
        manager
          .areActionsEnabled();

      if (
        enabled !==
        true
      ) {
        reasons.push(
          "Global execution kill switch is disabled."
        );

        state =
          KILL_SWITCH_STATE
            .DISABLED;
      }
    } else {
      warnings.push(
        "Global action kill-switch state could not be read."
      );

      state =
        KILL_SWITCH_STATE
          .UNKNOWN;
    }

    // ========================================================================
    // 3. EMERGENCY MODE
    // ========================================================================

    if (
      typeof manager
        .getAllStatuses ===
      "function"
    ) {
      const statuses =
        manager
          .getAllStatuses() ||
        {};

      if (
  statuses
    .emergencyMode ===
    true ||
  statuses
    .EMERGENCY_MODE ===
    true
) {
  reasons.push(
    "Emergency mode is active."
  );

  state =
    KILL_SWITCH_STATE
      .EMERGENCY_MODE;
}

     if (
  statuses
    .recoveryExecutionEnabled ===
    false ||
  statuses
    .RECOVERY_EXECUTION_ENABLED ===
    false
) {
        reasons.push(
          "Recovery execution is disabled."
        );

        if (
          state !==
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        ) {
          state =
            KILL_SWITCH_STATE
              .DISABLED;
        }
      }
    }

    // ========================================================================
    // 4. ACTION-SPECIFIC KILL SWITCH
    // ========================================================================

    const actionType =
      normalizeText(
        input.actionType ||
        input.selectedCandidate
          ?.metadata
          ?.actionType ||
        input.playbook
          ?.actionType
      );

    if (
      actionType &&
      typeof manager
        .isActionAllowed ===
      "function"
    ) {
      const allowed =
        manager
          .isActionAllowed(
            actionType
          );

      if (
        allowed ===
        false
      ) {
        reasons.push(
          `Action type ${actionType} is disabled by kill switch.`
        );

        if (
          state !==
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        ) {
          state =
            KILL_SWITCH_STATE
              .DISABLED;
        }
      }
    }

    // ========================================================================
    // 5. TENANT-SPECIFIC EXECUTION STOP
    // ========================================================================

    if (
      typeof dependencies
        .isOrganizationExecutionEnabled ===
      "function"
    ) {
      const enabled =
        await dependencies
          .isOrganizationExecutionEnabled({
            organizationId:
              input.organizationId,
          });

      if (
        enabled ===
        false
      ) {
        reasons.push(
          "Execution is disabled for this organization."
        );

        if (
          state !==
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        ) {
          state =
            KILL_SWITCH_STATE
              .DISABLED;
        }
      }
    }

    // ========================================================================
    // 6. ENVIRONMENT-SPECIFIC EXECUTION STOP
    // ========================================================================

    if (
      typeof dependencies
        .isEnvironmentExecutionEnabled ===
      "function"
    ) {
      const enabled =
        await dependencies
          .isEnvironmentExecutionEnabled({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,
          });

      if (
        enabled ===
        false
      ) {
        reasons.push(
          "Execution is disabled for this environment."
        );

        if (
          state !==
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        ) {
          state =
            KILL_SWITCH_STATE
              .DISABLED;
        }
      }
    }

    // ========================================================================
    // 7. RECOVERY-SPECIFIC BLOCK
    // ========================================================================

    if (
      typeof dependencies
        .isRecoveryExecutionEnabled ===
      "function"
    ) {
      const enabled =
        await dependencies
          .isRecoveryExecutionEnabled({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        enabled ===
        false
      ) {
        reasons.push(
          "Recovery execution is currently disabled."
        );

        if (
          state !==
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        ) {
          state =
            KILL_SWITCH_STATE
              .DISABLED;
        }
      }
    }

    // ========================================================================
    // FINAL
    // ========================================================================

    const allowed =
      state ===
        KILL_SWITCH_STATE
          .ENABLED &&
      reasons.length ===
        0;

    return {
      state,

      allowed,

      blocked:
        !allowed,

      actionType:
        actionType ||
        null,

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

      gateVersion:
        "phase8.5-v1",
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
          "Execution kill-switch input is required"
        ),
        {
          code:
            "EXECUTION_KILL_SWITCH_INPUT_REQUIRED",
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
          "Execution kill-switch requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_KILL_SWITCH_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution kill-switch requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_KILL_SWITCH_DECISION_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution kill-switch cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_KILL_SWITCH_UNSAFE_INPUT",
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
      null ||
    value ===
      undefined
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
  new ExecutionKillSwitchGateService();

module.exports
  .ExecutionKillSwitchGateService =
  ExecutionKillSwitchGateService;