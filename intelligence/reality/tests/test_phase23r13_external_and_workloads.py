from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from intelligence.reality.datasets.external.rcaeval_source import (
    RCAEVAL_SOURCE_CONTRACT_VERSION,
    get_rcaeval_source_contract,
    validate_rcaeval_staging_directory,
)

from intelligence.reality.datasets.workloads.source_checkout import (
    WORKLOAD_SOURCE_CHECKOUT_VERSION,
    validate_workload_checkout,
)

from intelligence.reality.datasets.workloads.workload_catalog import (
    WORKLOAD_CATALOG_VERSION,
    get_workload,
)


class Phase23R13ExternalAndWorkloadTests(
    unittest.TestCase
):
    def test_versions_are_frozen(
        self
    ):
        self.assertEqual(
            RCAEVAL_SOURCE_CONTRACT_VERSION,
            "23R.13E.0",
        )

        self.assertEqual(
            WORKLOAD_CATALOG_VERSION,
            "23R.13F.1",
        )

        self.assertEqual(
            WORKLOAD_SOURCE_CHECKOUT_VERSION,
            "23R.13F.0",
        )


    def test_rcaeval_is_external_e2_benchmark(
        self
    ):
        value = (
            get_rcaeval_source_contract()
        )

        self.assertEqual(
            value[
                "sourceId"
            ],
            "RCAEVAL",
        )

        self.assertEqual(
            value[
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertEqual(
            value[
                "corpusRole"
            ],
            "INDEPENDENT_BENCHMARK",
        )

        self.assertEqual(
            value[
                "expectedCases"
            ],
            735,
        )

        self.assertFalse(
            value[
                "groundTruthAgentVisible"
            ]
        )


    def test_rcaeval_contract_grants_no_authority(
        self
    ):
        value = (
            get_rcaeval_source_contract()
        )

        self.assertFalse(
            value[
                "executionAuthorized"
            ]
        )

        self.assertFalse(
            value[
                "productionCertified"
            ]
        )


    def test_rcaeval_staging_requires_index(
        self
    ):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(
                ValueError
            ):
                validate_rcaeval_staging_directory(
                    Path(
                        root
                    )
                )


    def test_rcaeval_staging_accepts_nonempty_index(
        self
    ):
        with tempfile.TemporaryDirectory() as root:
            path = (
                Path(
                    root
                )
                /
                "cases.parquet"
            )

            path.write_bytes(
                b"PARQUET-FIXTURE"
            )

            result = (
                validate_rcaeval_staging_directory(
                    Path(
                        root
                    )
                )
            )

            self.assertTrue(
                result[
                    "stagingValidated"
                ]
            )

            self.assertFalse(
                result[
                    "contentPromoted"
                ]
            )


    def test_aira_reliability_lab_is_internal_lab_only(
        self
    ):
        value = get_workload(
            "AIRA_RELIABILITY_LAB"
        )

        self.assertEqual(
            value[
                "acquisitionType"
            ],
            "INTERNAL",
        )

        self.assertEqual(
            value[
                "sourceLocationType"
            ],
            "AIRA_INTERNAL",
        )

        self.assertEqual(
            value[
                "executionZone"
            ],
            "LAB_ONLY",
        )

        self.assertFalse(
            value[
                "sourceCloneRequired"
            ]
        )


    def test_astronomy_shop_is_approved_lab_workload(
        self
    ):
        value = get_workload(
            "OTEL_ASTRONOMY_SHOP"
        )

        self.assertEqual(
            value[
                "sourceLocationType"
            ],
            "WINDOWS_OR_LINUX",
        )

        self.assertEqual(
            value[
                "executionZone"
            ],
            "LAB_ONLY",
        )

        self.assertEqual(
            value[
                "policyStatus"
            ],
            "APPROVED_COMMERCIAL",
        )

        self.assertEqual(
            value[
                "generatedEvidenceGrade"
            ],
            "E1",
        )

        self.assertFalse(
            value[
                "executionAuthorized"
            ]
        )


    def test_deathstarbench_requires_linux_research_location(
        self
    ):
        value = get_workload(
            "DEATHSTARBENCH"
        )

        self.assertEqual(
            value[
                "sourceLocationType"
            ],
            "WSL_LINUX",
        )

        self.assertEqual(
            value[
                "executionZone"
            ],
            "RESEARCH_ONLY",
        )

        self.assertEqual(
            value[
                "policyStatus"
            ],
            "APPROVED_RESEARCH_ONLY",
        )

        self.assertEqual(
            value[
                "executionAuthorizationOwner"
            ],
            "NONE",
        )


    def test_astronomy_checkout_validation(
        self
    ):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(
                root
            )

            (
                directory
                /
                ".git"
            ).mkdir()

            (
                directory
                /
                "compose.yaml"
            ).write_text(
                "services: {}\n",
                encoding="utf-8",
            )

            (
                directory
                /
                "compose.observability.yaml"
            ).write_text(
                "services: {}\n",
                encoding="utf-8",
            )

            result = (
                validate_workload_checkout(
                    "OTEL_ASTRONOMY_SHOP",
                    directory,
                )
            )

            self.assertTrue(
                result[
                    "sourceValidated"
                ]
            )

            self.assertFalse(
                result[
                    "executionStarted"
                ]
            )


    def test_windows_validator_rejects_wsl_only_deathstarbench(
        self
    ):
        value = get_workload(
            "DEATHSTARBENCH"
        )

        self.assertEqual(
            value[
                "sourceLocationType"
            ],
            "WSL_LINUX",
        )

        self.assertFalse(
            value[
                "executionAuthorized"
            ]
        )


    def test_external_source_contract_never_grants_authority(
        self
    ):
        for workload_id in (
            "AIRA_RELIABILITY_LAB",
            "OTEL_ASTRONOMY_SHOP",
            "DEATHSTARBENCH",
        ):
            value = get_workload(
                workload_id
            )

            self.assertFalse(
                value[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                value[
                    "productionCertified"
                ]
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()