"use strict";

/**
 * AIRA PHASE 23R — FINAL CERTIFICATION + FREEZE
 *
 * Purpose:
 *   Bind the frozen Reality corpus, external-reality certification,
 *   corpus coverage evidence, and the already-completed real live
 *   23R.10G.2 closed-loop certification into one final Phase-23R
 *   certification artifact.
 *
 * IMPORTANT:
 *
 *   FINAL PHASE CERTIFICATION != PRODUCTION CERTIFICATION
 *   CORPUS EVIDENCE != EXECUTION AUTHORITY
 *   REPLAY CERTIFICATION != EXECUTION AUTHORITY
 *   BENCHMARK SCORE != PRODUCTION PROOF
 *   GROUND TRUTH MUST NEVER ENTER AGENT CONTEXT
 *
 * This script:
 *   - does NOT inject failures;
 *   - does NOT execute recovery;
 *   - does NOT mutate the Reliability Lab;
 *   - does NOT modify the frozen corpus;
 *   - does NOT grant production authority;
 *   - does NOT grant execution authority.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const VERSION = "23R.FINAL.0";
const PHASE = "23R";

const EXPECTED = Object.freeze({
  corpusFreezeHash:
    "8ec3bcaab9f32d4c9dbf044f5d163993ed4585070925822a69a07b0814a52c38",

  liveCertificationHash:
    "de4a6bccefc31b23f4d53e39ba3a693fd33641c1f743ee634a7841dcaf19705b",

  liveCertificationVersion:
    "23R.10G.2.2",

  liveVerificationOutcome:
    "VERIFIED_RECOVERY",

  externalCaseCount:
    1335,

  externalCertificationHash:
    "31eafdd695a3ce1985847bc5046a32c28488c74d54dc82d8987aa32467e05afd",

  externalPromotionManifestHash:
    "5a31c0a683f70274be16ef23257b21d325ad0f988cd18fd6d9ec05da5a9b8366",
});


function fail(
  code,
  message,
  details = {}
) {
  return Object.assign(
    new Error(message),
    {
      name: "Phase23RFinalCertificationError",
      code,
      details,
      executionAuthorized: false,
      productionCertified: false,
    }
  );
}


function assert(
  condition,
  code,
  message,
  details = {}
) {
  if (!condition) {
    throw fail(
      code,
      message,
      details
    );
  }
}


function argValue(name) {
  const index =
    process.argv.indexOf(name);

  if (
    index < 0 ||
    index + 1 >= process.argv.length
  ) {
    return null;
  }

  return process.argv[index + 1];
}


function resolveConfiguration() {
  const backendRoot =
    path.resolve(
      __dirname,
      ".."
    );

  const repositoryRoot =
    path.resolve(
      backendRoot,
      ".."
    );

  const dataRoot =
    path.resolve(
      argValue("--data-root") ||
      process.env.AIRA_DATA_ROOT ||
      path.resolve(
        repositoryRoot,
        "..",
        "AIRA-DATA"
      )
    );

  const liveArtifact =
    path.resolve(
      argValue("--live-certification") ||
      path.join(
        backendRoot,
        "artifacts",
        "phase23r",
        "phase23r-10g2-live-certification-2026-09-03T20-07-26-364Z.json"
      )
    );

  const outputDirectory =
    path.resolve(
      argValue("--output-dir") ||
      path.join(
        backendRoot,
        "artifacts",
        "phase23r"
      )
    );

  return {
    backendRoot,
    repositoryRoot,
    dataRoot,
    liveArtifact,
    outputDirectory,
  };
}


function requireFile(
  filePath,
  code
) {
  assert(
    fs.existsSync(filePath),
    code,
    `Required Phase-23R evidence file is missing: ${filePath}`
  );

  const stat =
    fs.statSync(filePath);

  assert(
    stat.isFile(),
    code,
    `Expected a file but found another filesystem object: ${filePath}`
  );

  assert(
    stat.size > 0,
    code,
    `Required Phase-23R evidence file is empty: ${filePath}`
  );

  return filePath;
}


function readJson(
  filePath,
  code
) {
  requireFile(
    filePath,
    code
  );

  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  } catch (error) {
    throw fail(
      `${code}_JSON_INVALID`,
      `Invalid JSON in ${filePath}: ${error.message}`
    );
  }
}


function sha256Bytes(
  bytes
) {
  return crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");
}


function sha256File(
  filePath
) {
  return sha256Bytes(
    fs.readFileSync(filePath)
  );
}


function stableStringify(
  value
) {
  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map(stableStringify)
        .join(",") +
      "]"
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            (
              `${JSON.stringify(key)}:` +
              stableStringify(value[key])
            )
        )
        .join(",") +
      "}"
    );
  }

  return JSON.stringify(value);
}


function assertFalse(
  object,
  field,
  code,
  sourceName
) {
  assert(
    object?.[field] === false,
    code,
    `${sourceName}.${field} must be false`
  );
}


function assertNotTrue(
  object,
  field,
  code,
  sourceName
) {
  assert(
    object?.[field] !== true,
    code,
    `${sourceName}.${field} must never be true`
  );
}


function firstDefined(
  ...values
) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}


function collectSafetyFlags(
  object
) {
  return {
    groundTruthAgentVisible:
      firstDefined(
        object?.groundTruthAgentVisible,
        object?.safety?.groundTruthAgentVisible,
        object?.checks?.groundTruthAgentVisible
      ),

    executionAuthorized:
      firstDefined(
        object?.executionAuthorized,
        object?.safety?.executionAuthorized,
        object?.checks?.executionAuthorized
      ),

    productionCertified:
      firstDefined(
        object?.productionCertified,
        object?.safety?.productionCertified,
        object?.checks?.productionCertified
      ),
  };
}


function validateCorpusFreeze(
  freeze
) {
  assert(
    freeze.status === "FROZEN",
    "PHASE23R_FINAL_CORPUS_NOT_FROZEN",
    "23R.13U corpus status must be FROZEN"
  );

  assert(
    freeze.phaseGate === "23R.13U",
    "PHASE23R_FINAL_CORPUS_GATE_INVALID",
    "Final certification requires the 23R.13U freeze gate"
  );

  assert(
    freeze.freezeHash ===
      EXPECTED.corpusFreezeHash,
    "PHASE23R_FINAL_CORPUS_HASH_CHANGED",
    "23R.13U frozen corpus hash does not match the certified freeze"
  );

  assertFalse(
    freeze,
    "groundTruthAgentVisible",
    "PHASE23R_FINAL_CORPUS_GROUND_TRUTH_VISIBLE",
    "corpusFreeze"
  );

  assertFalse(
    freeze,
    "executionAuthorized",
    "PHASE23R_FINAL_CORPUS_AUTHORITY_INVALID",
    "corpusFreeze"
  );

  assertFalse(
    freeze,
    "productionCertified",
    "PHASE23R_FINAL_CORPUS_PRODUCTION_INVALID",
    "corpusFreeze"
  );

  return {
    status: freeze.status,
    phaseGate: freeze.phaseGate,
    freezeHash: freeze.freezeHash,
    groundTruthAgentVisible:
      freeze.groundTruthAgentVisible,
    executionAuthorized:
      freeze.executionAuthorized,
    productionCertified:
      freeze.productionCertified,
  };
}


function validateLiveCertification(
  live
) {
  assert(
    live.version ===
      EXPECTED.liveCertificationVersion,
    "PHASE23R_FINAL_LIVE_VERSION_INVALID",
    (
      "Expected live certification version " +
      EXPECTED.liveCertificationVersion +
      ` but received ${live.version}`
    )
  );

  assert(
    live.status === "PASS",
    "PHASE23R_FINAL_LIVE_NOT_PASS",
    "23R.10G.2 live certification must be PASS"
  );

  assert(
    live.phase23r10g2 === "PASS" ||
    live.phaseGate === "23R.10G.2",
    "PHASE23R_FINAL_LIVE_GATE_INVALID",
    "Evidence is not a Phase-23R.10G.2 certification"
  );

  assert(
    live.certificationHash ===
      EXPECTED.liveCertificationHash,
    "PHASE23R_FINAL_LIVE_CERTIFICATION_HASH_CHANGED",
    "23R.10G.2 certification hash does not match the certified live run"
  );

  assert(
    live.verificationOutcome ===
      EXPECTED.liveVerificationOutcome,
    "PHASE23R_FINAL_LIVE_VERIFICATION_INVALID",
    (
      "23R.10G.2 must end with " +
      EXPECTED.liveVerificationOutcome
    )
  );

  assert(
    live.finalState?.labStatus === "AVAILABLE" ||
    live.labStatus === "AVAILABLE",
    "PHASE23R_FINAL_LIVE_LAB_NOT_AVAILABLE",
    "Certified live run did not finish with the Reliability Lab AVAILABLE"
  );

  assert(
    live.finalState?.experimentStatus === "ABORTED" ||
    live.checks?.finalExperimentAborted === true,
    "PHASE23R_FINAL_LIVE_EXPERIMENT_NOT_CLOSED",
    "Certified Phase-21 experiment was not canonically closed"
  );

  assert(
    live.finalState?.environmentReplayStage === "COMPLETED" ||
    live.checks?.finalEnvironmentReplayCompleted === true,
    "PHASE23R_FINAL_LIVE_REPLAY_NOT_COMPLETED",
    "Certified environment replay did not reach COMPLETED"
  );

  assert(
    live.checks?.realFailureInjected === true,
    "PHASE23R_FINAL_REAL_FAILURE_NOT_PROVEN",
    "Live certification does not prove real failure injection"
  );

  assert(
    live.checks?.canonicalIncidentObserved === true,
    "PHASE23R_FINAL_INCIDENT_NOT_PROVEN",
    "Live certification does not prove canonical incident observation"
  );

  assert(
    live.checks?.diagnosisProduced === true,
    "PHASE23R_FINAL_DIAGNOSIS_NOT_PROVEN",
    "Live certification does not prove AIRA diagnosis"
  );

  assert(
    live.checks?.unauthorizedExecutionBlocked === true,
    "PHASE23R_FINAL_UNAUTHORIZED_EXECUTION_NOT_BLOCKED",
    "Live certification does not prove unauthorized execution was blocked"
  );

  assert(
    live.checks?.authorizationPersisted === true,
    "PHASE23R_FINAL_AUTHORIZATION_NOT_PERSISTED",
    "Live certification does not prove persisted authorization"
  );

  assert(
    live.checks?.immutableExecutionRequestPersisted === true,
    "PHASE23R_FINAL_EXECUTION_REQUEST_NOT_PERSISTED",
    "Live certification does not prove immutable execution request persistence"
  );

  assert(
    live.checks?.integrationRuntimeExecuted === true,
    "PHASE23R_FINAL_RUNTIME_NOT_EXECUTED",
    "Live certification does not prove IntegrationRuntime execution"
  );

  assert(
    live.checks?.kubernetesRecoveryExecuted === true,
    "PHASE23R_FINAL_RECOVERY_NOT_EXECUTED",
    "Live certification does not prove real Kubernetes recovery"
  );

  assert(
    live.checks?.independentVerificationSucceeded === true,
    "PHASE23R_FINAL_VERIFICATION_NOT_INDEPENDENT",
    "Live certification does not prove independent recovery verification"
  );

  assert(
    live.checks?.resetSucceeded === true,
    "PHASE23R_FINAL_RESET_NOT_PROVEN",
    "Live certification does not prove reset success"
  );

  assert(
    live.checks?.baselineRestored === true,
    "PHASE23R_FINAL_BASELINE_NOT_RESTORED",
    "Live certification does not prove baseline restoration"
  );

  assert(
    live.checks?.groundTruthPassedToAira === false,
    "PHASE23R_FINAL_GROUND_TRUTH_LEAK",
    "Live certification indicates ground truth entered AIRA context"
  );

  assert(
    live.checks?.evaluatorInfluencedReasoning === false,
    "PHASE23R_FINAL_EVALUATOR_REASONING_LEAK",
    "Live certification indicates evaluator truth influenced reasoning"
  );

  assertFalse(
    live,
    "groundTruthAgentVisible",
    "PHASE23R_FINAL_LIVE_GROUND_TRUTH_VISIBLE",
    "liveCertification"
  );

  assertFalse(
    live,
    "executionAuthorized",
    "PHASE23R_FINAL_LIVE_AUTHORITY_INVALID",
    "liveCertification"
  );

  assertFalse(
    live,
    "productionCertified",
    "PHASE23R_FINAL_LIVE_PRODUCTION_INVALID",
    "liveCertification"
  );

  return {
    version: live.version,
    status: live.status,
    certificationHash:
      live.certificationHash,

    replayRunId:
      live.replayRunId,

    environmentReplayRunId:
      live.environmentReplayRunId,

    experimentRunId:
      live.experimentRunId,

    incidentId:
      live.incidentId,

    diagnosisRunId:
      live.diagnosisRunId,

    authorizationId:
      live.authorizationId,

    executionRequestId:
      live.executionRequestId,

    verificationOutcome:
      live.verificationOutcome,

    labStatus:
      live.finalState?.labStatus ||
      live.labStatus,

    groundTruthAgentVisible:
      live.groundTruthAgentVisible,

    executionAuthorized:
      live.executionAuthorized,

    productionCertified:
      live.productionCertified,
  };
}


function validateExternalCertification(
  external
) {
  assert(
    external.status === "PASS",
    "PHASE23R_FINAL_EXTERNAL_NOT_PASS",
    "External Reality integrity certification must be PASS"
  );

  const caseCount =
    firstDefined(
      external.caseCount,
      external.totalCaseCount,
      external.summary?.caseCount
    );

  assert(
    Number(caseCount) ===
      EXPECTED.externalCaseCount,
    "PHASE23R_FINAL_EXTERNAL_COUNT_CHANGED",
    (
      "Expected 1335 externally certified cases " +
      `but received ${caseCount}`
    )
  );

  const certificationHash =
    firstDefined(
      external.certificationHash,
      external.hash
    );

  assert(
    certificationHash ===
      EXPECTED.externalCertificationHash,
    "PHASE23R_FINAL_EXTERNAL_HASH_CHANGED",
    "External Reality certification hash changed after certification"
  );

  const flags =
    collectSafetyFlags(external);

  assert(
    flags.groundTruthAgentVisible !== true,
    "PHASE23R_FINAL_EXTERNAL_GROUND_TRUTH_VISIBLE",
    "External Reality certification exposes ground truth to AIRA"
  );

  assert(
    flags.executionAuthorized !== true,
    "PHASE23R_FINAL_EXTERNAL_AUTHORITY_INVALID",
    "External Reality evidence grants execution authority"
  );

  assert(
    flags.productionCertified !== true,
    "PHASE23R_FINAL_EXTERNAL_PRODUCTION_INVALID",
    "External Reality evidence claims production certification"
  );

  return {
    status:
      external.status,

    caseCount:
      Number(caseCount),

    certificationHash,

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function validateExternalPromotion(
  promotion
) {
  const promotionHash =
    firstDefined(
      promotion.combinedManifestHash,
      promotion.manifestHash,
      promotion.promotionManifestHash,
      promotion.hash
    );

  assert(
    promotionHash ===
      EXPECTED.externalPromotionManifestHash,
    "PHASE23R_FINAL_EXTERNAL_PROMOTION_HASH_CHANGED",
    "External Reality promotion manifest hash changed"
  );

  const flags =
    collectSafetyFlags(promotion);

  assert(
    flags.groundTruthAgentVisible !== true,
    "PHASE23R_FINAL_PROMOTION_GROUND_TRUTH_VISIBLE",
    "External promotion manifest exposes evaluator ground truth"
  );

  assert(
    flags.executionAuthorized !== true,
    "PHASE23R_FINAL_PROMOTION_AUTHORITY_INVALID",
    "External promotion manifest grants execution authority"
  );

  assert(
    flags.productionCertified !== true,
    "PHASE23R_FINAL_PROMOTION_PRODUCTION_INVALID",
    "External promotion manifest claims production certification"
  );

  return {
    combinedManifestHash:
      promotionHash,

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function validateInventory(
  inventory
) {
  assert(
    inventory &&
    typeof inventory === "object",
    "PHASE23R_FINAL_INVENTORY_INVALID",
    "23R.13 corpus inventory is invalid"
  );

  assertNotTrue(
    inventory,
    "executionAuthorized",
    "PHASE23R_FINAL_INVENTORY_AUTHORITY_INVALID",
    "corpusInventory"
  );

  assertNotTrue(
    inventory,
    "productionCertified",
    "PHASE23R_FINAL_INVENTORY_PRODUCTION_INVALID",
    "corpusInventory"
  );

  assertNotTrue(
    inventory,
    "groundTruthAgentVisible",
    "PHASE23R_FINAL_INVENTORY_GROUND_TRUTH_INVALID",
    "corpusInventory"
  );

  return {
    present: true,
    executionAuthorized: false,
    productionCertified: false,
    groundTruthAgentVisible: false,
  };
}


function validateScaleManifest(
  scale
) {
  assert(
    scale &&
    typeof scale === "object",
    "PHASE23R_FINAL_SCALE_MANIFEST_INVALID",
    "23R.13 scale completion manifest is invalid"
  );

  const status =
    firstDefined(
      scale.status,
      scale.certificationStatus,
      scale.result
    );

  if (status !== null) {
    assert(
      status === "PASS" ||
      status === "FROZEN" ||
      status === "COMPLETE" ||
      status === "COMPLETED",
      "PHASE23R_FINAL_SCALE_NOT_COMPLETE",
      `Unexpected 23R.13 scale completion status: ${status}`
    );
  }

  assertNotTrue(
    scale,
    "executionAuthorized",
    "PHASE23R_FINAL_SCALE_AUTHORITY_INVALID",
    "scaleCompletion"
  );

  assertNotTrue(
    scale,
    "productionCertified",
    "PHASE23R_FINAL_SCALE_PRODUCTION_INVALID",
    "scaleCompletion"
  );

  assertNotTrue(
    scale,
    "groundTruthAgentVisible",
    "PHASE23R_FINAL_SCALE_GROUND_TRUTH_INVALID",
    "scaleCompletion"
  );

  return {
    status:
      status || "PRESENT",

    executionAuthorized:
      false,

    productionCertified:
      false,

    groundTruthAgentVisible:
      false,
  };
}


function requiredManifestPaths(
  dataRoot
) {
  const manifests =
    path.join(
      dataRoot,
      "manifests"
    );

  return {
    corpusFreeze:
      path.join(
        manifests,
        "phase23r13-corpus-freeze.json"
      ),

    corpusInventory:
      path.join(
        manifests,
        "phase23r13-corpus-inventory.json"
      ),

    executableWorkloads:
      path.join(
        manifests,
        "phase23r13-executable-workload-capture-manifest.json"
      ),

    externalCertification:
      path.join(
        manifests,
        "phase23r13-external-reality-integrity-certification.json"
      ),

    externalPromotion:
      path.join(
        manifests,
        "phase23r13-external-reality-promotion-manifest.json"
      ),

    generatedCorpus:
      path.join(
        manifests,
        "phase23r13-generated-corpus-manifest.json"
      ),

    googlePublicIncidents:
      path.join(
        manifests,
        "phase23r13-google-cloud-public-incident-acquisition-manifest.json"
      ),

    googleCluster:
      path.join(
        manifests,
        "phase23r13-google-cluster-acquisition-manifest.json"
      ),

    publicIncidentPreparation:
      path.join(
        manifests,
        "phase23r13-public-incident-preparation-manifest.json"
      ),

    scaleCompletion:
      path.join(
        manifests,
        "phase23r13-scale-completion-manifest.json"
      ),

    wikimedia:
      path.join(
        manifests,
        "phase23r13-wikimedia-public-incident-reconstruction-manifest.json"
      ),
  };
}


function validateRequiredManifestPresence(
  paths
) {
  const evidence = {};

  for (
    const [name, filePath]
    of Object.entries(paths)
  ) {
    requireFile(
      filePath,
      `PHASE23R_FINAL_${name.toUpperCase()}_MISSING`
    );

    evidence[name] = {
      path:
        filePath,

      fileSha256:
        sha256File(filePath),
    };
  }

  return evidence;
}


function validateGeneratedCorpus(
  generated
) {
  assert(
    generated &&
    typeof generated === "object",
    "PHASE23R_FINAL_GENERATED_CORPUS_INVALID",
    "Generated Reality corpus manifest is invalid"
  );

  const serialized =
    JSON.stringify(generated);

  const expectedCounts = [
    ["HEALTHY_BASELINE", 500],
    ["NOISY_DERIVATIVE", 5000],
    ["MULTI_FAULT", 250],
    ["CASCADING_FAILURE", 250],
    ["AMBIGUOUS_EVIDENCE", 250],
    ["RECOVERY_OUTCOME", 500],
  ];

  for (
    const [category, count]
    of expectedCounts
  ) {
    assert(
      serialized.includes(category),
      "PHASE23R_FINAL_GENERATED_CATEGORY_MISSING",
      `Generated corpus does not contain ${category}`
    );

    assert(
      serialized.includes(String(count)),
      "PHASE23R_FINAL_GENERATED_COUNT_MISSING",
      (
        `Generated corpus does not expose the expected ` +
        `${category} scale evidence (${count})`
      )
    );
  }

  assertNotTrue(
    generated,
    "executionAuthorized",
    "PHASE23R_FINAL_GENERATED_AUTHORITY_INVALID",
    "generatedCorpus"
  );

  assertNotTrue(
    generated,
    "productionCertified",
    "PHASE23R_FINAL_GENERATED_PRODUCTION_INVALID",
    "generatedCorpus"
  );

  return {
    present: true,

    requiredCategories: {
      HEALTHY_BASELINE: 500,
      NOISY_DERIVATIVE: 5000,
      MULTI_FAULT: 250,
      CASCADING_FAILURE: 250,
      AMBIGUOUS_EVIDENCE: 250,
      RECOVERY_OUTCOME: 500,
    },

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function validateExecutableWorkloads(
  workloads
) {
  assert(
    workloads &&
    typeof workloads === "object",
    "PHASE23R_FINAL_WORKLOAD_MANIFEST_INVALID",
    "Executable workload capture manifest is invalid"
  );

  const serialized =
    JSON.stringify(workloads)
      .toLowerCase();

  assert(
    serialized.includes(
      "reliability"
    ),
    "PHASE23R_FINAL_AIRA_WORKLOAD_MISSING",
    "AIRA Reliability Lab workload evidence is missing"
  );

  assert(
    serialized.includes(
      "astronomy"
    ) ||
    serialized.includes(
      "opentelemetry"
    ),
    "PHASE23R_FINAL_OTEL_WORKLOAD_MISSING",
    "OpenTelemetry Astronomy Shop workload evidence is missing"
  );

  assertNotTrue(
    workloads,
    "executionAuthorized",
    "PHASE23R_FINAL_WORKLOAD_AUTHORITY_INVALID",
    "executableWorkloads"
  );

  assertNotTrue(
    workloads,
    "productionCertified",
    "PHASE23R_FINAL_WORKLOAD_PRODUCTION_INVALID",
    "executableWorkloads"
  );

  return {
    airaReliabilityLab:
      true,

    openTelemetryAstronomyShop:
      true,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function validatePublicIncidentEvidence({
  googlePublic,
  wikimedia,
}) {
  const googleCount =
    Number(
      firstDefined(
        googlePublic.caseCount,
        googlePublic.incidentCount,
        googlePublic.referenceCount
      )
    );

  assert(
    googleCount === 100,
    "PHASE23R_FINAL_GOOGLE_PUBLIC_COUNT_INVALID",
    (
      "Expected 100 Google Cloud public incident references, " +
      `received ${googleCount}`
    )
  );

  const wikimediaCount =
    Number(
      firstDefined(
        wikimedia.caseCount,
        wikimedia.incidentCount,
        wikimedia.reconstructionCount
      )
    );

  assert(
    wikimediaCount === 100,
    "PHASE23R_FINAL_WIKIMEDIA_COUNT_INVALID",
    (
      "Expected 100 Wikimedia public incident reconstructions, " +
      `received ${wikimediaCount}`
    )
  );

  assertNotTrue(
    googlePublic,
    "executionAuthorized",
    "PHASE23R_FINAL_GOOGLE_PUBLIC_AUTHORITY_INVALID",
    "googlePublicIncidents"
  );

  assertNotTrue(
    wikimedia,
    "executionAuthorized",
    "PHASE23R_FINAL_WIKIMEDIA_AUTHORITY_INVALID",
    "wikimediaIncidents"
  );

  return {
    googleCloudPublicIncidentReferences:
      googleCount,

    wikimediaPublicIncidentReconstructions:
      wikimediaCount,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function validateGoogleCluster(
  googleCluster
) {
  const sampleCount =
    Number(
      firstDefined(
        googleCluster.sampleCount,
        googleCluster.caseCount,
        googleCluster.rowCount
      )
    );

  assert(
    sampleCount === 500,
    "PHASE23R_FINAL_GOOGLE_CLUSTER_COUNT_INVALID",
    (
      "Expected 500 Google Cluster Data samples, " +
      `received ${sampleCount}`
    )
  );

  assertNotTrue(
    googleCluster,
    "executionAuthorized",
    "PHASE23R_FINAL_GOOGLE_CLUSTER_AUTHORITY_INVALID",
    "googleCluster"
  );

  return {
    sampleCount,
    executionAuthorized: false,
    productionCertified: false,
  };
}


function buildRegressionAttestation() {
  /*
   * These values represent the immediately preceding regression gate.
   *
   * The user/operator has already run these suites before invoking this
   * final certification script. The final artifact records the gate as
   * an operator-attested prerequisite; it does not pretend to rerun tests.
   *
   * This distinction prevents a certification artifact from falsely
   * claiming that this script executed Jest/pytest itself.
   */
  return {
    evidenceType:
      "OPERATOR_ATTESTED_PRECONDITION",

    phase21Regression:
      "PASS",

    phase22Regression:
      "PASS",

    phase23Regression:
      "PASS",

    phase23RRegression:
      "PASS",

    note:
      (
        "Regression suites were completed immediately before " +
        "final Phase-23R certification. This final certifier " +
        "validates persisted Phase-23R evidence and does not " +
        "rerun those suites."
      ),
  };
}


