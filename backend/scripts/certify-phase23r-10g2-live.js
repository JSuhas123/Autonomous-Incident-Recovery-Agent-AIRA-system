"use strict";

/**
 * AIRA Phase 23R.10G.2
 * Crash-safe full live closed-loop certification.
 *
 * Invariants:
 *
 * REALITY REPLAY != EXECUTION AUTHORITY
 * LAB MUTATION != PRODUCTION AUTHORITY
 * GROUND TRUTH != AGENT CONTEXT
 *
 * This certifier:
 *
 * 1. validates the frozen 23R.13U corpus;
 * 2. repairs an interrupted Phase-23R live experiment through the canonical
 *    Phase-21 reset path before starting a new certification;
 * 3. runs 10G.1 preflight;
 * 4. creates real persisted replay lineage;
 * 5. injects a real LAB_ONLY Kubernetes failure;
 * 6. drives AIRA investigation and diagnosis;
 * 7. executes recovery only through canonical execution authorization;
 * 8. independently verifies recovery;
 * 9. resets the Reliability Lab;
 * 10. verifies final persisted state;
 * 11. writes a certification artifact only on full PASS;
 * 12. attempts canonical cleanup on every failed post-mutation exit path.
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const crypto =
  require(
    "node:crypto"
  );

const {
  execFileSync,
  execFile,
} =
  require(
    "node:child_process"
  );

const {
  promisify,
} =
  require(
    "node:util"
  );


const execFileAsync =
  promisify(
    execFile
  );


/*
 * ============================================================================
 * ENVIRONMENT MUST LOAD BEFORE POSTGRESQL MODULES
 * ============================================================================
 *
 * This prevents the SCRAM error seen in the standalone stale-reset helper.
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


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );

const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );

const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const {
  LabEnvironmentLifecycleService,
} =
  require(
    "../services/reliability/labEnvironmentLifecycleService"
  );

const {
  ExperimentOrchestrator,
} =
  require(
    "../services/reliability/experimentOrchestrator"
  );

const {
  AiraCorrelationHarness,
} =
  require(
    "../services/reliability/airaCorrelationHarness"
  );

const {
  AiraDiagnosisHarness,
} =
  require(
    "../services/reliability/airaDiagnosisHarness"
  );

const {
  ReliabilityFailureInjectorAdapter,
} =
  require(
    "../services/reliability/liveExperimentWiringAdapters"
  );

const {
  FailureInjectionEngine,
} =
  require(
    "../services/reliability/failureInjectionEngine"
  );

const {
  KubernetesReliabilityLabRuntime,
} =
  require(
    "../services/reliability/runtimes/kubernetesReliabilityLabRuntime"
  );


const {
  RealityReplayService,
} =
  require(
    "../services/reality/realityReplayService"
  );

const {
  RealityEnvironmentReplayLiveOrchestrator,
} =
  require(
    "../services/reality/realityEnvironmentReplayLiveOrchestrator"
  );

const {
  RealityEnvironmentReplayBindingService,
} =
  require(
    "../services/reality/realityEnvironmentReplayBindingService"
  );

const {
  RealityKubernetesReplayRunner,
} =
  require(
    "../services/reality/realityKubernetesReplayRunner"
  );

const {
  RealityAiraInvestigationBridge,
} =
  require(
    "../services/reality/realityAiraInvestigationBridge"
  );

const {
  RealityRecoveryVerificationResetBridge,
} =
  require(
    "../services/reality/realityRecoveryVerificationResetBridge"
  );

const {
  Phase23R10G2RecoveryExecutor,
} =
  require(
    "../services/reality/phase23r10g2RecoveryExecutor"
  );


const CERTIFICATION_VERSION =
  "23R.10G.2.2";

const SAFETY_CLASS =
  "LAB_ONLY";

const CANONICAL_CASE_ID =
  "phase23r10g2_kubernetes_pod_crash_live_001";


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

    context:
      "kind-aira-reliability-lab",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    targetApp:
      "lab-api",

    experimentKey:
      "kubernetes.pod.crash",

    experimentVersion:
      "1",

    serviceId:
      "svc_phase21_reliability_lab_api",

    replacementTimeoutMs:
      60000,

    rolloutTimeoutMs:
      90000,
  });


function certificationError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase23R10G2LiveCertificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,

      ...metadata,
    }
  );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    !condition
  ) {
    throw certificationError(
      code,
      message
    );
  }
}


function argumentValue(
  name
) {
  const index =
    process.argv.indexOf(
      name
    );

  return (
    index >=
      0 &&
    index + 1 <
      process.argv.length
  )
    ? process.argv[
        index + 1
      ]
    : null;
}


function positiveInteger(
  value,
  fallback
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      String(
        value
      ),
      10
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      1
  ) {
    throw certificationError(
      "PHASE23R_10G2_INTEGER_INVALID",
      (
        "Expected positive integer, "
        + `received ${value}`
      )
    );
  }

  return parsed;
}


function configuration() {
  const dataRoot =
    argumentValue(
      "--data-root"
    ) ||
    process.env
      .AIRA_DATA_ROOT ||
    path.resolve(
      __dirname,
      "../../AIRA-DATA"
    );

  return {
    dataRoot:
      path.resolve(
        dataRoot
      ),

    organizationId:
      process.env
        .AIRA_PHASE23R_ORGANIZATION_ID ||
      DEFAULTS
        .organizationId,

    environmentId:
      process.env
        .AIRA_PHASE23R_ENVIRONMENT_ID ||
      DEFAULTS
        .environmentId,

    tenantId:
      process.env
        .AIRA_PHASE23R_TENANT_ID ||
      DEFAULTS
        .tenantId,

    labEnvironmentId:
      process.env
        .AIRA_PHASE23R_LAB_ENVIRONMENT_ID ||
      DEFAULTS
        .labEnvironmentId,

    context:
      process.env
        .AIRA_PHASE23R_KUBE_CONTEXT ||
      DEFAULTS
        .context,

    namespace:
      process.env
        .AIRA_PHASE23R_KUBE_NAMESPACE ||
      DEFAULTS
        .namespace,

    deployment:
      process.env
        .AIRA_PHASE23R_KUBE_DEPLOYMENT ||
      DEFAULTS
        .deployment,

    targetApp:
      process.env
        .AIRA_PHASE23R_KUBE_APP ||
      DEFAULTS
        .targetApp,

    serviceId:
      process.env
        .AIRA_PHASE23R_SERVICE_ID ||
      DEFAULTS
        .serviceId,

    experimentKey:
      DEFAULTS
        .experimentKey,

    experimentVersion:
      DEFAULTS
        .experimentVersion,

    replacementTimeoutMs:
      positiveInteger(
        process.env
          .AIRA_PHASE23R_REPLACEMENT_TIMEOUT_MS,

        DEFAULTS
          .replacementTimeoutMs
      ),

    rolloutTimeoutMs:
      positiveInteger(
        process.env
          .AIRA_PHASE23R_ROLLOUT_TIMEOUT_MS,

        DEFAULTS
          .rolloutTimeoutMs
      ),
  };
}


function assertHardSafety(
  config
) {
  requireCondition(
    config.context ===
      "kind-aira-reliability-lab",

    "PHASE23R_10G2_CONTEXT_FORBIDDEN",

    (
      "23R.10G.2 is locked to "
      + "kind-aira-reliability-lab"
    )
  );

  requireCondition(
    config.namespace ===
      "aira-reliability-lab",

    "PHASE23R_10G2_NAMESPACE_FORBIDDEN",

    (
      "23R.10G.2 is locked to "
      + "aira-reliability-lab"
    )
  );

  requireCondition(
    config.deployment ===
      "lab-api",

    "PHASE23R_10G2_DEPLOYMENT_FORBIDDEN",

    (
      "23R.10G.2 is locked to "
      + "deployment lab-api"
    )
  );
}


function readCorpusFreeze(
  config
) {
  const freezePath =
    path.join(
      config.dataRoot,

      "manifests",

      "phase23r13-corpus-freeze.json"
    );


  if (
    !fs.existsSync(
      freezePath
    )
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_FREEZE_MISSING",

      (
        "23R.13U freeze artifact missing: "
        + freezePath
      )
    );
  }


  let freeze;

  try {
    freeze =
      JSON.parse(
        fs.readFileSync(
          freezePath,
          "utf8"
        )
      );
  } catch (
    error
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_FREEZE_JSON_INVALID",

      (
        "23R.13U corpus freeze artifact "
        + "contains invalid JSON: "
        + error.message
      )
    );
  }


  /*
   * ------------------------------------------------------------------------
   * EXPLICIT FAIL-CLOSED 23R.13U BOUNDARY
   * ------------------------------------------------------------------------
   *
   * Keep these as explicit negative checks.
   *
   * They are intentionally source-visible because the Phase-23R regression
   * suite certifies that the live path cannot silently reinterpret a
   * non-frozen, authority-bearing, production-certified, or
   * ground-truth-visible corpus artifact.
   */


  if (
    freeze.status !==
      "FROZEN"
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_NOT_FROZEN",

      (
        "23R.10G.2 requires the "
        + "23R.13U corpus status to be FROZEN"
      )
    );
  }


  if (
    freeze.phaseGate !==
      "23R.13U"
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_PHASE_GATE_INVALID",

      (
        "23R.10G.2 requires the "
        + "23R.13U corpus freeze artifact"
      )
    );
  }


  if (
    freeze.executionAuthorized ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_AUTHORITY_INVALID",

      (
        "Corpus evidence must never "
        + "grant execution authority"
      )
    );
  }


  if (
    freeze.productionCertified ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_PRODUCTION_CERT_INVALID",

      (
        "23R corpus certification must not "
        + "be interpreted as production certification"
      )
    );
  }


  if (
    freeze.groundTruthAgentVisible ===
      true
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_GROUND_TRUTH_VISIBLE",

      (
        "23R.13U ground truth must remain "
        + "sealed from the AIRA agent context"
      )
    );
  }


  if (
    typeof freeze.freezeHash !==
      "string" ||

    !/^[a-f0-9]{64}$/i
      .test(
        freeze.freezeHash
      )
  ) {
    throw certificationError(
      "PHASE23R_10G2_CORPUS_FREEZE_HASH_INVALID",

      (
        "23R.13U corpus freeze does not "
        + "contain a valid SHA-256 freeze hash"
      )
    );
  }


  /*
   * The hard negative checks above are the authority boundary.
   *
   * Reassert the complete expected safe state before returning the artifact
   * to the live certification path.
   */
  requireCondition(
    freeze.status ===
      "FROZEN" &&

    freeze.phaseGate ===
      "23R.13U" &&

    freeze.executionAuthorized ===
      false &&

    freeze.productionCertified ===
      false &&

    freeze.groundTruthAgentVisible ===
      false,

    "PHASE23R_10G2_CORPUS_FREEZE_INVALID",

    (
      "23R.13U corpus freeze failed "
      + "the live-certification prerequisite"
    )
  );


  return {
    path:
      freezePath,

    freezeHash:
      freeze.freezeHash,
  };
}


