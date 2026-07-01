---
name: concise-technical-output
description: Produce a compact technical response while preserving commands, risks, validation evidence, and rollback details. Use manually when the user requests a concise answer or wants to reduce output tokens.
argument-hint: "[task or result to summarize]"
---

# Concise technical output

Use a compact structure:

1. Decision or result
2. Files affected
3. Commands or tests
4. Risks
5. Next action

Rules:

- Maximum six main bullets unless safety requires more.
- Use one table only when it improves comparison.
- Do not repeat project background.
- Do not omit destructive-command warnings.
- Do not omit data-loss, security, migration, timezone, or rollback details.
- Clearly distinguish completed work from recommendations.
