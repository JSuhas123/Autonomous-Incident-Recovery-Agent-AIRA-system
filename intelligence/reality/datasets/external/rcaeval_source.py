"""Phase 23R.13E RCAEval source acquisition contract."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from typing import Dict

from intelligence.reality.corpus.policy.eligibility import (
    case_eligibility,
)

from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)


RCAEVAL_SOURCE_CONTRACT_VERSION = "23R.13E.0"

RCAEVAL_SOURCE_ID = "RCAEVAL"

RCAEVAL_HUGGINGFACE_REPOSITORY = (
    "phamquiluan/RCAEval"
)

RCAEVAL_EXPECTED_CASES = 735

RCAEVAL_EXPECTED_DATASETS = 9


def get_rcaeval_source_contract() -> Dict[str, Any]:
    source = get_source(
        RCAEVAL_SOURCE_ID
    )

    if (
        source[
            "policyStatus"
        ]
        !=
        "APPROVED_COMMERCIAL"
    ):
        raise ValueError(
            "RCAEval must remain an "
            "approved external source"
        )

    if (
        source[
            "defaultEvidenceGrade"
        ]
        !=
        "E2"
    ):
        raise ValueError(
            "RCAEval must remain E2 evidence"
        )

    eligibility = case_eligibility(
        source,
        corpus_role=
            "INDEPENDENT_BENCHMARK",
    )

    return {
        "version":
            RCAEVAL_SOURCE_CONTRACT_VERSION,

        "sourceId":
            RCAEVAL_SOURCE_ID,

        "repository":
            RCAEVAL_HUGGINGFACE_REPOSITORY,

        "repositoryType":
            "HUGGINGFACE_DATASET",

        "expectedCases":
            RCAEVAL_EXPECTED_CASES,

        "expectedDatasets":
            RCAEVAL_EXPECTED_DATASETS,

        "evidenceGrade":
            "E2",

        "corpusRole":
            "INDEPENDENT_BENCHMARK",

        "policyStatus":
            source[
                "policyStatus"
            ],

        "destinationZone":
            source[
                "destinationZone"
            ],

        "license":
            source[
                "license"
            ],

        "licenseVerified":
            source[
                "licenseVerified"
            ],

        "groundTruthAgentVisible":
            False,

        "eligibility":
            eligibility[
                "eligibility"
            ],

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def validate_rcaeval_staging_directory(
    directory: Path,
) -> Dict[str, Any]:
    directory = (
        directory
        .expanduser()
        .resolve()
    )

    index_path = (
        directory
        /
        "cases.parquet"
    )

    if not index_path.is_file():
        raise ValueError(
            "RCAEval cases.parquet is missing"
        )

    stat = (
        index_path.stat()
    )

    if stat.st_size <= 0:
        raise ValueError(
            "RCAEval cases.parquet is empty"
        )

    return {
        "version":
            RCAEVAL_SOURCE_CONTRACT_VERSION,

        "sourceId":
            RCAEVAL_SOURCE_ID,

        "stagingDirectory":
            str(
                directory
            ),

        "indexPath":
            str(
                index_path
            ),

        "indexSizeBytes":
            int(
                stat.st_size
            ),

        "stagingValidated":
            True,

        "contentPromoted":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }