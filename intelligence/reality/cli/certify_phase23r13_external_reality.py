"""CLI for Phase 23R.13S.5D/5E/5F external reality certification."""

from __future__ import annotations

import argparse
import json

from pathlib import Path

from intelligence.reality.corpus.coverage.external_reality_integrity import (
    write_external_reality_certification,
)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description=(
            "Certify promoted external reality and "
            "write the combined Phase 23R.13S.5 manifest."
        )
    )

    value.add_argument(
        "data_root",
        type=Path,
        help="AIRA-DATA root",
    )

    return value


def main() -> int:
    args = (
        parser()
        .parse_args()
    )

    result = (
        write_external_reality_certification(
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
    raise SystemExit(
        main()
    )