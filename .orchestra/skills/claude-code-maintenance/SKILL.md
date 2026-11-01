---
name: claude-code-maintenance
description: Who owns the Claude Code host (the V2 meta-harness), which Orchestra tools it serves, the governed-work gate, the invariants that must not regress, and how to change and test it
---

# Claude Code host maintenance and ownership

Background: `modules/engine-adapters/claude-code/README.md`, `docs/specs/claude-mode/meta-harness.md`.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Host: stream, tool serving, gate, MCP server | `modules/engine-adapters/claude-code/src/v2/host.ts` | Every Claude Code call passes `decide()`; PreToolUse and `canUseTool` share it |
| Preset append and seat text | `modules/engine-adapters/claude-code/src/host/options.ts` (`append`, `environment`) | Appends only; never a custom system prompt or a main-thread agent |
| Governed playbook name | `modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md` (skill `maestro-run-governed`) | Must match the name the gate checks and the rule in `packages/core/src/agent/prompt/maestro.txt` |
| Skill permission for seats | `packages/core/src/tool/skill.ts`, tested in `modules/maestro/coordination/test/v2-seats.test.ts` | Permission is asserted at execution, so serving `skill` adds no bypass |

## Tool serving

- `UNSERVED` in `host.ts` lists the Orchestra tools Claude Code has as built-ins or that belong to Orchestra's own loop. A name there is never served over MCP. Adding a tool to `UNSERVED` removes it from Claude mode; check it is not an Orchestra tool the seat needs first.
- `skill` is served as `mcp__orchestra__skill`. Claude Code's built-in `Skill` tool does not know Orchestra's playbooks, so the append says so.
- Subagent tools (`Agent`, `Task`) are refused whenever Orchestra's `task` is served.

## Governed-work gate

- In `decide()`, a `maestro_*` tool is refused until its session has loaded `maestro-run-governed` through `mcp__orchestra__skill`. Excluded: `maestro_arsenal_*` and `maestro_workflows`.
- The loaded flag (`governed`, a set of session ids) is set only when the skill call returns without an error, in the MCP handler after execution.
- The set is created inside `make`, so it belongs to one host, never to the process. It must outlive a turn: every turn is a new Claude Code process on the same Orchestra session, and the gate means "this session has loaded the playbook", not "this turn". A compaction does not reopen the gate.
- The host gets no signal when a session ends, so the set is bounded (`GOVERNED_SESSIONS`, oldest dropped first). A session dropped that way just loads the playbook again: the gate fails closed. Do not move the flag into `turn.state`: `state.update` is a non-atomic read-modify-write, and the MCP handler would race the frame handler's updates (`delivered`, `checklist`) and lose them.
- The check runs before the call-id registration. A refused call never reaches the MCP handler, so registering it first would leave its id queued for the next call of that name.
- The flag lives in host memory. A restart resets it, and the model reloads the playbook.

## Pairing MCP requests with tool_use ids

- The MCP request carries no tool_use id. The hook (or `canUseTool`) learns the id, and the request takes it back by `pairKey(name, args)`: the tool name plus a hash of the canonical (key-sorted) arguments, oldest id first. Arguments the request and the hook disagree on fall back to a synthetic `orchestra_<uuid>` id, which is safe; never fall back to a name-only queue, it is what mispaired ids.
- A call the hook allowed can still never reach MCP (denied by another hook or a settings rule, aborted). Its id is dropped when its `tool_result` frame arrives (`release`), so two calls with identical arguments cannot swap ids either. Parallel identical calls where one is denied before the other's request remain a theoretical gap; a denial is deterministic for identical arguments, so it does not occur in practice.
- The test in `v2-host.test.ts` covers both: different arguments (the hash) and identical ones (the release, driven with `pump`).

## Permission decisions

- `decisions` caches one settled decision per `toolUseID`, so the hook and `canUseTool` do not ask the owner twice. A refusal that came from an abort (`signal.aborted` when the check was cut short) is not cached: the entry is removed and the next ask, including a caller already waiting on it with a live signal, decides afresh. Other defects still cache `UNCHECKED` and fail closed.
- Renaming the playbook means changing the gate, `maestro.txt` and the playbook's name together. No test links the three: the gate test in `v2-host.test.ts` pins the literal name, and nothing checks `maestro.txt`, so update all three by hand.

## Account status probe

- `ClaudeCodeAccountV2.read` starts a Claude Code process (a `query()` with no prompt, then `accountInfo()`), and the catalog reads it on every provider listing while Maestro runs on `claude-code`. An uncached read shows up as a short-lived `claude` child every few minutes.
- A signed-in status is cached for 10 minutes (`SIGNED_IN_TTL`); a signed-out one for 30 seconds, so a terminal `claude auth login` is seen soon. A sign-in finished through the service clears both (`refresh`).
- A read that throws or times out is no answer: `read` returns undefined and the last signed-in status stands. Reporting it as signed out drops Anthropic from the Claude-mode catalog, so Maestro's model goes invalid and the composer loses its reasoning levels until the next read.
- Do not add a new caller that reads the status in a loop. The cache test in `v2-account.test.ts` pins both lifetimes with `TestClock`.

## Invariants that must not regress

- Only the `claude_code` preset is used. `query()` never carries a custom `systemPrompt`.
- Every tool call passes the gate first, and a failure to decide refuses the call (fail closed).
- `ENV_FLAGS` and the `CLAUDE_CODE_ENTRYPOINT` removal stay in `environment()`. Credentials are never added or removed.
- The owner's own Claude Code settings stay in charge: `settingSources` is `["project"]`, and `permissionMode` is `default`.

## Tests

- Host behaviour: `modules/engine-adapters/claude-code/test/v2-host.test.ts`. It drives the SDK seam with scripted frames, never the binary. The governed-gate test lives there.
- Seats and host parity: `v2-host-seats.test.ts`, `preset-guard.test.ts`, `v2-account.test.ts`.
- Run on GitHub Actions only: `bun run test:ci engine-claude-code <files>` from the repository root. Typecheck with `bun typecheck` in `modules/engine-adapters/claude-code`. Never run tests or typecheck on the Mac.
- A `test:ci` run can print "missing successful Run tests step" after the job succeeds. Read the pass and fail counts in the run log before deciding.
