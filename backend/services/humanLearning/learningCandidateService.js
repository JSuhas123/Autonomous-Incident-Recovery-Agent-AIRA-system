"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.2
 * LEARNING CANDIDATE SERVICE
 * ============================================================================
 *
 * Human intervention never directly becomes knowledge.
 *
 * Human intervention
 *      ↓
 * frozen source
 *      ↓
 * candidate
 *      ↓
 * QUARANTINED
 *
 * Batch 1 terminates here.
 *
 * ============================================================================
 */


const crypto =
  require(
    "node:crypto"
  );


const {
  TRUTH_LEVEL,

  KNOWLEDGE_CANDIDATE_STATE,

  KNOWLEDGE_SCOPE,

  assertNoExecutionAuthority,

  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  PostgresLearningCandidateRepository,
} =
  require(
    "../../persistence/postgres/PostgresLearningCandidateRepository"
  );


const {
  canonicalize,
} =
  require(
    "./humanLearningSourceBundleService"
  );


function candidateDigest(
  input
) {
  const material =
    canonicalize({
      sourceDigest:
        input.sourceDigest,

      candidateType:
        input.candidateType,

      knowledgeScope:
        input.knowledgeScope ||
        KNOWLEDGE_SCOPE
          .ENVIRONMENT,

      title:
        input.title,

      summary:
        input.summary ||
        null,

      candidatePayload:
        input.candidatePayload ||
        {},

      generatedBy:
        input.generatedBy,

      generatorVersion:
        input.generatorVersion,
    });


  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        material
      )
    )
    .digest(
      "hex"
    );
}


class LearningCandidateService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresLearningCandidateRepository(
        options
      );
  }


  async createQuarantinedCandidate(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    /*
     * Human-derived content may not declare itself
     * validated knowledge.
     */
    if (
      input.truthLevel &&
      input.truthLevel !==
        TRUTH_LEVEL
          .CANDIDATE
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_TRUTH_FORBIDDEN",
        "Human-derived learning may only be created as CANDIDATE"
      );
    }


    /*
     * Phase 24.5 will implement explicit, sanitized,
     * independently validated global promotion.
     *
     * Batch 1 forbids it completely.
     */
    if (
      input.knowledgeScope ===
      KNOWLEDGE_SCOPE
        .GLOBAL
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_GLOBAL_BIRTH_FORBIDDEN",
        "Human-derived tenant candidates cannot be created directly as GLOBAL"
      );
    }


    const digest =
      input.candidateDigest ||
      candidateDigest(
        input
      );


    const generated =
      await this.repository
        .createCandidate({
          ...input,

          candidateDigest:
            digest,

          truthLevel:
            TRUTH_LEVEL
              .CANDIDATE,

          executionAuthorized:
            false,
        });


    if (
      !generated ||
      generated.truthLevel !==
        TRUTH_LEVEL
          .CANDIDATE ||
      generated.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_SAFETY_INVARIANT_FAILED",
        "Persisted candidate violated the candidate safety boundary",
        500
      );
    }


    /*
     * Idempotent duplicate generation may discover an
     * already-quarantined candidate.
     */
    if (
      generated.candidateState ===
      KNOWLEDGE_CANDIDATE_STATE
        .QUARANTINED
    ) {
      return generated;
    }


    if (
      generated.candidateState !==
      KNOWLEDGE_CANDIDATE_STATE
        .GENERATED
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_INITIAL_STATE_INVALID",
        `Expected GENERATED candidate but received ${generated.candidateState}`,
        500
      );
    }


    /*
     * All human-derived knowledge is quarantined before
     * any validation activity.
     */
    const quarantined =
      await this.repository
        .transitionCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            generated.publicId ||
            generated.id,

          toState:
            KNOWLEDGE_CANDIDATE_STATE
              .QUARANTINED,

          actorType:
            "SYSTEM",

          reason:
            "All human-derived knowledge is quarantined before validation",

          metadata: {
            phase:
              "24.2",

            sourceDigest:
              input.sourceDigest,
          },

          executionAuthorized:
            false,
        });


    if (
      !quarantined ||
      quarantined.candidateState !==
        KNOWLEDGE_CANDIDATE_STATE
          .QUARANTINED ||
      quarantined.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_QUARANTINE_INVARIANT_FAILED",
        "Knowledge candidate failed to enter safe quarantine",
        500
      );
    }


    return quarantined;
  }
}


module.exports = {
  LearningCandidateService,

  candidateDigest,
};