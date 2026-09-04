"use strict";


const {
  LearningKnowledgeRevocationService,
} = require(
    "../../services/humanLearning/learningKnowledgeRevocationService"
  );


describe(
  "AIRA Phase 24.8 — knowledge revocation",
  () => {
    test(
      "revocation preserves ledger and revokes candidate",
      async () => {
        const publicationRepository = {
          updatePublicationStatus:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lpub_1",

                status:
                  "REVOKED",
              }),

          recordRevocation:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lrev_1",

                action:
                  "REVOKE",
              }),
        };


        const candidateRepository = {
          transitionCandidate:
            jest.fn(),
        };


        const service =
          new LearningKnowledgeRevocationService({
            publicationRepository,

            candidateRepository,
          });


        const result =
          await service.revoke({
            organizationId:
              "org",

            environmentId:
              "env",

            publicationId:
              "lpub_1",

            candidateId:
              "lcand_1",

            reason:
              "Later evidence contradicted the learned procedure",

            actorId:
              "reviewer_2",
          });


        expect(
          result.publication
            .status
        ).toBe(
          "REVOKED"
        );


        expect(
          candidateRepository
            .transitionCandidate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            nextState:
              "REVOKED",

            executionAuthorized:
              false,
          })
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);