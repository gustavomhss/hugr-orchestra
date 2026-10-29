# Getting started

This is the path for your first five minutes. Each step links the guide with the detail.

## 1. Install and open

Download the desktop app from the GitHub Releases page, or install the command line with `npm install -g @humanguardrail/cli`. The repository README lists the file for each system and explains the prompt an unsigned build can show on first launch.

Open the app. If it cannot start, see [Desktop startup errors](desktop-startup.md).

## 2. First run

Getting started takes three steps.

1. **Pick a folder.** This is the project Maestro works in. Choosing it also trusts it, so the MCP servers, plugins, formatters and language servers the folder declares can start. Trust only folders you wrote or reviewed.
2. **Connect a model.** In Providers, use your Claude subscription, or connect a provider with an API key.
3. **Ask for something.** Home is now the project's dashboard. Press "Start a session" on Home, or open Chat in the sidebar, and type a task.

Details: [First run](first-run.md). To approve or revoke a folder later, see [Project trust](mcp-project-trust.md).

## 3. Your first chat with Maestro

Press send. A chat opens with Maestro in your project. Maestro plans the work and hands steps to other agents.

- When Maestro needs a permission, a dock above the composer says what it asks. Allow it, reject it, or press Stop. Stop works while a request is waiting. See [Permission and question requests](session-requests.md) and [Permissions and saved rules](permissions.md).
- To change how hard the model thinks, pick a reasoning level beside the model in the composer. The list shows only the levels that model accepts; models without levels show no picker.
- To return to a chat, open **Chat** in the sidebar.

## 4. Watch the work on Projects

**Projects** in the sidebar is the board. It shows what Maestro is building, stage by stage. Only Maestro moves cards, so ask Maestro in a chat to plan a project and it appears there. The board is read only.

## 5. Look at Actions

**Actions** shows what must pass before work counts as done, and the results. Open it to see why something stopped.

## Where the rest is

The sidebar keeps Home, Chat, Projects, Agents and Actions in view. Everything else is in the **More** group. Click it to open or close it.

- **Workflows**: write a plan once and have Maestro run it. See [Workflows](workflows.md).
- **Hooks**: rules that watch what agents do. See [Hooks](hooks.md).
- **MCP**: connect tools to your project. See [Project trust](mcp-project-trust.md) and [MCP and CLI failures](mcp-and-cli-failures.md).
- **Settings**: Providers, Models, Permissions and Trusted projects. See [Settings](settings.md).
- **Context savings**: how much context Orchestra saved you.
- **Atlas**: the project's knowledge, with a **History** view of how it changed.

You can open this guide from the command palette (⌘K): search for "help" or "Getting started guide".

## On the command line

`orchestra run` does one task without opening the app. If it needs a permission and nobody can answer, it rejects the request, prints a warning that names `--auto`, and exits non-zero. Pass `--auto` to allow it. `orchestra run --continue` with no earlier session warns on stderr, then starts a new one. See [MCP and CLI failures](mcp-and-cli-failures.md).

## When something goes wrong

Start from [App error messages](app-error-messages.md), [Config errors](config-errors.md) and [Credentials](credentials.md).
