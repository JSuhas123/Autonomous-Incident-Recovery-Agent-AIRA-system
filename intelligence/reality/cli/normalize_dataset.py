#!/usr/bin/env python3

"""CLI bridge for AIRA Phase 23R.3 dataset normalization."""

from __future__ import annotations

import argparse
import json
import os
import sys

PROJECT_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(
            __file__
        ),
        "..",
        "..",
        "..",
    )
)

if (
    PROJECT_ROOT
    not in
    sys.path
):
    sys.path.insert(
        0,
        PROJECT_ROOT,
    )


from intelligence.reality.adapters.registry import (  # noqa: E402
    normalize_dataset,
)

from intelligence.reality.normalization.reality_case_normalizer import (  # noqa: E402
    RealityNormalizationError,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize an AIRA raw incident bundle "
            "into a sealed RealityCase bundle"
        )
    )

    parser.add_argument(
        "--input",
        help=(
            "Path to raw JSON input. "
            "If omitted, JSON is read from stdin."
        ),
    )

    parser.add_argument(
        "--pretty",
        action="store_true",
        help=(
            "Pretty-print normalized JSON."
        ),
    )

    return parser.parse_args()


def load_input(
    path: str | None,
):
    if path:
        with open(
            path,
            "r",
            encoding="utf-8",
        ) as handle:
            return json.load(
                handle
            )

    return json.load(
        sys.stdin
    )


def main() -> int:
    args = parse_args()

    try:
        raw = load_input(
            args.input
        )

        normalized = (
            normalize_dataset(
                raw
            )
        )

        json.dump(
            normalized,
            sys.stdout,
            indent=(
                2
                if args.pretty
                else None
            ),
            sort_keys=True,
            separators=(
                None
                if args.pretty
                else (
                    ",",
                    ":",
                )
            ),
        )

        sys.stdout.write(
            "\n"
        )

        return 0

    except RealityNormalizationError as error:
        json.dump(
            {
                "error": {
                    "code":
                        error.code,

                    "message":
                        str(
                            error
                        ),
                },

                "executionAuthorized":
                    False,
            },
            sys.stderr,
            sort_keys=True,
        )

        sys.stderr.write(
            "\n"
        )

        return 2

    except (
        OSError,
        json.JSONDecodeError,
    ) as error:
        json.dump(
            {
                "error": {
                    "code":
                        "REALITY_RAW_INPUT_INVALID",

                    "message":
                        str(
                            error
                        ),
                },

                "executionAuthorized":
                    False,
            },
            sys.stderr,
            sort_keys=True,
        )

        sys.stderr.write(
            "\n"
        )

        return 2


if (
    __name__
    ==
    "__main__"
):
    raise SystemExit(
        main()
    )