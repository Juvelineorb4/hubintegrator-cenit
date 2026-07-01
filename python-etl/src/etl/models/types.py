from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Tag:
    id: str
    tagname: str
    phd_tagno: str
    phd_data_type_name: str       # DOUBLE | STRING | BOOLEAN | BINARY | INTEGER | FLOAT
    created_at: datetime
    historization_from: Optional[datetime] = None


@dataclass
class TagEtlState:
    tag_id: str
    mode: str            # HISTORICAL | INCREMENTAL
    status: str          # PENDING | RUNNING | READY | FAILED | PAUSED
    batch_number: int
    consecutive_failures: int
    last_loaded_data_timestamp: Optional[datetime] = None
    last_attempt_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    error_message: Optional[str] = None


@dataclass
class EtlSchedulerState:
    id: int
    last_batch_executed: int
    updated_at: datetime


@dataclass
class TagValueRow:
    tag_id: str
    timestamp: datetime
    value_double: Optional[float] = None
    value_text: Optional[str] = None
    value_boolean: Optional[bool] = None
    value_binary: Optional[bytes] = None
