"use strict";

const {
  incidentRepository,
  signalRepository,
  signalCorrelationRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  ACTIVE_INCIDENT_STATUSES,
} =
  require(
    "../../constants/incidents"
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

    const organizationId =
      String(
        incident.organizationId
      );

    const environmentId =
      String(
        incident.environmentId
      );

    /*
     * PostgreSQL IncidentRepository intentionally supports a constrained,
     * canonical filter language.
     *
     * Instead of pushing Mongo-style:
     *
     *   $or
     *   _id.$ne
     *   signalIds.$in
     *
     * into the persistence layer, retrieve the tenant/service/status candidate
     * set first and perform correlation matching provider-neutrally here.
     */
    const candidates =
      await incidentRepository
        .findMany({
          organizationId,

          environmentId,

          serviceId:
            incident.serviceId,

          status: {
            $in:
              ACTIVE_INCIDENT_STATUSES,
          },
        });

    const incidentSignalIds =
      new Set(
        (
          incident.signalIds ||
          []
        ).map(
          (
            value
          ) =>
            String(
              value
            )
        )
      );

    return (
      Array.isArray(
        candidates
      )
        ? candidates
        : []
    )
      .filter(
        (
          candidate
        ) =>
          !this.sameIdentifier(
            candidate._id,
            incident._id
          )
      )
      .filter(
        (
          candidate
        ) => {
          if (
            incident.correlationGroupId &&
            candidate.correlationGroupId &&
            String(
              candidate.correlationGroupId
            ) ===
              String(
                incident.correlationGroupId
              )
          ) {
            return true;
          }

          if (
            incident.signalFingerprint &&
            candidate.signalFingerprint &&
            candidate.signalFingerprint ===
              incident.signalFingerprint
          ) {
            return true;
          }

          if (
            incidentSignalIds.size >
              0 &&
            Array.isArray(
              candidate.signalIds
            )
          ) {
            return candidate.signalIds
              .some(
                (
                  signalId
                ) =>
                  incidentSignalIds.has(
                    String(
                      signalId
                    )
                  )
              );
          }

          return false;
        }
      )
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            first.detectedAt ||
            first.createdAt ||
            0
          ) -
          new Date(
            second.detectedAt ||
            second.createdAt ||
            0
          )
      );
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
     * This keeps incident identity stable and avoids unnecessary reference
     * churn across downstream diagnosis/execution/audit records.
     */
    return [
      ...incidents,
    ].sort(
      (
        first,
        second
      ) =>
        new Date(
          first.detectedAt ||
          first.createdAt ||
          0
        ) -
        new Date(
          second.detectedAt ||
          second.createdAt ||
          0
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
      this.sameIdentifier(
        primary._id,
        duplicate._id
      )
    ) {
      return primary;
    }

    this.assertSameScope(
      primary,
      duplicate
    );

    const signalIds =
      Array.from(
        new Set([
          ...(
            primary.signalIds ||
            []
          ).map(
            (
              value
            ) =>
              String(
                value
              )
          ),

          ...(
            duplicate.signalIds ||
            []
          ).map(
            (
              value
            ) =>
              String(
                value
              )
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
            primary.providers ||
            []
          ),

          ...(
            duplicate.providers ||
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
        Number(
          primary.occurrenceCount
        ) ||
        0
      ) +
      (
        Number(
          duplicate.occurrenceCount
        ) ||
        0
      );

    primary.evidenceCount =
      (
        Number(
          primary.evidenceCount
        ) ||
        0
      ) +
      (
        Number(
          duplicate.evidenceCount
        ) ||
        0
      );

    primary.lastObservedAt =
      this.latestDate(
        primary.lastObservedAt,
        duplicate.lastObservedAt
      );

    primary.lastSignalAt =
      this.latestDate(
        primary.lastSignalAt,
        duplicate.lastSignalAt
      );

    primary.correlationConfidence =
      Math.max(
        Number(
          primary.correlationConfidence
        ) ||
          0,

        Number(
          duplicate.correlationConfidence
        ) ||
          0
      );

    primary.correlationGroupId =
      primary.correlationGroupId ||
      duplicate.correlationGroupId ||
      null;

    primary.signalFingerprint =
      primary.signalFingerprint ||
      duplicate.signalFingerprint ||
      null;

    primary.severity =
      this.higherSeverity(
        primary.severity,
        duplicate.severity
      );

    if (
      !Array.isArray(
        primary.timeline
      )
    ) {
      primary.timeline =
        [];
    }

    primary.timeline.push({
      occurredAt:
        new Date(),

      eventType:
        "incident_merged",

      actor:
        "system",

      description:
        `Merged incident ${String(
          duplicate._id
        )} into this incident after correlation evidence identified a shared failure.`,

      metadata: {
        mergedIncidentId:
          String(
            duplicate._id
          ),

        signalCount:
          signalIds.length,

        providerCount:
          providers.length,
      },
    });

    // ------------------------------------------------------------------------
    // SAVE PRIMARY
    // ------------------------------------------------------------------------

    const persistedPrimary =
      await incidentRepository
        .save(
          primary
        );

    if (
      persistedPrimary
    ) {
      primary =
        persistedPrimary;
    }

    // ------------------------------------------------------------------------
    // REPOINT SIGNALS
    // ------------------------------------------------------------------------

    await signalRepository
      .updateMany(
        {
          organizationId:
            String(
              primary.organizationId
            ),

          environmentId:
            String(
              primary.environmentId
            ),

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

    /*
     * correlationGroupId is unique within organization/environment.
     * updateOne() is therefore the correct abstraction; the previous
     * Mongoose updateMany() was unnecessary.
     */
    if (
      duplicate.correlationGroupId
    ) {
      await signalCorrelationRepository
        .updateOne(
          {
            organizationId:
              String(
                primary.organizationId
              ),

            environmentId:
              String(
                primary.environmentId
              ),

            correlationGroupId:
              duplicate.correlationGroupId,
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
      ACTIVE_INCIDENT_STATUSES
        .includes(
          duplicate.status
        )
    ) {
      /*
       * Preserve the incident state machine:
       *
       * active
       *   ↓
       * resolved
       *   ↓
       * closed
       */
      await incidentService
        .transitionStatus(
          duplicate._id,
          {
            organizationId:
              duplicate.organizationId,

            environmentId:
              duplicate.environmentId,

            targetStatus:
              "resolved",

            actor:
              "system",

            reason:
              `Incident merged into ${String(
                primary._id
              )}.`,

            metadata: {
              mergedInto:
                String(
                  primary._id
                ),
            },
          }
        );

      /*
       * Re-read through the provider-neutral repository instead of
       * Incident.findById().
       */
      const refreshed =
        await incidentRepository
          .findOne({
            _id:
              duplicate._id,

            organizationId:
              String(
                duplicate.organizationId
              ),

            environmentId:
              String(
                duplicate.environmentId
              ),
          });

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
                refreshed.organizationId,

              environmentId:
                refreshed.environmentId,

              targetStatus:
                "closed",

              actor:
                "system",

              reason:
                `Duplicate incident closed after merge into ${String(
                  primary._id
                )}.`,

              metadata: {
                mergedInto:
                  String(
                    primary._id
                  ),
              },
            }
          );
      }
    }

    // ------------------------------------------------------------------------
    // RETURN CANONICAL PRIMARY
    // ------------------------------------------------------------------------

    return (
      await incidentRepository
        .findOne({
          _id:
            primary._id,

          organizationId:
            String(
              primary.organizationId
            ),

          environmentId:
            String(
              primary.environmentId
            ),
        })
    ) ||
      primary;
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

    const all = [
      incident,
      ...candidates,
    ];

    let primary =
      this.choosePrimary(
        all
      );

    const duplicates =
      all.filter(
        (
          item
        ) =>
          !this.sameIdentifier(
            item._id,
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
        await this.merge(
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
  // SCOPE VALIDATION
  // ==========================================================================

  assertSameScope(
    primary,
    duplicate
  ) {
    if (
      String(
        primary.organizationId
      ) !==
        String(
          duplicate.organizationId
        ) ||
      String(
        primary.environmentId
      ) !==
        String(
          duplicate.environmentId
        )
    ) {
      throw Object.assign(
        new Error(
          "Cross-tenant or cross-environment incident merge is forbidden"
        ),
        {
          code:
            "INCIDENT_MERGE_SCOPE_MISMATCH",

          status:
            403,
        }
      );
    }
  }

  // ==========================================================================
  // IDENTIFIER
  // ==========================================================================

  sameIdentifier(
    first,
    second
  ) {
    if (
      first ===
        null ||
      first ===
        undefined ||
      second ===
        null ||
      second ===
        undefined
    ) {
      return false;
    }

    return (
      String(
        first
      ) ===
      String(
        second
      )
    );
  }

  // ==========================================================================
  // SEVERITY
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

  // ==========================================================================
  // DATE
  // ==========================================================================

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