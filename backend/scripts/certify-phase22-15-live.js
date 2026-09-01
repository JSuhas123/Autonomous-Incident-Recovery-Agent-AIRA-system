"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


/*
 * Standalone certification scripts do not boot through server.js,
 * therefore load the backend environment explicitly before any
 * PostgreSQL repository/pool can be created.
 */
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


const crypto =
  require(
    "crypto"
  );


const {
  CERTIFICATION_DOMAIN,
} =
  require(
    "../constants/recoveryCertification"
  );


const {
  Phase21LiveRecoveryEvidenceMapper,
} =
  require(
    "../services/certification/phase21LiveRecoveryEvidenceMapper"
  );


const {
  RecoveryOutcomeStatisticsService,
} =
  require(
    "../services/certification/recoveryOutcomeStatisticsService"
  );


const {
  EvidenceSufficiencyService,
} =
  require(
    "../services/certification/evidenceSufficiencyService"
  );


const {
  AutonomyQualificationEngine,
} =
  require(
    "../services/certification/autonomyQualificationEngine"
  );


const PHASE =
  "22.15";


const CERTIFICATE_VERSION =
  "22.15-first-live-capability-v1";


const EXPECTED_EXPERIMENT_RUN =
  "exprun_35397791-f02b-42bd-aa21-8eba274d204d";


const EXPECTED_INCIDENT =
  "e8fa0aeec7d209dd5770b293";


const EXPECTED_FAILURE_MODE =
  "kubernetes.pod.crash";


const PHASE21_ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const PHASE22_ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase22"
  );


