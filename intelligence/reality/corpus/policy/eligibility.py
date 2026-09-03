"""AIRA Phase 23R.13D source and case eligibility derivation."""

from __future__ import annotations

from typing import Any
from typing import Dict
from typing import Mapping

from intelligence.reality.corpus.policy.corpus_policy import (
    POLICY_DEFAULTS,
    CorpusEligibility,
    assert_corpus_role,
    assert_policy_status,
)


ELIGIBILITY_POLICY_VERSION = "23R.13D.0"


def source_eligibility(
    source: Mapping[str, Any],
) -> CorpusEligibility:
    status = assert_policy_status(
        str(
            source[
                "policyStatus"
            ]
        )
    )

    baseline = POLICY_DEFAULTS[
        status
    ]

    values = baseline.as_dict()

    values[
        "redistributionAllowed"
    ] = bool(
        source.get(
            "redistributionAllowed",
            False,
        )
    )

    source_overrides = (
        source.get(
            "eligibilityOverrides"
        )
        or
        {}
    )

    for (
        key,
        value,
    ) in source_overrides.items():
        if key not in values:
            raise ValueError(
                f"unknown eligibility override: {key}"
            )

        if not isinstance(
            value,
            bool,
        ):
            raise ValueError(
                "eligibility override must be boolean: "
                f"{key}"
            )

        values[
            key
        ] = value

    if values[
        "agentGroundTruthVisible"
    ]:
        raise ValueError(
            "ground truth can never be made "
            "agent-visible by source policy"
        )

    return CorpusEligibility(
        **values
    )


def case_eligibility(
    source: Mapping[str, Any],
    *,
    corpus_role: str,
    is_final_holdout: bool = False,
) -> Dict[str, Any]:
    role = assert_corpus_role(
        corpus_role
    )

    values = source_eligibility(
        source
    ).as_dict()

    if (
        is_final_holdout
        or
        role ==
        "FINAL_HOLDOUT"
    ):
        values.update({
            "researchEligible":
                False,

            "modelTrainingEligible":
                False,

            "retrievalEligible":
                False,

            "developmentEvaluationEligible":
                False,

            "validationEligible":
                False,

            "holdoutEligible":
                True,

            "productionCertificationEligible":
                True,

            "customerRuntimeEligible":
                False,

            "agentGroundTruthVisible":
                False,
        })

    if (
        role ==
        "RESEARCH_EXPERIMENT"
    ):
        values.update({
            "modelTrainingEligible":
                False,

            "retrievalEligible":
                False,

            "developmentEvaluationEligible":
                False,

            "validationEligible":
                False,

            "holdoutEligible":
                False,

            "productionCertificationEligible":
                False,

            "customerRuntimeEligible":
                False,

            "agentGroundTruthVisible":
                False,
        })

    return {
        "policyVersion":
            ELIGIBILITY_POLICY_VERSION,

        "sourceId":
            source[
                "sourceId"
            ],

        "policyStatus":
            source[
                "policyStatus"
            ],

        "corpusRole":
            role,

        "isFinalHoldout":
            bool(
                is_final_holdout
                or
                role ==
                "FINAL_HOLDOUT"
            ),

        "eligibility":
            values,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }