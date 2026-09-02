"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  REALITY_CONTRACT_VERSION,
  EVIDENCE_GRADE,
  EVIDENCE_GRADE_DEFINITION,
  REALITY_CASE_SOURCE_KIND,
  REALITY_ARTIFACT_KIND,
  REALITY_VISIBILITY,
  REALITY_ARCHITECTURE_INVARIANTS,
  isKnownEvidenceGrade,
  isKnownRealitySourceKind,
  isKnownRealityArtifactKind,
} =
  require(
    "../../constants/reality"
  );

const REALITY_ARCHITECTURE_CONTRACT =
  Object.freeze({
    contractVersion:
      REALITY_CONTRACT_VERSION,

    phase:
      "23R.0",

    name:
      "AIRA Reality Corpus + Replay Platform",

    purpose:
      "Normalize realistic incident evidence into replayable, independently evaluable cases without changing execution authority or Phase 23 human-control semantics.",

    authority:
      "REALITY_EVIDENCE_AND_REPLAY_MODEL_ONLY",

    canonicalMetadataAuthority:
      "POSTGRESQL",

    bulkEvidenceAuthority:
      "OBJECT_STORAGE",

    evidenceGrades:
      EVIDENCE_GRADE_DEFINITION,

    invariants:
      REALITY_ARCHITECTURE_INVARIANTS,

    executionAuthorized:
      false,

    productionProofGranted:
      false,
  });

const REQUIRED_REALITY_CASE_SECTIONS =
  Object.freeze([
    "identity",
    "scope",
    "provenance",
    "evidenceGrade",
    "workload",
    "timeline",
    "visibleEvidence",
    "sealedEvaluation",
    "safetyRestrictions",
    "evaluationRubric",
    "replayConfiguration",
    "artifacts",
    "sealing",
    "version",
  ]);

function validateRealityArchitectureContract(
  contract =
    REALITY_ARCHITECTURE_CONTRACT
) {
  if (
    !contract ||
    typeof contract !==
      "object"
  ) {
    return invalid(
      "CONTRACT_REQUIRED"
    );
  }

  if (
    contract.phase !==
    "23R.0"
  ) {
    return invalid(
      "PHASE_MUST_BE_23R_0"
    );
  }

  if (
    contract.authority !==
    "REALITY_EVIDENCE_AND_REPLAY_MODEL_ONLY"
  ) {
    return invalid(
      "INVALID_REALITY_AUTHORITY"
    );
  }

  if (
    contract
      .canonicalMetadataAuthority !==
    "POSTGRESQL"
  ) {
    return invalid(
      "POSTGRESQL_METADATA_AUTHORITY_REQUIRED"
    );
  }

  if (
    contract.executionAuthorized !==
    false
  ) {
    return invalid(
      "REALITY_PLATFORM_CANNOT_AUTHORIZE_EXECUTION"
    );
  }

  if (
    contract.productionProofGranted !==
    false
  ) {
    return invalid(
      "BENCHMARK_CANNOT_GRANT_PRODUCTION_PROOF"
    );
  }

  for (
    const [
      invariant,
      requiredValue,
    ] of Object.entries(
      REALITY_ARCHITECTURE_INVARIANTS
    )
  ) {
    if (
      contract
        .invariants
        ?.[invariant] !==
      requiredValue
    ) {
      return invalid(
        `MISSING_INVARIANT:${invariant}`
      );
    }
  }

  return {
    valid:
      true,

    contractVersion:
      contract.contractVersion,

    executionAuthorized:
      false,

    productionProofGranted:
      false,
  };
}

