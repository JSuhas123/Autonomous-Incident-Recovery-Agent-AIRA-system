"""Phase 23R.13S.5D.3/5D.4 Wikimedia incident tests."""

from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.datasets.public_incidents.wikimedia_incident_reconstruction import (
    WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION,
    build_wikimedia_reconstruction_row,
)
from intelligence.reality.corpus.coverage.external_reality_promotion import (
    promote_public_incidents,
)


_FIXTURE = """
== Summary ==
The API service was unavailable due to an incorrect configuration rollout.

== Timeline ==
* 10:00 UTC - Monitoring detected elevated API error rates.
* 10:05 UTC - Engineers confirmed API requests were returning HTTP 503.
* 10:10 UTC - The faulty configuration was identified.
* 10:20 UTC - The configuration was reverted and service recovered.

== Conclusions ==
The outage was caused by an incorrect configuration rollout.

== Actionables ==
* Improve pre-deployment validation.
"""


def _page() -> dict:
    return {
        "pageId":
            123,

        "title":
            "Incidents/2026-01-01 API",

        "revisionId":
            456,

        "revisionTimestamp":
            "2026-01-02T10:00:00Z",

        "wikitext":
            _FIXTURE,
    }


class WikimediaPublicIncidentTests(
    unittest.TestCase
):
    def test_version(
        self,
    ):
        self.assertEqual(
            WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION,
            "23R.13S.5D.3-4.0",
        )

    def test_builds_source_backed_e3_input(
        self,
    ):
        row = (
            build_wikimedia_reconstruction_row(
                _page(),
                sequence=1,
            )
        )

        self.assertIsNotNone(
            row
        )

        self.assertEqual(
            row[
                "incidentDomain"
            ],
            "CI_CD",
        )

        self.assertEqual(
            row[
                "expectedRecoveryFamily"
            ],
            "ROLLBACK_OR_REVERT",
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

    def test_license_is_verified_and_commercial(
        self,
    ):
        row = (
            build_wikimedia_reconstruction_row(
                _page(),
                sequence=1,
            )
        )

        policy = row[
            "sourcePolicy"
        ]

        self.assertEqual(
            policy[
                "policyStatus"
            ],
            "APPROVED_COMMERCIAL",
        )

        self.assertTrue(
            policy[
                "licenseVerified"
            ]
        )

        self.assertEqual(
            policy[
                "license"
            ],
            "CC-BY-SA-4.0",
        )

        self.assertTrue(
            policy[
                "commercialUseAllowed"
            ]
        )

        self.assertTrue(
            policy[
                "shareAlikeRequired"
            ]
        )

    def test_ground_truth_is_not_in_visible_evidence(
        self,
    ):
        row = (
            build_wikimedia_reconstruction_row(
                _page(),
                sequence=1,
            )
        )

        visible = json.dumps(
            row[
                "evidence"
            ]
        ).lower()

        self.assertNotIn(
            "outage was caused by",
            visible,
        )

        self.assertIn(
            "monitoring detected",
            visible,
        )

    def test_requires_timeline(
        self,
    ):
        page = _page()

        page[
            "wikitext"
        ] = """
== Summary ==
The service failed due to bad configuration.

== Conclusions ==
The outage was caused by bad configuration.
"""

        row = (
            build_wikimedia_reconstruction_row(
                page,
                sequence=1,
            )
        )

        self.assertIsNone(
            row
        )

    def test_requires_source_backed_ground_truth(
        self,
    ):
        page = _page()

        page[
            "wikitext"
        ] = """
== Summary ==
Users experienced intermittent errors.

== Timeline ==
* 10:00 UTC - Elevated errors detected.
* 10:20 UTC - Service recovered.
"""

        row = (
            build_wikimedia_reconstruction_row(
                page,
                sequence=1,
            )
        )

        self.assertIsNone(
            row
        )

    def test_existing_public_promotion_accepts_output(
        self,
    ):
        row = (
            build_wikimedia_reconstruction_row(
                _page(),
                sequence=1,
            )
        )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(
                tmp
            )

            source = (
                root
                /
                "wikimedia.jsonl"
            )

            source.write_text(
                (
                    json.dumps(
                        row,
                        sort_keys=True,
                    )
                    +
                    "\n"
                ),
                encoding="utf-8",
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

            promoted = json.loads(
                output
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()[0]
            )

            self.assertEqual(
                promoted[
                    "evidenceGrade"
                ],
                "E3",
            )

            self.assertFalse(
                promoted[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                promoted[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                promoted[
                    "evaluationChannel"
                ][
                    "agentVisible"
                ]
            )


if __name__ == "__main__":
    unittest.main()