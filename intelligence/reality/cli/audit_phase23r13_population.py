"""CLI for Phase 23R.13S.1 physical corpus population audit."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.corpus.coverage.population_audit import (
    audit_population,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Audit the real AIRA-DATA population "
            "required for Phase 23R.13."
        )
    )

    parser.add_argument(
        "data_root",
        type=Path,
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=None,
    )

    parser.add_argument(
        "--require-ready",
        action="store_true",
    )

    args = parser.parse_args()

    result = audit_population(
        data_root=
            args.data_root
    )

    rendered = json.dumps(
        result,
        indent=2,
        sort_keys=True,
    )

    if (
        args.output
        is not None
    ):
        args.output.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        args.output.write_text(
            rendered
            +
            "\n",
            encoding="utf-8",
        )

    print(
        rendered
    )

    if (
        args.require_ready
        and
        not result[
            "summary"
        ][
            "readyForCoverageCertification"
        ]
    ):
        return 1

    return 0


if (
    __name__
    ==
    "__main__"
):
    sys.exit(
        main()
    )