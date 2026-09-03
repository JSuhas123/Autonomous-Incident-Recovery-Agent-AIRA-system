"use strict";


const crypto =
  require(
    "node:crypto"
  );


const EXECUTABLE_WORKLOAD_CAPTURE_VERSION =
  "23R.13S.4.0";


const WORKLOADS =
  Object.freeze({
    AIRA_RELIABILITY_LAB: {
      workloadId:
        "AIRA_MICROSERVICES_LAB_V1",

      sourceId:
        "AIRA_RELIABILITY_LAB",

      evidenceGrade:
        "E1",

      safetyClass:
        "LAB_ONLY",

      production:
        false,
    },


    OTEL_ASTRONOMY_SHOP: {
      workloadId:
        "OTEL_ASTRONOMY_SHOP",

      sourceId:
        "OTEL_ASTRONOMY_SHOP",

      evidenceGrade:
        "E1",

      safetyClass:
        "CONTROLLED_EXTERNAL_WORKLOAD",

      production:
        false,
    },
  });


function sortDeep(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortDeep
    );
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[
            key
          ] =
            sortDeep(
              value[
                key
              ]
            );


          return result;
        },
        {}
      );
  }


  return value;
}


function stableHash(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        sortDeep(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


function sha256Buffer(
  value
) {
  if (
    !Buffer.isBuffer(
      value
    )
  ) {
    throw new TypeError(
      "sha256Buffer requires Buffer"
    );
  }


  return crypto
    .createHash(
      "sha256"
    )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


function parseJson(
  raw,
  description
) {
  try {
    return JSON.parse(
      raw
    );
  } catch (
    error
  ) {
    throw Object.assign(
      new Error(
        (
          `${description} returned `
          +
          "invalid JSON"
        )
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


function normalizeDockerComposePs(
  raw
) {
  const trimmed =
    String(
      raw
      ||
      ""
    ).trim();


  if (
    !trimmed
  ) {
    return [];
  }


  /*
   * Docker Compose versions may return:
   *
   * 1. a JSON array
   * 2. newline-delimited JSON objects
   */
  if (
    trimmed.startsWith(
      "["
    )
  ) {
    const parsed =
      parseJson(
        trimmed,
        "docker compose ps"
      );


    if (
      !Array.isArray(
        parsed
      )
    ) {
      throw new Error(
        "docker compose ps JSON must be an array"
      );
    }


    return parsed;
  }


  return trimmed
    .split(
      /\r?\n/
    )
    .filter(
      Boolean
    )
    .map(
      (
        line
      ) =>
        parseJson(
          line,
          "docker compose ps"
        )
    );
}


function assertLabSafety(
  kubernetesSnapshot
) {
  const namespace =
    kubernetesSnapshot
      ?.namespace;


  if (
    namespace !==
      "aira-reliability-lab"
  ) {
    throw Object.assign(
      new Error(
        "Reliability Lab capture escaped LAB_ONLY namespace"
      ),
      {
        code:
          "REALITY_WORKLOAD_LAB_NAMESPACE_VIOLATION",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  const namespaceObject =
    kubernetesSnapshot
      ?.namespaceObject;


  const labels =
    namespaceObject
      ?.metadata
      ?.labels
      ||
      {};


  if (
    labels[
      "aira.reliability-lab"
    ] !==
      "true"
  ) {
    throw Object.assign(
      new Error(
        "Reliability Lab namespace lacks safety label"
      ),
      {
        code:
          "REALITY_WORKLOAD_LAB_LABEL_MISSING",

        executionAuthorized:
          false,

        productionCertified:
          false,
      }
    );
  }


  return true;
}


function buildReliabilityLabCapture(
  input
) {
  assertLabSafety(
    input
  );


  const core = {
    version:
      EXECUTABLE_WORKLOAD_CAPTURE_VERSION,

    captureType:
      "AIRA_RELIABILITY_LAB",

    sourceId:
      WORKLOADS
        .AIRA_RELIABILITY_LAB
        .sourceId,

    workloadId:
      WORKLOADS
        .AIRA_RELIABILITY_LAB
        .workloadId,

    evidenceGrade:
      WORKLOADS
        .AIRA_RELIABILITY_LAB
        .evidenceGrade,

    safetyClass:
      WORKLOADS
        .AIRA_RELIABILITY_LAB
        .safetyClass,

    production:
      false,

    context:
      input.context,

    namespace:
      input.namespace,

    namespaceObject:
      input.namespaceObject,

    deployments:
      input.deployments,

    pods:
      input.pods,

    services:
      input.services,

    events:
      input.events,

    capturedAt:
      input.capturedAt,

    provenance: {
      collector:
        "kubectl",

      context:
        input.context,

      namespace:
        input.namespace,

      phase:
        "23R.13S.4",
    },

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };


  return {
    ...core,

    captureHash:
      stableHash(
        core
      ),
  };
}


function buildAstronomyShopCapture(
  input
) {
  if (
    !input.sourceDirectory
  ) {
    throw new Error(
      "Astronomy Shop sourceDirectory is required"
    );
  }


  if (
    !Array.isArray(
      input.containers
    )
  ) {
    throw new Error(
      "Astronomy Shop containers are required"
    );
  }


  if (
    input.containers.length ===
      0
  ) {
    throw Object.assign(
      new Error(
        "Astronomy Shop has no running compose containers to capture"
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


  const core = {
    version:
      EXECUTABLE_WORKLOAD_CAPTURE_VERSION,

    captureType:
      "OTEL_ASTRONOMY_SHOP",

    sourceId:
      WORKLOADS
        .OTEL_ASTRONOMY_SHOP
        .sourceId,

    workloadId:
      WORKLOADS
        .OTEL_ASTRONOMY_SHOP
        .workloadId,

    evidenceGrade:
      WORKLOADS
        .OTEL_ASTRONOMY_SHOP
        .evidenceGrade,

    safetyClass:
      WORKLOADS
        .OTEL_ASTRONOMY_SHOP
        .safetyClass,

    production:
      false,

    sourceDirectory:
      input.sourceDirectory,

    containers:
      input.containers,

    capturedAt:
      input.capturedAt,

    provenance: {
      collector:
        "docker compose ps --format json",

      sourceDirectory:
        input.sourceDirectory,

      phase:
        "23R.13S.4",
    },

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };


  return {
    ...core,

    captureHash:
      stableHash(
        core
      ),
  };
}


function buildWorkloadManifest(
  {
    reliabilityLab,
    astronomyShop,
  }
) {
  if (
    !reliabilityLab ||
    !astronomyShop
  ) {
    throw new Error(
      "both real workload captures are required"
    );
  }


  const core = {
    version:
      EXECUTABLE_WORKLOAD_CAPTURE_VERSION,

    captureCount:
      2,

    workloads: [
      {
        sourceId:
          reliabilityLab
            .sourceId,

        workloadId:
          reliabilityLab
            .workloadId,

        captureHash:
          reliabilityLab
            .captureHash,

        evidenceGrade:
          reliabilityLab
            .evidenceGrade,

        safetyClass:
          reliabilityLab
            .safetyClass,
      },

      {
        sourceId:
          astronomyShop
            .sourceId,

        workloadId:
          astronomyShop
            .workloadId,

        captureHash:
          astronomyShop
            .captureHash,

        evidenceGrade:
          astronomyShop
            .evidenceGrade,

        safetyClass:
          astronomyShop
            .safetyClass,
      },
    ],

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };


  return {
    ...core,

    manifestHash:
      stableHash(
        core
      ),
  };
}


module.exports = {
  EXECUTABLE_WORKLOAD_CAPTURE_VERSION,

  WORKLOADS,

  sortDeep,

  stableHash,

  sha256Buffer,

  parseJson,

  normalizeDockerComposePs,

  assertLabSafety,

  buildReliabilityLabCapture,

  buildAstronomyShopCapture,

  buildWorkloadManifest,
};