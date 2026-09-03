from __future__ import annotations

import unittest

from intelligence.reality.corpus.contamination.contamination_firewall import (
    derive_lineage_policy,
)

from intelligence.reality.corpus.policy.eligibility import (
    case_eligibility,
)

from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)

from intelligence.reality.generation.healthy.healthy_baseline import (
    HEALTHY_BASELINE_VERSION,
    build_healthy_baseline_case,
)

from intelligence.reality.generation.noise.noisy_derivative import (
    NOISY_DERIVATIVE_VERSION,
    build_noisy_derivative,
)


class Phase23R13HealthyNoiseTests(
    unittest.TestCase
):
    def _commercial_eligibility(
        self
    ):
        return case_eligibility(
            get_source(
                "AIRA_RELIABILITY_LAB"
            ),
            corpus_role=
                "HEALTHY_BASELINE",
        )


    def _healthy_case(
        self
    ):
        policy = (
            self
            ._commercial_eligibility()
        )

        return build_healthy_baseline_case(
            source_id=
                "AIRA_RELIABILITY_LAB",

            workload_id=
                "AIRA_RELIABILITY_LAB",

            scenario_type=
                "STEADY_TRAFFIC",

            evidence_grade=
                "E1",

            evidence=[
                {
                    "kind":
                        "METRIC",

                    "name":
                        "request_rate",

                    "value":
                        120,
                },
                {
                    "kind":
                        "METRIC",

                    "name":
                        "error_rate",

                    "value":
                        0.001,
                },
            ],

            eligibility=
                policy[
                    "eligibility"
                ],

            seed=
                2313,
        )


    def test_versions_are_frozen(
        self
    ):
        self.assertEqual(
            HEALTHY_BASELINE_VERSION,
            "23R.13G.0",
        )

        self.assertEqual(
            NOISY_DERIVATIVE_VERSION,
            "23R.13H.0",
        )


    def test_healthy_baseline_requires_no_incident(
        self
    ):
        case = (
            self
            ._healthy_case()
        )

        self.assertEqual(
            case[
                "scenario"
            ],
            "HEALTHY",
        )

        self.assertFalse(
            case[
                "expectedOutcome"
            ][
                "incidentExpected"
            ]
        )

        self.assertFalse(
            case[
                "expectedOutcome"
            ][
                "recoveryExpected"
            ]
        )

        self.assertFalse(
            case[
                "expectedOutcome"
            ][
                "humanEscalationExpected"
            ]
        )

        self.assertEqual(
            case[
                "expectedOutcome"
            ][
                "recommendedDisposition"
            ],
            "CONTINUE_OBSERVATION",
        )


    def test_healthy_case_is_deterministic(
        self
    ):
        first = (
            self
            ._healthy_case()
        )

        second = (
            self
            ._healthy_case()
        )

        self.assertEqual(
            first[
                "caseId"
            ],
            second[
                "caseId"
            ],
        )

        self.assertEqual(
            first[
                "caseDigest"
            ],
            second[
                "caseDigest"
            ],
        )


    def test_healthy_baseline_grants_no_authority(
        self
    ):
        case = (
            self
            ._healthy_case()
        )

        self.assertFalse(
            case[
                "executionAuthorized"
            ]
        )

        self.assertFalse(
            case[
                "productionCertified"
            ]
        )


    def test_noise_derivative_preserves_grade(
        self
    ):
        parent = (
            self
            ._healthy_case()
        )

        policy = derive_lineage_policy([
            {
                "sourceId":
                    parent[
                        "sourceId"
                    ],

                "caseId":
                    parent[
                        "caseId"
                    ],

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "corpusRole":
                    parent[
                        "corpusRole"
                    ],

                "isFinalHoldout":
                    False,

                "eligibility":
                    parent[
                        "eligibility"
                    ],
            }
        ])

        child = build_noisy_derivative(
            parent_case=
                parent,

            transformation_type=
                "MISSING_EVIDENCE",

            observability_class=
                "DEGRADED",

            transformation_version=
                "23R.11.0",

            seed=
                100,

            transformed_evidence=[
                parent[
                    "evidence"
                ][
                    0
                ]
            ],

            lineage_policy=
                policy,
        )

        self.assertEqual(
            child[
                "evidenceGrade"
            ],
            "E1",
        )

        self.assertFalse(
            child[
                "independentEvidence"
            ]
        )


    def test_noise_derivative_is_deterministic(
        self
    ):
        parent = (
            self
            ._healthy_case()
        )

        policy = derive_lineage_policy([
            {
                "sourceId":
                    parent[
                        "sourceId"
                    ],

                "caseId":
                    parent[
                        "caseId"
                    ],

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "corpusRole":
                    parent[
                        "corpusRole"
                    ],

                "isFinalHoldout":
                    False,

                "eligibility":
                    parent[
                        "eligibility"
                    ],
            }
        ])

        kwargs = {
            "parent_case":
                parent,

            "transformation_type":
                "DUPLICATE_ALERTS",

            "observability_class":
                "DEGRADED",

            "transformation_version":
                "23R.11.0",

            "seed":
                44,

            "transformed_evidence":
                parent[
                    "evidence"
                ],

            "lineage_policy":
                policy,
        }

        first = build_noisy_derivative(
            **kwargs
        )

        second = build_noisy_derivative(
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

        self.assertEqual(
            first[
                "transformation"
            ][
                "digest"
            ],
            second[
                "transformation"
            ][
                "digest"
            ],
        )


    def test_noise_does_not_change_healthy_truth(
        self
    ):
        parent = (
            self
            ._healthy_case()
        )

        policy = derive_lineage_policy([
            {
                "sourceId":
                    parent[
                        "sourceId"
                    ],

                "caseId":
                    parent[
                        "caseId"
                    ],

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "corpusRole":
                    parent[
                        "corpusRole"
                    ],

                "isFinalHoldout":
                    False,

                "eligibility":
                    parent[
                        "eligibility"
                    ],
            }
        ])

        child = build_noisy_derivative(
            parent_case=
                parent,

            transformation_type=
                "DELAYED_EVIDENCE",

            observability_class=
                "SEVERE",

            transformation_version=
                "23R.11.0",

            seed=
                19,

            transformed_evidence=[],

            lineage_policy=
                policy,
        )

        self.assertEqual(
            child[
                "scenario"
            ],
            "HEALTHY",
        )

        self.assertFalse(
            child[
                "expectedOutcome"
            ][
                "incidentExpected"
            ]
        )

        self.assertFalse(
            child[
                "expectedOutcome"
            ][
                "recoveryExpected"
            ]
        )


    def test_noise_cannot_expose_ground_truth(
        self
    ):
        parent = (
            self
            ._healthy_case()
        )

        policy = derive_lineage_policy([
            {
                "sourceId":
                    parent[
                        "sourceId"
                    ],

                "caseId":
                    parent[
                        "caseId"
                    ],

                "policyStatus":
                    "APPROVED_COMMERCIAL",

                "corpusRole":
                    parent[
                        "corpusRole"
                    ],

                "isFinalHoldout":
                    False,

                "eligibility":
                    {
                        **parent[
                            "eligibility"
                        ],

                        "agentGroundTruthVisible":
                            True,
                    },
            }
        ])

        self.assertFalse(
            policy[
                "eligibility"
            ][
                "agentGroundTruthVisible"
            ]
        )


    def test_research_parent_remains_research_after_noise(
        self
    ):
        source = get_source(
            "LOGHUB"
        )

        source_policy = case_eligibility(
            source,
            corpus_role=
                "RESEARCH_EXPERIMENT",
        )

        lineage = derive_lineage_policy([
            source_policy
        ])

        self.assertEqual(
            lineage[
                "policyStatus"
            ],
            "APPROVED_RESEARCH_ONLY",
        )

        self.assertFalse(
            lineage[
                "eligibility"
            ][
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            lineage[
                "eligibility"
            ][
                "productionCertificationEligible"
            ]
        )


    def test_holdout_parent_remains_retrieval_isolated(
        self
    ):
        source = get_source(
            "RCAEVAL"
        )

        holdout = case_eligibility(
            source,
            corpus_role=
                "FINAL_HOLDOUT",
        )

        lineage = derive_lineage_policy([
            holdout
        ])

        self.assertTrue(
            lineage[
                "hasFinalHoldoutAncestor"
            ]
        )

        self.assertFalse(
            lineage[
                "eligibility"
            ][
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            lineage[
                "eligibility"
            ][
                "developmentEvaluationEligible"
            ]
        )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()