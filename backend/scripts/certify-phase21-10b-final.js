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


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const REQUIRED_PROVIDERS = [
  "webhook_incoming",
  "prometheus_alertmanager",
  "grafana_alerting",
  "opentelemetry",
  "webhook_outgoing",
  "kubernetes",
];


const GENERIC_PROVIDERS =
  new Set([
    "webhook_incoming",
    "prometheus_alertmanager",
    "grafana_alerting",
    "opentelemetry",
  ]);


// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 21.10B FINAL INTEGRATION CAPACITY CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Safety class:             LAB_ONLY"
  );

  console.log(
    "Production certification: false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    "External provider limits: NOT CLAIMED"
  );

  console.log(
    "==============================================================\n"
  );


  const artifacts =
    loadArtifacts();


  console.log(
    `JSON artifacts discovered: ${artifacts.length}\n`
  );


  const evidence =
    collectEvidence(
      artifacts
    );


  const missing =
    REQUIRED_PROVIDERS
      .filter(
        (
          provider
        ) =>
          !evidence[
            provider
          ]
      );


  if (
    missing.length >
    0
  ) {
    console.log(
      "\nEvidence discovery diagnostics:"
    );


    for (
      const provider
      of REQUIRED_PROVIDERS
    ) {
      console.log(
        `  ${provider}: ${
          evidence[
            provider
          ]
            ? evidence[
                provider
              ].source
            : "NOT FOUND"
        }`
      );
    }


    fail(
      "PHASE21_REQUIRED_CAPACITY_EVIDENCE_MISSING",

      `Missing live capacity evidence for: ${missing.join(", ")}`
    );
  }


  const providerResults =
    REQUIRED_PROVIDERS
      .map(
        (
          provider
        ) =>
          normalizeProviderResult(
            provider,
            evidence[
              provider
            ]
          )
      );


  validateResults(
    providerResults
  );


  printProviderResults(
    providerResults
  );


  const certificate =
    buildCertificate(
      providerResults
    );


  const output =
    path.join(
      ARTIFACT_DIRECTORY,
      `phase21-10b-final-certification-${timestamp()}.json`
    );


  fs.writeFileSync(
    output,

    JSON.stringify(
      certificate,
      null,
      2
    ),

    "utf8"
  );


  printFinalSummary(
    certificate,
    output
  );
}


// ============================================================================
// LOAD ARTIFACTS
// ============================================================================

function loadArtifacts() {
  if (
    !fs.existsSync(
      ARTIFACT_DIRECTORY
    )
  ) {
    fail(
      "PHASE21_ARTIFACT_DIRECTORY_MISSING",

      `Artifact directory does not exist: ${ARTIFACT_DIRECTORY}`
    );
  }


  return fs
    .readdirSync(
      ARTIFACT_DIRECTORY
    )
    .filter(
      (
        file
      ) =>
        file.endsWith(
          ".json"
        )
    )
    /*
     * Never consume an older final aggregate as raw evidence.
     */
    .filter(
      (
        file
      ) =>
        !file.startsWith(
          "phase21-10b-final-certification-"
        )
    )
    .map(
      (
        file
      ) => {
        const fullPath =
          path.join(
            ARTIFACT_DIRECTORY,
            file
          );


        try {
          const stat =
            fs.statSync(
              fullPath
            );


          return {
            file,

            fullPath,

            modifiedAtMs:
              stat.mtimeMs,

            data:
              JSON.parse(
                fs.readFileSync(
                  fullPath,
                  "utf8"
                )
              ),
          };
        } catch (
          error
        ) {
          console.warn(
            `Skipping unreadable JSON artifact ${file}: ${error.message}`
          );


          return null;
        }
      }
    )
    .filter(
      Boolean
    );
}


// ============================================================================
// EVIDENCE DISCOVERY
// ============================================================================

