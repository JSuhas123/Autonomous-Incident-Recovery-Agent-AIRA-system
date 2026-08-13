"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  Incident,
} =
  require(
    "../../models/Incident"
  );

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

const {
  SignalCorrelation,
} =
  require(
    "../../models/SignalCorrelation"
  );

const incidentService =
  require(
    "./incidentService"
  );

class IncidentMergeService {
  // ==========================================================================
  // FIND MERGE CANDIDATES
  // ==========================================================================

  async findCandidates(
    incident
  ) {
    if (
      !incident?.organizationId ||
      !incident?.environmentId ||
      !incident?.serviceId
    ) {
      throw Object.assign(
        new Error(
          "Complete incident merge context is required"
        ),
        {
          code:
            "INCIDENT_MERGE_CONTEXT_REQUIRED",
        }
      );
    }

    const clauses = [];

    if (
      incident
        .correlationGroupId
    ) {
      clauses.push({
        correlationGroupId:
          incident
            .correlationGroupId,
      });
    }

    if (
      incident
        .signalFingerprint
    ) {
      clauses.push({
        signalFingerprint:
          incident
            .signalFingerprint,
      });
    }

    if (
      Array.isArray(
        incident.signalIds
      ) &&
      incident
        .signalIds
        .length >
      0
    ) {
      clauses.push({
        signalIds: {
          $in:
            incident
              .signalIds,
        },
      });
    }

    if (
      clauses.length ===
      0
    ) {
      return [];
    }

    return Incident
      .find({
        _id: {
          $ne:
            incident._id,
        },

        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        serviceId:
          incident
            .serviceId,

        status: {
          $in: [
            "open",
            "acknowledged",
            "investigating",
            "recovering",
          ],
        },

        $or:
          clauses,
      })
      .sort({
        detectedAt:
          1,
      });
  }

  // ==========================================================================
  // CHOOSE SURVIVOR
  // ==========================================================================

