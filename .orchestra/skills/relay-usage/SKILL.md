---
name: relay-usage
description: How workflows are used in the app — running one through Maestro's chat (Run, Use in chat), releasing a paused run, the templates and which ones can run, and what the receipt shows
---

# Relay workflows usage

For anyone using or guiding someone through the Workflows page. The user guides are `docs/guides/workflows.md` and, for hooks, `docs/guides/hooks.md`. New users start at `docs/guides/getting-started.md`. Code: `packages/app-shell/src/orchestra/relay/`.

## Running a workflow

- The app never starts a run. Run (library row, editor head) and Use in chat open a draft chat in the project. The prompt names the workflow and its id: `Run workflow “<name>” (workflow id: <id>) for: `. The user adds the goal and sends it. Maestro starts the run.
- Only the published version runs. A workflow that is not published shows Run off with "Publish before running". A profile whose Relay tools are not available shows Run off with the tools reason.
- To tell a user how to run a workflow, point them at the chat, not at a button that starts a run.
- The upstream seat (`archie`) drafts workflows on request with `archie_draft_workflow` (`modules/maestro/coordination/src/v2/tools/workflow-draft.ts`), guided by its shipped `archie-workflow` skill. The tool lints the sprint, projects and compiles it and saves it unpublished in the calling Session's project, as the editor saves a draft. It refuses the global project (a folder outside git). Only the owner publishes.

## Editing

