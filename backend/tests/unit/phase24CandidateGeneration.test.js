"use strict";


const {
  HumanLearningAgentService,
} =
  require(
    "../../services/humanLearning/humanLearningAgentService"
  );


function sourceBundle() {
  return {
    id:
      "bundle-db-id",

    publicId:
      "lsrc_001",

    sourceDigest:
      "a".repeat(
        64
      ),

    observationPayload:
      [],

    assertionPayload:
      [],

    diagnosisPayload:
      [],

    actionPayload:
      [],

    verificationPayload:
      [],

    outcomePayload:
      [],

    executionAuthorized:
      false,
  };
}


function generatorResponse(
  candidates
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
      candidates.length,

    candidates,

    executionAuthorized:
      false,
  };
}


describe(
  "AIRA Phase 24.3 — candidate generation orchestration",
  () => {
    test(
      "persists every proposal only through quarantine service",
      async () => {
        const sourceRepository = {
          getSourceBundle:
            jest
              .fn()
              .mockResolvedValue(
                sourceBundle()
              ),
        };


        const proposal = {
          candidateType:
            "EVIDENCE_PATTERN",

          knowledgeScope:
            "ENVIRONMENT",

          title:
            "Observed evidence pattern",

          summary:
            "Candidate only",

          candidatePayload: {
            evidence: [
              "CrashLoopBackOff",
            ],
          },

          confidence:
            0.5,

          riskClassification:
            "UNASSESSED",

          truthLevel:
            "CANDIDATE",

          executionAuthorized:
            false,
        };


        const generator = {
          generate:
            jest
              .fn()
              .mockResolvedValue(
                generatorResponse([
                  proposal,
                ])
              ),
        };


        const candidateService = {
          createQuarantinedCandidate:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "lcand_001",

                candidateState:
                  "QUARANTINED",

                truthLevel:
                  "CANDIDATE",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanLearningAgentService({
            sourceRepository,

            generator,

            candidateService,
          });


        const result =
          await service
            .generateFromSourceBundle({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sourceBundleId:
                "lsrc_001",
            });


        expect(
          result.persistedCount
        ).toBe(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          candidateService
            .createQuarantinedCandidate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceDigest:
              "a".repeat(
                64
              ),

            candidateType:
              "EVIDENCE_PATTERN",

            knowledgeScope:
              "ENVIRONMENT",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "zero-candidate learning is a valid result",
      async () => {
        const candidateService = {
          createQuarantinedCandidate:
            jest.fn(),
        };


        const service =
          new HumanLearningAgentService({
            sourceRepository: {
              getSourceBundle:
                jest
                  .fn()
                  .mockResolvedValue(
                    sourceBundle()
                  ),
            },

            generator: {
              generate:
                jest
                  .fn()
                  .mockResolvedValue(
                    generatorResponse(
                      []
                    )
                  ),
            },

            candidateService,
          });


        const result =
          await service
            .generateFromSourceBundle({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sourceBundleId:
                "lsrc_001",
            });


        expect(
          result.zeroCandidateLearning
        ).toBe(
          true
        );


        expect(
          result.persistedCount
        ).toBe(
          0
        );


        expect(
          candidateService
            .createQuarantinedCandidate
        ).not.toHaveBeenCalled();
      }
    );
  }
);