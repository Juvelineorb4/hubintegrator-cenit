from __future__ import annotations

from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.tag_query import router as tag_query_router
from app.services.tag_query import TagQueryTimeoutError
from app.services.tag_query import TagQueryUpstreamError
from app.services.tag_query import get_time_sampled


class FakeOdbcClient:
    def __init__(self, rows=None, error: Exception | None = None):
        self.rows = rows or []
        self.error = error
        self.calls = []

    async def fetch_raw_rows(self, tagnames, start, end):
        self.calls.append((tagnames, start, end))
        if self.error is not None:
            raise self.error
        return self.rows


class TagQueryServiceTests(IsolatedAsyncioTestCase):
    async def test_raw_query_uses_odbc_and_filters_by_requested_tag_case_insensitive(self):
        client = FakeOdbcClient(
            rows=[
                {
                    "tagname": "PT_001",
                    "timestamp": "2026-01-01T00:00:00Z",
                    "value": 10.0,
                    "data_type_name": "DOUBLE",
                    "confidence": 100,
                },
                {
                    "tagname": "PT_999",
                    "timestamp": "2026-01-01T00:00:00Z",
                    "value": 99.0,
                    "data_type_name": "DOUBLE",
                    "confidence": 100,
                },
            ]
        )

        start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 1, 1, 0, 2, tzinfo=timezone.utc)

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled("pt_001", start, end, 60)

        self.assertEqual(client.calls[0][0], ["pt_001"])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["value"], 10.0)

    async def test_float_resample_uses_mean(self):
        client = FakeOdbcClient(
            rows=[
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:10Z", "value": 10.0, "data_type_name": "FLOAT"},
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:20Z", "value": 20.0, "data_type_name": "FLOAT"},
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "PT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["value"], 15.0)

    async def test_integer_resample_uses_mean(self):
        client = FakeOdbcClient(
            rows=[
                {"tagname": "IT_1", "timestamp": "2026-01-01T00:00:10Z", "value": 2, "data_type_name": "INTEGER"},
                {"tagname": "IT_1", "timestamp": "2026-01-01T00:00:20Z", "value": 4, "data_type_name": "INTEGER"},
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "IT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result[0]["value"], 3.0)

    async def test_string_uses_last_value_in_bucket(self):
        client = FakeOdbcClient(
            rows=[
                {"tagname": "ST_1", "timestamp": "2026-01-01T00:00:10Z", "value": "A", "data_type_name": "STRING"},
                {"tagname": "ST_1", "timestamp": "2026-01-01T00:00:20Z", "value": "B", "data_type_name": "STRING"},
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "ST_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result[0]["value"], "B")

    async def test_boolean_false_and_numeric_zero_with_confidence_zero_are_not_dropped(self):
        bool_client = FakeOdbcClient(
            rows=[
                {
                    "tagname": "BT_1",
                    "timestamp": "2026-01-01T00:00:10Z",
                    "value": False,
                    "data_type_name": "BOOLEAN",
                    "confidence": 0,
                }
            ]
        )
        zero_client = FakeOdbcClient(
            rows=[
                {
                    "tagname": "NT_1",
                    "timestamp": "2026-01-01T00:00:10Z",
                    "value": 0,
                    "data_type_name": "DOUBLE",
                    "confidence": 0,
                }
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=bool_client):
            bool_result = await get_time_sampled(
                "BT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=zero_client):
            zero_result = await get_time_sampled(
                "NT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(bool_result[0]["value"], False)
        self.assertEqual(zero_result[0]["value"], 0.0)

    async def test_empty_response_and_tag_not_found_return_empty_list(self):
        client = FakeOdbcClient(rows=[])
        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "MISSING_TAG",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result, [])

    async def test_unsorted_rows_are_sorted_before_resample(self):
        client = FakeOdbcClient(
            rows=[
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:20Z", "value": 20.0, "data_type_name": "DOUBLE"},
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:10Z", "value": 10.0, "data_type_name": "DOUBLE"},
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "PT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 2, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result[0]["value"], 15.0)
        self.assertIn("+00:00", result[0]["timestamp"])

    async def test_duplicate_timestamps_are_processed_without_dropping(self):
        client = FakeOdbcClient(
            rows=[
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:00Z", "value": 10.0, "data_type_name": "DOUBLE"},
                {"tagname": "PT_1", "timestamp": "2026-01-01T00:00:00Z", "value": 20.0, "data_type_name": "DOUBLE"},
            ]
        )

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=client):
            result = await get_time_sampled(
                "PT_1",
                datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result[0]["value"], 15.0)

    async def test_invalid_json_http_errors_and_timeout_are_mapped_to_service_errors(self):
        request = httpx.Request("GET", "http://example.test/tags")
        response_400 = httpx.Response(400, request=request, json={"error": "bad request"})
        response_500 = httpx.Response(500, request=request, json={"error": "server"})
        err_400 = httpx.HTTPStatusError("bad request", request=request, response=response_400)
        err_500 = httpx.HTTPStatusError("server error", request=request, response=response_500)
        err_timeout = httpx.ReadTimeout("timeout", request=request)

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=FakeOdbcClient(error=ValueError("odbc-api returned invalid JSON"))):
            with self.assertRaises(TagQueryUpstreamError):
                await get_time_sampled("PT_1", datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=FakeOdbcClient(error=err_400)):
            with self.assertRaises(TagQueryUpstreamError):
                await get_time_sampled("PT_1", datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=FakeOdbcClient(error=err_500)):
            with self.assertRaises(TagQueryUpstreamError):
                await get_time_sampled("PT_1", datetime.now(timezone.utc), datetime.now(timezone.utc), 60)

        with patch("app.services.tag_query.OdbcHistorianClient", return_value=FakeOdbcClient(error=err_timeout)):
            with self.assertRaises(TagQueryTimeoutError):
                await get_time_sampled("PT_1", datetime.now(timezone.utc), datetime.now(timezone.utc), 60)


class TagQueryEndpointTests(TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(tag_query_router)
        self.client = TestClient(app)

    def test_endpoint_preserves_json_contract(self):
        start = "2026-01-01T00:00:00Z"
        end = "2026-01-01T01:00:00Z"
        sample_data = [{"timestamp": "2026-01-01T00:00:00+00:00", "value": 1.0}]

        async def fake_get_time_sampled(*args, **kwargs):
            return sample_data

        with patch("app.routers.tag_query.get_time_sampled", side_effect=fake_get_time_sampled):
            response = self.client.get(
                "/tag-values/time-sampled",
                params={
                    "tagname": "PT_1",
                    "start": start,
                    "end": end,
                    "interval_seconds": 60,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload.keys()), {"tagname", "start", "end", "interval_seconds", "count", "data"})
        self.assertEqual(payload["tagname"], "PT_1")
        self.assertEqual(payload["interval_seconds"], 60)
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["data"], sample_data)

    def test_endpoint_maps_upstream_timeout_and_unexpected_errors(self):
        async def fake_upstream_error(*args, **kwargs):
            raise TagQueryUpstreamError("invalid odbc payload")

        async def fake_timeout(*args, **kwargs):
            raise TagQueryTimeoutError("timeout consultando odbc-api")

        async def fake_unexpected(*args, **kwargs):
            raise RuntimeError("boom")

        with patch("app.routers.tag_query.get_time_sampled", side_effect=fake_upstream_error):
            response_502 = self.client.get(
                "/tag-values/time-sampled",
                params={
                    "tagname": "PT_1",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        with patch("app.routers.tag_query.get_time_sampled", side_effect=fake_timeout):
            response_504 = self.client.get(
                "/tag-values/time-sampled",
                params={
                    "tagname": "PT_1",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        with patch("app.routers.tag_query.get_time_sampled", side_effect=fake_unexpected):
            response_500 = self.client.get(
                "/tag-values/time-sampled",
                params={
                    "tagname": "PT_1",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        self.assertEqual(response_502.status_code, 502)
        self.assertEqual(response_504.status_code, 504)
        self.assertEqual(response_500.status_code, 500)

    def test_endpoint_invalid_params_keep_400_for_end_before_start(self):
        response = self.client.get(
            "/tag-values/time-sampled",
            params={
                "tagname": "PT_1",
                "start": "2026-01-01T01:00:00Z",
                "end": "2026-01-01T00:00:00Z",
                "interval_seconds": 60,
            },
        )

        self.assertEqual(response.status_code, 400)
