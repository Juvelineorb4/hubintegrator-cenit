# Migrations Bundle

This folder contains SQL artifacts executed by `db-init`.

Execution order:
1. `0000_tan_power_pack.sql`
2. `0001_red_hawkeye.sql`
3. `verify-phd-schema.sql`

`db-init` fails fast when verification detects missing schema invariants.
