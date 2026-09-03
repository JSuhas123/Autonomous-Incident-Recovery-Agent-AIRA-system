"use strict";


/*
 * Phase 23R.13 note:
 * This module certifies RCAEval source coverage only.
 * It is NOT the final multi-source Reality Corpus certification.
 * Final phase-wide coverage is implemented later in 23R.13T.
 */


const RCAEVAL_SOURCE_COVERAGE_VERSION =
  "23R.13E-PRE.1";


const REALITY_CORPUS_COVERAGE_VERSION =
  RCAEVAL_SOURCE_COVERAGE_VERSION;


const RCAEVAL_EXPECTED_SUITE_COUNTS =
  Object.freeze({
    "RE1-OB":
      125,

    "RE1-SS":
      125,

    "RE1-TT":
      125,

    "RE2-OB":
      90,

    "RE2-SS":
      90,

    "RE2-TT":
      90,

    "RE3-OB":
      30,

    "RE3-SS":
      30,

    "RE3-TT":
      30,
  });


const REQUIRED_PARTITIONS =
  Object.freeze([
    "RETRIEVAL",

    "DEVELOPMENT",

    "VALIDATION",

    "HOLDOUT",
  ]);


function coverageError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function certifyRcaEvalCoverage(
  manifest
) {
  if (
    !manifest ||

    typeof manifest !==
      "object" ||

    Array.isArray(
      manifest
    )
  ) {
    throw coverageError(
      "REALITY_RCAEVAL_SOURCE_MANIFEST_REQUIRED",
      "RCAEval source manifest is required"
    );
  }


  if (
    manifest.benchmarkId !==
      "RCAEVAL" ||

    manifest.license !==
      "MIT"
  ) {
    throw coverageError(
      "REALITY_RCAEVAL_SOURCE_INVALID",
      "source certification requires the approved MIT RCAEval dataset"
    );
  }


  if (
    manifest.caseCount !==
      735 ||

    !Array.isArray(
      manifest.cases
    ) ||

    manifest.cases.length !==
      735
  ) {
    throw coverageError(
      "REALITY_RCAEVAL_SOURCE_CASE_COUNT_INVALID",
      "RCAEval source must contain exactly 735 cases"
    );
  }


  for (
    const [
      suite,
      expected,
    ]
    of Object.entries(
      RCAEVAL_EXPECTED_SUITE_COUNTS
    )
  ) {
    if (
      manifest
        .suiteCounts
        ?.[
          suite
        ] !==
      expected
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_SUITE_COVERAGE_INVALID",
        `${suite} must contain ${expected} cases`
      );
    }
  }


  const ids =
    new Set();


  const partitions =
    new Set();


  const groupPartitions =
    new Map();


  for (
    const item
    of manifest.cases
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_CASE_INVALID",
        "every RCAEval manifest case must be an object"
      );
    }


    if (
      ids.has(
        item.benchmarkCaseId
      )
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_DUPLICATE_CASE",
        `duplicate case ${item.benchmarkCaseId}`
      );
    }


    ids.add(
      item.benchmarkCaseId
    );


    if (
      item.evidenceGrade !==
        "E2" ||

      item
        .groundTruthAgentVisible !==
        false
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_ANSWER_SEALING_INVALID",
        "every RCAEval case must remain sealed E2 evidence"
      );
    }


    if (
      item.trainingEligible !==
        false
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_TRAINING_CONTAMINATION",
        "RCAEval certification cases cannot be marked as model-training data"
      );
    }


    if (
      !REQUIRED_PARTITIONS.includes(
        item.partition
      )
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_PARTITION_INVALID",
        `invalid RCAEval partition ${item.partition}`
      );
    }


    partitions.add(
      item.partition
    );


    const prior =
      groupPartitions.get(
        item.groupDigest
      );


    if (
      prior &&
      prior !==
        item.partition
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_GROUP_LEAKAGE",
        "same RCAEval root-cause/fault group crosses source partitions"
      );
    }


    groupPartitions.set(
      item.groupDigest,
      item.partition
    );
  }


  for (
    const partition
    of REQUIRED_PARTITIONS
  ) {
    if (
      !partitions.has(
        partition
      )
    ) {
      throw coverageError(
        "REALITY_RCAEVAL_SOURCE_PARTITION_COVERAGE_INVALID",
        `${partition} RCAEval partition is empty`
      );
    }
  }


  if (
    manifest
      .holdoutRules
      ?.retrievalAllowed !==
      false ||

    manifest
      .holdoutRules
      ?.trainingAllowed !==
      false ||

    manifest
      .holdoutRules
      ?.agentGroundTruthAllowed !==
      false
  ) {
    throw coverageError(
      "REALITY_RCAEVAL_SOURCE_HOLDOUT_NOT_SEALED",
      "RCAEval holdout must remain excluded from retrieval, training and answer exposure"
    );
  }


  return {
    version:
      RCAEVAL_SOURCE_COVERAGE_VERSION,

    certificationScope:
      "RCAEVAL_SOURCE_ONLY",

    phaseWideCorpusCertified:
      false,

    status:
      "PASS",

    benchmarkId:
      "RCAEVAL",

    evidenceGrade:
      "E2",

    caseCount:
      735,

    suiteCount:
      9,

    partitionCount:
      4,

    unsafeCases:
      0,

    groundTruthAgentVisible:
      false,

    benchmarkScoreIsProductionProof:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


module.exports = {
  RCAEVAL_SOURCE_COVERAGE_VERSION,

  REALITY_CORPUS_COVERAGE_VERSION,

  RCAEVAL_EXPECTED_SUITE_COUNTS,

  REQUIRED_PARTITIONS,

  certifyRcaEvalCoverage,
};