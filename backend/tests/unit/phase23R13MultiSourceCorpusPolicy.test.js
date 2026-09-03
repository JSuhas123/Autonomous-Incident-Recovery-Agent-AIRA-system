"use strict";


const {
  REALITY_CORPUS_POLICY_VERSION,

  SOURCE_POLICY_STATUS,

  CORPUS_ROLE,

  destinationZoneForStatus,

  deriveLineageEligibility,

  assertIngestionAllowed,
} =
  require(
    "../../services/reality/realityCorpusPolicyService"
  );


function eligibility(
  overrides =
    {}
) {
  return {
    researchEligible:
      true,

    modelTrainingEligible:
      false,

    retrievalEligible:
      true,

    developmentEvaluationEligible:
      true,

    validationEligible:
      true,

    holdoutEligible:
      true,

    productionCertificationEligible:
      true,

    customerRuntimeEligible:
      false,

    redistributionAllowed:
      false,

    agentGroundTruthVisible:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23R.13 multi-source corpus policy",

  () => {
    test(
      "freezes the repaired A/C/D runtime policy contract",

      () => {
        expect(
          REALITY_CORPUS_POLICY_VERSION
        ).toBe(
          "23R.13A-C-D.1"
        );
      }
    );


    test(
      "commercial sources route to approved storage",

      () => {
        expect(
          destinationZoneForStatus(
            SOURCE_POLICY_STATUS.APPROVED_COMMERCIAL
          )
        ).toBe(
          "APPROVED"
        );
      }
    );


    test(
      "research-only sources route to research-only storage",

      () => {
        expect(
          destinationZoneForStatus(
            SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY
          )
        ).toBe(
          "RESEARCH_ONLY"
        );
      }
    );


    test(
      "unverified sources route to quarantine",

      () => {
        expect(
          destinationZoneForStatus(
            SOURCE_POLICY_STATUS.QUARANTINED_LICENSE_REVIEW
          )
        ).toBe(
          "QUARANTINE"
        );
      }
    );


    test(
      "research ancestry contaminates commercial lineage",

      () => {
        const result =
          deriveLineageEligibility([
            {
              policyStatus:
                SOURCE_POLICY_STATUS.APPROVED_COMMERCIAL,

              corpusRole:
                CORPUS_ROLE.INDEPENDENT_BENCHMARK,

              eligibility:
                eligibility(),
            },

            {
              policyStatus:
                SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY,

              corpusRole:
                CORPUS_ROLE.RESEARCH_EXPERIMENT,

              eligibility:
                eligibility({
                  retrievalEligible:
                    false,

                  developmentEvaluationEligible:
                    false,

                  validationEligible:
                    false,

                  holdoutEligible:
                    false,

                  productionCertificationEligible:
                    false,
                }),
            },
          ]);


        expect(
          result.policyStatus
        ).toBe(
          SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY
        );


        expect(
          result.eligibility.retrievalEligible
        ).toBe(
          false
        );


        expect(
          result.eligibility.productionCertificationEligible
        ).toBe(
          false
        );
      }
    );


    test(
      "holdout ancestry remains retrieval isolated",

      () => {
        const result =
          deriveLineageEligibility([
            {
              policyStatus:
                SOURCE_POLICY_STATUS.APPROVED_COMMERCIAL,

              corpusRole:
                CORPUS_ROLE.FINAL_HOLDOUT,

              isFinalHoldout:
                true,

              eligibility:
                eligibility(),
            },
          ]);


        expect(
          result.hasFinalHoldoutAncestor
        ).toBe(
          true
        );


        expect(
          result.eligibility.retrievalEligible
        ).toBe(
          false
        );


        expect(
          result.eligibility.holdoutEligible
        ).toBe(
          true
        );
      }
    );


    test(
      "malformed commercial ancestry cannot expose ground truth",

      () => {
        const result =
          deriveLineageEligibility([
            {
              policyStatus:
                SOURCE_POLICY_STATUS.APPROVED_COMMERCIAL,

              corpusRole:
                CORPUS_ROLE.HEALTHY_BASELINE,

              eligibility:
                eligibility({
                  agentGroundTruthVisible:
                    true,
                }),
            },
          ]);


        expect(
          result
            .eligibility
            .agentGroundTruthVisible
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.productionCertified
        ).toBe(
          false
        );
      }
    );


    test(
      "quarantined ancestry disables every use capability",

      () => {
        const result =
          deriveLineageEligibility([
            {
              policyStatus:
                SOURCE_POLICY_STATUS.QUARANTINED_LICENSE_REVIEW,

              corpusRole:
                CORPUS_ROLE.RESEARCH_EXPERIMENT,

              eligibility:
                eligibility(),
            },
          ]);


        expect(
          Object.values(
            result.eligibility
          ).every(
            value =>
              value ===
                false
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "research source cannot be ingested into approved zone",

      () => {
        expect(
          () =>
            assertIngestionAllowed(
              {
                policyStatus:
                  SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY,
              },
              "APPROVED"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_CORPUS_DESTINATION_VIOLATION",
          })
        );
      }
    );


    test(
      "research source can be ingested only into research zone",

      () => {
        expect(
          assertIngestionAllowed(
            {
              policyStatus:
                SOURCE_POLICY_STATUS.APPROVED_RESEARCH_ONLY,
            },
            "RESEARCH_ONLY"
          )
        ).toEqual(
          expect.objectContaining({
            allowed:
              true,

            destinationZone:
              "RESEARCH_ONLY",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "blocked source can never be ingested",

      () => {
        expect(
          () =>
            assertIngestionAllowed(
              {
                policyStatus:
                  SOURCE_POLICY_STATUS.BLOCKED,
              },
              "BLOCKED"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_CORPUS_SOURCE_BLOCKED",
          })
        );
      }
    );
  }
);