#!/usr/bin/env python3

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


from intelligence.learning.candidate_generator import (  # noqa: E402
    generate_candidates,
)

from intelligence.learning.contracts import (  # noqa: E402
    LearningGenerationError,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate quarantinable Phase 24 "
            "learning candidates from a frozen "
            "source bundle"
        )
    )

    parser.add_argument(
        "--input",
        help=(
            "JSON input path; stdin when omitted"
        ),
    )

    parser.add_argument(
        "--pretty",
        action="store_true",
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
        result = generate_candidates(
            load_input(
                args.input
            )
        )

        json.dump(
            result,
            sys.stdout,
            indent=(
                2
                if args.pretty
                else
                None
            ),
            sort_keys=True,
            separators=(
                None
                if args.pretty
                else
                (
                    ",",
                    ":",
                )
            ),
        )

        sys.stdout.write(
            "\n"
        )

        return 0

    except LearningGenerationError as error:
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
        TypeError,
        ValueError,
    ) as error:
        json.dump(
            {
                "error": {
                    "code":
                        (
                            "HUMAN_LEARNING_"
                            "GENERATOR_INPUT_INVALID"
                        ),

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