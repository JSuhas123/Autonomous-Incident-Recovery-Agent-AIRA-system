"""Inspect acquired Phase 23R.13E/F sources.

This command validates source presence only.
It does not start workloads, ingest datasets or grant execution authority.
"""

from __future__ import annotations

import argparse
import json

from pathlib import Path

from intelligence.reality.datasets.external.rcaeval_source import (
    get_rcaeval_source_contract,
    validate_rcaeval_staging_directory,
)

from intelligence.reality.datasets.workloads.source_checkout import (
    validate_workload_checkout,
)

from intelligence.reality.datasets.workloads.workload_catalog import (
    get_workload,
    list_workloads,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Inspect AIRA Phase 23R.13E/F "
            "dataset/workload sources"
        )
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True,
    )

    sub.add_parser(
        "rcaeval-contract"
    )

    rcaeval = sub.add_parser(
        "validate-rcaeval"
    )

    rcaeval.add_argument(
        "--directory",
        required=True,
    )

    sub.add_parser(
        "list-workloads"
    )

    workload = sub.add_parser(
        "workload"
    )

    workload.add_argument(
        "--id",
        required=True,
    )

    checkout = sub.add_parser(
        "validate-workload-checkout"
    )

    checkout.add_argument(
        "--id",
        required=True,
    )

    checkout.add_argument(
        "--directory",
        required=True,
    )

    return parser


def main() -> int:
    args = (
        build_parser()
        .parse_args()
    )

    if (
        args.command
        ==
        "rcaeval-contract"
    ):
        result = (
            get_rcaeval_source_contract()
        )

    elif (
        args.command
        ==
        "validate-rcaeval"
    ):
        result = (
            validate_rcaeval_staging_directory(
                Path(
                    args.directory
                )
            )
        )

    elif (
        args.command
        ==
        "list-workloads"
    ):
        result = {
            "workloads":
                list(
                    list_workloads()
                ),

            "executionAuthorized":
                False,

            "productionCertified":
                False,
        }

    elif (
        args.command
        ==
        "workload"
    ):
        result = get_workload(
            args.id
        )

    else:
        result = (
            validate_workload_checkout(
                args.id,
                Path(
                    args.directory
                ),
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
    raise SystemExit(
        main()
    )