# PHD Metadata Validation for RC3

## Initial Mode
Start with:
- `PHD_METADATA_MODE=disabled`

## Browse Connectivity Validation
1. Ensure `ODBC_API_URL` points to approved Windows bridge DNS/IP.
2. Validate browse endpoint connectivity through app flows using dry-run imports only.
3. Keep `dryRun=true` for validation in this stage.

## Enabling Required Mode
After successful browse checks:
1. Set `PHD_METADATA_MODE=required` in `.env`.
2. Restart app services:
   - `docker compose --env-file .env -f compose/docker-compose.v040-standalone.yml up -d --no-build app-backend python-app`
3. Re-run dry-run validation import and check metadata summary fields.

## Safety
- Do not run production import with `dryRun=false` during RC validation.
- Do not expose secrets in logs.
