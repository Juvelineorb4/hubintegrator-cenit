import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from etl.config import settings
from etl.models.types import Tag, TagValueRow

logger = logging.getLogger(__name__)

# Historian data types that map to value_double
_NUMERIC_TYPES = {"DOUBLE", "FLOAT", "INTEGER"}

# Timestamp formats returned by the historian
_TS_FORMAT_MS = "%Y-%m-%d %H:%M:%S.%f"
_TS_FORMAT = "%Y-%m-%d %H:%M:%S"


def _parse_historian_ts(ts_str: str, tz: ZoneInfo) -> datetime:
    """Parse a historian timestamp string into a timezone-aware datetime."""
    for fmt in (_TS_FORMAT_MS, _TS_FORMAT):
        try:
            return datetime.strptime(ts_str, fmt).replace(tzinfo=tz)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse historian timestamp: {ts_str!r}")


class TransformService:
    """
    Converts raw historian API responses into TagValueRow records
    ready for bulk insertion into tag_value.

    Value column mapping by phd_data_type_name:
      DOUBLE | FLOAT | INTEGER  →  value_double
      STRING                    →  value_text
      BOOLEAN                   →  value_boolean
      BINARY                    →  value_binary

    Rows where VALUE is None or CONFIDENCE is 0 are skipped.
    """

    def __init__(self) -> None:
        self._tz = ZoneInfo(settings.historian_timezone)

    def transform(self, tag: Tag, raw_rows: list[dict[str, Any]]) -> list[TagValueRow]:
        """
        Convert raw historian rows for a single tag into TagValueRow records.

        Args:
            tag:      the Tag whose data is being transformed.
            raw_rows: raw dicts returned by HistorianClient.get_tag_values.

        Returns:
            List of TagValueRow ready for TagValueRepository.bulk_insert.
        """
        result: list[TagValueRow] = []
        dtype = tag.phd_data_type_name.upper()

        for row in raw_rows:
            ts_raw = row.get("TIMESTAMP")
            value = row.get("VALUE")
            confidence = row.get("CONFIDENCE", 100)

            # Skip rows without a timestamp
            if not ts_raw:
                logger.debug(
                    "tag='%s': row missing TIMESTAMP, skipping.", tag.tagname
                )
                continue

            # Skip rows where the historian returned no value
            if value is None:
                logger.debug(
                    "tag='%s' ts='%s': NULL value, skipping.", tag.tagname, ts_raw
                )
                continue

            # Skip low-confidence readings
            if confidence == 0:
                logger.debug(
                    "tag='%s' ts='%s': CONFIDENCE=0, skipping.", tag.tagname, ts_raw
                )
                continue

            try:
                ts = _parse_historian_ts(str(ts_raw), self._tz)
            except ValueError:
                logger.warning(
                    "tag='%s': unparseable timestamp %r, skipping.", tag.tagname, ts_raw
                )
                continue

            tag_value_row = self._map_value(tag, ts, value, dtype)
            if tag_value_row is not None:
                result.append(tag_value_row)

        logger.debug(
            "tag='%s': %d raw rows → %d TagValueRow(s).",
            tag.tagname, len(raw_rows), len(result),
        )
        return result

    def _map_value(
        self,
        tag: Tag,
        ts: datetime,
        value: Any,
        dtype: str,
    ) -> TagValueRow | None:
        """Map a single historian value to the correct TagValueRow column."""
        try:
            if dtype in _NUMERIC_TYPES:
                return TagValueRow(
                    tag_id=tag.id,
                    timestamp=ts,
                    value_double=float(value),
                )
            if dtype == "STRING":
                return TagValueRow(
                    tag_id=tag.id,
                    timestamp=ts,
                    value_text=str(value),
                )
            if dtype == "BOOLEAN":
                # PHD historian may return 0/1 integers or "TRUE"/"FALSE" strings
                bool_val = (
                    value.strip().upper() in ("TRUE", "1", "YES")
                    if isinstance(value, str)
                    else bool(int(value))
                )
                return TagValueRow(
                    tag_id=tag.id,
                    timestamp=ts,
                    value_boolean=bool_val,
                )
            if dtype == "BINARY":
                raw_bytes = value if isinstance(value, (bytes, bytearray)) else bytes(value)
                return TagValueRow(
                    tag_id=tag.id,
                    timestamp=ts,
                    value_binary=raw_bytes,
                )
        except (ValueError, TypeError) as exc:
            logger.warning(
                "tag='%s' dtype='%s': cannot map value %r — %s. Skipping.",
                tag.tagname, dtype, value, exc,
            )
            return None

        logger.warning(
            "tag='%s': unknown phd_data_type_name '%s'. Skipping.",
            tag.tagname, dtype,
        )
        return None
