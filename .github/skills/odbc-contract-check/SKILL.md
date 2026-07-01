---
name: odbc-contract-check
description: Validate the HTTP contract and network integration between the native Windows PHD ODBC bridge and Linux Docker services. Use when changing ODBC endpoints, request parameters, response fields, authentication, timeouts, or connectivity.
argument-hint: "[endpoint, connectivity, or contract change]"
disable-model-invocation: true
---

# Windows ODBC bridge contract check

## Preserve the boundary

- `odbc-api` is a native Windows Node.js service.
- PHD ODBC SQL and driver logic stay inside `odbc-api`.
- Linux services consume the bridge only through its documented HTTP API.
- Never expose ODBC credentials to Linux consumers.

## Review checklist

1. Identify all callers and the endpoint they use.
2. Document request parameters, date formats, response fields, and error responses.
3. Verify PHD column-case handling and supported data types.
4. Verify timezones at:
   - request creation
   - Windows/PHD interpretation
   - returned timestamps
   - PostgreSQL persistence
5. Require explicit connect, read, and total timeouts.
6. Define retry behavior only for safe and transient failures.
7. Add a `/health` or equivalent dependency check that does not query large historian ranges.
8. Protect production access with network allow-listing and an approved authentication mechanism.
9. Ensure logs omit credentials and avoid logging excessive process data.
10. Keep local-file and ODBC implementations compatible where the same endpoint is supported.

## Required output

- Contract before and after
- Compatibility assessment
- Network and security requirements
- Test cases using local mode and real ODBC mode
- Rollback path
