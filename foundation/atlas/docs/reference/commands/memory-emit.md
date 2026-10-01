# `atlas memory-emit`

The governed **MEMORY** write door (CAMPAIGN-11, WP-11.W8) — the ONE path a `MemoryEntry` reaches the durable
per-seat memory log (`.atlas/memory.jsonl`). You hand it an entry as a JSON file; it derives the entry's
`kind` from its shape, runs it through the SEVEN fail-closed MEM gates (kind derivation, template, partition

- owner, logbook discipline, cap, pre-write secret scan, persist), and either appends it or tells you which
  gate said no.

This page describes the **CLI** command `atlas memory-emit`. The MCP tool is `atlas-memory-emit`. It is a
genuinely NEW governed write door, distinct from [`emit`](./emit.md)/[`link`](./link.md): the durable log it
appends to is a SEPARATE store from the knowledge CAS those two write, so it is its own member of
`WRITE_PATHS` (`packages/tools/src/handler.ts`) rather than a fold into an existing one.

## Invocation

```
atlas memory-emit <entryJsonPath>
```

- `<entryJsonPath>` — required. A file holding one `MemoryEntry` as JSON — a `project` rule (`{rule, scope,
frecency, grounding?}`), a `task` record, a `pr` record, or a `logbook` entry (see
  `docs/reference/atlas-memory.md`). There is no `--at`: memory carries no source@sha anchor requirement.
- The entry's `kind` is never a flag or a field you set — `memoryKindOf` derives it from which template's
  required fields are present and no OTHER template's are (MEM-2). An entry that matches zero or more than
  one template is refused `undetermined-kind`, never guessed.

The **owner** is the same `actor` identity every other governed write door reads (KNOW-11: `ATLAS_ACTOR` env,
else `git config user.email`, else `''` — fail-closed to "every write denied"). It is resolved ONCE by the
composition root and is **never** a flag or a field this door reads off the entry: a caller cannot choose who
a write is attributed to (D1 — the confused-deputy hole this door structurally cannot reopen).

## Worked example — the honest default: no scanner on `PATH`

MEM-9 refuses **every** write when no named secret scanner (`gitleaks` / `trufflehog`) is on `PATH` — "not
checked" and "no secret" are never the same value (`packages/adapter-io/src/scanner.ts`). This is the real,
reproducible behavior of a fresh environment (this repository's own CI carries neither binary), so it is the
transcript below rather than a hand-edited "success" case that would not reproduce everywhere this page is
read:

The entry file:

```json
{ "rule": "prefer named exports over default exports", "scope": "src", "frecency": 1 }
```

```
$ ATLAS_ACTOR=dev@example.com atlas memory-emit project-entry.json
status: rejected
next: a refused write named the gate that declined (undetermined-kind / template-invalid / kind-conflation / unowned / logbook-duplicate / logbook-unauthorized / over-cap / scanner-blocked / scanner-unavailable) — fix and re-emit; nothing is persisted on a refusal
invariant: MEM-1..9 / WP-11.W8: atlas-memory-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link, atlas-memory-emit — GOVERNANCE_SURFACE six members) — one append on admission, nothing on refusal
reason: scanner-unavailable: MEM-9 pre-write scan: no NAMED scanner is configured, so this write was not checked for secrets. "Not checked" and "no secret" are refused as the same value — and so are "not checked" and "a secret was found".
# exit 2
```

Install `gitleaks` or `trufflehog` on `PATH` to unblock every other gate. With a clean payload and a real
scanner, an admitted write renders:

```
status: ok
next: a refused write named the gate that declined […]
invariant: MEM-1..9 / WP-11.W8: […]
data:
  owner: dev@example.com
  kind: project
# exit 0
```

(The `next:`/`invariant:` guidance lines are a CONSTANT per tool — like `atlas emit`'s, they do not describe
the outcome; read `status:` and `data:`.) A `MemoryRecord` carries no CAS content address of its own (unlike
a knowledge `GroundedFact`) — `owner`/`kind` are its two structural fields, and that is what the receipt shows.

## Exit codes

| code | meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| `0`  | the entry was admitted and appended to `.atlas/memory.jsonl`; `data.owner`/`data.kind` name the record |
| `1`  | usage error — missing entry file, unreadable file, malformed JSON                                      |
| `2`  | a MEM gate refused the write. Nothing was persisted                                                    |

## What it refuses, and why

Each refusal names the gate that fired, as a machine-readable discriminant (`reason:`, prefixed
`<refusal>: <human reason>`):

- **`undetermined-kind`** — the entry's keys match zero, or more than one, of the four templates.
- **`template-invalid`** — the DERIVED kind's template is missing a required field, or the entry carries a
  key outside that template's fixed set (MEM-5 — a logbook entry may not smuggle free-form prose outside its
  five fixed sections).
- **`kind-conflation`** / **`unowned`** — the partition+owner mint (`put`) rejects a memory write into the
  knowledge partition, or a write with no resolved actor (see "the owner" above).
- **`logbook-duplicate`** / **`logbook-unauthorized`** — MEM-8: only the logbook author may append, and only
  once per PR (a correction is a superseding append, never a rewrite).
- **`over-cap`** — MEM-3: a `project` write that would push the owner's own token budget over its cap; the
  receipt (over MCP, or `reason:` here) carries the measured `tokens`/`cap`.
- **`scanner-blocked`** — MEM-9: the named scanner found a hit. The scanner's own name rides the reason, so a
  block is attributable.
- **`scanner-unavailable`** — MEM-9: no named scanner is configured, OR the configured one could not run to
  completion. See the worked example above.

Usage errors are a different class and exit `1`, not `2`:

```
$ atlas memory-emit missing.json
status: error
next: memory-emit: cannot read entry file 'missing.json'
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: memory-emit: cannot read entry file 'missing.json'
# exit 1
```

## Authority

`atlas memory-emit` binds the `atlas-memory-emit` `Tool` directly — it is a `GOVERNANCE_SURFACE` member and a
`WRITE_PATHS` member (`packages/tools/src/handler.ts`). It routes through the ONE wired handler exactly like
`atlas emit`/`atlas link`, so the CLI and the MCP tool `atlas-memory-emit` drive the SAME body and answer
byte-identically for identical input (INV-MCP-4).

## Related

- [`memory-recall`](./memory-recall.md) — the one explicit path to read task/pr/logbook memory back.
- [`memory-header`](./memory-header.md) — where an admitted `project` rule shows up on a later turn.
- [`emit`](./emit.md) / [`link`](./link.md) — the two knowledge-CAS write doors this door does NOT fold into.
