"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


class LearningReliabilityLabAdapter {
  constructor(
    options = {}
  ) {
    this.labService =
      options.labService;
  }


  async validateCandidate(
    input = {}
  ) {
    if (
      input.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        "Learning Lab validation cannot grant execution authority",
        403
      );
    }


    if (
      !this.labService
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_LAB_SERVICE_REQUIRED",
        "Reliability Lab service is required",
        500
      );
    }


    let result;


    if (
      typeof this
        .labService
        .validateLearningCandidate ===
        "function"
    ) {
      result =
        await this
          .labService
          .validateLearningCandidate({
            candidate:
              input.candidate,

            validationRunId:
              input.validationRunId,

            executionAuthorized:
              false,
          });
    } else if (
      typeof this
        .labService
        .runCandidateExperiment ===
        "function"
    ) {
      result =
        await this
          .labService
          .runCandidateExperiment({
            candidate:
              input.candidate,

            validationRunId:
              input.validationRunId,

            executionAuthorized:
              false,
          });
    } else {
      throw humanLearningError(
        "HUMAN_LEARNING_LAB_BOUNDARY_UNSUPPORTED",
        "Reliability Lab service does not expose a supported learning validation boundary",
        500
      );
    }


    if (
      result?.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_LAB_AUTHORITY_LEAK",
        "Reliability Lab attempted to return execution authority",
        500
      );
    }


    return {
      ...result,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningReliabilityLabAdapter,
};