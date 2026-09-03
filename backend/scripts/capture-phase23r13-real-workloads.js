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
  execFileSync,
} =
  require(
    "node:child_process"
  );


const {
  normalizeDockerComposePs,

  buildReliabilityLabCapture,

  buildAstronomyShopCapture,

  buildWorkloadManifest,
} =
  require(
    "../services/reality/realityExecutableWorkloadCaptureService"
  );


const DEFAULT_CONTEXT =
  "kind-aira-reliability-lab";


const DEFAULT_NAMESPACE =
  "aira-reliability-lab";


function argumentValue(
  name
) {
  const index =
    process.argv
      .indexOf(
        name
      );


  if (
    index ===
      -1 ||
    index + 1 >=
      process.argv.length
  ) {
    return null;
  }


  return process.argv[
    index + 1
  ];
}


function run(
  command,
  args,
  options =
    {}
) {
  try {
    return execFileSync(
      command,
      args,
      {
        cwd:
          options.cwd,

        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],

        windowsHide:
          true,
      }
    );
  } catch (
    error
  ) {
    const stderr =
      error.stderr
        ? String(
            error.stderr
          ).trim()
        : "";


    throw Object.assign(
      new Error(
        (
          `${command} ${args.join(" ")} failed`
          +
          (
            stderr
              ? `: ${stderr}`
              : ""
          )
        )
      ),
      {
        code:
          "REALITY_WORKLOAD_CAPTURE_COMMAND_FAILED",

        command,

        args,

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }
}


function runJson(
  command,
  args,
  options =
    {}
) {
  const raw =
    run(
      command,
      args,
      options
    );


  try {
    return JSON.parse(
      raw
    );
  } catch (
    error
  ) {
    throw Object.assign(
      new Error(
        `${command} returned invalid JSON`
      ),
      {
        code:
          "REALITY_WORKLOAD_CAPTURE_INVALID_JSON",

        cause:
          error,

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }
}


function ensureDirectory(
  directory
) {
  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );
}


function writeJson(
  filePath,
  value
) {
  ensureDirectory(
    path.dirname(
      filePath
    )
  );


  fs.writeFileSync(
    filePath,

    (
      JSON.stringify(
        value,
        null,
        2
      )
      +
      "\n"
    ),

    "utf8"
  );
}


function captureReliabilityLab(
  {
    context,
    namespace,
  }
) {
  /*
   * Verify the context exists before collecting anything.
   */
  const contexts =
    run(
      "kubectl",
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
      .map(
        value =>
          value.trim()
      )
      .filter(
        Boolean
      );


  if (
    !contexts.includes(
      context
    )
  ) {
    throw Object.assign(
      new Error(
        `Kubernetes context not found: ${context}`
      ),
      {
        code:
          "REALITY_LAB_CONTEXT_NOT_FOUND",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  const namespaceObject =
    runJson(
      "kubectl",
      [
        "--context",
        context,

        "get",
        "namespace",
        namespace,

        "-o",
        "json",
      ]
    );


  const deployments =
    runJson(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "deployments",

        "-o",
        "json",
      ]
    );


  const pods =
    runJson(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "pods",

        "-o",
        "json",
      ]
    );


  const services =
    runJson(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "services",

        "-o",
        "json",
      ]
    );


  const events =
    runJson(
      "kubectl",
      [
        "--context",
        context,

        "-n",
        namespace,

        "get",
        "events",

        "-o",
        "json",
      ]
    );


  const readyPods =
    (
      pods.items
      ||
      []
    ).filter(
      pod =>
        (
          pod.status
            ?.conditions
          ||
          []
        ).some(
          condition =>
            (
              condition.type ===
                "Ready"
              &&
              condition.status ===
                "True"
            )
        )
    );


  if (
    readyPods.length ===
      0
  ) {
    throw Object.assign(
      new Error(
        "AIRA Reliability Lab has no Ready pods"
      ),
      {
        code:
          "REALITY_LAB_NOT_READY",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  return buildReliabilityLabCapture({
    context,

    namespace,

    namespaceObject,

    deployments,

    pods,

    services,

    events,

    capturedAt:
      new Date()
        .toISOString(),
  });
}


function captureAstronomyShop(
  sourceDirectory
) {
  if (
    !fs.existsSync(
      sourceDirectory
    )
  ) {
    throw Object.assign(
      new Error(
        (
          "OpenTelemetry demo source "
          +
          `directory not found: ${sourceDirectory}`
        )
      ),
      {
        code:
          "REALITY_OTEL_SOURCE_NOT_FOUND",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  const raw =
    run(
      "docker",
      [
        "compose",
        "ps",
        "--format",
        "json",
      ],
      {
        cwd:
          sourceDirectory,
      }
    );


  const containers =
    normalizeDockerComposePs(
      raw
    );


  const running =
    containers.filter(
      container => {
        const state =
          String(
            container.State
            ||
            container.state
            ||
            ""
          ).toLowerCase();


        return (
          state ===
            "running"
          ||
          state ===
            "up"
        );
      }
    );


  if (
    running.length ===
      0
  ) {
    throw Object.assign(
      new Error(
        (
          "OpenTelemetry Astronomy Shop "
          +
          "has no running Docker Compose containers"
        )
      ),
      {
        code:
          "REALITY_OTEL_WORKLOAD_NOT_RUNNING",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  return buildAstronomyShopCapture({
    sourceDirectory:
      path.resolve(
        sourceDirectory
      ),

    containers:
      containers,

    capturedAt:
      new Date()
        .toISOString(),
  });
}


async function main() {
  const dataRoot =
    argumentValue(
      "--data-root"
    )
    ||
    process.env
      .AIRA_DATA_ROOT;


  const otelSource =
    argumentValue(
      "--otel-source"
    );


  const context =
    argumentValue(
      "--context"
    )
    ||
    DEFAULT_CONTEXT;


  const namespace =
    argumentValue(
      "--namespace"
    )
    ||
    DEFAULT_NAMESPACE;


  if (
    !dataRoot
  ) {
    throw new Error(
      "--data-root or AIRA_DATA_ROOT is required"
    );
  }


  if (
    !otelSource
  ) {
    throw new Error(
      "--otel-source is required"
    );
  }


  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 23R.13S.4 — REAL EXECUTABLE WORKLOAD CAPTURE"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Observation only."
  );

  console.log(
    "Failure injection:      false"
  );

  console.log(
    "Recovery execution:     false"
  );

  console.log(
    "Production authority:   false"
  );

  console.log(
    "Ground-truth exposure:  false"
  );

  console.log(
    "==============================================================\n"
  );


  console.log(
    "[1/2] Capturing AIRA Reliability Lab..."
  );


  const reliabilityLab =
    captureReliabilityLab({
      context,

      namespace,
    });


  console.log(
    "PASS  AIRA Reliability Lab live capture"
  );


  console.log(
    "[2/2] Capturing OpenTelemetry Astronomy Shop..."
  );


  const astronomyShop =
    captureAstronomyShop(
      otelSource
    );


  console.log(
    "PASS  OpenTelemetry Astronomy Shop live capture"
  );


  const labOutput =
    path.resolve(
      dataRoot,

      "generated",

      "executable-workloads",

      "aira-reliability-lab",

      "phase23r13-live-workload-capture.json"
    );


  const otelOutput =
    path.resolve(
      dataRoot,

      "generated",

      "executable-workloads",

      "astronomy-shop",

      "phase23r13-live-workload-capture.json"
    );


  const manifestOutput =
    path.resolve(
      dataRoot,

      "manifests",

      "phase23r13-executable-workload-capture-manifest.json"
    );


  writeJson(
    labOutput,
    reliabilityLab
  );


  writeJson(
    otelOutput,
    astronomyShop
  );


  const manifest =
    buildWorkloadManifest({
      reliabilityLab,

      astronomyShop,
    });


  writeJson(
    manifestOutput,
    manifest
  );


  console.log(
    "\n--------------------------------------------------------------"
  );

  console.log(
    "CAPTURE RESULT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Reliability Lab: ${labOutput}`
  );

  console.log(
    `Astronomy Shop:  ${otelOutput}`
  );

  console.log(
    `Manifest:        ${manifestOutput}`
  );

  console.log(
    `Manifest SHA:    ${manifest.manifestHash}`
  );

  console.log(
    ""
  );

  console.log(
    "Execution authorized: false"
  );

  console.log(
    "Production certified: false"
  );

  console.log(
    "PHASE 23R.13S.4 CAPTURE COMPLETE"
  );
}


main()
  .catch(
    error => {
      console.error(
        "\nPHASE 23R.13S.4 CAPTURE FAILED"
      );

      console.error(
        error.code
        ||
        "REALITY_WORKLOAD_CAPTURE_FAILED"
      );

      console.error(
        error.message
      );


      process.exitCode =
        1;
    }
  );