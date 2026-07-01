import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from etl.clients.historian_client import HistorianClient
from etl.config import settings
from etl.models.types import Tag, TagEtlState, TagValueRow
from etl.repositories.tag_etl_state_repository import TagEtlStateRepository
from etl.repositories.tag_value_repository import TagValueRepository
from etl.services.transform_service import TransformService

logger = logging.getLogger(__name__)


def _fmt(dt: datetime) -> str:
    """Format for log messages only (UTC)."""
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def _normalize_ts(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (UTC if naive)."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class IncrementalService:
    """
    Handles incremental forward loading.

    Tags are grouped by their last_loaded_data_timestamp watermark. Each group
    results in a single HTTP call to the historian with all tagnames whose
    window starts at the same point, reducing N HTTP calls to one per distinct
    watermark value.

    The window end is always NOW(), computed once per process_group() call so
    all groups share the same ceiling.

    Incremental runs are throttled by INCREMENTAL_INTERVAL_SECONDS (default 3600 s)
    so the historian is not queried more often than once per hour.
    """

    # Persists across cycle rebuilds because it is a class-level attribute.
    _last_run: datetime | None = None

    def __init__(
        self,
        tag_etl_state_repo: TagEtlStateRepository,
        tag_value_repo: TagValueRepository,
        historian_client: HistorianClient,
        transform_service: TransformService,
    ) -> None:
        self._tag_etl_state_repo = tag_etl_state_repo
        self._tag_value_repo = tag_value_repo
        self._historian_client = historian_client
        self._transform_service = transform_service

    def process_group(self, pairs: list[tuple[Tag, TagEtlState]]) -> None:
        """
        Process a list of INCREMENTAL tags.
        Tags sharing the same watermark timestamp are batched into a single
        historian call. Tags without a watermark are skipped with a warning.
        """
        now = datetime.now(timezone.utc)

        # Throttle: only run once per INCREMENTAL_INTERVAL_SECONDS
        if IncrementalService._last_run is not None:
            elapsed = (now - IncrementalService._last_run).total_seconds()
            if elapsed < settings.incremental_interval_seconds:
                logger.info(
                    "[INCREMENTAL] Throttled — %.0fs since last run (interval=%ds). Skipping.",
                    elapsed,
                    settings.incremental_interval_seconds,
                )
                return

        IncrementalService._last_run = now
        end = now

        groups: dict[datetime, list[tuple[Tag, TagEtlState]]] = defaultdict(list)

        for tag, state in pairs:
            if state.last_loaded_data_timestamp is None:
                logger.warning(
                    "[INCREMENTAL] tag='%s': no last_loaded_data_timestamp set; "
                    "skipping — should still be in HISTORICAL mode.",
                    tag.tagname,
                )
                continue

            watermark = _normalize_ts(state.last_loaded_data_timestamp)
            groups[watermark].append((tag, state))

        for watermark, group_pairs in groups.items():
            self._process_window(group_pairs, watermark, end)

    def _process_window(
        self,
        pairs: list[tuple[Tag, TagEtlState]],
        start: datetime,
        end: datetime,
    ) -> None:
        """Execute one HTTP call for all tags in the group and process results."""

        # Never query into the future
        if start >= end:
            logger.info(
                "[INCREMENTAL] window start=%s >= end=%s (no new data yet). Skipping.",
                _fmt(start),
                _fmt(end),
            )
            return

        tagname_to_tag: dict[str, Tag] = {tag.tagname.upper(): tag for tag, _ in pairs}

        logger.info(
            "[INCREMENTAL] %d tag(s): loading %s → %s",
            len(pairs),
            _fmt(start),
            _fmt(end),
        )

        # --- Single HTTP call for all tags in the group ---
        try:
            raw_rows = self._historian_client.get_tag_values(
                tagnames=list(tagname_to_tag.keys()),
                start=start,
                end=end,
            )
        except Exception as exc:
            logger.exception(
                "[INCREMENTAL] HTTP call failed for window %s → %s.",
                _fmt(start), _fmt(end),
            )
            for tag, _ in pairs:
                self._tag_etl_state_repo.mark_failed(tag.id, str(exc))
            return

        logger.info(
            "[INCREMENTAL] historian returned %d row(s) for %d tag(s).",
            len(raw_rows), len(pairs),
        )

        # --- Split rows by TAGNAME ---
        rows_by_tagname: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in raw_rows:
            tagname = (row.get("TAGNAME") or "").upper()
            if tagname in tagname_to_tag:
                rows_by_tagname[tagname].append(row)

        # --- Transform per tag; accumulate all rows ---
        all_value_rows: list[TagValueRow] = []
        successful_tag_ids: list[str] = []

        for tag, _ in pairs:
            try:
                tag_rows = self._transform_service.transform(
                    tag, rows_by_tagname.get(tag.tagname.upper(), [])
                )
                all_value_rows.extend(tag_rows)
                successful_tag_ids.append(tag.id)
            except Exception as exc:
                logger.exception(
                    "[INCREMENTAL] tag='%s': transform failed.", tag.tagname
                )
                self._tag_etl_state_repo.mark_failed(tag.id, str(exc))

        # --- One bulk insert for all transformed rows ---
        if all_value_rows:
            try:
                self._tag_value_repo.bulk_insert(all_value_rows)
            except Exception as exc:
                logger.exception(
                    "[INCREMENTAL] bulk_insert failed for window %s → %s.",
                    _fmt(start), _fmt(end),
                )
                for tag, _ in pairs:
                    self._tag_etl_state_repo.mark_failed(tag.id, str(exc))
                return

        # --- Advance watermark for all successfully transformed tags ---
        for tag_id in successful_tag_ids:
            self._tag_etl_state_repo.update_watermark(
                tag_id=tag_id, last_loaded_ts=end, status="READY"
            )