async function main() {
  printHeader();

  assertPostgresEnvironment();

  ensureDirectory(
    PHASE22_ARTIFACT_DIRECTORY
  );


  /*
   * ========================================================================
   * 1. LOAD FROZEN PHASE-21 EVIDENCE
   * ========================================================================
   */


  const files = {
    batch7:
      findLatestArtifact(
        "phase21-batch7-live-certification-"
      ),

    batch8a:
      findLatestArtifact(
        "phase21-batch8a-live-certification-"
      ),

    batch8b:
      findLatestArtifact(
        "phase21-batch8b-live-certification-"
      ),

    batch9:
      findLatestArtifact(
        "phase21-batch9-live-certification-"
      ),
  };


  const artifactHashesBefore =
    Object.fromEntries(
      Object.entries(
        files
      )
        .map(
          ([
            key,
            filePath,
          ]) => [
            key,

            sha256File(
              filePath
            ),
          ]
        )
    );


  const artifacts =
    Object.fromEntries(
      Object.entries(
        files
      )
        .map(
          ([
            key,
            filePath,
          ]) => [
            key,

            readJson(
              filePath
            ),
          ]
        )
    );


  console.log(
    "\nFROZEN PHASE-21 SOURCES"
  );


  for (
    const [
      key,
      filePath,
    ]
    of Object.entries(
      files
    )
  ) {
    console.log(
      `${key.padEnd(10)} ${path.basename(filePath)}`
    );
  }


  /*
   * ========================================================================
   * 2. OPTIONAL CANONICAL POSTGRESQL SNAPSHOT
   * ========================================================================
   *
   * Use the canonical reader when available.
   *
   * If PostgreSQL cannot be read, this live certification FAILS.
   * We do not silently downgrade to artifact-only evidence because
   * Phase 21 established PostgreSQL as canonical.
   */


  const canonicalEvidence =
    await readCanonicalEvidence();


  /*
   * ========================================================================
   * 3. MAP FROZEN EVIDENCE
   * ========================================================================
   */


  const mapper =
    new Phase21LiveRecoveryEvidenceMapper();


  const mapped =
    mapper.map({
      ...artifacts,

      canonicalEvidence,
    });


  const sample =
    mapped.samples[0];


  requireCondition(
    sample.experimentRunId ===
      EXPECTED_EXPERIMENT_RUN,

    "PHASE22_15_EXPERIMENT_LINEAGE_MISMATCH",

    `Expected ${EXPECTED_EXPERIMENT_RUN}; received ${sample.experimentRunId}`
  );


  requireCondition(
    sample.incidentId ===
      EXPECTED_INCIDENT,

    "PHASE22_15_INCIDENT_LINEAGE_MISMATCH",

    `Expected ${EXPECTED_INCIDENT}; received ${sample.incidentId}`
  );


  requireCondition(
    sample.failureMode ===
      EXPECTED_FAILURE_MODE,

    "PHASE22_15_FAILURE_MODE_MISMATCH",

    [
      `Expected ${EXPECTED_FAILURE_MODE}.`,
      `Received ${sample.failureMode}.`,
      "Phase-21 evidence must not be relabelled as CrashLoopBackOff.",
    ].join(
      " "
    )
  );


  /*
   * ========================================================================
   * 4. REAL STATISTICS
   * ========================================================================
   */


  const statistics =
    new RecoveryOutcomeStatisticsService()
      .calculate({
        samples:
          mapped.samples,
      });


  /*
   * ========================================================================
   * 5. REAL EVIDENCE SUFFICIENCY
   * ========================================================================
   */


  const sufficiency =
    new EvidenceSufficiencyService()
      .evaluate({
        statistics,

        now:
          new Date(),
      });


  /*
   * ========================================================================
   * 6. REAL AUTONOMY QUALIFICATION
   * ========================================================================
   */


  const qualification =
    new AutonomyQualificationEngine()
      .evaluate({
        statistics,

        sufficiency,

        domain:
          CERTIFICATION_DOMAIN
            .SOFTWARE_INFRASTRUCTURE,
      });


  /*
   * ========================================================================
   * 7. HARD SAFETY ASSERTIONS
   * ========================================================================
   */


  requireCondition(
    statistics.totalTests ===
      1,

    "PHASE22_15_SAMPLE_INFLATION",

    [
      "Expected one real Phase-21 experiment.",
      `Statistics reported ${statistics.totalTests}.`,
      "Multiple artifacts from one experiment must not be counted as multiple tests.",
    ].join(
      " "
    )
  );


  requireCondition(
    statistics
      .independentExperimentCount ===
      1,

    "PHASE22_15_EXPERIMENT_COUNT_INFLATION",

    `Expected 1 independent experiment; received ${statistics.independentExperimentCount}`
  );


  requireCondition(
    statistics
      .rates
      .verifiedRecovery
      .rate ===
      1,

    "PHASE22_15_REAL_RECOVERY_NOT_VERIFIED",

    "The frozen live experiment must remain VERIFIED_RECOVERY"
  );


  requireCondition(
    statistics
      .rates
      .recurrence
      .rate ===
      0,

    "PHASE22_15_RECURRENCE_DETECTED",

    "Frozen Phase-21 evidence reports an unexpected recurrence"
  );


  requireCondition(
    statistics
      .safety
      .unauthorizedActionCount ===
      0,

    "PHASE22_15_UNAUTHORIZED_ACTION",

    "Unauthorized action count must remain zero"
  );


  requireCondition(
    statistics
      .safety
      .authorityLeakCount ===
      0,

    "PHASE22_15_AUTHORITY_LEAK",

    "Authority leak count must remain zero"
  );


  requireCondition(
    statistics.executionAuthorized ===
      false &&

    sufficiency.executionAuthorized ===
      false &&

    qualification.executionAuthorized ===
      false,

    "PHASE22_15_CERTIFICATION_GRANTED_AUTHORITY",

    "Recovery certification must never grant execution authority"
  );


  requireCondition(
    qualification.productionCertified ===
      false,

    "PHASE22_15_PRODUCTION_CERTIFICATION_LEAK",

    "This lab-derived certification must not certify production"
  );


  /*
   * With one independent live experiment, the expected safety-preserving
   * result is insufficient evidence and L0.
   *
   * If thresholds change later, this assertion forces an explicit review
   * instead of silently promoting autonomy.
   */


  requireCondition(
    sufficiency.status ===
      "INSUFFICIENT_EVIDENCE",

    "PHASE22_15_UNEXPECTED_SUFFICIENCY",

    [
      "One independent experiment unexpectedly became sufficient.",
      `status=${sufficiency.status}`,
      "Review the statistical policy before allowing promotion.",
    ].join(
      " "
    )
  );


  requireCondition(
    qualification.qualifiedLevel ===
      "L0",

    "PHASE22_15_UNEXPECTED_AUTONOMY",

    [
      "One real recovery unexpectedly earned a higher autonomy level.",
      `qualifiedLevel=${qualification.qualifiedLevel}`,
      "Do not weaken the evidence thresholds to force autonomy.",
    ].join(
      " "
    )
  );


  /*
   * ========================================================================
   * 8. VERIFY PHASE-21 ARTIFACT IMMUTABILITY
   * ========================================================================
   */


  const artifactHashesAfter =
    Object.fromEntries(
      Object.entries(
        files
      )
        .map(
          ([
            key,
            filePath,
          ]) => [
            key,

            sha256File(
              filePath
            ),
          ]
        )
    );


  requireCondition(
    JSON.stringify(
      artifactHashesBefore
    ) ===
    JSON.stringify(
      artifactHashesAfter
    ),

    "PHASE22_15_PHASE21_ARTIFACT_MUTATION",

    "A frozen Phase-21 artifact changed during Phase-22 certification"
  );


  /*
   * ========================================================================
   * 9. WRITE PHASE-22 LIVE ASSESSMENT ARTIFACT
   * ========================================================================
   */


  const result = {
    phase:
      PHASE,

    certificateVersion:
      CERTIFICATE_VERSION,

    status:
      "PASS",

    liveAssessment:
      true,

    capability: {
      capabilityKey:
        "K8S_POD_CRASH_DEPLOYMENT_RESTART",

      provider:
        "kubernetes",

      resourceType:
        "kubernetes.deployment",

      failureMode:
        sample.failureMode,

      recoveryStrategy:
        "restartDeployment",

      resourceCapability:
        "RESTART",

      playbookId:
        sample.lineage
          .playbookId,

      domain:
        CERTIFICATION_DOMAIN
          .SOFTWARE_INFRASTRUCTURE,
    },

    lineage: {
      experimentRunId:
        sample.experimentRunId,

      incidentId:
        sample.incidentId,

      authorizationId:
        sample.lineage
          .authorizationId,

      executionRequestId:
        sample.lineage
          .executionRequestId,

      planId:
        sample.lineage
          .planId,
    },

    evidence: {
      sourcePhase:
        21,

      frozen:
        true,

      sampleCount:
        mapped.sampleCount,

      independentExperimentCount:
        statistics
          .independentExperimentCount,

      evidenceDigest:
        mapped.evidenceDigest,

      artifacts:
        Object.fromEntries(
          Object.entries(
            files
          )
            .map(
              ([
                key,
                filePath,
              ]) => [
                key,

                {
                  file:
                    path.basename(
                      filePath
                    ),

                  sha256:
                    artifactHashesBefore[
                      key
                    ],
                },
              ]
            )
        ),

      phase21EvidenceMutated:
        false,
    },

    statistics,

    sufficiency,

    qualification,

    liveResult: {
      observedRecoverySuccess:
        statistics
          .rates
          .verifiedRecovery
          .rate,

      recurrenceRate:
        statistics
          .rates
          .recurrence
          .rate,

      unauthorizedActionCount:
        statistics
          .safety
          .unauthorizedActionCount,

      authorityLeakCount:
        statistics
          .safety
          .authorityLeakCount,

      evidenceSufficiency:
        sufficiency.status,

      qualifiedLevel:
        qualification
          .qualifiedLevel,

      autonomousRecoveryEligible:
        qualification
          .autonomousRecoveryEligible,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    productionCertified:
      false,

    frozenPhase21Modified:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };


  const artifactPath =
    path.join(
      PHASE22_ARTIFACT_DIRECTORY,

      [
        "phase22-15-first-live-capability-",

        new Date()
          .toISOString()
          .replace(
            /[:.]/g,
            "-"
          ),

        ".json",
      ].join(
        ""
      )
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


  printResult(
    result,
    artifactPath
  );
}


async function readCanonicalEvidence() {
  let Reader;


  try {
    Reader =
      require(
        "../persistence/postgres/PostgresPhase21CertificationEvidenceReader"
      );
  } catch (
    error
  ) {
    throw certificationError(
      "PHASE22_15_CANONICAL_READER_MISSING",

      [
        "PostgresPhase21CertificationEvidenceReader is required.",
        "22.15 cannot certify from artifact-only evidence.",
      ].join(
        " "
      )
    );
  }


  const reader =
    new Reader();


  /*
   * These are the canonical Phase-21 development certification identifiers.
   */
  return reader
    .readExperimentEvidence({
      organizationId:
        process.env
          .AIRA_PHASE22_ORGANIZATION_ID ||
        "aira-dev-org",

      environmentId:
        process.env
          .AIRA_PHASE22_ENVIRONMENT_ID ||
        "env_aira_development",

      experimentRunId:
        EXPECTED_EXPERIMENT_RUN,
    });
}


function findLatestArtifact(
  prefix
) {
  if (
    !fs.existsSync(
      PHASE21_ARTIFACT_DIRECTORY
    )
  ) {
    throw certificationError(
      "PHASE21_ARTIFACT_DIRECTORY_MISSING",

      PHASE21_ARTIFACT_DIRECTORY
    );
  }


  const candidates =
    fs.readdirSync(
      PHASE21_ARTIFACT_DIRECTORY
    )
      .filter(
        name =>
          name.startsWith(
            prefix
          ) &&
          name.endsWith(
            ".json"
          )
      )
      .sort();


  if (
    candidates.length ===
      0
  ) {
    throw certificationError(
      "PHASE21_CERTIFICATION_ARTIFACT_MISSING",

      `No Phase-21 artifact found with prefix ${prefix}`
    );
  }


  return path.join(
    PHASE21_ARTIFACT_DIRECTORY,

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


function sha256File(
  filePath
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        filePath
      )
    )
    .digest(
      "hex"
    );
}


function ensureDirectory(
  directory
) {
  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
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
    "AIRA PHASE 22.15 — FIRST LIVE CAPABILITY CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Authority model: CERTIFICATION != AUTHORIZATION"
  );

  console.log(
    `Expected failure mode: ${EXPECTED_FAILURE_MODE}`
  );

  console.log(
    "Phase-21 evidence mutation: prohibited"
  );

  console.log(
    "Production certification: false"
  );

  console.log(
    "Phase-22 execution authority: false"
  );
}


function printResult(
  result,
  artifactPath
) {
  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "LIVE RECOVERY EVIDENCE"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    `Capability:                ${result.capability.capabilityKey}`
  );

  console.log(
    `Failure mode:              ${result.capability.failureMode}`
  );

  console.log(
    `Experiment run:            ${result.lineage.experimentRunId}`
  );

  console.log(
    `Incident:                  ${result.lineage.incidentId}`
  );

  console.log(
    `Real samples:              ${result.evidence.sampleCount}`
  );

  console.log(
    `Independent experiments:   ${result.evidence.independentExperimentCount}`
  );

  console.log(
    `Verified recovery rate:    ${formatRate(
      result
        .statistics
        .rates
        .verifiedRecovery
        .rate
    )}`
  );

  console.log(
    `Recurrence rate:           ${formatRate(
      result
        .statistics
        .rates
        .recurrence
        .rate
    )}`
  );

  console.log(
    `Unauthorized actions:      ${result.liveResult.unauthorizedActionCount}`
  );

  console.log(
    `Authority leaks:           ${result.liveResult.authorityLeakCount}`
  );


  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "PHASE 22 CERTIFICATION RESULT"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    `Evidence sufficiency:      ${result.sufficiency.status}`
  );

  console.log(
    `Qualified autonomy level:  ${result.qualification.qualifiedLevel}`
  );

  console.log(
    `Autonomous eligible:       ${result.qualification.autonomousRecoveryEligible}`
  );

  console.log(
    "Execution authorized:      false"
  );

  console.log(
    "Production certified:      false"
  );

  console.log(
    "Phase21 evidence modified: false"
  );


  console.log(
    "\n=============================================================="
  );

  console.log(
    "PHASE 22.15 — FIRST LIVE CAPABILITY ASSESSMENT: PASS"
  );

  console.log(
    "=============================================================="
  );


  console.log(
    `Artifact: ${artifactPath}`
  );
}


