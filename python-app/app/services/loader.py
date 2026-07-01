import os

import httpx

BACKEND  = os.getenv("BACKEND_URL",  "http://app-backend:3000/api")
ODBC_API = os.getenv("ODBC_API_URL", "http://host.docker.internal:1234")

# Mapa de data_type_name del PHD al enum de la DB
PHD_TYPE_MAP = {
    "double":  "DOUBLE",
    "float":   "FLOAT",
    "string":  "STRING",
    "boolean": "BOOLEAN",
    "binary":  "BINARY",
    "integer": "INTEGER",
}


async def load_excel(parsed: dict) -> dict:
    results = {"systems": [], "subsystems": [], "tags": [], "errors": []}

    async with httpx.AsyncClient(timeout=30) as client:

        # ── 1. Systems ─────────────────────────────────────────────────────
        system_cache: dict[str, str] = {}   # name → id

        for row in parsed["systems"]["rows"]:
            row["description"] = row.get("description") or row["name"]
            try:
                r = await client.post(f"{BACKEND}/systems", json=row)
                r.raise_for_status()
                sys_id = r.json()["data"]["id"]
                system_cache[row["name"]] = sys_id
                results["systems"].append({"name": row["name"], "id": sys_id})
            except Exception as e:
                results["errors"].append(f"[system] {row.get('name')}: {e}")

            
        

        # ── 2. Subsystems ──────────────────────────────────────────────────
        sub_cache: dict[str, str] = {}      # nomenclature → id

        for row in parsed["subsystems"]["rows"]:
            row["description"] = row.get("description") or row["name"]
            system_names: list[str] = row.pop("systems", [])
            try:
                r = await client.post(f"{BACKEND}/sub-systems", json=row)
                r.raise_for_status()
                sub_id = r.json()["data"]["id"]
                sub_cache[row["nomenclature"]] = sub_id
                results["subsystems"].append({"nomenclature": row["nomenclature"], "id": sub_id})

                # Crear relaciones con sistemas
                for sys_name in system_names:
                    sys_id = system_cache.get(sys_name)
                    if not sys_id:
                        lr = await client.get(f"{BACKEND}/systems/by-name/{sys_name}")
                        if lr.status_code == 200:
                            sys_id = lr.json()["data"]["id"]
                            system_cache[sys_name] = sys_id
                    if sys_id:
                        await client.post(
                            f"{BACKEND}/sub-systems/relations",
                            json={"systemId": sys_id, "subSystemId": sub_id},
                        )
                    else:
                        results["errors"].append(
                            f"[subsystem-relation] system '{sys_name}' no encontrado para subsistema '{row['nomenclature']}'"
                        )
            except Exception as e:
                results["errors"].append(f"[subsystem] {row.get('nomenclature')}: {e}")
        

        # ── 3. Tags ────────────────────────────────────────────────────────
        for row in parsed["tags"]["rows"]:
            tagname    = row["tagname"]
            sys_name   = row.pop("system", None)
            sub_nomenc = row.pop("subsystem", None)

            # Resolver system_id
            sys_id = system_cache.get(sys_name) if sys_name else None
            if not sys_id and sys_name:
                lr = await client.get(f"{BACKEND}/systems/by-name/{sys_name}")
                if lr.status_code == 200:
                    sys_id = lr.json()["data"]["id"]
                    system_cache[sys_name] = sys_id

            if not sys_id:
                results["errors"].append(
                    f"[tag] {tagname}: system '{sys_name}' no encontrado — omitido"
                )
                continue

            # Resolver sub_system_id
            sub_id = sub_cache.get(sub_nomenc) if sub_nomenc else None
            if not sub_id and sub_nomenc:
                lr = await client.get(f"{BACKEND}/sub-systems/by-nomenclature/{sub_nomenc}")
                if lr.status_code == 200:
                    sub_id = lr.json()["data"]["id"]
                    sub_cache[sub_nomenc] = sub_id

            # Enriquecer desde ODBC API (browse)
            phd: dict = {}
            try:
                print(f"{ODBC_API}/tags/{tagname}/browse")
                br = await client.get(f"{ODBC_API}/tags/{tagname}/browse")
                if br.status_code == 200 and br.json():
                    b = br.json()[0]
                    print(b)
                    raw_type = (b.get("DATA_TYPE_NAME") or "").strip().lower()
                    tagno = b.get("TAGNO")
                    phd = {
                        "phdTagno":        str(tagno) if tagno is not None else tagname,
                        "phdUnit":         b.get("UNITS"),
                        "phdDataTypeName": PHD_TYPE_MAP.get(raw_type, "DOUBLE"),
                        "phdAssetName":    b.get("ASSET_NAME"),
                        "phdDescription":  b.get("DESCRIPTION"),
                    }
                else:
                    results["errors"].append(
                        f"[tag] {tagname}: browse no retornó datos — usando defaults"
                    )
                    phd = {"phdTagno": tagname, "phdDataTypeName": "DOUBLE"}
            except Exception as e:
                results["errors"].append(f"[tag] {tagname}: error browse ODBC — {e}")
                phd = {"phdTagno": tagname, "phdDataTypeName": "DOUBLE"}

            payload = {**row, **phd, "systemId": sys_id, "subSystemId": sub_id}
            if not payload.get("description"):
                payload["description"] = phd.get("phdDescription")
            try:
                r = await client.post(f"{BACKEND}/tags", json=payload)
                r.raise_for_status()
                results["tags"].append({"tagname": tagname, "id": r.json()["data"]["id"]})
            except Exception as e:
                results["errors"].append(f"[tag] {tagname}: error al guardar — {e}")

    return results
