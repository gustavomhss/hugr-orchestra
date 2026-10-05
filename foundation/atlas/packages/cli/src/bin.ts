#!/usr/bin/env node
// @atlas/cli — src/bin.ts  (the `atlas` entrypoint: the composed runtime, driven over argv)
//
// The thin production entrypoint: `composeRuntime(process.cwd())` reads the repo at the cwd and returns THE
// one governed durable `WiredHandler`; `main` parses argv, routes through it, and returns a process exit
// code. The handler rides the existing `CliDeps.handler` seam (frozen `main(argv, deps?)` shape unchanged),
// so prod and tests share ONE surface — prod composes the real handler, tests inject a fake (WIRE-1).
import { composeRuntime, initAst } from "@atlas/adapter-io"
import { main } from "./cli.js"

// Warm up the opt-in AST grammar ONCE at the composition driver (F1): `foldAstUnits` — the sync FileTree
// refinement `composeRuntime` folds before every `build` — reads module-level grammar singletons and is a
// no-op until `initAst()` resolves. Awaiting it HERE (the entrypoint) is why `composeRuntime` can stay sync
// yet still index `::` sub-file symbol nodes, so a symbol grounding is groundable and `subsumes` fires.
void (async () => {
  await initAst()
  const {
    handler,
    doctorSource,
    promote,
    own,
    relations,
    negations,
    transitions,
    transition,
    testVacuities,
    testVacuity,
    verifyFact,
    reverify,
    deriveRelations,
    anchors,
    slots,
    draft,
    check,
    memoryRecall,
    memoryHeader,
    memoryAwareness,
    memoryOrientation,
    budget,
    territories,
    readRefusal,
    readAdvisory,
  } = composeRuntime(process.cwd())
  // The provenance refusal rides the same injected-deps seam as the handler (conditional spread keeps it
  // ABSENT on a healthy repo — exactOptionalPropertyTypes), so prod and tests share ONE surface. `promote`
  // (the KNOW-8 governed promotion leg) rides that same seam: it is not a `Tool`, so it cannot arrive through
  // the handler, and threading it here is what makes `atlas promote` REACHED rather than a reference model.
  // `own` (the RETR-12 briefing leg) rides it for exactly the same reason, and this line is the entire
  // difference between `@atlas/retrieval` being running code and being a well-tested library nothing calls:
  // before it, EVERY import of that package from another package's `src` was `import type`.
  process.exitCode = await main(process.argv.slice(2), {
    handler,
    doctorSource,
    promote,
    own,
    // `relations` (the #99a grounded-relation read leg) rides the same injected-deps seam as `own`, and for
    // the same reason: the CLI must not stand up a second runtime, or the relations it reads stop being the
    // ones off the store `atlas query` reads back. This line is what makes `relationsOf` running code.
    relations,
    // `negations` (the #99b grounded-negation + abstention read leg) rides the same injected-deps seam as
    // `relations`, and for the same reason: the CLI must not stand up a second runtime, or the negatives +
    // abstentions it reads stop being the ones off the store `atlas query` reads back. This line is what makes
    // `negationsOf`/`abstentionsOf` running code and a fired abstention observable at the CLI (#202).
    negations,
    // `transitions` (the #234 grounded-transition read leg) + `transition` (the #234 reachable 2-rev producer)
    // ride the same injected-deps seam as `negations`/`deriveRelations`. The read leg makes `transitionsOf`
    // running code; the producer is what makes `atlas transition` a REACHED shipped path (AT-8) over real 2-rev
    // git input rather than a reference model.
    transitions,
    transition,
    // `testVacuities` (the #95 grounded test-vacuity read leg) + `testVacuity` (the reachable single-anchor
    // producer) ride the same injected-deps seam as `transitions`/`transition`. The read leg makes
    // `testVacuitiesOf` running code; the producer is what makes `atlas test-vacuity` a REACHED shipped path over
    // the repo's HEAD test units (0-false-proven) rather than a reference model.
    testVacuities,
    testVacuity,
    // `verifyFact` (the sound-genesis PROVEN-family feed) rides the same injected-deps seam as `negations`.
    // It is not a `Tool` (opens no governed surface, writes nothing), so it cannot arrive through the handler;
    // threading it here is the entire difference between `verify{Dependency,Count,Negation}` (@atlas/genesis)
    // being running code and being ledgered reference models — before it, every import of those oracles was
    // `import type`.
    verifyFact,
    // `reverify` (the REVERIFY-GATE whole-store pass) rides the same injected-deps seam as `verifyFact`. It is
    // not a `Tool` (opens no governed surface, writes nothing), so it cannot arrive through the handler;
    // threading it here is what makes `atlas verify-store` running code.
    reverify,
    // `deriveRelations` (the #99 WP-R7 sound-relation derive-and-persist leg) rides the same injected-deps seam
    // as `promote` — the other WRITE leg intercepted before the handler. It publishes through the existing emit
    // door (opens no new governed surface), so it cannot arrive through the handler; threading it here is the
    // entire difference between the mechanical relation projection (`relation-derive.ts`) being running code
    // reachable as `atlas derive-relations` and being a ledgered reference model.
    deriveRelations,
    // `anchors` (the WP-10.A1 / ADR-0004 read-only DISCOVERY planner) rides the same injected-deps seam as
    // `relations`/`transitions`. It is not a `Tool` (opens no governed surface, persists nothing — AUTHOR-2), so
    // it cannot arrive through the handler; threading it here is the entire difference between the `createAnchors`
    // planner (@atlas/tools) over the ONE `GroundingComputer` being running code reachable as `atlas anchors` and
    // being a well-tested library nothing calls.
    anchors,
    // `slots`/`draft` (the WP-10.A2-a / ADR-0004 discovery + composition planners, AUTHOR-5/6/7) ride the same
    // injected-deps seam as `anchors`. Neither is a `Tool` (opens no governed surface, persists nothing —
    // AUTHOR-2); threading them here is what makes `atlas slots`/`atlas draft` REACHED shipped paths rather
    // than reference models nothing outside a unit test calls.
    slots,
    draft,
    // `check` (the WP-10.A3.CLI / AUTHOR-11/12 read-only DRY-RUN planner) rides the same injected-deps seam as
    // `draft`. It is not a `Tool` (opens no governed surface, persists nothing — AUTHOR-2); threading it here is
    // what makes `atlas check` a REACHED shipped path over the composition root's `check` leg rather than a
    // reference model — the CLI transport counterpart of the already-shipped `atlas-check` MCP tool.
    check,
    // WP-11.W8 / CAMPAIGN-11 — the four memory READ_SURFACE doors ride the SAME injected-deps seam as
    // `anchors`/`relations`. This line is what makes `atlas memory-recall`/`memory-header`/`memory-awareness`/
    // `memory-orientation` REACHED shipped paths rather than reference models nothing outside a unit test calls.
    memoryRecall,
    memoryHeader,
    memoryAwareness,
    memoryOrientation,
    // WP-3-RETR — the RETR-8 budget + RETR-13 MISS-oracle READ doors ride the SAME injected-deps seam as
    // `memory-*`. Threading them here is what makes `atlas budget`/`atlas territories` REACHED shipped
    // paths rather than ledgered reference models (`retrieval/ledger.ts` + `offatlas.ts`).
    budget,
    territories,
    ...(readRefusal !== undefined ? { readRefusal } : {}),
    // TRAVEL-BY-REPROOF — the ADVISORY MESSAGE for a `tracked-provable` store, rides the same conditional-
    // spread discipline as `readRefusal` (ABSENT, not `undefined`, on a healthy repo — exactOptionalPropertyTypes).
    ...(readAdvisory !== undefined ? { readAdvisory } : {}),
  })
})()
