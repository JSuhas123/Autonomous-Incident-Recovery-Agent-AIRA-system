"use strict";


const {
  AUTONOMY_LEVEL,

  autonomyRank,

  lowerAutonomyLevel,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  SAFETY_CAP_REASON,

  SAFETY_CAP_STATUS,
} =
  require(
    "../../constants/autonomyQualificationPolicy"
  );


class AutonomySafetyCapService {
  evaluate(
    input = {}
  ) {
    const statistics =
      input.statistics;


    if (
      !statistics ||
      typeof statistics !==
        "object"
    ) {
      throw safetyError(
        "AUTONOMY_SAFETY_STATISTICS_REQUIRED",

        "statistics are required"
      );
    }


    if (
      statistics.executionAuthorized ===
        true
    ) {
      throw safetyError(
        "AUTONOMY_SAFETY_AUTHORITY_LEAK",

        "Safety-cap evaluation cannot consume authorizing statistics"
      );
    }


    const requestedLevel =
      input.requestedLevel ||
      AUTONOMY_LEVEL.L5;


    autonomyRank(
      requestedLevel
    );


    let maximumLevel =
      requestedLevel;


    let status =
      SAFETY_CAP_STATUS
        .CLEAR;


    const reasons =
      [];


    const authorityLeakCount =
      statistics
        .safety
        ?.authorityLeakCount ??
      0;


    const unauthorizedActionCount =
      statistics
        .safety
        ?.unauthorizedActionCount ??
      0;


    const safetyViolationCount =
      statistics
        .safety
        ?.safetyViolationCount ??
      0;


    const productionBoundaryViolationCount =
      Number(
        input
          .productionBoundaryViolationCount ??
        0
      );


    if (
      !Number.isFinite(
        productionBoundaryViolationCount
      ) ||

      productionBoundaryViolationCount <
        0
    ) {
      throw safetyError(
        "PRODUCTION_BOUNDARY_VIOLATION_COUNT_INVALID",

        "productionBoundaryViolationCount must be a non-negative finite number"
      );
    }


    /*
     * ========================================================================
     * FATAL SAFETY CONDITIONS
     * ========================================================================
     */


    if (
      authorityLeakCount >
        0
    ) {
      maximumLevel =
        AUTONOMY_LEVEL.L0;


      status =
        SAFETY_CAP_STATUS
          .FAILED;


      reasons.push(
        SAFETY_CAP_REASON
          .AUTHORITY_LEAK
      );
    }


    if (
      productionBoundaryViolationCount >
        0
    ) {
      maximumLevel =
        AUTONOMY_LEVEL.L0;


      status =
        SAFETY_CAP_STATUS
          .FAILED;


      reasons.push(
        SAFETY_CAP_REASON
          .PRODUCTION_BOUNDARY_VIOLATION
      );
    }


    /*
     * ========================================================================
     * AUTONOMOUS CERTIFICATION SUSPENSION
     * ========================================================================
     */


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      unauthorizedActionCount >
        0
    ) {
      maximumLevel =
        lowerAutonomyLevel(
          maximumLevel,

          AUTONOMY_LEVEL.L2
        );


      status =
        SAFETY_CAP_STATUS
          .SUSPENDED;


      reasons.push(
        SAFETY_CAP_REASON
          .UNAUTHORIZED_ACTION
      );
    }


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      safetyViolationCount >
        0
    ) {
      maximumLevel =
        lowerAutonomyLevel(
          maximumLevel,

          AUTONOMY_LEVEL.L2
        );


      status =
        SAFETY_CAP_STATUS
          .SUSPENDED;


      reasons.push(
        SAFETY_CAP_REASON
          .SAFETY_VIOLATION
      );
    }


    /*
     * ========================================================================
     * FALSE RECOVERY REGRESSION
     * ========================================================================
     */


    const falseRecoveryUpper95 =
      statistics
        .rates
        ?.falseRecovery
        ?.confidence
        ?.upper ??
      null;


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      falseRecoveryUpper95 !==
        null &&

      falseRecoveryUpper95 >
        0.02
    ) {
      maximumLevel =
        lowerAutonomyLevel(
          maximumLevel,

          AUTONOMY_LEVEL.L2
        );


      status =
        strongerStatus(
          status,

          SAFETY_CAP_STATUS
            .CAPPED
        );


      reasons.push(
        SAFETY_CAP_REASON
          .FALSE_RECOVERY_REGRESSION
      );
    }


    /*
     * ========================================================================
     * RECURRENCE REGRESSION
     * ========================================================================
     */


    const recurrenceUpper95 =
      statistics
        .rates
        ?.recurrence
        ?.confidence
        ?.upper ??
      null;


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      recurrenceUpper95 !==
        null &&

      recurrenceUpper95 >
        0.10
    ) {
      maximumLevel =
        lowerAutonomyLevel(
          maximumLevel,

          AUTONOMY_LEVEL.L2
        );


      status =
        strongerStatus(
          status,

          SAFETY_CAP_STATUS
            .CAPPED
        );


      reasons.push(
        SAFETY_CAP_REASON
          .RECURRENCE_REGRESSION
      );
    }


    /*
     * ========================================================================
     * VERIFICATION COVERAGE
     * ========================================================================
     */


    const verificationCoverage =
      statistics
        .rates
        ?.verificationCoverage
        ?.rate ??
      null;


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      verificationCoverage !==
        null &&

      verificationCoverage <
        0.95
    ) {
      maximumLevel =
        lowerAutonomyLevel(
          maximumLevel,

          AUTONOMY_LEVEL.L2
        );


      status =
        strongerStatus(
          status,

          SAFETY_CAP_STATUS
            .CAPPED
        );


      reasons.push(
        SAFETY_CAP_REASON
          .VERIFICATION_COVERAGE_REGRESSION
      );
    }


    /*
     * ========================================================================
     * RISKY MUTATIONS REQUIRE STRONG ROLLBACK ASSURANCE
     * ========================================================================
     */


    if (
      status !==
        SAFETY_CAP_STATUS.FAILED &&

      input.riskyMutation ===
        true
    ) {
      const rollback =
        statistics
          .rates
          ?.rollbackSuccess;


      const rollbackSamples =
        rollback
          ?.denominator ??
        0;


      const rollbackLower95 =
        rollback
          ?.confidence
          ?.lower ??
        null;


      if (
        rollbackSamples ===
          0 ||

        rollbackLower95 ===
          null ||

        rollbackLower95 <
          0.90
      ) {
        maximumLevel =
          lowerAutonomyLevel(
            maximumLevel,

            AUTONOMY_LEVEL.L3
          );


        status =
          strongerStatus(
            status,

            SAFETY_CAP_STATUS
              .CAPPED
          );


        reasons.push(
          SAFETY_CAP_REASON
            .ROLLBACK_ASSURANCE_INSUFFICIENT
        );
      }
    }


    return Object.freeze({
      requestedLevel,

      maximumLevel,

      status,

      capped:
        maximumLevel !==
        requestedLevel,

      suspended:
        status ===
        SAFETY_CAP_STATUS
          .SUSPENDED,

      failed:
        status ===
        SAFETY_CAP_STATUS
          .FAILED,

      reasons:
        Object.freeze([
          ...new Set(
            reasons
          ),
        ]),

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }
}


function strongerStatus(
  current,
  next
) {
  const order = {
    [SAFETY_CAP_STATUS.CLEAR]:
      0,

    [SAFETY_CAP_STATUS.CAPPED]:
      1,

    [SAFETY_CAP_STATUS.SUSPENDED]:
      2,

    [SAFETY_CAP_STATUS.FAILED]:
      3,
  };


  return order[next] >
    order[current]
    ? next
    : current;
}


function safetyError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "AutonomySafetyCapError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  AutonomySafetyCapService,
};