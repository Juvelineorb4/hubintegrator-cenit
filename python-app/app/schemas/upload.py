from typing import Optional
from pydantic import BaseModel


class SystemRow(BaseModel):
    name: str
    code: str
    description: Optional[str] = None       # default: igual a name si viene vacío
    distance: Optional[float] = None
    type: Optional[str] = None              # OLEODUCTO | POLIDUCTO


class SubSystemRow(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    nomenclature: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class TagRow(BaseModel):
    tagname: str
    description: Optional[str] = None
    category: Optional[str] = None         # FLOW | PRESSURE | LEVEL | SELECTOR_S_E
    system: str                            # name del system al que pertenece
    subsystem: Optional[str] = None        # nomenclature del subsystem


class SheetResult(BaseModel):
    count: int
    rows: list


class PreviewResponse(BaseModel):
    systems: SheetResult
    subsystems: SheetResult
    tags: SheetResult
    warnings: list[str]
