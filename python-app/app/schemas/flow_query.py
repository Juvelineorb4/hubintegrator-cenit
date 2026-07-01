from typing import Any, Optional
from pydantic import BaseModel


class TagValueRow(BaseModel):
    timestamp: str
    value: Optional[Any] = None
    state_value: Optional[Any] = None

class TagFlowData(BaseModel):
    tagname: str
    category: str
    tagname_selector: Optional[str] = None
    category_selector: Optional[str] = None
    system_name: str
    system_code: str
    sub_system_name: Optional[str] = None
    sub_system_code: Optional[str] = None
    id_code: str
    count: int
    data: list[TagValueRow]


class FlowQueryResponse(BaseModel):
    system_code: str
    start: str
    end: str
    interval_seconds: int
    total_tags: int
    tags: list[TagFlowData]