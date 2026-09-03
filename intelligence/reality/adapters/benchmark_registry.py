"""AIRA Phase 23R.6 external benchmark source policy registry.

This registry is intentionally conservative.

A benchmark is ingestible by the commercial AIRA Reality Corpus only when
its dataset-use terms have been explicitly verified as compatible.

Research-only or unverified sources remain catalogued but fail closed.

BENCHMARK PASS != PRODUCTION PROOF.
EXTERNAL DATASET != EXECUTION AUTHORITY.
GROUND TRUTH != AGENT CONTEXT.
"""

from __future__ import annotations

from typing import Any, Dict

from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
    require_mapping,
    require_string,
)


BENCHMARK_REGISTRY_VERSION = (
    "23R.6.0"
)


BENCHMARK_POLICY = {
    "RCAEVAL": {
        "benchmarkId":
            "RCAEVAL",

        "benchmarkName":
            "RCAEval",

        "license":
            "MIT",

        "commercialUseAllowed":
            True,

        "redistributionAllowed":
            True,

        "integrationStatus":
            "APPROVED",

        "evidenceGrade":
            "E2",

        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "verifiedAt":
            "2026-09-03",

        "sourceUri":
            (
                "https://github.com/"
                "phamquiluan/RCAEval"
            ),
    },

    "AGENTICOPSEVAL_AIOPS2025": {
        "benchmarkId":
            "AGENTICOPSEVAL_AIOPS2025",

        "benchmarkName":
            "AgenticOpsEval / AIOps2025",

        "license":
            "CC-BY-NC-4.0",

        "commercialUseAllowed":
            False,

        "redistributionAllowed":
            False,

        "integrationStatus":
            "RESEARCH_ONLY",

        "evidenceGrade":
            "E2",

        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "verifiedAt":
            "2026-09-03",

        "sourceUri":
            (
                "https://www.aiops.cn/gitlab/"
                "aiops-live-benchmark/"
                "agenticopseval"
            ),
    },

    "AGENTICOPSEVAL_RCA100": {
        "benchmarkId":
            "AGENTICOPSEVAL_RCA100",

        "benchmarkName":
            "AgenticOpsEval / RCA100",

        "license":
            "CC-BY-NC-SA-4.0",

        "commercialUseAllowed":
            False,

        "redistributionAllowed":
            False,

        "integrationStatus":
            "RESEARCH_ONLY",

        "evidenceGrade":
            "E2",

        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "verifiedAt":
            "2026-09-03",

        "sourceUri":
            (
                "https://www.aiops.cn/gitlab/"
                "aiops-live-benchmark/"
                "agenticopseval"
            ),
    },

    "CLOUD_OPS_BENCH": {
        "benchmarkId":
            "CLOUD_OPS_BENCH",

        "benchmarkName":
            "Cloud-OpsBench",

        "license":
            "UNVERIFIED",

        "commercialUseAllowed":
            False,

        "redistributionAllowed":
            False,

        "integrationStatus":
            "BLOCKED_UNVERIFIED_LICENSE",

        "evidenceGrade":
            "E2",

        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "verifiedAt":
            "2026-09-03",

        "sourceUri":
            (
                "https://github.com/"
                "LLM4Ops/Cloud-OpsBench"
            ),
    },

    "AIOPS_CHALLENGE_2020": {
        "benchmarkId":
            "AIOPS_CHALLENGE_2020",

        "benchmarkName":
            "AIOps Challenge 2020",

        "license":
            "NON_COMMERCIAL_TERMS",

        "commercialUseAllowed":
            False,

        "redistributionAllowed":
            False,

        "integrationStatus":
            "RESEARCH_ONLY",

        "evidenceGrade":
            "E2",

        "sourceKind":
            "EXTERNAL_BENCHMARK",

        "verifiedAt":
            "2026-09-03",

        "sourceUri":
            (
                "https://github.com/"
                "AIOps-Lab-NKU/"
                "AIOps-Challenge-2020-Data"
            ),
    },
}


def get_benchmark_policy(
    benchmark_id: str,
) -> Dict[str, Any]:
    key = require_string(
        benchmark_id,
        "benchmark.benchmarkId",
    ).upper()

    policy = BENCHMARK_POLICY.get(
        key
    )

    if (
        policy
        is None
    ):
        raise RealityNormalizationError(
            "REALITY_EXTERNAL_BENCHMARK_UNKNOWN",
            (
                "Unknown external benchmark: "
                f"{key}"
            ),
        )

    return dict(
        policy
    )


def assert_benchmark_ingestible(
    benchmark: Dict[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    raw = require_mapping(
        benchmark,
        "benchmark",
    )

    policy = get_benchmark_policy(
        raw.get(
            "benchmarkId"
        )
    )

    if (
        policy[
            "integrationStatus"
        ]
        !=
        "APPROVED"
        or
        not policy[
            "commercialUseAllowed"
        ]
    ):
        raise RealityNormalizationError(
            "REALITY_EXTERNAL_BENCHMARK_LICENSE_BLOCKED",
            (
                "External benchmark is not approved "
                "for AIRA corpus ingestion: "
                f"{policy['benchmarkId']} "
                f"({policy['integrationStatus']}, "
                f"{policy['license']})"
            ),
            details={
                "benchmarkId":
                    policy[
                        "benchmarkId"
                    ],

                "license":
                    policy[
                        "license"
                    ],

                "integrationStatus":
                    policy[
                        "integrationStatus"
                    ],
            },
        )

    supplied_license = raw.get(
        "license"
    )

    if (
        supplied_license
        is not None
    ):
        supplied_license = require_string(
            supplied_license,
            "benchmark.license",
        )

        if (
            supplied_license.upper()
            !=
            policy[
                "license"
            ].upper()
        ):
            raise RealityNormalizationError(
                "REALITY_EXTERNAL_BENCHMARK_LICENSE_MISMATCH",
                (
                    "Supplied benchmark license does not "
                    "match the verified policy for "
                    f"{policy['benchmarkId']}"
                ),
            )

    return policy