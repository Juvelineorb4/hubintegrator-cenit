import logging
from datetime import datetime
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from etl.models.types import TagEtlState

logger = logging.getLogger(__name__)


class TagEtlStateRepository:
    """Database access for tag_etl_state."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_by_tag_id(self, tag_id: str) -> Optional[TagEtlState]:
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT tag_id, mode, status, batch_number,
                       last_loaded_data_timestamp, last_attempt_at,
                       last_success_at, error_message, consecutive_failures
                FROM tag_etl_state
                WHERE tag_id = %s
                """,
                (tag_id,),
            )
            row = cur.fetchone()

        if row is None:
            return None

        return TagEtlState(
            tag_id=str(row["tag_id"]),
            mode=row["mode"],
            status=row["status"],
            batch_number=row["batch_number"],
            consecutive_failures=row["consecutive_failures"],
            last_loaded_data_timestamp=row["last_loaded_data_timestamp"],
            last_attempt_at=row["last_attempt_at"],
            last_success_at=row["last_success_at"],
            error_message=row["error_message"],
        )

    def has_batch_work(self, batch_number: int) -> bool:
        """Return True if the batch contains at least one non-paused tag."""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXISTS(
                    SELECT 1 FROM tag_etl_state
                    WHERE batch_number = %s AND status != 'PAUSED'
                )
                """,
                (batch_number,),
            )
            row = cur.fetchone()

        return bool(row[0]) if row else False

    def update_watermark(
        self,
        tag_id: str,
        last_loaded_ts: datetime,
        status: str = "READY",
    ) -> None:
        """Update the per-tag watermark after a successful load."""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tag_etl_state
                SET last_loaded_data_timestamp = %s,
                    last_success_at = NOW(),
                    last_attempt_at = NOW(),
                    status = %s,
                    consecutive_failures = 0,
                    error_message = NULL
                WHERE tag_id = %s
                """,
                (last_loaded_ts, status, tag_id),
            )
        self._conn.commit()

    def mark_failed(self, tag_id: str, error_message: str) -> None:
        """Record a processing failure for the given tag."""
        with self._conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tag_etl_state
                SET status = 'FAILED',
                    last_attempt_at = NOW(),
                    consecutive_failures = consecutive_failures + 1,
                    error_message = %s
                WHERE tag_id = %s
                """,
                (error_message, tag_id),
            )
        self._conn.commit()

    def set_mode(self, tag_id: str, mode: str) -> None:
        """Transition the ETL mode for the given tag (e.g., HISTORICAL → INCREMENTAL)."""
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE tag_etl_state SET mode = %s WHERE tag_id = %s",
                (mode, tag_id),
            )
        self._conn.commit()
        logger.debug("Tag %s mode set to %s.", tag_id, mode)
