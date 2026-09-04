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
} = require(
  "../services/humanLearning/learningCertificationService"
);


const VERSION =
  "24.9.PREFLIGHT.1";


const BACKEND_ROOT =
  path.resolve(
    __dirname,
    ".."
  );


const REQUIRED_FILES = [
  "contracts/humanLearning.js",

  "contracts/humanLearningGenerator.js",

  "contracts/humanLearningValidation.js",

  "contracts/humanLearningValidationDecision.js",

  "contracts/humanLearningGeneralization.js",

  "contracts/humanLearningPoisoning.js",

  "contracts/humanLearningReview.js",

  "services/humanLearning/humanInterventionCaptureService.js",

  "services/humanLearning/humanLearningSourceBundleService.js",

  "services/humanLearning/learningCandidateService.js",

  "services/humanLearning/humanLearningAgentService.js",

  "services/humanLearning/learningCandidateReplayService.js",

  "services/humanLearning/learningReliabilityLabValidationService.js",

  "services/humanLearning/learningCandidateRegressionService.js",

  "services/humanLearning/learningCandidateSafetyEvaluationService.js",

  "services/humanLearning/learningValidationPipelineService.js",

  "services/humanLearning/learningCandidateGeneralizationService.js",

  "services/humanLearning/learningTenantDataScrubber.js",

  "services/humanLearning/learningCrossTenantIsolationService.js",

  "services/humanLearning/learningPromptInjectionBoundary.js",

  "services/humanLearning/learningEvidenceTrustService.js",

  "services/humanLearning/learningOutcomeVerifier.js",

  "services/humanLearning/learningCandidatePoisoningService.js",

  "services/humanLearning/learningReviewService.js",

  "services/humanLearning/learningKnowledgePublicationService.js",

  "services/humanLearning/learningKnowledgeRevocationService.js",
];


const REQUIRED_MIGRATIONS = [
  "0098_human_learning_intervention_capture.sql",

  "0099_learning_candidate_foundation.sql",

  "0100_learning_validation_foundation.sql",

  "0101_learning_scope_generalization.sql",

  "0102_learning_poisoning_protection.sql",

  "0103_learning_human_review_publication.sql",

  "0104_learning_certification_integrity.sql",
];


function main()
{
  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 24.9 — FINAL PREFLIGHT"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "LEARNING != EXECUTION AUTHORITY"
  );

  console.log(
    "PUBLISHED KNOWLEDGE != AUTONOMY"
  );

  console.log(
    ""
  );


  const checks =
    [];


  for (
    const relative
    of REQUIRED_FILES
  ) {
    const absolute =
      path.join(
        BACKEND_ROOT,
        relative
      );


    checks.push({
      name:
        `source:${relative}`,

      passed:
        fs.existsSync(
          absolute
        ),
    });
  }


  for (
    const migration
    of REQUIRED_MIGRATIONS
  ) {
    const absolute =
      path.join(
        BACKEND_ROOT,

        "persistence",
        "postgres",
        "migrations",

        migration
      );


    checks.push({
      name:
        `migration:${migration}`,

      passed:
        fs.existsSync(
          absolute
        ),
    });
  }


  const phase18Playbook =
    fs.readFileSync(
      path.join(
        BACKEND_ROOT,

        "persistence",
        "postgres",
        "PostgresPlaybookRepository.js"
      ),

      "utf8"
    );


  const phase18Runbook =
    fs.readFileSync(
      path.join(
        BACKEND_ROOT,

        "persistence",
        "postgres",
        "PostgresRunbookRepository.js"
      ),

      "utf8"
    );


  checks.push({
    name:
      "phase18-playbook-global-write-fence",

    passed:
      phase18Playbook.includes(
        "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
      ),
  });


  checks.push({
    name:
      "phase18-runbook-global-write-fence",

    passed:
      phase18Runbook.includes(
        "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
      ),
  });


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
        "PREFLIGHT",

      passed,

      checks,
    });


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
    "RESULT:",
    artifact.status
  );

  console.log(
    "CERTIFICATION HASH:",
    artifact.certificationHash
  );


  if (
    !passed
  ) {
    process.exitCode =
      1;
  }
}


main();