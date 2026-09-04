"use strict";


const {
  LearningCrossTenantIsolationService,
} =
  require(
    "../../services/humanLearning/learningCrossTenantIsolationService"
  );


describe(
  "AIRA Phase 24.5 — cross-tenant isolation",
  () => {
    test(
      "clean global proposal passes boundary checks",
      () => {
        const service =
          new LearningCrossTenantIsolationService();


        const result =
          service.evaluate({
            generalizedCandidate: {
              candidateType:
                "RECOVERY_STRATEGY",

              knowledgeScope:
                "GLOBAL",

              truthLevel:
                "CANDIDATE",

              candidatePayload: {
                action:
                  "restore the previously verified configuration",
              },

              publicationEligible:
                false,

              requiresIndependentValidation:
                true,

              executionAuthorized:
                false,
            },

            tenantIdentifiers: [
              "customer-a",
            ],

            sourceIdentifiers: [
              "lcand_private_001",
            ],

            executionAuthorized:
              false,
          });


        expect(
          result.passed
        ).toBe(
          true
        );
      }
    );


    test(
      "tenant identifier leakage rejects global proposal",
      () => {
        const service =
          new LearningCrossTenantIsolationService();


        const result =
          service.evaluate({
            generalizedCandidate: {
              knowledgeScope:
                "GLOBAL",

              truthLevel:
                "CANDIDATE",

              summary:
                "Use customer-a production configuration",

              publicationEligible:
                false,

              requiresIndependentValidation:
                true,

              executionAuthorized:
                false,
            },

            tenantIdentifiers: [
              "customer-a",
            ],
          });


        expect(
          result.passed
        ).toBe(
          false
        );


        expect(
          result.checks.find(
            (
              check
            ) =>
              check.checkType ===
              "TENANT_IDENTIFIER_LEAKAGE"
          ).passed
        ).toBe(
          false
        );
      }
    );


    test(
      "source candidate identity may not leak",
      () => {
        const service =
          new LearningCrossTenantIsolationService();


        const result =
          service.evaluate({
            generalizedCandidate: {
              knowledgeScope:
                "GLOBAL",

              truthLevel:
                "CANDIDATE",

              summary:
                "Derived from lcand_private_123",

              publicationEligible:
                false,

              requiresIndependentValidation:
                true,

              executionAuthorized:
                false,
            },

            sourceIdentifiers: [
              "lcand_private_123",
            ],
          });


        expect(
          result.passed
        ).toBe(
          false
        );
      }
    );
  }
);