"""Phase 23R.13K ambiguous and misleading evidence corpus contract."""

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


AMBIGUOUS_EVIDENCE_VERSION = "23R.13K.0"


AMBIGUITY_TYPES = frozenset({
    "ALARMING_NON_ROOT_SIGNAL",
    "COMPETING_HYPOTHESES",
    "CORRELATED_NOT_CAUSAL",
    "STALE_CHANGE_CONTEXT",
    "MISLEADING_TOPOLOGY",
    "PARTIAL_CAUSAL_VISIBILITY",
    "CONFLICTING_SIGNALS",
})


def build_ambiguous_evidence_case(
    *,
    parent_case: Mapping[str, Any],
    ambiguity_type: str,
    visible_evidence: Sequence[
        Mapping[str, Any]
    ],
    alarming_signal_id: str,
    evaluator_root_cause: Mapping[str, Any],
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
            "ambiguous case requires parent caseId"
        )

    if not evidence_grade:
        raise ValueError(
            "ambiguous case requires parent evidenceGrade"
        )

    if ambiguity_type not in AMBIGUITY_TYPES:
        raise ValueError(
            f"unknown ambiguity type: {ambiguity_type}"
        )

    if not visible_evidence:
        raise ValueError(
            "ambiguous case requires visible evidence"
        )

    if not alarming_signal_id:
        raise ValueError(
            "ambiguous case requires alarmingSignalId"
        )

    root_cause_id = evaluator_root_cause.get(
        "causeId"
    )

    if not root_cause_id:
        raise ValueError(
            "evaluator root cause requires causeId"
        )

    if (
        str(
            alarming_signal_id
        )
        ==
        str(
            root_cause_id
        )
    ):
        raise ValueError(
            "ambiguous case requires alarming signal "
            "to differ from evaluator root cause"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "ambiguous case seed must be integer"
        )

    policy = validate_lineage_policy(
        lineage_policy
    )

    identity = {
        "parentCaseId":
            str(
                parent_case_id
            ),

        "ambiguityType":
            ambiguity_type,

        "alarmingSignalId":
            str(
                alarming_signal_id
            ),

        "rootCauseId":
            str(
                root_cause_id
            ),

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
            AMBIGUOUS_EVIDENCE_VERSION,

        "caseId":
            "ambiguous-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseId":
            str(
                parent_case_id
            ),

        "corpusRole":
            "AMBIGUOUS_EVIDENCE",

        "scenario":
            parent_case.get(
                "scenario",
                "INCIDENT",
            ),

        "ambiguityType":
            ambiguity_type,

        "evidenceGrade":
            str(
                evidence_grade
            ),

        "independentEvidence":
            False,

        "alarmingSignalId":
            str(
                alarming_signal_id
            ),

        "evidence":
            copied_evidence(
                visible_evidence
            ),

        "evaluationChannel": {
            "sealed":
                True,

            "rootCause":
                deepcopy(
                    evaluator_root_cause
                ),

            "agentVisible":
                False,
        },

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