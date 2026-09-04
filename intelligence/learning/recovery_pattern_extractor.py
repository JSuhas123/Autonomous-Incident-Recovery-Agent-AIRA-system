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


def extract_recovery_patterns(
    analysis: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    root_fixes = list(
        analysis.get(
            "rootFixTexts"
        )
        or
        []
    )

    verifications = list(
        analysis.get(
            "verificationTexts"
        )
        or
        []
    )

    outcomes = list(
        analysis.get(
            "outcomeTexts"
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

    # A succeeded action alone is deliberately
    # insufficient.
    #
    # Positive recovery candidates require an
    # explicit ROOT_FIX_APPLIED event.
    if not root_fixes:
        return []

    confidence = 0.48

    if verifications:
        confidence += 0.08

    if outcomes:
        confidence += 0.04

    return [
        {
            "candidateType":
                "RECOVERY_STRATEGY",

            "knowledgeScope":
                "ENVIRONMENT",

            "title":
                (
                    "Recovery candidate: "
                    f"{root_fixes[0][:120]}"
                ),

            "summary":
                (
                    "Untrusted recovery strategy "
                    "derived from an operator-declared "
                    "root-fix action."
                ),

            "candidatePayload": {
                "rootFixActions":
                    root_fixes,

                "verificationObservations":
                    verifications,

                "outcomeAssertions":
                    outcomes,

                "diagnosisAssertions":
                    diagnoses,

                "rootCauseCorrected":
                    "UNPROVEN",

                "serviceRestored":
                    "UNPROVEN",
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