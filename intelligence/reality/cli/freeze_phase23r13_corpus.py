"""CLI for Phase 23R.13U corpus freeze."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.corpus.coverage.corpus_freeze import (
    write_corpus_freeze,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Freeze the physically certified "
            "Phase 23R.13 corpus"
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
        write_corpus_freeze(
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