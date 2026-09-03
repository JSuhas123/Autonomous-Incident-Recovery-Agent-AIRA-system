"""AIRA Phase 23R.6 external benchmark integration tests."""

from __future__ import annotations

import copy
import os
import sys
import unittest


PROJECT_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(
            __file__
        ),
        "..",
        "..",
        "..",
    )
)


if (
    PROJECT_ROOT
    not in
    sys.path
):
    sys.path.insert(
        0,
        PROJECT_ROOT,
    )


from intelligence.reality.adapters.benchmark_registry import (  # noqa: E402
    BENCHMARK_REGISTRY_VERSION,
    get_benchmark_policy,
)

from intelligence.reality.adapters.registry import (  # noqa: E402
    normalize_dataset,
)

from intelligence.reality.normalization.reality_case_normalizer import (  # noqa: E402
    RealityNormalizationError,
)


def build_external_dataset():
    return {
        "rawFormat":
            "EXTERNAL_BENCHMARK_V1",

        "benchmark": {
            "benchmarkId":
                "RCAEVAL",

            "benchmarkVersion":
                "2026-main",

            "suite":
                "RE2-OB",

            "benchmarkCaseId":
                "checkoutservice_cpu_001",

            "license":
                "MIT",

            "modified":
                False,

            "groundTruthMethod":
                "benchmark annotated root cause",
        },

        "case": {
            "caseId":
                "rcaeval_re2_ob_checkoutservice_cpu_001",

            "title":
                "RCAEval checkoutservice CPU fault",

            "organizationId":
                "org_test",

            "environmentId":
                "env_test",

            "evidenceGrade":
                "E2",

            "workload": {
                "platform":
                    "kubernetes",

                "benchmark":
                    "RCAEval",

                "system":
                    "Online Boutique",

                "service":
                    "checkoutservice",
            },

            "timeline": [
                {
                    "eventId":
                        "metric_1_event",

                    "offsetMs":
                        0,

                    "kind":
                        "METRIC",

                    "artifactId":
                        "metric_1",
                },

                {
                    "eventId":
                        "log_1_event",

                    "offsetMs":
                        1000,

                    "kind":
                        "LOG",

                    "artifactId":
                        "log_1",
                },
            ],

            "safetyRestrictions":
                [],

            "replayConfiguration": {
                "seed":
                    23,

                "speedMultiplier":
                    1,

                "deterministicTimestamps":
                    True,
            },
        },

        "evidence": [
            {
                "artifactId":
                    "metric_1",

                "kind":
                    "METRIC",

                "mediaType":
                    "application/json",

                "content":
                    '{"cpu":97}',

                "provenance": {
                    "dataset":
                        "RE2-OB",
                },
            },

            {
                "artifactId":
                    "log_1",

                "kind":
                    "LOG",

                "mediaType":
                    "text/plain",

                "content":
                    "request latency increased\n",

                "provenance": {
                    "dataset":
                        "RE2-OB",
                },
            },
        ],

        "evaluation": {
            "knownFault":
                "cpu",

            "expectedDiagnosis":
                "checkoutservice CPU saturation",

            "acceptableDiagnoses": [
                "checkoutservice cpu fault",
                "checkoutservice CPU saturation",
            ],

            "expectedRecoveryFamily":
                "RESOURCE_RECOVERY",

            "rubric": {
                "safetyDominates":
                    True,

                "benchmarkIndependent":
                    True,
            },
        },
    }


class ExternalBenchmarkIntegrationTests(
    unittest.TestCase
):
    def test_registry_version(
        self
    ):
        self.assertEqual(
            BENCHMARK_REGISTRY_VERSION,
            "23R.6.0",
        )


    def test_rcaeval_is_approved_mit(
        self
    ):
        policy = get_benchmark_policy(
            "RCAEVAL"
        )

        self.assertEqual(
            policy[
                "license"
            ],
            "MIT",
        )

        self.assertTrue(
            policy[
                "commercialUseAllowed"
            ]
        )

        self.assertEqual(
            policy[
                "integrationStatus"
            ],
            "APPROVED",
        )


    def test_rcaeval_normalizes_as_e2(
        self
    ):
        result = normalize_dataset(
            build_external_dataset()
        )

        self.assertEqual(
            result[
                "adapter"
            ],
            "EXTERNAL_BENCHMARK_V1",
        )

        self.assertEqual(
            result[
                "realityCase"
            ][
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertEqual(
            result[
                "realityCase"
            ][
                "provenance"
            ][
                "sourceKind"
            ],
            "EXTERNAL_BENCHMARK",
        )

        self.assertFalse(
            result[
                "executionAuthorized"
            ]
        )

        self.assertFalse(
            result[
                "realityCase"
            ][
                "sealing"
            ][
                "groundTruthAgentVisible"
            ]
        )


    def test_registry_metadata_is_persisted_in_normalization(
        self
    ):
        result = normalize_dataset(
            build_external_dataset()
        )

        metadata = result[
            "sourceRegistration"
        ][
            "metadata"
        ]

        self.assertEqual(
            metadata[
                "benchmarkId"
            ],
            "RCAEVAL",
        )

        self.assertEqual(
            metadata[
                "benchmarkSuite"
            ],
            "RE2-OB",
        )

        self.assertEqual(
            metadata[
                "license"
            ],
            "MIT",
        )

        self.assertTrue(
            metadata[
                "commercialUseAllowed"
            ]
        )


    def test_external_safety_restrictions_are_mandatory(
        self
    ):
        result = normalize_dataset(
            build_external_dataset()
        )

        restrictions = result[
            "realityCase"
        ][
            "safetyRestrictions"
        ]

        self.assertIn(
            "EXTERNAL_BENCHMARK_ONLY",
            restrictions,
        )

        self.assertIn(
            "NO_AUTHORIZATION_GRANT",
            restrictions,
        )

        self.assertIn(
            "NO_PRODUCTION_CERTIFICATION",
            restrictions,
        )

        self.assertIn(
            "GROUND_TRUTH_SEALED",
            restrictions,
        )


    def test_wrong_evidence_grade_is_rejected(
        self
    ):
        raw = build_external_dataset()

        raw[
            "case"
        ][
            "evidenceGrade"
        ] = "E1"

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize_dataset(
                raw
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_EXTERNAL_BENCHMARK_GRADE_INVALID",
        )


    def test_noncommercial_agenticopseval_is_blocked(
        self
    ):
        raw = build_external_dataset()

        raw[
            "benchmark"
        ][
            "benchmarkId"
        ] = (
            "AGENTICOPSEVAL_AIOPS2025"
        )

        raw[
            "benchmark"
        ][
            "license"
        ] = (
            "CC-BY-NC-4.0"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize_dataset(
                raw
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_EXTERNAL_BENCHMARK_LICENSE_BLOCKED",
        )


    def test_unverified_cloud_ops_bench_is_blocked(
        self
    ):
        raw = build_external_dataset()

        raw[
            "benchmark"
        ][
            "benchmarkId"
        ] = (
            "CLOUD_OPS_BENCH"
        )

        raw[
            "benchmark"
        ][
            "license"
        ] = (
            "UNVERIFIED"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize_dataset(
                raw
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_EXTERNAL_BENCHMARK_LICENSE_BLOCKED",
        )


    def test_license_mismatch_is_rejected(
        self
    ):
        raw = build_external_dataset()

        raw[
            "benchmark"
        ][
            "license"
        ] = (
            "Apache-2.0"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize_dataset(
                raw
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_EXTERNAL_BENCHMARK_LICENSE_MISMATCH",
        )


    def test_visible_case_ground_truth_still_fails_closed(
        self
    ):
        raw = build_external_dataset()

        raw[
            "case"
        ][
            "expectedDiagnosis"
        ] = (
            "secret"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize_dataset(
                raw
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_RAW_GROUND_TRUTH_LEAKAGE",
        )


    def test_normalization_is_deterministic(
        self
    ):
        raw = build_external_dataset()

        first = normalize_dataset(
            copy.deepcopy(
                raw
            )
        )

        second = normalize_dataset(
            copy.deepcopy(
                raw
            )
        )

        self.assertEqual(
            first,
            second,
        )

        self.assertEqual(
            first[
                "normalizationDigest"
            ],
            second[
                "normalizationDigest"
            ],
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()