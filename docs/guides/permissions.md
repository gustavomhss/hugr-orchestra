# Permissions

Agents ask before they run a command or read, write or fetch something outside what they may already do. The request appears as a dock above the composer.

## Reading a request

The dock shows:

- **Asked by**: the agent that wants to act. A subagent's request names the subagent.
- **The tool**: what kind of action it is (Bash, Read, Edit and so on) and a short description.
- **Requested**: the exact command, path or URL. Read this before you answer. It is what will run.

## Your answer

- **Deny** refuses this one request. The agent may try another route.
- **Allow once** lets this one request run. The next one asks again.
- **Always allow in this project** lets matching requests run without asking again in this project. The dock says what it covers:
  - "every Read request" means every request of that tool in this project.
  - "only this Bash request" means only that exact command or path. Similar requests still ask.
- **Stop** ends the whole run, not just this request. Every open permission and question of the session is rejected. See [Permission and question requests](session-requests.md).

Permissions are saved per project. Allowing something always in one project does not allow it in another.

## Auto-accept in one session

The composer's **Ask** button switches the session to **Auto-accept**. While it reads Auto-accept, every request in this session is allowed once without a dock, including any request already waiting. Other sessions still ask, and nothing is saved as a rule. Click it again to be asked again. The same switch is in Settings, General, and on the keyboard as `Mod+Shift+A`.

## Saved permissions

Settings, Permissions, lists every "Allow always" rule saved for the current project under **Saved permissions**. Each row shows the tool and the saved command, path or pattern.

Click **Remove** to delete a rule. The next matching request asks again. Removing a rule does not stop a run that is already in progress.

The per-tool settings above the list are different. They set the defaults for every agent and repository, and a project's config or an agent's own rules can override them.
