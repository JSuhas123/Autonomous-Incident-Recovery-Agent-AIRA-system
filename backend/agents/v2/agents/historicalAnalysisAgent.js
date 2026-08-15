"use strict";

/**
 * AIRA Historical Analysis Agent
 *
 * Phase 6 responsibility:
 *
 * Compare the current incident against historical incidents,
 * incident memory and previous remediation outcomes.
 *
 * Responsibilities:
 *
 * - identify similar historical incidents
 * - detect recurrence patterns
 * - summarize previous resolutions
 * - analyze previous action effectiveness
 * - surface contradictory historical outcomes
 *
 * This agent does NOT:
 *
 * - execute actions
 * - approve actions
 * - select a playbook for execution
 * - assume historical similarity proves identical root cause
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
  "HistoricalAnalysisAgent";

const AGENT_VERSION =
  "1.0.0";

class HistoricalAnalysisAgent
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

    this.maxHistoricalIncidents =
      Number(
        config
          .maxHistoricalIncidents ||
        process.env
          .DIAGNOSIS_MAX_HISTORICAL_INCIDENTS
      ) ||
      50;

    this.minimumSimilarity =
      clamp01(
        config
          .minimumSimilarity ??
        process.env
          .DIAGNOSIS_MIN_HISTORY_SIMILARITY ??
        0.35
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
      // 1. NORMALIZE HISTORY
      // ======================================================================

      const historicalIncidents =
        this.normalizeHistoricalIncidents(
          context
        );

      // ======================================================================
      // 2. SCORE SIMILARITY
      // ======================================================================

      const rankedIncidents =
        historicalIncidents
          .map(
            (
              incident
            ) => ({
              ...incident,

              similarity:
                this.calculateSimilarity(
                  context,
                  incident
                ),
            })
          )
          .filter(
            (
              incident
            ) =>
              incident
                .similarity
                .score >=
              this.minimumSimilarity
          )
          .sort(
            (
              first,
              second
            ) =>
              second
                .similarity
                .score -
              first
                .similarity
                .score
          )
          .slice(
            0,
            this.maxHistoricalIncidents
          );

      // ======================================================================
      // 3. DETERMINISTIC ANALYSIS
      // ======================================================================

      const analysis =
        this.analyzeHistory(
          context,
          rankedIncidents
        );

      // ======================================================================
      // 4. DETERMINISTIC FINDINGS
      // ======================================================================

      const deterministicFindings =
        this.buildFindings(
          context,
          analysis
        );

      // ======================================================================
      // 5. AI REFINEMENT
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "historical_analysis",

            systemInstructions:
              HISTORICAL_ANALYSIS_SYSTEM_PROMPT,

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

              similarIncidents:
                rankedIncidents
                  .slice(
                    0,
                    20
                  )
                  .map(
                    (
                      incident
                    ) => ({
                      id:
                        incident.id,

                      title:
                        incident.title,

                      severity:
                        incident.severity,

                      status:
                        incident.status,

                      fingerprint:
                        incident.fingerprint,

                      serviceId:
                        incident.serviceId,

                      errorCode:
                        incident.errorCode,

                      resolution:
                        incident.resolution,

                      rootCause:
                        incident.rootCause,

                      startedAt:
                        incident.startedAt,

                      resolvedAt:
                        incident.resolvedAt,

                      similarity:
                        incident.similarity,

                      actions:
                        incident.actions,
                    })
                  ),

              deterministicAssessment: {
                similarIncidentCount:
                  analysis
                    .similarIncidentCount,

                recurrenceDetected:
                  analysis
                    .recurrenceDetected,

                recurringFingerprint:
                  analysis
                    .recurringFingerprint,

                previousResolutions:
                  analysis
                    .previousResolutions,

                previousActions:
                  analysis
                    .previousActions,

                conflictingOutcomes:
                  analysis
                    .conflictingOutcomes,

                historyConfidence:
                  analysis
                    .historyConfidence,
              },
            },

            outputSchema: {
              required: [
                "historicalPatterns",
                "historyConfidence",
              ],

              properties: {
                historicalPatterns: {
                  type:
                    "array",
                },

                relevantIncidents: {
                  type:
                    "array",
                },

                previousSuccessfulActions: {
                  type:
                    "array",
                },

                previousFailedActions: {
                  type:
                    "array",
                },

                contradictions: {
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

                historyConfidence: {
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
      // 6. CONFIDENCE
      // ======================================================================

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .historyConfidence
        );

      const canonicalContext =
        Boolean(
          context.organizationId &&
          context.environmentId
        );

      let historyConfidence;

      if (
        aiConfidence ===
        null
      ) {
        historyConfidence =
          analysis
            .historyConfidence;
      } else if (
        !canonicalContext
      ) {
        /*
         * Legacy V2 compatibility.
         */
        historyConfidence =
          aiConfidence;
      } else {
        /*
         * Historical facts dominate.
         *
         * The reasoning model can interpret history, but cannot create
         * historical confidence that is unsupported by actual records.
         */
        historyConfidence =
          Number(
            (
              analysis
                .historyConfidence *
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
      // 7. AI FINDINGS
      // ======================================================================

      const aiFindings =
        this.buildAiFindings(
          context,
          aiOutput,
          historyConfidence
        );

      // ======================================================================
      // 8. RESULT
      // ======================================================================

      return this._success(
        startedAt,

        {
          similarIncidents:
            rankedIncidents,

          recurrenceDetected:
            analysis
              .recurrenceDetected,

          recurringFingerprint:
            analysis
              .recurringFingerprint,

          previousResolutions:
            analysis
              .previousResolutions,

          previousActions:
            analysis
              .previousActions,

          successfulActions:
            analysis
              .successfulActions,

          failedActions:
            analysis
              .failedActions,

          conflictingOutcomes:
            analysis
              .conflictingOutcomes,

          historicalPatterns:
            mergeUnique(
              analysis
                .historicalPatterns,

              normalizeArray(
                aiOutput
                  .historicalPatterns
              )
            ),

          findings:
            deduplicateFindings([
              ...deterministicFindings,
              ...aiFindings,
            ]),

          observations:
            normalizeArray(
              aiOutput
                .observations
            ),

          contradictions:
            mergeUnique(
              analysis
                .conflictingOutcomes,

              normalizeArray(
                aiOutput
                  .contradictions
              )
            ),

          unknowns:
            normalizeArray(
              aiOutput
                .unknowns
            ),

          historyConfidence,

          executionAuthorized:
            false,
        },

        {
          confidence:
            historyConfidence,

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
          "Historical analysis requires incidentId"
        ),
        {
          code:
            "HISTORY_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Historical analysis requires incident context"
        ),
        {
          code:
            "HISTORY_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizeHistoricalIncidents(
    context
  ) {
    const values = [
      ...normalizeArray(
        context
          .historicalIncidents
      ),

      ...normalizeArray(
        context
          .history
          ?.incidents
      ),

      ...normalizeArray(
        context
          .incidentMemory
          ?.incidents
      ),
    ];

    const map =
      new Map();

    values
      .forEach(
        (
          incident,
          index
        ) => {
          const normalized =
            this.normalizeHistoricalIncident(
              incident,
              index
            );

          if (
            !normalized
          ) {
            return;
          }

          /*
           * Never compare the current incident against itself.
           */
          if (
            String(
              normalized.id
            ) ===
            String(
              context
                .incidentId
            )
          ) {
            return;
          }

          map.set(
            normalized.id,
            normalized
          );
        }
      );

    return [
      ...map.values(),
    ];
  }

  normalizeHistoricalIncident(
    incident,
    index
  ) {
    if (
      !incident ||
      typeof incident !==
        "object"
    ) {
      return null;
    }

    const id =
      String(
        incident.id ||
        incident._id ||
        incident.incidentId ||
        `historical-${index}`
      );

    return {
      id,

      title:
        incident.title ||
        "Historical incident",

      description:
        incident.description ||
        null,

      fingerprint:
        incident.fingerprint ||
        null,

      serviceId:
        stringifyId(
          incident.serviceId
        ),

      environmentId:
        stringifyId(
          incident.environmentId
        ),

      severity:
        normalizeSeverity(
          incident.severity
        ),

      status:
        incident.status ||
        null,

      errorCode:
        incident.errorCode ||
        incident
          .metadata
          ?.errorCode ||
        null,

      issue:
        incident.issue ||
        null,

      source:
        incident.source ||
        null,

      startedAt:
        incident.startedAt ||
        incident.detectedAt ||
        incident.createdAt ||
        null,

      resolvedAt:
        incident.resolvedAt ||
        null,

      resolution:
        incident.resolution ||
        null,

      rootCause:
        incident.rootCause ||
        incident
          .diagnosis
          ?.rootCause ||
        null,

      symptoms:
        normalizeArray(
          incident.symptoms
        ),

      tags:
        normalizeArray(
          incident.tags
        ),

      actions:
        this.normalizeActions(
          incident.actions ||
          incident.remediations ||
          incident
            .actionHistory ||
          []
        ),

      metadata:
        incident.metadata ||
        {},
    };
  }

  normalizeActions(
    actions
  ) {
    return normalizeArray(
      actions
    )
      .map(
        (
          action,
          index
        ) => {
          if (
            !action
          ) {
            return null;
          }

          if (
            typeof action ===
            "string"
          ) {
            return {
              id:
                `action-${index}`,

              action:
                action,

              status:
                "unknown",

              successful:
                null,

              effectiveness:
                null,
            };
          }

          const status =
            String(
              action.status ||
              action.outcome ||
              ""
            )
              .trim()
              .toLowerCase();

          let successful =
            null;

          if (
            typeof action.successful ===
            "boolean"
          ) {
            successful =
              action.successful;
          } else if (
            [
              "success",
              "successful",
              "resolved",
              "effective",
              "completed",
            ].includes(
              status
            )
          ) {
            successful =
              true;
          } else if (
            [
              "failed",
              "failure",
              "ineffective",
              "error",
            ].includes(
              status
            )
          ) {
            successful =
              false;
          }

          return {
            id:
              String(
                action.id ||
                action._id ||
                `action-${index}`
              ),

            action:
              action.action ||
              action.name ||
              action.playbook ||
              action.runbook ||
              action.type ||
              "unknown_action",

            playbookId:
              action.playbookId ||
              null,

            runbookId:
              action.runbookId ||
              null,

            status:
              status ||
              "unknown",

            successful,

            effectiveness:
              normalizeEffectiveness(
                action.effectiveness ||
                action
                  .effectivenessScore ||
                action.score
              ),

            executedAt:
              action.executedAt ||
              action.createdAt ||
              null,

            metadata:
              action.metadata ||
              {},
          };
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // SIMILARITY
  // ==========================================================================

  calculateSimilarity(
    context,
    historical
  ) {
    const current =
      context.incident;

    const currentServiceId =
      stringifyId(
        current.serviceId ||
        context
          .service
          ?.id ||
        context
          .service
          ?._id
      );

    const factors =
      [];

    // ------------------------------------------------------------------------
    // Fingerprint
    // ------------------------------------------------------------------------

    if (
      current.fingerprint &&
      historical.fingerprint
    ) {
      factors.push({
        factor:
          "fingerprint",

        matched:
          current.fingerprint ===
          historical.fingerprint,

        weight:
          0.35,
      });
    }

    // ------------------------------------------------------------------------
    // Service
    // ------------------------------------------------------------------------

    if (
      currentServiceId &&
      historical.serviceId
    ) {
      factors.push({
        factor:
          "service",

        matched:
          currentServiceId ===
          historical.serviceId,

        weight:
          0.2,
      });
    }

    // ------------------------------------------------------------------------
    // Error code
    // ------------------------------------------------------------------------

    const currentErrorCode =
      current.errorCode ||
      this.currentErrorCode(
        context
      );

    if (
      currentErrorCode &&
      historical.errorCode
    ) {
      factors.push({
        factor:
          "error_code",

        matched:
          String(
            currentErrorCode
          ) ===
          String(
            historical.errorCode
          ),

        weight:
          0.15,
      });
    }

    // ------------------------------------------------------------------------
    // Title similarity
    // ------------------------------------------------------------------------

    if (
      current.title &&
      historical.title
    ) {
      factors.push({
        factor:
          "title",

        matched:
          textSimilarity(
            current.title,
            historical.title
          ),

        weight:
          0.1,
      });
    }

    // ------------------------------------------------------------------------
    // Symptom similarity
    // ------------------------------------------------------------------------

    const currentSymptoms =
      normalizeArray(
        context.symptoms
      );

    if (
      currentSymptoms.length >
        0 &&
      historical.symptoms.length >
        0
    ) {
      factors.push({
        factor:
          "symptoms",

        matched:
          symptomSimilarity(
            currentSymptoms,
            historical.symptoms
          ),

        weight:
          0.15,
      });
    }

    // ------------------------------------------------------------------------
    // Severity
    // ------------------------------------------------------------------------

    if (
      current.severity &&
      historical.severity
    ) {
      factors.push({
        factor:
          "severity",

        matched:
          normalizeSeverity(
            current.severity
          ) ===
          historical.severity,

        weight:
          0.05,
      });
    }

    if (
      factors.length ===
      0
    ) {
      return {
        score:
          0,

        factors:
          [],
      };
    }

    let numerator =
      0;

    let denominator =
      0;

    for (
      const factor
      of factors
    ) {
      denominator +=
        factor.weight;

      const matched =
        typeof factor.matched ===
          "number"
          ? clamp01(
              factor.matched
            )
          : (
              factor.matched
                ? 1
                : 0
            );

      numerator +=
        matched *
        factor.weight;
    }

    return {
      score:
        Number(
          (
            numerator /
            denominator
          )
            .toFixed(
              4
            )
        ),

      factors,
    };
  }

  currentErrorCode(
    context
  ) {
    const signals =
      normalizeArray(
        context.signals
      );

    const match =
      signals.find(
        (
          signal
        ) =>
          Boolean(
            signal.errorCode
          )
      );

    return (
      match
        ?.errorCode ||
      null
    );
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  analyzeHistory(
    context,
    incidents
  ) {
    const currentFingerprint =
      context
        .incident
        ?.fingerprint ||
      null;

    const fingerprintMatches =
      currentFingerprint
        ? incidents.filter(
            (
              incident
            ) =>
              incident.fingerprint ===
              currentFingerprint
          )
        : [];

    const recurrenceDetected =
      fingerprintMatches.length >
        0 ||
      Number(
        context
          .incident
          ?.reopenCount ||
        0
      ) >
        0;

    const previousResolutions =
      incidents
        .filter(
          (
            incident
          ) =>
            Boolean(
              incident.resolution
            )
        )
        .map(
          (
            incident
          ) => ({
            incidentId:
              incident.id,

            similarity:
              incident
                .similarity
                .score,

            resolution:
              incident.resolution,

            rootCause:
              incident.rootCause ||
              null,

            resolvedAt:
              incident.resolvedAt,
          })
        );

    const previousActions =
      incidents
        .flatMap(
          (
            incident
          ) =>
            incident.actions.map(
              (
                action
              ) => ({
                ...action,

                incidentId:
                  incident.id,

                incidentSimilarity:
                  incident
                    .similarity
                    .score,
              })
            )
        );

    const successfulActions =
      previousActions
        .filter(
          (
            action
          ) =>
            action.successful ===
            true
        );

    const failedActions =
      previousActions
        .filter(
          (
            action
          ) =>
            action.successful ===
            false
        );

    const conflictingOutcomes =
      this.findConflictingOutcomes(
        previousActions
      );

    const historicalPatterns =
      [];

    if (
      recurrenceDetected
    ) {
      historicalPatterns.push({
        type:
          "recurrence",

        description:
          fingerprintMatches.length >
          0
            ? `${fingerprintMatches.length} previous incident(s) share the current incident fingerprint.`
            : "The current incident has previously reopened.",

        confidence:
          fingerprintMatches.length >
          0
            ? 1
            : 0.9,
      });
    }

    if (
      incidents.length >
      0
    ) {
      historicalPatterns.push({
        type:
          "similar_incidents",

        description:
          `${incidents.length} historical incident(s) exceeded the similarity threshold.`,

        confidence:
          incidents[0]
            ?.similarity
            ?.score ||
          0,
      });
    }

    if (
      successfulActions.length >
      0
    ) {
      historicalPatterns.push({
        type:
          "successful_remediation_history",

        description:
          `${successfulActions.length} successful historical remediation action(s) were found.`,

        confidence:
          this.averageActionEvidence(
            successfulActions
          ),
      });
    }

    return {
      similarIncidentCount:
        incidents.length,

      recurrenceDetected,

      recurringFingerprint:
        fingerprintMatches.length >
        0,

      fingerprintMatches,

      previousResolutions,

      previousActions,

      successfulActions,

      failedActions,

      conflictingOutcomes,

      historicalPatterns,

      historyConfidence:
        this.calculateHistoryConfidence({
          incidents,

          previousActions,

          currentFingerprint,

          fingerprintMatches,
        }),
    };
  }

  // ==========================================================================
  // CONFLICTING OUTCOMES
  // ==========================================================================

  findConflictingOutcomes(
    actions
  ) {
    const grouped =
      new Map();

    for (
      const action
      of actions
    ) {
      const name =
        normalizeActionName(
          action.action
        );

      if (
        !grouped.has(
          name
        )
      ) {
        grouped.set(
          name,
          {
            successful:
              0,

            failed:
              0,
          }
        );
      }

      const group =
        grouped.get(
          name
        );

      if (
        action.successful ===
        true
      ) {
        group.successful +=
          1;
      }

      if (
        action.successful ===
        false
      ) {
        group.failed +=
          1;
      }
    }

    const contradictions =
      [];

    for (
      const [
        action,
        result,
      ]
      of grouped
    ) {
      if (
        result.successful >
          0 &&
        result.failed >
          0
      ) {
        contradictions.push({
          type:
            "conflicting_action_outcome",

          action,

          successfulCount:
            result.successful,

          failedCount:
            result.failed,

          description:
            `Historical action "${action}" has both successful and failed outcomes.`,
        });
      }
    }

    return contradictions;
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateHistoryConfidence({
    incidents,
    previousActions,
    currentFingerprint,
    fingerprintMatches,
  }) {
    if (
      incidents.length ===
      0
    ) {
      return 0;
    }

    const bestSimilarity =
      incidents[0]
        ?.similarity
        ?.score ||
      0;

    const sampleCoverage =
      Math.min(
        1,
        incidents.length /
          5
      );

    const actionCoverage =
      Math.min(
        1,
        previousActions.length /
          5
      );

    const fingerprintEvidence =
      currentFingerprint &&
      fingerprintMatches.length >
        0
        ? 1
        : 0;

    return Number(
      (
        bestSimilarity *
          0.5 +
        sampleCoverage *
          0.2 +
        actionCoverage *
          0.1 +
        fingerprintEvidence *
          0.2
      )
        .toFixed(
          4
        )
    );
  }

  averageActionEvidence(
    actions
  ) {
    if (
      actions.length ===
      0
    ) {
      return 0;
    }

    const total =
      actions.reduce(
        (
          sum,
          action
        ) => {
          const similarity =
            clamp01(
              action
                .incidentSimilarity ||
              0
            );

          const effectiveness =
            action.effectiveness ===
            null
              ? 0.5
              : clamp01(
                  action
                    .effectiveness
                );

          return (
            sum +
            similarity *
              0.7 +
            effectiveness *
              0.3
          );
        },
        0
      );

    return Number(
      (
        total /
        actions.length
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
    analysis
  ) {
    const findings =
      [];

    if (
      analysis
        .similarIncidentCount ===
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:no-history:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "missing_historical_match",

          title:
            "No sufficiently similar historical incidents found",

          summary:
            "No historical incident exceeded the configured similarity threshold.",

          confidence:
            1,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),
        })
      );

      return findings;
    }

    findings.push(
      createAgentFinding({
        id:
          `finding:historical-match:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "historical_similarity",

        title:
          `${analysis.similarIncidentCount} similar historical incident(s) found`,

        summary:
          `Best historical similarity score: ${analysis.fingerprintMatches[0]?.similarity?.score || analysis.historyConfidence}.`,

        confidence:
          analysis
            .historyConfidence,

        evidenceIds:
          this.collectEvidenceIds(
            context
          ),

        metadata: {
          similarIncidentCount:
            analysis
              .similarIncidentCount,
        },
      })
    );

    if (
      analysis
        .recurrenceDetected
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:recurrence-history:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "incident_recurrence",

          title:
            "Recurring incident pattern detected",

          summary:
            analysis
              .recurringFingerprint
              ? `${analysis.fingerprintMatches.length} historical incident(s) share the current fingerprint.`
              : "The current incident has previously reopened.",

          confidence:
            analysis
              .recurringFingerprint
              ? 1
              : 0.9,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),
        })
      );
    }

    if (
      analysis
        .successfulActions
        .length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:historical-actions:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "historical_action_effectiveness",

          title:
            "Successful historical remediation evidence available",

          summary:
            `${analysis.successfulActions.length} successful action(s) were found in similar historical incidents. These actions are evidence only and are not automatically authorized for reuse.`,

          confidence:
            this.averageActionEvidence(
              analysis
                .successfulActions
            ),

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),

          metadata: {
            successfulActions:
              analysis
                .successfulActions,
          },
        })
      );
    }

    if (
      analysis
        .conflictingOutcomes
        .length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:historical-conflict:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "historical_contradiction",

          title:
            "Historical remediation outcomes conflict",

          summary:
            `${analysis.conflictingOutcomes.length} action(s) have both successful and failed historical outcomes.`,

          confidence:
            1,

          evidenceIds:
            this.collectEvidenceIds(
              context
            ),

          metadata: {
            conflicts:
              analysis
                .conflictingOutcomes,
          },
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // AI FINDINGS
  // ==========================================================================

  buildAiFindings(
    context,
    output,
    confidence
  ) {
    return normalizeArray(
      output
        ?.observations
    )
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

          if (
            !text
          ) {
            return null;
          }

          return createAgentFinding({
            id:
              `finding:history-ai:${crypto
                .createHash(
                  "sha1"
                )
                .update(
                  `${index}:${text}`
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
              "historical_observation",

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
                confidence
              ),

            evidenceIds:
              normalizeArray(
                observation
                  ?.evidenceIds
              ),
          });
        }
      )
      .filter(
        Boolean
      );
  }

  // ==========================================================================
  // EVIDENCE
  // ==========================================================================

  collectEvidenceIds(
    context
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
          [
            "INCIDENT_HISTORY",
            "ACTION_HISTORY",
            "ACTION_EFFECTIVENESS",
            "INCIDENT_MEMORY",
          ].includes(
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
          "HistoricalAnalysisAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Array.isArray(
        record
          .result
          ?.similarIncidents
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "HistoricalAnalysisAgent must return similarIncidents",
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
        "context.signals",
        "context.historicalIncidents",
        "context.history",
        "context.incidentMemory",
        "context.evidence",
      ],

      writes: [
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

function stringifyId(
  value
) {
  if (
    value ===
    null ||
    value ===
    undefined
  ) {
    return null;
  }

  return String(
    value
  );
}

function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value ||
      "unknown"
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
      "error",
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

  return "unknown";
}

function normalizeEffectiveness(
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

  /*
   * Support historical 0-100 scores as well as canonical 0-1.
   */
  if (
    number >
    1
  ) {
    return clamp01(
      number /
      100
    );
  }

  return clamp01(
    number
  );
}

function normalizeActionName(
  value
) {
  return String(
    value ||
    "unknown_action"
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      "_"
    );
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

function tokenize(
  value
) {
  return new Set(
    String(
      value ||
      ""
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        " "
      )
      .split(
        /\s+/
      )
      .filter(
        (
          token
        ) =>
          token.length >
          2
      )
  );
}

function textSimilarity(
  first,
  second
) {
  const a =
    tokenize(
      first
    );

  const b =
    tokenize(
      second
    );

  if (
    a.size ===
      0 ||
    b.size ===
      0
  ) {
    return 0;
  }

  const intersection =
    [
      ...a,
    ]
      .filter(
        (
          value
        ) =>
          b.has(
            value
          )
      )
      .length;

  const union =
    new Set([
      ...a,
      ...b,
    ])
      .size;

  return union ===
    0
    ? 0
    : intersection /
        union;
}

function symptomSimilarity(
  current,
  historical
) {
  const currentTypes =
    new Set(
      current
        .map(
          (
            symptom
          ) =>
            String(
              symptom.type ||
              symptom.title ||
              ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          Boolean
        )
    );

  const historicalTypes =
    new Set(
      historical
        .map(
          (
            symptom
          ) =>
            String(
              symptom.type ||
              symptom.title ||
              ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          Boolean
        )
    );

  if (
    currentTypes.size ===
      0 ||
    historicalTypes.size ===
      0
  ) {
    return 0;
  }

  const intersection =
    [
      ...currentTypes,
    ]
      .filter(
        (
          type
        ) =>
          historicalTypes.has(
            type
          )
      )
      .length;

  const union =
    new Set([
      ...currentTypes,
      ...historicalTypes,
    ])
      .size;

  return union ===
    0
    ? 0
    : intersection /
        union;
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

    const previous =
      map.get(
        finding.id
      );

    if (
      !previous ||
      (
        finding
          .confidence ||
        0
      ) >
      (
        previous
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

const HISTORICAL_ANALYSIS_SYSTEM_PROMPT =
  `
You are the AIRA Historical Analysis Agent.

Your task is to determine what historical incidents and remediation
outcomes can teach us about the current incident.

Rules:

1. Historical similarity is evidence, not proof of identical root cause.
2. A previously successful action is NOT automatically safe or correct now.
3. Never authorize execution based on historical success.
4. Prefer exact fingerprint, service, error-code and symptom matches.
5. Distinguish recurrence from superficial similarity.
6. Identify repeated failure patterns.
7. Identify previous resolutions where evidence exists.
8. Identify successful and failed remediation outcomes.
9. Explicitly report conflicting historical outcomes.
10. Do not hide failed previous remediations.
11. Do not invent historical incidents.
12. Do not invent previous resolutions.
13. Do not invent action effectiveness.
14. Do not select or execute a playbook.
15. Do not recommend arbitrary shell commands.
16. Never mutate infrastructure.
17. Never authorize execution.
18. Return ONLY valid JSON.

Return:
{
  "historicalPatterns": [],
  "relevantIncidents": [],
  "previousSuccessfulActions": [],
  "previousFailedActions": [],
  "contradictions": [],
  "observations": [],
  "unknowns": [],
  "historyConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  HistoricalAnalysisAgent,
};