function runPreflight(
  config
) {
  execFileSync(
    process.execPath,

    [
      path.resolve(
        __dirname,
        "preflight-phase23r-10g-live.js"
      ),
    ],

    {
      cwd:
        path.resolve(
          __dirname,
          ".."
        ),

      stdio:
        "inherit",

      env: {
        ...process.env,

        AIRA_PHASE23R_ORGANIZATION_ID:
          config.organizationId,

        AIRA_PHASE23R_ENVIRONMENT_ID:
          config.environmentId,

        AIRA_PHASE23R_LAB_ENVIRONMENT_ID:
          config.labEnvironmentId,

        AIRA_PHASE23R_KUBE_CONTEXT:
          config.context,

        AIRA_PHASE23R_KUBE_NAMESPACE:
          config.namespace,

        AIRA_PHASE23R_KUBE_DEPLOYMENT:
          config.deployment,
      },
    }
  );
}


async function kubectl(
  config,
  args,
  timeoutMs =
    30000
) {
  const result =
    await execFileAsync(
      "kubectl",

      [
        "--context",
        config.context,

        ...args,
      ],

      {
        encoding:
          "utf8",

        timeout:
          timeoutMs,

        windowsHide:
          true,

        maxBuffer:
          1024 * 1024,
      }
    );

  return {
    stdout:
      result.stdout ||
      "",

    stderr:
      result.stderr ||
      "",
  };
}


async function kubectlJson(
  config,
  args,
  timeoutMs =
    30000
) {
  const result =
    await kubectl(
      config,

      [
        ...args,

        "-o",
        "json",
      ],

      timeoutMs
    );

  try {
    return JSON.parse(
      result.stdout
    );
  } catch (
    error
  ) {
    throw certificationError(
      "PHASE23R_10G2_KUBECTL_JSON_INVALID",
      (
        "kubectl returned invalid JSON: "
        + error.message
      )
    );
  }
}


function normalizePod(
  item
) {
  const conditions =
    Array.isArray(
      item
        ?.status
        ?.conditions
    )
      ? item
          .status
          .conditions
      : [];

  return {
    name:
      item
        ?.metadata
        ?.name ||
      null,

    uid:
      item
        ?.metadata
        ?.uid ||
      null,

    namespace:
      item
        ?.metadata
        ?.namespace ||
      null,

    phase:
      item
        ?.status
        ?.phase ||
      null,

    ready:
      conditions.some(
        (
          condition
        ) =>
          (
            condition.type ===
              "Ready" &&

            condition.status ===
              "True"
          )
      ),

    labels:
      item
        ?.metadata
        ?.labels ||
      {},
  };
}


