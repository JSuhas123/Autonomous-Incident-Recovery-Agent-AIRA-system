from __future__ import annotations

import hashlib

from typing import (
    Any,
    Dict,
    List,
    Mapping,
)

from intelligence.learning.contracts import (
    ALLOWED_SCOPES,
    CANDIDATE_TYPES,
    LEARNING_GENERATOR_VERSION,
    LearningGenerationError,
    require_mapping,
)

from intelligence.learning.evidence_pattern_extractor import (
    extract_evidence_patterns,
)

from intelligence.learning.intervention_analyzer import (
    analyze_source_bundle,
)

from intelligence.learning.negative_learning import (
    extract_negative_learning,
)

from intelligence.learning.normalizer import (
    canonical_json,
)

from intelligence.learning.recovery_pattern_extractor import (
    extract_recovery_patterns,
)


def _candidate_key(
    candidate: Mapping[str, Any],
) -> str:
    material = {
        "candidateType":
            candidate.get(
                "candidateType"
            ),

        "knowledgeScope":
            candidate.get(
                "knowledgeScope"
            ),

        "title":
            candidate.get(
                "title"
            ),

        "summary":
            candidate.get(
                "summary"
            ),

        "candidatePayload":
            candidate.get(
                "candidatePayload"
            ),
    }

    return hashlib.sha256(
        canonical_json(
            material
        ).encode(
            "utf-8"
        )
    ).hexdigest()


def _failure_mode_candidates(
    analysis: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    diagnoses = list(
        analysis.get(
            "diagnosisTexts"
        )
        or
        []
    )

    if not diagnoses:
        return []

    return [
        {
            "candidateType":
                "FAILURE_MODE",

            "knowledgeScope":
                "ENVIRONMENT",

            "title":
                (
                    "Failure-mode candidate: "
                    f"{diagnoses[0][:120]}"
                ),

            "summary":
                (
                    "Untrusted failure-mode candidate "
                    "derived from a human diagnosis "
                    "assertion."
                ),

            "candidatePayload": {
                "diagnosisAssertions":
                    diagnoses,

                "truthStatus":
                    "ASSERTION_ONLY",
            },

            "confidence":
                0.45,

            "riskClassification":
                "UNASSESSED",
        }
    ]


def _investigation_candidates(
    analysis: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    queries = list(
        analysis.get(
            "queryTexts"
        )
        or
        []
    )

    evidence = list(
        analysis.get(
            "evidenceTexts"
        )
        or
        []
    )

    if not queries:
        return []

    return [
        {
            "candidateType":
                "INVESTIGATION_PROCEDURE",

            "knowledgeScope":
                "ENVIRONMENT",

            "title":
                (
                    "Investigation candidate: "
                    f"{queries[0][:120]}"
                ),

            "summary":
                (
                    "Candidate investigation procedure "
                    "derived from human queries; "
                    "effectiveness is unvalidated."
                ),

            "candidatePayload": {
                "queries":
                    queries,

                "observedEvidence":
                    evidence,

                "effectiveness":
                    "UNVALIDATED",
            },

            "confidence":
                min(
                    0.55,
                    0.40
                    +
                    (
                        0.05
                        *
                        min(
                            len(
                                queries
                            ),
                            3,
                        )
                    ),
                ),

            "riskClassification":
                "UNASSESSED",
        }
    ]


def _validate_candidate(
    candidate: Mapping[str, Any],
) -> Dict[str, Any]:
    candidate_type = candidate.get(
        "candidateType"
    )

    scope = candidate.get(
        "knowledgeScope"
    )

    if (
        candidate_type
        not in
        CANDIDATE_TYPES
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_GENERATOR_TYPE_INVALID",
            (
                "unsupported candidate type: "
                f"{candidate_type}"
            ),
        )

    if (
        scope
        not in
        ALLOWED_SCOPES
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_GENERATOR_SCOPE_INVALID",
            (
                "Python learning generator may emit "
                "only ORGANIZATION or ENVIRONMENT scope"
            ),
        )

    confidence = candidate.get(
        "confidence"
    )

    if (
        not isinstance(
            confidence,
            (
                int,
                float,
            ),
        )
        or
        isinstance(
            confidence,
            bool,
        )
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_GENERATOR_CONFIDENCE_INVALID",
            "candidate confidence must be numeric",
        )

    if (
        confidence < 0
        or
        confidence > 1
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_GENERATOR_CONFIDENCE_INVALID",
            (
                "candidate confidence must be "
                "between 0 and 1"
            ),
        )

    return {
        "candidateType":
            candidate_type,

        "knowledgeScope":
            scope,

        "title":
            str(
                candidate.get(
                    "title"
                )
                or
                ""
            ).strip(),

        "summary":
            (
                str(
                    candidate.get(
                        "summary"
                    )
                    or
                    ""
                ).strip()
                or
                None
            ),

        "candidatePayload":
            dict(
                candidate.get(
                    "candidatePayload"
                )
                or
                {}
            ),

        "confidence":
            round(
                float(
                    confidence
                ),
                5,
            ),

        "riskClassification":
            str(
                candidate.get(
                    "riskClassification"
                )
                or
                "UNASSESSED"
            ),

        "truthLevel":
            "CANDIDATE",

        "executionAuthorized":
            False,
    }


def generate_candidates(
    request: Mapping[str, Any],
) -> Dict[str, Any]:
    payload = require_mapping(
        request,
        "request",
    )

    if (
        payload.get(
            "executionAuthorized"
        )
        is True
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
            (
                "learning generation cannot grant "
                "execution authority"
            ),
        )

    bundle = require_mapping(
        payload.get(
            "sourceBundle"
        ),
        "sourceBundle",
    )

    analysis = analyze_source_bundle(
        bundle
    )

    raw_candidates: List[
        Dict[str, Any]
    ] = []

    raw_candidates.extend(
        _failure_mode_candidates(
            analysis
        )
    )

    raw_candidates.extend(
        _investigation_candidates(
            analysis
        )
    )

    raw_candidates.extend(
        extract_evidence_patterns(
            analysis
        )
    )

    raw_candidates.extend(
        extract_recovery_patterns(
            analysis
        )
    )

    raw_candidates.extend(
        extract_negative_learning(
            analysis
        )
    )

    unique: List[
        Dict[str, Any]
    ] = []

    seen = set()

    for candidate in raw_candidates:
        normalized = _validate_candidate(
            candidate
        )

        key = _candidate_key(
            normalized
        )

        if key in seen:
            continue

        seen.add(
            key
        )

        unique.append(
            normalized
        )

    unique.sort(
        key=lambda item: (
            item[
                "candidateType"
            ],

            item[
                "title"
            ],

            canonical_json(
                item[
                    "candidatePayload"
                ]
            ),
        )
    )

    return {
        "schemaVersion":
            "24.3.0",

        "generator": {
            "name":
                (
                    "aira-deterministic-"
                    "human-learning-generator"
                ),

            "version":
                LEARNING_GENERATOR_VERSION,

            "mode":
                "DETERMINISTIC_RULE_BASED",
        },

        "sourceBundleId":
            analysis[
                "sourceBundleId"
            ],

        "sourceDigest":
            analysis[
                "sourceDigest"
            ],

        "candidateCount":
            len(
                unique
            ),

        "candidates":
            unique,

        "executionAuthorized":
            False,
    }