from __future__ import annotations

import json
from typing import Any, Mapping

from intelligence.learning.contracts import (
    LearningGenerationError,
)


def canonicalize(
    value: Any,
) -> Any:
    if isinstance(
        value,
        Mapping,
    ):
        return {
            key: canonicalize(
                value[
                    key
                ]
            )
            for key
            in sorted(
                value
            )
        }

    if isinstance(
        value,
        list,
    ):
        return [
            canonicalize(
                item
            )
            for item
            in value
        ]

    return value


def canonical_json(
    value: Any,
) -> str:
    return json.dumps(
        canonicalize(
            value
        ),
        sort_keys=True,
        separators=(
            ",",
            ":",
        ),
        ensure_ascii=False,
    )


def clean_text(
    value: Any,
    *,
    max_length: int = 1000,
) -> str | None:
    if value is None:
        return None

    if isinstance(
        value,
        (
            dict,
            list,
        ),
    ):
        value = canonical_json(
            value
        )

    text = " ".join(
        str(
            value
        ).split()
    ).strip()

    if not text:
        return None

    return text[
        :max_length
    ]


def event_text(
    event: Mapping[str, Any],
) -> str | None:
    summary = clean_text(
        event.get(
            "summary"
        )
    )

    if summary:
        return summary

    payload = event.get(
        "payload"
    )

    if isinstance(
        payload,
        Mapping,
    ):
        for key in (
            "diagnosis",
            "query",
            "command",
            "action",
            "result",
            "outcome",
            "evidence",
            "reason",
            "description",
        ):
            text = clean_text(
                payload.get(
                    key
                )
            )

            if text:
                return text

    return None


def bounded_confidence(
    value: float,
) -> float:
    if (
        value < 0.0
        or
        value > 1.0
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_GENERATOR_CONFIDENCE_INVALID",
            "candidate confidence must be between 0 and 1",
        )

    return round(
        value,
        5,
    )