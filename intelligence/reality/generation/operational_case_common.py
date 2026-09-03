"""Shared helpers for Phase 23R.13I-L operational corpus contracts."""

from __future__ import annotations

import hashlib
import json

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping


OPERATIONAL_CASE_COMMON_VERSION = "23R.13I-L.0"


EVIDENCE_GRADE_ORDER = {
    "E0": 0,
    "E1": 1,
    "E2": 2,
    "E3": 3,
    "E4": 4,
    "E5": 5,
    "E6": 6,
}


def stable_digest(
    payload: Mapping[str, Any],
) -> str:
    return hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def validate_lineage_policy(
    lineage_policy: Mapping[str, Any],
) -> Dict[str, Any]:
    eligibility = lineage_policy.get(
        "eligibility"
    )

    if not isinstance(
        eligibility,
        Mapping,
    ):
        raise ValueError(
            "lineage eligibility is required"
        )

    if (
        eligibility.get(
            "agentGroundTruthVisible",
            False,
        )
        is not False
    ):
        raise ValueError(
            "ground truth cannot be agent-visible"
        )

    return {
        "policyStatus":
            lineage_policy.get(
                "policyStatus"
            ),

        "hasFinalHoldoutAncestor":
            bool(
                lineage_policy.get(
                    "hasFinalHoldoutAncestor",
                    False,
                )
            ),

        "hasResearchOnlyAncestor":
            bool(
                lineage_policy.get(
                    "hasResearchOnlyAncestor",
                    False,
                )
            ),

        "eligibility":
            dict(
                eligibility
            ),

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def weakest_evidence_grade(
    grades: Iterable[str],
) -> str:
    values = list(
        grades
    )

    if not values:
        raise ValueError(
            "at least one evidence grade is required"
        )

    unknown = [
        grade
        for grade
        in values
        if grade not in EVIDENCE_GRADE_ORDER
    ]

    if unknown:
        raise ValueError(
            "unknown evidence grade: "
            + ", ".join(
                sorted(
                    set(
                        unknown
                    )
                )
            )
        )

    return min(
        values,
        key=lambda grade:
            EVIDENCE_GRADE_ORDER[
                grade
            ],
    )


def copied_evidence(
    evidence: Iterable[
        Mapping[str, Any]
    ],
) -> list[Dict[str, Any]]:
    return [
        deepcopy(
            item
        )
        for item
        in evidence
    ]