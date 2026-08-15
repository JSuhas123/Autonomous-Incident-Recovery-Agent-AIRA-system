"use strict";

/**
 * AIRA Verification Persistence Service
 *
 * Phase 9.11
 *
 * Persists:
 *
 * - immutable verification plan
 * - aggregated evidence snapshot
 * - verification decision
 * - verification critic result
 * - recovery routing result
 * - revision history
 *
 * Safety:
 *
 * - persistence never closes incidents
 * - persistence never starts retry / rollback
 * - only critic-confirmed RECOVERED results become closure-eligible
 * - execution authorization never originates here
 */

const mongoose =
  require(
    "mongoose"
  );

const crypto =
  require(
    "node:crypto"
  );

const RecoveryVerification =
  require(
    "../../models/RecoveryVerification"
  );

const RecoveryVerificationRun =
  require(
    "../../models/RecoveryVerificationRun"
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
    this.RecoveryVerification =
      options.RecoveryVerification ||
      RecoveryVerification;

    this.RecoveryVerificationRun =
      options.RecoveryVerificationRun ||
      RecoveryVerificationRun;
  }

  // ==========================================================================
  // MAIN
  // ==========================================================================

  async persist(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const session =
      await mongoose
        .startSession();

    let persistedRun;
    let persistedVerification;

    try {
      await session
        .withTransaction(
          async () => {
            // =================================================================
            // 1. CREATE VERIFICATION RUN
            // =================================================================

            persistedRun =
              await this.createRun(
                input,
                session
              );

            // =================================================================
            // 2. FIND CURRENT VERIFICATION
            // =================================================================

            const current =
              await this.RecoveryVerification
                .findOne({
                  organizationId:
                    input.organizationId,

                  environmentId:
                    input.environmentId,

                  incidentId:
                    input.incidentId,

                  isCurrent:
                    true,
                })
                .session(
                  session
                );

            // =================================================================
            // 3. REVISION
            // =================================================================

            const revision =
              current
                ? Number(
                    current.revision
                  ) +
                  1
                : 1;

            // =================================================================
            // 4. SUPERSEDE CURRENT
            // =================================================================

            if (
              current
            ) {
              current.isCurrent =
                false;

              current.status =
                "superseded";

              await current
                .save({
                  session,
                });
            }

            // =================================================================
            // 5. PERSIST NEW VERIFICATION
            // =================================================================

            persistedVerification =
              await this.createVerification(
                {
                  ...input,

                  revision,

                  previousVerification:
                    current,
                },
                session
              );

            // =================================================================
            // 6. OLD -> NEW LINK
            // =================================================================

            if (
              current
            ) {
              current
                .supersededByVerificationId =
                persistedVerification
                  ._id;

              await current
                .save({
                  session,
                });
            }

            // =================================================================
            // 7. RUN -> RESULT
            // =================================================================

            persistedRun.state =
              VERIFICATION_RUN_STATE
                .COMPLETED;

            persistedRun.completedAt =
              new Date();

            persistedRun
              .resultVerificationDocumentId =
              persistedVerification
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

        verification:
          persistedVerification,

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
    } finally {
      await session
        .endSession();
    }
  }

  // ==========================================================================
  // RUN
  // ==========================================================================

  async createRun(
    input,
    session
  ) {
    const run =
      new this.RecoveryVerificationRun({
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
            "phase9.11-v1",
        },
      });

    await run
      .save({
        session,
      });

    return run;
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  async createVerification(
    input,
    session
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

    const document =
      new this.RecoveryVerification({
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
            "phase9.11-v1",

          sourceVerificationPlanHash:
            verificationPlan
              .planHash,

          sourceEvidencePlanHash:
            evidencePackage
              .verificationPlanHash ||
            null,
        },
      });

    await document
      .save({
        session,
      });

    return document;
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

    return this
      .RecoveryVerificationRun
      .findOneAndUpdate(
        {
          verificationRunId,
        },
        {
          $set: {
            state:
              VERIFICATION_RUN_STATE
                .FAILED,

            completedAt:
              new Date(),

            failure: {
              code:
                error
                  ?.code ||
                "VERIFICATION_RUN_FAILED",

              message:
                String(
                  error
                    ?.message ||
                  "Verification run failed"
                )
                  .slice(
                    0,
                    2048
                  ),
            },
          },
        },
        {
          new:
            true,
        }
      );
  }

  // ==========================================================================
  // IDs
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

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
     if (
    !input ||
    typeof input !==
      "object" ||
    Object.keys(
      input
    ).length ===
      0
  ) {
      throw Object.assign(
        new Error(
          "Verification persistence input is required"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires organization, environment and incident scope"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires executionRequestId"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_EXECUTION_REQUEST_REQUIRED",
        }
      );
    }

    if (
      !input.verificationPlan
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires verification plan"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_PLAN_REQUIRED",
        }
      );
    }

    if (
      !input.verificationPlan
        .verificationPlanId ||
      !input.verificationPlan
        .planHash
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires verification plan identity"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_PLAN_IDENTITY_REQUIRED",
        }
      );
    }

    if (
      !input.evidencePackage
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires evidence package"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_EVIDENCE_REQUIRED",
        }
      );
    }

    if (
      !input.decisionResult
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires verification decision"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.criticResult
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires critic result"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_CRITIC_REQUIRED",
        }
      );
    }

    if (
      !input.routingResult
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence requires routing result"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_ROUTING_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification persistence cannot authorize execution"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_UNSAFE_INPUT",
        }
      );
    }

    /*
     * Prevent mismatched verification-plan persistence.
     */
    if (
      input.evidencePackage
        .verificationPlanHash &&
      String(
        input.evidencePackage
          .verificationPlanHash
      ) !==
      String(
        input.verificationPlan
          .planHash
      )
    ) {
      throw Object.assign(
        new Error(
          "Verification evidence references a different verification plan hash"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_PLAN_HASH_MISMATCH",
        }
      );
    }

    if (
      input.decisionResult
        ?.metadata
        ?.verificationPlanHash &&
      String(
        input.decisionResult
          .metadata
          .verificationPlanHash
      ) !==
      String(
        input.verificationPlan
          .planHash
      )
    ) {
      throw Object.assign(
        new Error(
          "Verification decision references a different verification plan hash"
        ),
        {
          code:
            "VERIFICATION_PERSISTENCE_DECISION_PLAN_MISMATCH",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function clone(
  value
) {
  if (
    value ===
      undefined
  ) {
    return null;
  }

  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch (
    error
  ) {
    throw Object.assign(
      new Error(
        "Verification persistence received non-serializable data"
      ),
      {
        code:
          "VERIFICATION_PERSISTENCE_SERIALIZATION_FAILED",
      }
    );
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new VerificationPersistenceService();

module.exports
  .VerificationPersistenceService =
  VerificationPersistenceService;