"use strict";

const {
  Incident,
} =
  require(
    "../../models/Incident"
  );

const incidentService =
  require(
    "./incidentService"
  );

class IncidentRecurrenceService {
  constructor() {
    /*
     * If the same failure returns shortly after resolution,
     * reuse the existing incident instead of creating noise.
     *
     * Default: 30 minutes.
     */
    this.defaultRecurrenceWindowMs =
      Number(
        process.env
          .INCIDENT_RECURRENCE_WINDOW_MS
      ) ||
      30 * 60 * 1000;
  }

  // ==========================================================================
  // FIND RECENT RESOLVED INCIDENT
  // ==========================================================================

  async findRecentResolved(
    signal,
    correlationGroup = null,
    {
      windowMs =
        this.defaultRecurrenceWindowMs,
    } = {}
  ) {
    if (
      !signal?.organizationId ||
      !signal?.environmentId ||
      !signal?.serviceId
    ) {
      throw Object.assign(
        new Error(
          "Complete recurrence context is required"
        ),
        {
          code:
            "INCIDENT_RECURRENCE_CONTEXT_REQUIRED",
        }
      );
    }

    const threshold =
      new Date(
        Date.now() -
        windowMs
      );

    const filter = {
      organizationId:
        signal.organizationId,

      environmentId:
        signal.environmentId,

      serviceId:
        signal.serviceId,

      status: {
        $in: [
          "resolved",
          "closed",
        ],
      },

      resolvedAt: {
        $gte:
          threshold,
      },
    };

    const correlationGroupId =
      correlationGroup
        ?.correlationGroupId ||
      signal
        .correlationGroupId ||
      null;

    if (
      correlationGroupId
    ) {
      filter.$or = [
        {
          correlationGroupId,
        },

        {
          signalFingerprint:
            signal.fingerprint,
        },
      ];
    } else if (
      signal.fingerprint
    ) {
      filter.signalFingerprint =
        signal.fingerprint;
    } else if (
      signal.monitorId
    ) {
      filter.monitorId =
        signal.monitorId;
    } else {
      return null;
    }

    return Incident
      .findOne(
        filter
      )
      .sort({
        resolvedAt:
          -1,
      });
  }

  // ==========================================================================
  // REOPEN RECURRENT INCIDENT
  // ==========================================================================

  async reopenForRecurrence(
    incident,
    signal,
    correlationGroup = null
  ) {
    if (
      !incident
    ) {
      return null;
    }

    const now =
      signal.observedAt ||
      new Date();

    /*
     * Reopen through canonical state machine path.
     */
    const reopened =
      await incidentService
        .transitionStatus(
          incident._id,
          {
            organizationId:
              incident
                .organizationId,

            environmentId:
              incident
                .environmentId,

            userId:
              null,

            targetStatus:
              "open",

            actor:
              "system",

            reason:
              "Previously resolved incident recurred.",

            metadata: {
              recurrence:
                true,

              signalId:
                signal.signalId,

              provider:
                signal.provider,

              correlationGroupId:
                correlationGroup
                  ?.correlationGroupId ||
                signal
                  .correlationGroupId ||
                null,
            },
          }
        );

    if (
      !reopened
    ) {
      return null;
    }

    reopened.lastObservedAt =
      now;

    reopened.lastSignalAt =
      now;

    reopened.resolution =
      null;

    reopened.resolutionType =
      null;

    reopened.timeline.push({
      occurredAt:
        now,

      eventType:
        "recurrence_detected",

      actor:
        "system",

      description:
        "AIRA detected recurrence of the previously resolved incident.",

      metadata: {
        signalId:
          signal.signalId,

        provider:
          signal.provider,

        correlationGroupId:
          correlationGroup
            ?.correlationGroupId ||
          signal
            .correlationGroupId ||
          null,
      },
    });

    await reopened
      .save();

    return reopened;
  }

  // ==========================================================================
  // CHECK + REOPEN
  // ==========================================================================

  async handleRecurrence(
    signal,
    correlationGroup = null,
    options = {}
  ) {
    const incident =
      await this
        .findRecentResolved(
          signal,
          correlationGroup,
          options
        );

    if (
      !incident
    ) {
      return {
        recurrence:
          false,

        incident:
          null,
      };
    }

    const reopened =
      await this
        .reopenForRecurrence(
          incident,
          signal,
          correlationGroup
        );

    return {
      recurrence:
        Boolean(
          reopened
        ),

      incident:
        reopened,
    };
  }
}

module.exports =
  new IncidentRecurrenceService();

module.exports
  .IncidentRecurrenceService =
  IncidentRecurrenceService;