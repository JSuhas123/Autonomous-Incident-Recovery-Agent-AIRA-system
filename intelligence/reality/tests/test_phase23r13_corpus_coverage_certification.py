from __future__ import annotations

import unittest

from intelligence.reality.corpus.coverage.corpus_coverage_certification import (
    CORPUS_COVERAGE_CERTIFICATION_VERSION,
    REQUIRED_PROVIDER_FAMILIES,
    certify_corpus_inventory,
)


class Phase23R13CorpusCoverageCertificationTests(
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


    def _source(
        self,
        source_id="SOURCE",
        **overrides,
    ):
        value = {
            "sourceId":
                source_id,

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "licenseVerified":
                True,

            "license":
                "TEST",
        }

        value.update(
            overrides
        )

        return value


    def _case(
        self,
        case_id,
        role,
        **overrides,
    ):
        value = {
            "caseId":
                case_id,

            "sourceId":
                "SOURCE",

            "corpusRole":
                role,

            "evidenceGrade":
                "E2",

            "partition":
                "DEVELOPMENT",

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "integrityManifestHash":
                "a" * 64,

            "eligibility":
                self._eligibility(),

            "independentEvidence":
                False,
        }

        value.update(
            overrides
        )

        return value


    def _passing_fixture(
        self,
    ):
        roles = [
            "INDEPENDENT_BENCHMARK",
            "EXECUTABLE_WORKLOAD",
            "HEALTHY_BASELINE",
            "NOISY_DERIVATIVE",
            "MULTI_FAULT",
            "CASCADING_FAILURE",
            "AMBIGUOUS_EVIDENCE",
            "RECOVERY_OUTCOME",
            "CLOUD_BEHAVIOUR",
            "LOG_DIVERSITY",
            "INTEGRATION_TRANSLATION",
            "PRODUCTION_RECONSTRUCTION",
        ]

        cases = []

        for (
            index,
            role,
        ) in enumerate(
            roles,
            start=1,
        ):
            cases.append(
                self._case(
                    f"case-{index}",
                    role,

                    evidenceGrade=(
                        "E1"
                        if index == 1
                        else
                        "E3"
                        if index == 2
                        else
                        "E2"
                    ),

                    partition=(
                        "RETRIEVAL"
                        if index == 1
                        else
                        "VALIDATION"
                        if index == 2
                        else
                        "DEVELOPMENT"
                    ),
                )
            )

        holdout = self._case(
            "case-holdout",
            "FINAL_HOLDOUT",

            partition=
                "HOLDOUT",

            isFinalHoldout=
                True,

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

                    customerRuntimeEligible=
                        False,
                ),
        )

        cases.append(
            holdout
        )

        for (
            index,
            provider,
        ) in enumerate(
            sorted(
                REQUIRED_PROVIDER_FAMILIES
            ),
            start=100,
        ):
            cases.append(
                self._case(
                    f"provider-{index}",
                    "INTEGRATION_TRANSLATION",

                    providerFamily=
                        provider,
                )
            )

        minimums = {
            role:
                1

            for role
            in roles
        }

        minimums[
            "FINAL_HOLDOUT"
        ] = 1

        return [
            self._source()
        ], cases, minimums


    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            CORPUS_COVERAGE_CERTIFICATION_VERSION,
            "23R.13T.0",
        )


    def test_complete_inventory_can_pass(
        self,
    ):
        (
            sources,
            cases,
            minimums,
        ) = self._passing_fixture()

        result = certify_corpus_inventory(
            sources=
                sources,

            cases=
                cases,

            minimum_case_counts=
                minimums,
        )

        self.assertTrue(
            result[
                "passed"
            ]
        )

        self.assertEqual(
            result[
                "hardFailures"
            ][
                "violations"
            ],
            [],
        )


    def test_default_thresholds_reject_tiny_fixture(
        self,
    ):
        (
            sources,
            cases,
            _,
        ) = self._passing_fixture()

        result = certify_corpus_inventory(
            sources=
                sources,

            cases=
                cases,
        )

        self.assertFalse(
            result[
                "passed"
            ]
        )

        self.assertTrue(
            result[
                "hardFailures"
            ][
                "belowMinimum"
            ]
        )


    def test_duplicate_case_id_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            certify_corpus_inventory(
                sources=[
                    self._source()
                ],

                cases=[
                    self._case(
                        "duplicate",
                        "HEALTHY_BASELINE",
                    ),

                    self._case(
                        "duplicate",
                        "NOISY_DERIVATIVE",
                    ),
                ],
            )


    def test_missing_source_is_hard_failure(
        self,
    ):
        result = certify_corpus_inventory(
            sources=[
                self._source()
            ],

            cases=[
                self._case(
                    "case-x",
                    "HEALTHY_BASELINE",

                    sourceId=
                        "MISSING",
                )
            ],

            minimum_case_counts=
                {},

            required_provider_families=
                [],
        )

        self.assertFalse(
            result[
                "passed"
            ]
        )

        self.assertEqual(
            result[
                "hardFailures"
            ][
                "violations"
            ][0][
                "code"
            ],
            "SOURCE_MISSING_FROM_INVENTORY",
        )


    def test_research_data_in_commercial_partition_fails(
        self,
    ):
        research_source = self._source(
            source_id=
                "RESEARCH",

            policyStatus=
                "APPROVED_RESEARCH_ONLY",
        )

        result = certify_corpus_inventory(
            sources=[
                research_source
            ],

            cases=[
                self._case(
                    "research-case",
                    "LOG_DIVERSITY",

                    sourceId=
                        "RESEARCH",

                    policyStatus=
                        "APPROVED_RESEARCH_ONLY",
                )
            ],

            minimum_case_counts=
                {},

            required_provider_families=
                [],
        )

        codes = {
            item[
                "code"
            ]

            for item
            in result[
                "hardFailures"
            ][
                "violations"
            ]
        }

        self.assertIn(
            "RESEARCH_COMMERCIAL_BOUNDARY_VIOLATION",
            codes,
        )


    def test_holdout_contamination_fails(
        self,
    ):
        result = certify_corpus_inventory(
            sources=[
                self._source()
            ],

            cases=[
                self._case(
                    "holdout",
                    "FINAL_HOLDOUT",

                    partition=
                        "HOLDOUT",

                    isFinalHoldout=
                        True,

                    eligibility=
                        self._eligibility(
                            holdoutEligible=
                                True,

                            retrievalEligible=
                                True,
                        ),
                )
            ],

            minimum_case_counts=
                {},

            required_provider_families=
                [],
        )

        codes = {
            item[
                "code"
            ]

            for item
            in result[
                "hardFailures"
            ][
                "violations"
            ]
        }

        self.assertIn(
            "HOLDOUT_CONTAMINATION",
            codes,
        )


    def test_unverified_commercial_source_fails(
        self,
    ):
        source = self._source(
            licenseVerified=
                False,
        )

        result = certify_corpus_inventory(
            sources=[
                source
            ],

            cases=
                [],

            minimum_case_counts=
                {},

            required_provider_families=
                [],
        )

        self.assertEqual(
            result[
                "hardFailures"
            ][
                "unverifiedCommercialSources"
            ],
            [
                "SOURCE"
            ],
        )


    def test_missing_provider_family_fails(
        self,
    ):
        result = certify_corpus_inventory(
            sources=[
                self._source()
            ],

            cases=
                [],

            minimum_case_counts=
                {},

            required_provider_families=[
                "PROMETHEUS"
            ],
        )

        self.assertEqual(
            result[
                "hardFailures"
            ][
                "missingProviderFamilies"
            ],
            [
                "PROMETHEUS"
            ],
        )


    def test_integrity_hash_required(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            certify_corpus_inventory(
                sources=[
                    self._source()
                ],

                cases=[
                    self._case(
                        "bad-hash",
                        "HEALTHY_BASELINE",

                        integrityManifestHash=
                            "bad",
                    )
                ],
            )


    def test_ground_truth_visibility_rejected(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            certify_corpus_inventory(
                sources=[
                    self._source()
                ],

                cases=[
                    self._case(
                        "truth-leak",
                        "HEALTHY_BASELINE",

                        eligibility=
                            self._eligibility(
                                agentGroundTruthVisible=
                                    True,
                            ),
                    )
                ],
            )


    def test_certification_is_deterministic(
        self,
    ):
        (
            sources,
            cases,
            minimums,
        ) = self._passing_fixture()

        first = certify_corpus_inventory(
            sources=
                sources,

            cases=
                cases,

            minimum_case_counts=
                minimums,
        )

        second = certify_corpus_inventory(
            sources=
                sources,

            cases=
                cases,

            minimum_case_counts=
                minimums,
        )

        self.assertEqual(
            first[
                "inventoryHash"
            ],
            second[
                "inventoryHash"
            ],
        )

        self.assertEqual(
            first[
                "certificationHash"
            ],
            second[
                "certificationHash"
            ],
        )


    def test_certification_grants_no_authority(
        self,
    ):
        (
            sources,
            cases,
            minimums,
        ) = self._passing_fixture()

        result = certify_corpus_inventory(
            sources=
                sources,

            cases=
                cases,

            minimum_case_counts=
                minimums,
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


if (
    __name__
    ==
    "__main__"
):
    unittest.main()