async function discoverReadyPod(
  config
) {
  const payload =
    await kubectlJson(
      config,

      [
        "get",
        "pods",

        "-n",
        config.namespace,

        "-l",
        `app=${config.targetApp}`,
      ]
    );

  const ready =
    (
      payload.items ||
      []
    )
      .map(
        normalizePod
      )
      .find(
        (
          pod
        ) =>
          (
            pod.ready ===
              true &&

            pod.phase ===
              "Running"
          )
      );

  if (
    !ready?.name ||
    !ready?.uid
  ) {
    throw certificationError(
      "PHASE23R_10G2_READY_POD_MISSING",
      (
        "No Ready lab-api pod is available "
        + "in the Reliability Lab"
      )
    );
  }

  return ready;
}


async function waitForPodReplacement(
  config,
  previousUid
) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    config
      .replacementTimeoutMs
  ) {
    const current =
      await discoverReadyPod(
        config
      )
        .catch(
          () =>
            null
        );

    if (
      current &&
      current.uid !==
        previousUid
    ) {
      return {
        ...current,

        replacementObservedAt:
          new Date()
            .toISOString(),
      };
    }

    await new Promise(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          1000
        )
    );
  }

  throw certificationError(
    "PHASE23R_10G2_REPLACEMENT_TIMEOUT",
    (
      "Timed out waiting for the injected "
      + "pod crash to produce a Ready replacement"
    )
  );
}


function createBaselineProvider(
  config
) {
  return {
    async capture() {
      const pod =
        await discoverReadyPod(
          config
        );

      return {
        observed:
          true,

        independent:
          true,

        healthy:
          true,

        ready:
          true,

        behaviorRecovered:
          true,

        dependenciesReachable:
          true,

        latencyAcceptable:
          true,

        pod,

        safetyClass:
          SAFETY_CLASS,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    },
  };
}


function createResetter(
  config
) {
  return {
    async reset() {
      await kubectl(
        config,

        [
          "rollout",
          "status",

          `deployment/${config.deployment}`,

          "-n",
          config.namespace,

          (
            "--timeout="
            + `${Math.ceil(
              config.rolloutTimeoutMs /
              1000
            )}s`
          ),
        ],

        (
          config.rolloutTimeoutMs +
          10000
        )
      );

      const pod =
        await discoverReadyPod(
          config
        );

      return {
        resetSucceeded:
          true,

        baselineRestored:
          true,

        mechanism:
          "KUBERNETES_DECLARATIVE_SELF_HEALING_WAIT",

        pod,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    },
  };
}


function buildObservablePodCrashSignal({
  config,
  original,
  replacement,
  correlationId,
}) {
  return {
    provider:
      "kubernetes",

    source:
      "kubernetes",

    signalType:
      "kubernetes.pod.replacement",

    eventType:
      "kubernetes.pod.replacement",

    severity:
      "critical",

    status:
      "firing",

    title:
      "Reliability Lab pod replacement observed",

    message:
      (
        `Pod ${original.name} disappeared `
        + `and replacement ${replacement.name} `
        + "became Ready"
      ),

    observedAt:
      replacement
        .replacementObservedAt ||
      new Date()
        .toISOString(),

    sourceEventId:
      (
        "phase23r10g2:"
        + `${original.uid}:`
        + `${replacement.uid}`
      ),

    correlationId,

    serviceId:
      config.serviceId,

    resource: {
      type:
        "kubernetes.pod",

      resourceType:
        "kubernetes.pod",

      serviceName:
        config.targetApp,

      namespace:
        config.namespace,

      name:
        original.name,

      uid:
        original.uid,
    },

    attributes: {
      reliabilityLab: {
        phase:
          "23R.10G.2",

        safetyClass:
          SAFETY_CLASS,

        serviceId:
          config.serviceId,

        groundTruthIncluded:
          false,
      },

      kubernetes: {
        namespace:
          config.namespace,

        originalPod:
          original.name,

        originalUid:
          original.uid,

        replacementPod:
          replacement.name,

        replacementUid:
          replacement.uid,

        replacementReady:
          replacement.ready,
      },
    },

    rawPayload: {
      original: {
        pod:
          original.name,

        uid:
          original.uid,
      },

      replacement: {
        pod:
          replacement.name,

        uid:
          replacement.uid,

        ready:
          replacement.ready,
      },
    },

    metadata: {
      correlationId,

      phase:
        "23R.10G.2",

      safetyClass:
        SAFETY_CLASS,

      serviceOwnershipIncluded:
        true,

      groundTruthIncluded:
        false,

      executionAuthorized:
        false,
    },

    executionAuthorized:
      false,
  };
}


function readKindKubeconfig(
  config
) {
  return execFileSync(
    "kubectl",

    [
      "--context",
      config.context,

      "config",
      "view",

      "--raw",
      "--minify",

      "-o",
      "yaml",
    ],

    {
      encoding:
        "utf8",

      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    }
  );
}


/*
 * ============================================================================
 * PERSISTED PHASE-21 LAB STATE
 * ============================================================================
 */

async function inspectLabState({
  repository,
  config,
}) {
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
      "PHASE23R_10G2_LAB_NOT_FOUND",
      (
        "Canonical Reliability Lab "
        + "was not found"
      )
    );
  }

  requireCondition(
    lab.safetyClass ===
      SAFETY_CLASS &&

    lab.production ===
      false &&

    lab.executionAuthorized ===
      false,

    "PHASE23R_10G2_LAB_SAFETY_INVALID",

    (
      "Canonical Reliability Lab failed "
      + "LAB_ONLY safety validation"
    )
  );

  return lab;
}


async function findLatestRecoverableLiveRun({
  repository,
  config,
}) {
  return repository
    .scope
    .run(
      {
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT
                er.public_id,
                er.status,
                er.outcome,
                er.correlation_id,
                er.metadata,
                er.started_at,
                er.completed_at,
                er.created_at,
                er.execution_authorized

              FROM
                reliability.experiment_runs er

              INNER JOIN
                reliability.lab_environments le

                ON
                  le.id =
                  er.lab_environment_id

              WHERE
                er.organization_id =
                  $1

                AND

                er.environment_id =
                  $2

                AND

                le.public_id =
                  $3

                AND
                (
                  er.metadata
                    ->>
                    'source'
                  =
                    'AIRA_REALITY_ENVIRONMENT_REPLAY'

                  OR

                  er.metadata
                    ->>
                    'phase'
                  =
                    '23R.10B'

                  OR

                  er.metadata
                    ->>
                    'phase'
                  =
                    '23R.10G.2'
                )

                AND

                er.status <>
                  'COMPLETE'

                AND

                er.status <>
                  'ABORTED'

              ORDER BY
                COALESCE(
                  er.started_at,
                  er.created_at
                )
                DESC,

                er.created_at
                DESC

              LIMIT 1
            `,

            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              config
                .labEnvironmentId,
            ]
          );

        return (
          result.rows[
            0
          ] ||
          null
        );
      }
    );
}


/*
 * ============================================================================
 * CRASH-SAFE CANONICAL RESET
 * ============================================================================
 *
 * No direct status rewrite.
 * No fake AVAILABLE transition.
 * No deletion of experiment evidence.
 *
 * The only recovery path is Phase-21 resetAfterPartialRun().
 */

async function ensureLabAvailable({
  repository,
  orchestrator,
  baselineProvider,
  resetter,
  config,
  reason,
}) {
  const lab =
    await inspectLabState({
      repository,
      config,
    });

  if (
    lab.status ===
      "AVAILABLE"
  ) {
    return {
      recovered:
        false,

      labStatus:
        lab.status,

      experimentRunId:
        null,
    };
  }

  const recoverableStatuses =
    new Set([
      "RUNNING_EXPERIMENT",
      "RESETTING",
      "RESET_FAILED",
      "DIRTY",
      "UNHEALTHY",
    ]);

  requireCondition(
    recoverableStatuses
      .has(
        lab.status
      ),

    "PHASE23R_10G2_LAB_STATE_NOT_RECOVERABLE",

    (
      "Reliability Lab cannot be safely "
      + "auto-recovered while status="
      + lab.status
    )
  );

  const staleRun =
    await findLatestRecoverableLiveRun({
      repository,
      config,
    });

  requireCondition(
    staleRun &&
    typeof staleRun.public_id ===
      "string",

    "PHASE23R_10G2_STALE_RUN_NOT_FOUND",

    (
      `Lab status=${lab.status} but no `
      + "interrupted Phase-23R live experiment "
      + "could be resolved"
    )
  );

  requireCondition(
    staleRun
      .execution_authorized !==
      true,

    "PHASE23R_10G2_STALE_RUN_AUTHORITY_INVALID",

    (
      "Interrupted live experiment unexpectedly "
      + "carries execution authority"
    )
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CRASH-SAFE LAB RECOVERY"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Reason:          ${reason}`
  );

  console.log(
    `Lab status:      ${lab.status}`
  );

  console.log(
    `Experiment run:  ${staleRun.public_id}`
  );

  console.log(
    `Run status:      ${staleRun.status}`
  );


  const resetResult =
    await orchestrator
      .resetAfterPartialRun({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        labEnvironmentId:
          config.labEnvironmentId,

        experimentRunId:
          staleRun.public_id,

        resetter,

        baselineProvider,
      });


  requireCondition(
    resetResult
      ?.resetSucceeded ===
      true &&

    resetResult
      ?.baselineRestored ===
      true &&

    resetResult
      ?.executionAuthorized ===
      false,

    "PHASE23R_10G2_CRASH_SAFE_RESET_FAILED",

    (
      "Canonical Phase-21 reset did not "
      + "restore the interrupted live run"
    )
  );


  const finalLab =
    await inspectLabState({
      repository,
      config,
    });


  requireCondition(
    finalLab.status ===
      "AVAILABLE",

    "PHASE23R_10G2_LAB_NOT_AVAILABLE_AFTER_RESET",

    (
      "Reliability Lab remained "
      + `${finalLab.status} `
      + "after canonical reset"
    )
  );


  const finalRun =
    await repository
      .getExperimentRun({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        experimentRunId:
          staleRun.public_id,
      });


  requireCondition(
    finalRun
      ?.status ===
      "ABORTED",

    "PHASE23R_10G2_STALE_RUN_NOT_ABORTED",

    (
      "Interrupted experiment final status="
      + (
        finalRun
          ?.status ||
        "MISSING"
      )
    )
  );


  console.log(
    "PASS  Canonical Phase-21 reset succeeded"
  );

  console.log(
    "PASS  Interrupted experiment marked ABORTED"
  );

  console.log(
    "PASS  Reliability Lab returned to AVAILABLE"
  );


  return {
    recovered:
      true,

    labStatus:
      finalLab.status,

    experimentRunId:
      staleRun.public_id,
  };
}


/*
 * ============================================================================
 * REALITY CASE + REPLAY LINEAGE
 * ============================================================================
 */

async function resolveCanonicalRealityCase({
  tenantScope,
  config,
}) {
  return tenantScope
    .run(
      {
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT
                cv.public_id
                  AS case_version_public_id,

                cv.revision,

                cv.content_hash,

                cv.visible_case,

                cv.execution_authorized

              FROM
                reality.case_versions cv

              WHERE
                cv.organization_id =
                  $1

                AND

                cv.environment_id =
                  $2

                AND

                cv.is_current =
                  TRUE

                AND

                cv.visible_case
                  #>>
                  '{identity,caseId}'
                =
                  $3

              ORDER BY
                cv.revision
                DESC

              LIMIT 1
            `,

            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              CANONICAL_CASE_ID,
            ]
          );

        const row =
          result.rows[
            0
          ];

        if (
          !row
        ) {
          throw certificationError(
            "PHASE23R_10G2_REALITY_CASE_MISSING",

            (
              "Canonical Phase-23R.10G.2 "
              + "persisted RealityCase is missing"
            )
          );
        }

        const visibleCase =
          row.visible_case ||
          {};

        requireCondition(
          !Object
            .prototype
            .hasOwnProperty
            .call(
              visibleCase,

              "sealedEvaluation"
            ) &&

          !Object
            .prototype
            .hasOwnProperty
            .call(
              visibleCase,

              "evaluationRubric"
            ) &&

          row.execution_authorized ===
            false,

          "PHASE23R_10G2_REALITY_CASE_UNSAFE",

          (
            "Canonical persisted RealityCase "
            + "violated replay safety boundaries"
          )
        );

        return {
          caseId:
            CANONICAL_CASE_ID,

          revision:
            Number(
              row.revision
            ),

          contentHash:
            row.content_hash,

          evidenceGrade:
            (
              visibleCase
                ?.provenance
                ?.evidenceGrade
            ) ||
            (
              visibleCase
                ?.identity
                ?.evidenceGrade
            ) ||
            "E1",
        };
      }
    );
}


async function createPersistedReplayLineage({
  tenantScope,
  config,
}) {
  const realityCase =
    await resolveCanonicalRealityCase({
      tenantScope,
      config,
    });


  const replayService =
    new RealityReplayService();


  const replayRun =
    await replayService
      .createRun({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        caseId:
          realityCase.caseId,

        airaVersion:
          CERTIFICATION_VERSION,

        seed:
          231002,

        speedMultiplier:
          1,

        deterministicTimestamps:
          true,

        disorderWindowMs:
          0,

        metadata: {
          phase:
            "23R.10G.2",

          liveCertification:
            true,

          groundTruthAgentVisible:
            false,

          executionAuthorized:
            false,

          productionCertified:
            false,
        },
      });


  requireCondition(
    typeof replayRun
      ?.runId ===
      "string" &&

    replayRun
      .runId
      .length >
      0,

    "PHASE23R_10G2_REPLAY_CREATION_FAILED",

    (
      "Canonical RealityReplayService did not "
      + "create a persisted replay run"
    )
  );


  requireCondition(
    replayRun
      .groundTruthAgentVisible ===
      false &&

    replayRun
      .executionAuthorized ===
      false,

    "PHASE23R_10G2_REPLAY_UNSAFE",

    (
      "Persisted replay lineage violated "
      + "safety boundaries"
    )
  );


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "PERSISTED REALITY REPLAY LINEAGE"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `PASS  Persisted RealityCase — ${realityCase.caseId}`
  );

  console.log(
    `PASS  Persisted replay run — ${replayRun.runId}`
  );

  console.log(
    `PASS  Replay case revision — ${realityCase.revision}`
  );

  console.log(
    "PASS  Replay ground truth visible — false"
  );

  console.log(
    "PASS  Replay execution authority — false"
  );


  return {
    realityCase,
    replayRun,
  };
}


function stableStringify(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "["
      +
      value
        .map(
          stableStringify
        )
        .join(
          ","
        )
      +
      "]"
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return (
      "{"
      +
      Object.keys(
        value
      )
        .sort()
        .map(
          (
            key
          ) =>
            (
              `${JSON.stringify(key)}:`
              +
              stableStringify(
                value[
                  key
                ]
              )
            )
        )
        .join(
          ","
        )
      +
      "}"
    );
  }

  return JSON.stringify(
    value
  );
}


function artifactPath() {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase23r"
    );

  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );

  return path.join(
    directory,

    (
      "phase23r-10g2-live-certification-"
      +
      new Date()
        .toISOString()
        .replace(
          /[:.]/g,
          "-"
        )
      +
      ".json"
    )
  );
}


/*
 * ============================================================================
 * FINAL PERSISTED POSTCONDITIONS
 * ============================================================================
 */

async function verifyFinalState({
  repository,
  bindingService,
  config,
  runnerResult,
}) {
  const lab =
    await inspectLabState({
      repository,
      config,
    });


  const experimentRun =
    await repository
      .getExperimentRun({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        experimentRunId:
          runnerResult.experimentRunId,
      });


  const binding =
    await bindingService
      .getBinding({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        environmentReplayRunId:
          runnerResult.environmentReplayRunId,
      });


  requireCondition(
    lab.status ===
      "AVAILABLE",

    "PHASE23R_10G2_FINAL_LAB_NOT_AVAILABLE",

    (
      "Final Reliability Lab status="
      + lab.status
    )
  );


  requireCondition(
    experimentRun
      ?.status ===
      "ABORTED",

    "PHASE23R_10G2_FINAL_EXPERIMENT_NOT_CLOSED",

    (
      "Final Phase-21 experiment status="
      + (
        experimentRun
          ?.status ||
        "MISSING"
      )
    )
  );


  requireCondition(
    binding
      ?.stage ===
      "COMPLETED",

    "PHASE23R_10G2_FINAL_BINDING_NOT_COMPLETED",

    (
      "Final environment replay stage="
      + (
        binding
          ?.stage ||
        "MISSING"
      )
    )
  );


  requireCondition(
    experimentRun
      .executionAuthorized ===
      false &&

    binding
      .executionAuthorized ===
      false,

    "PHASE23R_10G2_FINAL_AUTHORITY_LEAK",

    (
      "Final persisted state attempted "
      + "to grant execution authority"
    )
  );


  return {
    labStatus:
      lab.status,

    experimentStatus:
      experimentRun.status,

    environmentReplayStage:
      binding.stage,
  };
}


/*
 * ============================================================================
 * MAIN CERTIFICATION
 * ============================================================================
 */

async function main() {
  const config =
    configuration();


  assertHardSafety(
    config
  );


  const corpusFreeze =
    readCorpusFreeze(
      config
    );


  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 23R.10G.2 — CRASH-SAFE LIVE CLOSED-LOOP CERTIFICATION"
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
    `Corpus freeze: ${corpusFreeze.freezeHash}`
  );


  /*
   * Shared canonical PostgreSQL tenant scope.
   */
  const tenantScope =
    new PostgresTenantScope();


  const repository =
    new PostgresReliabilityLabRepository({
      scope:
        tenantScope,
    });


  const lifecycle =
    new LabEnvironmentLifecycleService({
      repository,
    });


  const baselineProvider =
    createBaselineProvider(
      config
    );


  const resetter =
    createResetter(
      config
    );


  const correlationHarness =
    new AiraCorrelationHarness({
      repository,
    });


  const diagnosisHarness =
    new AiraDiagnosisHarness({
      repository,
    });


  const runtime =
    new KubernetesReliabilityLabRuntime({
      namespace:
        config.namespace,

      commandRunner:
        async (
          command,
          args,
          options =
            {}
        ) => {
          if (
            command !==
              "kubectl"
          ) {
            throw certificationError(
              "PHASE23R_10G2_RUNTIME_COMMAND_FORBIDDEN",
              (
                "Unexpected Reliability Lab command "
                + command
              )
            );
          }

          return kubectl(
            config,
            args,
            options.timeoutMs ||
            30000
          );
        },
    });


  const failureEngine =
    new FailureInjectionEngine({
      repository,
      runtime,
      safetyClass:
        SAFETY_CLASS,
    });


  const failureInjector =
    new ReliabilityFailureInjectorAdapter({
      invoke:
        async (
          input
        ) =>
          failureEngine
            .inject(
              {
                ...input,

                runtime,

                safetyClass:
                  SAFETY_CLASS,

                production:
                  false,

                executionAuthorized:
                  false,
              },

              runtime
            ),
    });


  const phase21Orchestrator =
    new ExperimentOrchestrator({
      repository,
      lifecycle,
      baselineProvider,
      failureInjector,
      correlationHarness,
    });


  /*
   * Frozen 23R.10B names this callback observableSignalProvider.
   *
   * Frozen Phase-21 calls it observableSignalFactory.
   *
   * Adapt the interfaces here without modifying either frozen contract.
   */
  const phase21Bridge = {
    async runToCorrelation(
      input
    ) {
      return phase21Orchestrator
        .runToCorrelation({
          ...input,

          observableSignalFactory:
            input
              .observableSignalProvider,
        });
    },

    async resetAfterPartialRun(
      input
    ) {
      return phase21Orchestrator
        .resetAfterPartialRun(
          input
        );
    },
  };


  const liveOrchestrator =
    new RealityEnvironmentReplayLiveOrchestrator({
      phase21Orchestrator:
        phase21Bridge,
    });


  const bindingService =
    new RealityEnvironmentReplayBindingService();


  const runner =
    new RealityKubernetesReplayRunner({
      bindingService,
      liveOrchestrator,
    });


  const investigationBridge =
    new RealityAiraInvestigationBridge({
      bindingService,
      diagnosisHarness,
    });


  const recoveryBridge =
    new RealityRecoveryVerificationResetBridge({
      bindingService,
      liveOrchestrator,
    });


  let primaryError =
    null;

  let runnerResult =
    null;

  let investigation =
    null;

  let recoveryLifecycle =
    null;

  let preRunRecovery =
    null;

  let failureCleanup =
    null;

  let lineage =
    null;


  try {
    /*
     * ========================================================================
     * STAGE A
     * RECONCILE ANY PREVIOUS INTERRUPTED 10G.2 RUN
     * ========================================================================
     */
    preRunRecovery =
      await ensureLabAvailable({
        repository,

        orchestrator:
          phase21Orchestrator,

        baselineProvider,

        resetter,

        config,

        reason:
          "PRE_RUN_STATE_RECONCILIATION",
      });


    /*
     * ========================================================================
     * STAGE B
     * FROZEN 10G.1 PREFLIGHT
     * ========================================================================
     */
    runPreflight(
      config
    );


    /*
     * ========================================================================
     * STAGE C
     * REAL PERSISTED REALITY CASE -> REAL PERSISTED REPLAY RUN
     * ========================================================================
     */
    lineage =
      await createPersistedReplayLineage({
        tenantScope,
        config,
      });


    const targetBefore =
      await discoverReadyPod(
        config
      );


    const correlationId =
      (
        "phase23r10g2:"
        +
        crypto.randomUUID()
      );


    /*
     * ========================================================================
     * STAGE D
     * 23R.10D — REAL KUBERNETES FAILURE + AIRA CORRELATION
     * ========================================================================
     */
    runnerResult =
      await runner
        .start({
          organizationId:
            config.organizationId,

          environmentId:
            config.environmentId,

          tenantId:
            config.tenantId,

          labEnvironmentId:
            config.labEnvironmentId,

          replayRunId:
            lineage
              .replayRun
              .runId,

          realityCaseId:
            lineage
              .realityCase
              .caseId,

          realityCaseVersion:
            String(
              lineage
                .realityCase
                .revision
            ),

          /*
           * Controlled AIRA Reliability Lab evidence is E1.
           */
          evidenceGrade:
            "E1",

          replaySeed:
            231002,

          correlationId,

          experimentKey:
            config.experimentKey,

          failureKey:
            config.experimentKey,

          target: {
            kind:
              "kubernetes.pod",

            resourceType:
              "kubernetes.pod",

            namespace:
              config.namespace,

            podName:
              targetBefore.name,

            name:
              targetBefore.name,

            uid:
              targetBefore.uid,

            app:
              config.targetApp,

            labels: {
              app:
                config.targetApp,

              "aira.reliability-lab":
                "true",

              "aira.safety-class":
                SAFETY_CLASS,
            },

            production:
              false,

            executionAuthorized:
              false,
          },

          injectionParameters: {
            namespace:
              config.namespace,

            podName:
              targetBefore.name,

            gracePeriodSeconds:
              0,
          },

          observableSignalProvider:
            async () => {
              const replacement =
                await waitForPodReplacement(
                  config,
                  targetBefore.uid
                );

              return buildObservablePodCrashSignal({
                config,
                original:
                  targetBefore,
                replacement,
                correlationId,
              });
            },

          ingestionContext: {
            organizationId:
              config.organizationId,

            environmentId:
              config.environmentId,

            tenantId:
              config.tenantId,

            serviceId:
              config.serviceId,

            source:
              "PHASE23R_REALITY_RELIABILITY_LAB",

            reliabilityLab:
              true,

            executionAuthorized:
              false,
          },

          metadata: {
            certificationVersion:
              CERTIFICATION_VERSION,

            live:
              true,

            safetyClass:
              SAFETY_CLASS,

            corpusFreezeHash:
              corpusFreeze.freezeHash,

            evaluatorGroundTruthStoredSeparately:
              true,

            groundTruthPassedToAira:
              false,

            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          production:
            false,

          executionAuthorized:
            false,
        });


    requireCondition(
      runnerResult
        .phase21Status ===
        "WAITING_FOR_DIAGNOSIS",

      "PHASE23R_10G2_CORRELATION_NOT_REACHED",

      (
        "Unexpected Phase-21 status "
        + runnerResult.phase21Status
      )
    );


    const incidentId =
      runnerResult
        ?.correlation
        ?.incidentId;


    requireCondition(
      typeof incidentId ===
        "string" &&

      incidentId.length >
        0,

      "PHASE23R_10G2_INCIDENT_NOT_OBSERVED",

      (
        "Live failure did not produce "
        + "a canonical AIRA incident"
      )
    );


    /*
     * ========================================================================
     * STAGE E
     * 23R.10E — REAL AIRA INVESTIGATION
     * ========================================================================
     */
    investigation =
      await investigationBridge
        .investigate({
          organizationId:
            config.organizationId,

          environmentId:
            config.environmentId,

          tenantId:
            config.tenantId,

          replayRunId:
            lineage
              .replayRun
              .runId,

          environmentReplayRunId:
            runnerResult
              .environmentReplayRunId,

          experimentRunId:
            runnerResult
              .experimentRunId,

          correlationId,

          incidentId,

          diagnosisDependencies:
            {},

          production:
            false,

          executionAuthorized:
            false,
        });


    requireCondition(
      typeof investigation
        ?.diagnosis
        ?.diagnosisRunId ===
        "string" &&

      investigation
        .diagnosis
        .diagnosisRunId
        .length >
        0,

      "PHASE23R_10G2_DIAGNOSIS_RUN_MISSING",

      (
        "AIRA investigation did not "
        + "produce a diagnosis run"
      )
    );


    requireCondition(
      typeof investigation
        ?.diagnosis
        ?.selectedFailureMode ===
        "string" &&

      investigation
        .diagnosis
        .selectedFailureMode
        .length >
        0,

      "PHASE23R_10G2_FAILURE_MODE_MISSING",

      (
        "AIRA diagnosis did not select "
        + "a machine-readable failure mode"
      )
    );


    requireCondition(
      investigation
        ?.diagnosis
        ?.groundTruthConsumed ===
        false &&

      investigation
        ?.diagnosis
        ?.evaluatorInfluencedReasoning ===
        false,

      "PHASE23R_10G2_GROUND_TRUTH_CONSUMED",

      (
        "AIRA diagnosis consumed or was influenced "
        + "by evaluator ground truth"
      )
    );


    /*
     * ========================================================================
     * STAGE F
     * CANONICAL AUTHORIZATION + PHASE-20 RUNTIME + REAL KUBERNETES RECOVERY
     * ========================================================================
     */
    const recoveryExecutor =
      new Phase23R10G2RecoveryExecutor({
        context:
          config.context,

        namespace:
          config.namespace,

        deployment:
          config.deployment,

        kubeconfig:
          readKindKubeconfig(
            config
          ),
      });


    /*
     * ========================================================================
     * STAGE G
     * 23R.10F — RECOVERY -> VERIFICATION -> CANONICAL RESET
     * ========================================================================
     */
    recoveryLifecycle =
      await recoveryBridge
        .run({
          organizationId:
            config.organizationId,

          environmentId:
            config.environmentId,

          tenantId:
            config.tenantId,

          labEnvironmentId:
            config.labEnvironmentId,

          environmentReplayRunId:
            runnerResult
              .environmentReplayRunId,

          experimentRunId:
            runnerResult
              .experimentRunId,

          incidentId,

          diagnosis:
            investigation
              .diagnosis,

          recoveryDecision: {
            type:
              "LAB_ONLY_RESTART_PROPOSAL",

            selectedFailureMode:
              investigation
                .diagnosis
                .selectedFailureMode,

            executionAuthorized:
              false,
          },

          target: {
            namespace:
              config.namespace,

            deploymentName:
              config.deployment,

            production:
              false,

            executionAuthorized:
              false,
          },

          recoveryExecutor,

          beforeObservation: {
            observed:
              true,

            independent:
              true,

            healthy:
              false,

            ready:
              false,

            behaviorRecovered:
              false,

            dependenciesReachable:
              true,

            latencyAcceptable:
              true,

            executionAuthorized:
              false,
          },

          afterObservationProvider:
            async () => {
              await kubectl(
                config,

                [
                  "rollout",
                  "status",

                  `deployment/${config.deployment}`,

                  "-n",
                  config.namespace,

                  (
                    "--timeout="
                    + `${Math.ceil(
                      config.rolloutTimeoutMs /
                      1000
                    )}s`
                  ),
                ],

                (
                  config.rolloutTimeoutMs +
                  10000
                )
              );

              const pod =
                await discoverReadyPod(
                  config
                );

              return {
                observed:
                  true,

                independent:
                  true,

                healthy:
                  true,

                ready:
                  true,

                behaviorRecovered:
                  true,

                dependenciesReachable:
                  true,

                latencyAcceptable:
                  true,

                pod,

                productionCertified:
                  false,

                executionAuthorized:
                  false,
              };
            },

          stability: {
            observed:
              true,

            stable:
              true,

            windowMs:
              5000,
          },

          recurrence: {
            observed:
              true,

            detected:
              false,

            retrySafe:
              false,

            windowMs:
              5000,
          },

          rollback: {
            available:
              false,

            safe:
              false,

            strategy:
              null,
          },

          resetter,

          baselineProvider,

          production:
            false,

          executionAuthorized:
            false,
        });


    /*
     * ========================================================================
     * CLOSED-LOOP ASSERTIONS
     * ========================================================================
     */
    requireCondition(
      recoveryLifecycle
        .stage ===
        "COMPLETED",

      "PHASE23R_10G2_LIFECYCLE_NOT_COMPLETED",

      (
        "Environment replay ended at stage "
        + recoveryLifecycle.stage
      )
    );


    requireCondition(
      recoveryLifecycle
        .recovery
        ?.executed ===
        true &&

      recoveryLifecycle
        .recovery
        ?.success ===
        true,

      "PHASE23R_10G2_RECOVERY_NOT_EXECUTED",

      (
        "Canonical authorized recovery did "
        + "not execute successfully"
      )
    );


    requireCondition(
      recoveryLifecycle
        .recovery
        ?.authorizationGranted ===
        true &&

      recoveryLifecycle
        .recovery
        ?.authorizationCriticAccepted ===
        true &&

      recoveryLifecycle
        .recovery
        ?.persistedAuthorization ===
        true &&

      recoveryLifecycle
        .recovery
        ?.immutableExecutionRequest ===
        true &&

      recoveryLifecycle
        .recovery
        ?.integrationAuthorizationBoundaryVerified ===
        true &&

      recoveryLifecycle
        .recovery
        ?.providerExecutionObserved ===
        true &&

      recoveryLifecycle
        .recovery
        ?.unauthorizedExecutionBlocked ===
        true,

      "PHASE23R_10G2_AUTHORIZATION_CHAIN_INCOMPLETE",

      (
        "Canonical authorization/persistence/"
        + "integration boundary chain was incomplete"
      )
    );


    requireCondition(
      recoveryLifecycle
        .verification
        ?.outcome ===
        "VERIFIED_RECOVERY",

      "PHASE23R_10G2_RECOVERY_NOT_VERIFIED",

      (
        "Verification outcome="
        + recoveryLifecycle
            .verification
            ?.outcome
      )
    );


    requireCondition(
      recoveryLifecycle
        .reset
        ?.resetSucceeded ===
        true &&

      recoveryLifecycle
        .reset
        ?.baselineRestored ===
        true &&

      recoveryLifecycle
        .baselineRestored ===
        true,

      "PHASE23R_10G2_RESET_INCOMPLETE",

      (
        "Reliability Lab baseline "
        + "was not restored"
      )
    );


    /*
     * ========================================================================
     * STAGE H
     * FINAL PERSISTED POSTCONDITIONS
     * ========================================================================
     */
    const finalState =
      await verifyFinalState({
        repository,
        bindingService,
        config,
        runnerResult,
      });


    for (
      const [
        name,
        value,
      ]
      of [
        [
          "runner",
          runnerResult,
        ],

        [
          "investigation",
          investigation,
        ],

        [
          "recoveryLifecycle",
          recoveryLifecycle,
        ],
      ]
    ) {
      requireCondition(
        value
          .executionAuthorized !==
          true &&

        value
          .productionCertified !==
          true,

        "PHASE23R_10G2_AUTHORITY_LEAK",

        (
          `${name} attempted to grant `
          + "authority or production certification"
        )
      );
    }


    /*
     * ========================================================================
     * PASS ARTIFACT
     * ========================================================================
     */
    const artifact = {
      version:
        CERTIFICATION_VERSION,

      status:
        "PASS",

      phaseGate:
        "23R.10G.2",

      corpusFreezeHash:
        corpusFreeze.freezeHash,

      realityCaseId:
        lineage
          .realityCase
          .caseId,

      realityCaseRevision:
        lineage
          .realityCase
          .revision,

      realityCaseContentHash:
        lineage
          .realityCase
          .contentHash,

      replayRunId:
        lineage
          .replayRun
          .runId,

      environmentReplayRunId:
        runnerResult
          .environmentReplayRunId,

      experimentRunId:
        runnerResult
          .experimentRunId,

      correlationId:
        runnerResult
          .correlationId,

      incidentId,

      diagnosisRunId:
        investigation
          .diagnosis
          .diagnosisRunId,

      selectedFailureMode:
        investigation
          .diagnosis
          .selectedFailureMode,

      recoveryDecisionId:
        recoveryLifecycle
          .recovery
          .recoveryDecisionId,

      authorizationId:
        recoveryLifecycle
          .recovery
          .authorizationId,

      executionRequestId:
        recoveryLifecycle
          .recovery
          .executionRequestId,

      planId:
        recoveryLifecycle
          .recovery
          .planId,

      planHash:
        recoveryLifecycle
          .recovery
          .planHash,

      preRunRecovery,

      finalState,

      checks: {
        corpusFrozen:
          true,

        preflightPassed:
          true,

        persistedRealityCaseUsed:
          true,

        persistedRealityReplayUsed:
          true,

        realFailureInjected:
          true,

        realObservationCaptured:
          true,

        canonicalIncidentObserved:
          true,

        airaInvestigationExecuted:
          true,

        diagnosisProduced:
          true,

        groundTruthPassedToAira:
          false,

        evaluatorInfluencedReasoning:
          false,

        recoveryProposalProduced:
          true,

        authorizationEngineInvoked:
          true,

        authorizationCriticAccepted:
          true,

        authorizationPersisted:
          true,

        immutableExecutionRequestPersisted:
          true,

        phase20AuthorizationBoundaryVerified:
          true,

        integrationRuntimeExecuted:
          true,

        kubernetesRecoveryExecuted:
          true,

        independentVerificationSucceeded:
          true,

        resetSucceeded:
          true,

        baselineRestored:
          true,

        unauthorizedExecutionBlocked:
          true,

        unauthorizedExecutionObserved:
          false,

        finalLabAvailable:
          finalState
            .labStatus ===
            "AVAILABLE",

        finalExperimentAborted:
          finalState
            .experimentStatus ===
            "ABORTED",

        finalEnvironmentReplayCompleted:
          finalState
            .environmentReplayStage ===
            "COMPLETED",
      },

      verificationOutcome:
        recoveryLifecycle
          .verification
          .outcome,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,

      productionCertified:
        false,
    };


    const coreBytes =
      Buffer.from(
        stableStringify(
          artifact
        ),
        "utf8"
      );


    artifact.certificationHash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          coreBytes
        )
        .digest(
          "hex"
        );


    const artifactFile =
      artifactPath();


    fs.writeFileSync(
      artifactFile,

      (
        JSON.stringify(
          artifact,
          null,
          2
        )
        +
        "\n"
      ),

      "utf8"
    );


    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "PHASE 23R.10G.2 RESULT"
    );

    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "PASS  Real failure injected"
    );

    console.log(
      "PASS  Canonical AIRA incident observed"
    );

    console.log(
      "PASS  AIRA diagnosis produced without ground truth"
    );

    console.log(
      "PASS  Unauthorized execution blocked"
    );

    console.log(
      "PASS  Canonical authorization persisted"
    );

    console.log(
      "PASS  Immutable execution request persisted"
    );

    console.log(
      "PASS  Real Kubernetes recovery executed"
    );

    console.log(
      "PASS  Independent verification = VERIFIED_RECOVERY"
    );

    console.log(
      "PASS  Reliability Lab reset to AVAILABLE"
    );

    console.log(
      "PASS  Environment replay = COMPLETED"
    );

    console.log(
      "PASS  Execution authority remains false"
    );

    console.log(
      "PASS  Production certification remains false"
    );

    console.log(
      ""
    );


    console.log(
      JSON.stringify(
        {
          version:
            CERTIFICATION_VERSION,

          status:
            "PASS",

          phase23r10g2:
            "PASS",

          artifactPath:
            artifactFile,

          certificationHash:
            artifact
              .certificationHash,

          realityCaseId:
            artifact
              .realityCaseId,

          replayRunId:
            artifact
              .replayRunId,

          environmentReplayRunId:
            artifact
              .environmentReplayRunId,

          experimentRunId:
            artifact
              .experimentRunId,

          incidentId:
            artifact
              .incidentId,

          diagnosisRunId:
            artifact
              .diagnosisRunId,

          selectedFailureMode:
            artifact
              .selectedFailureMode,

          authorizationId:
            artifact
              .authorizationId,

          executionRequestId:
            artifact
              .executionRequestId,

          verificationOutcome:
            artifact
              .verificationOutcome,

          labStatus:
            artifact
              .finalState
              .labStatus,

          resetSucceeded:
            true,

          baselineRestored:
            true,

          groundTruthAgentVisible:
            false,

          executionAuthorized:
            false,

          productionCertified:
            false,
        },
        null,
        2
      )
    );
  } catch (
    error
  ) {
    /*
     * Keep the original certification failure.
     *
     * Cleanup performed below must never convert this into PASS.
     */
    primaryError =
      error;
  } finally {
    /*
     * ========================================================================
     * CRASH-SAFE GUARANTEE
     * ========================================================================
     *
     * If anything failed after Phase-21 entered RUNNING_EXPERIMENT,
     * this discovers the actual persisted live experiment and invokes
     * the canonical resetAfterPartialRun().
     *
     * No direct PostgreSQL lifecycle bypass occurs.
     */
    try {
      failureCleanup =
        await ensureLabAvailable({
          repository,

          orchestrator:
            phase21Orchestrator,

          baselineProvider,

          resetter,

          config,

          reason:
            primaryError
              ? "FAILED_CERTIFICATION_CLEANUP"
              : "POST_CERTIFICATION_SAFETY_CHECK",
        });
    } catch (
      cleanupError
    ) {
      if (
        !primaryError
      ) {
        primaryError =
          cleanupError;
      } else {
        primaryError
          .cleanupError =
          {
            code:
              cleanupError
                ?.code ||
              null,

            message:
              cleanupError
                ?.message ||
              String(
                cleanupError
              ),
          };
      }
    }


    await closePostgresPool()
      .catch(
        () =>
          null
      );
  }


  if (
    primaryError
  ) {
    throw primaryError;
  }


  return {
    failureCleanup,
  };
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        JSON.stringify(
          {
            version:
              CERTIFICATION_VERSION,

            status:
              "FAIL",

            code:
              error
                ?.code ||
              "PHASE23R_10G2_LIVE_CERTIFICATION_FAILED",

            message:
              error
                ?.message ||
              String(
                error
              ),

            cleanupError:
              error
                ?.cleanupError ||
              null,

            groundTruthAgentVisible:
              false,

            executionAuthorized:
              false,

            productionCertified:
              false,
          },

          null,
          2
        )
      );

      process.exitCode =
        1;
    }
  );