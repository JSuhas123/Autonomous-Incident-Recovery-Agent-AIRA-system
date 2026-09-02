from __future__ import annotations

import base64
import hashlib
import json
from typing import Any, Dict, Iterable, List, Mapping, Optional


NORMALIZATION_VERSION = "23R.3.0"


# ============================================================
# CANONICAL PHASE 23R EVIDENCE MODEL
# ============================================================
#
# E0 — Synthetic
# E1 — Controlled AIRA Lab
# E2 — Independent External Benchmark
# E3 — Reconstructed Production Incident
# E4 — Customer Shadow Incident
# E5 — Human-approved Production Recovery
# E6 — Verified Autonomous Production Recovery
#
# Evidence grade describes evidentiary origin/credibility.
#
# Evidence grade never grants execution authority.
# Benchmark success never grants production authority.
# Ground truth remains sealed from the agent.
# ============================================================


EVIDENCE_GRADES = {
    "E0",
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "E6",
}


EVIDENCE_GRADE_DEFINITIONS = {
    "E0": {
        "key":
            "SYNTHETIC",

        "label":
            "Synthetic",
    },

    "E1": {
        "key":
            "CONTROLLED_AIRA_LAB",

        "label":
            "Controlled AIRA Lab",
    },

    "E2": {
        "key":
            "INDEPENDENT_EXTERNAL_BENCHMARK",

        "label":
            "Independent External Benchmark",
    },

    "E3": {
        "key":
            "RECONSTRUCTED_PRODUCTION_INCIDENT",

        "label":
            "Reconstructed Production Incident",
    },

    "E4": {
        "key":
            "CUSTOMER_SHADOW_INCIDENT",

        "label":
            "Customer Shadow Incident",
    },

    "E5": {
        "key":
            "HUMAN_APPROVED_PRODUCTION_RECOVERY",

        "label":
            "Human-approved Production Recovery",
    },

    "E6": {
        "key":
            "VERIFIED_AUTONOMOUS_PRODUCTION_RECOVERY",

        "label":
            "Verified Autonomous Production Recovery",
    },
}


SOURCE_KINDS = {
    "SYNTHETIC",
    "GENERATED_SIMULATION",
    "AIRA_LAB",
    "EXTERNAL_BENCHMARK",
    "PUBLIC_INCIDENT_RECONSTRUCTION",
    "CUSTOMER_SHADOW",
    "HUMAN_APPROVED_PRODUCTION",
    "VERIFIED_PRODUCTION",
}


SOURCE_KIND_ALLOWED_EVIDENCE_GRADES = {
    "SYNTHETIC": {
        "E0",
    },

    "GENERATED_SIMULATION": {
        "E0",
    },

    "AIRA_LAB": {
        "E1",
    },

    "EXTERNAL_BENCHMARK": {
        "E2",
    },

    "PUBLIC_INCIDENT_RECONSTRUCTION": {
        "E3",
    },

    "CUSTOMER_SHADOW": {
        "E4",
    },

    "HUMAN_APPROVED_PRODUCTION": {
        "E5",
    },

    "VERIFIED_PRODUCTION": {
        "E6",
    },
}


ARTIFACT_KINDS = {
    "SIGNAL",
    "METRIC",
    "LOG",
    "TRACE",
    "TOPOLOGY",
    "RESOURCE_STATE",
    "MANIFEST",
    "DATASET_BUNDLE",
    "POSTMORTEM",
    "REPLAY_OUTPUT",
    "CERTIFICATION_EVIDENCE",
}


# ============================================================
# 23R.3-COMPATIBLE VISIBLE EVIDENCE MAP
# ============================================================
#
# IMPORTANT:
#
# Existing Phase 23R.3 adapters call:
#
#     VISIBLE_EVIDENCE_BUCKETS.get(kind)
#
# Therefore this must remain a mapping, not a set/frozenset.
# ============================================================


