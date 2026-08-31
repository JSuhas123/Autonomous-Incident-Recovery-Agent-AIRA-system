"use strict";

require(
  "dotenv"
).config();


const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const kubernetesAdapter =
  require(
    "../services/integrations/adapters/kubernetesAdapter"
  );


const {
  LiveProviderCapacityProbe,
} =
  require(
    "../services/reliability/chaos/liveProviderCapacityProbe"
  );


const KUBECONFIG_FILE =
  process.env
    .PHASE21_KUBECONFIG_FILE ||
  path.resolve(
    __dirname,
    "../artifacts/phase21/aira-reliability-lab.kubeconfig"
  );


const RATES =
  parseRates(
    process.env
      .PHASE21_K8S_CAPACITY_RATES ||
    "5,10,25,50,100"
  );


const BASELINE_RATE =
  positiveNumber(
    process.env
      .PHASE21_K8S_BASELINE_RATE,

    2
  );


const STAGE_SECONDS =
  positiveNumber(
    process.env
      .PHASE21_K8S_STAGE_SECONDS,

    10
  );


const MAX_CONCURRENCY =
  positiveInteger(
    process.env
      .PHASE21_K8S_MAX_CONCURRENCY,

    64
  );


async function main() {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 21.10B KUBERNETES LIVE CAPACITY CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Cluster:            aira-reliability-lab"
  );

  console.log(
    "Operation:          get_health"
  );

  console.log(
    `Rates:              ${RATES.join(", ")} req/s`
  );

  console.log(
    `Baseline:           ${BASELINE_RATE} req/s`
  );

  console.log(
    `Stage duration:     ${STAGE_SECONDS}s`
  );

  console.log(
    `Max concurrency:    ${MAX_CONCURRENCY}`
  );

  console.log(
    "Safety class:       LAB_ONLY"
  );

  console.log(
    "Production target:  false"
  );

  console.log(
    "Execution auth:     false"
  );

  console.log(
    "==============================================================\n"
  );


  if (
    !fs.existsSync(
      KUBECONFIG_FILE
    )
  ) {
    throw certificationError(
      "PHASE21_KUBECONFIG_MISSING",

      `Kubeconfig was not found: ${KUBECONFIG_FILE}`
    );
  }


  const rawKubeconfig =
    fs.readFileSync(
      KUBECONFIG_FILE,
      "utf8"
    );


  if (
    !rawKubeconfig
      .trim()
  ) {
    throw certificationError(
      "PHASE21_KUBECONFIG_EMPTY",

      "Reliability Lab kubeconfig is empty"
    );
  }


  const connection = {
    provider:
      "kubernetes",

    nonSecretConfig: {
      authMode:
        "kubeconfig",

      clusterName:
        "aira-reliability-lab",

      reliabilityLab:
        true,

      safetyClass:
        "LAB_ONLY",
    },

    metadata: {
      phase:
        "21",

      subphase:
        "21.10B",

      reliabilityLab:
        true,

      safetyClass:
        "LAB_ONLY",

      production:
        false,
    },

    _decryptedSecret:
      rawKubeconfig,

    executionAuthorized:
      false,
  };


  const initialHealth =
    await kubernetesAdapter
      .getHealth(
        connection
      );


  console.log(
    `Initial health: ${initialHealth.status}`
  );

  console.log(
    `Initial detail: ${initialHealth.detail}`
  );


  if (
    initialHealth.status !==
    "healthy"
  ) {
    throw certificationError(
      "PHASE21_KUBERNETES_BASELINE_UNHEALTHY",

      initialHealth.detail ||
      "Kubernetes Reliability Lab cluster is unhealthy"
    );
  }


  const probe =
    new LiveProviderCapacityProbe({
      provider:
        "kubernetes",

      operation:
        "get_health",

      baselineRatePerSecond:
        BASELINE_RATE,

      stageDurationSeconds:
        STAGE_SECONDS,

      maxConcurrency:
        MAX_CONCURRENCY,

      requestTimeoutMs:
        10000,

      executor:
        async () => {
          const result =
            await kubernetesAdapter
              .getHealth(
                connection
              );


          if (
            result.status !==
            "healthy"
          ) {
            throw certificationError(
              "PHASE21_KUBERNETES_HEALTH_FAILED",

              result.detail ||
              "Kubernetes health request failed"
            );
          }


          return result;
        },
    });


  const result =
    await probe.run(
      RATES
    );


  printResult(
    result
  );


  const artifactPath =
    writeArtifact({
      phase:
        "21",

      subphase:
        "21.10B",

      certification:
        "KUBERNETES_LIVE_CAPACITY",

      generatedAt:
        new Date()
          .toISOString(),

      machineSpecific:
        true,

      provider:
        "kubernetes",

      operation:
        "get_health",

      cluster:
        "aira-reliability-lab",

      result,

      productionCertified:
        false,

      executionAuthorized:
        false,
    });


  if (
    !result
      .recovery
      .evaluation
      .recovered
  ) {
    throw certificationError(
      "PHASE21_KUBERNETES_RECOVERY_FAILED",

      "Kubernetes capacity probe did not recover to baseline"
    );
  }


  console.log(
    `\nArtifact: ${artifactPath}`
  );


  console.log(
    "\nPHASE 21.10B KUBERNETES LIVE CAPACITY RESULT: PASS\n"
  );
}


function printResult(
  result
) {
  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "kubernetes (REAL KIND API SERVER)"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  printStage(
    result.baseline
  );


  for (
    const stage
    of result.stages
  ) {
    printStage(
      stage
    );
  }


  console.log(
    `Safe sustained rate: ${formatNumber(
      result.safeSustainedRatePerSecond
    )}/s`
  );

  console.log(
    `Degradation point:   ${formatPoint(
      result.degradationPoint
    )}`
  );

  console.log(
    `Saturation point:    ${formatPoint(
      result.saturationPoint
    )}`
  );

  console.log(
    `Breaking point:      ${formatPoint(
      result.breakingPoint
    )}`
  );

  console.log(
    `Generator limit:     ${formatPoint(
      result.loadGeneratorLimit
    )}`
  );

  console.log(
    `Recovery:            ${
      result
        .recovery
        .evaluation
        .recovered
        ? "PASS"
        : "FAIL"
    }`
  );
}


function printStage(
  stage
) {
  console.log(
    [
      stage.stage,

      `Target=${formatNumber(
        stage.targetRatePerSecond
      )}/s`,

      `Success=${formatNumber(
        stage.successfulRatePerSecond
      )}/s`,

      stage.capacityState
        ? `State=${stage.capacityState}`
        : null,

      `p95=${formatLatency(
        stage.p95LatencyMs
      )}`,

      `p99=${formatLatency(
        stage.p99LatencyMs
      )}`,

      `Errors=${formatPercent(
        stage.errorRate
      )}`,

      `Timeouts=${stage.timedOutRequests}`,

      `GeneratorDrops=${stage.generatorDroppedRequests}`,
    ]
      .filter(
        Boolean
      )
      .join(
        " | "
      )
  );
}


function writeArtifact(
  data
) {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );


  const output =
    path.join(
      directory,
      `phase21-10b-kubernetes-capacity-${timestamp}.json`
    );


  fs.writeFileSync(
    output,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );


  return output;
}


function parseRates(
  value
) {
  return String(
    value
  )
    .split(
      ","
    )
    .map(
      Number
    )
    .filter(
      (
        number
      ) =>
        Number.isFinite(
          number
        ) &&
        number >
          0
    );
}


function positiveNumber(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function formatNumber(
  value
) {
  if (
    !Number.isFinite(
      Number(
        value
      )
    )
  ) {
    return "n/a";
  }


  return Number(
    Number(
      value
    ).toFixed(
      4
    )
  );
}


function formatLatency(
  value
) {
  return value ===
      null ||
    value ===
      undefined
    ? "n/a"
    : `${formatNumber(
        value
      )}ms`;
}


function formatPercent(
  value
) {
  return Number.isFinite(
    Number(
      value
    )
  )
    ? `${(
        Number(
          value
        ) *
        100
      ).toFixed(
        2
      )}%`
    : "n/a";
}


function formatPoint(
  point
) {
  if (!point) {
    return "NOT OBSERVED";
  }


  return `${point.targetRatePerSecond}/s | ${point.capacityState}`;
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
        "Phase21KubernetesCapacityCertificationError",

      code,

      executionAuthorized:
        false,
    }
  );
}


main()
  .then(
    () =>
      process.exit(
        0
      )
  )
  .catch(
    (
      error
    ) => {
      console.error(
        "\nPHASE 21.10B KUBERNETES LIVE CAPACITY RESULT: FAIL"
      );

      console.error(
        error
      );

      process.exit(
        1
      );
    }
  );