"""Phase 23R.13R corpus integrity and content-addressing contract."""

from __future__ import annotations

import hashlib
import json

from typing import Any
from typing import Dict
from typing import Mapping
from typing import Optional


CORPUS_CONTENT_ADDRESSING_VERSION = "23R.13R.0"


def sha256_bytes(
    value: bytes,
) -> str:
    if not isinstance(
        value,
        (
            bytes,
            bytearray,
        ),
    ):
        raise ValueError(
            "sha256_bytes requires bytes"
        )

    return hashlib.sha256(
        bytes(
            value
        )
    ).hexdigest()


def sha256_json(
    value: Mapping[str, Any],
) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(
            ",",
            ":",
        ),
        ensure_ascii=False,
    ).encode(
        "utf-8"
    )

    return sha256_bytes(
        encoded
    )


def build_integrity_manifest(
    *,
    artifact_id: str,
    source_id: str,
    media_type: str,
    payload: bytes,
    original_hash: Optional[str] = None,
    normalized_hash: Optional[str] = None,
    transformation_hash: Optional[str] = None,
    parent_case_id: Optional[str] = None,
    seed: Optional[int] = None,
    metadata: Optional[
        Mapping[
            str,
            Any,
        ]
    ] = None,
) -> Dict[str, Any]:
    if not artifact_id:
        raise ValueError(
            "artifactId is required"
        )

    if not source_id:
        raise ValueError(
            "sourceId is required"
        )

    if not media_type:
        raise ValueError(
            "mediaType is required"
        )

    payload_hash = sha256_bytes(
        payload
    )

    for (
        name,
        value,
    ) in {
        "originalHash":
            original_hash,

        "normalizedHash":
            normalized_hash,

        "transformationHash":
            transformation_hash,
    }.items():
        if (
            value is not None
            and
            (
                len(
                    value
                )
                !=
                64

                or

                any(
                    character
                    not in
                    "0123456789abcdefABCDEF"

                    for character
                    in value
                )
            )
        ):
            raise ValueError(
                f"{name} must be SHA-256 hex"
            )

    manifest_core = {
        "artifactId":
            artifact_id,

        "sourceId":
            source_id,

        "mediaType":
            media_type,

        "byteSize":
            len(
                payload
            ),

        "contentHash":
            payload_hash,

        "originalHash":
            (
                original_hash.lower()
                if original_hash
                else None
            ),

        "normalizedHash":
            (
                normalized_hash.lower()
                if normalized_hash
                else None
            ),

        "transformationHash":
            (
                transformation_hash.lower()
                if transformation_hash
                else None
            ),

        "parentCaseId":
            parent_case_id,

        "seed":
            seed,

        "metadata":
            dict(
                metadata
                or
                {}
            ),
    }

    return {
        "version":
            CORPUS_CONTENT_ADDRESSING_VERSION,

        **manifest_core,

        "manifestHash":
            sha256_json(
                manifest_core
            ),

        "trustedGroundTruth":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }