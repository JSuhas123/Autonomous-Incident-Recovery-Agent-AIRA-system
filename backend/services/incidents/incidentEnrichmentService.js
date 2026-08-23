"use strict";

const {
  incidentRepository,
  signalRepository,
} =
  require(
    "../../persistence/repositories"
  );

const incidentImpactService =
  require(
    "./incidentImpactService"
  );

class IncidentEnrichmentService {
  async enrich(
    incident
  ) {
    if (
      !incident?._id
    ) {
      throw Object.assign(
        new Error(
          "Incident is required for enrichment"
        ),
        {
          code:
            "INCIDENT_ENRICHMENT_INCIDENT_REQUIRED",
        }
      );
    }

    const [
      impactAnalysis,
      signals,
    ] =
      await Promise.all([
        incidentImpactService
          .analyze(
            incident
          ),

        this
          .loadSignals(
            incident
          ),
      ]);

    impactAnalysis.analyzedAt =
      new Date();

    const evidenceSummary =
      this
        .summarizeSignals(
          signals
        );

    const now =
      new Date();

    const impactDescription =
      this
        .buildImpactDescription(
          impactAnalysis
        );

    incident.impactAnalysis =
      impactAnalysis;

    incident.impact =
      impactDescription;

    incident.lastObservedAt =
      incident
        .lastObservedAt ||
      now;

    if (
      !Array.isArray(
        incident.timeline
      )
    ) {
      incident.timeline =
        [];
    }

    incident.timeline.push({
      occurredAt:
        now,

      eventType:
        "impact_analyzed",

      actor:
        "system",

      description:
        impactDescription,

      metadata: {
        affectedServiceCount:
          impactAnalysis
            .summary
            .affectedServiceCount,

        affectedResourceCount:
          impactAnalysis
            .summary
            .affectedResourceCount,

        userFacingImpact:
          impactAnalysis
            .summary
            .userFacingImpact,

        maxCriticality:
          impactAnalysis
            .summary
            .maxCriticality,

        evidenceSummary,
      },
    });

    /*
     * Provider-neutral persistence boundary.
     *
     * Mongo repository persists the Mongoose document.
     * PostgreSQL repository persists the canonical aggregate.
     */
    const saved =
      await incidentRepository
        .save(
          incident
        );

    return (
      saved ||
      incident
    );
  }

  async loadSignals(
    incident
  ) {
    const signals =
      await signalRepository
        .list(
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

    return Array.isArray(
      signals
    )
      ? signals
      : [];
  }

  summarizeSignals(
    signals
  ) {
    const providers =
      new Set();

    const types =
      new Set();

    let critical =
      0;

    let warning =
      0;

    let info =
      0;

    for (
      const signal
      of signals
    ) {
      if (
        signal.provider
      ) {
        providers.add(
          signal.provider
        );
      }

      if (
        signal.signalType
      ) {
        types.add(
          signal.signalType
        );
      }

      if (
        signal.severity ===
        "critical"
      ) {
        critical +=
          1;
      } else if (
        signal.severity ===
        "warning"
      ) {
        warning +=
          1;
      } else if (
        signal.severity ===
        "info"
      ) {
        info +=
          1;
      }
    }

    return {
      total:
        signals.length,

      providers:
        Array.from(
          providers
        ),

      signalTypes:
        Array.from(
          types
        ),

      severityCounts: {
        critical,

        warning,

        info,
      },
    };
  }

  buildImpactDescription(
    impact
  ) {
    const summary =
      impact.summary;

    if (
      summary
        .affectedServiceCount ===
        0 &&
      summary
        .affectedResourceCount ===
        0
    ) {
      return (
        "No downstream blast radius has been identified from the current topology."
      );
    }

    const parts = [
      `${summary.affectedServiceCount} dependent service(s)`,

      `${summary.affectedResourceCount} related infrastructure resource(s)`,
    ];

    if (
      summary
        .userFacingImpact
    ) {
      parts.push(
        "user-facing impact is possible"
      );
    }

    if (
      summary
        .maxCriticality >=
      8
    ) {
      parts.push(
        "high-criticality dependencies are involved"
      );
    }

    return (
      `Blast-radius analysis identified ${parts.join(
        ", "
      )}.`
    );
  }
}

module.exports =
  new IncidentEnrichmentService();

module.exports
  .IncidentEnrichmentService =
  IncidentEnrichmentService;