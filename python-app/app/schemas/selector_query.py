from typing import Any, Optional
from pydantic import BaseModel


class TagValueRow(BaseModel):
    timestamp: str
    value: Optional[Any] = None


class TagSelectorData(BaseModel):
    tagname: str
    category: str
    system_name: str
    system_code: str
    sub_system_name: Optional[str] = None
    sub_system_code: Optional[str] = None
    id_code: str
    count: int
    data: list[TagValueRow]


class SelectorQueryResponse(BaseModel):
    system_code: str
    start: str
    end: str
    interval_seconds: int
    total_tags: int
    tags: list[TagSelectorData]


class SelectorMultiQueryResponse(BaseModel):
    system_codes: list[str]
    start: str
    end: str
    interval_seconds: int
    total_systems: int
    total_tags: int
    systems: list[SelectorQueryResponse]
