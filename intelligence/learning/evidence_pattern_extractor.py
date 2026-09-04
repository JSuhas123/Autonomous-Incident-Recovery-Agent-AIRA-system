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


def extract_evidence_patterns(
    analysis: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    evidence = list(
        analysis.get(
            "evidenceTexts"
        )
        or
        []
    )

    diagnoses = list(
        analysis.get(
            "diagnosisTexts"
        )
        or
        []
    )

    if not evidence:
        return []

    title_seed = evidence[
        0
    ][
        :120
    ]

    confidence = 0.45

    if len(
        evidence
    ) >= 2:
        confidence += 0.10

    if diagnoses:
        confidence += 0.05

    return [
        {
            "candidateType":
                "EVIDENCE_PATTERN",

            "knowledgeScope":
                "ENVIRONMENT",

            "title":
                (
                    "Observed evidence pattern: "
                    f"{title_seed}"
                ),

            "summary":
                (
                    "Candidate evidence pattern "
                    "extracted from human-observed "
                    "incident evidence."
                ),

            "candidatePayload": {
                "evidence":
                    evidence,

                "associatedDiagnosisAssertions":
                    diagnoses,

                "assertionStatus":
                    "UNVALIDATED",
            },

            "confidence":
                bounded_confidence(
                    min(
                        confidence,
                        0.65,
                    )
                ),

            "riskClassification":
                "UNASSESSED",
        }
    ]