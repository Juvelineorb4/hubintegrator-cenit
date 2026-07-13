from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx


def normalize_tagname(tagname: str | None) -> str:
    return (tagname or "").strip().upper()


def _parse_timeout(value: str | None, default: float) -> float:
    if value is None or value.strip() == "":
        return default
    parsed = float(value)
    if parsed <= 0:
        raise ValueError("Timeout values must be greater than 0")
    return parsed


def _extract_value(row: dict[str, Any]) -> Any:
    for key in (
        "value",
        "VALUE",
        "valueDouble",
        "valueFloat",
        "valueText",
        "valueBoolean",
        "valueInteger",
        "value.float",
        "value.string",
        "value.integer",
    ):
        if key in row and row[key] is not None:
            return row[key]
    return None


def _extract_confidence(row: dict[str, Any]) -> Any:
    if "confidence" in row and row["confidence"] is not None:
        return row["confidence"]
    if "CONFIDENCE" in row and row["CONFIDENCE"] is not None:
        return row["CONFIDENCE"]
    return None


def _extract_timestamp(row: dict[str, Any]) -> str:
    timestamp = row.get("timestamp") or row.get("TIMESTAMP")
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ValueError("odbc-api response row missing timestamp")
    return timestamp


def _extract_tagname(row: dict[str, Any]) -> str:
    tagname = row.get("tagname") or row.get("TAGNAME")
    normalized = normalize_tagname(tagname if isinstance(tagname, str) else None)
    if not normalized:
        raise ValueError("odbc-api response row missing tagname")
    return normalized


@dataclass(frozen=True)
class OdbcHistorianConfig:
    base_url: str
    connect_timeout_seconds: float
    read_timeout_seconds: float


def get_odbc_historian_config() -> OdbcHistorianConfig:
    return OdbcHistorianConfig(
        base_url=os.getenv("ODBC_API_URL", "http://host.docker.internal:1234").rstrip("/"),
        connect_timeout_seconds=_parse_timeout(os.getenv("ODBC_CONNECT_TIMEOUT_SECONDS"), 10.0),
        read_timeout_seconds=_parse_timeout(os.getenv("ODBC_READ_TIMEOUT_SECONDS"), 120.0),
    )


class OdbcHistorianClient:
    def __init__(self, config: OdbcHistorianConfig | None = None) -> None:
        self.config = config or get_odbc_historian_config()

    def _timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.config.connect_timeout_seconds,
            read=self.config.read_timeout_seconds,
            write=self.config.read_timeout_seconds,
            pool=self.config.read_timeout_seconds,
        )

    async def fetch_interval_rows(
        self,
        tagnames: list[str],
        start: datetime,
        end: datetime,
        interval_seconds: int,
    ) -> list[dict[str, Any]]:
        clean = []
        seen = set()
        for tagname in tagnames:
            normalized = normalize_tagname(tagname)
            if normalized and normalized not in seen:
                seen.add(normalized)
                clean.append(normalized)

        if not clean:
            return []

        params = {
            "tagnames": ",".join(clean),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "interval_seconds": interval_seconds,
        }

        async with httpx.AsyncClient(base_url=self.config.base_url, timeout=self._timeout()) as client:
            response = await client.get("/tags/interval", params=params)
            response.raise_for_status()

            try:
                payload = response.json()
            except ValueError as exc:
                raise ValueError("odbc-api returned invalid JSON") from exc

        if isinstance(payload, dict):
            rows = payload.get("data", [])
        else:
            rows = payload

        if not isinstance(rows, list):
            raise ValueError("odbc-api returned an unexpected JSON payload")

        normalized_rows: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("odbc-api returned a non-object row")
            normalized_rows.append(
                {
                    "tagname": _extract_tagname(row),
                    "timestamp": _extract_timestamp(row),
                    "value": _extract_value(row),
                }
            )

        return normalized_rows

    async def fetch_raw_rows(
        self,
        tagnames: list[str],
        start: datetime,
        end: datetime,
    ) -> list[dict[str, Any]]:
        clean = []
        seen = set()
        for tagname in tagnames:
            normalized = normalize_tagname(tagname)
            if normalized and normalized not in seen:
                seen.add(normalized)
                clean.append(normalized)

        if not clean:
            return []

        params = {
            "tagnames": ",".join(clean),
            "start": start.isoformat(),
            "end": end.isoformat(),
        }

        async with httpx.AsyncClient(base_url=self.config.base_url, timeout=self._timeout()) as client:
            response = await client.get("/tags", params=params)
            response.raise_for_status()

            try:
                payload = response.json()
            except ValueError as exc:
                raise ValueError("odbc-api returned invalid JSON") from exc

        if isinstance(payload, dict):
            rows = payload.get("data", [])
        else:
            rows = payload

        if not isinstance(rows, list):
            raise ValueError("odbc-api returned an unexpected JSON payload")

        normalized_rows: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("odbc-api returned a non-object row")
            normalized_rows.append(
                {
                    "tagname": _extract_tagname(row),
                    "timestamp": _extract_timestamp(row),
                    "value": _extract_value(row),
                    "data_type_name": row.get("data_type_name") or row.get("DATA_TYPE_NAME"),
                    "confidence": _extract_confidence(row),
                }
            )

        return normalized_rows