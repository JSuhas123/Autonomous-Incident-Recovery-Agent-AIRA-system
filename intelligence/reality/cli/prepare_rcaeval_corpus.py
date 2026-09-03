"""AIRA Phase 23R.13 RCAEval download + manifest CLI.

The command downloads the approved MIT RCAEval benchmark from Hugging Face,
then builds an evaluator-side deterministic corpus partition manifest.

Ground-truth index columns never become replay-visible evidence.
"""

from __future__ import annotations

import argparse
import json

from pathlib import Path

from typing import Any
from typing import Dict
from typing import List


from intelligence.reality.corpus.rcaeval_partition_manifest import (
    build_rcaeval_partition_manifest,
    certify_complete_rcaeval_manifest,
)


REPO_ID = (
    "phamquiluan/RCAEval"
)


def _require_huggingface_hub():
    try:
        from huggingface_hub import (
            snapshot_download,
        )

    except ImportError as exc:
        raise SystemExit(
            (
                "huggingface_hub is required for download: "
                "python -m pip install huggingface_hub"
            )
        ) from exc

    return snapshot_download


def _require_pyarrow():
    try:
        import pyarrow.parquet as pq

    except ImportError as exc:
        raise SystemExit(
            (
                "pyarrow is required to read cases.parquet: "
                "python -m pip install pyarrow"
            )
        ) from exc

    return pq


def download_dataset(
    destination: Path,
    pattern: str | None,
) -> Path:
    snapshot_download = (
        _require_huggingface_hub()
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    kwargs: Dict[
        str,
        Any,
    ] = {
        "repo_id":
            REPO_ID,

        "repo_type":
            "dataset",

        "local_dir":
            str(
                destination
            ),
    }

    if (
        pattern
    ):
        kwargs[
            "allow_patterns"
        ] = [
            "cases.parquet",
            pattern,
        ]

    snapshot_download(
        **kwargs
    )

    return destination


def read_index(
    path: Path,
) -> List[
    Dict[
        str,
        Any,
    ]
]:
    pq = (
        _require_pyarrow()
    )

    table = (
        pq.read_table(
            str(
                path
            )
        )
    )

    return [
        dict(
            row
        )

        for row
        in table.to_pylist()
    ]


def write_manifest(
    index_path: Path,
    output_path: Path,
    seed: int,
) -> Dict[
    str,
    Any,
]:
    manifest = (
        build_rcaeval_partition_manifest(
            read_index(
                index_path
            ),

            seed=
                seed,
        )
    )

    certification = (
        certify_complete_rcaeval_manifest(
            manifest
        )
    )

    payload = {
        "manifest":
            manifest,

        "certification":
            certification,
    }

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            payload,
            indent=2,
            sort_keys=True,
        )
        +
        "\n",

        encoding=
            "utf-8",
    )

    return payload


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description=
            (
                "Prepare the AIRA Phase "
                "23R.13 RCAEval corpus"
            )
    )

    sub = root.add_subparsers(
        dest=
            "command",

        required=
            True,
    )

    download = sub.add_parser(
        "download",

        help=
            (
                "download RCAEval "
                "from Hugging Face"
            ),
    )

    download.add_argument(
        "--destination",
        required=True,
    )

    download.add_argument(
        "--pattern",

        default=None,

        help=(
            "optional Hugging Face allow-pattern, "
            'e.g. "re2*"; omit for all telemetry'
        ),
    )

    manifest = sub.add_parser(
        "manifest",

        help=
            (
                "build and certify "
                "partition manifest"
            ),
    )

    manifest.add_argument(
        "--index",

        required=True,

        help=
            "path to cases.parquet",
    )

    manifest.add_argument(
        "--output",
        required=True,
    )

    manifest.add_argument(
        "--seed",
        type=int,
        default=2313,
    )

    return root


def main() -> int:
    args = (
        parser()
        .parse_args()
    )

    if (
        args.command ==
        "download"
    ):
        location = (
            download_dataset(
                Path(
                    args.destination
                )
                .expanduser()
                .resolve(),

                args.pattern,
            )
        )

        print(
            json.dumps(
                {
                    "ok":
                        True,

                    "repoId":
                        REPO_ID,

                    "destination":
                        str(
                            location
                        ),

                    "executionAuthorized":
                        False,
                },
                indent=2,
            )
        )

        return 0

    payload = (
        write_manifest(
            Path(
                args.index
            )
            .expanduser()
            .resolve(),

            Path(
                args.output
            )
            .expanduser()
            .resolve(),

            args.seed,
        )
    )

    print(
        json.dumps(
            {
                "ok":
                    True,

                "caseCount":
                    payload[
                        "certification"
                    ][
                        "caseCount"
                    ],

                "status":
                    payload[
                        "certification"
                    ][
                        "status"
                    ],

                "output":
                    str(
                        Path(
                            args.output
                        )
                        .expanduser()
                        .resolve()
                    ),

                "executionAuthorized":
                    False,
            },
            indent=2,
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