from io import BytesIO
from typing import Any
from datetime import datetime

import pandas as pd

VALID_SYSTEM_TYPES = {"OLEODUCTO", "POLIDUCTO"}
VALID_CATEGORIES   = {"FLOW", "PRESSURE", "LEVEL", "SELECTOR_S_E"}


def _clean(val: Any) -> Any:
    """Convierte NaN/None a None y elimina espacios en strings vacíos."""
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    if isinstance(val, str):
        val = val.strip()
        return val if val else None
    return val


def _normalize_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza nombres de columna: strip + minúsculas."""
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def parse_excel(content: bytes) -> dict:
    warnings: list[str] = []

    try:
        xl = pd.ExcelFile(BytesIO(content))
    except Exception as exc:
        raise ValueError(f"No se pudo leer el archivo Excel: {exc}")

    # Índice de hojas en minúsculas para búsqueda case-insensitive
    sheets = {s.strip().lower(): s for s in xl.sheet_names}

    # ── 1. Systems ────────────────────────────────────────────────────────────
    systems: list[dict] = []
    if "system" in sheets:
        df = _normalize_cols(xl.parse(sheets["system"], dtype=str))
        for i, row in df.iterrows():
            name = _clean(row.get("name"))
            code = _clean(row.get("code"))
            if not name or not code:
                warnings.append(
                    f"[system] fila {i + 2}: 'name' y 'code' son requeridos — fila omitida"
                )
                continue

            desc     = _clean(row.get("description")) or name
            raw_type = _clean(row.get("type"))
            sys_type = None
            if raw_type:
                if raw_type.upper() in VALID_SYSTEM_TYPES:
                    sys_type = raw_type.upper()
                else:
                    warnings.append(
                        f"[system] fila {i + 2}: type '{raw_type}' no válido "
                        f"(opciones: {', '.join(VALID_SYSTEM_TYPES)}) — se guardará como null"
                    )

            raw_dist = _clean(row.get("distance"))
            distance = None
            if raw_dist is not None:
                try:
                    distance = float(raw_dist)
                except ValueError:
                    warnings.append(
                        f"[system] fila {i + 2}: distance '{raw_dist}' no es numérico — se guardará como null"
                    )

            systems.append({
                "name":        name,
                "code":        code,
                "description": desc,
                "distance":    distance,
                "type":        sys_type,
            })
    else:
        warnings.append("Hoja 'system' no encontrada en el archivo")

    # ── 2. Subsystems ─────────────────────────────────────────────────────────
    subsystems: list[dict] = []
    if "subsystem" in sheets:
        df = _normalize_cols(xl.parse(sheets["subsystem"], dtype=str))
        for i, row in df.iterrows():
            name        = _clean(row.get("name"))
            code        = _clean(row.get("code"))
            nomenclature = _clean(row.get("nomenclature"))
            if not name or not code or not nomenclature:
                warnings.append(
                    f"[subsystem] fila {i + 2}: 'name', 'code' y 'nomenclature' son requeridos — fila omitida"
                )
                continue

            lat = lon = None
            for field, label in [(row.get("latitude"), "latitude"), (row.get("longitude"), "longitude")]:
                raw = _clean(field)
                if raw is not None:
                    try:
                        val = float(raw)
                        if label == "latitude":
                            lat = val
                        else:
                            lon = val
                    except ValueError:
                        warnings.append(
                            f"[subsystem] fila {i + 2}: {label} '{raw}' no es numérico — se guardará como null"
                        )

            # Columna "system": puede contener varios nombres separados por coma
            raw_systems = _clean(row.get("system"))
            system_names: list[str] = []
            if raw_systems:
                system_names = [s.strip() for s in raw_systems.split(",") if s.strip()]

            subsystems.append({
                "name":         name,
                "code":         code,
                "description":  _clean(row.get("description")),
                "nomenclature": nomenclature,
                "latitude":     lat,
                "longitude":    lon,
                "systems":      system_names,  # [] si la celda está vacía
            })
    else:
        warnings.append("Hoja 'subsystem' no encontrada en el archivo")

    # ── 3. Tags ───────────────────────────────────────────────────────────────
    tags: list[dict] = []
    if "tag" in sheets:
        df = _normalize_cols(xl.parse(sheets["tag"], dtype=str))
        for i, row in df.iterrows():
            tagname     = _clean(row.get("tagname"))
            category    = _clean(row.get("category"))
            system_name = _clean(row.get("system"))
            if not tagname or not system_name:
                warnings.append(
                    f"[tag] fila {i + 2}: 'tagname' y 'system' son requeridos — fila omitida"
                )
                continue

            parsed_cat = None
            if category:
                if category.upper() in VALID_CATEGORIES:
                    parsed_cat = category.upper()
                else:
                    warnings.append(
                        f"[tag] fila {i + 2}: category '{category}' no válida "
                        f"(opciones: {', '.join(VALID_CATEGORIES)}) — se guardará como null"
                    )

            # Combinar historical_from_date + historical_from_hour
            historization_from = None
            from_date = _clean(row.get("historical_from_date"))
            if from_date:
                # Excel puede devolver "2024-01-01 00:00:00" — tomar solo la parte de fecha
                from_date_only = from_date.split(" ")[0].split("T")[0]
                from_hour = _clean(row.get("historical_from_hour")) or "00:00:00"
                # La hora también puede venir como "00:00:00 ..." desde Excel
                from_hour_only = from_hour.split(" ")[0]
                dt_str = f"{from_date_only}T{from_hour_only}"
                try:
                    datetime.fromisoformat(dt_str)
                    historization_from = dt_str
                except ValueError:
                    warnings.append(
                        f"[tag] fila {i + 2}: fecha de historización '{dt_str}' no válida — se ignorará"
                    )

            tags.append({
                "tagname":           tagname,
                "description":       _clean(row.get("description")),
                "category":          parsed_cat,
                "system":            system_name,
                "subsystem":         _clean(row.get("subsystem")),
                "historizationFrom": historization_from,
            })
    else:
        warnings.append("Hoja 'tag' no encontrada en el archivo")

    return {
        "systems":    {"count": len(systems),    "rows": systems},
        "subsystems": {"count": len(subsystems), "rows": subsystems},
        "tags":       {"count": len(tags),       "rows": tags},
        "warnings":   warnings,
    }