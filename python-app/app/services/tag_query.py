from datetime import datetime

import httpx
import pandas as pd

from app.services.odbc_historian_client import OdbcHistorianClient
from app.services.odbc_historian_client import normalize_tagname


class TagQueryError(Exception):
    """Base semantic error for tag query service."""


class TagQueryInvalidRequestError(TagQueryError):
    pass


class TagQueryUpstreamError(TagQueryError):
    pass


class TagQueryTimeoutError(TagQueryError):
    pass


def _is_numeric_data_type(data_type_name: str | None) -> bool:
    return (data_type_name or "").strip().upper() in {"DOUBLE", "FLOAT", "INTEGER"}


def _has_numeric_values(values: pd.Series) -> bool:
    for value in values.tolist():
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return True
    return False


async def get_time_sampled(
    tagname: str,
    start: datetime,
    end: datetime,
    interval_seconds: int = 60,
) -> list[dict]:
    if interval_seconds <= 0:
        raise TagQueryInvalidRequestError("'interval_seconds' debe ser mayor que 0")

    normalized_requested = normalize_tagname(tagname)
    if not normalized_requested:
        raise TagQueryInvalidRequestError("'tagname' es requerido")

    try:
        raw_rows = await OdbcHistorianClient().fetch_raw_rows([tagname], start, end)
    except httpx.ReadTimeout as exc:
        raise TagQueryTimeoutError("Timeout consultando odbc-api") from exc
    except httpx.HTTPStatusError as exc:
        raise TagQueryUpstreamError(f"Error HTTP de odbc-api: {exc.response.status_code}") from exc
    except ValueError as exc:
        raise TagQueryUpstreamError(str(exc)) from exc

    rows = []
    for row in raw_rows:
        normalized_row_tagname = normalize_tagname(row.get("tagname") or row.get("TAGNAME"))
        if normalized_row_tagname != normalized_requested:
            continue
        rows.append(
            {
                "timestamp": row.get("timestamp") or row.get("TIMESTAMP"),
                "value": row.get("value"),
                "data_type_name": row.get("data_type_name") or row.get("DATA_TYPE_NAME"),
                "confidence": row.get("confidence") if row.get("confidence") is not None else row.get("CONFIDENCE"),
            }
        )

    if not rows:
        return []

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"])
    if df.empty:
        return []
    df = df.sort_values("timestamp", ascending=True)
    df = df.set_index("timestamp")

    rule = f"{interval_seconds}s"

    has_numeric_type = (
        "data_type_name" in df.columns
        and df["data_type_name"].apply(_is_numeric_data_type).any()
    )
    has_text_type = (
        "data_type_name" in df.columns
        and df["data_type_name"].astype(str).str.upper().eq("STRING").any()
    )
    has_boolean_type = (
        "data_type_name" in df.columns
        and df["data_type_name"].astype(str).str.upper().isin({"BOOLEAN", "BOOL"}).any()
    )

    if has_numeric_type or _has_numeric_values(df["value"]):
        numeric_values = pd.to_numeric(df["value"], errors="coerce")
        resampled = numeric_values.resample(rule).mean().to_frame(name="value")
    elif has_text_type or has_boolean_type:
        resampled = df[["value"]].resample(rule).last()
    else:
        resampled = df[["value"]].resample(rule).last()

    resampled = resampled.dropna(subset=["value"])
    resampled = resampled.reset_index()
    resampled["timestamp"] = resampled["timestamp"].apply(lambda ts: ts.isoformat())

    return resampled.to_dict(orient="records")