VISIBLE_EVIDENCE_BUCKETS = {
    "SIGNAL":
        "signals",

    "METRIC":
        "metrics",

    "LOG":
        "logs",

    "TRACE":
        "traces",

    "TOPOLOGY":
        "topology",

    "RESOURCE_STATE":
        "resourceStates",
}


VISIBLE_BUCKET_BY_ARTIFACT_KIND = (
    VISIBLE_EVIDENCE_BUCKETS
)


SEALED_FIELD_NAMES = {
    "sealedEvaluation",
    "evaluationRubric",
    "groundTruth",
    "knownFault",
    "expectedDiagnosis",
    "acceptableDiagnoses",
    "expectedRecoveryFamily",
    "rootCause",
}


# ============================================================
# ERROR TYPE
# ============================================================


class RealityNormalizationError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: Optional[Mapping[str, Any]] = None,
    ) -> None:
        super().__init__(
            message
        )

        self.code = code

        self.details = dict(
            details or {}
        )

        self.execution_authorized = False


# ============================================================
# HASH / CANONICAL JSON HELPERS
# ============================================================


def canonical_json(
    value: Any,
) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(
            ",",
            ":",
        ),
        sort_keys=True,
    )


def sha256_bytes(
    value: bytes,
) -> str:
    if not isinstance(
        value,
        bytes,
    ):
        raise RealityNormalizationError(
            "REALITY_SHA256_BYTES_REQUIRED",
            "sha256_bytes requires bytes",
        )

    return hashlib.sha256(
        value
    ).hexdigest()


def sha256_json(
    value: Any,
) -> str:
    return hashlib.sha256(
        canonical_json(
            value
        ).encode(
            "utf-8"
        )
    ).hexdigest()


def sha256_hex(
    value: Any,
) -> str:
    if isinstance(
        value,
        bytes,
    ):
        return sha256_bytes(
            value
        )

    if isinstance(
        value,
        str,
    ):
        return hashlib.sha256(
            value.encode(
                "utf-8"
            )
        ).hexdigest()

    return sha256_json(
        value
    )


# ============================================================
# GENERIC VALIDATION HELPERS
# ============================================================


def require_string(
    value: Any,
    field: str,
) -> str:
    if not isinstance(
        value,
        str,
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_STRING_REQUIRED",
            (
                f"{field} must be a "
                "non-empty string"
            ),
        )

    normalized = value.strip()

    if not normalized:
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_STRING_REQUIRED",
            (
                f"{field} must be a "
                "non-empty string"
            ),
        )

    return normalized


def require_non_empty_string(
    value: Any,
    field: str,
) -> str:
    return require_string(
        value,
        field,
    )


def require_mapping(
    value: Any,
    field: str,
) -> Dict[str, Any]:
    if not isinstance(
        value,
        Mapping,
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_OBJECT_REQUIRED",
            (
                f"{field} must be an object"
            ),
        )

    return dict(
        value
    )


def require_object(
    value: Any,
    field: str,
) -> Dict[str, Any]:
    return require_mapping(
        value,
        field,
    )


def require_list(
    value: Any,
    field: str,
) -> List[Any]:
    if not isinstance(
        value,
        list,
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_ARRAY_REQUIRED",
            (
                f"{field} must be an array"
            ),
        )

    return list(
        value
    )


def require_array(
    value: Any,
    field: str,
) -> List[Any]:
    return require_list(
        value,
        field,
    )


def require_boolean(
    value: Any,
    field: str,
) -> bool:
    if not isinstance(
        value,
        bool,
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_BOOLEAN_REQUIRED",
            (
                f"{field} must be a boolean"
            ),
        )

    return value


def require_nonnegative_int(
    value: Any,
    field: str,
) -> int:
    if (
        isinstance(
            value,
            bool,
        )
        or
        not isinstance(
            value,
            int,
        )
        or
        value < 0
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_NONNEGATIVE_INTEGER_REQUIRED",
            (
                f"{field} must be a "
                "non-negative integer"
            ),
        )

    return value


def require_non_negative_integer(
    value: Any,
    field: str,
) -> int:
    return require_nonnegative_int(
        value,
        field,
    )


def require_positive_number(
    value: Any,
    field: str,
) -> float:
    if (
        isinstance(
            value,
            bool,
        )
        or
        not isinstance(
            value,
            (
                int,
                float,
            ),
        )
        or
        value <= 0
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_POSITIVE_NUMBER_REQUIRED",
            (
                f"{field} must be a "
                "positive number"
            ),
        )

    return float(
        value
    )


# ============================================================
# SOURCE / EVIDENCE VALIDATION
# ============================================================


def require_evidence_grade(
    value: Any,
) -> str:
    grade = require_string(
        value,
        "evidenceGrade",
    )

    if grade not in EVIDENCE_GRADES:
        raise RealityNormalizationError(
            "REALITY_EVIDENCE_GRADE_UNKNOWN",
            (
                "Unknown evidence grade: "
                f"{grade}"
            ),
        )

    return grade


def require_source_kind(
    value: Any,
) -> str:
    source_kind = require_string(
        value,
        "sourceKind",
    )

    if source_kind not in SOURCE_KINDS:
        raise RealityNormalizationError(
            "REALITY_SOURCE_KIND_UNKNOWN",
            (
                "Unknown reality source kind: "
                f"{source_kind}"
            ),
        )

    return source_kind


def validate_source_grade_compatibility(
    source_kind: str,
    evidence_grade: str,
) -> None:
    allowed = (
        SOURCE_KIND_ALLOWED_EVIDENCE_GRADES
        .get(
            source_kind,
            set(),
        )
    )

    if evidence_grade not in allowed:
        raise RealityNormalizationError(
            "REALITY_EVIDENCE_GRADE_SOURCE_MISMATCH",
            (
                f"Evidence grade {evidence_grade} "
                "is not compatible with source "
                f"kind {source_kind}"
            ),
            details={
                "sourceKind":
                    source_kind,

                "evidenceGrade":
                    evidence_grade,
            },
        )


# ============================================================
# SEALED FIELD PROTECTION
# ============================================================


def ensure_no_sealed_fields(
    value: Any,
    field: str = "visible",
) -> None:
    if isinstance(
        value,
        Mapping,
    ):
        for (
            key,
            child,
        ) in value.items():
            if key in SEALED_FIELD_NAMES:
                raise RealityNormalizationError(
                    "REALITY_RAW_GROUND_TRUTH_LEAKAGE",
                    (
                        "Agent-visible normalized "
                        "evidence contains sealed "
                        f"field {field}.{key}"
                    ),
                )

            ensure_no_sealed_fields(
                child,
                (
                    f"{field}.{key}"
                ),
            )

    elif isinstance(
        value,
        list,
    ):
        for (
            index,
            child,
        ) in enumerate(
            value
        ):
            ensure_no_sealed_fields(
                child,
                (
                    f"{field}[{index}]"
                ),
            )


def assert_no_sealed_fields(
    value: Any,
    *,
    path: str = "visible",
) -> None:
    ensure_no_sealed_fields(
        value,
        path,
    )


# ============================================================
# SOURCE IDENTITY
# ============================================================


def deterministic_source_public_id(
    source: Mapping[str, Any],
) -> str:
    normalized_source = require_mapping(
        source,
        "source",
    )

    digest = sha256_json(
        normalized_source
    )

    return (
        "reality_source_" +
        digest[
            :24
        ]
    )


def stable_source_public_id(
    source_kind: str,
    source_name: str,
    source_reference: str,
) -> str:
    return deterministic_source_public_id(
        {
            "sourceKind":
                source_kind,

            "sourceName":
                source_name,

            "sourceReference":
                source_reference,
        }
    )


# ============================================================
# ARTIFACT CONTENT
# ============================================================


