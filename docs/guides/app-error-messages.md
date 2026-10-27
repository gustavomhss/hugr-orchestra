# App error messages

What the app shows when something it reads from the server fails, and what to do.

- **Server reason in error toasts.** Skills, providers, Atlas, CI/CD and agents errors now end with the server's own message. A generic "request failed" means the client got no reason; check the server log.
- **Providers list never loads.** After 15 seconds the list shows "not ready" instead of spinning. The local server is usually still starting or has crashed; see [Desktop startup errors](desktop-startup.md).
- **Board inbox with a failed project.** A project whose source failed to load is flagged in the inbox, and the inbox no longer claims "nothing waiting" while a source is failing.
- **Skill files that do not load.** A skill file that fails to parse is skipped and logged as a warning that names the file. The Skills list does not show it; check the server log.
- **Relay judge rules always fail.** With the default `stub` backend the gate says the judge is not configured. Set `relay.judge.backend` to `"api"` and `relay.judge.apiKey` in the Orchestra config. Failing closed is intended.
- **`--continue` with no sessions.** The TUI opens Home instead of an empty session.
- **Folder picker.** A failed folder listing is no longer cached, so reopening the picker retries it.
- **Local server is not answering.** The start screen has **Try again**, **Export logs** (exports a debug zip to Downloads and shows it in Finder) and **Restart app** (restarts the desktop app and its bundled server). Restart appears only when the selected server is the local one. The server form below it is for other servers.
- **A meeting handoff fails.** The Flight Engineer detail says "Could not send these items to Maestro. Try again." It no longer says the meeting failed to load. Nothing is retried for you; press **Hand to Maestro** again.
- **A failed pipeline or CI run.** The failed card in Checks > Local, and the failed remote run header in Checks, offer **Ask Maestro to fix**. It opens a draft chat with the failure's last output or run details. Read it, then send it; nothing runs until you do.
- **A failed schedule run.** The schedule card says "The last run failed on <date>" in an error style, separate from "Missed". The raw error sits under **Technical details**.
- **Disabled "New workflow".** Under the Checks header a line says why it is off: connect a repository, wait while access is checked, or the repository does not allow it for your account.
