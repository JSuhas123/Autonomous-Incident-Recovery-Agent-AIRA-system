from __future__ import annotations

import json
import tempfile
import unittest

from pathlib import Path

from intelligence.reality.datasets.cloud.google_cluster_acquisition import (
    GOOGLE_CLUSTER_ACQUISITION_VERSION,
    acquire_google_cluster_extract,
    build_google_cluster_query,
    google_cluster_table_id,
    normalize_google_cluster_row,
)


class _FakeSchemaField:
    def __init__(
        self,
        name,
    ):
        self.name = (
            name
        )


class _FakeTable:
    def __init__(
        self,
        rows,
    ):
        self.num_rows = (
            len(
                rows
            )
        )

        self.schema = [
            _FakeSchemaField(
                "start_time"
            ),
            _FakeSchemaField(
                "end_time"
            ),
            _FakeSchemaField(
                "collection_id"
            ),
            _FakeSchemaField(
                "instance_index"
            ),
            _FakeSchemaField(
                "machine_id"
            ),
            _FakeSchemaField(
                "alloc_collection_id"
            ),
            _FakeSchemaField(
                "average_usage"
            ),
            _FakeSchemaField(
                "maximum_usage"
            ),
        ]


class _FakeClient:
    def __init__(
        self,
        rows,
    ):
        self.rows = list(
            rows
        )

        self.get_table_calls = []

        self.list_rows_calls = []

        self.query_calls = []

    def get_table(
        self,
        table_id,
    ):
        self.get_table_calls.append(
            table_id
        )

        return _FakeTable(
            self.rows
        )

    def list_rows(
        self,
        table,
        *,
        selected_fields,
        start_index,
        max_results,
    ):
        self.list_rows_calls.append({
            "selectedFieldNames": [
                field.name

                for field
                in selected_fields
            ],

            "startIndex":
                start_index,

            "maxResults":
                max_results,
        })

        return iter(
            self.rows[
                start_index:
                start_index
                +
                max_results
            ]
        )

    def query(
        self,
        *args,
        **kwargs,
    ):
        self.query_calls.append(
            (
                args,
                kwargs,
            )
        )

        raise AssertionError(
            "S.5C.1 must never execute SQL"
        )


def _raw_row(
    index: int,
):
    return {
        "start_time":
            index
            *
            300_000_000,

        "end_time":
            (
                index
                +
                1
            )
            *
            300_000_000,

        "collection_id":
            1000
            +
            index,

        "instance_index":
            index,

        "machine_id":
            2000
            +
            index,

        "alloc_collection_id":
            None,

        "average_usage": {
            "cpus":
                0.10
                +
                (
                    index
                    /
                    10000
                ),

            "memory":
                0.20
                +
                (
                    index
                    /
                    10000
                ),
        },

        "maximum_usage": {
            "cpus":
                0.30
                +
                (
                    index
                    /
                    10000
                ),

            "memory":
                0.40
                +
                (
                    index
                    /
                    10000
                ),
        },
    }


def _flat_row(
    index: int,
):
    return {
        "start_time":
            index
            *
            300_000_000,

        "end_time":
            (
                index
                +
                1
            )
            *
            300_000_000,

        "collection_id":
            1000
            +
            index,

        "instance_index":
            index,

        "machine_id":
            2000
            +
            index,

        "average_cpu":
            0.10
            +
            (
                index
                /
                10000
            ),

        "average_memory":
            0.20
            +
            (
                index
                /
                10000
            ),

        "maximum_cpu":
            0.30
            +
            (
                index
                /
                10000
            ),

        "maximum_memory":
            0.40
            +
            (
                index
                /
                10000
            ),
    }


class Phase23R13GoogleClusterAcquisitionTests(
    unittest.TestCase
):
    def test_version_is_frozen(
        self,
    ):
        self.assertEqual(
            GOOGLE_CLUSTER_ACQUISITION_VERSION,
            "23R.13S.5C.1",
        )

    def test_table_id_uses_official_dataset(
        self,
    ):
        self.assertEqual(
            google_cluster_table_id(
                cell="a"
            ),
            (
                "google.com:google-cluster-data."
                "clusterdata_2019_a."
                "instance_usage"
            ),
        )

    def test_print_plan_explicitly_disables_sql(
        self,
    ):
        plan = (
            build_google_cluster_query(
                cell="a",
                sample_count=500,
            )
        )

        self.assertIn(
            "SQL EXECUTION DISABLED",
            plan,
        )

        self.assertIn(
            "list_rows",
            plan,
        )

        self.assertIn(
            "requestedCases: 500",
            plan,
        )

        self.assertNotIn(
            "SELECT",
            plan,
        )

    def test_unknown_cell_fails_closed(
        self,
    ):
        with self.assertRaises(
            ValueError
        ):
            google_cluster_table_id(
                cell="z"
            )

    def test_normalization_keeps_real_metric_values(
        self,
    ):
        value = (
            normalize_google_cluster_row(
                _flat_row(
                    1
                ),
                cell="a",
                sequence=1,
            )
        )

        self.assertEqual(
            value[
                "sampleType"
            ],
            "RESOURCE_UTILIZATION",
        )

        self.assertAlmostEqual(
            value[
                "evidence"
            ][
                0
            ][
                "cpuUsage"
            ],
            0.1001,
        )

        self.assertEqual(
            value[
                "metadata"
            ][
                "acquisitionMethod"
            ],
            "BIGQUERY_TABLEDATA_LIST_ROWS",
        )

        self.assertFalse(
            value[
                "metadata"
            ][
                "sqlQueryExecuted"
            ]
        )

        self.assertFalse(
            value[
                "metadata"
            ][
                "groundTruthAgentVisible"
            ]
        )

        self.assertFalse(
            value[
                "metadata"
            ][
                "executionAuthorized"
            ]
        )

    def test_real_acquisition_uses_list_rows_not_query(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [
                _raw_row(
                    index
                )

                for index
                in range(
                    2500
                )
            ]

            client = (
                _FakeClient(
                    rows
                )
            )

            result = (
                acquire_google_cluster_extract(
                    data_root=
                        tmp,

                    project_id=
                        "fixture-project",

                    sample_count=
                        500,

                    client=
                        client,
                )
            )

            self.assertEqual(
                result[
                    "sampleCount"
                ],
                500,
            )

            self.assertEqual(
                result[
                    "output"
                ][
                    "recordCount"
                ],
                500,
            )

            self.assertEqual(
                result[
                    "queryBytesProcessed"
                ],
                0,
            )

            self.assertEqual(
                result[
                    "maximumBytesBilled"
                ],
                0,
            )

            self.assertFalse(
                result[
                    "sqlQueryExecuted"
                ]
            )

            self.assertEqual(
                client.query_calls,
                [],
            )

            self.assertGreaterEqual(
                len(
                    client.list_rows_calls
                ),
                1,
            )

    def test_allocated_collection_rows_are_filtered(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            rows = []

            for index in range(
                1500
            ):
                row = (
                    _raw_row(
                        index
                    )
                )

                if (
                    index
                    <
                    200
                ):
                    row[
                        "alloc_collection_id"
                    ] = 999

                rows.append(
                    row
                )

            client = (
                _FakeClient(
                    rows
                )
            )

            result = (
                acquire_google_cluster_extract(
                    data_root=
                        tmp,

                    project_id=
                        "fixture-project",

                    sample_count=
                        500,

                    client=
                        client,
                )
            )

            self.assertEqual(
                result[
                    "output"
                ][
                    "recordCount"
                ],
                500,
            )

    def test_insufficient_usable_rows_fail_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [
                _raw_row(
                    index
                )

                for index
                in range(
                    600
                )
            ]

            for row in rows:
                row[
                    "average_usage"
                ][
                    "cpus"
                ] = None

            client = (
                _FakeClient(
                    rows
                )
            )

            with self.assertRaises(
                RuntimeError
            ):
                acquire_google_cluster_extract(
                    data_root=
                        tmp,

                    project_id=
                        "fixture-project",

                    sample_count=
                        500,

                    client=
                        client,
                )

            self.assertEqual(
                client.query_calls,
                [],
            )

    def test_manifest_records_no_sql_authority(
        self,
    ):
        with tempfile.TemporaryDirectory() as tmp:
            client = (
                _FakeClient(
                    [
                        _raw_row(
                            index
                        )

                        for index
                        in range(
                            2500
                        )
                    ]
                )
            )

            result = (
                acquire_google_cluster_extract(
                    data_root=
                        tmp,

                    project_id=
                        "fixture-project",

                    sample_count=
                        500,

                    client=
                        client,
                )
            )

            path = (
                Path(
                    result[
                        "manifestPath"
                    ]
                )
            )

            manifest = (
                json.loads(
                    path.read_text(
                        encoding="utf-8"
                    )
                )
            )

            self.assertEqual(
                manifest[
                    "acquisitionMethod"
                ],
                "BIGQUERY_TABLEDATA_LIST_ROWS",
            )

            self.assertFalse(
                manifest[
                    "sqlQueryExecuted"
                ]
            )

            self.assertEqual(
                manifest[
                    "queryBytesProcessed"
                ],
                0,
            )

            self.assertFalse(
                manifest[
                    "groundTruthAgentVisible"
                ]
            )

            self.assertFalse(
                manifest[
                    "executionAuthorized"
                ]
            )

            self.assertFalse(
                manifest[
                    "productionCertified"
                ]
            )

            self.assertEqual(
                len(
                    manifest[
                        "manifestHash"
                    ]
                ),
                64,
            )


if (
    __name__
    ==
    "__main__"
):
    unittest.main()