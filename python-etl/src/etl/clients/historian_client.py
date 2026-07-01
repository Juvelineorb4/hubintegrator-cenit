import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from etl.config import settings

logger = logging.getLogger(__name__)

_HISTORIAN_TZ = ZoneInfo(settings.historian_timezone)
_TS_FORMAT = "%Y-%m-%d %H:%M:%S"


def _to_historian_str(dt: datetime) -> str:
    """Convert a UTC-aware datetime to historian local time string.

    The odbc-api expects naive datetime strings in the historian's local
    timezone (e.g. America/Bogota), e.g. '2025-12-31 23:00:00'.
    """
    return dt.astimezone(_HISTORIAN_TZ).strftime(_TS_FORMAT)


class HistorianClient:
    """
    HTTP client for the odbc-api historian service.

    Calls GET /tags?tagnames=TAG1,TAG2&start=...&end=...
    The API expects start/end as naive datetime strings in historian local
    timezone (HISTORIAN_TIMEZONE), e.g. "2025-12-31 23:00:00".
    """

    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    def get_tag_values(
        self,
        tagnames: list[str],
        start: datetime,
        end: datetime,
    ) -> list[dict[str, Any]]:
        """
        Fetch historian data for one or more tags within a time window.

        Args:
            tagnames: list of PHD tag names.
            start:    UTC-aware datetime for the window start.
            end:      UTC-aware datetime for the window end.

        Returns:
            Raw list of data-point dicts from the historian API.

        Raises:
            httpx.HTTPError: on connection or HTTP errors.
        """
        start_str = _to_historian_str(start)
        end_str   = _to_historian_str(end)

        url = f"{self._base_url}/tags"
        params: dict[str, str] = {
            "tagnames": ",".join(tagnames),
            "start": start_str,
            "end":   end_str,
        }

        logger.debug("GET %s params=%s", url, params)

        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()

        data = response.json()
        logger.debug("Historian returned %d record(s).", len(data))
       
        return data