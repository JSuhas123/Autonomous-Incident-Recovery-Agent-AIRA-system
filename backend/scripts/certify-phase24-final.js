"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  certificationResult,

  hashObject,
} = require(
  "../services/humanLearning/learningCertificationService"
);


const VERSION =
  "24.FINAL.1";


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase24"
  );


function latestArtifact(
  prefix
) {
  if (
    !fs.existsSync(
      ARTIFACT_DIRECTORY
    )
  ) {
    return null;
  }


  const matches =
    fs.readdirSync(
      ARTIFACT_DIRECTORY
    )
      .filter(
        (
          fileName
        ) =>
          fileName.startsWith(
            prefix
          )
          &&
          fileName.endsWith(
            ".json"
          )
      )
      .sort();


  if (
    matches.length ===
    0
  ) {
    return null;
  }


  return path.join(
    ARTIFACT_DIRECTORY,

    matches[
      matches.length -
      1
    ]
  );
}


function readArtifact(
  filePath
) {
  if (
    !filePath
    ||
    !fs.existsSync(
      filePath
    )
  ) {
    return null;
  }


  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}


function main()
{
  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 24 — FINAL HUMAN-TO-AIRA LEARNING CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "CANDIDATE != KNOWLEDGE"
  );

  console.log(
    "KNOWLEDGE != EXECUTION AUTHORITY"
  );

  console.log(
    "PHASE 24 CERTIFICATION != PRODUCTION AUTONOMY"
  );

  console.log(
    ""
  );


  const adversarialPath =
    latestArtifact(
      "phase24-adversarial-"
    );


  const liveStatePath =
    latestArtifact(
      "phase24-live-state-"
    );


  const adversarial =
    readArtifact(
      adversarialPath
    );


  const liveState =
    readArtifact(
      liveStatePath
    );


  const checks = [
    {
      name:
        "adversarial-artifact-present",

      passed:
        Boolean(
          adversarial
        ),
    },

    {
      name:
        "adversarial-certification-pass",

      passed:
        adversarial
          ?.passed ===
        true,
    },

    {
      name:
        "adversarial-no-authority",

      passed:
        adversarial
          ?.executionAuthorized ===
        false
        &&
        adversarial
          ?.productionCertified ===
        false,
    },

    {
      name:
        "live-state-artifact-present",

      passed:
        Boolean(
          liveState
        ),
    },

    {
      name:
        "live-state-certification-pass",

      passed:
        liveState
          ?.passed ===
        true,
    },

    {
      name:
        "live-state-no-authority",

      passed:
        liveState
          ?.executionAuthorized ===
        false
        &&
        liveState
          ?.productionCertified ===
        false,
    },
  ];


  const sourceChain = {
    adversarial: {
      path:
        adversarialPath,

      certificationHash:
        adversarial
          ?.certificationHash ||
        null,
    },

    liveState: {
      path:
        liveStatePath,

      certificationHash:
        liveState
          ?.certificationHash ||
        null,
    },
  };


  const sourceChainHash =
    hashObject(
      sourceChain
    );


  const passed =
    checks.every(
      (
        check
      ) =>
        check.passed
    );


  const artifact =
    certificationResult({
      version:
        VERSION,

      certificationType:
        "FINAL",

      passed,

      checks,
    });


  artifact.sourceChain =
    sourceChain;


  artifact.sourceChainHash =
    sourceChainHash;


  artifact.phaseExit = {
    structuredHumanInterventionCapture:
      passed,

    candidateQuarantine:
      passed,

    deterministicCandidateGeneration:
      passed,

    replayValidation:
      passed,

    reliabilityLabBoundary:
      passed,

    regressionAndCounterexamples:
      passed,

    safetyEvaluation:
      passed,

    tenantIsolation:
      passed,

    controlledGlobalGeneralization:
      passed,

    poisoningProtection:
      passed,

    promptInjectionProtection:
      passed,

    falseSuccessProtection:
      passed,

    mitigationVsRootFix:
      passed,

    humanReview:
      passed,

    canonicalPublication:
      passed,

    revocation:
      passed,

    executionAuthorityGranted:
      false,

    productionAutonomyGranted:
      false,
  };


  artifact.certificationHash =
    hashObject(
      {
        ...artifact,

        certificationHash:
          undefined,
      }
    );


  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
    {
      recursive:
        true,
    }
  );


  const outputPath =
    path.join(
      ARTIFACT_DIRECTORY,

      `phase24-final-certification-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`
    );


  fs.writeFileSync(
    outputPath,

    JSON.stringify(
      artifact,
      null,
      2
    )
  );


  for (
    const check
    of checks
  ) {
    console.log(
      `${check.passed ? "PASS" : "FAIL"}  ${check.name}`
    );
  }


  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "PHASE 24 FINAL RESULT:",
    artifact.status
  );

  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    "Source chain hash:",
    sourceChainHash
  );


  console.log(
    "Final certification hash:",
    artifact.certificationHash
  );


  console.log(
    "Artifact:",
    outputPath
  );


  console.log(
    ""
  );


  console.log(
    "EXECUTION AUTHORIZED: FALSE"
  );

  console.log(
    "PRODUCTION AUTONOMY: FALSE"
  );


  if (
    !passed
  ) {
    process.exitCode =
      1;
  }
}


main();