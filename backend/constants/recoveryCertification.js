"use strict";


const RECOVERY_CERTIFICATION_CONTRACT_VERSION =
  "22.0-22.1-v1";


const AUTONOMY_LEVEL =
  Object.freeze({
    L0:
      "L0",

    L1:
      "L1",

    L2:
      "L2",

    L3:
      "L3",

    L4:
      "L4",

    L5:
      "L5",
  });


const AUTONOMY_LEVEL_VALUES =
  Object.freeze(
    Object.values(
      AUTONOMY_LEVEL
    )
  );


const AUTONOMY_LEVEL_RANK =
  Object.freeze({
    [AUTONOMY_LEVEL.L0]:
      0,

    [AUTONOMY_LEVEL.L1]:
      1,

    [AUTONOMY_LEVEL.L2]:
      2,

    [AUTONOMY_LEVEL.L3]:
      3,

    [AUTONOMY_LEVEL.L4]:
      4,

    [AUTONOMY_LEVEL.L5]:
      5,
  });


const AUTONOMY_LEVEL_DEFINITION =
  Object.freeze({
    [AUTONOMY_LEVEL.L0]:
      Object.freeze({
        name:
          "OBSERVE",

        description:
          "Observe signals, state and evidence only.",

        executionMode:
          "NONE",

        autonomousExecution:
          false,
      }),

    [AUTONOMY_LEVEL.L1]:
      Object.freeze({
        name:
          "DIAGNOSE",

        description:
          "Diagnose incidents using available evidence without trusted executable recovery recommendation.",

        executionMode:
          "NONE",

        autonomousExecution:
          false,
      }),

    [AUTONOMY_LEVEL.L2]:
      Object.freeze({
        name:
          "RECOMMEND",

        description:
          "Select and recommend recovery while execution remains outside the certification decision.",

        executionMode:
          "RECOMMENDATION_ONLY",

        autonomousExecution:
          false,
      }),

    [AUTONOMY_LEVEL.L3]:
      Object.freeze({
        name:
          "APPROVAL_GATED_EXECUTION",

        description:
          "Execution may occur only after the existing canonical approval and authorization path grants the exact action.",

        executionMode:
          "APPROVAL_REQUIRED",

        autonomousExecution:
          false,
      }),

    [AUTONOMY_LEVEL.L4]:
      Object.freeze({
        name:
          "BOUNDED_AUTONOMOUS_RECOVERY",

        description:
          "Autonomous recovery may be eligible only inside explicitly certified constraints and still requires canonical runtime authorization.",

        executionMode:
          "BOUNDED_AUTONOMY_ELIGIBLE",

        autonomousExecution:
          true,
      }),

    [AUTONOMY_LEVEL.L5]:
      Object.freeze({
        name:
          "HIGH_CONFIDENCE_AUTONOMOUS_RECOVERY",

        description:
          "High-confidence autonomous recovery may be eligible only inside an explicitly authorized, continuously qualified domain and still requires canonical runtime authorization.",

        executionMode:
          "HIGH_CONFIDENCE_AUTONOMY_ELIGIBLE",

        autonomousExecution:
          true,
      }),
  });


const CERTIFICATION_STATUS =
  Object.freeze({
    DRAFT:
      "DRAFT",

    EVALUATING:
      "EVALUATING",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    CERTIFIED:
      "CERTIFIED",

    SUSPENDED:
      "SUSPENDED",

    REVOKED:
      "REVOKED",

    EXPIRED:
      "EXPIRED",

    FAILED:
      "FAILED",
  });


const CERTIFICATION_STATUS_VALUES =
  Object.freeze(
    Object.values(
      CERTIFICATION_STATUS
    )
  );


const CERTIFICATION_DOMAIN =
  Object.freeze({
    SOFTWARE_INFRASTRUCTURE:
      "SOFTWARE_INFRASTRUCTURE",

    DATA_INFRASTRUCTURE:
      "DATA_INFRASTRUCTURE",

    SECURITY_SENSITIVE:
      "SECURITY_SENSITIVE",

    PHYSICAL_SYSTEM:
      "PHYSICAL_SYSTEM",

    SAFETY_CRITICAL:
      "SAFETY_CRITICAL",
  });


