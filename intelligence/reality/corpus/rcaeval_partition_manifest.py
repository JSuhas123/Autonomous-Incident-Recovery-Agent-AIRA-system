"""AIRA Phase 23R.13 deterministic RCAEval corpus partitioning.

Ground-truth-bearing RCAEval index fields are used only to build evaluator-side
partitions. They are never emitted into replay-visible case payloads.

RCAEval's published case index uses:
- ``dataset`` for the nine concrete benchmark datasets (RE1-OB ... RE3-TT)
- ``suite`` for the three benchmark families (RE1, RE2, RE3)
- ``system`` for the three systems (ob, ss, tt)

Older AIRA fixtures used ``suite`` for the nine concrete dataset identifiers.
This module accepts both shapes, but canonicalizes every manifest case to the
nine-dataset identity required by the certified 735-case coverage contract.
"""

from __future__ import annotations

import hashlib

from collections import Counter

from typing import Any
from typing import Dict
from typing import Iterable
from typing import List
from typing import Mapping


from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
)


RCAEVAL_CORPUS_MANIFEST_VERSION = (
    "23R.13.1"
)


EXPECTED_TOTAL_CASES = (
    735
)


EXPECTED_SUITE_COUNTS = {
    "RE1-OB":
        125,

    "RE1-SS":
        125,

    "RE1-TT":
        125,

    "RE2-OB":
        90,

    "RE2-SS":
        90,

    "RE2-TT":
        90,

    "RE3-OB":
        30,

    "RE3-SS":
        30,

    "RE3-TT":
        30,
}


EXPECTED_SUITE_FAMILY_COUNTS = {
    "RE1":
        375,

    "RE2":
        270,

    "RE3":
        90,
}


PARTITIONS = (
    "RETRIEVAL",
    "DEVELOPMENT",
    "VALIDATION",
    "HOLDOUT",
)


PARTITION_BUCKETS = {
    "RETRIEVAL":
        range(
            0,
            60,
        ),

    "DEVELOPMENT":
        range(
            60,
            75,
        ),

    "VALIDATION":
        range(
            75,
            90,
        ),

    "HOLDOUT":
        range(
            90,
            100,
        ),
}


SYSTEM_CODES = frozenset({
    "OB",
    "SS",
    "TT",
})


SUITE_FAMILIES = frozenset({
    "RE1",
    "RE2",
    "RE3",
})


def _error(
    code: str,
    message: str,
) -> RealityNormalizationError:
    return RealityNormalizationError(
        code,
        message,
    )


def _optional_text(
    row: Mapping[
        str,
        Any,
    ],
    key: str,
) -> str | None:
    value = row.get(
        key
    )

    if value is None:
        return None

    text = str(
        value
    ).strip()

    return (
        text
        or
        None
    )


def _required(
    row: Mapping[
        str,
        Any,
    ],
    key: str,
) -> str:
    value = _optional_text(
        row,
        key,
    )

    if value is None:
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_FIELD_REQUIRED",
            f"{key} is required",
        )

    return value


def _canonical_dataset(
    row: Mapping[
        str,
        Any,
    ],
) -> str:
    """Return one of the nine certified RCAEval dataset identifiers.

    Current RCAEval index schema:
        dataset=RE1-OB, suite=RE1, system=ob

    Legacy AIRA fixture schema:
        suite=RE1-OB
    """

    dataset = _optional_text(
        row,
        "dataset",
    )

    if dataset is not None:
        candidate = dataset.upper()

        if candidate not in EXPECTED_SUITE_COUNTS:
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_DATASET_INVALID",
                (
                    "unknown RCAEval dataset: "
                    f"{dataset}"
                ),
            )

        return candidate

    suite = _required(
        row,
        "suite",
    ).upper()

    if suite in EXPECTED_SUITE_COUNTS:
        return suite

    if suite in SUITE_FAMILIES:
        system = _required(
            row,
            "system",
        ).upper()

        if system not in SYSTEM_CODES:
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_SYSTEM_INVALID",
                (
                    "unknown RCAEval system: "
                    f"{system}"
                ),
            )

        candidate = (
            f"{suite}-{system}"
        )

        if candidate in EXPECTED_SUITE_COUNTS:
            return candidate

    raise _error(
        "REALITY_RCAEVAL_MANIFEST_DATASET_REQUIRED",
        (
            "RCAEval row must provide a certified "
            "dataset identifier via dataset, or via "
            "legacy suite, or via suite + system"
        ),
    )


