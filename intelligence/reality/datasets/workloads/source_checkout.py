"""Phase 23R.13F workload source checkout validation."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from typing import Dict

from intelligence.reality.datasets.workloads.workload_catalog import (
    get_workload,
)


WORKLOAD_SOURCE_CHECKOUT_VERSION = "23R.13F.0"


def validate_workload_checkout(
    workload_id: str,
    directory: Path,
) -> Dict[str, Any]:
    workload = get_workload(
        workload_id
    )

    directory = (
        directory
        .expanduser()
        .resolve()
    )

    if (
        workload[
            "sourceCloneRequired"
        ]
        is False
    ):
        raise ValueError(
            f"{workload_id} does not require "
            "an external source checkout"
        )

    if not directory.is_dir():
        raise ValueError(
            "workload checkout directory "
            "does not exist"
        )

    git_directory = (
        directory
        /
        ".git"
    )

    if not git_directory.is_dir():
        raise ValueError(
            "workload checkout is not "
            "a Git repository"
        )

    required_files = []

    if (
        workload_id
        ==
        "OTEL_ASTRONOMY_SHOP"
    ):
        required_files = [
            "compose.yaml",
            "compose.observability.yaml",
        ]

    elif (
        workload_id
        ==
        "DEATHSTARBENCH"
    ):
        required_files = [
            "README.md",
        ]

    missing = [
        name

        for name
        in required_files

        if not (
            directory
            /
            name
        ).is_file()
    ]

    if missing:
        raise ValueError(
            "workload checkout missing: "
            +
            ", ".join(
                missing
            )
        )

    return {
        "version":
            WORKLOAD_SOURCE_CHECKOUT_VERSION,

        "workloadId":
            workload_id,

        "sourceId":
            workload[
                "sourceId"
            ],

        "checkoutDirectory":
            str(
                directory
            ),

        "requiredFiles":
            required_files,

        "sourceValidated":
            True,

        "executionStarted":
            False,

        "faultInjected":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }