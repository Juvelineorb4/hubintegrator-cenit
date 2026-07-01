from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.core import cache
from app.schemas.volume_query import VolumeQueryResponse
from app.services.volume_query import get_volume_by_system

router = APIRouter(prefix="/tag-values", tags=["tag-values"])


@router.get(
    "/volumeBySystem",
    response_model=VolumeQueryResponse,
    summary="Tags deVOLUME (VOLUME) de un sistema, resampleados por intervalo",
)
async def volume_by_system(
    system_code: str = Query(..., description="Código del sistema (system_entity.code)"),
    start: datetime = Query(..., description="Fecha/hora inicio (ISO 8601)"),
    end: datetime = Query(..., description="Fecha/hora fin (ISO 8601)"),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="'end' debe ser posterior a 'start'")

    cache_key = f"volume:{system_code}:{start.isoformat()}:{end.isoformat()}"
    cached = await cache.get(cache_key)
    if cached:
        return VolumeQueryResponse.model_validate_json(cached)

    try:
        tags = await get_volume_by_system(system_code, start, end)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error consultando backend: {exc}")

    response = VolumeQueryResponse(
        system_code=system_code,
        start=start.isoformat(),
        end=end.isoformat(),
        total_tags=len(tags),
        tags=tags,
    )
    await cache.set(cache_key, response.model_dump_json())
    return response