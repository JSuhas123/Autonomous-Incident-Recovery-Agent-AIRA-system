"use strict";

const {
  recoveryDecisionRepository,
} =
  require(
    "../persistence/repositories"
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
        await recoveryDecisionRepository
          .findCurrent({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          });

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
        await recoveryDecisionRepository
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

      this.assertDecisionId(
        decisionId
      );

      const decision =
        await recoveryDecisionRepository
          .findByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,
            },
            decisionId
          );

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

      this.assertDecisionId(
        decisionId
      );

      const repositoryScope = {
        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId,
      };

      const decision =
        await recoveryDecisionRepository
          .findByIdentifier(
            repositoryScope,
            decisionId
          );

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

      if (
        !decision.runId
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

      const run =
        await recoveryDecisionRepository
          .findRunByIdentifier(
            repositoryScope,
            decision.runId
          );

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
  // VALIDATION
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

  assertDecisionId(
    decisionId
  ) {
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
  }

  // ==========================================================================
  // IDENTIFIER SERIALIZATION
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

  // ==========================================================================
  // SERIALIZE DECISION
  // ==========================================================================

  serializeDecision(
    decision
  ) {
    return {
      id:
        this.identifierString(
          decision._id
        ),

      decisionId:
        decision.decisionId,

      incidentId:
        this.identifierString(
          decision.incidentId
        ),

      diagnosisId:
        this.identifierString(
          decision.diagnosisId
        ),

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
        this.identifierString(
          decision
            .supersedesDecisionId
        ),

      supersededByDecisionId:
        this.identifierString(
          decision
            .supersededByDecisionId
        ),

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
        this.identifierString(
          decision._id
        ),

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
        this.identifierString(
          run._id
        ),

      runId:
        run.runId,

      incidentId:
        this.identifierString(
          run.incidentId
        ),

      diagnosisId:
        this.identifierString(
          run.diagnosisId
        ),

      diagnosisRevision:
        run.diagnosisRevision,

      decisionId:
        this.identifierString(
          run.decisionId
        ),

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