"""Phase 23R.13M cloud workload behaviour corpus contract."""

from __future__ import annotations

from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence

from intelligence.reality.corpus.policy.eligibility import (
    case_eligibility,
)

from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)

from intelligence.reality.generation.operational_case_common import (
    copied_evidence,
    stable_digest,
)


CLOUD_BEHAVIOR_VERSION = "23R.13M.0"


CLOUD_SOURCE_IDS = frozenset({
    "GOOGLE_CLUSTER_DATA",
    "AZURE_PUBLIC_DATASET",
    "ALIBABA_CLUSTERDATA",
})


CLOUD_SAMPLE_TYPES = frozenset({
    "RESOURCE_UTILIZATION",
    "SCHEDULER_BEHAVIOUR",
    "WORKLOAD_LIFECYCLE",
    "TASK_PLACEMENT",
    "FAILURE_EVENT",
    "EVICTION_EVENT",
    "CAPACITY_PRESSURE",
    "LATENCY_BEHAVIOUR",
    "BURST_BEHAVIOUR",
    "MACHINE_EVENT",
})


def build_cloud_behavior_case(
    *,
    source_id: str,
    sample_id: str,
    sample_type: str,
    evidence: Sequence[
        Mapping[str, Any]
    ],
    source_window: Mapping[str, Any],
    evidence_grade: str,
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    if source_id not in CLOUD_SOURCE_IDS:
        raise ValueError(
            f"unknown cloud source: {source_id}"
        )

    source = get_source(
        source_id
    )

    if (
        source[
            "policyStatus"
        ]
        !=
        "APPROVED_COMMERCIAL"
    ):
        raise ValueError(
            f"{source_id} is not approved for "
            "commercial cloud corpus generation"
        )

    if sample_type not in CLOUD_SAMPLE_TYPES:
        raise ValueError(
            f"unknown cloud sample type: {sample_type}"
        )

    if not sample_id:
        raise ValueError(
            "cloud behaviour sample requires sampleId"
        )

    if not evidence:
        raise ValueError(
            "cloud behaviour sample requires evidence"
        )

    if not source_window:
        raise ValueError(
            "cloud behaviour sample requires source window"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "cloud behaviour seed must be integer"
        )

    policy = case_eligibility(
        source,
        corpus_role=
            "CLOUD_BEHAVIOUR",
    )

    eligibility = policy[
        "eligibility"
    ]

    if (
        eligibility[
            "agentGroundTruthVisible"
        ]
        is not False
    ):
        raise ValueError(
            "cloud corpus cannot expose ground truth"
        )

    identity = {
        "sourceId":
            source_id,

        "sampleId":
            sample_id,

        "sampleType":
            sample_type,

        "sourceWindow":
            dict(
                source_window
            ),

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

    digest = stable_digest(
        identity
    )

    return {
        "version":
            CLOUD_BEHAVIOR_VERSION,

        "caseId":
            "cloud-"
            + digest[:24],

        "caseDigest":
            digest,

        "sourceId":
            source_id,

        "sampleId":
            sample_id,

        "corpusRole":
            "CLOUD_BEHAVIOUR",

        "sampleType":
            sample_type,

        "sourceWindow":
            dict(
                source_window
            ),

        "evidenceGrade":
            evidence_grade,

        "evidence":
            copied_evidence(
                evidence
            ),

        "policyStatus":
            source[
                "policyStatus"
            ],

        "eligibility":
            dict(
                eligibility
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