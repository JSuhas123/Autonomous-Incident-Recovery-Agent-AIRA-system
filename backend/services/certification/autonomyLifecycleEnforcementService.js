"use strict";


const {
  AUTONOMY_LEVEL,

  autonomyRank,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  AutonomyReputationService,
} =
  require(
    "./autonomyReputationService"
  );


const LIFECYCLE_ENFORCEMENT_VERSION =
  "22.17-promotion-demotion-enforcement-v1";


const LIFECYCLE_ACTION =
  Object.freeze({
    HOLD:
      "HOLD",

    PROMOTION_ELIGIBLE:
      "PROMOTION_ELIGIBLE",

    DEMOTION_REQUIRED:
      "DEMOTION_REQUIRED",

    SUSPENSION_REQUIRED:
      "SUSPENSION_REQUIRED",

    REVOCATION_ENFORCED:
      "REVOCATION_ENFORCED",

    RECERTIFICATION_REQUIRED:
      "RECERTIFICATION_REQUIRED",
  });


class AutonomyLifecycleEnforcementService {
  constructor(
    options = {}
  ) {
    this.reputationService =
      options.reputationService ||
      new AutonomyReputationService();
  }


  evaluate(
    input = {}
  ) {
    if (
      !input.qualification ||
      typeof input.qualification !==
        "object"
    ) {
      throw lifecycleError(
        "AUTONOMY_LIFECYCLE_QUALIFICATION_REQUIRED",

        "qualification is required"
      );
    }


    if (
      input.executionAuthorized ===
        true ||

      input.qualification
        .executionAuthorized ===
        true
    ) {
      throw lifecycleError(
        "AUTONOMY_LIFECYCLE_AUTHORITY_LEAK",

        "Autonomy lifecycle enforcement cannot grant execution authority"
      );
    }


    const reputation =
      this.reputationService
        .evaluate({
          previousReputation:
            input.previousReputation,

          previousLevel:
            input.previousLevel,

          qualification:
            input.qualification,

          certificate:
            input.certificate,

          evidenceCount:
            input.evidenceCount,

          newEvidenceCount:
            input.newEvidenceCount,

          policy:
            input.policy,

          now:
            input.now,
        });


    const previousLevel =
      reputation.previousLevel;


    const currentLevel =
      reputation.currentLevel;


    const previousRank =
      previousLevel
        ? autonomyRank(
            previousLevel
          )
        : null;


    const currentRank =
      autonomyRank(
        currentLevel
      );


    let action =
      LIFECYCLE_ACTION
        .HOLD;


    /*
     * Revocation is strongest.
     */
    if (
      reputation.revoked ===
        true
    ) {
      action =
        LIFECYCLE_ACTION
          .REVOCATION_ENFORCED;
    }

    /*
     * Suspension outranks ordinary demotion.
     */
    else if (
      reputation.suspended ===
        true
    ) {
      action =
        LIFECYCLE_ACTION
          .SUSPENSION_REQUIRED;
    }

    /*
     * Explicit evidence-derived demotion.
     */
    else if (
      previousRank !==
        null &&

      currentRank <
        previousRank
    ) {
      action =
        LIFECYCLE_ACTION
          .DEMOTION_REQUIRED;
    }

    /*
     * Promotion is only eligibility.
     *
     * No certificate is automatically rewritten and no execution
     * authorization is produced here.
     */
    else if (
      reputation
        .promotionEligible ===
        true
    ) {
      action =
        LIFECYCLE_ACTION
          .PROMOTION_ELIGIBLE;
    }

    else if (
      reputation
        .recertificationRequired ===
        true
    ) {
      action =
        LIFECYCLE_ACTION
          .RECERTIFICATION_REQUIRED;
    }


    const autonomousLevel =
      currentLevel ===
        AUTONOMY_LEVEL.L4 ||

      currentLevel ===
        AUTONOMY_LEVEL.L5;


    return Object.freeze({
      lifecycleVersion:
        LIFECYCLE_ENFORCEMENT_VERSION,

      previousLevel,

      currentLevel,

      action,

      reputation,

      promotionEligible:
        action ===
        LIFECYCLE_ACTION
          .PROMOTION_ELIGIBLE,

      demotionRequired:
        action ===
        LIFECYCLE_ACTION
          .DEMOTION_REQUIRED,

      suspensionRequired:
        action ===
        LIFECYCLE_ACTION
          .SUSPENSION_REQUIRED,

      revocationEnforced:
        action ===
        LIFECYCLE_ACTION
          .REVOCATION_ENFORCED,

      autonomousLevel,

      /*
       * A level change is reputation/certification state.
       *
       * It is NEVER runtime execution authority.
       */
      executionAuthorized:
        false,

      authorizationGranted:
        false,

      productionCertified:
        false,
    });
  }
}


function lifecycleError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "AutonomyLifecycleEnforcementError",

      code,

      executionAuthorized:
        false,

      authorizationGranted:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  AutonomyLifecycleEnforcementService,

  LIFECYCLE_ACTION,

  LIFECYCLE_ENFORCEMENT_VERSION,
};