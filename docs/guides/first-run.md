# First run: folder, trust, model

On first launch Orchestra does not create a folder for you. Getting started takes three things, in order.

1. **Pick a folder.** Choose the project folder Maestro works in. Orchestra never creates one for you. If the folder is empty, Orchestra asks whether to make it a git repository.
2. **Trust it.** The same button trusts the folder. Trusting lets Orchestra start the MCP servers, plugins, formatters and language servers that the folder declares in its own config. Trust only folders you wrote or reviewed. The folder is added as a project only after trust is saved.
3. **Connect a model.** In Providers, use your Claude subscription (Claude mode) or connect a provider with an API key. Choosing Claude mode while signed out opens Providers and signs you in first. Maestro switches to Claude Code only after the sign-in succeeds. While Orchestra reads your Claude account the option shows a spinner; when the switch is done a "Claude mode is on" notice appears and the chat's model picker lists the Claude models at once, with no reload.

Once a project is open, Home is its dashboard: sessions, tasks, spend and checks. Start a chat with Maestro from "Start a session" on Home or from Chat in the sidebar.

## Going back to your task

Connecting a model from a task brings you back to that task when setup finishes. Opening Providers from elsewhere shows a "Back to your task" button when there is a task to return to.

## Providers without a project

Providers is always one click away, even with no project open: Home shows an "Open Providers" link on the folder step. The sidebar does not list Providers.

## When something fails

- **Trust could not be saved.** The folder is not added, and the message says so. Choose the folder again.
- **Claude sign-in status could not be checked.** Providers shows "Could not check the Claude sign-in" with a retry button. That is not a sign-out. Retry once the server is running.
- **The engine could not be switched after sign-in.** The message shows the reason, and the engine stays where it was. Choose Claude Code again in Providers.

Trust can be revoked through the server API (`POST /api/trust/revoke`, see [Project trust](mcp-project-trust.md)).