  choosePrimary(
    incidents
  ) {
    if (
      !Array.isArray(
        incidents
      ) ||
      incidents.length ===
        0
    ) {
      return null;
    }

    /*
     * Oldest incident survives.
     *
     * This keeps references stable and prevents unnecessary
     * incident identity churn.
     */
    return [
      ...incidents,
    ]
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            first.detectedAt ||
            first.createdAt
          ) -
          new Date(
            second.detectedAt ||
            second.createdAt
          )
      )[0];
  }

  // ==========================================================================
  // MERGE
  // ==========================================================================

  async merge(
    primary,
    duplicate
  ) {
    if (
      !primary ||
      !duplicate
    ) {
      throw Object.assign(
        new Error(
          "Primary and duplicate incidents are required"
        ),
        {
          code:
            "INCIDENT_MERGE_REQUIRED",
        }
      );
    }

    if (
      String(
        primary._id
      ) ===
      String(
        duplicate._id
      )
    ) {
      return primary;
    }

    const signalIds =
      Array.from(
        new Set([
          ...(
            primary
              .signalIds ||
            []
          ),

          ...(
            duplicate
              .signalIds ||
            []
          ),
        ])
      )
        .slice(
          -500
        );

    const providers =
      Array.from(
        new Set([
          ...(
            primary
              .providers ||
            []
          ),

          ...(
            duplicate
              .providers ||
            []
          ),
        ])
      );

    primary.signalIds =
      signalIds;

    primary.providers =
      providers;

    primary.providerCount =
      providers.length;

    primary.occurrenceCount =
      (
        primary
          .occurrenceCount ||
        0
      ) +
      (
        duplicate
          .occurrenceCount ||
        0
      );

    primary.evidenceCount =
      (
        primary
          .evidenceCount ||
        0
      ) +
      (
        duplicate
          .evidenceCount ||
        0
      );

    primary.lastObservedAt =
      this.latestDate(
        primary
          .lastObservedAt,
        duplicate
          .lastObservedAt
      );

    primary.lastSignalAt =
      this.latestDate(
        primary
          .lastSignalAt,
        duplicate
          .lastSignalAt
      );

    primary.correlationConfidence =
      Math.max(
        primary
          .correlationConfidence ||
        0,

        duplicate
          .correlationConfidence ||
        0
      );

    primary.correlationGroupId =
      primary
        .correlationGroupId ||
      duplicate
        .correlationGroupId ||
      null;

    primary.signalFingerprint =
      primary
        .signalFingerprint ||
      duplicate
        .signalFingerprint ||
      null;

    primary.severity =
      this.higherSeverity(
        primary.severity,
        duplicate.severity
      );

    primary.timeline.push({
      occurredAt:
        new Date(),

      eventType:
        "incident_merged",

      actor:
        "system",

      description:
        `Merged incident ${duplicate._id} into this incident after correlation evidence identified a shared failure.`,

      metadata: {
        mergedIncidentId:
          duplicate._id,

        signalCount:
          signalIds.length,

        providerCount:
          providers.length,
      },
    });

    await primary
      .save();

    // ------------------------------------------------------------------------
    // REPOINT SIGNALS
    // ------------------------------------------------------------------------

    await Signal
      .updateMany(
        {
          organizationId:
            primary
              .organizationId,

          environmentId:
            primary
              .environmentId,

          incidentId:
            duplicate._id,
        },
        {
          $set: {
            incidentId:
              primary._id,
          },
        }
      );

    // ------------------------------------------------------------------------
    // REPOINT CORRELATION GROUP
    // ------------------------------------------------------------------------

    if (
      duplicate
        .correlationGroupId
    ) {
      await SignalCorrelation
        .updateMany(
          {
            organizationId:
              primary
                .organizationId,

            environmentId:
              primary
                .environmentId,

            correlationGroupId:
              duplicate
                .correlationGroupId,
          },
          {
            $set: {
              incidentId:
                primary._id,
            },
          }
        );
    }

    // ------------------------------------------------------------------------
    // CLOSE DUPLICATE
    // ------------------------------------------------------------------------

    if (
      [
        "open",
        "acknowledged",
        "investigating",
        "recovering",
      ].includes(
        duplicate.status
      )
    ) {
      /*
       * To obey the state machine, first resolve then close.
       */
      await incidentService
        .transitionStatus(
          duplicate._id,
          {
            organizationId:
              duplicate
                .organizationId,

            environmentId:
              duplicate
                .environmentId,

            targetStatus:
              "resolved",

            actor:
              "system",

            reason:
              `Incident merged into ${primary._id}.`,

            metadata: {
              mergedInto:
                primary._id,
            },
          }
        );

      const refreshed =
        await Incident
          .findById(
            duplicate._id
          );

      if (
        refreshed &&
        refreshed.status ===
          "resolved"
      ) {
        await incidentService
          .transitionStatus(
            refreshed._id,
            {
              organizationId:
                refreshed
                  .organizationId,

              environmentId:
                refreshed
                  .environmentId,

              targetStatus:
                "closed",

              actor:
                "system",

              reason:
                `Duplicate incident closed after merge into ${primary._id}.`,

              metadata: {
                mergedInto:
                  primary._id,
              },
            }
          );
      }
    }

    return Incident
      .findById(
        primary._id
      );
  }

  // ==========================================================================
  // MERGE ALL CANDIDATES
  // ==========================================================================

  async mergeCandidates(
    incident
  ) {
    const candidates =
      await this
        .findCandidates(
          incident
        );

    if (
      candidates.length ===
      0
    ) {
      return {
        merged:
          false,

        incident,

        mergedIncidentIds:
          [],
      };
    }

    const all =
      [
        incident,
        ...candidates,
      ];

    let primary =
      this.choosePrimary(
        all
      );

    const duplicates =
      all.filter(
        (item) =>
          String(
            item._id
          ) !==
          String(
            primary._id
          )
      );

    const mergedIncidentIds =
      [];

    for (
      const duplicate
      of duplicates
    ) {
      primary =
        await this
          .merge(
            primary,
            duplicate
          );

      mergedIncidentIds.push(
        String(
          duplicate._id
        )
      );
    }

    return {
      merged:
        mergedIncidentIds
          .length >
        0,

      incident:
        primary,

      mergedIncidentIds,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  higherSeverity(
    first,
    second
  ) {
    const order = {
      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    return (
      (
        order[
          second
        ] ||
        0
      ) >
      (
        order[
          first
        ] ||
        0
      )
    )
      ? second
      : first;
  }

  latestDate(
    first,
    second
  ) {
    if (
      !first
    ) {
      return second ||
        null;
    }

    if (
      !second
    ) {
      return first;
    }

    return (
      new Date(
        first
      ) >
      new Date(
        second
      )
    )
      ? first
      : second;
  }
}

module.exports =
  new IncidentMergeService();

module.exports
  .IncidentMergeService =
  IncidentMergeService;