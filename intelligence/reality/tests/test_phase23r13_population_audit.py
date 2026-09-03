from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from intelligence.reality.corpus.coverage.population_audit import (
    CORPUS_POPULATION_AUDIT_VERSION,
    PopulationRequirement,
    audit_population,
)


class Phase23R13PopulationAuditTests(
    unittest.TestCase
):
    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            CORPUS_POPULATION_AUDIT_VERSION,
            "23R.13S.1.0",
        )


    def test_missing_required_fails_readiness(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            result = audit_population(
                data_root=
                    tmp,

                requirements=(
                    PopulationRequirement(
                        "REQ",
                        "required",
                        "TEST",
                        True,
                    ),
                ),
            )

            self.assertFalse(
                result[
                    "summary"
                ][
                    "readyForCoverageCertification"
                ]
            )

            self.assertEqual(
                result[
                    "summary"
                ][
                    "missingRequired"
                ],
                [
                    "REQ"
                ],
            )


    def test_optional_missing_does_not_fail_readiness(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            result = audit_population(
                data_root=
                    tmp,

                requirements=(
                    PopulationRequirement(
                        "OPT",
                        "optional",
                        "TEST",
                        False,
                    ),
                ),
            )

            self.assertTrue(
                result[
                    "summary"
                ][
                    "readyForCoverageCertification"
                ]
            )

            self.assertEqual(
                result[
                    "summary"
                ][
                    "missingOptional"
                ],
                [
                    "OPT"
                ],
            )


    def test_populated_directory_counts_files_and_bytes(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            target = (
                root
                /
                "generated"
                /
                "integration-translation"
            )

            target.mkdir(
                parents=True
            )

            (
                target
                /
                "one.json"
            ).write_bytes(
                b"abc"
            )

            (
                target
                /
                "two.json"
            ).write_bytes(
                b"12345"
            )

            result = audit_population(
                data_root=
                    root,

                requirements=(
                    PopulationRequirement(
                        "INTEGRATION_TRANSLATION",
                        "generated/integration-translation",
                        "TEST",
                        True,
                        2,
                    ),
                ),
            )

            entry = result[
                "entries"
            ][0]

            self.assertTrue(
                entry[
                    "populated"
                ]
            )

            self.assertEqual(
                entry[
                    "fileCount"
                ],
                2,
            )

            self.assertEqual(
                entry[
                    "totalBytes"
                ],
                8,
            )

            self.assertTrue(
                result[
                    "summary"
                ][
                    "integrationTranslationPopulated"
                ]
            )


    def test_audit_hash_is_deterministic(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            requirements = (
                PopulationRequirement(
                    "OPT",
                    "optional",
                    "TEST",
                    False,
                ),
            )

            first = audit_population(
                data_root=
                    tmp,

                requirements=
                    requirements,
            )

            second = audit_population(
                data_root=
                    tmp,

                requirements=
                    requirements,
            )

            self.assertEqual(
                first[
                    "auditHash"
                ],
                second[
                    "auditHash"
                ],
            )


    def test_no_authority_is_granted(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            result = audit_population(
                data_root=
                    tmp,

                requirements=
                    (),
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


if (
    __name__
    ==
    "__main__"
):
    unittest.main()