import logging

from etl.repositories.scheduler_repository import SchedulerRepository
from etl.repositories.tag_etl_state_repository import TagEtlStateRepository
from etl.services.batch_service import BatchService

logger = logging.getLogger(__name__)


class SchedulerService:
    """
    Reads the current scheduler pointer, computes the next batch to run,
    checks whether that batch has workable tags, and delegates to BatchService.

    TODO: Implement more sophisticated scheduling logic:
      - Wrap around to batch 0 when last_batch_executed reaches the max batch.
      - Skip batches that are entirely PAUSED.
      - Back-off logic when consecutive failures exceed a threshold.
      - Support configurable batch ordering or priority.
    """

    def __init__(
        self,
        scheduler_repo: SchedulerRepository,
        tag_etl_state_repo: TagEtlStateRepository,
        batch_service: BatchService,
    ) -> None:
        self._scheduler_repo = scheduler_repo
        self._tag_etl_state_repo = tag_etl_state_repo
        self._batch_service = batch_service

    def run_cycle(self) -> None:
        """
        Execute one scheduler cycle:
          1. Read last_batch_executed from etl_scheduler_state.
          2. Compute next_batch = last_batch_executed + 1.
          3. Check if next_batch has workable tags.
          4. Delegate to BatchService.process_batch.
          5. Update last_batch_executed.
        """
        state = self._scheduler_repo.get_state()

        if state is None:
            logger.warning(
                "etl_scheduler_state has no row (id=1). "
                "Seed the table before starting the ETL service."
            )
            return

        max_batch = self._scheduler_repo.get_max_batch()
        next_batch = (state.last_batch_executed % max_batch) + 1 if max_batch > 0 else 1

        logger.info(
            "Scheduler: last_batch_executed=%d → next_batch=%d (max=%d)",
            state.last_batch_executed,
            next_batch,
            max_batch,
        )

        if not self._tag_etl_state_repo.has_batch_work(next_batch):
            logger.info(
                "No workable tags in batch %d. Skipping cycle.", next_batch
            )
            return

        self._batch_service.process_batch(next_batch)
        self._scheduler_repo.update_last_batch(next_batch)

        logger.info("Cycle complete. last_batch_executed updated to %d.", next_batch)