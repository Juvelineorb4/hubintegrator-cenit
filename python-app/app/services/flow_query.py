from datetime import datetime, timedelta, timezone

import httpx

import os

from app.services.odbc_historian_client import (
    OdbcHistorianClient,
    get_historian_source,
    normalize_tagname,
)

BACKEND = os.getenv("BACKEND_URL", "http://app-backend:3000/api")


_MAIN_CATEGORIES = {"FLOW_IN", "FLOW_OUT"}
_SELECTOR_CATEGORY = "SELECTOR_S_E"


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
    return grouped


async def _fetch_tags_for_system(system_code: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(
            f"{BACKEND}/tags/flow",
            params={"systemCode": system_code},
        )
        r.raise_for_status()
        return r.json().get("data", [])


def _merge_main_and_selector(
    main_data: list[dict],
    selector_data: list[dict] | None,
) -> list[dict]:
    """
    Joins two already-historized series (same grid, same length).
    Returns [{timestamp, value, state_value}].
    If selector_data is absent or mismatched, state_value is None for every row.
    """
    if not main_data:
        return []

    if selector_data and len(main_data) == len(selector_data):
        return [
            {
                "timestamp":   m["timestamp"],
                "value":       m["value"],
                "state_value": s["value"],
            }
            for m, s in zip(main_data, selector_data)
        ]

    # No SELECTOR_S_E companion — return main rows with state_value = null
    return [
        {
            "timestamp":   m["timestamp"],
            "value":       m["value"],
            "state_value": None,
        }
        for m in main_data
    ]


async def get_flow_by_system(
    system_code: str,
    start: datetime,
    end: datetime,
    interval_seconds: int,
) -> list[dict]:
    if interval_seconds <= 0:
        return []

    start_utc = _local_naive_to_utc(start)
    end_utc   = _local_naive_to_utc(end)

    tags = await _fetch_tags_for_system(system_code)
    if not tags:
        return []

    source = get_historian_source()
    if source == "postgres":
        async with httpx.AsyncClient(timeout=120) as client:
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
    else:
        historized_rows = await OdbcHistorianClient().fetch_interval_rows(
            [t["tagname"] for t in tags],
            start_utc,
            end_utc,
            interval_seconds,
        )

    rows_by_tagname = _rows_by_tagname(historized_rows)

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
        selector_tag = indexed.get((t["systemCode"], sub_code, _SELECTOR_CATEGORY))

        main_data     = rows_by_tagname.get(normalize_tagname(t["tagname"]), [])
        selector_data = rows_by_tagname.get(normalize_tagname(selector_tag["tagname"])) if selector_tag else None

        merged_data = _merge_main_and_selector(main_data, selector_data)
        if not merged_data:
            continue

        id_code = f"{t['systemCode']}-{sub_code}" if sub_code else t["systemCode"]

        output.append({
            "tagname":           t["tagname"],
            "tagname_selector":  selector_tag["tagname"] if selector_tag else None,
            "category":          t["category"],
            "category_selector": selector_tag["category"] if selector_tag else None,
            "system_name":       t["systemName"],
            "system_code":       t["systemCode"],
            "sub_system_name":   t.get("subSystemName"),
            "sub_system_code":   sub_code or None,
            "id_code":           id_code,
            "count":             len(merged_data),
            "data":              merged_data,
        })

    return output
