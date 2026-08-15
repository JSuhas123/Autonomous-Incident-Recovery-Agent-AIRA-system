"use strict";

/**
 * AIRA Root Cause Hypothesis Agent
 *
 * Phase 6 responsibility:
 *
 * Generate and rank plausible root-cause hypotheses from:
 *
 * - canonical evidence
 * - symptoms
 * - topology analysis
 * - change analysis
 * - historical analysis
 *
 * Safety:
 *
 * - no execution
 * - no playbook selection
 * - no mutation
 * - no forced root cause when evidence is weak
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
  HYPOTHESIS_STATUS,
  DIAGNOSIS_OUTCOME,
  createHypothesis,
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
  "RootCauseHypothesisAgent";

const AGENT_VERSION =
  "1.0.0";

class RootCauseHypothesisAgent
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

    this.maxHypotheses =
      Number(
        config
          .maxHypotheses ||
        process.env
          .DIAGNOSIS_MAX_HYPOTHESES
      ) ||
      8;

    this.minimumHypothesisConfidence =
      clamp01(
        config
          .minimumHypothesisConfidence ??
        process.env
          .DIAGNOSIS_MIN_HYPOTHESIS_CONFIDENCE ??
        0.2
      );
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
      // 1. BUILD DETERMINISTIC CANDIDATES
      // ======================================================================

      const deterministicCandidates =
        this.generateDeterministicCandidates(
          context
        );

      // ======================================================================
      // 2. AI HYPOTHESIS GENERATION
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "root_cause_hypothesis",

            systemInstructions:
              ROOT_CAUSE_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              service:
                context.service,

              symptoms:
                context.symptoms ||
                [],

              evidenceSummary: {
                completeness:
                  context
                    .evidence
                    ?.completeness ||
                  0,

                missingEvidence:
                  context
                    .evidence
                    ?.missingEvidence ||
                  [],

                conflicts:
                  context
                    .evidence
                    ?.conflicts ||
                  [],
              },

              evidence:
                (
                  context
                    .evidence
                    ?.items ||
                  []
                )
                  .slice(
                    0,
                    100
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

                      confidence:
                        evidence
                          .confidence,

                      observedAt:
                        evidence
                          .observedAt,

                      structuredData:
                        evidence
                          .structuredData,
                    })
                  ),

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

              deterministicCandidates,
            },

            outputSchema: {
              required: [
                "hypotheses",
              ],

              properties: {
                hypotheses: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                overallDiagnosisConfidence: {
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
      // 3. NORMALIZE AI HYPOTHESES
      // ======================================================================

      const aiHypotheses =
        this.normalizeAiHypotheses(
          aiOutput
            .hypotheses,
          context
        );

      // ======================================================================
      // 4. MERGE
      // ======================================================================

      const merged =
        this.mergeHypotheses(
          deterministicCandidates,
          aiHypotheses
        );

      // ======================================================================
      // 5. SCORE
      // ======================================================================

      const scored =
        merged
          .map(
            (
              hypothesis
            ) =>
              this.scoreHypothesis(
                hypothesis,
                context
              )
          )
          .filter(
            (
              hypothesis
            ) =>
              hypothesis.confidence >=
              this.minimumHypothesisConfidence
          )
          .sort(
            (
              first,
              second
            ) =>
              second.confidence -
              first.confidence
          )
          .slice(
            0,
            this.maxHypotheses
          )
          .map(
            (
              hypothesis,
              index
            ) => ({
              ...hypothesis,

              rank:
                index + 1,
            })
          );

      // ======================================================================
      // 6. OUTCOME
      // ======================================================================

      const outcome =
        this.determineOutcome(
          scored,
          context
        );

      const primaryHypothesis =
        scored[0] ||
        null;

      // ======================================================================
      // 7. FINDINGS
      // ======================================================================

      const findings =
        this.buildFindings(
          context,
          scored,
          outcome
        );

      // ======================================================================
      // 8. DIAGNOSIS CONFIDENCE
      // ======================================================================

      const deterministicConfidence =
        this.calculateDiagnosisConfidence(
          scored,
          context
        );

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .overallDiagnosisConfidence
        );

      const canonical =
        Boolean(
          context.organizationId &&
          context.environmentId
        );

      let diagnosisConfidence;

      if (
        aiConfidence ===
        null
      ) {
        diagnosisConfidence =
          deterministicConfidence;
      } else if (
        !canonical
      ) {
        diagnosisConfidence =
          aiConfidence;
      } else {
        diagnosisConfidence =
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
      // 9. RETURN
      // ======================================================================

      return this._success(
        startedAt,

        {
          hypotheses:
            scored,

          primaryHypothesis,

          outcome,

          diagnosisConfidence,

          unknowns:
            mergeUnique(
              context
                .historicalAnalysis
                ?.unknowns ||
                [],

              aiOutput
                .unknowns ||
                []
            ),

          findings,

          executionAuthorized:
            false,
        },

        {
          confidence:
            diagnosisConfidence,

          evidenceUsed:
            Array.from(
              new Set(
                scored
                  .flatMap(
                    (
                      hypothesis
                    ) => [
                      ...(
                        hypothesis
                          .evidenceSupporting ||
                        []
                      ),

                      ...(
                        hypothesis
                          .evidenceAgainst ||
                        []
                      ),
                    ]
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
  // CONTEXT
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
          "Root cause analysis requires incidentId"
        ),
        {
          code:
            "ROOT_CAUSE_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Root cause analysis requires incident context"
        ),
        {
          code:
            "ROOT_CAUSE_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // DETERMINISTIC CANDIDATES
  // ==========================================================================

  generateDeterministicCandidates(
    context
  ) {
    const candidates =
      [];

    const symptoms =
      context.symptoms ||
      [];

    // ------------------------------------------------------------------------
    // HTTP / dependency failure
    // ------------------------------------------------------------------------

    if (
      symptoms.some(
        (
          symptom
        ) =>
          symptom.type ===
            "http_error_rate" ||
          symptom.type ===
            "trace_failure"
      )
    ) {
      candidates.push(
        createHypothesis({
          id:
            this.hypothesisId(
              "upstream_dependency_failure"
            ),

          rootCause:
            "Upstream dependency or downstream service dependency failure",

          title:
            "Dependency failure",

          category:
            "dependency",

          confidence:
            0.4,

          status:
            HYPOTHESIS_STATUS
              .PROPOSED,

          evidenceSupporting:
            this.evidenceIdsByType(
              context,
              [
                "TRACE",
                "ALERT",
                "DEPENDENCY_STATE",
                "TOPOLOGY",
              ]
            ),

          explanation:
            "HTTP/trace failures can be caused by an unhealthy dependency. Topology and trace evidence must confirm whether failure propagated from another service.",

          unknowns: [
            "Exact failing dependency may not yet be known.",
          ],
        })
      );
    }

    // ------------------------------------------------------------------------
    // Recent deployment/configuration regression
    // ------------------------------------------------------------------------

    const suspiciousChanges =
      context
        .changeAnalysis
        ?.suspiciousChanges ||
      [];

    if (
      suspiciousChanges.length >
      0
    ) {
      candidates.push(
        createHypothesis({
          id:
            this.hypothesisId(
              "recent_change_regression"
            ),

          rootCause:
            "Recent deployment, configuration, or infrastructure change introduced a regression",

          title:
            "Recent change regression",

          category:
            "change",

          confidence:
            0.45,

          status:
            HYPOTHESIS_STATUS
              .PROPOSED,

          evidenceSupporting:
            this.evidenceIdsByType(
              context,
              [
                "DEPLOYMENT_CHANGE",
                "CONFIGURATION_CHANGE",
              ]
            ),

          explanation:
            "A potentially impactful change occurred shortly before incident onset. Temporal proximity is supporting evidence but does not prove causality.",

          assumptions: [
            "The relevant change affected the failing service or dependency.",
          ],
        })
      );
    }

    // ------------------------------------------------------------------------
    // Kubernetes / resource failure
    // ------------------------------------------------------------------------

    const suspiciousResources =
      context
        .topologyAnalysis
        ?.suspiciousResources ||
      [];

    if (
      suspiciousResources.length >
      0
    ) {
      candidates.push(
        createHypothesis({
          id:
            this.hypothesisId(
              "infrastructure_resource_failure"
            ),

          rootCause:
            "Underlying infrastructure or Kubernetes resource degradation",

          title:
            "Infrastructure resource degradation",

          category:
            "infrastructure",

          confidence:
            0.45,

          status:
            HYPOTHESIS_STATUS
              .PROPOSED,

          evidenceSupporting:
            this.evidenceIdsByType(
              context,
              [
                "RESOURCE_STATE",
                "KUBERNETES_EVENT",
                "TOPOLOGY",
                "BLAST_RADIUS",
              ]
            ),

          affectedResources:
            suspiciousResources
              .map(
                (
                  resource
                ) =>
                  resource.id
              )
              .filter(
                Boolean
              ),

          explanation:
            "Topology analysis identified unhealthy or highly critical infrastructure resources inside the incident blast radius.",
        })
      );
    }

    // ------------------------------------------------------------------------
    // Recurring known failure
    // ------------------------------------------------------------------------

    if (
      context
        .historicalAnalysis
        ?.recurrenceDetected
    ) {
      candidates.push(
        createHypothesis({
          id:
            this.hypothesisId(
              "recurring_known_failure"
            ),

          rootCause:
            "Recurrence of a previously observed failure pattern",

          title:
            "Recurring failure pattern",

          category:
            "recurrence",

          confidence:
            context
              .historicalAnalysis
              .recurringFingerprint
              ? 0.7
              : 0.5,

          status:
            HYPOTHESIS_STATUS
              .PROPOSED,

          evidenceSupporting:
            this.evidenceIdsByType(
              context,
              [
                "HISTORICAL_INCIDENT",
                "INCIDENT_EVENT",
              ]
            ),

          explanation:
            "Historical analysis indicates that this incident resembles or shares identity with prior failures.",

          assumptions: [
            "Historical similarity does not guarantee identical root cause.",
          ],
        })
      );
    }

    // ------------------------------------------------------------------------
    // Resource exhaustion
    // ------------------------------------------------------------------------

    const metricEvidence =
      (
        context
          .evidence
          ?.items ||
        []
      )
        .filter(
          (
            evidence
          ) =>
            evidence.type ===
            "METRIC"
        );

    if (
      metricEvidence.length >
      0
    ) {
      const serialized =
        JSON.stringify(
          metricEvidence
        )
          .toLowerCase();

      if (
        /cpu|memory|connection|pool|queue|disk|latency|saturation/.test(
          serialized
        )
      ) {
        candidates.push(
          createHypothesis({
            id:
              this.hypothesisId(
                "resource_exhaustion"
              ),

            rootCause:
              "Resource exhaustion or saturation",

            title:
              "Resource exhaustion",

            category:
              "capacity",

            confidence:
              0.4,

            status:
              HYPOTHESIS_STATUS
                .PROPOSED,

            evidenceSupporting:
              metricEvidence
                .map(
                  (
                    evidence
                  ) =>
                    evidence.id
                ),

            explanation:
              "Metric evidence contains resource utilization, latency, queueing, connection, or saturation indicators that may contribute to the incident.",
          })
        );
      }
    }

    return candidates;
  }

  // ==========================================================================
  // AI NORMALIZATION
  // ==========================================================================

  normalizeAiHypotheses(
    hypotheses,
    context
  ) {
    if (
      !Array.isArray(
        hypotheses
      )
    ) {
      return [];
    }

    const availableEvidence =
      new Set(
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
      );

    return hypotheses
      .slice(
        0,
        this.maxHypotheses
      )
      .map(
        (
          hypothesis,
          index
        ) => {
          if (
            !hypothesis ||
            typeof hypothesis !==
              "object"
          ) {
            return null;
          }

          const rootCause =
            hypothesis.rootCause ||
            hypothesis.cause ||
            hypothesis.title;

          if (
            !rootCause
          ) {
            return null;
          }

          const supporting =
            normalizeArray(
              hypothesis
                .evidenceSupporting ||
              hypothesis
                .supportingEvidence ||
              hypothesis
                .evidenceIds
            )
              .filter(
                (
                  evidenceId
                ) =>
                  availableEvidence.has(
                    evidenceId
                  )
              );

          const against =
            normalizeArray(
              hypothesis
                .evidenceAgainst ||
              hypothesis
                .contradictingEvidence
            )
              .filter(
                (
                  evidenceId
                ) =>
                  availableEvidence.has(
                    evidenceId
                  )
              );

          return createHypothesis({
            id:
              hypothesis.id ||
              this.hypothesisId(
                `ai-${index}-${rootCause}`
              ),

            rootCause,

            title:
              hypothesis.title ||
              rootCause,

            category:
              hypothesis.category ||
              null,

            confidence:
              clamp01(
                hypothesis
                  .confidence ??
                0.4
              ),

            status:
              normalizeHypothesisStatus(
                hypothesis.status
              ),

            evidenceSupporting:
              supporting,

            evidenceAgainst:
              against,

            contradictions:
              normalizeArray(
                hypothesis
                  .contradictions
              ),

            affectedServices:
              normalizeArray(
                hypothesis
                  .affectedServices
              ),

            affectedResources:
              normalizeArray(
                hypothesis
                  .affectedResources
              ),

            explanation:
              hypothesis.explanation ||
              hypothesis.reasoning ||
              "",

            causalChain:
              normalizeArray(
                hypothesis
                  .causalChain
              ),

            assumptions:
              normalizeArray(
                hypothesis
                  .assumptions
              ),

            unknowns:
              normalizeArray(
                hypothesis
                  .unknowns
              ),
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // MERGE
  // ==========================================================================

  mergeHypotheses(
    deterministic,
    ai
  ) {
    const map =
      new Map();

    for (
      const hypothesis
      of [
        ...deterministic,
        ...ai,
      ]
    ) {
      const key =
        normalizeCause(
          hypothesis
            .rootCause
        );

      if (
        !map.has(
          key
        )
      ) {
        map.set(
          key,
          {
            ...hypothesis,
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
          existing.confidence ||
            0,
          hypothesis.confidence ||
            0
        );

      existing.evidenceSupporting =
        uniqueStrings([
          ...(
            existing
              .evidenceSupporting ||
            []
          ),

          ...(
            hypothesis
              .evidenceSupporting ||
            []
          ),
        ]);

      existing.evidenceAgainst =
        uniqueStrings([
          ...(
            existing
              .evidenceAgainst ||
            []
          ),

          ...(
            hypothesis
              .evidenceAgainst ||
            []
          ),
        ]);

      existing.contradictions =
        mergeUnique(
          existing
            .contradictions ||
            [],
          hypothesis
            .contradictions ||
            []
        );

      existing.assumptions =
        uniqueStrings([
          ...(
            existing
              .assumptions ||
            []
          ),

          ...(
            hypothesis
              .assumptions ||
            []
          ),
        ]);

      existing.unknowns =
        uniqueStrings([
          ...(
            existing
              .unknowns ||
            []
          ),

          ...(
            hypothesis
              .unknowns ||
            []
          ),
        ]);
    }

    return [
      ...map.values(),
    ];
  }

  // ==========================================================================
  // SCORING
  // ==========================================================================

  scoreHypothesis(
    hypothesis,
    context
  ) {
    const supportCount =
      hypothesis
        .evidenceSupporting
        ?.length ||
      0;

    const againstCount =
      hypothesis
        .evidenceAgainst
        ?.length ||
      0;

    const evidenceCompleteness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const supportStrength =
      Math.min(
        1,
        supportCount /
          4
      );

    const contradictionPenalty =
      Math.min(
        0.5,
        againstCount *
          0.12
      );

    let confidence =
      (
        hypothesis.confidence ||
        0
      ) *
        0.45 +
      supportStrength *
        0.3 +
      evidenceCompleteness *
        0.25 -
      contradictionPenalty;

    confidence =
      clamp01(
        confidence
      );

    let status =
      HYPOTHESIS_STATUS
        .PROPOSED;

    if (
      againstCount >
      supportCount &&
      againstCount >
      0
    ) {
      status =
        HYPOTHESIS_STATUS
          .CONTRADICTED;
    } else if (
      confidence >=
      0.8 &&
      supportCount >=
      2
    ) {
      status =
        HYPOTHESIS_STATUS
          .SUPPORTED;
    } else if (
      confidence >=
      0.5
    ) {
      status =
        HYPOTHESIS_STATUS
          .WEAKLY_SUPPORTED;
    }

    return {
      ...hypothesis,

      confidence:
        Number(
          confidence
            .toFixed(
              4
            )
        ),

      status,
    };
  }

  // ==========================================================================
  // OUTCOME
  // ==========================================================================

  determineOutcome(
    hypotheses,
    context
  ) {
    const completeness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    if (
      hypotheses.length ===
      0
    ) {
      return DIAGNOSIS_OUTCOME
        .INSUFFICIENT_EVIDENCE;
    }

    const first =
      hypotheses[0];

    const second =
      hypotheses[1] ||
      null;

    if (
      completeness <
      0.25 &&
      first.confidence <
      0.65
    ) {
      return DIAGNOSIS_OUTCOME
        .INSUFFICIENT_EVIDENCE;
    }

    if (
      first.status ===
      HYPOTHESIS_STATUS
        .CONTRADICTED
    ) {
      return DIAGNOSIS_OUTCOME
        .CONTRADICTORY_EVIDENCE;
    }

    if (
      first.confidence >=
        0.9 &&
      (
        first
          .evidenceSupporting
          ?.length ||
        0
      ) >=
        3
    ) {
      return DIAGNOSIS_OUTCOME
        .ROOT_CAUSE_IDENTIFIED;
    }

    if (
      first.confidence >=
      0.65
    ) {
      if (
        second &&
        Math.abs(
          first.confidence -
          second.confidence
        ) <
        0.12
      ) {
        return DIAGNOSIS_OUTCOME
          .MULTIPLE_PLAUSIBLE_CAUSES;
      }

      return DIAGNOSIS_OUTCOME
        .PROBABLE_CAUSE_IDENTIFIED;
    }

    return DIAGNOSIS_OUTCOME
      .INSUFFICIENT_EVIDENCE;
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateDiagnosisConfidence(
    hypotheses,
    context
  ) {
    if (
      hypotheses.length ===
      0
    ) {
      return 0;
    }

    const primary =
      hypotheses[0];

    const evidenceCompleteness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const separation =
      hypotheses[1]
        ? Math.min(
            1,
            Math.max(
              0,
              primary.confidence -
              hypotheses[1]
                .confidence
            ) *
              2
          )
        : primary.confidence;

    return Number(
      (
        primary.confidence *
          0.6 +
        evidenceCompleteness *
          0.25 +
        separation *
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
    hypotheses,
    outcome
  ) {
    if (
      hypotheses.length ===
      0
    ) {
      return [
        createAgentFinding({
          id:
            `finding:no-root-cause:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "insufficient_evidence",

          title:
            "No defensible root-cause hypothesis identified",

          summary:
            "Available evidence is insufficient to produce a supported root-cause hypothesis.",

          confidence:
            1,

          evidenceIds:
            [],
        }),
      ];
    }

    const primary =
      hypotheses[0];

    const findings = [
      createAgentFinding({
        id:
          `finding:primary-hypothesis:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "root_cause_hypothesis",

        title:
          primary.title ||
          primary.rootCause,

        summary:
          `Top hypothesis confidence=${primary.confidence}. Diagnosis outcome=${outcome}.`,

        confidence:
          primary.confidence,

        evidenceIds:
          primary
            .evidenceSupporting ||
          [],

        affectedServices:
          primary
            .affectedServices ||
          [],

        affectedResources:
          primary
            .affectedResources ||
          [],

        metadata: {
          hypothesisId:
            primary.id,

          outcome,

          evidenceAgainst:
            primary
              .evidenceAgainst ||
            [],
        },
      }),
    ];

    if (
      hypotheses.length >
      1
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:competing-hypotheses:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "competing_hypotheses",

          title:
            `${hypotheses.length} plausible root-cause hypotheses remain`,

          summary:
            hypotheses
              .map(
                (
                  hypothesis
                ) =>
                  `#${hypothesis.rank} ${hypothesis.title || hypothesis.rootCause} (${hypothesis.confidence})`
              )
              .join(
                "; "
              ),

          confidence:
            hypotheses[0]
              .confidence,

          evidenceIds:
            uniqueStrings(
              hypotheses
                .flatMap(
                  (
                    hypothesis
                  ) =>
                    hypothesis
                      .evidenceSupporting ||
                    []
                )
            ),
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // EVIDENCE
  // ==========================================================================

  evidenceIdsByType(
    context,
    types
  ) {
    return (
      context
        .evidence
        ?.items ||
      []
    )
      .filter(
        (
          evidence
        ) =>
          types.includes(
            evidence.type
          )
      )
      .map(
        (
          evidence
        ) =>
          evidence.id
      );
  }

  // ==========================================================================
  // ID
  // ==========================================================================

  hypothesisId(
    value
  ) {
    return (
      "hypothesis:" +
      crypto
        .createHash(
          "sha1"
        )
        .update(
          String(
            value
          )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          16
        )
    );
  }

  // ==========================================================================
  // VALIDATION
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
          "RootCauseHypothesisAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Array.isArray(
        record
          .result
          ?.hypotheses
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "RootCauseHypothesisAgent must return hypotheses",
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
        "context.symptoms",
        "context.topologyAnalysis",
        "context.changeAnalysis",
        "context.historicalAnalysis",
      ],

      writes: [
        "context.hypotheses",
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

function normalizeCause(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function normalizeHypothesisStatus(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    Object.values(
      HYPOTHESIS_STATUS
    )
      .includes(
        normalized
      )
  ) {
    return normalized;
  }

  return HYPOTHESIS_STATUS
    .PROPOSED;
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
          String
        )
    )
  );
}

function mergeUnique(
  first,
  second
) {
  const result =
    [];

  const seen =
    new Set();

  for (
    const value
    of [
      ...normalizeArray(
        first
      ),

      ...normalizeArray(
        second
      ),
    ]
  ) {
    let key;

    try {
      key =
        typeof value ===
        "string"
          ? value
          : JSON.stringify(
              value
            );
    } catch {
      continue;
    }

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      value
    );
  }

  return result;
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

// ============================================================================
// PROMPT
// ============================================================================

const ROOT_CAUSE_SYSTEM_PROMPT =
  `
You are the AIRA Root Cause Hypothesis Agent.

Your job is to generate and rank plausible root-cause hypotheses.

You must reason from evidence, symptoms, topology, changes and history.

Rules:

1. Generate multiple plausible hypotheses when evidence permits.
2. Do not force a root cause when evidence is insufficient.
3. Every hypothesis must identify supporting evidence IDs.
4. Include contradicting evidence IDs where applicable.
5. Distinguish correlation from causation.
6. A recent deployment is not automatically the cause.
7. Historical similarity is not proof of identical root cause.
8. An unhealthy downstream service may be an effect rather than the cause.
9. Prefer causal explanations that account for multiple symptoms.
10. Prefer direct telemetry over assumptions.
11. Explicitly record assumptions and unknowns.
12. Never invent evidence.
13. Never invent infrastructure resources.
14. Never select or execute a playbook.
15. Never mutate infrastructure.
16. Never authorize execution.
17. Return ONLY valid JSON.

Return:
{
  "hypotheses": [
    {
      "rootCause": "...",
      "title": "...",
      "category": "...",
      "confidence": 0.0,
      "status": "PROPOSED",
      "evidenceSupporting": [],
      "evidenceAgainst": [],
      "contradictions": [],
      "affectedServices": [],
      "affectedResources": [],
      "explanation": "...",
      "causalChain": [],
      "assumptions": [],
      "unknowns": []
    }
  ],
  "unknowns": [],
  "overallDiagnosisConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  RootCauseHypothesisAgent,
};