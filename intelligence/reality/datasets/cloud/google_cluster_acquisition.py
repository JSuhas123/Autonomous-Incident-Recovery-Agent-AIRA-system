"""Phase 23R.13S.5C Google Cluster Data acquisition.

The official Google Cluster Data 2019 trace is extremely large. A conventional
BigQuery SELECT, even with LIMIT or TABLESAMPLE, can scan hundreds of GiB.

Phase 23R therefore acquires its bounded real cloud-behaviour sample through
the BigQuery TableData API (client.list_rows), which is the programmatic
equivalent of table preview and does not execute a BigQuery SQL query.

The acquisition remains:
- read only
- bounded
- deterministic
- real external evidence
- ground-truth sealed
- execution-authority free
- production-certification free
"""

from __future__ import annotations

import hashlib
import json

from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence


GOOGLE_CLUSTER_ACQUISITION_VERSION = (
    "23R.13S.5C.1"
)

GOOGLE_CLUSTER_SOURCE_ID = (
    "GOOGLE_CLUSTER_DATA"
)

GOOGLE_CLUSTER_DATASET_PROJECT = (
    "google.com:google-cluster-data"
)

GOOGLE_CLUSTER_DEFAULT_CELL = (
    "a"
)

GOOGLE_CLUSTER_ALLOWED_CELLS = frozenset(
    "abcdefgh"
)

GOOGLE_CLUSTER_DEFAULT_SAMPLE_COUNT = (
    500
)

GOOGLE_CLUSTER_DEFAULT_PARTITION = (
    "DEVELOPMENT"
)

GOOGLE_CLUSTER_DEFAULT_FETCH_MULTIPLIER = (
    4
)

GOOGLE_CLUSTER_DEFAULT_WINDOW_COUNT = (
    8
)

GOOGLE_CLUSTER_DEFAULT_OUTPUT_RELATIVE = (
    "staging/downloads/google-cluster-data/"
    "google-cluster-sample.jsonl"
)

GOOGLE_CLUSTER_DEFAULT_MANIFEST_RELATIVE = (
    "manifests/"
    "phase23r13-google-cluster-acquisition-manifest.json"
)

GOOGLE_CLUSTER_SELECTED_TOP_LEVEL_FIELDS = (
    "start_time",
    "end_time",
    "collection_id",
    "instance_index",
    "machine_id",
    "alloc_collection_id",
    "average_usage",
    "maximum_usage",
)


