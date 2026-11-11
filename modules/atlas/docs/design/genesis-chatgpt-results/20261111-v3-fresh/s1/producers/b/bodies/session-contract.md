# L1: session HTTP admission, pages, and handler delegation

Key: `s1.api.session-contract`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. The sources are Protocol declarations and Server adapters. Descriptions of Core work below are attributed to the declared contract or direct delegation, not an independently executed Core lifecycle.

## Declared request and response boundary

| Operation | Observed contract |
| --- | --- |
| `POST /api/session` | Optional ID, agent, model, and location; returns `{data: Session.Info}`. The handler supplies current working directory when the request omits location. |
| `GET /api/session` | Filterable session page with `{data, cursor: {previous, next}}`; handler defaults limit to 50. Cursor state preserves filters and an anchor while the current request supplies its page limit. |
| `GET /api/session/active` | Reports process-local foreground drains, as session IDs mapped to `{type: "running"}`. It is not declared as a fleet-wide scheduler view. |
| `POST /api/session/:sessionID/prompt` | Takes optional message ID, `PromptInput.Prompt`, optional delivery, and optional resume; returns `{data: SessionInput.Admitted}`. |
| `GET /api/session/:sessionID/history` | Exclusive nonnegative `after` sequence and limit 1–100, default 50; returns durable events with `hasMore`. |
| `GET /api/session/:sessionID/event` | Durable session SSE after an optional exclusive sequence. Its replayable content differs from global live events. |
| `POST /api/session/:sessionID/interrupt` | No-content response; delegates interruption. The HTTP session-location check can return 404 before Core's idle-session behavior is reached. |
| `GET /api/session/:sessionID/message` | Separate message pagination with limit 1–200, default 50, default descending order, opaque cursors, and previous/next links. Cursor plus explicit order is rejected. |
| `GET /api/session/:sessionID/message/:messageID` | `{data: Message}`; missing or cross-session message returns `MessageNotFoundError`. |

The prompt handler forwards the request fields to `session.prompt`. It maps `PromptConflictError` and `PromptBlocked` to the declared 409 conflict shape. The protocol describes admission separately from execution, including optional resume. This source supports the API admission result and adapter mapping; it does not on its own prove transactional persistence, crash recovery, scheduling, or exactly-once execution inside Core.

Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; an MCP-backed command failure is logged and returned as an unknown server error. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.

## Error and location behavior

`SessionLocationMiddleware` decodes the session ID, loads the stored directory/workspace from the session table, fails with `SessionNotFoundError` when absent, and provides the location service map from that stored identity. It does not use a caller's arbitrary location selection to redirect an existing session. The general location middleware remains appropriate for non-session-scoped operations.

The context adapter maps message-decode failures to a logged generic `UnknownError` with a reference. Compact maps a busy session to conflict and a run failure to an unknown error. Subagent-policy handling maps storage/invalid-chain/model-denial categories to service-unavailable responses. These are specific mappings in the inspected handler, not a blanket statement that every Core error becomes the same HTTP status.

Session history is a finite page with an exclusive sequence cursor. The source does not establish a stable snapshot across later page requests. The live session route passes its stream through `Stream.orDie`; a failure after stream establishment is not thereby converted to a normal JSON HTTP error. The streaming body documents this separately.

## Broader session surface and gaps

The source also declares fork/move, shell, skill/synthetic input, tool-less generation, todo, wait, diff/revert, background work, and process operations. The full session group and handler were read, and the literal route index preserves their names. This L1 body intentionally does not turn every delegated service into an end-to-end behavioral guarantee. Message assembly, database transactions, model admission policy, move ownership, background execution, and recovery need their domain owners' evidence.

Primary evidence: `packages/protocol/src/groups/session.ts`, `groups/message.ts`, Server `handlers/session.ts`, `handlers/message.ts`, `middleware/session-location.ts`, and Schema session/input/message definitions. `review-evidence.md` contains the decisive exact excerpts. No server was started and no session, provider, database, or HTTP exercise was executed.
