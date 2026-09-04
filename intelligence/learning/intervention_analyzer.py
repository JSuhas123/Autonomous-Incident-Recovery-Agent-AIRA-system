from __future__ import annotations

from typing import (
    Any,
    Dict,
    List,
    Mapping,
)

from intelligence.learning.contracts import (
    LearningGenerationError,
    require_digest,
    require_mapping,
    require_string,
)

from intelligence.learning.normalizer import (
    event_text,
)


def _list(
    value: Any,
) -> List[Mapping[str, Any]]:
    if not isinstance(
        value,
        list,
    ):
        return []

    return [
        item
        for item
        in value
        if isinstance(
            item,
            Mapping,
        )
    ]


def analyze_source_bundle(
    bundle: Mapping[str, Any],
) -> Dict[str, Any]:
    source = require_mapping(
        bundle,
        "sourceBundle",
    )

    source_digest = require_digest(
        source.get(
            "sourceDigest"
        ),
        "sourceDigest",
    )

    source_bundle_id = require_string(
        source.get(
            "publicId"
        )
        or
        source.get(
            "id"
        ),
        "sourceBundleId",
    )

    if (
        source.get(
            "executionAuthorized"
        )
        is True
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
            "learning input cannot carry execution authority",
        )

    observations = _list(
        source.get(
            "observationPayload"
        )
    )

    assertions = _list(
        source.get(
            "assertionPayload"
        )
    )

    diagnoses = _list(
        source.get(
            "diagnosisPayload"
        )
    )

    actions = _list(
        source.get(
            "actionPayload"
        )
    )

    verifications = _list(
        source.get(
            "verificationPayload"
        )
    )

    outcomes = _list(
        source.get(
            "outcomePayload"
        )
    )

    queries = [
        item
        for item
        in observations
        if item.get(
            "eventType"
        )
        ==
        "QUERY_PERFORMED"
    ]

    evidence = [
        item
        for item
        in observations
        if item.get(
            "eventType"
        )
        ==
        "EVIDENCE_OBSERVED"
    ]

    attempted = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "ACTION_ATTEMPTED"
    ]

    rejected = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "ACTION_REJECTED"
    ]

    failed = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "ACTION_FAILED"
    ]

    succeeded = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "ACTION_SUCCEEDED"
    ]

    mitigations = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "MITIGATION_APPLIED"
    ]

    root_fixes = [
        item
        for item
        in actions
        if item.get(
            "eventType"
        )
        ==
        "ROOT_FIX_APPLIED"
    ]

    return {
        "sourceBundleId":
            source_bundle_id,

        "sourceDigest":
            source_digest,

        "observations":
            observations,

        "assertions":
            assertions,

        "diagnoses":
            diagnoses,

        "queries":
            queries,

        "evidence":
            evidence,

        "actions":
            actions,

        "attemptedActions":
            attempted,

        "rejectedActions":
            rejected,

        "failedActions":
            failed,

        "succeededActions":
            succeeded,

        "mitigations":
            mitigations,

        "rootFixes":
            root_fixes,

        "verifications":
            verifications,

        "outcomes":
            outcomes,

        "diagnosisTexts": [
            text
            for text
            in map(
                event_text,
                diagnoses,
            )
            if text
        ],

        "queryTexts": [
            text
            for text
            in map(
                event_text,
                queries,
            )
            if text
        ],

        "evidenceTexts": [
            text
            for text
            in map(
                event_text,
                evidence,
            )
            if text
        ],

        "rootFixTexts": [
            text
            for text
            in map(
                event_text,
                root_fixes,
            )
            if text
        ],

        "mitigationTexts": [
            text
            for text
            in map(
                event_text,
                mitigations,
            )
            if text
        ],

        "failedTexts": [
            text
            for text
            in map(
                event_text,
                failed,
            )
            if text
        ],

        "rejectedTexts": [
            text
            for text
            in map(
                event_text,
                rejected,
            )
            if text
        ],

        "verificationTexts": [
            text
            for text
            in map(
                event_text,
                verifications,
            )
            if text
        ],

        "outcomeTexts": [
            text
            for text
            in map(
                event_text,
                outcomes,
            )
            if text
        ],
    }