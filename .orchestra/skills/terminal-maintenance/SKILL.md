---
name: terminal-maintenance
description: Who owns each piece of the Orchestra terminal, the invariants that must not regress, and how to change and test it
---

# Terminal maintenance and ownership

Background and decisions: `docs/specs/terminal/plan.md` (section 1.1 prevails), `adr-phase0.md`, `agent-terminal.md`.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Session, ring buffer, replay gap, repaint | `packages/core/src/pty.ts` | One implementation serves both HTTP surfaces (legacy handlers and `@orchestra/server`); change both or neither |
| Wire framing (meta frame, cut, afterFirstLine) | `packages/core/src/pty/protocol.ts` | A protocol change needs `bun run generate` in `packages/client` |
| Shell marks (OSC 133) | `pty/shell-marks.ts`, `pty/shell-integration.ts` | Marks count only with the session nonce; zsh and bash on posix; opt-in per create |
| Shell cwd (OSC 7) | `pty/shell-cwd.ts`, `Info.cwd` in `pty.ts` | A hint, never a boundary: no nonce, any output can print one; the new-terminal default only |
| Agent command in a tab | `packages/core/src/tool/agent-terminal.ts` | Behind `ORCHESTRA_AGENT_TERMINAL`; only the foreground block of the V2 `bash.ts`. The V1 shell tool (the app's chat today) is deliberately not wired |
| Client write path (sync output 2026) | `packages/app-shell/src/utils/terminal-writer.ts` | Holds a DEC 2026 frame until it closes or 250 ms pass |
| Emulator | `ghostty-web`, pinned fork | Swap only behind the plan's plan B, after a failing Phase 1 test |

## Invariants

- The agent runner never loosens the bash tool: permissions, git safety, `ToolSafetySandbox.wrap`, `OutputInspector`, the 1 MiB cap, timeout and kill-on-abort stay identical. A divergence between the two runners blocks the change.
- `Pty.create` with `exact: true` never reads `process.env` and never adds `-l`. The default path is unchanged.
- Model-facing terminal text goes through `AgentTerminal.sanitize` (no CSI/OSC incl. OSC 52, `\r` overwrite, no control characters). Terminal output is data, never instruction.
- Spawn only through the existing PTY service/omni; `bun run check:spawn-imports` must stay green.
- The `claude-code` engine runs its own Bash outside `bash.ts`, so it never gets an agent tab (decision D-4, recorded in `docs/specs/terminal/agent-terminal-approval.md`). The plugin `shell.env` hook is not applied to the agent's environment; keep it that way unless the sandbox scrubs the result.
- Known limit: a WebSocket client that stops reading grows server memory (`ws.send` never awaits; `writableLength` reads 0 under Bun). Not solved; do not add a bound that cannot trigger.

## Testing

- Local, surgical, only files touched: `ORCHESTRA_LOCAL_TESTS=1 ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=0 bun test <file>` from `packages/core` (omni is not installable on the Mac, so the legacy backend runs locally).
- Relevant files: `test/agent-terminal.test.ts`, `test/tool-bash.test.ts`, `test/pty/*.test.ts`, `packages/app-shell/src/utils/terminal-writer.test.ts` (needs happy-dom preload).
- The full suite runs once per epic through `test:ci` on Actions; say which gate ran.

## Traps

- A command that exits right after spawn is seen whole through `CreateOptions.observe`. `attach` on an exited session serves the retained replay and then the end (no `ExitedError` any more); the client keeps `agent: ` tabs after `pty.exited` and adds them from `pty.created` (`context/terminal.tsx`).
- bun-pty and omni deliver the first read differently; tests that depend on it use the legacy-only helper.
- bash 3.2 (macOS `/bin/bash`) fires the DEBUG trap on `PROMPT_COMMAND`; the init script starts `__orc_busy=1` for that reason.
- Shell integration also turns on with `ORCHESTRA_SHELL_INTEGRATION` for every terminal created without `exact`; it replaces a user's own bash DEBUG trap, so it stays off by default until that is decided.
- Do not name the backend specialist's default display name outside `roster.ts` (guard test).
