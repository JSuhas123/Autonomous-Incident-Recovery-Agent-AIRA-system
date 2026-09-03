"""AIRA Phase 23R.13A multi-source corpus policy contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict
from typing import FrozenSet


CORPUS_POLICY_VERSION = "23R.13A.0"


SOURCE_POLICY_STATUS = frozenset({
    "APPROVED_COMMERCIAL",
    "APPROVED_RESEARCH_ONLY",
    "QUARANTINED_LICENSE_REVIEW",
    "BLOCKED",
})


CORPUS_ROLES = frozenset({
    "INDEPENDENT_BENCHMARK",
    "EXECUTABLE_WORKLOAD",
    "HEALTHY_BASELINE",
    "NOISY_DERIVATIVE",
    "MULTI_FAULT",
    "CASCADING_FAILURE",
    "AMBIGUOUS_EVIDENCE",
    "RECOVERY_OUTCOME",
    "CLOUD_BEHAVIOUR",
    "LOG_DIVERSITY",
    "INTEGRATION_TRANSLATION",
    "PRODUCTION_RECONSTRUCTION",
    "RESEARCH_EXPERIMENT",
    "FINAL_HOLDOUT",
})


DESTINATION_ZONES = frozenset({
    "APPROVED",
    "RESEARCH_ONLY",
    "QUARANTINE",
    "BLOCKED",
})


@dataclass(frozen=True)
class CorpusEligibility:
    researchEligible: bool
    modelTrainingEligible: bool
    retrievalEligible: bool
    developmentEvaluationEligible: bool
    validationEligible: bool
    holdoutEligible: bool
    productionCertificationEligible: bool
    customerRuntimeEligible: bool
    redistributionAllowed: bool
    agentGroundTruthVisible: bool = False

    def as_dict(self) -> Dict[str, bool]:
        return {
            "researchEligible": self.researchEligible,
            "modelTrainingEligible": self.modelTrainingEligible,
            "retrievalEligible": self.retrievalEligible,
            "developmentEvaluationEligible": self.developmentEvaluationEligible,
            "validationEligible": self.validationEligible,
            "holdoutEligible": self.holdoutEligible,
            "productionCertificationEligible": self.productionCertificationEligible,
            "customerRuntimeEligible": self.customerRuntimeEligible,
            "redistributionAllowed": self.redistributionAllowed,
            "agentGroundTruthVisible": self.agentGroundTruthVisible,
        }


COMMERCIAL_DEFAULT = CorpusEligibility(
    researchEligible=True,
    modelTrainingEligible=False,
    retrievalEligible=True,
    developmentEvaluationEligible=True,
    validationEligible=True,
    holdoutEligible=True,
    productionCertificationEligible=True,
    customerRuntimeEligible=False,
    redistributionAllowed=False,
)


RESEARCH_ONLY_DEFAULT = CorpusEligibility(
    researchEligible=True,
    modelTrainingEligible=False,
    retrievalEligible=False,
    developmentEvaluationEligible=False,
    validationEligible=False,
    holdoutEligible=False,
    productionCertificationEligible=False,
    customerRuntimeEligible=False,
    redistributionAllowed=False,
)


QUARANTINED_DEFAULT = CorpusEligibility(
    researchEligible=False,
    modelTrainingEligible=False,
    retrievalEligible=False,
    developmentEvaluationEligible=False,
    validationEligible=False,
    holdoutEligible=False,
    productionCertificationEligible=False,
    customerRuntimeEligible=False,
    redistributionAllowed=False,
)


BLOCKED_DEFAULT = QUARANTINED_DEFAULT


POLICY_DEFAULTS = {
    "APPROVED_COMMERCIAL": COMMERCIAL_DEFAULT,
    "APPROVED_RESEARCH_ONLY": RESEARCH_ONLY_DEFAULT,
    "QUARANTINED_LICENSE_REVIEW": QUARANTINED_DEFAULT,
    "BLOCKED": BLOCKED_DEFAULT,
}


RESTRICTIVENESS_ORDER = {
    "APPROVED_COMMERCIAL": 0,
    "APPROVED_RESEARCH_ONLY": 1,
    "QUARANTINED_LICENSE_REVIEW": 2,
    "BLOCKED": 3,
}


def assert_policy_status(value: str) -> str:
    if value not in SOURCE_POLICY_STATUS:
        raise ValueError(
            f"unknown source policy status: {value}"
        )

    return value


def assert_corpus_role(value: str) -> str:
    if value not in CORPUS_ROLES:
        raise ValueError(
            f"unknown corpus role: {value}"
        )

    return value


def destination_zone_for_status(
    status: str,
) -> str:
    assert_policy_status(
        status
    )

    if status == "APPROVED_COMMERCIAL":
        return "APPROVED"

    if status == "APPROVED_RESEARCH_ONLY":
        return "RESEARCH_ONLY"

    if status == "QUARANTINED_LICENSE_REVIEW":
        return "QUARANTINE"

    return "BLOCKED"


def most_restrictive_status(
    statuses: FrozenSet[str] | set[str],
) -> str:
    if not statuses:
        raise ValueError(
            "at least one source policy status is required"
        )

    for status in statuses:
        assert_policy_status(
            status
        )

    return max(
        statuses,
        key=lambda item:
            RESTRICTIVENESS_ORDER[
                item
            ],
    )