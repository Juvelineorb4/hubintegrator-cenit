import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
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


class HistoricalService:
    """
    Handles full historical backfill.

    Tags are grouped by their computed chunk_start window. Each group results
    in a single HTTP call to the historian with all tagnames in that group,
    reducing N HTTP calls to one per distinct watermark value.

    Each chunk covers HISTORICAL_CHUNK_HOURS hours. The watermark advances by
    one chunk per scheduler cycle. When the watermark reaches within
    HISTORICAL_TRANSITION_HOURS of NOW(), the tag is auto-transitioned to
    INCREMENTAL mode.
    """

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
        Process a list of HISTORICAL tags.
        Tags sharing the same chunk_start are batched into a single historian call.
        """
        now = datetime.now(timezone.utc)
        transition_threshold = now - timedelta(hours=settings.historical_transition_hours)

        groups: dict[datetime, list[tuple[Tag, TagEtlState]]] = defaultdict(list)

        for tag, state in pairs:
            chunk_start = _normalize_ts(
                state.last_loaded_data_timestamp
                or tag.historization_from
                or tag.created_at
            )

            if chunk_start >= transition_threshold:
                logger.info(
                    "[HISTORICAL] tag='%s': watermark already at threshold, "
                    "transitioning to INCREMENTAL.",
                    tag.tagname,
                )
                self._tag_etl_state_repo.set_mode(tag.id, "INCREMENTAL")
                continue

            groups[chunk_start].append((tag, state))

        for chunk_start, group_pairs in groups.items():
            chunk_end = min(
                chunk_start + timedelta(hours=settings.historical_chunk_hours),
                transition_threshold,
            )
            self._process_window(group_pairs, chunk_start, chunk_end, transition_threshold)

    def _process_window(
        self,
        pairs: list[tuple[Tag, TagEtlState]],
        chunk_start: datetime,
        chunk_end: datetime,
        transition_threshold: datetime,
    ) -> None:
        """Execute one HTTP call for all tags in the group and process results."""
        tagname_to_tag: dict[str, Tag] = {tag.tagname.upper(): tag for tag, _ in pairs}
        should_transition = chunk_end >= transition_threshold

        logger.info(
            "[HISTORICAL] %d tag(s): loading %s → %s%s",
            len(pairs),
            _fmt(chunk_start),
            _fmt(chunk_end),
            " (final historical chunk)" if should_transition else "",
        )

        # --- Single HTTP call for all tags in the group ---
        try:
            raw_rows = self._historian_client.get_tag_values(
                tagnames=list(tagname_to_tag.keys()),
                start=chunk_start,
                end=chunk_end,
            )
        except Exception as exc:
            logger.exception(
                "[HISTORICAL] HTTP call failed for window %s → %s.",
                _fmt(chunk_start), _fmt(chunk_end),
            )
            for tag, _ in pairs:
                self._tag_etl_state_repo.mark_failed(tag.id, str(exc))
            return

        logger.info(
            "[HISTORICAL] historian returned %d row(s) for %d tag(s).",
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
        successful_tags: list[tuple[str, bool]] = []  # (tag_id, should_transition)

        for tag, _ in pairs:
            try:
                tag_rows = self._transform_service.transform(
                    tag, rows_by_tagname.get(tag.tagname.upper(), [])
                )
                all_value_rows.extend(tag_rows)
                successful_tags.append((tag.id, should_transition))
            except Exception as exc:
                logger.exception(
                    "[HISTORICAL] tag='%s': transform failed.", tag.tagname
                )
                self._tag_etl_state_repo.mark_failed(tag.id, str(exc))

        # --- One bulk insert for all transformed rows ---
        if all_value_rows:
            try:
                self._tag_value_repo.bulk_insert(all_value_rows)
            except Exception as exc:
                logger.exception(
                    "[HISTORICAL] bulk_insert failed for window %s → %s.",
                    _fmt(chunk_start), _fmt(chunk_end),
                )
                for tag, _ in pairs:
                    self._tag_etl_state_repo.mark_failed(tag.id, str(exc))
                return

        # --- Update watermarks for all successfully transformed tags ---
        for tag_id, transition in successful_tags:
            self._tag_etl_state_repo.update_watermark(
                tag_id=tag_id, last_loaded_ts=chunk_end, status="READY"
            )
            if transition:
                self._tag_etl_state_repo.set_mode(tag_id, "INCREMENTAL")
                logger.info(
                    "[HISTORICAL] tag_id=%s: backfill complete, transitioned to INCREMENTAL.",
                    tag_id,
                )