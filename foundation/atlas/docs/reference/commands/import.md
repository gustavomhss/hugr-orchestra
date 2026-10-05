# `atlas import`

Replay an OKF bundle produced by [`atlas export`](./export.md) **1:1 into a fresh empty store target** — the
PERSIST-9 inverse over the sealed kernel seam. It is a headless **store-instance** migration/seed tool: it
writes the content-addressed CAS bytes of the bundle into `<targetDir>/.atlas/cas` and nothing else.

That last sentence is the whole governance posture of this command, and it is stated here rather than
implied. A full store import into a **live** `.atlas/` would put FACT rows on disk without the governed emit
door (truth → authz → ratify → incumbent) ever seeing them — the back-channel write path ADR-0003 and the
provenance tripwire exist to close. So `atlas import`:

- **refuses a target that already hosts a store** (any `.atlas/` at all) — the import is into a provably
  fresh, empty target, and there is no merge, no overwrite, no "upsert into the live store";
- **never writes the guarded `projection` sidecar** — the mutable, served half whose rows are the defended
  facts. The imported CAS bytes are durable but inert; they become readable only by re-entering the served
  projection through a governed door. An import can never be a FACT write.

This page describes the **CLI** command `atlas import`. There is **no `atlas-import` MCP tool**: it is
intercepted at the entrypoint and driven by a headless leg (`cli/src/okf-cli.ts`).

## Invocation

```
atlas import <bundle> <targetDir>
```

- `<bundle>` — required. The path to the OKF bundle file (the `<outDir>/atlas-okf.json` `atlas export`
  wrote).
- `<targetDir>` — required. The FRESH EMPTY directory to replay into. It must not contain an `.atlas/`
  directory at all — a target that already hosts a store is **refused** (exit 1), never merged into.
- No flags. After importing, run `atlas init` in the target (it installs the `.gitignore` rule that keeps a
  future `git add -A` from turning the migrated store into evidence of nothing).

## Worked example

The mirror of the `atlas export` example on the facing page; the exported (here still empty) bundle replays
into a fresh directory:

```
$ atlas export out
status: ok
next: OKF bundle of the durable store written to 'out/atlas-okf.json' — 0 CAS object(s); replay it INTO A FRESH STORE with 'atlas import <thisBundle> <freshTargetDir>'
invariant: PERSIST-9: the WHOLE store dumps to self-contained open JSON over the SEALED kernel OKF seam — no proprietary encoding, no host path, no lock-in on git; the dump replays 1:1 into a fresh store
export: 0 CAS object(s) dumped — located, not copied
# exit 0

$ atlas import out/atlas-okf.json fresh
status: ok
next: 0 CAS object(s) replayed 1:1 into a FRESH store at 'fresh/.atlas/cas' — the guarded projection is NOT written; serve these facts only through the governed emit door ('atlas init' installs the .gitignore deny if this target is a git repo)
invariant: PERSIST-9/ADR-0003: import replays the OKF dump 1:1 into a FRESH EMPTY store ONLY — CAS bytes yes, the guarded projection NEVER, so an import cannot become a back-channel FACT write past the governed emit door
import: 0 CAS object(s) replayed — verified byte-identical after writing
# exit 0
```

The refusal, demonstrated against a non-fresh target (here the current repository, whose `.atlas/` already
holds its `policy.json`):

```
$ atlas import out/atlas-okf.json .
status: error
next: target '.' already hosts an Atlas store ('.atlas/' exists) — 'atlas import' replays ONLY into a FRESH EMPTY store target and NEVER into a live one, so a full-store import can never become a back-channel write path for FACT rows past the governed emit door
invariant: PERSIST-9/ADR-0003: import replays the OKF dump 1:1 into a FRESH EMPTY store ONLY — CAS bytes yes, the guarded projection NEVER, so an import cannot become a back-channel FACT write past the governed emit door
reason: atlas import : target '.' is not a fresh empty store
# exit 1
```

The integrity discipline on the way in, all fail-closed, in order:

1. **fresh-target check first** — a target that already hosts a store is refused before the bundle is even
   read. Nothing is ever merged, appended, or upserted into a live store.
2. **the kernel replay is all-or-nothing** — `importCas` rejects a malformed bundle (bad JSON, a missing OKF
   envelope, or an entry whose key is not the content address of its value). Nothing is written.
3. **verify-then-report** — after writing, the fresh store is read back and must equal the replay exactly
   (PERSIST-9, byte-identical) before `status: ok` is printed.

## Exit codes

| code | meaning                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | every bundle object replayed and the fresh store verified byte-identical                                                                   |
| `1`  | a missing `<bundle>`, a malformed bundle (fail-closed, nothing written), a `targetDir` that already hosts a store, or an unwritable target |
| `2`  | a governance gate refused at the entrypoint (the committed-store tripwire on the repository the command was invoked in)                    |

The refusal of a non-fresh target is exit **1** — a usage error: the invocation named a target the command's
contract excludes. It is not exit 2 (a well-formed invocation a gate declined); there is no gate here, there
is a contract.

## What it refuses, and why

**A live store.** The `targetDir` must be fresh. This is the entire answer to the confused-deputy question
ADR-0003 exists for, and it is a refusal, not a warning.

**The guarded projection.** The bundle carries the CAS, and the CAS is what import writes. The `projection`
sidecar is derived, mutable, and the surface a door-holding fact is served from — it is rebuilt only by the
governed write path, so an import cannot mint a readable row.

**A malformed bundle.** Partially replayed is refused wholesale: `importCas` is all-or-nothing, so a
tampered or garbled dump can neither fabricate a fact under a real address nor leave a half-store behind.

## Related

- [`atlas export`](./export.md) — the dump half: same OKF bundle, written from the whole store.
- [`atlas init`](./init.md) — run it in the target after importing; the structural move-in that installs the
  `.gitignore` deny rule.
- [`atlas emit`](./emit.md) — the governed door an imported fact must still walk to become readable.
