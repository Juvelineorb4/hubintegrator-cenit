from typing import Any, Optional
from pydantic import BaseModel


class TagValueRow(BaseModel):
    timestamp: str
    value: Optional[Any] = None
    value_max: Optional[Any] = None


class TagPressureData(BaseModel):
    tagname: str
    category: str
    tagname_max: Optional[str] = None
    category_max: Optional[str] = None
    system_name: str
    system_code: str
    sub_system_name: Optional[str] = None
    sub_system_code: Optional[str] = None
    id_code: str
    count: int
    data: list[TagValueRow]


class PressureQueryResponse(BaseModel):
    system_code: str
    start: str
    end: str
    interval_seconds: int
    total_tags: int
    tags: list[TagPressureData]