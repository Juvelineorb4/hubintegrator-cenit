from typing import Any, Optional
from pydantic import BaseModel, Field


class TimeSampledRow(BaseModel):
    timestamp: str
    value: Optional[Any] = None


class TimeSampledResponse(BaseModel):
    tagname: str
    start: str
    end: str
    interval_seconds: int
    count: int
    data: list[TimeSampledRow]