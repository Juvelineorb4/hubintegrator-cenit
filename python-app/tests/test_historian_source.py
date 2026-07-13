from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

import httpx

from app.services.flow_query import get_flow_by_system
from app.services.flow_query import _merge_main_and_selector
from app.services.flow_query import _rows_by_tagname
from app.services.odbc_historian_client import OdbcHistorianClient
from app.services.pressure_query import get_pressure_by_system
from app.services.volume_query import get_volume_by_system


def _response(status_code: int, payload: object | None = None, content: bytes | None = None) -> httpx.Response:
    request = httpx.Request("GET", "http://example.test")
    if content is not None:
        return httpx.Response(status_code, request=request, content=content)
    return httpx.Response(status_code, request=request, json=payload)


class FakeBackendClient:
    def __init__(self, get_response: httpx.Response, post_response: httpx.Response | None = None):
        self.get_response = get_response
        self.post_response = post_response
        self.get_calls = []
        self.post_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        self.get_calls.append((url, params))
        return self.get_response

    async def post(self, url, json=None):
        self.post_calls.append((url, json))
        if self.post_response is None:
            raise AssertionError("Unexpected POST call")
        return self.post_response


class FakeOdbcClient:
    def __init__(self, rows=None, raw_rows=None):
        self.rows = rows or []
        self.raw_rows = raw_rows or []
        self.calls = []

    async def fetch_interval_rows(self, tagnames, start, end, interval_seconds):
        self.calls.append((tagnames, start, end, interval_seconds))
        return self.rows

    async def fetch_raw_rows(self, tagnames, start, end):
        self.calls.append((tagnames, start, end))
        return self.raw_rows


class HistorianSourceTests(IsolatedAsyncioTestCase):
    def test_flow_merge_equal_length(self):
        main = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
        ]
        selector = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 1},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 0},
        ]

        merged = _merge_main_and_selector(main, selector)
        self.assertEqual([r["state_value"] for r in merged], [1, 0])

    def test_flow_merge_selector_one_point_less(self):
        main = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
            {"timestamp": "2026-01-01T00:02:00Z", "value": 12},
        ]
        selector = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 1},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 0},
        ]

        merged = _merge_main_and_selector(main, selector)
        self.assertEqual([r["state_value"] for r in merged], [1, 0, 0])

    def test_flow_merge_selector_one_point_more(self):
        main = [
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
            {"timestamp": "2026-01-01T00:02:00Z", "value": 12},
        ]
        selector = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 1},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 0},
            {"timestamp": "2026-01-01T00:03:00Z", "value": 1},
        ]

        merged = _merge_main_and_selector(main, selector)
        self.assertEqual([r["state_value"] for r in merged], [0, 0])

    def test_flow_merge_unsorted_rows(self):
        main = [
            {"timestamp": "2026-01-01T00:02:00Z", "value": 12},
            {"timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
        ]
        selector = [
            {"timestamp": "2026-01-01T00:01:00Z", "value": 0},
            {"timestamp": "2026-01-01T00:00:00Z", "value": 1},
        ]

        merged = _merge_main_and_selector(main, selector)
        self.assertEqual([r["timestamp"] for r in merged], [
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:01:00Z",
            "2026-01-01T00:02:00Z",
        ])
        self.assertEqual([r["state_value"] for r in merged], [1, 0, 0])

    def test_flow_merge_absence_of_selector(self):
        main = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
        ]

        merged = _merge_main_and_selector(main, None)
        self.assertEqual([r["state_value"] for r in merged], [None, None])

    def test_flow_merge_selector_state_change_one_to_zero(self):
        main = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"timestamp": "2026-01-01T00:01:00Z", "value": 11},
            {"timestamp": "2026-01-01T00:02:00Z", "value": 12},
        ]
        selector = [
            {"timestamp": "2026-01-01T00:00:00Z", "value": 1},
            {"timestamp": "2026-01-01T00:02:00Z", "value": 0},
        ]

        merged = _merge_main_and_selector(main, selector)
        self.assertEqual([r["state_value"] for r in merged], [1, 1, 0])

    def test_rows_by_tagname_sorts_each_group(self):
        rows = [
            {"tagname": "FI_1", "timestamp": "2026-01-01T00:02:00Z", "value": 12},
            {"tagname": "FI_1", "timestamp": "2026-01-01T00:00:00Z", "value": 10},
            {"tagname": "FI_2", "timestamp": "2026-01-01T00:01:00Z", "value": 21},
            {"tagname": "FI_2", "timestamp": "2026-01-01T00:00:00Z", "value": 20},
        ]

        grouped = _rows_by_tagname(rows)
        self.assertEqual([r["timestamp"] for r in grouped["FI_1"]], [
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:02:00Z",
        ])
        self.assertEqual([r["timestamp"] for r in grouped["FI_2"]], [
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:01:00Z",
        ])

    async def test_odbc_pressure_fetches_interval_and_avoids_historical_post(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "PT_1", "systemCode": "SYS", "category": "PRESSURE_IN", "systemName": "System A"},
                        {"tagname": "PT_1_MAX", "systemCode": "SYS", "category": "PRESSURE_IN_MAX", "systemName": "System A"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([
            {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:00Z", "value.float": 10.0},
            {"tagname": "PT_1_MAX", "timestamp": "2026-01-01T00:00:00Z", "value.float": 11.0},
        ])

        with patch("app.services.pressure_query.httpx.AsyncClient", return_value=backend), patch(
            "app.services.pressure_query.OdbcHistorianClient",
            return_value=odbc,
        ):
            result = await get_pressure_by_system(
                "SYS",
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["tagname"], "PT_1")
        self.assertEqual(result[0]["count"], 1)
        self.assertEqual(result[0]["data"][0]["value"], 10.0)
        self.assertEqual(odbc.calls[0][0], ["PT_1", "PT_1_MAX"])
        self.assertEqual(odbc.calls[0][3], 60)
        self.assertEqual(backend.post_calls, [])

    async def test_odbc_pressure_normalizes_uppercase_tagname(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "pt_1", "systemCode": "SYS", "category": "PRESSURE_IN", "systemName": "System A"},
                        {"tagname": "pt_1_max", "systemCode": "SYS", "category": "PRESSURE_IN_MAX", "systemName": "System A"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([
            {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:00Z", "value.float": 10.5},
            {"tagname": "PT_1_MAX", "timestamp": "2026-01-01T00:00:00Z", "value.float": 11.5},
        ])

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.pressure_query.httpx.AsyncClient", return_value=backend), patch(
                "app.services.pressure_query.OdbcHistorianClient",
                return_value=odbc,
            ):
                result = await get_pressure_by_system(
                    "SYS",
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                    60,
                )

        self.assertEqual(result[0]["data"][0]["value"], 10.5)
        self.assertEqual(odbc.calls[0][0], ["pt_1", "pt_1_max"])

    async def test_odbc_flow_pairs_selector_and_preserves_schema(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "fi_1", "systemCode": "SYS", "category": "FLOW_IN", "systemName": "System A", "subSystemCode": "SUB"},
                        {"tagname": "fi_1_sel", "systemCode": "SYS", "category": "SELECTOR_S_E", "systemName": "System A", "subSystemCode": "SUB"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([
            {"tagname": "FI_1", "timestamp": "2026-01-01T00:00:00Z", "value.float": 2.0},
            {"tagname": "FI_1_SEL", "timestamp": "2026-01-01T00:00:00Z", "value.float": 1.0},
        ])

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.flow_query.httpx.AsyncClient", return_value=backend), patch(
                "app.services.flow_query.OdbcHistorianClient",
                return_value=odbc,
            ):
                result = await get_flow_by_system(
                    "SYS",
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                    60,
                )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["tagname"], "fi_1")
        self.assertEqual(result[0]["data"][0]["value"], 2.0)
        self.assertEqual(result[0]["data"][0]["state_value"], 1.0)
        self.assertEqual(result[0]["count"], 1)

    async def test_empty_odbc_response_returns_empty_series(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "PT_1", "systemCode": "SYS", "category": "PRESSURE_IN", "systemName": "System A"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([])

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.pressure_query.httpx.AsyncClient", return_value=backend), patch(
                "app.services.pressure_query.OdbcHistorianClient",
                return_value=odbc,
            ):
                result = await get_pressure_by_system(
                    "SYS",
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                    60,
                )

        self.assertEqual(result, [])

    async def test_odbc_client_handles_http_errors_timeout_and_invalid_json(self):
        request = httpx.Request("GET", "http://example.test/tags/interval")
        bad_json = httpx.Response(200, request=request, content=b"not-json")
        response_400 = httpx.Response(400, request=request, json={"error": "bad request"})
        response_500 = httpx.Response(500, request=request, json={"error": "server"})

        class Client400:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return response_400

        class Client500:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return response_500

        class ClientTimeout:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                raise httpx.ReadTimeout("timeout", request=request)

        class ClientBadJSON:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return bad_json

        with patch.dict(os.environ, {"ODBC_API_URL": "http://odbc.test", "HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=Client400()):
                with self.assertRaises(httpx.HTTPStatusError):
                    await OdbcHistorianClient().fetch_interval_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=Client500()):
                with self.assertRaises(httpx.HTTPStatusError):
                    await OdbcHistorianClient().fetch_interval_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=ClientTimeout()):
                with self.assertRaises(httpx.ReadTimeout):
                    await OdbcHistorianClient().fetch_interval_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=ClientBadJSON()):
                with self.assertRaises(ValueError):
                    await OdbcHistorianClient().fetch_interval_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

    async def test_requested_tag_missing_from_odbc_response_does_not_fail(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "FI_1", "systemCode": "SYS", "category": "FLOW_IN", "systemName": "System A"},
                        {"tagname": "FI_1_SEL", "systemCode": "SYS", "category": "SELECTOR_S_E", "systemName": "System A"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([
            {"tagname": "FI_1", "timestamp": "2026-01-01T00:00:00Z", "value.float": 2.0},
        ])

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.flow_query.httpx.AsyncClient", return_value=backend), patch(
                "app.services.flow_query.OdbcHistorianClient",
                return_value=odbc,
            ):
                result = await get_flow_by_system(
                    "SYS",
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                    60,
                )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["tagname"], "FI_1")
        self.assertIsNone(result[0]["data"][0]["state_value"])

    async def test_odbc_volume_fetches_raw_and_avoids_historical_post(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "VOL_1", "systemCode": "SYS", "category": "VOLUME", "systemName": "System A"},
                    ]
                },
            )
        )
        odbc = FakeOdbcClient(
            raw_rows=[
                {"tagname": "VOL_1", "timestamp": "2026-01-01T00:00:00Z", "valueFloat": 1.0},
                {"tagname": "VOL_1", "timestamp": "2026-01-01T00:01:00Z", "valueFloat": 1.0},
                {"tagname": "VOL_1", "timestamp": "2026-01-01T00:02:00Z", "valueFloat": 2.0},
            ]
        )

        with patch("app.services.volume_query.httpx.AsyncClient", return_value=backend), patch(
            "app.services.volume_query.OdbcHistorianClient",
            return_value=odbc,
        ):
            result = await get_volume_by_system(
                "SYS",
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["count"], 2)
        self.assertEqual([point["value"] for point in result[0]["data"]], [1.0, 2.0])
        self.assertEqual(odbc.calls[0][0], ["VOL_1"])
        self.assertEqual(backend.post_calls, [])

    async def test_odbc_volume_filters_and_orders_raw_rows(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {"tagname": "vol_1", "systemCode": "SYS", "category": "VOLUME", "systemName": "System A"},
                        {"tagname": "vol_2", "systemCode": "SYS", "category": "VOLUME", "systemName": "System A"},
                    ]
                },
            )
        )
        raw_rows = [
            {"TAGNAME": "VOL_1", "timestamp": "2026-01-01T00:02:00Z", "value": 3.0, "confidence": 100},
            {"TAGNAME": "VOL_1", "timestamp": "2026-01-01T00:01:00Z", "value": 2.0, "confidence": 100},
            {"TAGNAME": "VOL_1", "timestamp": "2026-01-01T00:00:00Z", "value": 2.0, "confidence": 100},
            {"TAGNAME": "VOL_1", "timestamp": "2026-01-01T00:03:00Z", "value": None, "confidence": 100},
            {"TAGNAME": "VOL_1", "timestamp": "2026-01-01T00:04:00Z", "value": 4.0, "confidence": 0},
            {"TAGNAME": "VOL_2", "timestamp": "2026-01-01T00:00:00Z", "value": 9.0, "confidence": 100},
            {"TAGNAME": "VOL_2", "timestamp": "2026-01-01T00:01:00Z", "value": 9.0, "confidence": 100},
            {"TAGNAME": "VOL_2", "timestamp": "2026-01-01T00:02:00Z", "value": 8.0, "confidence": 100},
        ]
        odbc = FakeOdbcClient(raw_rows=raw_rows)

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.volume_query.httpx.AsyncClient", return_value=backend), patch(
                "app.services.volume_query.OdbcHistorianClient",
                return_value=odbc,
            ):
                result = await get_volume_by_system(
                    "SYS",
                    datetime(2026, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                )

        self.assertEqual(len(result), 2)
        vol1 = next(item for item in result if item["tagname"] == "vol_1")
        vol2 = next(item for item in result if item["tagname"] == "vol_2")
        self.assertEqual([point["value"] for point in vol1["data"]], [2.0, 3.0])
        self.assertEqual([point["timestamp"] for point in vol1["data"]], ["2026-01-01T00:00:00Z", "2026-01-01T00:02:00Z"])
        self.assertEqual([point["value"] for point in vol2["data"]], [9.0, 8.0])

    async def test_odbc_raw_errors_invalid_json_and_http_status(self):
        request = httpx.Request("GET", "http://example.test/tags")
        bad_json = httpx.Response(200, request=request, content=b"not-json")
        response_400 = httpx.Response(400, request=request, json={"error": "bad request"})
        response_500 = httpx.Response(500, request=request, json={"error": "server"})

        class Client400:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return response_400

        class Client500:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return response_500

        class ClientTimeout:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                raise httpx.ReadTimeout("timeout", request=request)

        class ClientBadJSON:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, *args, **kwargs):
                return bad_json

        with patch.dict(os.environ, {"ODBC_API_URL": "http://odbc.test", "HISTORIAN_SOURCE": "odbc"}, clear=False):
            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=Client400()):
                with self.assertRaises(httpx.HTTPStatusError):
                    await OdbcHistorianClient().fetch_raw_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc))

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=Client500()):
                with self.assertRaises(httpx.HTTPStatusError):
                    await OdbcHistorianClient().fetch_raw_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc))

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=ClientTimeout()):
                with self.assertRaises(httpx.ReadTimeout):
                    await OdbcHistorianClient().fetch_raw_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc))

            with patch("app.services.odbc_historian_client.httpx.AsyncClient", return_value=ClientBadJSON()):
                with self.assertRaises(ValueError):
                    await OdbcHistorianClient().fetch_raw_rows(["TAG1"], datetime.now(timezone.utc), datetime.now(timezone.utc))