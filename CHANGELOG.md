# Changelog

All notable changes to HuGR Orchestra are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

The first public release is pending. This section describes the product as it stands for that release.

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
- Command line `orchestra`, published as `@humangr/cli` on npm, and as release archives with `install.sh`, for glibc and musl Linux, macOS and Windows.
- Packaged skills embedded in the CLI and refreshed when the version changes.
- Workflow, MCP, provider and model settings in the app, translated into the app's locales.

### Changed

- Context compaction now uses a hard-limited continuity: early pruning at 40 percent of the window and a hard limit at 70 percent.
- Shell commands, language servers and formatters run inside an OS sandbox on macOS, Linux and Windows, with seat reads limited to what the work needs.
- The app tolerates slow service start-up and retries protocol probes that get no answer.
- Sessions persist across branches.

### Fixed

- Draft prompts are admitted before the route changes, and rejected commands no longer stay stuck.
- Workflow approval, scope and upstream holds now say why they hold.
- Tool schemas advertise only regex patterns the engine can run safely.
- Anonymous free models appear in the provider list without a credential, and integration-keyed providers connect.
- Upstream artifact paths a card claims are checked against what the Task actually wrote.
- The CLI waits on a deadline for the service daemon to become ready.
- Deep links and startup paths recover correctly in the desktop app.
