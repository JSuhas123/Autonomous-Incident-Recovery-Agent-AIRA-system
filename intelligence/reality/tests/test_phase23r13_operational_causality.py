from __future__ import annotations

import unittest

from intelligence.reality.generation.ambiguous.ambiguous_evidence import (
    AMBIGUOUS_EVIDENCE_VERSION,
    build_ambiguous_evidence_case,
)

from intelligence.reality.generation.cascading.cascading_failure import (
    CASCADING_FAILURE_VERSION,
    build_cascading_failure_case,
)

from intelligence.reality.generation.multi_fault.multi_fault import (
    MULTI_FAULT_VERSION,
    build_multi_fault_case,
)

from intelligence.reality.generation.recovery.recovery_outcome import (
    RECOVERY_OUTCOME_VERSION,
    build_recovery_outcome_case,
)

from intelligence.reality.generation.operational_case_common import (
    OPERATIONAL_CASE_COMMON_VERSION,
)


class Phase23R13OperationalCausalityTests(
    unittest.TestCase
):
    def _eligibility(
        self,
    ):
        return {
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
                True,

            "productionCertificationEligible":
                False,

            "customerRuntimeEligible":
                False,

            "redistributionAllowed":
                False,

            "agentGroundTruthVisible":
                False,
        }


    def _lineage(
        self,
    ):
        return {
            "policyStatus":
                "APPROVED_COMMERCIAL",

            "hasFinalHoldoutAncestor":
                False,

            "hasResearchOnlyAncestor":
                False,

            "eligibility":
                self._eligibility(),
        }


    def _parent(
        self,
        case_id="parent-1",
        grade="E2",
    ):
        return {
            "caseId":
                case_id,

            "caseDigest":
                f"digest-{case_id}",

            "scenario":
                "INCIDENT",

            "evidenceGrade":
                grade,
        }


    def test_versions_are_frozen(
        self,
    ):
        self.assertEqual(
            OPERATIONAL_CASE_COMMON_VERSION,
            "23R.13I-L.0",
        )

        self.assertEqual(
            MULTI_FAULT_VERSION,
            "23R.13I.0",
        )

        self.assertEqual(
            CASCADING_FAILURE_VERSION,
            "23R.13J.0",
        )

        self.assertEqual(
            AMBIGUOUS_EVIDENCE_VERSION,
            "23R.13K.0",
        )

        self.assertEqual(
            RECOVERY_OUTCOME_VERSION,
            "23R.13L.0",
        )


    def test_multi_fault_requires_multiple_parents(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_multi_fault_case(
                parent_cases=[
                    self._parent()
                ],

                root_faults=[
                    {
                        "faultId":
                            "f1",
                    },
                    {
                        "faultId":
                            "f2",
                    },
                ],

                combined_evidence=[
                    {
                        "kind":
                            "METRIC",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    1,
            )


    def test_multi_fault_requires_distinct_root_faults(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_multi_fault_case(
                parent_cases=[
                    self._parent(
                        "p1"
                    ),
                    self._parent(
                        "p2"
                    ),
                ],

                root_faults=[
                    {
                        "faultId":
                            "same",
                    },
                    {
                        "faultId":
                            "same",
                    },
                ],

                combined_evidence=[
                    {
                        "kind":
                            "METRIC",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    2,
            )


    def test_multi_fault_uses_weakest_parent_grade(
        self,
    ):
        result = build_multi_fault_case(
            parent_cases=[
                self._parent(
                    "p1",
                    "E1",
                ),
                self._parent(
                    "p2",
                    "E3",
                ),
            ],

            root_faults=[
                {
                    "faultId":
                        "network-latency",
                },
                {
                    "faultId":
                        "memory-pressure",
                },
            ],

            combined_evidence=[
                {
                    "kind":
                        "METRIC",
                }
            ],

            lineage_policy=
                self._lineage(),

            seed=
                3,
        )

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E1",
        )

        self.assertEqual(
            result[
                "faultCardinality"
            ],
            2,
        )

        self.assertFalse(
            result[
                "independentEvidence"
            ]
        )


    def test_multi_fault_is_deterministic(
        self,
    ):
        kwargs = {
            "parent_cases": [
                self._parent(
                    "p1"
                ),
                self._parent(
                    "p2"
                ),
            ],

            "root_faults": [
                {
                    "faultId":
                        "db-latency",
                },
                {
                    "faultId":
                        "pod-crash",
                },
            ],

            "combined_evidence": [
                {
                    "kind":
                        "LOG",
                }
            ],

            "lineage_policy":
                self._lineage(),

            "seed":
                4,
        }

        first = build_multi_fault_case(
            **kwargs
        )

        second = build_multi_fault_case(
            **kwargs
        )

        self.assertEqual(
            first[
                "caseId"
            ],
            second[
                "caseId"
            ],
        )


    def test_cascade_requires_exactly_one_root(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_cascading_failure_case(
                parent_case=
                    self._parent(),

                causal_chain=[
                    {
                        "nodeId":
                            "a",

                        "nodeType":
                            "PRIMARY_SYMPTOM",
                    },
                    {
                        "nodeId":
                            "b",

                        "nodeType":
                            "DOWNSTREAM_FAILURE",
                    },
                ],

                evidence=[
                    {
                        "kind":
                            "TRACE",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    5,
            )


    def test_cascade_root_must_be_first(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_cascading_failure_case(
                parent_case=
                    self._parent(),

                causal_chain=[
                    {
                        "nodeId":
                            "a",

                        "nodeType":
                            "PRIMARY_SYMPTOM",
                    },
                    {
                        "nodeId":
                            "b",

                        "nodeType":
                            "ROOT_FAULT",
                    },
                ],

                evidence=[
                    {
                        "kind":
                            "TRACE",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    6,
            )


    def test_cascade_preserves_parent_grade(
        self,
    ):
        result = build_cascading_failure_case(
            parent_case=
                self._parent(
                    grade="E2"
                ),

            causal_chain=[
                {
                    "nodeId":
                        "root",

                    "nodeType":
                        "ROOT_FAULT",
                },
                {
                    "nodeId":
                        "queue",

                    "nodeType":
                        "QUEUE_GROWTH",
                },
                {
                    "nodeId":
                        "downstream",

                    "nodeType":
                        "DOWNSTREAM_FAILURE",
                },
            ],

            evidence=[
                {
                    "kind":
                        "TRACE",
                }
            ],

            lineage_policy=
                self._lineage(),

            seed=
                7,
        )

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertEqual(
            result[
                "causalDepth"
            ],
            3,
        )

        self.assertFalse(
            result[
                "executionAuthorized"
            ]
        )


    def test_ambiguous_signal_cannot_equal_root_cause(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_ambiguous_evidence_case(
                parent_case=
                    self._parent(),

                ambiguity_type=
                    "ALARMING_NON_ROOT_SIGNAL",

                visible_evidence=[
                    {
                        "kind":
                            "ALERT",
                    }
                ],

                alarming_signal_id=
                    "same",

                evaluator_root_cause={
                    "causeId":
                        "same",
                },

                lineage_policy=
                    self._lineage(),

                seed=
                    8,
            )


    def test_ambiguous_ground_truth_is_sealed(
        self,
    ):
        result = build_ambiguous_evidence_case(
            parent_case=
                self._parent(),

            ambiguity_type=
                "ALARMING_NON_ROOT_SIGNAL",

            visible_evidence=[
                {
                    "kind":
                        "ALERT",

                    "signalId":
                        "cpu-high",
                }
            ],

            alarming_signal_id=
                "cpu-high",

            evaluator_root_cause={
                "causeId":
                    "db-lock",

                "summary":
                    "database lock contention",
            },

            lineage_policy=
                self._lineage(),

            seed=
                9,
        )

        self.assertTrue(
            result[
                "evaluationChannel"
            ][
                "sealed"
            ]
        )

        self.assertFalse(
            result[
                "evaluationChannel"
            ][
                "agentVisible"
            ]
        )

        self.assertFalse(
            result[
                "groundTruthAgentVisible"
            ]
        )


    def test_ambiguous_case_preserves_parent_grade(
        self,
    ):
        result = build_ambiguous_evidence_case(
            parent_case=
                self._parent(
                    grade="E3"
                ),

            ambiguity_type=
                "COMPETING_HYPOTHESES",

            visible_evidence=[
                {
                    "kind":
                        "LOG",
                }
            ],

            alarming_signal_id=
                "gateway-errors",

            evaluator_root_cause={
                "causeId":
                    "dns-failure",
            },

            lineage_policy=
                self._lineage(),

            seed=
                10,
        )

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E3",
        )

        self.assertFalse(
            result[
                "independentEvidence"
            ]
        )


    def test_recovery_requires_complete_lifecycle(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_recovery_outcome_case(
                parent_case=
                    self._parent(),

                diagnosis={},

                proposed_recovery={
                    "action":
                        "restart",
                },

                authorization_record={
                    "decision":
                        "APPROVED",
                },

                execution_record={
                    "status":
                        "SUCCEEDED",
                },

                verification_record={
                    "status":
                        "PASS",
                },

                post_recovery_trajectory=[
                    {
                        "t":
                            1,
                    }
                ],

                recovery_outcome=
                    "SUCCESS",

                evidence=[
                    {
                        "kind":
                            "METRIC",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    11,
            )


    def test_recovery_rejects_unknown_outcome(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_recovery_outcome_case(
                parent_case=
                    self._parent(),

                diagnosis={
                    "cause":
                        "x",
                },

                proposed_recovery={
                    "action":
                        "restart",
                },

                authorization_record={
                    "decision":
                        "APPROVED",
                },

                execution_record={
                    "status":
                        "SUCCEEDED",
                },

                verification_record={
                    "status":
                        "PASS",
                },

                post_recovery_trajectory=[
                    {
                        "t":
                            1,
                    }
                ],

                recovery_outcome=
                    "MAGIC",

                evidence=[
                    {
                        "kind":
                            "METRIC",
                    }
                ],

                lineage_policy=
                    self._lineage(),

                seed=
                    12,
            )


    def test_recovery_record_never_grants_future_authority(
        self,
    ):
        result = build_recovery_outcome_case(
            parent_case=
                self._parent(),

            diagnosis={
                "cause":
                    "memory-pressure",
            },

            proposed_recovery={
                "action":
                    "restartDeployment",
            },

            authorization_record={
                "decision":
                    "APPROVED",
            },

            execution_record={
                "status":
                    "SUCCEEDED",
            },

            verification_record={
                "status":
                    "PASS",
            },

            post_recovery_trajectory=[
                {
                    "t":
                        1,

                    "state":
                        "RECOVERED",
                }
            ],

            recovery_outcome=
                "SUCCESS",

            evidence=[
                {
                    "kind":
                        "METRIC",
                }
            ],

            lineage_policy=
                self._lineage(),

            seed=
                13,
        )

        self.assertEqual(
            result[
                "recoveryOutcome"
            ],
            "SUCCESS",
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


    def test_failed_recovery_is_first_class_outcome(
        self,
    ):
        result = build_recovery_outcome_case(
            parent_case=
                self._parent(),

            diagnosis={
                "cause":
                    "dependency-failure",
            },

            proposed_recovery={
                "action":
                    "restart",
            },

            authorization_record={
                "decision":
                    "APPROVED",
            },

            execution_record={
                "status":
                    "SUCCEEDED",
            },

            verification_record={
                "status":
                    "FAIL",
            },

            post_recovery_trajectory=[
                {
                    "t":
                        1,

                    "state":
                        "UNHEALTHY",
                }
            ],

            recovery_outcome=
                "FAILURE",

            evidence=[
                {
                    "kind":
                        "LOG",
                }
            ],

            lineage_policy=
                self._lineage(),

            seed=
                14,
        )

        self.assertEqual(
            result[
                "recoveryOutcome"
            ],
            "FAILURE",
        )


    def test_ground_truth_malformed_lineage_fails_closed(
        self,
    ):
        malformed = self._lineage()

        malformed[
            "eligibility"
        ][
            "agentGroundTruthVisible"
        ] = True

        with self.assertRaises(
            ValueError
        ):
            build_ambiguous_evidence_case(
                parent_case=
                    self._parent(),

                ambiguity_type=
                    "CONFLICTING_SIGNALS",

                visible_evidence=[
                    {
                        "kind":
                            "ALERT",
                    }
                ],

                alarming_signal_id=
                    "alert-1",

                evaluator_root_cause={
                    "causeId":
                        "cause-2",
                },

                lineage_policy=
                    malformed,

                seed=
                    15,
            )


if __name__ == "__main__":
    unittest.main()