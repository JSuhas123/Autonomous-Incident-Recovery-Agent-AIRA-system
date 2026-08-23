"use strict";

const {
  signalRepository,
  signalCorrelationRepository,
} =
  require(
    "../../persistence/repositories"
  );

const diagnosisQueueService =
  require(
    "../diagnosis/diagnosisQueueService"
  );

const incidentEnrichmentService =
  require(
    "./incidentEnrichmentService"
  );

const incidentDetectionService =
  require(
    "./incidentDetectionService"
  );

const incidentService =
  require(
    "./incidentService"
  );

const incidentRecurrenceService =
  require(
    "./incidentRecurrenceService"
  );

const incidentMergeService =
  require(
    "./incidentMergeService"
  );

class IncidentOrchestrationService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async processSignal(
    signal
  ) {
    if (!signal) {
      throw Object.assign(
        new Error(
          "Signal is required"
        ),
        {
          code:
            "INCIDENT_ORCHESTRATION_SIGNAL_REQUIRED",
        }
      );
    }

    const evaluation =
      await incidentDetectionService
        .evaluateSignal(
          signal
        );

    // ========================================================================
    // IGNORE / OBSERVE
    // ========================================================================

    if (
      evaluation.action ===
        "ignore" ||
      evaluation.action ===
        "observe"
    ) {
      return {
        processed:
          true,

        action:
          evaluation.action,

        incident:
          null,

        reason:
          evaluation.reason,
      };
    }

    // ========================================================================
    // RECOVERY
    // ========================================================================

    if (
      evaluation.action ===
      "recovery"
    ) {
      const incidents =
        await incidentService
          .resolveFromSignal({
            signal,

            resolvedAt:
              signal.observedAt ||
              new Date(),

            reason:
              evaluation.reason,
          });

      await this
        .linkResolvedSignal(
          signal,
          incidents
        );

      return {
        processed:
          true,

        action:
          "resolved",

        incidents,

        incidentCount:
          incidents.length,

        reason:
          evaluation.reason,
      };
    }

    // ========================================================================
    // OPEN / UPDATE
    // ========================================================================

    if (
      evaluation.action ===
        "open_or_update" &&
      evaluation
        .shouldOpenIncident
    ) {
      // ----------------------------------------------------------------------
      // RECURRENCE CHECK
      // ----------------------------------------------------------------------

      let recurrenceResult = {
        recurrence:
          false,

        incident:
          null,
      };

      try {
        recurrenceResult =
          await incidentRecurrenceService
            .handleRecurrence(
              signal,
              evaluation
                .correlationGroup
            );
      } catch (
        error
      ) {
        console.error(
          "[incident-orchestration] Incident recurrence evaluation failed:",
          error.message
        );
      }

      // ----------------------------------------------------------------------
      // CREATE / UPDATE INCIDENT
      // ----------------------------------------------------------------------

      const result =
        await incidentService
          .openOrUpdateFromSignal({
            signal,

            correlationGroup:
              evaluation
                .correlationGroup,

            detectedAt:
              signal.observedAt ||
              new Date(),
          });

      // ----------------------------------------------------------------------
      // LINK SIGNAL -> INCIDENT
      // ----------------------------------------------------------------------

      await this
        .linkSignalToIncident(
          signal,
          result.incident,
          evaluation
            .correlationGroup
        );

      // ----------------------------------------------------------------------
      // INCIDENT MERGE HARDENING
      // ----------------------------------------------------------------------

      let canonicalIncident =
        result.incident;

      let mergeResult = {
        merged:
          false,

        incident:
          result.incident,

        mergedIncidentIds:
          [],
      };

      try {
        mergeResult =
          await incidentMergeService
            .mergeCandidates(
              result.incident
            );

        canonicalIncident =
          mergeResult
            .incident ||
          result.incident;
      } catch (
        error
      ) {
        console.error(
          "[incident-orchestration] Incident merge evaluation failed:",
          error.message
        );
      }

      // ----------------------------------------------------------------------
      // RE-LINK AFTER MERGE
      // ----------------------------------------------------------------------

      if (
        canonicalIncident?._id &&
        String(
          canonicalIncident._id
        ) !==
        String(
          result.incident._id
        )
      ) {
        await this
          .linkSignalToIncident(
            signal,
            canonicalIncident,
            evaluation
              .correlationGroup
          );
      }

      // ----------------------------------------------------------------------
      // TOPOLOGY / IMPACT ENRICHMENT
      // ----------------------------------------------------------------------

      let enrichedIncident =
        canonicalIncident;

      try {
        enrichedIncident =
          await incidentEnrichmentService
            .enrich(
              canonicalIncident
            );
      } catch (
        error
      ) {
        console.error(
          "[incident-orchestration] Incident enrichment failed:",
          error.message
        );
      }

      // ----------------------------------------------------------------------
      // ASYNC DIAGNOSIS
      // ----------------------------------------------------------------------

      try {
        const diagnosisIncident =
          enrichedIncident ||
          canonicalIncident ||
          result.incident;

        if (
          diagnosisIncident?._id &&
          diagnosisIncident
            .organizationId &&
          diagnosisIncident
            .environmentId
        ) {
          let trigger =
            "occurrence_increased";

          if (
            result.created &&
            !recurrenceResult
              .recurrence
          ) {
            trigger =
              "incident_detected";
          } else if (
            recurrenceResult
              .recurrence
          ) {
            trigger =
              "incident_reopened";
          } else if (
            mergeResult
              .merged
          ) {
            trigger =
              "correlation_updated";
          }

          await diagnosisQueueService
            .requestDiagnosis({
              organizationId:
                diagnosisIncident
                  .organizationId,

              environmentId:
                diagnosisIncident
                  .environmentId,

              incidentId:
                diagnosisIncident
                  ._id,

              correlationId:
                signal
                  .correlationId ||
                null,

              correlationGroupId:
                evaluation
                  .correlationGroup
                  ?.correlationGroupId ||
                signal
                  .correlationGroupId ||
                null,

              trigger,

              metadata: {
                signalId:
                  signal.signalId ||
                  null,

                incidentCreated:
                  Boolean(
                    result.created
                  ),

                incidentUpdated:
                  Boolean(
                    result.updated
                  ),

                recurrence:
                  Boolean(
                    recurrenceResult
                      .recurrence
                  ),

                merged:
                  Boolean(
                    mergeResult
                      .merged
                  ),
              },
            });
        }
      } catch (
        error
      ) {
        console.error(
          "[incident-orchestration] Could not queue diagnosis:",
          error.message
        );
      }

      // ----------------------------------------------------------------------
      // RESULT
      // ----------------------------------------------------------------------

      return {
        processed:
          true,

        action:
          recurrenceResult
            .recurrence
            ? "reopened"
            : result.created
              ? "created"
              : mergeResult.merged
                ? "merged"
                : "updated",

        incident:
          enrichedIncident,

        created:
          result.created,

        updated:
          result.updated,

        recurrence:
          recurrenceResult
            .recurrence,

        merged:
          mergeResult
            .merged,

        mergedIncidentIds:
          mergeResult
            .mergedIncidentIds ||
          [],

        reason:
          evaluation.reason,
      };
    }

    // ========================================================================
    // NO ACTION
    // ========================================================================

    return {
      processed:
        true,

      action:
        "none",

      incident:
        null,

      reason:
        evaluation.reason ||
        "No incident action required.",
    };
  }

  // ==========================================================================
  // PROCESS BY SIGNAL ID
  // ==========================================================================

  async processSignalById(
    context,
    signalId
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete incident orchestration context is required"
        ),
        {
          code:
            "INCIDENT_ORCHESTRATION_CONTEXT_REQUIRED",
        }
      );
    }

    const signal =
      await signalRepository
        .findOne({
          organizationId:
            context
              .organizationId,

          environmentId:
            context
              .environmentId,

          signalId,
        });

    if (!signal) {
      throw Object.assign(
        new Error(
          "Signal not found"
        ),
        {
          code:
            "SIGNAL_NOT_FOUND",

          status:
            404,
        }
      );
    }

    return this
      .processSignal(
        signal
      );
  }

  // ==========================================================================
  // LINK SIGNAL -> INCIDENT
  // ==========================================================================

  async linkSignalToIncident(
    signal,
    incident,
    correlationGroup = null
  ) {
    if (
      !signal?._id ||
      !incident?._id
    ) {
      return;
    }

    const now =
      new Date();

    await signalRepository
      .updateOne(
        {
          _id:
            signal._id,

          organizationId:
            signal.organizationId,

          environmentId:
            signal.environmentId,
        },
        {
          $set: {
            incidentId:
              incident._id,

            routedAt:
              signal.routedAt ||
              now,
          },
        }
      );

    if (
      correlationGroup
        ?._id
    ) {
      await signalCorrelationRepository
        .updateOne(
          {
            _id:
              correlationGroup._id,

            organizationId:
              signal.organizationId,

            environmentId:
              signal.environmentId,
          },
          {
            $set: {
              incidentId:
                incident._id,

              status:
                "routed",

              routedAt:
                correlationGroup
                  .routedAt ||
                now,
            },
          }
        );
    }

    const correlationGroupId =
      correlationGroup
        ?.correlationGroupId ||
      signal
        .correlationGroupId ||
      null;

    if (
      correlationGroupId
    ) {
      await signalRepository
        .updateMany(
          {
            organizationId:
              signal.organizationId,

            environmentId:
              signal.environmentId,

            correlationGroupId,
          },
          {
            $set: {
              incidentId:
                incident._id,
            },
          }
        );
    }
  }

  // ==========================================================================
  // LINK RECOVERY SIGNAL
  // ==========================================================================

  async linkResolvedSignal(
    signal,
    incidents
  ) {
    if (
      !signal?._id ||
      !Array.isArray(
        incidents
      ) ||
      incidents.length ===
        0
    ) {
      return;
    }

    const incident =
      incidents[0];

    await signalRepository
      .updateOne(
        {
          _id:
            signal._id,

          organizationId:
            signal.organizationId,

          environmentId:
            signal.environmentId,
        },
        {
          $set: {
            incidentId:
              incident._id,

            processingStatus:
              "routed",

            routedAt:
              new Date(),
          },
        }
      );
  }

  // ==========================================================================
  // PROCESS CORRELATION GROUP
  // ==========================================================================

  async processCorrelationGroup(
    context,
    correlationGroupId
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete correlation processing context is required"
        ),
        {
          code:
            "INCIDENT_CORRELATION_CONTEXT_REQUIRED",
        }
      );
    }

    const group =
      await signalCorrelationRepository
        .findGroup(
          {
            organizationId:
              context
                .organizationId,

            environmentId:
              context
                .environmentId,
          },
          correlationGroupId
        );

    if (!group) {
      throw Object.assign(
        new Error(
          "Correlation group not found"
        ),
        {
          code:
            "SIGNAL_CORRELATION_NOT_FOUND",

          status:
            404,
        }
      );
    }

    const signals =
      await signalRepository
        .list(
          {
            organizationId:
              context
                .organizationId,

            environmentId:
              context
                .environmentId,

            correlationGroupId,
          },
          {
            limit:
              500,
          }
        );

    if (
      !Array.isArray(
        signals
      ) ||
      signals.length ===
        0
    ) {
      return {
        processed:
          false,

        reason:
          "Correlation group contains no signals.",
      };
    }

    const severityRank = {
      unknown:
        0,

      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    signals.sort(
      (
        first,
        second
      ) => {
        const firstCandidate =
          first
            .incidentCandidate
            ? 1
            : 0;

        const secondCandidate =
          second
            .incidentCandidate
            ? 1
            : 0;

        if (
          firstCandidate !==
          secondCandidate
        ) {
          return (
            secondCandidate -
            firstCandidate
          );
        }

        const severityDifference =
          (
            severityRank[
              second.severity
            ] ||
            0
          ) -
          (
            severityRank[
              first.severity
            ] ||
            0
          );

        if (
          severityDifference !==
          0
        ) {
          return severityDifference;
        }

        return (
          new Date(
            first.observedAt ||
            first.createdAt ||
            0
          ) -
          new Date(
            second.observedAt ||
            second.createdAt ||
            0
          )
        );
      }
    );

    const representative =
      signals[0];

    return this
      .processSignal(
        representative
      );
  }
}

module.exports =
  new IncidentOrchestrationService();

module.exports
  .IncidentOrchestrationService =
  IncidentOrchestrationService;