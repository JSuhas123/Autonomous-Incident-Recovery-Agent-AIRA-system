"use strict";

/**
 * AIRA Verification Controller
 *
 * Phase 9.13
 *
 * Exposes post-execution verification APIs.
 *
 * SAFETY:
 *
 * - does not close incidents
 * - does not start retries
 * - does not execute rollback
 * - does not authorize infrastructure execution
 */

const ExecutionRequest =
  require(
    "../models/ExecutionRequest"
  );

const RecoveryVerification =
  require(
    "../models/RecoveryVerification"
  );

const RecoveryVerificationRun =
  require(
    "../models/RecoveryVerificationRun"
  );

const verificationQueueService =
  require(
    "../services/verification/verificationQueueService"
  );

class VerificationController {
  // ==========================================================================
  // REQUEST VERIFICATION
  // ==========================================================================

  async requestVerification(
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
        executionRequestId,
      } =
        req.params;

      if (
        !executionRequestId
      ) {
        throw this.error(
          "executionRequestId is required",
          "VERIFICATION_API_EXECUTION_REQUEST_REQUIRED",
          400
        );
      }

      const executionRequest =
        await ExecutionRequest
          .findOne({
            executionRequestId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          });

      if (
        !executionRequest
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
                "EXECUTION_REQUEST_NOT_FOUND",

              message:
                "Execution request not found.",
            },
          });
      }

      if (
        ![
          "SUCCEEDED",
          "FAILED",
        ].includes(
          executionRequest.state
        )
      ) {
        return res
          .status(
            409
          )
          .json({
            success:
              false,

            error: {
              code:
                "EXECUTION_NOT_READY_FOR_VERIFICATION",

              message:
                `Execution request state ${executionRequest.state} is not ready for verification.`,
            },
          });
      }

      if (
        !executionRequest
          .executionPlan ||
        !executionRequest
          .planId ||
        !executionRequest
          .planHash
      ) {
        return res
          .status(
            409
          )
          .json({
            success:
              false,

            error: {
              code:
                "EXECUTION_PLAN_NOT_AVAILABLE",

              message:
                "Execution request has no persisted immutable execution plan.",
            },
          });
      }

      const queueResult =
        await verificationQueueService
          .enqueue({
            executionRequestId:
              executionRequest
                .executionRequestId,

            organizationId:
              executionRequest
                .organizationId,

            environmentId:
              executionRequest
                .environmentId,

            incidentId:
              executionRequest
                .incidentId,

            authorizationId:
              executionRequest
                .authorizationId,

            recoveryDecisionId:
              executionRequest
                .recoveryDecisionId,

            executionAuthorized:
              false,
          });

      return res
        .status(
          202
        )
        .json({
          success:
            true,

          queued:
            queueResult.queued ===
            true,

          executionRequestId:
            executionRequest
              .executionRequestId,

          verificationStarted:
            false,

          incidentClosed:
            false,

          retryStarted:
            false,

          rollbackStarted:
            false,

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
  // GET CURRENT VERIFICATION
  // ==========================================================================

  async getCurrentVerification(
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

      if (
        !incidentId
      ) {
        throw this.error(
          "incidentId is required",
          "VERIFICATION_API_INCIDENT_REQUIRED",
          400
        );
      }

      const verification =
        await RecoveryVerification
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
        !verification
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
                "RECOVERY_VERIFICATION_NOT_FOUND",

              message:
                "Current recovery verification not found.",
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

          verification:
            this.serializeVerification(
              verification
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
  // GET VERIFICATION BY ID
  // ==========================================================================

  async getVerification(
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
        verificationId,
      } =
        req.params;

      if (
        !verificationId
      ) {
        throw this.error(
          "verificationId is required",
          "VERIFICATION_API_ID_REQUIRED",
          400
        );
      }

      const verification =
        await RecoveryVerification
          .findOne({
            verificationId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          })
          .lean();

      if (
        !verification
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
                "RECOVERY_VERIFICATION_NOT_FOUND",

              message:
                "Recovery verification not found.",
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

          verification:
            this.serializeVerification(
              verification
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
  // VERIFICATION HISTORY
  // ==========================================================================

  async getVerificationHistory(
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

      if (
        !incidentId
      ) {
        throw this.error(
          "incidentId is required",
          "VERIFICATION_API_INCIDENT_REQUIRED",
          400
        );
      }

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

      const verifications =
        await RecoveryVerification
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
            verifications.length,

          verifications:
            verifications.map(
              (
                verification
              ) =>
                this.serializeVerification(
                  verification
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
  // VERIFICATION RUN HISTORY
  // ==========================================================================

  async getVerificationRuns(
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

      const runs =
        await RecoveryVerificationRun
          .find({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            incidentId,
          })
          .sort({
            createdAt:
              -1,
          })
          .limit(
            100
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
            runs.length,

          runs:
            runs.map(
              (
                run
              ) =>
                this.serializeRun(
                  run
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
  // EVIDENCE
  // ==========================================================================

  async getVerificationEvidence(
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
        verificationId,
      } =
        req.params;

      const verification =
        await RecoveryVerification
          .findOne({
            verificationId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          })
          .lean();

      if (
        !verification
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
                "RECOVERY_VERIFICATION_NOT_FOUND",

              message:
                "Recovery verification not found.",
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

          verificationId:
            verification
              .verificationId,

          verificationPlanId:
            verification
              .verificationPlanId,

          verificationPlanHash:
            verification
              .verificationPlanHash,

          evidencePackage:
            verification
              .evidencePackage,

          criticResult:
            verification
              .criticResult,

          routingResult:
            verification
              .routingResult,

          incidentClosureEligible:
            verification
              .incidentClosureEligible ===
            true,

          incidentClosed:
            false,

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
  // CLOSURE ELIGIBILITY
  // ==========================================================================

  async getClosureEligibility(
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

      const verification =
        await RecoveryVerification
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
        !verification
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
                "RECOVERY_VERIFICATION_NOT_FOUND",

              message:
                "Current recovery verification not found.",
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

          incidentId,

          verificationId:
            verification
              .verificationId,

          decision:
            verification
              .decision,

          recoveryConfirmed:
            verification
              .recoveryConfirmed ===
            true,

          incidentClosureEligible:
            verification
              .incidentClosureEligible ===
            true,

          incidentClosed:
            false,

          nextAction:
            verification
              .nextAction,

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
      !organizationId ||
      !environmentId
    ) {
      throw this.error(
        "Verification API requires organization and environment scope",
        "VERIFICATION_API_SCOPE_REQUIRED",
        400
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
  // SERIALIZATION
  // ==========================================================================

  serializeVerification(
    verification
  ) {
    return {
      verificationId:
        verification
          .verificationId,

      organizationId:
        verification
          .organizationId,

      environmentId:
        verification
          .environmentId,

      incidentId:
        verification
          .incidentId,

      executionRequestId:
        verification
          .executionRequestId,

      authorizationId:
        verification
          .authorizationId,

      recoveryDecisionId:
        verification
          .recoveryDecisionId,

      verificationPlanId:
        verification
          .verificationPlanId,

      verificationPlanHash:
        verification
          .verificationPlanHash,

      revision:
        verification
          .revision,

      isCurrent:
        verification
          .isCurrent,

      status:
        verification
          .status,

      decision:
        verification
          .decision,

      confidence:
        verification
          .confidence,

      nextAction:
        verification
          .nextAction,

      recovered:
        verification
          .recovered ===
        true,

      recoveryConfirmed:
        verification
          .recoveryConfirmed ===
        true,

      incidentClosureEligible:
        verification
          .incidentClosureEligible ===
        true,

      overallScore:
        verification
          .overallScore,

      verifiedAt:
        verification
          .verifiedAt,

      criticResult:
        verification
          .criticResult ||
        null,

      routingResult:
        verification
          .routingResult ||
        null,

      createdAt:
        verification
          .createdAt,

      updatedAt:
        verification
          .updatedAt,

      executionAuthorized:
        false,
    };
  }

  serializeRun(
    run
  ) {
    return {
      verificationRunId:
        run.verificationRunId,

      verificationId:
        run.verificationId,

      incidentId:
        run.incidentId,

      executionRequestId:
        run.executionRequestId,

      state:
        run.state,

      attempt:
        run.attempt,

      maxAttempts:
        run.maxAttempts,

      verificationPlanId:
        run.verificationPlanId,

      verificationPlanHash:
        run.verificationPlanHash,

      requestedAt:
        run.requestedAt,

      startedAt:
        run.startedAt,

      completedAt:
        run.completedAt,

      failure:
        run.failure ||
        null,

      createdAt:
        run.createdAt,

      updatedAt:
        run.updatedAt,
    };
  }

  error(
    message,
    code,
    status
  ) {
    return Object.assign(
      new Error(
        message
      ),
      {
        code,
        status,
      }
    );
  }
}

module.exports =
  new VerificationController();

module.exports
  .VerificationController =
  VerificationController;