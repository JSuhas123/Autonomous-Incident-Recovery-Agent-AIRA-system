"use strict";


const {
  KNOWLEDGE_CANDIDATE_TYPE,

  KNOWLEDGE_SCOPE,

  TRUTH_LEVEL,

  humanLearningError,
} =
  require(
    "./humanLearning"
  );


const HUMAN_LEARNING_GENERATOR_SCHEMA_VERSION =
  "24.3.0";


function isPlainObject(
  value
) {
  return Boolean(
    value
  )
    &&
    typeof value ===
      "object"
    &&
    !Array.isArray(
      value
    );
}


function validateGeneratedCandidate(
  candidate
) {
  if (
    !isPlainObject(
      candidate
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_RESPONSE_INVALID",
      "Generated candidate must be an object"
    );
  }


  if (
    !Object
      .values(
        KNOWLEDGE_CANDIDATE_TYPE
      )
      .includes(
        candidate
          .candidateType
      )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_TYPE_INVALID",
      `Unsupported generated candidate type: ${candidate.candidateType}`
    );
  }


  if (
    ![
      KNOWLEDGE_SCOPE
        .ORGANIZATION,

      KNOWLEDGE_SCOPE
        .ENVIRONMENT,
    ].includes(
      candidate
        .knowledgeScope
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_SCOPE_INVALID",
      "Generated tenant candidate may not be GLOBAL"
    );
  }


  if (
    candidate.truthLevel !==
    TRUTH_LEVEL
      .CANDIDATE
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_TRUTH_INVALID",
      "Generated human learning must remain CANDIDATE"
    );
  }


  if (
    candidate.executionAuthorized !==
    false
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_AUTHORITY_INVALID",
      "Generated candidate must explicitly deny execution authority"
    );
  }


  if (
    typeof candidate.title !==
      "string"
    ||
    !candidate.title.trim()
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_TITLE_INVALID",
      "Generated candidate title is required"
    );
  }


  if (
    !isPlainObject(
      candidate
        .candidatePayload
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_PAYLOAD_INVALID",
      "Generated candidate payload must be an object"
    );
  }


  if (
    typeof candidate.confidence !==
      "number"
    ||
    !Number.isFinite(
      candidate.confidence
    )
    ||
    candidate.confidence <
      0
    ||
    candidate.confidence >
      1
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_CONFIDENCE_INVALID",
      "Generated candidate confidence must be between 0 and 1"
    );
  }


  return candidate;
}


function validateGeneratorResponse(
  response,
  expected = {}
) {
  if (
    !isPlainObject(
      response
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_RESPONSE_INVALID",
      "Learning generator response must be an object"
    );
  }


  if (
    response.schemaVersion !==
    HUMAN_LEARNING_GENERATOR_SCHEMA_VERSION
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_SCHEMA_INVALID",
      `Expected generator schema ${HUMAN_LEARNING_GENERATOR_SCHEMA_VERSION}`
    );
  }


  if (
    response.executionAuthorized !==
    false
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_AUTHORITY_INVALID",
      "Learning generator response must explicitly deny execution authority"
    );
  }


  if (
    expected.sourceBundleId
    &&
    response.sourceBundleId !==
      expected.sourceBundleId
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_SOURCE_MISMATCH",
      "Learning generator returned a different source bundle"
    );
  }


  if (
    expected.sourceDigest
    &&
    response.sourceDigest !==
      expected.sourceDigest
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_DIGEST_MISMATCH",
      "Learning generator returned a different source digest"
    );
  }


  if (
    !Array.isArray(
      response.candidates
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_CANDIDATES_INVALID",
      "Learning generator candidates must be an array"
    );
  }


  if (
    response.candidateCount !==
    response.candidates.length
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERATOR_COUNT_INVALID",
      "Learning generator candidateCount does not match candidates length"
    );
  }


  response
    .candidates
    .forEach(
      validateGeneratedCandidate
    );


  return response;
}


module.exports = {
  HUMAN_LEARNING_GENERATOR_SCHEMA_VERSION,

  validateGeneratedCandidate,

  validateGeneratorResponse,
};