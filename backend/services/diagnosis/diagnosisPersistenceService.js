"use strict";

/**
 * AIRA Diagnosis Persistence Service
 *
 * Phase 6.13
 *
 * Persists:
 *
 * - AgentIntelligenceRun
 * - IncidentDiagnosis
 * - diagnosis revisions
 * - superseding relationships
 *
 * Safety:
 *
 * - persistence only
 * - no infrastructure mutation
 * - no playbook execution
 * - no execution authorization
 */

const mongoose =
  require(
    "mongoose"
  );

const AgentIntelligenceRun =
  require(
    "../../models/AgentIntelligenceRun"
  );

const IncidentDiagnosis =
  require(
    "../../models/IncidentDiagnosis"
  );

class DiagnosisPersistenceService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async persist(
    coordinatorResult
  ) {
    this.assertCoordinatorResult(
      coordinatorResult
    );

    const {
      runId,
      diagnosis,
      context,
      agentTrace,
      confidence,
      startedAt,
      completedAt,
    } =
      coordinatorResult;

    const session =
      await mongoose
        .startSession();

    try {
      let persistedRun;
      let persistedDiagnosis;

      await session.withTransaction(
        async () => {
          // ==================================================================
          // 1. CREATE RUN
          // ==================================================================

          persistedRun =
            await this.createRun(
              {
                runId,
                diagnosis,
                context,
                agentTrace,
                confidence,
                startedAt,
                completedAt,
              },
              session
            );

          // ==================================================================
          // 2. FIND CURRENT DIAGNOSIS
          // ==================================================================

          const currentDiagnosis =
            await IncidentDiagnosis
              .findOne({
                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,

                incidentId:
                  context
                    .incidentId,

                isCurrent:
                  true,
              })
              .session(
                session
              );

          // ==================================================================
          // 3. DETERMINE REVISION
          // ==================================================================

          const revision =
            currentDiagnosis
              ? (
                  currentDiagnosis
                    .revision +
                  1
                )
              : 1;

          // ==================================================================
          // 4. SUPERSEDE OLD DIAGNOSIS
          // ==================================================================

          if (
            currentDiagnosis
          ) {
            currentDiagnosis
              .isCurrent =
              false;

            currentDiagnosis
              .status =
              "superseded";

            await currentDiagnosis
              .save({
                session,
              });
          }

          // ==================================================================
          // 5. CREATE NEW DIAGNOSIS
          // ==================================================================

          persistedDiagnosis =
            await this.createDiagnosis(
              {
                coordinatorResult,

                run:
                  persistedRun,

                revision,

                previousDiagnosis:
                  currentDiagnosis,
              },
              session
            );

          // ==================================================================
          // 6. LINK OLD -> NEW
          // ==================================================================

          if (
            currentDiagnosis
          ) {
            currentDiagnosis
              .supersededByDiagnosisId =
              persistedDiagnosis
                ._id;

            await currentDiagnosis
              .save({
                session,
              });
          }

          // ==================================================================
          // 7. LINK RUN -> DIAGNOSIS
          // ==================================================================

          persistedRun
            .diagnosisId =
            persistedDiagnosis
              ._id;

          await persistedRun
            .save({
              session,
            });
        }
      );
       
      return {
        run:
          persistedRun,

        diagnosis:
          persistedDiagnosis,

        revision:
          persistedDiagnosis
            .revision,

        isCurrent:
          persistedDiagnosis
            .isCurrent,

        executionAuthorized:
          false,
      };
    } finally {
      await session
        .endSession();
    }
  }

  // ==========================================================================
  // CREATE RUN
  // ==========================================================================

  async createRun(
    {
      runId,
      diagnosis,
      context,
      agentTrace,
      confidence,
      startedAt,
      completedAt,
    },
    session
  ) {
    const status =
      this.resolveRunStatus(
        confidence
      );

    const phase =
      status ===
      "completed"
        ? "completed"
        : (
            status ===
            "manual_required"
              ? "completed"
              : "completed"
          );

    const [
      run,
    ] =
      await AgentIntelligenceRun
        .create(
          [
            {
              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,

              tenantId:
                context
                  .tenantId,

              incidentId:
                context
                  .incidentId,

              correlationId:
                context
                  .correlationId ||
                `incident:${context.incidentId}`,

              correlationGroupId:
                context
                  .correlationGroupId ||
                null,

              runId,

              status,

              phase,

              startedAt:
                startedAt ||
                new Date(),

              completedAt:
                completedAt ||
                new Date(),

              durationMs:
                calculateDuration(
                  startedAt,
                  completedAt
                ),

              contextSummary: {
                signalCount:
                  context
                    .signals
                    ?.length ||
                  0,

                incidentEventCount:
                  context
                    .incidentEvents
                    ?.length ||
                  0,

                providerCount:
                  context
                    .evidence
                    ?.providerCoverage
                    ?.length ||
                  0,

                affectedServiceCount:
                  context
                    .blastRadius
                    ?.affectedServices
                    ?.length ||
                  context
                    .topologyAnalysis
                    ?.affectedServices
                    ?.length ||
                  0,

                affectedResourceCount:
                  context
                    .blastRadius
                    ?.affectedResources
                    ?.length ||
                  context
                    .topologyAnalysis
                    ?.affectedResources
                    ?.length ||
                  0,

                historicalIncidentCount:
                  context
                    .historicalIncidents
                    ?.length ||
                  0,

                changeCount:
                  context
                    .changes
                    ?.length ||
                  0,
              },

              confidence:
                this.buildConfidenceSnapshot(
                  context,
                  confidence
                ),

              agentTrace:
                this.normalizeAgentTrace(
                  agentTrace
                ),

              findingIds:
                (
                  context
                    .findings ||
                  []
                )
                  .map(
                    (
                      finding
                    ) =>
                      finding.id ||
                      finding.findingId
                  )
                  .filter(
                    Boolean
                  ),

              hypothesisIds:
                (
                  diagnosis
                    .hypotheses ||
                  []
                )
                  .map(
                    (
                      hypothesis
                    ) =>
                      hypothesis.id
                  )
                  .filter(
                    Boolean
                  ),

              contradictionIds:
                (
                  context
                    .contradictions ||
                  []
                )
                  .map(
                    (
                      contradiction
                    ) =>
                      contradiction.id ||
                      contradiction
                        .contradictionId
                  )
                  .filter(
                    Boolean
                  ),

              outcome:
                diagnosis
                  .outcome ||
                "UNKNOWN",

              summary:
                diagnosis
                  .summary ||
                null,

              manualReason:
                status ===
                "manual_required"
                  ? this.manualReason(
                      confidence,
                      diagnosis
                    )
                  : null,

              warnings:
                collectWarnings(
                  agentTrace
                ),

              error:
                null,

              executionAuthorized:
                false,

              coordinatorVersion:
                coordinatorResultVersion(
                  context
                ),

              reasoningProvider:
                determineProvider(
                  agentTrace
                ),

              model:
                determineModel(
                  agentTrace
                ),

              fallbackUsed:
                agentTrace
                  .some(
                    (
                      trace
                    ) =>
                      trace
                        .fallbackUsed ===
                      true
                  ),

              metadata: {
                confidenceBand:
                  confidence
                    ?.band ||
                  null,

                confidenceDecision:
                  confidence
                    ?.decision ||
                  null,
              },
            },
          ],
          {
            session,
          }
        );

    return run;
  }

  // ==========================================================================
  // CREATE DIAGNOSIS
  // ==========================================================================

  async createDiagnosis(
    {
      coordinatorResult,
      run,
      revision,
      previousDiagnosis,
    },
    session
  ) {
    const {
      diagnosis,
      context,
      confidence,
      runId,
    } =
      coordinatorResult;

    const diagnosisId =
      `${runId}:rev:${revision}`;

    const primary =
      diagnosis
        .primaryHypothesis ||
      null;

    const [
      created,
    ] =
      await IncidentDiagnosis
        .create(
          [
            {
              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,

              tenantId:
                context
                  .tenantId,

              incidentId:
                context
                  .incidentId,

              correlationId:
                context
                  .correlationId ||
                `incident:${context.incidentId}`,

              correlationGroupId:
                context
                  .correlationGroupId ||
                null,

              diagnosisId,

              revision,

              isCurrent:
                true,

              supersedesDiagnosisId:
                previousDiagnosis
                  ?._id ||
                null,

              runId:
                run
                  ._id,

              runExternalId:
                runId,

              status:
                this.resolveDiagnosisStatus(
                  diagnosis,
                  confidence
                ),

              outcome:
                diagnosis
                  .outcome ||
                "UNKNOWN",

              title:
                primary
                  ?.title ||
                primary
                  ?.rootCause ||
                context
                  .incident
                  ?.title ||
                null,

              summary:
                diagnosis
                  .summary ||
                null,

              probableRootCause:
                primary
                  ?.rootCause ||
                null,

              rootCauseCategory:
                primary
                  ?.category ||
                null,

              symptoms:
                this.normalizeSymptoms(
                  diagnosis
                    .symptoms ||
                  context
                    .symptoms ||
                  []
                ),

              findings:
                this.normalizeFindings(
                  context
                    .findings ||
                  []
                ),

              hypotheses:
                this.normalizeHypotheses(
                  diagnosis
                    .hypotheses ||
                  []
                ),

              primaryHypothesisId:
                primary
                  ?.id ||
                null,

              contradictions:
                this.normalizeContradictions(
                  diagnosis
                    .contradictions ||
                  context
                    .contradictions ||
                  []
                ),

              unresolvedQuestions:
                diagnosis
                  .unresolvedQuestions ||
                [],

              unknowns:
                diagnosis
                  .unknowns ||
                [],

              falsePositiveSuspected:
                Boolean(
                  diagnosis
                    .falsePositiveSuspected
                ),

              evidenceSummary:
                this.buildEvidenceSummary(
                  context
                ),

              impactSnapshot:
                this.buildImpactSnapshot(
                  context
                ),

              risk:
                this.normalizeRisk(
                  diagnosis
                    .risk ||
                  context
                    .riskAnalysis
                ),

              confidence:
                this.buildConfidenceSnapshot(
                  context,
                  confidence
                ),

              recommendedNextStep:
                {
                  type:
                    diagnosis
                      .recommendedNextStep
                      ?.type ||
                    "MANUAL_INVESTIGATION",

                  target:
                    diagnosis
                      .recommendedNextStep
                      ?.target ||
                    null,

                  reason:
                    diagnosis
                      .recommendedNextStep
                      ?.reason ||
                    null,

                  evidenceRequired:
                    diagnosis
                      .recommendedNextStep
                      ?.evidenceRequired ||
                    [],

                  executionAuthorized:
                    false,
                },

              analysisStartedAt:
                coordinatorResult
                  .startedAt ||
                null,

              analysisCompletedAt:
                coordinatorResult
                  .completedAt ||
                new Date(),

              coordinatorVersion:
                coordinatorResult
                  .coordinatorVersion ||
                "phase6-v1",

              reasoningProvider:
                determineProvider(
                  coordinatorResult
                    .agentTrace ||
                  []
                ),

              model:
                determineModel(
                  coordinatorResult
                    .agentTrace ||
                  []
                ),

              fallbackUsed:
                (
                  coordinatorResult
                    .agentTrace ||
                  []
                )
                  .some(
                    (
                      trace
                    ) =>
                      trace
                        .fallbackUsed ===
                      true
                  ),

              executionAuthorized:
                false,

              metadata: {
                confidenceBand:
                  confidence
                    ?.band ||
                  null,

                confidenceDecision:
                  confidence
                    ?.decision ||
                  null,

                verificationStatus:
                  context
                    .verification
                    ?.verificationStatus ||
                  null,
              },
            },
          ],
          {
            session,
          }
        );

    return created;
  }

  // ==========================================================================
  // RUN STATUS
  // ==========================================================================

  resolveRunStatus(
    confidence
  ) {
    switch (
      confidence
        ?.decision
    ) {
      case "MANUAL_REVIEW":
        return "manual_required";

      case "REJECTED":
        return "partial";

      default:
        return "completed";
    }
  }

  // ==========================================================================
  // DIAGNOSIS STATUS
  // ==========================================================================

  resolveDiagnosisStatus(
    diagnosis,
    confidence
  ) {
    if (
      confidence
        ?.decision ===
      "MANUAL_REVIEW"
    ) {
      return "manual_required";
    }

    if (
      confidence
        ?.decision ===
      "REJECTED"
    ) {
      return "insufficient_evidence";
    }

    if (
      diagnosis
        ?.outcome ===
      "INSUFFICIENT_EVIDENCE"
    ) {
      return "insufficient_evidence";
    }

    if (
      diagnosis
        ?.outcome ===
      "FALSE_POSITIVE_SUSPECTED"
    ) {
      return "manual_required";
    }

    return "completed";
  }

  // ==========================================================================
  // CONFIDENCE SNAPSHOT
  // ==========================================================================

  buildConfidenceSnapshot(
    context,
    confidence
  ) {
    return {
      correlationConfidence:
        clampOrNull(
          context
            .correlationGroup
            ?.correlationScore
        ),

      evidenceCompleteness:
        clampOrNull(
          context
            .evidence
            ?.completeness
        ),

      symptomConfidence:
        clampOrNull(
          context
            .symptomAnalysis
            ?.symptomConfidence
        ),

      topologyConfidence:
        clampOrNull(
          context
            .topologyAnalysis
            ?.topologyConfidence
        ),

      changeConfidence:
        clampOrNull(
          context
            .changeAnalysis
            ?.changeConfidence
        ),

      historicalConfidence:
        clampOrNull(
          context
            .historicalAnalysis
            ?.historyConfidence
        ),

      diagnosisConfidence:
        clampOrNull(
          context
            .rootCauseAnalysis
            ?.diagnosisConfidence
        ),

      verificationConfidence:
        clampOrNull(
          context
            .verification
            ?.verificationConfidence
        ),

      riskConfidence:
        clampOrNull(
          context
            .riskAnalysis
            ?.riskConfidence
        ),

      overallConfidence:
        clampOrNull(
          confidence
            ?.confidence
        ),
    };
  }

  // ==========================================================================
  // EVIDENCE SUMMARY
  // ==========================================================================

  buildEvidenceSummary(
    context
  ) {
    const items =
      context
        .evidence
        ?.items ||
      [];

    const count =
      (
        type
      ) =>
        items.filter(
          (
            item
          ) =>
            item.type ===
            type
        )
          .length;

    return {
      totalEvidenceCount:
        items.length,

      signalCount:
        context
          .signals
          ?.length ||
        0,

      incidentEventCount:
        context
          .incidentEvents
          ?.length ||
        0,

      metricCount:
        count(
          "METRIC"
        ),

      logCount:
        count(
          "LOG"
        ),

      traceCount:
        count(
          "TRACE"
        ),

      alertCount:
        count(
          "ALERT"
        ),

      providerCount:
        context
          .evidence
          ?.providerCoverage
          ?.length ||
        0,

      providers:
        context
          .evidence
          ?.providerCoverage ||
        [],

      evidenceIds:
        items
          .map(
            (
              item
            ) =>
              item.id
          )
          .filter(
            Boolean
          ),

      missingEvidence:
        context
          .evidence
          ?.missingEvidence ||
        [],

      staleEvidence:
        context
          .evidence
          ?.staleEvidence ||
        [],
    };
  }

  // ==========================================================================
  // IMPACT
  // ==========================================================================

  buildImpactSnapshot(
    context
  ) {
    const affectedServices =
      normalizeIds(
        context
          .blastRadius
          ?.affectedServices ||
        context
          .topologyAnalysis
          ?.affectedServices ||
        []
      );

    const affectedResources =
      normalizeIds(
        context
          .blastRadius
          ?.affectedResources ||
        context
          .topologyAnalysis
          ?.affectedResources ||
        []
      );

    return {
      affectedServiceCount:
        affectedServices.length,

      affectedResourceCount:
        affectedResources.length,

      userFacingImpact:
        Boolean(
          context
            .riskAnalysis
            ?.customerImpact
            ?.score >
          0.3
        ),

      maxCriticality:
        normalizeCriticality(
          context
            .service
            ?.criticality
        ),

      affectedServiceIds:
        affectedServices
          .filter(
            mongoose
              .Types
              .ObjectId
              .isValid
          ),

      affectedResourceIds:
        affectedResources
          .filter(
            mongoose
              .Types
              .ObjectId
              .isValid
          ),
    };
  }

  // ==========================================================================
  // NORMALIZE SYMPTOMS
  // ==========================================================================

  normalizeSymptoms(
    symptoms
  ) {
    return symptoms
      .map(
        (
          symptom
        ) => ({
          symptomId:
            symptom.id ||
            symptom
              .symptomId,

          type:
            symptom.type ||
            "unknown",

          title:
            symptom.title ||
            "Observed symptom",

          description:
            symptom.description ||
            null,

          severity:
            normalizeSymptomSeverity(
              symptom.severity
            ),

          firstObservedAt:
            symptom
              .firstObservedAt ||
            null,

          lastObservedAt:
            symptom
              .lastObservedAt ||
            null,

          affectedServiceIds:
            normalizeIds(
              symptom
                .affectedServices
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          affectedResourceIds:
            normalizeIds(
              symptom
                .affectedResources
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          evidenceIds:
            symptom
              .evidenceIds ||
            [],

          confidence:
            clamp(
              symptom.confidence
            ),
        })
      )
      .filter(
        (
          symptom
        ) =>
          Boolean(
            symptom.symptomId
          )
      );
  }

  // ==========================================================================
  // NORMALIZE FINDINGS
  // ==========================================================================

  normalizeFindings(
    findings
  ) {
    return findings
      .map(
        (
          finding
        ) => ({
          findingId:
            finding.id ||
            finding
              .findingId,

          agent:
            finding.agent ||
            "unknown",

          findingType:
            finding.findingType ||
            "observation",

          title:
            finding.title ||
            "Agent finding",

          summary:
            finding.summary ||
            null,

          confidence:
            clamp(
              finding.confidence
            ),

          evidenceIds:
            finding
              .evidenceIds ||
            [],

          contradictionIds:
            finding
              .contradictions ||
            finding
              .contradictionIds ||
            [],

          affectedServiceIds:
            normalizeIds(
              finding
                .affectedServices
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          affectedResourceIds:
            normalizeIds(
              finding
                .affectedResources
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          metadata:
            finding.metadata ||
            {},

          createdAt:
            finding.createdAt ||
            new Date(),
        })
      )
      .filter(
        (
          finding
        ) =>
          Boolean(
            finding.findingId
          )
      );
  }

  // ==========================================================================
  // NORMALIZE HYPOTHESES
  // ==========================================================================

  normalizeHypotheses(
    hypotheses
  ) {
    return hypotheses
      .map(
        (
          hypothesis,
          index
        ) => ({
          hypothesisId:
            hypothesis.id ||
            hypothesis
              .hypothesisId,

          rank:
            hypothesis.rank ||
            index +
              1,

          rootCause:
            hypothesis.rootCause,

          title:
            hypothesis.title ||
            hypothesis.rootCause,

          category:
            hypothesis.category ||
            null,

          status:
            hypothesis.status ||
            "PROPOSED",

          confidence:
            clamp(
              hypothesis.confidence
            ),

          supportingEvidenceIds:
            hypothesis
              .evidenceSupporting ||
            hypothesis
              .supportingEvidenceIds ||
            [],

          contradictingEvidenceIds:
            hypothesis
              .evidenceAgainst ||
            hypothesis
              .contradictingEvidenceIds ||
            [],

          contradictionIds:
            normalizeContradictionIds(
              hypothesis
                .contradictions
            ),

          affectedServiceIds:
            normalizeIds(
              hypothesis
                .affectedServices
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          affectedResourceIds:
            normalizeIds(
              hypothesis
                .affectedResources
            )
              .filter(
                mongoose
                  .Types
                  .ObjectId
                  .isValid
              ),

          explanation:
            hypothesis.explanation ||
            null,

          causalChain:
            hypothesis
              .causalChain ||
            [],

          assumptions:
            hypothesis
              .assumptions ||
            [],

          unknowns:
            hypothesis
              .unknowns ||
            [],

          verified:
            hypothesis.status ===
              "VERIFIED",
        }))
      .filter(
        (
          hypothesis
        ) =>
          Boolean(
            hypothesis
              .hypothesisId &&
            hypothesis
              .rootCause
          )
      );
  }

  // ==========================================================================
  // CONTRADICTIONS
  // ==========================================================================

  normalizeContradictions(
    contradictions
  ) {
    return contradictions
      .map(
        (
          contradiction,
          index
        ) => {
          if (
            typeof contradiction ===
            "string"
          ) {
            return {
              contradictionId:
                `contradiction:${index}`,

              type:
                "UNKNOWN",

              summary:
                contradiction,

              evidenceIds:
                [],

              severity:
                "warning",

              confidence:
                0.5,

              resolved:
                false,
            };
          }

          return {
            contradictionId:
              contradiction.id ||
              contradiction
                .contradictionId ||
              `contradiction:${index}`,

            type:
              normalizeContradictionType(
                contradiction.type
              ),

            hypothesisId:
              contradiction
                .hypothesisId ||
              null,

            summary:
              contradiction.summary ||
              contradiction.description ||
              "Diagnostic contradiction",

            evidenceIds:
              contradiction
                .evidenceIds ||
              [],

            severity:
              normalizeContradictionSeverity(
                contradiction.severity
              ),

            confidence:
              clamp(
                contradiction.confidence
              ),

            resolved:
              Boolean(
                contradiction.resolved
              ),
          };
        });
  }

  // ==========================================================================
  // RISK
  // ==========================================================================

  normalizeRisk(
    risk
  ) {
    if (!risk) {
      return {};
    }

    return {
      level:
        normalizeRiskLevel(
          risk.riskLevel ||
          risk.level
        ),

      score:
        clamp(
          risk.riskScore ??
          risk.score
        ),

      userFacing:
        Boolean(
          risk
            .customerImpact
            ?.score >
          0.3 ||
          risk.userFacing
        ),

      blastRadiusServiceCount:
        risk
          .blastRadius
          ?.affectedServices
          ?.length ||
        risk
          .blastRadiusServiceCount ||
        0,

      blastRadiusResourceCount:
        risk
          .blastRadius
          ?.affectedResources
          ?.length ||
        risk
          .blastRadiusResourceCount ||
        0,

      criticality:
        normalizeCriticality(
          risk
            .serviceCriticality
            ?.level ||
          risk.criticality
        ),

      availabilityRisk:
        Boolean(
          risk
            .availability
            ?.score >
          0.3 ||
          risk.availabilityRisk
        ),

      dataRisk:
        Boolean(
          risk
            .dataRisk
            ?.score >
          0.3 ||
          risk.dataRisk ===
          true
        ),

      securityRisk:
        Boolean(
          risk
            .securityRisk
            ?.score >
          0.3 ||
          risk.securityRisk ===
          true
        ),

      financialRisk:
        Boolean(
          risk.financialRisk
        ),

      reasons:
        collectRiskReasons(
          risk
        ),
    };
  }

  // ==========================================================================
  // AGENT TRACE
  // ==========================================================================

  normalizeAgentTrace(
    trace
  ) {
    return (
      trace ||
      []
    )
      .map(
        (
          record
        ) => ({
          agent:
            record.agent,

          version:
            record.version ||
            null,

          phase:
            record.phase ||
            null,

          status:
            record.status,

          startedAt:
            record.startedAt ||
            new Date(),

          completedAt:
            record.completedAt ||
            null,

          durationMs:
            record.durationMs ??
            null,

          confidence:
            clampOrNull(
              record.confidence
            ),

          evidenceUsed:
            record
              .evidenceUsed ||
            [],

          findingIds:
            record
              .findingIds ||
            [],

          warnings:
            record.warnings ||
            [],

          error:
            normalizeError(
              record.error
            ),

          model:
            record.model ||
            null,

          provider:
            record.provider ||
            null,

          fallbackUsed:
            Boolean(
              record.fallbackUsed
            ),

          tokenEstimate:
            record
              .tokenEstimate ??
            null,

          metadata:
            record.metadata ||
            {},
        }));
  }

  // ==========================================================================
  // MANUAL REASON
  // ==========================================================================

  manualReason(
    confidence,
    diagnosis
  ) {
    if (
      diagnosis
        ?.falsePositiveSuspected
    ) {
      return (
        "Potential false positive requires operator review."
      );
    }

    if (
      confidence
        ?.decision ===
      "MANUAL_REVIEW"
    ) {
      return (
        "Diagnosis confidence engine requires manual review."
      );
    }

    return (
      "Manual diagnosis review required."
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertCoordinatorResult(
    result
  ) {
    if (
      !result
        ?.runId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis persistence requires runId"
        ),
        {
          code:
            "DIAGNOSIS_PERSISTENCE_RUN_ID_REQUIRED",
        }
      );
    }

    if (
      !result
        ?.context
        ?.organizationId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis persistence requires organizationId"
        ),
        {
          code:
            "DIAGNOSIS_PERSISTENCE_ORGANIZATION_REQUIRED",
        }
      );
    }

    if (
      !result
        ?.context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis persistence requires environmentId"
        ),
        {
          code:
            "DIAGNOSIS_PERSISTENCE_ENVIRONMENT_REQUIRED",
        }
      );
    }

    if (
      !result
        ?.context
        ?.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis persistence requires incidentId"
        ),
        {
          code:
            "DIAGNOSIS_PERSISTENCE_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !result
        ?.diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis persistence requires diagnosis"
        ),
        {
          code:
            "DIAGNOSIS_PERSISTENCE_RESULT_REQUIRED",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateDuration(
  startedAt,
  completedAt
) {
  if (
    !startedAt ||
    !completedAt
  ) {
    return null;
  }

  const duration =
    new Date(
      completedAt
    ) -
    new Date(
      startedAt
    );

  return Number.isFinite(
    duration
  )
    ? Math.max(
        0,
        duration
      )
    : null;
}

function clamp(
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

function clampOrNull(
  value
) {
  if (
    value ===
    undefined ||
    value ===
    null ||
    value ===
    ""
  ) {
    return null;
  }

  return clamp(
    value
  );
}

function normalizeIds(
  values
) {
  return (
    Array.isArray(
      values
    )
      ? values
      : []
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
          ""
        );
      })
    .filter(
      Boolean
    );
}

function normalizeCriticality(
  value
) {
  if (
    typeof value ===
    "number"
  ) {
    return Math.min(
      10,
      Math.max(
        0,
        value
      )
    );
  }

  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();

  switch (
    normalized
  ) {
    case "critical":
      return 10;

    case "high":
      return 8;

    case "medium":
      return 5;

    case "low":
      return 2;

    default:
      return 0;
  }
}

function normalizeSymptomSeverity(
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
    ].includes(
      normalized
    )
  ) {
    return "warning";
  }

  return "unknown";
}

