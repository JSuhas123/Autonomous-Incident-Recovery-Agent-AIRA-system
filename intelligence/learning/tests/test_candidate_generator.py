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


if (
    PROJECT_ROOT
    not in
    sys.path
):
    sys.path.insert(
        0,
        PROJECT_ROOT,
    )


from intelligence.learning.candidate_generator import (  # noqa: E402
    generate_candidates,
)

from intelligence.learning.contracts import (  # noqa: E402
    LearningGenerationError,
)


def bundle(
    **overrides,
):
    base = {
        "publicId":
            "lsrc_001",

        "sourceDigest":
            "a" * 64,

        "observationPayload": [
            {
                "eventType":
                    "QUERY_PERFORMED",

                "truthLevel":
                    "OBSERVATION",

                "summary":
                    "kubectl describe pod api-123",

                "payload":
                    {},

                "evidenceRefs":
                    [],
            },

            {
                "eventType":
                    "EVIDENCE_OBSERVED",

                "truthLevel":
                    "OBSERVATION",

                "summary":
                    (
                        "CrashLoopBackOff with "
                        "config parse error"
                    ),

                "payload":
                    {},

                "evidenceRefs": [
                    "log_1",
                ],
            },
        ],

        "assertionPayload": [
            {
                "eventType":
                    "DIAGNOSIS_DECLARED",

                "truthLevel":
                    "ASSERTION",

                "summary":
                    (
                        "invalid application "
                        "configuration"
                    ),

                "payload":
                    {},

                "evidenceRefs":
                    [],
            }
        ],

        "diagnosisPayload": [
            {
                "eventType":
                    "DIAGNOSIS_DECLARED",

                "truthLevel":
                    "ASSERTION",

                "summary":
                    (
                        "invalid application "
                        "configuration"
                    ),

                "payload":
                    {},

                "evidenceRefs":
                    [],
            }
        ],

        "actionPayload": [
            {
                "eventType":
                    "ROOT_FIX_APPLIED",

                "truthLevel":
                    "OBSERVATION",

                "summary":
                    (
                        "restore previous "
                        "configuration"
                    ),

                "payload":
                    {},

                "evidenceRefs":
                    [],
            }
        ],

        "verificationPayload": [
            {
                "eventType":
                    "VERIFICATION_PERFORMED",

                "truthLevel":
                    "OBSERVATION",

                "summary":
                    (
                        "deployment stable for "
                        "verification window"
                    ),

                "payload":
                    {},

                "evidenceRefs":
                    [],
            }
        ],

        "outcomePayload":
            [],

        "executionAuthorized":
            False,
    }

    base.update(
        overrides
    )

    return base


class CandidateGeneratorTests(
    unittest.TestCase
):
    def test_generation_is_deterministic(
        self
    ):
        request = {
            "sourceBundle":
                bundle(),

            "executionAuthorized":
                False,
        }

        self.assertEqual(
            generate_candidates(
                request
            ),

            generate_candidates(
                request
            ),
        )


    def test_positive_candidates_remain_untrusted(
        self
    ):
        result = generate_candidates(
            {
                "sourceBundle":
                    bundle(),
            }
        )

        self.assertGreater(
            result[
                "candidateCount"
            ],
            0,
        )

        self.assertFalse(
            result[
                "executionAuthorized"
            ]
        )

        for candidate in result[
            "candidates"
        ]:
            self.assertEqual(
                candidate[
                    "truthLevel"
                ],
                "CANDIDATE",
            )

            self.assertFalse(
                candidate[
                    "executionAuthorized"
                ]
            )

            self.assertNotEqual(
                candidate[
                    "knowledgeScope"
                ],
                "GLOBAL",
            )


    def test_succeeded_action_alone_is_not_root_fix(
        self
    ):
        source = bundle(
            actionPayload=[
                {
                    "eventType":
                        "ACTION_SUCCEEDED",

                    "truthLevel":
                        "OBSERVATION",

                    "summary":
                        "restart pod",

                    "payload":
                        {},

                    "evidenceRefs":
                        [],
                }
            ]
        )

        result = generate_candidates(
            {
                "sourceBundle":
                    source,
            }
        )

        types = {
            item[
                "candidateType"
            ]
            for item
            in result[
                "candidates"
            ]
        }

        self.assertNotIn(
            "RECOVERY_STRATEGY",
            types,
        )


    def test_insufficient_bundle_can_generate_zero_candidates(
        self
    ):
        source = bundle(
            observationPayload=[],
            assertionPayload=[],
            diagnosisPayload=[],
            actionPayload=[],
            verificationPayload=[],
            outcomePayload=[],
        )

        result = generate_candidates(
            {
                "sourceBundle":
                    source,
            }
        )

        self.assertEqual(
            result[
                "candidateCount"
            ],
            0,
        )

        self.assertEqual(
            result[
                "candidates"
            ],
            [],
        )


    def test_authority_input_is_rejected(
        self
    ):
        with self.assertRaises(
            LearningGenerationError
        ) as caught:
            generate_candidates(
                {
                    "sourceBundle":
                        bundle(),

                    "executionAuthorized":
                        True,
                }
            )

        self.assertEqual(
            caught
                .exception
                .code,

            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()