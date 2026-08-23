"use strict";

/**
 * AIRA Execution Controller
 *
 * Provider-neutral Phase 13 execution API.
 *
 * HTTP is only responsible for:
 * - validating caller input
 * - invoking the authorization pipeline
 * - persisting through repository/service boundaries
 * - queueing authorized execution requests
 * - exposing execution lifecycle state
 *
 * This controller never:
 * - imports Mongo models
 * - accepts raw shell commands
 * - performs infrastructure execution directly
 * - bypasses authorization
 */

const {
  executionAuthorizationRepository,
} =
  require(
    "../persistence/repositories"
  );

const executionAuthorizationEngine =
  require(
    "../services/execution/executionAuthorizationEngine"
  );

const executionAuthorizationCritic =
  require(
    "../services/execution/executionAuthorizationCritic"
  );

const executionAuthorizationPersistenceService =
  require(
    "../services/execution/executionAuthorizationPersistenceService"
  );

const executionQueueService =
  require(
    "../services/execution/executionQueueService"
  );

const {
  EXECUTION_REQUEST_STATE,
} =
  require(
    "../services/execution/executionAuthorizationContracts"
  );

class ExecutionController {
  // ==========================================================================
  // REQUEST AUTHORIZATION + EXECUTION
  // ==========================================================================

  async requestExecution(
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

      this.assertExecutionRequestBody(
        body
      );

      // ======================================================================
      // 1. AUTHORIZATION ENGINE
      // ======================================================================

      const engineResult =
        await executionAuthorizationEngine
          .authorize(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId,

              recoveryDecisionId:
                body.recoveryDecisionId,

              recoveryDecisionRevision:
                body.recoveryDecisionRevision,

              diagnosisId:
                body.diagnosisId,

              diagnosisRevision:
                body.diagnosisRevision,

              selectedCandidateId:
                body.selectedCandidateId,

              selectedPlaybookId:
                body.selectedPlaybookId,

              recoveryDecision:
                body.recoveryDecision,

              selectedCandidate:
                body.selectedCandidate,

              playbook:
                body.playbook,

              context:
                body.context ||
                {},

              parameters:
                body.parameters ||
                {},

              environment:
                body.environment,

              policyRevision:
                body.policyRevision,

              retryAllowed:
                body.retryAllowed ===
                true,

              maxAttempts:
                body.maxAttempts,

              idempotencyKey:
                body.idempotencyKey,

              resourceId:
                body.resourceId,

              resourceType:
                body.resourceType,

              actionType:
                body.actionType,

              ownerId:
                body.ownerId,

              leaseTtlMs:
                body.leaseTtlMs,

              executionAuthorized:
                false,
            },

            req.executionDependencies ||
              {}
          );

      // ======================================================================
      // 2. CRITIC
      // ======================================================================

      const criticResult =
        await executionAuthorizationCritic
          .review(
            engineResult,
            req.executionCriticDependencies ||
              {}
          );

      // ======================================================================
      // 3. PERSIST AUTHORIZATION + EXECUTION REQUEST
      // ======================================================================

      const persisted =
        await executionAuthorizationPersistenceService
          .persist({
            engineResult,
            criticResult,
          });

      // ======================================================================
      // 4. QUEUE ONLY WHEN A REQUEST WAS CREATED
      // ======================================================================

      let queueResult =
        null;

      if (
        persisted
          .requestCreated ===
          true &&
        persisted
          .executionRequest
      ) {
        const request =
          persisted
            .executionRequest;

        request.state =
          EXECUTION_REQUEST_STATE
            .QUEUED;

        request.queuedAt =
          new Date();

        /*
         * Important Phase 13 boundary:
         *
         * Never call request.save() here.
         *
         * Mongo returns a Mongoose document while PostgreSQL returns a
         * provider-neutral domain object. The repository owns persistence.
         */
        const savedRequest =
          await executionAuthorizationRepository
            .saveExecutionRequest(
              request
            );

        /*
         * Keep the object returned to the caller aligned with the canonical
         * persisted state whenever the repository returns one.
         */
        if (
          savedRequest
        ) {
          persisted.executionRequest =
            savedRequest;
        }

        const queueRequest =
          persisted
            .executionRequest;

        queueResult =
          await executionQueueService
            .enqueue({
              executionRequestId:
                queueRequest
                  .executionRequestId,

              authorizationId:
                persisted
                  .authorization
                  .authorizationId,

              organizationId:
                queueRequest
                  .organizationId,

              environmentId:
                queueRequest
                  .environmentId,

              incidentId:
                queueRequest
                  .incidentId,
            });
      }

      const authorized =
        persisted
          .authorizationGranted ===
          true &&
        criticResult
          .accepted ===
          true;

