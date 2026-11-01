---
name: core-maintenance
description: Rules for keeping packages/core tidy. Use when adding or removing an environment flag in packages/core/src/flag/flag.ts.
---

# Core maintenance

## Flags

- A flag in `packages/core/src/flag/flag.ts` must have a reader. Remove it with its last reader, together with the lines that set it (tests, scripts, docs).
- Read a flag through `Flag`, never `process.env`. A flag a test flips at runtime is a getter, not a load-time constant.
- `ORCHESTRA_AGENT_TERMINAL` and `ORCHESTRA_SHELL_INTEGRATION` are permanent opt-in flags: keep them.
