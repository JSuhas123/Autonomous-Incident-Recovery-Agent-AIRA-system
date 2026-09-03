"""Phase 23R.13Q permanent corpus partition and holdout firewall."""

from __future__ import annotations

import hashlib

from typing import Any
from typing import Dict
from typing import Mapping


CORPUS_PARTITION_POLICY_VERSION = "23R.13Q.0"


PARTITIONS = frozenset({
    "RETRIEVAL",
    "DEVELOPMENT",
    "VALIDATION",
    "HOLDOUT",
    "PRODUCTION_CERTIFICATION",
})


def _bool(
    eligibility: Mapping[str, Any],
    key: str,
) -> bool:
    value = eligibility.get(
        key
    )

    if not isinstance(
        value,
        bool,
    ):
        raise ValueError(
            "eligibility field must be boolean: "
            f"{key}"
        )

    return value


def assign_partition(
    *,
    case_id: str,
    eligibility: Mapping[str, Any],
    partition: str,
    policy_status: str,
    is_final_holdout: bool = False,
) -> Dict[str, Any]:
    if not case_id:
        raise ValueError(
            "caseId is required"
        )

    if partition not in PARTITIONS:
        raise ValueError(
            f"unknown corpus partition: {partition}"
        )

    if policy_status in {
        "QUARANTINED_LICENSE_REVIEW",
        "BLOCKED",
    }:
        raise ValueError(
            "quarantined or blocked data "
            "cannot enter corpus partitions"
        )

    ground_truth_visible = _bool(
        eligibility,
        "agentGroundTruthVisible",
    )

    if ground_truth_visible:
        raise ValueError(
            "ground truth cannot be agent-visible"
        )

    requirements = {
        "RETRIEVAL":
            "retrievalEligible",

        "DEVELOPMENT":
            "developmentEvaluationEligible",

        "VALIDATION":
            "validationEligible",

        "HOLDOUT":
            "holdoutEligible",

        "PRODUCTION_CERTIFICATION":
            "productionCertificationEligible",
    }

    required_key = requirements[
        partition
    ]

    if not _bool(
        eligibility,
        required_key,
    ):
        raise ValueError(
            "case is not eligible for partition: "
            f"{partition}"
        )

    
    #Final holdout is not moved into another partition for certification.

    #It remains physically/logically HOLDOUT and is read
    #in-place by the final certification process.
    
    if (
        is_final_holdout
        and
        partition != "HOLDOUT"
    ):
        raise ValueError(
            "final holdout may only be assigned "
            "to HOLDOUT"
        )

    if partition == "HOLDOUT":
        forbidden = {
            "modelTrainingEligible":
                _bool(
                    eligibility,
                    "modelTrainingEligible",
                ),

            "retrievalEligible":
                _bool(
                    eligibility,
                    "retrievalEligible",
                ),

            "developmentEvaluationEligible":
                _bool(
                    eligibility,
                    "developmentEvaluationEligible",
                ),

            "validationEligible":
                _bool(
                    eligibility,
                    "validationEligible",
                ),

            "customerRuntimeEligible":
                _bool(
                    eligibility,
                    "customerRuntimeEligible",
                ),
        }

        if any(
            forbidden.values()
        ):
            raise ValueError(
                "holdout contamination detected"
            )

    
     #Research-only material is physically/logically
     # isolated outside the commercial partition plane.
     
    if (
        policy_status
        ==
        "APPROVED_RESEARCH_ONLY"
    ):
        raise ValueError(
            "research-only data cannot enter "
            "commercial corpus partitions"
        )

    digest = hashlib.sha256(
        (
            f"{case_id}|"
            f"{partition}|"
            f"{policy_status}|"
            f"{int(is_final_holdout)}"
        )
        .encode(
            "utf-8"
        )
    ).hexdigest()

    return {
        "version":
            CORPUS_PARTITION_POLICY_VERSION,

        "caseId":
            case_id,

        "partition":
            partition,

        "policyStatus":
            policy_status,

        "isFinalHoldout":
            bool(
                is_final_holdout
            ),

        "assignmentDigest":
            digest,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }