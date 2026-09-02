"""AIRA Phase 23R.3 adapter for normalized raw incident bundles."""

from __future__ import annotations

import base64
from typing import Any, Dict, List

from intelligence.reality.normalization.reality_case_normalizer import (
    ARTIFACT_KINDS,
    EVIDENCE_GRADES,
    NORMALIZATION_VERSION,
    SOURCE_KINDS,
    VISIBLE_EVIDENCE_BUCKETS,
    RealityNormalizationError,
    decode_artifact_content,
    deterministic_source_public_id,
    ensure_no_sealed_fields,
    normalize_timeline,
    require_boolean,
    require_list,
    require_mapping,
    require_nonnegative_int,
    require_positive_number,
    require_string,
    sha256_bytes,
    sha256_json,
)

ADAPTER_NAME = (
    "AIRA_RAW_BUNDLE_V1"
)

RAW_BUNDLE_VERSION = (
    "1"
)


def normalize(
    raw_dataset: Dict[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    raw = require_mapping(
        raw_dataset,
        "rawDataset",
    )

    raw_format = raw.get(
        "rawFormat",
        ADAPTER_NAME,
    )

    if (
        raw_format
        !=
        ADAPTER_NAME
    ):
        raise RealityNormalizationError(
            "REALITY_RAW_FORMAT_UNSUPPORTED",
            (
                "Unsupported rawFormat: "
                f"{raw_format}"
            ),
        )

    source = _normalize_source(
        require_mapping(
            raw.get(
                "source"
            ),
            "source",
        )
    )

    case = _normalize_case(
        require_mapping(
            raw.get(
                "case"
            ),
            "case",
        )
    )

    evaluation = (
        _normalize_evaluation(
            require_mapping(
                raw.get(
                    "evaluation"
                ),
                "evaluation",
            )
        )
    )

    (
        artifacts,
        visible_evidence,
    ) = _normalize_artifacts(
        require_list(
            raw.get(
                "evidence"
            ),
            "evidence",
        )
    )

    if not artifacts:
        raise RealityNormalizationError(
            "REALITY_RAW_EVIDENCE_REQUIRED",
            (
                "evidence must contain "
                "at least one artifact"
            ),
        )

    artifact_ids = {
        artifact[
            "artifactId"
        ]
        for artifact
        in artifacts
    }

    for event in case[
        "timeline"
    ]:
        artifact_id = event.get(
            "artifactId"
        )

        if (
            artifact_id
            is not None
            and
            artifact_id
            not in artifact_ids
        ):
            raise RealityNormalizationError(
                "REALITY_RAW_TIMELINE_ARTIFACT_UNKNOWN",
                (
                    "timeline event references "
                    "unknown artifactId: "
                    f"{artifact_id}"
                ),
            )

    reality_case = {
        "identity": {
            "caseId":
                case[
                    "caseId"
                ],

            "title":
                case[
                    "title"
                ],
        },

        "scope": {
            "organizationId":
                case[
                    "organizationId"
                ],

            "environmentId":
                case[
                    "environmentId"
                ],
        },

        "provenance": {
            **source,

            "adapter":
                ADAPTER_NAME,

            "normalizerVersion":
                NORMALIZATION_VERSION,
        },

        "evidenceGrade":
            case[
                "evidenceGrade"
            ],

        "workload":
            case[
                "workload"
            ],

        "timeline":
            case[
                "timeline"
            ],

        "visibleEvidence":
            visible_evidence,

        "sealedEvaluation": {
            "knownFault":
                evaluation[
                    "knownFault"
                ],

            "expectedDiagnosis":
                evaluation[
                    "expectedDiagnosis"
                ],

            "acceptableDiagnoses":
                evaluation[
                    "acceptableDiagnoses"
                ],

            "expectedRecoveryFamily":
                evaluation[
                    "expectedRecoveryFamily"
                ],
        },

        "safetyRestrictions":
            case[
                "safetyRestrictions"
            ],

        "evaluationRubric":
            evaluation[
                "rubric"
            ],

        "replayConfiguration":
            case[
                "replayConfiguration"
            ],

        "artifacts": [
            {
                "artifactId":
                    artifact[
                        "artifactId"
                    ],

                "kind":
                    artifact[
                        "kind"
                    ],

                "contentHash":
                    artifact[
                        "contentHash"
                    ],
            }

            for artifact
            in artifacts
        ],

        "sealing": {
            "evidenceVisibility":
                "EVIDENCE",

            "evaluationVisibility":
                "SEALED_EVALUATION",

            "groundTruthAgentVisible":
                False,
        },

        "version": {
            "revision":
                1,

            "contentHash":
                None,
        },

        "executionAuthorized":
            False,
    }

    source_registration = {
        "publicId":
            deterministic_source_public_id(
                source
            ),

        **source,

        "metadata": {
            "adapter":
                ADAPTER_NAME,

            "rawBundleVersion":
                RAW_BUNDLE_VERSION,

            "normalizerVersion":
                NORMALIZATION_VERSION,
        },

        "executionAuthorized":
            False,
    }

    normalization_digest = (
        sha256_json(
            {
                "sourceRegistration":
                    source_registration,

                "realityCase":
                    reality_case,

                "artifacts": [
                    {
                        key:
                            value

                        for (
                            key,
                            value,
                        )
                        in artifact.items()

                        if (
                            key
                            !=
                            "contentBase64"
                        )
                    }

                    for artifact
                    in artifacts
                ],
            }
        )
    )

    return {
        "schemaVersion":
            NORMALIZATION_VERSION,

        "adapter":
            ADAPTER_NAME,

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


def _normalize_source(
    source: Dict[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    normalized = {
        "sourceKind":
            require_string(
                source.get(
                    "sourceKind"
                ),
                "source.sourceKind",
            ),

        "sourceName":
            require_string(
                source.get(
                    "sourceName"
                ),
                "source.sourceName",
            ),

        "sourceVersion":
            require_string(
                source.get(
                    "sourceVersion"
                ),
                "source.sourceVersion",
            ),

        "license":
            require_string(
                source.get(
                    "license"
                ),
                "source.license",
            ),

        "modified":
            require_boolean(
                source.get(
                    "modified"
                ),
                "source.modified",
            ),

        "groundTruthMethod":
            require_string(
                source.get(
                    "groundTruthMethod"
                ),
                (
                    "source."
                    "groundTruthMethod"
                ),
            ),
    }

    source_uri = source.get(
        "sourceUri"
    )

    if (
        source_uri
        is not None
    ):
        normalized[
            "sourceUri"
        ] = require_string(
            source_uri,
            "source.sourceUri",
        )

    if (
        normalized[
            "sourceKind"
        ]
        not in
        SOURCE_KINDS
    ):
        raise RealityNormalizationError(
            "REALITY_RAW_SOURCE_KIND_INVALID",
            (
                "Unsupported sourceKind: "
                f"{normalized['sourceKind']}"
            ),
        )

    return normalized


def _normalize_case(
    case: Dict[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    ensure_no_sealed_fields(
        case,
        "case",
    )

    evidence_grade = (
        require_string(
            case.get(
                "evidenceGrade"
            ),
            "case.evidenceGrade",
        )
    )

    if (
        evidence_grade
        not in
        EVIDENCE_GRADES
    ):
        raise RealityNormalizationError(
            "REALITY_RAW_EVIDENCE_GRADE_INVALID",
            (
                "Unsupported evidenceGrade: "
                f"{evidence_grade}"
            ),
        )

    replay = require_mapping(
        case.get(
            "replayConfiguration"
        ),
        (
            "case."
            "replayConfiguration"
        ),
    )

    replay_configuration = {
        "seed":
            require_nonnegative_int(
                replay.get(
                    "seed"
                ),
                (
                    "case."
                    "replayConfiguration."
                    "seed"
                ),
            ),

        "speedMultiplier":
            require_positive_number(
                replay.get(
                    "speedMultiplier"
                ),
                (
                    "case."
                    "replayConfiguration."
                    "speedMultiplier"
                ),
            ),

        "deterministicTimestamps":
            require_boolean(
                replay.get(
                    "deterministicTimestamps"
                ),
                (
                    "case."
                    "replayConfiguration."
                    "deterministicTimestamps"
                ),
            ),
    }

    safety_restrictions = [
        require_string(
            item,
            (
                "case."
                "safetyRestrictions"
                f"[{index}]"
            ),
        )

        for (
            index,
            item,
        )
        in enumerate(
            require_list(
                case.get(
                    "safetyRestrictions"
                ),
                (
                    "case."
                    "safetyRestrictions"
                ),
            )
        )
    ]

    return {
        "caseId":
            require_string(
                case.get(
                    "caseId"
                ),
                "case.caseId",
            ),

        "title":
            require_string(
                case.get(
                    "title"
                ),
                "case.title",
            ),

        "organizationId":
            require_string(
                case.get(
                    "organizationId"
                ),
                (
                    "case."
                    "organizationId"
                ),
            ),

        "environmentId":
            require_string(
                case.get(
                    "environmentId"
                ),
                (
                    "case."
                    "environmentId"
                ),
            ),

        "evidenceGrade":
            evidence_grade,

        "workload":
            require_mapping(
                case.get(
                    "workload"
                ),
                "case.workload",
            ),

        "timeline":
            normalize_timeline(
                require_list(
                    case.get(
                        "timeline"
                    ),
                    "case.timeline",
                )
            ),

        "safetyRestrictions":
            safety_restrictions,

        "replayConfiguration":
            replay_configuration,
    }


def _normalize_evaluation(
    evaluation: Dict[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    acceptable = [
        require_string(
            item,
            (
                "evaluation."
                "acceptableDiagnoses"
                f"[{index}]"
            ),
        )

        for (
            index,
            item,
        )
        in enumerate(
            require_list(
                evaluation.get(
                    "acceptableDiagnoses"
                ),
                (
                    "evaluation."
                    "acceptableDiagnoses"
                ),
            )
        )
    ]

    if not acceptable:
        raise RealityNormalizationError(
            "REALITY_RAW_ACCEPTABLE_DIAGNOSIS_REQUIRED",
            (
                "evaluation.acceptableDiagnoses "
                "must not be empty"
            ),
        )

    return {
        "knownFault":
            require_string(
                evaluation.get(
                    "knownFault"
                ),
                (
                    "evaluation."
                    "knownFault"
                ),
            ),

        "expectedDiagnosis":
            require_string(
                evaluation.get(
                    "expectedDiagnosis"
                ),
                (
                    "evaluation."
                    "expectedDiagnosis"
                ),
            ),

        "acceptableDiagnoses":
            acceptable,

        "expectedRecoveryFamily":
            require_string(
                evaluation.get(
                    "expectedRecoveryFamily"
                ),
                (
                    "evaluation."
                    "expectedRecoveryFamily"
                ),
            ),

        "rubric":
            require_mapping(
                evaluation.get(
                    "rubric"
                ),
                (
                    "evaluation."
                    "rubric"
                ),
            ),
    }


def _normalize_artifacts(
    raw_artifacts: List[
        Any
    ],
) -> tuple[
    List[
        Dict[str, Any]
    ],
    Dict[
        str,
        List[
            Dict[str, Any]
        ],
    ],
]:
    artifacts: List[
        Dict[str, Any]
    ] = []

    visible: Dict[
        str,
        List[
            Dict[str, Any]
        ],
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

    seen_ids = set()

    for (
        index,
        raw_artifact,
    ) in enumerate(
        raw_artifacts
    ):
        field = (
            f"evidence[{index}]"
        )

        artifact = (
            require_mapping(
                raw_artifact,
                field,
            )
        )

        ensure_no_sealed_fields(
            artifact,
            field,
        )

        artifact_id = (
            require_string(
                artifact.get(
                    "artifactId"
                ),
                (
                    f"{field}."
                    "artifactId"
                ),
            )
        )

        kind = require_string(
            artifact.get(
                "kind"
            ),
            f"{field}.kind",
        )

        if (
            kind
            not in
            ARTIFACT_KINDS
        ):
            raise RealityNormalizationError(
                "REALITY_RAW_ARTIFACT_KIND_INVALID",
                (
                    "Unsupported artifact kind: "
                    f"{kind}"
                ),
            )

        if (
            artifact_id
            in
            seen_ids
        ):
            raise RealityNormalizationError(
                "REALITY_RAW_ARTIFACT_DUPLICATE_ID",
                (
                    "Duplicate artifactId: "
                    f"{artifact_id}"
                ),
            )

        seen_ids.add(
            artifact_id
        )

        body = (
            decode_artifact_content(
                artifact,
                field,
            )
        )

        content_hash = (
            sha256_bytes(
                body
            )
        )

        media_type = (
            require_string(
                artifact.get(
                    "mediaType",
                    (
                        "application/"
                        "octet-stream"
                    ),
                ),
                (
                    f"{field}."
                    "mediaType"
                ),
            )
        )

        provenance = (
            require_mapping(
                artifact.get(
                    "provenance",
                    {},
                ),
                (
                    f"{field}."
                    "provenance"
                ),
            )
        )

        normalized_artifact = {
            "artifactId":
                artifact_id,

            "kind":
                kind,

            "channel":
                "EVIDENCE",

            "mediaType":
                media_type,

            "byteSize":
                len(
                    body
                ),

            "contentHash":
                content_hash,

            "contentBase64":
                base64
                .b64encode(
                    body
                )
                .decode(
                    "ascii"
                ),

            "provenance":
                provenance,

            "trustedGroundTruth":
                False,

            "executionAuthorized":
                False,
        }

        artifacts.append(
            normalized_artifact
        )

        bucket = (
            VISIBLE_EVIDENCE_BUCKETS
            .get(
                kind
            )
        )

        if bucket:
            visible[
                bucket
            ].append(
                {
                    "artifactId":
                        artifact_id,

                    "kind":
                        kind,

                    "contentHash":
                        content_hash,

                    "mediaType":
                        media_type,

                    "byteSize":
                        len(
                            body
                        ),
                }
            )

    artifacts.sort(
        key=lambda item:
            item[
                "artifactId"
            ]
    )

    for values in (
        visible.values()
    ):
        values.sort(
            key=lambda item:
                item[
                    "artifactId"
                ]
        )

    return (
        artifacts,
        visible,
    )