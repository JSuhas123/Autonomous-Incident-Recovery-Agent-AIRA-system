"use strict";


const {
  RCAEVAL_SOURCE_COVERAGE_VERSION,

  RCAEVAL_EXPECTED_SUITE_COUNTS,

  certifyRcaEvalCoverage,
} =
  require(
    "../../services/reality/realityCorpusCoverageCertificationService"
  );


function manifest() {
  const cases =
    [];


  const partitions =
    [
      "RETRIEVAL",
      "DEVELOPMENT",
      "VALIDATION",
      "HOLDOUT",
    ];


  let n =
    0;


  for (
    const [
      suite,
      count,
    ]
    of Object.entries(
      RCAEVAL_EXPECTED_SUITE_COUNTS
    )
  ) {
    for (
      let i = 0;
      i < count;
      i += 1
    ) {
      cases.push({
        benchmarkCaseId:
          `${suite}-${i}`,

        suite,

        partition:
          partitions[
            n %
            partitions.length
          ],

        groupDigest:
          `group-${n}`,

        evidenceGrade:
          "E2",

        trainingEligible:
          false,

        groundTruthAgentVisible:
          false,
      });


      n +=
        1;
    }
  }


  return {
    benchmarkId:
      "RCAEVAL",

    license:
      "MIT",

    caseCount:
      735,

    suiteCounts:
      {
        ...RCAEVAL_EXPECTED_SUITE_COUNTS,
      },

    cases,

    holdoutRules: {
      retrievalAllowed:
        false,

      trainingAllowed:
        false,

      agentGroundTruthAllowed:
        false,
    },
  };
}


describe(
  "Phase 23R.13E-pre RCAEval source coverage",

  () => {
    test(
      "reclassifies the old 23R.13 coverage as RCAEval-source-only",

      () => {
        expect(
          RCAEVAL_SOURCE_COVERAGE_VERSION
        ).toBe(
          "23R.13E-PRE.1"
        );


        const result =
          certifyRcaEvalCoverage(
            manifest()
          );


        expect(
          result.certificationScope
        ).toBe(
          "RCAEVAL_SOURCE_ONLY"
        );


        expect(
          result.phaseWideCorpusCertified
        ).toBe(
          false
        );
      }
    );


    test(
      "certifies complete 735-case RCAEval source coverage",

      () => {
        expect(
          certifyRcaEvalCoverage(
            manifest()
          )
        ).toEqual(
          expect.objectContaining({
            status:
              "PASS",

            caseCount:
              735,

            suiteCount:
              9,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "missing cases fail closed",

      () => {
        const value =
          manifest();


        value.caseCount =
          734;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_CASE_COUNT_INVALID",
          })
        );
      }
    );


    test(
      "suite coverage drift fails closed",

      () => {
        const value =
          manifest();


        value
          .suiteCounts[
            "RE3-TT"
          ] =
          29;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_SUITE_COVERAGE_INVALID",
          })
        );
      }
    );


    test(
      "duplicate case IDs fail closed",

      () => {
        const value =
          manifest();


        value
          .cases[
            1
          ]
          .benchmarkCaseId =
          value
            .cases[
              0
            ]
            .benchmarkCaseId;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_DUPLICATE_CASE",
          })
        );
      }
    );


    test(
      "ground truth exposure fails closed",

      () => {
        const value =
          manifest();


        value
          .cases[
            0
          ]
          .groundTruthAgentVisible =
          true;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_ANSWER_SEALING_INVALID",
          })
        );
      }
    );


    test(
      "benchmark-training contamination fails closed",

      () => {
        const value =
          manifest();


        value
          .cases[
            0
          ]
          .trainingEligible =
          true;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_TRAINING_CONTAMINATION",
          })
        );
      }
    );


    test(
      "same group cannot cross RCAEval partitions",

      () => {
        const value =
          manifest();


        value
          .cases[
            1
          ]
          .groupDigest =
          value
            .cases[
              0
            ]
            .groupDigest;


        if (
          value
            .cases[
              1
            ]
            .partition ===
          value
            .cases[
              0
            ]
            .partition
        ) {
          value
            .cases[
              1
            ]
            .partition =
            "HOLDOUT";
        }


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_GROUP_LEAKAGE",
          })
        );
      }
    );


    test(
      "RCAEval holdout cannot enter retrieval or training",

      () => {
        const value =
          manifest();


        value
          .holdoutRules
          .retrievalAllowed =
          true;


        expect(
          () =>
            certifyRcaEvalCoverage(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_RCAEVAL_SOURCE_HOLDOUT_NOT_SEALED",
          })
        );
      }
    );
  }
);