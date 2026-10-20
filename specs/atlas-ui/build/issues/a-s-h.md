# Lanes A-S and A-H: issues and the fixes the briefs assume

Each item names the problem, the fix the briefs assume, and who must act. Lead decisions are marked as such.

## Lead decision D3b (binding, extends D3)
- The snapshot also carries four real sources the Ownership, Memory and territory views need. Top-level keys:
  - `own`: the committed Own snapshot as Orchestra reads it. `OWN-SNAPSHOT.json` through `parseOwnSnapshot`,
    `.orchestra/skills/own/OWN-COVERAGE.json` through `parseStaticOwnCoverage`, and every
    `.orchestra/skills/own/**/SKILL.md` with its size and first 4096 bytes. `null` when `OWN-SNAPSHOT.json` is absent.
  - `memory`: `.atlas/memory.jsonl` records grouped by member, through `createDurableMemory().read()`: eventId, seq,
    member, kind, text (rule / lesson / decisions / shipped), scope, at, refs, and the whole entry. `{}` when absent.
  - `orientation`: `.atlas/orientation.jsonl` events through `createDurableOrientation().read()`. `[]` when absent.
  - `territories`: `TERRITORY-CATALOG.json` through `parseTerritoryCatalog`: name, owner, tier, globs. `[]` when absent
    or refused.
- Where it lands: shapes in `surface/types-memory.ts` (A01), reader `surface/read-own-memory.ts` (A04b), schemas in
  `groups/atlas.ts` (A08).
- Choices made inside it:
  - Files are read from the repository root, where `maestro/atlas-source.ts` reads them.
  - `inspectOwnSnapshot` is not used. It lives in `host-context.ts`, a ledgered reference model, and a production
    caller would change its ledger row. `parseOwnSnapshot` gives the same READY/HOLD answer; HOLD carries the reason
    `snapshot-invalid`, the same reason string.
  - A memory record carries no time except a logbook's `at`. `at` is null for the other kinds rather than invented.
- Lane A-U typechecked its model against the earlier A01. It must take the four new keys; `atlasFixture()` (A15a)
  needs `own: null, memory: {}, orientation: [], territories: []`.

## Snapshot deviations from extract.py (D3 says "exactly"; these are the only differences)
- `state: "ok"` is added (D5 needs the discriminator) and `project` is the repository's base name, not `"atlas"`.
- extract.py crashes on some inputs; the surface answers instead:
  - a missing row field reads as "" (`claim`, `file`, `tier`, `scope`);
  - missing CAS bytes read as null CAS fields, and `anchor` is then null;
  - a missing `derivedAt` falls back to the sidecar's `builtAt`, then "";
  - a missing or broken mirror file reads as empty.
- `git ls-files -z` replaces `git ls-files`, so paths are never quoted.
- One `git cat-file --batch-check` replaces two `rev-parse` per fact (596 facts made about 1,200 synchronous git
  processes).
- A rev from the store is used only when it is hex. A crafted `derivedAt` such as `--output=…` would otherwise reach
  `git diff` as an option.

## runGit maxBuffer (A03 edits a file outside `surface/**`)
- `run-git.ts` passes no `maxBuffer`, so Node's 1 MiB default applies.
- On this repository, `git ls-files -s -z` is 1.4 MB (measured 2026-10-18). Past the limit `execFileSync` throws, and
  `fs.ts` `walkFileTree` reads the throw as an empty tree. So `composeRuntime` over the Orchestra repository sees no
  files, and `own`, `draft` and `health` would answer as if the repository were empty.
- Fix: A03 adds a fixed 256 MiB `maxBuffer` to `runGit`. It is one seam, and every git caller benefits.
- Side effect: `boundary/src/generated/native-header.js` bundles `runGit`, so its bytes change. A03 and A06 must land
  together.

## reference-model ledger (A05a edits `harness/gates/reference-model-guard.mjs`)
- `surface/index.ts` exports `openSurface`, and its only consumer is the host through the boundary. The gate therefore
  sees a new reference model.
- A05a adds the row `{ values: 1, shipped: null, banner: true }`, the header banner, and moves DECLARED COUNTS from
  40/145 to 41/146.
