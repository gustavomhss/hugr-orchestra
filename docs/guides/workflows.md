# Workflows

New to Orchestra? Start with [Getting started](getting-started.md).

A workflow is a plan that Maestro follows step by step. An agent does each step, and the checks you define decide when a step passes and the next one may start. You author workflows in the **Workflows** page. Maestro starts and runs them.

## Maestro runs workflows

The app never starts a run itself. Run and Use in chat open a Maestro chat with the workflow named in the prompt. You finish the sentence and send it, and Maestro starts the run from there.

- Only the **published** version can run. Publishing does not start anything. A run that is already going finishes on the version it started with.
- Drafts with unpublished changes are not used. The editor shows "Unpublished changes" until you publish.

## Your first workflow

1. Open **Workflows** and choose **New workflow**. Pick a template, or start from scratch.
2. Edit the steps in the editor. It opens in **List**: the steps top to bottom, each a card you open to edit in place. Click **+** between two steps to add one there, and pick what it does: an agent step, a review or a checkpoint. Use the arrows on a step to move it, and the Phase field to group it with its neighbours. Autosave keeps your draft.
3. Fix anything listed under the issues count in the editor head. Publish when the count is clear.
4. Click **Run** in the editor head or on the row. A chat opens with "Run workflow …" filled in. Add the goal after "for:" and send it.
5. Watch the run in **Executions**, or in the chat.

Use **Use in chat** instead of Run when you want to ask Maestro for something that uses the workflow, not a plain run. It fills in "Use the published workflow …" the same way.

## Ask Maestro to draft one

You can also describe the workflow you want in a Maestro chat, for example "make me a workflow that writes release notes and checks them". Maestro hands it to the planning seat, which designs the steps and their checks and saves the result as a draft in **Workflows**. A drafted workflow is never published or run for you: open it, review the steps, then publish it yourself. Drafting needs a project inside a git repository.

## List and canvas

The editor has two views of the same workflow, switched at the top right. **List** is the plan as you read it: the **Goal and settings** card at the top holds the goal every step sees and the retries; it is not a step. Below it come the steps in order. **Canvas** draws the same steps as nodes and wires, for when you want to see the shape or drag steps around. A change in one view shows in the other. The editor opens in the view you used last.

In List the editor has three columns. On the left, **Steps** lists every step in order, with phases as rails. Click one to open it, drag one to move it, or drop a file from Finder on the editor to attach it as context to the open step. In the middle is the step you are editing. On the right, the inspector has two tabs:

- **Agent receives** shows what the open step's agent gets at run time: its phase instructions, the context right before it, its instructions (and whether a skill replaces or adds to them), its self-check and its checks. It is built by the same compiler a run uses, so what you see is what the agent gets.
- **Ready to publish** lists what stands between the draft and publishing: whether it compiles, any errors, steps without a check, and whether the AI judge is set up. Each problem names its step; **Fix** repairs it in one click where there is one obvious fix, and **Show** opens the step otherwise. An AI check alone does not gate a step: the list asks for at least one command check on every work step.

Shortcuts: **N** adds a step after the open one, **⌥↑** and **⌥↓** move the open step, **⌘D** duplicates it, and **⌘K** finds a step or adds one by kind. They do nothing while you type in a field.

## Phases, checks and context

- **Phases.** A phase is a block of steps with one set of instructions. Every step inside it follows them, on top of its own. Group a step with the group button on its card, name the phase in its header, and click the line under the name to write its instructions.
- **Checks.** Click **Add check** on a step and pick what it should prove: run the tests, lint or typecheck, an AI review of the changes, an AI check you describe in words, or any command. Command checks suggest common commands as you type, starting with the ones your project declares. **Suggested for this project** shows the test, lint, typecheck and format commands found in `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` or the `Makefile`; click one to add it as a check. A Python project with several test files also gets **One check per test file**, which adds a `pytest -q <file>` check for each. A command passes when it exits 0. **Test now** runs the command once in the project, for up to 60 seconds, and shows whether it passed, how long it took and its output; it needs a trusted project and a command with no `${...}` parameters left. An AI check warns you when the AI judge is not set up (`relay.judge`), because a run would not really judge it. **More options** holds the plain-words note on what the check proves.
- **Context.** Context is not a step: it is part of the step that receives it. An agent or review step shows its **Context**, the text and files the agent receives with it. Click **Text** to write a note, or **File** to pick a file from the project folder, and edit or remove each one in place. Moving the step moves its context with it. A file must be inside the project, and its path is kept relative to it.
- **Skill.** A step can load one skill, on top of its instructions or in their place. The list offers the skills the Skills chapter shows, grouped as Project, Global and Built-in, and shows the description of the one you pick. Skills only Orchestra's own agents use (`internal: true`) are not offered; a step that already names one keeps it.
- **Tools.** An agent or review step can limit the tools its agent uses. **MCP servers** stays on **Agent's servers** by default; choose **Only these** and switch on the servers the project configures that the step may use. With none on, the step uses no MCP server. **Commands** works the same way for bash: under **Only these**, write one command per line, where `*` matches anything (`git *`, `bun test *`). With no line, the step runs no command. These lists only narrow what the agent may do; its own permissions still apply. **Agent receives** shows a step's tools.

## Templates

Templates are the ready-made workflows that ship with the app. Each has a name and a one-line description in the create dialog.

| Template | What it does | Status |
| --- | --- | --- |
| Fix a bug with proof | A failing test reproduces the bug, a root-cause fix turns it green, a short note explains it | Can run |
| Refactor safely | Writes down the invariants, pins them with tests, refactors, then proves each one still holds | Can run |
| Launch a feature end to end | Six phases and fifteen steps, from exploring the code to a pull request, with every acceptance criterion traced from spec to test to review | Can run |
| Test-driven feature | Builds a feature test first, then the code that passes it | Can run |
| Build one work package | Builds one work package test first, and marks it done only when its checks pass | Can run |
| Design a product from an idea | Turns a raw idea into a ratified product design | Can be read and edited, cannot run yet |
| Plan from a frozen spec | Turns an approved spec into an ordered plan of work packages | Can be read and edited, cannot run yet |
| Research a question | Weighs competing explanations and sources | Can be read and edited, cannot run yet |
| Break a spec into work packages | Splits a frozen intent into work packages | Can be read and edited, cannot run yet |

The three example workflows (bugfix, safe refactor, feature launch) name their commands and paths as parameters: `test_cmd`, `lint_cmd`, `src_path`, `test_path`, `docs_path`, `notes_dir` and `base_ref`. Maestro lists them when it plans a run and asks you for any value it cannot read from the project. Their judges read the diff of each step, so a fix that only hides a symptom, a refactor that edits a pinned test or a test that asserts the bug does not pass.

A copy of a template starts with its context step empty, since what a template ships there is only a sample. In **Launch a feature end to end** that step is **The feature request**: write what to build there before you publish.

A template that cannot run shows its reason on the card ("This profile checks its work with Relay tools that are not available yet…"). You can open it and read it, but you cannot pick it for a new workflow. Run is off for it too.

Saving your own workflow as a template is not available yet. Your workflows stay in the library, and you can duplicate them.

## When a run is waiting for you

A run that stops at a step where its checks failed, or that needs a decision from you, shows **Waiting for you at <step>** in its receipt. Only Maestro can release it. Click **Release in chat** to open the session of the paused step, then tell Maestro in that chat what to do.

If the receipt shows no **Release in chat** button, the step has no recorded session. The status is still correct. Ask Maestro about the run in a new chat, and give it the run's name.

A failed run shows the step that stopped it and the reason. Open the step in the editor to change its instructions or checks, publish again, and run the workflow again.

## Terms

- **Step**: one unit of work that an agent does.
- **Check**: a command or review that must pass before the step is done. The check output is kept in the run's receipt.
- **Phase**: a run of neighbouring steps that share instructions. The list draws it as a box around them, and the receipt groups them.
- **Retry budget**: how many times a failed step may be tried again before the run waits for you. A failed command check does not stop the agent: it works the same step again and sees the end of the failing output (at most 4 KiB per check, with parameter values of 8 or more characters hidden). A failed code review is held for Maestro.

## Limits

- Human approval steps cannot run yet. Remove them before you publish.
- Hooks are a different feature. A hook records what happens in a session and can ask before a command. A workflow is what gates a run. See [Hooks](hooks.md).
- Runs are read in the app. Release, rerun and cancel happen in Maestro's chat.
- A step's MCP list does not reach the MCP servers that a Claude Code engine brings on its own. Its bash commands are limited.
