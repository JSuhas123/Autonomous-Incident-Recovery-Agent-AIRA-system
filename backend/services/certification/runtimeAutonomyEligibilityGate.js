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
  AUTONOMY_RUNTIME_DECISION,

  AUTONOMY_RUNTIME_REASON,

  CERTIFICATE_STATUS,

  POLICY_CEILING,

  RISK_CEILING,

  RUNTIME_AUTONOMY_POLICY_VERSION,
} =
  require(
    "../../constants/runtimeAutonomyPolicy"
  );


const {
  AUTONOMY_MODES,
} =
  require(
    "../identity/tenantRuntimeSettingsService"
  );


const {
  BoundedAutonomyConstraintService,
} =
  require(
    "./boundedAutonomyConstraintService"
  );


class RuntimeAutonomyEligibilityGate {
  constructor(
    options = {}
  ) {
    this.constraintService =
      options.constraintService ||
      new BoundedAutonomyConstraintService();
  }


  evaluate(
    input = {}
  ) {
    assertInput(
      input
    );


    const certification =
      input.certification;


    const settings =
      input.tenantSettings ||
      {};


    const reasons =
      [];


    /*
     * ========================================================================
     * 1. CERTIFICATE LIFECYCLE
     * ========================================================================
     */


    const certificateLifecycle =
      evaluateCertificateLifecycle({
        certification,

        now:
          input.now,
      });


    reasons.push(
      ...certificateLifecycle
        .reasons
    );


    /*
     * ========================================================================
     * 2. CERTIFICATE CONSTRAINTS
     * ========================================================================
     */


    const constraintResult =
      this.constraintService
        .evaluate({
          constraints:
            input.constraints ||
            certification
              .constraints ||
            [],

          context:
            input.constraintContext ||
            {},

          executionAuthorized:
            false,
        });


    if (
      constraintResult
        .satisfied !==
      true
    ) {
      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .CERTIFICATE_CONSTRAINT_VIOLATION
      );
    }


    /*
     * ========================================================================
     * 3. CERTIFICATION CEILING
     * ========================================================================
     */


    const certificationLevel =
      certification
        .qualifiedLevel;


    autonomyRank(
      certificationLevel
    );


    /*
     * ========================================================================
     * 4. TENANT / ENVIRONMENT SETTINGS
     * ========================================================================
     */


    const tenantEvaluation =
      evaluateTenantCeiling({
        settings,

        certification,

        production:
          input.production ===
          true,

        destructive:
          input.destructive ===
          true,
      });


    reasons.push(
      ...tenantEvaluation
        .reasons
    );


    let environmentCeiling =
      input.environmentCeiling ||
      AUTONOMY_LEVEL.L5;


    autonomyRank(
      environmentCeiling
    );


