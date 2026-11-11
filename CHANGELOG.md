# Changelog

All notable changes to HuGR Orchestra are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Provider startup overlaps snapshot capture while tool writes wait for the original snapshot. Cancelling a turn also cancels a pending capture; undo retains its changed-file list.
- Late events and pending message reads no longer restore an evicted idle transcript. Opening the session loads it normally; usage and status still update.
- A zoom the user asks for no longer hides a failed write. The factor stays where it was, and that failure is shown. A repeated failure in the same outage is logged, not toasted again.
- Checking Flight Engineer readiness again, or reloading it after a permission request, no longer hides a failed read. The wait ends, and that failure is shown.
- A failed permission reply is no longer silent. The prompt can be answered again, and the failure is shown.
- The last-resort startup dialog goes through the native translation bundle. The English text is unchanged.
- Adopting an installation inbox typechecks again. A transaction can adopt its rows, and listing the inbox no longer fails the type of a read that cannot fail.
- Stopping a background process no longer hides a failed reload of the list. The stop still counts, and that failure is shown.
- A scheduled run that fails no longer hides a failed delete of the empty session it created. That failure is shown.
- Stopping a turn no longer hides a failed read of whether it is still running. That failure is shown.
- A tab that opens after its Apps owner has changed is no longer left on screen when closing it fails. That failure is shown.
- Cancelling a provider sign-in no longer leaves the dialog when the server cancel fails. The failure is shown and the attempt stays.
- Checking a meeting again, or reloading it after a change, no longer hides a failed read. The meeting stays, and that failure is shown.
- A tab the Apps view attaches while it is not on screen no longer hides a failed hide. That failure is shown.
- Cancelling a Slack sign-in no longer clears the attempt when the server cancel fails. The failure is shown and the attempt stays.
- Closing the last Apps tab, returning to the browser, or opening the Linux workspace no longer hides a failed hide of the view that was on screen. That failure is shown.
- A language change no longer hides a failed native-menu write. Renderer copy can update while the menus stay stale, and that failure is shown.
- Selecting a crashed Apps tab no longer hides a failed hide of the view that was on screen. That failure is shown.
- Turning on auto-accept no longer hides a failed permission list. Prompts already on screen are not treated as answered, and the failure is shown.
- Replacing the server the app opens on launch no longer hides a failed default-server write. The old entry is still removed. The failure is shown, and the removed URL is not left as the server the next launch opens.
- Undo recomputes the changed paths when a turn stored both snapshots and no file list. It no longer treats that missing list as no files.
- Subscribing to events for a session that does not exist returns the declared 404. It no longer dies inside an open event stream.
- A settings change that cannot reload an open location is no longer reported as applied.
- The agent guide and the shipped playbook now match the host. Maestro cannot run `gh pr merge`. Claude mode may still ask you, and allowing that ask does not run the command. A backend result is not host-verified. A research time budget warns. A spent tool-call budget still allows inquiry close. A spent provider budget refuses further turns.
- A credential database that cannot be read no longer gets a new encryption key. Orchestra stops instead of sealing new secrets under a key that cannot open the old ones.
- `orchestra stats` stops when a message page cannot be read. It no longer prints totals that left those messages out.
- A live event stream no longer drops events already received when one read is larger than 1 MiB. An unfinished frame past that cap is still refused.
- An unsigned macOS app that already has a credential key file no longer asks for the Keychain password on every launch.
- A local server that fails to start says why at once. It no longer waits two minutes and then reports only a timeout.
- Listing a path the server cannot serve returns the same declared 400 as reading one. It no longer becomes an empty 500.
- A database created by a newer Orchestra is reported once. The app no longer restarts the local server six times for the same refusal.
- A live event the app cannot decode no longer ends the event stream. The event is skipped and the connection stays up.
- A tool left running or waiting before a compaction is marked interrupted on the next run. It no longer stays unsettled because that history is outside the model window.

## 0.3.4 (2026-11-01)

Desktop release, unsigned like 0.3.3. The command line stays at 0.3.1.

- The local server uses less CPU: file search no longer runs its own file watcher, which kept the server busy while a project was open.
- The app no longer reports "disconnected" after one slow health check. It waits for two failed checks in a row and never does so while the event stream is alive; a stream that stays silent for 45 seconds reconnects on its own.
- Switching screens is faster: each turn's diffs are cached, and Skills and Workspaces show their last list at once while they refresh.
- Claude mode checks your sign-in once every 10 minutes instead of starting a Claude process on every model listing.
- The chat composer has a permissions button: "Ask" or "Auto-accept" for this chat, the same setting as `Mod+Shift+A`. The reasoning picker reads "Reasoning: default" until you choose a level.
- Workflow steps whose checks fail keep working on the same step and see why the check failed, instead of stopping.
- The skill list given to agents is bounded, so a large catalog cannot crowd out the task.
- Windows on ARM gets its own installer.

## 0.3.2 (2026-10-30)

Desktop release, unsigned like 0.3.1. The command line stays at 0.3.1.

- The first launch after an install no longer fails with "Owned serve not healthy within 20000ms": the app waits while macOS checks the new server binary, and stops waiting at once if the server exits.
- Every launch is faster: the local server no longer starts in your home folder, where it watched every file, and the app no longer hashes the bundled command line twice.
## 0.3.1 (2026-10-30)

