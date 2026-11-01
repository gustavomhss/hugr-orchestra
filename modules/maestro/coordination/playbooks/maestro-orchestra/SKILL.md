---
name: maestro-orchestra
description: What Orchestra can do and which tool or seat does it. Use when a request needs a capability you have not used in this session, before saying Orchestra cannot do something, or when choosing between doing a step yourself and routing it.
---

# Orchestra

Each tool's own description says how to call it; this map says when it is the right one and who owns what you do not
hold. A tool you do not see in this session is not available here: some need the desktop app, a connection or a
setting. Say what is missing instead of working around it.

## Yours

| Tool | Use it to |
|---|---|
| `board_read` | Start every turn that touches tracked work: what is in flight, what changed `since`, a card's activity. Without `project` it lists the projects and their keys. |
| `board_project`, `board_epic`, `board_issue`, `board_steps` | Keep the plan on the board: one card per unit, its seat, Session, branch, PR, steps and `crash_reason`. |
| `board_move` | Move a card the host does not move on facts: to Ready or Cut, or to Shipped when the project has no GitHub repo. |
| `board_queue`, `board_dequeue`, `board_bundle` | Publish a verified card to the merge queue, take one out, or settle a flaky or held bundle; the host bundles, tests and merges. |
| `board_question`, `board_decision` | Ask the owner on the board, with options and a recommendation, or withdraw a question; record what came of an answered decision. |
| `board_settings` | Set a project's target date or budget when the owner gives one. |
| `task` | Dispatch a seat with the brief its shape asks for; a seat that writes gets `worktree: true`. Pass `card` (KEY-N) and the host claims that card and moves it to Building. Resume one with its `task_id` and `directory`. |
| `question` | Ask the owner something that blocks the run; it keeps the run waiting. |
| `team_message` | Reach `live`, the meeting copilot, and read its notes. |
| `maestro_workflows` | Resolve a published workflow before governed work. |
| `maestro_record_admission`, `maestro_record_context`, `maestro_catalog_context`, `maestro_record_plan_revision`, `maestro_present_approval`, `maestro_record_approval`, `maestro_grant_authorization`, `maestro_request_review`, `maestro_record_validation`, `maestro_record_result_decision` | Governed work only, in the order `maestro-run-governed` gives. |
| `maestro_arsenal_catalog`, `maestro_arsenal_describe`, `maestro_arsenal_execute` | Repository and conflict maps, plan checks and wave scheduling for large work. |
| `atlas_context` | The project's ownership and history before you route or review a change in an area you do not know. |
| `context_recall`, `context_compact` | Recover a masked result or an exact earlier message; compact after a milestone. |
| `skill` | Load a playbook or a project skill. |
| `read`, `glob`, `grep`, `bash`, `edit`, `write`, `apply_patch`, `process_get`, `process_wait`, `process_cancel` | Verify, probe and land in a card's worktree. Building is a seat's job. |
| `webfetch`, `websearch` | Read a public page or find one. A question that needs evidence goes to the research seat. |
| `dock_*` | Drive a real browser tab in the owner's MCP Dock (desktop app), signed in as the owner. |
| `channel_read`, `channel_send`, `channel_update` | Read or post in a bound Slack or Discord channel. Ask before sending what the owner did not ask for. |
| `document_read`, `document_edit`, `sheet_read`, `sheet_edit` | Read or change a PDF, an XLSX or a CSV. |
| `image_create`, `video_create` | Make an image or a video the owner asked for. |
| `service_find`, `service_describe`, `service_call`, `platform_*` | Act on a connected service or platform (Cloudflare, Vercel, Supabase, Linear, Stripe and others). |
| `schedule_manage` | Schedule a prompt to run later or on a cadence. |
| `process_control` | Start, watch and stop a long-running local process such as a dev server. |
| `todowrite` | Track a short inline task that has no card. |

Tools from MCP servers arrive as `<server>_<tool>`, described in `<mcp_instructions>`.

## Through a seat

The `<team>` list in your context is the roster: each dispatchable seat by id, the name the owner sees, the work that goes to it and its project areas. It is generated from the seat catalog and the project's config, so it is current where this table is not. Route by it; the rows below are the kinds of work only.

| Need | Seat |
|---|---|
| A plan, a decomposition, a brief | the planner the team list names (`maestro-plan`) |
| A fact, a comparison, research with sources | the research seat the team list names, with an `effort` tier |
| Code, tests, a fix | the seat whose areas or work cover it, or `general` with `writePaths` |
| A cold review | the reviewer the team list names, or `explore` when none can be dispatched |
| A desktop app, a terminal or files in the isolated Linux workspace | `linux`, in the desktop app |
| A meeting | `live`; you only exchange notes with it |

## Counter-examples

- "Orchestra cannot post to Slack." Check for `channel_send` and a bound channel first.
- Running a research loop with `websearch` instead of asking the research seat.
- Driving the owner's own screen with `osascript` because `dock_*` is missing.
