from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.parser import parse_excel
from app.services.loader import load_excel

router = APIRouter(prefix="/upload", tags=["upload"])

ACCEPTED_MIME = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",                                            # .xls
}


def _validate_file(file: UploadFile) -> None:
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Solo se aceptan archivos Excel (.xlsx, .xls)",
        )


@router.post("/preview", summary="Previsualizar Excel antes de guardar")
async def preview_upload(file: UploadFile = File(...)):
    """
    Parsea el Excel y retorna el contenido de las 3 hojas con warnings.
    No persiste ningún dato.
    """
    _validate_file(file)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    try:
        return parse_excel(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/load", summary="Cargar Excel a la base de datos")
async def load_upload(file: UploadFile = File(...)):
    """
    Parsea el Excel, enriquece tags con la ODBC API (browse)
    y persiste systems, subsystems, relaciones y tags en la DB.
    Retorna un reporte de lo insertado y errores encontrados.
    """
    _validate_file(file)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    try:
        parsed = parse_excel(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return await load_excel(parsed)
