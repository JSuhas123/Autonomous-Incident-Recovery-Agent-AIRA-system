"use strict";

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


const {
  ExperimentOrchestrator,
  ORCHESTRATOR_VERSION,
} =
  require(
    "../services/reliability/experimentOrchestrator"
  );


const {
  AiraCorrelationHarness,
  CORRELATION_HARNESS_VERSION,
} =
  require(
    "../services/reliability/airaCorrelationHarness"
  );


const {
  ReliabilityFailureInjectorAdapter,
} =
  require(
    "../services/reliability/liveExperimentWiringAdapters"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const lifecycleModule =
  require(
    "../services/reliability/labEnvironmentLifecycleService"
  );


const failureEngineModule =
  require(
    "../services/reliability/failureInjectionEngine"
  );


const kubernetesRuntimeModule =
  require(
    "../services/reliability/runtimes/kubernetesReliabilityLabRuntime"
  );


const CERTIFICATION_VERSION =
  "21.11-12-live-v1";


const SAFETY_CLASS =
  "LAB_ONLY";


const DEFAULT_NAMESPACE =
  "aira-reliability-lab";


const DEFAULT_CLUSTER_NAME =
  "aira-reliability-lab";


const DEFAULT_EXPERIMENT_KEY =
  "kubernetes.pod.crash";


const DEFAULT_TARGET_APP =
  "lab-api";


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const SIGNAL_INGESTION_PATH =
  path.resolve(
    __dirname,
    "../services/signals/signalIngestionService.js"
  );


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner();


  const configuration =
    readConfiguration();


  validateLabEnvironmentFlag();


  console.log(
    `Organization:        ${configuration.organizationId}`
  );

  console.log(
    `Environment:         ${configuration.environmentId}`
  );

  console.log(
    `Tenant:              ${configuration.tenantId}`
  );

  console.log(
    `Namespace:           ${configuration.namespace}`
  );

  console.log(
    `Scenario:            ${configuration.experimentKey}`
  );

  console.log(
    ""
  );


  // ==========================================================================
  // 1. FAIL-CLOSED SOURCE PRE-FLIGHT
  // ==========================================================================

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CANONICAL SIGNAL PATH PRE-FLIGHT"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  const signalPersistence =
    inspectSignalPersistence();


  console.log(
    `Signal service exists:       ${signalPersistence.exists}`
  );

  console.log(
    `Direct Mongoose import:      ${signalPersistence.hasMongooseImport}`
  );

  console.log(
    `Direct models/Signal import: ${signalPersistence.hasLegacySignalModel}`
  );

  console.log(
    `Canonical pre-flight:        ${signalPersistence.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    ""
  );


  if (
    !signalPersistence.pass
  ) {
    throw certificationError(
      "PHASE21_BATCH6_SIGNAL_PERSISTENCE_NOT_CANONICAL",
      [
        "Batch-6 live certification stopped BEFORE failure injection.",
        "The current signal ingestion service still appears to contain a direct Mongo/Mongoose persistence path.",
        "Phase 21 cannot live-certify correlation through a non-canonical internal persistence path.",
      ].join(
        " "
      )
    );
  }


  // ==========================================================================
  // 2. RESOLVE CLASSES
  // ==========================================================================

  const LabEnvironmentLifecycleService =
    resolveExportedClass(
      lifecycleModule,
      "LabEnvironmentLifecycleService"
    );


  const FailureInjectionEngine =
    resolveExportedClass(
      failureEngineModule,
      "FailureInjectionEngine"
    );


  const KubernetesReliabilityLabRuntime =
    resolveExportedClass(
      kubernetesRuntimeModule,
      "KubernetesReliabilityLabRuntime"
    );


  // ==========================================================================
  // 3. POSTGRESQL REPOSITORY + LIFECYCLE
  // ==========================================================================

  const repository =
    new PostgresReliabilityLabRepository();


  const lifecycle =
    new LabEnvironmentLifecycleService({
      repository,
    });


  const labEnvironmentId =
    configuration.labEnvironmentId ||
    discoverLabEnvironmentIdFromArtifacts();


  if (
    !labEnvironmentId
  ) {
    throw certificationError(
      "PHASE21_BATCH6_LAB_ENVIRONMENT_ID_REQUIRED",
      [
        "Could not determine the canonical Reliability Lab environment ID.",
        "Set PHASE21_LAB_ENVIRONMENT_ID to the public ID used by the already-certified Phase 21 lab.",
      ].join(
        " "
      )
    );
  }


  console.log(
    `Lab environment:      ${labEnvironmentId}`
  );


  const scope = {
    organizationId:
      configuration.organizationId,

    environmentId:
      configuration.environmentId,

    labEnvironmentId,
  };


  const environment =
    await lifecycle
      .requireEnvironment(
        scope
      );


  console.log(
    `Lab status:           ${environment.status}`
  );

  console.log(
    `Lab kind:             ${environment.kind}`
  );


  if (
    environment.production ===
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH6_PRODUCTION_TARGET_FORBIDDEN",
      "Reliability Lab environment resolved as production"
    );
  }


  if (
    environment.status !==
      "AVAILABLE"
  ) {
    throw certificationError(
      "PHASE21_BATCH6_LAB_NOT_AVAILABLE",
      `Lab must be AVAILABLE before Batch-6 certification; current status=${environment.status}`
    );
  }


  // ==========================================================================
  // 4. KNOWN-HEALTHY BASELINE PROVIDER
  // ==========================================================================

  const baselineProvider =
    createLiveBaselineProvider({
      lifecycle,

      namespace:
        configuration.namespace,

      labBaseUrl:
        configuration.labBaseUrl,
    });


  const preRunBaseline =
    await baselineProvider
      .capture({
        ...scope,

        experimentRunId:
          null,
      });


  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "KNOWN HEALTHY BASELINE"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Health endpoint:      ${preRunBaseline.liveGate.healthHealthy ? "PASS" : "FAIL"}`
  );

  console.log(
    `Readiness endpoint:   ${preRunBaseline.liveGate.readyHealthy ? "PASS" : "FAIL"}`
  );

  console.log(
    `lab-api ready pod:    ${preRunBaseline.liveGate.readyPodObserved ? "PASS" : "FAIL"}`
  );

  console.log(
    `Result:               ${preRunBaseline.healthy ? "PASS" : "FAIL"}`
  );

  console.log(
    ""
  );


  // ==========================================================================
  // 5. DISCOVER REAL TARGET
  // ==========================================================================

  const targetBefore =
    await discoverReadyPod({
      namespace:
        configuration.namespace,

      app:
        configuration.targetApp,
    });


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "REAL LAB TARGET"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Pod:                  ${targetBefore.name}`
  );

  console.log(
    `UID:                  ${targetBefore.uid}`
  );

  console.log(
    `Phase:                ${targetBefore.phase}`
  );

  console.log(
    `Ready:                ${targetBefore.ready}`
  );

  console.log(
    ""
  );


  if (
    targetBefore.phase !==
      "Running" ||
    targetBefore.ready !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH6_TARGET_NOT_HEALTHY",
      "Target lab-api pod is not Running/Ready before failure injection"
    );
  }


  // ==========================================================================
  // 6. REAL PHASE 21.9 FAILURE ENGINE
  // ==========================================================================

  const runtime =
    new KubernetesReliabilityLabRuntime({
      clusterName:
        configuration.clusterName,

      namespace:
        configuration.namespace,

      safetyClass:
        SAFETY_CLASS,
    });


  /*
   * The current local module has now been proven to expose:
   *
   * FailureInjectionEngine.prototype.inject
   *
   * We bind that exact method.
   *
   * runtime is supplied both in construction and as an inject argument.
   * Passing it as the second argument is harmless for implementations that
   * only use the first parameter and supports certified implementations that
   * accept an explicit runtime argument.
   */
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
        ) => {
          return failureEngine
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
            );
        },
    });


  // ==========================================================================
  // 7. CANONICAL AIRA CORRELATION HARNESS
  // ==========================================================================

  const correlationHarness =
    new AiraCorrelationHarness({
      repository,
    });


  const orchestrator =
    new ExperimentOrchestrator({
      repository,

      lifecycle,

      baselineProvider,

      failureInjector,

      correlationHarness,
    });


  const correlationId =
    `phase21-batch6:${crypto.randomUUID()}`;


  let runResult =
    null;

  let resetResult =
    null;

  let runError =
    null;


  // ==========================================================================
  // 8. RUN REAL EXPERIMENT THROUGH CORRELATION
  // ==========================================================================

  try {
    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "RUNNING REAL BATCH-6 EXPERIMENT"
    );

    console.log(
      "--------------------------------------------------------------"
    );


    runResult =
      await orchestrator
        .runToCorrelation({
          organizationId:
            configuration.organizationId,

          environmentId:
            configuration.environmentId,

          tenantId:
            configuration.tenantId,

          labEnvironmentId,

          experimentKey:
            configuration.experimentKey,

          experimentVersion:
            configuration.experimentVersion,

          failureKey:
            configuration.experimentKey,

          correlationId,

          safetyClass:
            SAFETY_CLASS,

          production:
            false,

          executionAuthorized:
            false,

          target: {
            kind:
              "kubernetes.pod",

            resourceType:
              "kubernetes.pod",

            namespace:
              configuration.namespace,

            podName:
              targetBefore.name,

            name:
              targetBefore.name,

            uid:
              targetBefore.uid,

            app:
              configuration.targetApp,

            labels: {
              app:
                configuration.targetApp,

              "aira.reliability-lab":
                "true",

              "aira.safety-class":
                SAFETY_CLASS,
            },
          },

          injectionParameters: {
            namespace:
              configuration.namespace,

            podName:
              targetBefore.name,

            gracePeriodSeconds:
              0,
          },

          /*
           * The signal below is NOT synthetic ground truth.
           *
           * It is constructed only after the live Kubernetes API proves the
           * original pod disappeared and a replacement pod became Running.
           */
          observableSignalFactory:
            async () => {
              const replacement =
                await waitForPodReplacement({
                  namespace:
                    configuration.namespace,

                  app:
                    configuration.targetApp,

                  previousUid:
                    targetBefore.uid,

                  timeoutMs:
                    configuration.replacementTimeoutMs,
                });


              return buildObservablePodCrashSignal({
                configuration,

                original:
                  targetBefore,

                replacement,

                correlationId,
              });
            },

          ingestionContext: {
            source:
              "PHASE21_RELIABILITY_LAB",

            reliabilityLab:
              true,
          },

          metadata: {
            certificationVersion:
              CERTIFICATION_VERSION,

            live:
              true,

            machineSpecific:
              true,

            scenario:
              configuration.experimentKey,

            safetyClass:
              SAFETY_CLASS,

            executionAuthorized:
              false,
          },
        });


    console.log(
      `Experiment run:       ${runResult.experimentRunId}`
    );

    console.log(
      `Run status:           ${runResult.status}`
    );

    console.log(
      `Signal ID:            ${formatNullable(
        runResult
          ?.correlation
          ?.signalId
      )}`
    );

    console.log(
      `Correlation group:    ${formatNullable(
        runResult
          ?.correlation
          ?.correlationGroupId
      )}`
    );

    console.log(
      `Incident ID:          ${formatNullable(
        runResult
          ?.correlation
          ?.incidentId
      )}`
    );

    console.log(
      `Ground truth to AIRA: ${runResult?.evaluator?.groundTruthPassedToAira}`
    );

    console.log(
      ""
    );


    validateRunResult(
      runResult
    );
  } catch (
    error
  ) {
    runError =
      error;


    console.error(
      ""
    );

    console.error(
      `Batch-6 experiment error: ${error.message}`
    );

    console.error(
      ""
    );
  } finally {
    // ========================================================================
    // 9. RESET THE LAB EVEN AFTER PARTIAL FAILURE
    // ========================================================================

    const experimentRunId =
      runResult
        ?.experimentRunId ||
      extractExperimentRunId(
        runError
      );


    if (
      experimentRunId
    ) {
      console.log(
        "--------------------------------------------------------------"
      );

      console.log(
        "DETERMINISTIC LAB RESET"
      );

      console.log(
        "--------------------------------------------------------------"
      );


      try {
        resetResult =
          await orchestrator
            .resetAfterPartialRun({
              organizationId:
                configuration.organizationId,

              environmentId:
                configuration.environmentId,

              labEnvironmentId,

              experimentRunId,

              baselineProvider,

              resetter:
                createKubernetesResetter({
                  namespace:
                    configuration.namespace,

                  app:
                    configuration.targetApp,

                  labBaseUrl:
                    configuration.labBaseUrl,

                  timeoutMs:
                    configuration.resetTimeoutMs,
                }),
            });


        console.log(
          `Reset succeeded:       ${resetResult.resetSucceeded}`
        );

        console.log(
          `Baseline restored:     ${resetResult.baselineRestored}`
        );

        console.log(
          ""
        );
      } catch (
        resetError
      ) {
        console.error(
          `RESET FAILED: ${resetError.message}`
        );


        throw certificationError(
          "PHASE21_BATCH6_RESET_FAILED",
          [
            "Batch-6 experiment could not restore the Reliability Lab.",
            "The environment must remain DIRTY/RESET_FAILED and must not run another experiment.",
            resetError.message,
          ].join(
            " "
          )
        );
      }
    }
  }


  if (
    runError
  ) {
    throw runError;
  }


  // ==========================================================================
  // 10. FINAL LIVE HEALTH
  // ==========================================================================

  const finalEnvironment =
    await lifecycle
      .requireEnvironment(
        scope
      );


  const finalHealth =
    await captureLiveHealth({
      namespace:
        configuration.namespace,

      labBaseUrl:
        configuration.labBaseUrl,
    });


  if (
    finalEnvironment.status !==
      "AVAILABLE"
  ) {
    throw certificationError(
      "PHASE21_BATCH6_FINAL_LAB_NOT_AVAILABLE",
      `Lab did not return to AVAILABLE; status=${finalEnvironment.status}`
    );
  }


  if (
    finalHealth.healthHealthy !==
      true ||
    finalHealth.readyHealthy !==
      true ||
    finalHealth.readyPodObserved !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH6_FINAL_HEALTH_FAILED",
      "Lab did not return to healthy/ready state after experiment reset"
    );
  }


  // ==========================================================================
  // 11. BUILD CERTIFICATE
  // ==========================================================================

  const certificate =
    buildCertificate({
      configuration,

      labEnvironmentId,

      signalPersistence,

      targetBefore,

      runResult,

      resetResult,

      finalEnvironment,

      finalHealth,
    });


  const artifactPath =
    persistCertificate(
      certificate
    );


  printFinalCertificate(
    certificate,
    artifactPath
  );


  return {
    certificate,

    artifactPath,
  };
}


// ============================================================================
// CONFIGURATION
// ============================================================================

function readConfiguration() {
  const organizationId =
    process.env
      .PHASE21_ORGANIZATION_ID ||
    "aira-dev-org";


  const environmentId =
    process.env
      .PHASE21_ENVIRONMENT_ID ||
    "env_aira_development";


  return {
    organizationId,

    environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      organizationId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      null,

    namespace:
      process.env
        .PHASE21_KUBERNETES_NAMESPACE ||
      DEFAULT_NAMESPACE,

    clusterName:
      process.env
        .PHASE21_KIND_CLUSTER ||
      DEFAULT_CLUSTER_NAME,

    targetApp:
      process.env
        .PHASE21_BATCH6_TARGET_APP ||
      DEFAULT_TARGET_APP,

    experimentKey:
      process.env
        .PHASE21_BATCH6_EXPERIMENT_KEY ||
      DEFAULT_EXPERIMENT_KEY,

    experimentVersion:
      parsePositiveInteger(
        process.env
          .PHASE21_BATCH6_EXPERIMENT_VERSION,
        1
      ),

    labBaseUrl:
      process.env
        .PHASE21_LAB_API_URL ||
      "http://127.0.0.1:18080",

    replacementTimeoutMs:
      parsePositiveInteger(
        process.env
          .PHASE21_BATCH6_REPLACEMENT_TIMEOUT_MS,
        60000
      ),

    resetTimeoutMs:
      parsePositiveInteger(
        process.env
          .PHASE21_BATCH6_RESET_TIMEOUT_MS,
        120000
      ),
  };
}


function validateLabEnvironmentFlag() {
  if (
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .toLowerCase() !==
      "true"
  ) {
    throw certificationError(
      "PHASE21_RELIABILITY_LAB_FLAG_REQUIRED",
      "AIRA_RELIABILITY_LAB=true is required for live Batch-6 certification"
    );
  }


  if (
    String(
      process.env.NODE_ENV ||
      ""
    )
      .toLowerCase() ===
      "production"
  ) {
    throw certificationError(
      "PHASE21_PRODUCTION_RUNTIME_FORBIDDEN",
      "Batch-6 Reliability Lab certification cannot run with NODE_ENV=production"
    );
  }
}


// ============================================================================
// SIGNAL PERSISTENCE PRE-FLIGHT
// ============================================================================

function inspectSignalPersistence() {
  if (
    !fs.existsSync(
      SIGNAL_INGESTION_PATH
    )
  ) {
    return {
      exists:
        false,

      hasMongooseImport:
        false,

      hasLegacySignalModel:
        false,

      pass:
        false,
    };
  }


  const source =
    fs.readFileSync(
      SIGNAL_INGESTION_PATH,
      "utf8"
    );


  const hasMongooseImport =
    /require\s*\(\s*["']mongoose["']\s*\)/i
      .test(
        source
      ) ||
    /from\s+["']mongoose["']/i
      .test(
        source
      );


  const hasLegacySignalModel =
    /require\s*\(\s*["'][^"']*models[\\/]+Signal["']\s*\)/i
      .test(
        source
      );


  return {
    exists:
      true,

    hasMongooseImport,

    hasLegacySignalModel,

    pass:
      !hasMongooseImport &&
      !hasLegacySignalModel,
  };
}


// ============================================================================
// LIVE BASELINE
// ============================================================================

function createLiveBaselineProvider({
  lifecycle,

  namespace,

  labBaseUrl,
}) {
  return {
    async capture(
      input
    ) {
      const environment =
        await lifecycle
          .requireEnvironment({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            labEnvironmentId:
              input.labEnvironmentId,
          });


      const storedBaseline =
        firstObject(
          environment.baselineSnapshot,

          environment.baseline,

          environment.knownGoodBaseline,

          environment.currentBaseline,

          environment
            ?.metadata
            ?.baseline
        );


      if (
        !storedBaseline
      ) {
        throw certificationError(
          "PHASE21_BATCH6_CANONICAL_BASELINE_REQUIRED",
          "The Reliability Lab environment does not contain a previously captured canonical baseline"
        );
      }


      if (
        storedBaseline.healthy ===
          false
      ) {
        throw certificationError(
          "PHASE21_BATCH6_STORED_BASELINE_UNHEALTHY",
          "The stored Reliability Lab baseline is explicitly unhealthy"
        );
      }


      const liveGate =
        await captureLiveHealth({
          namespace,

          labBaseUrl,
        });


      if (
        liveGate.healthHealthy !==
          true ||
        liveGate.readyHealthy !==
          true ||
        liveGate.readyPodObserved !==
          true
      ) {
        throw certificationError(
          "PHASE21_BATCH6_LIVE_BASELINE_UNHEALTHY",
          "Live health/readiness evidence does not match the known-good baseline"
        );
      }


      return {
        ...deepClone(
          storedBaseline
        ),

        healthy:
          true,

        liveGate,

        baselineSource:
          "CANONICAL_STORED_BASELINE_PLUS_LIVE_HEALTH_GATE",

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


async function captureLiveHealth({
  namespace,

  labBaseUrl,
}) {
  const health =
    await httpProbe(
      `${labBaseUrl}/health`
    );


  const ready =
    await httpProbe(
      `${labBaseUrl}/ready`
    );


  const pod =
    await discoverReadyPod({
      namespace,

      app:
        DEFAULT_TARGET_APP,
    });


  return {
    capturedAt:
      new Date()
        .toISOString(),

    healthStatus:
      health.status,

    healthHealthy:
      health.ok,

    readyStatus:
      ready.status,

    readyHealthy:
      ready.ok,

    pod:
      pod.name,

    podUid:
      pod.uid,

    podPhase:
      pod.phase,

    readyPodObserved:
      pod.phase ===
        "Running" &&
      pod.ready ===
        true,

    safetyClass:
      SAFETY_CLASS,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// KUBERNETES READ-ONLY OBSERVATION
// ============================================================================

async function discoverReadyPod({
  namespace,

  app,
}) {
  const result =
    await kubectlJson([
      "get",
      "pods",

      "-n",
      namespace,

      "-l",
      `app=${app}`,

      "-o",
      "json",
    ]);


  const items =
    Array.isArray(
      result.items
    )
      ? result.items
      : [];


  const candidates =
    items.map(
      normalizePod
    );


  const ready =
    candidates.find(
      (
        pod
      ) =>
        pod.phase ===
          "Running" &&
        pod.ready ===
          true
    );


  if (
    !ready
  ) {
    throw certificationError(
      "PHASE21_BATCH6_READY_POD_NOT_FOUND",
      `No Running/Ready pod found for app=${app} in namespace=${namespace}`
    );
  }


  return ready;
}


async function waitForPodReplacement({
  namespace,

  app,

  previousUid,

  timeoutMs,
}) {
  const started =
    Date.now();


  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    try {
      const current =
        await discoverReadyPod({
          namespace,

          app,
        });


      if (
        current.uid !==
          previousUid
      ) {
        return {
          ...current,

          replacementObservedAt:
            new Date()
              .toISOString(),

          previousUid,

          executionAuthorized:
            false,
        };
      }
    } catch {
      // During pod replacement there may temporarily be no Ready pod.
    }


    await sleep(
      1000
    );
  }


  throw certificationError(
    "PHASE21_BATCH6_POD_REPLACEMENT_TIMEOUT",
    `No replacement Ready pod was observed within ${timeoutMs}ms`
  );
}


function normalizePod(
  pod
) {
  const conditions =
    Array.isArray(
      pod
        ?.status
        ?.conditions
    )
      ? pod.status.conditions
      : [];


  const readyCondition =
    conditions.find(
      (
        condition
      ) =>
        condition.type ===
        "Ready"
    );


  return {
    name:
      pod
        ?.metadata
        ?.name ||
      null,

    uid:
      pod
        ?.metadata
        ?.uid ||
      null,

    namespace:
      pod
        ?.metadata
        ?.namespace ||
      null,

    phase:
      pod
        ?.status
        ?.phase ||
      null,

    ready:
      readyCondition
        ?.status ===
      "True",

    restartCount:
      (
        pod
          ?.status
          ?.containerStatuses ||
        []
      )
        .reduce(
          (
            total,
            container
          ) =>
            total +
            Number(
              container.restartCount ||
              0
            ),

          0
        ),
  };
}


async function kubectlJson(
  args
) {
  const {
    stdout,
  } =
    await execFileAsync(
      "kubectl",
      args,
      {
        windowsHide:
          true,

        timeout:
          30000,

        maxBuffer:
          5 *
          1024 *
          1024,
      }
    );


  return JSON.parse(
    stdout
  );
}


async function kubectl(
  args,
  timeout =
    120000
) {
  return execFileAsync(
    "kubectl",
    args,
    {
      windowsHide:
        true,

      timeout,

      maxBuffer:
        5 *
        1024 *
        1024,
    }
  );
}


// ============================================================================
// REAL OBSERVABLE SIGNAL
// ============================================================================

function buildObservablePodCrashSignal({
  configuration,

  original,

  replacement,

  correlationId,
}) {
  const observedAt =
    replacement
      .replacementObservedAt ||
    new Date()
      .toISOString();


  const sourceEventId =
    `phase21-pod-replacement:${original.uid}:${replacement.uid}`;


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
      `Pod ${original.name} disappeared and replacement ${replacement.name} became Ready`,

    observedAt,

    sourceEventId,

    correlationId,

    resource: {
      type:
        "kubernetes.pod",

      resourceType:
        "kubernetes.pod",

      namespace:
        configuration.namespace,

      name:
        original.name,

      uid:
        original.uid,
    },

    attributes: {
      reliabilityLab: {
        safetyClass:
          SAFETY_CLASS,

        scenario:
          configuration.experimentKey,
      },

      kubernetes: {
        namespace:
          configuration.namespace,

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

        phase:
          original.phase,

        ready:
          original.ready,
      },

      replacement: {
        pod:
          replacement.name,

        uid:
          replacement.uid,

        phase:
          replacement.phase,

        ready:
          replacement.ready,

        restartCount:
          replacement.restartCount,
      },
    },

    /*
     * These are experiment provenance attributes.
     *
     * No expected diagnosis/failure mode/ground truth is included.
     */
    metadata: {
      correlationId,

      phase:
        "21.12",

      safetyClass:
        SAFETY_CLASS,

      executionAuthorized:
        false,
    },
  };
}


// ============================================================================
// RESET
// ============================================================================

function createKubernetesResetter({
  namespace,

  app,

  labBaseUrl,

  timeoutMs,
}) {
  return {
    async reset() {
      /*
       * The pod-crash scenario is intentionally deployment-managed.
       *
       * Kubernetes performs the infrastructure-level replacement.
       * This resetter does not execute a recovery command for AIRA.
       *
       * It only waits for the lab fixture to return to its known-good
       * workload state and independently verifies health/readiness.
       */

      await kubectl(
        [
          "rollout",
          "status",
          `deployment/${app}`,

          "-n",
          namespace,

          `--timeout=${Math.ceil(
            timeoutMs /
            1000
          )}s`,
        ],

        timeoutMs +
          10000
      );


      const liveHealth =
        await captureLiveHealth({
          namespace,

          labBaseUrl,
        });


      if (
        liveHealth.healthHealthy !==
          true ||
        liveHealth.readyHealthy !==
          true ||
        liveHealth.readyPodObserved !==
          true
      ) {
        throw certificationError(
          "PHASE21_BATCH6_RESET_HEALTH_FAILED",
          "Kubernetes workload returned but lab-api health/readiness did not recover"
        );
      }


      return {
        resetSucceeded:
          true,

        baselineRestored:
          true,

        liveHealth,

        mechanism:
          "KUBERNETES_DECLARATIVE_SELF_HEALING_WAIT",

        airaRecoveryExecuted:
          false,

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


// ============================================================================
// HTTP OBSERVATION
// ============================================================================

async function httpProbe(
  url
) {
  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),

      5000
    );


  const started =
    Date.now();


  try {
    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          signal:
            controller.signal,
        }
      );


    const text =
      await response.text();


    return {
      ok:
        response.ok,

      status:
        response.status,

      durationMs:
        Date.now() -
        started,

      bodyPreview:
        text.slice(
          0,
          512
        ),
    };
  } catch (
    error
  ) {
    return {
      ok:
        false,

      status:
        null,

      durationMs:
        Date.now() -
        started,

      error:
        String(
          error.message ||
          error
        )
          .slice(
            0,
            512
          ),
    };
  } finally {
    clearTimeout(
      timer
    );
  }
}


// ============================================================================
// RESULT VALIDATION
// ============================================================================

function validateRunResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw certificationError(
      "PHASE21_BATCH6_RESULT_REQUIRED",
      "Experiment orchestrator returned no result"
    );
  }


  if (
    result.status !==
      "WAITING_FOR_DIAGNOSIS"
  ) {
    throw certificationError(
      "PHASE21_BATCH6_STATE_INVALID",
      `Expected WAITING_FOR_DIAGNOSIS, received ${result.status}`
    );
  }


  if (
    result
      ?.correlation
      ?.accepted !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH6_SIGNAL_NOT_ACCEPTED",
      "Canonical AIRA signal ingestion did not accept the live observable event"
    );
  }


  if (
    !result
      ?.correlation
      ?.signalId
  ) {
    throw certificationError(
      "PHASE21_BATCH6_SIGNAL_ID_MISSING",
      "Canonical AIRA ingestion did not return a persisted signal ID"
    );
  }


  if (
    result
      ?.correlation
      ?.groundTruthConsumed !==
      false
  ) {
    throw certificationError(
      "PHASE21_BATCH6_GROUND_TRUTH_FIREWALL_FAILED",
      "Correlation harness did not prove groundTruthConsumed=false"
    );
  }


  if (
    result
      ?.evaluator
      ?.groundTruthPassedToAira !==
      false
  ) {
    throw certificationError(
      "PHASE21_BATCH6_EVALUATOR_LEAK",
      "Experiment evaluator ground truth entered the AIRA reasoning path"
    );
  }


  if (
    containsForbiddenAuthority(
      result
    )
  ) {
    throw certificationError(
      "PHASE21_BATCH6_AUTHORITY_VIOLATION",
      "Batch-6 experiment result contains forbidden authority"
    );
  }


  /*
   * Correlation group / incident creation is observed, not manufactured.
   *
   * The canonical pipeline may legitimately decide that one signal is not
   * sufficient to create an incident. 21.13 later evaluates detection
   * correctness against ground truth.
   */
  return true;
}


// ============================================================================
// CERTIFICATE
// ============================================================================

function buildCertificate({
  configuration,

  labEnvironmentId,

  signalPersistence,

  targetBefore,

  runResult,

  resetResult,

  finalEnvironment,

  finalHealth,
}) {
  return {
    phase:
      "21",

    batch:
      "6",

    subphases: [
      "21.11",
      "21.12",
    ],

    title:
      "Experiment Orchestrator + AIRA Correlation Harness Live Certification",

    certificateVersion:
      CERTIFICATION_VERSION,

    createdAt:
      new Date()
        .toISOString(),

    status:
      "PASS",

    pass:
      true,

    liveCertified:
      true,

    frozen:
      true,

    certificationClass:
      "LIVE_FOUNDATION",

    safetyClass:
      SAFETY_CLASS,

    environment: {
      organizationId:
        configuration.organizationId,

      environmentId:
        configuration.environmentId,

      tenantId:
        configuration.tenantId,

      labEnvironmentId,

      namespace:
        configuration.namespace,

      clusterName:
        configuration.clusterName,

      production:
        false,
    },

    implementation: {
      orchestratorVersion:
        ORCHESTRATOR_VERSION,

      correlationHarnessVersion:
        CORRELATION_HARNESS_VERSION,

      failureInjectionEngineVersion:
        failureEngineModule
          .FAILURE_INJECTION_ENGINE_VERSION ||
        null,

      canonicalFailureEngineApi:
        "FailureInjectionEngine.inject",

      signalPersistencePreflight:
        signalPersistence,
    },

    scenario: {
      experimentKey:
        configuration.experimentKey,

      experimentVersion:
        configuration.experimentVersion,

      targetApp:
        configuration.targetApp,

      targetPod:
        targetBefore.name,

      targetPodUid:
        targetBefore.uid,

      failureInjectedThroughPhase21Engine:
        true,
    },

    orchestration: {
      experimentRunId:
        runResult.experimentRunId,

      correlationId:
        runResult.correlationId,

      finalExperimentState:
        runResult.status,

      baselineCaptured:
        Boolean(
          runResult.baseline
        ),

      injectionRecorded:
        Boolean(
          runResult
            ?.injection
            ?.referenceId
        ),

      observableSignalAccepted:
        runResult
          ?.correlation
          ?.accepted ===
        true,

      signalId:
        runResult
          ?.correlation
          ?.signalId ||
        null,

      correlationGroupId:
        runResult
          ?.correlation
          ?.correlationGroupId ||
        null,

      correlationObserved:
        runResult
          ?.correlation
          ?.correlationObserved ===
        true,

      incidentCandidate:
        runResult
          ?.correlation
          ?.incidentCandidate ===
        true,

      incidentId:
        runResult
          ?.correlation
          ?.incidentId ||
        null,

      routed:
        runResult
          ?.correlation
          ?.routed ===
        true,

      detectionCorrect:
        null,

      diagnosisCorrect:
        null,

      correctnessEvaluationDeferredTo: [
        "21.13",
        "21.14",
      ],
    },

    groundTruthFirewall: {
      groundTruthAvailableToEvaluator:
        runResult
          ?.evaluator
          ?.groundTruthAvailable ===
        true,

      groundTruthPassedToAira:
        false,

      groundTruthConsumedByCorrelationHarness:
        false,

      evaluatorInfluencedReasoning:
        false,

      pass:
        true,
    },

    reset: {
      resetSucceeded:
        resetResult
          ?.resetSucceeded ===
        true,

      baselineRestored:
        resetResult
          ?.baselineRestored ===
        true,

      finalLabStatus:
        finalEnvironment.status,

      finalHealth:
        finalHealth.healthHealthy,

      finalReadiness:
        finalHealth.readyHealthy,

      finalReadyPod:
        finalHealth.readyPodObserved,

      airaRecoveryExecuted:
        false,

      pass:
        resetResult
          ?.resetSucceeded ===
          true &&
        resetResult
          ?.baselineRestored ===
          true &&
        finalEnvironment.status ===
          "AVAILABLE" &&
        finalHealth.healthHealthy ===
          true &&
        finalHealth.readyHealthy ===
          true,
    },

    scopeBoundaries: {
      detectionCorrectnessCertified:
        false,

      diagnosisCorrectnessCertified:
        false,

      recoverySelectionCertified:
        false,

      executionSafetyCertified:
        false,

      verifiedRecoveryCertified:
        false,

      batch6OnlyProvesOrchestrationAndCorrelationPlumbing:
        true,
    },

    authority: {
      productionCertified:
        false,

      executionAuthorized:
        false,

      canGrantExecutionAuthorization:
        false,

      canGrantAutonomy:
        false,

      canModifyProductionAuthority:
        false,

      failureInjectionIsAiraRecovery:
        false,

      kubernetesSelfHealingIsAiraRecovery:
        false,

      phase21IsEvidenceOnly:
        true,

      phase22ConsumesEvidence:
        true,
    },

    finalResult: {
      pass:
        true,

      status:
        "PASS",

      liveCertified:
        true,

      frozen:
        true,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },
  };
}


function persistCertificate(
  certificate
) {
  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const artifactPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `phase21-batch6-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      certificate,
      null,
      2
    ) +
      "\n",

    "utf8"
  );


  return artifactPath;
}


