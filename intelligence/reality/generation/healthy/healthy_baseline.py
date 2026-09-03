"""Phase 23R.13G healthy baseline corpus generation contract."""

from __future__ import annotations

import hashlib
import json

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence


HEALTHY_BASELINE_VERSION = "23R.13G.0"


HEALTHY_SCENARIO_TYPES = frozenset({
    "STEADY_TRAFFIC",
    "BURSTY_TRAFFIC",
    "DEPLOYMENT",
    "AUTOSCALING",
    "CACHE_WARMUP",
    "BENIGN_RESTART",
    "BACKUP_JOB",
    "BATCH_JOB",
    "DATABASE_MAINTENANCE",
    "DATABASE_CHECKPOINT",
    "GARBAGE_COLLECTION",
    "TEMPORARY_CPU_SPIKE",
    "TEMPORARY_LATENCY",
    "HARMLESS_WARNING",
})


EXPECTED_OUTCOME = {
    "incidentExpected":
        False,

    "recoveryExpected":
        False,

    "humanEscalationExpected":
        False,

    "recommendedDisposition":
        "CONTINUE_OBSERVATION",
}


def _stable_digest(
    payload: Mapping[str, Any],
) -> str:
    serialized = json.dumps(
        payload,
        sort_keys=True,
        separators=(
            ",",
            ":",
        ),
    )

    return hashlib.sha256(
        serialized.encode(
            "utf-8"
        )
    ).hexdigest()


def build_healthy_baseline_case(
    *,
    source_id: str,
    workload_id: str,
    scenario_type: str,
    evidence_grade: str,
    evidence: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    eligibility: Mapping[str, bool],
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    if scenario_type not in HEALTHY_SCENARIO_TYPES:
        raise ValueError(
            f"unknown healthy scenario: {scenario_type}"
        )

    if not evidence:
        raise ValueError(
            "healthy baseline requires evidence"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "healthy baseline seed must be integer"
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

    identity = {
        "sourceId":
            source_id,

        "workloadId":
            workload_id,

        "scenarioType":
            scenario_type,

        "evidenceGrade":
            evidence_grade,

        "seed":
            seed,

        "metadata":
            dict(
                metadata
                or
                {}
            ),
    }

    case_digest = _stable_digest(
        identity
    )

    return {
        "version":
            HEALTHY_BASELINE_VERSION,

        "caseId":
            (
                "healthy-"
                +
                case_digest[
                    :24
                ]
            ),

        "caseDigest":
            case_digest,

        "sourceId":
            source_id,

        "workloadId":
            workload_id,

        "corpusRole":
            "HEALTHY_BASELINE",

        "scenario":
            "HEALTHY",

        "scenarioType":
            scenario_type,

        "evidenceGrade":
            evidence_grade,

        "seed":
            seed,

        "evidence":
            [
                deepcopy(
                    item
                )

                for item
                in evidence
            ],

        "eligibility":
            dict(
                eligibility
            ),

        "expectedOutcome":
            deepcopy(
                EXPECTED_OUTCOME
            ),

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