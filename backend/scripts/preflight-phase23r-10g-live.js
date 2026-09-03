"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23R.10G.1
 * LIVE ENVIRONMENT REPLAY CERTIFICATION — PREFLIGHT
 * ============================================================================
 *
 * PURPOSE
 *
 * Prove that the local machine is ready for the first full Phase-23R live
 * Reality certification.
 *
 * THIS SCRIPT IS READ-ONLY WITH RESPECT TO INFRASTRUCTURE.
 *
 * It DOES NOT:
 *
 * - inject a fault
 * - execute recovery
 * - authorize execution
 * - modify Kubernetes resources
 * - expose evaluator ground truth
 * - certify production
 *
 * It verifies:
 *
 * - PostgreSQL connectivity
 * - Reality replay schema
 * - 23R.10C persisted environment replay schema
 * - Reliability Lab registration
 * - LAB_ONLY / non-production safety
 * - Phase-21 Kubernetes pod-crash experiment definition
 * - Kind context
 * - hard lab namespace
 * - live workload presence
 * - Ready pod presence
 * - required Phase-23R modules
 *
 * PASSING THIS PREFLIGHT IS NOT THE LIVE CERTIFICATION.
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
} = require(
  "node:child_process"
);

/*
 * ============================================================================
 * LOAD BACKEND ENVIRONMENT BEFORE POSTGRES MODULES
 * ============================================================================
 *
 * Standalone certification scripts do not pass through the normal AIRA
 * application bootstrap.
 *
 * Therefore .env must be loaded explicitly before getPostgresPool() is used.
 */
require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );

const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres/postgresPool"
);


const PREFLIGHT_VERSION =
  "23R.10G.1";


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    context:
      "kind-aira-reliability-lab",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    experimentKey:
      "kubernetes.pod.crash",

    experimentVersion:
      "1",
  });


const REQUIRED_MODULES =
  Object.freeze([
    "services/reality/realityEnvironmentReplayService.js",

    "services/reality/realityEnvironmentReplayLiveOrchestrator.js",

    "services/reality/realityEnvironmentReplayBindingService.js",

    "services/reality/realityKubernetesReplayRunner.js",

    "services/reality/realityAiraInvestigationBridge.js",

    "services/reality/realityRecoveryVerificationResetBridge.js",

    "services/reliability/experimentOrchestrator.js",

    "services/reliability/airaDiagnosisHarness.js",

    "services/reliability/recoveryVerificationCorrectnessEvaluator.js",

    "services/reliability/failureInjectionEngine.js",

    "services/reliability/runtimes/kubernetesReliabilityLabRuntime.js",
  ]);


