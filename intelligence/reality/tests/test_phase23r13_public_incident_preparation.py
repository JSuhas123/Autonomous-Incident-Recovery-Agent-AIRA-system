"""Phase 23R.13S.5D.2 public incident preparation tests."""

from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.reconstruction.public_incident_preparation import (
    PUBLIC_INCIDENT_PREPARATION_VERSION,
    prepare_public_incident_candidates,
)


def _row(
    incident_id: str,
    *,
    candidate: bool,
) -> dict:
    quality = (
        "EXPLICIT_ROOT_CAUSE"
        if candidate
        else
        "STATUS_FACTS_ONLY"
    )

    return {
        "sourceId":
            "GOOGLE_CLOUD_STATUS_PUBLIC_FACTS",

        "recordKind": (
            "RECENT_STRUCTURED_INCIDENT"
            if candidate
            else
            "HISTORY_REFERENCE"
        ),

        "incidentId":
            incident_id,

        "incidentDigest":
            f"digest-{incident_id}",

        "sourceUri":
            (
                "https://status.cloud.google.com/"
                f"incidents/{incident_id}"
            ),

        "affectedProducts": [
            {
                "id":
                    "p1",

                "title":
                    "Product",
            }
        ],

        "affectedLocations":
            [],

        "failureFamily":
            "UNCLASSIFIED_PUBLIC_INCIDENT",

        "evaluationEvidence": {
            "quality":
                quality,

            "groundTruthCandidate":
                candidate,
        },

        "contentStoragePolicy": {
            "mode":
                "FACTS_AND_HASHES_ONLY",

            "rawUpdateTextStored":
                False,

            "rawPostmortemStored":
                False,
        },

        "sourcePolicy": {
            "policyStatus":
                "QUARANTINED_LICENSE_REVIEW",

            "licenseVerified":
                False,

            "commercialPromotionEligible":
                False,
        },

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


class PublicIncidentPreparationTests(
    unittest.TestCase
):
    def _write_jsonl(
        self,
        path: Path,
        rows: list[
            dict
        ],
    ) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with path.open(
            "w",
            encoding="utf-8",
        ) as handle:
            for row in rows:
                handle.write(
                    json.dumps(
                        row,
                        sort_keys=True,
                    )
                    +
                    "\n"
                )

    def test_version(
        self,
    ):
        self.assertEqual(
            PUBLIC_INCIDENT_PREPARATION_VERSION,
            "23R.13S.5D.2",
        )

    def test_preparation_counts_candidates_without_certifying_them(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    _row(
                        "a",
                        candidate=True,
                    ),

                    _row(
                        "b",
                        candidate=False,
                    ),

                    _row(
                        "c",
                        candidate=False,
                    ),
                ],
            )

            result = (
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        3,
                )
            )

            self.assertEqual(
                result[
                    "sourceRecordCount"
                ],
                3,
            )

            self.assertEqual(
                result[
                    "uniqueIncidentCount"
                ],
                3,
            )

            self.assertEqual(
                result[
                    "groundTruthCandidateCount"
                ],
                1,
            )

            self.assertEqual(
                result[
                    "referenceOnlyCount"
                ],
                2,
            )

            self.assertEqual(
                result[
                    "e3CertifiableNowCount"
                ],
                0,
            )

            self.assertEqual(
                result[
                    "requiresEnrichmentCount"
                ],
                3,
            )

            self.assertFalse(
                result[
                    "licenseVerified"
                ]
            )

            self.assertFalse(
                result[
                    "commercialPromotionEligible"
                ]
            )

            self.assertFalse(
                result[
                    "executionAuthorized"
                ]
            )

    def test_prepared_rows_preserve_authority_boundaries(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    _row(
                        "a",
                        candidate=True,
                    )
                ],
            )

            result = (
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        1,
                )
            )

            output = Path(
                result[
                    "preparedArtifact"
                ][
                    "path"
                ]
            )

            row = json.loads(
                output
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()[0]
            )

            self.assertFalse(
                row[
                    "e3CertifiableNow"
                ]
            )

            self.assertFalse(
                row[
                    "commercialPromotionEligibleNow"
                ]
            )

            self.assertFalse(
                row[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                row[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                row[
                    "productionCertified"
                ]
            )

    def test_tampered_execution_authority_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            row = _row(
                "a",
                candidate=False,
            )

            row[
                "executionAuthorized"
            ] = True

            self._write_jsonl(
                source,
                [
                    row
                ],
            )

            with self.assertRaisesRegex(
                ValueError,
                "executionAuthorized",
            ):
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        1,
                )

    def test_tampered_license_status_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            row = _row(
                "a",
                candidate=False,
            )

            row[
                "sourcePolicy"
            ][
                "licenseVerified"
            ] = True

            self._write_jsonl(
                source,
                [
                    row
                ],
            )

            with self.assertRaisesRegex(
                ValueError,
                "licenseVerified",
            ):
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        1,
                )

    def test_duplicate_incident_ids_fail_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    _row(
                        "same",
                        candidate=False,
                    ),

                    _row(
                        "same",
                        candidate=True,
                    ),
                ],
            )

            with self.assertRaisesRegex(
                ValueError,
                "duplicate public incident id",
            ):
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        2,
                )

    def test_quarantined_policy_remains_quarantined(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "input.jsonl"
            )

            self._write_jsonl(
                source,
                [
                    _row(
                        "a",
                        candidate=False,
                    )
                ],
            )

            result = (
                prepare_public_incident_candidates(
                    data_root=
                        root,

                    input_jsonl=
                        source,

                    minimum_source_records=
                        1,
                )
            )

            self.assertEqual(
                result[
                    "policyStatus"
                ],
                "QUARANTINED_LICENSE_REVIEW",
            )

            self.assertFalse(
                result[
                    "licenseVerified"
                ]
            )

            self.assertFalse(
                result[
                    "commercialPromotionEligible"
                ]
            )


if __name__ == "__main__":
    unittest.main()