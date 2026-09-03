"""CLI for Phase 23R.13S.5D.1R2 Google Cloud public incidents."""

from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path

from intelligence.reality.datasets.public_incidents.google_cloud_status_acquisition import (
    GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,
    GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_MAX_PRODUCTS,
    GOOGLE_CLOUD_STATUS_HISTORY_URL,
    GOOGLE_CLOUD_STATUS_PRODUCTS_URL,
    GOOGLE_CLOUD_STATUS_SCHEMA_URL,
    acquire_google_cloud_public_incidents,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Acquire real historical Google Cloud Service Health "
            "incident references from official product-history "
            "pages and merge recent structured JSON data."
        )
    )

    parser.add_argument(
        "data_root",
        type=Path,
        help="AIRA-DATA root",
    )

    parser.add_argument(
        "--count",
        type=int,
        default=
            GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,
        help=(
            "Required number of unique "
            "historical incidents"
        ),
    )

    parser.add_argument(
        "--max-products",
        type=int,
        default=
            GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_MAX_PRODUCTS,
        help=(
            "Maximum official product "
            "history pages to scan"
        ),
    )

    parser.add_argument(
        "--print-source",
        action="store_true",
        help=(
            "Print official source endpoints "
            "and exit"
        ),
    )

    return parser


def main() -> int:
    args = (
        _parser()
        .parse_args()
    )

    if args.print_source:
        print(
            json.dumps(
                {
                    "history":
                        GOOGLE_CLOUD_STATUS_HISTORY_URL,

                    "schema":
                        GOOGLE_CLOUD_STATUS_SCHEMA_URL,

                    "products":
                        GOOGLE_CLOUD_STATUS_PRODUCTS_URL,

                    "historyDiscovery":
                        (
                            "https://status.cloud.google.com/"
                            "products/<product-id>/history"
                        ),

                    "rawPostmortemStored":
                        False,

                    "commercialPromotionEligible":
                        False,
                },
                indent=2,
                sort_keys=True,
            )
        )

        return 0

    result = (
        acquire_google_cloud_public_incidents(
            data_root=
                args.data_root,

            required_count=
                args.count,

            max_products=
                args.max_products,
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