const CERTIFICATION_DOMAIN_VALUES =
  Object.freeze(
    Object.values(
      CERTIFICATION_DOMAIN
    )
  );


/**
 * These are Phase-22 architecture ceilings, not execution grants.
 *
 * Software infrastructure may eventually qualify as high as L5.
 * Data infrastructure remains capped at bounded autonomous recovery.
 * Security-sensitive capabilities remain approval-gated by default.
 *
 * Physical and safety-critical systems deliberately remain below
 * autonomous execution until a future, separate certification framework
 * is created for those domains.
 */
const DOMAIN_AUTONOMY_CEILING =
  Object.freeze({
    [CERTIFICATION_DOMAIN.SOFTWARE_INFRASTRUCTURE]:
      AUTONOMY_LEVEL.L5,

    [CERTIFICATION_DOMAIN.DATA_INFRASTRUCTURE]:
      AUTONOMY_LEVEL.L4,

    [CERTIFICATION_DOMAIN.SECURITY_SENSITIVE]:
      AUTONOMY_LEVEL.L3,

    [CERTIFICATION_DOMAIN.PHYSICAL_SYSTEM]:
      AUTONOMY_LEVEL.L2,

    [CERTIFICATION_DOMAIN.SAFETY_CRITICAL]:
      AUTONOMY_LEVEL.L1,
  });


const CERTIFICATION_SCOPE_VERSION =
  "22.1-capability-identity-v1";


function isKnownAutonomyLevel(
  value
) {
  return (
    typeof value ===
      "string" &&

    AUTONOMY_LEVEL_VALUES
      .includes(
        value
      )
  );
}


function isKnownCertificationStatus(
  value
) {
  return (
    typeof value ===
      "string" &&

    CERTIFICATION_STATUS_VALUES
      .includes(
        value
      )
  );
}


function isKnownCertificationDomain(
  value
) {
  return (
    typeof value ===
      "string" &&

    CERTIFICATION_DOMAIN_VALUES
      .includes(
        value
      )
  );
}


function autonomyRank(
  level
) {
  if (
    !isKnownAutonomyLevel(
      level
    )
  ) {
    const error =
      new Error(
        `Unknown autonomy level ${level}`
      );

    error.code =
      "AUTONOMY_LEVEL_UNKNOWN";

    error.executionAuthorized =
      false;

    throw error;
  }


  return AUTONOMY_LEVEL_RANK[
    level
  ];
}


function lowerAutonomyLevel(
  left,
  right
) {
  return autonomyRank(
    left
  ) <=
    autonomyRank(
      right
    )
    ? left
    : right;
}


function capAutonomyForDomain(
  requestedLevel,
  domain
) {
  if (
    !isKnownCertificationDomain(
      domain
    )
  ) {
    const error =
      new Error(
        `Unknown certification domain ${domain}`
      );

    error.code =
      "CERTIFICATION_DOMAIN_UNKNOWN";

    error.executionAuthorized =
      false;

    throw error;
  }


  return lowerAutonomyLevel(
    requestedLevel,
    DOMAIN_AUTONOMY_CEILING[
      domain
    ]
  );
}


module.exports = {
  RECOVERY_CERTIFICATION_CONTRACT_VERSION,

  AUTONOMY_LEVEL,
  AUTONOMY_LEVEL_VALUES,
  AUTONOMY_LEVEL_RANK,
  AUTONOMY_LEVEL_DEFINITION,

  CERTIFICATION_STATUS,
  CERTIFICATION_STATUS_VALUES,

  CERTIFICATION_DOMAIN,
  CERTIFICATION_DOMAIN_VALUES,
  DOMAIN_AUTONOMY_CEILING,

  CERTIFICATION_SCOPE_VERSION,

  isKnownAutonomyLevel,
  isKnownCertificationStatus,
  isKnownCertificationDomain,
  autonomyRank,
  lowerAutonomyLevel,
  capAutonomyForDomain,
};