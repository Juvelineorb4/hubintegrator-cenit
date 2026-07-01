import logging

import psycopg
from psycopg.rows import dict_row

from etl.models.types import Tag, TagEtlState

logger = logging.getLogger(__name__)


class TagRepository:
    """Database access for the tag table."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_tags_with_state_by_batch(
        self, batch_number: int
    ) -> list[tuple[Tag, TagEtlState]]:
        """
        Return all non-paused (Tag, TagEtlState) pairs for the given batch.
        Single JOIN query — avoids N+1 selects in the service layer.
        """
        query = """
            SELECT t.id, t.tagname, t.phd_tagno, t.phd_data_type_name,
                   t.created_at, t.historization_from,
                   tes.mode, tes.status, tes.batch_number,
                   tes.last_loaded_data_timestamp, tes.last_attempt_at,
                   tes.last_success_at, tes.error_message, tes.consecutive_failures
            FROM tag t
            INNER JOIN tag_etl_state tes ON t.id = tes.tag_id
            WHERE tes.batch_number = %s
              AND tes.status != 'PAUSED'
        """
        with self._conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (batch_number,))
            rows = cur.fetchall()

        result: list[tuple[Tag, TagEtlState]] = []
        for row in rows:
            tag = Tag(
                id=str(row["id"]),
                tagname=row["tagname"],
                phd_tagno=row["phd_tagno"],
                phd_data_type_name=row["phd_data_type_name"],
                created_at=row["created_at"],
                historization_from=row["historization_from"],
            )
            state = TagEtlState(
                tag_id=str(row["id"]),
                mode=row["mode"],
                status=row["status"],
                batch_number=row["batch_number"],
                consecutive_failures=row["consecutive_failures"],
                last_loaded_data_timestamp=row["last_loaded_data_timestamp"],
                last_attempt_at=row["last_attempt_at"],
                last_success_at=row["last_success_at"],
                error_message=row["error_message"],
            )
            result.append((tag, state))
        return result
