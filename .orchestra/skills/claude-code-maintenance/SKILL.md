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
- The loaded flag (`governedLoaded`, keyed by session id) is set only when the skill call returns without an error, in the MCP handler after execution.
- The check runs before the `callIDs` registration. A refused call never reaches the MCP handler, so registering it first would shift the queue of tool-use IDs for the next call of that name.
- The flag lives in process memory. A restart resets it, and the model reloads the playbook.
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
