---
name: archie-work-package-native-fields
description: "Native Relay sprint field reference: the exact keys of RelaySprint.Sprint."
when: "Writing or checking any key of a native work package proposal."
not-when: "Choosing the method or shape: that is the native proposal node."
---

# Native Relay sprint field reference

Exact keys of `RelaySprint.Sprint` (source: `packages/schema/src/relay-sprint.ts`, which you cannot read from the project). Use these names byte for byte. Unknown keys are preserved on disk but ignored by the runtime, so a misspelled or invented key (`command`, `kind` on a control, top-level `controls`, `objective`, `write_scope`, `read_scope`) silently does nothing. Put objective and read/write scope in `instructions`.

## Sprint keys

- `brief`: string; global context, criteria, coverage and source refs.
- `gen`: number; ledger generation, default 0. Not a proposal version.
- `retry_budget`: integer; default 3.
- `macros`: array of macro objects (`id`, `title`, `instructions`); context grouping only.
- `knowledge`: array of at most 8 unique Atlas references (below); sprint-wide.
- `work_packages`: required array of WorkPackage objects, in order.

## WorkPackage keys

- `id`: required nonempty string without NUL.
- `title`: string.
- `macro`: string or null; the `id` of a macro.
- `kind`: one of `execute`, `gate`, `review`, `inject`, `human`. `human` is accepted but unsupported by the arm.
- `instructions`: string; objective, exact read/write scope, inputs, outputs, criteria deltas.
- `self_check`: array of strings; not evidence.
- `knowledge`: array of at most 8 unique 64-character lowercase hex strings, never objects. Each is the `reference` returned by `atlas_context` with `{"action":"anchor", target, units}`; one anchor can cover up to 8 units. Unit reads return other 64-hex hashes (`contentHash`, `receiptHash`, `bodyHash`, `sourceIdentity`) that decode but will not bind; never use those.
- `checklist`: array of Control objects, or null. Missing, null and `[]` all mean no controls.
- `dod`: legacy commands (`id`, `cmd`); ignored by the arm. Do not author.
- `file`: `inject` payload path relative to the workdir; wins over `text`.
- `text`: inline `inject` payload.

## Control keys

A control grades by exactly one of `cmd`, `judge` or `host_check`. An assert-only control fails.

- `id`: required nonempty string without NUL.
- `assert`: string or null; display text only, never grades (defaults to the `id`).
- `cmd`: string or null; bash command whose exit code grades the control.
- `judge`: string or null; criterion graded by a reviewer.
- `blocking`: boolean; only governs `judge` controls. A failing `cmd` always fails.
- `diff`: boolean; the control sees the diff.
- `context`: string or array of strings; extra material for a judge.
- `paths`: array of strings; scope for a judge.
- `origin`: string; where the control came from.
- `policy`: string; policy label.
- `host_check`: identifier (`[A-Za-z0-9][A-Za-z0-9_-]{0,95}`) of a registered host callback instead of bash. Only use IDs the host supplied.

## Minimal valid example

Global acceptance host checks sit on the last WP's checklist.

```json
{
  "brief": "Add the export command. Acceptance: export writes the file; package verification and cold review pass.",
  "retry_budget": 3,
  "work_packages": [
    {
      "id": "wp-1",
      "title": "Implement export",
      "kind": "execute",
      "instructions": "Objective: add export. Read: src/cli.ts. Write: src/export.ts, src/cli.ts.",
      "knowledge": ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
      "checklist": [
        { "id": "export-test", "cmd": "bun run test:ci pkg test/export.test.ts" }
      ]
    },
    {
      "id": "wp-2",
      "title": "Global acceptance",
      "kind": "gate",
      "instructions": "Run the global acceptance checks.",
      "checklist": [
        { "id": "package-verification", "host_check": "package-verification" },
        { "id": "cold-review", "host_check": "cold-review" }
      ]
    }
  ]
}
```
