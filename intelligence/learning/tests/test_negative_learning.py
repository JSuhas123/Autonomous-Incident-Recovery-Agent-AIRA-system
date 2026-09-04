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


def source_with_actions(
    actions,
):
    return {
        "publicId":
            "lsrc_negative",

        "sourceDigest":
            "b" * 64,

        "observationPayload":
            [],

        "assertionPayload":
            [],

        "diagnosisPayload":
            [],

        "actionPayload":
            actions,

        "verificationPayload":
            [],

        "outcomePayload":
            [],

        "executionAuthorized":
            False,
    }


class NegativeLearningTests(
    unittest.TestCase
):
    def test_failed_action_creates_negative_procedure(
        self
    ):
        result = generate_candidates(
            {
                "sourceBundle":
                    source_with_actions(
                        [
                            {
                                "eventType":
                                    "ACTION_FAILED",

                                "truthLevel":
                                    "OBSERVATION",

                                "summary":
                                    (
                                        "restart database "
                                        "primary"
                                    ),

                                "payload":
                                    {},

                                "evidenceRefs":
                                    [],
                            }
                        ]
                    )
            }
        )

        self.assertIn(
            "NEGATIVE_PROCEDURE",

            {
                item[
                    "candidateType"
                ]
                for item
                in result[
                    "candidates"
                ]
            },
        )


    def test_rejected_action_creates_contraindication(
        self
    ):
        result = generate_candidates(
            {
                "sourceBundle":
                    source_with_actions(
                        [
                            {
                                "eventType":
                                    "ACTION_REJECTED",

                                "truthLevel":
                                    "ASSERTION",

                                "summary":
                                    (
                                        "delete production "
                                        "namespace"
                                    ),

                                "payload":
                                    {},

                                "evidenceRefs":
                                    [],
                            }
                        ]
                    )
            }
        )

        self.assertIn(
            "CONTRAINDICATION",

            {
                item[
                    "candidateType"
                ]
                for item
                in result[
                    "candidates"
                ]
            },
        )


    def test_temporary_mitigation_is_not_recovery_strategy(
        self
    ):
        result = generate_candidates(
            {
                "sourceBundle":
                    source_with_actions(
                        [
                            {
                                "eventType":
                                    "MITIGATION_APPLIED",

                                "truthLevel":
                                    "OBSERVATION",

                                "summary":
                                    (
                                        "scale replicas "
                                        "to mask saturation"
                                    ),

                                "payload":
                                    {},

                                "evidenceRefs":
                                    [],
                            }
                        ]
                    )
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

        self.assertIn(
            "ANTI_PATTERN",
            types,
        )

        self.assertNotIn(
            "RECOVERY_STRATEGY",
            types,
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()