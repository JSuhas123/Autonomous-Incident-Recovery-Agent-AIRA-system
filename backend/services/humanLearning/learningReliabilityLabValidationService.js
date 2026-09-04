"use strict";


const {
  assertValidationCannotAuthorize,

  VALIDATION_STAGE,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


class LearningReliabilityLabValidationService {
  constructor(
    options = {}
  ) {
    this.validationRepository =
      options.validationRepository;


    this.labAdapter =
      options.labAdapter;
  }


  async validate(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    if (
      !this.validationRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_VALIDATION_REPOSITORY_REQUIRED",
        "Validation repository is required",
        500
      );
    }


    if (
      !this.labAdapter ||

      typeof this
        .labAdapter
        .validateCandidate !==
        "function"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_LAB_ADAPTER_REQUIRED",
        "Reliability Lab adapter is required",
        500
      );
    }


    const result =
      await this.labAdapter
        .validateCandidate({
          candidate:
            input.candidate,

          validationRunId:
            input.validationRunId,

          executionAuthorized:
            false,
        });


    /*
     * Recovery alone is not enough.
     *
     * We explicitly require:
     *
     *   recovery
     *   verification
     *   rollback safety
     *   safety
     */
    const recoveryPass =
      result?.recoveryPass ===
      true;


    const verificationPass =
      result?.verificationPass ===
      true;


    const rollbackPass =
      result?.rollbackPass ===
      true;


    const safetyPass =
      result?.safetyPass ===
      true;


    const passed =
      recoveryPass
      &&
      verificationPass
      &&
      rollbackPass
      &&
      safetyPass;


    await this
      .validationRepository
      .addEvidence({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        stageType:
          VALIDATION_STAGE
            .RELIABILITY_LAB,

        evidenceType:
          "RELIABILITY_LAB_RESULT",

        sourceSystem:
          "AIRA_RELIABILITY_LAB",

        sourceReference:
          result?.experimentRunId ||
          result?.labRunId ||
          null,

        evidencePayload:
          result ||
          {},

        executionAuthorized:
          false,
      });


    await this
      .validationRepository
      .setStageResult({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        stageType:
          VALIDATION_STAGE
            .RELIABILITY_LAB,

        passed,

        metrics: {
          recoveryPass,

          verificationPass,

          rollbackPass,

          safetyPass,

          sideEffects:
            result?.sideEffects ||
            [],

          falsePositiveRate:
            result?.falsePositiveRate ??
            null,
        },

        reason:
          passed
            ? "Reliability Lab candidate validation passed"
            : "Reliability Lab candidate validation failed",

        executionAuthorized:
          false,
      });


    return {
      stage:
        VALIDATION_STAGE
          .RELIABILITY_LAB,

      passed,

      recoveryPass,

      verificationPass,

      rollbackPass,

      safetyPass,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningReliabilityLabValidationService,
};