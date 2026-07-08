import os
from datetime import datetime, timedelta, timezone

import httpx

from app.services.odbc_historian_client import (
    OdbcHistorianClient,
    get_historian_source,
    normalize_tagname,
)

BACKEND = os.getenv("BACKEND_URL", "http://app-backend:3000/api")

_BATCH_LIMIT = 1_000_000


def _local_naive_to_utc(dt: datetime) -> datetime:
    """Interpreta el input como Colombia (-05) y lo convierte a UTC."""
    return dt.replace(tzinfo=timezone(timedelta(hours=-5))).astimezone(timezone.utc)


def _pick_value(row: dict):
    """Returns the first non-null value column from a raw row."""
    if row.get("value") is not None:
        return row["value"]
    if row.get("valueDouble") is not None:
        return row["valueDouble"]
    if row.get("valueFloat") is not None:
        return row["valueFloat"]
    if row.get("valueText") is not None:
        return row["valueText"]
    if row.get("valueBoolean") is not None:
        return row["valueBoolean"]
    if row.get("valueInteger") is not None:
        return row["valueInteger"]
    return row.get("valueBoolean")


def _change_points(rows: list[dict]) -> list[dict]:
    """
    Keeps only rows where the value changed from the previous row.
    Rows must be sorted by timestamp ascending (as returned by the backend).
    """
    if not rows:
        return []
    result = []
    _sentinel = object()
    prev = _sentinel
    for row in rows:
        v = row["value"]
        if v != prev:
            result.append(row)
            prev = v
    return result


async def get_volume_by_system(
    system_code: str,
    start: datetime,
    end: datetime,
) -> list[dict]:
    start_utc = _local_naive_to_utc(start)
    end_utc   = _local_naive_to_utc(end)

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(
            f"{BACKEND}/tags/volume",
            params={"systemCode": system_code},
        )
        r.raise_for_status()
        tags: list[dict] = r.json().get("data", [])

    if not tags:
        return []

    source = get_historian_source()
    if source == "postgres":
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{BACKEND}/tag-values/raw/batch",
                json={
                    "tagnames": [t["tagname"] for t in tags],
                    "start":    start_utc.isoformat(),
                    "end":      end_utc.isoformat(),
                    "limit":    _BATCH_LIMIT,
                    "offset":   0,
                },
            )
            r.raise_for_status()
            raw_rows: list[dict] = r.json().get("data", [])
    else:
        raw_rows = await OdbcHistorianClient().fetch_raw_rows(
            [t["tagname"] for t in tags],
            start_utc,
            end_utc,
        )

    rows_by_tagname: dict[str, list[dict]] = {}
    for row in raw_rows:
        tagname = normalize_tagname(row.get("tagname") or row.get("TAGNAME"))
        if not tagname:
            continue

        confidence = row.get("confidence") if row.get("confidence") is not None else row.get("CONFIDENCE")
        if row.get("value") is None and row.get("valueDouble") is None and row.get("valueFloat") is None and row.get("valueText") is None and row.get("valueBoolean") is None and row.get("valueInteger") is None:
            if row.get("VALUE") is None:
                continue

        value = _pick_value(row)
        if value is None:
            continue
        if confidence == 0:
            continue

        rows_by_tagname.setdefault(tagname, []).append(
            {
                "timestamp": row["timestamp"],
                "value": value,
            }
        )

    for rows in rows_by_tagname.values():
        rows.sort(key=lambda item: item["timestamp"])

    output = []

    for t in tags:
        rows  = rows_by_tagname.get(normalize_tagname(t["tagname"]), [])
        points = _change_points(rows)

        sub_code = t.get("subSystemCode") or ""
        id_code  = f"{t['systemCode']}-{sub_code}" if sub_code else t["systemCode"]

        output.append({
            "tagname":         t["tagname"],
            "category":        t["category"],
            "system_name":     t["systemName"],
            "system_code":     t["systemCode"],
            "sub_system_name": t.get("subSystemName"),
            "sub_system_code": sub_code or None,
            "id_code":         id_code,
            "count":           len(points),
            "data":            points,
        })

    return output
  