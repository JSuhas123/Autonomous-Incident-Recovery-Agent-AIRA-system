"use strict";

const mongoose =
  require(
    "mongoose"
  );

const IncidentDiagnosis =
  require(
    "../models/IncidentDiagnosis"
  );

const AgentIntelligenceRun =
  require(
    "../models/AgentIntelligenceRun"
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
        await IncidentDiagnosis
          .findOne({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,

            isCurrent:
              true,
          })
          .lean();

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
        await IncidentDiagnosis
          .find({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .sort({
            revision:
              -1,
          })
          .limit(
            limit
          )
          .lean();

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

      const query = {
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId,
      };

      /*
       * Support both Mongo _id and external diagnosisId.
       */
      if (
        mongoose
          .Types
          .ObjectId
          .isValid(
            diagnosisId
          )
      ) {
        query.$or = [
          {
            _id:
              diagnosisId,
          },

          {
            diagnosisId,
          },
        ];
      } else {
        query.diagnosisId =
          diagnosisId;
      }

      const diagnosis =
        await IncidentDiagnosis
          .findOne(
            query
          )
          .lean();

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

      const diagnosisQuery = {
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId,
      };

      if (
        mongoose
          .Types
          .ObjectId
          .isValid(
            diagnosisId
          )
      ) {
        diagnosisQuery.$or = [
          {
            _id:
              diagnosisId,
          },

          {
            diagnosisId,
          },
        ];
      } else {
        diagnosisQuery.diagnosisId =
          diagnosisId;
      }

      const diagnosis =
        await IncidentDiagnosis
          .findOne(
            diagnosisQuery
          )
          .lean();

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

      if (
        diagnosis.runId
      ) {
        run =
          await AgentIntelligenceRun
            .findOne({
              _id:
                diagnosis.runId,

              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,
            })
            .lean();
      }

      if (
        !run &&
        diagnosis
          .runExternalId
      ) {
        run =
          await AgentIntelligenceRun
            .findOne({
              runId:
                diagnosis
                  .runExternalId,

              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,
            })
            .lean();
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
      organizationId,
      environmentId,
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
  // SERIALIZATION
  // ==========================================================================

  serializeDiagnosis(
    diagnosis
  ) {
    return {
      id:
        diagnosis._id,

      diagnosisId:
        diagnosis.diagnosisId,

      incidentId:
        diagnosis.incidentId,

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
        diagnosis._id,

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
        run._id,

      runId:
        run.runId,

      diagnosisId:
        run.diagnosisId,

      incidentId:
        run.incidentId,

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