function normalizeContradictionType(
  value
) {
  const allowed = [
    "EVIDENCE_CONFLICT",
    "TEMPORAL_CONFLICT",
    "TOPOLOGY_CONFLICT",
    "METRIC_CONFLICT",
    "LOG_CONFLICT",
    "TRACE_CONFLICT",
    "HISTORICAL_CONFLICT",
    "CAUSALITY_CONFLICT",
    "UNKNOWN",
  ];

  const normalized =
    String(
      value ||
      "UNKNOWN"
    )
      .trim()
      .toUpperCase();

  return allowed.includes(
    normalized
  )
    ? normalized
    : "UNKNOWN";
}

function normalizeContradictionSeverity(
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
      "warning",
      "info",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }

  return "warning";
}

function normalizeRiskLevel(
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
    normalized ===
    "MODERATE"
  ) {
    return "MEDIUM";
  }

  if (
    [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }

  return "MEDIUM";
}

function normalizeContradictionIds(
  values
) {
  return (
    Array.isArray(
      values
    )
      ? values
      : []
  )
    .map(
      (
        value
      ) =>
        typeof value ===
        "string"
          ? value
          : (
              value.id ||
              value.contradictionId
            )
    )
    .filter(
      Boolean
    );
}

function collectRiskReasons(
  risk
) {
  const reasons =
    [];

  const collections = [
    risk
      .availability
      ?.reasons,

    risk
      .customerImpact
      ?.reasons,

    risk
      .riskObservations,

    risk
      .cascadingRisks,

    risk
      .dataRisks,

    risk
      .securityRisks,
  ];

  for (
    const values
    of collections
  ) {
    if (
      !Array.isArray(
        values
      )
    ) {
      continue;
    }

    for (
      const value
      of values
    ) {
      if (
        typeof value ===
        "string"
      ) {
        reasons.push(
          value
        );
      }
    }
  }

  return Array.from(
    new Set(
      reasons
    )
  );
}

