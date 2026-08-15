"use strict";

/**
 * AIRA Execution Lease Service
 *
 * Phase 8.7
 *
 * Provides a distributed execution lease before controlled execution.
 *
 * Purpose:
 *
 * - prevent concurrent remediation on same incident/resource
 * - prevent multiple workers from executing same playbook simultaneously
 * - enforce scoped lock ownership
 * - fail closed if lock state cannot be verified
 *
 * DOES NOT:
 *
 * - authorize execution
 * - execute playbooks
 * - bypass idempotency
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  EXECUTION_LOCK_STATE,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionLeaseService {
  constructor(
    options = {}
  ) {
    this.defaultLeaseTtlMs =
      Number.isFinite(
        Number(
          options.defaultLeaseTtlMs
        )
      )
        ? Math.max(
            1000,
            Number(
              options.defaultLeaseTtlMs
            )
          )
        : 30 * 1000;
  }

  // ==========================================================================
  // ACQUIRE
  // ==========================================================================

  async acquire(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const leaseKey =
      input.lockKey ||
      this.generateLeaseKey(
        input
      );

    const ownerId =
      input.ownerId ||
      this.generateOwnerId(
        input
      );

    const ttlMs =
      Number.isFinite(
        Number(
          input.ttlMs
        )
      )
        ? Math.max(
            1000,
            Number(
              input.ttlMs
            )
          )
        : this.defaultLeaseTtlMs;

    if (
      typeof dependencies
        .acquireLock !==
      "function"
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .DENIED,

        acquired:
          false,

        leaseKey,

        ownerId,

        ttlMs,

        reasons: [
          "Distributed execution lock provider is unavailable.",
        ],

        warnings:
          [],

        acquiredAt:
          null,

        expiresAt:
          null,

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    // ========================================================================
    // TRY ACQUIRE
    // ========================================================================

    const result =
      await dependencies
        .acquireLock({
          key:
            leaseKey,

          ownerId,

          ttlMs,

          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          recoveryDecisionId:
            input.recoveryDecisionId,

          playbookId:
            input.selectedPlaybookId,
        });

    // ========================================================================
    // PROVIDER DENIED
    // ========================================================================

    if (
      !result ||
      result.acquired !==
        true
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .DENIED,

        acquired:
          false,

        leaseKey,

        ownerId,

        ttlMs,

        reasons: [
          result
            ?.reason ||
          "Execution lease could not be acquired.",
        ],

        warnings:
          normalizeArray(
            result
              ?.warnings
          ),

        acquiredAt:
          null,

        expiresAt:
          result
            ?.expiresAt ||
          null,

        existingOwnerId:
          result
            ?.ownerId ||
          null,

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    // ========================================================================
    // OWNERSHIP VALIDATION
    // ========================================================================

    if (
      result.ownerId &&
      String(
        result.ownerId
      ) !==
      String(
        ownerId
      )
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .DENIED,

        acquired:
          false,

        leaseKey,

        ownerId,

        ttlMs,

        reasons: [
          "Execution lease ownership does not match requester.",
        ],

        warnings:
          [],

        acquiredAt:
          null,

        expiresAt:
          result
            ?.expiresAt ||
          null,

        existingOwnerId:
          result.ownerId,

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    const acquiredAt =
      result.acquiredAt
        ? new Date(
            result.acquiredAt
          )
        : new Date();

    const expiresAt =
      result.expiresAt
        ? new Date(
            result.expiresAt
          )
        : new Date(
            acquiredAt.getTime() +
            ttlMs
          );

    return {
      state:
        EXECUTION_LOCK_STATE
          .ACQUIRED,

      acquired:
        true,

      leaseKey,

      ownerId,

      ttlMs,

      acquiredAt,

      expiresAt,

      reasons: [
        "Distributed execution lease acquired.",
      ],

      warnings:
        normalizeArray(
          result
            ?.warnings
        ),

      executionAuthorized:
        false,

      leaseVersion:
        "phase8.7-v1",
    };
  }

  // ==========================================================================
  // VALIDATE
  // ==========================================================================

  async validate(
    lease,
    dependencies = {}
  ) {
    if (
      !lease ||
      lease.state !==
        EXECUTION_LOCK_STATE
          .ACQUIRED ||
      lease.acquired !==
        true
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .DENIED,

        valid:
          false,

        reasons: [
          "Execution lease is not acquired.",
        ],

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    const now =
      dependencies.now
        ? new Date(
            dependencies.now
          )
        : new Date();

    if (
      lease.expiresAt
    ) {
      const expiresAt =
        new Date(
          lease.expiresAt
        );

      if (
        expiresAt.getTime() <=
        now.getTime()
      ) {
        return {
          state:
            EXECUTION_LOCK_STATE
              .EXPIRED,

          valid:
            false,

          reasons: [
            "Execution lease has expired.",
          ],

          executionAuthorized:
            false,

          leaseVersion:
            "phase8.7-v1",
        };
      }
    }

    if (
      typeof dependencies
        .validateLock ===
      "function"
    ) {
      const result =
        await dependencies
          .validateLock({
            key:
              lease.leaseKey,

            ownerId:
              lease.ownerId,
          });

      if (
        result
          ?.valid !==
        true
      ) {
        return {
          state:
            EXECUTION_LOCK_STATE
              .DENIED,

          valid:
            false,

          reasons: [
            result
              ?.reason ||
            "Execution lease ownership could not be verified.",
          ],

          executionAuthorized:
            false,

          leaseVersion:
            "phase8.7-v1",
        };
      }
    }

    return {
      state:
        EXECUTION_LOCK_STATE
          .ACQUIRED,

      valid:
        true,

      reasons: [
        "Execution lease is valid.",
      ],

      executionAuthorized:
        false,

      leaseVersion:
        "phase8.7-v1",
    };
  }

  // ==========================================================================
  // RELEASE
  // ==========================================================================

  async release(
    lease,
    dependencies = {}
  ) {
    if (
      !lease ||
      !lease.leaseKey ||
      !lease.ownerId
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .RELEASED,

        released:
          false,

        reasons: [
          "No valid execution lease was supplied.",
        ],

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    if (
      typeof dependencies
        .releaseLock !==
      "function"
    ) {
      return {
        state:
          EXECUTION_LOCK_STATE
            .RELEASED,

        released:
          false,

        reasons: [
          "Distributed lock release provider is unavailable.",
        ],

        executionAuthorized:
          false,

        leaseVersion:
          "phase8.7-v1",
      };
    }

    const result =
      await dependencies
        .releaseLock({
          key:
            lease.leaseKey,

          ownerId:
            lease.ownerId,
        });

    return {
      state:
        EXECUTION_LOCK_STATE
          .RELEASED,

      released:
        result
          ?.released ===
        true,

      reasons: [
        result
          ?.reason ||
        (
          result
            ?.released ===
          true
            ? "Execution lease released."
            : "Execution lease was not released."
        ),
      ],

      executionAuthorized:
        false,

      leaseVersion:
        "phase8.7-v1",
    };
  }

  // ==========================================================================
  // KEY GENERATION
  // ==========================================================================

  generateLeaseKey(
    input
  ) {
    const resource =
      input.resourceId ||
      input.selectedCandidate
        ?.metadata
        ?.resourceId ||
      input.context
        ?.service
        ?.id ||
      input.incidentId;

    const material = [
      input.organizationId,
      input.environmentId,
      resource,
      input.selectedPlaybookId,
    ]
      .map(
        (
          value
        ) =>
          String(
            value ||
            "none"
          )
      )
      .join(
        ":"
      );

    return (
      "execlease_" +
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

  generateOwnerId(
    input
  ) {
    return (
      "owner_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            process.pid,
            input.recoveryDecisionId,
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
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
          "Execution lease input is required"
        ),
        {
          code:
            "EXECUTION_LEASE_INPUT_REQUIRED",
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
          "Execution lease requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_LEASE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution lease requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_LEASE_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.selectedPlaybookId
    ) {
      throw Object.assign(
        new Error(
          "Execution lease requires selectedPlaybookId"
        ),
        {
          code:
            "EXECUTION_LEASE_PLAYBOOK_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution lease cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_LEASE_UNSAFE_INPUT",
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

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionLeaseService();

module.exports
  .ExecutionLeaseService =
  ExecutionLeaseService;