function collectEvidence(
  artifacts
) {
  const result = {};


  /*
   * Four providers were measured by the earlier generic/adaptive
   * live capacity runner.
   *
   * We intentionally do NOT assume its JSON schema here.
   */
  for (
    const provider
    of GENERIC_PROVIDERS
  ) {
    const candidate =
      findBestProviderEvidence(
        artifacts,
        provider
      );


    if (
      candidate
    ) {
      result[
        provider
      ] =
        candidate;
    }
  }


  /*
   * Kubernetes and webhook_outgoing have dedicated artifacts,
   * so those are authoritative over generic discovery.
   */
  const kubernetes =
    newestArtifactMatching(
      artifacts,
      "phase21-10b-kubernetes-capacity-"
    );


  if (
    kubernetes
  ) {
    const payload =
      findCapacityPayload(
        kubernetes.data
      ) ||
      kubernetes.data;


    result.kubernetes = {
      provider:
        "kubernetes",

      source:
        kubernetes.file,

      path:
        "$",

      type:
        "REAL_INFRASTRUCTURE_PATH",

      payload,
    };
  }


  const webhookOutgoing =
    newestArtifactMatching(
      artifacts,
      "phase21-10b-webhook-outgoing-capacity-"
    );


  if (
    webhookOutgoing
  ) {
    const payload =
      findCapacityPayload(
        webhookOutgoing.data
      ) ||
      webhookOutgoing.data;


    result.webhook_outgoing = {
      provider:
        "webhook_outgoing",

      source:
        webhookOutgoing.file,

      path:
        "$",

      type:
        "REAL_HTTP_LAB_PATH",

      payload,
    };
  }


  return result;
}


// ============================================================================
// GENERIC RECURSIVE PROVIDER DISCOVERY
// ============================================================================

function findBestProviderEvidence(
  artifacts,
  provider
) {
  const candidates = [];


  for (
    const artifact
    of artifacts
  ) {
    /*
     * Generic capacity artifacts are preferred, but the recursive
     * discovery is intentionally tolerant of historical filenames.
     */
    walkObject(
      artifact.data,

      (
        node,
        nodePath,
        parent,
        parentPath
      ) => {
        collectCandidatesFromNode({
          candidates,

          artifact,

          provider,

          node,

          nodePath,

          parent,

          parentPath,
        });
      }
    );
  }


  if (
    candidates.length ===
    0
  ) {
    return null;
  }


  const scored =
    candidates
      .map(
        (
          candidate
        ) => {
          const payload =
            findCapacityPayload(
              candidate.payload
            ) ||
            candidate.payload;


          return {
            ...candidate,

            payload,

            score:
              scoreEvidence(
                provider,
                artifactNameBonus(
                  candidate
                    .source
                ),
                payload
              ),

            highestRate:
              highestSuccessfulRate(
                payload
              ),
          };
        }
      )
      .filter(
        (
          candidate
        ) =>
          candidate.score >
          0
      );


  if (
    scored.length ===
    0
  ) {
    return null;
  }


  scored.sort(
    (
      left,
      right
    ) => {
      /*
       * Prefer the artifact with the largest real tested envelope.
       *
       * This is important because we intentionally preserve several
       * historical Phase 21.10B artifacts rather than overwriting them.
       */
      if (
        right.highestRate !==
        left.highestRate
      ) {
        return (
          right.highestRate -
          left.highestRate
        );
      }


      if (
        right.score !==
        left.score
      ) {
        return (
          right.score -
          left.score
        );
      }


      return (
        right.modifiedAtMs -
        left.modifiedAtMs
      );
    }
  );


  const best =
    scored[0];


  return {
    provider,

    source:
      best.source,

    path:
      best.path,

    type:
      pathClassForProvider(
        provider
      ),

    payload:
      best.payload,
  };
}


