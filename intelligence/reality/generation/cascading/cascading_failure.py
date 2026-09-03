"""Phase 23R.13J cascading-failure corpus contract."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence

from intelligence.reality.generation.operational_case_common import (
    copied_evidence,
    stable_digest,
    validate_lineage_policy,
)


CASCADING_FAILURE_VERSION = "23R.13J.0"


ALLOWED_NODE_TYPES = frozenset({
    "ROOT_FAULT",
    "PRIMARY_SYMPTOM",
    "SECONDARY_OVERLOAD",
    "RETRY_AMPLIFICATION",
    "QUEUE_GROWTH",
    "DOWNSTREAM_FAILURE",
    "ALERT_STORM",
    "OTHER_EFFECT",
})


def build_cascading_failure_case(
    *,
    parent_case: Mapping[str, Any],
    causal_chain: Sequence[
        Mapping[str, Any]
    ],
    evidence: Sequence[
        Mapping[str, Any]
    ],
    lineage_policy: Mapping[str, Any],
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    parent_case_id = parent_case.get(
        "caseId"
    )

    evidence_grade = parent_case.get(
        "evidenceGrade"
    )

    if not parent_case_id:
        raise ValueError(
            "cascading case requires parent caseId"
        )

    if not evidence_grade:
        raise ValueError(
            "cascading case requires parent evidenceGrade"
        )

    if len(
        causal_chain
    ) < 2:
        raise ValueError(
            "cascading case requires at least two causal nodes"
        )

    if not evidence:
        raise ValueError(
            "cascading case requires evidence"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "cascading seed must be integer"
        )

    node_ids = []

    root_count = 0

    for index, node in enumerate(
        causal_chain
    ):
        node_id = node.get(
            "nodeId"
        )

        node_type = node.get(
            "nodeType"
        )

        if not node_id:
            raise ValueError(
                "every causal node requires nodeId"
            )

        if node_type not in ALLOWED_NODE_TYPES:
            raise ValueError(
                f"invalid causal node type: {node_type}"
            )

        if node_type == "ROOT_FAULT":
            root_count += 1

            if index != 0:
                raise ValueError(
                    "ROOT_FAULT must be first in causal chain"
                )

        node_ids.append(
            str(
                node_id
            )
        )

    if root_count != 1:
        raise ValueError(
            "cascading chain requires exactly one ROOT_FAULT"
        )

    if len(
        set(
            node_ids
        )
    ) != len(
        node_ids
    ):
        raise ValueError(
            "causal node IDs must be unique"
        )

    policy = validate_lineage_policy(
        lineage_policy
    )

    identity = {
        "parentCaseId":
            str(
                parent_case_id
            ),

        "causalNodeIds":
            node_ids,

        "seed":
            seed,

        "metadata":
            dict(
                metadata
                or
                {}
            ),
    }

    digest = stable_digest(
        identity
    )

    return {
        "version":
            CASCADING_FAILURE_VERSION,

        "caseId":
            "cascade-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseId":
            str(
                parent_case_id
            ),

        "corpusRole":
            "CASCADING_FAILURE",

        "scenario":
            "INCIDENT",

        "evidenceGrade":
            str(
                evidence_grade
            ),

        "independentEvidence":
            False,

        "causalChain":
            [
                deepcopy(
                    node
                )
                for node
                in causal_chain
            ],

        "causalDepth":
            len(
                causal_chain
            ),

        "evidence":
            copied_evidence(
                evidence
            ),

        "eligibility":
            policy[
                "eligibility"
            ],

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,

        "metadata":
            dict(
                metadata
                or
                {}
            ),
    }