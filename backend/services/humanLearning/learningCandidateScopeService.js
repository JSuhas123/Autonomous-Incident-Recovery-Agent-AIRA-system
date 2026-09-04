"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertGeneralizationCannotAuthorize,

  assertTenantCandidateScope,
} =
  require(
    "../../contracts/humanLearningGeneralization"
  );


class LearningCandidateScopeService {
  assertEligibleForGeneralization(
    candidate = {}
  ) {
    assertGeneralizationCannotAuthorize(
      candidate
    );


    assertTenantCandidateScope(
      candidate.knowledgeScope
    );


    if (
      candidate.truthLevel !==
        "CANDIDATE"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_GENERALIZATION_TRUTH_INVALID",

        (
          "Only CANDIDATE knowledge may enter " +
          "the Phase 24 generalization pipeline"
        ),

        409
      );
    }


    if (
      ![
        "HUMAN_REVIEW_PENDING",
        "APPROVED",
      ].includes(
        candidate.candidateState
      )
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_GENERALIZATION_STATE_INVALID",

        (
          "Candidate must pass automated validation " +
          "before generalization"
        ),

        409
      );
    }


    return true;
  }


  buildGlobalProposal(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
      input
    );


    const sourceCandidate =
      input.sourceCandidate;


    this.assertEligibleForGeneralization(
      sourceCandidate
    );


    return {
      candidateType:
        sourceCandidate
          .candidateType,

      knowledgeScope:
        "GLOBAL",

      truthLevel:
        "CANDIDATE",

      title:
        input.scrubbedTitle,

      summary:
        input.scrubbedSummary,

      candidatePayload:
        input.scrubbedPayload,

      confidence:
        sourceCandidate
          .confidence,

      riskClassification:
        sourceCandidate
          .riskClassification ||
        "UNASSESSED",

      lineage: {
        derivationType:
          "TENANT_TO_GLOBAL_GENERALIZATION",

        sourceCandidateDigest:
          sourceCandidate
            .candidateDigest,

        sourceScope:
          sourceCandidate
            .knowledgeScope,

        rawTenantPayloadIncluded:
          false,
      },

      publicationEligible:
        false,

      requiresIndependentValidation:
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateScopeService,
};