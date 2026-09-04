"use strict";

const {
  execFile,
} = require(
  "node:child_process"
);

const {
  promisify,
} = require(
  "node:util"
);

const execFileAsync =
  promisify(
    execFile
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
  closePostgresPool,
} = require(
  "../persistence/postgres/postgresPool"
);

const {
  LabEnvironmentLifecycleService,
} = require(
  "../services/reliability/labEnvironmentLifecycleService"
);

const {
  ExperimentOrchestrator,
} = require(
  "../services/reliability/experimentOrchestrator"
);


const VERSION =
  "23R.10G.2.RESET.0";

const ORGANIZATION_ID =
  "aira-dev-org";

const ENVIRONMENT_ID =
  "env_aira_development";

const LAB_ENVIRONMENT_ID =
  "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123";

const KUBERNETES_CONTEXT =
  "kind-aira-reliability-lab";

const NAMESPACE =
  "aira-reliability-lab";

const DEPLOYMENT =
  "lab-api";


function resetError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase23R10G2StaleLabResetError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


async function kubectl(
  args
) {
  const {
    stdout,
    stderr,
  } =
    await execFileAsync(
      "kubectl",
      [
        "--context",
        KUBERNETES_CONTEXT,
        ...args,
      ],
      {
        windowsHide:
          true,

        timeout:
          70000,

        maxBuffer:
          1024 * 1024,
      }
    );

  return {
    stdout:
      String(
        stdout || ""
      ).trim(),

    stderr:
      String(
        stderr || ""
      ).trim(),
  };
}