Command line and desktop releases, unsigned like 0.3.0: on macOS open the app with "Open Anyway", on Windows choose "Run anyway".

- Merge queue: Maestro verifies a card's work with `ci_run`, queues it with `board_queue`, and the host lands green bundles, isolates a red card or a red base, and recovers after a crash.
- Project Board: plan area and order on cards, push state per card, drift notes, and a rebuild of the board from its committed record.
- The app: first-run folder, trust and model steps on Home; a sidebar of five primary items with an Advanced group; failure states that say what to do next; Checks (formerly Actions); a permission dock that shows what is asked and offers Stop; run workflows from Maestro chat; a list editor for workflows and hooks beside the canvas; per-server MCP permissions; agent avatars; and each seat's skill tree on the agent screen.
- Claude mode runs on the V2 session core again, with the todo panel, edit diffs and subagent child Sessions.
- MCP Dock: each docked interface is its own MCP server, and Linux reads, finds and acts more reliably in GTK dialogs and editors.
- Relay ships three example workflows.
- OpenCode Go requests carry the session header Go requires, so Go models answer again. OpenCode Zen's free models are no longer offered: they refuse every third-party client. Paid Zen models are unchanged.
- OpenRouter's free models are tagged Free in the model picker.
- Security: dependency updates for open advisories, including the MCP SDK, and fixes for the CodeQL findings in regular expressions.

## 0.3.0 (2026-10-27)

- Upgrade the command line and the desktop app to 0.3.0 together. Desktop 0.3.0 migrates the shared database and drops the `session_v1_prompt_admission` table, so a command line older than 0.3.0 (for example 0.2.1) can no longer use that database. Release both in the same window; do not run an older CLI beside the new desktop app.
- The command line npm wrapper and every desktop installer now include the repository `LICENSE` and `NOTICE`.
- The command line release publishes to npm before it creates the GitHub release, so a failed npm publish can be rerun.

## Releases

Releases are versioned 0.x. The command line (`@humanguardrail/cli`) is tagged `v<version>` and the desktop app `desktop-v<version>` on [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases); each release's notes say whether it is signed.

- 0.3.4 (2026-11-01): desktop release, unsigned.
- 0.3.3 (2026-10-31): desktop release, unsigned.
- 0.3.2 (2026-10-30): desktop release, unsigned.
- 0.3.1 (2026-10-30): command line and desktop releases, unsigned.
- 0.3.0 (2026-10-27): command line and desktop releases, unsigned.
- 0.2.2 (2026-10-21): desktop release.
- 0.2.1 (2026-10-20): command line and desktop releases.
- 0.2.0 (2026-10-20): command line and desktop releases.
- 0.1.0 (2026-10-19): first command line and desktop releases, unsigned.

The list below describes the product as it stands, not a per-release diff.

### Added

- Maestro, the lead agent, scopes work, delegates it to specialist seats and brings plans and results back for your approval.
- Specialist seats: a backend implementer, a research seat that checks answers against more than one source, and an authoring seat for skills and workflows.
- Claude mode: Maestro can run on a native Claude Code host, which pauses until you approve the plan.
- Relay: author and run governed workflows with hooks, with the reason named whenever approval, scope or an upstream step holds one back.
- Atlas knowledge context for the authoring seat and Relay, so work starts from grounded facts about your codebase.
- Subagent model policy: pick which models subagents may use, per session, with a ceiling that is enforced.
- Prompt delivery choices in the composer: steer a running session or queue the next prompt.
- Actions and a Create PR proposal in the app.
- App Dock and a Linux workspace: agents can read and operate applications in an isolated desktop, shown in a Dock tab with an Apps view.
- Lean mode for shell output, with per-profile controls and measurements in a Lean settings chapter.
- Session archive and restore, and checkpoints that save an exact fork input.
- Desktop app for macOS, Windows and Linux (AppImage, deb, rpm), with the Claude Code executable and ripgrep packaged.
- Command line `orchestra`, published as `@humanguardrail/cli` on npm, and as release archives with `install.sh`, for glibc and musl Linux, macOS and Windows.
- Packaged skills embedded in the CLI and refreshed when the version changes.
- Workflow, MCP, provider and model settings in the app, translated into the app's locales.

### Changed

- Context compaction now uses a hard-limited continuity: early pruning at 40 percent of the window and a hard limit at 70 percent.
- An OS sandbox for shell commands, language servers and formatters is available on macOS, Linux and Windows. It applies to read-only agents and to projects that ask for it; it is not on for every command (see SECURITY.md).
- The app tolerates slow service start-up and retries protocol probes that get no answer.
- Sessions persist across branches.

### Fixed

- Draft prompts are admitted before the route changes, and rejected commands no longer stay stuck.
- Workflow approval, scope and upstream holds now say why they hold.
- Tool schemas advertise only regex patterns the engine can run safely.
- Integration-keyed providers connect.
- Upstream artifact paths a card claims are checked against what the Task actually wrote.
- The CLI waits on a deadline for the service daemon to become ready.
- Deep links and startup paths recover correctly in the desktop app.
