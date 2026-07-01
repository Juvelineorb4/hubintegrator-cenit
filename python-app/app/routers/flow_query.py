from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.core import cache
from app.schemas.flow_query import FlowQueryResponse
from app.services.flow_query import get_flow_by_system

router = APIRouter(prefix="/tag-values", tags=["tag-values"])


@router.get(
    "/flowBySystem",
    response_model=FlowQueryResponse,
    summary="Tags de Flujo (FLOW / FLOW_IN / FLOW_OUT) de un sistema, resampleados por intervalo",
)
async def flow_by_system(
    system_code: str = Query(..., description="Código del sistema (system_entity.code)"),
    start: datetime = Query(..., description="Fecha/hora inicio (ISO 8601)"),
    end: datetime = Query(..., description="Fecha/hora fin (ISO 8601)"),
    interval_seconds: int = Query(60, ge=1, description="Intervalo de resampleo en segundos"),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="'end' debe ser posterior a 'start'")

    cache_key = f"flow:{system_code}:{start.isoformat()}:{end.isoformat()}:{interval_seconds}"
    cached = await cache.get(cache_key)
    if cached:
        return FlowQueryResponse.model_validate_json(cached)

    try:
        tags = await get_flow_by_system(system_code, start, end, interval_seconds)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error consultando backend: {exc}")

    response = FlowQueryResponse(
        system_code=system_code,
        start=start.isoformat(),
        end=end.isoformat(),
        interval_seconds=interval_seconds,
        total_tags=len(tags),
        tags=tags,
    )
    await cache.set(cache_key, response.model_dump_json())
    return response