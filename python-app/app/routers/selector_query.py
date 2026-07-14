from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.core import cache
from app.schemas.selector_query import SelectorMultiQueryResponse
from app.schemas.selector_query import SelectorQueryResponse
from app.services.selector_query import get_selector_by_system
from app.services.selector_query import get_selector_by_systems

router = APIRouter(prefix="/tag-values", tags=["tag-values"])


@router.get(
    "/selectorBySystem",
    response_model=SelectorQueryResponse,
    summary="Tags de selector (SELECTOR_S_E) de un sistema, resampleados por intervalo",
)
async def selector_by_system(
    system_code: str = Query(..., description="Codigo del sistema (system_entity.code)"),
    start: datetime = Query(..., description="Fecha/hora inicio (ISO 8601)"),
    end: datetime = Query(..., description="Fecha/hora fin (ISO 8601)"),
    interval_seconds: int = Query(60, ge=1, description="Intervalo de resampleo en segundos"),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="'end' debe ser posterior a 'start'")

    cache_key = f"selector:{system_code}:{start.isoformat()}:{end.isoformat()}:{interval_seconds}"
    cached = await cache.get(cache_key)
    if cached:
        return SelectorQueryResponse.model_validate_json(cached)

    try:
        tags = await get_selector_by_system(system_code, start, end, interval_seconds)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error consultando backend: {exc}")

    response = SelectorQueryResponse(
        system_code=system_code,
        start=start.isoformat(),
        end=end.isoformat(),
        interval_seconds=interval_seconds,
        total_tags=len(tags),
        tags=tags,
    )
    await cache.set(cache_key, response.model_dump_json())
    return response


@router.get(
    "/selectorMultiBySystem",
    response_model=SelectorMultiQueryResponse,
    summary="Tags de selector (SELECTOR_S_E) para multiples sistemas, resampleados por intervalo",
)
async def selector_multi_by_system(
    system_codes: str = Query(..., description="Codigos de sistema separados por coma (ej: 11,22)"),
    start: datetime = Query(..., description="Fecha/hora inicio (ISO 8601)"),
    end: datetime = Query(..., description="Fecha/hora fin (ISO 8601)"),
    interval_seconds: int = Query(60, ge=1, description="Intervalo de resampleo en segundos"),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="'end' debe ser posterior a 'start'")

    parsed_codes = [code.strip() for code in system_codes.split(",") if code.strip()]
    if not parsed_codes:
        raise HTTPException(status_code=400, detail="'system_codes' debe contener al menos un codigo")

    cache_key = f"selector-multi:{','.join(parsed_codes)}:{start.isoformat()}:{end.isoformat()}:{interval_seconds}"
    cached = await cache.get(cache_key)
    if cached:
        return SelectorMultiQueryResponse.model_validate_json(cached)

    try:
        systems = await get_selector_by_systems(parsed_codes, start, end, interval_seconds)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error consultando backend: {exc}")

    total_tags = sum(system["total_tags"] for system in systems)
    response = SelectorMultiQueryResponse(
        system_codes=parsed_codes,
        start=start.isoformat(),
        end=end.isoformat(),
        interval_seconds=interval_seconds,
        total_systems=len(systems),
        total_tags=total_tags,
        systems=systems,
    )
    await cache.set(cache_key, response.model_dump_json())
    return response
