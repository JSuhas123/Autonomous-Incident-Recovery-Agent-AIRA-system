"""CLI for Phase 23R.13S.5 external-reality promotion."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.corpus.coverage.external_reality_promotion import (
    build_external_promotion_manifest,
    promote_google_cloud,
    promote_public_incidents,
    promote_rcaeval,
)


def _write(
    path: Path,
    value: object,
) -> None:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        (
            json.dumps(
                value,
                indent=2,
                sort_keys=True,
            )
            +
            "\n"
        ),
        encoding="utf-8",
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description=(
            "Promote policy-approved real external "
            "evidence for Phase 23R.13S.5."
        )
    )

    root.add_argument(
        "data_root",
        type=Path,
        help="AIRA-DATA root",
    )

    sub = root.add_subparsers(
        dest="command",
        required=True,
    )

    sub.add_parser(
        "rcaeval",
        help=(
            "Promote the complete 735-case "
            "RCAEval telemetry corpus"
        ),
    )

    google = sub.add_parser(
        "google-cloud",
        help=(
            "Promote a normalized real Google "
            "Cluster Data JSONL extract"
        ),
    )

    google.add_argument(
        "--input",
        required=True,
        type=Path,
    )

    google.add_argument(
        "--minimum-cases",
        type=int,
        default=500,
    )

    public = sub.add_parser(
        "public-incidents",
        help=(
            "Promote curated real public "
            "incident reconstructions"
        ),
    )

    public.add_argument(
        "--input",
        required=True,
        type=Path,
    )

    public.add_argument(
        "--minimum-cases",
        type=int,
        default=100,
    )

    all_command = sub.add_parser(
        "all",
        help=(
            "Promote RCAEval, Google cloud and "
            "public incidents and write one manifest"
        ),
    )

    all_command.add_argument(
        "--google-input",
        required=True,
        type=Path,
    )

    all_command.add_argument(
        "--public-input",
        required=True,
        type=Path,
    )

    all_command.add_argument(
        "--google-minimum",
        type=int,
        default=500,
    )

    all_command.add_argument(
        "--public-minimum",
        type=int,
        default=100,
    )

    return root


def main() -> int:
    args = (
        parser()
        .parse_args()
    )

    if (
        args.command
        ==
        "rcaeval"
    ):
        result = promote_rcaeval(
            data_root=
                args.data_root
        )

    elif (
        args.command
        ==
        "google-cloud"
    ):
        result = promote_google_cloud(
            data_root=
                args.data_root,

            input_jsonl=
                args.input,

            minimum_cases=
                args.minimum_cases,
        )

    elif (
        args.command
        ==
        "public-incidents"
    ):
        result = promote_public_incidents(
            data_root=
                args.data_root,

            input_jsonl=
                args.input,

            minimum_cases=
                args.minimum_cases,
        )

    else:
        rcaeval = promote_rcaeval(
            data_root=
                args.data_root
        )

        google = promote_google_cloud(
            data_root=
                args.data_root,

            input_jsonl=
                args.google_input,

            minimum_cases=
                args.google_minimum,
        )

        public = promote_public_incidents(
            data_root=
                args.data_root,

            input_jsonl=
                args.public_input,

            minimum_cases=
                args.public_minimum,
        )

        result = (
            build_external_promotion_manifest(
                rcaeval=
                    rcaeval,

                google_cloud=
                    google,

                public_incidents=
                    public,
            )
        )

        manifest_path = (
            args
            .data_root
            .expanduser()
            .resolve()
            /
            "manifests"
            /
            (
                "phase23r13-"
                "external-reality-"
                "promotion-manifest.json"
            )
        )

        _write(
            manifest_path,
            result,
        )

        result = {
            "manifest":
                result,

            "manifestPath":
                str(
                    manifest_path
                ),
        }

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