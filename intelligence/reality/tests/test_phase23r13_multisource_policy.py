from __future__ import annotations

import unittest

from intelligence.reality.corpus.contamination.contamination_firewall import (
    CONTAMINATION_FIREWALL_VERSION,
    derive_lineage_policy,
)

from intelligence.reality.corpus.policy.corpus_policy import (
    CORPUS_POLICY_VERSION,
    destination_zone_for_status,
)

from intelligence.reality.corpus.policy.eligibility import (
    ELIGIBILITY_POLICY_VERSION,
    case_eligibility,
)

from intelligence.reality.corpus.registry.source_registry import (
    SOURCE_REGISTRY_VERSION,
    get_source,
)


class Phase23R13MultiSourcePolicyTests(
    unittest.TestCase
):
    def test_versions_are_frozen(
        self
    ):
        self.assertEqual(
            CORPUS_POLICY_VERSION,
            "23R.13A.0",
        )

        self.assertEqual(
            SOURCE_REGISTRY_VERSION,
            "23R.13C.0",
        )

        self.assertEqual(
            ELIGIBILITY_POLICY_VERSION,
            "23R.13D.0",
        )

        self.assertEqual(
            CONTAMINATION_FIREWALL_VERSION,
            "23R.13D.1",
        )


    def test_rcaeval_is_one_approved_external_source(
        self
    ):
        source = get_source(
            "RCAEVAL"
        )

        self.assertEqual(
            source[
                "destinationZone"
            ],
            "APPROVED",
        )

        self.assertEqual(
            source[
                "defaultCorpusRole"
            ],
            "INDEPENDENT_BENCHMARK",
        )

        self.assertEqual(
            source[
                "defaultEvidenceGrade"
            ],
            "E2",
        )


    def test_research_only_data_routes_to_research_zone(
        self
    ):
        source = get_source(
            "LOGHUB"
        )

        self.assertEqual(
            source[
                "policyStatus"
            ],
            "APPROVED_RESEARCH_ONLY",
        )

        self.assertEqual(
            source[
                "destinationZone"
            ],
            "RESEARCH_ONLY",
        )


    def test_unverified_data_routes_to_quarantine(
        self
    ):
        source = get_source(
            "GAIA"
        )

        self.assertEqual(
            source[
                "destinationZone"
            ],
            "QUARANTINE",
        )


    def test_research_only_case_cannot_enter_commercial_runtime(
        self
    ):
        source = get_source(
            "AIOPS_CHALLENGE_2020"
        )

        decision = case_eligibility(
            source,
            corpus_role=
                "RESEARCH_EXPERIMENT",
        )

        eligibility = decision[
            "eligibility"
        ]

        self.assertTrue(
            eligibility[
                "researchEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "customerRuntimeEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "productionCertificationEligible"
            ]
        )


    def test_final_holdout_isolated_from_retrieval_and_development(
        self
    ):
        source = get_source(
            "RCAEVAL"
        )

        decision = case_eligibility(
            source,
            corpus_role=
                "FINAL_HOLDOUT",
        )

        eligibility = decision[
            "eligibility"
        ]

        self.assertTrue(
            eligibility[
                "holdoutEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "modelTrainingEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "developmentEvaluationEligible"
            ]
        )

        self.assertFalse(
            eligibility[
                "validationEligible"
            ]
        )


    def test_research_parent_taints_derived_case(
        self
    ):
        commercial = case_eligibility(
            get_source(
                "RCAEVAL"
            ),
            corpus_role=
                "INDEPENDENT_BENCHMARK",
        )

        research = case_eligibility(
            get_source(
                "LOGHUB"
            ),
            corpus_role=
                "RESEARCH_EXPERIMENT",
        )

        result = derive_lineage_policy([
            commercial,
            research,
        ])

        self.assertEqual(
            result[
                "policyStatus"
            ],
            "APPROVED_RESEARCH_ONLY",
        )

        self.assertFalse(
            result[
                "eligibility"
            ][
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            result[
                "eligibility"
            ][
                "productionCertificationEligible"
            ]
        )


    def test_holdout_parent_taints_noisy_derivative(
        self
    ):
        holdout = case_eligibility(
            get_source(
                "RCAEVAL"
            ),
            corpus_role=
                "FINAL_HOLDOUT",
        )

        result = derive_lineage_policy([
            holdout
        ])

        self.assertTrue(
            result[
                "hasFinalHoldoutAncestor"
            ]
        )

        self.assertFalse(
            result[
                "eligibility"
            ][
                "retrievalEligible"
            ]
        )

        self.assertFalse(
            result[
                "eligibility"
            ][
                "developmentEvaluationEligible"
            ]
        )

        self.assertTrue(
            result[
                "eligibility"
            ][
                "holdoutEligible"
            ]
        )


    def test_quarantine_ancestor_blocks_all_use(
        self
    ):
        quarantined = case_eligibility(
            get_source(
                "TRACEANOMALY"
            ),
            corpus_role=
                "RESEARCH_EXPERIMENT",
        )

        result = derive_lineage_policy([
            quarantined
        ])

        self.assertEqual(
            result[
                "policyStatus"
            ],
            "QUARANTINED_LICENSE_REVIEW",
        )

        self.assertFalse(
            any(
                result[
                    "eligibility"
                ].values()
            )
        )


    def test_destination_mapping_fails_closed(
        self
    ):
        with self.assertRaises(
            ValueError
        ):
            destination_zone_for_status(
                "UNKNOWN"
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()