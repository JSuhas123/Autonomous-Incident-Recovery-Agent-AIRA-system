"use strict";

/**
 * AIRA Execution Idempotency Gate Service
 *
 * Phase 8.6
 *
 * Determines whether an execution attempt is new, duplicate,
 * already completed, or previously failed.
 *
 * This service is a pre-authorization safety gate.
 *
 * DOES NOT:
 *
 * - authorize execution
 * - execute actions
 * - acquire distributed locks
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  IDEMPOTENCY_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionIdempotencyGateService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async evaluate(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const key =
      input.idempotencyKey ||
      this.generateKey(
        input
      );

    const reasons =
      [];

    const warnings =
      [];

    // ========================================================================
    // 1. PROVIDER REQUIRED
    // ========================================================================

    if (
      typeof dependencies
        .checkIdempotency !==
      "function"
    ) {
      return {
        state:
          IDEMPOTENCY_STATE
            .UNKNOWN,

        allowed:
          false,

        duplicate:
          false,

        idempotencyKey:
          key,

        existingRecord:
          null,

        reasons: [
          "Idempotency state could not be verified.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    // ========================================================================
    // 2. LOAD EXISTING RECORD
    // ========================================================================

    const existing =
      await dependencies
        .checkIdempotency({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          idempotencyKey:
            key,

          recoveryDecisionId:
            input.recoveryDecisionId,

          recoveryDecisionRevision:
            input.recoveryDecisionRevision,

          playbookId:
            input.selectedPlaybookId,
        });

    // ========================================================================
    // 3. NEW REQUEST
    // ========================================================================

    if (
      !existing
    ) {
      return {
        state:
          IDEMPOTENCY_STATE
            .NEW,

        allowed:
          true,

        duplicate:
          false,

        idempotencyKey:
          key,

        existingRecord:
          null,

        reasons: [
          "No previous execution attempt exists for this recovery decision.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    // ========================================================================
    // 4. EXISTING RECORD SCOPE
    // ========================================================================

    if (
      existing.organizationId &&
      String(
        existing.organizationId
      ) !==
      String(
        input.organizationId
      )
    ) {
      reasons.push(
        "Existing idempotency record belongs to a different organization."
      );
    }

    if (
      existing.environmentId &&
      String(
        existing.environmentId
      ) !==
      String(
        input.environmentId
      )
    ) {
      reasons.push(
        "Existing idempotency record belongs to a different environment."
      );
    }

    if (
      reasons.length >
      0
    ) {
      return {
        state:
          IDEMPOTENCY_STATE
            .UNKNOWN,

        allowed:
          false,

        duplicate:
          false,

        idempotencyKey:
          key,

        existingRecord:
          this.sanitizeRecord(
            existing
          ),

        reasons,

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    // ========================================================================
    // 5. NORMALIZE EXISTING STATE
    // ========================================================================

    const existingState =
      normalizeText(
        existing.state ||
        existing.status ||
        existing.resultStatus
      );

    if (
      [
        "completed",
        "succeeded",
        "success",
      ].includes(
        existingState
      )
    ) {
      return {
        state:
          IDEMPOTENCY_STATE
            .COMPLETED,

        allowed:
          false,

        duplicate:
          true,

        idempotencyKey:
          key,

        existingRecord:
          this.sanitizeRecord(
            existing
          ),

        reasons: [
          "This recovery decision has already completed execution.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    if (
      [
        "running",
        "queued",
        "pending",
        "authorized",
      ].includes(
        existingState
      )
    ) {
      return {
        state:
          IDEMPOTENCY_STATE
            .DUPLICATE,

        allowed:
          false,

        duplicate:
          true,

        idempotencyKey:
          key,

        existingRecord:
          this.sanitizeRecord(
            existing
          ),

        reasons: [
          "An execution attempt for this recovery decision is already active.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    if (
      [
        "failed",
        "error",
      ].includes(
        existingState
      )
    ) {
      const retryAllowed =
        input.retryAllowed ===
          true &&
        Number(
          existing.attempt ||
          0
        ) <
        Number(
          input.maxAttempts ||
          1
        );

      return {
        state:
          IDEMPOTENCY_STATE
            .FAILED,

        allowed:
          retryAllowed,

        duplicate:
          !retryAllowed,

        retryAllowed,

        idempotencyKey:
          key,

        existingRecord:
          this.sanitizeRecord(
            existing
          ),

        reasons: [
          retryAllowed
            ? "Previous execution failed and retry policy allows another attempt."
            : "Previous execution failed and retry policy does not allow another attempt.",
        ],

        warnings,

        checkedAt:
          new Date(),

        executionAuthorized:
          false,

        gateVersion:
          "phase8.6-v1",
      };
    }

    // ========================================================================
    // 6. UNKNOWN STATE — FAIL CLOSED
    // ========================================================================

    return {
      state:
        IDEMPOTENCY_STATE
          .UNKNOWN,

      allowed:
        false,

      duplicate:
        false,

      idempotencyKey:
        key,

      existingRecord:
        this.sanitizeRecord(
          existing
        ),

      reasons: [
        "Existing execution record has an unknown state.",
      ],

      warnings,

      checkedAt:
        new Date(),

      executionAuthorized:
        false,

      gateVersion:
        "phase8.6-v1",
    };
  }

  // ==========================================================================
  // GENERATE KEY
  // ==========================================================================

  generateKey(
    input
  ) {
    const material = [
      input.organizationId,
      input.environmentId,
      input.incidentId,
      input.recoveryDecisionId,
      input.recoveryDecisionRevision ??
        "none",
      input.selectedPlaybookId ||
        "none",
    ]
      .map(
        (
          value
        ) =>
          String(
            value
          )
      )
      .join(
        ":"
      );

    return (
      "execidem_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          material
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        )
    );
  }

  // ==========================================================================
  // SANITIZE RECORD
  // ==========================================================================

  sanitizeRecord(
    record
  ) {
    return {
      id:
        record._id ||
        record.id ||
        null,

      organizationId:
        record.organizationId ||
        null,

      environmentId:
        record.environmentId ||
        null,

      incidentId:
        record.incidentId ||
        null,

      recoveryDecisionId:
        record.recoveryDecisionId ||
        null,

      recoveryDecisionRevision:
        record.recoveryDecisionRevision ??
        null,

      playbookId:
        record.playbookId ||
        null,

      state:
        record.state ||
        record.status ||
        null,

      attempt:
        Number(
          record.attempt ||
          0
        ),

      createdAt:
        record.createdAt ||
        null,

      updatedAt:
        record.updatedAt ||
        null,
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
          "Execution idempotency input is required"
        ),
        {
          code:
            "EXECUTION_IDEMPOTENCY_INPUT_REQUIRED",
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
          "Execution idempotency requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_IDEMPOTENCY_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution idempotency requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_IDEMPOTENCY_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.selectedPlaybookId
    ) {
      throw Object.assign(
        new Error(
          "Execution idempotency requires selectedPlaybookId"
        ),
        {
          code:
            "EXECUTION_IDEMPOTENCY_PLAYBOOK_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution idempotency cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_IDEMPOTENCY_UNSAFE_INPUT",
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

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionIdempotencyGateService();

module.exports
  .ExecutionIdempotencyGateService =
  ExecutionIdempotencyGateService;