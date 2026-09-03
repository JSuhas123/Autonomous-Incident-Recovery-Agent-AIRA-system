"""AIRA Phase 23R.6 adapter for independent external benchmarks.

External benchmark evidence receives canonical evidence grade E2.

The benchmark evaluator's answer remains sealed from AIRA.

This adapter never grants execution authority and never converts benchmark
success into production certification.
"""

from __future__ import annotations

from typing import Any, Dict

from intelligence.reality.adapters.aira_raw_bundle import (
    normalize as normalize_raw_bundle,
)

from intelligence.reality.adapters.benchmark_registry import (
    BENCHMARK_REGISTRY_VERSION,
    assert_benchmark_ingestible,
)

from intelligence.reality.normalization.reality_case_normalizer import (
    NORMALIZATION_VERSION,
    RealityNormalizationError,
    require_mapping,
    require_string,
    sha256_json,
)


ADAPTER_NAME = (
    "EXTERNAL_BENCHMARK_V1"
)

ADAPTER_VERSION = (
    "23R.6.0"
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

    benchmark = require_mapping(
        raw.get(
            "benchmark"
        ),
        "benchmark",
    )

    policy = assert_benchmark_ingestible(
        benchmark
    )

    case = dict(
        require_mapping(
            raw.get(
                "case"
            ),
            "case",
        )
    )

    if (
        case.get(
            "evidenceGrade"
        )
        !=
        "E2"
    ):
        raise RealityNormalizationError(
            "REALITY_EXTERNAL_BENCHMARK_GRADE_INVALID",
            (
                "Independent external benchmarks "
                "must use evidenceGrade E2"
            ),
        )

    benchmark_case_id = require_string(
        benchmark.get(
            "benchmarkCaseId"
        ),
        "benchmark.benchmarkCaseId",
    )

    benchmark_suite = require_string(
        benchmark.get(
            "suite"
        ),
        "benchmark.suite",
    )

    benchmark_version = require_string(
        benchmark.get(
            "benchmarkVersion"
        ),
        "benchmark.benchmarkVersion",
    )

    ground_truth_method = require_string(
        benchmark.get(
            "groundTruthMethod"
        ),
        "benchmark.groundTruthMethod",
    )

    source = {
        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "sourceName":
            policy[
                "benchmarkName"
            ],

        "sourceVersion":
            benchmark_version,

        "license":
            policy[
                "license"
            ],

        "modified":
            bool(
                benchmark.get(
                    "modified",
                    False,
                )
            ),

        "groundTruthMethod":
            ground_truth_method,

        "sourceUri":
            policy[
                "sourceUri"
            ],
    }

    safety_restrictions = list(
        case.get(
            "safetyRestrictions",
            [],
        )
    )

    mandatory_restrictions = [
        "EXTERNAL_BENCHMARK_ONLY",
        "NO_AUTHORIZATION_GRANT",
        "NO_PRODUCTION_CERTIFICATION",
        "GROUND_TRUTH_SEALED",
    ]

    for restriction in mandatory_restrictions:
        if (
            restriction
            not in
            safety_restrictions
        ):
            safety_restrictions.append(
                restriction
            )

    case[
        "safetyRestrictions"
    ] = safety_restrictions

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
    ].update(
        {
            "adapter":
                ADAPTER_NAME,

            "adapterVersion":
                ADAPTER_VERSION,

            "normalizerVersion":
                NORMALIZATION_VERSION,

            "benchmarkRegistryVersion":
                BENCHMARK_REGISTRY_VERSION,

            "benchmarkId":
                policy[
                    "benchmarkId"
                ],

            "benchmarkSuite":
                benchmark_suite,

            "benchmarkCaseId":
                benchmark_case_id,

            "benchmarkVersion":
                benchmark_version,

            "license":
                policy[
                    "license"
                ],

            "commercialUseAllowed":
                policy[
                    "commercialUseAllowed"
                ],

            "redistributionAllowed":
                policy[
                    "redistributionAllowed"
                ],

            "licenseVerifiedAt":
                policy[
                    "verifiedAt"
                ],
        }
    )

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

    if (
        result.get(
            "executionAuthorized"
        )
        is not
        False
    ):
        raise RealityNormalizationError(
            "REALITY_EXTERNAL_BENCHMARK_AUTHORITY_FORBIDDEN",
            (
                "External benchmark normalization "
                "cannot grant authority"
            ),
        )

    return result