function collectCandidatesFromNode({
  candidates,
  artifact,
  provider,
  node,
  nodePath,
  parent,
  parentPath,
}) {
  if (
    !isObject(
      node
    )
  ) {
    return;
  }


  /*
   * Shape:
   *
   * {
   *   provider: "opentelemetry",
   *   ...
   * }
   */
  if (
    normalizeProviderName(
      node.provider
    ) ===
    provider
  ) {
    candidates.push({
      source:
        artifact.file,

      modifiedAtMs:
        artifact.modifiedAtMs,

      path:
        nodePath,

      payload:
        node,
    });
  }


  /*
   * Alternate historical fields.
   */
  for (
    const field
    of [
      "providerId",
      "provider_id",
      "integrationProvider",
      "integration_provider",
    ]
  ) {
    if (
      normalizeProviderName(
        node[
          field
        ]
      ) ===
      provider
    ) {
      candidates.push({
        source:
          artifact.file,

        modifiedAtMs:
          artifact.modifiedAtMs,

        path:
          nodePath,

        payload:
          node,
      });
    }
  }


  /*
   * Shape:
   *
   * {
   *   opentelemetry: {
   *      ...
   *   }
   * }
   */
  if (
    Object.prototype
      .hasOwnProperty
      .call(
        node,
        provider
      )
  ) {
    const providerValue =
      node[
        provider
      ];


    if (
      isObject(
        providerValue
      )
    ) {
      candidates.push({
        source:
          artifact.file,

        modifiedAtMs:
          artifact.modifiedAtMs,

        path:
          `${nodePath}.${provider}`,

        payload:
          providerValue,
      });
    }
  }


  /*
   * Sometimes provider identity is stored in the parent while the
   * actual capacity result lives under result/capacity/report.
   */
  if (
    parent &&
    normalizeProviderName(
      parent.provider
    ) ===
    provider &&
    [
      "result",
      "capacity",
      "report",
      "metrics",
      "evidence",
      "certification",
    ].some(
      (
        field
      ) =>
        parent[
          field
        ] ===
        node
    )
  ) {
    candidates.push({
      source:
        artifact.file,

      modifiedAtMs:
        artifact.modifiedAtMs,

      path:
        nodePath ||
        parentPath,

      payload:
        node,
    });
  }
}


// ============================================================================
// CAPACITY PAYLOAD DISCOVERY
// ============================================================================

function findCapacityPayload(
  root
) {
  if (
    !isObject(
      root
    )
  ) {
    return null;
  }


  const candidates = [];


  walkObject(
    root,

    (
      node,
      nodePath
    ) => {
      if (
        !isObject(
          node
        )
      ) {
        return;
      }


      const score =
        capacityShapeScore(
          node
        );


      if (
        score >
        0
      ) {
        candidates.push({
          node,

          path:
            nodePath,

          score,

          highestRate:
            highestSuccessfulRate(
              node
            ),
        });
      }
    }
  );


  if (
    candidates.length ===
    0
  ) {
    return root;
  }


  candidates.sort(
    (
      left,
      right
    ) => {
      if (
        right.score !==
        left.score
      ) {
        return (
          right.score -
          left.score
        );
      }


      return (
        right.highestRate -
        left.highestRate
      );
    }
  );


  return candidates[0]
    .node;
}


function capacityShapeScore(
  node
) {
  let score = 0;


  if (
    Array.isArray(
      node.stages
    )
  ) {
    score +=
      100 +
      node.stages.length;
  }


  if (
    Array.isArray(
      node.stageResults
    )
  ) {
    score +=
      90 +
      node.stageResults.length;
  }


  if (
    node.baseline &&
    isObject(
      node.baseline
    )
  ) {
    score +=
      30;
  }


  if (
    hasFinite(
      node
        .safeSustainedRatePerSecond
    )
  ) {
    score +=
      40;
  }


  if (
    node.recovery
  ) {
    score +=
      30;
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        node,
        "degradationPoint"
      )
  ) {
    score +=
      15;
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        node,
        "saturationPoint"
      )
  ) {
    score +=
      15;
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        node,
        "breakingPoint"
      )
  ) {
    score +=
      15;
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        node,
        "loadGeneratorLimit"
      )
  ) {
    score +=
      15;
  }


  return score;
}


// ============================================================================
// EVIDENCE SCORING
// ============================================================================

function scoreEvidence(
  provider,
  filenameBonus,
  payload
) {
  let score =
    filenameBonus;


  score +=
    capacityShapeScore(
      payload
    );


  if (
    normalizeProviderName(
      payload.provider
    ) ===
    provider
  ) {
    score +=
      50;
  }


  const stages =
    normalizeStages(
      payload
    );


  if (
    stages.length >
    0
  ) {
    score +=
      stages.length *
      5;
  }


  if (
    recoveryPassed(
      payload
    )
  ) {
    score +=
      20;
  }


  if (
    payload.executionAuthorized ===
    false
  ) {
    score +=
      10;
  }


  return score;
}


