"""Phase 23R.13S.5 real external-reality promotion.

This module promotes only physically present, policy-approved external evidence.
It never downloads data, fabricates incidents, exposes evaluator ground truth, or
creates execution authority.
"""

from __future__ import annotations

import hashlib
import json

from pathlib import Path
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence

from intelligence.reality.corpus.integrity.content_addressing import (
    build_integrity_manifest,
    sha256_bytes,
)
from intelligence.reality.corpus.policy.eligibility import (
    case_eligibility,
)
from intelligence.reality.corpus.rcaeval_partition_manifest import (
    build_rcaeval_partition_manifest,
    certify_complete_rcaeval_manifest,
)
from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)
from intelligence.reality.datasets.cloud.cloud_behavior import (
    build_cloud_behavior_case,
)
from intelligence.reality.datasets.external.rcaeval_source import (
    RCAEVAL_EXPECTED_CASES,
    validate_rcaeval_staging_directory,
)
from intelligence.reality.reconstruction.production_incident_corpus import (
    build_production_incident_corpus_case,
)
from intelligence.reality.reconstruction.public_incident_reconstruction import (
    build_public_incident_dataset,
)


EXTERNAL_REALITY_PROMOTION_VERSION = "23R.13S.5.0"

RCAEVAL_SOURCE_ID = "RCAEVAL"
GOOGLE_SOURCE_ID = "GOOGLE_CLUSTER_DATA"

RCAEVAL_APPROVED_RELATIVE = (
    "approved/external-benchmarks/rcaeval"
)

GOOGLE_APPROVED_RELATIVE = (
    "approved/cloud-traces/google"
)

PUBLIC_APPROVED_RELATIVE = (
    "approved/public-incidents"
)


def _stable_hash(
    value: Any,
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

    return hashlib.sha256(
        encoded
    ).hexdigest()


def _json_bytes(
    value: Any,
) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(
                ",",
                ":",
            ),
            ensure_ascii=False,
        )
        +
        "\n"
    ).encode(
        "utf-8"
    )


def _write_json(
    path: Path,
    value: Any,
) -> Dict[
    str,
    Any,
]:
    payload = _json_bytes(
        value
    )

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_bytes(
        payload
    )

    return {
        "path":
            str(
                path
            ),

        "byteSize":
            len(
                payload
            ),

        "sha256":
            sha256_bytes(
                payload
            ),
    }