def _stable_json_bytes(
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


def _sha256_bytes(
    payload: bytes,
) -> str:
    return (
        hashlib
        .sha256(
            payload
        )
        .hexdigest()
    )


def _require_positive_int(
    value: int,
    name: str,
) -> int:
    if (
        not isinstance(
            value,
            int,
        )
        or
        isinstance(
            value,
            bool,
        )
        or
        value < 1
    ):
        raise ValueError(
            f"{name} must be a positive integer"
        )

    return value


def _require_cell(
    cell: str,
) -> str:
    normalized = str(
        cell
        or
        ""
    ).strip().lower()

    if (
        normalized
        not in
        GOOGLE_CLUSTER_ALLOWED_CELLS
    ):
        raise ValueError(
            (
                "cell must be one of: "
                +
                ", ".join(
                    sorted(
                        GOOGLE_CLUSTER_ALLOWED_CELLS
                    )
                )
            )
        )

    return normalized


def _require_partition(
    partition: str,
) -> str:
    normalized = str(
        partition
        or
        ""
    ).strip().upper()

    if normalized not in {
        "RETRIEVAL",
        "DEVELOPMENT",
        "VALIDATION",
        "HOLDOUT",
    }:
        raise ValueError(
            (
                "partition must be RETRIEVAL, "
                "DEVELOPMENT, VALIDATION, or HOLDOUT"
            )
        )

    return normalized


def google_cluster_table_id(
    *,
    cell: str =
        GOOGLE_CLUSTER_DEFAULT_CELL,
) -> str:
    normalized_cell = (
        _require_cell(
            cell
        )
    )

    return (
        f"{GOOGLE_CLUSTER_DATASET_PROJECT}."
        f"clusterdata_2019_{normalized_cell}."
        "instance_usage"
    )


def build_google_cluster_query(
    *,
    cell: str =
        GOOGLE_CLUSTER_DEFAULT_CELL,

    sample_count: int =
        GOOGLE_CLUSTER_DEFAULT_SAMPLE_COUNT,

    sample_percent: float | None =
        None,
) -> str:
    """Return an informational string for backwards CLI compatibility.

    Phase 23R.13S.5C.1 intentionally does not execute SQL.
    """

    normalized_cell = (
        _require_cell(
            cell
        )
    )

    count = (
        _require_positive_int(
            sample_count,
            "sample_count",
        )
    )

    return (
        "-- Phase 23R.13S.5C.1\n"
        "-- SQL EXECUTION DISABLED FOR COST SAFETY\n"
        "-- Acquisition uses BigQuery TableData API / list_rows.\n"
        "-- Google documents table preview / tabledata.list as the\n"
        "-- appropriate no-query-cost mechanism for inspecting rows.\n"
        f"-- table: {google_cluster_table_id(cell=normalized_cell)}\n"
        f"-- requestedCases: {count}\n"
        "-- executionAuthorized: false\n"
        "-- productionCertified: false"
    )


def _row_get(
    row: Any,
    key: str,
    default: Any = None,
) -> Any:
    if isinstance(
        row,
        Mapping,
    ):
        return row.get(
            key,
            default,
        )

    try:
        return row[
            key
        ]

    except (
        KeyError,
        IndexError,
        TypeError,
    ):
        pass

    return getattr(
        row,
        key,
        default,
    )


def _nested_get(
    value: Any,
    key: str,
    default: Any = None,
) -> Any:
    if value is None:
        return default

    if isinstance(
        value,
        Mapping,
    ):
        return value.get(
            key,
            default,
        )

    try:
        return value[
            key
        ]

    except (
        KeyError,
        IndexError,
        TypeError,
    ):
        pass

    return getattr(
        value,
        key,
        default,
    )


def _optional_int(
    value: Any,
) -> int | None:
    if value is None:
        return None

    try:
        return int(
            value
        )

    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return None


def _optional_float(
    value: Any,
) -> float | None:
    if value is None:
        return None

    try:
        parsed = float(
            value
        )

    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return None

    if (
        parsed !=
        parsed
    ):
        return None

    return parsed


def _raw_row_to_flat_mapping(
    row: Any,
) -> Dict[
    str,
    Any,
] | None:
    average_usage = (
        _row_get(
            row,
            "average_usage",
        )
    )

    maximum_usage = (
        _row_get(
            row,
            "maximum_usage",
        )
    )

    start_time = (
        _optional_int(
            _row_get(
                row,
                "start_time",
            )
        )
    )

    end_time = (
        _optional_int(
            _row_get(
                row,
                "end_time",
            )
        )
    )

    collection_id = (
        _optional_int(
            _row_get(
                row,
                "collection_id",
            )
        )
    )

    instance_index = (
        _optional_int(
            _row_get(
                row,
                "instance_index",
            )
        )
    )

    machine_id = (
        _optional_int(
            _row_get(
                row,
                "machine_id",
            )
        )
    )

    alloc_collection_id = (
        _optional_int(
            _row_get(
                row,
                "alloc_collection_id",
            )
        )
    )

    average_cpu = (
        _optional_float(
            _nested_get(
                average_usage,
                "cpus",
            )
        )
    )

    average_memory = (
        _optional_float(
            _nested_get(
                average_usage,
                "memory",
            )
        )
    )

    maximum_cpu = (
        _optional_float(
            _nested_get(
                maximum_usage,
                "cpus",
            )
        )
    )

    maximum_memory = (
        _optional_float(
            _nested_get(
                maximum_usage,
                "memory",
            )
        )
    )

    if (
        start_time is None
        or
        end_time is None
        or
        collection_id is None
        or
        instance_index is None
        or
        machine_id is None
        or
        average_cpu is None
        or
        average_memory is None
    ):
        return None

    if (
        end_time
        <=
        start_time
    ):
        return None

    if (
        alloc_collection_id
        not in (
            None,
            0,
        )
    ):
        return None

    return {
        "start_time":
            start_time,

        "end_time":
            end_time,

        "collection_id":
            collection_id,

        "instance_index":
            instance_index,

        "machine_id":
            machine_id,

        "average_cpu":
            average_cpu,

        "average_memory":
            average_memory,

        "maximum_cpu":
            maximum_cpu,

        "maximum_memory":
            maximum_memory,
    }


def normalize_google_cluster_row(
    row: Mapping[
        str,
        Any,
    ],
    *,
    cell: str,
    sequence: int,
    partition: str =
        GOOGLE_CLUSTER_DEFAULT_PARTITION,
) -> Dict[
    str,
    Any,
]:
    normalized_cell = (
        _require_cell(
            cell
        )
    )

    normalized_partition = (
        _require_partition(
            partition
        )
    )

    _require_positive_int(
        sequence,
        "sequence",
    )

    start_time = int(
        row[
            "start_time"
        ]
    )

    end_time = int(
        row[
            "end_time"
        ]
    )

    collection_id = int(
        row[
            "collection_id"
        ]
    )

    instance_index = int(
        row[
            "instance_index"
        ]
    )

    machine_id = int(
        row[
            "machine_id"
        ]
    )

    average_cpu = float(
        row[
            "average_cpu"
        ]
    )

    average_memory = float(
        row[
            "average_memory"
        ]
    )

    maximum_cpu = (
        _optional_float(
            row.get(
                "maximum_cpu"
            )
        )
    )

    maximum_memory = (
        _optional_float(
            row.get(
                "maximum_memory"
            )
        )
    )

    if (
        end_time
        <=
        start_time
    ):
        raise ValueError(
            (
                "Google cluster sample "
                "end_time must be > start_time"
            )
        )

    identity = {
        "cell":
            normalized_cell,

        "collectionId":
            collection_id,

        "instanceIndex":
            instance_index,

        "machineId":
            machine_id,

        "startTimeMicros":
            start_time,

        "endTimeMicros":
            end_time,
    }

    digest = (
        _sha256_bytes(
            _stable_json_bytes(
                identity
            )
        )
    )

    evidence: list[
        Dict[
            str,
            Any,
        ]
    ] = [
        {
            "kind":
                "METRIC",

            "metricFamily":
                "RESOURCE_UTILIZATION",

            "cpuUsage":
                average_cpu,

            "memoryUsage":
                average_memory,

            "aggregation":
                "AVERAGE",

            "source":
                (
                    "google-cluster-data-2019-"
                    "instance-usage"
                ),
        }
    ]

    if (
        maximum_cpu is not None
        or
        maximum_memory is not None
    ):
        evidence.append({
            "kind":
                "METRIC",

            "metricFamily":
                "RESOURCE_UTILIZATION",

            "cpuUsage":
                maximum_cpu,

            "memoryUsage":
                maximum_memory,

            "aggregation":
                "MAXIMUM",

            "source":
                (
                    "google-cluster-data-2019-"
                    "instance-usage"
                ),
        })

    return {
        "sampleId":
            (
                "google-"
                f"{normalized_cell}-"
                f"{digest[:24]}"
            ),

        "sampleType":
            "RESOURCE_UTILIZATION",

        "sourceWindow": {
            "startMicros":
                start_time,

            "endMicros":
                end_time,
        },

        "evidence":
            evidence,

        "partition":
            normalized_partition,

        "seed":
            650000
            +
            sequence,

        "metadata": {
            "acquisitionVersion":
                GOOGLE_CLUSTER_ACQUISITION_VERSION,

            "traceVersion":
                "clusterdata-2019-v3",

            "cell":
                normalized_cell,

            "sourceTable":
                (
                    "clusterdata_2019_"
                    f"{normalized_cell}."
                    "instance_usage"
                ),

            "acquisitionMethod":
                "BIGQUERY_TABLEDATA_LIST_ROWS",

            "sqlQueryExecuted":
                False,

            "anonymizedIdentifiers":
                True,

            "rawIdentityDigest":
                digest,

            "groundTruthAgentVisible":
                False,

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        },
    }


def normalize_google_cluster_rows(
    rows: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
    *,
    cell: str,
    partition: str =
        GOOGLE_CLUSTER_DEFAULT_PARTITION,
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    normalized: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen_ids: set[
        str
    ] = set()

    for (
        sequence,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        case = (
            normalize_google_cluster_row(
                row,
                cell=
                    cell,
                sequence=
                    sequence,
                partition=
                    partition,
            )
        )

        sample_id = (
            case[
                "sampleId"
            ]
        )

        if (
            sample_id
            in
            seen_ids
        ):
            continue

        seen_ids.add(
            sample_id
        )

        normalized.append(
            case
        )

    return normalized


def write_google_cluster_extract(
    *,
    data_root: str | Path,
    records: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    output_relative: str =
        GOOGLE_CLUSTER_DEFAULT_OUTPUT_RELATIVE,
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

    output = (
        root
        /
        output_relative
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = (
        hashlib.sha256()
    )

    byte_size = 0

    with output.open(
        "wb"
    ) as handle:
        for record in records:
            payload = (
                _stable_json_bytes(
                    record
                )
            )

            handle.write(
                payload
            )

            hasher.update(
                payload
            )

            byte_size += len(
                payload
            )

    return {
        "path":
            str(
                output
            ),

        "recordCount":
            len(
                records
            ),

        "byteSize":
            byte_size,

        "sha256":
            hasher.hexdigest(),
    }


def _make_bigquery_client(
    project_id: str,
):
    try:
        from google.cloud import bigquery

    except ImportError as exc:
        raise RuntimeError(
            (
                "google-cloud-bigquery is required; "
                "run: py -m pip install "
                "google-cloud-bigquery"
            )
        ) from exc

    return (
        bigquery.Client(
            project=
                project_id
        )
    )


def _selected_schema_fields(
    table: Any,
) -> list[
    Any
]:
    schema = list(
        getattr(
            table,
            "schema",
            (),
        )
        or
        ()
    )

    by_name = {
        getattr(
            field,
            "name",
            None,
        ):
            field

        for field
        in schema
    }

    missing = [
        name

        for name
        in GOOGLE_CLUSTER_SELECTED_TOP_LEVEL_FIELDS

        if name
        not in by_name
    ]

    if missing:
        raise RuntimeError(
            (
                "Google Cluster Data table schema "
                "is missing required fields: "
                +
                ", ".join(
                    missing
                )
            )
        )

    return [
        by_name[
            name
        ]

        for name
        in GOOGLE_CLUSTER_SELECTED_TOP_LEVEL_FIELDS
    ]


def _window_offsets(
    *,
    total_rows: int,
    window_count: int,
    rows_per_window: int,
) -> list[
    int
]:
    if (
        total_rows
        <=
        rows_per_window
    ):
        return [
            0
        ]

    max_start = max(
        0,
        total_rows
        -
        rows_per_window,
    )

    if (
        window_count
        <=
        1
    ):
        return [
            0
        ]

    offsets = []

    for index in range(
        window_count
    ):
        offset = int(
            (
                max_start
                *
                index
            )
            /
            (
                window_count
                -
                1
            )
        )

        offsets.append(
            offset
        )

    return list(
        dict.fromkeys(
            offsets
        )
    )


def acquire_google_cluster_extract(
    *,
    data_root: str | Path,
    project_id: str,
    cell: str =
        GOOGLE_CLUSTER_DEFAULT_CELL,

    sample_count: int =
        GOOGLE_CLUSTER_DEFAULT_SAMPLE_COUNT,

    sample_percent: float | None =
        None,

    max_bytes_billed: int | None =
        None,

    partition: str =
        GOOGLE_CLUSTER_DEFAULT_PARTITION,

    fetch_multiplier: int =
        GOOGLE_CLUSTER_DEFAULT_FETCH_MULTIPLIER,

    window_count: int =
        GOOGLE_CLUSTER_DEFAULT_WINDOW_COUNT,

    client: Any | None = None,
    bigquery_module: Any | None = None,
) -> Dict[
    str,
    Any,
]:
    """Acquire real rows using TableData/list_rows, never a SQL query."""

    normalized_cell = (
        _require_cell(
            cell
        )
    )

    count = (
        _require_positive_int(
            sample_count,
            "sample_count",
        )
    )

    multiplier = (
        _require_positive_int(
            fetch_multiplier,
            "fetch_multiplier",
        )
    )

    windows = (
        _require_positive_int(
            window_count,
            "window_count",
        )
    )

    normalized_partition = (
        _require_partition(
            partition
        )
    )

    normalized_project = str(
        project_id
        or
        ""
    ).strip()

    if not normalized_project:
        raise ValueError(
            "project_id is required"
        )

    if client is None:
        client = (
            _make_bigquery_client(
                normalized_project
            )
        )

    table_id = (
        google_cluster_table_id(
            cell=
                normalized_cell
        )
    )

    table = (
        client.get_table(
            table_id
        )
    )

    total_rows = int(
        getattr(
            table,
            "num_rows",
            0,
        )
        or
        0
    )

    if (
        total_rows
        < count
    ):
        raise RuntimeError(
            (
                "Google Cluster Data table reports "
                "insufficient rows: "
                f"{total_rows} < {count}"
            )
        )

    selected_fields = (
        _selected_schema_fields(
            table
        )
    )

    total_fetch_target = max(
        count,
        count
        *
        multiplier,
    )

    rows_per_window = max(
        count,
        (
            total_fetch_target
            +
            windows
            -
            1
        )
        //
        windows,
    )

    offsets = (
        _window_offsets(
            total_rows=
                total_rows,

            window_count=
                windows,

            rows_per_window=
                rows_per_window,
        )
    )

    flat_rows: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen_raw_identity: set[
        tuple[
            int,
            int,
            int,
            int,
            int,
        ]
    ] = set()

    rows_examined = 0

    for offset in offsets:
        iterator = (
            client.list_rows(
                table,
                selected_fields=
                    selected_fields,
                start_index=
                    offset,
                max_results=
                    rows_per_window,
            )
        )

        for raw_row in iterator:
            rows_examined += 1

            flat = (
                _raw_row_to_flat_mapping(
                    raw_row
                )
            )

            if flat is None:
                continue

            identity = (
                flat[
                    "collection_id"
                ],
                flat[
                    "instance_index"
                ],
                flat[
                    "machine_id"
                ],
                flat[
                    "start_time"
                ],
                flat[
                    "end_time"
                ],
            )

            if (
                identity
                in
                seen_raw_identity
            ):
                continue

            seen_raw_identity.add(
                identity
            )

            flat_rows.append(
                flat
            )

            if (
                len(
                    flat_rows
                )
                >=
                count
            ):
                break

        if (
            len(
                flat_rows
            )
            >=
            count
        ):
            break

    if (
        len(
            flat_rows
        )
        <
        count
    ):
        raise RuntimeError(
            (
                "Google Cluster Data TableData acquisition "
                "returned insufficient usable unique rows: "
                f"{len(flat_rows)} < {count}. "
                f"Rows examined: {rows_examined}. "
                "Increase --fetch-multiplier or "
                "--window-count; do not switch to a "
                "large billed SQL query."
            )
        )

    normalized = (
        normalize_google_cluster_rows(
            flat_rows[
                :count
            ],
            cell=
                normalized_cell,
            partition=
                normalized_partition,
        )
    )

    if (
        len(
            normalized
        )
        !=
        count
    ):
        raise RuntimeError(
            (
                "Google Cluster Data normalization "
                "did not preserve requested unique count: "
                f"{len(normalized)} != {count}"
            )
        )

    output = (
        write_google_cluster_extract(
            data_root=
                data_root,

            records=
                normalized,
        )
    )

    offsets_hash = (
        _sha256_bytes(
            _stable_json_bytes(
                offsets
            )
        )
    )

    manifest_core = {
        "version":
            GOOGLE_CLUSTER_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLUSTER_SOURCE_ID,

        "traceVersion":
            "clusterdata-2019-v3",

        "cell":
            normalized_cell,

        "sampleCount":
            count,

        "partition":
            normalized_partition,

        "projectId":
            normalized_project,

        "sourceTable":
            table_id,

        "sourceTableRows":
            total_rows,

        "acquisitionMethod":
            "BIGQUERY_TABLEDATA_LIST_ROWS",

        "sqlQueryExecuted":
            False,

        "queryBytesProcessed":
            0,

        "maximumBytesBilled":
            0,

        "windowCount":
            len(
                offsets
            ),

        "rowsPerWindow":
            rows_per_window,

        "rowsExamined":
            rows_examined,

        "windowOffsetsHash":
            offsets_hash,

        "output":
            output,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    manifest = {
        **manifest_core,

        "manifestHash":
            _sha256_bytes(
                _stable_json_bytes(
                    manifest_core
                )
            ),
    }

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    manifest_path = (
        root
        /
        GOOGLE_CLUSTER_DEFAULT_MANIFEST_RELATIVE
    )

    manifest_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest_path.write_bytes(
        _stable_json_bytes(
            manifest
        )
    )

    return {
        **manifest,

        "manifestPath":
            str(
                manifest_path
            ),
    }