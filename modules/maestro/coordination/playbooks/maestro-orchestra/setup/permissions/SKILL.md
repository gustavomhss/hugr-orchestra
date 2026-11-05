---
name: maestro-orchestra-setup-permissions
description: How permission rules resolve, what each dock answer does, where saved rules live, and how auto-accept and config rules interact.
internal: true
when: The owner asks why an agent keeps asking, how to stop a prompt for good, how to deny a tool for one agent, or what Always allow saves.
not-when: The question is project trust for MCP servers (use the MCP leaf) or the Stop button alone.
covers: []
---

# Permissions

## Resolution

A rule has `action`, `resource` and `effect` (`allow`, `ask` or `deny`). Matching uses wildcards. The last matching rule wins; with no match the answer is `ask`. Any `deny` on any resource of a request refuses it outright. The agent's own rules come first, then rules saved with Always allow are appended and so beat the agent's earlier ask or allow, never a deny.

Config example: `{"permissions": [{"action": "hugr-composer_*", "resource": "*", "effect": "deny"}]}` blocks a tool family. A seat profile (for example the backend seat for Composer tools) can win over such a rule. `ORCHESTRA_PERMISSION` supplies JSON rules from the environment.

## The dock

It shows the asking agent (a subagent is named), the tool, and the exact command, path or URL. Read it before answering.

| Answer | Effect |
|---|---|
| Deny | Refuses the request and also rejects every other pending request of the same Session |
| Allow once | Runs this one; the next asks again |
| Always allow in this project | Saves a rule for this project and releases pending requests it now covers |
| Stop | Ends the run; every open permission and question of the Session is rejected |

An optional message on Deny returns as feedback to the agent. Allow always covers the saved scope the dock states ("every Read request" or "only this Bash request").

## Auto-accept

The composer Ask button switches one Session to Auto-accept: every request in it is allowed once without a dock, including waiting ones. Other Sessions still ask and no rule is saved. The shortcut is `Mod+Shift+A`.

## Saved permissions

Settings, Permissions, Saved permissions lists rules per project (table keyed by project, action and resources). Remove deletes a rule; the next match asks again. Removing does not stop a run in progress. Per-tool defaults above the list apply to every agent and repository and can be overridden by project config or an agent's own rules.

## Write roots

Seat write limits are reserved rules (`tool_safety_write_root`) enforced by ToolSafety, not by the dock.