// ============================================================================
// PRIOR ARTIFACT DISCOVERY
// ============================================================================

function discoverLabEnvironmentIdFromArtifacts() {
  if (
    !fs.existsSync(
      ARTIFACT_DIRECTORY
    )
  ) {
    return null;
  }


  const candidates =
    fs.readdirSync(
      ARTIFACT_DIRECTORY,
      {
        withFileTypes:
          true,
      }
    )
      .filter(
        (
          entry
        ) =>
          entry.isFile() &&
          entry.name.endsWith(
            ".json"
          ) &&
          (
            entry.name.includes(
              "batch5"
            ) ||
            entry.name.includes(
              "phase21"
            )
          )
      )
      .map(
        (
          entry
        ) => {
          const fullPath =
            path.join(
              ARTIFACT_DIRECTORY,
              entry.name
            );


          return {
            path:
              fullPath,

            modifiedAt:
              fs.statSync(
                fullPath
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
          right.modifiedAt -
          left.modifiedAt
      );


  for (
    const candidate
    of candidates
  ) {
    try {
      const artifact =
        JSON.parse(
          fs.readFileSync(
            candidate.path,
            "utf8"
          )
        );


      const found =
        findFirstProperty(
          artifact,
          "labEnvironmentId"
        );


      if (
        found
      ) {
        return String(
          found
        );
      }
    } catch {
      // Ignore unrelated or malformed historical artifacts.
    }
  }


  return null;
}


function findFirstProperty(
  value,
  key,
  seen =
    new Set()
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    seen.has(
      value
    )
  ) {
    return null;
  }


  seen.add(
    value
  );


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        value,
        key
      ) &&
    value[key] !==
      null &&
    value[key] !==
      undefined &&
    String(
      value[key]
    )
      .trim() !==
      ""
  ) {
    return value[key];
  }


  for (
    const child
    of Object.values(
      value
    )
  ) {
    const found =
      findFirstProperty(
        child,
        key,
        seen
      );


    if (
      found !==
      null
    ) {
      return found;
    }
  }


  return null;
}


