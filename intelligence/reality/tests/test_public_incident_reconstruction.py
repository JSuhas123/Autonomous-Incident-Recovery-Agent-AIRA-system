"""AIRA Phase 23R.8 public incident reconstruction certification tests."""

from __future__ import annotations

import os
import sys
import unittest


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

if PROJECT_ROOT not in sys.path:
    sys.path.insert(
        0,
        PROJECT_ROOT,
    )


from intelligence.reality.adapters.registry import (  # noqa: E402
    normalize_dataset,
)

from intelligence.reality.normalization.reality_case_normalizer import (  # noqa: E402
    RealityNormalizationError,
)

from intelligence.reality.reconstruction.public_incident_reconstruction import (  # noqa: E402
    PUBLIC_INCIDENT_RECONSTRUCTION_VERSION,
    build_public_incident_dataset,
)


def build_dataset():
    return build_public_incident_dataset(
        organization_id=
            "org_test",

        environment_id=
            "env_test",

        source_name=
            "Public Engineering Postmortem",

        source_version=
            "2026-09",

        source_uri=
            "https://example.invalid/postmortem",

        source_license=
            "SOURCE_TERMS",

        incident_reference=
            "incident-42",

        title=
            "Reconstructed public service disruption",

        workload={
            "platform":
                "distributed-service",

            "serviceClass":
                "api",
        },

        evidence=[
            {
                "artifactId":
                    "signal_1",

                "kind":
                    "SIGNAL",

                "mediaType":
                    "application/json",

                "content":
                    '{"severity":"critical"}',

                "sourceReference":
                    "status update 1",

                "historicallyAvailable":
                    True,

                "releaseOffsetMs":
                    0,
            },

            {
                "artifactId":
                    "metric_1",

                "kind":
                    "METRIC",

                "mediaType":
                    "application/json",

                "content":
                    '{"errorRate":0.31}',

                "sourceReference":
                    "status update 2",

                "historicallyAvailable":
                    True,

                "releaseOffsetMs":
                    120000,
            },
        ],

        known_fault=
            "dependency saturation",

        expected_diagnosis=
            "upstream dependency saturation",

        acceptable_diagnoses=[
            "dependency saturation",
            "upstream dependency saturation",
        ],

        expected_recovery_family=
            "DEPENDENCY_RECOVERY",

        ground_truth_method=
            "published postmortem conclusion",
    )


class PublicIncidentReconstructionTests(
    unittest.TestCase
):
    def test_version(
        self
    ):
        self.assertEqual(
            PUBLIC_INCIDENT_RECONSTRUCTION_VERSION,
            "23R.8.0",
        )

    def test_builder_produces_e3_public_timeline(
        self
    ):
        raw = build_dataset()

        self.assertEqual(
            raw[
                "rawFormat"
            ],
            "PUBLIC_INCIDENT_TIMELINE_V1",
        )

        self.assertEqual(
            raw[
                "case"
            ][
                "evidenceGrade"
            ],
            "E3",
        )

        self.assertEqual(
            raw[
                "source"
            ][
                "sourceKind"
            ],
            "PUBLIC_INCIDENT_RECONSTRUCTION",
        )

    def test_timeline_preserves_historical_release_order(
        self
    ):
        raw = build_dataset()

        offsets = [
            event[
                "offsetMs"
            ]

            for event in raw[
                "case"
            ][
                "timeline"
            ]
        ]

        self.assertEqual(
            offsets,
            [
                0,
                120000,
            ],
        )

    def test_normalization_seals_postmortem_truth(
        self
    ):
        normalized = normalize_dataset(
            build_dataset()
        )

        self.assertEqual(
            normalized[
                "realityCase"
            ][
                "evidenceGrade"
            ],
            "E3",
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

        self.assertEqual(
            normalized[
                "realityCase"
            ][
                "sealedEvaluation"
            ][
                "knownFault"
            ],
            "dependency saturation",
        )

        self.assertFalse(
            normalized[
                "executionAuthorized"
            ]
        )

    def test_visible_evidence_contains_no_postmortem_kind(
        self
    ):
        evidence = [
            {
                "artifactId":
                    "signal_1",

                "kind":
                    "SIGNAL",

                "mediaType":
                    "application/json",

                "content":
                    '{"severity":"critical"}',

                "sourceReference":
                    "status update 1",

                "historicallyAvailable":
                    True,

                "releaseOffsetMs":
                    0,
            },

            {
                "artifactId":
                    "answer",

                "kind":
                    "POSTMORTEM",

                "mediaType":
                    "text/plain",

                "content":
                    "final root cause",

                "sourceReference":
                    "final postmortem",

                "historicallyAvailable":
                    True,

                "releaseOffsetMs":
                    180000,
            },
        ]

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            build_public_incident_dataset(
                organization_id=
                    "org_test",

                environment_id=
                    "env_test",

                source_name=
                    "Public Engineering Postmortem",

                source_version=
                    "2026-09",

                source_uri=
                    "https://example.invalid/postmortem",

                source_license=
                    "SOURCE_TERMS",

                incident_reference=
                    "incident-42",

                title=
                    "Reconstructed public service disruption",

                workload={
                    "platform":
                        "distributed-service",
                },

                evidence=
                    evidence,

                known_fault=
                    "dependency saturation",

                expected_diagnosis=
                    "dependency saturation",

                acceptable_diagnoses=[
                    "dependency saturation",
                ],

                expected_recovery_family=
                    "DEPENDENCY_RECOVERY",

                ground_truth_method=
                    "published postmortem conclusion",
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_PUBLIC_INCIDENT_VISIBLE_KIND_FORBIDDEN",
        )

    def test_nonhistorical_evidence_is_rejected(
        self
    ):
        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            build_public_incident_dataset(
                organization_id=
                    "org_test",

                environment_id=
                    "env_test",

                source_name=
                    "Source",

                source_version=
                    "1",

                source_uri=
                    "https://example.invalid/source",

                source_license=
                    "SOURCE_TERMS",

                incident_reference=
                    "incident-1",

                title=
                    "Incident",

                workload={
                    "platform":
                        "distributed-service",
                },

                evidence=[
                    {
                        "artifactId":
                            "future_evidence",

                        "kind":
                            "LOG",

                        "mediaType":
                            "text/plain",

                        "content":
                            "revealed later",

                        "sourceReference":
                            "postmortem appendix",

                        "historicallyAvailable":
                            False,

                        "releaseOffsetMs":
                            1000,
                    }
                ],

                known_fault=
                    "fault",

                expected_diagnosis=
                    "diagnosis",

                acceptable_diagnoses=[
                    "diagnosis",
                ],

                expected_recovery_family=
                    "NO_ACTION",

                ground_truth_method=
                    "postmortem",
            )

        self.assertEqual(
            captured.exception.code,
            "REALITY_PUBLIC_INCIDENT_EVIDENCE_NOT_HISTORICAL",
        )

    def test_case_identity_is_opaque_and_deterministic(
        self
    ):
        first = build_dataset()

        second = build_dataset()

        self.assertEqual(
            first[
                "case"
            ][
                "caseId"
            ],
            second[
                "case"
            ][
                "caseId"
            ],
        )

        self.assertTrue(
            first[
                "case"
            ][
                "caseId"
            ].startswith(
                "public_incident_"
            )
        )

        self.assertNotIn(
            "dependency",
            first[
                "case"
            ][
                "caseId"
            ].lower(),
        )


if __name__ == "__main__":
    unittest.main()