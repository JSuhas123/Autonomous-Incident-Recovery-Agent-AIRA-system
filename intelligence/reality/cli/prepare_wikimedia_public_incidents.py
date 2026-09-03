"""CLI for Phase 23R.13S.5D.3/5D.4 Wikimedia incidents."""

from __future__ import annotations

import argparse
import json

from intelligence.reality.datasets.public_incidents.wikimedia_incident_reconstruction import (
    acquire_and_prepare_wikimedia_incidents,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Acquire and prepare real Wikimedia "
            "Wikitech incident reports for the "
            "Phase 23R E3 production reconstruction corpus."
        )
    )

    parser.add_argument(
        "data_root"
    )

    parser.add_argument(
        "--count",
        type=int,
        default=100,
    )

    parser.add_argument(
        "--max-pages",
        type=int,
        default=400,
    )

    return parser


def main() -> None:
    args = (
        build_parser()
        .parse_args()
    )

    result = (
        acquire_and_prepare_wikimedia_incidents(
            data_root=
                args.data_root,

            required_count=
                args.count,

            maximum_pages=
                args.max_pages,
        )
    )

    print(
        json.dumps(
            result,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()