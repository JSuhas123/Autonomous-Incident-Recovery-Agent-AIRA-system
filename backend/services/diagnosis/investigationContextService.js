"use strict";

const {
  isLegacyObjectId,
} = require(
  "../../persistence/operational/identifierCompat"
);

const {
  Service,
} = require(
  "../../persistence/operational/operationalModels"
);

const {
  Incident,
} =
  require(
    "../../persistence/operational/canonicalModels"
  );

const {
  signalRepository,
} = require(
  "../../persistence/repositories"
);

const incidentDetailService =
  require(
    "../incidents/incidentDetailService"
  );

const {
  createInvestigationContext,
  createEvidencePackage,
  createEvidenceItem,
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  EVIDENCE_TRUST_LEVEL,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

class InvestigationContextService {
  constructor() {
    this.maxSignals =
      Number(
        process.env
          .DIAGNOSIS_MAX_SIGNALS
      ) ||
      500;

    this.maxHistoricalIncidents =
      Number(
        process.env
          .DIAGNOSIS_MAX_HISTORICAL_INCIDENTS
      ) ||
      20;

    this.historyWindowDays =
      Number(
        process.env
          .DIAGNOSIS_HISTORY_WINDOW_DAYS
      ) ||
      90;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async build(
    context,
    incidentId,
    options = {}
  ) {
    this.assertContext(
      context
    );

    if (
      !isLegacyObjectId(
          incidentId
        )
    ) {
      throw Object.assign(
        new Error(
          "Invalid incident identifier"
        ),
        {
          code:
            "INVESTIGATION_INCIDENT_ID_INVALID",

          status:
            400,
        }
      );
    }

    // ========================================================================
    // PHASE 5 CANONICAL DETAIL
    // ========================================================================

    const detail =
      await incidentDetailService
        .getDetail(
          {
            organizationId:
              context
                .organizationId,

            environmentId:
              context
                .environmentId,
          },

          incidentId
        );

    if (!detail) {
      throw Object.assign(
        new Error(
          "Incident not found"
        ),
        {
          code:
            "INCIDENT_NOT_FOUND",

          status:
            404,
        }
      );
    }

    const incident =
      detail.incident;

    // ========================================================================
    // LOAD ADDITIONAL SERVER-SIDE CONTEXT
    // ========================================================================

    const [
      service,
      signals,
      historicalIncidents,
    ] =
      await Promise.all([
        this.loadService(
          incident
        ),

        this.loadSignals(
          incident
        ),

        this.loadHistoricalIncidents(
          incident,
          options
        ),
      ]);

    // ========================================================================
    // CLASSIFY SIGNALS
    // ========================================================================

    const classified =
      this.classifySignals(
        signals
      );

    // ========================================================================
    // BUILD EVIDENCE
    // ========================================================================

    const evidence =
      this.buildEvidencePackage({
        incident,

        signals,

        incidentEvents:
          detail.events ||
          [],

        impact:
          detail.impact,

        correlationGroup:
          detail
            .correlation
            ?.group ||
          null,
      });

    // ========================================================================
    // CONTEXT QUALITY
    // ========================================================================

    const missingEvidence =
      this.identifyMissingEvidence({
        incident,

        signals,

        classified,

        service,

        impact:
          detail.impact,
      });

    evidence.missingEvidence =
      Array.from(
        new Set([
          ...(
            evidence
              .missingEvidence ||
            []
          ),

          ...missingEvidence,
        ])
      );

    evidence.completeness =
      this.calculateEvidenceCompleteness({
        signals,

        classified,

        service,

        impact:
          detail.impact,

        events:
          detail.events ||
          [],

        historicalIncidents,
      });

    // ========================================================================
    // BUILD CANONICAL INVESTIGATION CONTEXT
    // ========================================================================

    return createInvestigationContext({
      incidentId:
        incident._id,

      organizationId:
        incident
          .organizationId,

      environmentId:
        incident
          .environmentId,

      tenantId:
        incident
          .tenantId,

      correlationId:
        incident
          .correlationGroupId ||
        `incident:${incident._id}`,

      correlationGroupId:
        incident
          .correlationGroupId ||
        null,

      // ----------------------------------------------------------------------
      // INCIDENT
      // ----------------------------------------------------------------------

      incident:
        this.serializeIncident(
          incident
        ),

      // ----------------------------------------------------------------------
      // SERVICE
      // ----------------------------------------------------------------------

      service:
        service
          ? this.serializeService(
              service
            )
          : {},

      // ----------------------------------------------------------------------
      // SIGNALS
      // ----------------------------------------------------------------------

      signals:
        signals.map(
          (signal) =>
            this.serializeSignal(
              signal
            )
        ),

      // ----------------------------------------------------------------------
      // INCIDENT EVENTS
      // ----------------------------------------------------------------------

      incidentEvents:
        detail.events ||
        [],

      // ----------------------------------------------------------------------
      // CORRELATION
      // ----------------------------------------------------------------------

      correlationGroup:
        detail
          .correlation
          ?.group ||
        null,

      // ----------------------------------------------------------------------
      // TOPOLOGY
      // ----------------------------------------------------------------------

      topology: {
        rootService:
          detail
            .impact
            ?.rootService ||
          null,

        levels:
          detail
            .impact
            ?.levels ||
          [],
      },

      blastRadius: {
        summary:
          detail
            .impact
            ?.summary ||
          {},

        affectedServices:
          detail
            .impact
            ?.affectedServices ||
          [],

        affectedResources:
          detail
            .impact
            ?.affectedResources ||
          [],
      },

      dependencies:
        detail
          .impact
          ?.affectedServices ||
        [],

      resources:
        detail
          .impact
          ?.affectedResources ||
        [],

      // ----------------------------------------------------------------------
      // PROVIDER-SPECIFIC SIGNAL TYPES
      // ----------------------------------------------------------------------

      metrics:
        classified.metrics,

      logs:
        classified.logs,

      traces:
        classified.traces,

      alerts:
        classified.alerts,

      kubernetes:
        classified.kubernetes,

      // ----------------------------------------------------------------------
      // CHANGE ANALYSIS
      //
      // Phase 6.6 will populate this from CI/CD, Kubernetes rollout and
      // configuration-change sources.
      // ----------------------------------------------------------------------

      changes:
        [],

      // ----------------------------------------------------------------------
      // HISTORICAL MEMORY
      // ----------------------------------------------------------------------

      historicalIncidents:
        historicalIncidents
          .map(
            (historical) =>
              this.serializeHistoricalIncident(
                historical
              )
          ),

      // ----------------------------------------------------------------------
      // EVIDENCE PACKAGE
      // ----------------------------------------------------------------------

      evidence,

      symptoms:
        [],

      findings:
        [],

      contradictions:
        [],

      // ----------------------------------------------------------------------
      // TIMING
      // ----------------------------------------------------------------------

      timing: {
        incidentStartedAt:
          incident
            .startedAt ||
          null,

        detectedAt:
          incident
            .detectedAt ||
          null,

        lastObservedAt:
          incident
            .lastObservedAt ||
          null,

        acknowledgedAt:
          incident
            .acknowledgedAt ||
          null,

        resolvedAt:
          incident
            .resolvedAt ||
          null,
      },

      metadata: {
        lifecycle:
          detail.lifecycle,

        evidenceCompleteness:
          evidence
            .completeness,

        providerCount:
          incident
            .providerCount ||
          0,

        signalCount:
          signals.length,

        incidentEventCount:
          (
            detail.events ||
            []
          ).length,

        historicalIncidentCount:
          historicalIncidents
            .length,

        contextVersion:
          "phase6-v1",
      },
    });
  }

  // ==========================================================================
  // SERVICE
  // ==========================================================================

  async loadService(
    incident
  ) {
    if (
      !incident
        ?.serviceId
    ) {
      return null;
    }

    return Service
      .findOne({
        _id:
          incident
            .serviceId,

        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        status: {
          $ne:
            "archived",
        },
      })
      .lean();
  }

  // ==========================================================================
  // SIGNALS
  // ==========================================================================

  async loadSignals(
    incident
  ) {
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

    return signalRepository.list(
      {
        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        $or:
          clauses,
      },
      {
        sort: {
          observedAt: 1,
        },
        limit: this.maxSignals,
      }
    );
  }

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  async loadHistoricalIncidents(
    incident,
    options = {}
  ) {
    const historyWindowDays =
      Number(
        options
          .historyWindowDays
      ) ||
      this.historyWindowDays;

    const maxHistoricalIncidents =
      Math.min(
        Math.max(
          Number(
            options
              .maxHistoricalIncidents
          ) ||
          this.maxHistoricalIncidents,
          1
        ),
        100
      );

    const threshold =
      new Date(
        Date.now() -
        historyWindowDays *
          24 *
          60 *
          60 *
          1000
      );

    const clauses = [
      {
        serviceId:
          incident
            .serviceId,
      },
    ];

    if (
      incident
        .fingerprint
    ) {
      clauses.push({
        fingerprint:
          incident
            .fingerprint,
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

        createdAt: {
          $gte:
            threshold,
        },

        $or:
          clauses,
      })
      .sort({
        createdAt:
          -1,
      })
      .limit(
        maxHistoricalIncidents
      )
      .lean();
  }

  // ==========================================================================
  // CLASSIFY SIGNALS
  // ==========================================================================

  classifySignals(
    signals
  ) {
    const result = {
      metrics:
        [],

      logs:
        [],

      traces:
        [],

      alerts:
        [],

      kubernetes: {
        signals:
          [],

        events:
          [],

        resources:
          [],
      },
    };

    for (
      const signal
      of signals
    ) {
      const serialized =
        this.serializeSignal(
          signal
        );

      const signalType =
        String(
          signal.signalType ||
          ""
        )
          .trim()
          .toLowerCase();

      const provider =
        String(
          signal.provider ||
          ""
        )
          .trim()
          .toLowerCase();

      // ----------------------------------------------------------------------
      // METRIC
      // ----------------------------------------------------------------------

      if (
        signalType ===
        "metric"
      ) {
        result.metrics.push({
          ...serialized,

          metric:
            signal.metric ||
            null,
        });
      }

      // ----------------------------------------------------------------------
      // LOG
      // ----------------------------------------------------------------------

      if (
        signalType ===
        "log"
      ) {
        result.logs.push({
          ...serialized,

          body:
            signal.body ||
            signal.log
              ?.body ||
            signal.description ||
            null,

          log:
            signal.log ||
            null,
        });
      }

      // ----------------------------------------------------------------------
      // TRACE
      // ----------------------------------------------------------------------

      if (
        signalType ===
          "trace" ||
        signal.traceId
      ) {
        result.traces.push({
          ...serialized,

          traceId:
            signal.traceId ||
            null,

          spanId:
            signal.spanId ||
            null,

          trace:
            signal.trace ||
            null,
        });
      }

      // ----------------------------------------------------------------------
      // ALERT
      // ----------------------------------------------------------------------

      if (
        signalType ===
          "alert" ||
        String(
          signal.eventType ||
          ""
        )
          .toLowerCase()
          .includes(
            "alert"
          )
      ) {
        result.alerts.push(
          serialized
        );
      }

      // ----------------------------------------------------------------------
      // KUBERNETES
      // ----------------------------------------------------------------------

      if (
        provider ===
          "kubernetes" ||
        provider ===
          "k8s"
      ) {
        result
          .kubernetes
          .signals
          .push(
            serialized
          );

        if (
          String(
            signal.eventType ||
            ""
          )
            .toLowerCase()
            .includes(
              "event"
            )
        ) {
          result
            .kubernetes
            .events
            .push(
              serialized
            );
        }

        if (
          signal.resource
        ) {
          result
            .kubernetes
            .resources
            .push(
              signal.resource
            );
        }
      }
    }

    result
      .kubernetes
      .resources =
      this.uniqueObjects(
        result
          .kubernetes
          .resources
      );

    return result;
  }

  // ==========================================================================
  // EVIDENCE PACKAGE
  // ==========================================================================

  buildEvidencePackage({
  incident,
  signals,
  incidentEvents,
  impact,
  correlationGroup,
}) {
  const items =
    [];

  const collectedAt =
    new Date();

  // ==========================================================================
  // SIGNAL EVIDENCE
  // ==========================================================================

  for (
    const signal
    of signals
  ) {
    const signalId =
      signal.signalId ||
      signal._id;

    items.push(
      createEvidenceItem({
        id:
          `signal:${signalId}`,

        type:
          this.evidenceTypeForSignal(
            signal
          ),

        source:
          signal.provider ||
          "signal",

        sourceType:
          this.evidenceSourceForProvider(
            signal.provider
          ),

        timestamp:
          signal.observedAt ||
          signal.receivedAt ||
          collectedAt,

        observedAt:
          signal.observedAt ||
          signal.receivedAt ||
          null,

        collectedAt,

        resource:
          signal.resource ||
          {},

        serviceId:
          signal.serviceId,

        provider:
          signal.provider,

        signalId,

        summary:
          signal.title ||
          signal.description ||
          signal.eventType ||
          "Operational signal",

        structuredData:
          this.safeSignalEvidenceData(
            signal
          ),

        confidence:
          signal
            .correlationScore ??
          null,

        correlationId:
          incident
            .correlationGroupId ||
          `incident:${incident._id}`,

        correlationGroupId:
          signal
            .correlationGroupId ||
          null,

        trustLevel:
          EVIDENCE_TRUST_LEVEL
            .SOURCE_REPORTED,

        provenance: {
          collector:
            "InvestigationContextService",

          retrievalMethod:
            "tenant_scoped_signal_store_read",

          sourceRef:
            `Signal:${String(
              signal._id ||
              signalId
            )}`,

          canonicalStore:
            "Signal",

          trustReason:
            "Telemetry was persisted in the tenant-scoped AIRA Signal store before diagnosis.",

          metadata: {
            organizationId:
              String(
                incident.organizationId
              ),

            environmentId:
              String(
                incident.environmentId
              ),
          },
        },

        tags: [
          signal.signalType,
          signal.eventType,
          signal.severity,
        ]
          .filter(
            Boolean
          ),
      })
    );
  }

  // ==========================================================================
  // INCIDENT EVENT EVIDENCE
  // ==========================================================================

  for (
    const event
    of incidentEvents ||
    []
  ) {
    const eventId =
      event.eventId ||
      event._id;

    items.push(
      createEvidenceItem({
        id:
          `incident-event:${eventId}`,

        type:
          EVIDENCE_TYPE
            .INCIDENT_EVENT,

        source:
          "incident_service",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .AIRA_INCIDENT_STORE,

        timestamp:
          event.occurredAt ||
          event.createdAt ||
          collectedAt,

        observedAt:
          event.occurredAt ||
          event.createdAt ||
          null,

        collectedAt,

        incidentEventId:
          eventId
            ? String(
                eventId
              )
            : null,

        serviceId:
          event.serviceId ||
          incident.serviceId,

        summary:
          event.issue ||
          event.changeType ||
          event.eventType ||
          "Incident lifecycle event",

        structuredData: {
          eventType:
            event.eventType,

          changeType:
            event.changeType,

          previousStatus:
            event.previousStatus,

          newStatus:
            event.newStatus,

          severity:
            event.severity,

          occurrenceCount:
            event.occurrenceCount,

          metadata:
            event.metadata ||
            {},
        },

        correlationId:
          event.correlationId ||
          incident
            .correlationGroupId ||
          `incident:${incident._id}`,

        correlationGroupId:
          event.correlationGroupId ||
          null,

        trustLevel:
          EVIDENCE_TRUST_LEVEL
            .CANONICAL,

        provenance: {
          collector:
            "InvestigationContextService",

          retrievalMethod:
            "canonical_incident_detail_read",

          sourceRef:
            `IncidentEvent:${String(
              eventId
            )}`,

          canonicalStore:
            "Incident",

          trustReason:
            "Event came from AIRA canonical incident lifecycle state.",

          metadata: {
            incidentId:
              String(
                incident._id
              ),
          },
        },
      })
    );
  }

  // ==========================================================================
  // TOPOLOGY EVIDENCE
  // ==========================================================================

  if (
    impact
      ?.rootService
  ) {
    items.push(
      createEvidenceItem({
        id:
          `topology:${incident._id}`,

        type:
          EVIDENCE_TYPE
            .TOPOLOGY,

        source:
          "aira_topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .AIRA_TOPOLOGY,

        timestamp:
          impact.analyzedAt ||
          collectedAt,

        observedAt:
          impact.analyzedAt ||
          collectedAt,

        collectedAt,

        serviceId:
          incident.serviceId,

        summary:
          "Service topology and incident blast-radius analysis.",

        structuredData: {
          rootService:
            impact.rootService,

          levels:
            impact.levels ||
            [],

          affectedServices:
            impact.affectedServices ||
            [],

          affectedResources:
            impact.affectedResources ||
            [],
        },

        confidence:
          1,

        correlationId:
          incident
            .correlationGroupId ||
          `incident:${incident._id}`,

        correlationGroupId:
          incident
            .correlationGroupId ||
          null,

        trustLevel:
          EVIDENCE_TRUST_LEVEL
            .CANONICAL,

        provenance: {
          collector:
            "InvestigationContextService",

          retrievalMethod:
            "canonical_topology_analysis_read",

          sourceRef:
            `Topology:${String(
              incident._id
            )}`,

          canonicalStore:
            "AIRA_TOPOLOGY",

          trustReason:
            "Topology was calculated by AIRA from canonical tenant-scoped service relationships.",
        },
      })
    );
  }

  // ==========================================================================
  // BLAST RADIUS EVIDENCE
  // ==========================================================================

  if (
    impact
      ?.summary
  ) {
    items.push(
      createEvidenceItem({
        id:
          `blast-radius:${incident._id}`,

        type:
          EVIDENCE_TYPE
            .BLAST_RADIUS,

        source:
          "aira_topology",

        sourceType:
          EVIDENCE_SOURCE_TYPE
            .AIRA_TOPOLOGY,

        timestamp:
          impact.analyzedAt ||
          collectedAt,

        observedAt:
          impact.analyzedAt ||
          collectedAt,

        collectedAt,

        serviceId:
          incident.serviceId,

        summary:
          `${impact.summary.affectedServiceCount || 0} dependent service(s) and ${impact.summary.affectedResourceCount || 0} infrastructure resource(s) identified in blast radius.`,

        structuredData:
          impact.summary,

        confidence:
          1,

        correlationId:
          incident
            .correlationGroupId ||
          `incident:${incident._id}`,

        correlationGroupId:
          incident
            .correlationGroupId ||
          null,

        trustLevel:
          EVIDENCE_TRUST_LEVEL
            .CANONICAL,

        provenance: {
          collector:
            "InvestigationContextService",

          retrievalMethod:
            "canonical_blast_radius_analysis_read",

          sourceRef:
            `BlastRadius:${String(
              incident._id
            )}`,

          canonicalStore:
            "AIRA_TOPOLOGY",

          trustReason:
            "Blast radius was calculated by AIRA from canonical topology state.",
        },
      })
    );
  }

  // ==========================================================================
  // PROVIDER COVERAGE
  // ==========================================================================

  const providers =
    Array.from(
      new Set(
        signals
          .map(
            (
              signal
            ) =>
              signal.provider
          )
          .filter(
            Boolean
          )
      )
    );

  return createEvidencePackage({
    incidentId:
      incident._id,

    correlationId:
      incident
        .correlationGroupId ||
      `incident:${incident._id}`,

    correlationGroupId:
      incident
        .correlationGroupId ||
      null,

    items,

    completeness:
      0,

    missingEvidence:
      [],

    staleEvidence:
      [],

    conflicts:
      correlationGroup
        ?.conflicts ||
      [],

    recommendedNextEvidence:
      [],

    providerCoverage:
      providers,

    signalCount:
      signals.length,

    collectedAt,

    metadata: {
      collector:
        "InvestigationContextService",

      organizationId:
        String(
          incident.organizationId
        ),

      environmentId:
        String(
          incident.environmentId
        ),
    },
  });
}

  // ==========================================================================
  // SIGNAL -> EVIDENCE TYPE
  // ==========================================================================

  evidenceTypeForSignal(
    signal
  ) {
    const type =
      String(
        signal.signalType ||
        ""
      )
        .trim()
        .toLowerCase();

    const provider =
      String(
        signal.provider ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      provider ===
        "kubernetes" ||
      provider ===
        "k8s"
    ) {
      if (
        String(
          signal.eventType ||
          ""
        )
          .toLowerCase()
          .includes(
            "event"
          )
      ) {
        return EVIDENCE_TYPE
          .KUBERNETES_EVENT;
      }

      return EVIDENCE_TYPE
        .RESOURCE_STATE;
    }

    switch (
      type
    ) {
      case "metric":
        return EVIDENCE_TYPE
          .METRIC;

      case "log":
        return EVIDENCE_TYPE
          .LOG;

      case "trace":
        return EVIDENCE_TYPE
          .TRACE;

      case "alert":
        return EVIDENCE_TYPE
          .ALERT;

      default:
        return EVIDENCE_TYPE
          .SIGNAL;
    }
  }

  // ==========================================================================
  // PROVIDER -> EVIDENCE SOURCE
  // ==========================================================================

  evidenceSourceForProvider(
    provider
  ) {
    switch (
      String(
        provider ||
        ""
      )
        .trim()
        .toLowerCase()
    ) {
      case "prometheus":
      case "prometheus_alertmanager":
        return EVIDENCE_SOURCE_TYPE
          .PROMETHEUS;

      case "opentelemetry":
        return EVIDENCE_SOURCE_TYPE
          .OPENTELEMETRY;

      case "datadog":
        return EVIDENCE_SOURCE_TYPE
          .DATADOG;

      case "aws_cloudwatch":
        return EVIDENCE_SOURCE_TYPE
          .AWS_CLOUDWATCH;

      case "azure_monitor":
        return EVIDENCE_SOURCE_TYPE
          .AZURE_MONITOR;

      case "gcp_monitoring":
        return EVIDENCE_SOURCE_TYPE
          .GCP_MONITORING;

      case "kubernetes":
      case "k8s":
        return EVIDENCE_SOURCE_TYPE
          .KUBERNETES_API;

      case "monitor":
        return EVIDENCE_SOURCE_TYPE
          .AIRA_SIGNAL_STORE;

      default:
        return EVIDENCE_SOURCE_TYPE
          .AIRA_SIGNAL_STORE;
    }
  }

  // ==========================================================================
  // EVIDENCE COMPLETENESS
  // ==========================================================================

  calculateEvidenceCompleteness({
    signals,
    classified,
    service,
    impact,
    events,
    historicalIncidents,
  }) {
    let score =
      0;

    let possible =
      0;

    // ------------------------------------------------------------------------
    // Canonical signals
    // ------------------------------------------------------------------------

    possible +=
      0.2;

    if (
      signals.length >
      0
    ) {
      score +=
        0.2;
    }

    // ------------------------------------------------------------------------
    // Service identity
    // ------------------------------------------------------------------------

    possible +=
      0.15;

    if (
      service
    ) {
      score +=
        0.15;
    }

    // ------------------------------------------------------------------------
    // Incident lifecycle
    // ------------------------------------------------------------------------

    possible +=
      0.1;

    if (
      events.length >
      0
    ) {
      score +=
        0.1;
    }

    // ------------------------------------------------------------------------
    // Topology
    // ------------------------------------------------------------------------

    possible +=
      0.15;

    if (
      impact
        ?.rootService
    ) {
      score +=
        0.15;
    }

    // ------------------------------------------------------------------------
    // Multiple telemetry dimensions
    // ------------------------------------------------------------------------

    possible +=
      0.25;

    const telemetryTypes =
      [
        classified
          .metrics
          .length >
        0,

        classified
          .logs
          .length >
        0,

        classified
          .traces
          .length >
        0,

        classified
          .alerts
          .length >
        0,
      ]
        .filter(
          Boolean
        )
        .length;

    score +=
      (
        telemetryTypes /
        4
      ) *
      0.25;

    // ------------------------------------------------------------------------
    // Historical evidence
    // ------------------------------------------------------------------------

    possible +=
      0.15;

    if (
      historicalIncidents
        .length >
      0
    ) {
      score +=
        0.15;
    }

    if (
      possible ===
      0
    ) {
      return 0;
    }

    return Number(
      Math.min(
        1,
        score /
          possible
      )
        .toFixed(
          4
        )
    );
  }

  // ==========================================================================
  // MISSING EVIDENCE
  // ==========================================================================

  identifyMissingEvidence({
    signals,
    classified,
    service,
    impact,
  }) {
    const missing =
      [];

    if (!service) {
      missing.push(
        "service_metadata"
      );
    }

    if (
      signals.length ===
      0
    ) {
      missing.push(
        "canonical_signals"
      );

      return missing;
    }

    if (
      classified
        .metrics
        .length ===
      0
    ) {
      missing.push(
        "metrics"
      );
    }

    if (
      classified
        .logs
        .length ===
      0
    ) {
      missing.push(
        "logs"
      );
    }

    if (
      classified
        .traces
        .length ===
      0
    ) {
      missing.push(
        "traces"
      );
    }

    if (
      classified
        .alerts
        .length ===
      0
    ) {
      missing.push(
        "alerts"
      );
    }

    if (
      !impact
        ?.rootService
    ) {
      missing.push(
        "topology"
      );
    }

    return missing;
  }

  // ==========================================================================
  // SERIALIZATION â€” INCIDENT
  // ==========================================================================

  serializeIncident(
    incident
  ) {
    return {
      id:
        String(
          incident._id
        ),

      serviceId:
        incident.serviceId
          ? String(
              incident.serviceId
            )
          : null,

      monitorId:
        incident.monitorId
          ? String(
              incident.monitorId
            )
          : null,

      title:
        incident.title,

      description:
        incident.description,

      source:
        incident.source,

      severity:
        incident.severity,

      status:
        incident.status,

      fingerprint:
        incident.fingerprint,

      signalFingerprint:
        incident
          .signalFingerprint ||
        null,

      correlationGroupId:
        incident
          .correlationGroupId ||
        null,

      providers:
        incident.providers ||
        [],

      providerCount:
        incident
          .providerCount ||
        0,

      occurrenceCount:
        incident
          .occurrenceCount ||
        0,

      reopenCount:
        incident
          .reopenCount ||
        0,

      impact:
        incident.impact,

      startedAt:
        incident.startedAt,

      detectedAt:
        incident.detectedAt,

      lastObservedAt:
        incident
          .lastObservedAt,

      acknowledgedAt:
        incident
          .acknowledgedAt ||
        null,

      resolvedAt:
        incident
          .resolvedAt ||
        null,

      resolution:
        incident.resolution ||
        null,

      resolutionType:
        incident
          .resolutionType ||
        null,

      tags:
        incident.tags ||
        [],
    };
  }

  // ==========================================================================
  // SERIALIZATION â€” SERVICE
  // ==========================================================================

  serializeService(
    service
  ) {
    return {
      id:
        String(
          service._id
        ),

      name:
        service.name,

      slug:
        service.slug,

      type:
        service.type,

      status:
        service.status,

      environment:
        service.environment,

      description:
        service.description,

      tags:
        service.tags ||
        [],

      metadata:
        service.metadata ||
        {},
    };
  }

  // ==========================================================================
  // SERIALIZATION â€” SIGNAL
  // ==========================================================================

  serializeSignal(
    signal
  ) {
    return {
      id:
        String(
          signal._id
        ),

      signalId:
        signal.signalId,

      provider:
        signal.provider,

      source:
        signal.source,

      sourceEventId:
        signal.sourceEventId,

      signalType:
        signal.signalType,

      eventType:
        signal.eventType,

      severity:
        signal.severity,

      status:
        signal.status,

      title:
        signal.title,

      description:
        signal.description,

      serviceId:
        signal.serviceId
          ? String(
              signal.serviceId
            )
          : null,

      monitorId:
        signal.monitorId
          ? String(
              signal.monitorId
            )
          : null,

      incidentId:
        signal.incidentId
          ? String(
              signal.incidentId
            )
          : null,

      correlationGroupId:
        signal
          .correlationGroupId ||
        null,

      correlationScore:
        signal
          .correlationScore ??
        null,

      traceId:
        signal.traceId ||
        null,

      spanId:
        signal.spanId ||
        null,

      errorCode:
        signal.errorCode ||
        null,

      errorMessage:
        signal.errorMessage ||
        null,

      statusCode:
        signal
          .statusCode ??
        null,

      metric:
        signal.metric ||
        null,

      log:
        signal.log ||
        null,

      trace:
        signal.trace ||
        null,

      resource:
        signal.resource ||
        {},

      attributes:
        signal.attributes ||
        {},

      observedAt:
        signal.observedAt,

      receivedAt:
        signal.receivedAt,

      duplicateCount:
        signal
          .duplicateCount ||
        0,

      fingerprint:
        signal.fingerprint,
    };
  }

  // ==========================================================================
  // SERIALIZATION â€” HISTORICAL INCIDENT
  // ==========================================================================

  serializeHistoricalIncident(
    incident
  ) {
    return {
      id:
        String(
          incident._id
        ),

      title:
        incident.title,

      severity:
        incident.severity,

      status:
        incident.status,

      fingerprint:
        incident.fingerprint,

      signalFingerprint:
        incident
          .signalFingerprint ||
        null,

      correlationGroupId:
        incident
          .correlationGroupId ||
        null,

      occurrenceCount:
        incident
          .occurrenceCount ||
        0,

      reopenCount:
        incident
          .reopenCount ||
        0,

      providers:
        incident.providers ||
        [],

      detectionMethod:
        incident
          .detectionMethod ||
        null,

      resolution:
        incident.resolution ||
        null,

      resolutionType:
        incident
          .resolutionType ||
        null,

      startedAt:
        incident.startedAt,

      detectedAt:
        incident.detectedAt,

      resolvedAt:
        incident
          .resolvedAt ||
        null,

      createdAt:
        incident.createdAt,
    };
  }

  // ==========================================================================
  // SAFE STRUCTURED SIGNAL DATA
  // ==========================================================================

  safeSignalEvidenceData(
    signal
  ) {
    return {
      signalType:
        signal.signalType,

      eventType:
        signal.eventType,

      severity:
        signal.severity,

      status:
        signal.status,

      statusCode:
        signal
          .statusCode ??
        null,

      errorCode:
        signal.errorCode ||
        null,

      errorMessage:
        signal.errorMessage ||
        null,

      traceId:
        signal.traceId ||
        null,

      spanId:
        signal.spanId ||
        null,

      metric:
        signal.metric ||
        null,

      resource:
        signal.resource ||
        {},

      attributes:
        this.sanitizeObject(
          signal.attributes ||
          {}
        ),
    };
  }

  // ==========================================================================
  // SANITIZATION
  // ==========================================================================

  sanitizeObject(
    value
  ) {
    if (
      !value ||
      typeof value !==
      "object"
    ) {
      return value;
    }

    const blocked =
      /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential/i;

    const walk =
      (
        current,
        depth = 0
      ) => {
        if (
          depth >
          8
        ) {
          return "[MAX_DEPTH]";
        }

        if (
          Array.isArray(
            current
          )
        ) {
          return current
            .slice(
              0,
              500
            )
            .map(
              (entry) =>
                walk(
                  entry,
                  depth +
                    1
                )
            );
        }

        if (
          !current ||
          typeof current !==
            "object"
        ) {
          return current;
        }

        const result =
          {};

        for (
          const [
            key,
            entry,
          ]
          of Object.entries(
            current
          )
        ) {
          if (
            blocked.test(
              key
            )
          ) {
            result[key] =
              "[REDACTED]";

            continue;
          }

          result[key] =
            walk(
              entry,
              depth +
                1
            );
        }

        return result;
      };

    return walk(
      value
    );
  }

  // ==========================================================================
  // UNIQUE OBJECTS
  // ==========================================================================

  uniqueObjects(
    values
  ) {
    const map =
      new Map();

    for (
      const value
      of values
    ) {
      if (!value) {
        continue;
      }

      let key;

      try {
        key =
          JSON.stringify(
            value
          );
      } catch {
        continue;
      }

      if (
        !map.has(
          key
        )
      ) {
        map.set(
          key,
          value
        );
      }
    }

    return [
      ...map.values(),
    ];
  }

  // ==========================================================================
  // CONTEXT VALIDATION
  // ==========================================================================

  assertContext(
    context
  ) {
    if (
      !context
        ?.organizationId
    ) {
      throw Object.assign(
        new Error(
          "organizationId is required to build investigation context"
        ),
        {
          code:
            "INVESTIGATION_ORGANIZATION_REQUIRED",

          status:
            400,
        }
      );
    }

    if (
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "environmentId is required to build investigation context"
        ),
        {
          code:
            "INVESTIGATION_ENVIRONMENT_REQUIRED",

          status:
            400,
        }
      );
    }
  }
}

module.exports =
  new InvestigationContextService();

module.exports
  .InvestigationContextService =
  InvestigationContextService;

