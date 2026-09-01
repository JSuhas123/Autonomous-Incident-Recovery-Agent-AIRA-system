"use strict";


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,
} =
  require(
    "./recoveryCertification"
  );


const {
  RESOURCE_CAPABILITIES,
} =
  require(
    "./resourceCapabilities"
  );


const SAFETY_CRITICAL_BOUNDARY_VERSION =
  "22.12-safety-critical-boundary-v1";


const PHYSICAL_RESOURCE_CAPABILITIES =
  Object.freeze([
    RESOURCE_CAPABILITIES
      .ROBOT_STOP,

    RESOURCE_CAPABILITIES
      .ROBOT_RECALIBRATE,

    RESOURCE_CAPABILITIES
      .ROBOT_RETURN_HOME,
  ]);


const RESTRICTED_DOMAIN_POLICY =
  Object.freeze({
    [
      CERTIFICATION_DOMAIN
        .PHYSICAL_SYSTEM
    ]:
      Object.freeze({
        maximumLevel:
          AUTONOMY_LEVEL.L2,

        autonomousExecutionEligible:
          false,

        separateCertificationRequired:
          true,

        productionAutonomyEligible:
          false,
      }),

    [
      CERTIFICATION_DOMAIN
        .SAFETY_CRITICAL
    ]:
      Object.freeze({
        maximumLevel:
          AUTONOMY_LEVEL.L1,

        autonomousExecutionEligible:
          false,

        separateCertificationRequired:
          true,

        productionAutonomyEligible:
          false,
      }),
  });


const SAFETY_BOUNDARY_REASON =
  Object.freeze({
    PHYSICAL_CAPABILITY_DOMAIN_MISMATCH:
      "PHYSICAL_CAPABILITY_DOMAIN_MISMATCH",

    PHYSICAL_DOMAIN_AUTONOMY_PROHIBITED:
      "PHYSICAL_DOMAIN_AUTONOMY_PROHIBITED",

    SAFETY_CRITICAL_AUTONOMY_PROHIBITED:
      "SAFETY_CRITICAL_AUTONOMY_PROHIBITED",

    SOFTWARE_CERTIFICATE_NOT_PORTABLE:
      "SOFTWARE_CERTIFICATE_NOT_PORTABLE",

    SEPARATE_CERTIFICATION_REQUIRED:
      "SEPARATE_CERTIFICATION_REQUIRED",

    PRODUCTION_PHYSICAL_AUTONOMY_PROHIBITED:
      "PRODUCTION_PHYSICAL_AUTONOMY_PROHIBITED",
  });


module.exports = {
  SAFETY_CRITICAL_BOUNDARY_VERSION,

  PHYSICAL_RESOURCE_CAPABILITIES,

  RESTRICTED_DOMAIN_POLICY,

  SAFETY_BOUNDARY_REASON,
};