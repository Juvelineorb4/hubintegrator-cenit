import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    postgres_host: str = os.environ.get("POSTGRES_HOST", "localhost")
    postgres_port: int = int(os.environ.get("POSTGRES_PORT", "5432"))
    postgres_db: str = os.environ.get("POSTGRES_DB", "hubintegrator")
    postgres_user: str = os.environ.get("POSTGRES_USER", "postgres")
    postgres_password: str = os.environ.get("POSTGRES_PASSWORD", "postgres")
    odbc_api_url: str = os.environ.get("ODBC_API_URL", "http://localhost:1234")
    etl_interval_seconds: int = int(os.environ.get("ETL_INTERVAL_SECONDS", "60"))

    # How many hours to fetch per historical backfill chunk (one chunk per cycle).
    historical_chunk_hours: int = int(os.environ.get("HISTORICAL_CHUNK_HOURS", "1"))

    # How many hours before NOW() the historical watermark must reach before the
    # service transitions the tag from HISTORICAL to INCREMENTAL mode.
    historical_transition_hours: int = int(
        os.environ.get("HISTORICAL_TRANSITION_HOURS", "24")
    )

    # How many seconds between incremental load cycles.
    # Historical runs every ETL_INTERVAL_SECONDS; incremental only runs every this many seconds.
    incremental_interval_seconds: int = int(os.environ.get("INCREMENTAL_INTERVAL_SECONDS", "3600"))

    # IANA timezone name for interpreting historian timestamps that have no tz info.
    # Example: "America/Bogota", "UTC".
    historian_timezone: str = os.environ.get("HISTORIAN_TIMEZONE", "UTC")

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} "
            f"port={self.postgres_port} "
            f"dbname={self.postgres_db} "
            f"user={self.postgres_user} "
            f"password={self.postgres_password}"
        )


settings = Settings()