function certificationError(
  code,
  message
) {
  return Object.assign(
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


function configuration() {
  return {
    organizationId:
      process.env
        .AIRA_PHASE23R_ORGANIZATION_ID ||
      DEFAULTS.organizationId,

    environmentId:
      process.env
        .AIRA_PHASE23R_ENVIRONMENT_ID ||
      DEFAULTS.environmentId,

    labEnvironmentId:
      process.env
        .AIRA_PHASE23R_LAB_ENVIRONMENT_ID ||
      DEFAULTS.labEnvironmentId,

    context:
      process.env
        .AIRA_PHASE23R_KUBE_CONTEXT ||
      DEFAULTS.context,

    namespace:
      process.env
        .AIRA_PHASE23R_KUBE_NAMESPACE ||
      DEFAULTS.namespace,

    deployment:
      process.env
        .AIRA_PHASE23R_KUBE_DEPLOYMENT ||
      DEFAULTS.deployment,

    experimentKey:
      DEFAULTS.experimentKey,

    experimentVersion:
      DEFAULTS.experimentVersion,
  };
}


function assertPostgresEnvironment() {
  const hasConnectionString =
    Boolean(
      process.env
        .DATABASE_URL ||
      process.env
        .POSTGRES_URL
    );

  const hasDiscretePassword =
    typeof process.env
      .POSTGRES_PASSWORD ===
      "string" &&
    process.env
      .POSTGRES_PASSWORD
      .length >
      0;

  if (
    !hasConnectionString &&
    !hasDiscretePassword
  ) {
    throw certificationError(
      "PHASE23R_10G_POSTGRES_PASSWORD_MISSING",
      (
        "PostgreSQL credentials were not loaded. " +
        "Expected DATABASE_URL/POSTGRES_URL or POSTGRES_PASSWORD " +
        "from backend/.env"
      )
    );
  }
}


function assertHardSafety(
  config
) {
  if (
    config.context !==
      "kind-aira-reliability-lab"
  ) {
    throw certificationError(
      "PHASE23R_10G_CONTEXT_FORBIDDEN",
      (
        "Live Reality certification is locked to " +
        "kind-aira-reliability-lab"
      )
    );
  }

  if (
    config.namespace !==
      "aira-reliability-lab"
  ) {
    throw certificationError(
      "PHASE23R_10G_NAMESPACE_FORBIDDEN",
      (
        "Live Reality certification is locked to " +
        "aira-reliability-lab"
      )
    );
  }

  const dangerous =
    [
      "prod",
      "production",
      "live",
      "customer",
    ];

  const combined =
    [
      config.context,
      config.namespace,
    ]
      .join(
        " "
      )
      .toLowerCase();

  for (
    const word
    of dangerous
  ) {
    if (
      combined.includes(
        word
      ) &&
      !combined.includes(
        "reliability-lab"
      )
    ) {
      throw certificationError(
        "PHASE23R_10G_PRODUCTION_TARGET_FORBIDDEN",
        "Production-like Kubernetes target detected"
      );
    }
  }
}


function runKubectl(
  config,
  args
) {
  return execFileSync(
    "kubectl",
    [
      "--context",
      config.context,

      ...args,
    ],
    {
      encoding:
        "utf8",

      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],

      timeout:
        30000,
    }
  ).trim();
}


function pass(
  name,
  detail =
    ""
) {
  console.log(
    `PASS  ${name}` +
    (
      detail
        ? ` — ${detail}`
        : ""
    )
  );
}


function section(
  title
) {
  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    title
  );

  console.log(
    "--------------------------------------------------------------"
  );
}


async function verifyPostgres(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          current_database() AS database_name,
          NOW() AS checked_at
      `
    );

  if (
    !result.rows[
      0
    ]?.database_name
  ) {
    throw certificationError(
      "PHASE23R_10G_POSTGRES_UNAVAILABLE",
      "PostgreSQL connectivity check failed"
    );
  }

  pass(
    "PostgreSQL reachable",
    result.rows[
      0
    ].database_name
  );
}


async function verifySchema(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          to_regclass(
            'reality.replay_runs'
          ) AS replay_runs,

          to_regclass(
            'reality.environment_replay_runs'
          ) AS environment_replay_runs,

          to_regclass(
            'reliability.experiment_runs'
          ) AS experiment_runs,

          to_regclass(
            'reliability.lab_environments'
          ) AS lab_environments
      `
    );

  const row =
    result.rows[
      0
    ] ||
    {};

  const required =
    [
      [
        "reality.replay_runs",
        row.replay_runs,
      ],

      [
        "reality.environment_replay_runs",
        row.environment_replay_runs,
      ],

      [
        "reliability.experiment_runs",
        row.experiment_runs,
      ],

      [
        "reliability.lab_environments",
        row.lab_environments,
      ],
    ];

  for (
    const [
      table,
      value,
    ]
    of required
  ) {
    if (
      !value
    ) {
      throw certificationError(
        "PHASE23R_10G_SCHEMA_INCOMPLETE",
        `${table} is missing`
      );
    }

    pass(
      `Schema ${table}`
    );
  }
}


