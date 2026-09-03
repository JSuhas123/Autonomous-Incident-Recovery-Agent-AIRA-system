from __future__ import annotations

import unittest


from intelligence.reality.corpus.integrity.content_addressing import (
    CORPUS_CONTENT_ADDRESSING_VERSION,
    build_integrity_manifest,
    sha256_bytes,
)


from intelligence.reality.corpus.partitioning.partition_policy import (
    CORPUS_PARTITION_POLICY_VERSION,
    assign_partition,
)


class Phase23R13PartitionIntegrityTests(
    unittest.TestCase
):
    def _eligibility(
        self,
        **overrides,
    ):
        value = {
            "researchEligible":
                True,

            "modelTrainingEligible":
                False,

            "retrievalEligible":
                True,

            "developmentEvaluationEligible":
                True,

            "validationEligible":
                True,

            "holdoutEligible":
                False,

            "productionCertificationEligible":
                False,

            "customerRuntimeEligible":
                False,

            "redistributionAllowed":
                False,

            "agentGroundTruthVisible":
                False,
        }

        value.update(
            overrides
        )

        return value


    def test_versions_are_frozen(
        self,
    ):
        self.assertEqual(
            CORPUS_PARTITION_POLICY_VERSION,
            "23R.13Q.0",
        )

        self.assertEqual(
            CORPUS_CONTENT_ADDRESSING_VERSION,
            "23R.13R.0",
        )


    def test_retrieval_assignment(
        self,
    ):
        result = assign_partition(
            case_id=
                "case-1",

            eligibility=
                self._eligibility(),

            partition=
                "RETRIEVAL",

            policy_status=
                "APPROVED_COMMERCIAL",
        )

        self.assertEqual(
            result[
                "partition"
            ],
            "RETRIEVAL",
        )

        self.assertFalse(
            result[
                "executionAuthorized"
            ]
        )


    def test_final_holdout_is_sealed(
        self,
    ):
        result = assign_partition(
            case_id=
                "case-h",

            eligibility=
                self._eligibility(
                    retrievalEligible=
                        False,

                    developmentEvaluationEligible=
                        False,

                    validationEligible=
                        False,

                    holdoutEligible=
                        True,
                ),

            partition=
                "HOLDOUT",

            policy_status=
                "APPROVED_COMMERCIAL",

            is_final_holdout=
                True,
        )

        self.assertTrue(
            result[
                "isFinalHoldout"
            ]
        )


    def test_holdout_contamination_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            assign_partition(
                case_id=
                    "case-h",

                eligibility=
                    self._eligibility(
                        holdoutEligible=
                            True,
                    ),

                partition=
                    "HOLDOUT",

                policy_status=
                    "APPROVED_COMMERCIAL",

                is_final_holdout=
                    True,
            )


    def test_research_only_rejected_from_commercial_partition_plane(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            assign_partition(
                case_id=
                    "case-r",

                eligibility=
                    self._eligibility(),

                partition=
                    "RETRIEVAL",

                policy_status=
                    "APPROVED_RESEARCH_ONLY",
            )


    def test_ground_truth_visibility_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            assign_partition(
                case_id=
                    "case-x",

                eligibility=
                    self._eligibility(
                        agentGroundTruthVisible=
                            True,
                    ),

                partition=
                    "RETRIEVAL",

                policy_status=
                    "APPROVED_COMMERCIAL",
            )


    def test_integrity_manifest_is_deterministic(
        self,
    ):
        first = build_integrity_manifest(
            artifact_id=
                "artifact-1",

            source_id=
                "RCAEVAL",

            media_type=
                "application/json",

            payload=
                b"fixture",

            parent_case_id=
                "case-1",

            seed=
                13,
        )

        second = build_integrity_manifest(
            artifact_id=
                "artifact-1",

            source_id=
                "RCAEVAL",

            media_type=
                "application/json",

            payload=
                b"fixture",

            parent_case_id=
                "case-1",

            seed=
                13,
        )

        self.assertEqual(
            first[
                "contentHash"
            ],
            second[
                "contentHash"
            ],
        )

        self.assertEqual(
            first[
                "manifestHash"
            ],
            second[
                "manifestHash"
            ],
        )

        self.assertEqual(
            first[
                "contentHash"
            ],
            sha256_bytes(
                b"fixture"
            ),
        )


    def test_integrity_manifest_never_grants_authority(
        self,
    ):
        value = build_integrity_manifest(
            artifact_id=
                "artifact-1",

            source_id=
                "RCAEVAL",

            media_type=
                "application/octet-stream",

            payload=
                b"x",
        )

        self.assertFalse(
            value[
                "trustedGroundTruth"
            ]
        )

        self.assertFalse(
            value[
                "executionAuthorized"
            ]
        )

        self.assertFalse(
            value[
                "productionCertified"
            ]
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()