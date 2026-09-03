"use strict";

const {
  RealityEnvironmentReplayBindingService,
  ENVIRONMENT_REPLAY_RUN_STAGE,
} = require(
  "./realityEnvironmentReplayBindingService"
);

const {
  RealityEnvironmentReplayLiveOrchestrator,
} = require(
  "./realityEnvironmentReplayLiveOrchestrator"
);

const {
  RecoveryVerificationCorrectnessEvaluator,
} = require(
  "../reliability/recoveryVerificationCorrectnessEvaluator"
);

const REALITY_RECOVERY_VERIFICATION_RESET_VERSION =
  "23R.10F.0";


function bridgeError(
  code,
  message,
  status = 422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "RealityRecoveryVerificationResetBridgeError",

      code,

      status,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_VERIFICATION_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
}


function requireObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_VERIFICATION_OBJECT_REQUIRED",
      `${field} must be an object`
    );
  }

  return value;
}


function assertNonAuthorizing(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return true;
  }

  if (
    value.executionAuthorized ===
      true ||
    value.productionAuthorized ===
      true ||
    value.productionCertified ===
      true
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_VERIFICATION_AUTHORITY_VIOLATION",
      (
        `${field} attempted to grant ` +
        "authority or production proof"
      ),
      500
    );
  }

  return true;
}


function validateInput(
  input
) {
  requireObject(
    input,
    "input"
  );

  requireString(
    input.organizationId,
    "organizationId"
  );

  requireString(
    input.environmentId,
    "environmentId"
  );

  requireString(
    input.labEnvironmentId,
    "labEnvironmentId"
  );

  requireString(
    input.environmentReplayRunId,
    "environmentReplayRunId"
  );

  requireString(
    input.experimentRunId,
    "experimentRunId"
  );

  requireString(
    input.incidentId,
    "incidentId"
  );

  if (
    input.executionAuthorized ===
      true ||
    input.productionAuthorized ===
      true ||
    input.production ===
      true
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_VERIFICATION_AUTHORITY_FORBIDDEN",
      (
        "Phase 23R.10F cannot grant " +
        "production or execution authority"
      )
    );
  }

  if (
    input.groundTruth !==
      undefined ||
    input.evaluatorGroundTruth !==
      undefined ||
    input.sealedEvaluation !==
      undefined
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_VERIFICATION_GROUND_TRUTH_FORBIDDEN",
      (
        "Evaluator ground truth must remain outside " +
        "the recovery execution path"
      )
    );
  }

  if (
    !input.recoveryExecutor ||
    typeof input.recoveryExecutor.execute !==
      "function"
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_EXECUTOR_REQUIRED",
      (
        "A canonical recovery executor " +
        "is required"
      )
    );
  }

  if (
    !input.resetter ||
    typeof input.resetter.reset !==
      "function"
  ) {
    throw bridgeError(
      "REALITY_RECOVERY_RESETTER_REQUIRED",
      (
        "A canonical Reliability Lab " +
        "resetter is required"
      )
    );
  }
}


class RealityRecoveryVerificationResetBridge {
  constructor(
    options = {}
  ) {
    this.bindingService =
      options.bindingService ||
      new RealityEnvironmentReplayBindingService(
        options
      );

    this.liveOrchestrator =
      options.liveOrchestrator ||
      new RealityEnvironmentReplayLiveOrchestrator(
        options
      );

    this.verificationEvaluator =
      options.verificationEvaluator ||
      new RecoveryVerificationCorrectnessEvaluator();
  }


