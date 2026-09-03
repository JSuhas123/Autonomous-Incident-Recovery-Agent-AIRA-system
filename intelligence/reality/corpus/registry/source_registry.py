"""AIRA Phase 23R.13C canonical source and license registry."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Iterable

from intelligence.reality.corpus.policy.corpus_policy import (
    CORPUS_POLICY_VERSION,
    destination_zone_for_status,
)


SOURCE_REGISTRY_VERSION = "23R.13C.0"


_SOURCE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "AIRA_RELIABILITY_LAB": {
        "sourceId": "AIRA_RELIABILITY_LAB",
        "sourceName": "AIRA Reliability Lab",
        "publisher": "AIRA",
        "sourceClass": "INTERNAL_GENERATED",
        "defaultCorpusRole": "EXECUTABLE_WORKLOAD",
        "defaultEvidenceGrade": "E1",
        "license": "AIRA_INTERNAL",
        "licenseVerified": True,
        "policyStatus": "APPROVED_COMMERCIAL",
        "requiredAttribution": False,
        "redistributionAllowed": False,
        "notes": "AIRA-owned controlled lab evidence.",
    },

    "RCAEVAL": {
        "sourceId": "RCAEVAL",
        "sourceName": "RCAEval",
        "publisher": "RCAEval authors",
        "sourceClass": "EXTERNAL_BENCHMARK",
        "defaultCorpusRole": "INDEPENDENT_BENCHMARK",
        "defaultEvidenceGrade": "E2",
        "license": "MIT",
        "licenseVerified": True,
        "policyStatus": "APPROVED_COMMERCIAL",
        "requiredAttribution": True,
        "redistributionAllowed": True,
        "notes": (
            "Independent benchmark; final holdout remains "
            "retrieval-isolated."
        ),
    },

    "OTEL_ASTRONOMY_SHOP": {
        "sourceId": "OTEL_ASTRONOMY_SHOP",
        "sourceName": "OpenTelemetry Astronomy Shop",
        "publisher": "OpenTelemetry Authors",
        "sourceClass": "EXECUTABLE_WORKLOAD",
        "defaultCorpusRole": "EXECUTABLE_WORKLOAD",
        "defaultEvidenceGrade": "E1",
        "license": "Apache-2.0",
        "licenseVerified": True,
        "policyStatus": "APPROVED_COMMERCIAL",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Use as an executable lab workload; "
            "generated telemetry keeps provenance."
        ),
    },

    "DEATHSTARBENCH": {
        "sourceId": "DEATHSTARBENCH",
        "sourceName": "DeathStarBench",
        "publisher": "Cornell University research project",
        "sourceClass": "EXECUTABLE_WORKLOAD",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E1",
        "license": "GPL-2.0",
        "licenseVerified": True,
        "policyStatus": "APPROVED_RESEARCH_ONLY",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Research-zone execution until commercial-use "
            "handling is separately reviewed."
        ),
    },

    "GOOGLE_CLUSTER_DATA": {
        "sourceId": "GOOGLE_CLUSTER_DATA",
        "sourceName": "Google Cluster Data",
        "publisher": "Google",
        "sourceClass": "CLOUD_WORKLOAD_TRACE",
        "defaultCorpusRole": "CLOUD_BEHAVIOUR",
        "defaultEvidenceGrade": "E2",
        "license": "CC-BY-4.0",
        "licenseVerified": True,
        "policyStatus": "APPROVED_COMMERCIAL",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Use selected extracts only; do not bulk-download "
            "multi-terabyte traces."
        ),
    },

    "AZURE_PUBLIC_DATASET": {
        "sourceId": "AZURE_PUBLIC_DATASET",
        "sourceName": "Azure Public Dataset",
        "publisher": "Microsoft Azure",
        "sourceClass": "CLOUD_WORKLOAD_TRACE",
        "defaultCorpusRole": "CLOUD_BEHAVIOUR",
        "defaultEvidenceGrade": "E2",
        "license": "SOURCE_SPECIFIC",
        "licenseVerified": False,
        "policyStatus": "QUARANTINED_LICENSE_REVIEW",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Approve individual trace families only after "
            "exact license verification."
        ),
    },

    "ALIBABA_CLUSTERDATA": {
        "sourceId": "ALIBABA_CLUSTERDATA",
        "sourceName": "Alibaba Cluster Trace Program",
        "publisher": "Alibaba",
        "sourceClass": "CLOUD_WORKLOAD_TRACE",
        "defaultCorpusRole": "CLOUD_BEHAVIOUR",
        "defaultEvidenceGrade": "E2",
        "license": "SOURCE_SPECIFIC",
        "licenseVerified": False,
        "policyStatus": "QUARANTINED_LICENSE_REVIEW",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "License/terms must be verified for each "
            "selected trace release."
        ),
    },

    "LOGHUB": {
        "sourceId": "LOGHUB",
        "sourceName": "Loghub",
        "publisher": "LogPAI",
        "sourceClass": "LOG_DATASET",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E2",
        "license": "RESEARCH_OR_ACADEMIC_ONLY",
        "licenseVerified": True,
        "policyStatus": "APPROVED_RESEARCH_ONLY",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Research-zone use only; never customer runtime "
            "or commercial retrieval."
        ),
    },

    "AIOPS_CHALLENGE_2020": {
        "sourceId": "AIOPS_CHALLENGE_2020",
        "sourceName": "AIOps Challenge 2020 Data",
        "publisher": "AIOps Challenge",
        "sourceClass": "AIOPS_DATASET",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E2",
        "license": "NONCOMMERCIAL",
        "licenseVerified": True,
        "policyStatus": "APPROVED_RESEARCH_ONLY",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": "Explicit non-commercial restriction.",
    },

    "GAIA": {
        "sourceId": "GAIA",
        "sourceName": "GAIA Dataset",
        "publisher": "CloudWise OpenSource",
        "sourceClass": "AIOPS_DATASET",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E2",
        "license": "UNVERIFIED_DATASET_TERMS",
        "licenseVerified": False,
        "policyStatus": "QUARANTINED_LICENSE_REVIEW",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Do not ingest until dataset-specific rights "
            "are verified."
        ),
    },

    "TRACEANOMALY": {
        "sourceId": "TRACEANOMALY",
        "sourceName": "TraceAnomaly",
        "publisher": "NetManAIOps",
        "sourceClass": "TRACE_DATASET",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E2",
        "license": "UNVERIFIED_DATASET_TERMS",
        "licenseVerified": False,
        "policyStatus": "QUARANTINED_LICENSE_REVIEW",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": (
            "Keep quarantined pending exact dataset "
            "license verification."
        ),
    },

    "CLOUD_OPSBENCH": {
        "sourceId": "CLOUD_OPSBENCH",
        "sourceName": "Cloud-OpsBench",
        "publisher": "External benchmark authors",
        "sourceClass": "AGENT_BENCHMARK",
        "defaultCorpusRole": "RESEARCH_EXPERIMENT",
        "defaultEvidenceGrade": "E2",
        "license": "UNVERIFIED_DATASET_TERMS",
        "licenseVerified": False,
        "policyStatus": "QUARANTINED_LICENSE_REVIEW",
        "requiredAttribution": True,
        "redistributionAllowed": False,
        "notes": "Metadata only until licensing is verified.",
    },
}


def list_sources() -> Iterable[Dict[str, Any]]:
    for source_id in sorted(
        _SOURCE_REGISTRY
    ):
        yield get_source(
            source_id
        )


def get_source(
    source_id: str,
) -> Dict[str, Any]:
    if source_id not in _SOURCE_REGISTRY:
        raise KeyError(
            f"unknown reality corpus source: {source_id}"
        )

    value = deepcopy(
        _SOURCE_REGISTRY[
            source_id
        ]
    )

    value[
        "registryVersion"
    ] = SOURCE_REGISTRY_VERSION

    value[
        "policyVersion"
    ] = CORPUS_POLICY_VERSION

    value[
        "destinationZone"
    ] = destination_zone_for_status(
        value[
            "policyStatus"
        ]
    )

    return value


def register_source_for_test(
    source: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate the minimum source shape without mutating
    the frozen registry.
    """

    required = {
        "sourceId",
        "sourceName",
        "publisher",
        "sourceClass",
        "defaultCorpusRole",
        "defaultEvidenceGrade",
        "license",
        "licenseVerified",
        "policyStatus",
        "requiredAttribution",
        "redistributionAllowed",
    }

    missing = sorted(
        required.difference(
            source
        )
    )

    if missing:
        raise ValueError(
            "source registration missing fields: "
            +
            ", ".join(
                missing
            )
        )

    value = deepcopy(
        source
    )

    value[
        "destinationZone"
    ] = destination_zone_for_status(
        value[
            "policyStatus"
        ]
    )

    return value