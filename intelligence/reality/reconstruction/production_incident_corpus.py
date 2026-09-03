"""Phase 23R.13P production incident reconstruction corpus wrapper."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence

from intelligence.reality.generation.operational_case_common import (
    copied_evidence,
    stable_digest,
)


PRODUCTION_INCIDENT_CORPUS_VERSION = "23R.13P.0"


PRODUCTION_INCIDENT_DOMAINS = frozenset({
    "CLOUD",
    "CDN",
    "DATABASE",
    "SOURCE_CONTROL",
    "CI_CD",
    "PAYMENTS",
    "OBSERVABILITY",
    "NETWORK",
    "DNS",
    "IDENTITY",
    "STORAGE",
    "KUBERNETES",
    "MESSAGING",
})


def build_production_incident_corpus_case(
    *,
    reconstruction_case: Mapping[str, Any],
    incident_domain: str,
    public_sources: Sequence[
        Mapping[str, Any]
    ],
    historically_visible_evidence: Sequence[
        Mapping[str, Any]
    ],
    sealed_evaluation: Mapping[str, Any],
    seed: int,
    metadata: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    parent_case_id = reconstruction_case.get(
        "caseId"
    )

    evidence_grade = reconstruction_case.get(
        "evidenceGrade"
    )

    if not parent_case_id:
        raise ValueError(
            "production corpus requires reconstruction caseId"
        )

    if evidence_grade != "E3":
        raise ValueError(
            "production reconstruction corpus must remain E3"
        )

    if incident_domain not in PRODUCTION_INCIDENT_DOMAINS:
        raise ValueError(
            f"unknown production incident domain: "
            f"{incident_domain}"
        )

    if not public_sources:
        raise ValueError(
            "production incident requires public sources"
        )

    if not historically_visible_evidence:
        raise ValueError(
            "production incident requires historically "
            "visible evidence"
        )

    if not sealed_evaluation:
        raise ValueError(
            "production incident requires sealed evaluation"
        )

    if (
        sealed_evaluation.get(
            "agentVisible",
            False,
        )
        is not False
    ):
        raise ValueError(
            "production incident ground truth "
            "cannot be agent-visible"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "production incident seed must be integer"
        )

    identity = {
        "parentCaseId":
            str(
                parent_case_id
            ),

        "incidentDomain":
            incident_domain,

        "sourceIds":
            sorted(
                str(
                    source.get(
                        "sourceId",
                        "",
                    )
                )
                for source
                in public_sources
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
            PRODUCTION_INCIDENT_CORPUS_VERSION,

        "caseId":
            "production-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseId":
            str(
                parent_case_id
            ),

        "corpusRole":
            "PRODUCTION_RECONSTRUCTION",

        "incidentDomain":
            incident_domain,

        "evidenceGrade":
            "E3",

        "independentEvidence":
            False,

        "publicSources":
            [
                deepcopy(
                    source
                )
                for source
                in public_sources
            ],

        "evidenceChannel": {
            "agentVisible":
                True,

            "evidence":
                copied_evidence(
                    historically_visible_evidence
                ),
        },

        "evaluationChannel": {
            **deepcopy(
                sealed_evaluation
            ),

            "sealed":
                True,

            "agentVisible":
                False,
        },

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