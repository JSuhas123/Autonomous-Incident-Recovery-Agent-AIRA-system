from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.corpus.coverage.external_reality_promotion import (
    EXTERNAL_REALITY_PROMOTION_VERSION,
    build_external_promotion_manifest,
    promote_google_cloud,
    promote_public_incidents,
    promote_rcaeval,
)
from intelligence.reality.corpus.rcaeval_partition_manifest import (
    EXPECTED_SUITE_COUNTS,
)


class Phase23R13ExternalRealityPromotionTests(
    unittest.TestCase
):
    def _write_jsonl(
        self,
        path: Path,
        rows,
    ):
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        path.write_text(
            "".join(
                json.dumps(
                    row
                )
                +
                "\n"

                for row
                in rows
            ),
            encoding="utf-8",
        )


    def _rcaeval_rows(
        self,
        root: Path,
    ):
        staging = (
            root
            /
            "staging"
            /
            "downloads"
            /
            "rcaeval"
        )

        staging.mkdir(
            parents=True,
            exist_ok=True,
        )

        (
            staging
            /
            "cases.parquet"
        ).write_bytes(
            b"INDEX"
        )

        rows = []

        sequence = 0

        for (
            suite,
            count,
        ) in (
            EXPECTED_SUITE_COUNTS
            .items()
        ):
            for index in range(
                count
            ):
                sequence += 1

                case = (
                    "fixture_"
                    +
                    suite.lower()
                    +
                    "_"
                    +
                    f"{sequence:04d}"
                )

                case_dir = (
                    staging
                    /
                    case
                )

                case_dir.mkdir(
                    parents=True,
                    exist_ok=True,
                )

                (
                    case_dir
                    /
                    "metrics.parquet"
                ).write_bytes(
                    b"METRIC"
                )

                (
                    case_dir
                    /
                    "inject_time.txt"
                ).write_bytes(
                    b"1"
                )

                rows.append({
                    "case":
                        case,

                    "suite":
                        suite,

                    "root_cause_service":
                        (
                            "service-"
                            f"{index % 5}"
                        ),

                    "fault":
                        (
                            "fault-"
                            f"{index % 3}"
                        ),

                    "system":
                        suite[
                            -2:
                        ].lower(),
                })

        return rows


    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            EXTERNAL_REALITY_PROMOTION_VERSION,
            "23R.13S.5.0",
        )


    def test_complete_rcaeval_is_promoted_without_ground_truth_visibility(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            result = promote_rcaeval(
                data_root=
                    root,

                rows=
                    self._rcaeval_rows(
                        root
                    ),
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                735,
            )

            self.assertEqual(
                result[
                    "missingTelemetryCount"
                ],
                0,
            )

            self.assertFalse(
                result[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                result[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                result[
                    "productionCertified"
                ]
            )

            output = (
                root
                /
                "approved"
                /
                "external-benchmarks"
                /
                "rcaeval"
                /
                "phase23r13-rcaeval-approved-cases.jsonl"
            )

            rows = [
                json.loads(
                    line
                )

                for line
                in output
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()
            ]

            self.assertEqual(
                len(
                    rows
                ),
                735,
            )

            self.assertTrue(
                all(
                    row[
                        "evidenceGrade"
                    ]
                    ==
                    "E2"

                    for row
                    in rows
                )
            )

            self.assertTrue(
                all(
                    "benchmarkCaseId"
                    not in row

                    for row
                    in rows
                )
            )

            self.assertTrue(
                all(
                    row[
                        "groundTruthAgentVisible"
                    ]
                    is False

                    for row
                    in rows
                )
            )


    def test_incomplete_rcaeval_telemetry_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            rows = self._rcaeval_rows(
                root
            )

            missing = (
                root
                /
                "staging"
                /
                "downloads"
                /
                "rcaeval"
                /
                rows[0][
                    "case"
                ]
                /
                "metrics.parquet"
            )

            missing.unlink()

            with self.assertRaises(
                ValueError
            ):
                promote_rcaeval(
                    data_root=
                        root,

                    rows=
                        rows,
                )


    def test_google_cloud_real_extract_is_promoted(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "staging"
                /
                "downloads"
                /
                "google-cluster-data"
                /
                "sample.jsonl"
            )

            rows = [
                {
                    "sampleId":
                        f"google-{index}",

                    "sampleType":
                        "RESOURCE_UTILIZATION",

                    "sourceWindow": {
                        "start":
                            f"window-{index}",

                        "end":
                            f"window-{index + 1}",
                    },

                    "evidence": [
                        {
                            "kind":
                                "METRIC",

                            "cpuUsage":
                                0.25
                                +
                                index,

                            "memoryUsage":
                                0.50
                                +
                                index,
                        }
                    ],

                    "partition":
                        "DEVELOPMENT",
                }

                for index
                in range(
                    2
                )
            ]

            self._write_jsonl(
                source,
                rows,
            )

            result = promote_google_cloud(
                data_root=
                    root,

                input_jsonl=
                    source,

                minimum_cases=
                    2,
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                2,
            )

            self.assertEqual(
                result[
                    "sourceId"
                ],
                "GOOGLE_CLUSTER_DATA",
            )

            self.assertFalse(
                result[
                    "executionAuthorized"
                ]
            )


    def test_google_cloud_insufficient_real_extract_fails(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "sample.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    {
                        "sampleId":
                            "one",

                        "sampleType":
                            "RESOURCE_UTILIZATION",

                        "sourceWindow": {
                            "start":
                                "a",

                            "end":
                                "b",
                        },

                        "evidence": [
                            {
                                "kind":
                                    "METRIC",
                            }
                        ],
                    }
                ],
            )

            with self.assertRaises(
                ValueError
            ):
                promote_google_cloud(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_cases=
                        2,
                )


    def test_public_incident_requires_verified_approved_source(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "incidents.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    {
                        "sourcePolicy": {
                            "sourceId":
                                "PUBLIC_FIXTURE",

                            "policyStatus":
                                "QUARANTINED_LICENSE_REVIEW",

                            "licenseVerified":
                                False,

                            "license":
                                "UNKNOWN",
                        }
                    }
                ],
            )

            with self.assertRaises(
                ValueError
            ):
                promote_public_incidents(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_cases=
                        1,
                )


    def test_public_incident_is_e3_and_answer_sealed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "incidents.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    {
                        "sourcePolicy": {
                            "sourceId":
                                "PUBLIC_FIXTURE",

                            "policyStatus":
                                "APPROVED_COMMERCIAL",

                            "licenseVerified":
                                True,

                            "license":
                                "CC-BY-4.0",

                            "redistributionAllowed":
                                False,
                        },

                        "organizationId":
                            "public",

                        "environmentId":
                            "historical",

                        "sourceName":
                            "Fixture Status",

                        "sourceVersion":
                            "2026-01-01",

                        "sourceUri":
                            "https://example.invalid/incident",

                        "incidentReference":
                            "fixture-1",

                        "title":
                            "Fixture incident",

                        "workload": {
                            "service":
                                "api",
                        },

                        "evidence": [
                            {
                                "artifactId":
                                    "signal-1",

                                "kind":
                                    "SIGNAL",

                                "mediaType":
                                    "application/json",

                                "historicallyAvailable":
                                    True,

                                "releaseOffsetMs":
                                    0,

                                "sourceReference":
                                    "status-page",

                                "content": {
                                    "status":
                                        "degraded",
                                },
                            }
                        ],

                        "knownFault":
                            "dependency outage",

                        "expectedDiagnosis":
                            "dependency unavailable",

                        "acceptableDiagnoses": [
                            "dependency unavailable",
                        ],

                        "expectedRecoveryFamily":
                            "WAIT_FOR_PROVIDER",

                        "groundTruthMethod":
                            "published postmortem",

                        "incidentDomain":
                            "CLOUD",

                        "partition":
                            "VALIDATION",
                    }
                ],
            )

            result = (
                promote_public_incidents(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_cases=
                        1,
                )
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                1,
            )

            output = (
                root
                /
                "approved"
                /
                "public-incidents"
                /
                "phase23r13-public-production-incidents.jsonl"
            )

            case = json.loads(
                output
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()[0]
            )

            self.assertEqual(
                case[
                    "evidenceGrade"
                ],
                "E3",
            )

            self.assertFalse(
                case[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                case[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                case[
                    "evaluationChannel"
                ][
                    "agentVisible"
                ]
            )


    def test_combined_manifest_grants_no_authority(
        self,
    ):
        manifest = (
            build_external_promotion_manifest(
                rcaeval={
                    "caseCount":
                        735,
                },

                google_cloud={
                    "caseCount":
                        500,
                },

                public_incidents={
                    "caseCount":
                        100,
                },
            )
        )

        self.assertEqual(
            manifest[
                "caseCount"
            ],
            1335,
        )

        self.assertFalse(
            manifest[
                "groundTruthAgentVisible"
            ]
        )

        self.assertFalse(
            manifest[
                "executionAuthorized"
            ]
        )

        self.assertFalse(
            manifest[
                "productionCertified"
            ]
        )

        self.assertEqual(
            len(
                manifest[
                    "manifestHash"
                ]
            ),
            64,
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()