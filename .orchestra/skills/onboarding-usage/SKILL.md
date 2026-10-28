---
name: onboarding-usage
description: How a person gets from first launch to their first Maestro chat - choosing and trusting a folder, connecting Claude mode or an API key in Providers, Home as the KPI dashboard, and returning to the task after setup
---

# Onboarding usage

For anyone driving or explaining the first run. The user guide is `docs/guides/first-run.md`; trust details are in `docs/guides/mcp-project-trust.md`. The five-minute overview, which links every per-area guide, is `docs/guides/getting-started.md`. Keep it in step with this skill.

## The path

1. Home with no project shows "Pick the folder Maestro works in". Choosing a folder trusts it and adds it as a project in one step. Nothing is created on disk without that choice.
2. With a project, Home is that project's KPI dashboard, from the first launch on (owner, 2026-10-27: Home is never a second chat screen). A new chat starts from "Start a session" or the Chat entry.
3. A model is connected in Providers: Claude subscription (Claude mode) or a provider with an API key.

## Claude mode

- Signed in already: choosing Claude mode switches Maestro's engine, shows a "Claude mode is on" toast and stays on the current task. The Connect provider row shows a spinner while the account is read.
- After any engine change (`updateConfig`), `server-sync.tsx` drops the cached agent list and re-bootstraps open directories. Without that, model selection keeps the old engine and the picker stays empty until a reload.
- Signed out: the Providers page opens at the Claude section. The engine switches only after sign-in succeeds, then the page returns to the task that started it.
- If the status check fails, the section says it could not check sign-in and offers Retry. It never reports "Not connected" for a failed check.
- The engine select lists Claude Code only while the account is signed in.

## Where Providers is

The sidebar does not list Providers. Use the "Open Providers" link on the folder step, or Settings. A "Back to your task" button shows when Providers was opened from a task.

## After the first chat

- The sidebar shows Home, Chat, Projects (the board), Agents and Actions. Everything else is in the collapsible More group.
- Screen words: Context savings (not Lean), History (not Genesis), project (not profile). Use them when you explain the app.
- Stop works while a permission or question is pending. The permission dock says what is asked.
- The command palette has a "Getting started guide" entry that opens `docs/guides/getting-started.md`. The URL is `GETTING_STARTED_URL` in `orchestra/shell/navigation-commands.tsx`; change it there if the repository moves.

## Checking it by hand

- Clear the first-launch state, then launch with no project: expect the folder step, not a Default Project.
- Pick a folder: the folder is trusted before it appears as a project. A refused trust shows an error and adds nothing.
- Choose Claude mode while signed out: the engine in Providers stays on Orchestra until the sign-in finishes.
- Choose Claude mode while signed in, then open Chat without reloading: the composer shows a Claude model and the picker lists the Anthropic models.

Ownership and invariants: the folder step lives in `packages/app-shell/src/orchestra/chapters/home-start.tsx`, Home itself in `kpis-home.tsx`, and the Claude mode handoff in `claude-mode-entry.ts`.
