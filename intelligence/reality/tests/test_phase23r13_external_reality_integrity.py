from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.corpus.coverage.external_reality_integrity import (
    EXTERNAL_REALITY_INTEGRITY_VERSION,
    build_certified_external_promotion_manifest,
    certify_external_reality,
    write_external_reality_certification,
)


class Phase23R13ExternalRealityIntegrityTests(
    unittest.TestCase
):
    def _write_json(
        self,
        path: Path,
        value,
    ):
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        path.write_text(
            json.dumps(
                value
            )
            +
            "\n",
            encoding="utf-8",
        )

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

    def _fixture(
        self,
        root: Path,
    ):
        integrity_hash = (
            "a"
            *
            64
        )

        self._write_jsonl(
            root
            /
            "approved"
            /
            "external-benchmarks"
            /
            "rcaeval"
            /
            "phase23r13-rcaeval-approved-cases.jsonl",
            [
                {
                    "caseId":
                        f"rcaeval-{index:04d}",

                    "evidenceGrade":
                        "E2",

                    "independentEvidence":
                        True,

                    "groundTruthAgentVisible":
                        False,

                    "executionAuthorized":
                        False,

                    "productionCertified":
                        False,

                    "integrityManifestHash":
                        integrity_hash,
                }

                for index
                in range(
                    735
                )
            ],
        )

        self._write_json(
            root
            /
            "approved"
            /
            "external-benchmarks"
            /
            "rcaeval"
            /
            "phase23r13-rcaeval-evaluator-manifest.json",
            {
                "sealedEvaluatorOnly":
                    True,

                "agentGroundTruthVisible":
                    False,
            },
        )

        self._write_jsonl(
            root
            /
            "approved"
            /
            "cloud-traces"
            /
            "google"
            /
            "phase23r13-google-cloud-behaviour.jsonl",
            [
                {
                    "caseId":
                        f"google-{index:04d}",

                    "evidenceGrade":
                        "E2",

                    "independentEvidence":
                        True,

                    "groundTruthAgentVisible":
                        False,

                    "executionAuthorized":
                        False,

                    "productionCertified":
                        False,

                    "integrityManifestHash":
                        integrity_hash,
                }

                for index
                in range(
                    500
                )
            ],
        )

        self._write_json(
            root
            /
            "approved"
            /
            "public-incidents"
            /
            "phase23r13-public-source-policy-manifest.json",
            {
                "sources": [
                    {
                        "sourceId":
                            "WIKIMEDIA_WIKITECH_INCIDENTS",

                        "policyStatus":
                            "APPROVED_COMMERCIAL",

                        "licenseVerified":
                            True,

                        "license":
                            "CC-BY-SA-4.0",
                    }
                ],

                "executionAuthorized":
                    False,

                "productionCertified":
                    False,
            },
        )

        self._write_jsonl(
            root
            /
            "approved"
            /
            "public-incidents"
            /
            "phase23r13-public-production-incidents.jsonl",
            [
                {
                    "caseId":
                        f"public-{index:04d}",

                    "corpusRole":
                        "PRODUCTION_RECONSTRUCTION",

                    "evidenceGrade":
                        "E3",

                    "independentEvidence":
                        False,

                    "sourceId":
                        "WIKIMEDIA_WIKITECH_INCIDENTS",

                    "policyStatus":
                        "APPROVED_COMMERCIAL",

                    "publicSources": [
                        {
                            "sourceId":
                                "WIKIMEDIA_WIKITECH_INCIDENTS",

                            "sourceUri":
                                (
                                    "https://wikitech.wikimedia.org/"
                                    "wiki/Incidents/example"
                                ),

                            "sourceName":
                                (
                                    "Wikimedia Wikitech "
                                    "Incident Documentation"
                                ),

                            "license":
                                "CC-BY-SA-4.0",

                            "licenseVerified":
                                True,
                        }
                    ],

                    "evaluationChannel": {
                        "agentVisible":
                            False,

                        "sealed":
                            True,
                    },

                    "evidenceChannel": {
                        "agentVisible":
                            True,

                        "evidence": [
                            {
                                "artifactId":
                                    "timeline-0001-01",

                                "kind":
                                    "LOG",

                                "mediaType":
                                    "application/json",

                                "provenance": {
                                    "historicallyAvailable":
                                        True,

                                    "historicalReleaseOffsetMs":
                                        0,

                                    "sourceReference":
                                        (
                                            "https://wikitech."
                                            "wikimedia.org/wiki/"
                                            "Incidents/example"
                                        ),
                                },

                                "content": {
                                    "observation":
                                        "Production alert fired."
                                },
                            }
                        ],
                    },

                    "groundTruthAgentVisible":
                        False,

                    "executionAuthorized":
                        False,

                    "productionCertified":
                        False,

                    "integrityManifestHash":
                        integrity_hash,
                }

                for index
                in range(
                    100
                )
            ],
        )

    def test_version(
        self,
    ):
        self.assertEqual(
            EXTERNAL_REALITY_INTEGRITY_VERSION,
            "23R.13S.5E.0",
        )

    def test_complete_external_reality_passes(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            self._fixture(
                root
            )

            result = (
                certify_external_reality(
                    data_root=
                        root
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
                1335,
            )

            self.assertEqual(
                result[
                    "componentCounts"
                ][
                    "RCAEVAL"
                ],
                735,
            )

            self.assertEqual(
                result[
                    "componentCounts"
                ][
                    "GOOGLE_CLUSTER_DATA"
                ],
                500,
            )

            self.assertEqual(
                result[
                    "componentCounts"
                ][
                    "PUBLIC_INCIDENTS"
                ],
                100,
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

    def test_public_ground_truth_visibility_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            self._fixture(
                root
            )

            path = (
                root
                /
                "approved"
                /
                "public-incidents"
                /
                "phase23r13-public-production-incidents.jsonl"
            )

            rows = [
                json.loads(
                    line
                )

                for line
                in path
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()
            ]

            rows[0][
                "evaluationChannel"
            ][
                "agentVisible"
            ] = True

            self._write_jsonl(
                path,
                rows,
            )

            with self.assertRaises(
                ValueError
            ):
                certify_external_reality(
                    data_root=
                        root
                )

    def test_non_historical_promoted_evidence_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            self._fixture(
                root
            )

            path = (
                root
                /
                "approved"
                /
                "public-incidents"
                /
                "phase23r13-public-production-incidents.jsonl"
            )

            rows = [
                json.loads(
                    line
                )

                for line
                in path
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()
            ]

            rows[0][
                "evidenceChannel"
            ][
                "evidence"
            ][0][
                "provenance"
            ][
                "historicallyAvailable"
            ] = False

            self._write_jsonl(
                path,
                rows,
            )

            with self.assertRaises(
                ValueError
            ):
                certify_external_reality(
                    data_root=
                        root
                )

    def test_staging_historical_field_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            self._fixture(
                root
            )

            path = (
                root
                /
                "approved"
                /
                "public-incidents"
                /
                "phase23r13-public-production-incidents.jsonl"
            )

            rows = [
                json.loads(
                    line
                )

                for line
                in path
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()
            ]

            rows[0][
                "evidenceChannel"
            ][
                "evidence"
            ][0][
                "historicallyAvailable"
            ] = True

            self._write_jsonl(
                path,
                rows,
            )

            with self.assertRaises(
                ValueError
            ):
                certify_external_reality(
                    data_root=
                        root
                )

    def test_combined_manifest_requires_pass(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_certified_external_promotion_manifest(
                certification={
                    "status":
                        "FAIL",
                }
            )

    def test_write_freezes_certification_and_combined_manifest(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            self._fixture(
                root
            )

            result = (
                write_external_reality_certification(
                    data_root=
                        root
                )
            )

            self.assertEqual(
                result[
                    "phase23r13s5d"
                ],
                "PASS",
            )

            self.assertEqual(
                result[
                    "phase23r13s5e"
                ],
                "PASS",
            )

            self.assertEqual(
                result[
                    "phase23r13s5f"
                ],
                "PASS",
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                1335,
            )

            self.assertTrue(
                (
                    root
                    /
                    "manifests"
                    /
                    (
                        "phase23r13-external-"
                        "reality-integrity-"
                        "certification.json"
                    )
                ).is_file()
            )

            self.assertTrue(
                (
                    root
                    /
                    "manifests"
                    /
                    (
                        "phase23r13-external-"
                        "reality-promotion-"
                        "manifest.json"
                    )
                ).is_file()
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()