function formatRate(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "N/A";
  }


  return `${(
    value *
    100
  ).toFixed(2)}%`;
}

function assertPostgresEnvironment() {
  const connectionString =
    process.env
      .DATABASE_URL ||
    process.env
      .POSTGRES_URL ||
    null;


  if (
    connectionString
  ) {
    let parsed;


    try {
      parsed =
        new URL(
          connectionString
        );
    } catch (
      error
    ) {
      throw certificationError(
        "PHASE22_15_POSTGRES_URL_INVALID",

        "DATABASE_URL/POSTGRES_URL is not a valid PostgreSQL URL"
      );
    }


    requireCondition(
      [
        "postgres:",
        "postgresql:",
      ]
        .includes(
          parsed.protocol
        ),

      "PHASE22_15_POSTGRES_URL_INVALID",

      `Unexpected PostgreSQL URL protocol ${parsed.protocol}`
    );


    requireCondition(
      typeof parsed.password ===
        "string" &&
      parsed.password.length >
        0,

      "PHASE22_15_POSTGRES_PASSWORD_MISSING",

      "DATABASE_URL/POSTGRES_URL does not contain a PostgreSQL password"
    );


    console.log(
      "PostgreSQL credentials:     connection URL loaded"
    );


    return;
  }


  requireCondition(
    process.env
      .POSTGRES_ENABLED !==
      "false",

    "PHASE22_15_POSTGRES_DISABLED",

    "POSTGRES_ENABLED=false; canonical PostgreSQL evidence cannot be read"
  );


  requireCondition(
    typeof process.env
      .POSTGRES_PASSWORD ===
      "string" &&

    process.env
      .POSTGRES_PASSWORD
      .length >
      0,

    "PHASE22_15_POSTGRES_PASSWORD_MISSING",

    [
      "POSTGRES_PASSWORD is missing.",
      "The Phase-22 live script must load backend/.env before reading canonical PostgreSQL evidence.",
    ].join(
      " "
    )
  );


  console.log(
    "PostgreSQL credentials:     environment loaded"
  );

  console.log(
    `PostgreSQL host:            ${
      process.env.POSTGRES_HOST ||
      "127.0.0.1"
    }`
  );

  console.log(
    `PostgreSQL database:        ${
      process.env.POSTGRES_DATABASE ||
      "aira"
    }`
  );

  console.log(
    `PostgreSQL user:            ${
      process.env.POSTGRES_USER ||
      "aira"
    }`
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
        "Phase22LiveCertificationError",

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
        "\nPHASE 22.15 LIVE CERTIFICATION FAILED"
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
  );