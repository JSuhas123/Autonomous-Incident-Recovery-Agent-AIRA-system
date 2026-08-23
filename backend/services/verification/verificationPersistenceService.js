"use strict";

/**
 * AIRA Verification Persistence Service
 *
 * Phase 9.11
 * Phase 13 — Provider-neutral persistence
 *
 * SAFETY:
 *
 * - validates the complete immutable verification identity BEFORE persistence
 * - never closes incidents
 * - never starts retry
 * - never starts rollback
 * - never authorizes infrastructure execution
 * - only critic-confirmed RECOVERED results become closure eligible
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  recoveryVerificationRepository,
  persistenceTransactionManager,
} =
  require(
    "../../persistence/repositories/recoveryVerificationProvider"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_RUN_STATE,
} =
  require(
    "./verificationContracts"
  );

const {
  RECOVERY_ROUTE,
} =
  require(
    "./recoveryOutcomeRoutingService"
  );


class VerificationPersistenceService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      recoveryVerificationRepository;

    this.transactionManager =
      options.transactionManager ||
      persistenceTransactionManager;
  }


  // ==========================================================================
  // MAIN
  // ==========================================================================

  async persist(
    input = {}
  ) {
    /*
     * CRITICAL:
     *
     * Validation MUST happen before transaction/repository access.
     *
     * Unit tests deliberately supply invalid payloads without a live database.
     * Invalid payloads must fail deterministically here instead of reaching
     * Mongo/PostgreSQL.
     */
    const normalized =
      this.assertInput(
        input
      );

    return this
      .transactionManager
      .run(
        async (
          transaction
        ) => {
          let persistedRun =
            await this.createRun(
              normalized,
              transaction
            );

          const current =
            await this.repository
              .findCurrent(
                {
                  organizationId:
                    normalized.organizationId,

                  environmentId:
                    normalized.environmentId,

                  incidentId:
                    normalized.incidentId,
                },
                transaction
              );

          const revision =
            current
              ? Number(
                  current.revision
                ) +
                1
              : 1;

          if (
            current
          ) {
            current.isCurrent =
              false;

            current.status =
              "superseded";

            await this.repository
              .saveVerification(
                current,
                transaction
              );
          }

          const persistedVerification =
            await this.createVerification(
              {
                ...normalized,

                revision,

                previousVerification:
                  current,
              },
              transaction
            );

          if (
            current
          ) {
            current.supersededByVerificationId =
              persistedVerification._id;

            await this.repository
              .saveVerification(
                current,
                transaction
              );
          }

          persistedRun.state =
            VERIFICATION_RUN_STATE
              .COMPLETED;

          persistedRun.completedAt =
            new Date();

          persistedRun.resultVerificationDocumentId =
            persistedVerification._id;

          persistedRun =
            (
              await this.repository
                .saveRun(
                  persistedRun,
                  transaction
                )
            ) ||
            persistedRun;

          return {
            run:
              persistedRun,

            verification:
              persistedVerification,

            verificationId:
              persistedVerification
                .verificationId,

            revision:
              persistedVerification
                .revision,

            isCurrent:
              persistedVerification
                .isCurrent,

            recoveryConfirmed:
              persistedVerification
                .recoveryConfirmed,

            incidentClosureEligible:
              persistedVerification
                .incidentClosureEligible,

            incidentClosed:
              false,

            retryStarted:
              false,

            rollbackStarted:
              false,

            executionAuthorized:
              false,
          };
        }
      );
  }


  // ==========================================================================
  // RUN
  // ==========================================================================

  async createRun(
    input,
    transaction
  ) {
    return this.repository
      .createRun(
        {
          verificationRunId:
            input.verificationRunId ||
            this.generateRunId(
              input
            ),

          verificationId:
            input
              .decisionResult
              .verificationId,

          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          executionRequestId:
            input.executionRequestId,

          state:
            VERIFICATION_RUN_STATE
              .RUNNING,

          attempt:
            Number(
              input.attempt ||
              1
            ),

          maxAttempts:
            Math.max(
              1,
              Number(
                input.maxAttempts ||
                1
              )
            ),

          verificationPlanId:
            input
              .verificationPlan
              .verificationPlanId,

          verificationPlanHash:
            input
              .verificationPlan
              .planHash,

          requestedAt:
            input.requestedAt ||
            new Date(),

          startedAt:
            input.startedAt ||
            new Date(),

          metadata: {
            persistenceVersion:
              "phase13-provider-neutral-v1",
          },
        },
        transaction
      );
  }


  // ==========================================================================
  // CREATE VERIFICATION
  // ==========================================================================

  async createVerification(
    input,
    transaction
  ) {
    const {
      decisionResult,
      criticResult,
      routingResult,
      verificationPlan,
      evidencePackage,
      previousVerification,
    } =
      input;

    const recoveryConfirmed =
      decisionResult.decision ===
        VERIFICATION_DECISION
          .RECOVERED &&
      criticResult.accepted ===
        true &&
      criticResult.recoveryConfirmed ===
        true;

    const incidentClosureEligible =
      recoveryConfirmed ===
        true &&
      routingResult.route ===
        RECOVERY_ROUTE
          .CLOSE_INCIDENT &&
      routingResult.ready ===
        true;

    return this.repository
      .createVerification(
        {
          verificationId:
            decisionResult
              .verificationId,

          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          executionRequestId:
            input.executionRequestId,

          authorizationId:
            input.authorizationId ||
            decisionResult
              .authorizationId ||
            null,

          recoveryDecisionId:
            input.recoveryDecisionId ||
            decisionResult
              .recoveryDecisionId ||
            null,

          executionPlanId:
            decisionResult
              .planId ||
            null,

          executionPlanHash:
            decisionResult
              .planHash ||
            null,

          verificationPlanId:
            verificationPlan
              .verificationPlanId,

          verificationPlanHash:
            verificationPlan
              .planHash,

          revision:
            input.revision,

          isCurrent:
            true,

          status:
            "current",

          decision:
            decisionResult
              .decision,

          confidence:
            decisionResult
              .confidence,

          nextAction:
            decisionResult
              .nextAction,

          recovered:
            decisionResult
              .recovered ===
            true,

          recoveryConfirmed,

          incidentClosureEligible,

          overallScore:
            decisionResult
              .overallScore,

          verificationPlan:
            clone(
              verificationPlan
            ),

          evidencePackage:
            clone(
              evidencePackage
            ),

          decisionResult:
            clone(
              decisionResult
            ),

          criticResult:
            clone(
              criticResult
            ),

          routingResult:
            clone(
              routingResult
            ),

          previousVerificationId:
            previousVerification
              ?._id ||
            null,

          verifiedAt:
            decisionResult
              .completedAt ||
            new Date(),

          metadata: {
            persistenceVersion:
              "phase13-provider-neutral-v1",

            sourceVerificationPlanHash:
              verificationPlan
                .planHash,

            sourceEvidencePlanHash:
              evidencePackage
                .verificationPlanHash ||
              null,
          },
        },
        transaction
      );
  }


  // ==========================================================================
  // RUN FAILURE
  // ==========================================================================

  async markRunFailed(
    verificationRunId,
    error
  ) {
    if (
      !verificationRunId
    ) {
      throw Object.assign(
        new Error(
          "verificationRunId is required"
        ),
        {
          code:
            "VERIFICATION_RUN_ID_REQUIRED",
        }
      );
    }

    return this.repository
      .markRunFailed(
        verificationRunId,
        error
      );
  }


  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  assertInput(
    input = {}
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw this.error(
        "Verification persistence input is required",
        "VERIFICATION_PERSISTENCE_INPUT_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // SAFETY FIRST
    // ------------------------------------------------------------------------

    if (
      input.executionAuthorized ===
      true
    ) {
      throw this.error(
        "Verification persistence cannot receive execution authorization",
        "VERIFICATION_PERSISTENCE_UNSAFE_INPUT"
      );
    }

    // ------------------------------------------------------------------------
    // OWNERSHIP
    // ------------------------------------------------------------------------

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
      ]
    ) {
      if (
        !input[field]
      ) {
        throw Object.assign(
          this.error(
            `Verification persistence requires ${field}`,
            "VERIFICATION_PERSISTENCE_INPUT_REQUIRED"
          ),
          {
            field,
          }
        );
      }
    }

    // ------------------------------------------------------------------------
    // EXECUTION REQUEST
    // ------------------------------------------------------------------------

    if (
      !input.executionRequestId
    ) {
      throw this.error(
        "Verification persistence requires executionRequestId",
        "VERIFICATION_PERSISTENCE_EXECUTION_REQUEST_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // VERIFICATION PLAN
    // ------------------------------------------------------------------------

    if (
      !input.verificationPlan ||
      typeof input.verificationPlan !==
        "object"
    ) {
      throw this.error(
        "Verification persistence requires verificationPlan",
        "VERIFICATION_PERSISTENCE_PLAN_REQUIRED"
      );
    }

    if (
      !input
        .verificationPlan
        .verificationPlanId
    ) {
      throw this.error(
        "Verification plan identifier is required",
        "VERIFICATION_PLAN_ID_REQUIRED"
      );
    }

    if (
      !input
        .verificationPlan
        .planHash
    ) {
      throw this.error(
        "Verification plan hash is required",
        "VERIFICATION_PLAN_HASH_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // EVIDENCE
    // ------------------------------------------------------------------------

    if (
      !input.evidencePackage ||
      typeof input.evidencePackage !==
        "object"
    ) {
      throw this.error(
        "Verification persistence requires evidencePackage",
        "VERIFICATION_PERSISTENCE_EVIDENCE_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // DECISION
    //
    // Phase-9 code uses decisionResult.
    // Some worker paths historically used decision.
    // Normalize both at the persistence boundary.
    // ------------------------------------------------------------------------

    const decisionResult =
      input.decisionResult ||
      input.decision ||
      null;

    if (
      !decisionResult ||
      typeof decisionResult !==
        "object"
    ) {
      throw this.error(
        "Verification persistence requires decision result",
        "VERIFICATION_PERSISTENCE_DECISION_REQUIRED"
      );
    }

    if (
      !decisionResult
        .verificationId
    ) {
      throw this.error(
        "Verification decision identifier is required",
        "VERIFICATION_DECISION_ID_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // CRITIC
    // ------------------------------------------------------------------------

    if (
      !input.criticResult ||
      typeof input.criticResult !==
        "object"
    ) {
      throw this.error(
        "Verification persistence requires criticResult",
        "VERIFICATION_PERSISTENCE_CRITIC_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // ROUTING
    // ------------------------------------------------------------------------

    if (
      !input.routingResult ||
      typeof input.routingResult !==
        "object"
    ) {
      throw this.error(
        "Verification persistence requires routingResult",
        "VERIFICATION_PERSISTENCE_ROUTING_REQUIRED"
      );
    }

    // ------------------------------------------------------------------------
    // IMMUTABLE PLAN CONSISTENCY — EVIDENCE
    // ------------------------------------------------------------------------

    const planHash =
      String(
        input
          .verificationPlan
          .planHash
      );

    const evidencePlanHash =
      input
        .evidencePackage
        .verificationPlanHash ||
      input
        .evidencePackage
        .planHash ||
      null;

    if (
      evidencePlanHash &&
      String(
        evidencePlanHash
      ) !==
        planHash
    ) {
      throw this.error(
        "Evidence package verification plan hash does not match persisted verification plan",
        "VERIFICATION_PERSISTENCE_PLAN_HASH_MISMATCH"
      );
    }

    // ------------------------------------------------------------------------
    // IMMUTABLE PLAN CONSISTENCY — DECISION
    // ------------------------------------------------------------------------

   const decisionPlanHash =
  decisionResult
    .verificationPlanHash ||
  decisionResult
    .metadata
    ?.verificationPlanHash ||
  null;

if (
  decisionPlanHash &&
  String(
    decisionPlanHash
  ) !==
    planHash
) {
  throw this.error(
    "Verification decision plan hash does not match persisted verification plan",
    "VERIFICATION_PERSISTENCE_DECISION_PLAN_MISMATCH"
  );
}

    // ------------------------------------------------------------------------
    // OPTIONAL CRITIC PLAN CONSISTENCY
    // ------------------------------------------------------------------------

    const criticPlanHash =
      input
        .criticResult
        .verificationPlanHash ||
      null;

    if (
      criticPlanHash &&
      String(
        criticPlanHash
      ) !==
        planHash
    ) {
      throw this.error(
        "Verification critic plan hash does not match persisted verification plan",
        "VERIFICATION_PERSISTENCE_CRITIC_PLAN_MISMATCH"
      );
    }

    // ------------------------------------------------------------------------
    // OPTIONAL ROUTING PLAN CONSISTENCY
    // ------------------------------------------------------------------------

    const routingPlanHash =
      input
        .routingResult
        .verificationPlanHash ||
      null;

    if (
      routingPlanHash &&
      String(
        routingPlanHash
      ) !==
        planHash
    ) {
      throw this.error(
        "Verification routing plan hash does not match persisted verification plan",
        "VERIFICATION_PERSISTENCE_ROUTING_PLAN_MISMATCH"
      );
    }

    return {
      ...input,

      decisionResult,

      /*
       * Hard safety invariant.
       */
      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // IDS
  // ==========================================================================

  generateRunId(
    input
  ) {
    return (
      "verifyrun_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.executionRequestId,
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


  error(
    message,
    code
  ) {
    return Object.assign(
      new Error(
        message
      ),
      {
        code,
      }
    );
  }
}


function clone(
  value
) {
  if (
    value ===
      undefined
  ) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


module.exports =
  new VerificationPersistenceService();

module.exports
  .VerificationPersistenceService =
  VerificationPersistenceService;