    if (
      environmentCeiling !==
        AUTONOMY_LEVEL.L5
    ) {
      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .ENVIRONMENT_CEILING
      );
    }


    /*
     * ========================================================================
     * 5. POLICY CEILING
     * ========================================================================
     */


    const policyEvaluation =
      evaluatePolicyCeiling(
        input.policy
      );


    reasons.push(
      ...policyEvaluation
        .reasons
    );


    /*
     * ========================================================================
     * 6. ACTION RISK CEILING
     * ========================================================================
     */


    const riskEvaluation =
      evaluateRiskCeiling(
        input.actionRisk
      );


    reasons.push(
      ...riskEvaluation
        .reasons
    );


    /*
     * ========================================================================
     * 7. KILL SWITCH
     * ========================================================================
     */


    const killSwitchEvaluation =
      evaluateKillSwitch(
        input.killSwitch
      );


    reasons.push(
      ...killSwitchEvaluation
        .reasons
    );


    /*
     * ========================================================================
     * 8. EFFECTIVE LEVEL
     * ========================================================================
     */


    let effectiveLevel =
      minimumLevel([
        certificationLevel,

        tenantEvaluation
          .ceiling,

        environmentCeiling,

        policyEvaluation
          .ceiling,

        riskEvaluation
          .ceiling,

        certificateLifecycle
          .ceiling,

        constraintResult
          .satisfied ===
          true
          ? AUTONOMY_LEVEL.L5
          : AUTONOMY_LEVEL.L0,

        killSwitchEvaluation
          .ceiling,
      ]);


    /*
     * Any hard block fails closed.
     */
    const blocked =
      certificateLifecycle
        .blocked ===
        true ||

      constraintResult
        .satisfied !==
        true ||

      policyEvaluation
        .blocked ===
        true ||

      riskEvaluation
        .blocked ===
        true ||

      killSwitchEvaluation
        .blocked ===
        true;


    if (
      blocked
    ) {
      effectiveLevel =
        AUTONOMY_LEVEL.L0;
    }


    const decision =
      blocked
        ? AUTONOMY_RUNTIME_DECISION
            .BLOCKED

        : decisionForLevel(
            effectiveLevel
          );


    const autonomousRecoveryEligible =
      !blocked &&

      (
        effectiveLevel ===
          AUTONOMY_LEVEL.L4 ||

        effectiveLevel ===
          AUTONOMY_LEVEL.L5
      );


    /*
     * Critical law:
     *
     * autonomousRecoveryEligible means Phase 22 allows the action to CONTINUE
     * toward the canonical execution authorization system.
     *
     * It is NOT authorization.
     */
    return Object.freeze({
      runtimePolicyVersion:
        RUNTIME_AUTONOMY_POLICY_VERSION,

      certificationLevel,

      tenantCeiling:
        tenantEvaluation
          .ceiling,

      environmentCeiling,

      policyCeiling:
        policyEvaluation
          .ceiling,

      riskCeiling:
        riskEvaluation
          .ceiling,

      certificateLifecycleCeiling:
        certificateLifecycle
          .ceiling,

      constraintsSatisfied:
        constraintResult
          .satisfied,

      killSwitchAllowed:
        killSwitchEvaluation
          .allowed,

      effectiveLevel,

      decision,

      blocked,

      autonomousRecoveryEligible,

      approvalRequired:
        !blocked &&
        effectiveLevel ===
          AUTONOMY_LEVEL.L3,

      reasons:
        Object.freeze([
          ...new Set(
            reasons
          ),
        ]),

      constraintResult,

      /*
       * The only legal next step for execution is the pre-existing
       * canonical execution authorization engine.
       */
      nextAuthority:
        autonomousRecoveryEligible ||
        effectiveLevel ===
          AUTONOMY_LEVEL.L3
          ? "CANONICAL_EXECUTION_AUTHORIZATION"
          : null,

      executionAuthorized:
        false,

      authorizationGranted:
        false,

      productionCertified:
        false,
    });
  }
}


/*
 * ============================================================================
 * CERTIFICATE LIFECYCLE
 * ============================================================================
 */


function evaluateCertificateLifecycle({
  certification,

  now,
}) {
  const status =
    certification.status ||
    CERTIFICATE_STATUS
      .CERTIFIED;


  const reasons =
    [];


  let ceiling =
    AUTONOMY_LEVEL.L5;


  let blocked =
    false;


  if (
    status ===
    CERTIFICATE_STATUS
      .SUSPENDED
  ) {
    ceiling =
      AUTONOMY_LEVEL.L0;

    blocked =
      true;

    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CERTIFICATE_SUSPENDED
    );
  } else if (
    status ===
    CERTIFICATE_STATUS
      .REVOKED
  ) {
    ceiling =
      AUTONOMY_LEVEL.L0;

    blocked =
      true;

    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CERTIFICATE_REVOKED
    );
  } else if (
    status ===
    CERTIFICATE_STATUS
      .EXPIRED
  ) {
    ceiling =
      AUTONOMY_LEVEL.L0;

    blocked =
      true;

    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CERTIFICATE_EXPIRED
    );
  } else if (
    status ===
    CERTIFICATE_STATUS
      .FAILED
  ) {
    ceiling =
      AUTONOMY_LEVEL.L0;

    blocked =
      true;

    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CERTIFICATE_FAILED
    );
  } else if (
    status !==
    CERTIFICATE_STATUS
      .CERTIFIED
  ) {
    ceiling =
      AUTONOMY_LEVEL.L0;

    blocked =
      true;

    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CERTIFICATE_NOT_CERTIFIED
    );
  }


  if (
    !blocked &&
    certification.expiresAt
  ) {
    const expiresAt =
      new Date(
        certification.expiresAt
      );


    const current =
      now
        ? new Date(
            now
          )
        : new Date();


    if (
      Number.isNaN(
        expiresAt.getTime()
      ) ||
      Number.isNaN(
        current.getTime()
      ) ||
      expiresAt.getTime() <=
        current.getTime()
    ) {
      ceiling =
        AUTONOMY_LEVEL.L0;

      blocked =
        true;

      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .CERTIFICATE_EXPIRED
      );
    }
  }


  return {
    status,

    ceiling,

    blocked,

    reasons,
  };
}


/*
 * ============================================================================
 * TENANT CEILING
 * ============================================================================
 */


function evaluateTenantCeiling({
  settings,
  certification,
  production,
  destructive,
}) {
  const reasons =
    [];


  let ceiling =
    AUTONOMY_LEVEL.L5;


  switch (
    settings.autonomyMode
  ) {
    case AUTONOMY_MODES
      .OBSERVE_ONLY:

      ceiling =
        AUTONOMY_LEVEL.L0;

      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .TENANT_OBSERVE_ONLY
      );

      break;


    case AUTONOMY_MODES
      .RECOMMEND_ONLY:

      ceiling =
        AUTONOMY_LEVEL.L2;

      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .TENANT_RECOMMEND_ONLY
      );

      break;


    case AUTONOMY_MODES
      .APPROVAL_REQUIRED:

      ceiling =
        AUTONOMY_LEVEL.L3;

      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .TENANT_APPROVAL_REQUIRED
      );

      break;


    case AUTONOMY_MODES
      .AUTONOMOUS:

      ceiling =
        AUTONOMY_LEVEL.L5;

      break;


    default:

      /*
       * Unknown/missing tenant mode fails to approval-gated execution
       * instead of silently enabling autonomy.
       */
      ceiling =
        AUTONOMY_LEVEL.L3;

      reasons.push(
        AUTONOMY_RUNTIME_REASON
          .TENANT_APPROVAL_REQUIRED
      );

      break;
  }


  if (
    settings.allowAutonomousRecovery !==
      true
  ) {
    ceiling =
      lowerAutonomyLevel(
        ceiling,

        AUTONOMY_LEVEL.L3
      );


    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .AUTONOMOUS_RECOVERY_DISABLED
    );
  }


  if (
    typeof settings
      .minimumConfidenceForAutonomy ===
      "number" &&

    Number.isFinite(
      settings
        .minimumConfidenceForAutonomy
    ) &&

    (
      certification.confidence ===
        null ||

      certification.confidence ===
        undefined ||

      Number(
        certification.confidence
      ) <
      settings
        .minimumConfidenceForAutonomy
    )
  ) {
    ceiling =
      lowerAutonomyLevel(
        ceiling,

        AUTONOMY_LEVEL.L3
      );


    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .CONFIDENCE_BELOW_TENANT_MINIMUM
    );
  }


  if (
    production &&
    settings.allowProductionAutonomy !==
      true
  ) {
    ceiling =
      lowerAutonomyLevel(
        ceiling,

        AUTONOMY_LEVEL.L3
      );


    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .PRODUCTION_AUTONOMY_DISABLED
    );
  }


  if (
    production &&
    settings.requireApprovalForProduction ===
      true
  ) {
    ceiling =
      lowerAutonomyLevel(
        ceiling,

        AUTONOMY_LEVEL.L3
      );


    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .PRODUCTION_APPROVAL_REQUIRED
    );
  }


  if (
    destructive &&
    settings
      .requireApprovalForDestructiveActions ===
      true
  ) {
    ceiling =
      lowerAutonomyLevel(
        ceiling,

        AUTONOMY_LEVEL.L3
      );


    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .DESTRUCTIVE_APPROVAL_REQUIRED
    );
  }


  return {
    ceiling,

    reasons,
  };
}


/*
 * ============================================================================
 * POLICY
 * ============================================================================
 */


function evaluatePolicyCeiling(
  policy
) {
  const status =
    policy?.status ||
    "UNKNOWN";


  const ceiling =
    POLICY_CEILING[
      status
    ] ??
    AUTONOMY_LEVEL.L0;


  const reasons =
    [];


  if (
    status ===
      "REQUIRES_APPROVAL"
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .POLICY_REQUIRES_APPROVAL
    );
  }


  if (
    status ===
      "BLOCKED"
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .POLICY_BLOCKED
    );
  }


  if (
    status ===
      "UNKNOWN" ||
    !POLICY_CEILING[
      status
    ]
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .POLICY_UNKNOWN
    );
  }


  return {
    status,

    ceiling,

    blocked:
      ceiling ===
      AUTONOMY_LEVEL.L0,

    reasons,
  };
}


/*
 * ============================================================================
 * RISK
 * ============================================================================
 */


