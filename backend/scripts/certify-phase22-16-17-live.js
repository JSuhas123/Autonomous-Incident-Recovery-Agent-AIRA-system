"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


require(
  "dotenv"
)
  .config({
    path:
      path.resolve(
        __dirname,
        "../.env"
      ),
  });


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../constants/recoveryCertification"
  );


const {
  RuntimeAutonomyEligibilityGate,
} =
  require(
    "../services/certification/runtimeAutonomyEligibilityGate"
  );


const {
  AutonomyLifecycleEnforcementService,

  LIFECYCLE_ACTION,
} =
  require(
    "../services/certification/autonomyLifecycleEnforcementService"
  );


const {
  getEffectiveSettings,
} =
  require(
    "../services/identity/tenantRuntimeSettingsService"
  );


const PostgresIdentityResolver =
  require(
    "../persistence/postgres/PostgresIdentityResolver"
  );


const {
  getPostgresPool,

  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const CERTIFICATE_VERSION =
  "22.16-22.17-live-v1";


const ORGANIZATION_ID =
  process.env
    .AIRA_PHASE22_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .AIRA_PHASE22_ENVIRONMENT_ID ||
  "env_aira_development";


const PHASE22_ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase22"
  );


async function main() {
  printHeader();


  const phase2215Path =
    findLatestArtifact(
      "phase22-15-first-live-capability-"
    );


  const phase2215 =
    readJson(
      phase2215Path
    );


  console.log(
    "\nSOURCE CERTIFICATION"
  );

  console.log(
    `Artifact:                  ${path.basename(phase2215Path)}`
  );

  console.log(
    `Capability:                ${phase2215.capability?.capabilityKey}`
  );

  console.log(
    `Failure mode:              ${phase2215.capability?.failureMode}`
  );

  console.log(
    `Observed level:            ${phase2215.qualification?.qualifiedLevel}`
  );

  console.log(
    `Evidence status:           ${phase2215.sufficiency?.status}`
  );


  /*
   * ========================================================================
   * HARD SOURCE ASSERTIONS
   * ========================================================================
   */


  requireCondition(
    phase2215.status ===
      "PASS",

    "PHASE22_16_SOURCE_NOT_PASSING",

    "22.15 live capability assessment must pass before runtime enforcement"
  );


  requireCondition(
    phase2215
      .qualification
      ?.qualifiedLevel ===
      AUTONOMY_LEVEL.L0,

    "PHASE22_16_SOURCE_LEVEL_CHANGED",

    [
      "Expected the first live capability to remain L0.",
      `Actual=${phase2215.qualification?.qualifiedLevel || "NONE"}`,
      "Do not manufacture autonomy from insufficient evidence.",
    ].join(
      " "
    )
  );


  requireCondition(
    phase2215
      .sufficiency
      ?.status ===
      "INSUFFICIENT_EVIDENCE",

    "PHASE22_16_SOURCE_EVIDENCE_UNEXPECTED",

    `Unexpected 22.15 evidence status ${phase2215.sufficiency?.status}`
  );


  requireCondition(
    phase2215
      .executionAuthorized !==
      true &&

    phase2215
      .qualification
      ?.executionAuthorized !==
      true,

    "PHASE22_16_SOURCE_AUTHORITY_LEAK",

    "22.15 certification evidence must remain non-authorizing"
  );


  /*
   * ========================================================================
   * RESOLVE REAL TENANT + ENVIRONMENT
   * ========================================================================
   */


  const resolved =
    await resolveTenantScope();


  console.log(
    "\nREAL TENANT SETTINGS"
  );

  console.log(
    `Organization:              ${ORGANIZATION_ID}`
  );

  console.log(
    `Environment:               ${ENVIRONMENT_ID}`
  );


  const tenantSettings =
    await getEffectiveSettings({
      organizationId:
        resolved.organizationUuid,

      environmentId:
        resolved.environmentUuid,
    });


  console.log(
    `Autonomy mode:             ${tenantSettings.autonomyMode}`
  );

  console.log(
    `Autonomous recovery:       ${tenantSettings.allowAutonomousRecovery}`
  );

  console.log(
    `Production autonomy:       ${tenantSettings.allowProductionAutonomy}`
  );

  console.log(
    `Minimum confidence:        ${tenantSettings.minimumConfidenceForAutonomy}`
  );


  /*
   * ========================================================================
   * 22.16 — LIVE RUNTIME ENFORCEMENT
   * ========================================================================
   */


  const runtimeGate =
    new RuntimeAutonomyEligibilityGate();


  const liveRuntimeResult =
    runtimeGate.evaluate({
      certification: {
        qualifiedLevel:
          phase2215
            .qualification
            .qualifiedLevel,

        confidence:
          phase2215
            .qualification
            .confidence ??
          1,

        status:
          "CERTIFIED",

        executionAuthorized:
          false,
      },

      tenantSettings,

      environmentCeiling:
        AUTONOMY_LEVEL.L5,

      /*
       * These are deliberately permissive controlled inputs.
       *
       * The purpose is to prove the real L0 certification itself
       * prevents autonomous execution.
       */
      policy: {
        status:
          "ELIGIBLE",
      },

      actionRisk: {
        level:
          "LOW",

        score:
          0.1,
      },

      killSwitch: {
        state:
          "ENABLED",

        allowed:
          true,

        blocked:
          false,

        executionAuthorized:
          false,
      },

      production:
        false,

      destructive:
        false,

      constraints:
        [],

      constraintContext:
        {},

      executionAuthorized:
        false,

      authorizationGranted:
        false,

      now:
        new Date(),
    });


  requireCondition(
    liveRuntimeResult
      .certificationLevel ===
      AUTONOMY_LEVEL.L0,

    "PHASE22_16_CERTIFICATION_LEVEL_INCREASED",

    "Runtime gate changed the evidence-derived certification level"
  );


  requireCondition(
    liveRuntimeResult
      .effectiveLevel ===
      AUTONOMY_LEVEL.L0,

    "PHASE22_16_RUNTIME_AUTONOMY_ESCALATION",

    [
      "Insufficient live evidence escaped L0.",
      `effectiveLevel=${liveRuntimeResult.effectiveLevel}`,
    ].join(
      " "
    )
  );


  requireCondition(
    liveRuntimeResult
      .autonomousRecoveryEligible ===
      false,

    "PHASE22_16_AUTONOMOUS_EXECUTION_ELIGIBLE",

    "The L0 live certification must not become autonomous"
  );


  requireCondition(
    liveRuntimeResult
      .nextAuthority ===
      null,

    "PHASE22_16_CANONICAL_AUTHORITY_REACHED",

    "L0 certification must not reach canonical execution authorization"
  );


  requireCondition(
    liveRuntimeResult
      .executionAuthorized ===
      false &&

    liveRuntimeResult
      .authorizationGranted ===
      false,

    "PHASE22_16_AUTHORITY_LEAK",

    "Runtime autonomy enforcement granted execution authority"
  );


  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "22.16 LIVE RUNTIME ENFORCEMENT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Certification level:       ${liveRuntimeResult.certificationLevel}`
  );

  console.log(
    `Effective level:           ${liveRuntimeResult.effectiveLevel}`
  );

  console.log(
    `Decision:                  ${liveRuntimeResult.decision}`
  );

  console.log(
    `Autonomous eligible:       ${liveRuntimeResult.autonomousRecoveryEligible}`
  );

  console.log(
    `Next authority:            ${liveRuntimeResult.nextAuthority || "NONE"}`
  );

  console.log(
    "Execution authorized:      false"
  );


  /*
   * ========================================================================
   * 22.16 REDUCTION PROBES
   * ========================================================================
   *
   * Controlled runtime probes.
   *
   * They are NOT additional recovery evidence.
   */


  const approvalProbe =
    runtimeGate.evaluate({
      certification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L5,

        confidence:
          1,

        status:
          "CERTIFIED",

        executionAuthorized:
          false,
      },

      tenantSettings: {
        ...tenantSettings,

        autonomyMode:
          "approval_required",

        allowAutonomousRecovery:
          true,
      },

      environmentCeiling:
        AUTONOMY_LEVEL.L5,

      policy: {
        status:
          "ELIGIBLE",
      },

      actionRisk: {
        level:
          "LOW",

        score:
          0.1,
      },

      killSwitch: {
        state:
          "ENABLED",

        allowed:
          true,

        blocked:
          false,
      },

      production:
        false,

      destructive:
        false,
    });


  requireCondition(
    approvalProbe
      .effectiveLevel ===
      AUTONOMY_LEVEL.L3 &&

    approvalProbe
      .approvalRequired ===
      true,

    "PHASE22_16_TENANT_CEILING_FAILED",

    "Tenant approval-required setting failed to reduce L5 to L3"
  );


  const killSwitchProbe =
    runtimeGate.evaluate({
      certification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L5,

        confidence:
          1,

        status:
          "CERTIFIED",

        executionAuthorized:
          false,
      },

      tenantSettings: {
        ...tenantSettings,

        autonomyMode:
          "autonomous",

        allowAutonomousRecovery:
          true,
      },

      environmentCeiling:
        AUTONOMY_LEVEL.L5,

      policy: {
        status:
          "ELIGIBLE",
      },

      actionRisk: {
        level:
          "LOW",

        score:
          0.1,
      },

      killSwitch: {
        state:
          "DISABLED",

        allowed:
          false,

        blocked:
          true,
      },

      production:
        false,

      destructive:
        false,
    });


  requireCondition(
    killSwitchProbe
      .blocked ===
      true &&

    killSwitchProbe
      .effectiveLevel ===
      AUTONOMY_LEVEL.L0,

    "PHASE22_16_KILL_SWITCH_FAILED",

    "Kill switch failed to defeat autonomous eligibility"
  );


  console.log(
    "Tenant reduction probe:    PASS"
  );

  console.log(
    "Kill-switch probe:         PASS"
  );


  /*
   * ========================================================================
   * 22.17 — PROMOTION / DEMOTION ENFORCEMENT
   * ========================================================================
   *
   * These are controlled lifecycle probes.
   *
   * They validate enforcement semantics only.
   * They DO NOT claim that the live Kubernetes capability earned L4/L5.
   */


  const lifecycleService =
    new AutonomyLifecycleEnforcementService();


  const promotionProbe =
    lifecycleService.evaluate({
      previousLevel:
        AUTONOMY_LEVEL.L3,

      qualification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L4,

        confidence:
          0.999,

        demoted:
          false,

        safetyCap: {
          capped:
            false,

          failed:
            false,

          suspended:
            false,
        },

        executionAuthorized:
          false,
      },

      certificate: {
        status:
          "CERTIFIED",

        expiresAt:
          futureDate(
            90
          ),
      },

      now:
        new Date(),
    });


  requireCondition(
    promotionProbe.action ===
      LIFECYCLE_ACTION
        .PROMOTION_ELIGIBLE &&

    promotionProbe
      .executionAuthorized ===
      false,

    "PHASE22_17_PROMOTION_ENFORCEMENT_FAILED",

    "Promotion eligibility was not correctly classified"
  );


  const demotionProbe =
    lifecycleService.evaluate({
      previousLevel:
        AUTONOMY_LEVEL.L5,

      qualification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L2,

        confidence:
          0.8,

        demoted:
          true,

        safetyCap: {
          capped:
            true,

          failed:
            false,

          suspended:
            false,
        },

        executionAuthorized:
          false,
      },

      certificate: {
        status:
          "CERTIFIED",

        expiresAt:
          futureDate(
            90
          ),
      },

      now:
        new Date(),
    });


  requireCondition(
    demotionProbe.action ===
      LIFECYCLE_ACTION
        .DEMOTION_REQUIRED &&

    demotionProbe.currentLevel ===
      AUTONOMY_LEVEL.L2,

    "PHASE22_17_DEMOTION_ENFORCEMENT_FAILED",

    "Evidence regression failed to force demotion"
  );


  const suspensionProbe =
    lifecycleService.evaluate({
      previousLevel:
        AUTONOMY_LEVEL.L4,

      qualification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L2,

        confidence:
          0.5,

        demoted:
          true,

        safetyCap: {
          capped:
            true,

          failed:
            false,

          suspended:
            true,
        },

        executionAuthorized:
          false,
      },

      certificate: {
        status:
          "CERTIFIED",

        expiresAt:
          futureDate(
            90
          ),
      },

      now:
        new Date(),
    });


  requireCondition(
    suspensionProbe.action ===
      LIFECYCLE_ACTION
        .SUSPENSION_REQUIRED,

    "PHASE22_17_SUSPENSION_FAILED",

    "Safety regression failed to suspend autonomy reputation"
  );


  const revokedProbe =
    lifecycleService.evaluate({
      previousLevel:
        AUTONOMY_LEVEL.L5,

      qualification: {
        qualifiedLevel:
          AUTONOMY_LEVEL.L5,

        confidence:
          1,

        demoted:
          false,

        safetyCap: {
          capped:
            false,

          failed:
            false,

          suspended:
            false,
        },

        executionAuthorized:
          false,
      },

      certificate: {
        status:
          "REVOKED",
      },

      now:
        new Date(),
    });


  requireCondition(
    revokedProbe.action ===
      LIFECYCLE_ACTION
        .REVOCATION_ENFORCED &&

    revokedProbe
      .executionAuthorized ===
      false,

    "PHASE22_17_REVOCATION_REPLAY_FAILED",

    "Revoked certification was not enforced"
  );


  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "22.17 PROMOTION / DEMOTION ENFORCEMENT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Promotion probe:           ${promotionProbe.action}`
  );

  console.log(
    `Demotion probe:            ${demotionProbe.action}`
  );

  console.log(
    `Suspension probe:          ${suspensionProbe.action}`
  );

  console.log(
    `Revocation probe:          ${revokedProbe.action}`
  );

  console.log(
    "Lifecycle authority:       false"
  );


  /*
   * ========================================================================
   * ARTIFACT
   * ========================================================================
   */


  fs.mkdirSync(
    PHASE22_ARTIFACT_DIRECTORY,

    {
      recursive:
        true,
    }
  );


  const result = {
    phase:
      "22.16-22.17",

    certificateVersion:
      CERTIFICATE_VERSION,

    status:
      "PASS",

    liveCertified:
      true,

    source: {
      phase2215Artifact:
        path.basename(
          phase2215Path
        ),

      capabilityKey:
        phase2215
          .capability
          ?.capabilityKey,

      failureMode:
        phase2215
          .capability
          ?.failureMode,

      realEvidenceLevel:
        phase2215
          .qualification
          ?.qualifiedLevel,

      evidenceSufficiency:
        phase2215
          .sufficiency
          ?.status,
    },

    tenant: {
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      autonomyMode:
        tenantSettings
          .autonomyMode,

      allowAutonomousRecovery:
        tenantSettings
          .allowAutonomousRecovery,

      allowProductionAutonomy:
        tenantSettings
          .allowProductionAutonomy,

      minimumConfidenceForAutonomy:
        tenantSettings
          .minimumConfidenceForAutonomy,
    },

    runtimeEnforcement: {
      pass:
        true,

      certificationLevel:
        liveRuntimeResult
          .certificationLevel,

      effectiveLevel:
        liveRuntimeResult
          .effectiveLevel,

      decision:
        liveRuntimeResult
          .decision,

      autonomousRecoveryEligible:
        liveRuntimeResult
          .autonomousRecoveryEligible,

      nextAuthority:
        liveRuntimeResult
          .nextAuthority,

      tenantReductionProbe:
        {
          pass:
            true,

          effectiveLevel:
            approvalProbe
              .effectiveLevel,

          approvalRequired:
            approvalProbe
              .approvalRequired,
        },

      killSwitchProbe:
        {
          pass:
            true,

          blocked:
            killSwitchProbe
              .blocked,

          effectiveLevel:
            killSwitchProbe
              .effectiveLevel,
        },

      executionAuthorized:
        false,
    },

    lifecycleEnforcement: {
      pass:
        true,

      controlledProbeOnly:
        true,

      doesNotPromoteLiveCapability:
        true,

      promotion:
        {
          action:
            promotionProbe
              .action,

          executionAuthorized:
            false,
        },

      demotion:
        {
          action:
            demotionProbe
              .action,

          level:
            demotionProbe
              .currentLevel,

          executionAuthorized:
            false,
        },

      suspension:
        {
          action:
            suspensionProbe
              .action,

          executionAuthorized:
            false,
        },

      revocation:
        {
          action:
            revokedProbe
              .action,

          executionAuthorized:
            false,
        },
    },

    safety: {
      certificationGrantsAuthority:
        false,

      promotionGrantsAuthority:
        false,

      reputationGrantsAuthority:
        false,

      tenantCanIncreaseCertification:
        false,

      killSwitchCanBeBypassed:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },

    productionCertified:
      false,

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };


  const artifactPath =
    path.join(
      PHASE22_ARTIFACT_DIRECTORY,

      `phase22-16-17-live-certification-${timestamp()}.json`
    );


  fs.writeFileSync(
    artifactPath,

    JSON.stringify(
      result,
      null,
      2
    ),

    "utf8"
  );


  console.log(
    "\n=============================================================="
  );

  console.log(
    "PHASE 22.16 — LIVE RUNTIME ENFORCEMENT: PASS"
  );

  console.log(
    "PHASE 22.17 — PROMOTION / DEMOTION ENFORCEMENT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Live capability promoted:  false"
  );

  console.log(
    "Execution authorized:      false"
  );

  console.log(
    "Production certified:      false"
  );

  console.log(
    `Artifact: ${artifactPath}`
  );
}


