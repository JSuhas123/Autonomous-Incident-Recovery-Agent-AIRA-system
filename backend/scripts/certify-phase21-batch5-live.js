"use strict";


require(
  "dotenv"
).config();


const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,

  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  LabEnvironmentLifecycleService,
} =
  require(
    "../services/reliability/labEnvironmentLifecycleService"
  );


const {
  FailureScenarioRegistry,
} =
  require(
    "../services/reliability/failureScenarioRegistry"
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
  runCommand,
} =
  require(
    "../services/reliability/runtimes/reliabilityLabCommandRunner"
  );


const {
  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,

  EXPERIMENT_RUN_STATUS,

  EXPERIMENT_OUTCOME,
} =
  require(
    "../constants/reliabilityLab"
  );


const ORGANIZATION_ID =
  process.env
    .PHASE21_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE21_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const NAMESPACE =
  "aira-reliability-lab";


const FAILURE_KEY =
  "kubernetes.pod.crash";


const CERTIFICATION_ID =
  `phase21_batch5_${Date.now()}_${crypto
    .randomBytes(
      4
    )
    .toString(
      "hex"
    )}`;


const results =
  [];


function pass(
  name,
  details =
    null
) {
  results.push({
    status:
      "PASS",

    name,

    details,
  });


  console.log(
    `[PASS] ${name}`
  );


  if (
    details
  ) {
    console.log(
      `       ${details}`
    );
  }
}


function fail(
  name,
  error
) {
  results.push({
    status:
      "FAIL",

    name,

    error:
      error?.message ||
      String(
        error
      ),
  });


  console.error(
    `[FAIL] ${name}`
  );


  console.error(
    `       ${
      error?.message ||
      error
    }`
  );
}


async function check(
  name,
  fn
) {
  try {
    const result =
      await fn();


    pass(
      name,
      typeof result ===
        "string"
        ? result
        : null
    );


    return result;
  } catch (
    error
  ) {
    fail(
      name,
      error
    );


    throw error;
  }
}


function assertCondition(
  condition,
  message
) {
  if (
    !condition
  ) {
    throw new Error(
      message
    );
  }
}


async function findReadyLabApiPod() {
  const result =
    await runCommand(
      "kubectl",
      [
        "get",
        "pods",

        "-n",
        NAMESPACE,

        "-l",
        "app=lab-api",

        "-o",
        "json",
      ],
      {
        timeoutMs:
          15_000,
      }
    );


  const payload =
    JSON.parse(
      result.stdout
    );


  const pod =
    payload.items
      .find(
        (
          candidate
        ) => {
          const conditions =
            candidate.status
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
    !pod
  ) {
    throw new Error(
      "No ready lab-api pod was found"
    );
  }


  return pod;
}


async function waitForReplacement(
  oldUid,
  timeoutMs =
    180_000
) {
  const startedAt =
    Date.now();


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    try {
      const pod =
        await findReadyLabApiPod();


      if (
        pod.metadata
          ?.uid &&
        pod.metadata
          .uid !==
          oldUid
      ) {
        return pod;
      }
    } catch (
      _error
    ) {
      /*
       * Replacement may temporarily not exist or may not yet be ready.
       */
    }


    await new Promise(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          2_000
        )
    );
  }


  throw new Error(
    "Replacement lab-api pod did not become ready within 180 seconds"
  );
}