function assertRealityCaseContract(
  realityCase
) {
  if (
    !realityCase ||
    typeof realityCase !==
      "object" ||
    Array.isArray(
      realityCase
    )
  ) {
    throw realityContractError(
      "REALITY_CASE_REQUIRED",
      "RealityCase must be an object"
    );
  }

  for (
    const section
    of REQUIRED_REALITY_CASE_SECTIONS
  ) {
    if (
      realityCase[section] ===
      undefined ||
      realityCase[section] ===
      null
    ) {
      throw realityContractError(
        "REALITY_CASE_SECTION_REQUIRED",
        `${section} is required`,
        {
          field:
            section,
        }
      );
    }
  }

  assertIdentity(
    realityCase.identity
  );

  assertScope(
    realityCase.scope
  );

  assertProvenance(
    realityCase.provenance
  );

  if (
    !isKnownEvidenceGrade(
      realityCase.evidenceGrade
    )
  ) {
    throw realityContractError(
      "EVIDENCE_GRADE_INVALID",
      "RealityCase evidenceGrade is invalid",
      {
        field:
          "evidenceGrade",

        value:
          realityCase.evidenceGrade,
      }
    );
  }

  requirePlainObject(
    realityCase.workload,
    "workload"
  );

  assertTimeline(
    realityCase.timeline
  );

  assertVisibleEvidence(
    realityCase.visibleEvidence
  );

  assertSealedEvaluation(
    realityCase.sealedEvaluation
  );

  requireArray(
    realityCase.safetyRestrictions,
    "safetyRestrictions"
  );

  requirePlainObject(
    realityCase.evaluationRubric,
    "evaluationRubric"
  );

  assertReplayConfiguration(
    realityCase.replayConfiguration
  );

  assertArtifacts(
    realityCase.artifacts
  );

  assertSealing(
    realityCase.sealing
  );

  assertVersion(
    realityCase.version
  );

  if (
    realityCase.executionAuthorized ===
    true
  ) {
    throw realityContractError(
      "REALITY_CASE_CANNOT_AUTHORIZE_EXECUTION",
      "RealityCase metadata cannot grant execution authorization"
    );
  }

  return {
    valid:
      true,

    caseId:
      realityCase
        .identity
        .caseId,

    evidenceGrade:
      realityCase
        .evidenceGrade,

    executionAuthorized:
      false,
  };
}

