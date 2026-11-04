---
name: claude-code-maintenance
description: Pointer. Use when changing the Claude Code host, its tool gate, the governed-work gate (`maestro-run-governed`) or the account status probe in `modules/engine-adapters/claude-code`; the content lives in `claude-mode-maintenance`
---

# Claude Code host maintenance

Load `claude-mode-maintenance`: it owns the Claude Code host and Claude mode in one place (ownership, tool serving, the governed-work gate, the account status probe, invariants, tests). This name stays because `AGENTS.md` ("Claude Code Host") points here.
