from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.corpus.coverage.generated_population import (
    DEFAULT_COUNTS,
    GENERATED_CORPUS_POPULATION_VERSION,
    ROLE_PATHS,
    build_generated_corpus,
    populate_generated_corpus,
)


class Phase23R13GeneratedPopulationTests(
    unittest.TestCase
):
    def _small_counts(
        self,
    ):
        return {
            "HEALTHY_BASELINE":
                4,

            "NOISY_DERIVATIVE":
                12,

            "MULTI_FAULT":
                3,

            "CASCADING_FAILURE":
                3,

            "AMBIGUOUS_EVIDENCE":
                3,

            "RECOVERY_OUTCOME":
                7,
        }


    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            GENERATED_CORPUS_POPULATION_VERSION,
            "23R.13S.3.0",
        )


    def test_default_counts_equal_real_minimum_population(
        self,
    ):
        self.assertEqual(
            DEFAULT_COUNTS[
                "HEALTHY_BASELINE"
            ],
            500,
        )

        self.assertEqual(
            DEFAULT_COUNTS[
                "NOISY_DERIVATIVE"
            ],
            5000,
        )

        self.assertEqual(
            DEFAULT_COUNTS[
                "MULTI_FAULT"
            ],
            250,
        )

        self.assertEqual(
            DEFAULT_COUNTS[
                "CASCADING_FAILURE"
            ],
            250,
        )

        self.assertEqual(
            DEFAULT_COUNTS[
                "AMBIGUOUS_EVIDENCE"
            ],
            250,
        )

        self.assertEqual(
            DEFAULT_COUNTS[
                "RECOVERY_OUTCOME"
            ],
            500,
        )

        self.assertEqual(
            sum(
                DEFAULT_COUNTS.values()
            ),
            6750,
        )


    def test_small_corpus_has_exact_counts(
        self,
    ):
        counts = self._small_counts()

        corpus = build_generated_corpus(
            counts=
                counts
        )

        self.assertEqual(
            {
                role:
                    len(
                        records
                    )

                for (
                    role,
                    records,
                )
                in corpus.items()
            },
            counts,
        )


    def test_noisy_cases_preserve_parent_grade_and_are_derivative(
        self,
    ):
        corpus = build_generated_corpus(
            counts=
                self._small_counts()
        )

        for case in corpus[
            "NOISY_DERIVATIVE"
        ]:
            self.assertEqual(
                case[
                    "evidenceGrade"
                ],
                "E1",
            )

            self.assertFalse(
                case[
                    "independentEvidence"
                ]
            )

            self.assertFalse(
                case[
                    "groundTruthAgentVisible"
                ]
            )


    def test_operational_cases_never_grant_authority(
        self,
    ):
        corpus = build_generated_corpus(
            counts=
                self._small_counts()
        )

        for records in corpus.values():
            for case in records:
                self.assertFalse(
                    case[
                        "executionAuthorized"
                    ]
                )

                self.assertFalse(
                    case[
                        "productionCertified"
                    ]
                )

                self.assertFalse(
                    case[
                        "groundTruthAgentVisible"
                    ]
                )


    def test_population_writes_one_jsonl_shard_per_role(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            result = populate_generated_corpus(
                data_root=
                    root,

                counts=
                    self._small_counts(),
            )

            for (
                role,
                relative_path,
            ) in ROLE_PATHS.items():
                path = (
                    root
                    /
                    relative_path
                )

                self.assertTrue(
                    path.is_file()
                )

                lines = path.read_text(
                    encoding="utf-8"
                ).splitlines()

                self.assertEqual(
                    len(
                        lines
                    ),
                    self._small_counts()[
                        role
                    ],
                )

                json.loads(
                    lines[0]
                )

            self.assertTrue(
                Path(
                    result[
                        "manifestPath"
                    ]
                ).is_file()
            )


    def test_manifest_counts_and_hashes_are_deterministic(
        self,
    ):
        counts = self._small_counts()

        with (
            tempfile.TemporaryDirectory()
            as first_tmp,
            tempfile.TemporaryDirectory()
            as second_tmp,
        ):
            first = populate_generated_corpus(
                data_root=
                    first_tmp,

                counts=
                    counts,
            )

            second = populate_generated_corpus(
                data_root=
                    second_tmp,

                counts=
                    counts,
            )

            self.assertEqual(
                first[
                    "manifest"
                ][
                    "manifestHash"
                ],
                second[
                    "manifest"
                ][
                    "manifestHash"
                ],
            )

            self.assertEqual(
                first[
                    "manifest"
                ][
                    "roleCounts"
                ],
                counts,
            )

            self.assertEqual(
                first[
                    "manifest"
                ][
                    "totalRecords"
                ],
                sum(
                    counts.values()
                ),
            )


    def test_invalid_role_count_is_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_generated_corpus(
                counts={
                    "UNKNOWN_ROLE":
                        1,
                }
            )


    def test_negative_count_is_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_generated_corpus(
                counts={
                    "HEALTHY_BASELINE":
                        -1,
                }
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()