---
name: maestro-orchestra-work-sessions
description: How `task` dispatch, child Sessions, background runs, `team_message`, the `live` seat and permission or question requests work.
internal: true
when: The owner asks how Maestro hands work to a seat, why a dispatch was denied, how background tasks report back, how meetings reach Maestro, or what Stop does.
not-when: The question is about card stages (board leaf) or saved permission rules (permissions leaf).
covers: []
---

# Sessions, dispatch and requests

## The `task` tool

Each dispatch runs the target as a child Session. Core input: `description`, `prompt`, `subagent_type`, `model`, `task_id` (resume), `directory` (absolute worktree root) and `worktree` (true makes a new git worktree named after the description; the reply names it). Output is `task_id: <sessionID>` plus the directory.

- Depth is capped at 8 ("Task delegation depth exceeds 8"); a cycle gives "Task ancestry contains a cycle".
- The target must be a visible subagent ("Task target is not a visible subagent: <id>"); Maestro and primary agents are not targets.
- Child permissions start from the parent's inherited rules.
- Resume with `task_id` plus the same `directory`; a mismatched parent, agent or placement is refused.

## Governance on Maestro's dispatches

Extra fields: `card`, `writePaths`, `background`, `effort` (`jimmy` only: quick, focused, deep), `allowedDomains` (`jimmy` only), `workflow`, `authorizationID`, `governed`, `memoryUnit`. Denials, for fresh dispatches only:

| Denial | Meaning |
|---|---|
| `seat-unstaffed` | The seat is not staffed yet |
| `card-required` | A staffed code-writing seat needs `card`; create one first |
| `write-paths-required` | Pass `writePaths`, or `[]` for read-only work |
| `area-owned` | The file is in another seat's area; dispatch that owner |

Write roots are enforced by ToolSafety through reserved permission rules.

## Background runs

`background` returns at once. When the child goes idle its reply arrives as a new prompt in the parent ("Background task completed: <description>" or "Background task failed"). Delivery retries 2 times, then a durable notice names the `task_id`. It is refused for an upstream proposal that needs settlement (`upstream-settlement-unavailable`) and with no Sessions service (`background-unavailable`). After a host restart a lost watcher leaves the reply in the child Session; resume it with `task_id`.

## `team_message` and `live`

`team_message` connects only Maestro and `live`. The text is wrapped in `<team_message from=...>` noting it is not from the owner and approves nothing. It is queued to the recipient's most recently active, unarchived top-level Session in the project. Errors: "<to> has no open conversation", "Unable to deliver to <to>", "<agent> cannot message <to>".

`live` is the meetings copilot with `live_look`, `meeting_recall` and `meeting_commitments`. It never dispatches and sends nothing outside Orchestra; it proposes work to Maestro. Meetings are macOS only and need a Deepgram key kept in the keychain. "Send to Maestro" hands items over as one message; Maestro acts only when the owner asks. Suggestions are off by default; data stays in the local database.

## Permission and question requests

Docks above the composer offer Deny, Allow once and Allow always. Stop interrupts the turn and rejects every open request; it does nothing when idle.
