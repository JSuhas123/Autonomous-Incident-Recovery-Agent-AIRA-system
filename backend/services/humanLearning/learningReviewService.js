"use strict";


const {
  humanLearningError,
} = require(
  "../../contracts/humanLearning"
);


const {
  REVIEW_DECISION,

  assertReviewCannotAuthorize,

  assertReviewDecision,
} = require(
  "../../contracts/humanLearningReview"
);


class LearningReviewService {
  constructor(
    options = {}
  ) {
    this.reviewRepository =
      options.reviewRepository;

    this.candidateRepository =
      options.candidateRepository;
  }


  assertDependencies()
  {
    if (
      !this.reviewRepository
      ||
      !this.candidateRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REVIEW_DEPENDENCY_REQUIRED",

        (
          "Review repository and candidate repository " +
          "are required"
        ),

        500
      );
    }
  }


  async createTask(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    this.assertDependencies();


    return this.reviewRepository
      .createReviewTask({
        ...input,

        executionAuthorized:
          false,
      });
  }


  async decide(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    assertReviewDecision(
      input.decision
    );


    this.assertDependencies();


    const decision =
      await this.reviewRepository
        .recordDecision({
          ...input,

          executionAuthorized:
            false,
        });


    if (
      input.decision ===
      REVIEW_DECISION.APPROVE
    ) {
      await this.candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "APPROVED",

          reason:
            input.reason,

          actorType:
            "HUMAN_REVIEWER",

          actorId:
            input.reviewerId,

          executionAuthorized:
            false,
        });
    }


    if (
      input.decision ===
      REVIEW_DECISION.REJECT
    ) {
      await this.candidateRepository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          nextState:
            "REJECTED",

          reason:
            input.reason,

          actorType:
            "HUMAN_REVIEWER",

          actorId:
            input.reviewerId,

          executionAuthorized:
            false,
        });
    }


    return {
      ...decision,

      candidateState:
        input.decision ===
          REVIEW_DECISION.APPROVE
          ? "APPROVED"
          : (
              input.decision ===
              REVIEW_DECISION.REJECT
                ? "REJECTED"
                : "HUMAN_REVIEW_PENDING"
            ),

      knowledgePublished:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningReviewService,
};