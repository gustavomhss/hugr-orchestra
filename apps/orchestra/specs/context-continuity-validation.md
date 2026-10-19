# Context Continuity: User-Flow Validation

## Scope

Validated on 2026-09-30 with the freshly built Electron V1 sidecar and renderer.
Every user mutation used actual DOM interactions: create conversation, select
model, type/send prompts, approve a tool, click Stop, reload, and reopen through
the Home recent-session row. Backend API calls were read-only observations.

The provider was a deterministic loopback model. It derived maintenance summaries
and recall answers from the request it actually received. Its reported 50,000-token
usage was simulated; this run does not establish real-provider summary quality or
an actual 50,000-token transcript.

## Observed Results

| Scenario | Result |
| --- | --- |
| Create conversation, select model, submit six initial turns | Passed |
| Parent displays a reply while maintenance remains held | Passed |
| Discard stale summary and apply latest safe snapshot | Passed |
| Displayed answer retains original project fact and latest changed decision | Passed |
| Repeat maintenance using prior context plus incremental history | Passed |
| Parent Read tool completes through the permission UI | Passed |
| Maintenance tool attempt cannot replace valid context | Passed |
| Partial maintenance stream error preserves valid context | Passed |
| Stop interrupts parent response and active maintenance | Passed |
| Next user prompt succeeds and maintenance can start again | Passed |
| Reload restores the complete user transcript | Passed |
| Home recent-session row reopens the same conversation | Passed |
| Maintenance content stays out of observed timeline and persisted messages | Passed |

The final run submitted 22 prompts through the UI. Its strict provider ledger
contained 31 expected requests and no unexpected requests. The durable transcript
contained 45 messages. Assertions checked displayed answers, actual tool execution,
outgoing request content, session identity, and transcript preservation.

Three deliberately broken captures (missing summary, malformed summary, missing
tail) failed the recall oracle. A MutationObserver detected injected maintenance
markers as a positive control before checking for transient leaks. Twenty-one
scenario screenshots were retained.

## Problems Found and Fixed

- macOS `/var` and `/private/var` aliases caused the Home recent-session list to
  omit the conversation. Desktop onboarding now returns the native canonical
  default-project path. The failing alias fixture then passed unchanged.
- The prompt module exceeded its approved file-size budget. Its existing structured
  output tool was moved to a sibling module while preserving its export and behavior.
  No guard or waiver was changed.

## Evidence

Final source fingerprint:
`c825017fb89e102657118d8700635352887ed0c9e417398f4aaaf80991fe1a2b`.

The local `continuity-user-validation-r3` bundle contains `final-report.json`,
`ui-evidence.json`, `provider-evidence.json`, source/build provenance, the captured
transcript, screenshots, and the bounded supervision/cleanup scripts. The earlier
failed runs were retained separately. Source and built-artifact hashes were checked
after validation, and all owned test processes were stopped.