def _suite_family(
    row: Mapping[
        str,
        Any,
    ],
    dataset: str,
) -> str:
    suite = _optional_text(
        row,
        "suite",
    )

    if suite is not None:
        candidate = suite.upper()

        if candidate in SUITE_FAMILIES:
            return candidate

        if candidate in EXPECTED_SUITE_COUNTS:
            return candidate.split(
                "-",
                1,
            )[0]

    return dataset.split(
        "-",
        1,
    )[0]


def _group_key(
    row: Mapping[
        str,
        Any,
    ],
    dataset: str,
) -> str:
    return "\0".join(
        (
            dataset,

            _required(
                row,
                "root_cause_service",
            ),

            _required(
                row,
                "fault",
            ),
        )
    )


def _partition_for_group(
    group_key: str,
    seed: int,
) -> str:
    digest = hashlib.sha256(
        (
            f"{seed}\0"
            f"{group_key}"
        ).encode(
            "utf-8"
        )
    ).digest()

    bucket = (
        int.from_bytes(
            digest[
                :4
            ],
            "big",
        )
        %
        100
    )

    for (
        name,
        buckets,
    ) in PARTITION_BUCKETS.items():
        if (
            bucket
            in buckets
        ):
            return name

    raise AssertionError(
        "partition bucket coverage is incomplete"
    )


