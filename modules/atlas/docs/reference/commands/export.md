# `atlas export`

The whole durable store of the repository at your current directory, dumped out as one self-contained
open-JSON (OKF) bundle file. It is the PERSIST-9 face of the portable source: the CAS is content-addressed
and its every object is carried verbatim, over the **sealed** kernel serializer — no proprietary encoding,
no host path, no lock-in layered on top of git. The bundle replays 1:1 into a fresh store with
[`atlas import`](./import.md).

It is a **store-instance** operation, not a read door over the composed runtime: it walks the durable
`<repo>/.atlas/cas/**` directory directly and writes a bundle FILE. It opens no write path into any store
and carries no governed fact-write token. It is the `export` half of a headless migration/backup tool — the
mirror is `atlas import`, which writes into a **fresh empty target only**.

This page describes the **CLI** command `atlas export`. There is **no `atlas-export` MCP tool**: the
governed surface is unchanged — the command is intercepted at the entrypoint and driven by a headless
leg (`cli/src/okf-cli.ts`), exactly as `mine` and `doctor` are.

## Invocation

```
atlas export <outDir>
```

- `<outDir>` — required. The output **directory** the bundle is written into as `<outDir>/atlas-okf.json`
  (created recursively if absent). The store exported is always the one at the current working directory —
  the same repository every other `atlas` command reads.
- No flags.

## Worked example

A fresh repository, `atlas init`-ed but with nothing filed yet: the store is honestly empty, and the export
of an empty store is the empty bundle — 0 CAS objects, still a valid dump that replays 1:1:

```
$ atlas export out
status: ok
next: OKF bundle of the durable store written to 'out/atlas-okf.json' — 0 CAS object(s); replay it INTO A FRESH STORE with 'atlas import <thisBundle> <freshTargetDir>'
invariant: PERSIST-9: the WHOLE store dumps to self-contained open JSON over the SEALED kernel OKF seam — no proprietary encoding, no host path, no lock-in on git; the dump replays 1:1 into a fresh store
export: 0 CAS object(s) dumped — located, not copied
# exit 0
```

The bundle itself is one self-describing JSON document:

```json
{ "format": "atlas-okf", "version": 1, "objects": {} }
```

For a repository whose store holds facts, `objects` carries **every** CAS object, keyed by its content
address and byte-identical to what is on disk. Export is not a query: it dumps the whole durable store, not
a projection — no tier filter, no freshness filter, nothing served that is not stored.

## Exit codes

| code | meaning                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------- |
| `0`  | the bundle was written — including the honest empty bundle of an empty store                            |
| `1`  | a missing `<outDir>`, an unwritable output directory, or an unreadable store root                       |
| `2`  | a governance gate refused (the committed-store tripwire, applied at the entrypoint before this command) |

## What it refuses, and why

**Writing into a store.** `export` writes one bundle FILE and nothing under any `.atlas/`. It is the clean
half of the pair.

**Exporting a committed store.** The entrypoint provenance tripwire applies to this command like every
other: a durable store that arrived by COMMIT is one nobody can show through a gate, and `export` declines
to spread it.

## What it is for

Migration between machines, and a safe backup you can `git`-track separately (the bundle is ordinary
self-contained text). The receiver replays it with [`atlas import`](./import.md) into a fresh store.

## Related

- [`atlas import`](./import.md) — the 1:1 replay half: same OKF bundle, a fresh empty target, CAS bytes
  only, never the guarded projection.
- [`atlas query`](./query.md) — the _served_ projection of the same store, the thing you read rather than migrate.
- [`atlas doctor archive`](./doctor.md) — a read-only integrity audit over the same CAS root.
