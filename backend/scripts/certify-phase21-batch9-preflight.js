"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.17 + 21.18
 * BATCH-9 LIVE CERTIFICATION PRE-FLIGHT
 * ============================================================================
 *
 * Validates:
 *
 * - PostgreSQL persistence mode
 * - LAB_ONLY flag
 * - canonical lab environment
 * - kind Kubernetes target
 * - deterministic fixture health
 * - deterministic fixture readiness
 * - dependency health
 * - Batch-8B certified execution evidence
 * - Phase 21.17 evaluator availability
 * - Phase 21.18 scoring service availability
 *
 * No infrastructure mutation occurs here.
 * ============================================================================
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const {
  execFileSync,
} =
  require(
    "node:child_process"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  RecoveryVerificationCorrectnessEvaluator,
} =
  require(
    "../services/reliability/recoveryVerificationCorrectnessEvaluator"
  );


const {
  ExperimentMetricsScoringService,
} =
  require(
    "../services/reliability/experimentMetricsScoringService"
  );


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    incidentId:
      "e8fa0aeec7d209dd5770b293",

    experimentRunId:
      "exprun_35397791-f02b-42bd-aa21-8eba274d204d",

    context:
      "kind-aira-reliability-lab",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    apiUrl:
      "http://127.0.0.1:18080",
  });


