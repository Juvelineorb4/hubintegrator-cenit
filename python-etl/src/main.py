import logging
import time

from etl.clients.historian_client import HistorianClient
from etl.config import settings
from etl.db.connection import get_connection
from etl.repositories.scheduler_repository import SchedulerRepository
from etl.repositories.tag_etl_state_repository import TagEtlStateRepository
from etl.repositories.tag_repository import TagRepository
from etl.repositories.tag_value_repository import TagValueRepository
from etl.services.batch_service import BatchService
from etl.services.historical_service import HistoricalService
from etl.services.incremental_service import IncrementalService
from etl.services.scheduler_service import SchedulerService
from etl.services.transform_service import TransformService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _run_cycle(
    conn,
    historian_client: HistorianClient,
    transform_service: TransformService,
) -> None:
    """Build the service graph for the current cycle and run it."""
    scheduler_repo = SchedulerRepository(conn)
    tag_repo = TagRepository(conn)
    tag_etl_state_repo = TagEtlStateRepository(conn)
    tag_value_repo = TagValueRepository(conn)

    historical_service = HistoricalService(
        tag_etl_state_repo=tag_etl_state_repo,
        tag_value_repo=tag_value_repo,
        historian_client=historian_client,
        transform_service=transform_service,
    )
    incremental_service = IncrementalService(
        tag_etl_state_repo=tag_etl_state_repo,
        tag_value_repo=tag_value_repo,
        historian_client=historian_client,
        transform_service=transform_service,
    )
    batch_service = BatchService(
        tag_repo=tag_repo,
        tag_etl_state_repo=tag_etl_state_repo,
        historical_service=historical_service,
        incremental_service=incremental_service,
    )
    scheduler_service = SchedulerService(
        scheduler_repo=scheduler_repo,
        tag_etl_state_repo=tag_etl_state_repo,
        batch_service=batch_service,
    )

    scheduler_service.run_cycle()


def main() -> None:
    logger.info("ETL service starting up.")
    logger.info(
        "Config — DB: %s:%s/%s | Historian: %s | Interval: %ds",
        settings.postgres_host,
        settings.postgres_port,
        settings.postgres_db,
        settings.odbc_api_url,
        settings.etl_interval_seconds,
    )

    # Stateless clients are created once and reused across cycles.
    historian_client = HistorianClient(base_url=settings.odbc_api_url)
    transform_service = TransformService()

    while True:
        try:
            with get_connection() as conn:
                _run_cycle(conn, historian_client, transform_service)
        except Exception:
            logger.exception("Unhandled error in ETL cycle.")

        logger.info("Sleeping %ds until next cycle...", settings.etl_interval_seconds)
        time.sleep(settings.etl_interval_seconds)


if __name__ == "__main__":
    main()