async function verifyEnvironmentReplayRls(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          c.relrowsecurity,
          c.relforcerowsecurity
        FROM
          pg_class c
        WHERE
          c.oid =
            'reality.environment_replay_runs'::regclass
      `
    );

  const row =
    result.rows[
      0
    ];

  if (
    !row ||
    row.relrowsecurity !==
      true ||
    row.relforcerowsecurity !==
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_ENVIRONMENT_REPLAY_RLS_INVALID",
      (
        "reality.environment_replay_runs must have " +
        "ENABLE + FORCE RLS"
      )
    );
  }

  pass(
    "Environment replay RLS forced"
  );
}


async function verifyLab(
  config
) {
  const repository =
    new PostgresReliabilityLabRepository();

  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        labEnvironmentId:
          config.labEnvironmentId,
      });

  if (
    !lab
  ) {
    throw certificationError(
      "PHASE23R_10G_LAB_NOT_FOUND",
      "Canonical Reliability Lab was not found"
    );
  }

  if (
    String(
      lab.safetyClass ||
      ""
    )
      .trim()
      .toUpperCase() !==
      "LAB_ONLY"
  ) {
    throw certificationError(
      "PHASE23R_10G_LAB_NOT_LAB_ONLY",
      (
        "Reliability Lab safetyClass must be " +
        "LAB_ONLY"
      )
    );
  }

  if (
    lab.production ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_LAB_PRODUCTION_FORBIDDEN",
      "Reliability Lab cannot be production"
    );
  }

  if (
    lab.executionAuthorized ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_LAB_AUTHORITY_LEAK",
      (
        "Reliability Lab cannot itself grant " +
        "execution authority"
      )
    );
  }

  pass(
    "Canonical Reliability Lab resolved",
    config.labEnvironmentId
  );

  pass(
    "Reliability Lab safety class",
    "LAB_ONLY"
  );

  pass(
    "Reliability Lab production flag",
    "false"
  );

  pass(
    "Reliability Lab execution authority",
    "false"
  );
}

async function verifyExperimentDefinition(
  pool,
  config
) {
  const result =
    await pool.query(
      `
        SELECT
          public_id,
          experiment_key,
          version,
          failure_domain,
          failure_type,
          target_resource_type,
          configuration,
          enabled,
          execution_authorized
        FROM
          reliability.experiment_definitions
        WHERE
          experiment_key = $1
          AND version = $2
        ORDER BY
          created_at DESC
        LIMIT 1
      `,
      [
        config.experimentKey,
        Number(
          config.experimentVersion
        ),
      ]
    );

  const experiment =
    result.rows[
      0
    ];

  if (
    !experiment
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_DEFINITION_MISSING",
      (
        `${config.experimentKey}@` +
        `${config.experimentVersion} was not found`
      )
    );
  }

  if (
    experiment.enabled !==
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_DISABLED",
      "Canonical Kubernetes experiment is disabled"
    );
  }

  if (
    experiment.execution_authorized ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_AUTHORITY_INVALID",
      (
        "Experiment definition may not carry " +
        "execution authority"
      )
    );
  }

  if (
    experiment.experiment_key !==
      "kubernetes.pod.crash"
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_KEY_INVALID",
      (
        "Unexpected Phase-21 experiment key: " +
        String(
          experiment.experiment_key
        )
      )
    );
  }

  if (
    Number(
      experiment.version
    ) !==
      1
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_VERSION_INVALID",
      (
        "First Reality live certification requires " +
        "kubernetes.pod.crash@1"
      )
    );
  }

  if (
    experiment.target_resource_type !==
      "kubernetes.pod"
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_TARGET_INVALID",
      (
        "Canonical experiment must target " +
        "kubernetes.pod"
      )
    );
  }

  const configuration =
    experiment.configuration ||
    {};

  if (
    configuration.productionCertified ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_EXPERIMENT_PRODUCTION_PROOF_INVALID",
      (
        "Experiment configuration cannot claim " +
        "production certification"
      )
    );
  }

  if (
    configuration.evaluatorGroundTruthOnly !==
      true
  ) {
    throw certificationError(
      "PHASE23R_10G_GROUND_TRUTH_BOUNDARY_INVALID",
      (
        "Canonical experiment must retain evaluator-only " +
        "ground truth semantics"
      )
    );
  }

  pass(
    "Phase-21 experiment definition",
    (
      `${experiment.experiment_key}@` +
      `${experiment.version}`
    )
  );

  pass(
    "Experiment target resource",
    experiment.target_resource_type
  );

  pass(
    "Experiment execution authority",
    "false"
  );

  pass(
    "Experiment evaluator truth boundary",
    "EVALUATOR_ONLY"
  );
}


function verifyModules() {
  for (
    const relativePath
    of REQUIRED_MODULES
  ) {
    const absolutePath =
      path.resolve(
        __dirname,
        "..",
        relativePath
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      throw certificationError(
        "PHASE23R_10G_MODULE_MISSING",
        `${relativePath} is missing`
      );
    }

    pass(
      `Module ${relativePath}`
    );
  }
}


function verifyKubernetes(
  config
) {
  const contexts =
    runKubectl(
      config,
      [
        "config",
        "get-contexts",
        "-o",
        "name",
      ]
    )
      .split(
        /\r?\n/
      )
      .filter(
        Boolean
      );

  if (
    !contexts.includes(
      config.context
    )
  ) {
    throw certificationError(
      "PHASE23R_10G_KIND_CONTEXT_MISSING",
      `${config.context} does not exist`
    );
  }

  pass(
    "Kind Reliability Lab context exists",
    config.context
  );

  const namespace =
    runKubectl(
      config,
      [
        "get",
        "namespace",
        config.namespace,
        "-o",
        "jsonpath={.metadata.name}",
      ]
    );

  if (
    namespace !==
      config.namespace
  ) {
    throw certificationError(
      "PHASE23R_10G_NAMESPACE_MISSING",
      `${config.namespace} was not found`
    );
  }

  pass(
    "Hard lab namespace exists",
    namespace
  );

  const deployment =
    runKubectl(
      config,
      [
        "-n",
        config.namespace,

        "get",
        "deployment",
        config.deployment,

        "-o",
        "jsonpath={.metadata.name}",
      ]
    );

  if (
    deployment !==
      config.deployment
  ) {
    throw certificationError(
      "PHASE23R_10G_DEPLOYMENT_MISSING",
      `${config.deployment} was not found`
    );
  }

  pass(
    "Live lab deployment exists",
    deployment
  );

  const readyReplicasRaw =
    runKubectl(
      config,
      [
        "-n",
        config.namespace,

        "get",
        "deployment",
        config.deployment,

        "-o",
        "jsonpath={.status.readyReplicas}",
      ]
    );

  const readyReplicas =
    Number(
      readyReplicasRaw ||
      0
    );

  if (
    !Number.isFinite(
      readyReplicas
    ) ||
    readyReplicas <
      1
  ) {
    throw certificationError(
      "PHASE23R_10G_WORKLOAD_NOT_READY",
      (
        `${config.deployment} has no ` +
        "Ready replicas"
      )
    );
  }

  pass(
    "Live workload Ready",
    `${readyReplicas} replica(s)`
  );

  const podData =
    JSON.parse(
      runKubectl(
        config,
        [
          "-n",
          config.namespace,

          "get",
          "pods",

          "-l",
          "app=lab-api",

          "-o",
          "json",
        ]
      )
    );

  const readyPods =
    (
      podData.items ||
      []
    )
      .filter(
        (
          pod
        ) => {
          const conditions =
            pod.status
              ?.conditions ||
            [];

          return conditions
            .some(
              (
                condition
              ) =>
                condition.type ===
                  "Ready" &&
                condition.status ===
                  "True"
            );
        }
      );

  if (
    readyPods.length <
      1
  ) {
    throw certificationError(
      "PHASE23R_10G_READY_POD_MISSING",
      (
        "No Ready lab-api pod exists in the " +
        "Reliability Lab"
      )
    );
  }

  const pod =
    readyPods[
      0
    ];

  pass(
    "Ready Kubernetes pod discovered",
    pod.metadata.name
  );

  if (
    pod.metadata
      ?.namespace !==
      "aira-reliability-lab"
  ) {
    throw certificationError(
      "PHASE23R_10G_POD_NAMESPACE_INVALID",
      "Resolved pod escaped the hard lab namespace"
    );
  }

  return {
    podName:
      pod.metadata.name,

    podUid:
      pod.metadata.uid,

    namespace:
      pod.metadata.namespace,

    deployment:
      config.deployment,

    readyReplicas,
  };
}


async function main() {
  const config =
    configuration();

  assertPostgresEnvironment();

  assertHardSafety(
    config
  );

  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 23R.10G.1 — LIVE REALITY CERTIFICATION PREFLIGHT"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "REALITY REPLAY != EXECUTION AUTHORITY"
  );

  console.log(
    "LAB MUTATION != PRODUCTION AUTHORITY"
  );

  console.log(
    "GROUND TRUTH != AGENT CONTEXT"
  );

  console.log(
    "PREFLIGHT PASS != LIVE CERTIFICATION"
  );

  console.log(
    ""
  );

  console.log(
    `Version:       ${PREFLIGHT_VERSION}`
  );

  console.log(
    `Organization:  ${config.organizationId}`
  );

  console.log(
    `Environment:   ${config.environmentId}`
  );

  console.log(
    `Lab:           ${config.labEnvironmentId}`
  );

  console.log(
    `Context:       ${config.context}`
  );

  console.log(
    `Namespace:     ${config.namespace}`
  );

  console.log(
    `Deployment:    ${config.deployment}`
  );

  const pool =
    getPostgresPool();

  try {
    section(
      "SOURCE CONTRACTS"
    );

    verifyModules();

    section(
      "POSTGRESQL"
    );

    await verifyPostgres(
      pool
    );

    await verifySchema(
      pool
    );

    await verifyEnvironmentReplayRls(
      pool
    );

    section(
      "RELIABILITY LAB"
    );

    await verifyLab(
      config
    );

    await verifyExperimentDefinition(
      pool,
      config
    );

    section(
      "LIVE KUBERNETES TARGET"
    );

    const kubernetes =
      verifyKubernetes(
        config
      );

    section(
      "PREFLIGHT RESULT"
    );

    pass(
      "Reality architecture available"
    );

    pass(
      "Persisted environment replay binding available"
    );

    pass(
      "Phase-21 experiment authority preserved"
    );

    pass(
      "Kind Reliability Lab reachable"
    );

    pass(
      "Canonical workload healthy before mutation"
    );

    pass(
      "Evaluator ground truth not requested"
    );

    pass(
      "Execution authority not granted"
    );

    pass(
      "Production certification remains false"
    );

    console.log(
      ""
    );

    console.log(
      "LIVE TARGET"
    );

    console.log(
      JSON.stringify(
        {
          context:
            config.context,

          namespace:
            kubernetes.namespace,

          deployment:
            kubernetes.deployment,

          podName:
            kubernetes.podName,

          podUid:
            kubernetes.podUid,

          readyReplicas:
            kubernetes.readyReplicas,

          experiment:
            (
              `${config.experimentKey}@` +
              `${config.experimentVersion}`
            ),

          production:
            false,

          executionAuthorized:
            false,
        },
        null,
        2
      )
    );

    console.log(
      ""
    );

    console.log(
      "=============================================================="
    );

    console.log(
      "PHASE 23R.10G.1 PREFLIGHT: PASS"
    );

    console.log(
      "READY FOR PHASE 23R.10G.2 LIVE CLOSED-LOOP CERTIFICATION"
    );

    console.log(
      "=============================================================="
    );
  } finally {
    await closePostgresPool();
  }
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 23R.10G.1 PREFLIGHT: FAIL"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `${error.code || "ERROR"}: ${error.message}`
      );

      process.exitCode =
        1;
    }
  );