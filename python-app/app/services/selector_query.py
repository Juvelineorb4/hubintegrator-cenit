from datetime import datetime, timedelta, timezone

import httpx
import os

from app.services.odbc_historian_client import (
    OdbcHistorianClient,
    normalize_tagname,
)

BACKEND = os.getenv("BACKEND_URL", "http://app-backend:3000/api")


def _local_naive_to_utc(dt: datetime) -> datetime:
    """Interpreta el input como Colombia (-05) y lo convierte a UTC."""
    return dt.replace(tzinfo=timezone(timedelta(hours=-5))).astimezone(timezone.utc)


def _pick_value(row: dict):
    """Returns the first non-null value column from a historized row."""
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
    if row.get("value.float") is not None:
        return row["value.float"]
    if row.get("value.string") is not None:
        return row["value.string"]
    if row.get("value.integer") is not None:
        return row["value.integer"]
    return row.get("valueBoolean")


def _rows_by_tagname(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        name = normalize_tagname(row.get("tagname") or row.get("TAGNAME"))
        if not name:
            continue
        grouped.setdefault(name, []).append(
            {
                "timestamp": row["timestamp"],
                "value": _pick_value(row),
            }
        )
    for rows_for_tag in grouped.values():
        rows_for_tag.sort(key=lambda item: item["timestamp"])
    return grouped


async def _fetch_tags_for_system(system_code: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(
            f"{BACKEND}/tags/selector",
            params={"systemCode": system_code},
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def get_selector_by_system(
    system_code: str,
    start: datetime,
    end: datetime,
    interval_seconds: int,
) -> list[dict]:
    if interval_seconds <= 0:
        return []

    start_utc = _local_naive_to_utc(start)
    end_utc = _local_naive_to_utc(end)

    tags = await _fetch_tags_for_system(system_code)
    if not tags:
        return []

    historized_rows = await OdbcHistorianClient().fetch_interval_rows(
        [t["tagname"] for t in tags],
        start_utc,
        end_utc,
        interval_seconds,
    )

    rows_by_tagname = _rows_by_tagname(historized_rows)

    output = []

    for t in tags:
        rows = rows_by_tagname.get(normalize_tagname(t["tagname"]), [])
        if not rows:
            continue

        sub_code = t.get("subSystemCode") or ""
        id_code = f"{t['systemCode']}-{sub_code}" if sub_code else t["systemCode"]

        output.append(
            {
                "tagname": t["tagname"],
                "category": t["category"],
                "system_name": t["systemName"],
                "system_code": t["systemCode"],
                "sub_system_name": t.get("subSystemName"),
                "sub_system_code": sub_code or None,
                "id_code": id_code,
                "count": len(rows),
                "data": rows,
            }
        )

    return output


async def get_selector_by_systems(
    system_codes: list[str],
    start: datetime,
    end: datetime,
    interval_seconds: int,
) -> list[dict]:
    systems = []
    for system_code in system_codes:
        tags = await get_selector_by_system(system_code, start, end, interval_seconds)
        systems.append(
            {
                "system_code": system_code,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "interval_seconds": interval_seconds,
                "total_tags": len(tags),
                "tags": tags,
            }
        )
    return systems
