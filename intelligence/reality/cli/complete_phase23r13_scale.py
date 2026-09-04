"""CLI for Phase 23R.13S.6 scale completion."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.corpus.coverage.scale_completion import (
    complete_scale_population,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Complete Phase 23R.13S.6 "
            "physical corpus scaling "
            "and canonical inventory"
        )
    )

    parser.add_argument(
        "data_root",
        type=Path,
        help="AIRA-DATA root",
    )

    args = (
        parser.parse_args()
    )

    result = (
        complete_scale_population(
            data_root=
                args.data_root
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