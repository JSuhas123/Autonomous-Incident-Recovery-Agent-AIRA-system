"use strict";

const mongoose =
  require(
    "mongoose"
  );

const RecoveryDecision =
  require(
    "../models/RecoveryDecision"
  );

const RecoveryDecisionRun =
  require(
    "../models/RecoveryDecisionRun"
  );

const recoveryDecisionQueueService =
  require(
    "../services/recovery/recoveryDecisionQueueService"
  );

class RecoveryDecisionController {
  // ==========================================================================
  // CURRENT DECISION
  // ==========================================================================

  async getCurrentDecision(
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

      const decision =
        await RecoveryDecision
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
        !decision
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
                "RECOVERY_DECISION_NOT_FOUND",

              message:
                "No recovery decision is available for this incident.",
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

          decision:
            this.serializeDecision(
              decision
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
  // HISTORY
  // ==========================================================================

  async getDecisionHistory(
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
              req.query.limit ||
              20
            )
          )
        );

      const decisions =
        await RecoveryDecision
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
            decisions.length,

          decisions:
            decisions.map(
              (
                decision
              ) =>
                this.serializeDecisionSummary(
                  decision
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
  // SPECIFIC DECISION
  // ==========================================================================

  async getDecisionById(
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
        decisionId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      if (
        !decisionId
      ) {
        throw Object.assign(
          new Error(
            "decisionId is required"
          ),
          {
            code:
              "RECOVERY_DECISION_ID_REQUIRED",

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

      if (
        mongoose
          .Types
          .ObjectId
          .isValid(
            decisionId
          )
      ) {
        query.$or = [
          {
            _id:
              decisionId,
          },

          {
            decisionId,
          },
        ];
      } else {
        query.decisionId =
          decisionId;
      }

      const decision =
        await RecoveryDecision
          .findOne(
            query
          )
          .lean();

      if (
        !decision
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
                "RECOVERY_DECISION_NOT_FOUND",

              message:
                "Recovery decision not found.",
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

          decision:
            this.serializeDecision(
              decision
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
  // DECISION RUN
  // ==========================================================================

  async getDecisionRun(
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
        decisionId,
      } =
        req.params;

      this.assertIncidentId(
        incidentId
      );

      const decisionQuery = {
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
            decisionId
          )
      ) {
        decisionQuery.$or = [
          {
            _id:
              decisionId,
          },

          {
            decisionId,
          },
        ];
      } else {
        decisionQuery.decisionId =
          decisionId;
      }

      const decision =
        await RecoveryDecision
          .findOne(
            decisionQuery
          )
          .lean();

      if (
        !decision
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
                "RECOVERY_DECISION_NOT_FOUND",

              message:
                "Recovery decision not found.",
            },
          });
      }

      const run =
        await RecoveryDecisionRun
          .findOne({
            runId:
              decision.runId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .lean();

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
                "RECOVERY_DECISION_RUN_NOT_FOUND",

              message:
                "Recovery decision run not found.",
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
  // REQUEST RE-EVALUATION
  // ==========================================================================

  async requestReevaluation(
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

      const body =
        req.body ||
        {};

      if (
        !body.diagnosis
      ) {
        throw Object.assign(
          new Error(
            "Diagnosis payload is required for recovery reevaluation"
          ),
          {
            code:
              "RECOVERY_REEVALUATION_DIAGNOSIS_REQUIRED",

            status:
              400,
          }
        );
      }

      const result =
        await recoveryDecisionQueueService
          .requestDecision({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,

            diagnosisId:
              body.diagnosisId ||
              body.diagnosis
                ?.diagnosisId ||
              null,

            diagnosisRevision:
              body.diagnosisRevision ??
              body.diagnosis
                ?.revision ??
              null,

            diagnosis:
              body.diagnosis,

            safetyGate:
              body.safetyGate ||
              null,

            context:
              body.context ||
              {},

            trigger:
              "manual_recovery_reevaluation",

            metadata: {
              requestedBy:
                req.user
                  ?._id ||
                req.user
                  ?.id ||
                null,

              source:
                "recovery_api",

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
            "Recovery reevaluation requested.",

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
            "RECOVERY_ORGANIZATION_REQUIRED",

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
            "RECOVERY_ENVIRONMENT_REQUIRED",

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
  // SERIALIZE DECISION
  // ==========================================================================

  serializeDecision(
    decision
  ) {
    return {
      id:
        decision._id,

      decisionId:
        decision.decisionId,

      incidentId:
        decision.incidentId,

      diagnosisId:
        decision.diagnosisId,

      diagnosisRevision:
        decision.diagnosisRevision,

      revision:
        decision.revision,

      isCurrent:
        decision.isCurrent,

      status:
        decision.status,

      decision:
        decision.decision,

      selectedCandidateId:
        decision
          .selectedCandidateId,

      selectedPlaybookId:
        decision
          .selectedPlaybookId,

      confidence:
        decision.confidence,

      candidates:
        decision.candidates ||
        [],

      rejectedCandidates:
        decision
          .rejectedCandidates ||
        [],

      reasons:
        decision.reasons ||
        [],

      unknowns:
        decision.unknowns ||
        [],

      policyStatus:
        decision.policyStatus,

      riskLevel:
        decision.riskLevel,

      approvalRequired:
        Boolean(
          decision
            .approvalRequired
        ),

      approvalMode:
        decision.approvalMode,

      rollbackAvailable:
        Boolean(
          decision
            .rollbackAvailable
        ),

      reversibility:
        decision.reversibility,

      criticResult:
        decision
          .criticResult ||
        null,

      supersedesDecisionId:
        decision
          .supersedesDecisionId ||
        null,

      supersededByDecisionId:
        decision
          .supersededByDecisionId ||
        null,

      generatedAt:
        decision.generatedAt,

      createdAt:
        decision.createdAt,

      updatedAt:
        decision.updatedAt,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SERIALIZE SUMMARY
  // ==========================================================================

  serializeDecisionSummary(
    decision
  ) {
    return {
      id:
        decision._id,

      decisionId:
        decision.decisionId,

      revision:
        decision.revision,

      isCurrent:
        decision.isCurrent,

      status:
        decision.status,

      decision:
        decision.decision,

      selectedPlaybookId:
        decision
          .selectedPlaybookId,

      confidence:
        decision.confidence,

      policyStatus:
        decision.policyStatus,

      riskLevel:
        decision.riskLevel,

      approvalRequired:
        Boolean(
          decision
            .approvalRequired
        ),

      approvalMode:
        decision.approvalMode,

      generatedAt:
        decision.generatedAt,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SERIALIZE RUN
  // ==========================================================================

  serializeRun(
    run
  ) {
    return {
      id:
        run._id,

      runId:
        run.runId,

      incidentId:
        run.incidentId,

      diagnosisId:
        run.diagnosisId,

      diagnosisRevision:
        run.diagnosisRevision,

      decisionId:
        run.decisionId,

      decisionType:
        run.decisionType,

      selectedCandidateId:
        run
          .selectedCandidateId,

      selectedPlaybookId:
        run
          .selectedPlaybookId,

      confidence:
        run.confidence,

      stageTrace:
        run.stageTrace ||
        [],

      candidateSnapshot:
        run.candidateSnapshot ||
        [],

      criticResult:
        run.criticResult ||
        null,

      status:
        run.status,

      error:
        run.error ||
        null,

      startedAt:
        run.startedAt,

      completedAt:
        run.completedAt,

      durationMs:
        run.durationMs,

      metadata:
        run.metadata ||
        {},

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new RecoveryDecisionController();

module.exports
  .RecoveryDecisionController =
  RecoveryDecisionController;