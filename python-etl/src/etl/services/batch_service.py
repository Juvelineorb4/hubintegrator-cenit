import logging

from etl.models.types import Tag, TagEtlState
from etl.repositories.tag_etl_state_repository import TagEtlStateRepository
from etl.repositories.tag_repository import TagRepository
from etl.services.historical_service import HistoricalService
from etl.services.incremental_service import IncrementalService

logger = logging.getLogger(__name__)

_MODE_HISTORICAL = "HISTORICAL"
_MODE_INCREMENTAL = "INCREMENTAL"


class BatchService:
    """
    Loads all (Tag, TagEtlState) pairs for a given batch in a single query,
    groups them by ETL mode, and delegates each group to the appropriate
    service for grouped HTTP processing.
    """

    def __init__(
        self,
        tag_repo: TagRepository,
        tag_etl_state_repo: TagEtlStateRepository,
        historical_service: HistoricalService,
        incremental_service: IncrementalService,
    ) -> None:
        self._tag_repo = tag_repo
        self._tag_etl_state_repo = tag_etl_state_repo
        self._historical_service = historical_service
        self._incremental_service = incremental_service

    def process_batch(self, batch_number: int) -> None:
        pairs = self._tag_repo.get_tags_with_state_by_batch(batch_number)

        if not pairs:
            logger.info("Batch %d: no tags to process.", batch_number)
            return

        logger.info("Batch %d: processing %d tag(s).", batch_number, len(pairs))

        historical_pairs: list[tuple[Tag, TagEtlState]] = []
        incremental_pairs: list[tuple[Tag, TagEtlState]] = []

        for tag, state in pairs:
            if state.mode == _MODE_HISTORICAL:
                historical_pairs.append((tag, state))
            elif state.mode == _MODE_INCREMENTAL:
                incremental_pairs.append((tag, state))
            else:
                logger.warning(
                    "Unknown ETL mode '%s' for tag '%s'. Skipping.",
                    state.mode, tag.tagname,
                )

        if historical_pairs:
            logger.info(
                "Batch %d: %d HISTORICAL tag(s).", batch_number, len(historical_pairs)
            )
            self._historical_service.process_group(historical_pairs)

        if incremental_pairs:
            logger.info(
                "Batch %d: %d INCREMENTAL tag(s).", batch_number, len(incremental_pairs)
            )
            self._incremental_service.process_group(incremental_pairs)
