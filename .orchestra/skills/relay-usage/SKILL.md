---
name: relay-usage
description: How workflows are used in the app — running one through Maestro's chat (Run, Use in chat), releasing a paused run, the templates and which ones can run, and what the receipt shows
---

# Relay workflows usage

For anyone using or guiding someone through the Workflows page. The user guide is `docs/guides/workflows.md`. Code: `packages/app-shell/src/orchestra/relay/`.

## Running a workflow

- The app never starts a run. Run (library row, editor head) and Use in chat open a draft chat in the project. The prompt names the workflow and its id: `Run workflow “<name>” (workflow id: <id>) for: `. The user adds the goal and sends it. Maestro starts the run.
- Only the published version runs. A workflow that is not published shows Run off with "Publish before running". A profile whose Relay tools are not available shows Run off with the tools reason.
- To tell a user how to run a workflow, point them at the chat, not at a button that starts a run.

## Releasing a paused run

- A run in the `parked` state (a step waiting for a human) shows "Waiting for you at <step>" in its receipt, with **Release in chat**. That button opens the session of the paused step, where Maestro releases it.
- If the step has no recorded session, there is no button. Say so, and ask the user to raise the run with Maestro in a new chat, naming the run.
- External runs (Relay for LangGraph) get no release button.

## Templates

- Templates are the shipped profiles: `tdd_feature` and `wp-execute` can run; `design`, `planning`, `research-v2` and `spec-decompose` can be read and edited but cannot run yet. Unavailable ones show their reason on the card.
- Saving a user workflow as a template is not supported. The profile seeding is server-side, and `runnable` refuses unknown profile marks.

## Failed runs

- The receipt shows the step that stopped the run and the reason, the failing checks and their recorded output. The next step is to open the step in the editor, fix it, publish, and run again through Maestro.
- Rerun, cancel and release are Maestro's, from the chat. The app has no button for them.

## Checking the UI copy

- Run labels come from `orchestra.workflows.row.*` and `orchestra.workflows.editor.run`. Prompts come from `orchestra.workflows.run.prompt` and `orchestra.workflows.useInChat.prompt`. Tests: `chat.test.ts` and `templates.test.ts` in the relay folder.