function evaluateRiskCeiling(
  actionRisk
) {
  const level =
    actionRisk?.level ||
    "CRITICAL";


  let ceiling =
    RISK_CEILING[
      level
    ] ??
    AUTONOMY_LEVEL.L0;


  const reasons =
    [];


  /*
   * Preserve the existing Phase 7.5 numeric risk meaning as another
   * reducing signal.
   */
  const score =
    Number(
      actionRisk?.score
    );


  if (
    Number.isFinite(
      score
    )
  ) {
    if (
      score >=
        0.85
    ) {
      ceiling =
        AUTONOMY_LEVEL.L0;
    } else if (
      score >=
        0.65
    ) {
      ceiling =
        lowerAutonomyLevel(
          ceiling,

          AUTONOMY_LEVEL.L3
        );
    } else if (
      score >=
        0.40
    ) {
      ceiling =
        lowerAutonomyLevel(
          ceiling,

          AUTONOMY_LEVEL.L4
        );
    }
  }


  if (
    level ===
      "MEDIUM"
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .RISK_MEDIUM
    );
  }


  if (
    level ===
      "HIGH"
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .RISK_HIGH
    );
  }


  if (
    level ===
      "CRITICAL" ||
    ceiling ===
      AUTONOMY_LEVEL.L0
  ) {
    reasons.push(
      AUTONOMY_RUNTIME_REASON
        .RISK_CRITICAL
    );
  }


  return {
    level,

    score:
      Number.isFinite(
        score
      )
        ? score
        : null,

    ceiling,

    blocked:
      ceiling ===
      AUTONOMY_LEVEL.L0,

    reasons,
  };
}


/*
 * ============================================================================
 * KILL SWITCH
 * ============================================================================
 */


function evaluateKillSwitch(
  killSwitch
) {
  if (
    !killSwitch ||
    killSwitch.allowed !==
      true ||
    killSwitch.blocked ===
      true
  ) {
    return {
      allowed:
        false,

      blocked:
        true,

      ceiling:
        AUTONOMY_LEVEL.L0,

      reasons: [
        !killSwitch
          ? AUTONOMY_RUNTIME_REASON
              .KILL_SWITCH_UNKNOWN
          : AUTONOMY_RUNTIME_REASON
              .KILL_SWITCH_BLOCKED,
      ],
    };
  }


  return {
    allowed:
      true,

    blocked:
      false,

    ceiling:
      AUTONOMY_LEVEL.L5,

    reasons:
      [],
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function minimumLevel(
  levels
) {
  return levels.reduce(
    (
      current,
      level
    ) =>
      lowerAutonomyLevel(
        current,
        level
      ),

    AUTONOMY_LEVEL.L5
  );
}


function decisionForLevel(
  level
) {
  switch (
    level
  ) {
    case AUTONOMY_LEVEL.L5:
    case AUTONOMY_LEVEL.L4:
      return AUTONOMY_RUNTIME_DECISION
        .AUTONOMOUSLY_ELIGIBLE;


    case AUTONOMY_LEVEL.L3:
      return AUTONOMY_RUNTIME_DECISION
        .REQUIRE_APPROVAL;


    case AUTONOMY_LEVEL.L2:
      return AUTONOMY_RUNTIME_DECISION
        .RECOMMEND;


    case AUTONOMY_LEVEL.L1:
      return AUTONOMY_RUNTIME_DECISION
        .DIAGNOSE;


    default:
      return AUTONOMY_RUNTIME_DECISION
        .OBSERVE;
  }
}


function assertInput(
  input
) {
  if (
    !input.certification ||
    typeof input.certification !==
      "object"
  ) {
    throw runtimeError(
      "RUNTIME_CERTIFICATION_REQUIRED",

      "certification is required"
    );
  }


  if (
    input.certification
      .executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "RUNTIME_CERTIFICATION_AUTHORITY_LEAK",

      "Certification cannot grant execution authorization"
    );
  }


  if (
    input.authorizationGranted ===
      true ||
    input.executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "RUNTIME_AUTONOMY_AUTHORITY_LEAK",

      "Phase-22 runtime autonomy gate cannot receive pre-granted authority"
    );
  }
}


function runtimeError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "RuntimeAutonomyEligibilityError",

      code,

      executionAuthorized:
        false,

      authorizationGranted:
        false,
    }
  );
}


module.exports = {
  RuntimeAutonomyEligibilityGate,

  evaluateCertificateLifecycle,

  evaluateTenantCeiling,

  evaluatePolicyCeiling,

  evaluateRiskCeiling,

  evaluateKillSwitch,

  minimumLevel,
};