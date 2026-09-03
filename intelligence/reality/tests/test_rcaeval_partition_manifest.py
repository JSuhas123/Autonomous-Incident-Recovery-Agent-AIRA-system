from __future__ import annotations

import unittest


from intelligence.reality.corpus.rcaeval_partition_manifest import (
    EXPECTED_SUITE_COUNTS,
    EXPECTED_TOTAL_CASES,
    RCAEVAL_CORPUS_MANIFEST_VERSION,
    build_rcaeval_partition_manifest,
    certify_complete_rcaeval_manifest,
)

from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
)


def full_rows():
    rows = []

    for (
        suite,
        count,
    ) in EXPECTED_SUITE_COUNTS.items():
        for index in range(
            count
        ):
            rows.append({
                "case":
                    (
                        f"{suite.lower()}_"
                        f"service{index % 5}_"
                        f"fault{index % 7}_"
                        f"{index}"
                    ),

                "suite":
                    suite,

                "root_cause_service":
                    f"service{index % 5}",

                "fault":
                    f"fault{index % 7}",
            })

    return rows


class RCAEvalPartitionManifestTests(
    unittest.TestCase
):
    def test_version(
        self
    ):
        self.assertEqual(
            RCAEVAL_CORPUS_MANIFEST_VERSION,
            "23R.13.0",
        )


    def test_same_rows_and_seed_are_deterministic(
        self
    ):
        self.assertEqual(
            build_rcaeval_partition_manifest(
                full_rows(),
                seed=99,
            ),

            build_rcaeval_partition_manifest(
                full_rows(),
                seed=99,
            ),
        )


    def test_repetitions_of_same_fault_group_do_not_cross_partitions(
        self
    ):
        rows = [
            {
                "case":
                    f"re2ob_checkout_cpu_{i}",

                "suite":
                    "RE2-OB",

                "root_cause_service":
                    "checkout",

                "fault":
                    "cpu",
            }

            for i
            in range(
                1,
                7,
            )
        ]

        manifest = (
            build_rcaeval_partition_manifest(
                rows
            )
        )

        self.assertEqual(
            len({
                case[
                    "partition"
                ]

                for case
                in manifest[
                    "cases"
                ]
            }),

            1,
        )


    def test_manifest_never_marks_cases_as_training_data(
        self
    ):
        manifest = (
            build_rcaeval_partition_manifest(
                full_rows()
            )
        )

        self.assertTrue(
            all(
                case[
                    "trainingEligible"
                ] is False

                for case
                in manifest[
                    "cases"
                ]
            )
        )


    def test_full_735_case_fixture_certifies(
        self
    ):
        manifest = (
            build_rcaeval_partition_manifest(
                full_rows()
            )
        )

        result = (
            certify_complete_rcaeval_manifest(
                manifest
            )
        )

        self.assertEqual(
            result[
                "status"
            ],
            "PASS",
        )

        self.assertEqual(
            result[
                "caseCount"
            ],
            EXPECTED_TOTAL_CASES,
        )


    def test_missing_case_fails_certification(
        self
    ):
        manifest = (
            build_rcaeval_partition_manifest(
                full_rows()[
                    :-1
                ]
            )
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            certify_complete_rcaeval_manifest(
                manifest
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_RCAEVAL_MANIFEST_CASE_COUNT_INVALID",
        )


    def test_duplicate_case_fails_build(
        self
    ):
        rows = (
            full_rows()
        )

        rows.append(
            dict(
                rows[
                    0
                ]
            )
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            build_rcaeval_partition_manifest(
                rows
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_RCAEVAL_MANIFEST_CASE_DUPLICATE",
        )


    def test_holdout_rules_are_sealed(
        self
    ):
        manifest = (
            build_rcaeval_partition_manifest(
                full_rows()
            )
        )

        self.assertEqual(
            manifest[
                "holdoutRules"
            ],
            {
                "retrievalAllowed":
                    False,

                "trainingAllowed":
                    False,

                "agentGroundTruthAllowed":
                    False,
            },
        )

        self.assertFalse(
            manifest[
                "executionAuthorized"
            ]
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()