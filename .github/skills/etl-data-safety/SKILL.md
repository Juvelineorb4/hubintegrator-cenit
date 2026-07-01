---
name: etl-data-safety
description: Review or implement ETL changes without corrupting historical data, watermarks, batches, timestamps, or PostgreSQL partitions. Use for python-etl, tag_value, scheduler, backfill, incremental loading, or performance changes.
argument-hint: "[ETL or database change]"
disable-model-invocation: true
---

# ETL data safety

## Non-negotiable behavior

- Preserve per-tag watermark state.
- Preserve separate HISTORICAL and INCREMENTAL flows.
- Preserve idempotent writes and duplicate protection.
- Use grouped historian requests and bulk database writes.
- Isolate failures so one tag or group does not block unrelated work.
- Never advance a watermark for data that was not safely persisted.
- Never delete or recreate production data as part of normal deployment.

## Review procedure

1. Trace the full path: scheduler → tag state → ODBC request → transform → insert → watermark update.
2. Define transaction boundaries and failure behavior.
3. Check empty responses, partial responses, duplicates, invalid values, and confidence rules.
4. Check timestamp parsing, historian timezone, UTC storage, and daylight-saving assumptions.
5. Verify monthly partition coverage before loading the requested period.
6. Assess batch size, memory use, HTTP payload size, and database write method.
7. Add tests for:
   - restart after failure
   - duplicate replay
   - partial tag failure
   - historical-to-incremental transition
   - empty historian window
   - missing partition
8. Provide a safe rollback that does not destroy valid data.

## Required output

- Invariants protected
- Failure scenarios
- Test plan
- Performance impact
- Data rollback or recovery procedure
