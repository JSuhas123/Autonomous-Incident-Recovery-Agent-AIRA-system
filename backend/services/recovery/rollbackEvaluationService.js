"use strict";

/**
 * AIRA Rollback Evaluation Service
 *
 * Phase 7.6
 *
 * Evaluates whether a recovery candidate is reversible and whether
 * an explicit rollback path exists.
 *
 * Responsibilities:
 *
 * - inspect rollback metadata on playbooks
 * - evaluate rollback availability
 * - evaluate rollback completeness
 * - detect destructive / irreversible actions
 * - evaluate rollback preconditions
 * - optionally validate rollback playbook existence
 *
 * DOES NOT:
 *
 * - execute rollback
 * - execute remediation
 * - authorize execution
 * - bypass policy
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  REVERSIBILITY,
} =
  require(
    "./recoveryDecisionContracts"
  );

class RollbackEvaluationService {
  constructor(
    options = {}
  ) {
    this.requireRollbackForHighRisk =
      options.requireRollbackForHighRisk ??
      true;
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

    return {
      candidates:
        evaluated,

      reversibleCandidates:
        evaluated.filter(
          (
            candidate
          ) =>
            candidate
              .rollback
              .available ===
            true
        ),

      irreversibleCandidates:
        evaluated.filter(
          (
            candidate
          ) =>
            candidate
              .rollback
              .reversibility ===
            REVERSIBILITY
              .NONE
        ),

      evaluationVersion:
        "phase7.6-v1",

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

    const playbook =
      await this.loadPlaybook(
        candidate,
        dependencies
      );

    const rollbackDefinition =
      this.resolveRollbackDefinition(
        candidate,
        playbook
      );

    let available =
      false;

    let reversibility =
      REVERSIBILITY
        .UNKNOWN;

    let rollbackPlaybookId =
      rollbackDefinition
        ?.rollbackPlaybookId ||
      rollbackDefinition
        ?.playbookId ||
      candidate
        ?.rollback
        ?.rollbackPlaybookId ||
      null;

    // ------------------------------------------------------------------------
    // 1. EXPLICIT IRREVERSIBLE ACTION
    // ------------------------------------------------------------------------

    if (
      rollbackDefinition
        ?.reversible ===
        false ||
      candidate
        ?.metadata
        ?.irreversible ===
        true
    ) {
      available =
        false;

      reversibility =
        REVERSIBILITY
          .NONE;

      reasons.push(
        "Playbook explicitly declares the action irreversible."
      );

      return this.buildCandidate({
        candidate,
        available,
        reversibility,
        rollbackPlaybookId,
        reasons,
      });
    }

    // ------------------------------------------------------------------------
    // 2. EXPLICIT REVERSIBILITY
    // ------------------------------------------------------------------------

    const declared =
      normalizeReversibility(
        rollbackDefinition
          ?.reversibility ||
        candidate
          ?.rollback
          ?.reversibility
      );

    if (
      declared
    ) {
      reversibility =
        declared;
    }

    // ------------------------------------------------------------------------
    // 3. INLINE ROLLBACK STEPS
    // ------------------------------------------------------------------------

    const inlineSteps =
      normalizeArray(
        rollbackDefinition
          ?.steps
      );

    if (
      inlineSteps.length >
      0
    ) {
      available =
        true;

      if (
        reversibility ===
        REVERSIBILITY
          .UNKNOWN
      ) {
        reversibility =
          REVERSIBILITY
            .FULL;
      }

      reasons.push(
        "Playbook contains explicit rollback steps."
      );
    }

    // ------------------------------------------------------------------------
    // 4. ROLLBACK PLAYBOOK
    // ------------------------------------------------------------------------

    if (
      rollbackPlaybookId
    ) {
      const rollbackPlaybook =
        await this.loadRollbackPlaybook(
          rollbackPlaybookId,
          dependencies
        );

      if (
        rollbackPlaybook
      ) {
        available =
          true;

        if (
          reversibility ===
          REVERSIBILITY
            .UNKNOWN
        ) {
          reversibility =
            REVERSIBILITY
              .FULL;
        }

        reasons.push(
          "Dedicated rollback playbook is available."
        );
      } else {
        reasons.push(
          "Rollback playbook reference exists but the rollback playbook could not be loaded."
        );

        if (
          reversibility ===
          REVERSIBILITY
            .UNKNOWN
        ) {
          reversibility =
            REVERSIBILITY
              .PARTIAL;
        }
      }
    }

    // ------------------------------------------------------------------------
    // 5. IMPLICIT REVERSIBILITY
    // ------------------------------------------------------------------------

    if (
      !available
    ) {
      const actionType =
        normalizeText(
          candidate
            ?.metadata
            ?.actionType
        );

      if (
        [
          "restart",
          "scale",
          "rollback",
          "drain",
        ].includes(
          actionType
        )
      ) {
        reversibility =
          reversibility ===
          REVERSIBILITY
            .UNKNOWN
            ? REVERSIBILITY
                .PARTIAL
            : reversibility;

        reasons.push(
          "Action is operationally reversible in principle but has no explicit rollback definition."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 6. DESTRUCTIVE ACTION
    // ------------------------------------------------------------------------

    if (
      candidate
        ?.metadata
        ?.destructive ===
        true
    ) {
      if (
        !available
      ) {
        reversibility =
          REVERSIBILITY
            .NONE;

        reasons.push(
          "Destructive action has no rollback path."
        );
      }
    }

    // ------------------------------------------------------------------------
    // 7. HIGH-RISK ACTION REQUIRES ROLLBACK
    // ------------------------------------------------------------------------

    const riskScore =
      Number(
        candidate
          ?.actionRisk
          ?.score ||
        0
      );

    if (
      this
        .requireRollbackForHighRisk &&
      riskScore >=
        0.65 &&
      !available
    ) {
      reasons.push(
        "High-risk candidate has no explicit rollback path."
      );

      if (
        reversibility ===
        REVERSIBILITY
          .UNKNOWN
      ) {
        reversibility =
          REVERSIBILITY
            .NONE;
      }
    }

    // ------------------------------------------------------------------------
    // 8. ROLLBACK PRECONDITIONS
    // ------------------------------------------------------------------------

    const preconditionResult =
      await this.evaluateRollbackPreconditions({
        rollbackDefinition,
        candidate,
        context,
        diagnosis,
        dependencies,
      });

    reasons.push(
      ...preconditionResult.reasons
    );

    if (
      preconditionResult.failed
    ) {
      available =
        false;

      if (
        reversibility ===
        REVERSIBILITY
          .FULL
      ) {
        reversibility =
          REVERSIBILITY
            .PARTIAL;
      }
    }

    // ------------------------------------------------------------------------
    // DEFAULT
    // ------------------------------------------------------------------------

    if (
      reversibility ===
        REVERSIBILITY
          .UNKNOWN &&
      !available
    ) {
      reasons.push(
        "Rollback capability is unknown."
      );
    }

    return this.buildCandidate({
      candidate,
      available,
      reversibility,
      rollbackPlaybookId,
      reasons,
    });
  }

  // ==========================================================================
  // BUILD CANDIDATE
  // ==========================================================================

  buildCandidate({
    candidate,
    available,
    reversibility,
    rollbackPlaybookId,
    reasons,
  }) {
    return createRecoveryCandidate({
      ...candidate,

      rollback: {
        available,

        reversibility,

        rollbackPlaybookId,

        reasons:
          uniqueStrings(
            reasons
          ),
      },

      metadata: {
        ...(
          candidate.metadata ||
          {}
        ),

        rollbackEvaluationVersion:
          "phase7.6-v1",
      },

      executionAuthorized:
        false,
    });
  }

  // ==========================================================================
  // ROLLBACK DEFINITION
  // ==========================================================================

  resolveRollbackDefinition(
    candidate,
    playbook
  ) {
    return (
      playbook
        ?.rollback ||
      candidate
        ?.metadata
        ?.rollbackDefinition ||
      candidate
        ?.rollback ||
      null
    );
  }

  // ==========================================================================
  // LOAD PLAYBOOK
  // ==========================================================================

  async loadPlaybook(
    candidate,
    dependencies
  ) {
    const repository =
      dependencies
        .playbookRepository;

    if (
      !repository
    ) {
      return null;
    }

    if (
      typeof repository
        .findByPlaybookId ===
      "function"
    ) {
      return repository
        .findByPlaybookId(
          candidate.playbookId
        );
    }

    if (
      typeof repository
        .getById ===
      "function"
    ) {
      return repository
        .getById(
          candidate.playbookId
        );
    }

    if (
      typeof repository
        .findOne ===
      "function"
    ) {
      return repository
        .findOne({
          playbookId:
            candidate.playbookId,
        });
    }

    return null;
  }

  // ==========================================================================
  // LOAD ROLLBACK PLAYBOOK
  // ==========================================================================

  async loadRollbackPlaybook(
    rollbackPlaybookId,
    dependencies
  ) {
    const repository =
      dependencies
        .playbookRepository;

    if (
      !repository
    ) {
      return null;
    }

    if (
      typeof repository
        .findByPlaybookId ===
      "function"
    ) {
      return repository
        .findByPlaybookId(
          rollbackPlaybookId
        );
    }

    if (
      typeof repository
        .getById ===
      "function"
    ) {
      return repository
        .getById(
          rollbackPlaybookId
        );
    }

    if (
      typeof repository
        .findOne ===
      "function"
    ) {
      return repository
        .findOne({
          playbookId:
            rollbackPlaybookId,
        });
    }

    return null;
  }

  // ==========================================================================
  // PRECONDITIONS
  // ==========================================================================

  async evaluateRollbackPreconditions({
    rollbackDefinition,
    candidate,
    context,
    diagnosis,
    dependencies,
  }) {
    const checks =
      normalizeArray(
        rollbackDefinition
          ?.preconditions
      );

    if (
      checks.length ===
      0
    ) {
      return {
        failed:
          false,

        reasons:
          [],
      };
    }

    const reasons =
      [];

    let failed =
      false;

    for (
      const check
      of checks
    ) {
      if (
        typeof dependencies
          .rollbackPreconditionEvaluator !==
        "function"
      ) {
        failed =
          true;

        reasons.push(
          "Rollback preconditions exist but no rollback precondition evaluator is available."
        );

        continue;
      }

      const result =
        await dependencies
          .rollbackPreconditionEvaluator({
            check,
            candidate,
            context,
            diagnosis,
          });

      if (
        result
          ?.passed !==
        true
      ) {
        failed =
          true;

        reasons.push(
          result
            ?.reason ||
          "Rollback precondition failed."
        );
      }
    }

    return {
      failed,
      reasons,
    };
  }

  // ==========================================================================
  // INPUT VALIDATION
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
          "Rollback evaluation input is required"
        ),
        {
          code:
            "ROLLBACK_EVALUATION_INPUT_REQUIRED",
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
          "Rollback evaluation requires candidates"
        ),
        {
          code:
            "ROLLBACK_EVALUATION_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Rollback evaluation cannot receive execution authorization"
        ),
        {
          code:
            "ROLLBACK_EVALUATION_UNSAFE_INPUT",
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

  const text =
    String(
      value
    )
      .trim()
      .toLowerCase();

  return text ||
    null;
}

function normalizeReversibility(
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
      REVERSIBILITY
    )
      .includes(
        normalized
      )
  ) {
    return normalized;
  }

  return null;
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
  new RollbackEvaluationService();

module.exports
  .RollbackEvaluationService =
  RollbackEvaluationService;