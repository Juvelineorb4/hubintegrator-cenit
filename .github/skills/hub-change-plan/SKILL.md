---
name: hub-change-plan
description: Analyze and plan a Hub Integrator change before code is edited. Use for features, refactors, migrations, service moves, API changes, database changes, or changes that affect more than one service.
argument-hint: "[describe the requested change]"
disable-model-invocation: true
---

# Hub Integrator change planning

Do not edit files while using this skill.

## Procedure

1. Restate the requested outcome and non-goals.
2. Inspect only the relevant project files.
3. Identify affected components:
   - Linux Docker host
   - Windows `odbc-api`
   - `app-backend`
   - `python-app`
   - `python-etl`
   - PostgreSQL
   - Redis
   - Grafana or clients
4. Identify contracts that may change:
   - HTTP endpoints and payloads
   - environment variables
   - ports and network paths
   - database schema and partitions
   - timestamp and timezone behavior
   - ETL watermark and retry behavior
5. Classify risks as data-loss, availability, security, compatibility, performance, or deployment.
6. Produce an ordered plan with small, reviewable steps.
7. Define acceptance tests and rollback steps.
8. List open questions. Do not invent missing production values.

## Required output

- Objective
- Current behavior
- Files likely affected
- Proposed steps
- Acceptance criteria
- Risks and mitigations
- Rollback
- Open questions
