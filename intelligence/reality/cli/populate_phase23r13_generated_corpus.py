"""CLI for Phase 23R.13S.3 generated corpus population."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.corpus.coverage.generated_population import (
    DEFAULT_COUNTS,
    populate_generated_corpus,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Populate deterministic Phase 23R.13 "
            "generated corpus shards."
        )
    )

    parser.add_argument(
        "data_root",
        type=Path,
    )

    parser.add_argument(
        "--small-fixture",
        action="store_true",
        help=(
            "Generate a tiny validation fixture "
            "instead of production minimum counts."
        ),
    )

    args = parser.parse_args()

    counts = None

    if args.small_fixture:
        counts = {
            role:
                2

            for role
            in DEFAULT_COUNTS
        }

    result = populate_generated_corpus(
        data_root=
            args.data_root,

        counts=
            counts,
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