// ============================================================================
// AUTHORITY FIREWALL
// ============================================================================

function containsForbiddenAuthority(
  value,
  seen =
    new Set()
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    seen.has(
      value
    )
  ) {
    return false;
  }


  seen.add(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    return value.some(
      (
        child
      ) =>
        containsForbiddenAuthority(
          child,
          seen
        )
    );
  }


  const forbidden =
    new Set([
      "executionAuthorized",
      "productionCertified",
      "canGrantExecutionAuthorization",
      "canGrantAutonomy",
      "canModifyProductionAuthority",
    ]);


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      forbidden.has(
        key
      ) &&
      child ===
        true
    ) {
      return true;
    }


    if (
      containsForbiddenAuthority(
        child,
        seen
      )
    ) {
      return true;
    }
  }


  return false;
}


// ============================================================================
// CLASS EXPORT RESOLUTION
// ============================================================================

function resolveExportedClass(
  moduleValue,
  namedExport
) {
  if (
    moduleValue &&
    typeof moduleValue[
      namedExport
    ] ===
      "function"
  ) {
    return moduleValue[
      namedExport
    ];
  }


  if (
    typeof moduleValue ===
      "function"
  ) {
    return moduleValue;
  }


  throw certificationError(
    "PHASE21_BATCH6_MODULE_EXPORT_INVALID",
    `${namedExport} could not be resolved from its module`
  );
}


