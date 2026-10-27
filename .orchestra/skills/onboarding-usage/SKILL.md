---
name: onboarding-usage
description: How a person gets from first launch to their first Maestro chat - choosing and trusting a folder, connecting Claude mode or an API key, the Home composer and when KPIs show, and returning to the task after setup
---

# Onboarding usage

For anyone driving or explaining the first run. The user guide is `docs/guides/first-run.md`; trust details are in `docs/guides/mcp-project-trust.md`.

## The path

1. Home with no project shows "Pick the folder Maestro works in". Choosing a folder trusts it and adds it as a project in one step. Nothing is created on disk without that choice.
2. With a project and no connected model (and not skipped), Home shows "Connect a model to start": Claude subscription, a provider with an API key, or skip.
3. Otherwise Home is the composer ("What should Maestro do?") with three example prompts that fill it. Sending starts a Maestro chat in that project.
4. KPIs appear on Home only after the project has sessions.

## Claude mode

- Signed in already: choosing Claude mode switches Maestro's engine and stays on the current task.
- Signed out: the Providers page opens at the Claude section. The engine switches only after sign-in succeeds, then the page returns to the task that started it.
- If the status check fails, the section says it could not check sign-in and offers Retry. It never reports "Not connected" for a failed check.
- The engine select lists Claude Code only while the account is signed in.

## Where Providers is

The sidebar does not list Providers. Use the "Open Providers" link on the folder and model steps, or Settings. A "Back to your task" button shows when Providers was opened from a task.

## Checking it by hand

- Clear the first-launch state, then launch with no project: expect the folder step, not a Default Project.
- Pick a folder: the folder is trusted before it appears as a project. A refused trust shows an error and adds nothing.
- Choose Claude mode while signed out: the engine in Providers stays on Orchestra until the sign-in finishes.

Ownership and invariants: the Home composer lives in `packages/app-shell/src/orchestra/chapters/home-start.tsx`, its step rules in `home-start-state.ts`, and the Claude mode handoff in `claude-mode-entry.ts`.
