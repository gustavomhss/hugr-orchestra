# App error messages

What the app shows when something it reads from the server fails, and what to do.

- **Server reason in error toasts.** Skills, providers, Atlas, CI/CD and agents errors now end with the server's own message. A generic "request failed" means the client got no reason; check the server log.
- **Providers list never loads.** After 15 seconds the list shows "not ready" instead of spinning. The local server is usually still starting or has crashed; see [Desktop startup errors](desktop-startup.md).
- **Board inbox with a failed project.** A project whose source failed to load is flagged in the inbox, and the inbox no longer claims "nothing waiting" while a source is failing.
- **Skill files that do not load.** A skill file that fails to parse is skipped and logged as a warning that names the file. The Skills list does not show it; check the server log.
- **Relay judge rules always fail.** With the default `stub` backend the gate says the judge is not configured. Set `relay.judge.backend` to `"api"` and `relay.judge.apiKey` in the Orchestra config. Failing closed is intended.
- **`--continue` with no sessions.** The TUI opens Home instead of an empty session.
- **Folder picker.** A failed folder listing is no longer cached, so reopening the picker retries it.