def decode_artifact_content(
    artifact: Mapping[str, Any],
    field: Any = "artifact",
) -> bytes:
    artifact_mapping = require_mapping(
        artifact,
        str(
            field
        ),
    )

    has_content = (
        "content"
        in artifact_mapping
    )

    has_content_base64 = (
        "contentBase64"
        in artifact_mapping
    )

    if (
        has_content
        ==
        has_content_base64
    ):
        raise RealityNormalizationError(
            "REALITY_ARTIFACT_CONTENT_INVALID",
            (
                f"{field} must contain exactly "
                "one of content or contentBase64"
            ),
        )

    if has_content:
        content = artifact_mapping[
            "content"
        ]

        if not isinstance(
            content,
            str,
        ):
            raise RealityNormalizationError(
                "REALITY_ARTIFACT_CONTENT_INVALID",
                (
                    f"{field}.content must be "
                    "a string"
                ),
            )

        return content.encode(
            "utf-8"
        )

    encoded = artifact_mapping[
        "contentBase64"
    ]

    if not isinstance(
        encoded,
        str,
    ):
        raise RealityNormalizationError(
            "REALITY_ARTIFACT_CONTENT_INVALID",
            (
                f"{field}.contentBase64 must "
                "be a string"
            ),
        )

    try:
        return base64.b64decode(
            encoded,
            validate=True,
        )

    except Exception as exc:
        raise RealityNormalizationError(
            "REALITY_ARTIFACT_BASE64_INVALID",
            (
                f"{field}.contentBase64 is "
                "invalid base64"
            ),
        ) from exc


# ============================================================
# TIMELINE NORMALIZATION
# ============================================================


