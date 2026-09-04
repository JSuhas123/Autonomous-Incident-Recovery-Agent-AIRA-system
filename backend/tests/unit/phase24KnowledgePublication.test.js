"use strict";


const {
  LearningKnowledgePublicationService,
} = require(
    "../../services/humanLearning/learningKnowledgePublicationService"
  );


describe(
  "AIRA Phase 24.8 — canonical knowledge publication",
  () => {
    test(
      "publishes approved RUNBOOK through canonical Phase 18 repository",
      async () => {
        const candidate = {
          candidateType:
            "RUNBOOK",

          candidateState:
            "APPROVED",

          knowledgeScope:
            "ENVIRONMENT",

          candidatePayload: {
            runbook: {
              runbookId:
                "RB-K8S-LEARNED-001",

              semver:
                "1.0.0",

              name:
                "Recover learned Kubernetes condition",

              description:
                "Validated tenant recovery procedure",

              steps:
                [],
            },
          },

          executionAuthorized:
            false,
        };


        const runbookRepository = {
          getDefinitionByKey:
            jest.fn()
              .mockResolvedValue(
                null
              ),

          createDefinition:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "rbdef_1",
              }),

          createVersion:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "rbver_1",
              }),
        };


        const publicationRepository = {
          recordPublication:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lpub_1",

                status:
                  "PUBLISHED",

                executionAuthorized:
                  false,
              }),
        };


        const candidateRepository = {
          getCandidate:
            jest.fn()
              .mockResolvedValue(
                candidate
              ),

          transitionCandidate:
            jest.fn(),
        };


        const service =
          new LearningKnowledgePublicationService({
            candidateRepository,

            publicationRepository,

            runbookRepository,
          });


        const output =
          await service.publish({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reviewDecisionId:
              "lrdec_1",

            validationRunId:
              "lval_1",

            executionAuthorized:
              false,
          });


        expect(
          output.knowledgePublished
        ).toBe(
          true
        );


        expect(
          output.candidateState
        ).toBe(
          "PUBLISHED"
        );


        expect(
          output.executionAuthorized
        ).toBe(
          false
        );


        expect(
          runbookRepository
            .createVersion
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "ordinary learning publication cannot write GLOBAL knowledge",
      async () => {
        const service =
          new LearningKnowledgePublicationService({
            candidateRepository: {
              getCandidate:
                jest.fn()
                  .mockResolvedValue({
                    candidateType:
                      "RUNBOOK",

                    candidateState:
                      "APPROVED",

                    knowledgeScope:
                      "GLOBAL",

                    candidatePayload:
                      {},

                    executionAuthorized:
                      false,
                  }),
            },

            publicationRepository:
              {},
          });


        let caught;


        try {
          await service.publish({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reviewDecisionId:
              "lrdec_1",

            targetScope:
              "GLOBAL",
          });
        }
        catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught
        ).toBeTruthy();


        expect(
          caught.code
        ).toBe(
          "HUMAN_LEARNING_GLOBAL_PUBLICATION_REQUIRES_CONTROLLED_IMPORT"
        );
      }
    );


    test(
      "unsupported candidate type cannot create parallel knowledge store",
      async () => {
        const service =
          new LearningKnowledgePublicationService({
            candidateRepository: {
              getCandidate:
                jest.fn()
                  .mockResolvedValue({
                    candidateType:
                      "RECOVERY_STRATEGY",

                    candidateState:
                      "APPROVED",

                    knowledgeScope:
                      "ENVIRONMENT",

                    candidatePayload:
                      {},

                    executionAuthorized:
                      false,
                  }),
            },

            publicationRepository:
              {},
          });


        let caught;


        try {
          await service.publish({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reviewDecisionId:
              "lrdec_1",
          });
        }
        catch (
          error
        ) {
          caught =
            error;
        }


        expect(
          caught.code
        ).toBe(
          "HUMAN_LEARNING_CANONICAL_ADAPTER_REQUIRED"
        );
      }
    );
  }
);