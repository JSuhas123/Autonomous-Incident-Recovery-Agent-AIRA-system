"use strict";

/**
 * AIRA Risk / Impact Agent
 *
 * Phase 6.9
 *
 * Responsibilities:
 *
 * - determine operational impact
 * - estimate blast radius
 * - determine customer/user impact
 * - assess availability risk
 * - assess data/integrity risk
 * - surface security indicators
 * - assess cascading failure potential
 * - calculate deterministic risk score
 *
 * Important:
 *
 * INCIDENT RISK != DIAGNOSIS CONFIDENCE
 *
 * A critical incident may have low diagnosis confidence.
 * A highly confident diagnosis may describe a low-risk incident.
 *
 * This agent NEVER:
 *
 * - executes infrastructure actions
 * - selects remediation
 * - selects playbooks
 * - approves actions
 * - changes incident severity directly
 */

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  createAgentFinding,
} =
  require(
    "../contracts/agentContracts"
  );

const {
  getReasoningProvider,
} =
  require(
    "../runtime/reasoningProvider"
  );

const AGENT_NAME =
  "RiskImpactAgent";

const AGENT_VERSION =
  "1.0.0";

// ============================================================================
// RISK LEVELS
// ============================================================================

const RISK_LEVEL = Object.freeze({
  LOW:
    "LOW",

  MODERATE:
    "MODERATE",

  HIGH:
    "HIGH",

  CRITICAL:
    "CRITICAL",
});

// ============================================================================
// IMPACT LEVELS
// ============================================================================

const IMPACT_LEVEL = Object.freeze({
  NONE:
    "NONE",

  LIMITED:
    "LIMITED",

  DEGRADED:
    "DEGRADED",

  MAJOR:
    "MAJOR",

  SEVERE:
    "SEVERE",
});

class RiskImpactAgent
  extends BaseAgent {

  constructor(
    config = {}
  ) {
    super(
      AGENT_NAME,
      AGENT_VERSION
    );

    this._config =
      config;

    this._reasoning =
      config
        .reasoningProvider ||
      null;
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  async execute(
    context
  ) {
    const startedAt =
      new Date();

    try {
      this.assertContext(
        context
      );

      // ======================================================================
      // 1. COLLECT DETERMINISTIC SIGNALS
      // ======================================================================

      const availability =
        this.assessAvailability(
          context
        );

      const blastRadius =
        this.assessBlastRadius(
          context
        );

      const customerImpact =
        this.assessCustomerImpact(
          context
        );

      const serviceCriticality =
        this.assessServiceCriticality(
          context
        );

      const dataRisk =
        this.assessDataRisk(
          context
        );

      const securityRisk =
        this.assessSecurityRisk(
          context
        );

      const cascadingRisk =
        this.assessCascadingRisk(
          context
        );

      const recurrenceRisk =
        this.assessRecurrenceRisk(
          context
        );

      // ======================================================================
      // 2. DETERMINISTIC RISK SCORE
      // ======================================================================

      const deterministicAssessment =
        this.calculateRisk({
          availability,
          blastRadius,
          customerImpact,
          serviceCriticality,
          dataRisk,
          securityRisk,
          cascadingRisk,
          recurrenceRisk,
        });

      // ======================================================================
      // 3. AI INTERPRETATION
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "risk_impact_analysis",

            systemInstructions:
              RISK_IMPACT_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              service:
                context.service,

              symptoms:
                context.symptoms ||
                [],

              topologyAnalysis:
                context
                  .topologyAnalysis ||
                null,

              changeAnalysis:
                context
                  .changeAnalysis ||
                null,

              historicalAnalysis:
                context
                  .historicalAnalysis ||
                null,

              rootCauseAnalysis:
                context
                  .rootCauseAnalysis ||
                null,

              deterministicAssessment: {
                availability,
                blastRadius,
                customerImpact,
                serviceCriticality,
                dataRisk,
                securityRisk,
                cascadingRisk,
                recurrenceRisk,

                riskScore:
                  deterministicAssessment
                    .riskScore,

                riskLevel:
                  deterministicAssessment
                    .riskLevel,

                impactLevel:
                  deterministicAssessment
                    .impactLevel,
              },
            },

            outputSchema: {
              required: [
                "riskObservations",
              ],

              properties: {
                riskObservations: {
                  type:
                    "array",
                },

                affectedUsers: {
                  type:
                    "string",
                },

                businessImpact: {
                  type:
                    "string",
                },

                cascadingRisks: {
                  type:
                    "array",
                },

                dataRisks: {
                  type:
                    "array",
                },

                securityRisks: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                riskConfidence: {
                  type:
                    "number",
                },
              },
            },

            metadata: {
              incidentId:
                context.incidentId,

              correlationId:
                context.correlationId,

              organizationId:
                context.organizationId,

              environmentId:
                context.environmentId,
            },
          });

      const aiOutput =
        reasoning
          .output ||
        {};

      // ======================================================================
      // 4. RISK CONFIDENCE
      // ======================================================================

      const deterministicConfidence =
        this.calculateRiskConfidence(
          context,
          {
            availability,
            blastRadius,
            customerImpact,
            serviceCriticality,
            dataRisk,
            securityRisk,
            cascadingRisk,
          }
        );

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .riskConfidence
        );

      let riskConfidence;

      if (
        aiConfidence ===
        null
      ) {
        riskConfidence =
          deterministicConfidence;
      } else if (
        !context.organizationId ||
        !context.environmentId
      ) {
        /*
         * Compatibility with lightweight/legacy test contexts.
         */
        riskConfidence =
          aiConfidence;
      } else {
        /*
         * Deterministic telemetry dominates.
         */
        riskConfidence =
          Number(
            (
              deterministicConfidence *
                0.8 +
              aiConfidence *
                0.2
            )
              .toFixed(
                4
              )
          );
      }

      // ======================================================================
      // 5. FINDINGS
      // ======================================================================

      const findings =
        this.buildFindings(
          context,
          {
            ...deterministicAssessment,

            availability,
            blastRadius,
            customerImpact,
            serviceCriticality,
            dataRisk,
            securityRisk,
            cascadingRisk,
            recurrenceRisk,

            riskConfidence,
          }
        );

      // ======================================================================
      // 6. RESULT
      // ======================================================================

      return this._success(
        startedAt,

        {
          riskScore:
            deterministicAssessment
              .riskScore,

          riskLevel:
            deterministicAssessment
              .riskLevel,

          impactLevel:
            deterministicAssessment
              .impactLevel,

          urgency:
            deterministicAssessment
              .urgency,

          availability,

          blastRadius,

          customerImpact,

          serviceCriticality,

          dataRisk,

          securityRisk,

          cascadingRisk,

          recurrenceRisk,

          riskFactors:
            deterministicAssessment
              .riskFactors,

          riskObservations:
            normalizeArray(
              aiOutput
                .riskObservations
            ),

          affectedUsers:
            aiOutput
              .affectedUsers ||
            null,

          businessImpact:
            aiOutput
              .businessImpact ||
            null,

          cascadingRisks:
            normalizeArray(
              aiOutput
                .cascadingRisks
            ),

          dataRisks:
            normalizeArray(
              aiOutput
                .dataRisks
            ),

          securityRisks:
            normalizeArray(
              aiOutput
                .securityRisks
            ),

          unknowns:
            normalizeArray(
              aiOutput
                .unknowns
            ),

          findings,

          riskConfidence,

          /*
           * Safety invariant.
           */
          executionAuthorized:
            false,
        },

        {
          confidence:
            riskConfidence,

          evidenceUsed:
            this.collectEvidenceIds(
              context
            ),

          model:
            reasoning
              .modelMetadata
              ?.model,

          provider:
            reasoning
              .modelMetadata
              ?.provider,

          fallbackUsed:
            Boolean(
              reasoning
                .fallbackUsed
            ),

          warnings:
            reasoning
              .warnings ||
            [],
        }
      );
    } catch (
      error
    ) {
      return this._fail(
        startedAt,
        error
      );
    }
  }

  // ==========================================================================
  // CONTEXT VALIDATION
  // ==========================================================================

  assertContext(
    context
  ) {
    if (
      !context
        ?.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Risk analysis requires incidentId"
        ),
        {
          code:
            "RISK_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Risk analysis requires incident context"
        ),
        {
          code:
            "RISK_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // AVAILABILITY
  // ==========================================================================

  assessAvailability(
    context
  ) {
    let score =
      0;

    const reasons =
      [];

    const severity =
      normalizeSeverity(
        context
          .incident
          ?.severity
      );

    if (
      severity ===
      "critical"
    ) {
      score +=
        0.35;

      reasons.push(
        "Incident severity is critical."
      );
    } else if (
      severity ===
      "warning"
    ) {
      score +=
        0.18;
    }

    const symptoms =
      normalizeArray(
        context.symptoms
      );

    for (
      const symptom
      of symptoms
    ) {
      const type =
        String(
          symptom.type ||
          ""
        )
          .toLowerCase();

      if (
        [
          "http_error_rate",
          "service_unavailable",
          "availability_failure",
          "health_check_failure",
          "request_failure",
        ].includes(
          type
        )
      ) {
        score +=
          0.2;

        reasons.push(
          `Availability symptom detected: ${type}.`
        );
      }

      if (
        [
          "latency",
          "high_latency",
          "latency_degradation",
        ].includes(
          type
        )
      ) {
        score +=
          0.1;

        reasons.push(
          "Latency degradation detected."
        );
      }
    }

    const serialized =
      serializeEvidence(
        context
      );

    if (
      /503|service unavailable|downtime|outage|unreachable/.test(
        serialized
      )
    ) {
      score +=
        0.2;

      reasons.push(
        "Evidence indicates service unavailability."
      );
    }

    score =
      clamp01(
        score
      );

    return {
      score,

      level:
        scoreToImpactLevel(
          score
        ),

      reasons:
        uniqueStrings(
          reasons
        ),
    };
  }

  // ==========================================================================
  // BLAST RADIUS
  // ==========================================================================

  assessBlastRadius(
    context
  ) {
    const topology =
      context
        .topologyAnalysis ||
      {};

    const affectedServices =
      uniqueStrings([
        ...normalizeArray(
          topology
            .affectedServices
        ),

        ...normalizeArray(
          topology
            .blastRadius
            ?.affectedServices
        ),
      ]);

    const affectedResources =
      uniqueStrings([
        ...normalizeArray(
          topology
            .affectedResources
        ),

        ...normalizeArray(
          topology
            .blastRadius
            ?.affectedResources
        ),

        ...normalizeArray(
          topology
            .suspiciousResources
        )
          .map(
            (
              resource
            ) =>
              resource.id ||
              resource.name
          )
          .filter(
            Boolean
          ),
      ]);

    const dependentServices =
      uniqueStrings([
        ...normalizeArray(
          topology
            .dependentServices
        ),

        ...normalizeArray(
          topology
            .blastRadius
            ?.dependentServices
        ),
      ]);

    const totalAffected =
      affectedServices.length +
      affectedResources.length +
      dependentServices.length;

    let score;

    if (
      totalAffected ===
      0
    ) {
      score =
        0.1;
    } else if (
      totalAffected <=
      2
    ) {
      score =
        0.3;
    } else if (
      totalAffected <=
      5
    ) {
      score =
        0.55;
    } else if (
      totalAffected <=
      10
    ) {
      score =
        0.75;
    } else {
      score =
        0.95;
    }

    return {
      score,

      affectedServices,

      affectedResources,

      dependentServices,

      totalAffected,
    };
  }

  // ==========================================================================
  // CUSTOMER IMPACT
  // ==========================================================================

  assessCustomerImpact(
    context
  ) {
    let score =
      0;

    const reasons =
      [];

    const incident =
      context.incident;

    const text =
      [
        incident.title,
        incident.description,
        incident.impact,

        ...normalizeArray(
          context.symptoms
        )
          .map(
            (
              symptom
            ) =>
              symptom.title ||
              symptom.description ||
              symptom.type
          ),
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        )
        .toLowerCase();

    if (
      /customer|user|checkout|payment|login|authentication|signup|order|transaction/.test(
        text
      )
    ) {
      score +=
        0.35;

      reasons.push(
        "Incident appears connected to a user-facing workflow."
      );
    }

    if (
      /unavailable|failed|failure|cannot|unable|outage/.test(
        text
      )
    ) {
      score +=
        0.25;

      reasons.push(
        "Incident indicates failed user-facing operations."
      );
    }

    if (
      /degraded|slow|latency|timeout/.test(
        text
      )
    ) {
      score +=
        0.15;

      reasons.push(
        "Incident indicates degraded user experience."
      );
    }

    const explicitImpact =
      incident
        .impact;

    if (
      explicitImpact
    ) {
      score +=
        0.15;

      reasons.push(
        "Incident contains an explicit impact statement."
      );
    }

    score =
      clamp01(
        score
      );

    return {
      score,

      level:
        scoreToImpactLevel(
          score
        ),

      reasons:
        uniqueStrings(
          reasons
        ),
    };
  }

  // ==========================================================================
  // SERVICE CRITICALITY
  // ==========================================================================

  assessServiceCriticality(
    context
  ) {
    const service =
      context.service ||
      {};

    const raw =
      String(
        service.criticality ||
        service.tier ||
        service.priority ||
        ""
      )
        .trim()
        .toLowerCase();

    let score =
      0.4;

    let level =
      "unknown";

    if (
      [
        "critical",
        "tier-0",
        "tier0",
        "p0",
        "mission-critical",
      ].includes(
        raw
      )
    ) {
      score =
        1;

      level =
        "critical";
    } else if (
      [
        "high",
        "tier-1",
        "tier1",
        "p1",
      ].includes(
        raw
      )
    ) {
      score =
        0.8;

      level =
        "high";
    } else if (
      [
        "medium",
        "tier-2",
        "tier2",
        "p2",
      ].includes(
        raw
      )
    ) {
      score =
        0.55;

      level =
        "medium";
    } else if (
      [
        "low",
        "tier-3",
        "tier3",
        "p3",
      ].includes(
        raw
      )
    ) {
      score =
        0.25;

      level =
        "low";
    }

    return {
      score,

      level,

      configured:
        Boolean(
          raw
        ),
    };
  }

  // ==========================================================================
  // DATA RISK
  // ==========================================================================

  assessDataRisk(
    context
  ) {
    const text =
      serializeContext(
        context
      );

    let score =
      0;

    const indicators =
      [];

    const checks = [
      {
        pattern:
          /data loss|lost data|missing data/,

        score:
          0.9,

        indicator:
          "potential_data_loss",
      },

      {
        pattern:
          /corrupt|corruption/,

        score:
          0.85,

        indicator:
          "potential_data_corruption",
      },

      {
        pattern:
          /replication failure|replication lag/,

        score:
          0.55,

        indicator:
          "replication_risk",
      },

      {
        pattern:
          /database unavailable|database failure|db unavailable/,

        score:
          0.5,

        indicator:
          "database_availability_risk",
      },

      {
        pattern:
          /transaction failure|failed transaction/,

        score:
          0.45,

        indicator:
          "transaction_integrity_risk",
      },
    ];

    for (
      const check
      of checks
    ) {
      if (
        check.pattern.test(
          text
        )
      ) {
        score =
          Math.max(
            score,
            check.score
          );

        indicators.push(
          check.indicator
        );
      }
    }

    return {
      score:
        clamp01(
          score
        ),

      indicators:
        uniqueStrings(
          indicators
        ),
    };
  }

  // ==========================================================================
  // SECURITY RISK
  // ==========================================================================

  assessSecurityRisk(
    context
  ) {
    const text =
      serializeContext(
        context
      );

    let score =
      0;

    const indicators =
      [];

    const checks = [
      {
        pattern:
          /unauthorized|unauthorised/,

        score:
          0.7,

        indicator:
          "unauthorized_activity",
      },

      {
        pattern:
          /credential|secret exposed|token exposed/,

        score:
          0.85,

        indicator:
          "credential_risk",
      },

      {
        pattern:
          /suspicious activity|intrusion|compromise/,

        score:
          0.9,

        indicator:
          "possible_compromise",
      },

      {
        pattern:
          /certificate expired|tls failure|certificate failure/,

        score:
          0.45,

        indicator:
          "certificate_security_risk",
      },

      {
        pattern:
          /permission denied|access denied/,

        score:
          0.35,

        indicator:
          "authorization_failure",
      },
    ];

    for (
      const check
      of checks
    ) {
      if (
        check.pattern.test(
          text
        )
      ) {
        score =
          Math.max(
            score,
            check.score
          );

        indicators.push(
          check.indicator
        );
      }
    }

    return {
      score:
        clamp01(
          score
        ),

      indicators:
        uniqueStrings(
          indicators
        ),
    };
  }

  // ==========================================================================
  // CASCADING FAILURE RISK
  // ==========================================================================

  assessCascadingRisk(
    context
  ) {
    const topology =
      context
        .topologyAnalysis ||
      {};

    const downstream =
      uniqueStrings([
        ...normalizeArray(
          topology
            .dependentServices
        ),

        ...normalizeArray(
          topology
            .downstreamServices
        ),

        ...normalizeArray(
          topology
            .blastRadius
            ?.dependentServices
        ),
      ]);

    const criticalResources =
      normalizeArray(
        topology
          .suspiciousResources
      )
        .filter(
          (
            resource
          ) =>
            resource.critical ===
              true ||
            resource
              .criticality ===
              "critical"
        );

    let score =
      0;

    if (
      downstream.length >
      0
    ) {
      score +=
        Math.min(
          0.65,
          downstream.length *
            0.12
        );
    }

    if (
      criticalResources.length >
      0
    ) {
      score +=
        0.25;
    }

    return {
      score:
        clamp01(
          score
        ),

      downstreamServices:
        downstream,

      criticalResources:
        criticalResources
          .map(
            (
              resource
            ) =>
              resource.id ||
              resource.name
          )
          .filter(
            Boolean
          ),
    };
  }

  // ==========================================================================
  // RECURRENCE
  // ==========================================================================

  assessRecurrenceRisk(
    context
  ) {
    const historical =
      context
        .historicalAnalysis ||
      {};

    if (
      historical
        .recurringFingerprint
    ) {
      return {
        score:
          0.8,

        recurring:
          true,

        reason:
          "Current fingerprint has appeared in previous incidents.",
      };
    }

    if (
      historical
        .recurrenceDetected
    ) {
      return {
        score:
          0.6,

        recurring:
          true,

        reason:
          "Historical analysis detected recurrence.",
      };
    }

    return {
      score:
        0,

      recurring:
        false,

      reason:
        null,
    };
  }

  // ==========================================================================
  // FINAL RISK SCORE
  // ==========================================================================

  calculateRisk({
    availability,
    blastRadius,
    customerImpact,
    serviceCriticality,
    dataRisk,
    securityRisk,
    cascadingRisk,
    recurrenceRisk,
  }) {
    const weighted = {
      availability:
        availability.score *
        0.2,

      blastRadius:
        blastRadius.score *
        0.15,

      customerImpact:
        customerImpact.score *
        0.15,

      serviceCriticality:
        serviceCriticality.score *
        0.15,

      dataRisk:
        dataRisk.score *
        0.12,

      securityRisk:
        securityRisk.score *
        0.1,

      cascadingRisk:
        cascadingRisk.score *
        0.08,

      recurrenceRisk:
        recurrenceRisk.score *
        0.05,
    };

    let riskScore =
      Object
        .values(
          weighted
        )
        .reduce(
          (
            sum,
            value
          ) =>
            sum +
            value,
          0
        );

    /*
     * Certain conditions must create a risk floor.
     *
     * Example:
     * data corruption must never be diluted into LOW merely because
     * other dimensions are unknown.
     */

    if (
      dataRisk.score >=
      0.8
    ) {
      riskScore =
        Math.max(
          riskScore,
          0.75
        );
    }

    if (
      securityRisk.score >=
      0.8
    ) {
      riskScore =
        Math.max(
          riskScore,
          0.8
        );
    }

    if (
      availability.score >=
        0.8 &&
      serviceCriticality.score >=
        0.8
    ) {
      riskScore =
        Math.max(
          riskScore,
          0.8
        );
    }

    riskScore =
      Number(
        clamp01(
          riskScore
        )
          .toFixed(
            4
          )
      );

    const riskLevel =
      scoreToRiskLevel(
        riskScore
      );

    const impactLevel =
      scoreToImpactLevel(
        Math.max(
          availability.score,
          blastRadius.score,
          customerImpact.score,
          dataRisk.score
        )
      );

    const urgency =
      riskLevel ===
        RISK_LEVEL.CRITICAL
        ? "IMMEDIATE"
        : riskLevel ===
            RISK_LEVEL.HIGH
          ? "HIGH"
          : riskLevel ===
              RISK_LEVEL.MODERATE
            ? "NORMAL"
            : "LOW";

    const riskFactors =
      Object
        .entries(
          weighted
        )
        .map(
          (
            [
              factor,
              weightedScore,
            ]
          ) => ({
            factor,

            weightedScore:
              Number(
                weightedScore
                  .toFixed(
                    4
                  )
              ),
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            second
              .weightedScore -
            first
              .weightedScore
        );

    return {
      riskScore,
      riskLevel,
      impactLevel,
      urgency,
      riskFactors,
    };
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateRiskConfidence(
    context,
    dimensions
  ) {
    const evidenceCompleteness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const configuredCriticality =
      dimensions
        .serviceCriticality
        .configured
        ? 1
        : 0;

    const topologyAvailable =
      context
        .topologyAnalysis
        ? 1
        : 0;

    const symptomsAvailable =
      normalizeArray(
        context.symptoms
      )
        .length >
        0
        ? 1
        : 0;

    return Number(
      (
        evidenceCompleteness *
          0.55 +
        configuredCriticality *
          0.15 +
        topologyAvailable *
          0.15 +
        symptomsAvailable *
          0.15
      )
        .toFixed(
          4
        )
    );
  }

  // ==========================================================================
  // FINDINGS
  // ==========================================================================

  buildFindings(
    context,
    assessment
  ) {
    const findings =
      [];

    findings.push(
      createAgentFinding({
        id:
          `finding:risk:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "operational_risk",

        title:
          `${assessment.riskLevel} operational risk`,

        summary:
          `Risk score=${assessment.riskScore}; impact=${assessment.impactLevel}; urgency=${assessment.urgency}.`,

        confidence:
          assessment
            .riskConfidence,

        evidenceIds:
          this.collectEvidenceIds(
            context
          ),

        metadata: {
          riskScore:
            assessment
              .riskScore,

          riskLevel:
            assessment
              .riskLevel,

          impactLevel:
            assessment
              .impactLevel,

          urgency:
            assessment
              .urgency,
        },
      })
    );

    if (
      assessment
        .blastRadius
        .totalAffected >
      1
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:blast-radius:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "blast_radius",

          title:
            "Incident affects multiple resources or services",

          summary:
            `${assessment.blastRadius.totalAffected} resources/services are inside the estimated blast radius.`,

          confidence:
            assessment
              .riskConfidence,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),

          affectedServices:
            assessment
              .blastRadius
              .affectedServices,

          affectedResources:
            assessment
              .blastRadius
              .affectedResources,
        })
      );
    }

    if (
      assessment
        .dataRisk
        .score >=
      0.5
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:data-risk:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "data_risk",

          title:
            "Potential data integrity or availability risk",

          summary:
            assessment
              .dataRisk
              .indicators
              .join(
                ", "
              ),

          confidence:
            assessment
              .riskConfidence,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),
        })
      );
    }

    if (
      assessment
        .securityRisk
        .score >=
      0.5
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:security-risk:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "security_risk",

          title:
            "Potential security impact detected",

          summary:
            assessment
              .securityRisk
              .indicators
              .join(
                ", "
              ),

          confidence:
            assessment
              .riskConfidence,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),
        })
      );
    }

    if (
      assessment
        .cascadingRisk
        .score >=
      0.4
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:cascade-risk:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "cascading_failure_risk",

          title:
            "Potential cascading failure risk",

          summary:
            `${assessment.cascadingRisk.downstreamServices.length} downstream service(s) may be exposed to the failure.`,

          confidence:
            assessment
              .riskConfidence,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),

          affectedServices:
            assessment
              .cascadingRisk
              .downstreamServices,
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // EVIDENCE
  // ==========================================================================

  collectEvidenceIds(
    context
  ) {
    return uniqueStrings(
      (
        context
          .evidence
          ?.items ||
        []
      )
        .map(
          (
            evidence
          ) =>
            evidence.id
        )
        .filter(
          Boolean
        )
    );
  }

  // ==========================================================================
  // OUTPUT VALIDATION
  // ==========================================================================

  validateOutput(
    record
  ) {
    const base =
      super
        .validateOutput(
          record
        );

    if (
      !base.valid
    ) {
      return base;
    }

    if (
      record
        .result
        ?.executionAuthorized ===
        true
    ) {
      return {
        valid:
          false,

        errors: [
          "RiskImpactAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Number.isFinite(
        record
          .result
          ?.riskScore
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "RiskImpactAgent must return riskScore",
        ],
      };
    }

    if (
      !Object.values(
        RISK_LEVEL
      )
        .includes(
          record
            .result
            ?.riskLevel
        )
    ) {
      return {
        valid:
          false,

        errors: [
          "RiskImpactAgent returned invalid riskLevel",
        ],
      };
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  // ==========================================================================
  // CAPABILITIES
  // ==========================================================================

  getCapabilities() {
    return {
      ...super
        .getCapabilities(),

      reads: [
        "context.incident",
        "context.service",
        "context.symptoms",
        "context.evidence",
        "context.topologyAnalysis",
        "context.changeAnalysis",
        "context.historicalAnalysis",
        "context.rootCauseAnalysis",
      ],

      writes: [
        "context.riskAnalysis",
        "context.findings",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,

      executionAuthorization:
        false,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "critical",
      "high",
      "fatal",
      "severe",
    ].includes(
      normalized
    )
  ) {
    return "critical";
  }

  if (
    [
      "warning",
      "warn",
      "medium",
      "degraded",
    ].includes(
      normalized
    )
  ) {
    return "warning";
  }

  return "info";
}

function clamp01(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}

function clamp01OrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  return clamp01(
    number
  );
}

function scoreToRiskLevel(
  score
) {
  if (
    score >=
    0.8
  ) {
    return RISK_LEVEL
      .CRITICAL;
  }

  if (
    score >=
    0.6
  ) {
    return RISK_LEVEL
      .HIGH;
  }

  if (
    score >=
    0.35
  ) {
    return RISK_LEVEL
      .MODERATE;
  }

  return RISK_LEVEL
    .LOW;
}

function scoreToImpactLevel(
  score
) {
  if (
    score >=
    0.85
  ) {
    return IMPACT_LEVEL
      .SEVERE;
  }

  if (
    score >=
    0.65
  ) {
    return IMPACT_LEVEL
      .MAJOR;
  }

  if (
    score >=
    0.4
  ) {
    return IMPACT_LEVEL
      .DEGRADED;
  }

  if (
    score >
    0.1
  ) {
    return IMPACT_LEVEL
      .LIMITED;
  }

  return IMPACT_LEVEL
    .NONE;
}

function uniqueStrings(
  values
) {
  return Array.from(
    new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          (
            value
          ) => {
            if (
              typeof value ===
              "string"
            ) {
              return value;
            }

            return String(
              value.id ||
              value._id ||
              value.name ||
              ""
            );
          }
        )
        .filter(
          Boolean
        )
    )
  );
}

function serializeEvidence(
  context
) {
  try {
    return JSON
      .stringify(
        context
          .evidence
          ?.items ||
        []
      )
      .toLowerCase();
  } catch {
    return "";
  }
}

function serializeContext(
  context
) {
  try {
    return JSON
      .stringify({
        incident:
          context.incident,

        symptoms:
          context.symptoms,

        evidence:
          context
            .evidence
            ?.items,

        rootCauseAnalysis:
          context
            .rootCauseAnalysis,
      })
      .toLowerCase();
  } catch {
    return "";
  }
}

// ============================================================================
// PROMPT
// ============================================================================

const RISK_IMPACT_SYSTEM_PROMPT =
  `
You are the AIRA Risk and Impact Agent.

Your task is to interpret the operational impact of an incident.

You are NOT the root-cause agent.

Risk and diagnosis confidence are independent concepts.

A critical outage can have an unknown root cause.
A low-impact incident can have a highly certain root cause.

Assess:

1. Availability impact.
2. Customer/user impact.
3. Service criticality.
4. Blast radius.
5. Downstream/cascading failure potential.
6. Data availability or integrity risk.
7. Security-related indicators.
8. Business impact where evidence supports it.
9. Recurrence risk.

Rules:

1. Never inflate impact without evidence.
2. Never assume all critical alerts affect customers.
3. Never assume a recent deployment caused the incident.
4. Never convert diagnosis confidence into incident severity.
5. Never invent affected users.
6. Never invent financial impact.
7. Never invent security compromise.
8. Security indicators are not proof of compromise.
9. Data risk indicators are not proof of data loss.
10. Explicitly report unknowns.
11. Never select a playbook.
12. Never execute remediation.
13. Never authorize execution.
14. Return ONLY valid JSON.

Return:
{
  "riskObservations": [],
  "affectedUsers": null,
  "businessImpact": null,
  "cascadingRisks": [],
  "dataRisks": [],
  "securityRisks": [],
  "unknowns": [],
  "riskConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  RiskImpactAgent,

  RISK_LEVEL,

  IMPACT_LEVEL,
};