  async run(
    input = {}
  ) {
    validateInput(
      input
    );

    const scope = {
      organizationId:
        requireString(
          input.organizationId,
          "organizationId"
        ),

      environmentId:
        requireString(
          input.environmentId,
          "environmentId"
        ),

      environmentReplayRunId:
        requireString(
          input.environmentReplayRunId,
          "environmentReplayRunId"
        ),
    };

    let lifecycleStarted =
      false;

    try {
      await this
        .bindingService
        .transitionStage({
          ...scope,

          stage:
            ENVIRONMENT_REPLAY_RUN_STAGE
              .RECOVERING,
        });

      lifecycleStarted =
        true;

      /*
       * ================================================================
       * CANONICAL RECOVERY EXECUTION
       * ================================================================
       *
       * 23R does not execute infrastructure directly.
       *
       * The injected executor must point at the existing AIRA authorized
       * execution boundary.
       */
      const recoveryResult =
        await input
          .recoveryExecutor
          .execute({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            tenantId:
              input.tenantId ||
              input.organizationId,

            labEnvironmentId:
              input.labEnvironmentId,

            experimentRunId:
              input.experimentRunId,

            incidentId:
              input.incidentId,

            diagnosis:
              input.diagnosis ||
              null,

            recoveryDecision:
              input.recoveryDecision ||
              null,

            authorizationReference:
              input.authorizationReference ||
              null,

            target:
              input.target ||
              null,

            /*
             * 23R does not manufacture authority.
             */
            executionAuthorized:
              false,

            production:
              false,
          });

      requireObject(
        recoveryResult,
        "recoveryResult"
      );

      assertNonAuthorizing(
        recoveryResult,
        "recoveryResult"
      );

      if (
        recoveryResult.executed !==
          true
      ) {
        throw bridgeError(
          "REALITY_RECOVERY_EXECUTION_NOT_OBSERVED",
          (
            "Canonical recovery executor did not " +
            "report an executed recovery"
          ),
          500
        );
      }

      /*
       * ================================================================
       * INDEPENDENT VERIFICATION
       * ================================================================
       */
      await this
        .bindingService
        .transitionStage({
          ...scope,

          stage:
            ENVIRONMENT_REPLAY_RUN_STAGE
              .VERIFYING,
        });

      const after =
        input.afterObservationProvider
          ? await input
              .afterObservationProvider({
                organizationId:
                  input.organizationId,

                environmentId:
                  input.environmentId,

                labEnvironmentId:
                  input.labEnvironmentId,

                experimentRunId:
                  input.experimentRunId,

                incidentId:
                  input.incidentId,

                executionAuthorized:
                  false,
              })
          : input.afterObservation;

      requireObject(
        after,
        "afterObservation"
      );

      assertNonAuthorizing(
        after,
        "afterObservation"
      );

      const verification =
        this.verificationEvaluator
          .evaluate({
            execution: {
              executed:
                true,

              commandSucceeded:
                recoveryResult.success ===
                true,
            },

            before:
              input.beforeObservation ||
              {},

            after,

            stability:
              input.stability ||
              {},

            recurrence:
              input.recurrence ||
              {},

            rollback:
              input.rollback ||
              {},

            executionAuthorized:
              false,
          });

      assertNonAuthorizing(
        verification,
        "verification"
      );

      if (
        verification.outcome !==
          "VERIFIED_RECOVERY"
      ) {
        throw bridgeError(
          "REALITY_RECOVERY_VERIFICATION_FAILED",
          (
            "Recovery verification outcome was " +
            String(
              verification.outcome
            )
          ),
          409
        );
      }

      /*
       * ================================================================
       * CANONICAL PHASE-21 RESET
       * ================================================================
       */
      await this
        .bindingService
        .transitionStage({
          ...scope,

          stage:
            ENVIRONMENT_REPLAY_RUN_STAGE
              .RESETTING,
        });

      const resetResult =
        await this
          .liveOrchestrator
          .reset({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            labEnvironmentId:
              input.labEnvironmentId,

            experimentRunId:
              input.experimentRunId,

            resetter:
              input.resetter,

            baselineProvider:
              input.baselineProvider,
          });

      requireObject(
        resetResult,
        "resetResult"
      );

      assertNonAuthorizing(
        resetResult,
        "resetResult"
      );

      if (
        resetResult.resetSucceeded !==
          true ||
        resetResult.baselineRestored !==
          true
      ) {
        throw bridgeError(
          "REALITY_RECOVERY_RESET_INCOMPLETE",
          (
            "Reliability Lab reset did not " +
            "restore the baseline"
          ),
          500
        );
      }

      const binding =
        await this
          .bindingService
          .transitionStage({
            ...scope,

            stage:
              ENVIRONMENT_REPLAY_RUN_STAGE
                .COMPLETED,
          });

      return {
        bridgeVersion:
          REALITY_RECOVERY_VERIFICATION_RESET_VERSION,

        environmentReplayRunId:
          input.environmentReplayRunId,

        experimentRunId:
          input.experimentRunId,

        incidentId:
          input.incidentId,

        stage:
          binding.stage,

        recovery:
          recoveryResult,

        verification,

        reset:
          resetResult,

        baselineRestored:
          true,

        groundTruthAgentVisible:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      if (
        lifecycleStarted
      ) {
        try {
          await this
            .bindingService
            .transitionStage({
              ...scope,

              stage:
                ENVIRONMENT_REPLAY_RUN_STAGE
                  .FAILED,

              failureCode:
                error?.code ||
                "REALITY_RECOVERY_VERIFICATION_RESET_FAILED",

              failureMessage:
                error?.message ||
                (
                  "Recovery/verification/reset " +
                  "failed"
                ),
            });
        } catch (
          transitionError
        ) {
          error
            .environmentReplayFailureTransition =
            {
              code:
                transitionError?.code ||
                null,

              message:
                transitionError?.message ||
                String(
                  transitionError
                ),
            };
        }
      }

      throw error;
    }
  }
}


module.exports = {
  REALITY_RECOVERY_VERIFICATION_RESET_VERSION,

  RealityRecoveryVerificationResetBridge,

  validateInput,

  assertNonAuthorizing,
};