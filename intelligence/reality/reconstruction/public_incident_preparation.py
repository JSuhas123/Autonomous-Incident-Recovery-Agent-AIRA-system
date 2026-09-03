"""Phase 23R.13S.5D.2 public-incident preparation and provenance audit.

Transforms factual/hash-only public incident acquisition records into a
canonical preparation inventory. This stage never promotes quarantined source
material, never invents ground truth, and never grants execution authority.
"""

from __future__ import annotations

import hashlib
import json

from pathlib import Path
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence


PUBLIC_INCIDENT_PREPARATION_VERSION = "23R.13S.5D.2"

GOOGLE_CLOUD_STATUS_SOURCE_ID = (
    "GOOGLE_CLOUD_STATUS_PUBLIC_FACTS"
)

PREPARED_RELATIVE = (
    "staging/prepared/public-incidents/"
    "phase23r13-google-cloud-public-incident-candidates.jsonl"
)

MANIFEST_RELATIVE = (
    "manifests/"
    "phase23r13-public-incident-preparation-manifest.json"
)


_ALLOWED_RECORD_KINDS = {
    "HISTORY_REFERENCE",
    "RECENT_STRUCTURED_INCIDENT",
}

_ALLOWED_QUALITIES = {
    "STATUS_FACTS_ONLY",
    "DIAGNOSTIC_ONLY",
    "PRELIMINARY_RCA",
    "INCIDENT_REPORT_DIAGNOSTIC",
    "EXPLICIT_ROOT_CAUSE",
}


def _stable_json_bytes(
    value: Any,
) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(
                ",",
                ":",
            ),
            ensure_ascii=False,
        )
        +
        "\n"
    ).encode(
        "utf-8"
    )


def _sha256_bytes(
    payload: bytes,
) -> str:
    return hashlib.sha256(
        payload
    ).hexdigest()


def _sha256_file(
    path: Path,
) -> str:
    hasher = hashlib.sha256()

    with path.open(
        "rb"
    ) as handle:
        while True:
            chunk = handle.read(
                1024
                *
                1024
            )

            if not chunk:
                break

            hasher.update(
                chunk
            )

    return hasher.hexdigest()


def _require_mapping(
    value: Any,
    name: str,
) -> Mapping[
    str,
    Any,
]:
    if not isinstance(
        value,
        Mapping,
    ):
        raise ValueError(
            f"{name} must be an object"
        )

    return value


def _require_nonempty_string(
    value: Any,
    name: str,
) -> str:
    text = str(
        value
        or
        ""
    ).strip()

    if not text:
        raise ValueError(
            f"{name} is required"
        )

    return text


def _read_jsonl(
    path: Path,
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    if not path.is_file():
        raise ValueError(
            (
                "public incident acquisition file "
                f"does not exist: {path}"
            )
        )

    rows: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen_incident_ids: set[
        str
    ] = set()

    for (
        line_number,
        line,
    ) in enumerate(
        path
        .read_text(
            encoding="utf-8"
        )
        .splitlines(),
        start=1,
    ):
        if not line.strip():
            continue

        try:
            value = json.loads(
                line
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                (
                    "invalid JSONL at "
                    f"{path}:{line_number}"
                )
            ) from exc

        if not isinstance(
            value,
            dict,
        ):
            raise ValueError(
                (
                    "JSONL row must be an object at "
                    f"{path}:{line_number}"
                )
            )

        incident_id = (
            _require_nonempty_string(
                value.get(
                    "incidentId"
                ),
                (
                    f"row[{line_number}]"
                    ".incidentId"
                ),
            )
        )

        if (
            incident_id
            in seen_incident_ids
        ):
            raise ValueError(
                (
                    "duplicate public incident id: "
                    f"{incident_id}"
                )
            )

        seen_incident_ids.add(
            incident_id
        )

        rows.append(
            value
        )

    if not rows:
        raise ValueError(
            (
                "public incident acquisition "
                f"file is empty: {path}"
            )
        )

    return rows


def _validate_source_safety(
    row: Mapping[
        str,
        Any,
    ],
    index: int,
) -> None:
    prefix = (
        f"row[{index}]"
    )

    source_id = (
        _require_nonempty_string(
            row.get(
                "sourceId"
            ),
            f"{prefix}.sourceId",
        )
    )

    if (
        source_id
        !=
        GOOGLE_CLOUD_STATUS_SOURCE_ID
    ):
        raise ValueError(
            (
                f"{prefix}.sourceId must remain "
                f"{GOOGLE_CLOUD_STATUS_SOURCE_ID}"
            )
        )

    record_kind = (
        _require_nonempty_string(
            row.get(
                "recordKind"
            ),
            f"{prefix}.recordKind",
        )
    )

    if (
        record_kind
        not in
        _ALLOWED_RECORD_KINDS
    ):
        raise ValueError(
            (
                f"{prefix}.recordKind is "
                f"unsupported: {record_kind}"
            )
        )

    if (
        row.get(
            "groundTruthAgentVisible"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix}.groundTruthAgentVisible "
                "must be false"
            )
        )

    if (
        row.get(
            "executionAuthorized"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix}.executionAuthorized "
                "must be false"
            )
        )

    if (
        row.get(
            "productionCertified"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix}.productionCertified "
                "must be false"
            )
        )

    storage_policy = (
        _require_mapping(
            row.get(
                "contentStoragePolicy"
            ),
            (
                f"{prefix}."
                "contentStoragePolicy"
            ),
        )
    )

    if (
        storage_policy.get(
            "mode"
        )
        !=
        "FACTS_AND_HASHES_ONLY"
    ):
        raise ValueError(
            (
                f"{prefix} must remain "
                "FACTS_AND_HASHES_ONLY"
            )
        )

    if (
        storage_policy.get(
            "rawUpdateTextStored"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix} raw update text "
                "must not be stored"
            )
        )

    if (
        storage_policy.get(
            "rawPostmortemStored"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix} raw postmortem "
                "must not be stored"
            )
        )

    source_policy = (
        _require_mapping(
            row.get(
                "sourcePolicy"
            ),
            (
                f"{prefix}."
                "sourcePolicy"
            ),
        )
    )

    if (
        source_policy.get(
            "policyStatus"
        )
        !=
        "QUARANTINED_LICENSE_REVIEW"
    ):
        raise ValueError(
            (
                f"{prefix}.sourcePolicy."
                "policyStatus must remain "
                "QUARANTINED_LICENSE_REVIEW"
            )
        )

    if (
        source_policy.get(
            "licenseVerified"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix}.sourcePolicy."
                "licenseVerified must be false"
            )
        )

    if (
        source_policy.get(
            "commercialPromotionEligible"
        )
        is not False
    ):
        raise ValueError(
            (
                f"{prefix}.sourcePolicy."
                "commercialPromotionEligible "
                "must be false"
            )
        )

    evaluation = (
        _require_mapping(
            row.get(
                "evaluationEvidence"
            ),
            (
                f"{prefix}."
                "evaluationEvidence"
            ),
        )
    )

    quality = (
        _require_nonempty_string(
            evaluation.get(
                "quality"
            ),
            (
                f"{prefix}."
                "evaluationEvidence.quality"
            ),
        )
    )

    if (
        quality
        not in
        _ALLOWED_QUALITIES
    ):
        raise ValueError(
            (
                f"{prefix} unsupported "
                f"evaluation quality: {quality}"
            )
        )


def _prepare_record(
    row: Mapping[
        str,
        Any,
    ],
    sequence: int,
) -> Dict[
    str,
    Any,
]:
    evaluation = (
        _require_mapping(
            row.get(
                "evaluationEvidence"
            ),
            "evaluationEvidence",
        )
    )

    ground_truth_candidate = (
        evaluation.get(
            "groundTruthCandidate"
        )
        is True
    )

    if ground_truth_candidate:
        reconstruction_state = (
            "SOURCE_GROUND_TRUTH_CANDIDATE"
        )

        reason = (
            "Source text contains a possible "
            "published RCA/incident-report signal, "
            "but sealed fault/diagnosis/recovery "
            "fields have not yet been extracted "
            "and verified."
        )

    else:
        reconstruction_state = (
            "REFERENCE_ONLY_REQUIRES_ENRICHMENT"
        )

        reason = (
            "Acquisition contains historical "
            "factual reference metadata only; "
            "no verified sealed ground truth "
            "exists for E3 reconstruction."
        )

    source_policy = (
        _require_mapping(
            row.get(
                "sourcePolicy"
            ),
            "sourcePolicy",
        )
    )

    prepared_core = {
        "version":
            PUBLIC_INCIDENT_PREPARATION_VERSION,

        "sequence":
            sequence,

        "sourceId":
            str(
                row.get(
                    "sourceId"
                )
            ),

        "incidentId":
            str(
                row.get(
                    "incidentId"
                )
            ),

        "sourceUri":
            str(
                row.get(
                    "sourceUri"
                )
                or
                ""
            ),

        "recordKind":
            str(
                row.get(
                    "recordKind"
                )
            ),

        "incidentDigest":
            str(
                row.get(
                    "incidentDigest"
                )
                or
                ""
            ),

        "affectedProducts":
            list(
                row.get(
                    "affectedProducts"
                )
                or
                []
            ),

        "affectedLocations":
            list(
                row.get(
                    "affectedLocations"
                )
                or
                []
            ),

        "failureFamily":
            str(
                row.get(
                    "failureFamily"
                )
                or
                "UNCLASSIFIED_PUBLIC_INCIDENT"
            ),

        "evaluationEvidence":
            dict(
                evaluation
            ),

        "reconstructionState":
            reconstruction_state,

        "reconstructionEnrichmentRequired":
            True,

        "reconstructionReason":
            reason,

        #
        # IMPORTANT:
        #
        # A candidate marker is NOT enough
        # to certify an E3 reconstruction.
        #
        "e3CertifiableNow":
            False,

        "commercialPromotionEligibleNow":
            False,

        "sourcePolicy":
            dict(
                source_policy
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **prepared_core,

        "preparationHash":
            _sha256_bytes(
                _stable_json_bytes(
                    prepared_core
                )
            ),
    }


def _write_jsonl(
    path: Path,
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[
    str,
    Any,
]:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = (
        hashlib.sha256()
    )

    byte_size = 0

    with path.open(
        "wb"
    ) as handle:
        for row in rows:
            payload = (
                _stable_json_bytes(
                    row
                )
            )

            handle.write(
                payload
            )

            hasher.update(
                payload
            )

            byte_size += len(
                payload
            )

    return {
        "path":
            str(
                path
            ),

        "recordCount":
            len(
                rows
            ),

        "byteSize":
            byte_size,

        "sha256":
            hasher.hexdigest(),
    }


def prepare_public_incident_candidates(
    *,
    data_root: str | Path,
    input_jsonl: str | Path,
    minimum_source_records: int = 100,
) -> Dict[
    str,
    Any,
]:
    if (
        not isinstance(
            minimum_source_records,
            int,
        )
        or
        minimum_source_records < 1
    ):
        raise ValueError(
            (
                "minimum_source_records must "
                "be a positive integer"
            )
        )

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    source_path = (
        Path(
            input_jsonl
        )
        .expanduser()
        .resolve()
    )

    rows = (
        _read_jsonl(
            source_path
        )
    )

    if (
        len(
            rows
        )
        <
        minimum_source_records
    ):
        raise ValueError(
            (
                "public incident preparation has "
                "insufficient source records: "
                f"{len(rows)} < "
                f"{minimum_source_records}"
            )
        )

    prepared: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    candidate_count = 0
    reference_only_count = 0

    quality_counts: Dict[
        str,
        int,
    ] = {}

    record_kind_counts: Dict[
        str,
        int,
    ] = {}

    for (
        index,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        _validate_source_safety(
            row,
            index,
        )

        item = (
            _prepare_record(
                row,
                index,
            )
        )

        prepared.append(
            item
        )

        if (
            item[
                "reconstructionState"
            ]
            ==
            "SOURCE_GROUND_TRUTH_CANDIDATE"
        ):
            candidate_count += 1

        else:
            reference_only_count += 1

        quality = str(
            item[
                "evaluationEvidence"
            ][
                "quality"
            ]
        )

        quality_counts[
            quality
        ] = (
            quality_counts.get(
                quality,
                0,
            )
            +
            1
        )

        record_kind = str(
            item[
                "recordKind"
            ]
        )

        record_kind_counts[
            record_kind
        ] = (
            record_kind_counts.get(
                record_kind,
                0,
            )
            +
            1
        )

    output = (
        _write_jsonl(
            root
            /
            PREPARED_RELATIVE,
            prepared,
        )
    )

    manifest_core = {
        "version":
            PUBLIC_INCIDENT_PREPARATION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "sourceArtifact": {
            "path":
                str(
                    source_path
                ),

            "recordCount":
                len(
                    rows
                ),

            "sha256":
                _sha256_file(
                    source_path
                ),
        },

        "preparedArtifact":
            output,

        "sourceRecordCount":
            len(
                rows
            ),

        "uniqueIncidentCount":
            len({
                row[
                    "incidentId"
                ]
                for row
                in prepared
            }),

        "groundTruthCandidateCount":
            candidate_count,

        "referenceOnlyCount":
            reference_only_count,

        #
        # NONE are E3 certifiable yet.
        #
        # A marker/hash is not a sealed
        # verified evaluation payload.
        #
        "e3CertifiableNowCount":
            0,

        "requiresEnrichmentCount":
            len(
                prepared
            ),

        "qualityCounts":
            dict(
                sorted(
                    quality_counts.items()
                )
            ),

        "recordKindCounts":
            dict(
                sorted(
                    record_kind_counts.items()
                )
            ),

        "policyStatus":
            "QUARANTINED_LICENSE_REVIEW",

        "licenseVerified":
            False,

        "commercialPromotionEligible":
            False,

        "rawPostmortemStored":
            False,

        "rawUpdateTextStored":
            False,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,

        "nextGate":
            (
                "23R.13S.5D.3_"
                "SOURCE_ENRICHMENT"
            ),
    }

    manifest = {
        **manifest_core,

        "manifestHash":
            _sha256_bytes(
                _stable_json_bytes(
                    manifest_core
                )
            ),
    }

    manifest_path = (
        root
        /
        MANIFEST_RELATIVE
    )

    manifest_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest_path.write_bytes(
        _stable_json_bytes(
            manifest
        )
    )

    return {
        **manifest,

        "manifestPath":
            str(
                manifest_path
            ),
    }