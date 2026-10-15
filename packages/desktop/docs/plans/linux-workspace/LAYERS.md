# Layered, scoped agents for the Linux workspace

Status: design accepted by the owner on 2026-10-05; implementation in slices on `dock-linux-unified`.
Research behind it (6 studies, sources and numbers) is distilled in the user skills
`gui-agent-layers`, `atspi-any-app`, `gui-agent-security` and `gui-agent-exploration-validation`.

## Problem

Unscripted runs (see CAMPAIGN.md) showed a model holding ~42 tools across four worlds (host
project, browser dock, Linux UI, Linux shell) gets lost: same `dock_*` names mean browser or Linux
depending on what the UI has selected, failures push it to xdotool and finally to the host shell
(osascript, screencapture). Inside an app the raw tree is unusable: VS Code's Welcome page is 243
nodes, 34 levels deep, ~47% unnamed wrappers.

## Shape

| Layer | Kind | Tools |
| --- | --- | --- |
| L0 host | primary agents (build, plan...) | project tools, browser dock; one door: `task` → `linux` |
| L1 workspace | `linux` subagent | `linux_*` shell/files + `ui_*` Linux UI; nothing from the host |
| L2 app | later: per-app subagent bound to that app's windows | `ui_*` bound by the host to one app |
| In-app views | cursor, not agents | modal → window → region → container → control |

Agents limit scope; views give depth (Agent S3: flat policy inside a scope beats deeper planner
hierarchies). Programmatic work goes to the Linux shell, real UI work to `ui_*`.

## Rules

- One world per tool name: `ui_*` always means the Linux workspace UI, routed by the host to the
  workspace view of the sender, never to "whatever dock tab is active". `dock_*` stays the browser.
- Downward only: hosts may `task` the `linux` agent; `linux` cannot reach host tools or primary
  agents; failures return typed errors, never a broader tool.
- Reports are structured; UI text is untrusted.
- Every action returns what changed and `acknowledged` vs `verified`.

## In-app verbs (`ui_*`)

`ui_look` (where am I: app, window, modal, focus with ancestry, outline of the current scope),
`ui_enter`/`ui_up` (move the scope cursor), `ui_list(kind)` (rotor inside scope), `ui_find`,
`ui_act`, `ui_type`, `ui_keys`, later `ui_reveal` (virtualized content) and `ui_screenshot`.
One line per node: `button "Settings" keys=Ctrl+, [focused] @r12`; readable roles, accelerators
split from names, unnamed wrappers and single-child chains collapsed.

## Slices

1. Scoped `linux` agent + host denies (plugin `config` hook) and `ui_*` tools routed explicitly to
   the Linux workspace view (no dependence on the selected dock tab). `task` refuses primary
   agents as targets.
2. In-app outline: helper op that returns the pruned region outline and focus/modal in one call;
   `ui_look`, `ui_enter`/`ui_up`, `ui_list`.
3. Deltas after actions from an AT-SPI event digest; stable refs with fingerprints.
4. Toolkit enablement defaults for every launched app; tree scoring and vision fallback.
5. Per-app subagent bound to one app's windows (`scopeKind: "application"`), approvals per session.

Each slice ends with an unscripted run of the same open task by a scoped agent.
