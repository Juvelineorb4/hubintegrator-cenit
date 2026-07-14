from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.schemas.tag_query import TimeSampledResponse
from app.services.tag_query import get_time_sampled
from app.services.tag_query import TagQueryInvalidRequestError
from app.services.tag_query import TagQueryTimeoutError
from app.services.tag_query import TagQueryUpstreamError

router = APIRouter(prefix="/tag-values", tags=["tag-values"])


@router.get(
    "/time-sampled",
    response_model=TimeSampledResponse,
    summary="Raw tag values resampleados por intervalo",
)
async def time_sampled(
    tagname: str = Query(..., description="Nombre del tag"),
    start: datetime = Query(..., description="Fecha/hora inicio (ISO 8601)"),
    end: datetime = Query(..., description="Fecha/hora fin (ISO 8601)"),
    interval_seconds: int = Query(60, ge=1, description="Intervalo de resampleo en segundos"),
):
    if end <= start:
        raise HTTPException(status_code=400, detail="'end' debe ser posterior a 'start'")

    try:
        data = await get_time_sampled(tagname, start, end, interval_seconds)
    except TagQueryInvalidRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except TagQueryTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except TagQueryUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno inesperado")

    return TimeSampledResponse(
        tagname=tagname,
        start=start.isoformat(),
        end=end.isoformat(),
        interval_seconds=interval_seconds,
        count=len(data),
        data=data,
    )