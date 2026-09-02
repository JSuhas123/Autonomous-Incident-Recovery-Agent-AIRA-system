"""Adapter registry for AIRA Phase 23R dataset normalization."""

from __future__ import annotations

from typing import Any, Dict

from intelligence.reality.adapters.aira_raw_bundle import (
    ADAPTER_NAME as RAW_BUNDLE_ADAPTER,
    normalize as normalize_raw_bundle,
)

from intelligence.reality.adapters.public_incident_timeline import (
    ADAPTER_NAME as PUBLIC_INCIDENT_ADAPTER,
    normalize as normalize_public_incident,
)

from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
    require_mapping,
    validate_source_grade_compatibility,
)


ADAPTERS = {
    RAW_BUNDLE_ADAPTER:
        normalize_raw_bundle,

    PUBLIC_INCIDENT_ADAPTER:
        normalize_public_incident,
}


def normalize_dataset(
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
        RAW_BUNDLE_ADAPTER,
    )

    adapter = ADAPTERS.get(
        raw_format
    )

    if (
        adapter
        is None
    ):
        raise RealityNormalizationError(
            "REALITY_RAW_FORMAT_UNSUPPORTED",
            (
                "Unsupported rawFormat: "
                f"{raw_format}"
            ),
        )

    result = adapter(
        raw
    )

    reality_case = require_mapping(
        result.get(
            "realityCase"
        ),
        "normalized.realityCase",
    )

    provenance = require_mapping(
        reality_case.get(
            "provenance"
        ),
        (
            "normalized."
            "realityCase."
            "provenance"
        ),
    )

    source_kind = provenance.get(
        "sourceKind"
    )

    evidence_grade = reality_case.get(
        "evidenceGrade"
    )

    validate_source_grade_compatibility(
        source_kind,
        evidence_grade,
    )

    if (
        result.get(
            "executionAuthorized"
        )
        is not
        False
    ):
        raise RealityNormalizationError(
            "REALITY_NORMALIZATION_AUTHORITY_FORBIDDEN",
            (
                "Dataset normalization must "
                "never grant execution authority"
            ),
        )

    return result