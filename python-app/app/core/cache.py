"""
Redis cache helper — graceful degradation.

If Redis is unavailable at startup (or at runtime), caching is silently
disabled. The application continues to work without it.

Environment variables:
  REDIS_URL          Redis connection URL (default: redis://redis:6379/0)
  REDIS_CACHE_TTL    TTL in seconds for cached entries (default: 300)
"""
import logging
import os

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None
TTL: int = int(os.getenv("REDIS_CACHE_TTL", "300"))


async def connect() -> None:
    """Connect to Redis. Called once at application startup."""
    global _redis
    url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    client = aioredis.from_url(url, decode_responses=True)
    try:
        await client.ping()
        _redis = client
        logger.info("Redis connected at %s (TTL=%ds)", url, TTL)
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — caching disabled", exc)
        await client.aclose()


async def disconnect() -> None:
    """Close the Redis connection. Called once at application shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def get(key: str) -> str | None:
    """Return cached JSON string, or None on miss / Redis unavailable."""
    if _redis is None:
        return None
    try:
        return await _redis.get(key)
    except Exception:
        return None


async def set(key: str, value: str) -> None:
    """Store a JSON string with the configured TTL. No-op if Redis unavailable."""
    if _redis is None:
        return
    try:
        await _redis.set(key, value, ex=TTL)
    except Exception:
        pass
