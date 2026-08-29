"use strict";

const RecoveryCoverageClassificationEngine =
  require(
    "../../coverage/RecoveryCoverageClassificationEngine"
  );

const RecoveryCoverageScoringEngine =
  require(
    "../../coverage/RecoveryCoverageScoringEngine"
  );


describe(
  "Phase 19.13-19.14 Coverage Classification and Scoring",
  () => {
    let classifier;


    beforeEach(
      () => {
        classifier =
          new RecoveryCoverageClassificationEngine();
      }
    );


    /*
     * ========================================================================
     * UNKNOWN
     * ========================================================================
     */


    test(
      "resource with no applicable Failure Mode knowledge is UNKNOWN",
      () => {
        const result =
          classifier.classify({
            failureModeKnown:
              false,

            failureMode:
              null,
          });


        expect(
          result.classification
        ).toBe(
          "UNKNOWN"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "NO_FAILURE_MODE"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "known Failure Mode with no recovery Playbook is UNKNOWN",
      () => {
        const result =
          classifier.classify({
            failureMode: {
              failureModeKey:
                "FM-POSTGRES-CORRUPTION",
            },

            playbookCoverage: {
              hasPlaybookKnowledge:
                false,

              reasonCodes: [
                "NO_PLAYBOOK",
              ],
            },
          });


        expect(
          result.classification
        ).toBe(
          "UNKNOWN"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "NO_PLAYBOOK"
        );
      }
    );


    /*
     * ========================================================================
     * PARTIAL
     * ========================================================================
     */


    test(
      "known recovery path with missing capability is PARTIAL",
      () => {
        const result =
          classifier.classify(
            completeInput({
              capabilityCoverage: {
                complete:
                  false,

                technicallyApplicable:
                  false,

                reasonCodes: [
                  "CAPABILITY_MISSING",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "CAPABILITY_MISSING"
        );
      }
    );


    test(
      "known recovery path with missing verification is PARTIAL",
      () => {
        const result =
          classifier.classify(
            completeInput({
              verificationReadiness: {
                complete:
                  false,

                reasonCodes: [
                  "VERIFICATION_MISSING",
                ],

                commandSuccessIsVerification:
                  false,
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "VERIFICATION_MISSING"
        );


        expect(
          result
            .readiness
            .commandSuccessIsVerification
        ).toBe(false);
      }
    );


    test(
      "untested recovery knowledge is PARTIAL",
      () => {
        const result =
          classifier.classify(
            completeInput({
              historicalValidation: {
                tested:
                  false,

                allTested:
                  false,

                sufficientlyValidated:
                  false,

                proven:
                  false,

                reasonCodes: [
                  "UNTESTED_RECOVERY",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "UNTESTED_RECOVERY"
        );
      }
    );


    test(
      "low historical confidence is PARTIAL",
      () => {
        const result =
          classifier.classify(
            completeInput({
              historicalValidation: {
                tested:
                  true,

                sufficientlyValidated:
                  false,

                proven:
                  false,

                reasonCodes: [
                  "LOW_HISTORICAL_CONFIDENCE",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );
      }
    );


    test(
      "policy denial is PARTIAL and not HUMAN_ONLY",
      () => {
        const result =
          classifier.classify(
            completeInput({
              policyReadiness: {
                policyReady:
                  false,

                policyBlocked:
                  true,

                approvalRequired:
                  true,

                humanOnlyCandidate:
                  false,

                reasonCodes: [
                  "POLICY_BLOCKED",
                  "HUMAN_APPROVAL_REQUIRED",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "POLICY_BLOCKED"
        );
      }
    );


    /*
     * ========================================================================
     * HUMAN ONLY
     * ========================================================================
     */


    test(
      "otherwise ready recovery requiring human approval is HUMAN_ONLY",
      () => {
        const result =
          classifier.classify(
            completeInput({
              policyReadiness: {
                policyReady:
                  true,

                policyBlocked:
                  false,

                approvalRequired:
                  true,

                humanOnlyCandidate:
                  true,

                autonomousPolicyReady:
                  false,

                reasonCodes: [
                  "HUMAN_APPROVAL_REQUIRED",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "HUMAN_ONLY"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "HUMAN_APPROVAL_REQUIRED"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "human requirement does not hide missing verification",
      () => {
        const result =
          classifier.classify(
            completeInput({
              policyReadiness: {
                policyReady:
                  true,

                policyBlocked:
                  false,

                approvalRequired:
                  true,

                humanOnlyCandidate:
                  true,

                reasonCodes: [
                  "HUMAN_APPROVAL_REQUIRED",
                ],
              },

              verificationReadiness: {
                complete:
                  false,

                reasonCodes: [
                  "VERIFICATION_MISSING",
                ],
              },
            })
          );


        expect(
          result.classification
        ).toBe(
          "PARTIAL"
        );


        expect(
          result.reasonCodes
        ).toContain(
          "VERIFICATION_MISSING"
        );
      }
    );


    /*
     * ========================================================================
     * COVERED
     * ========================================================================
     */


    test(
      "fully ready recovery path is COVERED",
      () => {
        const result =
          classifier.classify(
            completeInput()
          );


        expect(
          result.classification
        ).toBe(
          "COVERED"
        );


        expect(
          result.reasonCodes
        ).toEqual([]);


        expect(
          result
            .readiness
            .approvedPlaybook
        ).toBe(true);


        expect(
          result
            .readiness
            .proceduralCompleteness
        ).toBe(true);


        expect(
          result
            .readiness
            .evidenceReady
        ).toBe(true);


        expect(
          result
            .readiness
            .capabilityReady
        ).toBe(true);


        expect(
          result
            .readiness
            .verificationReady
        ).toBe(true);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * SCORING
     * ========================================================================
     */


    test(
      "headline metric reproduces 691 / 817 = 84.6 percent",
      () => {
        const scoring =
          new RecoveryCoverageScoringEngine();


        const evaluations = [
          ...makeEvaluations(
            691,
            "COVERED"
          ),

          ...makeEvaluations(
            74,
            "PARTIAL",
            691
          ),

          ...makeEvaluations(
            29,
            "HUMAN_ONLY",
            765
          ),

          ...makeEvaluations(
            23,
            "UNKNOWN",
            794
          ),
        ];


        const result =
          scoring.score({
            resourcesCount:
              8429,

            evaluations,
          });


        expect(
          result.resources
        ).toBe(
          8429
        );


        expect(
          result.applicableFailureModes
        ).toBe(
          817
        );


        expect(
          result.covered
        ).toBe(
          691
        );


        expect(
          result.partial
        ).toBe(
          74
        );


        expect(
          result.humanOnly
        ).toBe(
          29
        );


        expect(
          result.unknown
        ).toBe(
          23
        );


        expect(
          result.coverage
        ).toBe(
          84.6
        );


        expect(
          result
            .headlineMetric
            .numerator
        ).toBe(
          691
        );


        expect(
          result
            .headlineMetric
            .denominator
        ).toBe(
          817
        );
      }
    );


    test(
      "HUMAN_ONLY does not inflate headline COVERED percentage",
      () => {
        const scoring =
          new RecoveryCoverageScoringEngine();


        const result =
          scoring.score({
            evaluations: [
              evaluation(
                "a",
                "COVERED"
              ),

              evaluation(
                "b",
                "HUMAN_ONLY"
              ),
            ],
          });


        expect(
          result.coverage
        ).toBe(
          50
        );


        expect(
          result.covered
        ).toBe(
          1
        );


        expect(
          result.humanOnly
        ).toBe(
          1
        );
      }
    );


    test(
      "empty environment produces zero coverage without divide-by-zero",
      () => {
        const scoring =
          new RecoveryCoverageScoringEngine();


        const result =
          scoring.score({
            evaluations:
              [],
          });


        expect(
          result.applicableFailureModes
        ).toBe(
          0
        );


        expect(
          result.coverage
        ).toBe(
          0
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "resource supplementary metrics do not replace headline metric",
      () => {
        const scoring =
          new RecoveryCoverageScoringEngine();


        const result =
          scoring.score({
            evaluations: [
              {
                resourceId:
                  "resource-a",

                classification:
                  "COVERED",
              },

              {
                resourceId:
                  "resource-a",

                classification:
                  "PARTIAL",
              },

              {
                resourceId:
                  "resource-b",

                classification:
                  "COVERED",
              },
            ],
          });


        expect(
          result.coverage
        ).toBe(
          66.7
        );


        expect(
          result
            .supplementary
            .resourcesWithAtLeastOneCoveredRecovery
        ).toBe(
          2
        );


        expect(
          result
            .supplementary
            .resourceCoveragePercentage
        ).toBe(
          100
        );


        expect(
          result
            .supplementary
            .completelyCoveredResources
        ).toBe(
          1
        );


        expect(
          result
            .supplementary
            .completeResourceCoveragePercentage
        ).toBe(
          50
        );
      }
    );


    test(
      "scoring rejects unknown classifications",
      () => {
        const scoring =
          new RecoveryCoverageScoringEngine();


        expect(
          () =>
            scoring.score({
              evaluations: [
                {
                  resourceId:
                    "resource",

                  classification:
                    "MAGICALLY_RECOVERABLE",
                },
              ],
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "COVERAGE_CLASSIFICATION_INVALID",
          })
        );
      }
    );


    test(
      "classification and scoring never authorize execution",
      () => {
        const classified =
          classifier.classify(
            completeInput()
          );


        const scoring =
          new RecoveryCoverageScoringEngine();


        const score =
          scoring.score({
            evaluations: [
              {
                resourceId:
                  "resource",

                classification:
                  classified.classification,
              },
            ],
          });


        expect(
          classified.executionAuthorized
        ).toBe(false);


        expect(
          classified.coverageImpliesExecution
        ).toBe(false);


        expect(
          score.executionAuthorized
        ).toBe(false);


        expect(
          score.coverageImpliesExecution
        ).toBe(false);
      }
    );
  }
);


/*
 * ============================================================================
 * COMPLETE READY RECOVERY FIXTURE
 * ============================================================================
 */


function completeInput(
  overrides = {}
) {
  return deepMerge(
    {
      failureModeKnown:
        true,

      failureMode: {
        failureModeKey:
          "FM-POSTGRES-CORRUPTION",
      },

      playbookCoverage: {
        hasPlaybookKnowledge:
          true,

        hasApprovedRecovery:
          true,

        complete:
          true,

        reasonCodes:
          [],
      },

      proceduralCompleteness: {
        complete:
          true,

        hasCompleteRecoveryProcedure:
          true,

        reasonCodes:
          [],
      },

      evidenceReadiness: {
        complete:
          true,

        reasonCodes:
          [],
      },

      capabilityCoverage: {
        complete:
          true,

        technicallyApplicable:
          true,

        reasonCodes:
          [],
      },

      policyReadiness: {
        policyReady:
          true,

        policyBlocked:
          false,

        approvalRequired:
          false,

        humanOnlyCandidate:
          false,

        autonomousPolicyReady:
          true,

        reasonCodes:
          [],
      },

      rollbackReadiness: {
        complete:
          true,

        reasonCodes:
          [],
      },

      verificationReadiness: {
        complete:
          true,

        commandSuccessIsVerification:
          false,

        reasonCodes:
          [],
      },

      escalationCoverage: {
        humanEscalationAvailable:
          true,
      },

      historicalValidation: {
        tested:
          true,

        allTested:
          true,

        sufficientlyValidated:
          true,

        proven:
          true,

        reasonCodes:
          [],
      },
    },

    overrides
  );
}


/*
 * ============================================================================
 * SCORING FIXTURES
 * ============================================================================
 */


function evaluation(
  resourceId,
  classification
) {
  return {
    resourceId,

    classification,
  };
}


function makeEvaluations(
  count,
  classification,
  offset = 0
) {
  return Array.from(
    {
      length:
        count,
    },

    (
      _,
      index
    ) => ({
      resourceId:
        `resource-${offset + index}`,

      failureModeId:
        `fm-${offset + index}`,

      classification,
    })
  );
}


/*
 * ============================================================================
 * TEST MERGE HELPER
 * ============================================================================
 */


function deepMerge(
  base,
  override
) {
  const result = {
    ...base,
  };


  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      override
    )
  ) {
    if (
      isPlainObject(
        value
      ) &&
      isPlainObject(
        result[key]
      )
    ) {
      result[key] =
        deepMerge(
          result[key],
          value
        );
    } else {
      result[key] =
        value;
    }
  }


  return result;
}


function isPlainObject(
  value
) {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}