// ============================================================================
// GENERIC HELPERS
// ============================================================================

function firstObject(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      )
    ) {
      return value;
    }
  }


  return null;
}


function deepClone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function extractExperimentRunId(
  error
) {
  return (
    error
      ?.experimentRunId ||
    error
      ?.runId ||
    null
  );
}


function parsePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return (
    Number.isFinite(
      parsed
    ) &&
    parsed >
      0
  )
    ? parsed
    : fallback;
}


function formatNullable(
  value
) {
  return (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  )
    ? "NOT_OBSERVED"
    : String(
        value
      );
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


function certificationError(
  code,
  message,
  extra =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase21Batch6LiveCertificationError",

      code,

      safetyClass:
        SAFETY_CLASS,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


// ============================================================================
// OUTPUT
// ============================================================================

function printBanner() {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.11 + 21.12 BATCH-6 LIVE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Experiment Orchestrator:  real"
  );

  console.log(
    "Failure Injection:        Phase 21.9 engine"
  );

  console.log(
    "Infrastructure:           Kubernetes / kind"
  );

  console.log(
    "AIRA signal path:         canonical"
  );

  console.log(
    "Ground truth to AIRA:     forbidden"
  );

  console.log(
    "Detection correctness:    deferred to 21.13"
  );

  console.log(
    "Diagnosis correctness:    deferred to 21.14"
  );

  console.log(
    "Safety class:             LAB_ONLY"
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
  );
}


function printFinalCertificate(
  certificate,
  artifactPath
) {
  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.11 + 21.12 LIVE RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate:              ${certificate.certificateVersion}`
  );

  console.log(
    `Experiment run:           ${certificate.orchestration.experimentRunId}`
  );

  console.log(
    `Signal ID:                ${formatNullable(
      certificate
        .orchestration
        .signalId
    )}`
  );

  console.log(
    `Correlation group:        ${formatNullable(
      certificate
        .orchestration
        .correlationGroupId
    )}`
  );

  console.log(
    `Incident ID:              ${formatNullable(
      certificate
        .orchestration
        .incidentId
    )}`
  );

  console.log(
    `Ground truth leaked:      false`
  );

  console.log(
    `Reset:                    ${certificate.reset.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    `Final lab status:         ${certificate.reset.finalLabStatus}`
  );

  console.log(
    `Production certified:     ${certificate.authority.productionCertified}`
  );

  console.log(
    `Execution authorized:     ${certificate.authority.executionAuthorized}`
  );

  console.log(
    `Frozen:                   ${certificate.frozen}`
  );

  console.log(
    `Artifact: ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 6 STATUS: LIVE CERTIFIED / PASS / FROZEN"
  );

  console.log(
    ""
  );

  console.log(
    "NEXT: PHASE 21.13 + 21.14"
  );

  console.log(
    "Detection Correctness + Diagnosis Correctness"
  );

  console.log(
    ""
  );
}


// ============================================================================
// CLI
// ============================================================================

if (
  require.main ===
  module
) {
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
          "PHASE 21.11 + 21.12 LIVE RESULT: FAIL"
        );

        console.error(
          "=============================================================="
        );

        console.error(
          `Code: ${error.code || "UNKNOWN"}`
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
          "Execution authorized: false"
        );


        process.exitCode =
          1;
      }
    );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CERTIFICATION_VERSION,

  SAFETY_CLASS,

  inspectSignalPersistence,

  readConfiguration,

  buildObservablePodCrashSignal,

  normalizePod,

  validateRunResult,

  containsForbiddenAuthority,

  discoverLabEnvironmentIdFromArtifacts,

  findFirstProperty,

  resolveExportedClass,

  main,
};