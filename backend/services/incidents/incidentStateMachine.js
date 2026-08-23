"use strict";

const {
  INCIDENT_STATUSES,
} =
  require(
    "../../constants/incidents"
  );

// ============================================================================
// TRANSITIONS
// ============================================================================

const TRANSITIONS =
  Object.freeze({
    open: [
      "acknowledged",
      "investigating",
      "recovering",
      "resolved",
    ],

    acknowledged: [
      "investigating",
      "recovering",
      "resolved",
    ],

    investigating: [
      "recovering",
      "resolved",
    ],

    recovering: [
      "investigating",
      "resolved",
    ],

    resolved: [
      "open",
      "closed",
    ],

    closed: [
      "open",
    ],
  });

// ============================================================================
// STATE MACHINE
// ============================================================================

class IncidentStateMachine {
  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  isValidStatus(
    status
  ) {
    return INCIDENT_STATUSES
      .includes(
        status
      );
  }

  canTransition(
    from,
    to
  ) {
    if (
      !this.isValidStatus(
        from
      ) ||
      !this.isValidStatus(
        to
      )
    ) {
      return false;
    }

    if (
      from ===
      to
    ) {
      return true;
    }

    return Boolean(
      TRANSITIONS[
        from
      ]
        ?.includes(
          to
        )
    );
  }

  assertTransition(
    from,
    to
  ) {
    if (
      !this.isValidStatus(
        from
      )
    ) {
      throw Object.assign(
        new Error(
          `Unknown incident status: ${from}`
        ),
        {
          code:
            "INCIDENT_STATUS_INVALID",

          status:
            400,

          incidentStatus:
            from,
        }
      );
    }

    if (
      !this.isValidStatus(
        to
      )
    ) {
      throw Object.assign(
        new Error(
          `Unknown target incident status: ${to}`
        ),
        {
          code:
            "INCIDENT_TARGET_STATUS_INVALID",

          status:
            400,

          targetStatus:
            to,
        }
      );
    }

    if (
      !this.canTransition(
        from,
        to
      )
    ) {
      throw Object.assign(
        new Error(
          `Incident cannot transition from "${from}" to "${to}"`
        ),
        {
          code:
            "INCIDENT_TRANSITION_NOT_ALLOWED",

          status:
            409,

          from,

          to,

          allowedTransitions:
            this
              .getAllowedTransitions(
                from
              ),
        }
      );
    }

    return true;
  }

  getAllowedTransitions(
    status
  ) {
    if (
      !this.isValidStatus(
        status
      )
    ) {
      return [];
    }

    return [
      ...(
        TRANSITIONS[
          status
        ] ||
        []
      ),
    ];
  }

  // ==========================================================================
  // TRANSITION INCIDENT
  // ==========================================================================

  transition(
    incident,
    targetStatus,
    {
      actor =
        "system",

      actorId =
        null,

      reason =
        null,

      metadata =
        {},

      occurredAt =
        new Date(),
    } = {}
  ) {
    if (!incident) {
      throw Object.assign(
        new Error(
          "Incident is required"
        ),
        {
          code:
            "INCIDENT_REQUIRED",
        }
      );
    }

    const currentStatus =
      incident.status;

    this.assertTransition(
      currentStatus,
      targetStatus
    );

    /*
     * Idempotent same-state transition.
     */
    if (
      currentStatus ===
      targetStatus
    ) {
      return {
        changed:
          false,

        previousStatus:
          currentStatus,

        currentStatus:
          currentStatus,

        incident,
      };
    }

    incident.status =
      targetStatus;

    this.applyTimestamps(
      incident,
      targetStatus,
      occurredAt
    );

    const eventType =
      this.eventTypeFor(
        targetStatus,
        currentStatus
      );

    /*
     * PostgreSQL documents are provider-neutral plain objects,
     * so do not assume Mongoose initialized this array.
     */
    if (
      !Array.isArray(
        incident.timeline
      )
    ) {
      incident.timeline =
        [];
    }

    incident.timeline
      .push({
        occurredAt,

        eventType,

        actor,

        actorId,

        description:
          reason ||
          this.defaultDescription(
            currentStatus,
            targetStatus
          ),

        metadata: {
          previousStatus:
            currentStatus,

          newStatus:
            targetStatus,

          ...metadata,
        },
      });

    return {
      changed:
        true,

      previousStatus:
        currentStatus,

      currentStatus:
        targetStatus,

      incident,
    };
  }

  // ==========================================================================
  // TIMESTAMPS
  // ==========================================================================

  applyTimestamps(
    incident,
    targetStatus,
    occurredAt
  ) {
    switch (
      targetStatus
    ) {
      case "acknowledged":
        if (
          !incident
            .acknowledgedAt
        ) {
          incident
            .acknowledgedAt =
            occurredAt;
        }

        break;

      case "resolved":
        incident
          .resolvedAt =
          occurredAt;

        break;

      case "closed":
        incident
          .closedAt =
          occurredAt;

        break;

      case "open":
        incident
          .resolvedAt =
          null;

        incident
          .closedAt =
          null;

        incident
          .resolution =
          null;

        incident
          .resolutionType =
          null;

        incident
          .reopenCount =
          (
            incident
              .reopenCount ||
            0
          ) + 1;

        incident
          .lastReopenedAt =
          occurredAt;

        break;

      default:
        break;
    }
  }

  // ==========================================================================
  // EVENT NAME
  // ==========================================================================

  eventTypeFor(
    targetStatus,
    previousStatus
  ) {
    if (
      targetStatus ===
      "open" &&
      [
        "resolved",
        "closed",
      ].includes(
        previousStatus
      )
    ) {
      return "reopened";
    }

    switch (
      targetStatus
    ) {
      case "acknowledged":
        return "acknowledged";

      case "investigating":
        return "investigating";

      case "recovering":
        return "recovering";

      case "resolved":
        return "resolved";

      case "closed":
        return "closed";

      default:
        return "status_changed";
    }
  }

  // ==========================================================================
  // DEFAULT DESCRIPTION
  // ==========================================================================

  defaultDescription(
    from,
    to
  ) {
    if (
      to ===
      "open" &&
      [
        "resolved",
        "closed",
      ].includes(
        from
      )
    ) {
      return "Incident reopened.";
    }

    return (
      `Incident status changed from ${from} to ${to}.`
    );
  }
}

const incidentStateMachine =
  new IncidentStateMachine();

module.exports =
  incidentStateMachine;

module.exports
  .IncidentStateMachine =
  IncidentStateMachine;

module.exports
  .TRANSITIONS =
  TRANSITIONS;