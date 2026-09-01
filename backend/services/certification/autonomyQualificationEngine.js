"use strict";


const {
  AUTONOMY_LEVEL,

  AUTONOMY_LEVEL_DEFINITION,

  DOMAIN_AUTONOMY_CEILING,

  autonomyRank,

  lowerAutonomyLevel,

  capAutonomyForDomain,

  isKnownCertificationDomain,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  EVIDENCE_SUFFICIENCY_STATUS,
} =
  require(
    "../../constants/recoveryCertificationMetrics"
  );


const {
  AUTONOMY_QUALIFICATION_POLICY_VERSION,

  AUTONOMY_PROMOTION_MATRIX,
} =
  require(
    "../../constants/autonomyQualificationPolicy"
  );


const {
  AutonomySafetyCapService,
} =
  require(
    "./autonomySafetyCapService"
  );


class AutonomyQualificationEngine {
  constructor(
    options = {}
  ) {
    this.safetyCapService =
      options.safetyCapService ||
      new AutonomySafetyCapService();


    this.matrix =
      options.matrix ||
      AUTONOMY_PROMOTION_MATRIX;
  }


  evaluate(
    input = {}
  ) {
    const statistics =
      input.statistics;


    const sufficiency =
      input.sufficiency;


    const domain =
      input.domain;


    assertInput(
      statistics,
      sufficiency,
      domain
    );


    /*
     * ========================================================================
     * 1. EVIDENCE-DERIVED LEVEL
     * ========================================================================
     */


    const levelEvaluations =
      {};


    let evidenceDerivedLevel =
      AUTONOMY_LEVEL.L0;


    for (
      const level
      of [
        AUTONOMY_LEVEL.L1,

        AUTONOMY_LEVEL.L2,

        AUTONOMY_LEVEL.L3,

        AUTONOMY_LEVEL.L4,

        AUTONOMY_LEVEL.L5,
      ]
    ) {
      const evaluation =
        evaluateLevel({
          level,

          criteria:
            this.matrix[
              level
            ],

          statistics,

          sufficiency,
        });


      levelEvaluations[
        level
      ] =
        evaluation;


      if (
        evaluation.pass
      ) {
        evidenceDerivedLevel =
          level;
      } else {
        /*
         * The autonomy ladder is monotonic.
         *
         * If L3 cannot be earned, L4/L5 cannot be earned either.
         */
        break;
      }
    }


    /*
     * ========================================================================
     * 2. DOMAIN CEILING
     * ========================================================================
     */


    const domainCeiling =
      DOMAIN_AUTONOMY_CEILING[
        domain
      ];


    const domainAdjustedLevel =
      capAutonomyForDomain(
        evidenceDerivedLevel,

        domain
      );


    /*
     * ========================================================================
     * 3. SAFETY CAP
     * ========================================================================
     */


    const safetyCap =
      this.safetyCapService
        .evaluate({
          statistics,

          requestedLevel:
            domainAdjustedLevel,

          productionBoundaryViolationCount:
            input
              .productionBoundaryViolationCount ??
            0,

          riskyMutation:
            input.riskyMutation ===
            true,
        });


    const qualifiedLevel =
      lowerAutonomyLevel(
        domainAdjustedLevel,

        safetyCap.maximumLevel
      );


    /*
     * ========================================================================
     * 4. REPUTATION MOVEMENT
     * ========================================================================
     */


    const previousLevel =
      input.previousLevel ||
      null;


    if (
      previousLevel !==
        null
    ) {
      autonomyRank(
        previousLevel
      );
    }


    const demoted =
      previousLevel !==
        null &&

      autonomyRank(
        qualifiedLevel
      ) <
      autonomyRank(
        previousLevel
      );


    const promoted =
      previousLevel !==
        null &&

      autonomyRank(
        qualifiedLevel
      ) >
      autonomyRank(
        previousLevel
      );


    const definition =
      AUTONOMY_LEVEL_DEFINITION[
        qualifiedLevel
      ];


    /*
     * Certification means eligibility only.
     *
     * Even L4/L5 will later pass through:
     *
     * tenant ceiling
     * environment ceiling
     * risk ceiling
     * policy
     * kill switch
     * canonical execution authorization
     */
    return Object.freeze({
      qualificationVersion:
        AUTONOMY_QUALIFICATION_POLICY_VERSION,

      domain,

      evidenceDerivedLevel,

      domainCeiling,

      domainAdjustedLevel,

      safetyCap,

      qualifiedLevel,

      levelDefinition:
        definition,

      autonomousRecoveryEligible:
        qualifiedLevel ===
          AUTONOMY_LEVEL.L4 ||

        qualifiedLevel ===
          AUTONOMY_LEVEL.L5,

      approvalRequired:
        qualifiedLevel ===
        AUTONOMY_LEVEL.L3,

      previousLevel,

      promoted,

      demoted,

      demotionFrom:
        demoted
          ? previousLevel
          : null,

      demotionTo:
        demoted
          ? qualifiedLevel
          : null,

      levelEvaluations:
        Object.freeze(
          levelEvaluations
        ),

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }
}


/*
 * ============================================================================
 * PROMOTION MATRIX EVALUATION
 * ============================================================================
 */


function evaluateLevel({
  level,

  criteria,

  statistics,

  sufficiency,
}) {
  const checks =
    [];


  if (
    !criteria
  ) {
    throw qualificationError(
      "AUTONOMY_PROMOTION_CRITERIA_MISSING",

      `Promotion criteria are missing for ${level}`
    );
  }


  pushMinimum(
    checks,

    "MINIMUM_SAMPLES",

    statistics.totalTests,

    criteria.minimumSamples
  );


  pushMinimum(
    checks,

    "MINIMUM_INDEPENDENT_EXPERIMENTS",

    statistics
      .independentExperimentCount,

    criteria
      .minimumIndependentExperiments
  );


  pushMinimum(
    checks,

    "MINIMUM_FAILURE_MODES",

    statistics.failureModeCount,

    criteria.minimumFailureModes
  );


  pushMinimum(
    checks,

    "MINIMUM_INFRASTRUCTURE_CONTEXTS",

    statistics
      .infrastructureContextCount,

    criteria
      .minimumInfrastructureContexts
  );


  if (
    criteria
      .requireEvidenceSufficient ===
    true
  ) {
    checks.push(
      check(
        "EVIDENCE_SUFFICIENT",

        sufficiency.status,

        EVIDENCE_SUFFICIENCY_STATUS
          .SUFFICIENT,

        sufficiency.status ===
        EVIDENCE_SUFFICIENCY_STATUS
          .SUFFICIENT
      )
    );
  }


  /*
   * Good outcomes:
   * conservative LOWER confidence bound.
   */


  pushLowerBound(
    checks,

    "DIAGNOSIS_CORRECT_LOWER95",

    statistics
      .rates
      ?.diagnosisCorrect,

    criteria
      .diagnosisCorrectLower95
  );


  pushLowerBound(
    checks,

    "RECOVERY_SELECTION_CORRECT_LOWER95",

    statistics
      .rates
      ?.recoverySelectionCorrect,

    criteria
      .recoverySelectionCorrectLower95
  );


  pushLowerBound(
    checks,

    "EXECUTION_SUCCESS_LOWER95",

    statistics
      .rates
      ?.executionSuccess,

    criteria
      .executionSuccessLower95
  );


  pushLowerBound(
    checks,

    "VERIFIED_RECOVERY_LOWER95",

    statistics
      .rates
      ?.verifiedRecovery,

    criteria
      .verifiedRecoveryLower95
  );


  /*
   * Bad outcomes:
   * conservative UPPER confidence bound.
   */


  pushUpperBound(
    checks,

    "FALSE_RECOVERY_UPPER95",

    statistics
      .rates
      ?.falseRecovery,

    criteria
      .falseRecoveryUpper95
  );


  pushUpperBound(
    checks,

    "RECURRENCE_UPPER95",

    statistics
      .rates
      ?.recurrence,

    criteria
      .recurrenceUpper95
  );


  /*
   * Rollback is optional when there was genuinely no rollback case.
   *
   * Risky actions get a separate mandatory rollback safety cap.
   */


  pushLowerBound(
    checks,

    "ROLLBACK_SUCCESS_LOWER95",

    statistics
      .rates
      ?.rollbackSuccess,

    criteria
      .rollbackSuccessLower95,

    {
      optionalWhenUnassessed:
        true,
    }
  );


  pushRate(
    checks,

    "VERIFICATION_COVERAGE",

    statistics
      .rates
      ?.verificationCoverage,

    criteria
      .verificationCoverage
  );


  pushRate(
    checks,

    "EVIDENCE_COMPLETENESS",

    statistics
      .rates
      ?.evidenceCompleteness,

    criteria
      .evidenceCompleteness
  );


  if (
    criteria
      .requireCleanSafetyHistory ===
    true
  ) {
    checks.push(
      check(
        "CLEAN_SAFETY_HISTORY",

        statistics
          .safety
          ?.clean ===
        true,

        true,

        statistics
          .safety
          ?.clean ===
        true
      )
    );
  }


  const failedChecks =
    checks.filter(
      item =>
        item.pass ===
        false
    );


  return Object.freeze({
    level,

    pass:
      failedChecks.length ===
      0,

    checks:
      Object.freeze(
        checks
      ),

    failedChecks:
      Object.freeze(
        failedChecks.map(
          item =>
            item.key
        )
      ),

    executionAuthorized:
      false,
  });
}


/*
 * ============================================================================
 * CHECK HELPERS
 * ============================================================================
 */


function pushMinimum(
  checks,
  key,
  actual,
  expected
) {
  if (
    expected ===
    undefined
  ) {
    return;
  }


  checks.push(
    check(
      key,

      actual ??
        0,

      expected,

      (
        actual ??
        0
      ) >=
      expected
    )
  );
}


function pushLowerBound(
  checks,
  key,
  metric,
  expected,
  options =
    {}
) {
  if (
    expected ===
    undefined
  ) {
    return;
  }


  const samples =
    metric
      ?.denominator ??
    0;


  const actual =
    metric
      ?.confidence
      ?.lower ??
    null;


  if (
    options
      .optionalWhenUnassessed ===
      true &&

    samples ===
      0
  ) {
    checks.push(
      Object.freeze({
        key,

        actual:
          null,

        expected,

        pass:
          true,

        notAssessed:
          true,
      })
    );


    return;
  }


  checks.push(
    check(
      key,

      actual,

      expected,

      actual !==
        null &&

      actual >=
        expected
    )
  );
}


function pushUpperBound(
  checks,
  key,
  metric,
  expected
) {
  if (
    expected ===
    undefined
  ) {
    return;
  }


  const actual =
    metric
      ?.confidence
      ?.upper ??
    null;


  checks.push(
    check(
      key,

      actual,

      expected,

      actual !==
        null &&

      actual <=
        expected
    )
  );
}


function pushRate(
  checks,
  key,
  metric,
  expected
) {
  if (
    expected ===
    undefined
  ) {
    return;
  }


  const actual =
    metric
      ?.rate ??
    null;


  checks.push(
    check(
      key,

      actual,

      expected,

      actual !==
        null &&

      actual >=
        expected
    )
  );
}


function check(
  key,
  actual,
  expected,
  pass
) {
  return Object.freeze({
    key,

    actual,

    expected,

    pass:
      pass ===
      true,
  });
}


/*
 * ============================================================================
 * INPUT SAFETY
 * ============================================================================
 */


function assertInput(
  statistics,
  sufficiency,
  domain
) {
  if (
    !statistics ||
    typeof statistics !==
      "object"
  ) {
    throw qualificationError(
      "AUTONOMY_QUALIFICATION_STATISTICS_REQUIRED",

      "statistics are required"
    );
  }


  if (
    !sufficiency ||
    typeof sufficiency !==
      "object"
  ) {
    throw qualificationError(
      "AUTONOMY_QUALIFICATION_SUFFICIENCY_REQUIRED",

      "sufficiency result is required"
    );
  }


  if (
    !isKnownCertificationDomain(
      domain
    )
  ) {
    throw qualificationError(
      "AUTONOMY_QUALIFICATION_DOMAIN_INVALID",

      `Unknown certification domain ${domain}`
    );
  }


  if (
    statistics.executionAuthorized ===
      true ||

    sufficiency.executionAuthorized ===
      true
  ) {
    throw qualificationError(
      "AUTONOMY_QUALIFICATION_AUTHORITY_LEAK",

      "Qualification inputs cannot grant execution authorization"
    );
  }
}


function qualificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "AutonomyQualificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  AutonomyQualificationEngine,

  evaluateLevel,
};