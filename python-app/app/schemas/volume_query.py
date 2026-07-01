from typing import Any, Optional
from pydantic import BaseModel


class TagValueRow(BaseModel):
    timestamp: str
    value: Optional[Any] = None


class TagVolumeData(BaseModel):
    tagname: str
    category: str
    system_name: str
    system_code: str
    sub_system_name: Optional[str] = None
    sub_system_code: Optional[str] = None
    id_code: str
    count: int
    data: list[TagValueRow]


class VolumeQueryResponse(BaseModel):
    system_code: str
    start: str
    end: str
    total_tags: int
    tags: list[TagVolumeData]