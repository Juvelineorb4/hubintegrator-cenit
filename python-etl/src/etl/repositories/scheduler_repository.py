import logging
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from etl.models.types import EtlSchedulerState

logger = logging.getLogger(__name__)


class SchedulerRepository:
    """Database access for etl_scheduler_state."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_state(self) -> Optional[EtlSchedulerState]:
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT id, last_batch_executed, updated_at "
                "FROM etl_scheduler_state WHERE id = 1"
            )
            row = cur.fetchone()

        if row is None:
            return None

        return EtlSchedulerState(
            id=row["id"],
            last_batch_executed=row["last_batch_executed"],
            updated_at=row["updated_at"],
        )

    def get_max_batch(self) -> int:
        """Return the highest batch_number that exists in tag_etl_state."""
        with self._conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(batch_number), 0) FROM tag_etl_state")
            row = cur.fetchone()
        return row[0] if row else 0

    def update_last_batch(self, batch_number: int) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE etl_scheduler_state "
                "SET last_batch_executed = %s, updated_at = NOW() "
                "WHERE id = 1",
                (batch_number,),
            )
        self._conn.commit()
        logger.debug("Scheduler updated: last_batch_executed=%d", batch_number)