def _write_jsonl(
    path: Path,
    records: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[
    str,
    Any,
]:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = hashlib.sha256()

    size = 0

    with path.open(
        "wb"
    ) as handle:
        for record in records:
            payload = _json_bytes(
                record
            )

            handle.write(
                payload
            )

            hasher.update(
                payload
            )

            size += len(
                payload
            )

    return {
        "path":
            str(
                path
            ),

        "recordCount":
            len(
                records
            ),

        "byteSize":
            size,

        "sha256":
            hasher.hexdigest(),
    }


def _read_jsonl(
    path: Path,
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    if not path.is_file():
        raise ValueError(
            f"JSONL source does not exist: {path}"
        )

    values: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    for (
        line_number,
        line,
    ) in enumerate(
        path
        .read_text(
            encoding="utf-8"
        )
        .splitlines(),
        start=1,
    ):
        if not line.strip():
            continue

        try:
            value = json.loads(
                line
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                (
                    "invalid JSONL at "
                    f"{path}:{line_number}"
                )
            ) from exc

        if not isinstance(
            value,
            dict,
        ):
            raise ValueError(
                (
                    "JSONL row must be an object at "
                    f"{path}:{line_number}"
                )
            )

        values.append(
            value
        )

    if not values:
        raise ValueError(
            f"JSONL source is empty: {path}"
        )

    return values


def _require_approved_source(
    source_id: str,
) -> Dict[
    str,
    Any,
]:
    source = get_source(
        source_id
    )

    if (
        source[
            "policyStatus"
        ]
        !=
        "APPROVED_COMMERCIAL"
    ):
        raise ValueError(
            (
                "external promotion requires "
                "APPROVED_COMMERCIAL: "
                f"{source_id}"
            )
        )

    if (
        source[
            "licenseVerified"
        ]
        is not True
    ):
        raise ValueError(
            (
                "external promotion requires "
                "verified license: "
                f"{source_id}"
            )
        )

    return source


def _opaque_rcaeval_case_id(
    benchmark_case_id: str,
    suite: str,
) -> str:
    digest = hashlib.sha256(
        (
            "RCAEVAL"
            +
            "\0"
            +
            suite
            +
            "\0"
            +
            benchmark_case_id
        ).encode(
            "utf-8"
        )
    ).hexdigest()

    return (
        "rcaeval-"
        +
        digest[:24]
    )


def _artifact_descriptor(
    path: Path,
) -> Dict[
    str,
    Any,
]:
    payload = path.read_bytes()

    return {
        "name":
            path.name,

        "byteSize":
            len(
                payload
            ),

        "sha256":
            sha256_bytes(
                payload
            ),
    }


def _read_rcaeval_index(
    index_path: Path,
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    try:
        import pyarrow.parquet as pq

    except ImportError as exc:
        raise RuntimeError(
            (
                "pyarrow is required for "
                "RCAEval promotion: "
                "python -m pip install pyarrow"
            )
        ) from exc

    table = pq.read_table(
        str(
            index_path
        )
    )

    return [
        dict(
            row
        )

        for row
        in table.to_pylist()
    ]


def promote_rcaeval(
    *,
    data_root: str | Path,
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ]
    | None = None,
    require_complete_telemetry: bool = True,
) -> Dict[
    str,
    Any,
]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    staging = (
        root
        /
        "staging"
        /
        "downloads"
        /
        "rcaeval"
    )

    validation = (
        validate_rcaeval_staging_directory(
            staging
        )
    )

    source = _require_approved_source(
        RCAEVAL_SOURCE_ID
    )

    index_rows = (
        [
            dict(
                row
            )

            for row
            in rows
        ]

        if rows is not None

        else

        _read_rcaeval_index(
            Path(
                validation[
                    "indexPath"
                ]
            )
        )
    )

    evaluator_manifest = (
        build_rcaeval_partition_manifest(
            index_rows
        )
    )

    evaluator_certification = (
        certify_complete_rcaeval_manifest(
            evaluator_manifest
        )
    )

    if (
        evaluator_certification.get(
            "status"
        )
        !=
        "PASS"
    ):
        raise ValueError(
            "RCAEval evaluator manifest did not certify"
        )

    case_by_id = {
        str(
            row[
                "case"
            ]
        ):
            dict(
                row
            )

        for row
        in index_rows
    }

    approved_records: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    missing_telemetry: list[
        str
    ] = []

    for evaluator_case in (
        evaluator_manifest[
            "cases"
        ]
    ):
        benchmark_case_id = str(
            evaluator_case[
                "benchmarkCaseId"
            ]
        )

        suite = str(
            evaluator_case[
                "suite"
            ]
        )

        case_dir = (
            staging
            /
            benchmark_case_id
        )

        metrics = (
            case_dir
            /
            "metrics.parquet"
        )

        if (
            not metrics.is_file()
            or
            metrics.stat().st_size <= 0
        ):
            missing_telemetry.append(
                benchmark_case_id
            )

            continue

        artifacts = [
            _artifact_descriptor(
                metrics
            )
        ]

        for optional_name in (
            "logs.parquet",
            "traces.parquet",
            "inject_time.txt",
        ):
            optional_path = (
                case_dir
                /
                optional_name
            )

            if (
                optional_path.is_file()
                and
                optional_path.stat().st_size > 0
            ):
                artifacts.append(
                    _artifact_descriptor(
                        optional_path
                    )
                )

        partition = str(
            evaluator_case[
                "partition"
            ]
        )

        is_holdout = (
            partition
            ==
            "HOLDOUT"
        )

        eligibility = (
            case_eligibility(
                source,
                corpus_role=(
                    "FINAL_HOLDOUT"

                    if is_holdout

                    else

                    "INDEPENDENT_BENCHMARK"
                ),
                is_final_holdout=
                    is_holdout,
            )[
                "eligibility"
            ]
        )

        case_id = (
            _opaque_rcaeval_case_id(
                benchmark_case_id,
                suite,
            )
        )

        integrity_payload = _json_bytes({
            "caseId":
                case_id,

            "suite":
                suite,

            "artifacts":
                artifacts,
        })

        integrity = (
            build_integrity_manifest(
                artifact_id=
                    (
                        f"{case_id}"
                        "-telemetry"
                    ),

                source_id=
                    RCAEVAL_SOURCE_ID,

                media_type=
                    (
                        "application/vnd.aira."
                        "rcaeval-case-manifest+json"
                    ),

                payload=
                    integrity_payload,

                original_hash=
                    sha256_bytes(
                        integrity_payload
                    ),

                parent_case_id=
                    None,

                metadata={
                    "suite":
                        suite,

                    "phase":
                        "23R.13S.5",
                },
            )
        )

        index_row = case_by_id[
            benchmark_case_id
        ]

        approved_records.append({
            "version":
                EXTERNAL_REALITY_PROMOTION_VERSION,

            "caseId":
                case_id,

            "benchmarkCaseDigest":
                hashlib.sha256(
                    benchmark_case_id.encode(
                        "utf-8"
                    )
                ).hexdigest(),

            "sourceId":
                RCAEVAL_SOURCE_ID,

            "corpusRole": (
                "FINAL_HOLDOUT"

                if is_holdout

                else

                "INDEPENDENT_BENCHMARK"
            ),

            "evidenceGrade":
                "E2",

            "partition":
                partition,

            "policyStatus":
                source[
                    "policyStatus"
                ],

            "eligibility":
                dict(
                    eligibility
                ),

            "suite":
                suite,

            "system":
                str(
                    index_row.get(
                        "system",
                        "",
                    )
                ),

            "evidenceModalities": [
                name

                for (
                    name,
                    present,
                )
                in (
                    (
                        "METRIC",
                        any(
                            artifact[
                                "name"
                            ]
                            ==
                            "metrics.parquet"

                            for artifact
                            in artifacts
                        ),
                    ),

                    (
                        "LOG",
                        any(
                            artifact[
                                "name"
                            ]
                            ==
                            "logs.parquet"

                            for artifact
                            in artifacts
                        ),
                    ),

                    (
                        "TRACE",
                        any(
                            artifact[
                                "name"
                            ]
                            ==
                            "traces.parquet"

                            for artifact
                            in artifacts
                        ),
                    ),
                )

                if present
            ],

            "artifactIntegrity":
                artifacts,

            "integrityManifestHash":
                integrity[
                    "manifestHash"
                ],

            "isFinalHoldout":
                is_holdout,

            "independentEvidence":
                True,

            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        })

    if (
        require_complete_telemetry
        and
        missing_telemetry
    ):
        raise ValueError(
            (
                "RCAEval telemetry is incomplete: "
                f"{len(missing_telemetry)} "
                "case directories are missing "
                "metrics.parquet; first missing="
                f"{missing_telemetry[0]}"
            )
        )

    if (
        require_complete_telemetry
        and
        len(
            approved_records
        )
        !=
        RCAEVAL_EXPECTED_CASES
    ):
        raise ValueError(
            (
                "RCAEval promotion requires all "
                f"{RCAEVAL_EXPECTED_CASES} cases"
            )
        )

    destination = (
        root
        /
        RCAEVAL_APPROVED_RELATIVE
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    replay_index = (
        _write_jsonl(
            destination
            /
            "phase23r13-rcaeval-approved-cases.jsonl",

            approved_records,
        )
    )

    evaluator_output = (
        _write_json(
            destination
            /
            "phase23r13-rcaeval-evaluator-manifest.json",

            {
                "sealedEvaluatorOnly":
                    True,

                "agentGroundTruthVisible":
                    False,

                "manifest":
                    evaluator_manifest,

                "certification":
                    evaluator_certification,
            },
        )
    )

    result_core = {
        "version":
            EXTERNAL_REALITY_PROMOTION_VERSION,

        "sourceId":
            RCAEVAL_SOURCE_ID,

        "policyStatus":
            source[
                "policyStatus"
            ],

        "license":
            source[
                "license"
            ],

        "licenseVerified":
            source[
                "licenseVerified"
            ],

        "caseCount":
            len(
                approved_records
            ),

        "missingTelemetryCount":
            len(
                missing_telemetry
            ),

        "replayIndex":
            replay_index,

        "sealedEvaluatorManifest":
            evaluator_output,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **result_core,

        "promotionHash":
            _stable_hash(
                result_core
            ),
    }


def promote_google_cloud(
    *,
    data_root: str | Path,
    input_jsonl: str | Path,
    minimum_cases: int = 500,
) -> Dict[
    str,
    Any,
]:
    if minimum_cases < 1:
        raise ValueError(
            "minimum_cases must be positive"
        )

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    source_path = (
        Path(
            input_jsonl
        )
        .expanduser()
        .resolve()
    )

    source = _require_approved_source(
        GOOGLE_SOURCE_ID
    )

    rows = _read_jsonl(
        source_path
    )

    if (
        len(
            rows
        )
        <
        minimum_cases
    ):
        raise ValueError(
            (
                "Google cloud extract has "
                "insufficient rows: "
                f"{len(rows)} < {minimum_cases}"
            )
        )

    source_payload = (
        source_path
        .read_bytes()
    )

    source_hash = sha256_bytes(
        source_payload
    )

    cases: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    for (
        index,
        row,
    ) in enumerate(
        rows
    ):
        seed = int(
            row.get(
                "seed",
                600000
                +
                index,
            )
        )

        case = (
            build_cloud_behavior_case(
                source_id=
                    GOOGLE_SOURCE_ID,

                sample_id=
                    str(
                        row.get(
                            "sampleId",
                            "",
                        )
                    ),

                sample_type=
                    str(
                        row.get(
                            "sampleType",
                            "",
                        )
                    ),

                evidence=
                    row.get(
                        "evidence"
                    )
                    or
                    [],

                source_window=
                    row.get(
                        "sourceWindow"
                    )
                    or
                    {},

                evidence_grade=
                    "E2",

                seed=
                    seed,

                metadata={
                    **dict(
                        row.get(
                            "metadata"
                        )
                        or
                        {}
                    ),

                    "populationVersion":
                        EXTERNAL_REALITY_PROMOTION_VERSION,

                    "sourceExtractSha256":
                        source_hash,
                },
            )
        )

        payload = _json_bytes(
            case
        )

        integrity = (
            build_integrity_manifest(
                artifact_id=
                    (
                        f"{case['caseId']}"
                        "-cloud"
                    ),

                source_id=
                    GOOGLE_SOURCE_ID,

                media_type=
                    (
                        "application/vnd.aira."
                        "cloud-behaviour+json"
                    ),

                payload=
                    payload,

                normalized_hash=
                    sha256_bytes(
                        payload
                    ),

                seed=
                    seed,

                metadata={
                    "phase":
                        "23R.13S.5",
                },
            )
        )

        cases.append({
            **case,

            "partition":
                str(
                    row.get(
                        "partition",
                        "DEVELOPMENT",
                    )
                ),

            "integrityManifestHash":
                integrity[
                    "manifestHash"
                ],

            "independentEvidence":
                True,
        })

    destination = (
        root
        /
        GOOGLE_APPROVED_RELATIVE
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    shard = _write_jsonl(
        destination
        /
        "phase23r13-google-cloud-behaviour.jsonl",

        cases,
    )

    result_core = {
        "version":
            EXTERNAL_REALITY_PROMOTION_VERSION,

        "sourceId":
            GOOGLE_SOURCE_ID,

        "policyStatus":
            source[
                "policyStatus"
            ],

        "license":
            source[
                "license"
            ],

        "licenseVerified":
            source[
                "licenseVerified"
            ],

        "caseCount":
            len(
                cases
            ),

        "inputPath":
            str(
                source_path
            ),

        "inputSha256":
            source_hash,

        "output":
            shard,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **result_core,

        "promotionHash":
            _stable_hash(
                result_core
            ),
    }


def _validate_public_source_policy(
    row: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    policy = row.get(
        "sourcePolicy"
    )

    if not isinstance(
        policy,
        Mapping,
    ):
        raise ValueError(
            "public incident sourcePolicy is required"
        )

    source_id = str(
        policy.get(
            "sourceId",
            "",
        )
    ).strip()

    if not source_id:
        raise ValueError(
            (
                "public incident "
                "sourcePolicy.sourceId is required"
            )
        )

    if (
        policy.get(
            "policyStatus"
        )
        !=
        "APPROVED_COMMERCIAL"
    ):
        raise ValueError(
            (
                "public incident source must be "
                "APPROVED_COMMERCIAL"
            )
        )

    if (
        policy.get(
            "licenseVerified"
        )
        is not True
    ):
        raise ValueError(
            (
                "public incident source license "
                "must be verified"
            )
        )

    if not str(
        policy.get(
            "license",
            "",
        )
    ).strip():
        raise ValueError(
            "public incident source license is required"
        )

    return dict(
        policy
    )


def promote_public_incidents(
    *,
    data_root: str | Path,
    input_jsonl: str | Path,
    minimum_cases: int = 100,
) -> Dict[
    str,
    Any,
]:
    if minimum_cases < 1:
        raise ValueError(
            "minimum_cases must be positive"
        )

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    source_path = (
        Path(
            input_jsonl
        )
        .expanduser()
        .resolve()
    )

    rows = _read_jsonl(
        source_path
    )

    if (
        len(
            rows
        )
        <
        minimum_cases
    ):
        raise ValueError(
            (
                "public incident corpus has "
                "insufficient records: "
                f"{len(rows)} < {minimum_cases}"
            )
        )

    cases: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    sources: Dict[
        str,
        Dict[
            str,
            Any,
        ],
    ] = {}

    for (
        index,
        row,
    ) in enumerate(
        rows
    ):
        policy = (
            _validate_public_source_policy(
                row
            )
        )

        source_id = policy[
            "sourceId"
        ]

        sources[
            source_id
        ] = policy

        seed = int(
            row.get(
                "seed",
                700000
                +
                index,
            )
        )

        reconstruction = (
            build_public_incident_dataset(
                organization_id=
                    str(
                        row.get(
                            "organizationId",
                            "public-reconstruction",
                        )
                    ),

                environment_id=
                    str(
                        row.get(
                            "environmentId",
                            "historical",
                        )
                    ),

                source_name=
                    str(
                        row.get(
                            "sourceName",
                            "",
                        )
                    ),

                source_version=
                    str(
                        row.get(
                            "sourceVersion",
                            "",
                        )
                    ),

                source_uri=
                    str(
                        row.get(
                            "sourceUri",
                            "",
                        )
                    ),

                source_license=
                    str(
                        policy[
                            "license"
                        ]
                    ),

                incident_reference=
                    str(
                        row.get(
                            "incidentReference",
                            "",
                        )
                    ),

                title=
                    str(
                        row.get(
                            "title",
                            "",
                        )
                    ),

                workload=
                    row.get(
                        "workload"
                    )
                    or
                    {},

                evidence=
                    row.get(
                        "evidence"
                    )
                    or
                    [],

                known_fault=
                    str(
                        row.get(
                            "knownFault",
                            "",
                        )
                    ),

                expected_diagnosis=
                    str(
                        row.get(
                            "expectedDiagnosis",
                            "",
                        )
                    ),

                acceptable_diagnoses=
                    row.get(
                        "acceptableDiagnoses"
                    )
                    or
                    [],

                expected_recovery_family=
                    str(
                        row.get(
                            "expectedRecoveryFamily",
                            "",
                        )
                    ),

                ground_truth_method=
                    str(
                        row.get(
                            "groundTruthMethod",
                            "",
                        )
                    ),

                replay_seed=
                    seed,
            )
        )

        production_case = (
            build_production_incident_corpus_case(
                reconstruction_case=
                    reconstruction[
                        "case"
                    ],

                incident_domain=
                    str(
                        row.get(
                            "incidentDomain",
                            "",
                        )
                    ),

                public_sources=[
                    {
                        "sourceId":
                            source_id,

                        "sourceUri":
                            reconstruction[
                                "source"
                            ][
                                "sourceUri"
                            ],

                        "sourceName":
                            reconstruction[
                                "source"
                            ][
                                "sourceName"
                            ],

                        "license":
                            policy[
                                "license"
                            ],

                        "licenseVerified":
                            True,
                    }
                ],

                historically_visible_evidence=
                    reconstruction[
                        "evidence"
                    ],

                sealed_evaluation={
                    "agentVisible":
                        False,

                    "evaluation":
                        reconstruction[
                            "evaluation"
                        ],
                },

                seed=
                    seed,

                metadata={
                    "populationVersion":
                        EXTERNAL_REALITY_PROMOTION_VERSION,

                    "sourceVersion":
                        reconstruction[
                            "source"
                        ][
                            "sourceVersion"
                        ],
                },
            )
        )

        eligibility = {
            "researchEligible":
                True,

            "modelTrainingEligible":
                False,

            "retrievalEligible":
                False,

            "developmentEvaluationEligible":
                True,

            "validationEligible":
                True,

            "holdoutEligible":
                True,

            "productionCertificationEligible":
                True,

            "customerRuntimeEligible":
                False,

            "redistributionAllowed":
                bool(
                    policy.get(
                        "redistributionAllowed",
                        False,
                    )
                ),

            "agentGroundTruthVisible":
                False,
        }

        enriched = {
            **production_case,

            "sourceId":
                source_id,

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "eligibility":
                eligibility,

            "partition":
                str(
                    row.get(
                        "partition",
                        "VALIDATION",
                    )
                ),
        }

        payload = _json_bytes(
            enriched
        )

        integrity = (
            build_integrity_manifest(
                artifact_id=
                    (
                        f"{production_case['caseId']}"
                        "-public-incident"
                    ),

                source_id=
                    source_id,

                media_type=
                    (
                        "application/vnd.aira."
                        "public-incident+json"
                    ),

                payload=
                    payload,

                normalized_hash=
                    sha256_bytes(
                        payload
                    ),

                parent_case_id=
                    production_case[
                        "parentCaseId"
                    ],

                seed=
                    seed,

                metadata={
                    "phase":
                        "23R.13S.5",
                },
            )
        )

        cases.append({
            **enriched,

            "integrityManifestHash":
                integrity[
                    "manifestHash"
                ],
        })

    destination = (
        root
        /
        PUBLIC_APPROVED_RELATIVE
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    shard = _write_jsonl(
        destination
        /
        "phase23r13-public-production-incidents.jsonl",

        cases,
    )

    source_manifest = _write_json(
        destination
        /
        "phase23r13-public-source-policy-manifest.json",

        {
            "version":
                EXTERNAL_REALITY_PROMOTION_VERSION,

            "sources": [
                sources[
                    key
                ]

                for key
                in sorted(
                    sources
                )
            ],

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        },
    )

    source_payload = (
        source_path
        .read_bytes()
    )

    result_core = {
        "version":
            EXTERNAL_REALITY_PROMOTION_VERSION,

        "caseCount":
            len(
                cases
            ),

        "sourceCount":
            len(
                sources
            ),

        "inputPath":
            str(
                source_path
            ),

        "inputSha256":
            sha256_bytes(
                source_payload
            ),

        "output":
            shard,

        "sourceManifest":
            source_manifest,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **result_core,

        "promotionHash":
            _stable_hash(
                result_core
            ),
    }


def build_external_promotion_manifest(
    *,
    rcaeval: Mapping[
        str,
        Any,
    ],
    google_cloud: Mapping[
        str,
        Any,
    ],
    public_incidents: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    components = {
        "RCAEVAL":
            dict(
                rcaeval
            ),

        "GOOGLE_CLUSTER_DATA":
            dict(
                google_cloud
            ),

        "PUBLIC_INCIDENTS":
            dict(
                public_incidents
            ),
    }

    core = {
        "version":
            EXTERNAL_REALITY_PROMOTION_VERSION,

        "components":
            components,

        "caseCount": (
            int(
                rcaeval[
                    "caseCount"
                ]
            )
            +
            int(
                google_cloud[
                    "caseCount"
                ]
            )
            +
            int(
                public_incidents[
                    "caseCount"
                ]
            )
        ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **core,

        "manifestHash":
            _stable_hash(
                core
            ),
    }