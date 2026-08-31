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


const webhookOutgoingAdapter =
  require(
    "../services/integrations/adapters/webhookOutgoingAdapter"
  );


const {
  LiveProviderCapacityProbe,
} =
  require(
    "../services/reliability/chaos/liveProviderCapacityProbe"
  );


const PORT =
  positiveInteger(
    process.env
      .PHASE21_WEBHOOK_SINK_PORT,

    19081
  );


const TARGET_URL =
  `http://127.0.0.1:${PORT}/aira-phase21`;


const RATES =
  parseRates(
    process.env
      .PHASE21_WEBHOOK_OUT_CAPACITY_RATES ||
    "25,50,100,250,500"
  );


const BASELINE_RATE =
  positiveNumber(
    process.env
      .PHASE21_WEBHOOK_OUT_BASELINE_RATE,

    5
  );


const STAGE_SECONDS =
  positiveNumber(
    process.env
      .PHASE21_WEBHOOK_OUT_STAGE_SECONDS,

    10
  );


const MAX_CONCURRENCY =
  positiveInteger(
    process.env
      .PHASE21_WEBHOOK_OUT_MAX_CONCURRENCY,

    256
  );


async function main() {
  process.env
    .AIRA_RELIABILITY_LAB =
    "true";


  if (
    String(
      process.env.NODE_ENV ||
      ""
    ).toLowerCase() ===
    "production"
  ) {
    throw certificationError(
      "PHASE21_PRODUCTION_REJECTED",

      "Webhook outgoing Reliability Lab capacity test cannot run in production"
    );
  }


  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 21.10B WEBHOOK OUTGOING LIVE CAPACITY"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Target:             ${TARGET_URL}`
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


  const connection = {
    provider:
      "webhook_outgoing",

    nonSecretConfig: {
      targetUrl:
        TARGET_URL,

      method:
        "POST",

      customHeaders: {
        "X-AIRA-Lab":
          "phase21-10b",
      },

      reliabilityLab:
        true,

      reliabilityLabLoopback:
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

    executionAuthorized:
      false,
  };


  const health =
    await webhookOutgoingAdapter
      .getHealth(
        connection
      );


  if (
    health.status !==
    "healthy"
  ) {
    throw certificationError(
      "PHASE21_WEBHOOK_SINK_UNHEALTHY",

      health.detail ||
      "Reliability Lab webhook sink is unavailable"
    );
  }


  console.log(
    `Initial sink health: ${health.status}`
  );


  const probe =
    new LiveProviderCapacityProbe({
      provider:
        "webhook_outgoing",

      operation:
        "send_notification",

      baselineRatePerSecond:
        BASELINE_RATE,

      stageDurationSeconds:
        STAGE_SECONDS,

      maxConcurrency:
        MAX_CONCURRENCY,

      requestTimeoutMs:
        10000,

      executor:
        async (
          context
        ) => {
          const result =
            await webhookOutgoingAdapter
              .sendNotification(
                connection,

                {
                  phase:
                    "21",

                  subphase:
                    "21.10B",

                  safetyClass:
                    "LAB_ONLY",

                  production:
                    false,

                  executionAuthorized:
                    false,

                  sequence:
                    context.sequence,

                  stage:
                    context.stage,

                  targetRatePerSecond:
                    context.targetRatePerSecond,

                  timestamp:
                    new Date()
                      .toISOString(),
                }
              );


          if (
            result.success !==
            true
          ) {
            throw certificationError(
              "PHASE21_WEBHOOK_SEND_FAILED",

              "Outgoing webhook did not report success"
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
        "WEBHOOK_OUTGOING_LIVE_CAPACITY",

      generatedAt:
        new Date()
          .toISOString(),

      machineSpecific:
        true,

      provider:
        "webhook_outgoing",

      operation:
        "send_notification",

      targetClass:
        "LOCAL_RELIABILITY_LAB_SINK",

      result,

      externalProviderCapacityClaimed:
        false,

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
      "PHASE21_WEBHOOK_RECOVERY_FAILED",

      "Outgoing webhook did not recover to baseline"
    );
  }


  console.log(
    `\nArtifact: ${artifactPath}`
  );


  console.log(
    "\nPHASE 21.10B WEBHOOK OUTGOING LIVE CAPACITY RESULT: PASS\n"
  );
}


function printResult(
  result
) {
  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "webhook_outgoing (REAL HTTP LAB SINK)"
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
      `phase21-10b-webhook-outgoing-capacity-${timestamp}.json`
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
        "Phase21WebhookOutgoingCapacityCertificationError",

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
        "\nPHASE 21.10B WEBHOOK OUTGOING LIVE CAPACITY RESULT: FAIL"
      );

      console.error(
        error
      );

      process.exit(
        1
      );
    }
  );