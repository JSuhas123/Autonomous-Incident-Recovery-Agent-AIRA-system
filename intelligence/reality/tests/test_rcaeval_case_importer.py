"""AIRA Phase 23R.6B/C RCAEval importer certification tests."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

from pathlib import Path


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


from intelligence.reality.adapters.rcaeval_case_importer import (  # noqa: E402
    RCAEVAL_IMPORTER_VERSION,
    build_external_benchmark_dataset,
)

from intelligence.reality.adapters.registry import (  # noqa: E402
    normalize_dataset,
)

from intelligence.reality.normalization.reality_case_normalizer import (  # noqa: E402
    RealityNormalizationError,
)


class RCAEvalCaseImporterTests(
    unittest.TestCase
):
    def make_case(
        self,
        name=
            "re2ob_checkoutservice_cpu_1",
        multimodal=
            True,
    ):
        temp = (
            tempfile
            .TemporaryDirectory()
        )

        case_dir = (
            Path(
                temp.name
            ) /
            name
        )

        case_dir.mkdir(
            parents=True
        )

        (
            case_dir /
            "metrics.json"
        ).write_text(
            json.dumps({
                "time": [
                    1,
                    2,
                ],

                "service_cpu": [
                    10,
                    97,
                ],
            }),
            encoding="utf-8",
        )

        (
            case_dir /
            "inject_time.txt"
        ).write_text(
            "1692569339\n",
            encoding="utf-8",
        )

        if (
            multimodal
        ):
            (
                case_dir /
                "logs.csv"
            ).write_text(
                (
                    "time,message\n"
                    "1,request slow\n"
                ),
                encoding="utf-8",
            )

            (
                case_dir /
                "traces.csv"
            ).write_text(
                (
                    "time,trace_id,latency\n"
                    "1,t1,1200\n"
                ),
                encoding="utf-8",
            )

        self.addCleanup(
            temp.cleanup
        )

        return case_dir


    def test_importer_version(
        self
    ):
        self.assertEqual(
            RCAEVAL_IMPORTER_VERSION,
            "23R.6B.0",
        )


    def test_builds_multimodal_e2_raw_dataset(
        self
    ):
        case_dir = (
            self.make_case()
        )

        raw = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        self.assertEqual(
            raw[
                "rawFormat"
            ],
            "EXTERNAL_BENCHMARK_V1",
        )

        self.assertEqual(
            raw[
                "benchmark"
            ][
                "benchmarkId"
            ],
            "RCAEVAL",
        )

        self.assertEqual(
            raw[
                "benchmark"
            ][
                "suite"
            ],
            "RE2-OB",
        )

        self.assertEqual(
            raw[
                "case"
            ][
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertEqual(
            len(
                raw[
                    "evidence"
                ]
            ),
            3,
        )


    def test_visible_identity_does_not_reveal_root_cause(
        self
    ):
        case_dir = (
            self.make_case()
        )

        raw = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        visible = json.dumps(
            raw[
                "case"
            ]
        ).lower()

        self.assertNotIn(
            "checkoutservice",
            visible,
        )

        self.assertNotIn(
            "\"cpu\"",
            visible,
        )


    def test_ground_truth_is_only_in_evaluation_or_source_metadata(
        self
    ):
        case_dir = (
            self.make_case()
        )

        raw = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        self.assertEqual(
            raw[
                "evaluation"
            ][
                "knownFault"
            ],
            "cpu",
        )

        self.assertIn(
            "checkoutservice",
            raw[
                "evaluation"
            ][
                "expectedDiagnosis"
            ],
        )

        self.assertEqual(
            raw[
                "evaluation"
            ][
                "rubric"
            ][
                "injectionTimestamp"
            ],
            "1692569339",
        )


    def test_normalization_seals_ground_truth(
        self
    ):
        case_dir = (
            self.make_case()
        )

        normalized = normalize_dataset(
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        self.assertEqual(
            normalized[
                "realityCase"
            ][
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertFalse(
            normalized[
                "realityCase"
            ][
                "sealing"
            ][
                "groundTruthAgentVisible"
            ]
        )

        self.assertFalse(
            normalized[
                "executionAuthorized"
            ]
        )

        self.assertEqual(
            normalized[
                "realityCase"
            ][
                "provenance"
            ][
                "sourceKind"
            ],
            "EXTERNAL_BENCHMARK",
        )


    def test_metric_only_re1_case_is_supported(
        self
    ):
        case_dir = (
            self.make_case(
                name=
                    "re1ob_adservice_mem_2",

                multimodal=
                    False,
            )
        )

        raw = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        self.assertEqual(
            len(
                raw[
                    "evidence"
                ]
            ),
            1,
        )

        self.assertEqual(
            raw[
                "evidence"
            ][
                0
            ][
                "kind"
            ],
            "METRIC",
        )


    def test_parquet_layout_is_supported_without_parquet_dependency(
        self
    ):
        temp = (
            tempfile
            .TemporaryDirectory()
        )

        self.addCleanup(
            temp.cleanup
        )

        case_dir = (
            Path(
                temp.name
            ) /
            "re2tt_paymentservice_delay_3"
        )

        case_dir.mkdir(
            parents=True
        )

        (
            case_dir /
            "metrics.parquet"
        ).write_bytes(
            b"PAR1fixture"
        )

        (
            case_dir /
            "logs.parquet"
        ).write_bytes(
            b"PAR1logs"
        )

        raw = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",

                injection_timestamp=
                    "1692569999",
            )
        )

        self.assertEqual(
            raw[
                "evidence"
            ][
                0
            ][
                "mediaType"
            ],
            "application/vnd.apache.parquet",
        )

        self.assertEqual(
            raw[
                "evaluation"
            ][
                "rubric"
            ][
                "injectionTimestamp"
            ],
            "1692569999",
        )


    def test_metrics_are_required(
        self
    ):
        temp = (
            tempfile
            .TemporaryDirectory()
        )

        self.addCleanup(
            temp.cleanup
        )

        case_dir = (
            Path(
                temp.name
            ) /
            "re2ob_adservice_cpu_1"
        )

        case_dir.mkdir(
            parents=True
        )

        (
            case_dir /
            "inject_time.txt"
        ).write_text(
            "1692569339",
            encoding="utf-8",
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_RCAEVAL_METRICS_REQUIRED",
        )


    def test_injection_time_is_required_or_explicitly_supplied(
        self
    ):
        temp = (
            tempfile
            .TemporaryDirectory()
        )

        self.addCleanup(
            temp.cleanup
        )

        case_dir = (
            Path(
                temp.name
            ) /
            "re2ob_adservice_cpu_1"
        )

        case_dir.mkdir(
            parents=True
        )

        (
            case_dir /
            "metrics.json"
        ).write_text(
            "{}",
            encoding="utf-8",
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_RCAEVAL_INJECT_TIME_REQUIRED",
        )


    def test_output_is_deterministic(
        self
    ):
        case_dir = (
            self.make_case()
        )

        first = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        second = (
            build_external_benchmark_dataset(
                str(
                    case_dir
                ),

                organization_id=
                    "org_test",

                environment_id=
                    "env_test",
            )
        )

        self.assertEqual(
            first,
            second,
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()