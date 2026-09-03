"""Phase 23R.13N log diversity corpus contract."""

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


LOG_DIVERSITY_VERSION = "23R.13N.0"


LOG_FAMILIES = frozenset({
    "APPLICATION",
    "DATABASE",
    "KUBERNETES",
    "CONTAINER",
    "OPERATING_SYSTEM",
    "NETWORK",
    "LOAD_BALANCER",
    "MESSAGE_BROKER",
    "CACHE",
    "IDENTITY",
    "SECURITY",
    "CI_CD",
    "CLOUD_CONTROL_PLANE",
    "OBSERVABILITY",
})


LOG_FORMATS = frozenset({
    "PLAIN_TEXT",
    "JSON",
    "STRUCTURED_KEY_VALUE",
    "SYSLOG",
    "MULTILINE",
    "EVENT_RECORD",
})


def build_commercial_log_case(
    *,
    source_id: str,
    sample_id: str,
    log_family: str,
    log_format: str,
    records: Sequence[
        Mapping[str, Any]
    ],
    evidence_grade: str,
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
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
            f"{source_id} cannot enter the "
            "commercial log diversity corpus"
        )

    if log_family not in LOG_FAMILIES:
        raise ValueError(
            f"unknown log family: {log_family}"
        )

    if log_format not in LOG_FORMATS:
        raise ValueError(
            f"unknown log format: {log_format}"
        )

    if not sample_id:
        raise ValueError(
            "log diversity case requires sampleId"
        )

    if not records:
        raise ValueError(
            "log diversity case requires records"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "log diversity seed must be integer"
        )

    policy = case_eligibility(
        source,
        corpus_role=
            "LOG_DIVERSITY",
    )

    identity = {
        "sourceId":
            source_id,

        "sampleId":
            sample_id,

        "logFamily":
            log_family,

        "logFormat":
            log_format,

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
            LOG_DIVERSITY_VERSION,

        "caseId":
            "log-"
            + digest[:24],

        "caseDigest":
            digest,

        "sourceId":
            source_id,

        "sampleId":
            sample_id,

        "corpusRole":
            "LOG_DIVERSITY",

        "logFamily":
            log_family,

        "logFormat":
            log_format,

        "evidenceGrade":
            evidence_grade,

        "records":
            copied_evidence(
                records
            ),

        "eligibility":
            dict(
                policy[
                    "eligibility"
                ]
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


def classify_research_log_source(
    source_id: str,
) -> Dict[str, Any]:
    source = get_source(
        source_id
    )

    if (
        source[
            "policyStatus"
        ]
        !=
        "APPROVED_RESEARCH_ONLY"
    ):
        raise ValueError(
            f"{source_id} is not registered "
            "as research-only"
        )

    policy = case_eligibility(
        source,
        corpus_role=
            "RESEARCH_EXPERIMENT",
    )

    return {
        "version":
            LOG_DIVERSITY_VERSION,

        "sourceId":
            source_id,

        "corpusRole":
            "RESEARCH_EXPERIMENT",

        "destinationZone":
            "RESEARCH_ONLY",

        "eligibility":
            dict(
                policy[
                    "eligibility"
                ]
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }