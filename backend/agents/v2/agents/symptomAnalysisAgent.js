"use strict";

/**
 * AIRA Symptom Analysis Agent
 *
 * Phase 6 responsibility:
 *
 * Convert collected evidence into a structured description of
 * what is observably failing.
 *
 * This agent does NOT determine root cause.
 *
 * SAFETY:
 * - read-only
 * - no infrastructure mutation
 * - no playbook execution
 * - no execution authorization
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  AGENT_STATUS,
  EVIDENCE_TYPE,
  createSymptom,
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
  "SymptomAnalysisAgent";

const AGENT_VERSION =
  "1.0.0";

// ============================================================================
// AGENT
// ============================================================================

class SymptomAnalysisAgent
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
      // 1. DETERMINISTIC SYMPTOMS
      // ======================================================================

      const deterministicSymptoms =
        this.extractDeterministicSymptoms(
          context
        );

      // ======================================================================
      // 2. DETERMINISTIC FINDINGS
      // ======================================================================

      const deterministicFindings =
        this.buildDeterministicFindings(
          context,
          deterministicSymptoms
        );

      // ======================================================================
      // 3. AI REFINEMENT
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "symptom_analysis",

            systemInstructions:
              SYMPTOM_ANALYSIS_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              service:
                context.service,

              blastRadius:
                context
                  .blastRadius,

              evidence:
                (
                  context
                    .evidence
                    ?.items ||
                  []
                )
                  .map(
                    (
                      evidence
                    ) => ({
                      id:
                        evidence.id,

                      type:
                        evidence.type,

                      source:
                        evidence.source,

                      summary:
                        evidence.summary,

                      structuredData:
                        evidence
                          .structuredData,

                      confidence:
                        evidence
                          .confidence,

                      observedAt:
                        evidence
                          .observedAt,
                    })
                  )
                  .slice(
                    0,
                    100
                  ),

              deterministicSymptoms:
                deterministicSymptoms
                  .map(
                    (
                      symptom
                    ) => ({
                      id:
                        symptom.id,

                      type:
                        symptom.type,

                      title:
                        symptom.title,

                      description:
                        symptom
                          .description,

                      severity:
                        symptom
                          .severity,

                      evidenceIds:
                        symptom
                          .evidenceIds,

                      confidence:
                        symptom
                          .confidence,
                    })
                  ),
            },

            outputSchema: {
              required: [
                "symptoms",
              ],

              properties: {
                symptoms: {
                  type:
                    "array",
                },

                observations: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                symptomConfidence: {
                  type:
                    "number",
                },
              },
            },

            metadata: {
              incidentId:
                context
                  .incidentId,

              correlationId:
                context
                  .correlationId,

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,
            },
          });

      const aiOutput =
        reasoning
          .output ||
        {};

      // ======================================================================
      // 4. MERGE AI + DETERMINISTIC SYMPTOMS
      // ======================================================================

      const aiSymptoms =
        this.normalizeAiSymptoms(
          aiOutput
            .symptoms,
          context
        );

      const symptoms =
        this.mergeSymptoms(
          deterministicSymptoms,
          aiSymptoms
        );

      // ======================================================================
      // 5. CONFIDENCE
      // ======================================================================

      const deterministicConfidence =
        this.calculateSymptomConfidence(
          context,
          symptoms
        );

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .symptomConfidence
        );

      const canonicalContext =
        Boolean(
          context
            .organizationId &&
          context
            .environmentId &&
          context
            .evidence
        );

      let symptomConfidence;

      if (
        aiConfidence ===
        null
      ) {
        symptomConfidence =
          deterministicConfidence;
      } else if (
        !canonicalContext
      ) {
        /*
         * Legacy test/runtime compatibility.
         */
        symptomConfidence =
          aiConfidence;
      } else {
        symptomConfidence =
          Number(
            (
              deterministicConfidence *
                0.75 +
              aiConfidence *
                0.25
            )
              .toFixed(
                4
              )
          );
      }

      // ======================================================================
      // 6. FINDINGS
      // ======================================================================

      const findings = [
        ...deterministicFindings,

        ...this
          .buildAiFindings(
            aiOutput,
            symptoms
          ),
      ];

      // ======================================================================
      // 7. RESULT
      // ======================================================================

      return this._success(
        startedAt,

        {
          symptoms,

          findings:
            deduplicateFindings(
              findings
            ),

          observations:
            Array.isArray(
              aiOutput
                .observations
            )
              ? aiOutput
                  .observations
              : [],

          unknowns:
            Array.isArray(
              aiOutput
                .unknowns
            )
              ? aiOutput
                  .unknowns
              : [],

          symptomConfidence,

          executionAuthorized:
            false,
        },

        {
          confidence:
            symptomConfidence,

          evidenceUsed:
            Array.from(
              new Set(
                symptoms
                  .flatMap(
                    (
                      symptom
                    ) =>
                      symptom
                        .evidenceIds ||
                      []
                  )
              )
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
          "Symptom analysis requires incidentId"
        ),
        {
          code:
            "SYMPTOM_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Symptom analysis requires incident context"
        ),
        {
          code:
            "SYMPTOM_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // DETERMINISTIC EXTRACTION
  // ==========================================================================

  extractDeterministicSymptoms(
    context
  ) {
    const symptoms =
      [];

    const evidence =
      context
        .evidence
        ?.items ||
      [];

    const signals =
      context
        .signals ||
      [];

    // ------------------------------------------------------------------------
    // HTTP / STATUS FAILURES
    // ------------------------------------------------------------------------

    const httpFailures =
      signals.filter(
        (
          signal
        ) =>
          Number(
            signal
              .statusCode
          ) >=
          500
      );

    if (
      httpFailures
        .length >
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "http-5xx"
            ),

          type:
            "http_error_rate",

          title:
            "HTTP server failures observed",

          description:
            `${httpFailures.length} signal(s) reported HTTP 5xx responses.`,

          severity:
            this.highestSeverity(
              httpFailures
            ),

          firstObservedAt:
            earliestDate(
              httpFailures,
              "observedAt"
            ),

          lastObservedAt:
            latestDate(
              httpFailures,
              "observedAt"
            ),

          affectedServices:
            uniqueIds(
              httpFailures
                .map(
                  (
                    signal
                  ) =>
                    signal
                      .serviceId
                )
            ),

          evidenceIds:
            this.evidenceIdsForSignals(
              httpFailures,
              evidence
            ),

          confidence:
            0.98,
        })
      );
    }

    // ------------------------------------------------------------------------
    // ERROR CODES
    // ------------------------------------------------------------------------

    const signalsWithErrors =
      signals.filter(
        (
          signal
        ) =>
          Boolean(
            signal
              .errorCode
          )
      );

    if (
      signalsWithErrors
        .length >
      0
    ) {
      const groups =
        groupBy(
          signalsWithErrors,
          (
            signal
          ) =>
            signal
              .errorCode
        );

      for (
        const [
          errorCode,
          groupedSignals,
        ]
        of groups
      ) {
        symptoms.push(
          createSymptom({
            id:
              this.symptomId(
                `error-${errorCode}`
              ),

            type:
              "error_code",

            title:
              `${errorCode} errors observed`,

            description:
              `${groupedSignals.length} signal(s) reported error code ${errorCode}.`,

            severity:
              this.highestSeverity(
                groupedSignals
              ),

            firstObservedAt:
              earliestDate(
                groupedSignals,
                "observedAt"
              ),

            lastObservedAt:
              latestDate(
                groupedSignals,
                "observedAt"
              ),

            affectedServices:
              uniqueIds(
                groupedSignals
                  .map(
                    (
                      signal
                    ) =>
                      signal
                        .serviceId
                    )
              ),

            evidenceIds:
              this.evidenceIdsForSignals(
                groupedSignals,
                evidence
              ),

            confidence:
              0.95,
          })
        );
      }
    }

    // ------------------------------------------------------------------------
    // TRACE ERRORS
    // ------------------------------------------------------------------------

    const traceFailures =
      signals.filter(
        (
          signal
        ) =>
          (
            signal
              .signalType ===
            "trace"
          ) &&
          (
            signal
              .severity ===
              "critical" ||
            signal
              .status ===
              "error" ||
            signal
              .errorCode
          )
      );

    if (
      traceFailures
        .length >
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "trace-errors"
            ),

          type:
            "trace_failure",

          title:
            "Distributed trace failures observed",

          description:
            `${traceFailures.length} failing trace/span signal(s) were correlated with the incident.`,

          severity:
            this.highestSeverity(
              traceFailures
            ),

          firstObservedAt:
            earliestDate(
              traceFailures,
              "observedAt"
            ),

          lastObservedAt:
            latestDate(
              traceFailures,
              "observedAt"
            ),

          evidenceIds:
            this.evidenceIdsForSignals(
              traceFailures,
              evidence
            ),

          confidence:
            0.95,
        })
      );
    }

    // ------------------------------------------------------------------------
    // LOG ERRORS
    // ------------------------------------------------------------------------

    const errorLogs =
      signals.filter(
        (
          signal
        ) =>
          signal
            .signalType ===
            "log" &&
          [
            "warning",
            "critical",
          ].includes(
            signal
              .severity
          )
      );

    if (
      errorLogs
        .length >
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "error-logs"
            ),

          type:
            "log_error",

          title:
            "Error logs observed",

          description:
            `${errorLogs.length} warning/critical log signal(s) were observed.`,

          severity:
            this.highestSeverity(
              errorLogs
            ),

          firstObservedAt:
            earliestDate(
              errorLogs,
              "observedAt"
            ),

          lastObservedAt:
            latestDate(
              errorLogs,
              "observedAt"
            ),

          evidenceIds:
            this.evidenceIdsForSignals(
              errorLogs,
              evidence
            ),

          confidence:
            0.9,
        })
      );
    }

    // ------------------------------------------------------------------------
    // METRIC ANOMALIES
    // ------------------------------------------------------------------------

    const metrics =
      context
        .metrics ||
      [];

    if (
      metrics.length >
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "metric-anomaly"
            ),

          type:
            "metric_anomaly",

          title:
            "Metric anomalies observed",

          description:
            `${metrics.length} metric signal(s) contributed to the incident evidence.`,

          severity:
            this.highestSeverity(
              metrics
            ),

          firstObservedAt:
            earliestDate(
              metrics,
              "observedAt"
            ),

          lastObservedAt:
            latestDate(
              metrics,
              "observedAt"
            ),

          evidenceIds:
            metrics
              .map(
                (
                  metric
                ) =>
                  metric
                    .signalId
                    ? `signal:${metric.signalId}`
                    : null
              )
              .filter(
                Boolean
              ),

          confidence:
            0.85,
        })
      );
    }

    // ------------------------------------------------------------------------
    // KUBERNETES RESOURCE FAILURE
    // ------------------------------------------------------------------------

    const kubernetesSignals =
      context
        .kubernetes
        ?.signals ||
      [];

    if (
      kubernetesSignals
        .length >
      0
    ) {
      const unhealthy =
        kubernetesSignals.filter(
          (
            signal
          ) =>
            [
              "warning",
              "critical",
            ].includes(
              signal
                .severity
            )
        );

      if (
        unhealthy.length >
        0
      ) {
        symptoms.push(
          createSymptom({
            id:
              this.symptomId(
                "kubernetes-resource"
              ),

            type:
              "kubernetes_resource_failure",

            title:
              "Kubernetes resource degradation observed",

            description:
              `${unhealthy.length} unhealthy Kubernetes signal(s) contributed to the incident.`,

            severity:
              this.highestSeverity(
                unhealthy
              ),

            firstObservedAt:
              earliestDate(
                unhealthy,
                "observedAt"
              ),

            lastObservedAt:
              latestDate(
                unhealthy,
                "observedAt"
              ),

            evidenceIds:
              this.evidenceIdsForSignals(
                unhealthy,
                evidence
              ),

            confidence:
              0.95,
          })
        );
      }
    }

    // ------------------------------------------------------------------------
    // INCIDENT RECURRENCE
    // ------------------------------------------------------------------------

    if (
      Number(
        context
          .incident
          ?.reopenCount ||
        0
      ) >
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "recurrence"
            ),

          type:
            "recurrence",

          title:
            "Incident recurrence observed",

          description:
            `The incident has reopened ${context.incident.reopenCount} time(s).`,

          severity:
            context
              .incident
              .severity ||
            "warning",

          evidenceIds:
            (
              context
                .incidentEvents ||
              []
            )
              .filter(
                (
                  event
                ) =>
                  event
                    .eventType ===
                  "incident.reopened"
              )
              .map(
                (
                  event
                ) =>
                  `incident-event:${event.eventId || event._id}`
              ),

          confidence:
            1,
        })
      );
    }

    // ------------------------------------------------------------------------
    // USER-FACING IMPACT
    // ------------------------------------------------------------------------

    if (
      context
        .blastRadius
        ?.summary
        ?.userFacingImpact ===
      true
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "user-impact"
            ),

          type:
            "user_facing_impact",

          title:
            "User-facing impact detected",

          description:
            "Topology analysis indicates that user-facing services are inside the incident blast radius.",

          severity:
            context
              .incident
              .severity ||
            "warning",

          affectedServices:
            (
              context
                .blastRadius
                ?.affectedServices ||
              []
            )
              .map(
                (
                  service
                ) =>
                  service
                    .id
              )
              .filter(
                Boolean
              ),

          evidenceIds: [
            `blast-radius:${context.incidentId}`,
          ],

          confidence:
            1,
        })
      );
    }

    // ------------------------------------------------------------------------
    // FALLBACK SYMPTOM
    // ------------------------------------------------------------------------

    if (
      symptoms.length ===
      0
    ) {
      symptoms.push(
        createSymptom({
          id:
            this.symptomId(
              "generic"
            ),

          type:
            "incident_observation",

          title:
            context
              .incident
              ?.title ||
            "Operational degradation observed",

          description:
            context
              .incident
              ?.description ||
            "AIRA identified an incident but the available evidence does not yet isolate a more specific symptom.",

          severity:
            context
              .incident
              ?.severity ||
            "warning",

          evidenceIds:
            (
              context
                .evidence
                ?.items ||
              []
            )
              .slice(
                0,
                10
              )
              .map(
                (
                  item
                ) =>
                  item.id
              ),

          confidence:
            Math.max(
              0.35,
              Number(
                context
                  .evidence
                  ?.completeness ||
                0
              )
            ),
        })
      );
    }

    return this.mergeSymptoms(
      [],
      symptoms
    );
  }

  // ==========================================================================
  // DETERMINISTIC FINDINGS
  // ==========================================================================

  buildDeterministicFindings(
    context,
    symptoms
  ) {
    const findings =
      [];

    if (
      symptoms.length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:symptoms:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "symptom_summary",

          title:
            `${symptoms.length} observable symptom(s) identified`,

          summary:
            symptoms
              .map(
                (
                  symptom
                ) =>
                  symptom
                    .title
              )
              .join(
                "; "
              ),

          confidence:
            this.calculateSymptomConfidence(
              context,
              symptoms
            ),

          evidenceIds:
            Array.from(
              new Set(
                symptoms
                  .flatMap(
                    (
                      symptom
                    ) =>
                      symptom
                        .evidenceIds ||
                      []
                  )
              )
            ),

          affectedServices:
            Array.from(
              new Set(
                symptoms
                  .flatMap(
                    (
                      symptom
                    ) =>
                      symptom
                        .affectedServices ||
                      []
                  )
              )
            ),
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // AI SYMPTOM NORMALIZATION
  // ==========================================================================

  normalizeAiSymptoms(
    symptoms,
    context
  ) {
    if (
      !Array.isArray(
        symptoms
      )
    ) {
      return [];
    }

    return symptoms
      .slice(
        0,
        25
      )
      .map(
        (
          symptom,
          index
        ) => {
          if (
            !symptom ||
            typeof symptom !==
              "object"
          ) {
            return null;
          }

          return createSymptom({
            id:
              symptom.id ||
              this.symptomId(
                `ai-${index}`
              ),

            type:
              symptom.type ||
              "observed_symptom",

            title:
              symptom.title ||
              symptom.name ||
              "Observed symptom",

            description:
              symptom.description ||
              symptom.summary ||
              "",

            severity:
              normalizeSeverity(
                symptom.severity,
                context
                  .incident
                  ?.severity
              ),

            firstObservedAt:
              symptom
                .firstObservedAt ||
              null,

            lastObservedAt:
              symptom
                .lastObservedAt ||
              null,

            affectedServices:
              Array.isArray(
                symptom
                  .affectedServices
              )
                ? symptom
                    .affectedServices
                : [],

            affectedResources:
              Array.isArray(
                symptom
                  .affectedResources
              )
                ? symptom
                    .affectedResources
                : [],

            evidenceIds:
              Array.isArray(
                symptom
                  .evidenceIds
              )
                ? symptom
                    .evidenceIds
                : [],

            confidence:
              clamp01(
                symptom
                  .confidence ??
                0.5
              ),
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // AI FINDINGS
  // ==========================================================================

  buildAiFindings(
    aiOutput,
    symptoms
  ) {
    if (
      !Array.isArray(
        aiOutput
          ?.observations
      )
    ) {
      return [];
    }

    return aiOutput
      .observations
      .slice(
        0,
        25
      )
      .map(
        (
          observation,
          index
        ) => {
          const text =
            typeof observation ===
              "string"
              ? observation
              : (
                  observation
                    ?.summary ||
                  observation
                    ?.title ||
                  ""
                );

          if (!text) {
            return null;
          }

          return createAgentFinding({
            id:
              `finding:ai-symptom:${index}:${crypto
                .createHash(
                  "sha1"
                )
                .update(
                  text
                )
                .digest(
                  "hex"
                )
                .slice(
                  0,
                  12
                )}`,

            agent:
              AGENT_NAME,

            findingType:
              "observation",

            title:
              text.slice(
                0,
                200
              ),

            summary:
              text,

            confidence:
              clamp01(
                observation
                  ?.confidence ??
                0.6
              ),

            evidenceIds:
              Array.isArray(
                observation
                  ?.evidenceIds
              )
                ? observation
                    .evidenceIds
                : [],

            affectedServices:
              Array.from(
                new Set(
                  symptoms
                    .flatMap(
                      (
                        symptom
                      ) =>
                        symptom
                          .affectedServices ||
                        []
                    )
                )
              ),
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // MERGE SYMPTOMS
  // ==========================================================================

  mergeSymptoms(
    first,
    second
  ) {
    const map =
      new Map();

    for (
      const symptom
      of [
        ...first,
        ...second,
      ]
    ) {
      if (!symptom) {
        continue;
      }

      const key =
        [
          symptom.type,
          symptom.title,
        ]
          .map(
            (
              value
            ) =>
              String(
                value ||
                ""
              )
                .trim()
                .toLowerCase()
          )
          .join(
            "::"
          );

      if (
        !map.has(
          key
        )
      ) {
        map.set(
          key,
          {
            ...symptom,
          }
        );

        continue;
      }

      const existing =
        map.get(
          key
        );

      existing.confidence =
        Math.max(
          existing
            .confidence ||
          0,

          symptom
            .confidence ||
          0
        );

      existing.evidenceIds =
        Array.from(
          new Set([
            ...(
              existing
                .evidenceIds ||
              []
            ),

            ...(
              symptom
                .evidenceIds ||
              []
            ),
          ])
        );

      existing.affectedServices =
        Array.from(
          new Set([
            ...(
              existing
                .affectedServices ||
              []
            ),

            ...(
              symptom
                .affectedServices ||
              []
            ),
          ])
        );

      existing.affectedResources =
        Array.from(
          new Set([
            ...(
              existing
                .affectedResources ||
              []
            ),

            ...(
              symptom
                .affectedResources ||
              []
            ),
          ])
        );
    }

    return [
      ...map.values(),
    ];
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateSymptomConfidence(
    context,
    symptoms
  ) {
    if (
      symptoms.length ===
      0
    ) {
      return 0;
    }

    const symptomAverage =
      symptoms.reduce(
        (
          total,
          symptom
        ) =>
          total +
          (
            symptom
              .confidence ||
            0
          ),
        0
      ) /
      symptoms.length;

    const evidenceCompleteness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const evidenceCoverage =
      Math.min(
        1,
        (
          context
            .evidence
            ?.items
            ?.length ||
          0
        ) /
          5
      );

    return Number(
      (
        symptomAverage *
          0.6 +
        evidenceCompleteness *
          0.25 +
        evidenceCoverage *
          0.15
      )
        .toFixed(
          4
        )
    );
  }

  // ==========================================================================
  // EVIDENCE IDS
  // ==========================================================================

  evidenceIdsForSignals(
    signals,
    evidenceItems
  ) {
    const ids =
      new Set();

    for (
      const signal
      of signals
    ) {
      if (
        signal
          .signalId
      ) {
        ids.add(
          `signal:${signal.signalId}`
        );
      }
    }

    /*
     * Preserve only evidence IDs that actually exist when canonical
     * evidence is supplied.
     */
    if (
      Array.isArray(
        evidenceItems
      ) &&
      evidenceItems
        .length >
        0
    ) {
      const available =
        new Set(
          evidenceItems
            .map(
              (
                evidence
              ) =>
                evidence.id
            )
        );

      return [
        ...ids,
      ]
        .filter(
          (
            evidenceId
          ) =>
            available.has(
              evidenceId
            )
        );
    }

    return [
      ...ids,
    ];
  }

  // ==========================================================================
  // SEVERITY
  // ==========================================================================

  highestSeverity(
    values
  ) {
    const order = {
      unknown:
        0,

      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    let highest =
      "unknown";

    for (
      const value
      of values
    ) {
      const severity =
        normalizeSeverity(
          value
            ?.severity,
          "unknown"
        );

      if (
        (
          order[
            severity
          ] ||
          0
        ) >
        (
          order[
            highest
          ] ||
          0
        )
      ) {
        highest =
          severity;
      }
    }

    return highest;
  }

  // ==========================================================================
  // ID
  // ==========================================================================

  symptomId(
    suffix
  ) {
    return (
      `symptom:${String(
        suffix
      )
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9_-]+/g,
          "-"
        )}`
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
          "SymptomAnalysisAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Array.isArray(
        record
          .result
          ?.symptoms
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "SymptomAnalysisAgent must return symptoms",
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
        "context.evidence",
        "context.signals",
        "context.metrics",
        "context.logs",
        "context.traces",
        "context.alerts",
        "context.kubernetes",
        "context.blastRadius",
      ],

      writes: [
        "context.symptoms",
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

function groupBy(
  values,
  selector
) {
  const groups =
    new Map();

  for (
    const value
    of values
  ) {
    const key =
      selector(
        value
      );

    if (!key) {
      continue;
    }

    if (
      !groups.has(
        key
      )
    ) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(
        key
      )
      .push(
        value
      );
  }

  return groups;
}

function uniqueIds(
  values
) {
  return Array.from(
    new Set(
      values
        .filter(
          Boolean
        )
        .map(
          String
        )
    )
  );
}

function earliestDate(
  values,
  field
) {
  const dates =
    values
      .map(
        (
          value
        ) =>
          value
            ?.[field]
      )
      .filter(
        Boolean
      )
      .map(
        (
          value
        ) =>
          new Date(
            value
          )
      )
      .filter(
        (
          value
        ) =>
          !Number.isNaN(
            value
              .getTime()
          )
      );

  if (
    dates.length ===
    0
  ) {
    return null;
  }

  return new Date(
    Math.min(
      ...dates.map(
        (
          date
        ) =>
          date
            .getTime()
      )
    )
  );
}

function latestDate(
  values,
  field
) {
  const dates =
    values
      .map(
        (
          value
        ) =>
          value
            ?.[field]
      )
      .filter(
        Boolean
      )
      .map(
        (
          value
        ) =>
          new Date(
            value
          )
      )
      .filter(
        (
          value
        ) =>
          !Number.isNaN(
            value
              .getTime()
          )
      );

  if (
    dates.length ===
    0
  ) {
    return null;
  }

  return new Date(
    Math.max(
      ...dates.map(
        (
          date
        ) =>
          date
            .getTime()
      )
    )
  );
}

function normalizeSeverity(
  severity,
  fallback =
    "unknown"
) {
  const normalized =
    String(
      severity ||
      fallback
    )
      .trim()
      .toLowerCase();

  if (
    [
      "critical",
      "warning",
      "info",
      "unknown",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }

  if (
    [
      "high",
      "severe",
      "fatal",
      "error",
    ].includes(
      normalized
    )
  ) {
    return "critical";
  }

  if (
    [
      "medium",
      "warn",
      "degraded",
    ].includes(
      normalized
    )
  ) {
    return "warning";
  }

  if (
    [
      "low",
      "normal",
    ].includes(
      normalized
    )
  ) {
    return "info";
  }

  return fallback;
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

  return Math.min(
    1,
    Math.max(
      0,
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

function deduplicateFindings(
  findings
) {
  const map =
    new Map();

  for (
    const finding
    of findings
  ) {
    if (
      !finding?.id
    ) {
      continue;
    }

    const existing =
      map.get(
        finding.id
      );

    if (
      !existing ||
      (
        finding
          .confidence ||
        0
      ) >
      (
        existing
          .confidence ||
        0
      )
    ) {
      map.set(
        finding.id,
        finding
      );
    }
  }

  return [
    ...map.values(),
  ];
}

// ============================================================================
// PROMPT
// ============================================================================

const SYMPTOM_ANALYSIS_SYSTEM_PROMPT =
  `
You are the AIRA Symptom Analysis Agent.

Your task is to determine WHAT is observably wrong.

Do NOT determine root cause yet.

Rules:

1. Report only symptoms supported by evidence.
2. Every meaningful symptom should reference supporting evidence IDs.
3. Separate symptoms from causes.
4. "Database pool exhaustion" is a cause, not a symptom.
5. "HTTP 503 responses increased" is a symptom.
6. "Pod restart count increased" is a symptom.
7. "Latency increased" is a symptom.
8. Do not infer causality solely from timing or correlation.
9. Do not invent metrics, logs, traces, deployments, or errors.
10. Clearly surface unknowns when evidence is insufficient.
11. Consolidate duplicate observations into one symptom.
12. Preserve severity and temporal ordering where possible.
13. Never execute infrastructure operations.
14. Never authorize execution.
15. Never propose arbitrary shell commands.
16. Return ONLY valid JSON.

Return:
{
  "symptoms": [
    {
      "type": "...",
      "title": "...",
      "description": "...",
      "severity": "info|warning|critical|unknown",
      "firstObservedAt": null,
      "lastObservedAt": null,
      "affectedServices": [],
      "affectedResources": [],
      "evidenceIds": [],
      "confidence": 0.0
    }
  ],
  "observations": [],
  "unknowns": [],
  "symptomConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  SymptomAnalysisAgent,
};