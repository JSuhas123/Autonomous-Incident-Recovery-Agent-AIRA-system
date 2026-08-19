"use strict";

/**
 * AIRA Lifecycle Persistence Service
 *
 * Phase 13 — Enterprise Data Architecture
 *
 * Persists through IncidentLifecycleRepository:
 *
 * - current lifecycle snapshot
 * - immutable transition history
 * - stability observation state
 * - retry / rollback references
 * - escalation state
 * - resolution / closure timestamps
 *
 * SAFETY:
 *
 * - validates transition identity
 * - preserves revision semantics
 * - keeps transition history immutable
 * - does not execute recovery actions
 * - does not grant execution authorization
 * - contains no Mongo/Mongoose persistence dependency
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  incidentLifecycleRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  isValidLifecycleState,
} =
  require(
    "./incidentLifecycleContracts"
  );

class LifecyclePersistenceService {
  constructor(
    options = {}
  ) {
    /*
     * Repository injection remains available for isolated tests and
     * future PostgreSQL adapter validation.
     */
    this.repository =
      options.repository ||
      incidentLifecycleRepository;
  }

  async persistTransition(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const transition =
      input.transition;

    const scope =
      this.buildScope(
        input
      );

    const existing =
      await this.repository
        .findCurrent(
          scope
        );

    const currentRevision =
      existing
        ? Number(
            existing.revision ||
            0
          )
        : 0;

    /*
     * The persisted lifecycle snapshot is authoritative for the
     * current lifecycle state.
     *
     * Never allow a transition to continue from a state different
     * from the durable snapshot.
     */
    if (
      existing &&
      existing.lifecycleState !==
        transition.fromState
    ) {
      throw Object.assign(
        new Error(
          `Lifecycle persistence state mismatch: expected ${existing.lifecycleState}, received transition from ${transition.fromState}`
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_STATE_MISMATCH",
        }
      );
    }

    const revision =
      currentRevision +
      1;

    const transitionDocument = {
      transitionId:
        input.transitionId ||
        this.generateTransitionId(
          input
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      revision,

      fromState:
        transition.fromState,

      toState:
        transition.toState,

      reason:
        transition.reason ||
        input.reason ||
        null,

      actor:
        clone(
          transition.actor ||
          input.actor ||
          {}
        ),

      source:
        clone(
          transition.source ||
          input.source ||
          {}
        ),

      verificationId:
        input.verificationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      executionRequestId:
        input.executionRequestId ||
        null,

      retryRequestId:
        input.retryRequestId ||
        null,

      rollbackRequestId:
        input.rollbackRequestId ||
        null,

      escalationId:
        input.escalationId ||
        null,

      metadata:
        clone(
          input.metadata ||
          transition.metadata ||
          {}
        ),

      transitionedAt:
        transition.transitionedAt ||
        new Date(),
    };

    /*
     * Transition history is written before the current snapshot.
     *
     * This preserves the behaviour of the existing implementation.
     *
     * Phase 13 PostgreSQL will later place both operations inside one
     * database transaction.
     */
    await this.repository
      .createTransition(
        transitionDocument
      );

    const update = {
      lifecycleState:
        transition.toState,

      revision,

      latestTransition:
        clone(
          transitionDocument
        ),

      lastReason:
        transitionDocument.reason,

      verificationId:
        input.verificationId ||
        existing
          ?.verificationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        existing
          ?.recoveryDecisionId ||
        null,

      executionRequestId:
        input.executionRequestId ||
        existing
          ?.executionRequestId ||
        null,

      retryRequestId:
        input.retryRequestId ||
        existing
          ?.retryRequestId ||
        null,

      rollbackRequestId:
        input.rollbackRequestId ||
        existing
          ?.rollbackRequestId ||
        null,

      escalationId:
        input.escalationId ||
        existing
          ?.escalationId ||
        null,

      metadata: {
        ...(
          existing
            ?.metadata ||
          {}
        ),

        ...(
          input.metadata ||
          {}
        ),

        /*
         * Phase 13 identifies records written through the repository
         * persistence boundary while preserving legacy metadata.
         */
        persistenceVersion:
          "phase13-repository-v1",
      },
    };

    if (
      input.stabilityObservation !==
      undefined
    ) {
      update.stabilityObservation =
        clone(
          input.stabilityObservation
        );
    }

    if (
      input.closureEligibility !==
      undefined
    ) {
      update.closureEligibility =
        clone(
          input.closureEligibility
        );
    }

    if (
      transition.toState ===
      INCIDENT_LIFECYCLE_STATE
        .RESOLVED
    ) {
      update.resolvedAt =
        transition.transitionedAt ||
        new Date();
    }

    if (
      transition.toState ===
      INCIDENT_LIFECYCLE_STATE
        .CLOSED
    ) {
      update.closedAt =
        transition.transitionedAt ||
        new Date();
    }

    if (
      transition.toState ===
      INCIDENT_LIFECYCLE_STATE
        .REGRESSED
    ) {
      update.regressedAt =
        transition.transitionedAt ||
        new Date();
    }

    if (
      transition.toState ===
      INCIDENT_LIFECYCLE_STATE
        .ESCALATED
    ) {
      update.escalatedAt =
        transition.transitionedAt ||
        new Date();
    }

    const lifecycle =
      await this.repository
        .upsertCurrent(
          scope,
          update
        );

    return {
      lifecycle,

      transition:
        transitionDocument,

      revision,

      persisted:
        true,

      incidentClosed:
        transition.toState ===
        INCIDENT_LIFECYCLE_STATE
          .CLOSED,

      retryStarted:
        false,

      rollbackStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  async saveStabilityObservation(
    input = {}
  ) {
    this.assertScope(
      input
    );

    const lifecycle =
      await this.repository
        .updateCurrent(
          this.buildScope(
            input
          ),
          {
            stabilityObservation:
              clone(
                input.stabilityObservation
              ),
          }
        );

    if (
      !lifecycle
    ) {
      throw Object.assign(
        new Error(
          "Incident lifecycle not found"
        ),
        {
          code:
            "LIFECYCLE_NOT_FOUND",
        }
      );
    }

    return {
      lifecycle,

      persisted:
        true,

      executionAuthorized:
        false,
    };
  }

  async getCurrent(
    input = {}
  ) {
    this.assertScope(
      input
    );

    return this.repository
      .findCurrent(
        this.buildScope(
          input
        )
      );
  }

  async getHistory(
    input = {}
  ) {
    this.assertScope(
      input
    );

    const limit =
      Math.min(
        500,
        Math.max(
          1,
          Number(
            input.limit ||
            100
          )
        )
      );

    return this.repository
      .getHistory(
        this.buildScope(
          input
        ),
        limit
      );
  }

  buildScope(
    input = {}
  ) {
    return {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,
    };
  }

  generateTransitionId(
    input
  ) {
    return (
      "transition_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.transition
              ?.fromState ||
              "",
            input.transition
              ?.toState ||
              "",
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

  assertInput(
    input
  ) {
    this.assertScope(
      input
    );

    if (
      !input.transition ||
      typeof input.transition !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle persistence requires transition"
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_TRANSITION_REQUIRED",
        }
      );
    }

    if (
      !isValidLifecycleState(
        input.transition
          .fromState
      ) ||
      !isValidLifecycleState(
        input.transition
          .toState
      )
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle persistence requires valid transition states"
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_TRANSITION_INVALID",
        }
      );
    }

    /*
     * Persistence never becomes execution authority.
     */
    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle persistence cannot authorize execution"
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_UNSAFE_INPUT",
        }
      );
    }
  }

  assertScope(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle persistence input is required"
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_INPUT_REQUIRED",
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
          "Lifecycle persistence requires organization, environment and incident scope"
        ),
        {
          code:
            "LIFECYCLE_PERSISTENCE_SCOPE_REQUIRED",
        }
      );
    }
  }
}

function clone(
  value
) {
  if (
    value ===
    undefined
  ) {
    return null;
  }

  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch (
    error
  ) {
    throw Object.assign(
      new Error(
        "Lifecycle persistence received non-serializable data"
      ),
      {
        code:
          "LIFECYCLE_PERSISTENCE_SERIALIZATION_FAILED",
      }
    );
  }
}

module.exports =
  new LifecyclePersistenceService();

module.exports
  .LifecyclePersistenceService =
  LifecyclePersistenceService;