"""CLI for Phase 23R.13T corpus coverage certification."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path
from typing import Any
from typing import Dict

from intelligence.reality.corpus.coverage.corpus_coverage_certification import (
    certify_corpus_inventory,
)


def _load_json(
    path: Path,
) -> Dict[str, Any]:
    with path.open(
        "r",
        encoding="utf-8",
    ) as handle:
        value = json.load(
            handle
        )

    if not isinstance(
        value,
        dict,
    ):
        raise ValueError(
            "coverage inventory root must be an object"
        )

    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Certify Phase 23R.13 "
            "multi-source corpus coverage"
        )
    )

    parser.add_argument(
        "inventory",
        type=Path,
        help=(
            "JSON inventory containing "
            "sources and cases"
        ),
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "optional JSON certification "
            "artifact path"
        ),
    )

    parser.add_argument(
        "--require-pass",
        action="store_true",
        help=(
            "return non-zero if coverage "
            "certification fails"
        ),
    )

    args = parser.parse_args()

    inventory = _load_json(
        args.inventory
    )

    certification = certify_corpus_inventory(
        sources=inventory.get(
            "sources",
            [],
        ),

        cases=inventory.get(
            "cases",
            [],
        ),
    )

    rendered = json.dumps(
        certification,
        indent=2,
        sort_keys=True,
    )

    if args.output is not None:
        args.output.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        args.output.write_text(
            rendered + "\n",
            encoding="utf-8",
        )

    print(
        rendered
    )

    if (
        args.require_pass
        and
        not certification[
            "passed"
        ]
    ):
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(
        main()
    )