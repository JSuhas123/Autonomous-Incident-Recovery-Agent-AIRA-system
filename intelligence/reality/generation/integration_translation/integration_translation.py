"""Phase 23R.13O provider integration translation corpus contract."""

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


INTEGRATION_TRANSLATION_VERSION = "23R.13O.0"


PROVIDER_FAMILIES = frozenset({
    "PROMETHEUS",
    "ALERTMANAGER",
    "GRAFANA",
    "OPENTELEMETRY",
    "DATADOG",
    "CLOUDWATCH",
    "AZURE_MONITOR",
    "GCP_MONITORING",
    "PAGERDUTY",
    "SLACK",
    "GITHUB",
    "CI_CD",
    "KUBERNETES",
    "DOCKER",
    "RABBITMQ",
    "REDIS",
    "POSTGRESQL",
})


def build_integration_translation_case(
    *,
    parent_case: Mapping[str, Any],
    provider_family: str,
    provider_schema_version: str,
    provider_payloads: Sequence[
        Mapping[str, Any]
    ],
    canonical_meaning: Mapping[str, Any],
    lineage_policy: Mapping[str, Any],
    transformation_version: str,
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
            "integration translation requires parent caseId"
        )

    if not evidence_grade:
        raise ValueError(
            "integration translation requires "
            "parent evidenceGrade"
        )

    if provider_family not in PROVIDER_FAMILIES:
        raise ValueError(
            f"unknown provider family: {provider_family}"
        )

    if not provider_schema_version:
        raise ValueError(
            "provider schema version is required"
        )

    if not provider_payloads:
        raise ValueError(
            "integration translation requires "
            "provider payloads"
        )

    if not canonical_meaning:
        raise ValueError(
            "canonical incident meaning is required"
        )

    if not transformation_version:
        raise ValueError(
            "transformation version is required"
        )

    if not isinstance(
        seed,
        int,
    ):
        raise ValueError(
            "integration translation seed must be integer"
        )

    policy = validate_lineage_policy(
        lineage_policy
    )

    identity = {
        "parentCaseId":
            str(
                parent_case_id
            ),

        "providerFamily":
            provider_family,

        "providerSchemaVersion":
            provider_schema_version,

        "transformationVersion":
            transformation_version,

        "seed":
            seed,

        "canonicalMeaning":
            dict(
                canonical_meaning
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
            INTEGRATION_TRANSLATION_VERSION,

        "caseId":
            "integration-"
            + digest[:24],

        "caseDigest":
            digest,

        "parentCaseId":
            str(
                parent_case_id
            ),

        "corpusRole":
            "INTEGRATION_TRANSLATION",

        "providerFamily":
            provider_family,

        "providerSchemaVersion":
            provider_schema_version,

        "canonicalMeaning":
            deepcopy(
                canonical_meaning
            ),

        "providerPayloads":
            copied_evidence(
                provider_payloads
            ),

        "transformation": {
            "version":
                transformation_version,

            "seed":
                seed,
        },

        "evidenceGrade":
            str(
                evidence_grade
            ),

        "independentEvidence":
            False,

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