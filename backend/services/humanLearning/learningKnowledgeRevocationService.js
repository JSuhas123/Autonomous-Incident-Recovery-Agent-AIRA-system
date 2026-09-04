"use strict";


const {
  humanLearningError,
} = require(
  "../../contracts/humanLearning"
);


const {
  assertReviewCannotAuthorize,
} = require(
  "../../contracts/humanLearningReview"
);


class LearningKnowledgeRevocationService {
  constructor(
    options = {}
  ) {
    this.publicationRepository =
      options.publicationRepository;

    this.candidateRepository =
      options.candidateRepository;
  }


  async deprecate(
    input = {}
  ) {
    return this.#apply({
      ...input,

      action:
        "DEPRECATE",

      status:
        "DEPRECATED",
    });
  }


  async revoke(
    input = {}
  ) {
    return this.#apply({
      ...input,

      action:
        "REVOKE",

      status:
        "REVOKED",
    });
  }


  async #apply(
    input
  ) {
    assertReviewCannotAuthorize(
      input
    );


    if (
      !input.reason
      ||
      !String(
        input.reason
      ).trim()
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REVOCATION_REASON_REQUIRED",

        "Revocation/deprecation requires a reason"
      );
    }


    const publication =
      await this.publicationRepository
        .updatePublicationStatus({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          publicationId:
            input.publicationId,

          status:
            input.status,

          executionAuthorized:
            false,
        });


    const record =
      await this.publicationRepository
        .recordRevocation({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          publicationId:
            input.publicationId,

          action:
            input.action,

          reason:
            input.reason,

          actorId:
            input.actorId,

          actorType:
            input.actorType ||
            "HUMAN",

          metadata:
            input.metadata ||
            {},

          executionAuthorized:
            false,
        });


    if (
      input.action ===
        "REVOKE"
      &&
      input.candidateId
      &&
      this.candidateRepository
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
            "REVOKED",

          reason:
            input.reason,

          actorType:
            input.actorType ||
            "HUMAN",

          actorId:
            input.actorId,

          executionAuthorized:
            false,
        });
    }


    return {
      publication,

      revocation:
        record,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningKnowledgeRevocationService,
};