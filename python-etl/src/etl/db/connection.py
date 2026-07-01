import psycopg
from etl.config import settings


def get_connection() -> psycopg.Connection:
    """
    Opens and returns a new PostgreSQL connection.

    Used as a context manager — the connection is committed and closed
    automatically on exit:

        with get_connection() as conn:
            ...

    A new connection is created per ETL cycle to avoid stale connections
    during long-running service execution.
    """
    return psycopg.connect(settings.postgres_dsn)
