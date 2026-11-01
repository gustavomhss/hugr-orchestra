# Maturity and limits

Orchestra is an early release. This page lists what is not built, is opt-in, or is not yet proven in CI, so you know what to expect before you rely on it.

| Area | Limit |
| --- | --- |
| Seats | Frontend, code review, security review, documentation and process audit are not built. |
| Signing | Builds are unsigned: the system asks before the first launch, and unsigned macOS builds do not update in place. |
| Omni | Pre-release. Guarantees hold only where the conformance scenario is green in CI, and only in builds that include omni for their platform. |
| Providers | The session core routes three of six wire protocols. |
| Agent terminal | Opt-in, with shell integration; not on Windows. |
| Seat confinement | As described, on macOS and Linux. |
| Workflows | Steps that wait for human approval cannot run yet; four templates are read-only. |
| Hooks | Whole project only; cannot be imported. |
| Sessions | One process, no clustering; provider work is not retried automatically after a crash. |
| Atlas | Activity shows code rows; agent events are not served to it yet. |
| Meetings | Overlay hiding from screen sharing checked with Google Meet in Chrome only. |
| MCP Dock | The Linux desktop needs Docker. |
