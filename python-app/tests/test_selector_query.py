from __future__ import annotations

from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.selector_query import router as selector_query_router
from app.services.selector_query import get_selector_by_system
from app.services.selector_query import get_selector_by_systems


class FakeBackendClient:
    def __init__(self, get_response: httpx.Response):
        self.get_response = get_response
        self.get_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        self.get_calls.append((url, params))
        return self.get_response


class FakeOdbcClient:
    def __init__(self, rows=None, error: Exception | None = None):
        self.rows = rows or []
        self.error = error
        self.calls = []

    async def fetch_interval_rows(self, tagnames, start, end, interval_seconds):
        self.calls.append((tagnames, start, end, interval_seconds))
        if self.error is not None:
            raise self.error
        return self.rows


def _response(status_code: int, payload: object) -> httpx.Response:
    request = httpx.Request("GET", "http://example.test")
    return httpx.Response(status_code, request=request, json=payload)


class SelectorQueryServiceTests(IsolatedAsyncioTestCase):
    async def test_selector_query_preserves_types_and_sorted_timestamps(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {
                            "tagname": "se_1",
                            "systemCode": "11",
                            "category": "SELECTOR_S_E",
                            "systemName": "System 11",
                            "subSystemCode": "AYA",
                            "subSystemName": "Ayacucho",
                        }
                    ]
                },
            )
        )
        odbc = FakeOdbcClient(
            [
                {"tagname": "SE_1", "timestamp": "2026-01-01T00:00:03Z", "valueText": "AUTO"},
                {"tagname": "SE_1", "timestamp": "2026-01-01T00:00:01Z", "valueBoolean": False},
                {"tagname": "SE_1", "timestamp": "2026-01-01T00:00:02Z", "valueInteger": 0},
            ]
        )

        with patch("app.services.selector_query.httpx.AsyncClient", return_value=backend), patch(
            "app.services.selector_query.OdbcHistorianClient",
            return_value=odbc,
        ):
            result = await get_selector_by_system(
                "11",
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["category"], "SELECTOR_S_E")
        self.assertEqual(result[0]["id_code"], "11-AYA")
        self.assertEqual([r["timestamp"] for r in result[0]["data"]], [
            "2026-01-01T00:00:01Z",
            "2026-01-01T00:00:02Z",
            "2026-01-01T00:00:03Z",
        ])
        self.assertEqual(result[0]["data"][0]["value"], False)
        self.assertEqual(result[0]["data"][1]["value"], 0)
        self.assertEqual(result[0]["data"][2]["value"], "AUTO")

    async def test_selector_query_returns_empty_when_backend_has_no_tags(self):
        backend = FakeBackendClient(_response(200, {"data": []}))
        odbc = FakeOdbcClient([])

        with patch("app.services.selector_query.httpx.AsyncClient", return_value=backend), patch(
            "app.services.selector_query.OdbcHistorianClient",
            return_value=odbc,
        ):
            result = await get_selector_by_system(
                "MISSING",
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result, [])
        self.assertEqual(odbc.calls, [])

    async def test_selector_query_skips_tag_without_rows(self):
        backend = FakeBackendClient(
            _response(
                200,
                {
                    "data": [
                        {
                            "tagname": "SE_1",
                            "systemCode": "11",
                            "category": "SELECTOR_S_E",
                            "systemName": "System 11",
                        }
                    ]
                },
            )
        )
        odbc = FakeOdbcClient([])

        with patch("app.services.selector_query.httpx.AsyncClient", return_value=backend), patch(
            "app.services.selector_query.OdbcHistorianClient",
            return_value=odbc,
        ):
            result = await get_selector_by_system(
                "11",
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(result, [])

    async def test_selector_multi_query_aggregates_systems(self):
        async def fake_get_selector_by_system(system_code, start, end, interval_seconds):
            return [
                {
                    "tagname": f"SE_{system_code}",
                    "category": "SELECTOR_S_E",
                    "system_name": f"System {system_code}",
                    "system_code": system_code,
                    "sub_system_name": None,
                    "sub_system_code": None,
                    "id_code": system_code,
                    "count": 1,
                    "data": [{"timestamp": "2026-01-01T00:00:00Z", "value": "AUTO"}],
                }
            ]

        with patch("app.services.selector_query.get_selector_by_system", side_effect=fake_get_selector_by_system):
            systems = await get_selector_by_systems(
                ["11", "22"],
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                60,
            )

        self.assertEqual(len(systems), 2)
        self.assertEqual(systems[0]["system_code"], "11")
        self.assertEqual(systems[1]["system_code"], "22")
        self.assertEqual(systems[0]["total_tags"], 1)
        self.assertEqual(systems[1]["total_tags"], 1)


class SelectorQueryEndpointTests(TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(selector_query_router)
        self.client = TestClient(app)

    def test_selector_endpoint_contract(self):
        sample_tags = [
            {
                "tagname": "SE_11",
                "category": "SELECTOR_S_E",
                "system_name": "System 11",
                "system_code": "11",
                "sub_system_name": None,
                "sub_system_code": None,
                "id_code": "11",
                "count": 1,
                "data": [{"timestamp": "2026-01-01T00:00:00Z", "value": "AUTO"}],
            }
        ]

        async def fake_get_selector_by_system(*args, **kwargs):
            return sample_tags

        with patch("app.routers.selector_query.cache.get", return_value=None), patch(
            "app.routers.selector_query.cache.set",
            return_value=None,
        ), patch("app.routers.selector_query.get_selector_by_system", side_effect=fake_get_selector_by_system):
            response = self.client.get(
                "/tag-values/selectorBySystem",
                params={
                    "system_code": "11",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload.keys()), {"system_code", "start", "end", "interval_seconds", "total_tags", "tags"})
        self.assertEqual(payload["total_tags"], 1)
        self.assertEqual(payload["tags"][0]["category"], "SELECTOR_S_E")

    def test_selector_multi_endpoint_contract(self):
        systems_payload = [
            {
                "system_code": "11",
                "start": "2026-01-01T00:00:00+00:00",
                "end": "2026-01-01T01:00:00+00:00",
                "interval_seconds": 60,
                "total_tags": 1,
                "tags": [
                    {
                        "tagname": "SE_11",
                        "category": "SELECTOR_S_E",
                        "system_name": "System 11",
                        "system_code": "11",
                        "sub_system_name": None,
                        "sub_system_code": None,
                        "id_code": "11",
                        "count": 1,
                        "data": [{"timestamp": "2026-01-01T00:00:00Z", "value": "AUTO"}],
                    }
                ],
            },
            {
                "system_code": "22",
                "start": "2026-01-01T00:00:00+00:00",
                "end": "2026-01-01T01:00:00+00:00",
                "interval_seconds": 60,
                "total_tags": 0,
                "tags": [],
            },
        ]

        async def fake_get_selector_by_systems(*args, **kwargs):
            return systems_payload

        with patch("app.routers.selector_query.cache.get", return_value=None), patch(
            "app.routers.selector_query.cache.set",
            return_value=None,
        ), patch("app.routers.selector_query.get_selector_by_systems", side_effect=fake_get_selector_by_systems):
            response = self.client.get(
                "/tag-values/selectorMultiBySystem",
                params={
                    "system_codes": "11,22",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(set(payload.keys()), {
            "system_codes",
            "start",
            "end",
            "interval_seconds",
            "total_systems",
            "total_tags",
            "systems",
        })
        self.assertEqual(payload["total_systems"], 2)
        self.assertEqual(payload["total_tags"], 1)

    def test_selector_endpoints_validation_and_error_mapping(self):
        response_bad_dates = self.client.get(
            "/tag-values/selectorBySystem",
            params={
                "system_code": "11",
                "start": "2026-01-01T01:00:00Z",
                "end": "2026-01-01T00:00:00Z",
                "interval_seconds": 60,
            },
        )
        self.assertEqual(response_bad_dates.status_code, 400)

        response_bad_codes = self.client.get(
            "/tag-values/selectorMultiBySystem",
            params={
                "system_codes": ", ,",
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-01T01:00:00Z",
                "interval_seconds": 60,
            },
        )
        self.assertEqual(response_bad_codes.status_code, 400)

        async def fake_raises(*args, **kwargs):
            raise RuntimeError("backend timeout")

        with patch("app.routers.selector_query.cache.get", return_value=None), patch(
            "app.routers.selector_query.get_selector_by_system",
            side_effect=fake_raises,
        ):
            response_502 = self.client.get(
                "/tag-values/selectorBySystem",
                params={
                    "system_code": "11",
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-01T01:00:00Z",
                    "interval_seconds": 60,
                },
            )

        self.assertEqual(response_502.status_code, 502)
