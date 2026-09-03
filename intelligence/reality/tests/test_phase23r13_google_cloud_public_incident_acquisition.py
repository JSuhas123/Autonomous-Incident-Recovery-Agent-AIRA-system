from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from intelligence.reality.datasets.public_incidents.google_cloud_status_acquisition import (
    GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,
    GOOGLE_CLOUD_STATUS_HISTORY_URL,
    GOOGLE_CLOUD_STATUS_PRODUCTS_URL,
    _history_incidents,
    _parse_duration_seconds,
    _product_entries,
    acquire_google_cloud_public_incidents,
)


def _products(
    count: int = 3,
):
    return [
        {
            "id":
                f"product-{index}",

            "title":
                f"Product {index}",
        }

        for index
        in range(
            1,
            count
            +
            1,
        )
    ]


def _history_page(
    start: int,
    count: int,
) -> str:
    rows = []

    for index in range(
        start,
        start
        +
        count,
    ):
        rows.append(
            (
                "<tr>"
                f'<td><a href="/incidents/inc-{index:04d}">'
                f"Incident {index}"
                "</a></td>"
                "<td>18 Jul 2025</td>"
                "<td>2 hours, 5 minutes</td>"
                "</tr>"
            )
        )

    return (
        "<html><body><table>"
        +
        "".join(
            rows
        )
        +
        "</table></body></html>"
    )


def _recent(
    incident_id: str,
    *,
    with_rca: bool = False,
):
    text = (
        (
            "## Root Cause\n"
            "A configuration change caused the incident."
        )
        if with_rca
        else
        "Service recovered successfully."
    )

    return {
        "id":
            incident_id,

        "begin":
            "2025-07-18T01:00:00+00:00",

        "end":
            "2025-07-18T03:00:00+00:00",

        "external_desc":
            "Customers experienced elevated errors.",

        "severity":
            "medium",

        "status_impact":
            "SERVICE_DISRUPTION",

        "affected_products": [
            {
                "id":
                    "product-1",

                "title":
                    "Product 1",

                "current_title":
                    "Product 1",
            }
        ],

        "updates": [
            {
                "text":
                    text,
            }
        ],
    }


class Phase23R13GoogleCloudPublicIncidentAcquisitionTests(
    unittest.TestCase
):
    def test_version_is_repaired(
        self,
    ):
        self.assertEqual(
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,
            "23R.13S.5D.1R2",
        )

    def test_product_catalog_list_is_supported(
        self,
    ):
        result = (
            _product_entries(
                _products(
                    2
                )
            )
        )

        self.assertEqual(
            len(
                result
            ),
            2,
        )

        self.assertEqual(
            result[
                0
            ][
                "id"
            ],
            "product-1",
        )

    def test_product_catalog_wrapper_is_supported(
        self,
    ):
        result = (
            _product_entries({
                "products":
                    _products(
                        2
                    )
            })
        )

        self.assertEqual(
            len(
                result
            ),
            2,
        )

    def test_history_page_extracts_incident_ids(
        self,
    ):
        result = (
            _history_incidents(
                _history_page(
                    1,
                    3,
                ),
                product_id=
                    "product-1",
                product_title=
                    "Product 1",
            )
        )

        self.assertEqual(
            [
                item[
                    "incidentId"
                ]

                for item
                in result
            ],
            [
                "inc-0001",
                "inc-0002",
                "inc-0003",
            ],
        )

    def test_history_page_extracts_duration(
        self,
    ):
        result = (
            _history_incidents(
                _history_page(
                    1,
                    1,
                ),
                product_id=
                    "product-1",
                product_title=
                    "Product 1",
            )
        )

        self.assertEqual(
            result[
                0
            ][
                "historyDurationSeconds"
            ],
            7500,
        )

        self.assertEqual(
            _parse_duration_seconds(
                (
                    "1 day, "
                    "2 hours, "
                    "3 minutes"
                )
            ),
            93780,
        )

    def test_acquisition_discovers_100_unique_historical_incidents(
        self,
    ):
        products = (
            _products(
                3
            )
        )

        pages = {
            "product-1":
                _history_page(
                    1,
                    50,
                ),

            "product-2":
                _history_page(
                    40,
                    50,
                ),

            "product-3":
                _history_page(
                    80,
                    50,
                ),
        }

        def json_fetcher(
            url,
        ):
            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            ):
                return products

            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            ):
                return []

            raise AssertionError(
                url
            )

        def text_fetcher(
            url,
        ):
            product_id = (
                url
                .split(
                    "/products/",
                    1,
                )[
                    1
                ]
                .split(
                    "/",
                    1,
                )[
                    0
                ]
            )

            return pages[
                product_id
            ]

        with tempfile.TemporaryDirectory() as tmp:
            result = (
                acquire_google_cloud_public_incidents(
                    data_root=
                        tmp,

                    required_count=
                        100,

                    max_products=
                        3,

                    json_fetcher=
                        json_fetcher,

                    text_fetcher=
                        text_fetcher,
                )
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                100,
            )

            self.assertEqual(
                result[
                    "uniqueIncidentCount"
                ],
                100,
            )

            self.assertEqual(
                result[
                    "historyReferenceCaseCount"
                ],
                100,
            )

            self.assertEqual(
                result[
                    "recentStructuredCaseCount"
                ],
                0,
            )

    def test_recent_json_is_merged_when_available(
        self,
    ):
        products = (
            _products(
                2
            )
        )

        pages = {
            "product-1":
                _history_page(
                    1,
                    60,
                ),

            "product-2":
                _history_page(
                    61,
                    60,
                ),
        }

        def json_fetcher(
            url,
        ):
            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            ):
                return products

            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            ):
                return [
                    _recent(
                        "inc-0001",
                        with_rca=
                            True,
                    )
                ]

            raise AssertionError(
                url
            )

        def text_fetcher(
            url,
        ):
            product_id = (
                url
                .split(
                    "/products/",
                    1,
                )[
                    1
                ]
                .split(
                    "/",
                    1,
                )[
                    0
                ]
            )

            return pages[
                product_id
            ]

        with tempfile.TemporaryDirectory() as tmp:
            result = (
                acquire_google_cloud_public_incidents(
                    data_root=
                        tmp,

                    required_count=
                        100,

                    max_products=
                        2,

                    json_fetcher=
                        json_fetcher,

                    text_fetcher=
                        text_fetcher,
                )
            )

            self.assertEqual(
                result[
                    "caseCount"
                ],
                100,
            )

            self.assertGreaterEqual(
                result[
                    "recentStructuredCaseCount"
                ],
                1,
            )

            self.assertGreaterEqual(
                result[
                    "groundTruthCandidateCount"
                ],
                1,
            )

    def test_raw_postmortem_text_is_not_persisted(
        self,
    ):
        products = (
            _products(
                1
            )
        )

        def json_fetcher(
            url,
        ):
            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            ):
                return products

            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            ):
                return [
                    _recent(
                        "inc-0001",
                        with_rca=
                            True,
                    )
                ]

            raise AssertionError(
                url
            )

        def text_fetcher(
            _url,
        ):
            return (
                _history_page(
                    1,
                    100,
                )
            )

        with tempfile.TemporaryDirectory() as tmp:
            result = (
                acquire_google_cloud_public_incidents(
                    data_root=
                        tmp,

                    required_count=
                        100,

                    max_products=
                        1,

                    json_fetcher=
                        json_fetcher,

                    text_fetcher=
                        text_fetcher,
                )
            )

            output_path = Path(
                result[
                    "output"
                ][
                    "path"
                ]
            )

            text = (
                output_path.read_text(
                    encoding="utf-8"
                )
            )

            self.assertNotIn(
                (
                    "A configuration change "
                    "caused the incident."
                ),
                text,
            )

            self.assertFalse(
                result[
                    "rawPostmortemStored"
                ]
            )

            self.assertFalse(
                result[
                    "rawUpdateTextStored"
                ]
            )

    def test_policy_and_authority_remain_closed(
        self,
    ):
        products = (
            _products(
                1
            )
        )

        def json_fetcher(
            url,
        ):
            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            ):
                return products

            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            ):
                return []

            raise AssertionError(
                url
            )

        with tempfile.TemporaryDirectory() as tmp:
            result = (
                acquire_google_cloud_public_incidents(
                    data_root=
                        tmp,

                    required_count=
                        100,

                    max_products=
                        1,

                    json_fetcher=
                        json_fetcher,

                    text_fetcher=
                        lambda _url:
                            _history_page(
                                1,
                                100,
                            ),
                )
            )

            self.assertEqual(
                result[
                    "policyStatus"
                ],
                "QUARANTINED_LICENSE_REVIEW",
            )

            self.assertFalse(
                result[
                    "licenseVerified"
                ]
            )

            self.assertFalse(
                result[
                    "commercialPromotionEligible"
                ]
            )

            self.assertFalse(
                result[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                result[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                result[
                    "productionCertified"
                ]
            )

    def test_insufficient_history_fails_closed(
        self,
    ):
        products = (
            _products(
                1
            )
        )

        def json_fetcher(
            url,
        ):
            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            ):
                return products

            if (
                url
                ==
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            ):
                return []

            raise AssertionError(
                url
            )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(
                RuntimeError
            ):
                acquire_google_cloud_public_incidents(
                    data_root=
                        tmp,

                    required_count=
                        100,

                    max_products=
                        1,

                    json_fetcher=
                        json_fetcher,

                    text_fetcher=
                        lambda _url:
                            _history_page(
                                1,
                                20,
                            ),
                )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()