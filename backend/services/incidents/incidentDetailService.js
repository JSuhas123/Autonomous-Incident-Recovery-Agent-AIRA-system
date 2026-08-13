"use strict";

const mongoose =
  require("mongoose");

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

const incidentEventService =
  require(
    "./incidentEventService"
  );

const incidentStateMachine =
  require(
    "./incidentStateMachine"
  );

class IncidentDetailService {
  // ==========================================================================
  // GET COMPLETE INCIDENT
  // ==========================================================================

  async getDetail(
    context,
    incidentId
  ) {
    this.assertContext(
      context
    );

    if (
      !mongoose.Types.ObjectId
        .isValid(
          incidentId
        )
    ) {
      return null;
    }

    const incident =
      await Incident
        .findOne({
          _id:
            incidentId,

          organizationId:
            context.organizationId,

          environmentId:
            context.environmentId,
        })
        .lean();

    if (!incident) {
      return null;
    }

    const [
      signals,
      events,
      correlationGroup,
    ] =
      await Promise.all([
        this
          .loadSignals(
            incident
          ),

        incidentEventService
          .listForIncident(
            context,
            incident._id,
            500
          ),

        this
          .loadCorrelationGroup(
            incident
          ),
      ]);

    return {
      incident,

      lifecycle: {
        currentStatus:
          incident.status,

        allowedTransitions:
          incidentStateMachine
            .getAllowedTransitions(
              incident.status
            ),

        acknowledgedAt:
          incident
            .acknowledgedAt ||
          null,

        resolvedAt:
          incident
            .resolvedAt ||
          null,

        closedAt:
          incident
            .closedAt ||
          null,

        reopenCount:
          incident
            .reopenCount ||
          0,
      },

      evidence: {
        signalCount:
          signals.length,

        embeddedEvidenceCount:
          incident
            .evidenceCount ||
          incident
            .evidence
            ?.length ||
          0,

        providers:
          incident
            .providers ||
          [],

        providerCount:
          incident
            .providerCount ||
          0,

        correlationConfidence:
          incident
            .correlationConfidence ??
          null,

        signals:
          signals.map(
            (signal) =>
              this
                .serializeSignal(
                  signal
                )
          ),
      },

      correlation: {
        correlationGroupId:
          incident
            .correlationGroupId ||
          null,

        group:
          correlationGroup,
      },

      impact: {
        summary:
          incident
            .impactAnalysis
            ?.summary ||
          {
            affectedServiceCount:
              0,

            affectedResourceCount:
              0,

            userFacingImpact:
              false,

            maxCriticality:
              0,
          },

        rootService:
          incident
            .impactAnalysis
            ?.rootService ||
          null,

        affectedServices:
          incident
            .impactAnalysis
            ?.affectedServices ||
          [],

        affectedResources:
          incident
            .impactAnalysis
            ?.affectedResources ||
          [],

        levels:
          incident
            .impactAnalysis
            ?.levels ||
          [],

        analyzedAt:
          incident
            .impactAnalysis
            ?.analyzedAt ||
          null,
      },

      events,

      timeline:
        (
          incident.timeline ||
          []
        )
          .slice()
          .sort(
            (
              first,
              second
            ) =>
              new Date(
                first
                  .occurredAt
              ) -
              new Date(
                second
                  .occurredAt
              )
          ),
    };
  }

  // ==========================================================================
  // SIGNALS
  // ==========================================================================

  async loadSignals(
    incident
  ) {
    const filter = {
      organizationId:
        incident
          .organizationId,

      environmentId:
        incident
          .environmentId,
    };

    /*
     * incidentId is strongest.
     *
     * signalIds fallback covers older records that may have been
     * linked before incidentId propagation completed.
     */
    const clauses = [
      {
        incidentId:
          incident._id,
      },
    ];

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
        signalId: {
          $in:
            incident
              .signalIds,
        },
      });
    }

    filter.$or =
      clauses;

    return Signal
      .find(
        filter
      )
      .sort({
        observedAt:
          1,
      })
      .limit(
        500
      )
      .lean();
  }

  // ==========================================================================
  // CORRELATION
  // ==========================================================================

  async loadCorrelationGroup(
    incident
  ) {
    if (
      !incident
        .correlationGroupId
    ) {
      return null;
    }

    return SignalCorrelation
      .findOne({
        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        correlationGroupId:
          incident
            .correlationGroupId,
      })
      .lean();
  }

  // ==========================================================================
  // SIGNAL SERIALIZATION
  // ==========================================================================

  serializeSignal(
    signal
  ) {
    return {
      signalId:
        signal.signalId,

      provider:
        signal.provider,

      source:
        signal.source,

      signalType:
        signal.signalType,

      eventType:
        signal.eventType,

      severity:
        signal.severity,

      title:
        signal.title,

      description:
        signal.description,

      serviceId:
        signal.serviceId,

      monitorId:
        signal.monitorId,

      correlationGroupId:
        signal
          .correlationGroupId,

      correlationScore:
        signal
          .correlationScore,

      traceId:
        signal.traceId,

      spanId:
        signal.spanId,

      errorCode:
        signal.errorCode,

      statusCode:
        signal.statusCode,

      resource:
        signal.resource,

      observedAt:
        signal.observedAt,

      receivedAt:
        signal.receivedAt,

      duplicateCount:
        signal
          .duplicateCount,

      fingerprint:
        signal.fingerprint,
    };
  }

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  assertContext(
    context
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete incident detail context is required"
        ),
        {
          code:
            "INCIDENT_DETAIL_CONTEXT_REQUIRED",

          status:
            400,
        }
      );
    }
  }
}

module.exports =
  new IncidentDetailService();

module.exports
  .IncidentDetailService =
  IncidentDetailService;