async function main() {
  console.log("");
  console.log(
    "=============================================================="
  );
  console.log(
    "AIRA PHASE 21 BATCH 5 LIVE FAILURE-INJECTION CERTIFICATION"
  );
  console.log(
    "=============================================================="
  );
  console.log(
    `Certification: ${CERTIFICATION_ID}`
  );
  console.log(
    `Organization:  ${ORGANIZATION_ID}`
  );
  console.log(
    `Environment:   ${ENVIRONMENT_ID}`
  );
  console.log(
    `Namespace:     ${NAMESPACE}`
  );
  console.log("");


  const pool =
    getPostgresPool();


  const scope =
    new PostgresTenantScope({
      pool,
    });


  const repository =
    new PostgresReliabilityLabRepository({
      scope,
    });


  const lifecycleService =
    new LabEnvironmentLifecycleService({
      repository,
    });


  const registry =
    new FailureScenarioRegistry();


  const runtime =
    new KubernetesReliabilityLabRuntime();


  const engine =
    new FailureInjectionEngine({
      repository,

      lifecycleService,

      registry,

      runtime,
    });


  let labEnvironment =
    null;

  let experimentRun =
    null;

  let injection =
    null;


  const baseline = {
    certificationId:
      CERTIFICATION_ID,

    fixture:
      "lab-api",

    namespace:
      NAMESPACE,

    healthy:
      true,

    executionAuthorized:
      false,
  };


  try {
    await check(
      "PostgreSQL connectivity",
      async () => {
        const result =
          await pool.query(
            "SELECT 1 AS ok"
          );


        assertCondition(
          result.rows[0]
            ?.ok ===
            1,
          "PostgreSQL SELECT 1 failed"
        );


        return "real PostgreSQL connection confirmed";
      }
    );


    await check(
      "Reliability schema exists",
      async () => {
        const result =
          await pool.query(
            `
              SELECT
                to_regclass(
                  'reliability.lab_environments'
                ) AS lab_environments,

                to_regclass(
                  'reliability.experiment_runs'
                ) AS experiment_runs,

                to_regclass(
                  'reliability.failure_injections'
                ) AS failure_injections
            `
          );


        assertCondition(
          result.rows[0]
            ?.lab_environments,
          "reliability.lab_environments is missing"
        );


        assertCondition(
          result.rows[0]
            ?.experiment_runs,
          "reliability.experiment_runs is missing"
        );


        assertCondition(
          result.rows[0]
            ?.failure_injections,
          "reliability.failure_injections is missing"
        );


        return "Phase 21 canonical tables confirmed";
      }
    );


    const originalPod =
      await check(
        "Known healthy lab-api baseline",
        async () => {
          const pod =
            await findReadyLabApiPod();


          assertCondition(
            pod.metadata
              ?.namespace ===
              NAMESPACE,
            "lab-api pod is outside Reliability Lab namespace"
          );


          assertCondition(
            pod.metadata
              ?.labels?.[
                "aira.reliability-lab"
              ] ===
              "true",
            "lab-api pod is missing Reliability Lab label"
          );


          assertCondition(
            pod.metadata
              ?.labels?.[
                "aira.safety-class"
              ] ===
              "LAB_ONLY",
            "lab-api pod is not LAB_ONLY"
          );


          return pod;
        }
      );


    const originalPodName =
      originalPod
        .metadata
        .name;


    const originalUid =
      originalPod
        .metadata
        .uid;


    console.log(
      `       pod=${originalPodName}`
    );

    console.log(
      `       uid=${originalUid}`
    );


    labEnvironment =
      await check(
        "Register isolated Reliability Lab environment",
        async () =>
          lifecycleService
            .register({
              organizationId:
                ORGANIZATION_ID,

              environmentId:
                ENVIRONMENT_ID,

              name:
                `Batch 5 Live ${CERTIFICATION_ID}`,

              kind:
                LAB_ENVIRONMENT_KIND
                  .KIND,

              infrastructureRef:
                "kind://aira-reliability-lab",

              namespace:
                NAMESPACE,

              labels: {
                "aira.phase":
                  "21",

                "aira.safety-class":
                  "LAB_ONLY",

                certificationId:
                  CERTIFICATION_ID,
              },

              configuration: {
                certification:
                  true,

                cluster:
                  "aira-reliability-lab",
              },
            })
      );


    const labScope = {
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      labEnvironmentId:
        labEnvironment
          .publicId,
    };


    await lifecycleService
      .transition({
        ...labScope,

        toStatus:
          LAB_ENVIRONMENT_STATUS
            .PROVISIONING,
      });


    await lifecycleService
      .transition({
        ...labScope,

        toStatus:
          LAB_ENVIRONMENT_STATUS
            .READY,
      });


    await lifecycleService
      .transition({
        ...labScope,

        toStatus:
          LAB_ENVIRONMENT_STATUS
            .BASELINING,
      });


    await lifecycleService
      .transition({
        ...labScope,

        toStatus:
          LAB_ENVIRONMENT_STATUS
            .AVAILABLE,

        baseline,
      });


    await check(
      "Known baseline committed before experiment",
      async () => {
        const environment =
          await lifecycleService
            .requireEnvironment(
              labScope
            );


        assertCondition(
          environment.status ===
            LAB_ENVIRONMENT_STATUS
              .AVAILABLE,
          "Reliability Lab did not reach AVAILABLE"
        );


        assertCondition(
          environment.baseline
            ?.healthy ===
            true,
          "Healthy baseline was not committed"
        );


        return "READY -> BASELINING -> AVAILABLE";
      }
    );


    const scenario =
      registry
        .getEvaluatorScenario(
          FAILURE_KEY,
          1
        );


    assertCondition(
      scenario,
      "Pod-crash failure scenario is missing"
    );


    const experimentKey =
      `${CERTIFICATION_ID}.kubernetes.pod.crash`;


    await repository
      .createExperimentDefinition({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        experimentKey,

        version:
          1,

        name:
          "Phase 21 Batch 5 Live Kubernetes Pod Crash",

        description:
          "Controlled Phase-21 live failure-injection certification.",

        failureDomain:
          scenario.domain,

        failureType:
          scenario.failureType,

        targetResourceType:
          scenario.targetResourceType,

        groundTruth:
          scenario.groundTruth,

        assertions: [
          "BASELINE_HEALTHY",
          "FAILURE_INJECTED",
          "FAILURE_OBSERVABLE",
          "RESET_SUCCEEDED",
        ],

        configuration: {
          certificationId:
            CERTIFICATION_ID,

          evaluatorOnly:
            true,

          executionAuthorized:
            false,
        },

        enabled:
          true,
      });


    experimentRun =
      await repository
        .createExperimentRun({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          labEnvironmentId:
            labEnvironment
              .publicId,

          experimentKey,

          experimentVersion:
            1,

          correlationId:
            CERTIFICATION_ID,

          metadata: {
            certificationId:
              CERTIFICATION_ID,

            executionAuthorized:
              false,
          },
        });


    await lifecycleService
      .beginExperiment(
        labScope
      );


    experimentRun =
      await repository
        .updateExperimentRunState({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          experimentRunId:
            experimentRun
              .publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .INJECTING,

          startedAt:
            new Date(),

          baselineSnapshot:
            baseline,
        });


    await check(
      "Real PostgreSQL lab/run ownership alignment",
      async () => {
        const currentEnvironment =
          await lifecycleService
            .requireEnvironment(
              labScope
            );


        assertCondition(
          experimentRun
            .labEnvironmentId ===
            currentEnvironment.id,
          "Experiment run does not reference canonical lab-environment UUID"
        );


        assertCondition(
          currentEnvironment
            .status ===
            LAB_ENVIRONMENT_STATUS
              .RUNNING_EXPERIMENT,
          "Lab environment is not RUNNING_EXPERIMENT"
        );


        return `run.labEnvironmentId=${experimentRun.labEnvironmentId}`;
      }
    );


    injection =
      await check(
        "Inject real Kubernetes pod crash through Phase 21 engine",
        async () =>
          engine.inject({
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,

            labEnvironmentId:
              labEnvironment
                .publicId,

            experimentRun,

            failureKey:
              FAILURE_KEY,

            version:
              1,

            target: {
              resourcePublicId:
                originalPodName,

              resourceType:
                "kubernetes.pod",

              namespace:
                NAMESPACE,

              podName:
                originalPodName,

              workloadName:
                "lab-api",

              labels: {
                "aira.reliability-lab":
                  "true",

                "aira.safety-class":
                  "LAB_ONLY",
              },

              production:
                false,

              executionAuthorized:
                false,
            },

            parameters: {
              reason:
                "PHASE_21_BATCH_5_LIVE_CERTIFICATION",

              gracePeriodSeconds:
                0,
            },
          })
      );


    await check(
      "Injection remains non-authorizing",
      async () => {
        assertCondition(
          injection
            .executionAuthorized ===
            false,
          "Failure injection unexpectedly authorized execution"
        );


        assertCondition(
          injection
            .plan
            .evaluatorGroundTruthIncluded ===
            false,
          "Evaluator ground truth entered runtime plan"
        );


        return "executionAuthorized=false";
      }
    );


    experimentRun =
      await repository
        .updateExperimentRunState({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          experimentRunId:
            experimentRun
              .publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .FAILURE_ACTIVE,

          failureSummary: {
            failureKey:
              FAILURE_KEY,

            originalPodName,

            originalUid,

            injectionPublicId:
              injection.evidence
                ?.public_id ||
              injection.evidence
                ?.publicId ||
              null,

            executionAuthorized:
              false,
          },
        });


    const replacementPod =
      await check(
        "Injected failure became observable and pod identity changed",
        async () =>
          waitForReplacement(
            originalUid
          )
      );


    const replacementUid =
      replacementPod
        .metadata
        .uid;


    console.log(
      `       replacementPod=${replacementPod.metadata.name}`
    );

    console.log(
      `       replacementUid=${replacementUid}`
    );


    assertCondition(
      replacementUid !==
        originalUid,
      "Kubernetes pod UID did not change after injection"
    );


    await check(
      "Canonical PostgreSQL failure-injection evidence persisted",
      async () => {
        const evidencePublicId =
          injection.evidence
            ?.public_id ||
          injection.evidence
            ?.publicId;


        assertCondition(
          evidencePublicId,
          "Injection evidence public ID is missing"
        );


        return scope.run(
          {
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,
          },

          async (
            client
          ) => {
            const result =
              await client.query(
                `
                  SELECT
                    public_id,
                    failure_type,
                    injector_key,
                    state,
                    execution_authorized,
                    provenance

                  FROM
                    reliability.failure_injections

                  WHERE
                    public_id = $1

                  LIMIT 1
                `,
                [
                  evidencePublicId,
                ]
              );


            const row =
              result.rows[0];


            assertCondition(
              row,
              "Persisted failure injection was not found"
            );


            assertCondition(
              row.failure_type ===
                "POD_CRASH",
              "Persisted failure type is incorrect"
            );


            assertCondition(
              row.injector_key ===
                "KUBERNETES_POD_TERMINATION",
              "Persisted injector key is incorrect"
            );


            assertCondition(
              row.state ===
                "ACTIVE",
              "Persisted injection state is not ACTIVE"
            );


            assertCondition(
              row.execution_authorized ===
                false,
              "Persisted failure injection authorized execution"
            );


            assertCondition(
              row.provenance
                ?.recoveryProvenance ===
                false,
              "Failure injection provenance was mixed with recovery provenance"
            );


            assertCondition(
              row.provenance
                ?.evaluatorGroundTruthIncluded ===
                false,
              "Ground truth leaked into injection provenance"
            );


            return `public_id=${row.public_id}`;
          }
        );
      }
    );


    await lifecycleService
      .beginReset(
        labScope
      );


    experimentRun =
      await repository
        .updateExperimentRunState({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          experimentRunId:
            experimentRun
              .publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .RESETTING,
        });


    await runCommand(
      "kubectl",
      [
        "rollout",
        "status",

        "deployment/lab-api",

        "-n",
        NAMESPACE,

        "--timeout=180s",
      ],
      {
        timeoutMs:
          190_000,
      }
    );


    const healthyAfterReset =
      await findReadyLabApiPod();


    assertCondition(
      healthyAfterReset,
      "lab-api did not become healthy during reset"
    );


    await lifecycleService
      .completeReset(
        labScope,
        {
          ...baseline,

          resetVerified:
            true,

          replacementPodUid:
            healthyAfterReset
              .metadata
              .uid,

          executionAuthorized:
            false,
        }
      );


    experimentRun =
      await repository
        .updateExperimentRunState({
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          experimentRunId:
            experimentRun
              .publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .COMPLETE,

          outcome:
            EXPERIMENT_OUTCOME
              .PASSED,

          completedAt:
            new Date(),

          finalSnapshot: {
            healthy:
              true,

            replacementPod:
              healthyAfterReset
                .metadata
                .name,

            replacementUid:
              healthyAfterReset
                .metadata
                .uid,

            executionAuthorized:
              false,
          },

          verificationSummary: {
            failureWasReal:
              true,

            podIdentityChanged:
              true,

            airaRecoveryCertified:
              false,

            note:
              "Batch 5 certifies controlled failure injection only.",

            executionAuthorized:
              false,
          },

          resetSummary: {
            resetSucceeded:
              true,

            finalLabState:
              "AVAILABLE",

            executionAuthorized:
              false,
          },
        });


    await check(
      "Reliability Lab returned to AVAILABLE",
      async () => {
        const environment =
          await lifecycleService
            .requireEnvironment(
              labScope
            );


        assertCondition(
          environment.status ===
            LAB_ENVIRONMENT_STATUS
              .AVAILABLE,
          `Lab ended in ${environment.status} instead of AVAILABLE`
        );


        return "AVAILABLE";
      }
    );


    await check(
      "Experiment completed without granting autonomy",
      async () => {
        assertCondition(
          experimentRun.status ===
            EXPERIMENT_RUN_STATUS
              .COMPLETE,
          "Experiment run did not complete"
        );


        assertCondition(
          experimentRun.outcome ===
            EXPERIMENT_OUTCOME
              .PASSED,
          "Experiment outcome is not PASSED"
        );


        assertCondition(
          experimentRun
            .executionAuthorized ===
            false,
          "Experiment run authorized execution"
        );


        return "PASSED / executionAuthorized=false";
      }
    );
  } catch (
    error
  ) {
    /*
     * A certification failure must not silently make a dirty environment
     * appear reusable.
     */

    if (
      labEnvironment
    ) {
      try {
        const labScope = {
          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          labEnvironmentId:
            labEnvironment
              .publicId,
        };


        const current =
          await lifecycleService
            .requireEnvironment(
              labScope
            );


        if (
          current.status ===
            LAB_ENVIRONMENT_STATUS
              .RUNNING_EXPERIMENT
        ) {
          await lifecycleService
            .markDirty(
              labScope,
              `Batch 5 live certification failed: ${error.message}`
            );
        }
      } catch (
        cleanupError
      ) {
        console.error(
          `[WARN] Could not mark failed lab environment DIRTY: ${cleanupError.message}`
        );
      }
    }


    throw error;
  } finally {
    console.log("");


    const passed =
      results.filter(
        (
          result
        ) =>
          result.status ===
            "PASS"
      ).length;


    const failed =
      results.filter(
        (
          result
        ) =>
          result.status ===
            "FAIL"
      ).length;


    console.log(
      "=============================================================="
    );

    console.log(
      "BATCH 5 LIVE CERTIFICATION SUMMARY"
    );

    console.log(
      "=============================================================="
    );

    console.log(
      `PASS: ${passed}`
    );

    console.log(
      `FAIL: ${failed}`
    );

    console.log(
      `RESULT: ${
        failed ===
          0
          ? "PASS"
          : "FAIL"
      }`
    );

    console.log(
      "=============================================================="
    );


    await closePostgresPool();
  }
}


main()
  .catch(
    (
      error
    ) => {
      console.error("");
      console.error(
        error.stack ||
        error
      );


      process.exitCode =
        1;
    }
  );