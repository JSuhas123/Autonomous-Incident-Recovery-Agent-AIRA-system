"""CLI for Phase 23R.13S.5D.2 public incident preparation."""

from __future__ import annotations

import argparse
import json

from intelligence.reality.reconstruction.public_incident_preparation import (
    prepare_public_incident_candidates,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Audit and prepare Phase 23R public incident "
            "acquisition records without granting "
            "commercial, production, or execution authority."
        )
    )

    parser.add_argument(
        "data_root"
    )

    parser.add_argument(
        "input_jsonl"
    )

    parser.add_argument(
        "--minimum-source-records",
        type=int,
        default=100,
    )

    return parser


def main() -> None:
    args = (
        build_parser()
        .parse_args()
    )

    result = (
        prepare_public_incident_candidates(
            data_root=
                args.data_root,

            input_jsonl=
                args.input_jsonl,

            minimum_source_records=
                args.minimum_source_records,
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