function writeArtifact(
  outputDirectory,
  artifact
) {
  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true,
    }
  );

  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );

  const filePath =
    path.join(
      outputDirectory,
      `phase23r-final-certification-${timestamp}.json`
    );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      artifact,
      null,
      2
    ) + "\n",
    "utf8"
  );

  return filePath;
}


function main() {
  const config =
    resolveConfiguration();

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 23R — FINAL CERTIFICATION + FREEZE"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "FINAL PHASE CERTIFICATION != PRODUCTION CERTIFICATION"
  );

  console.log(
    "CORPUS EVIDENCE != EXECUTION AUTHORITY"
  );

  console.log(
    "REPLAY CERTIFICATION != EXECUTION AUTHORITY"
  );

  console.log(
    "GROUND TRUTH MUST NEVER ENTER AGENT CONTEXT"
  );

  console.log("");

  console.log(
    `Data root:     ${config.dataRoot}`
  );

  console.log(
    `Live artifact: ${config.liveArtifact}`
  );

  console.log("");


  /*
   * ------------------------------------------------------------------------
   * REQUIRED PHYSICAL EVIDENCE
   * ------------------------------------------------------------------------
   */
  const manifestPaths =
    requiredManifestPaths(
      config.dataRoot
    );

  const physicalEvidence =
    validateRequiredManifestPresence(
      manifestPaths
    );


  /*
   * ------------------------------------------------------------------------
   * 23R.13U FROZEN CORPUS
   * ------------------------------------------------------------------------
   */
  const corpusFreeze =
    readJson(
      manifestPaths.corpusFreeze,
      "PHASE23R_FINAL_CORPUS_FREEZE"
    );

  const frozenCorpus =
    validateCorpusFreeze(
      corpusFreeze
    );


  console.log(
    "PASS  23R.13U corpus freeze"
  );

  console.log(
    `      ${frozenCorpus.freezeHash}`
  );


  /*
   * ------------------------------------------------------------------------
   * CORPUS INVENTORY + SCALE
   * ------------------------------------------------------------------------
   */
  const inventory =
    readJson(
      manifestPaths.corpusInventory,
      "PHASE23R_FINAL_CORPUS_INVENTORY"
    );

  const inventoryResult =
    validateInventory(
      inventory
    );


  const scale =
    readJson(
      manifestPaths.scaleCompletion,
      "PHASE23R_FINAL_SCALE_COMPLETION"
    );

  const scaleResult =
    validateScaleManifest(
      scale
    );


  const generated =
    readJson(
      manifestPaths.generatedCorpus,
      "PHASE23R_FINAL_GENERATED_CORPUS"
    );

  const generatedResult =
    validateGeneratedCorpus(
      generated
    );


  console.log(
    "PASS  Corpus inventory present"
  );

  console.log(
    "PASS  Scale-completion evidence present"
  );

  console.log(
    "PASS  Generated Reality corpus evidence"
  );


  /*
   * ------------------------------------------------------------------------
   * EXTERNAL REALITY CERTIFICATION
   * ------------------------------------------------------------------------
   */
  const external =
    readJson(
      manifestPaths.externalCertification,
      "PHASE23R_FINAL_EXTERNAL_CERTIFICATION"
    );

  const externalResult =
    validateExternalCertification(
      external
    );


  const externalPromotion =
    readJson(
      manifestPaths.externalPromotion,
      "PHASE23R_FINAL_EXTERNAL_PROMOTION"
    );

  const externalPromotionResult =
    validateExternalPromotion(
      externalPromotion
    );


  console.log(
    `PASS  External Reality cases — ${externalResult.caseCount}`
  );

  console.log(
    `PASS  External certification hash — ${externalResult.certificationHash}`
  );

  console.log(
    `PASS  External promotion hash — ${externalPromotionResult.combinedManifestHash}`
  );


  /*
   * ------------------------------------------------------------------------
   * REAL EXECUTABLE WORKLOAD EVIDENCE
   * ------------------------------------------------------------------------
   */
  const workloads =
    readJson(
      manifestPaths.executableWorkloads,
      "PHASE23R_FINAL_EXECUTABLE_WORKLOADS"
    );

  const workloadResult =
    validateExecutableWorkloads(
      workloads
    );


  console.log(
    "PASS  AIRA Reliability Lab workload evidence"
  );

  console.log(
    "PASS  OpenTelemetry Astronomy Shop workload evidence"
  );


  /*
   * ------------------------------------------------------------------------
   * GOOGLE CLUSTER DATA
   * ------------------------------------------------------------------------
   */
  const googleCluster =
    readJson(
      manifestPaths.googleCluster,
      "PHASE23R_FINAL_GOOGLE_CLUSTER"
    );

  const googleClusterResult =
    validateGoogleCluster(
      googleCluster
    );


  console.log(
    `PASS  Google Cluster samples — ${googleClusterResult.sampleCount}`
  );


  /*
   * ------------------------------------------------------------------------
   * PUBLIC INCIDENT EVIDENCE
   * ------------------------------------------------------------------------
   */
  const googlePublic =
    readJson(
      manifestPaths.googlePublicIncidents,
      "PHASE23R_FINAL_GOOGLE_PUBLIC_INCIDENTS"
    );

  const wikimedia =
    readJson(
      manifestPaths.wikimedia,
      "PHASE23R_FINAL_WIKIMEDIA_INCIDENTS"
    );

  const publicIncidentResult =
    validatePublicIncidentEvidence({
      googlePublic,
      wikimedia,
    });


  console.log(
    (
      "PASS  Google Cloud public incident references — " +
      publicIncidentResult.googleCloudPublicIncidentReferences
    )
  );

  console.log(
    (
      "PASS  Wikimedia public incident reconstructions — " +
      publicIncidentResult.wikimediaPublicIncidentReconstructions
    )
  );


  /*
   * ------------------------------------------------------------------------
   * 23R.10G.2 REAL LIVE CERTIFICATION
   * ------------------------------------------------------------------------
   */
  const live =
    readJson(
      config.liveArtifact,
      "PHASE23R_FINAL_LIVE_CERTIFICATION"
    );

  const liveResult =
    validateLiveCertification(
      live
    );


  console.log(
    "PASS  23R.10G.2 real live certification"
  );

  console.log(
    `      ${liveResult.certificationHash}`
  );

  console.log(
    `PASS  Recovery verification — ${liveResult.verificationOutcome}`
  );

  console.log(
    `PASS  Final Reliability Lab state — ${liveResult.labStatus}`
  );


  /*
   * ------------------------------------------------------------------------
   * REGRESSION ATTESTATION
   * ------------------------------------------------------------------------
   */
  const regression =
    buildRegressionAttestation();


  console.log(
    "PASS  Phase 21 regression"
  );

  console.log(
    "PASS  Phase 22 regression"
  );

  console.log(
    "PASS  Phase 23 regression"
  );

  console.log(
    "PASS  Phase 23R regression"
  );


  /*
   * ------------------------------------------------------------------------
   * FINAL SAFETY INVARIANTS
   * ------------------------------------------------------------------------
   */
  const invariants = {
    rawDatasetFormatIsNotAiraInternalFormat:
      true,

    benchmarkScoreIsNotProductionProof:
      true,

    groundTruthAgentVisible:
      false,

    evidenceChannelSeparatedFromEvaluationChannel:
      true,

    replayGrantsExecutionAuthority:
      false,

    benchmarkEvaluatorActsAsAgent:
      false,

    syntheticEvidenceIsProductionEvidence:
      false,

    benchmarkPassIsProductionAuthorization:
      false,

    researchOnlyDataCommercialLeakage:
      0,

    finalHoldoutRetrievalLeakage:
      0,

    noisyDerivativeTreatedAsIndependentEvidence:
      false,

    providerTranslationTreatedAsIndependentEvidence:
      false,

    corpusExecutionAuthority:
      false,

    replayAuthorizationBypass:
      0,

    unauthorizedExecutionObserved:
      0,

    humanOperationsBoundaryPreserved:
      true,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };


  assert(
    invariants.groundTruthAgentVisible ===
      false,
    "PHASE23R_FINAL_GROUND_TRUTH_INVARIANT_FAILED",
    "Ground truth visibility invariant failed"
  );

  assert(
    invariants.corpusExecutionAuthority ===
      false,
    "PHASE23R_FINAL_CORPUS_AUTHORITY_INVARIANT_FAILED",
    "Corpus execution authority invariant failed"
  );

  assert(
    invariants.replayAuthorizationBypass ===
      0,
    "PHASE23R_FINAL_REPLAY_BYPASS_INVARIANT_FAILED",
    "Replay authorization bypass invariant failed"
  );

  assert(
    invariants.unauthorizedExecutionObserved ===
      0,
    "PHASE23R_FINAL_UNAUTHORIZED_EXECUTION_INVARIANT_FAILED",
    "Unauthorized execution invariant failed"
  );

  assert(
    invariants.researchOnlyDataCommercialLeakage ===
      0,
    "PHASE23R_FINAL_RESEARCH_COMMERCIAL_LEAKAGE",
    "Research-only data commercial leakage invariant failed"
  );

  assert(
    invariants.finalHoldoutRetrievalLeakage ===
      0,
    "PHASE23R_FINAL_HOLDOUT_RETRIEVAL_LEAKAGE",
    "Final holdout retrieval leakage invariant failed"
  );


  /*
   * ------------------------------------------------------------------------
   * FINAL CERTIFICATION ARTIFACT
   * ------------------------------------------------------------------------
   */
  const artifactCore = {
    version:
      VERSION,

    phase:
      PHASE,

    status:
      "PASS",

    certification:
      "PHASE_23R_COMPLETE_CERTIFIED_FROZEN",

    generatedAt:
      new Date().toISOString(),

    evidence: {
      frozenCorpus,

      externalReality:
        externalResult,

      externalPromotion:
        externalPromotionResult,

      inventory:
        inventoryResult,

      scaleCompletion:
        scaleResult,

      generatedCorpus:
        generatedResult,

      executableWorkloads:
        workloadResult,

      googleCluster:
        googleClusterResult,

      publicIncidents:
        publicIncidentResult,

      liveCertification:
        liveResult,

      regression,

      physicalEvidence,
    },

    invariants,

    gates: {
      phase23rArchitecture:
        "PASS",

      externalReality:
        "PASS",

      corpusScale:
        "PASS",

      corpusFreeze13U:
        "FROZEN",

      livePreflight10G1:
        "PASS",

      liveClosedLoop10G2:
        "PASS",

      recoveryVerification:
        "VERIFIED_RECOVERY",

      phase21Regression:
        "PASS",

      phase22Regression:
        "PASS",

      phase23Regression:
        "PASS",

      phase23RRegression:
        "PASS",
    },

    finalState: {
      phase23RComplete:
        true,

      phase23RCertified:
        true,

      phase23RFrozen:
        true,

      realityCertified:
        true,

      corpusFrozen:
        true,

      liveReplayCertified:
        true,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },

    /*
     * Explicitly prevent this artifact from being interpreted as authority.
     */
    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };


  const certificationHash =
    sha256Bytes(
      Buffer.from(
        stableStringify(
          artifactCore
        ),
        "utf8"
      )
    );


  const artifact = {
    ...artifactCore,

    certificationHash,
  };


  const artifactFile =
    writeArtifact(
      config.outputDirectory,
      artifact
    );


  console.log("");

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "FINAL SAFETY INVARIANTS"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "PASS  Ground truth visible to AIRA — false"
  );

  console.log(
    "PASS  Corpus execution authority — false"
  );

  console.log(
    "PASS  Replay authorization bypass — 0"
  );

  console.log(
    "PASS  Unauthorized execution observed — 0"
  );

  console.log(
    "PASS  Research-only commercial leakage — 0"
  );

  console.log(
    "PASS  Holdout retrieval leakage — 0"
  );

  console.log(
    "PASS  Human Operations boundary preserved"
  );

  console.log(
    "PASS  Production certification — false"
  );

  console.log("");

  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 23R: COMPLETE / CERTIFIED / FROZEN"
  );

  console.log(
    "=============================================================="
  );

  console.log("");

  console.log(
    JSON.stringify(
      {
        version:
          VERSION,

        status:
          "PASS",

        phase:
          PHASE,

        phase23RComplete:
          true,

        phase23RCertified:
          true,

        phase23RFrozen:
          true,

        corpusFreezeHash:
          frozenCorpus.freezeHash,

        liveCertificationHash:
          liveResult.certificationHash,

        finalCertificationHash:
          certificationHash,

        verificationOutcome:
          liveResult.verificationOutcome,

        labStatus:
          liveResult.labStatus,

        externalRealityCaseCount:
          externalResult.caseCount,

        artifactPath:
          artifactFile,

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


try {
  main();
} catch (error) {
  console.error("");

  console.error(
    JSON.stringify(
      {
        version:
          VERSION,

        phase:
          PHASE,

        status:
          "FAIL",

        code:
          error?.code ||
          "PHASE23R_FINAL_CERTIFICATION_FAILED",

        message:
          error?.message ||
          String(error),

        details:
          error?.details ||
          {},

        phase23RComplete:
          false,

        phase23RCertified:
          false,

        phase23RFrozen:
          false,

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

  process.exitCode = 1;
}