async function captureKubernetesBaseline() {
  const deploymentResult =
    await kubectl([
      "get",
      "deployment",
      DEPLOYMENT,

      "-n",
      NAMESPACE,

      "-o",
      "json",
    ]);

  let deployment;

  try {
    deployment =
      JSON.parse(
        deploymentResult.stdout
      );
  } catch (
    error
  ) {
    throw resetError(
      "PHASE23R_10G2_RESET_DEPLOYMENT_JSON_INVALID",
      (
        "Could not parse Kubernetes deployment "
        + `state: ${error.message}`
      )
    );
  }

  const desiredReplicas =
    Number(
      deployment
        ?.spec
        ?.replicas ??
      0
    );

  const readyReplicas =
    Number(
      deployment
        ?.status
        ?.readyReplicas ??
      0
    );

  const availableReplicas =
    Number(
      deployment
        ?.status
        ?.availableReplicas ??
      0
    );

  if (
    desiredReplicas < 1 ||
    readyReplicas < 1 ||
    availableReplicas < 1
  ) {
    throw resetError(
      "PHASE23R_10G2_RESET_BASELINE_UNHEALTHY",
      (
        "Kubernetes deployment is not healthy: "
        + `desired=${desiredReplicas}, `
        + `ready=${readyReplicas}, `
        + `available=${availableReplicas}`
      )
    );
  }

  return {
    observed:
      true,

    provider:
      "KUBERNETES",

    context:
      KUBERNETES_CONTEXT,

    namespace:
      NAMESPACE,

    deployment:
      DEPLOYMENT,

    desiredReplicas,

    readyReplicas,

    availableReplicas,

    healthy:
      true,

    ready:
      true,

    baselineRestored:
      true,

    safetyClass:
      "LAB_ONLY",

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


function createResetter() {
  return {
    async reset() {
      await kubectl([
        "rollout",
        "status",
        `deployment/${DEPLOYMENT}`,

        "-n",
        NAMESPACE,

        "--timeout=60s",
      ]);

      const baseline =
        await captureKubernetesBaseline();

      return {
        resetSucceeded:
          true,

        baselineRestored:
          true,

        mechanism:
          "KUBERNETES_DECLARATIVE_SELF_HEALING_WAIT",

        baseline,

        airaRecoveryExecuted:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    },
  };
}


function createBaselineProvider() {
  return {
    async capture() {
      return captureKubernetesBaseline();
    },
  };
}


async function resolveStaleExperimentRun({
  scope,
}) {
  return scope.run(
    {
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,
    },

    async (
      client,
      resolved
    ) => {
      const labResult =
        await client.query(
          `
            SELECT
              id,
              public_id,
              status,
              safety_class,
              production,
              execution_authorized
            FROM
              reliability.lab_environments
            WHERE
              organization_id = $1
              AND environment_id = $2
              AND public_id = $3
            LIMIT 1
          `,
          [
            resolved.organizationUuid,
            resolved.environmentUuid,
            LAB_ENVIRONMENT_ID,
          ]
        );

      const lab =
        labResult.rows[0];

      if (
        !lab
      ) {
        throw resetError(
          "PHASE23R_10G2_RESET_LAB_NOT_FOUND",
          (
            "Canonical Reliability Lab "
            + "environment was not found"
          )
        );
      }

      if (
        lab.safety_class !==
          "LAB_ONLY" ||
        lab.production ===
          true ||
        lab.execution_authorized ===
          true
      ) {
        throw resetError(
          "PHASE23R_10G2_RESET_LAB_SAFETY_INVALID",
          (
            "Refusing reset because Reliability "
            + "Lab safety invariants are invalid"
          )
        );
      }

      if (
        lab.status ===
          "AVAILABLE"
      ) {
        return {
          lab,
          experimentRun:
            null,
          alreadyAvailable:
            true,
        };
      }

      if (
        ![
          "RUNNING_EXPERIMENT",
          "RESETTING",
          "RESET_FAILED",
          "DIRTY",
          "UNHEALTHY",
        ].includes(
          lab.status
        )
      ) {
        throw resetError(
          "PHASE23R_10G2_RESET_STATUS_FORBIDDEN",
          (
            "Refusing automatic stale-run reset "
            + `while lab status=${lab.status}`
          )
        );
      }

      const runResult =
        await client.query(
          `
            SELECT
              er.public_id,
              er.status,
              er.outcome,
              er.created_at,
              er.started_at,
              er.completed_at,
              er.execution_authorized
            FROM
              reliability.experiment_runs er
            WHERE
              er.organization_id = $1
              AND er.environment_id = $2
              AND er.lab_environment_id = $3
              AND er.status NOT IN (
                'COMPLETED',
                'ABORTED',
                'FAILED'
              )
            ORDER BY
              COALESCE(
                er.started_at,
                er.created_at
              ) DESC,
              er.created_at DESC
            LIMIT 1
          `,
          [
            resolved.organizationUuid,
            resolved.environmentUuid,
            lab.id,
          ]
        );

      const experimentRun =
        runResult.rows[0];

      if (
        !experimentRun
      ) {
        throw resetError(
          "PHASE23R_10G2_RESET_ACTIVE_RUN_NOT_FOUND",
          (
            "Lab is not AVAILABLE but no active "
            + "experiment run could be resolved"
          )
        );
      }

      if (
        experimentRun
          .execution_authorized ===
          true
      ) {
        throw resetError(
          "PHASE23R_10G2_RESET_RUN_AUTHORITY_INVALID",
          (
            "Refusing reset because stale "
            + "experiment unexpectedly carries "
            + "execution authority"
          )
        );
      }

      return {
        lab,

        experimentRun,

        alreadyAvailable:
          false,
      };
    }
  );
}


async function main() {
  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 23R.10G.2 — STALE RELIABILITY LAB RESET"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "RESET != EXECUTION AUTHORITY"
  );

  console.log(
    "LAB RESET != PRODUCTION AUTHORITY"
  );

  console.log(
    "GROUND TRUTH IS NOT USED"
  );

  console.log(
    ""
  );

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
    createBaselineProvider();

  const orchestrator =
    new ExperimentOrchestrator({
      repository,

      lifecycle,

      baselineProvider,
    });

  const resolved =
    await resolveStaleExperimentRun({
      scope:
        tenantScope,
    });

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CURRENT LAB STATE"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Lab:                   ${resolved.lab.public_id}`
  );

  console.log(
    `Status:                ${resolved.lab.status}`
  );

  console.log(
    `Safety class:          ${resolved.lab.safety_class}`
  );

  console.log(
    `Production:            ${resolved.lab.production}`
  );

  console.log(
    `Execution authorized:  ${resolved.lab.execution_authorized}`
  );

  console.log(
    ""
  );

  if (
    resolved.alreadyAvailable
  ) {
    console.log(
      "PASS  Reliability Lab is already AVAILABLE"
    );

    console.log(
      ""
    );

    console.log(
      JSON.stringify(
        {
          version:
            VERSION,

          status:
            "PASS",

          alreadyAvailable:
            true,

          labStatus:
            "AVAILABLE",

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

    return;
  }

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "STALE EXPERIMENT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Experiment run:        ${resolved.experimentRun.public_id}`
  );

  console.log(
    `Experiment status:     ${resolved.experimentRun.status}`
  );

  console.log(
    `Execution authorized:  ${resolved.experimentRun.execution_authorized}`
  );

  console.log(
    ""
  );

  /*
   * First prove that the physical Kubernetes workload is healthy.
   */
  await kubectl([
    "rollout",
    "status",
    `deployment/${DEPLOYMENT}`,

    "-n",
    NAMESPACE,

    "--timeout=60s",
  ]);

  const beforeBaseline =
    await captureKubernetesBaseline();

  console.log(
    `PASS  Kubernetes deployment healthy — ready=${beforeBaseline.readyReplicas}`
  );

  /*
   * Use the canonical Phase-21 reset path.
   *
   * This performs:
   *
   * experiment -> RESETTING
   * lab        -> RESETTING
   * physical reset verification
   * baseline recapture
   * lab        -> AVAILABLE
   * experiment -> ABORTED
   */
  const resetResult =
    await orchestrator
      .resetAfterPartialRun({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        labEnvironmentId:
          LAB_ENVIRONMENT_ID,

        experimentRunId:
          resolved
            .experimentRun
            .public_id,

        resetter:
          createResetter(),

        baselineProvider,
      });

  if (
    !resetResult ||
    resetResult.resetSucceeded !==
      true ||
    resetResult.baselineRestored !==
      true ||
    resetResult.executionAuthorized ===
      true
  ) {
    throw resetError(
      "PHASE23R_10G2_RESET_RESULT_INVALID",
      (
        "Canonical Phase-21 reset did not "
        + "return a safe successful result"
      )
    );
  }

  const finalEnvironment =
    await lifecycle
      .requireEnvironment({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        labEnvironmentId:
          LAB_ENVIRONMENT_ID,
      });

  if (
    finalEnvironment.status !==
      "AVAILABLE"
  ) {
    throw resetError(
      "PHASE23R_10G2_RESET_FINAL_STATUS_INVALID",
      (
        "Reliability Lab did not return to "
        + `AVAILABLE; received ${finalEnvironment.status}`
      )
    );
  }

  const finalRun =
    await repository
      .getExperimentRun({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        experimentRunId:
          resolved
            .experimentRun
            .public_id,
      });

  if (
    !finalRun ||
    finalRun.status !==
      "ABORTED"
  ) {
    throw resetError(
      "PHASE23R_10G2_RESET_RUN_NOT_ABORTED",
      (
        "Stale experiment was not canonically "
        + "closed as ABORTED"
      )
    );
  }

  console.log(
    "PASS  Canonical Phase-21 reset succeeded"
  );

  console.log(
    "PASS  Baseline restored"
  );

  console.log(
    "PASS  Stale experiment marked ABORTED"
  );

  console.log(
    "PASS  Reliability Lab returned to AVAILABLE"
  );

  console.log(
    "PASS  Execution authority remains false"
  );

  console.log(
    ""
  );

  console.log(
    JSON.stringify(
      {
        version:
          VERSION,

        status:
          "PASS",

        staleExperimentRunId:
          resolved
            .experimentRun
            .public_id,

        staleExperimentFinalStatus:
          finalRun.status,

        labEnvironmentId:
          LAB_ENVIRONMENT_ID,

        labStatus:
          finalEnvironment.status,

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
}


main()
  .catch(
    error => {
      console.error(
        JSON.stringify(
          {
            version:
              VERSION,

            status:
              "FAIL",

            code:
              error?.code ||
              "PHASE23R_10G2_STALE_LAB_RESET_FAILED",

            message:
              error?.message ||
              String(
                error
              ),

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
  )
  .finally(
    async () => {
      await closePostgresPool()
        .catch(
          () => {}
        );
    }
  );