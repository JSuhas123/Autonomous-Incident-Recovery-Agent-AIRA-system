"use strict";


const {
  LearningCandidateGeneralizationService,
} =
  require(
    "../../services/humanLearning/learningCandidateGeneralizationService"
  );


const {
  LearningCandidateScopeService,
} =
  require(
    "../../services/humanLearning/learningCandidateScopeService"
  );


const {
  LearningTenantDataScrubber,
} =
  require(
    "../../services/humanLearning/learningTenantDataScrubber"
  );


const {
  LearningCrossTenantIsolationService,
} =
  require(
    "../../services/humanLearning/learningCrossTenantIsolationService"
  );


describe(
  "AIRA Phase 24.5 — explicit global knowledge promotion boundary",
  () => {
    test(
      "creates a new scrubbed global proposal without mutating source candidate",
      async () => {
        const sourceCandidate = {
          id:
            "candidate-uuid",

          publicId:
            "lcand_private_001",

          candidateDigest:
            "a".repeat(
              64
            ),

          candidateType:
            "RECOVERY_STRATEGY",

          knowledgeScope:
            "ENVIRONMENT",

          truthLevel:
            "CANDIDATE",

          candidateState:
            "HUMAN_REVIEW_PENDING",

          title:
            "Recover Acme-Customer API",

          summary:
            "Restore prod-cluster-acme configuration",

          candidatePayload: {
            action:
              "restore configuration on prod-cluster-acme",

            contact:
              "operator@acme.example.com",

            target:
              "10.20.30.40",
          },

          confidence:
            0.64,

          riskClassification:
            "UNASSESSED",

          executionAuthorized:
            false,
        };


        const generalizationRepository = {
          createRequest:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lgen_001",

                executionAuthorized:
                  false,
              }),

          updateRequestStatus:
            jest.fn(),

          createArtifact:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lgart_001",

                publicationEligible:
                  false,

                requiresIndependentValidation:
                  true,

                executionAuthorized:
                  false,
              }),

          recordIsolationCheck:
            jest.fn(),
        };


        const candidateRepository = {
          getCandidate:
            jest.fn()
              .mockResolvedValue(
                sourceCandidate
              ),

          createCandidate:
            jest.fn(),

          transitionCandidate:
            jest.fn(),
        };


        const service =
          new LearningCandidateGeneralizationService({
            candidateRepository,

            generalizationRepository,

            scopeService:
              new LearningCandidateScopeService(),

            scrubber:
              new LearningTenantDataScrubber(),

            isolationService:
              new LearningCrossTenantIsolationService(),
          });


        const result =
          await service.generalize({
            organizationId:
              "org_private",

            environmentId:
              "env_private",

            candidateId:
              "lcand_private_001",

            tenantIdentifiers: [
              "Acme-Customer",

              "prod-cluster-acme",

              "org_private",

              "env_private",
            ],

            executionAuthorized:
              false,
          });


        expect(
          result.passed
        ).toBe(
          true
        );


        expect(
          result.sourceCandidateMutated
        ).toBe(
          false
        );


        expect(
          result.generalizedCandidate
            .knowledgeScope
        ).toBe(
          "GLOBAL"
        );


        expect(
          result.generalizedCandidate
            .truthLevel
        ).toBe(
          "CANDIDATE"
        );


        expect(
          result.publicationEligible
        ).toBe(
          false
        );


        expect(
          result.requiresIndependentValidation
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          candidateRepository
            .createCandidate
        ).not.toHaveBeenCalled();


        expect(
          candidateRepository
            .transitionCandidate
        ).not.toHaveBeenCalled();


        const serialized =
          JSON.stringify(
            result.generalizedCandidate
          );


        expect(
          serialized
        ).not.toContain(
          "Acme-Customer"
        );


        expect(
          serialized
        ).not.toContain(
          "prod-cluster-acme"
        );


        expect(
          serialized
        ).not.toContain(
          "operator@acme.example.com"
        );


        expect(
          serialized
        ).not.toContain(
          "10.20.30.40"
        );
      }
    );
  }
);