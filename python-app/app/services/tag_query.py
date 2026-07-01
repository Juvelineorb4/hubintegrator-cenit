import os
from datetime import datetime

import httpx
import pandas as pd

BACKEND = os.getenv("BACKEND_URL", "http://app-backend:3000/api")


async def get_time_sampled(
    tagname: str,
    start: datetime,
    end: datetime,
    interval_seconds: int = 60,
) -> list[dict]:
    """
    1. Solicita los raw tag_values al backend (sin resampleo).
    2. Aplica pandas resample con el intervalo dado en segundos.
    """
    params = {
        "tagname": tagname,
        "start":   start.isoformat(),
        "end":     end.isoformat(),
    }

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{BACKEND}/tag-values/raw", params=params)
        r.raise_for_status()

    rows = r.json().get("data", [])
    if not rows:
        return []

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp")

    rule = f"{interval_seconds}s"

    # Detectar qué columna tiene datos y resamplear según el tipo
    if "valueDouble" in df.columns and df["valueDouble"].notna().any():
        resampled = df[["valueDouble"]].resample(rule).mean()
        resampled = resampled.rename(columns={"valueDouble": "value"})
    elif "valueText" in df.columns and df["valueText"].notna().any():
        resampled = df[["valueText"]].resample(rule).last()
        resampled = resampled.rename(columns={"valueText": "value"})
    elif "valueBoolean" in df.columns and df["valueBoolean"].notna().any():
        resampled = df[["valueBoolean"]].resample(rule).last()
        resampled = resampled.rename(columns={"valueBoolean": "value"})
    else:
        return []

    resampled = resampled.dropna(subset=["value"])
    resampled = resampled.reset_index()
    resampled["timestamp"] = resampled["timestamp"].apply(lambda ts: ts.isoformat())

    return resampled.to_dict(orient="records")