- Merge conflict: B-L02 adds a row (`review-log.ts`) and B-K removes `align.ts` (D17) on the same header line. The lead
  recomputes the line at merge; A05a stops if the line differs.
- The other surface modules are value-imported by `index.ts`, so they are live.
- Until A05a lands, A02–A04b's modules have no importer and the guard fails. Land the lane as one unit.

## Boundary bundle (A06): dependencies, determinism, generation
- The surface bundles the composition root. That brings in `@c4312/scip` (and through it `@bufbuild/protobuf`) and
  `web-tree-sitter`, which the root `bun install` does not provide to the boundary today.
- The fix A06 assumes:
  - boundary `devDependencies` gain `@c4312/scip@0.1.0` and `@bufbuild/protobuf@2.12.1`, the versions in Atlas's
    package-lock;
  - the build plugin resolves `@c4312/scip` from the boundary package, like `@noble/hashes`;
  - `web-tree-sitter@0.23.2` becomes a boundary runtime `dependency` and is EXTERNAL to the bundle. It is imported at
    load but used only by `initAst()`, which the surface never calls. Keeping it external also keeps the emscripten
    loader out of the committed bytes. The root's `web-tree-sitter@0.25.10` has a different default export, so the
    boundary must resolve its own copy;
  - `script/tsconfig.json` maps `@c4312/scip` to its `index.d.ts` (the raw `index.ts` trap that
    `scripts/fix-scip-types.mjs` documents) and `web-tree-sitter` to the boundary copy.
- Risk: the declaration build compiles the whole adapter-io graph under the boundary's looser tsconfig. That is the
  first time this graph is compiled there. If `bun run generate` reports type errors, the fix belongs in that tsconfig.
- Workers may not run generators. `bun install` (which updates `bun.lock`), `bun run generate` and the SDK build (A10)
  are lead steps, written into A06 and A10.
- `build.test.ts` regenerates all bundles 22 times, and the new bundle is the heaviest. Its timeout goes from 480 s to
  900 s; Windows may still need more.

## Spawn allow-list (A06b edits `script/spawn-allowlist.json` and the omni doc). Lead decision required.
- `generated/surface.js` imports `node:child_process` (Atlas's `run-git.ts` and `scanner.ts`). The allow-list says
  "new exceptions require a lead decision and a reason in orchestra-integration.md §3".
- A06b adds both, modeled on the `native-memory.js` row. The lead must approve it. Without it, the spawn-import gate
  fails.

## Exerciser scenarios (A11 edits two files outside `test/server/atlas-*.test.ts`)
- `test:httpapi --fail-on-missing` fails on any route without a scenario.
- A11 adds `test/server/httpapi-exercise/atlas.ts` and spreads it from `project.ts`.
- `httpapi-exercise/index.ts` is a 1,370-line legacy godfile that may not grow.

## Cost and blocking (accepted for phase A; Track C or later)
- `own`, `health` and every write call `composeRuntime` on each request. That walks and hashes the whole tracked tree
  and decodes the index, synchronously, on the server's event loop.
- `snapshot`, `reasoning` and `verify` do not compose. The UI computes briefing and health client-side from the snapshot
  (the model.js port), so the composing routes run only on explicit actions.
- If the walk is too slow on large repositories, the next step is a worker thread or a runtime cached per
  (HEAD, index mtime). Neither is built now.

## Ratify token (A05a)
- Writes need `ATLAS_RATIFY_TOKEN`, which `composeRuntime` reads from the environment once (compose.ts:175). D2 forbids
  editing compose.ts.
- The surface sets the variable for exactly one synchronous `composeRuntime` call and restores it before returning.
  The call is synchronous, so no other JavaScript can observe it.
- A05b proves the token reaches the ratify gate, and its mutation probe removes the line to show the test fails.

## verify without compose (A05a)
- `verify` builds the verify-fact leg the way compose.ts:254 does: `createVerifyFactLeg(readScipOrEmpty(scip),
  { indexerName })`. It reads only the index, so it does not walk the tree.

## Health adds `actor`
- `health.actor` uses the same resolution as compose.ts:170, so the screen's "writing as" shows the real actor instead
  of the mock's constant.
