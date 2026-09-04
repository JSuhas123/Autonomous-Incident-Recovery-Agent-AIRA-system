"use strict";


const {
  humanLearningError,

  assertCandidateTransition,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertValidationDecisionSafe,
} =
  require(
    "../../contracts/humanLearningValidationDecision"
  );


class LearningCandidateStateMachine {
  constructor(
    options = {}
  ) {
    this.candidateRepository =
      options.candidateRepository;
  }


  assertReady()
  {
    if (
      !this.candidateRepository
      ||
      typeof this
        .candidateRepository
        .transitionCandidate !==
        "function"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_REPOSITORY_REQUIRED",

        "Candidate repository is required",

        500
      );
    }
  }


  async beginValidation(
    input = {}
  ) {
    assertValidationDecisionSafe(
      input
    );


    this.assertReady();


    assertCandidateTransition(
      "QUARANTINED",

      "VALIDATION_PENDING"
    );


    const pending =
      await this
        .candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "VALIDATION_PENDING",

          reason:
            input.reason ||
            "Learning validation requested",

          actorType:
            "SYSTEM",

          actorId:
            "phase24-validation-pipeline",

          executionAuthorized:
            false,
        });


    assertCandidateTransition(
      "VALIDATION_PENDING",

      "VALIDATING"
    );


    const validating =
      await this
        .candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "VALIDATING",

          reason:
            "Learning validation gates started",

          actorType:
            "SYSTEM",

          actorId:
            "phase24-validation-pipeline",

          executionAuthorized:
            false,
        });


    return {
      pending,

      validating,

      state:
        "VALIDATING",

      executionAuthorized:
        false,
    };
  }


  async failValidation(
    input = {}
  ) {
    assertValidationDecisionSafe(
      input
    );


    this.assertReady();


    assertCandidateTransition(
      "VALIDATING",

      "VALIDATION_FAILED"
    );


    const candidate =
      await this
        .candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "VALIDATION_FAILED",

          reason:
            input.reason ||
            "Learning validation failed",

          actorType:
            "SYSTEM",

          actorId:
            "phase24-validation-pipeline",

          executionAuthorized:
            false,
        });


    return {
      candidate,

      state:
        "VALIDATION_FAILED",

      executionAuthorized:
        false,
    };
  }


  async requestHumanReview(
    input = {}
  ) {
    assertValidationDecisionSafe(
      input
    );


    this.assertReady();


    assertCandidateTransition(
      "VALIDATING",

      "HUMAN_REVIEW_PENDING"
    );


    const candidate =
      await this
        .candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "HUMAN_REVIEW_PENDING",

          reason:
            (
              input.reason ||
              "Automated validation passed; human review required"
            ),

          actorType:
            "SYSTEM",

          actorId:
            "phase24-validation-pipeline",

          executionAuthorized:
            false,
        });


    return {
      candidate,

      state:
        "HUMAN_REVIEW_PENDING",

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateStateMachine,
};