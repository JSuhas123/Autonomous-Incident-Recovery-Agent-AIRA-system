"use strict";


const {
  candidateDigest,
} =
  require(
    "../../services/humanLearning/learningCandidateService"
  );


describe(
  "AIRA Phase 24.3 — deterministic candidate deduplication",
  () => {
    test(
      "same source and semantic structure produce same canonical digest",
      () => {
        const base = {
          sourceDigest:
            "a".repeat(
              64
            ),

          candidateType:
            "FAILURE_MODE",

          knowledgeScope:
            "ENVIRONMENT",

          title:
            "Config failure",

          summary:
            "candidate",

          candidatePayload: {
            z:
              2,

            a:
              1,
          },

          generatedBy:
            "aira-deterministic-human-learning-generator",

          generatorVersion:
            "24.3.0",
        };


        expect(
          candidateDigest(
            base
          )
        ).toBe(
          candidateDigest({
            ...base,

            candidatePayload: {
              a:
                1,

              z:
                2,
            },
          })
        );
      }
    );


    test(
      "different source digest does not collapse provenance",
      () => {
        const base = {
          sourceDigest:
            "a".repeat(
              64
            ),

          candidateType:
            "FAILURE_MODE",

          knowledgeScope:
            "ENVIRONMENT",

          title:
            "Config failure",

          candidatePayload: {
            diagnosis:
              "invalid config",
          },

          generatedBy:
            "aira-deterministic-human-learning-generator",

          generatorVersion:
            "24.3.0",
        };


        expect(
          candidateDigest(
            base
          )
        ).not.toBe(
          candidateDigest({
            ...base,

            sourceDigest:
              "b".repeat(
                64
              ),
          })
        );
      }
    );
  }
);