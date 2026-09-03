"""Phase 23R.13H noisy/imperfect-observability derivative contract."""

from __future__ import annotations

import hashlib
import json

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Mapping


NOISY_DERIVATIVE_VERSION = "23R.13H.0"


OBSERVABILITY_CLASSES = frozenset({
    "CLEAN",
    "DEGRADED",
    "SEVERE",
    "PARTIAL",
    "CONFLICTING",
})


TRANSFORMATION_TYPES = frozenset({
    "MISSING_EVIDENCE",
    "DELAYED_EVIDENCE",
    "MISSING_TRACES",
    "SAMPLED_TRACES",
    "DUPLICATE_ALERTS",
    "CLOCK_SKEW",
    "STALE_TOPOLOGY",
    "STALE_DEPLOYMENT_METADATA",
    "CONNECTOR_OUTAGE",
    "PARTIAL_PROVIDER_OUTAGE",
    "REORDERED_EVIDENCE",
    "CONFLICTING_EVIDENCE",
})


def _digest(
    payload: Mapping[str, Any],
) -> str:
    return hashlib.sha256(
        json.dumps(
            payload,
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


def build_noisy_derivative(
    *,
    parent_case: Mapping[str, Any],
    transformation_type: str,
    observability_class: str,
    transformation_version: str,
    seed: int,
    transformed_evidence: list[
        Mapping[
            str,
            Any,
        ]
    ],
    lineage_policy: Mapping[str, Any],
) -> Dict[str, Any]:
    if transformation_type not in TRANSFORMATION_TYPES:
        raise ValueError(
            "unknown noise transformation: "
            f"{transformation_type}"
        )

    if observability_class not in OBSERVABILITY_CLASSES:
        raise ValueError(
            "unknown observability class: "
            f"{observability_class}"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "noise transformation seed must be integer"
        )

    parent_case_id = parent_case.get(
        "caseId"
    )

    if not parent_case_id:
        raise ValueError(
            "noise derivative requires parentCaseId"
        )

    parent_grade = parent_case.get(
        "evidenceGrade"
    )

    if not parent_grade:
        raise ValueError(
            "noise derivative requires parent evidence grade"
        )

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
            "noise transformation cannot expose ground truth"
        )

    identity = {
        "parentCaseId":
            parent_case_id,

        "transformationType":
            transformation_type,

        "transformationVersion":
            transformation_version,

        "observabilityClass":
            observability_class,

        "seed":
            seed,
    }

    transformation_digest = _digest(
        identity
    )

    return {
        "version":
            NOISY_DERIVATIVE_VERSION,

        "caseId":
            (
                "noise-"
                +
                transformation_digest[
                    :24
                ]
            ),

        "parentCaseId":
            parent_case_id,

        "parentCaseDigest":
            parent_case.get(
                "caseDigest"
            ),

        "corpusRole":
            "NOISY_DERIVATIVE",

        "scenario":
            parent_case.get(
                "scenario"
            ),

        "scenarioType":
            parent_case.get(
                "scenarioType"
            ),

        "evidenceGrade":
            parent_grade,

        "independentEvidence":
            False,

        "observabilityClass":
            observability_class,

        "transformation": {
            "type":
                transformation_type,

            "version":
                transformation_version,

            "seed":
                seed,

            "digest":
                transformation_digest,
        },

        "evidence":
            [
                deepcopy(
                    item
                )

                for item
                in transformed_evidence
            ],

        "eligibility":
            dict(
                eligibility
            ),

        "expectedOutcome":
            deepcopy(
                parent_case.get(
                    "expectedOutcome"
                )
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }