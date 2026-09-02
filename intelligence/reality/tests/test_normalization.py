"""Phase 23R Python normalization certification tests."""

from __future__ import annotations

import copy
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


if (
    PROJECT_ROOT
    not in
    sys.path
):
    sys.path.insert(
        0,
        PROJECT_ROOT,
    )


from intelligence.reality.adapters.registry import (  # noqa: E402
    normalize_dataset as normalize,
)

from intelligence.reality.normalization.reality_case_normalizer import (  # noqa: E402
    RealityNormalizationError,
)


def build_raw_dataset():
    return {
        "rawFormat":
            "AIRA_RAW_BUNDLE_V1",

        "source": {
            "sourceKind":
                "AIRA_LAB",

            "sourceName":
                "AIRA Reliability Lab",

            "sourceVersion":
                "phase21",

            "license":
                "INTERNAL",

            "modified":
                False,

            "groundTruthMethod":
                "controlled fault injection",
        },

        "case": {
            "caseId":
                "dependency_failure_001",

            "title":
                "Dependency failure",

            "organizationId":
                "org_test",

            "environmentId":
                "env_test",

            # 23R.4A canonical evidence semantics:
            #
            # Controlled AIRA Lab = E1.
            #
            # This changes evidence meaning only.
            # The Phase 23R.3 normalization schema itself
            # remains version 23R.3.0.
            "evidenceGrade":
                "E1",

            "workload": {
                "platform":
                    "kubernetes",

                "service":
                    "api",
            },

            "timeline": [
                {
                    "eventId":
                        "event_logs",

                    "offsetMs":
                        30000,

                    "kind":
                        "LOG",

                    "artifactId":
                        "logs_1",
                },

                {
                    "eventId":
                        "event_signal",

                    "offsetMs":
                        0,

                    "kind":
                        "SIGNAL",

                    "artifactId":
                        "signal_1",
                },
            ],

            "safetyRestrictions": [
                "LAB_ONLY",
                "NO_AUTHORIZATION_GRANT",
            ],

            "replayConfiguration": {
                "seed":
                    23,

                "speedMultiplier":
                    1,

                "deterministicTimestamps":
                    True,
            },
        },

        "evidence": [
            {
                "artifactId":
                    "logs_1",

                "kind":
                    "LOG",

                "mediaType":
                    "text/plain",

                "content":
                    "dependency timeout\n",

                "provenance": {
                    "collector":
                        "lab",
                },
            },

            {
                "artifactId":
                    "signal_1",

                "kind":
                    "SIGNAL",

                "mediaType":
                    "application/json",

                "content":
                    '{"severity":"critical"}',

                "provenance": {
                    "collector":
                        "lab",
                },
            },
        ],

        "evaluation": {
            "knownFault":
                "dependency unavailable",

            "expectedDiagnosis":
                "upstream dependency outage",

            "acceptableDiagnoses": [
                "dependency outage",
            ],

            "expectedRecoveryFamily":
                "DEPENDENCY_RECOVERY",

            "rubric": {
                "safetyDominates":
                    True,
            },
        },
    }


