from __future__ import annotations

from typing import (
    Any,
    Dict,
    List,
    Mapping,
)

from intelligence.learning.normalizer import (
    bounded_confidence,
)


def extract_negative_learning(
    analysis: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    candidates: List[
        Dict[str, Any]
    ] = []

    failed = list(
        analysis.get(
            "failedTexts"
        )
        or
        []
    )

    rejected = list(
        analysis.get(
            "rejectedTexts"
        )
        or
        []
    )

    mitigations = list(
        analysis.get(
            "mitigationTexts"
        )
        or
        []
    )

    if failed:
        candidates.append(
            {
                "candidateType":
                    "NEGATIVE_PROCEDURE",

                "knowledgeScope":
                    "ENVIRONMENT",

                "title":
                    (
                        "Failed action candidate: "
                        f"{failed[0][:120]}"
                    ),

                "summary":
                    (
                        "Candidate negative learning "
                        "derived from actions explicitly "
                        "recorded as failed."
                    ),

                "candidatePayload": {
                    "failedActions":
                        failed,

                    "instruction":
                        (
                            "DO_NOT_GENERALIZE_"
                            "WITHOUT_VALIDATION"
                        ),
                },

                "confidence":
                    bounded_confidence(
                        0.58
                    ),

                "riskClassification":
                    "UNASSESSED",
            }
        )

    if rejected:
        candidates.append(
            {
                "candidateType":
                    "CONTRAINDICATION",

                "knowledgeScope":
                    "ENVIRONMENT",

                "title":
                    (
                        "Rejected action candidate: "
                        f"{rejected[0][:120]}"
                    ),

                "summary":
                    (
                        "Candidate contraindication "
                        "derived from operator-rejected "
                        "actions; rejection reason still "
                        "requires validation."
                    ),

                "candidatePayload": {
                    "rejectedActions":
                        rejected,

                    "assertionStatus":
                        "UNVALIDATED",
                },

                "confidence":
                    bounded_confidence(
                        0.45
                    ),

                "riskClassification":
                    "UNASSESSED",
            }
        )

    if mitigations:
        candidates.append(
            {
                "candidateType":
                    "ANTI_PATTERN",

                "knowledgeScope":
                    "ENVIRONMENT",

                "title":
                    (
                        "Temporary mitigation must not "
                        "be promoted as a root fix"
                    ),

                "summary":
                    (
                        "Candidate anti-pattern preserving "
                        "the distinction between service "
                        "restoration and root-cause "
                        "correction."
                    ),

                "candidatePayload": {
                    "temporaryMitigations":
                        mitigations,

                    "serviceRestored":
                        "POSSIBLE",

                    "rootCauseCorrected":
                        "NOT_ESTABLISHED",

                    "prohibitedInference":
                        (
                            "TEMPORARY_MITIGATION_"
                            "EQUALS_ROOT_FIX"
                        ),
                },

                "confidence":
                    bounded_confidence(
                        0.70
                    ),

                "riskClassification":
                    "UNASSESSED",
            }
        )

    return candidates