- The editor opens in List (`plan.tsx` for workflows, `rule-view.tsx` for hooks); Canvas is the same flow drawn as a graph. Both edit one `Flow`, so a change in one shows in the other.
- Workflow list: a collapsible Start card (goal, retries), then the steps in chain order with phases drawn as boxes. **+** between steps opens the step picker. Arrows call `moveStep` (`insert.ts`), which first crosses a phase edge and only then swaps places, so phases stay unbroken.
- Phases render as `.wf-plan-phase` blocks with a kicker, step count and the first line of their instructions (`NodeGroup.description`, compiled to the sprint macro's `instructions`).
- Checks: **Add check** opens presets (`PRESETS` in `checks.tsx`). Presets start with an empty command plus a `<datalist>` of common commands; never seed a preset with `${test_cmd}`-style params, since `expandParams` leaves an unset name literal and the check fails. New ids come from `checkID(flow, node, preset)`.
- Context: an Inject step is Text or File (`file` wins in the sprint, so choosing Text clears it). Execute and review steps list the Inject steps right before them and add new ones with `addNode` anchored on the predecessor, in the step's phase. The native picker is `platform.openAttachmentPickerDialog` with `extensions: []`; the path is stored relative to the project `directory`, and a file outside it is refused.
- A Provide context card is summed up by its file or the first line of its text, not by instructions.
- Tools: an execute or review step stores `tools` as JSON `{ mcp?, bash? }` (`readTools` in `graph.ts`). A missing family keeps the agent's own; a present list allows only what it names, and `[]` allows none. The server list comes from `mcp.list` for the project. Enforcement is in the V2 runner (`workflowStepTools` in `packages/core/src/session/runner/llm.ts`): denied MCP tools are hidden and refused, and bash runs only commands matching a pattern, on top of the agent's own permission rules. A Claude Code engine's own MCP servers are not covered; its Bash is.
- Typing must never lose focus. Two traps caused it: a `<For>` keyed by node object (every edit makes new nodes, so `plan.tsx` keys cards and phases by id), and reading `.data` of a solid-query with no data, which suspends the shell's `<Suspense>` and redraws the page. Options of `viewed`, `frozen` and `decisions` change on every 10-second runs poll, so the editor reads every query as `query.isSuccess ? query.data : fallback`.
- Loading: the Relay source (`relay/source.ts`) starts documents, node types, runs and installs together and never chains one on another; `supported` comes from the documents alone. Runs share the `runs` query key with the sidebar's `useAwaitingRuns` (30 s poll) only when both watch the same directory (the sidebar uses the project's worktree, the chapter its own), so the chapter polls every 10 s while the runs tab is on screen and every 60 s otherwise. Keep any new read independent the same way, and read each one as `query.isSuccess ? query.data : fallback`: a direct `.data` read of a pending query can hold the route until the data arrives.
- Studio (`studio.tsx`): the workflow List is three columns, `Outline` | plan | `Inspector`, inside `StudioScope` (`editor.tsx`), which exists only for workflows outside a history view. Without it both columns and Test now are absent and the plan still works.
- `StudioScope` debounces the draft 400 ms and calls `relay.document.preview`, which compiles the unsaved fields with the run compiler and returns the sprint, refusal, skill bindings, lint findings (`wp` is the step id or null) and `judge` (`stub` or `api`). Agent receives renders that sprint; never rebuild the prompt client-side.
- Lint titles come from `orchestra.workflows.lint.<category>` for the categories in `LINT`; an unknown category falls back to its detail. Only `advisory-only` has a one-click fix (AI checks become blocking); other findings open the step.
- Project commands: `relay.document.commands` runs `RelayCommands.detect` (`packages/core/src/relay-commands.ts`), which only reads manifests in the project root, plus `trusted`. Test now calls `relay.document.trial`: trusted projects only, run through `Process`, 60 s cap, output tail. It is an authoring preview, not a run; nothing is recorded.
- Batch-added checks (pytest per file) get suffixed ids, since `newID` only sees the saved flow.
- Keyboard: `plan.tsx` owns N, ⌥↑↓ and ⌘D on its own window listener (the frame's listener ignores them off the canvas) and registers `relay.plan` palette commands. All skip typing targets, read-only and open modals. Finder drops use `platform.getPathForFile`; a file outside the project is refused with a toast.
- Hook list: When / If / Then. `readRule` (`rule.ts`) reads the graph as one rule (cases of conditions, then actions) and returns nothing when the wiring does not fit; the list then points the user to the canvas. `writeRule` writes the rule back as rows of nodes. Block and Require repair stay last.

## Releasing a paused run

- A run in the `parked` state (a step waiting for a human) shows "Waiting for you at <step>" in its receipt, with **Release in chat**. That button opens the session of the paused step, where Maestro releases it.
- If the step has no recorded session, there is no button. Say so, and ask the user to raise the run with Maestro in a new chat, naming the run.
- External runs (Relay for LangGraph) get no release button.

## Templates

- Templates are the shipped profiles: `bugfix`, `safe-refactor`, `feature-launch`, `tdd_feature` and `wp-execute` can run; `design`, `planning`, `research-v2` and `spec-decompose` can be read and edited but cannot run yet. Unavailable ones show their reason on the card.
- Saving a user workflow as a template is not supported. The profile seeding is server-side, and `runnable` refuses unknown profile marks.

## Failed runs

- The receipt shows the step that stopped the run and the reason, the failing checks and their recorded output. The next step is to open the step in the editor, fix it, publish, and run again through Maestro.
- Rerun, cancel and release are Maestro's, from the chat. The app has no button for them.

## Checking the UI copy

- Run labels come from `orchestra.workflows.row.*` and `orchestra.workflows.editor.run`. Prompts come from `orchestra.workflows.run.prompt` and `orchestra.workflows.useInChat.prompt`. Tests: `chat.test.ts` and `templates.test.ts` in the relay folder.

## Hooks

- Hooks are a different feature from workflows: a hook watches one agent event and blocks, asks, reminds or records. It does not plan or gate a run. Workflows are what Maestro runs.
- A hook goes draft, published, installed. The list row has **Publish and install**. The editor publishes first, then the install switch turns on. Publishing again does not change an installed copy until it is updated.
- The four templates are Protect generated files, Ask before risky commands, Check at session stop and Remind on every edit. Check at session stop only records and starts with `bun typecheck`; tell users to change it. Gating a finish needs a workflow.
- Scope is the whole project. Hooks cannot be imported. Activity does not store shell command or prompt text.
- Copy: `packages/app-shell/src/i18n/orchestra-chapters/hooks.ts`. Templates: `orchestra/relay/presets.ts`.
