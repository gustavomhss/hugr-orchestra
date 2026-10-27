# Hooks

A hook is a rule that watches one thing an agent does and answers. It can block the action, ask you first, remind the agent, or run a check and record the result. A hook does not plan work. For a multi-step plan that Maestro follows, use [Workflows](workflows.md).

## Where they live

Open **Hooks** in the sidebar's More group. The page has two tabs:

- **Hooks**: your library, with one row per hook.
- **Activity**: one row per action a hook took in this project, with filters by hook and result. Shell command and prompt text is not stored, so those rows say so.

A hook applies to every agent session in the project and its other checkouts. In a folder that is not a git repository, installed hooks apply to every such folder, and the page warns you.

## Draft, publish, install

A hook has three states.

1. **Draft.** You edit it. Autosave keeps it.
2. **Published.** This version is ready to install. Publishing alone changes nothing for agents.
3. **Installed.** Agents in the project use it from now on.

In the list, **Publish and install** does both in one click. In the editor, publish first, then turn the install switch on. The switch is off until the hook is published. Publishing again does not change an installed copy until you update it, so the row shows an **Update** button when the installed copy is older.

Installed hooks are checked from top to bottom, and the first one that blocks a call ends it. **Order** sets that order.

## Your first hook

1. Open **Hooks** and choose **New hook**.
2. Pick **Protect generated files**. It refuses edits, overwrites and shell commands under `src/generated/**` and tells the agent how to regenerate.
3. Change the path in the **Path matches** condition to a folder you want to protect. Edit the message the agent will read.
4. Choose **Test**. The dialog runs sample calls so you can see what the hook would answer.
5. Choose **Publish and install**.
6. Ask an agent to edit a file in that folder. The attempt is refused, and **Activity** shows a row for it.

## Templates

| Template | What it does |
| --- | --- |
| Protect generated files | Blocks edits and shell commands under a generated path |
| Ask before risky commands | Pauses push and recursive-delete commands until a human approves |
| Check at session stop | Runs a check when an agent stops and records whether it passed. It cannot send the agent back |
| Remind on every edit | Adds a short note to the result of each edit |

**Check at session stop** starts with `bun typecheck` as its check. Change it to your project's own command. A stop hook only records. To keep an agent from finishing while checks fail, use a workflow.

## Limits

- Scope is the whole project. You cannot limit a hook to one agent or one path.
- Hooks cannot be imported yet. The workflow import refuses a hook file. Create hooks from the Hooks page.
- If the hooks file is damaged, the page offers **Back up and reset**.
