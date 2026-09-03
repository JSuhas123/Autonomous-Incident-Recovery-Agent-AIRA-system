"""Phase 23R.13I multi-fault corpus contract."""

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
    weakest_evidence_grade,
)


MULTI_FAULT_VERSION = "23R.13I.0"


def build_multi_fault_case(
    *,
    parent_cases: Sequence[
        Mapping[str, Any]
    ],
    root_faults: Sequence[
        Mapping[str, Any]
    ],
    combined_evidence: Sequence[
        Mapping[str, Any]
    ],
    lineage_policy: Mapping[str, Any],
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    if len(
        parent_cases
    ) < 2:
        raise ValueError(
            "multi-fault case requires at least two parent cases"
        )

    if len(
        root_faults
    ) < 2:
        raise ValueError(
            "multi-fault case requires at least two root faults"
        )

    if not combined_evidence:
        raise ValueError(
            "multi-fault case requires combined evidence"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "multi-fault seed must be integer"
        )

    parent_ids = []

    parent_grades = []

    for parent in parent_cases:
        case_id = parent.get(
            "caseId"
        )

        grade = parent.get(
            "evidenceGrade"
        )

        if not case_id:
            raise ValueError(
                "every multi-fault parent requires caseId"
            )

        if not grade:
            raise ValueError(
                "every multi-fault parent requires evidenceGrade"
            )

        parent_ids.append(
            str(
                case_id
            )
        )

        parent_grades.append(
            str(
                grade
            )
        )

    fault_ids = []

    for fault in root_faults:
        fault_id = fault.get(
            "faultId"
        )

        if not fault_id:
            raise ValueError(
                "every root fault requires faultId"
            )

        fault_ids.append(
            str(
                fault_id
            )
        )

    if len(
        set(
            fault_ids
        )
    ) != len(
        fault_ids
    ):
        raise ValueError(
            "root fault IDs must be unique"
        )

    policy = validate_lineage_policy(
        lineage_policy
    )

    evidence_grade = weakest_evidence_grade(
        parent_grades
    )

    identity = {
        "parentCaseIds":
            sorted(
                parent_ids
            ),

        "rootFaultIds":
            sorted(
                fault_ids
            ),

        "seed":
            seed,

        "evidenceGrade":
            evidence_grade,

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
            MULTI_FAULT_VERSION,

        "caseId":
            "multi-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseIds":
            parent_ids,

        "corpusRole":
            "MULTI_FAULT",

        "scenario":
            "INCIDENT",

        "faultCardinality":
            len(
                root_faults
            ),

        "rootFaults":
            [
                deepcopy(
                    fault
                )
                for fault
                in root_faults
            ],

        "evidenceGrade":
            evidence_grade,

        "independentEvidence":
            False,

        "evidence":
            copied_evidence(
                combined_evidence
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