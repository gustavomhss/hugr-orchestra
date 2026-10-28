# Workflows

New to Orchestra? Start with [Getting started](getting-started.md).

A workflow is a plan that Maestro follows step by step. An agent does each step, and the checks you define decide when a step passes and the next one may start. You author workflows in the **Workflows** page. Maestro starts and runs them.

## Maestro runs workflows

The app never starts a run itself. Run and Use in chat open a Maestro chat with the workflow named in the prompt. You finish the sentence and send it, and Maestro starts the run from there.

- Only the **published** version can run. Publishing does not start anything. A run that is already going finishes on the version it started with.
- Drafts with unpublished changes are not used. The editor shows "Unpublished changes" until you publish.

## Your first workflow

1. Open **Workflows** and choose **New workflow**. Pick a template, or start from scratch.
2. Edit the steps in the editor. It opens in **List**: the steps top to bottom, each a card you open to edit in place. Click **+** between two steps to add one there, and pick what it does: an agent step, context, a review or a checkpoint. Use the arrows on a step to move it, and the Phase field to group it with its neighbours. Autosave keeps your draft.
3. Fix anything listed under the issues count in the editor head. Publish when the count is clear.
4. Click **Run** in the editor head or on the row. A chat opens with "Run workflow …" filled in. Add the goal after "for:" and send it.
5. Watch the run in **Executions**, or in the chat.

Use **Use in chat** instead of Run when you want to ask Maestro for something that uses the workflow, not a plain run. It fills in "Use the published workflow …" the same way.

## List and canvas

The editor has two views of the same workflow, switched at the top right. **List** is the plan as you read it: the Start card holds the goal every step sees and the retries, then each step in order. **Canvas** draws the same steps as nodes and wires, for when you want to see the shape or drag steps around. A change in one view shows in the other.

## Templates

Templates are the ready-made workflows that ship with the app. Each has a name and a one-line description in the create dialog.

| Template | What it does | Status |
| --- | --- | --- |
| Test-driven feature | Builds a feature test first, then the code that passes it | Can run |
| Build one work package | Builds one work package test first, and marks it done only when its checks pass | Can run |
| Design a product from an idea | Turns a raw idea into a ratified product design | Can be read and edited, cannot run yet |
| Plan from a frozen spec | Turns an approved spec into an ordered plan of work packages | Can be read and edited, cannot run yet |
| Research a question | Weighs competing explanations and sources | Can be read and edited, cannot run yet |
| Break a spec into work packages | Splits a frozen intent into work packages | Can be read and edited, cannot run yet |

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
- **Retry budget**: how many times a failed step may be tried again before the run waits for you.

## Limits

- Human approval steps cannot run yet. Remove them before you publish.
- Hooks are a different feature. A hook records what happens in a session and can ask before a command. A workflow is what gates a run. See [Hooks](hooks.md).
- Runs are read in the app. Release, rerun and cancel happen in Maestro's chat.