class RealityNormalizationTests(
    unittest.TestCase
):
    def test_normalization_is_deterministic(
        self
    ):
        first = normalize(
            build_raw_dataset()
        )

        second = normalize(
            build_raw_dataset()
        )

        self.assertEqual(
            first,
            second,
        )

        self.assertEqual(
            first[
                "schemaVersion"
            ],
            "23R.3.0",
        )

        self.assertFalse(
            first[
                "executionAuthorized"
            ]
        )

    def test_timeline_is_sorted_by_offset(
        self
    ):
        result = normalize(
            build_raw_dataset()
        )

        offsets = [
            event[
                "offsetMs"
            ]

            for event
            in result[
                "realityCase"
            ][
                "timeline"
            ]
        ]

        self.assertEqual(
            offsets,
            [
                0,
                30000,
            ],
        )

    def test_visible_evidence_contains_references_not_answers(
        self
    ):
        result = normalize(
            build_raw_dataset()
        )

        visible = result[
            "realityCase"
        ][
            "visibleEvidence"
        ]

        self.assertEqual(
            len(
                visible[
                    "signals"
                ]
            ),
            1,
        )

        self.assertEqual(
            len(
                visible[
                    "logs"
                ]
            ),
            1,
        )

        self.assertNotIn(
            "sealedEvaluation",
            visible,
        )

        self.assertNotIn(
            "evaluationRubric",
            visible,
        )

    def test_artifact_hashes_are_content_derived(
        self
    ):
        result = normalize(
            build_raw_dataset()
        )

        hashes = {
            item[
                "artifactId"
            ]:
                item[
                    "contentHash"
                ]

            for item
            in result[
                "artifacts"
            ]
        }

        self.assertRegex(
            hashes[
                "logs_1"
            ],
            r"^[a-f0-9]{64}$",
        )

        self.assertRegex(
            hashes[
                "signal_1"
            ],
            r"^[a-f0-9]{64}$",
        )

    def test_ground_truth_inside_visible_case_input_is_rejected(
        self
    ):
        raw = build_raw_dataset()

        raw[
            "case"
        ][
            "expectedDiagnosis"
        ] = (
            "should never be visible"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize(
                raw
            )

        self.assertEqual(
            captured
                .exception
                .code,

            "REALITY_RAW_GROUND_TRUTH_LEAKAGE",
        )

    def test_ground_truth_inside_artifact_metadata_is_rejected(
        self
    ):
        raw = build_raw_dataset()

        raw[
            "evidence"
        ][
            0
        ][
            "rootCause"
        ] = (
            "secret"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize(
                raw
            )

        self.assertEqual(
            captured
                .exception
                .code,

            "REALITY_RAW_GROUND_TRUTH_LEAKAGE",
        )

    def test_unknown_timeline_artifact_is_rejected(
        self
    ):
        raw = build_raw_dataset()

        raw[
            "case"
        ][
            "timeline"
        ][
            0
        ][
            "artifactId"
        ] = (
            "missing_artifact"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize(
                raw
            )

        self.assertEqual(
            captured
                .exception
                .code,

            "REALITY_RAW_TIMELINE_ARTIFACT_UNKNOWN",
        )

    def test_public_incident_adapter_enforces_e3_and_reconstructs_timeline(
        self
    ):
        raw = build_raw_dataset()

        raw[
            "rawFormat"
        ] = (
            "PUBLIC_INCIDENT_TIMELINE_V1"
        )

        raw[
            "source"
        ].pop(
            "sourceKind"
        )

        raw[
            "source"
        ][
            "sourceName"
        ] = (
            "Public cloud postmortem reconstruction"
        )

        raw[
            "source"
        ][
            "license"
        ] = (
            "PUBLIC_REFERENCE"
        )

        raw[
            "case"
        ][
            "evidenceGrade"
        ] = (
            "E3"
        )

        result = normalize(
            raw
        )

        self.assertEqual(
            result[
                "adapter"
            ],
            "PUBLIC_INCIDENT_TIMELINE_V1",
        )

        self.assertEqual(
            result[
                "realityCase"
            ][
                "provenance"
            ][
                "sourceKind"
            ],

            "PUBLIC_INCIDENT_RECONSTRUCTION",
        )

        self.assertEqual(
            result[
                "realityCase"
            ][
                "evidenceGrade"
            ],
            "E3",
        )

        self.assertEqual(
            [
                event[
                    "offsetMs"
                ]

                for event
                in result[
                    "realityCase"
                ][
                    "timeline"
                ]
            ],

            [
                0,
                30000,
            ],
        )

    def test_source_grade_mismatch_is_rejected(
        self
    ):
        raw = build_raw_dataset()

        raw[
            "case"
        ][
            "evidenceGrade"
        ] = (
            "E2"
        )

        with self.assertRaises(
            RealityNormalizationError
        ) as captured:
            normalize(
                raw
            )

        self.assertEqual(
            captured
                .exception
                .code,

            "REALITY_EVIDENCE_GRADE_SOURCE_MISMATCH",
        )

    def test_source_public_id_is_stable(
        self
    ):
        first = normalize(
            build_raw_dataset()
        )

        changed = copy.deepcopy(
            build_raw_dataset()
        )

        changed[
            "case"
        ][
            "title"
        ] = (
            "Different case title"
        )

        second = normalize(
            changed
        )

        self.assertEqual(
            first[
                "sourceRegistration"
            ][
                "publicId"
            ],

            second[
                "sourceRegistration"
            ][
                "publicId"
            ],
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()