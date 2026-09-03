from __future__ import annotations

import unittest

from intelligence.reality.datasets.cloud.cloud_behavior import (
    CLOUD_BEHAVIOR_VERSION,
    build_cloud_behavior_case,
)

from intelligence.reality.generation.integration_translation.integration_translation import (
    INTEGRATION_TRANSLATION_VERSION,
    build_integration_translation_case,
)

from intelligence.reality.generation.log_diversity.log_diversity import (
    LOG_DIVERSITY_VERSION,
    build_commercial_log_case,
    classify_research_log_source,
)

from intelligence.reality.reconstruction.production_incident_corpus import (
    PRODUCTION_INCIDENT_CORPUS_VERSION,
    build_production_incident_corpus_case,
)


class Phase23R13RealWorldSourcesTests(
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
        grade="E2",
    ):
        return {
            "caseId":
                "parent-123",

            "caseDigest":
                "parent-digest",

            "scenario":
                "INCIDENT",

            "evidenceGrade":
                grade,
        }


    def test_versions_are_frozen(
        self,
    ):
        self.assertEqual(
            CLOUD_BEHAVIOR_VERSION,
            "23R.13M.0",
        )

        self.assertEqual(
            LOG_DIVERSITY_VERSION,
            "23R.13N.0",
        )

        self.assertEqual(
            INTEGRATION_TRANSLATION_VERSION,
            "23R.13O.0",
        )

        self.assertEqual(
            PRODUCTION_INCIDENT_CORPUS_VERSION,
            "23R.13P.0",
        )


    def test_google_cloud_source_can_build_commercial_case(
        self,
    ):
        result = build_cloud_behavior_case(
            source_id=
                "GOOGLE_CLUSTER_DATA",

            sample_id=
                "google-window-1",

            sample_type=
                "RESOURCE_UTILIZATION",

            evidence=[
                {
                    "kind":
                        "METRIC",

                    "name":
                        "cpu",
                }
            ],

            source_window={
                "start":
                    "2019-05-01T00:00:00Z",

                "end":
                    "2019-05-01T00:05:00Z",
            },

            evidence_grade=
                "E2",

            seed=
                1,
        )

        self.assertEqual(
            result[
                "corpusRole"
            ],
            "CLOUD_BEHAVIOUR",
        )

        self.assertFalse(
            result[
                "executionAuthorized"
            ]
        )


    def test_quarantined_azure_source_is_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_cloud_behavior_case(
                source_id=
                    "AZURE_PUBLIC_DATASET",

                sample_id=
                    "azure-window",

                sample_type=
                    "RESOURCE_UTILIZATION",

                evidence=[
                    {
                        "kind":
                            "METRIC",
                    }
                ],

                source_window={
                    "start":
                        "x",

                    "end":
                        "y",
                },

                evidence_grade=
                    "E2",

                seed=
                    2,
            )


    def test_quarantined_alibaba_source_is_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_cloud_behavior_case(
                source_id=
                    "ALIBABA_CLUSTERDATA",

                sample_id=
                    "ali-window",

                sample_type=
                    "SCHEDULER_BEHAVIOUR",

                evidence=[
                    {
                        "kind":
                            "EVENT",
                    }
                ],

                source_window={
                    "start":
                        "x",

                    "end":
                        "y",
                },

                evidence_grade=
                    "E2",

                seed=
                    3,
            )


    def test_commercial_log_case_rejects_research_source(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_commercial_log_case(
                source_id=
                    "LOGHUB",

                sample_id=
                    "loghub-1",

                log_family=
                    "APPLICATION",

                log_format=
                    "PLAIN_TEXT",

                records=[
                    {
                        "message":
                            "fixture",
                    }
                ],

                evidence_grade=
                    "E2",

                seed=
                    4,
            )


    def test_loghub_can_be_classified_for_research_only(
        self,
    ):
        result = classify_research_log_source(
            "LOGHUB"
        )

        self.assertEqual(
            result[
                "destinationZone"
            ],
            "RESEARCH_ONLY",
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
                "productionCertified"
            ]
        )


    def test_aira_generated_logs_can_enter_commercial_corpus(
        self,
    ):
        result = build_commercial_log_case(
            source_id=
                "AIRA_RELIABILITY_LAB",

            sample_id=
                "aira-log-1",

            log_family=
                "KUBERNETES",

            log_format=
                "JSON",

            records=[
                {
                    "level":
                        "INFO",

                    "message":
                        "pod ready",
                }
            ],

            evidence_grade=
                "E1",

            seed=
                5,
        )

        self.assertEqual(
            result[
                "corpusRole"
            ],
            "LOG_DIVERSITY",
        )

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E1",
        )


    def test_integration_translation_preserves_grade(
        self,
    ):
        result = build_integration_translation_case(
            parent_case=
                self._parent(
                    grade="E2"
                ),

            provider_family=
                "PROMETHEUS",

            provider_schema_version=
                "fixture-v1",

            provider_payloads=[
                {
                    "alert":
                        "HighLatency",
                }
            ],

            canonical_meaning={
                "condition":
                    "DEPENDENCY_LATENCY",

                "service":
                    "checkout",
            },

            lineage_policy=
                self._lineage(),

            transformation_version=
                "23R.13O.0",

            seed=
                6,
        )

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E2",
        )

        self.assertFalse(
            result[
                "independentEvidence"
            ]
        )


    def test_provider_format_does_not_change_canonical_meaning(
        self,
    ):
        parent = self._parent()

        prometheus = build_integration_translation_case(
            parent_case=
                parent,

            provider_family=
                "PROMETHEUS",

            provider_schema_version=
                "fixture-v1",

            provider_payloads=[
                {
                    "alert":
                        "Errors",
                }
            ],

            canonical_meaning={
                "condition":
                    "DEPENDENCY_UNAVAILABLE",
            },

            lineage_policy=
                self._lineage(),

            transformation_version=
                "23R.13O.0",

            seed=
                7,
        )

        datadog = build_integration_translation_case(
            parent_case=
                parent,

            provider_family=
                "DATADOG",

            provider_schema_version=
                "fixture-v1",

            provider_payloads=[
                {
                    "title":
                        "Errors",
                }
            ],

            canonical_meaning={
                "condition":
                    "DEPENDENCY_UNAVAILABLE",
            },

            lineage_policy=
                self._lineage(),

            transformation_version=
                "23R.13O.0",

            seed=
                7,
        )

        self.assertEqual(
            prometheus[
                "canonicalMeaning"
            ],
            datadog[
                "canonicalMeaning"
            ],
        )


    def test_production_reconstruction_requires_e3(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_production_incident_corpus_case(
                reconstruction_case=
                    self._parent(
                        grade="E2"
                    ),

                incident_domain=
                    "CLOUD",

                public_sources=[
                    {
                        "sourceId":
                            "postmortem-1",
                    }
                ],

                historically_visible_evidence=[
                    {
                        "kind":
                            "STATUS_UPDATE",
                    }
                ],

                sealed_evaluation={
                    "rootCause":
                        "fixture",

                    "agentVisible":
                        False,
                },

                seed=
                    8,
            )


    def test_production_ground_truth_must_be_hidden(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            build_production_incident_corpus_case(
                reconstruction_case=
                    self._parent(
                        grade="E3"
                    ),

                incident_domain=
                    "DNS",

                public_sources=[
                    {
                        "sourceId":
                            "postmortem-1",
                    }
                ],

                historically_visible_evidence=[
                    {
                        "kind":
                            "STATUS_UPDATE",
                    }
                ],

                sealed_evaluation={
                    "rootCause":
                        "dns failure",

                    "agentVisible":
                        True,
                },

                seed=
                    9,
            )


    def test_production_case_separates_evidence_and_evaluation(
        self,
    ):
        result = build_production_incident_corpus_case(
            reconstruction_case=
                self._parent(
                    grade="E3"
                ),

            incident_domain=
                "DATABASE",

            public_sources=[
                {
                    "sourceId":
                        "postmortem-1",

                    "publisher":
                        "fixture",
                }
            ],

            historically_visible_evidence=[
                {
                    "kind":
                        "STATUS_UPDATE",

                    "message":
                        "database errors observed",
                }
            ],

            sealed_evaluation={
                "rootCause":
                    "storage saturation",

                "resolution":
                    "capacity restored",

                "agentVisible":
                    False,
            },

            seed=
                10,
        )

        self.assertTrue(
            result[
                "evidenceChannel"
            ][
                "agentVisible"
            ]
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

        self.assertEqual(
            result[
                "evidenceGrade"
            ],
            "E3",
        )


    def test_all_real_world_corpus_contracts_grant_no_authority(
        self,
    ):
        cloud = build_cloud_behavior_case(
            source_id=
                "GOOGLE_CLUSTER_DATA",

            sample_id=
                "g-2",

            sample_type=
                "MACHINE_EVENT",

            evidence=[
                {
                    "kind":
                        "EVENT",
                }
            ],

            source_window={
                "start":
                    "a",

                "end":
                    "b",
            },

            evidence_grade=
                "E2",

            seed=
                11,
        )

        translation = build_integration_translation_case(
            parent_case=
                self._parent(),

            provider_family=
                "ALERTMANAGER",

            provider_schema_version=
                "fixture",

            provider_payloads=[
                {
                    "alerts":
                        [],
                }
            ],

            canonical_meaning={
                "condition":
                    "QUEUE_BACKLOG",
            },

            lineage_policy=
                self._lineage(),

            transformation_version=
                "23R.13O.0",

            seed=
                12,
        )

        production = build_production_incident_corpus_case(
            reconstruction_case=
                self._parent(
                    grade="E3"
                ),

            incident_domain=
                "MESSAGING",

            public_sources=[
                {
                    "sourceId":
                        "public-1",
                }
            ],

            historically_visible_evidence=[
                {
                    "kind":
                        "STATUS_UPDATE",
                }
            ],

            sealed_evaluation={
                "rootCause":
                    "broker saturation",

                "agentVisible":
                    False,
            },

            seed=
                13,
        )

        for value in (
            cloud,
            translation,
            production,
        ):
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


if __name__ == "__main__":
    unittest.main()