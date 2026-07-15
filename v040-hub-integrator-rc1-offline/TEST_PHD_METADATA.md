# TEST PHD Metadata (RC1)

## Required env
```env
PHD_METADATA_MODE=required
PHD_METADATA_CONCURRENCY=5
PHD_METADATA_MAX_TAGS=1000
ODBC_API_URL=http://IP_WINDOWS_ODBC:1234
ODBC_CONNECT_TIMEOUT_SECONDS=10
ODBC_READ_TIMEOUT_SECONDS=120
```

## 1) Validate a known tag browse response
Use a known tag from the real PHD:
```bash
curl -fsS "$ODBC_API_URL/tags/<KNOWN_TAG>/browse"
```
Confirm JSON structure and available fields (case-insensitive accepted by backend):
- TAGNAME
- TAGNO
- UNITS/UNIT
- DATA_TYPE_NAME
- ASSET_NAME
- DESCRIPTION

## 2) Execute catalog import dry-run only
```bash
curl -fsS -X POST "http://localhost:3000/api/phd/import?dryRun=true" \
  -F "file=@/path/to/catalog.xlsx"
```

## 3) Validate dry-run response counters
Review `phdMetadata` block:
- `tagsRequested`
- `tagsFound`
- `tagsNotFound`
- `partial`
- `fieldsNull.phdTagno`
- `fieldsNull.phdUnit`
- `fieldsNull.phdDataTypeName`
- `fieldsNull.phdAssetName`
- `fieldsNull.phdDescription`
- `warnings`

## Stop condition
Stop after step 3.
Do not run `dryRun=false` in RC1 validation.
