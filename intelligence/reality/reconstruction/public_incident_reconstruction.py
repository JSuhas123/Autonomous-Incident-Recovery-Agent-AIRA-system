"""AIRA Phase 23R.8 public production incident reconstruction builder.

Builds PUBLIC_INCIDENT_TIMELINE_V1 inputs from evidence that was historically
available during an incident. Final postmortem/root-cause conclusions stay in
the sealed evaluation channel.

RECONSTRUCTED INCIDENT != PRODUCTION EXECUTION AUTHORITY.
POSTMORTEM ANSWER != HISTORICAL EVIDENCE.
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, Iterable, List, Mapping

from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
    ensure_no_sealed_fields,
    require_mapping,
    require_nonnegative_int,
    require_string,
)


PUBLIC_INCIDENT_RECONSTRUCTION_VERSION = (
    "23R.8.0"
)


_ALLOWED_VISIBLE_KINDS = {
    "SIGNAL",
    "METRIC",
    "LOG",
    "TRACE",
    "TOPOLOGY",
    "RESOURCE_STATE",
}


def _error(
    code: str,
    message: str,
) -> RealityNormalizationError:
    return RealityNormalizationError(
        code,
        message,
    )


def _opaque_case_id(
    source_name: str,
    incident_reference: str,
) -> str:
    digest = hashlib.sha256(
        (
            source_name +
            "\0" +
            incident_reference
        ).encode(
            "utf-8"
        )
    ).hexdigest()[:24]

    return (
        "public_incident_" +
        digest
    )


def _normalize_visible_evidence(
    evidence: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
) -> tuple[
    List[Dict[str, Any]],
    List[Dict[str, Any]],
]:
    artifacts: List[
        Dict[str, Any]
    ] = []

    timeline: List[
        Dict[str, Any]
    ] = []

    seen_ids = set()

    for index, raw_item in enumerate(
        evidence
    ):
        item = require_mapping(
            raw_item,
            f"evidence[{index}]",
        )

        if (
            item.get(
                "historicallyAvailable"
            )
            is not True
        ):
            raise _error(
                "REALITY_PUBLIC_INCIDENT_EVIDENCE_NOT_HISTORICAL",
                (
                    "Every replay-visible public incident artifact "
                    "must have historicallyAvailable=true"
                ),
            )

        ensure_no_sealed_fields(
            item,
            f"evidence[{index}]",
        )

        artifact_id = require_string(
            item.get(
                "artifactId"
            ),
            f"evidence[{index}].artifactId",
        )

        if artifact_id in seen_ids:
            raise _error(
                "REALITY_PUBLIC_INCIDENT_ARTIFACT_DUPLICATE",
                f"Duplicate artifactId: {artifact_id}",
            )

        seen_ids.add(
            artifact_id
        )

        kind = require_string(
            item.get(
                "kind"
            ),
            f"evidence[{index}].kind",
        )

        if kind not in _ALLOWED_VISIBLE_KINDS:
            raise _error(
                "REALITY_PUBLIC_INCIDENT_VISIBLE_KIND_FORBIDDEN",
                (
                    "Public incident replay-visible evidence may only "
                    "contain operational evidence, not postmortem answers"
                ),
            )

        release_offset_ms = require_nonnegative_int(
            item.get(
                "releaseOffsetMs"
            ),
            f"evidence[{index}].releaseOffsetMs",
        )

        artifact = {
            "artifactId":
                artifact_id,

            "kind":
                kind,

            "mediaType":
                require_string(
                    item.get(
                        "mediaType"
                    ),
                    f"evidence[{index}].mediaType",
                ),

            "provenance": {
                "historicallyAvailable":
                    True,

                "historicalReleaseOffsetMs":
                    release_offset_ms,

                "sourceReference":
                    require_string(
                        item.get(
                            "sourceReference"
                        ),
                        f"evidence[{index}].sourceReference",
                    ),
            },
        }

        has_content = (
            "content" in item
        )

        has_content_base64 = (
            "contentBase64" in item
        )

        if has_content == has_content_base64:
            raise _error(
                "REALITY_PUBLIC_INCIDENT_ARTIFACT_CONTENT_INVALID",
                (
                    "Each public incident evidence item must contain "
                    "exactly one of content or contentBase64"
                ),
            )

        if has_content:
            artifact[
                "content"
            ] = item[
                "content"
            ]

        else:
            artifact[
                "contentBase64"
            ] = item[
                "contentBase64"
            ]

        artifacts.append(
            artifact
        )

        timeline.append({
            "eventId":
                f"release_{artifact_id}",

            "offsetMs":
                release_offset_ms,

            "kind":
                kind,

            "artifactId":
                artifact_id,
        })

    if not artifacts:
        raise _error(
            "REALITY_PUBLIC_INCIDENT_EVIDENCE_REQUIRED",
            (
                "At least one historical evidence "
                "artifact is required"
            ),
        )

    timeline.sort(
        key=lambda event: (
            event[
                "offsetMs"
            ],

            event[
                "eventId"
            ],
        )
    )

    return (
        artifacts,
        timeline,
    )


def build_public_incident_dataset(
    *,
    organization_id: str,
    environment_id: str,
    source_name: str,
    source_version: str,
    source_uri: str,
    source_license: str,
    incident_reference: str,
    title: str,
    workload: Mapping[
        str,
        Any,
    ],
    evidence: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
    known_fault: str,
    expected_diagnosis: str,
    acceptable_diagnoses: Iterable[str],
    expected_recovery_family: str,
    ground_truth_method: str,
    replay_seed: int = 23,
) -> Dict[str, Any]:
    artifacts, timeline = (
        _normalize_visible_evidence(
            evidence
        )
    )

    acceptable = [
        require_string(
            value,
            f"acceptableDiagnoses[{index}]",
        )

        for index, value in enumerate(
            acceptable_diagnoses
        )
    ]

    if not acceptable:
        raise _error(
            "REALITY_PUBLIC_INCIDENT_ACCEPTABLE_DIAGNOSIS_REQUIRED",
            (
                "At least one acceptable "
                "diagnosis is required"
            ),
        )

    normalized_workload = require_mapping(
        workload,
        "workload",
    )

    ensure_no_sealed_fields(
        normalized_workload,
        "workload",
    )

    source_name_value = require_string(
        source_name,
        "sourceName",
    )

    incident_reference_value = require_string(
        incident_reference,
        "incidentReference",
    )

    return {
        "rawFormat":
            "PUBLIC_INCIDENT_TIMELINE_V1",

        "source": {
            "sourceKind":
                "PUBLIC_INCIDENT_RECONSTRUCTION",

            "sourceName":
                source_name_value,

            "sourceVersion":
                require_string(
                    source_version,
                    "sourceVersion",
                ),

            "license":
                require_string(
                    source_license,
                    "sourceLicense",
                ),

            "modified":
                True,

            "groundTruthMethod":
                require_string(
                    ground_truth_method,
                    "groundTruthMethod",
                ),

            "sourceUri":
                require_string(
                    source_uri,
                    "sourceUri",
                ),
        },

        "case": {
            "caseId":
                _opaque_case_id(
                    source_name_value,
                    incident_reference_value,
                ),

            "title":
                require_string(
                    title,
                    "title",
                ),

            "organizationId":
                require_string(
                    organization_id,
                    "organizationId",
                ),

            "environmentId":
                require_string(
                    environment_id,
                    "environmentId",
                ),

            "evidenceGrade":
                "E3",

            "workload":
                normalized_workload,

            "timeline":
                timeline,

            "safetyRestrictions": [
                "RECONSTRUCTION_ONLY",
                "NO_AUTHORIZATION_GRANT",
                "NO_PRODUCTION_CERTIFICATION",
                "GROUND_TRUTH_SEALED",
                "HISTORICAL_EVIDENCE_ONLY",
            ],

            "replayConfiguration": {
                "seed":
                    require_nonnegative_int(
                        replay_seed,
                        "replaySeed",
                    ),

                "speedMultiplier":
                    1,

                "deterministicTimestamps":
                    True,
            },
        },

        "evidence":
            artifacts,

        "evaluation": {
            "knownFault":
                require_string(
                    known_fault,
                    "knownFault",
                ),

            "expectedDiagnosis":
                require_string(
                    expected_diagnosis,
                    "expectedDiagnosis",
                ),

            "acceptableDiagnoses":
                acceptable,

            "expectedRecoveryFamily":
                require_string(
                    expected_recovery_family,
                    "expectedRecoveryFamily",
                ),

            "rubric": {
                "historicalEvidenceOnly":
                    True,

                "postmortemAnswerAgentVisible":
                    False,

                "sourceIncidentReference":
                    incident_reference_value,

                "reconstructionVersion":
                    PUBLIC_INCIDENT_RECONSTRUCTION_VERSION,

                "safetyDominates":
                    True,
            },
        },
    }