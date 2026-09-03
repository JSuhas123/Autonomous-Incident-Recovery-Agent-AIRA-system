"""Phase 23R.13L recovery outcome corpus contract."""

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


RECOVERY_OUTCOME_VERSION = "23R.13L.0"


RECOVERY_OUTCOMES = frozenset({
    "SUCCESS",
    "FAILURE",
    "PARTIAL",
    "RELAPSE",
    "WRONG_RECOVERY",
    "WORSENED",
    "MASKING",
})


def build_recovery_outcome_case(
    *,
    parent_case: Mapping[str, Any],
    diagnosis: Mapping[str, Any],
    proposed_recovery: Mapping[str, Any],
    authorization_record: Mapping[str, Any],
    execution_record: Mapping[str, Any],
    verification_record: Mapping[str, Any],
    post_recovery_trajectory: Sequence[
        Mapping[str, Any]
    ],
    recovery_outcome: str,
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
            "recovery outcome requires parent caseId"
        )

    if not evidence_grade:
        raise ValueError(
            "recovery outcome requires parent evidenceGrade"
        )

    if recovery_outcome not in RECOVERY_OUTCOMES:
        raise ValueError(
            f"unknown recovery outcome: {recovery_outcome}"
        )

    if not diagnosis:
        raise ValueError(
            "recovery outcome requires diagnosis"
        )

    if not proposed_recovery:
        raise ValueError(
            "recovery outcome requires proposed recovery"
        )

    if not authorization_record:
        raise ValueError(
            "recovery outcome requires authorization record"
        )

    if not execution_record:
        raise ValueError(
            "recovery outcome requires execution record"
        )

    if not verification_record:
        raise ValueError(
            "recovery outcome requires verification record"
        )

    if not post_recovery_trajectory:
        raise ValueError(
            "recovery outcome requires post-recovery trajectory"
        )

    if not evidence:
        raise ValueError(
            "recovery outcome requires evidence"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "recovery outcome seed must be integer"
        )

    policy = validate_lineage_policy(
        lineage_policy
    )

    identity = {
        "parentCaseId":
            str(
                parent_case_id
            ),

        "recoveryOutcome":
            recovery_outcome,

        "seed":
            seed,

        "authorizationDecision":
            authorization_record.get(
                "decision"
            ),

        "executionStatus":
            execution_record.get(
                "status"
            ),

        "verificationStatus":
            verification_record.get(
                "status"
            ),

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
            RECOVERY_OUTCOME_VERSION,

        "caseId":
            "recovery-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseId":
            str(
                parent_case_id
            ),

        "corpusRole":
            "RECOVERY_OUTCOME",

        "scenario":
            "INCIDENT",

        "evidenceGrade":
            str(
                evidence_grade
            ),

        "independentEvidence":
            False,

        "diagnosis":
            deepcopy(
                diagnosis
            ),

        "proposedRecovery":
            deepcopy(
                proposed_recovery
            ),

        "authorizationRecord":
            deepcopy(
                authorization_record
            ),

        "executionRecord":
            deepcopy(
                execution_record
            ),

        "verificationRecord":
            deepcopy(
                verification_record
            ),

        "postRecoveryTrajectory":
            [
                deepcopy(
                    point
                )
                for point
                in post_recovery_trajectory
            ],

        "recoveryOutcome":
            recovery_outcome,

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

        # This record describes an observed authorization/execution
        # lifecycle. It does not itself authorize future execution.
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