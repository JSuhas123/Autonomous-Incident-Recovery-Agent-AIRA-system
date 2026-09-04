"use strict";


const {
  validateGeneratorResponse,
} =
  require(
    "../../contracts/humanLearningGenerator"
  );


function validResponse(
  overrides = {}
) {
  return {
    schemaVersion:
      "24.3.0",

    generator: {
      name:
        "aira-deterministic-human-learning-generator",

      version:
        "24.3.0",

      mode:
        "DETERMINISTIC_RULE_BASED",
    },

    sourceBundleId:
      "lsrc_001",

    sourceDigest:
      "a".repeat(
        64
      ),

    candidateCount:
      1,

    candidates: [
      {
        candidateType:
          "FAILURE_MODE",

        knowledgeScope:
          "ENVIRONMENT",

        title:
          "Failure-mode candidate",

        summary:
          "Untrusted candidate",

        candidatePayload: {
          diagnosisAssertions: [
            "config error",
          ],
        },

        confidence:
          0.45,

        riskClassification:
          "UNASSESSED",

        truthLevel:
          "CANDIDATE",

        executionAuthorized:
          false,
      },
    ],

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "AIRA Phase 24.3 — Learning Agent contract",
  () => {
    test(
      "accepts a bounded candidate-only response",
      () => {
        expect(
          validateGeneratorResponse(
            validResponse(),

            {
              sourceBundleId:
                "lsrc_001",

              sourceDigest:
                "a".repeat(
                  64
                ),
            }
          ).candidateCount
        ).toBe(
          1
        );
      }
    );


    test(
      "rejects GLOBAL candidate output",
      () => {
        const response =
          validResponse();


        response
          .candidates[0]
          .knowledgeScope =
            "GLOBAL";


        expect(
          () =>
            validateGeneratorResponse(
              response
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_GENERATOR_SCOPE_INVALID",
          })
        );
      }
    );


    test(
      "rejects generator authority",
      () => {
        const response =
          validResponse({
            executionAuthorized:
              true,
          });


        expect(
          () =>
            validateGeneratorResponse(
              response
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_GENERATOR_AUTHORITY_INVALID",
          })
        );
      }
    );


    test(
      "rejects source digest mismatch",
      () => {
        expect(
          () =>
            validateGeneratorResponse(
              validResponse(),

              {
                sourceDigest:
                  "b".repeat(
                    64
                  ),
              }
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_LEARNING_GENERATOR_DIGEST_MISMATCH",
          })
        );
      }
    );
  }
);