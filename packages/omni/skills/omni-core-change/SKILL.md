---
name: omni-core-change
description: "Procedure for changing hugr-omni's Rust core, binding or supervisor without breaking its architecture - the layer table and downward-only imports (INV-15), frozen seams, the append-only error messages file, the unsafe and dependency allowlists, public API changes (contract, index.d.ts, parity), host-supervisor protocol changes (version bump, docs/protocol.md, codec tests), INV-16 (no tokio process or SIGCHLD), never blocking the host, and the file-size limit. Use when editing anything under packages/omni/crates or bindings/node/src, adding an error text, an option, a dependency, an unsafe block or a protocol message, or reviewing such a change."
---

# Changing the omni core

[AGENTS.md](../../AGENTS.md) is the rule source: the layer table, the rules never bent, the allowlists. The global
invariants (INV-01 to INV-16) are in [PLAN.md](../../PLAN.md) §4.3. This skill is the order of work, so that a change
lands without violating them. It restates no rule; when in doubt, read the source.

## When to use

- Editing `crates/hugr-omni`, `crates/omni-proto`, `crates/omni-supervisor`, `crates/omni-fixture` or
  `bindings/node/src`.
- Adding an error text, a public option, a dependency, an `unsafe` block, or a protocol message.
- Reviewing such a change.

## When not to use

- Using hugr-omni from TypeScript: use the `omni-processes`, `omni-lifecycle` or `omni-terminals` skills.
- Running the gates or triaging a red one: use the `omni-gates` skill.
- Editing a contract scenario: that is the lead's alone (INV-13). See the `omni-conformance` skill.

## 1. Place the change in its layer

Find the module in [the layer table](../../AGENTS.md#layout-and-layers) and read its "May use" column.

- Imports point only down the table (INV-15). `pty` may use `client`, but `client` never uses `pty` or `process`.
- The supervisor never depends on `hugr-omni`. It shares only `omni-proto`.
- `lib.rs` re-exports only `api` and `error`.
- If the change needs an upward import, the change is in the wrong layer. Move the logic down, or raise it with the
  lead.

## 2. Respect the seams

- An item under a `SEAM (frozen in W00)` module doc keeps its name, signature and docs, unless the lead decides
  otherwise. Its body, and every private item, belong to the module's owner.
- `crates/hugr-omni/src/types` and `crates/hugr-omni/src/api` are the frozen public surface. A change there is a
  contract change (step 5).

## 3. Errors: append-only

- Every error text is a `pub(crate)` constructor in `crates/hugr-omni/src/error/messages.rs`.
- Add your own `impl Error` block **at the end of the file**, named for your work package. Never edit another work
  package's texts.
- A message says what failed, the value, and the fix ([contract §11](../../docs/api-contract.md#11-errors-and-other-languages-v02)).
  The codes are fixed: `NOT_FOUND`, `NOT_EXECUTABLE`, `INVALID_CWD`, `INVALID_ARGUMENT`, `ABORTED`, `OUTPUT_LIMIT`,
  `CLOSED` and `IO`. A new code is a contract change.

## 4. Allowlists

- **`unsafe`** is allowed only in `client`, `pty`, `spawn/sys.rs`, the supervisor, `omni-fixture/src/sys`, the
  bindings, and the test runners' one environment write at startup. Every block has a `// SAFETY:` comment.
- **Dependencies** (INV-12): only `libc`, `windows-sys`, `tokio` (without the `process` feature), `tokio-util`,
  `serde`/`serde_json`/`regex` in tests and runners, and the napi crates in the binding. Anything else, **including a
  new `windows-sys` feature**, means: stop and ask the lead.
- **No `unwrap`, `expect` or `panic`** in library or supervisor code (clippy denies them). Nothing may panic across
  FFI. Test crates may opt out with the one allowed `#![allow(...)]` line.

## 5. Public API changes

A new option, field or behavior is a contract change, made by the lead. In order:

1. The lead amends [docs/api-contract.md](../../docs/api-contract.md) and, where behavior changes, adds a scenario.
2. `bindings/node/index.d.ts` and the Rust `api` change together. Parity (INV-02) means a capability exists in every
   language or in none. Update `scripts/surface-check/parity.txt`.
3. The surface checks prove it: `node scripts/surface-check/parity.mjs` and `node scripts/surface-check/binding.mjs`.
4. The docs (README, recipes) and the skills that name the option follow. `node scripts/skill-check/check.mjs` fails
   on a skill that names an option `index.d.ts` no longer has.

## 6. Protocol changes

The host-supervisor protocol is frozen ([docs/protocol.md](../../docs/protocol.md)). Changing a message, a field or
a reply rule is a lead decision, and lands as one change:

1. Bump `VERSION` in `crates/omni-proto/src/lib.rs`. The host refuses a supervisor of another version, and both
   ship together.
2. Update `docs/protocol.md`: the message table, the reply table, and the descriptor rules.
3. Update the codec and its tests in `crates/omni-proto/src/codec/`: round trips, plus the malformed cases (unknown
   kind, bad length, trailing bytes, a slot not allowed for its field).
4. Change the client (`crates/hugr-omni/src/client`) and the supervisor (Unix and Windows) in the same change. A
   supervisor and a host from different commits never talk.
5. Keep the reply rule: every request gets exactly one reply carrying its `req`.

## 7. Process and host rules (the ones that cause real bugs)

- **INV-16.** Never observe child exit through tokio's process or SIGCHLD machinery. `tokio::process` is banned.
  The supervisor owns every child, and the host never forks.
- **The host** installs no signal handler and no exit hook, and changes no console state. Anything of that kind lives
  in the supervisor.
- **Never block the host:** not the Node main thread, not the tokio executor. The one exception is spawning, with
  bounded round trips: one for a pipe child, two for a Unix PTY child.
- **No shell, ever.** On Windows, `.cmd` and `.bat` run through `cmd.exe` with batch-safe quoting, or are refused.
- The traps behind these rules are in the `omni-os-traps` skill.

## 8. File size

At most 650 lines per code file (400 is the target). Split inside your module before 600. Check with
`python3 scripts/file-size-guard.py`. Documents are not counted.

## Review checklist

- No import points up the layer table. No seam signature changed without a lead decision.
- `messages.rs` changed only by appending a block.
- No new dependency or `windows-sys` feature without the lead's yes. Every `unsafe` sits in an allowed place with
  `// SAFETY:`.
- Public changes: contract, `index.d.ts`, the Rust `api`, `parity.txt`, docs and skills move together.
- Protocol changes: `VERSION`, `docs/protocol.md`, codec tests, client and supervisor move together.
- No `tokio::process`, no host-side signal handling, nothing blocking on the host's threads.
- The gates are green (`omni-gates` skill).
