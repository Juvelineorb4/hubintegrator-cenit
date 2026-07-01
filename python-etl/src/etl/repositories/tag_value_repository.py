import logging

import psycopg

from etl.models.types import TagValueRow

logger = logging.getLogger(__name__)


class TagValueRepository:
    """Database access for tag_value (bulk insert only)."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def bulk_insert(self, rows: list[TagValueRow]) -> None:
        """
        Bulk insert a list of TagValueRow records into tag_value.

        Uses executemany for efficiency. Each row must have exactly one
        value field set (enforced by the check_single_value DB constraint).

        TODO: Consider using psycopg3 COPY protocol (copy_records_to_table)
              for very large payloads if executemany becomes a bottleneck.
        """
        if not rows:
            logger.debug("bulk_insert called with empty list, skipping.")
            return

        data = [
            (
                row.tag_id,
                row.timestamp,
                row.value_double,
                row.value_text,
                row.value_boolean,
                row.value_binary,
            )
            for row in rows
        ]

        with self._conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO tag_value (tag_id, timestamp, value_double, value_text, value_boolean, value_binary)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (tag_id, timestamp) DO NOTHING
                """,
                data,
            )

        self._conn.commit()
        logger.info("Bulk inserted %d row(s) into tag_value.", len(rows))
