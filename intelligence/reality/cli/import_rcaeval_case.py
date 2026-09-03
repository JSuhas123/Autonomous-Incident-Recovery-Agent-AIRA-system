"""CLI for AIRA Phase 23R.6B/C RCAEval case import and normalization."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path


from intelligence.reality.adapters.rcaeval_case_importer import (
    build_external_benchmark_dataset,
)

from intelligence.reality.adapters.registry import (
    normalize_dataset,
)

from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Convert one RCAEval case into a sealed "
            "AIRA E2 RealityCase bundle."
        )
    )

    parser.add_argument(
        "case_directory"
    )

    parser.add_argument(
        "--organization-id",
        required=True,
    )

    parser.add_argument(
        "--environment-id",
        required=True,
    )

    parser.add_argument(
        "--benchmark-version",
        default="2026-main",
    )

    parser.add_argument(
        "--inject-timestamp",
        default=None,
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=23,
    )

    parser.add_argument(
        "--raw-only",
        action="store_true",
    )

    parser.add_argument(
        "--output",
        default=None,
    )

    return parser


def main() -> int:
    args = (
        build_parser()
        .parse_args()
    )

    try:
        raw = (
            build_external_benchmark_dataset(
                args.case_directory,

                organization_id=
                    args.organization_id,

                environment_id=
                    args.environment_id,

                benchmark_version=
                    args.benchmark_version,

                injection_timestamp=
                    args.inject_timestamp,

                replay_seed=
                    args.seed,
            )
        )

        result = (
            raw
            if args.raw_only
            else normalize_dataset(
                raw
            )
        )

    except RealityNormalizationError as exc:
        print(
            json.dumps(
                {
                    "ok":
                        False,

                    "code":
                        exc.code,

                    "message":
                        str(
                            exc
                        ),

                    "executionAuthorized":
                        False,
                },
                indent=2,
            ),
            file=sys.stderr,
        )

        return 2

    rendered = json.dumps(
        result,
        indent=2,
        sort_keys=True,
    )

    if (
        args.output
    ):
        output = (
            Path(
                args.output
            )
            .expanduser()
            .resolve()
        )

        output.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        output.write_text(
            rendered +
            "\n",
            encoding="utf-8",
        )

    else:
        print(
            rendered
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