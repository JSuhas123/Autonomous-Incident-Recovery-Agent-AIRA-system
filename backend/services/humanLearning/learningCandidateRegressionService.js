"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertValidationCannotAuthorize,

  VALIDATION_STAGE,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


const {
  VALIDATION_PROFILE,
} =
  require(
    "../../contracts/humanLearningValidationDecision"
  );


const REPLAY_ROLE =
  Object.freeze({
    SOURCE_INCIDENT:
      "SOURCE_INCIDENT",

    SIMILAR_CASE:
      "SIMILAR_CASE",

    NEGATIVE_CASE:
      "NEGATIVE_CASE",

    COUNTEREXAMPLE:
      "COUNTEREXAMPLE",
  });


function normalizeRole(
  value
) {
  return typeof value ===
    "string"
    ? value.trim().toUpperCase()
    : "";
}


function getRole(
  item = {}
) {
  return normalizeRole(
    item?.replayCase?.bindingRole ||

    item?.bindingRole ||

    item?.role
  );
}


function resultPassed(
  item = {}
) {
  /*
   * Prefer explicit evaluator semantics.
   *
   * candidateBehaviorCorrect is stronger than
   * simply observing that a replay command ran.
   */
  if (
    typeof item
      .candidateBehaviorCorrect ===
      "boolean"
  ) {
    return item
      .candidateBehaviorCorrect;
  }


  if (
    typeof item
      .replay
      ?.candidateBehaviorCorrect ===
      "boolean"
  ) {
    return item
      .replay
      .candidateBehaviorCorrect;
  }


  if (
    typeof item.passed ===
      "boolean"
  ) {
    return item.passed;
  }


  if (
    typeof item
      .replay
      ?.passed ===
      "boolean"
  ) {
    return item
      .replay
      .passed;
  }


  return false;
}


function isFalsePositive(
  item = {}
) {
  return (
    item.falsePositive ===
      true ||

    item.replay
      ?.falsePositive ===
      true
  );
}


function isRegression(
  item = {}
) {
  return (
    item.regression ===
      true ||

    item.replay
      ?.regression ===
      true
  );
}


function groundTruthExposed(
  item = {}
) {
  return (
    item.groundTruthExposed ===
      true ||

    item.replay
      ?.groundTruthExposed ===
      true ||

    item.replay
      ?.groundTruthAgentVisible ===
      true
  );
}


function authorityLeaked(
  item = {}
) {
  return (
    item.executionAuthorized ===
      true ||

    item.productionAuthorized ===
      true ||

    item.replay
      ?.executionAuthorized ===
      true ||

    item.replay
      ?.productionAuthorized ===
      true
  );
}


function requiredCoverage(
  profile
) {
  switch (
    profile
  ) {
    case VALIDATION_PROFILE
      .HIGH_RISK:

    case VALIDATION_PROFILE
      .GLOBAL_PROMOTION:

      return {
        sourceIncident:
          1,

        similarCase:
          2,

        negativeCase:
          1,

        counterexample:
          1,
      };


    case VALIDATION_PROFILE
      .STANDARD:

    default:

      return {
        sourceIncident:
          1,

        similarCase:
          1,

        negativeOrCounterexample:
          1,
      };
  }
}


class LearningCandidateRegressionService {
  constructor(
    options = {}
  ) {
    this.validationRepository =
      options.validationRepository;

    this.maximumFalsePositiveRate =
      Number.isFinite(
        Number(
          options.maximumFalsePositiveRate
        )
      )
        ? Math.max(
            0,
            Number(
              options.maximumFalsePositiveRate
            )
          )
        : 0;
  }


  async validate(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    if (
      !this.validationRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_VALIDATION_REPOSITORY_REQUIRED",

        "Validation repository is required",

        500
      );
    }


    const replayResults =
      Array.isArray(
        input.replayResults
      )
        ? input.replayResults
        : [];


    if (
      replayResults.length ===
      0
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_REGRESSION_RESULTS_REQUIRED",

        (
          "Regression evaluation requires " +
          "Reality replay results"
        )
      );
    }


    const profile =
      input.validationProfile ||

      VALIDATION_PROFILE
        .STANDARD;


    const counts = {
      sourceIncident:
        0,

      similarCase:
        0,

      negativeCase:
        0,

      counterexample:
        0,
    };


    let passedCount =
      0;

    let falsePositiveCount =
      0;

    let regressionCount =
      0;

    let groundTruthLeakCount =
      0;

    let authorityLeakCount =
      0;


    for (
      const result
      of replayResults
    ) {
      const role =
        getRole(
          result
        );


      switch (
        role
      ) {
        case REPLAY_ROLE
          .SOURCE_INCIDENT:

          counts
            .sourceIncident +=
            1;

          break;


        case REPLAY_ROLE
          .SIMILAR_CASE:

          counts
            .similarCase +=
            1;

          break;


        case REPLAY_ROLE
          .NEGATIVE_CASE:

          counts
            .negativeCase +=
            1;

          break;


        case REPLAY_ROLE
          .COUNTEREXAMPLE:

          counts
            .counterexample +=
            1;

          break;


        default:

          break;
      }


      if (
        resultPassed(
          result
        )
      ) {
        passedCount +=
          1;
      }


      if (
        isFalsePositive(
          result
        )
      ) {
        falsePositiveCount +=
          1;
      }


      if (
        isRegression(
          result
        )
      ) {
        regressionCount +=
          1;
      }


      if (
        groundTruthExposed(
          result
        )
      ) {
        groundTruthLeakCount +=
          1;
      }


      if (
        authorityLeaked(
          result
        )
      ) {
        authorityLeakCount +=
          1;
      }
    }


    const requirements =
      requiredCoverage(
        profile
      );


    let coveragePass =
      (
        counts.sourceIncident >=
          requirements
            .sourceIncident
      )
      &&
      (
        counts.similarCase >=
          requirements
            .similarCase
      );


    if (
      requirements
        .negativeOrCounterexample !==
      undefined
    ) {
      coveragePass =
        coveragePass
        &&
        (
          (
            counts.negativeCase +
            counts.counterexample
          )
          >=
          requirements
            .negativeOrCounterexample
        );
    } else {
      coveragePass =
        coveragePass
        &&
        (
          counts.negativeCase >=
            requirements
              .negativeCase
        )
        &&
        (
          counts.counterexample >=
            requirements
              .counterexample
        );
    }


    const falsePositiveRate =
      replayResults.length >
        0
        ? (
            falsePositiveCount /
            replayResults.length
          )
        : 1;


    const allBehaviorsCorrect =
      passedCount ===
      replayResults.length;


    const falsePositivePass =
      falsePositiveRate <=
      this.maximumFalsePositiveRate;


    const regressionPass =
      regressionCount ===
      0;


    const isolationPass =
      groundTruthLeakCount ===
        0
      &&
      authorityLeakCount ===
        0;


    const passed =
      coveragePass
      &&
      allBehaviorsCorrect
      &&
      falsePositivePass
      &&
      regressionPass
      &&
      isolationPass;


    const metrics = {
      validationProfile:
        profile,

      caseCount:
        replayResults.length,

      passedCount,

      coverage: {
        ...counts,

        pass:
          coveragePass,
      },

      falsePositiveCount,

      falsePositiveRate,

      maximumFalsePositiveRate:
        this.maximumFalsePositiveRate,

      regressionCount,

      groundTruthLeakCount,

      authorityLeakCount,

      allBehaviorsCorrect,

      falsePositivePass,

      regressionPass,

      isolationPass,
    };


    await this
      .validationRepository
      .addEvidence({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        stageType:
          VALIDATION_STAGE
            .REGRESSION,

        evidenceType:
          "LEARNING_REGRESSION_EVALUATION",

        sourceSystem:
          "AIRA_HUMAN_LEARNING",

        sourceReference:
          input.candidateId ||
          null,

        evidencePayload:
          metrics,

        executionAuthorized:
          false,
      });


    await this
      .validationRepository
      .setStageResult({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        validationRunId:
          input.validationRunId,

        stageType:
          VALIDATION_STAGE
            .REGRESSION,

        passed,

        metrics,

        reason:
          passed
            ? (
                "Candidate passed multi-case " +
                "regression evaluation"
              )
            : (
                "Candidate failed coverage, behavior, " +
                "false-positive, regression, or isolation checks"
              ),

        executionAuthorized:
          false,
      });


    return {
      stage:
        VALIDATION_STAGE
          .REGRESSION,

      passed,

      metrics,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateRegressionService,

  requiredCoverage,
};