def build_rcaeval_partition_manifest(
    rows: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
    *,
    seed: int = 2313,
) -> Dict[
    str,
    Any,
]:
    if (
        not isinstance(
            seed,
            int,
        )
        or
        seed <
        0
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_SEED_INVALID",
            (
                "seed must be a non-negative integer"
            ),
        )

    cases: List[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen = (
        set()
    )

    suite_counts: Counter[
        str
    ] = Counter()

    suite_family_counts: Counter[
        str
    ] = Counter()

    partition_counts: Counter[
        str
    ] = Counter()

    group_partitions: Dict[
        str,
        str,
    ] = {}

    for raw in rows:
        if (
            not isinstance(
                raw,
                Mapping,
            )
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_ROW_INVALID",
                (
                    "every RCAEval index row "
                    "must be an object"
                ),
            )

        case_id = (
            _required(
                raw,
                "case",
            )
        )

        dataset = (
            _canonical_dataset(
                raw
            )
        )

        suite_family = (
            _suite_family(
                raw,
                dataset,
            )
        )

        if (
            case_id
            in seen
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_CASE_DUPLICATE",
                f"duplicate case: {case_id}",
            )

        seen.add(
            case_id
        )

        group_key = (
            _group_key(
                raw,
                dataset,
            )
        )

        partition = (
            _partition_for_group(
                group_key,
                seed,
            )
        )

        previous = (
            group_partitions
            .setdefault(
                group_key,
                partition,
            )
        )

        if (
            previous !=
            partition
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_GROUP_LEAKAGE",
                (
                    "group split changed: "
                    f"{group_key}"
                ),
            )

        suite_counts[
            dataset
        ] += 1

        suite_family_counts[
            suite_family
        ] += 1

        partition_counts[
            partition
        ] += 1

        cases.append({
            "benchmarkCaseId":
                case_id,

            "suite":
                dataset,

            "dataset":
                dataset,

            "suiteFamily":
                suite_family,

            "partition":
                partition,

            "groupDigest":
                hashlib
                .sha256(
                    group_key.encode(
                        "utf-8"
                    )
                )
                .hexdigest(),

            "evidenceGrade":
                "E2",

            "trainingEligible":
                False,

            "groundTruthAgentVisible":
                False,
        })

    cases.sort(
        key=
            lambda item:
                item[
                    "benchmarkCaseId"
                ]
    )

    return {
        "version":
            RCAEVAL_CORPUS_MANIFEST_VERSION,

        "benchmarkId":
            "RCAEVAL",

        "license":
            "MIT",

        "seed":
            seed,

        "caseCount":
            len(
                cases
            ),

        "suiteCounts":
            dict(
                sorted(
                    suite_counts.items()
                )
            ),

        "suiteFamilyCounts":
            dict(
                sorted(
                    suite_family_counts.items()
                )
            ),

        "partitionCounts": {
            name:
                partition_counts[
                    name
                ]

            for name
            in PARTITIONS
        },

        "partitions":
            list(
                PARTITIONS
            ),

        "cases":
            cases,

        "holdoutRules": {
            "retrievalAllowed":
                False,

            "trainingAllowed":
                False,

            "agentGroundTruthAllowed":
                False,
        },

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def certify_complete_rcaeval_manifest(
    manifest: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    if (
        manifest.get(
            "benchmarkId"
        ) !=
        "RCAEVAL"
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_BENCHMARK_INVALID",
            (
                "manifest must describe RCAEval"
            ),
        )

    if (
        manifest.get(
            "license"
        ) !=
        "MIT"
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_LICENSE_INVALID",
            (
                "RCAEval manifest license "
                "must be MIT"
            ),
        )

    if (
        manifest.get(
            "caseCount"
        ) !=
        EXPECTED_TOTAL_CASES
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_CASE_COUNT_INVALID",
            (
                f"expected {EXPECTED_TOTAL_CASES} "
                "RCAEval cases"
            ),
        )

    if (
        manifest.get(
            "suiteCounts"
        ) !=
        EXPECTED_SUITE_COUNTS
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_SUITE_COVERAGE_INVALID",
            (
                "RCAEval dataset counts do not match "
                "the certified 735-case corpus"
            ),
        )

    if (
        manifest.get(
            "suiteFamilyCounts"
        ) !=
        EXPECTED_SUITE_FAMILY_COUNTS
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_SUITE_FAMILY_COVERAGE_INVALID",
            (
                "RCAEval RE1/RE2/RE3 family counts do not "
                "match the certified 735-case corpus"
            ),
        )

    cases = (
        manifest.get(
            "cases"
        )
    )

    if (
        not isinstance(
            cases,
            list,
        )
        or
        len(
            cases
        ) !=
        EXPECTED_TOTAL_CASES
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_CASES_INVALID",
            (
                "manifest cases are incomplete"
            ),
        )

    ids = [
        case.get(
            "benchmarkCaseId"
        )

        for case
        in cases
    ]

    if (
        len(
            ids
        )
        !=
        len(
            set(
                ids
            )
        )
    ):
        raise _error(
            "REALITY_RCAEVAL_MANIFEST_CASE_DUPLICATE",
            (
                "manifest contains duplicate case IDs"
            ),
        )

    for case in cases:
        if (
            case.get(
                "suite"
            ) not in
            EXPECTED_SUITE_COUNTS
            or
            case.get(
                "dataset"
            ) not in
            EXPECTED_SUITE_COUNTS
            or
            case.get(
                "suiteFamily"
            ) not in
            EXPECTED_SUITE_FAMILY_COUNTS
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_DATASET_INVALID",
                (
                    "every RCAEval case must carry a "
                    "certified dataset and suite family"
                ),
            )

        if (
            case.get(
                "evidenceGrade"
            ) !=
            "E2"
            or
            case.get(
                "groundTruthAgentVisible"
            ) is not False
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_SEALING_INVALID",
                (
                    "every RCAEval case must remain "
                    "E2 and answer-sealed"
                ),
            )

        if (
            case.get(
                "trainingEligible"
            ) is not False
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_TRAINING_FORBIDDEN",
                (
                    "RCAEval certification cases are "
                    "not model-training data"
                ),
            )

        if (
            case.get(
                "partition"
            ) not in
            PARTITIONS
        ):
            raise _error(
                "REALITY_RCAEVAL_MANIFEST_PARTITION_INVALID",
                (
                    "unknown corpus partition"
                ),
            )

    return {
        "version":
            RCAEVAL_CORPUS_MANIFEST_VERSION,

        "status":
            "PASS",

        "caseCount":
            EXPECTED_TOTAL_CASES,

        "suiteCounts":
            EXPECTED_SUITE_COUNTS,

        "suiteFamilyCounts":
            EXPECTED_SUITE_FAMILY_COUNTS,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }