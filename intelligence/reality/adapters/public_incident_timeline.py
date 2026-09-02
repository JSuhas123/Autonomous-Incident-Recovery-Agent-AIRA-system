"""Adapter for reconstructed public incidents with time-released evidence."""

from __future__ import annotations

from typing import Any, Dict

from intelligence.reality.adapters.aira_raw_bundle import (
    normalize as normalize_raw_bundle,
)

from intelligence.reality.normalization.reality_case_normalizer import (
    NORMALIZATION_VERSION,
    RealityNormalizationError,
    require_mapping,
    sha256_json,
)


ADAPTER_NAME = (
    "PUBLIC_INCIDENT_TIMELINE_V1"
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

    source = dict(
        require_mapping(
            raw.get(
                "source"
            ),
            "source",
        )
    )

    case = dict(
        require_mapping(
            raw.get(
                "case"
            ),
            "case",
        )
    )

    source[
        "sourceKind"
    ] = (
        "PUBLIC_INCIDENT_RECONSTRUCTION"
    )

    if (
        case.get(
            "evidenceGrade"
        )
        !=
        "E3"
    ):
        raise RealityNormalizationError(
            "REALITY_PUBLIC_INCIDENT_GRADE_INVALID",
            (
                "Public incident reconstructions "
                "must use evidenceGrade E3"
            ),
        )

    converted = {
        "rawFormat":
            "AIRA_RAW_BUNDLE_V1",

        "source":
            source,

        "case":
            case,

        "evidence":
            raw.get(
                "evidence"
            ),

        "evaluation":
            raw.get(
                "evaluation"
            ),
    }

    result = normalize_raw_bundle(
        converted
    )

    result[
        "adapter"
    ] = ADAPTER_NAME

    result[
        "realityCase"
    ][
        "provenance"
    ][
        "adapter"
    ] = ADAPTER_NAME

    result[
        "sourceRegistration"
    ][
        "metadata"
    ][
        "adapter"
    ] = ADAPTER_NAME

    result[
        "sourceRegistration"
    ][
        "metadata"
    ][
        "normalizerVersion"
    ] = NORMALIZATION_VERSION

    result[
        "normalizationDigest"
    ] = sha256_json(
        {
            "sourceRegistration":
                result[
                    "sourceRegistration"
                ],

            "realityCase":
                result[
                    "realityCase"
                ],

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
                in result[
                    "artifacts"
                ]
            ],
        }
    )

    return result