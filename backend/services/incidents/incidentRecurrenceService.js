"use strict";

const {
  incidentRepository,
} =
  require(
    "../../persistence/repositories"
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

    /*
     * Keep the repository query within the provider-neutral
     * incident filter contract.
     *
     * resolvedAt range and correlation OR logic are applied below
     * because those operators are not yet part of the generic
     * PostgreSQL IncidentRepository filter contract.
     */
    const candidates =
      await incidentRepository
        .findMany({
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
        });

    const correlationGroupId =
      correlationGroup
        ?.correlationGroupId ||
      signal
        .correlationGroupId ||
      null;

    const matching =
      (
        Array.isArray(
          candidates
        )
          ? candidates
          : []
      )
        .filter(
          (
            incident
          ) => {
            const resolvedAt =
              incident
                .resolvedAt;

            if (
              !resolvedAt
            ) {
              return false;
            }

            const resolvedTime =
              new Date(
                resolvedAt
              ).getTime();

            if (
              Number.isNaN(
                resolvedTime
              ) ||
              resolvedTime <
                threshold.getTime()
            ) {
              return false;
            }

            if (
              correlationGroupId
            ) {
              return (
                incident
                  .correlationGroupId ===
                  correlationGroupId ||
                (
                  signal.fingerprint &&
                  incident
                    .signalFingerprint ===
                    signal.fingerprint
                )
              );
            }

            if (
              signal.fingerprint
            ) {
              return (
                incident
                  .signalFingerprint ===
                signal.fingerprint
              );
            }

            if (
              signal.monitorId
            ) {
              return (
                this.sameIdentifier(
                  incident.monitorId,
                  signal.monitorId
                )
              );
            }

            return false;
          }
        )
        .sort(
          (
            left,
            right
          ) =>
            new Date(
              right.resolvedAt ||
              0
            ) -
            new Date(
              left.resolvedAt ||
              0
            )
        );

    return (
      matching[0] ||
      null
    );
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
     * Reopen through canonical state-machine path.
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

    /*
     * Mongo schema defaults used to guarantee timeline existed.
     * PostgreSQL domain objects must not depend on that behavior.
     */
    if (
      !Array.isArray(
        reopened.timeline
      )
    ) {
      reopened.timeline =
        [];
    }

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

    /*
     * Phase 13 provider-neutral persistence boundary.
     *
     * Never call reopened.save():
     * - Mongo repository owns Mongoose persistence.
     * - PostgreSQL repository owns SQL persistence.
     */
    const saved =
      await incidentRepository
        .save(
          reopened
        );

    return (
      saved ||
      reopened
    );
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

  // ==========================================================================
  // IDENTIFIER COMPARISON
  // ==========================================================================

  sameIdentifier(
    left,
    right
  ) {
    if (
      left ===
        null ||
      left ===
        undefined ||
      right ===
        null ||
      right ===
        undefined
    ) {
      return false;
    }

    return (
      String(
        left
      ) ===
      String(
        right
      )
    );
  }
}

module.exports =
  new IncidentRecurrenceService();

module.exports
  .IncidentRecurrenceService =
  IncidentRecurrenceService;