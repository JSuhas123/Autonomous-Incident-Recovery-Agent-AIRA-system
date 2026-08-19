"use strict";

/**
 * AIRA Execution Authorization Persistence Service
 *
 * Phase 8.11
 *
 * Persists:
 *
 * - authorization result
 * - authorization critic result
 * - immutable execution plan snapshot
 * - execution request
 *
 * Safety:
 *
 * - rejected authorization never creates executable request
 * - authorization must survive critic
 * - plan hash is persisted
 * - execution still does not start here
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  executionAuthorizationRepository,
  persistenceTransactionManager,
} =
  require(
    "../../persistence/repositories"
  );

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_REQUEST_STATE,
  createExecutionRequest,
} =
  require(
    "./executionAuthorizationContracts"
  );

class ExecutionAuthorizationPersistenceService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async persist(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const {
      engineResult,
      criticResult,
    } =
      input;

    return persistenceTransactionManager
      .run(
        async (
          transaction
        ) => {
          const persistedAuthorization =
            await this.persistAuthorization(
              {
                engineResult,
                criticResult,
              },
              transaction
            );

          /*
           * Fail closed.
           *
           * An executable request is created only if BOTH:
           *
           * - authorization engine grants execution
           * - authorization critic accepts execution
           */
          if (
            engineResult
              .authorizationGranted !==
              true ||
            criticResult
              .accepted !==
              true ||
            criticResult
              .authorizationGranted !==
              true
          ) {
            return {
              authorization:
                persistedAuthorization,

              executionRequest:
                null,

              requestCreated:
                false,

              authorizationGranted:
                false,

              executionStarted:
                false,
            };
          }

          const persistedRequest =
            await this.persistExecutionRequest(
              {
                engineResult,

                authorization:
                  persistedAuthorization,
              },
              transaction
            );

          return {
            authorization:
              persistedAuthorization,

            executionRequest:
              persistedRequest,

            requestCreated:
              true,

            authorizationGranted:
              true,

            executionStarted:
              false,
          };
        }
      );
  }

  // ==========================================================================
  // AUTHORIZATION
  // ==========================================================================

  async persistAuthorization(
    {
      engineResult,
      criticResult,
    },
    transaction
  ) {
    const source =
      engineResult
        .authorization;

    const plan =
      engineResult
        .executionPlan ||
      null;

    const document = {
      authorizationId:
        source.authorizationId,

      organizationId:
        source.organizationId,

      environmentId:
        source.environmentId,

      incidentId:
        source.incidentId,

      recoveryDecisionId:
        source.recoveryDecisionId,

      recoveryDecisionRevision:
        source
          .recoveryDecisionRevision,

      selectedCandidateId:
        source
          .selectedCandidateId,

      selectedPlaybookId:
        source
          .selectedPlaybookId,

      decision:
        source.decision,

      status:
        source.status,

      authorizationGranted:
        source
          .authorizationGranted ===
          true &&
        criticResult
          .accepted ===
          true &&
        criticResult
          .authorizationGranted ===
          true,

      approvalState:
        source.approvalState,

      policyState:
        source.policyState,

      freshnessState:
        source.freshnessState,

      killSwitchState:
        source.killSwitchState,

      lockState:
        source.lockState,

      idempotencyState:
        source.idempotencyState,

      validFrom:
        source.validFrom,

      expiresAt:
        source.expiresAt,

      authorizedAt:
        source.authorizedAt,

      reasons:
        source.reasons ||
        [],

      warnings:
        source.warnings ||
        [],

      executionPlan:
        plan,

      planId:
        plan
          ?.planId ||
        source
          ?.metadata
          ?.planId ||
        null,

      planHash:
        plan
          ?.planHash ||
        source
          ?.metadata
          ?.planHash ||
        null,

      idempotencyKey:
        source
          ?.metadata
          ?.idempotencyKey ||
        engineResult
          ?.idempotency
          ?.idempotencyKey ||
        null,

      leaseKey:
        source
          ?.metadata
          ?.leaseKey ||
        engineResult
          ?.lease
          ?.leaseKey ||
        null,

      leaseOwnerId:
        source
          ?.metadata
          ?.leaseOwnerId ||
        engineResult
          ?.lease
          ?.ownerId ||
        null,

      stageTrace:
        engineResult
          .trace ||
        [],

      criticResult,

      metadata: {
        ...(
          source.metadata ||
          {}
        ),

        persistenceVersion:
          "phase13-repository-v1",
      },
    };

    /*
     * If critic rejects an apparently authorized result,
     * persist the final state as BLOCKED.
     */
    if (
      criticResult
        .accepted !==
        true ||
      criticResult
        .authorizationGranted !==
        true
    ) {
      document.authorizationGranted =
        false;

      if (
        document.decision ===
        AUTHORIZATION_DECISION
          .AUTHORIZED
      ) {
        document.decision =
          AUTHORIZATION_DECISION
            .BLOCKED;

        document.status =
          AUTHORIZATION_STATUS
            .BLOCKED;
      }
    }

    return executionAuthorizationRepository
      .createAuthorization(
        document,
        transaction
      );
  }

  // ==========================================================================
  // EXECUTION REQUEST
  // ==========================================================================

  async persistExecutionRequest(
    {
      engineResult,
      authorization,
    },
    transaction
  ) {
    const plan =
      engineResult
        .executionPlan;

    if (
      !plan
    ) {
      throw Object.assign(
        new Error(
          "Authorized execution requires persisted execution plan"
        ),
        {
          code:
            "EXECUTION_PERSISTENCE_PLAN_REQUIRED",
        }
      );
    }

    const executionRequestId =
      this.generateExecutionRequestId({
        authorizationId:
          authorization
            .authorizationId,

        planHash:
          plan.planHash,
      });

    const requestContract =
      createExecutionRequest({
        executionRequestId,

        authorizationId:
          authorization
            .authorizationId,

        organizationId:
          authorization
            .organizationId,

        environmentId:
          authorization
            .environmentId,

        incidentId:
          authorization
            .incidentId,

        recoveryDecisionId:
          authorization
            .recoveryDecisionId,

        recoveryDecisionRevision:
          authorization
            .recoveryDecisionRevision,

        candidateId:
          authorization
            .selectedCandidateId,

        playbookId:
          authorization
            .selectedPlaybookId,

        state:
          EXECUTION_REQUEST_STATE
            .AUTHORIZED,

        idempotencyKey:
          authorization
            .idempotencyKey,

        lockKey:
          authorization
            .leaseKey,

        maxAttempts:
          engineResult
            ?.idempotency
            ?.retryAllowed ===
            true
            ? 3
            : 1,

        metadata: {
          planId:
            plan.planId,

          planHash:
            plan.planHash,

          persistenceVersion:
            "phase13-repository-v1",
        },
      });

    const request = {
      ...requestContract,

      planId:
        plan.planId,

      planHash:
        plan.planHash,

      executionPlan:
        plan,

      leaseOwnerId:
        authorization
          .leaseOwnerId,

      requestedAt:
        new Date(),

      metadata: {
        ...(
          requestContract.metadata ||
          {}
        ),

        authorizationExpiresAt:
          authorization
            .expiresAt,
      },
    };

    return executionAuthorizationRepository
      .createExecutionRequest(
        request,
        transaction
      );
  }

  // ==========================================================================
  // REQUEST ID
  // ==========================================================================

  generateExecutionRequestId({
    authorizationId,
    planHash,
  }) {
    return (
      "execreq_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            authorizationId,
            planHash,
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input
        ?.engineResult
        ?.authorization
    ) {
      throw Object.assign(
        new Error(
          "Execution persistence requires authorization engine result"
        ),
        {
          code:
            "EXECUTION_PERSISTENCE_ENGINE_RESULT_REQUIRED",
        }
      );
    }

    if (
      !input.criticResult
    ) {
      throw Object.assign(
        new Error(
          "Execution persistence requires authorization critic result"
        ),
        {
          code:
            "EXECUTION_PERSISTENCE_CRITIC_REQUIRED",
        }
      );
    }

    const authorization =
      input
        .engineResult
        .authorization;

    if (
      !authorization
        .authorizationId ||
      !authorization
        .organizationId ||
      !authorization
        .environmentId ||
      !authorization
        .incidentId ||
      !authorization
        .recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution persistence authorization scope is incomplete"
        ),
        {
          code:
            "EXECUTION_PERSISTENCE_SCOPE_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  new ExecutionAuthorizationPersistenceService();

module.exports
  .ExecutionAuthorizationPersistenceService =
  ExecutionAuthorizationPersistenceService;