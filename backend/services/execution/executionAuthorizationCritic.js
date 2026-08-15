"use strict";

/**
 * AIRA Execution Authorization Critic
 *
 * Phase 8.10
 *
 * Independently validates the output of ExecutionAuthorizationEngine.
 *
 * Checks:
 *
 * - authorization decision/status consistency
 * - freshness is FRESH
 * - approval is satisfied
 * - policy is ALLOWED
 * - kill switch is ENABLED
 * - idempotency is NEW / retry-allowed
 * - execution lease is ACQUIRED
 * - plan exists and plan hash matches authorization metadata
 * - authorization TTL is valid
 * - tenant/environment/incident scope consistency
 *
 * DOES NOT:
 *
 * - execute infrastructure actions
 * - modify authorization
 * - acquire locks
 * - bypass policy
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

const AUTHORIZATION_CRITIC_DECISION =
  Object.freeze({
    ACCEPT:
      "ACCEPT",

    REJECT:
      "REJECT",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",
  });

const AUTHORIZATION_CRITIC_VERSION =
  "phase8.10-v1";

class ExecutionAuthorizationCritic {
  async review(
    engineResult,
    dependencies = {}
  ) {
    this.assertInput(
      engineResult
    );

    const violations =
      [];

    const warnings =
      [];

    const authorization =
      engineResult.authorization;

    const plan =
      engineResult.executionPlan ||
      null;

    const now =
      dependencies.now
        ? new Date(
            dependencies.now
          )
        : new Date();

    // ========================================================================
    // 1. AUTHORIZATION CONSISTENCY
    // ========================================================================

    if (
      engineResult
        .authorizationGranted ===
        true &&
      authorization
        .authorizationGranted !==
        true
    ) {
      violations.push(
        "Engine result grants authorization but authorization contract does not."
      );
    }

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .decision !==
        AUTHORIZATION_DECISION
          .AUTHORIZED
    ) {
      violations.push(
        "Authorization grant exists without AUTHORIZED decision."
      );
    }

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .status !==
        AUTHORIZATION_STATUS
          .AUTHORIZED
    ) {
      violations.push(
        "Authorization grant exists without AUTHORIZED status."
      );
    }

    // ========================================================================
    // 2. SCOPE
    // ========================================================================

    this.checkScope({
      engineResult,
      authorization,
      plan,
      violations,
    });

    // ========================================================================
    // 3. FRESHNESS
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .freshnessState !==
        EXECUTION_FRESHNESS_STATE
          .FRESH
    ) {
      violations.push(
        "Authorized execution does not have FRESH recovery state."
      );
    }

    // ========================================================================
    // 4. APPROVAL
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      ![
        EXECUTION_APPROVAL_STATE
          .NOT_REQUIRED,

        EXECUTION_APPROVAL_STATE
          .APPROVED,
      ].includes(
        authorization
          .approvalState
      )
    ) {
      violations.push(
        `Authorized execution has invalid approval state ${authorization.approvalState}.`
      );
    }

    // ========================================================================
    // 5. POLICY
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .policyState !==
        EXECUTION_POLICY_STATE
          .ALLOWED
    ) {
      violations.push(
        "Authorized execution does not have ALLOWED policy state."
      );
    }

    // ========================================================================
    // 6. KILL SWITCH
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .killSwitchState !==
        KILL_SWITCH_STATE
          .ENABLED
    ) {
      violations.push(
        "Authorized execution does not have ENABLED kill-switch state."
      );
    }

    // ========================================================================
    // 7. IDEMPOTENCY
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      ![
        IDEMPOTENCY_STATE
          .NEW,

        IDEMPOTENCY_STATE
          .FAILED,
      ].includes(
        authorization
          .idempotencyState
      )
    ) {
      violations.push(
        `Authorized execution has invalid idempotency state ${authorization.idempotencyState}.`
      );
    }

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .idempotencyState ===
        IDEMPOTENCY_STATE
          .FAILED &&
      engineResult
        ?.idempotency
        ?.retryAllowed !==
        true
    ) {
      violations.push(
        "Failed execution state was authorized without explicit retry permission."
      );
    }

    // ========================================================================
    // 8. LEASE
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      authorization
        .lockState !==
        EXECUTION_LOCK_STATE
          .ACQUIRED
    ) {
      violations.push(
        "Authorized execution does not have acquired execution lease."
      );
    }

    if (
      authorization
        .authorizationGranted ===
        true &&
      engineResult
        ?.lease
        ?.acquired !==
        true
    ) {
      violations.push(
        "Authorization claims lock ownership but engine result has no acquired lease."
      );
    }

    // ========================================================================
    // 9. EXECUTION PLAN
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true &&
      !plan
    ) {
      violations.push(
        "Authorized execution does not contain an execution plan."
      );
    }

    if (
      plan
    ) {
      if (
        plan.executionAuthorized ===
        true
      ) {
        violations.push(
          "Execution plan must not independently authorize execution."
        );
      }

      if (
        authorization
          ?.metadata
          ?.planId &&
        String(
          authorization
            .metadata
            .planId
        ) !==
        String(
          plan.planId
        )
      ) {
        violations.push(
          "Authorization planId does not match execution plan."
        );
      }

      if (
        authorization
          ?.metadata
          ?.planHash &&
        String(
          authorization
            .metadata
            .planHash
        ) !==
        String(
          plan.planHash
        )
      ) {
        violations.push(
          "Authorization plan hash does not match execution plan."
        );
      }

      if (
        dependencies
          .verifyPlanHash ===
        true
      ) {
        const calculated =
          this.calculatePlanHash(
            plan
          );

        if (
          calculated &&
          plan.planHash &&
          calculated !==
          plan.planHash
        ) {
          violations.push(
            "Execution plan contents no longer match its plan hash."
          );
        }
      }
    }

    // ========================================================================
    // 10. TTL
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true
    ) {
      if (
        !authorization
          .expiresAt
      ) {
        violations.push(
          "Authorized execution has no expiration timestamp."
        );
      } else {
        const expiresAt =
          new Date(
            authorization.expiresAt
          );

        if (
          Number.isNaN(
            expiresAt.getTime()
          )
        ) {
          violations.push(
            "Authorization expiration timestamp is invalid."
          );
        } else if (
          expiresAt.getTime() <=
          now.getTime()
        ) {
          violations.push(
            "Execution authorization has expired."
          );
        }
      }

      if (
        authorization
          .validFrom
      ) {
        const validFrom =
          new Date(
            authorization.validFrom
          );

        if (
          !Number.isNaN(
            validFrom.getTime()
          ) &&
          validFrom.getTime() >
          now.getTime()
        ) {
          violations.push(
            "Execution authorization is not yet valid."
          );
        }
      }
    }

    // ========================================================================
    // 11. ENGINE MUST NOT START EXECUTION
    // ========================================================================

    if (
      engineResult
        .executionStarted ===
      true
    ) {
      violations.push(
        "Authorization engine must not start execution."
      );
    }

    // ========================================================================
    // 12. TRACE
    // ========================================================================

    if (
      authorization
        .authorizationGranted ===
        true
    ) {
      const requiredStages = [
        "freshness",
        "approval_state",
        "policy_revalidation",
        "kill_switch",
        "idempotency",
        "execution_lease",
        "execution_plan",
      ];

      const successfulStages =
        new Set(
          (
            engineResult.trace ||
            []
          )
            .filter(
              (
                stage
              ) =>
                stage.status ===
                "SUCCESS"
            )
            .map(
              (
                stage
              ) =>
                stage.stage
            )
        );

      for (
        const stage
        of requiredStages
      ) {
        if (
          !successfulStages
            .has(
              stage
            )
        ) {
          violations.push(
            `Authorized execution is missing successful stage ${stage}.`
          );
        }
      }
    }

    // ========================================================================
    // FINAL
    // ========================================================================

    let criticDecision =
      AUTHORIZATION_CRITIC_DECISION
        .ACCEPT;

    if (
      violations.length >
      0
    ) {
      criticDecision =
        AUTHORIZATION_CRITIC_DECISION
          .REJECT;
    } else if (
      warnings.length >
      0
    ) {
      criticDecision =
        AUTHORIZATION_CRITIC_DECISION
          .MANUAL_REVIEW;
    }

    return {
      criticDecision,

      accepted:
        criticDecision ===
        AUTHORIZATION_CRITIC_DECISION
          .ACCEPT,

      rejected:
        criticDecision ===
        AUTHORIZATION_CRITIC_DECISION
          .REJECT,

      requiresManualReview:
        criticDecision ===
        AUTHORIZATION_CRITIC_DECISION
          .MANUAL_REVIEW,

      authorizationId:
        authorization
          .authorizationId ||
        null,

      authorizationGranted:
        authorization
          .authorizationGranted ===
          true &&
        criticDecision ===
          AUTHORIZATION_CRITIC_DECISION
            .ACCEPT,

      violations:
        uniqueStrings(
          violations
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      reviewedAt:
        now,

      criticVersion:
        AUTHORIZATION_CRITIC_VERSION,

      executionStarted:
        false,
    };
  }

  // ==========================================================================
  // SCOPE
  // ==========================================================================

  checkScope({
    engineResult,
    authorization,
    plan,
    violations,
  }) {
    const fields = [
      "organizationId",
      "environmentId",
      "incidentId",
      "recoveryDecisionId",
    ];

    for (
      const field
      of fields
    ) {
      if (
        engineResult
          ?.input?.[
            field
          ] &&
        authorization[
          field
        ] &&
        String(
          engineResult
            .input[
              field
            ]
        ) !==
        String(
          authorization[
            field
          ]
        )
      ) {
        violations.push(
          `Authorization ${field} does not match engine input.`
        );
      }

      if (
        plan?.[
          field
        ] &&
        authorization[
          field
        ] &&
        String(
          plan[
            field
          ]
        ) !==
        String(
          authorization[
            field
          ]
        )
      ) {
        violations.push(
          `Execution plan ${field} does not match authorization scope.`
        );
      }
    }

    if (
      plan
        ?.playbookId &&
      authorization
        .selectedPlaybookId &&
      String(
        plan.playbookId
      ) !==
      String(
        authorization
          .selectedPlaybookId
      )
    ) {
      violations.push(
        "Execution plan playbook does not match authorization."
      );
    }

    if (
      plan
        ?.candidateId &&
      authorization
        .selectedCandidateId &&
      String(
        plan.candidateId
      ) !==
      String(
        authorization
          .selectedCandidateId
      )
    ) {
      violations.push(
        "Execution plan candidate does not match authorization."
      );
    }
  }

  // ==========================================================================
  // HASH
  // ==========================================================================

  calculatePlanHash(
    plan
  ) {
    if (
      !plan ||
      typeof plan !==
        "object"
    ) {
      return null;
    }

    const canonical = {
      organizationId:
        plan.organizationId,

      environmentId:
        plan.environmentId,

      incidentId:
        plan.incidentId,

      recoveryDecisionId:
        plan.recoveryDecisionId,

      recoveryDecisionRevision:
        plan.recoveryDecisionRevision,

      candidateId:
        plan.candidateId,

      playbookId:
        plan.playbookId,

      playbookVersion:
        plan.playbookVersion,

      actionType:
        plan.actionType,

      resource:
        plan.resource,

      parameters:
        plan.parameters,

      steps:
        plan.steps,

      verificationHooks:
        plan.verificationHooks,

      rollbackPlan:
        plan.rollbackPlan,
    };

    return (
      "planhash_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          stableStringify(
            canonical
          )
        )
        .digest(
          "hex"
        )
    );
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    engineResult
  ) {
    if (
      !engineResult ||
      typeof engineResult !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Authorization critic input is required"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_CRITIC_INPUT_REQUIRED",
        }
      );
    }

    if (
      !engineResult
        .authorization
    ) {
      throw Object.assign(
        new Error(
          "Authorization critic requires authorization result"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_CRITIC_AUTHORIZATION_REQUIRED",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function stableStringify(
  value
) {
  if (
    value ===
      null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          stableStringify
        )
        .join(
          ","
        ) +
      "]"
    );
  }

  return (
    "{" +
    Object.keys(
      value
    )
      .sort()
      .map(
        (
          key
        ) =>
          JSON.stringify(
            key
          ) +
          ":" +
          stableStringify(
            value[key]
          )
      )
      .join(
        ","
      ) +
    "}"
  );
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
  new ExecutionAuthorizationCritic();

module.exports
  .ExecutionAuthorizationCritic =
  ExecutionAuthorizationCritic;

module.exports
  .AUTHORIZATION_CRITIC_DECISION =
  AUTHORIZATION_CRITIC_DECISION;

module.exports
  .AUTHORIZATION_CRITIC_VERSION =
  AUTHORIZATION_CRITIC_VERSION;