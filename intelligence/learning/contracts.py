from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


LEARNING_GENERATOR_VERSION = "24.3.0"


CANDIDATE_TYPES = {
    "FAILURE_MODE",
    "INVESTIGATION_PROCEDURE",
    "RUNBOOK",
    "PLAYBOOK",
    "RECOVERY_STRATEGY",
    "EVIDENCE_PATTERN",
    "NEGATIVE_PROCEDURE",
    "ANTI_PATTERN",
    "CONTRAINDICATION",
    "PREREQUISITE",
    "ESCALATION_PATTERN",
}


ALLOWED_SCOPES = {
    "ORGANIZATION",
    "ENVIRONMENT",
}


@dataclass(frozen=True)
class LearningGenerationError(
    ValueError
):
    code: str
    message: str

    def __str__(
        self
    ) -> str:
        return self.message


def require_mapping(
    value: Any,
    field: str,
) -> Mapping[str, Any]:
    if not isinstance(
        value,
        Mapping,
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_SOURCE_INVALID",
            f"{field} must be an object",
        )

    return value


def require_string(
    value: Any,
    field: str,
) -> str:
    if (
        not isinstance(
            value,
            str,
        )
        or
        not value.strip()
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_SOURCE_INVALID",
            f"{field} is required",
        )

    return value.strip()


def require_digest(
    value: Any,
    field: str,
) -> str:
    text = require_string(
        value,
        field,
    )

    if (
        len(
            text
        )
        != 64
        or
        any(
            ch
            not in
            "0123456789abcdef"
            for ch
            in text
        )
    ):
        raise LearningGenerationError(
            "HUMAN_LEARNING_SOURCE_DIGEST_INVALID",
            f"{field} must be a lowercase SHA-256 digest",
        )

    return text