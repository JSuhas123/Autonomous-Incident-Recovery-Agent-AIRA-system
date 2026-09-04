"use strict";


const {
  assertNoExecutionAuthority,

  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  validateGeneratorResponse,
} =
  require(
    "../../contracts/humanLearningGenerator"
  );


const {
  PostgresLearningSourceRepository,
} =
  require(
    "../../persistence/postgres/PostgresLearningSourceRepository"
  );


const {
  LearningCandidateService,
} =
  require(
    "./learningCandidateService"
  );


const {
  PythonHumanLearningGenerator,
} =
  require(
    "./PythonHumanLearningGenerator"
  );


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string"
    ||
    !value.trim()
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_FIELD_REQUIRED",
      `${field} is required`
    );
  }


  return value.trim();
}


class HumanLearningAgentService {
  constructor(
    options = {}
  ) {
    this.sourceRepository =
      options.sourceRepository ||

      new PostgresLearningSourceRepository(
        options
      );


    this.generator =
      options.generator ||

      new PythonHumanLearningGenerator(
        options
      );


    this.candidateService =
      options.candidateService ||

      new LearningCandidateService(
        options
      );
  }


  async generateFromSourceBundle(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sourceBundleId =
      requireString(
        input.sourceBundleId,
        "sourceBundleId"
      );


    const sourceBundle =
      await this.sourceRepository
        .getSourceBundle({
          organizationId,

          environmentId,

          sourceBundleId,

          executionAuthorized:
            false,
        });


    if (
      !sourceBundle
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_BUNDLE_NOT_FOUND",
        "Frozen learning source bundle not found",
        404
      );
    }


    if (
      sourceBundle.executionAuthorized !==
      false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_SAFETY_INVARIANT_FAILED",
        "Frozen learning source violated the no-authority invariant",
        500
      );
    }


    const generated =
      validateGeneratorResponse(
        await this.generator
          .generate(
            sourceBundle
          ),

        {
          sourceBundleId:
            sourceBundle.publicId ||
            sourceBundle.id,

          sourceDigest:
            sourceBundle.sourceDigest,
        }
      );


    const persisted =
      [];


    for (
      const proposal
      of generated.candidates
    ) {
      const candidate =
        await this.candidateService
          .createQuarantinedCandidate({
            organizationId,

            environmentId,

            sourceBundleId:
              sourceBundle.publicId ||
              sourceBundle.id,

            sourceDigest:
              sourceBundle.sourceDigest,

            candidateType:
              proposal.candidateType,

            knowledgeScope:
              proposal.knowledgeScope,

            title:
              proposal.title,

            summary:
              proposal.summary,

            candidatePayload:
              proposal.candidatePayload,

            confidence:
              proposal.confidence,

            riskClassification:
              proposal.riskClassification,

            generatedBy:
              generated.generator.name,

            generatorVersion:
              generated.generator.version,

            lineagePayload: {
              generatorMode:
                generated
                  .generator
                  .mode,

              sourceBundleId:
                sourceBundle.publicId ||
                sourceBundle.id,

              sourceDigest:
                sourceBundle.sourceDigest,
            },

            metadata: {
              phase:
                "24.3",

              generatorMode:
                generated
                  .generator
                  .mode,
            },

            executionAuthorized:
              false,
          });


      persisted.push(
        candidate
      );
    }


    return {
      sourceBundleId:
        sourceBundle.publicId ||
        sourceBundle.id,

      sourceDigest:
        sourceBundle.sourceDigest,

      generator:
        generated.generator,

      proposedCount:
        generated.candidateCount,

      persistedCount:
        persisted.length,

      candidates:
        persisted,

      zeroCandidateLearning:
        generated.candidateCount ===
        0,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  HumanLearningAgentService,
};