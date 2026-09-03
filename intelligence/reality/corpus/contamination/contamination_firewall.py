"""AIRA Phase 23R.13D transitive corpus contamination firewall."""

from __future__ import annotations

import hashlib
import json

from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping

from intelligence.reality.corpus.policy.corpus_policy import (
    CorpusEligibility,
    most_restrictive_status,
)


CONTAMINATION_FIREWALL_VERSION = "23R.13D.1"


ELIGIBILITY_KEYS = tuple(
    CorpusEligibility
    .__dataclass_fields__
    .keys()
)


def _normalized_parent(
    parent: Mapping[str, Any],
) -> Dict[str, Any]:
    eligibility = parent.get(
        "eligibility"
    )

    if not isinstance(
        eligibility,
        Mapping,
    ):
        raise ValueError(
            "parent eligibility is required"
        )

    values: Dict[
        str,
        bool,
    ] = {}

    for key in ELIGIBILITY_KEYS:
        value = eligibility.get(
            key
        )

        if not isinstance(
            value,
            bool,
        ):
            raise ValueError(
                "parent eligibility field must "
                f"be boolean: {key}"
            )

        values[
            key
        ] = value

    # Ground-truth visibility is never an inheritable
    # corpus capability.
    #
    # Even if malformed ancestry claims it is visible,
    # lineage derivation must fail closed.
    values[
        "agentGroundTruthVisible"
    ] = False

    status = str(
        parent.get(
            "policyStatus",
            "",
        )
    )

    if not status:
        raise ValueError(
            "parent policyStatus is required"
        )

    return {
        "sourceId":
            str(
                parent.get(
                    "sourceId",
                    "UNKNOWN",
                )
            ),

        "caseId":
            str(
                parent.get(
                    "caseId",
                    "",
                )
            ),

        "policyStatus":
            status,

        "corpusRole":
            str(
                parent.get(
                    "corpusRole",
                    "",
                )
            ),

        "isFinalHoldout":
            bool(
                parent.get(
                    "isFinalHoldout",
                    False,
                )
            ),

        "eligibility":
            values,
    }


def derive_lineage_policy(
    parents: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[str, Any]:
    normalized = [
        _normalized_parent(
            parent
        )

        for parent
        in parents
    ]

    if not normalized:
        raise ValueError(
            "at least one parent is required"
        )

    status = most_restrictive_status({
        parent[
            "policyStatus"
        ]

        for parent
        in normalized
    })

    eligibility = {
        key:
            all(
                parent[
                    "eligibility"
                ][
                    key
                ]

                for parent
                in normalized
            )

        for key
        in ELIGIBILITY_KEYS
    }

    # Absolute safety invariant:
    #
    # Ground truth must never become agent-visible,
    # regardless of source class, lineage composition,
    # transformation or malformed parent metadata.
    eligibility[
        "agentGroundTruthVisible"
    ] = False

    has_holdout_ancestor = any(
        parent[
            "isFinalHoldout"
        ]

        for parent
        in normalized
    )

    has_research_only_ancestor = any(
        parent[
            "policyStatus"
        ]
        ==
        "APPROVED_RESEARCH_ONLY"

        for parent
        in normalized
    )

    if has_holdout_ancestor:
        eligibility.update({
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

            "customerRuntimeEligible":
                False,

            "agentGroundTruthVisible":
                False,
        })

    if has_research_only_ancestor:
        eligibility.update({
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

    if status in {
        "QUARANTINED_LICENSE_REVIEW",
        "BLOCKED",
    }:
        eligibility = {
            key:
                False

            for key
            in ELIGIBILITY_KEYS
        }

    lineage_payload = [
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
                parent[
                    "policyStatus"
                ],

            "corpusRole":
                parent[
                    "corpusRole"
                ],

            "isFinalHoldout":
                parent[
                    "isFinalHoldout"
                ],
        }

        for parent
        in normalized
    ]

    lineage_digest = hashlib.sha256(
        json.dumps(
            lineage_payload,
            sort_keys=True,
            separators=(
                ",",
                ":",
            ),
        )
        .encode(
            "utf-8"
        )
    ).hexdigest()

    return {
        "version":
            CONTAMINATION_FIREWALL_VERSION,

        "policyStatus":
            status,

        "hasFinalHoldoutAncestor":
            has_holdout_ancestor,

        "hasResearchOnlyAncestor":
            has_research_only_ancestor,

        "eligibility":
            eligibility,

        "lineageDigest":
            lineage_digest,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }