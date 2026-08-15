"use strict";

/**
 * AIRA Incident Closure Service
 *
 * Phase 10.4
 *
 * Performs controlled incident lifecycle finalization.
 *
 * Allowed progression:
 *
 * STABILITY_OBSERVATION
 *        ↓
 * RESOLVED
 *        ↓
 * CLOSED
 *
 * SAFETY:
 *
 * - requires closure eligibility
 * - uses lifecycle state machine
 * - never closes directly from RECOVERED
 * - never authorizes infrastructure execution
 */

const incidentLifecycleStateMachine =
  require(
    "./incidentLifecycleStateMachine"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  CLOSURE_DECISION,
} =
  require(
    "./incidentLifecycleContracts"
  );

class IncidentClosureService {
  constructor(
    options = {}
  ) {
    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;
  }

  // ==========================================================================
  // MARK RESOLVED
  // ==========================================================================

  async markResolved(
    input = {},
    dependencies = {}
  ) {
    this.assertBaseInput(
      input
    );

    this.assertEligibility(
      input.closureEligibility
    );

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status;

    if (
      currentState !==
      INCIDENT_LIFECYCLE_STATE
        .STABILITY_OBSERVATION
    ) {
      throw Object.assign(
        new Error(
          `Incident must be in STABILITY_OBSERVATION before resolution. Current state: ${currentState}`
        ),
        {
          code:
            "INCIDENT_RESOLUTION_STATE_INVALID",
        }
      );
    }

    const transition =
      this.stateMachine
        .transition({
          fromState:
            currentState,

          toState:
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED,

          reason:
            input.reason ||
            input.closureEligibility
              .reason ||
            "Recovery remained stable through observation window.",

          actor:
            input.actor,

          source: {
            phase:
              10,

            component:
              "incidentClosureService",

            referenceId:
              input.verificationId ||
              null,
          },

          metadata: {
            verificationId:
              input.verificationId ||
              null,

            closureDecision:
              input.closureEligibility
                .decision,

            stabilityResult:
              input.stabilityResult ||
              null,
          },

          executionAuthorized:
            false,
        });

    const now =
      new Date();

    incident.lifecycleState =
      INCIDENT_LIFECYCLE_STATE
        .RESOLVED;

    /*
     * Preserve compatibility with older Incident models
     * that still use status.
     */
    if (
      "status" in
      incident
    ) {
      incident.status =
        INCIDENT_LIFECYCLE_STATE
          .RESOLVED;
    }

    incident.resolvedAt =
      now;

    incident.resolvedBy =
      input.actor
        ?.id ||
      "aira";

    incident.resolution = {
      verificationId:
        input.verificationId ||
        null,

      reason:
        transition.reason,

      closureDecision:
        input.closureEligibility
          .decision,

      stabilityResult:
        input.stabilityResult ||
        null,

      resolvedAt:
        now,
    };

    await this.persistIncident(
      incident,
      dependencies
    );

    return {
      success:
        true,

      resolved:
        true,

      closed:
        false,

      incidentId:
        input.incidentId,

      fromState:
        currentState,

      toState:
        INCIDENT_LIFECYCLE_STATE
          .RESOLVED,

      transition,

      resolvedAt:
        now,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // CLOSE INCIDENT
  // ==========================================================================

  async close(
    input = {},
    dependencies = {}
  ) {
    this.assertBaseInput(
      input
    );

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status;

    if (
      currentState ===
      INCIDENT_LIFECYCLE_STATE
        .CLOSED
    ) {
      return {
        success:
          true,

        resolved:
          true,

        closed:
          true,

        noOp:
          true,

        incidentId:
          input.incidentId,

        fromState:
          currentState,

        toState:
          currentState,

        executionAuthorized:
          false,
      };
    }

    if (
      currentState !==
      INCIDENT_LIFECYCLE_STATE
        .RESOLVED
    ) {
      throw Object.assign(
        new Error(
          `Incident must be RESOLVED before closure. Current state: ${currentState}`
        ),
        {
          code:
            "INCIDENT_CLOSURE_STATE_INVALID",
        }
      );
    }

    const transition =
      this.stateMachine
        .transition({
          fromState:
            currentState,

          toState:
            INCIDENT_LIFECYCLE_STATE
              .CLOSED,

          reason:
            input.reason ||
            "Incident closure completed after stable recovery.",

          actor:
            input.actor,

          source: {
            phase:
              10,

            component:
              "incidentClosureService",

            referenceId:
              input.verificationId ||
              null,
          },

          metadata: {
            verificationId:
              input.verificationId ||
              null,
          },

          executionAuthorized:
            false,
        });

    const now =
      new Date();

    incident.lifecycleState =
      INCIDENT_LIFECYCLE_STATE
        .CLOSED;

    if (
      "status" in
      incident
    ) {
      incident.status =
        INCIDENT_LIFECYCLE_STATE
          .CLOSED;
    }

    incident.closedAt =
      now;

    incident.closedBy =
      input.actor
        ?.id ||
      "aira";

    incident.closure = {
      verificationId:
        input.verificationId ||
        null,

      reason:
        transition.reason,

      closedAt:
        now,
    };

    await this.persistIncident(
      incident,
      dependencies
    );

    return {
      success:
        true,

      resolved:
        true,

      closed:
        true,

      noOp:
        false,

      incidentId:
        input.incidentId,

      fromState:
        currentState,

      toState:
        INCIDENT_LIFECYCLE_STATE
          .CLOSED,

      transition,

      closedAt:
        now,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // RESOLVE + CLOSE
  // ==========================================================================

  async finalize(
    input = {},
    dependencies = {}
  ) {
    this.assertBaseInput(
      input
    );

    this.assertEligibility(
      input.closureEligibility
    );

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status;

    if (
      currentState ===
      INCIDENT_LIFECYCLE_STATE
        .CLOSED
    ) {
      return {
        success:
          true,

        resolved:
          true,

        closed:
          true,

        noOp:
          true,

        incidentId:
          input.incidentId,

        executionAuthorized:
          false,
      };
    }

    if (
      currentState ===
      INCIDENT_LIFECYCLE_STATE
        .STABILITY_OBSERVATION
    ) {
      await this.markResolved(
        input,
        dependencies
      );
    }

    return this.close(
      input,
      dependencies
    );
  }

  // ==========================================================================
  // INCIDENT LOADING
  // ==========================================================================

  async loadIncident(
    input,
    dependencies
  ) {
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
        throw Object.assign(
          new Error(
            "Incident not found"
          ),
          {
            code:
              "INCIDENT_NOT_FOUND",
          }
        );
      }

      return incident;
    }

    if (
      input.incident
    ) {
      return input.incident;
    }

    throw Object.assign(
      new Error(
        "Incident provider is required"
      ),
      {
        code:
          "INCIDENT_PROVIDER_REQUIRED",
      }
    );
  }

  async persistIncident(
    incident,
    dependencies
  ) {
    if (
      typeof dependencies
        .saveIncident ===
      "function"
    ) {
      await dependencies
        .saveIncident(
          incident
        );

      return;
    }

    if (
      typeof incident.save ===
      "function"
    ) {
      await incident
        .save();

      return;
    }

    throw Object.assign(
      new Error(
        "Incident persistence provider is required"
      ),
      {
        code:
          "INCIDENT_PERSISTENCE_REQUIRED",
      }
    );
  }

  // ==========================================================================
  // ELIGIBILITY
  // ==========================================================================

  assertEligibility(
    eligibility
  ) {
    if (
      !eligibility ||
      eligibility.decision !==
        CLOSURE_DECISION
          .ELIGIBLE ||
      eligibility.eligible !==
        true
    ) {
      throw Object.assign(
        new Error(
          "Incident is not eligible for lifecycle closure"
        ),
        {
          code:
            "INCIDENT_CLOSURE_NOT_ELIGIBLE",
        }
      );
    }
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertBaseInput(
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
          "Incident closure input is required"
        ),
        {
          code:
            "INCIDENT_CLOSURE_INPUT_REQUIRED",
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
          "Incident closure requires organization, environment and incident scope"
        ),
        {
          code:
            "INCIDENT_CLOSURE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Incident closure service cannot authorize execution"
        ),
        {
          code:
            "INCIDENT_CLOSURE_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new IncidentClosureService();

module.exports
  .IncidentClosureService =
  IncidentClosureService;