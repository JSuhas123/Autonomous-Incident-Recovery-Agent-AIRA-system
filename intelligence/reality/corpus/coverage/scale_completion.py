"""Phase 23R.13S.6 scale completion and canonical physical inventory.

DERIVATIVE != INDEPENDENT EVIDENCE.
FINAL HOLDOUT != RETRIEVAL CORPUS.
CORPUS DATA != EXECUTION AUTHORITY.
"""

from __future__ import annotations

import hashlib
import json

from collections import Counter
from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence

from intelligence.reality.corpus.policy.eligibility import (
    case_eligibility,
)
from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)
from intelligence.reality.generation.log_diversity.log_diversity import (
    LOG_FAMILIES,
    LOG_FORMATS,
    build_commercial_log_case,
)


SCALE_COMPLETION_VERSION = (
    "23R.13S.6.0"
)

TARGET_INTEGRATION_TRANSLATIONS = (
    1000
)

TARGET_EXECUTABLE_WORKLOAD_CASES = (
    100
)

TARGET_LOG_DIVERSITY_CASES = (
    500
)


GENERATED_ROLE_PATHS = {
    "HEALTHY_BASELINE":
        (
            "generated/healthy-baseline/"
            "phase23r13-healthy-baseline.jsonl"
        ),

    "NOISY_DERIVATIVE":
        (
            "generated/noisy-observability/"
            "phase23r13-noisy-observability.jsonl"
        ),

    "MULTI_FAULT":
        (
            "generated/multi-fault/"
            "phase23r13-multi-fault.jsonl"
        ),

    "CASCADING_FAILURE":
        (
            "generated/cascading-failure/"
            "phase23r13-cascading-failure.jsonl"
        ),

    "AMBIGUOUS_EVIDENCE":
        (
            "generated/ambiguous-evidence/"
            "phase23r13-ambiguous-evidence.jsonl"
        ),

    "RECOVERY_OUTCOME":
        (
            "generated/recovery-outcomes/"
            "phase23r13-recovery-outcomes.jsonl"
        ),
}


RCAEVAL_PATH = (
    "approved/external-benchmarks/"
    "rcaeval/"
    "phase23r13-rcaeval-approved-cases.jsonl"
)

GOOGLE_PATH = (
    "approved/cloud-traces/"
    "google/"
    "phase23r13-google-cloud-behaviour.jsonl"
)

PUBLIC_PATH = (
    "approved/public-incidents/"
    "phase23r13-public-production-incidents.jsonl"
)

PUBLIC_POLICY_PATH = (
    "approved/public-incidents/"
    "phase23r13-public-source-policy-manifest.json"
)

INTEGRATION_DIR = (
    "generated/integration-translation"
)

INTEGRATION_MANIFEST = (
    "generated/integration-translation/"
    "phase23r13-integration-translation-manifest.json"
)

LAB_CAPTURE_PATH = (
    "generated/executable-workloads/"
    "aira-reliability-lab/"
    "phase23r13-live-workload-capture.json"
)

OTEL_CAPTURE_PATH = (
    "generated/executable-workloads/"
    "astronomy-shop/"
    "phase23r13-live-workload-capture.json"
)

EXECUTABLE_CASES_PATH = (
    "generated/executable-workloads/"
    "phase23r13-executable-workload-cases.jsonl"
)

LOG_DIVERSITY_PATH = (
    "generated/log-diversity/"
    "phase23r13-log-diversity.jsonl"
)

INVENTORY_PATH = (
    "manifests/"
    "phase23r13-corpus-inventory.json"
)

SCALE_MANIFEST_PATH = (
    "manifests/"
    "phase23r13-scale-completion-manifest.json"
)


PROVIDER_FAMILIES = (
    "PROMETHEUS",
    "ALERTMANAGER",
    "GRAFANA",
    "OPENTELEMETRY",
    "DATADOG",
    "CLOUDWATCH",
    "AZURE_MONITOR",
    "GCP_MONITORING",
    "PAGERDUTY",
    "SLACK",
    "GITHUB",
    "CI_CD",
    "KUBERNETES",
    "DOCKER",
    "RABBITMQ",
    "REDIS",
    "POSTGRESQL",
)


