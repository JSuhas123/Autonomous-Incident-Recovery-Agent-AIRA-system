from __future__ import annotations

import hashlib
import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.corpus.coverage.corpus_coverage_certification import (
    certify_corpus_inventory,
)
from intelligence.reality.corpus.coverage.corpus_freeze import (
    CORPUS_FREEZE_VERSION,
    build_corpus_freeze,
    write_corpus_freeze,
)


class Phase23R13CorpusFreezeTests(
    unittest.TestCase
):
    def _eligibility(
        self,
        *,
        holdout=False,
    ):
        return {
            "researchEligible":
                True,

            "modelTrainingEligible":
                False,

            "retrievalEligible":
                not holdout,

            "developmentEvaluationEligible":
                not holdout,

            "validationEligible":
                not holdout,

            "holdoutEligible":
                holdout,

            "productionCertificationEligible":
                False,

            "customerRuntimeEligible":
                False,

            "redistributionAllowed":
                False,

            "agentGroundTruthVisible":
                False,
        }


    def _write_fixture(
        self,
        root: Path,
    ):
        sources = [
            {
                "sourceId":
                    "SOURCE",

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "licenseVerified":
                    True,

                "license":
                    "TEST",
            }
        ]

        cases = []

        roles = [
            "INDEPENDENT_BENCHMARK",
            "EXECUTABLE_WORKLOAD",
            "HEALTHY_BASELINE",
            "NOISY_DERIVATIVE",
            "MULTI_FAULT",
            "CASCADING_FAILURE",
            "AMBIGUOUS_EVIDENCE",
            "RECOVERY_OUTCOME",
            "CLOUD_BEHAVIOUR",
            "LOG_DIVERSITY",
            "INTEGRATION_TRANSLATION",
            "PRODUCTION_RECONSTRUCTION",
        ]

        providers = [
            "PROMETHEUS",
            "ALERTMANAGER",
            "GRAFANA",
            "OPENTELEMETRY",
            "DATADOG",
            "CLOUDWATCH",
            "AZURE_MONITOR",
            "GCP_MONITORING",
            "PAGERDUTY",
            "SLACK",
            "GITHUB",
            "CI_CD",
            "KUBERNETES",
            "DOCKER",
            "RABBITMQ",
            "REDIS",
            "POSTGRESQL",
        ]

        for (
            index,
            role,
        ) in enumerate(
            roles
        ):
            cases.append({
                "caseId":
                    f"case-{index}",

                "sourceId":
                    "SOURCE",

                "corpusRole":
                    role,

                "evidenceGrade":
                    (
                        "E1"
                        if index == 0
                        else
                        "E3"
                        if index == 1
                        else
                        "E2"
                    ),

                "partition":
                    (
                        "RETRIEVAL"
                        if index == 0
                        else
                        "VALIDATION"
                        if index == 1
                        else
                        "DEVELOPMENT"
                    ),

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "integrityManifestHash":
                    "a" * 64,

                "eligibility":
                    self._eligibility(),

                "providerFamily":
                    providers[
                        index
                        %
                        len(
                            providers
                        )
                    ],

                "independentEvidence":
                    False,

                "groundTruthAgentVisible":
                    False,

                "executionAuthorized":
                    False,

                "productionCertified":
                    False,
            })

        for (
            index,
            provider,
        ) in enumerate(
            providers,
            start=100,
        ):
            cases.append({
                "caseId":
                    f"provider-{index}",

                "sourceId":
                    "SOURCE",

                "corpusRole":
                    "INTEGRATION_TRANSLATION",

                "evidenceGrade":
                    "E2",

                "partition":
                    "DEVELOPMENT",

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "integrityManifestHash":
                    "b" * 64,

                "eligibility":
                    self._eligibility(),

                "providerFamily":
                    provider,

                "independentEvidence":
                    False,

                "groundTruthAgentVisible":
                    False,

                "executionAuthorized":
                    False,

                "productionCertified":
                    False,
            })

        for index in range(
            50
        ):
            cases.append({
                "caseId":
                    f"holdout-{index}",

                "sourceId":
                    "SOURCE",

                "corpusRole":
                    "FINAL_HOLDOUT",

                "evidenceGrade":
                    "E2",

                "partition":
                    "HOLDOUT",

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "integrityManifestHash":
                    "c" * 64,

                "eligibility":
                    self._eligibility(
                        holdout=True
                    ),

                "isFinalHoldout":
                    True,

                "independentEvidence":
                    True,

                "groundTruthAgentVisible":
                    False,

                "executionAuthorized":
                    False,

                "productionCertified":
                    False,
            })

        minimums = {
            role:
                1

            for role
            in roles
        }

        minimums[
            "FINAL_HOLDOUT"
        ] = (
            50
        )

        certification = (
            certify_corpus_inventory(
                sources=
                    sources,

                cases=
                    cases,

                minimum_case_counts=
                    minimums,

                required_provider_families=
                    providers,
            )
        )

        inventory_core = {
            "version":
                "23R.13S.6.0",

            "sources":
                sources,

            "cases":
                cases,

            "physicalSummary": {
                "physicalArtifacts": {
                    "fixture": {
                        "path":
                            str(
                                root
                                /
                                "fixture.jsonl"
                            ),

                        "byteSize":
                            10,

                        "sha256":
                            "d" * 64,
                    }
                }
            },

            "safety": {
                "groundTruthAgentVisible":
                    False,

                "executionAuthorized":
                    False,

                "productionCertified":
                    False,
            },
        }

        inventory_hash = (
            hashlib.sha256(
                json.dumps(
                    inventory_core,
                    sort_keys=True,
                    separators=(
                        ",",
                        ":",
                    ),
                    ensure_ascii=False,
                ).encode(
                    "utf-8"
                )
            ).hexdigest()
        )

        inventory = {
            **inventory_core,

            "inventoryHash":
                inventory_hash,
        }

        inventory_path = (
            root
            /
            "manifests"
            /
            "phase23r13-corpus-inventory.json"
        )

        certification_path = (
            root
            /
            "certification"
            /
            "phase23r13-corpus-coverage.json"
        )

        inventory_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        certification_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        inventory_path.write_text(
            json.dumps(
                inventory
            )
            +
            "\n",
            encoding="utf-8",
        )

        certification_path.write_text(
            json.dumps(
                certification
            )
            +
            "\n",
            encoding="utf-8",
        )

        return (
            inventory_path,
            certification_path,
        )


    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            CORPUS_FREEZE_VERSION,
            "23R.13U.0",
        )


    def test_passing_certified_inventory_can_freeze(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = (
                Path(
                    tmp
                )
            )

            self._write_fixture(
                root
            )

            freeze = (
                build_corpus_freeze(
                    data_root=
                        root
                )
            )

            self.assertEqual(
                freeze[
                    "status"
                ],
                "FROZEN",
            )

            self.assertEqual(
                freeze[
                    "phaseGate"
                ],
                "23R.13U",
            )

            self.assertEqual(
                freeze[
                    "inventorySummary"
                ][
                    "finalHoldoutCount"
                ],
                50,
            )

            self.assertFalse(
                freeze[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                freeze[
                    "productionCertified"
                ]
            )


    def test_holdout_retrieval_leak_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = (
                Path(
                    tmp
                )
            )

            (
                inventory_path,
                _,
            ) = self._write_fixture(
                root
            )

            inventory = (
                json.loads(
                    inventory_path
                    .read_text(
                        encoding="utf-8"
                    )
                )
            )

            holdout = next(
                case

                for case
                in inventory[
                    "cases"
                ]

                if (
                    case.get(
                        "isFinalHoldout"
                    )
                    is True
                )
            )

            holdout[
                "eligibility"
            ][
                "retrievalEligible"
            ] = True

            core = {
                key:
                    value

                for (
                    key,
                    value,
                ) in inventory.items()

                if key
                !=
                "inventoryHash"
            }

            inventory[
                "inventoryHash"
            ] = (
                hashlib.sha256(
                    json.dumps(
                        core,
                        sort_keys=True,
                        separators=(
                            ",",
                            ":",
                        ),
                        ensure_ascii=False,
                    ).encode(
                        "utf-8"
                    )
                ).hexdigest()
            )

            inventory_path.write_text(
                json.dumps(
                    inventory
                )
                +
                "\n",
                encoding="utf-8",
            )

            with self.assertRaises(
                ValueError
            ):
                build_corpus_freeze(
                    data_root=
                        root
                )


    def test_failed_coverage_cannot_freeze(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = (
                Path(
                    tmp
                )
            )

            (
                _,
                certification_path,
            ) = self._write_fixture(
                root
            )

            certification = (
                json.loads(
                    certification_path
                    .read_text(
                        encoding="utf-8"
                    )
                )
            )

            certification[
                "passed"
            ] = False

            certification_path.write_text(
                json.dumps(
                    certification
                )
                +
                "\n",
                encoding="utf-8",
            )

            with self.assertRaises(
                ValueError
            ):
                build_corpus_freeze(
                    data_root=
                        root
                )


    def test_write_creates_freeze_manifest(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = (
                Path(
                    tmp
                )
            )

            self._write_fixture(
                root
            )

            result = (
                write_corpus_freeze(
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
                    "phase23r13t"
                ],
                "PASS",
            )

            self.assertEqual(
                result[
                    "phase23r13u"
                ],
                "FROZEN",
            )

            self.assertTrue(
                (
                    root
                    /
                    "manifests"
                    /
                    "phase23r13-corpus-freeze.json"
                ).is_file()
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()