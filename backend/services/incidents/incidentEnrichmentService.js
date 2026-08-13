"use strict";

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

    const update = {
      impactAnalysis,

      /*
       * Human-readable incident impact.
       */
      impact:
        this
          .buildImpactDescription(
            impactAnalysis
          ),

      lastObservedAt:
        incident
          .lastObservedAt ||
        new Date(),
    };

    await Incident
      .updateOne(
        {
          _id:
            incident._id,

          organizationId:
            incident
              .organizationId,

          environmentId:
            incident
              .environmentId,
        },
        {
          $set:
            update,

          $push: {
            timeline: {
              occurredAt:
                new Date(),

              eventType:
                "impact_analyzed",

              actor:
                "system",

              description:
                this
                  .buildImpactDescription(
                    impactAnalysis
                  ),

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
            },
          },
        }
      );

    return Incident
      .findById(
        incident._id
      );
  }

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

      incidentId:
        incident._id,
    };

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