"""CLI for Phase 23R.13S.5C Google Cluster Data acquisition."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.datasets.cloud.google_cluster_acquisition import (
    GOOGLE_CLUSTER_ALLOWED_CELLS,
    GOOGLE_CLUSTER_DEFAULT_FETCH_MULTIPLIER,
    GOOGLE_CLUSTER_DEFAULT_SAMPLE_COUNT,
    GOOGLE_CLUSTER_DEFAULT_WINDOW_COUNT,
    acquire_google_cluster_extract,
    build_google_cluster_query,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Acquire a bounded real 500-case extract "
            "from Google Cluster Data 2019 through "
            "BigQuery TableData/list_rows without "
            "executing a billed SQL query."
        )
    )

    parser.add_argument(
        "data_root",
        type=Path,
        help="AIRA-DATA root",
    )

    parser.add_argument(
        "--project-id",
        required=True,
        help=(
            "Google Cloud project used for "
            "BigQuery authentication/quota"
        ),
    )

    parser.add_argument(
        "--cell",
        default="a",
        choices=sorted(
            GOOGLE_CLUSTER_ALLOWED_CELLS
        ),
    )

    parser.add_argument(
        "--sample-count",
        type=int,
        default=
            GOOGLE_CLUSTER_DEFAULT_SAMPLE_COUNT,
    )

    parser.add_argument(
        "--partition",
        default="DEVELOPMENT",
        choices=[
            "RETRIEVAL",
            "DEVELOPMENT",
            "VALIDATION",
            "HOLDOUT",
        ],
    )

    parser.add_argument(
        "--fetch-multiplier",
        type=int,
        default=
            GOOGLE_CLUSTER_DEFAULT_FETCH_MULTIPLIER,
        help=(
            "Maximum candidate-row acquisition "
            "factor before client-side filtering"
        ),
    )

    parser.add_argument(
        "--window-count",
        type=int,
        default=
            GOOGLE_CLUSTER_DEFAULT_WINDOW_COUNT,
        help=(
            "Number of deterministic source-table "
            "windows considered for real samples"
        ),
    )

    parser.add_argument(
        "--print-query",
        action="store_true",
        help=(
            "Print acquisition plan and exit. "
            "No SQL is executed by S.5C.1."
        ),
    )

    return parser


def main() -> int:
    args = (
        _parser()
        .parse_args()
    )

    if args.print_query:
        print(
            build_google_cluster_query(
                cell=
                    args.cell,

                sample_count=
                    args.sample_count,
            )
        )

        return 0

    result = (
        acquire_google_cluster_extract(
            data_root=
                args.data_root,

            project_id=
                args.project_id,

            cell=
                args.cell,

            sample_count=
                args.sample_count,

            partition=
                args.partition,

            fetch_multiplier=
                args.fetch_multiplier,

            window_count=
                args.window_count,
        )
    )

    print(
        json.dumps(
            result,
            indent=2,
            sort_keys=True,
        )
    )

    return 0


if (
    __name__
    ==
    "__main__"
):
    sys.exit(
        main()
    )