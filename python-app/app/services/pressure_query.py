import os
from datetime import datetime, timedelta, timezone

import httpx

BACKEND = os.getenv("BACKEND_URL", "http://app-backend:3000/api")


_MAIN_CATEGORIES = {"PRESSURE_IN", "PRESSURE_OUT"}

_CATEGORY_TO_MAX = {
    "PRESSURE_IN":  "PRESSURE_IN_MAX",
    "PRESSURE_OUT": "PRESSURE_OUT_MAX",
}


def _local_naive_to_utc(dt: datetime) -> datetime:
    """Interpreta el input como Colombia (-05) y lo convierte a UTC."""
    return dt.replace(tzinfo=timezone(timedelta(hours=-5))).astimezone(timezone.utc)


def _pick_value(row: dict):
    """Returns the first non-null value column from a historized row."""
    if row.get("valueDouble") is not None:
        return row["valueDouble"]
    if row.get("valueText") is not None:
        return row["valueText"]
    return row.get("valueBoolean")


def _merge_main_and_max(
    main_data: list[dict],
    max_data: list[dict] | None,
) -> list[dict]:
    """
    Joins two already-historized series (same grid, same length).
    Returns [{timestamp, value, value_max}].
    If max_data is absent or mismatched, value_max is None for every row.
    """
    if not main_data:
        return []

    if max_data and len(main_data) == len(max_data):
        return [
            {
                "timestamp": m["timestamp"],
                "value":     m["value"],
                "value_max": mx["value"],
            }
            for m, mx in zip(main_data, max_data)
        ]

    # No MAX companion — return main rows with value_max = null
    return [
        {
            "timestamp": m["timestamp"],
            "value":     m["value"],
            "value_max": None,
        }
        for m in main_data
    ]


async def get_pressure_by_system(
    system_code: str,
    start: datetime,
    end: datetime,
    interval_seconds: int,
) -> list[dict]:
    if interval_seconds <= 0:
        return []

    start_utc = _local_naive_to_utc(start)
    end_utc   = _local_naive_to_utc(end)

    async with httpx.AsyncClient(timeout=120) as client:
        # 1. Fetch pressure tag metadata for the system
        r = await client.get(
            f"{BACKEND}/tags/pressure",
            params={"systemCode": system_code},
        )
        r.raise_for_status()
        tags: list[dict] = r.json().get("data", [])

        if not tags:
            return []

        # 2. Fetch historized data â€” backend does all resampling in PostgreSQL
        r = await client.post(
            f"{BACKEND}/tag-values/batch/historized",
            json={
                "tagnames":        [t["tagname"] for t in tags],
                "start":           start_utc.isoformat(),
                "end":             end_utc.isoformat(),
                "intervalSeconds": interval_seconds,
            },
        )
        r.raise_for_status()
        historized_rows: list[dict] = r.json().get("data", [])

    # Group rows by tagname, picking the non-null value column
    rows_by_tagname: dict[str, list[dict]] = {}
    for row in historized_rows:
        name = row["tagname"]
        if name not in rows_by_tagname:
            rows_by_tagname[name] = []
        rows_by_tagname[name].append({
            "timestamp": row["timestamp"],
            "value":     _pick_value(row),
        })

    # Index tag metadata by (systemCode, subSystemCode, category) for pairing
    indexed: dict[tuple, dict] = {}
    for t in tags:
        sub_code = t.get("subSystemCode") or ""
        indexed[(t["systemCode"], sub_code, t["category"])] = t

    output = []

    for t in tags:
        if t["category"] not in _MAIN_CATEGORIES:
            continue

        sub_code     = t.get("subSystemCode") or ""
        max_category = _CATEGORY_TO_MAX[t["category"]]
        max_tag      = indexed.get((t["systemCode"], sub_code, max_category))

        main_data = rows_by_tagname.get(t["tagname"], [])
        max_data  = rows_by_tagname.get(max_tag["tagname"], []) if max_tag else None

        merged_data = _merge_main_and_max(main_data, max_data)
        if not merged_data:
            continue

        id_code = f"{t['systemCode']}-{sub_code}" if sub_code else t["systemCode"]

        output.append({
            "tagname":          t["tagname"],
            "tagname_max":      max_tag["tagname"] if max_tag else None,
            "category":         t["category"],
            "category_max":     max_tag["category"] if max_tag else None,
            "system_name":      t["systemName"],
            "system_code":      t["systemCode"],
            "sub_system_name":  t.get("subSystemName"),
            "sub_system_code":  sub_code or None,
            "id_code":          id_code,
            "count":            len(merged_data),
            "data":             merged_data,
        })

    return output
