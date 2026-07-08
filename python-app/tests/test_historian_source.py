from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

import httpx

from app.services.flow_query import get_flow_by_system
from app.services.odbc_historian_client import OdbcHistorianClient
from app.services.pressure_query import get_pressure_by_system


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
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    async def fetch_interval_rows(self, tagnames, start, end, interval_seconds):
        self.calls.append((tagnames, start, end, interval_seconds))
        return self.rows


class HistorianSourceTests(IsolatedAsyncioTestCase):
    async def test_postgres_pressure_keeps_current_flow(self):
        tags_response = _response(
            200,
            {
                "data": [
                    {"tagname": "PT_1", "systemCode": "SYS", "category": "PRESSURE_IN", "systemName": "System A"},
                    {"tagname": "PT_1_MAX", "systemCode": "SYS", "category": "PRESSURE_IN_MAX", "systemName": "System A"},
                ]
            },
        )
        historized_response = _response(
            200,
            {
                "data": [
                    {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:00Z", "valueDouble": 10.0},
                    {"tagname": "PT_1_MAX", "timestamp": "2026-01-01T00:00:00Z", "valueDouble": 11.0},
                ]
            },
        )
        backend = FakeBackendClient(tags_response, historized_response)
        odbc = FakeOdbcClient([])

        with patch.dict(os.environ, {"HISTORIAN_SOURCE": "postgres"}, clear=False):
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
        self.assertEqual(len(odbc.calls), 0)

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