async function resolveTenantScope() {
  const pool =
    getPostgresPool();


  const client =
    await pool.connect();


  try {
    const resolver =
      new PostgresIdentityResolver();


    return await resolver
      .resolveScope(
        client,

        {
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,
        }
      );
  } finally {
    client.release();
  }
}


function findLatestArtifact(
  prefix
) {
  if (
    !fs.existsSync(
      PHASE22_ARTIFACT_DIRECTORY
    )
  ) {
    throw certificationError(
      "PHASE22_ARTIFACT_DIRECTORY_MISSING",

      PHASE22_ARTIFACT_DIRECTORY
    );
  }


  const candidates =
    fs.readdirSync(
      PHASE22_ARTIFACT_DIRECTORY
    )
      .filter(
        file =>
          file.startsWith(
            prefix
          ) &&
          file.endsWith(
            ".json"
          )
      )
      .sort();


  if (
    candidates.length ===
      0
  ) {
    throw certificationError(
      "PHASE22_SOURCE_ARTIFACT_MISSING",

      `No Phase-22 artifact found with prefix ${prefix}`
    );
  }


  return path.join(
    PHASE22_ARTIFACT_DIRECTORY,

    candidates[
      candidates.length -
      1
    ]
  );
}


function readJson(
  filePath
) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}


function futureDate(
  days
) {
  return new Date(
    Date.now() +
    Number(
      days
    ) *
    24 *
    60 *
    60 *
    1000
  )
    .toISOString();
}


function timestamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition !==
      true
  ) {
    throw certificationError(
      code,
      message
    );
  }
}


function printHeader() {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 22.16 + 22.17 — LIVE AUTONOMY ENFORCEMENT"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Certification != authorization"
  );

  console.log(
    "Reputation != authorization"
  );

  console.log(
    "Tenant / policy / risk may only reduce autonomy"
  );

  console.log(
    "Kill switch always wins"
  );

  console.log(
    "Controlled lifecycle probes do not promote the live capability"
  );
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase22RuntimeLifecycleCertificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


main()
  .catch(
    error => {
      console.error(
        "\nPHASE 22.16/22.17 LIVE CERTIFICATION FAILED"
      );

      console.error(
        `Code: ${error.code || "UNKNOWN"}`
      );

      console.error(
        error.stack ||
        error.message ||
        error
      );


      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await closePostgresPool();
      } catch (
        error
      ) {
        console.error(
          "PostgreSQL pool close warning:",
          error.message
        );
      }
    }
  );