BASE_ELIGIBILITY = {
    "researchEligible":
        True,

    "modelTrainingEligible":
        False,

    "retrievalEligible":
        True,

    "developmentEvaluationEligible":
        True,

    "validationEligible":
        True,

    "holdoutEligible":
        False,

    "productionCertificationEligible":
        False,

    "customerRuntimeEligible":
        False,

    "redistributionAllowed":
        False,

    "agentGroundTruthVisible":
        False,
}


def _stable_bytes(
    value: Any,
) -> bytes:
    return json.dumps(
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


def _stable_hash(
    value: Any,
) -> str:
    return hashlib.sha256(
        _stable_bytes(
            value
        )
    ).hexdigest()


def _file_descriptor(
    path: Path,
) -> Dict[str, Any]:
    if not path.is_file():
        raise ValueError(
            (
                "required physical artifact "
                f"missing: {path}"
            )
        )

    payload = (
        path.read_bytes()
    )

    if not payload:
        raise ValueError(
            (
                "required physical artifact "
                f"is empty: {path}"
            )
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
            hashlib.sha256(
                payload
            ).hexdigest(),
    }


def _read_json(
    path: Path,
) -> Dict[str, Any]:
    _file_descriptor(
        path
    )

    value = json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

    if not isinstance(
        value,
        dict,
    ):
        raise ValueError(
            (
                "JSON root must be "
                f"an object: {path}"
            )
        )

    return value


def _read_jsonl(
    path: Path,
) -> list[Dict[str, Any]]:
    _file_descriptor(
        path
    )

    rows: list[
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

        value = json.loads(
            line
        )

        if not isinstance(
            value,
            dict,
        ):
            raise ValueError(
                (
                    "JSONL row must be object: "
                    f"{path}:{line_number}"
                )
            )

        rows.append(
            value
        )

    if not rows:
        raise ValueError(
            (
                "JSONL contains no records: "
                f"{path}"
            )
        )

    return rows


def _write_json(
    path: Path,
    value: Mapping[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    payload = (
        json.dumps(
            value,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        ).encode(
            "utf-8"
        )
        +
        b"\n"
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
            hashlib.sha256(
                payload
            ).hexdigest(),
    }


def _write_jsonl(
    path: Path,
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[str, Any]:
    if not rows:
        raise ValueError(
            "cannot write empty JSONL corpus"
        )

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = (
        hashlib.sha256()
    )

    byte_size = (
        0
    )

    with path.open(
        "wb"
    ) as handle:
        for row in rows:
            line = (
                _stable_bytes(
                    row
                )
                +
                b"\n"
            )

            handle.write(
                line
            )

            hasher.update(
                line
            )

            byte_size += (
                len(
                    line
                )
            )

    return {
        "path":
            str(
                path
            ),

        "recordCount":
            len(
                rows
            ),

        "byteSize":
            byte_size,

        "sha256":
            hasher.hexdigest(),
    }


def _source_inventory_row(
    source_id: str,
) -> Dict[str, Any]:
    source = get_source(
        source_id
    )

    return {
        "sourceId":
            source[
                "sourceId"
            ],

        "policyStatus":
            source[
                "policyStatus"
            ],

        "licenseVerified":
            bool(
                source[
                    "licenseVerified"
                ]
            ),

        "license":
            source.get(
                "license"
            ),
    }


def _eligibility_for(
    source_id: str,
    role: str,
) -> Dict[str, Any]:
    source = get_source(
        source_id
    )

    return dict(
        case_eligibility(
            source,
            corpus_role=
                role,
        )[
            "eligibility"
        ]
    )


def _case_hash(
    row: Mapping[
        str,
        Any,
    ],
) -> str:
    existing = row.get(
        "integrityManifestHash"
    )

    if (
        isinstance(
            existing,
            str,
        )
        and
        len(
            existing
        )
        ==
        64
    ):
        return (
            existing.lower()
        )

    return _stable_hash(
        row
    )


def generate_log_diversity_cases(
    count: int = (
        TARGET_LOG_DIVERSITY_CASES
    ),
) -> list[Dict[str, Any]]:
    if count < 1:
        raise ValueError(
            (
                "log diversity count "
                "must be positive"
            )
        )

    families = sorted(
        LOG_FAMILIES
    )

    formats = sorted(
        LOG_FORMATS
    )

    cases: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    for index in range(
        count
    ):
        provider_family = (
            PROVIDER_FAMILIES[
                index
                %
                len(
                    PROVIDER_FAMILIES
                )
            ]
        )

        log_family = (
            families[
                index
                %
                len(
                    families
                )
            ]
        )

        log_format = (
            formats[
                (
                    index
                    //
                    len(
                        families
                    )
                )
                %
                len(
                    formats
                )
            ]
        )

        sample_id = (
            "aira-log-diversity-"
            f"{index:04d}"
        )

        records = [
            {
                "timestampOffsetMs":
                    0,

                "level":
                    (
                        "INFO"
                        if index % 5
                        else
                        "WARN"
                    ),

                "component":
                    provider_family.lower(),

                "message":
                    (
                        "deterministic "
                        f"{provider_family} "
                        "operational observation "
                        f"{index}"
                    ),
            },

            {
                "timestampOffsetMs":
                    1000,

                "level":
                    "INFO",

                "component":
                    log_family.lower(),

                "message":
                    (
                        f"log-family={log_family} "
                        f"format={log_format}"
                    ),
            },
        ]

        base = (
            build_commercial_log_case(
                source_id=
                    "AIRA_RELIABILITY_LAB",

                sample_id=
                    sample_id,

                log_family=
                    log_family,

                log_format=
                    log_format,

                records=
                    records,

                evidence_grade=
                    "E1",

                seed=
                    23200000
                    +
                    index,

                metadata={
                    "populationVersion":
                        SCALE_COMPLETION_VERSION,

                    "providerFamily":
                        provider_family,

                    "independentEvidence":
                        False,
                },
            )
        )

        enriched = {
            **base,

            "providerFamily":
                provider_family,

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "partition":
                "DEVELOPMENT",

            "independentEvidence":
                False,

            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        }

        enriched[
            "integrityManifestHash"
        ] = _stable_hash(
            enriched
        )

        cases.append(
            enriched
        )

    return cases


def _capture_slice_payload(
    capture: Mapping[
        str,
        Any,
    ],
    slice_index: int,
) -> Dict[str, Any]:
    capture_type = str(
        capture.get(
            "captureType",
            "",
        )
    )

    if (
        capture_type
        ==
        "AIRA_RELIABILITY_LAB"
    ):
        collections = (
            (
                "deployment",
                (
                    capture.get(
                        "deployments"
                    )
                    or
                    {}
                ).get(
                    "items",
                    [],
                ),
            ),

            (
                "pod",
                (
                    capture.get(
                        "pods"
                    )
                    or
                    {}
                ).get(
                    "items",
                    [],
                ),
            ),

            (
                "service",
                (
                    capture.get(
                        "services"
                    )
                    or
                    {}
                ).get(
                    "items",
                    [],
                ),
            ),

            (
                "event",
                (
                    capture.get(
                        "events"
                    )
                    or
                    {}
                ).get(
                    "items",
                    [],
                ),
            ),
        )

        flattened: list[
            Dict[
                str,
                Any,
            ]
        ] = []

        for (
            kind,
            items,
        ) in collections:
            if not isinstance(
                items,
                list,
            ):
                continue

            for item in items:
                if not isinstance(
                    item,
                    Mapping,
                ):
                    continue

                metadata = (
                    item.get(
                        "metadata"
                    )
                    or
                    {}
                )

                flattened.append({
                    "kind":
                        kind,

                    "name":
                        str(
                            metadata.get(
                                "name",
                                "",
                            )
                        ),

                    "namespace":
                        str(
                            metadata.get(
                                "namespace",
                                "",
                            )
                        ),

                    "uid":
                        str(
                            metadata.get(
                                "uid",
                                "",
                            )
                        ),
                })

        if flattened:
            return (
                flattened[
                    slice_index
                    %
                    len(
                        flattened
                    )
                ]
            )

        return {
            "kind":
                "capture",

            "name":
                "aira-reliability-lab",
        }

    containers = (
        capture.get(
            "containers"
        )
        or
        []
    )

    if (
        isinstance(
            containers,
            list,
        )
        and
        containers
    ):
        item = (
            containers[
                slice_index
                %
                len(
                    containers
                )
            ]
        )

        if isinstance(
            item,
            Mapping,
        ):
            return {
                "kind":
                    "container",

                "name":
                    str(
                        item.get(
                            "Name"
                        )
                        or
                        item.get(
                            "name"
                        )
                        or
                        ""
                    ),

                "service":
                    str(
                        item.get(
                            "Service"
                        )
                        or
                        item.get(
                            "service"
                        )
                        or
                        ""
                    ),

                "state":
                    str(
                        item.get(
                            "State"
                        )
                        or
                        item.get(
                            "state"
                        )
                        or
                        ""
                    ),
            }

    return {
        "kind":
            "capture",

        "name":
            "otel-astronomy-shop",
    }


def generate_executable_workload_cases(
    captures: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    count: int = (
        TARGET_EXECUTABLE_WORKLOAD_CASES
    ),
) -> list[Dict[str, Any]]:
    if count < 1:
        raise ValueError(
            (
                "executable workload count "
                "must be positive"
            )
        )

    if not captures:
        raise ValueError(
            (
                "at least one real workload "
                "capture is required"
            )
        )

    cases: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    for index in range(
        count
    ):
        capture = (
            captures[
                index
                %
                len(
                    captures
                )
            ]
        )

        source_id = str(
            capture.get(
                "sourceId",
                "",
            )
        ).strip()

        workload_id = str(
            capture.get(
                "workloadId",
                "",
            )
        ).strip()

        capture_hash = str(
            capture.get(
                "captureHash",
                "",
            )
        ).strip()

        evidence_grade = str(
            capture.get(
                "evidenceGrade",
                "E1",
            )
        )

        if (
            not source_id
            or
            not workload_id
            or
            len(
                capture_hash
            )
            !=
            64
        ):
            raise ValueError(
                (
                    "real workload capture is "
                    "missing canonical identity/hash"
                )
            )

        if (
            capture.get(
                "executionAuthorized"
            )
            is not False
        ):
            raise ValueError(
                (
                    "real workload capture "
                    "unexpectedly grants "
                    "execution authority"
                )
            )

        if (
            capture.get(
                "productionCertified"
            )
            is not False
        ):
            raise ValueError(
                (
                    "real workload capture "
                    "unexpectedly grants "
                    "production certification"
                )
            )

        provider_family = (
            "KUBERNETES"
            if
            capture.get(
                "captureType"
            )
            ==
            "AIRA_RELIABILITY_LAB"
            else
            "DOCKER"
        )

        slice_payload = (
            _capture_slice_payload(
                capture,
                index,
            )
        )

        identity = {
            "captureHash":
                capture_hash,

            "sliceIndex":
                index,

            "slice":
                slice_payload,

            "transformationVersion":
                SCALE_COMPLETION_VERSION,
        }

        digest = _stable_hash(
            identity
        )

        row = {
            "version":
                SCALE_COMPLETION_VERSION,

            "caseId":
                (
                    "workload-"
                    +
                    digest[:24]
                ),

            "sourceId":
                source_id,

            "corpusRole":
                "EXECUTABLE_WORKLOAD",

            "evidenceGrade":
                evidence_grade,

            "partition":
                "VALIDATION",

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "eligibility":
                _eligibility_for(
                    source_id,
                    "EXECUTABLE_WORKLOAD",
                ),

            "providerFamily":
                provider_family,

            "workloadId":
                workload_id,

            "evidenceModalities": [
                "RESOURCE_STATE",
            ],

            "parentCaptureHash":
                capture_hash,

            "captureSlice":
                slice_payload,

            "deterministicSeed":
                23300000
                +
                index,

            "transformationVersion":
                SCALE_COMPLETION_VERSION,

            "independentEvidence":
                False,

            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        }

        row[
            "integrityManifestHash"
        ] = _stable_hash(
            row
        )

        cases.append(
            row
        )

    return cases


def _normalize_generated_case(
    row: Mapping[
        str,
        Any,
    ],
    role: str,
) -> Dict[str, Any]:
    source_id = str(
        row.get(
            "sourceId",
            "AIRA_RELIABILITY_LAB",
        )
    )

    partition = (
        "RETRIEVAL"
        if
        role
        ==
        "HEALTHY_BASELINE"
        else
        "DEVELOPMENT"
    )

    return {
        **dict(
            row
        ),

        "sourceId":
            source_id,

        "corpusRole":
            role,

        "evidenceGrade":
            str(
                row.get(
                    "evidenceGrade",
                    "E1",
                )
            ),

        "partition":
            partition,

        "policyStatus":
            str(
                row.get(
                    "policyStatus",
                    "APPROVED_COMMERCIAL",
                )
            ),

        "eligibility":
            dict(
                row.get(
                    "eligibility"
                )
                or
                BASE_ELIGIBILITY
            ),

        "integrityManifestHash":
            _case_hash(
                row
            ),

        "independentEvidence":
            bool(
                row.get(
                    "independentEvidence",
                    False,
                )
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def _load_translation_rows(
    root: Path,
) -> list[Dict[str, Any]]:
    manifest = _read_json(
        root
        /
        INTEGRATION_MANIFEST
    )

    translation_count = int(
        manifest.get(
            "translationCount",
            0,
        )
    )

    if (
        translation_count
        <
        TARGET_INTEGRATION_TRANSLATIONS
    ):
        raise ValueError(
            (
                "integration translation corpus "
                "below 1000; run the "
                "23R.13S.6 scale population first"
            )
        )

    rows: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    directory = (
        root
        /
        INTEGRATION_DIR
    )

    for path in sorted(
        directory.glob(
            "*.json"
        )
    ):
        if (
            path.name
            ==
            (
                "phase23r13-integration-"
                "translation-manifest.json"
            )
        ):
            continue

        row = _read_json(
            path
        )

        if (
            row.get(
                "corpusRole"
            )
            !=
            "INTEGRATION_TRANSLATION"
        ):
            continue

        rows.append({
            **row,

            "caseId":
                str(
                    row.get(
                        "translationId",
                        "",
                    )
                ),

            "sourceId":
                "AIRA_RELIABILITY_LAB",

            "evidenceGrade":
                "E1",

            "partition":
                "DEVELOPMENT",

            "policyStatus":
                "APPROVED_COMMERCIAL",

            "eligibility":
                dict(
                    BASE_ELIGIBILITY
                ),

            "integrityManifestHash":
                str(
                    row.get(
                        "translationHash",
                        "",
                    )
                ),

            "independentEvidence":
                False,

            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        })

    if (
        len(
            rows
        )
        !=
        translation_count
    ):
        raise ValueError(
            (
                "integration translation "
                "manifest/file count mismatch: "
                f"{len(rows)} != "
                f"{translation_count}"
            )
        )

    return rows


def _normalize_public_case(
    row: Mapping[
        str,
        Any,
    ],
) -> Dict[str, Any]:
    source_partition = str(
        row.get(
            "partition",
            "VALIDATION",
        )
    )

    # Wikimedia producer HOLDOUT is not the
    # separately sealed FINAL_HOLDOUT corpus.
    partition = (
        "VALIDATION"
        if
        source_partition
        ==
        "HOLDOUT"
        else
        source_partition
    )

    return {
        **dict(
            row
        ),

        "partition":
            partition,

        "sourcePartition":
            source_partition,

        "isFinalHoldout":
            False,
    }


def _unique_sources(
    rows: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
) -> list[str]:
    return sorted({
        str(
            row.get(
                "sourceId",
                "",
            )
        ).strip()

        for row in rows

        if str(
            row.get(
                "sourceId",
                "",
            )
        ).strip()
    })


def build_canonical_inventory(
    *,
    data_root: str | Path,
) -> Dict[str, Any]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    if not root.is_dir():
        raise ValueError(
            (
                "AIRA-DATA root does not "
                f"exist: {root}"
            )
        )

    rcaeval = _read_jsonl(
        root
        /
        RCAEVAL_PATH
    )

    google = _read_jsonl(
        root
        /
        GOOGLE_PATH
    )

    public = [
        _normalize_public_case(
            row
        )

        for row
        in _read_jsonl(
            root
            /
            PUBLIC_PATH
        )
    ]

    public_policy = _read_json(
        root
        /
        PUBLIC_POLICY_PATH
    )

    translations = (
        _load_translation_rows(
            root
        )
    )

    executable = _read_jsonl(
        root
        /
        EXECUTABLE_CASES_PATH
    )

    logs = _read_jsonl(
        root
        /
        LOG_DIVERSITY_PATH
    )

    generated: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    generated_artifacts: Dict[
        str,
        Any,
    ] = {}

    for (
        role,
        relative_path,
    ) in GENERATED_ROLE_PATHS.items():
        path = (
            root
            /
            relative_path
        )

        rows = _read_jsonl(
            path
        )

        generated.extend(
            _normalize_generated_case(
                row,
                role,
            )

            for row
            in rows
        )

        generated_artifacts[
            role
        ] = _file_descriptor(
            path
        )

    cases = [
        *rcaeval,
        *google,
        *public,
        *generated,
        *translations,
        *executable,
        *logs,
    ]

    if any(
        case.get(
            "executionAuthorized"
        )
        is not False

        for case
        in cases
    ):
        raise ValueError(
            (
                "canonical inventory contains "
                "execution-authorized corpus data"
            )
        )

    if any(
        case.get(
            "groundTruthAgentVisible"
        )
        is not False

        for case
        in cases
    ):
        raise ValueError(
            (
                "canonical inventory contains "
                "agent-visible ground truth"
            )
        )

    if any(
        case.get(
            "productionCertified"
        )
        is not False

        for case
        in cases
    ):
        raise ValueError(
            (
                "canonical inventory contains "
                "corpus-derived production "
                "certification"
            )
        )

    source_rows: Dict[
        str,
        Dict[
            str,
            Any,
        ],
    ] = {}

    for source_id in _unique_sources(
        cases
    ):
        try:
            source_rows[
                source_id
            ] = _source_inventory_row(
                source_id
            )

        except KeyError:
            pass

    for source in public_policy.get(
        "sources",
        [],
    ):
        if not isinstance(
            source,
            Mapping,
        ):
            continue

        source_id = str(
            source.get(
                "sourceId",
                "",
            )
        ).strip()

        if source_id:
            source_rows[
                source_id
            ] = {
                "sourceId":
                    source_id,

                "policyStatus":
                    str(
                        source.get(
                            "policyStatus",
                            "",
                        )
                    ),

                "licenseVerified":
                    bool(
                        source.get(
                            "licenseVerified",
                            False,
                        )
                    ),

                "license":
                    source.get(
                        "license"
                    ),
            }

    missing_sources = sorted(
        set(
            _unique_sources(
                cases
            )
        )
        -
        set(
            source_rows
        )
    )

    if missing_sources:
        raise ValueError(
            (
                "inventory sources missing "
                "policy metadata: "
                f"{missing_sources}"
            )
        )

    role_counts = Counter(
        str(
            case.get(
                "corpusRole",
                "",
            )
        )

        for case
        in cases
    )

    provider_counts = Counter(
        str(
            case.get(
                "providerFamily",
                "",
            )
        )

        for case
        in cases

        if case.get(
            "providerFamily"
        )
    )

    partition_counts = Counter(
        str(
            case.get(
                "partition",
                "",
            )
        )

        for case
        in cases
    )

    grade_counts = Counter(
        str(
            case.get(
                "evidenceGrade",
                "",
            )
        )

        for case
        in cases
    )

    physical_artifacts = {
        "RCAEVAL":
            _file_descriptor(
                root
                /
                RCAEVAL_PATH
            ),

        "GOOGLE_CLUSTER_DATA":
            _file_descriptor(
                root
                /
                GOOGLE_PATH
            ),

        "PUBLIC_INCIDENTS":
            _file_descriptor(
                root
                /
                PUBLIC_PATH
            ),

        "PUBLIC_POLICY":
            _file_descriptor(
                root
                /
                PUBLIC_POLICY_PATH
            ),

        "INTEGRATION_TRANSLATION_MANIFEST":
            _file_descriptor(
                root
                /
                INTEGRATION_MANIFEST
            ),

        "EXECUTABLE_WORKLOAD_CASES":
            _file_descriptor(
                root
                /
                EXECUTABLE_CASES_PATH
            ),

        "LOG_DIVERSITY":
            _file_descriptor(
                root
                /
                LOG_DIVERSITY_PATH
            ),

        **generated_artifacts,
    }

    core = {
        "version":
            SCALE_COMPLETION_VERSION,

        "sources": [
            source_rows[
                key
            ]

            for key
            in sorted(
                source_rows
            )
        ],

        "cases":
            cases,

        "physicalSummary": {
            "totalCases":
                len(
                    cases
                ),

            "roleCounts":
                dict(
                    sorted(
                        role_counts.items()
                    )
                ),

            "providerFamilyCounts":
                dict(
                    sorted(
                        provider_counts.items()
                    )
                ),

            "partitionCounts":
                dict(
                    sorted(
                        partition_counts.items()
                    )
                ),

            "evidenceGradeCounts":
                dict(
                    sorted(
                        grade_counts.items()
                    )
                ),

            "physicalArtifacts":
                physical_artifacts,
        },

        "safety": {
            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,

            "integrationTranslationsIndependentEvidence":
                False,

            "workloadSlicesIndependentEvidence":
                False,

            "holdoutRetrievalLeakage":
                0,
        },
    }

    return {
        **core,

        "inventoryHash":
            _stable_hash(
                core
            ),
    }


def complete_scale_population(
    *,
    data_root: str | Path,
) -> Dict[str, Any]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    if not root.is_dir():
        raise ValueError(
            (
                "AIRA-DATA root does not "
                f"exist: {root}"
            )
        )

    integration_manifest = (
        _read_json(
            root
            /
            INTEGRATION_MANIFEST
        )
    )

    translation_count = int(
        integration_manifest.get(
            "translationCount",
            0,
        )
    )

    if (
        translation_count
        <
        TARGET_INTEGRATION_TRANSLATIONS
    ):
        raise ValueError(
            (
                "integration translations "
                "remain below target: "
                f"{translation_count} < "
                f"{TARGET_INTEGRATION_TRANSLATIONS}"
            )
        )

    lab_capture = _read_json(
        root
        /
        LAB_CAPTURE_PATH
    )

    otel_capture = _read_json(
        root
        /
        OTEL_CAPTURE_PATH
    )

    workload_cases = (
        generate_executable_workload_cases(
            [
                lab_capture,
                otel_capture,
            ],

            TARGET_EXECUTABLE_WORKLOAD_CASES,
        )
    )

    workload_artifact = (
        _write_jsonl(
            root
            /
            EXECUTABLE_CASES_PATH,

            workload_cases,
        )
    )

    log_cases = (
        generate_log_diversity_cases(
            TARGET_LOG_DIVERSITY_CASES
        )
    )

    log_artifact = (
        _write_jsonl(
            root
            /
            LOG_DIVERSITY_PATH,

            log_cases,
        )
    )

    inventory = (
        build_canonical_inventory(
            data_root=
                root
        )
    )

    inventory_artifact = (
        _write_json(
            root
            /
            INVENTORY_PATH,

            inventory,
        )
    )

    role_counts = (
        inventory[
            "physicalSummary"
        ][
            "roleCounts"
        ]
    )

    provider_counts = (
        inventory[
            "physicalSummary"
        ][
            "providerFamilyCounts"
        ]
    )

    manifest_core = {
        "version":
            SCALE_COMPLETION_VERSION,

        "status":
            "PASS",

        "translationCount":
            translation_count,

        "executableWorkloadCaseCount":
            len(
                workload_cases
            ),

        "logDiversityCaseCount":
            len(
                log_cases
            ),

        "finalHoldoutCount":
            int(
                role_counts.get(
                    "FINAL_HOLDOUT",
                    0,
                )
            ),

        "roleCounts":
            role_counts,

        "providerFamilyCounts":
            provider_counts,

        "requiredProviderFamiliesPresent":
            all(
                provider
                in
                provider_counts

                for provider
                in PROVIDER_FAMILIES
            ),

        "workloadArtifact":
            workload_artifact,

        "logDiversityArtifact":
            log_artifact,

        "inventoryArtifact":
            inventory_artifact,

        "inventoryHash":
            inventory[
                "inventoryHash"
            ],

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    if (
        manifest_core[
            "finalHoldoutCount"
        ]
        <
        50
    ):
        raise ValueError(
            (
                "physical FINAL_HOLDOUT "
                "remains below 50; "
                "do not synthesize final "
                "holdout evidence"
            )
        )

    if not manifest_core[
        "requiredProviderFamiliesPresent"
    ]:
        raise ValueError(
            (
                "required provider-family "
                "coverage is incomplete"
            )
        )

    manifest = {
        **manifest_core,

        "manifestHash":
            _stable_hash(
                manifest_core
            ),
    }

    manifest_artifact = (
        _write_json(
            root
            /
            SCALE_MANIFEST_PATH,

            manifest,
        )
    )

    return {
        **manifest,

        "manifestPath":
            manifest_artifact[
                "path"
            ],

        "inventoryPath":
            inventory_artifact[
                "path"
            ],
    }