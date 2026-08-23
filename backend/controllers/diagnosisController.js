"use strict";

const {
  incidentDiagnosisRepository,
  agentIntelligenceRunRepository,
} =
  require(
    "../persistence/repositories"
  );

const diagnosisQueueService =
  require(
    "../services/diagnosis/diagnosisQueueService"
  );

class DiagnosisController {
  // ==========================================================================
  // CURRENT DIAGNOSIS
  // ==========================================================================

  async getCurrentDiagnosis(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      const diagnosis =
        await incidentDiagnosisRepository
          .findCurrent({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          });

      if (
        !diagnosis
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_DIAGNOSIS_NOT_FOUND",

              message:
                "No diagnosis is available for this incident.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          diagnosis:
            this.serializeDiagnosis(
              diagnosis
            ),
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // DIAGNOSIS HISTORY
  // ==========================================================================

  async getDiagnosisHistory(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(
              req.query
                .limit ||
              20
            )
          )
        );

      const diagnoses =
        await incidentDiagnosisRepository
          .findHistory(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,
            },
            {
              limit,
            }
          );

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          incidentId,

          count:
            diagnoses.length,

          diagnoses:
            diagnoses.map(
              (
                diagnosis
              ) =>
                this.serializeDiagnosisSummary(
                  diagnosis
                )
            ),
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // SPECIFIC DIAGNOSIS
  // ==========================================================================

  async getDiagnosisById(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
        diagnosisId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      this.assertDiagnosisId(
        diagnosisId
      );

      const diagnosis =
        await incidentDiagnosisRepository
          .findByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,
            },
            diagnosisId
          );

      if (
        !diagnosis
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_DIAGNOSIS_NOT_FOUND",

              message:
                "Diagnosis not found.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          diagnosis:
            this.serializeDiagnosis(
              diagnosis
            ),
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // INTELLIGENCE RUN
  // ==========================================================================

  async getDiagnosisRun(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
        diagnosisId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      this.assertDiagnosisId(
        diagnosisId
      );

      const repositoryScope = {
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId,
      };

      const diagnosis =
        await incidentDiagnosisRepository
          .findByIdentifier(
            repositoryScope,
            diagnosisId
          );

      if (
        !diagnosis
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "INCIDENT_DIAGNOSIS_NOT_FOUND",

              message:
                "Diagnosis not found.",
            },
          });
      }

      let run =
        null;

      /*
       * A diagnosis may point at the provider/database identifier
       * of an intelligence run.
       */
      if (
        diagnosis.runId
      ) {
        run =
          await agentIntelligenceRunRepository
            .findByIdentifier(
              repositoryScope,
              diagnosis.runId
            );
      }

      /*
       * During migration/backfill or older diagnosis records,
       * the diagnosis may only retain the public/external run ID.
       */
      if (
        !run &&
        diagnosis
          .runExternalId
      ) {
        run =
          await agentIntelligenceRunRepository
            .findByIdentifier(
              repositoryScope,
              diagnosis
                .runExternalId
            );
      }

      if (
        !run
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "DIAGNOSIS_RUN_NOT_FOUND",

              message:
                "Agent intelligence run not found.",
            },
          });
      }

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          run:
            this.serializeRun(
              run
            ),
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // REQUEST / RERUN DIAGNOSIS
  // ==========================================================================

  async requestDiagnosis(
    req,
    res,
    next
  ) {
    try {
      const scope =
        this.resolveScope(
          req
        );

      const {
        incidentId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      const result =
        await diagnosisQueueService
          .requestDiagnosis({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,

            correlationId:
              req.body
                ?.correlationId ||
              null,

            correlationGroupId:
              req.body
                ?.correlationGroupId ||
              null,

            trigger:
              "manual_rediagnosis",

            metadata: {
              requestedBy:
                req.user
                  ?._id ||
                req.user
                  ?.id ||
                null,

              source:
                "diagnosis_api",

              force:
                true,
            },
          });

      return res
        .status(
          202
        )
        .json({
          success:
            true,

          message:
            "Diagnosis requested.",

          job: {
            jobId:
              result.jobId,

            incidentId:
              result.incidentId,

            queued:
              result.queued,
          },

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }

  // ==========================================================================
  // SCOPE
  // ==========================================================================

  resolveScope(
    req
  ) {
    const organizationId =
      req.organizationId ||
      req.context
        ?.organizationId ||
      req.user
        ?.organizationId;

    const environmentId =
      req.environmentId ||
      req.context
        ?.environmentId ||
      req.headers[
        "x-environment-id"
      ];

    if (
      !organizationId
    ) {
      throw Object.assign(
        new Error(
          "Organization context is required"
        ),
        {
          code:
            "DIAGNOSIS_ORGANIZATION_REQUIRED",

          status:
            400,
        }
      );
    }

    if (
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Environment context is required"
        ),
        {
          code:
            "DIAGNOSIS_ENVIRONMENT_REQUIRED",

          status:
            400,
        }
      );
    }

    return {
      organizationId:
        String(
          organizationId
        ),

      environmentId:
        String(
          environmentId
        ),
    };
  }

  // ==========================================================================
  // INCIDENT ID
  // ==========================================================================

  assertIncidentId(
    incidentId
  ) {
    if (
      !incidentId
    ) {
      throw Object.assign(
        new Error(
          "incidentId is required"
        ),
        {
          code:
            "INCIDENT_ID_REQUIRED",

          status:
            400,
        }
      );
    }
  }

  // ==========================================================================
  // DIAGNOSIS ID
  // ==========================================================================

  assertDiagnosisId(
    diagnosisId
  ) {
    if (
      !diagnosisId
    ) {
      throw Object.assign(
        new Error(
          "diagnosisId is required"
        ),
        {
          code:
            "DIAGNOSIS_ID_REQUIRED",

          status:
            400,
        }
      );
    }
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  identifierString(
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

  serializeDiagnosis(
    diagnosis
  ) {
    return {
      id:
        this.identifierString(
          diagnosis._id
        ),

      diagnosisId:
        diagnosis.diagnosisId,

      incidentId:
        this.identifierString(
          diagnosis.incidentId
        ),

      revision:
        diagnosis.revision,

      isCurrent:
        diagnosis.isCurrent,

      status:
        diagnosis.status,

      outcome:
        diagnosis.outcome,

      title:
        diagnosis.title,

      summary:
        diagnosis.summary,

      probableRootCause:
        diagnosis
          .probableRootCause,

      rootCauseCategory:
        diagnosis
          .rootCauseCategory,

      primaryHypothesisId:
        diagnosis
          .primaryHypothesisId,

      symptoms:
        diagnosis.symptoms ||
        [],

      findings:
        diagnosis.findings ||
        [],

      hypotheses:
        diagnosis.hypotheses ||
        [],

      contradictions:
        diagnosis
          .contradictions ||
        [],

      unresolvedQuestions:
        diagnosis
          .unresolvedQuestions ||
        [],

      unknowns:
        diagnosis.unknowns ||
        [],

      evidenceSummary:
        diagnosis
          .evidenceSummary ||
        {},

      impactSnapshot:
        diagnosis
          .impactSnapshot ||
        {},

      risk:
        diagnosis.risk ||
        {},

      confidence:
        diagnosis.confidence ||
        {},

      recommendedNextStep:
        diagnosis
          .recommendedNextStep ||
        null,

      falsePositiveSuspected:
        Boolean(
          diagnosis
            .falsePositiveSuspected
        ),

      supersedesDiagnosisId:
        diagnosis
          .supersedesDiagnosisId ||
        null,

      supersededByDiagnosisId:
        diagnosis
          .supersededByDiagnosisId ||
        null,

      analyzedAt:
        diagnosis
          .analysisCompletedAt ||
        diagnosis.updatedAt ||
        diagnosis.createdAt,

      createdAt:
        diagnosis.createdAt,

      updatedAt:
        diagnosis.updatedAt,

      executionAuthorized:
        false,
    };
  }

  serializeDiagnosisSummary(
    diagnosis
  ) {
    return {
      id:
        this.identifierString(
          diagnosis._id
        ),

      diagnosisId:
        diagnosis.diagnosisId,

      revision:
        diagnosis.revision,

      isCurrent:
        diagnosis.isCurrent,

      status:
        diagnosis.status,

      outcome:
        diagnosis.outcome,

      probableRootCause:
        diagnosis
          .probableRootCause,

      diagnosisConfidence:
        diagnosis
          .confidence
          ?.overallConfidence ??
        null,

      riskLevel:
        diagnosis
          .risk
          ?.level ||
        null,

      analyzedAt:
        diagnosis
          .analysisCompletedAt ||
        diagnosis.updatedAt ||
        diagnosis.createdAt,
    };
  }

  serializeRun(
    run
  ) {
    return {
      id:
        this.identifierString(
          run._id
        ),

      runId:
        run.runId,

      diagnosisId:
        this.identifierString(
          run.diagnosisId
        ),

      incidentId:
        this.identifierString(
          run.incidentId
        ),

      status:
        run.status,

      phase:
        run.phase,

      outcome:
        run.outcome,

      summary:
        run.summary,

      confidence:
        run.confidence ||
        {},

      contextSummary:
        run.contextSummary ||
        {},

      agentTrace:
        run.agentTrace ||
        [],

      findingIds:
        run.findingIds ||
        [],

      hypothesisIds:
        run.hypothesisIds ||
        [],

      contradictionIds:
        run.contradictionIds ||
        [],

      warnings:
        run.warnings ||
        [],

      manualReason:
        run.manualReason ||
        null,

      reasoningProvider:
        run.reasoningProvider ||
        null,

      model:
        run.model ||
        null,

      fallbackUsed:
        Boolean(
          run.fallbackUsed
        ),

      startedAt:
        run.startedAt,

      completedAt:
        run.completedAt,

      durationMs:
        run.durationMs,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new DiagnosisController();

module.exports
  .DiagnosisController =
  DiagnosisController;