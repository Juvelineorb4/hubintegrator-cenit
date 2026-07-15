# PHD Metadata Validation (Phase 5C1 in RC2)

## Purpose
Validate metadata enrichment behavior using the existing odbc-api browse endpoint.

## Required Environment
Set in `config/.env.standalone`:
- `PHD_METADATA_MODE=required` for strict validation
- `ODBC_API_URL=http://<approved-windows-bridge>:1234`
- timeouts and concurrency according to environment limits

## Positive Check
1. Start stack with `bash scripts/start-v040.sh`.
2. Send `POST /api/phd/import` with a controlled workbook and `dryRun=true`.
3. Verify response summary contains `phdMetadata` counters and expected warnings/errors.

## Safety Constraints
- Do not execute real production imports with `dryRun=false` during validation.
- Do not require direct internet access.
- Keep UTC timestamp contracts across service boundaries.

## Fallback Mode
For environments without available odbc-api during smoke validation:
- `PHD_METADATA_MODE=disabled`