      return res
        .status(
          authorized
            ? 202
            : 200
        )
        .json({
          success:
            true,

          authorized,

          queued:
            Boolean(
              queueResult
                ?.queued
            ),

          authorization:
            this.serializeAuthorization(
              persisted
                .authorization
            ),

          executionRequest:
            persisted
              .executionRequest
              ? this.serializeExecutionRequest(
                  persisted
                    .executionRequest
                )
              : null,

          critic: {
            decision:
              criticResult
                .criticDecision,

            accepted:
              criticResult
                .accepted,

            rejected:
              criticResult
                .rejected,

            requiresManualReview:
              criticResult
                .requiresManualReview,

            violations:
              criticResult
                .violations ||
              [],

            warnings:
              criticResult
                .warnings ||
              [],
          },

          executionStarted:
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
  // AUTHORIZATION BY ID
  // ==========================================================================

  async getAuthorization(
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
        authorizationId,
      } =
        req.params;

      this.assertAuthorizationId(
        authorizationId
      );

      const authorization =
        await executionAuthorizationRepository
          .findAuthorizationByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            },

            authorizationId
          );

      if (
        !authorization
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
                "EXECUTION_AUTHORIZATION_NOT_FOUND",

              message:
                "Execution authorization not found.",
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

          authorization:
            this.serializeAuthorization(
              authorization
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
  // EXECUTION REQUEST
  // ==========================================================================

  async getExecutionRequest(
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

      this.assertExecutionRequestId(
        executionRequestId
      );

      const request =
        await executionAuthorizationRepository
          .findExecutionRequestByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            },

            executionRequestId
          );

      if (
        !request
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

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          executionRequest:
            this.serializeExecutionRequest(
              request
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
  // INCIDENT EXECUTION HISTORY
  // ==========================================================================

  async getIncidentExecutionHistory(
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
        this.normalizeLimit(
          req.query
            ?.limit,
          20
        );

      const requests =
        await executionAuthorizationRepository
          .findIncidentExecutionHistory(
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
            requests.length,

          executions:
            requests.map(
              (
                request
              ) =>
                this.serializeExecutionRequest(
                  request
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
  // CANCEL BEFORE EXECUTION
  // ==========================================================================

  async cancelExecution(
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

      this.assertExecutionRequestId(
        executionRequestId
      );

      const request =
        await executionAuthorizationRepository
          .findExecutionRequestByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            },

            executionRequestId
          );

      if (
        !request
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

      const cancellableStates = [
        EXECUTION_REQUEST_STATE
          .AUTHORIZED,

        EXECUTION_REQUEST_STATE
          .QUEUED,

        EXECUTION_REQUEST_STATE
          .CREATED,
      ];

      if (
        !cancellableStates.includes(
          request.state
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
                "EXECUTION_REQUEST_NOT_CANCELLABLE",

              message:
                `Execution request cannot be cancelled from state ${request.state}.`,
            },
          });
      }

      const now =
        new Date();

      request.state =
        EXECUTION_REQUEST_STATE
          .CANCELLED;

      request.cancelledAt =
        now;

      request.completedAt =
        now;

      request.metadata = {
        ...(
          request.metadata ||
          {}
        ),

        cancelledBy:
          req.user
            ?._id ||
          req.user
            ?.id ||
          null,

        cancelReason:
          req.body
            ?.reason ||
          "Cancelled by operator.",
      };

      const savedRequest =
        await executionAuthorizationRepository
          .saveExecutionRequest(
            request
          );

      const canonicalRequest =
        savedRequest ||
        request;

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          cancelled:
            true,

          executionRequest:
            this.serializeExecutionRequest(
              canonicalRequest
            ),

          executionStarted:
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
  // ROLLBACK STATUS
  // ==========================================================================

  async getRollbackStatus(
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

      this.assertExecutionRequestId(
        executionRequestId
      );

      const request =
        await executionAuthorizationRepository
          .findExecutionRequestByIdentifier(
            {
              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            },

            executionRequestId
          );

      if (
        !request
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

      return res
        .status(
          200
        )
        .json({
          success:
            true,

          executionRequestId,

          state:
            request.state,

          rollbackRequired:
            request.result
              ?.rollbackRequired ===
              true ||
            request.state ===
              EXECUTION_REQUEST_STATE
                .ROLLBACK_REQUIRED,

          rollback:
            request.rollback ||
            null,
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
  // INPUT VALIDATION
  // ==========================================================================

  assertExecutionRequestBody(
    body
  ) {
    const required = [
      "recoveryDecisionId",
      "selectedCandidateId",
      "selectedPlaybookId",
      "recoveryDecision",
      "selectedCandidate",
      "playbook",
    ];

    for (
      const field
      of required
    ) {
      if (
        !body[field]
      ) {
        throw Object.assign(
          new Error(
            `Execution request requires ${field}`
          ),
          {
            code:
              "EXECUTION_API_INPUT_REQUIRED",

            field,

            status:
              400,
          }
        );
      }
    }

    /*
     * HTTP callers cannot manufacture an existing authorization.
     */
    if (
      body.executionAuthorized ===
        true ||
      body.authorizationGranted ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Execution API does not accept caller-provided authorization"
        ),
        {
          code:
            "EXECUTION_API_UNSAFE_INPUT",

          status:
            400,
        }
      );
    }

    /*
     * Raw execution primitives remain forbidden.
     */
    if (
      body.command ||
      body.shell ||
      body.script ||
      body.exec
    ) {
      throw Object.assign(
        new Error(
          "Execution API does not accept raw commands"
        ),
        {
          code:
            "EXECUTION_API_RAW_COMMAND_FORBIDDEN",

          status:
            400,
        }
      );
    }
  }

  assertAuthorizationId(
    authorizationId
  ) {
    if (
      !authorizationId
    ) {
      throw Object.assign(
        new Error(
          "authorizationId is required"
        ),
        {
          code:
            "EXECUTION_AUTHORIZATION_ID_REQUIRED",

          status:
            400,
        }
      );
    }
  }

  assertExecutionRequestId(
    executionRequestId
  ) {
    if (
      !executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "executionRequestId is required"
        ),
        {
          code:
            "EXECUTION_REQUEST_ID_REQUIRED",

          status:
            400,
        }
      );
    }
  }

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

  normalizeLimit(
    value,
    fallback = 20
  ) {
    const parsed =
      Number(
        value
      );

    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return fallback;
    }

    return Math.min(
      100,
      Math.max(
        1,
        Math.floor(
          parsed
        )
      )
    );
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
      throw Object.assign(
        new Error(
          "Execution API requires organization and environment scope"
        ),
        {
          code:
            "EXECUTION_API_SCOPE_REQUIRED",

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

  serializeAuthorization(
    authorization
  ) {
    if (
      !authorization
    ) {
      return null;
    }

    return {
      authorizationId:
        authorization
          .authorizationId,

      incidentId:
        this.identifierString(
          authorization
            .incidentId
        ),

      recoveryDecisionId:
        this.identifierString(
          authorization
            .recoveryDecisionId
        ),

      recoveryDecisionRevision:
        authorization
          .recoveryDecisionRevision,

      selectedCandidateId:
        authorization
          .selectedCandidateId,

      selectedPlaybookId:
        authorization
          .selectedPlaybookId,

      decision:
        authorization
          .decision,

      status:
        authorization
          .status,

      authorizationGranted:
        authorization
          .authorizationGranted ===
        true,

      approvalState:
        authorization
          .approvalState,

      policyState:
        authorization
          .policyState,

      freshnessState:
        authorization
          .freshnessState,

      killSwitchState:
        authorization
          .killSwitchState,

      lockState:
        authorization
          .lockState,

      idempotencyState:
        authorization
          .idempotencyState,

      planId:
        authorization
          .planId,

      planHash:
        authorization
          .planHash,

      validFrom:
        authorization
          .validFrom,

      expiresAt:
        authorization
          .expiresAt,

      authorizedAt:
        authorization
          .authorizedAt,

      reasons:
        authorization
          .reasons ||
        [],

      warnings:
        authorization
          .warnings ||
        [],

      criticResult:
        authorization
          .criticResult ||
        null,

      createdAt:
        authorization
          .createdAt,
    };
  }

  serializeExecutionRequest(
    request
  ) {
    if (
      !request
    ) {
      return null;
    }

    return {
      executionRequestId:
        request
          .executionRequestId,

      authorizationId:
        this.identifierString(
          request
            .authorizationId
        ),

      incidentId:
        this.identifierString(
          request
            .incidentId
        ),

      recoveryDecisionId:
        this.identifierString(
          request
            .recoveryDecisionId
        ),

      recoveryDecisionRevision:
        request
          .recoveryDecisionRevision,

      candidateId:
        request
          .candidateId,

      playbookId:
        request
          .playbookId,

      state:
        request
          .state,

      planId:
        request
          .planId,

      planHash:
        request
          .planHash,

      attempt:
        request
          .attempt,

      maxAttempts:
        request
          .maxAttempts,

      requestedAt:
        request
          .requestedAt,

      queuedAt:
        request
          .queuedAt,

      startedAt:
        request
          .startedAt,

      completedAt:
        request
          .completedAt,

      cancelledAt:
        request
          .cancelledAt,

      failure:
        request
          .failure ||
        null,

      result:
        request
          .result ||
        null,

      rollback:
        request
          .rollback ||
        null,

      createdAt:
        request
          .createdAt,

      updatedAt:
        request
          .updatedAt,
    };
  }
}

module.exports =
  new ExecutionController();

module.exports
  .ExecutionController =
  ExecutionController;