async function main() {
  const configuration =
    loadConfiguration();


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.17 + 21.18 BATCH-9 PRE-FLIGHT"
  );

  console.log(
    "=============================================================="
  );


  // ==========================================================================
  // ENVIRONMENT
  // ==========================================================================

  requireCondition(
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true",
    "PHASE21_BATCH9_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  requireCondition(
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "postgres",
    "PHASE21_BATCH9_POSTGRES_REQUIRED",
    "PERSISTENCE_PROVIDER=postgres is required"
  );


  requireCondition(
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() !==
      "production",
    "PHASE21_BATCH9_PRODUCTION_FORBIDDEN",
    "Batch 9 cannot run with NODE_ENV=production"
  );


  console.log(
    "Environment safety:       PASS"
  );


  // ==========================================================================
  // MODULES
  // ==========================================================================

  const evaluator =
    new RecoveryVerificationCorrectnessEvaluator();


  const scoring =
    new ExperimentMetricsScoringService();


  requireCondition(
    typeof evaluator.evaluate ===
      "function",
    "PHASE21_BATCH9_EVALUATOR_MISSING",
    "RecoveryVerificationCorrectnessEvaluator is unavailable"
  );


  requireCondition(
    typeof scoring.calculate ===
      "function",
    "PHASE21_BATCH9_SCORER_MISSING",
    "ExperimentMetricsScoringService is unavailable"
  );


  console.log(
    "21.17 evaluator:          PASS"
  );

  console.log(
    "21.18 scoring service:    PASS"
  );


  // ==========================================================================
  // LAB
  // ==========================================================================

  const repository =
    new PostgresReliabilityLabRepository();


  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    lab,
    "PHASE21_BATCH9_LAB_NOT_FOUND",
    "Canonical Reliability Lab was not found"
  );


  requireCondition(
    String(
      lab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE lab; actual=${lab.status}`
  );


  requireCondition(
    String(
      lab.safetyClass ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "LAB_ONLY",
    "PHASE21_BATCH9_LAB_NOT_LAB_ONLY",
    `Expected LAB_ONLY; actual=${lab.safetyClass}`
  );


  requireCondition(
    lab.production !==
      true,
    "PHASE21_BATCH9_PRODUCTION_LAB_FORBIDDEN",
    "Batch 9 cannot target production"
  );


  requireCondition(
    lab.executionAuthorized !==
      true,
    "PHASE21_BATCH9_LAB_AUTHORITY_LEAK",
    "Reliability Lab cannot authorize execution"
  );


  console.log(
    `Lab status:               ${lab.status}`
  );

  console.log(
    `Safety class:             ${lab.safetyClass}`
  );

  console.log(
    "Lab authority:            false"
  );


  // ==========================================================================
  // KUBERNETES
  // ==========================================================================

  execFileSync(
    "kubectl",
    [
      "--context",
      configuration.context,

      "-n",
      configuration.namespace,

      "get",
      "deployment",
      configuration.deployment,

      "-o",
      "name",
    ],
    {
      stdio:
        "pipe",

      encoding:
        "utf8",
    }
  );


  const rollout =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "rollout",
        "status",

        `deployment/${configuration.deployment}`,

        "--timeout=15s",
      ],
      {
        stdio:
          "pipe",

        encoding:
          "utf8",
      }
    );


  requireCondition(
    /successfully rolled out/i
      .test(
        rollout
      ),
    "PHASE21_BATCH9_DEPLOYMENT_NOT_READY",
    "lab-api deployment is not successfully rolled out"
  );


  console.log(
    "Kubernetes deployment:    PASS"
  );


  // ==========================================================================
  // APPLICATION HEALTH
  // ==========================================================================

  const health =
    await getJson(
      `${configuration.apiUrl}/health`
    );


  requireCondition(
    String(
      health.body
        ?.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "UP",
    "PHASE21_BATCH9_HEALTH_FAILED",
    "lab-api /health is not UP"
  );


  const ready =
    await getJson(
      `${configuration.apiUrl}/ready`
    );


  requireCondition(
    ready.body
      ?.ready ===
      true,
    "PHASE21_BATCH9_READY_FAILED",
    "lab-api /ready is not true"
  );


  const dependencies =
    await getJson(
      `${configuration.apiUrl}/dependency-health`
    );


  const dependencyState =
    dependencies.body
      ?.dependencies ||
    {};


  requireCondition(
    dependencyState.postgres ===
      true &&
    dependencyState.redis ===
      true &&
    dependencyState.rabbitmq ===
      true,
    "PHASE21_BATCH9_DEPENDENCY_HEALTH_FAILED",
    "One or more lab-api dependencies are unhealthy"
  );


  console.log(
    "API health:               PASS"
  );

  console.log(
    "API readiness:            PASS"
  );

  console.log(
    "Dependency health:        PASS"
  );


  // ==========================================================================
  // BATCH-8B EVIDENCE
  // ==========================================================================

  const batch8Artifact =
    findLatestBatch8Artifact();


  requireCondition(
    batch8Artifact,
    "PHASE21_BATCH9_BATCH8_EVIDENCE_MISSING",
    "No Batch-8B live certification artifact was found"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.passed ===
      true,
    "PHASE21_BATCH9_BATCH8_NOT_PASSED",
    "Latest Batch-8B artifact is not a passing certificate"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.productionCertified !==
      true,
    "PHASE21_BATCH9_BATCH8_PRODUCTION_AUTHORITY_LEAK",
    "Batch-8B artifact must not certify production"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.phase21ExecutionAuthorized !==
      true,
    "PHASE21_BATCH9_BATCH8_PHASE21_AUTHORITY_LEAK",
    "Batch-8B artifact indicates Phase21 authority"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.replacementObserved ===
      true,
    "PHASE21_BATCH9_BATCH8_REPLACEMENT_NOT_OBSERVED",
    "Batch-8B artifact does not prove a real Kubernetes replacement"
  );


  requireCondition(
    batch8Artifact
      .artifact
      ?.replacementReady ===
      true,
    "PHASE21_BATCH9_BATCH8_REPLACEMENT_NOT_READY",
    "Batch-8B replacement did not reach Ready state"
  );


  console.log(
    `Batch-8B artifact:         ${path.basename(
      batch8Artifact.path
    )}`
  );

  console.log(
    "Real execution evidence:  PASS"
  );

  console.log(
    "Independent UID change:   PASS"
  );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "BATCH 9 PRE-FLIGHT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Phase21 authorized:       false"
  );
}


// ============================================================================
// BATCH 8 ARTIFACT
// ============================================================================

function findLatestBatch8Artifact() {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  if (
    !fs.existsSync(
      directory
    )
  ) {
    return null;
  }


  const files =
    fs.readdirSync(
      directory
    )
      .filter(
        name =>
          /^phase21-batch8b-live-certification-.*\.json$/i
            .test(
              name
            )
      )
      .map(
        name => {
          const filePath =
            path.join(
              directory,
              name
            );


          return {
            name,

            path:
              filePath,

            mtime:
              fs.statSync(
                filePath
              )
                .mtimeMs,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.mtime -
          left.mtime
      );


  for (
    const candidate
    of files
  ) {
    try {
      const artifact =
        JSON.parse(
          fs.readFileSync(
            candidate.path,
            "utf8"
          )
        );


      return {
        path:
          candidate.path,

        artifact,
      };
    } catch {
      // Ignore malformed artifacts and continue.
    }
  }


  return null;
}


// ============================================================================
// HTTP
// ============================================================================

async function getJson(
  url
) {
  const startedAt =
    Date.now();


  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        signal:
          AbortSignal.timeout(
            5000
          ),
      }
    );


  const durationMs =
    Date.now() -
    startedAt;


  requireCondition(
    response.ok,
    "PHASE21_BATCH9_HTTP_FAILED",
    `HTTP ${response.status} from ${url}`
  );


  return {
    body:
      await response.json(),

    durationMs,
  };
}


// ============================================================================
// CONFIG
// ============================================================================

function loadConfiguration() {
  return Object.freeze({
    organizationId:
      process.env
        .PHASE21_ORGANIZATION_ID ||
      DEFAULTS.organizationId,

    environmentId:
      process.env
        .PHASE21_ENVIRONMENT_ID ||
      DEFAULTS.environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      DEFAULTS.tenantId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      DEFAULTS.labEnvironmentId,

    incidentId:
      process.env
        .PHASE21_BATCH9_INCIDENT_ID ||
      DEFAULTS.incidentId,

    experimentRunId:
      process.env
        .PHASE21_BATCH9_EXPERIMENT_RUN_ID ||
      DEFAULTS.experimentRunId,

    context:
      process.env
        .PHASE21_KIND_CONTEXT ||
      DEFAULTS.context,

    namespace:
      process.env
        .PHASE21_BATCH9_NAMESPACE ||
      DEFAULTS.namespace,

    deployment:
      process.env
        .PHASE21_BATCH9_DEPLOYMENT ||
      DEFAULTS.deployment,

    apiUrl:
      process.env
        .PHASE21_BATCH9_API_URL ||
      DEFAULTS.apiUrl,
  });
}


// ============================================================================
// ERROR
// ============================================================================

function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


main()
  .then(
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "BATCH 9 PRE-FLIGHT: FAIL"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `Code: ${error.code || "UNEXPECTED_ERROR"}`
      );

      console.error(
        error.message
      );

      console.error(
        ""
      );

      console.error(
        "Production certified: false"
      );

      console.error(
        "Phase21 authorized: false"
      );


      process.exitCode =
        1;
    }
  );