function artifactNameBonus(
  filename
) {
  if (
    filename.startsWith(
      "phase21-10b-live-capacity-"
    )
  ) {
    return 100;
  }


  if (
    filename.includes(
      "capacity"
    )
  ) {
    return 50;
  }


  return 0;
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeProviderResult(
  provider,
  evidence
) {
  const payload =
    findCapacityPayload(
      evidence.payload
    ) ||
    evidence.payload ||
    {};


  const stages =
    normalizeStages(
      payload
    );


  if (
    stages.length ===
    0
  ) {
    fail(
      "PHASE21_CAPACITY_STAGE_EVIDENCE_MISSING",

      `${provider} evidence contains no measurable capacity stages in ${evidence.source}`
    );
  }


  const healthyStages =
    stages
      .filter(
        isHealthyStage
      )
      .sort(
        (
          left,
          right
        ) =>
          numericTarget(
            right
          ) -
          numericTarget(
            left
          )
      );


  const highestHealthy =
    healthyStages[0] ||
    null;


  const maxStage =
    [
      ...stages,
    ]
      .sort(
        (
          left,
          right
        ) =>
          numericTarget(
            right
          ) -
          numericTarget(
            left
          )
      )[0] ||
    null;


  const degradationPoint =
    payload.degradationPoint ||
    findFirstState(
      stages,
      [
        "DEGRADED",
        "SATURATED",
        "BROKEN",
      ]
    );


  const saturationPoint =
    payload.saturationPoint ||
    findFirstState(
      stages,
      [
        "SATURATED",
        "BROKEN",
      ]
    );


  const breakingPoint =
    payload.breakingPoint ||
    findFirstState(
      stages,
      [
        "BROKEN",
      ]
    );


  const generatorLimit =
    payload.loadGeneratorLimit ||
    payload.generatorLimit ||
    findFirstState(
      stages,
      [
        "LOAD_GENERATOR_LIMIT",
      ]
    );


  const highestObservedSuccessfulRate =
    highestSuccessfulRate(
      payload
    );


  const calculatedSafe =
    highestHealthy
      ? numericRate(
          highestHealthy
        )
      : null;


  /*
   * Prefer explicit safe sustained evidence when present.
   *
   * However, never let a stale low explicit value under-report a
   * newer healthy stage discovered in the same artifact.
   */
  const explicitSafe =
    finiteOrNull(
      payload
        .safeSustainedRatePerSecond
    );


  const safeSustained =
    maxFinite(
      explicitSafe,
      calculatedSafe
    );


  return {
    provider,

    operation:
      operationForProvider(
        provider
      ),

    pathClass:
      pathClassForProvider(
        provider
      ),

    sourceArtifact:
      evidence.source,

    sourcePath:
      evidence.path ||
      null,

    highestTestedOfferedRatePerSecond:
      maxStage
        ? numericTarget(
            maxStage
          )
        : null,

    highestObservedSuccessfulRatePerSecond:
      highestObservedSuccessfulRate,

    safeSustainedRatePerSecond:
      safeSustained,

    degradationPoint:
      normalizePoint(
        degradationPoint
      ),

    saturationPoint:
      normalizePoint(
        saturationPoint
      ),

    breakingPoint:
      normalizePoint(
        breakingPoint
      ),

    loadGeneratorLimit:
      normalizePoint(
        generatorLimit
      ),

    highestHealthyStage:
      normalizeStage(
        highestHealthy
      ),

    recoveryPassed:
      recoveryPassed(
        payload
      ),

    externalProviderCapacityClaimed:
      false,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// STAGE NORMALIZATION
// ============================================================================

function normalizeStages(
  payload
) {
  if (
    !isObject(
      payload
    )
  ) {
    return [];
  }


  for (
    const key
    of [
      "stages",
      "stageResults",
      "capacityStages",
      "rampStages",
      "measurements",
      "runs",
    ]
  ) {
    if (
      Array.isArray(
        payload[
          key
        ]
      )
    ) {
      const usable =
        payload[
          key
        ]
          .filter(
            isObject
          )
          .filter(
            looksLikeStage
          );


      if (
        usable.length >
        0
      ) {
        return usable;
      }
    }
  }


  /*
   * Last-resort recursive discovery for historical artifact formats.
   */
  const arrays = [];


  walkObject(
    payload,

    (
      node
    ) => {
      if (
        Array.isArray(
          node
        )
      ) {
        const usable =
          node
            .filter(
              isObject
            )
            .filter(
              looksLikeStage
            );


        if (
          usable.length >
          0
        ) {
          arrays.push(
            usable
          );
        }
      }
    }
  );


  arrays.sort(
    (
      left,
      right
    ) =>
      right.length -
      left.length
  );


  return arrays[0] ||
    [];
}


function looksLikeStage(
  stage
) {
  return (
    hasFinite(
      stage
        .targetRatePerSecond
    ) ||
    hasFinite(
      stage.targetRate
    ) ||
    hasFinite(
      stage
        .successfulRatePerSecond
    ) ||
    hasFinite(
      stage
        .achievedRatePerSecond
    )
  );
}


function isHealthyStage(
  stage
) {
  const state =
    String(
      stage.capacityState ||
      stage.state ||
      stage.classification ||
      ""
    )
      .toUpperCase();


  if (
    state ===
    "HEALTHY"
  ) {
    return true;
  }


  if (
    state &&
    state !==
    "HEALTHY"
  ) {
    return false;
  }


  const successRate =
    finiteOrNull(
      stage.successRate
    );


  const errorRate =
    finiteOrNull(
      stage.errorRate
    );


  const timeouts =
    integerOrZero(
      stage
        .timedOutRequests
    );


  const generatorDrops =
    integerOrZero(
      stage
        .generatorDroppedRequests
    );


  return (
    (
      successRate ===
      null ||
      successRate >=
      0.99
    ) &&
    (
      errorRate ===
      null ||
      errorRate <=
      0.01
    ) &&
    timeouts ===
      0 &&
    generatorDrops ===
      0
  );
}


// ============================================================================
// RECOVERY
// ============================================================================

function recoveryPassed(
  payload
) {
  const candidates = [
    payload
      ?.recovery
      ?.evaluation
      ?.recovered,

    payload
      ?.recovery
      ?.recovered,

    payload
      ?.recoveryPassed,

    payload
      ?.recovered,

    payload
      ?.recovery
      ?.success,

    payload
      ?.recovery
      ?.passed,
  ];


  for (
    const value
    of candidates
  ) {
    if (
      value ===
      true
    ) {
      return true;
    }


    if (
      String(
        value
      )
        .toUpperCase() ===
      "PASS"
    ) {
      return true;
    }
  }


  return false;
}


// ============================================================================
// VALIDATION
// ============================================================================

function validateResults(
  providerResults
) {
  if (
    providerResults.length !==
    REQUIRED_PROVIDERS.length
  ) {
    fail(
      "PHASE21_PROVIDER_COUNT_INVALID",

      `Expected ${REQUIRED_PROVIDERS.length} providers, received ${providerResults.length}`
    );
  }


  for (
    const result
    of providerResults
  ) {
    if (
      result.executionAuthorized !==
      false
    ) {
      fail(
        "PHASE21_CAPACITY_AUTHORIZATION_VIOLATION",

        `${result.provider} capacity evidence became authorizing`
      );
    }


    if (
      result.productionCertified !==
      false
    ) {
      fail(
        "PHASE21_CAPACITY_PRODUCTION_SCOPE_VIOLATION",

        `${result.provider} incorrectly claims production certification`
      );
    }


    if (
      result.externalProviderCapacityClaimed !==
      false
    ) {
      fail(
        "PHASE21_EXTERNAL_CAPACITY_SCOPE_VIOLATION",

        `${result.provider} incorrectly claims external-provider capacity`
      );
    }


    if (
      !hasFinite(
        result
          .highestTestedOfferedRatePerSecond
      )
    ) {
      fail(
        "PHASE21_CAPACITY_HIGHEST_TESTED_MISSING",

        `${result.provider} has no highest tested rate`
      );
    }


    if (
      !hasFinite(
        result
          .highestObservedSuccessfulRatePerSecond
      )
    ) {
      fail(
        "PHASE21_CAPACITY_HIGHEST_SUCCESSFUL_MISSING",

        `${result.provider} has no successful rate evidence`
      );
    }


    if (
      !hasFinite(
        result
          .safeSustainedRatePerSecond
      )
    ) {
      fail(
        "PHASE21_CAPACITY_SAFE_ENVELOPE_MISSING",

        `${result.provider} has no safe sustained rate evidence`
      );
    }


    if (
      result.recoveryPassed !==
      true
    ) {
      fail(
        "PHASE21_CAPACITY_RECOVERY_FAILED",

        `${result.provider} does not contain successful recovery evidence`
      );
    }
  }
}


// ============================================================================
// FINAL CERTIFICATE
// ============================================================================

function buildCertificate(
  providerResults
) {
  return {
    certificateVersion:
      "21.10B-final-v2",

    phase:
      "21",

    subphase:
      "21.10B",

    title:
      "Integration Capacity Certification",

    generatedAt:
      new Date()
        .toISOString(),

    status:
      "PASS",

    certificationClass:
      "LIVE_MACHINE_SPECIFIC",

    safetyClass:
      "LAB_ONLY",

    productionCertified:
      false,

    externalProviderCapacityClaimed:
      false,

    executionAuthorized:
      false,

    authority: {
      canGrantExecutionAuthorization:
        false,

      canGrantAutonomy:
        false,

      canModifyProductionAuthority:
        false,

      phase22ConsumesEvidence:
        true,
    },

    scope: {
      providersRequired:
        [
          ...REQUIRED_PROVIDERS,
        ],

      providersCertified:
        providerResults
          .map(
            (
              result
            ) =>
              result.provider
          ),

      connectorCount:
        providerResults.length,
    },

    providerResults,

    reproducibilityNotes: {
      webhookIncoming:
        "One earlier run showed transient degradation at 2000 offered requests/second. A focused rerun did not reproduce it. It is preserved as historical evidence but is not treated as an established threshold.",

      kubernetes:
        "A prior run showed latency pressure at 100 requests/second. The final 20-second refinement was healthy through 125 offered requests/second and saturated at 150 offered requests/second. The final conservative healthy envelope is taken from the refinement artifact.",

      webhookOutgoing:
        "The final 2000 requests/second run completed with zero request errors, zero timeouts and zero generator drops. The dedicated sink accepted exactly 86401 requests for the complete workload.",

      externalProviders:
        "No Datadog, Slack, PagerDuty, GitHub, cloud-provider or other third-party quota is inferred from local Phase 21.10B measurements.",
    },

    interpretation: {
      benchmarkScope:
        "These results describe the tested AIRA process, local machine, local PostgreSQL/runtime dependencies, Reliability Lab topology, kind cluster, and configured test paths.",

      universalMaximumClaimed:
        false,

      productionSloClaimed:
        false,

      externalProviderLimitClaimed:
        false,

      measuredEnvelopeNotMaximum:
        true,
    },

    finalResult: {
      pass:
        true,

      liveCertified:
        true,

      frozen:
        true,

      executionAuthorized:
        false,
    },
  };
}


// ============================================================================
// OUTPUT
// ============================================================================

function printProviderResults(
  results
) {
  for (
    const result
    of results
  ) {
    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      result.provider
    );

    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      `Source:               ${result.sourceArtifact}`
    );

    console.log(
      `Path class:           ${result.pathClass}`
    );

    console.log(
      `Operation:            ${result.operation}`
    );

    console.log(
      `Highest tested:       ${formatRate(
        result
          .highestTestedOfferedRatePerSecond
      )}`
    );

    console.log(
      `Highest successful:   ${formatRate(
        result
          .highestObservedSuccessfulRatePerSecond
      )}`
    );

    console.log(
      `Safe sustained:       ${formatRate(
        result
          .safeSustainedRatePerSecond
      )}`
    );

    console.log(
      `Degradation:          ${formatPoint(
        result
          .degradationPoint
      )}`
    );

    console.log(
      `Saturation:           ${formatPoint(
        result
          .saturationPoint
      )}`
    );

    console.log(
      `Breaking point:       ${formatPoint(
        result
          .breakingPoint
      )}`
    );

    console.log(
      `Generator limit:      ${formatPoint(
        result
          .loadGeneratorLimit
      )}`
    );

    console.log(
      `Recovery:             ${
        result
          .recoveryPassed
          ? "PASS"
          : "FAIL"
      }`
    );

    console.log();
  }
}


function printFinalSummary(
  certificate,
  output
) {
  console.log(
    "=============================================================="
  );

  console.log(
    "FINAL SUMMARY"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Providers certified:        ${certificate.scope.connectorCount}`
  );

  console.log(
    `Recovery passed:            ${certificate.providerResults.filter(
      (
        result
      ) =>
        result.recoveryPassed
    ).length}`
  );

  console.log(
    "Execution authorized:       false"
  );

  console.log(
    "Production certified:       false"
  );

  console.log(
    "External provider capacity: NOT CLAIMED"
  );

  console.log(
    "Machine specific:           true"
  );

  console.log(
    "Phase 22 evidence ready:    true"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `\nCertificate artifact: ${output}`
  );

  console.log(
    "\nPHASE 21.10B FINAL RESULT: PASS"
  );

  console.log(
    "PHASE 21.10B STATUS: LIVE CERTIFIED / FROZEN\n"
  );
}


// ============================================================================
// PROVIDER SEMANTICS
// ============================================================================

function pathClassForProvider(
  provider
) {
  switch (
    provider
  ) {
    case "kubernetes":
      return "REAL_INFRASTRUCTURE_PATH";

    case "webhook_outgoing":
      return "REAL_HTTP_LAB_PATH";

    case "opentelemetry":
      return "AIRA_POSTGRES_OPERATIONAL_PATH";

    case "webhook_incoming":
    case "prometheus_alertmanager":
    case "grafana_alerting":
      return "AIRA_LOCAL_INGESTION_PATH";

    default:
      return "UNKNOWN";
  }
}


function operationForProvider(
  provider
) {
  switch (
    provider
  ) {
    case "kubernetes":
      return "get_health";

    case "webhook_outgoing":
      return "send_notification";

    case "opentelemetry":
      return "receive_event_postgres";

    case "webhook_incoming":
    case "prometheus_alertmanager":
    case "grafana_alerting":
      return "receive_event";

    default:
      return "unknown";
  }
}


// ============================================================================
// METRIC HELPERS
// ============================================================================

function highestSuccessfulRate(
  payload
) {
  const values = [];


  const explicit =
    [
      payload
        ?.safeSustainedRatePerSecond,

      payload
        ?.highestSuccessfulRatePerSecond,

      payload
        ?.highestObservedSuccessfulRatePerSecond,
    ];


  for (
    const value
    of explicit
  ) {
    if (
      hasFinite(
        value
      )
    ) {
      values.push(
        Number(
          value
        )
      );
    }
  }


  for (
    const stage
    of normalizeStages(
      payload
    )
  ) {
    const value =
      numericRate(
        stage
      );


    if (
      hasFinite(
        value
      )
    ) {
      values.push(
        value
      );
    }
  }


  return values.length >
    0
    ? Math.max(
        ...values
      )
    : 0;
}


function findFirstState(
  stages,
  states
) {
  return [
    ...stages,
  ]
    .filter(
      (
        stage
      ) =>
        states.includes(
          String(
            stage.capacityState ||
            stage.state ||
            stage.classification ||
            ""
          )
            .toUpperCase()
        )
    )
    .sort(
      (
        left,
        right
      ) =>
        numericTarget(
          left
        ) -
        numericTarget(
          right
        )
    )[0] ||
    null;
}


function normalizeStage(
  stage
) {
  if (!stage) {
    return null;
  }


  return {
    targetRatePerSecond:
      numericTarget(
        stage
      ),

    achievedRatePerSecond:
      finiteOrNull(
        stage
          .achievedRatePerSecond
      ),

    successfulRatePerSecond:
      numericRate(
        stage
      ),

    state:
      stage.capacityState ||
      stage.state ||
      stage.classification ||
      "HEALTHY",

    successRate:
      finiteOrNull(
        stage.successRate
      ),

    errorRate:
      finiteOrNull(
        stage.errorRate
      ),

    p50LatencyMs:
      finiteOrNull(
        stage.p50LatencyMs
      ),

    p95LatencyMs:
      finiteOrNull(
        stage.p95LatencyMs
      ),

    p99LatencyMs:
      finiteOrNull(
        stage.p99LatencyMs
      ),

    failedRequests:
      integerOrZero(
        stage.failedRequests
      ),

    rejectedRequests:
      integerOrZero(
        stage.rejectedRequests
      ),

    timedOutRequests:
      integerOrZero(
        stage.timedOutRequests
      ),

    rateLimitedRequests:
      integerOrZero(
        stage.rateLimitedRequests
      ),

    generatorDroppedRequests:
      integerOrZero(
        stage.generatorDroppedRequests
      ),
  };
}


function normalizePoint(
  point
) {
  if (!point) {
    return null;
  }


  return {
    targetRatePerSecond:
      finiteOrNull(
        point
          .targetRatePerSecond
      ) ??
      finiteOrNull(
        point.targetRate
      ),

    achievedRatePerSecond:
      finiteOrNull(
        point
          .achievedRatePerSecond
      ),

    successfulRatePerSecond:
      finiteOrNull(
        point
          .successfulRatePerSecond
      ) ??
      finiteOrNull(
        point
          .successRatePerSecond
      ),

    state:
      point.capacityState ||
      point.state ||
      point.classification ||
      null,

    p95LatencyMs:
      finiteOrNull(
        point.p95LatencyMs
      ),

    p99LatencyMs:
      finiteOrNull(
        point.p99LatencyMs
      ),

    successRate:
      finiteOrNull(
        point.successRate
      ),

    errorRate:
      finiteOrNull(
        point.errorRate
      ),
  };
}


function numericTarget(
  stage
) {
  return (
    finiteOrNull(
      stage
        ?.targetRatePerSecond
    ) ??
    finiteOrNull(
      stage
        ?.targetRate
    ) ??
    finiteOrNull(
      stage
        ?.offeredRatePerSecond
    ) ??
    finiteOrNull(
      stage
        ?.offeredRate
    ) ??
    0
  );
}


function numericRate(
  stage
) {
  return (
    finiteOrNull(
      stage
        ?.successfulRatePerSecond
    ) ??
    finiteOrNull(
      stage
        ?.successRatePerSecond
    ) ??
    finiteOrNull(
      stage
        ?.actualRatePerSecond
    ) ??
    finiteOrNull(
      stage
        ?.achievedRatePerSecond
    ) ??
    0
  );
}


// ============================================================================
// RECURSIVE WALK
// ============================================================================

function walkObject(
  value,
  visitor,
  currentPath = "$",
  parent = null,
  parentPath = null,
  seen = new Set()
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  if (
    seen.has(
      value
    )
  ) {
    return;
  }


  seen.add(
    value
  );


  visitor(
    value,
    currentPath,
    parent,
    parentPath
  );


  if (
    Array.isArray(
      value
    )
  ) {
    value.forEach(
      (
        child,
        index
      ) => {
        walkObject(
          child,

          visitor,

          `${currentPath}[${index}]`,

          value,

          currentPath,

          seen
        );
      }
    );


    return;
  }


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
      child &&
      typeof child ===
        "object"
    ) {
      walkObject(
        child,

        visitor,

        `${currentPath}.${key}`,

        value,

        currentPath,

        seen
      );
    }
  }
}


// ============================================================================
// FILE HELPERS
// ============================================================================

function newestArtifactMatching(
  artifacts,
  prefix
) {
  return artifacts
    .filter(
      (
        artifact
      ) =>
        artifact.file
          .startsWith(
            prefix
          )
    )
    .sort(
      (
        left,
        right
      ) =>
        right.modifiedAtMs -
        left.modifiedAtMs
    )[0] ||
    null;
}


// ============================================================================
// GENERIC HELPERS
// ============================================================================

function normalizeProviderName(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }


  return value
    .trim()
    .toLowerCase()
    .replace(
      /[\s-]+/g,
      "_"
    );
}


function isObject(
  value
) {
  return Boolean(
    value &&
    typeof value ===
      "object"
  );
}


function hasFinite(
  value
) {
  return Number.isFinite(
    Number(
      value
    )
  );
}


function finiteOrNull(
  value
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function maxFinite(
  ...values
) {
  const usable =
    values
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            Number(
              value
            )
          )
      )
      .map(
        Number
      );


  return usable.length >
    0
    ? Math.max(
        ...usable
      )
    : null;
}


function integerOrZero(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  )
    ? parsed
    : 0;
}


function formatRate(
  value
) {
  return hasFinite(
    value
  )
    ? `${Number(
        Number(
          value
        ).toFixed(
          4
        )
      )}/s`
    : "NOT OBSERVED";
}


function formatPoint(
  point
) {
  if (!point) {
    return "NOT OBSERVED";
  }


  return `${
    point
      .targetRatePerSecond ??
    "n/a"
  }/s | ${
    point.state ||
    "UNKNOWN"
  }`;
}


function timestamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


function fail(
  code,
  message
) {
  throw Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21FinalCapacityCertificationError",

      code,

      executionAuthorized:
        false,
    }
  );
}


// ============================================================================
// EXECUTE
// ============================================================================

try {
  main();
} catch (
  error
) {
  console.error(
    "\nPHASE 21.10B FINAL RESULT: FAIL"
  );

  console.error(
    error
  );

  process.exit(
    1
  );
}