function collectWarnings(
  trace
) {
  return Array.from(
    new Set(
      (
        trace ||
        []
      )
        .flatMap(
          (
            record
          ) =>
            record.warnings ||
            []
        )
        .filter(
          Boolean
        )
    )
  );
}

function normalizeError(
  error
) {
  if (!error) {
    return null;
  }

  if (
    typeof error ===
    "string"
  ) {
    return error.slice(
      0,
      2048
    );
  }

  return String(
    error.message ||
    error
  )
    .slice(
      0,
      2048
    );
}

function determineProvider(
  trace
) {
  const providers =
    (
      trace ||
      []
    )
      .map(
        (
          item
        ) =>
          item.provider
      )
      .filter(
        Boolean
      );

  return (
    providers[0] ||
    null
  );
}

function determineModel(
  trace
) {
  const models =
    (
      trace ||
      []
    )
      .map(
        (
          item
        ) =>
          item.model
      )
      .filter(
        Boolean
      );

  return (
    models[0] ||
    null
  );
}

function coordinatorResultVersion(
  context
) {
  return (
    context
      .metadata
      ?.coordinatorVersion ||
    "phase6-v1"
  );
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new DiagnosisPersistenceService();

module.exports
  .DiagnosisPersistenceService =
  DiagnosisPersistenceService;