function createRealityCaseDigest(
  realityCase
) {
  assertRealityCaseContract(
    realityCase
  );

  const hashable =
    {
      ...realityCase,

      version:
        {
          ...realityCase.version,

          contentHash:
            null,
        },
    };

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      stableStringify(
        hashable
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}

function hasValidRealityCaseDigest(
  realityCase
) {
  const expected =
    realityCase
      ?.version
      ?.contentHash;

  if (
    typeof expected !==
      "string" ||
    !/^[a-f0-9]{64}$/i.test(
      expected
    )
  ) {
    return false;
  }

  return timingSafeEqualHex(
    expected,
    createRealityCaseDigest(
      realityCase
    )
  );
}

function assertIdentity(
  identity
) {
  requirePlainObject(
    identity,
    "identity"
  );

  requireNonEmptyString(
    identity.caseId,
    "identity.caseId"
  );

  requireNonEmptyString(
    identity.title,
    "identity.title"
  );
}

function assertScope(
  scope
) {
  requirePlainObject(
    scope,
    "scope"
  );

  requireNonEmptyString(
    scope.organizationId,
    "scope.organizationId"
  );

  requireNonEmptyString(
    scope.environmentId,
    "scope.environmentId"
  );
}

function assertProvenance(
  provenance
) {
  requirePlainObject(
    provenance,
    "provenance"
  );

  if (
    !isKnownRealitySourceKind(
      provenance.sourceKind
    )
  ) {
    throw realityContractError(
      "REALITY_SOURCE_KIND_INVALID",
      "provenance.sourceKind is invalid",
      {
        field:
          "provenance.sourceKind",

        value:
          provenance.sourceKind,
      }
    );
  }

  requireNonEmptyString(
    provenance.sourceName,
    "provenance.sourceName"
  );

  requireNonEmptyString(
    provenance.sourceVersion,
    "provenance.sourceVersion"
  );

  requireNonEmptyString(
    provenance.license,
    "provenance.license"
  );

  requireNonEmptyString(
    provenance.groundTruthMethod,
    "provenance.groundTruthMethod"
  );

  requireBoolean(
    provenance.modified,
    "provenance.modified"
  );
}

function assertTimeline(
  timeline
) {
  requireArray(
    timeline,
    "timeline"
  );

  let previousOffset =
    -1;

  for (
    let index = 0;
    index < timeline.length;
    index += 1
  ) {
    const event =
      timeline[index];

    requirePlainObject(
      event,
      `timeline[${index}]`
    );

    requireNonEmptyString(
      event.eventId,
      `timeline[${index}].eventId`
    );

    requireInteger(
      event.offsetMs,
      `timeline[${index}].offsetMs`,
      0
    );

    if (
      event.offsetMs <
      previousOffset
    ) {
      throw realityContractError(
        "REALITY_TIMELINE_NOT_ORDERED",
        "RealityCase timeline must be ordered by offsetMs",
        {
          field:
            `timeline[${index}].offsetMs`,
        }
      );
    }

    previousOffset =
      event.offsetMs;

    requireNonEmptyString(
      event.kind,
      `timeline[${index}].kind`
    );
  }
}

function assertVisibleEvidence(
  visibleEvidence
) {
  requirePlainObject(
    visibleEvidence,
    "visibleEvidence"
  );

  for (
    const field
    of [
      "signals",
      "metrics",
      "logs",
      "traces",
      "topology",
      "resourceStates",
    ]
  ) {
    requireArray(
      visibleEvidence[field],
      `visibleEvidence.${field}`
    );
  }
}

function assertSealedEvaluation(
  sealedEvaluation
) {
  requirePlainObject(
    sealedEvaluation,
    "sealedEvaluation"
  );

  requireNonEmptyString(
    sealedEvaluation.knownFault,
    "sealedEvaluation.knownFault"
  );

  requireNonEmptyString(
    sealedEvaluation.expectedDiagnosis,
    "sealedEvaluation.expectedDiagnosis"
  );

  requireArray(
    sealedEvaluation.acceptableDiagnoses,
    "sealedEvaluation.acceptableDiagnoses"
  );

  requireNonEmptyString(
    sealedEvaluation.expectedRecoveryFamily,
    "sealedEvaluation.expectedRecoveryFamily"
  );
}

function assertReplayConfiguration(
  replayConfiguration
) {
  requirePlainObject(
    replayConfiguration,
    "replayConfiguration"
  );

  requireInteger(
    replayConfiguration.seed,
    "replayConfiguration.seed",
    0
  );

  requirePositiveNumber(
    replayConfiguration.speedMultiplier,
    "replayConfiguration.speedMultiplier"
  );

  requireBoolean(
    replayConfiguration.deterministicTimestamps,
    "replayConfiguration.deterministicTimestamps"
  );
}

function assertArtifacts(
  artifacts
) {
  requireArray(
    artifacts,
    "artifacts"
  );

  for (
    let index = 0;
    index < artifacts.length;
    index += 1
  ) {
    const artifact =
      artifacts[index];

    requirePlainObject(
      artifact,
      `artifacts[${index}]`
    );

    requireNonEmptyString(
      artifact.artifactId,
      `artifacts[${index}].artifactId`
    );

    if (
      !isKnownRealityArtifactKind(
        artifact.kind
      )
    ) {
      throw realityContractError(
        "REALITY_ARTIFACT_KIND_INVALID",
        "RealityCase artifact kind is invalid",
        {
          field:
            `artifacts[${index}].kind`,

          value:
            artifact.kind,
        }
      );
    }

    requireNonEmptyString(
      artifact.contentHash,
      `artifacts[${index}].contentHash`
    );
  }
}

function assertSealing(
  sealing
) {
  requirePlainObject(
    sealing,
    "sealing"
  );

  if (
    sealing.evidenceVisibility !==
    REALITY_VISIBILITY.EVIDENCE
  ) {
    throw realityContractError(
      "EVIDENCE_VISIBILITY_INVALID",
      "Visible evidence must use the EVIDENCE channel"
    );
  }

  if (
    sealing.evaluationVisibility !==
    REALITY_VISIBILITY.SEALED_EVALUATION
  ) {
    throw realityContractError(
      "SEALED_EVALUATION_VISIBILITY_INVALID",
      "Ground truth must use the SEALED_EVALUATION channel"
    );
  }

  if (
    sealing.groundTruthAgentVisible !==
    false
  ) {
    throw realityContractError(
      "GROUND_TRUTH_AGENT_VISIBILITY_FORBIDDEN",
      "Ground truth must never enter AIRA agent context"
    );
  }
}

function assertVersion(
  version
) {
  requirePlainObject(
    version,
    "version"
  );

  requireInteger(
    version.revision,
    "version.revision",
    1
  );

  if (
    version.contentHash !==
    null &&
    version.contentHash !==
    undefined &&
    !/^[a-f0-9]{64}$/i.test(
      version.contentHash
    )
  ) {
    throw realityContractError(
      "REALITY_CASE_HASH_INVALID",
      "version.contentHash must be a SHA-256 hex digest or null"
    );
  }
}

function stableStringify(
  value
) {
  if (
    value ===
    null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return `[${value
      .map(
        stableStringify
      )
      .join(
        ","
      )}]`;
  }

  const keys =
    Object.keys(
      value
    ).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )
    .join(
      ","
    )}}`;
}

function timingSafeEqualHex(
  left,
  right
) {
  const leftBuffer =
    Buffer.from(
      left.toLowerCase(),
      "hex"
    );

  const rightBuffer =
    Buffer.from(
      right.toLowerCase(),
      "hex"
    );

  return (
    leftBuffer.length ===
      rightBuffer.length &&
    crypto.timingSafeEqual(
      leftBuffer,
      rightBuffer
    )
  );
}

function requirePlainObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw realityContractError(
      "REALITY_OBJECT_REQUIRED",
      `${field} must be an object`,
      {
        field,
      }
    );
  }
}

function requireArray(
  value,
  field
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    throw realityContractError(
      "REALITY_ARRAY_REQUIRED",
      `${field} must be an array`,
      {
        field,
      }
    );
  }
}

function requireNonEmptyString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw realityContractError(
      "REALITY_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}

function requireBoolean(
  value,
  field
) {
  if (
    typeof value !==
      "boolean"
  ) {
    throw realityContractError(
      "REALITY_BOOLEAN_REQUIRED",
      `${field} must be boolean`,
      {
        field,
      }
    );
  }
}

function requireInteger(
  value,
  field,
  minimum
) {
  if (
    !Number.isInteger(
      value
    ) ||
    value < minimum
  ) {
    throw realityContractError(
      "REALITY_INTEGER_INVALID",
      `${field} must be an integer >= ${minimum}`,
      {
        field,
      }
    );
  }
}

function requirePositiveNumber(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value
    ) ||
    value <= 0
  ) {
    throw realityContractError(
      "REALITY_POSITIVE_NUMBER_REQUIRED",
      `${field} must be a positive finite number`,
      {
        field,
      }
    );
  }
}

function invalid(
  reason
) {
  return {
    valid:
      false,

    reason,

    executionAuthorized:
      false,

    productionProofGranted:
      false,
  };
}

function realityContractError(
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
        "RealityCaseContractError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}

module.exports = {
  EVIDENCE_GRADE,
  REALITY_CASE_SOURCE_KIND,
  REALITY_ARTIFACT_KIND,
  REALITY_VISIBILITY,
  REALITY_ARCHITECTURE_INVARIANTS,
  REALITY_ARCHITECTURE_CONTRACT,
  REQUIRED_REALITY_CASE_SECTIONS,
  validateRealityArchitectureContract,
  assertRealityCaseContract,
  createRealityCaseDigest,
  hasValidRealityCaseDigest,
  stableStringify,
  realityContractError,
};