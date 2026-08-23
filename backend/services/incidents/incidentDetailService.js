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
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
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

    const normalizedIncidentId =
      String(
        incidentId ||
        ""
      ).trim();

    if (
      !isDatabaseIdentifier(
        normalizedIncidentId
      )
    ) {
      return null;
    }

    const incident =
      await incidentRepository
        .findOne({
          _id:
            normalizedIncidentId,

          organizationId:
            String(
              context
                .organizationId
            ),

          environmentId:
            String(
              context
                .environmentId
            ),
        });

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
            (
              signal
            ) =>
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
                  .occurredAt ||
                0
              ) -
              new Date(
                second
                  .occurredAt ||
                0
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
    const baseFilter = {
      organizationId:
        String(
          incident
            .organizationId
        ),

      environmentId:
        String(
          incident
            .environmentId
        ),
    };

    /*
     * Prefer canonical incident ownership first.
     */
    const directSignals =
      await signalRepository
        .list(
          {
            ...baseFilter,

            incidentId:
              incident._id,
          },
          {
            sort: {
              observedAt:
                1,
            },

            limit:
              500,
          }
        );

    const directList =
      Array.isArray(
        directSignals
      )
        ? directSignals
        : [];

    /*
     * Older signals may only be linked through the incident's signalIds array.
     * Fetch those separately rather than relying on repository-level $or
     * semantics that are not guaranteed across providers.
     */
    if (
      !Array.isArray(
        incident.signalIds
      ) ||
      incident
        .signalIds
        .length ===
        0
    ) {
      return directList;
    }

    const fallbackSignals =
      await signalRepository
        .list(
          {
            ...baseFilter,

            signalId: {
              $in:
                incident
                  .signalIds,
            },
          },
          {
            sort: {
              observedAt:
                1,
            },

            limit:
              500,
          }
        );

    const merged =
      new Map();

    for (
      const signal
      of [
        ...directList,
        ...(
          Array.isArray(
            fallbackSignals
          )
            ? fallbackSignals
            : []
        ),
      ]
    ) {
      const key =
        String(
          signal.signalId ||
          signal._id
        );

      if (
        !merged.has(
          key
        )
      ) {
        merged.set(
          key,
          signal
        );
      }
    }

    return Array
      .from(
        merged.values()
      )
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            first
              .observedAt ||
            0
          ) -
          new Date(
            second
              .observedAt ||
            0
          )
      )
      .slice(
        0,
        500
      );
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

    return signalCorrelationRepository
      .findGroup(
        {
          organizationId:
            String(
              incident
                .organizationId
            ),

          environmentId:
            String(
              incident
                .environmentId
            ),
        },

        incident
          .correlationGroupId
      );
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