def normalize_timeline(
    timeline: Iterable[Any],
    artifact_ids: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    normalized: List[
        Dict[str, Any]
    ] = []

    seen_event_ids: set[
        str
    ] = set()

    for (
        index,
        raw_event,
    ) in enumerate(
        timeline
    ):
        field = (
            f"timeline[{index}]"
        )

        event = require_mapping(
            raw_event,
            field,
        )

        ensure_no_sealed_fields(
            event,
            field,
        )

        event_id = require_string(
            event.get(
                "eventId"
            ),
            (
                f"{field}.eventId"
            ),
        )

        if event_id in seen_event_ids:
            raise RealityNormalizationError(
                "REALITY_TIMELINE_EVENT_DUPLICATE",
                (
                    "Duplicate timeline "
                    f"eventId: {event_id}"
                ),
            )

        seen_event_ids.add(
            event_id
        )

        offset_ms = (
            require_nonnegative_int(
                event.get(
                    "offsetMs"
                ),
                (
                    f"{field}.offsetMs"
                ),
            )
        )

        artifact_id = event.get(
            "artifactId"
        )

        normalized_event = {
            **event,

            "eventId":
                event_id,

            "offsetMs":
                offset_ms,
        }

        if artifact_id is not None:
            artifact_id = require_string(
                artifact_id,
                (
                    f"{field}.artifactId"
                ),
            )

            if (
                artifact_ids
                is not None
                and
                artifact_id
                not in artifact_ids
            ):
                raise RealityNormalizationError(
                    "REALITY_TIMELINE_ARTIFACT_UNKNOWN",
                    (
                        f"{field} references "
                        "unknown artifactId "
                        f"{artifact_id}"
                    ),
                )

            normalized_event[
                "artifactId"
            ] = artifact_id

        normalized.append(
            normalized_event
        )

    normalized.sort(
        key=lambda item: (
            item[
                "offsetMs"
            ],

            item[
                "eventId"
            ],
        )
    )

    return normalized


# ============================================================
# GENERIC ARTIFACT NORMALIZATION
# ============================================================


def normalize_artifacts(
    raw_artifacts: Iterable[Any],
) -> List[Dict[str, Any]]:
    normalized: List[
        Dict[str, Any]
    ] = []

    seen_ids: set[
        str
    ] = set()

    for (
        index,
        raw_artifact,
    ) in enumerate(
        raw_artifacts
    ):
        field = (
            f"artifacts[{index}]"
        )

        artifact = require_mapping(
            raw_artifact,
            field,
        )

        ensure_no_sealed_fields(
            artifact,
            field,
        )

        artifact_id = require_string(
            artifact.get(
                "artifactId"
            ),
            (
                f"{field}.artifactId"
            ),
        )

        if artifact_id in seen_ids:
            raise RealityNormalizationError(
                "REALITY_ARTIFACT_DUPLICATE",
                (
                    "Duplicate artifactId: "
                    f"{artifact_id}"
                ),
            )

        seen_ids.add(
            artifact_id
        )

        artifact_kind = artifact.get(
            "artifactKind",
            artifact.get(
                "kind"
            ),
        )

        artifact_kind = require_string(
            artifact_kind,
            (
                f"{field}.artifactKind"
            ),
        )

        if artifact_kind not in ARTIFACT_KINDS:
            raise RealityNormalizationError(
                "REALITY_ARTIFACT_KIND_UNKNOWN",
                (
                    "Unknown artifact kind "
                    f"{artifact_kind}"
                ),
            )

        channel = artifact.get(
            "channel",
            "EVIDENCE",
        )

        if channel != "EVIDENCE":
            raise RealityNormalizationError(
                "REALITY_INGESTION_ARTIFACT_CHANNEL_FORBIDDEN",
                (
                    "Dataset normalization may "
                    "only emit EVIDENCE artifacts"
                ),
            )

        body = decode_artifact_content(
            artifact,
            field,
        )

        content_hash = sha256_bytes(
            body
        )

        media_type = require_string(
            artifact.get(
                "mediaType",
                "application/octet-stream",
            ),
            (
                f"{field}.mediaType"
            ),
        )

        provenance = require_mapping(
            artifact.get(
                "provenance",
                {},
            ),
            (
                f"{field}.provenance"
            ),
        )

        ensure_no_sealed_fields(
            provenance,
            (
                f"{field}.provenance"
            ),
        )

        normalized.append(
            {
                "artifactId":
                    artifact_id,

                "artifactKind":
                    artifact_kind,

                "kind":
                    artifact_kind,

                "channel":
                    "EVIDENCE",

                "mediaType":
                    media_type,

                "contentBase64":
                    base64.b64encode(
                        body
                    ).decode(
                        "ascii"
                    ),

                "contentHash":
                    content_hash,

                "byteSize":
                    len(
                        body
                    ),

                "provenance":
                    provenance,

                "trustedGroundTruth":
                    False,

                "executionAuthorized":
                    False,
            }
        )

    normalized.sort(
        key=lambda item:
            item[
                "artifactId"
            ]
    )

    return normalized


# ============================================================
# VISIBLE EVIDENCE
# ============================================================


def build_visible_evidence(
    artifacts: Iterable[Mapping[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    visible: Dict[
        str,
        List[Dict[str, Any]],
    ] = {
        "signals":
            [],

        "metrics":
            [],

        "logs":
            [],

        "traces":
            [],

        "topology":
            [],

        "resourceStates":
            [],
    }

    for artifact in artifacts:
        kind = artifact.get(
            "artifactKind",
            artifact.get(
                "kind"
            ),
        )

        bucket = (
            VISIBLE_EVIDENCE_BUCKETS
            .get(
                kind
            )
        )

        if not bucket:
            continue

        visible[
            bucket
        ].append(
            {
                "artifactId":
                    artifact[
                        "artifactId"
                    ],

                "kind":
                    kind,

                "contentHash":
                    artifact[
                        "contentHash"
                    ],

                "mediaType":
                    artifact[
                        "mediaType"
                    ],

                "byteSize":
                    artifact[
                        "byteSize"
                    ],
            }
        )

    for values in visible.values():
        values.sort(
            key=lambda item:
                item[
                    "artifactId"
                ]
        )

    return visible


# ============================================================
# CANONICAL REALITY CASE BUILDER
# ============================================================


def build_reality_case(
    *,
    case_id: str,
    title: str,
    source_kind: str,
    evidence_grade: str,
    environment: Mapping[str, Any],
    workload: Mapping[str, Any],
    timeline: List[Dict[str, Any]],
    artifacts: List[Dict[str, Any]],
    provenance: Mapping[str, Any],
    license_info: Mapping[str, Any],
    sealed_evaluation: Mapping[str, Any],
) -> Dict[str, Any]:
    validate_source_grade_compatibility(
        source_kind,
        evidence_grade,
    )

    visible_evidence = build_visible_evidence(
        artifacts
    )

    reality_case = {
        "contractVersion":
            NORMALIZATION_VERSION,

        "identity": {
            "caseId":
                case_id,

            "title":
                title,
        },

        "classification": {
            "sourceKind":
                source_kind,

            "evidenceGrade":
                evidence_grade,

            "evidenceGradeKey":
                (
                    EVIDENCE_GRADE_DEFINITIONS[
                        evidence_grade
                    ][
                        "key"
                    ]
                ),
        },

        "environment":
            dict(
                environment
            ),

        "workload":
            dict(
                workload
            ),

        "timeline":
            timeline,

        "visibleEvidence":
            visible_evidence,

        "provenance":
            dict(
                provenance
            ),

        "license":
            dict(
                license_info
            ),

        "sealedEvaluation":
            dict(
                sealed_evaluation
            ),

        "executionAuthorized":
            False,

        "productionProofGranted":
            False,
    }

    assert_no_sealed_fields(
        {
            "identity":
                reality_case[
                    "identity"
                ],

            "classification":
                reality_case[
                    "classification"
                ],

            "environment":
                reality_case[
                    "environment"
                ],

            "workload":
                reality_case[
                    "workload"
                ],

            "timeline":
                reality_case[
                    "timeline"
                ],

            "visibleEvidence":
                reality_case[
                    "visibleEvidence"
                ],

            "provenance":
                reality_case[
                    "provenance"
                ],

            "license":
                reality_case[
                    "license"
                ],
        },
        path=
            "RealityCase",
    )

    return reality_case


# ============================================================
# OPTIONAL DIRECT CANONICAL-BUNDLE NORMALIZER
# ============================================================


def normalize_case_bundle(
    raw: Mapping[str, Any],
) -> Dict[str, Any]:
    raw_case = require_mapping(
        raw,
        "raw",
    )

    source = require_mapping(
        raw_case.get(
            "source"
        ),
        "source",
    )

    source_kind = require_source_kind(
        source.get(
            "sourceKind"
        )
    )

    evidence_grade = require_evidence_grade(
        raw_case.get(
            "evidenceGrade"
        )
    )

    validate_source_grade_compatibility(
        source_kind,
        evidence_grade,
    )

    source_name = require_string(
        source.get(
            "name",
            source.get(
                "sourceName"
            ),
        ),
        "source.name",
    )

    source_reference = require_string(
        source.get(
            "reference",
            source.get(
                "sourceUri",
                source.get(
                    "sourceVersion",
                    "unknown"
                ),
            ),
        ),
        "source.reference",
    )

    case_id = require_string(
        raw_case.get(
            "caseId"
        ),
        "caseId",
    )

    title = require_string(
        raw_case.get(
            "title"
        ),
        "title",
    )

    environment = require_mapping(
        raw_case.get(
            "environment",
            {},
        ),
        "environment",
    )

    workload = require_mapping(
        raw_case.get(
            "workload",
            {},
        ),
        "workload",
    )

    provenance = require_mapping(
        raw_case.get(
            "provenance",
            {},
        ),
        "provenance",
    )

    license_info = require_mapping(
        raw_case.get(
            "license",
            {},
        ),
        "license",
    )

    sealed_evaluation = require_mapping(
        raw_case.get(
            "sealedEvaluation",
            {},
        ),
        "sealedEvaluation",
    )

    raw_artifacts = require_list(
        raw_case.get(
            "artifacts",
            [],
        ),
        "artifacts",
    )

    if not raw_artifacts:
        raise RealityNormalizationError(
            "REALITY_ARTIFACT_REQUIRED",
            (
                "At least one evidence "
                "artifact is required"
            ),
        )

    artifacts = normalize_artifacts(
        raw_artifacts
    )

    artifact_ids = {
        artifact[
            "artifactId"
        ]
        for artifact
        in artifacts
    }

    timeline = normalize_timeline(
        require_list(
            raw_case.get(
                "timeline",
                [],
            ),
            "timeline",
        ),
        artifact_ids,
    )

    reality_case = build_reality_case(
        case_id=
            case_id,

        title=
            title,

        source_kind=
            source_kind,

        evidence_grade=
            evidence_grade,

        environment=
            environment,

        workload=
            workload,

        timeline=
            timeline,

        artifacts=
            artifacts,

        provenance=
            provenance,

        license_info=
            license_info,

        sealed_evaluation=
            sealed_evaluation,
    )

    visible_case = {
        key:
            value

        for (
            key,
            value,
        )
        in reality_case.items()

        if key != "sealedEvaluation"
    }

    assert_no_sealed_fields(
        visible_case,
        path=
            "visibleCase",
    )

    source_registration = {
        "publicId":
            stable_source_public_id(
                source_kind,
                source_name,
                source_reference,
            ),

        "sourceKind":
            source_kind,

        "name":
            source_name,

        "reference":
            source_reference,

        "provenance":
            provenance,

        "license":
            license_info,

        "executionAuthorized":
            False,
    }

    normalization_digest = sha256_json(
        {
            "normalizationVersion":
                NORMALIZATION_VERSION,

            "sourceRegistration":
                source_registration,

            "visibleCase":
                visible_case,

            "artifacts": [
                {
                    "artifactId":
                        artifact[
                            "artifactId"
                        ],

                    "artifactKind":
                        artifact[
                            "artifactKind"
                        ],

                    "contentHash":
                        artifact[
                            "contentHash"
                        ],

                    "byteSize":
                        artifact[
                            "byteSize"
                        ],

                    "mediaType":
                        artifact[
                            "mediaType"
                        ],
                }

                for artifact
                in artifacts
            ],

            "sealedEvaluationDigest":
                sha256_json(
                    sealed_evaluation
                ),
        }
    )

    return {
        "normalizationVersion":
            NORMALIZATION_VERSION,

        "sourceRegistration":
            source_registration,

        "realityCase":
            reality_case,

        "artifacts":
            artifacts,

        "normalizationDigest":
            normalization_digest,

        "executionAuthorized":
            False,
    }


# ============================================================
# PUBLIC API
# ============================================================


__all__ = [
    "NORMALIZATION_VERSION",

    "EVIDENCE_GRADES",

    "EVIDENCE_GRADE_DEFINITIONS",

    "SOURCE_KINDS",

    "SOURCE_KIND_ALLOWED_EVIDENCE_GRADES",

    "ARTIFACT_KINDS",

    "VISIBLE_EVIDENCE_BUCKETS",

    "VISIBLE_BUCKET_BY_ARTIFACT_KIND",

    "SEALED_FIELD_NAMES",

    "RealityNormalizationError",

    "canonical_json",

    "sha256_bytes",

    "sha256_json",

    "sha256_hex",

    "require_string",

    "require_non_empty_string",

    "require_mapping",

    "require_object",

    "require_list",

    "require_array",

    "require_boolean",

    "require_nonnegative_int",

    "require_non_negative_integer",

    "require_positive_number",

    "require_evidence_grade",

    "require_source_kind",

    "validate_source_grade_compatibility",

    "ensure_no_sealed_fields",

    "assert_no_sealed_fields",

    "deterministic_source_public_id",

    "stable_source_public_id",

    "decode_artifact_content",

    "normalize_timeline",

    "normalize_artifacts",

    "build_visible_evidence",

    "build_reality_case",

    "normalize_case_bundle",
]