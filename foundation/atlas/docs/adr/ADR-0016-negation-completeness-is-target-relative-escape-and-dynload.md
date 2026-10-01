# ADR-0016 — A negation's completeness test is TARGET-RELATIVE (escape + dynamic-module-load), not scope-blanket

**Status:** RATIFIED (owner, 2026-08-13) — amends a ratified invariant: ADR-0015 D3, the honest-abstention law.
Ratification followed an independent cold adversarial review (lucy) that reproduced a false-admit; the fix
(the `dynamic-reach` leg) + full artifact reproducibility are folded in below. Build order: M2 (wire the gate
into `governed-emit-negation.ts`) → M3 (net-recall + 0-false-admit benchmark against the tsc oracle).
**Closes:** the measured recall floor of #99b — the shipped negation door admits **0** negatives on real code.
**Amends:** ADR-0015 **D3** (negation is groundable only where completeness is decidable). It does NOT loosen the
honesty law; it makes the SOUNDNESS TEST more precise, so the door stops abstaining where it provably need not.
**Depends on:** `@atlas/adapter-io` `src/escape/` (the language-blind escape engine, shipped + tested under #99).

## The problem, measured

ADR-0015 D3 ratified: a closed-world negative ("no unit `relationKind`s X within directory scope S") is SOUND
only if the negated relation was computed COMPLETELY over S. The shipped door (`governed-emit-negation.ts`
gate 1b) implements completeness as a **scope-blanket** test: `holeSources() ∩ S ≠ ∅ ⇒ ABSTAIN (scope-open)`,
where a hole is any reference whose target has no in-index definition. On real code this abstains on
**everything**: measured on Atlas itself, **559/609 files (92 %) are hole sources** (every directory statically
imports `node:*` / an npm package / a `.d.ts`), so **0 of 14 package scopes and 0 of 19 leaf directories are
hole-free**. The door is sound by universal abstention — 0 recall. That is the #99 product limit, quantified
(`spike-negation-a1.mjs`: admit=0, refute=2078, abstain=59900, all `scope-open`).

The scope-blanket test is **too coarse**: a `import {readFile} from 'node:fs'` hole in S cannot possibly be a
hidden reference to an atlas symbol X — `node:fs` does not define X. Blanketing on _any_ hole throws away every
negative to guard against holes that were never a channel to the target.

## The decision — the completeness test is a function of the TARGET X, not of the scope alone

Replace the scope-blanket gate with a **target-relative** one. A negation "X is not `relationKind`d in S" is
ADMITTED iff **all** hold (else ABSTAIN, or REFUTE if a caller is found):

```
resolves(X)                          -- X has an in-index definition (else the negative is vacuous; #220, unchanged)
∧ ¬escape(X)                         -- X never flows into shared mutable state reachable from outside its refs
∧ (S has NO dynamic-reach)           -- S has no opaque dispatch that could reach X without a static X-reference
∧ reverseCallers(X) ∩ S == ∅         -- no static caller of X inside S
```

**dynamic-reach(S)** = S contains any of: `import(nonliteral)` / `require(nonliteral)` (a dynamic MODULE load
that could pull X's module) · a computed member access `ns[nonliteral]` on a namespace-import binding
(`import * as ns from './m'; ns[k]()` reaches X with no static X-reference) · `eval(…)` / `new Function(…)`
(opaque string-dispatch). Each is an undecidable-target channel through which S could invoke X while the index
emits no occurrence of X; all are conservative abstentions (`scope-dynamic`). This set REPLACES the narrower
"dynamic-module-load" of the first draft — a **cold review (lucy) reproduced a false-admit** with a static
`import * as ns` + `ns[key]()` that the module-load-only test missed (see §Soundness 3).

A **pure-type** X (runtime-erased: an interface / type alias, never a value) skips the `¬escape` and
dynamic-load legs — it cannot be reached through any runtime channel; its only references are static and the
index sees them all. `escape(X)` is decided by the language-blind escape engine (`@atlas/adapter-io/escape`): X
ESCAPES iff any reference to it sits in a non-safe syntactic position (an argument, an assignment RHS, a
collection element, a member/subscript base, the operand of `as`) as opposed to a safe one (the callee of a
call/`new`, an import/export binding, or a type position). The dynamic-load signal is a tree-sitter scan of S
for a module load with a non-literal specifier (implementation seam — lead's call, see §Implementation).

**Why this is not a loosening of D3.** D3's law is "admit only a negative you can PROVE complete." This ADR does
not admit any negative D3 would call a lie — it PROVES completeness by a tighter, sound argument (below) that
happens to hold far more often than the scope-blanket proxy. The honesty law is unchanged; the _proof_ got sharper.

## Soundness argument (proven against the code + measured, not asserted)

The claim: for a resolvable X, if `¬escape(X)` and S has no dynamic-module-load, then
`reverseCallers(X) ∩ S == ∅ ⟺ X is genuinely un-`relationKind`d in S` — so the `holeSources ∩ S` guard may be
DROPPED. Three ways S could reach X without a counted `reverseCaller`, each closed:

1. **A static reference to X that the index filed as a HOLE.** IMPOSSIBLE by construction.
   `symbol-reverse.ts` (lines 85–96) classifies every reference occurrence into _exactly one_ of: RESOLVED (its
   symbol, or its `canonicalizeSymbol` src-form, is in `defs`) → bucketed as a caller; or UNRESOLVED → its doc
   becomes a hole source. `resolves(X) ≡ X ∈ defs`. So any reference to a resolvable X resolves to X and is a
   counted caller — it is NEVER a hole. A hole is a reference to some _other_, undefined symbol; it cannot be a
   disguised reference to X. **Disjointness is code-proven, not assumed.**

2. **X's VALUE escapes into shared state** (a global/registry/DI container/prototype) that a scope not naming X
   reads. Closed by the `¬escape(X)` leg: if X escapes anywhere, abstain (`escape-open`). The escape test is
   sound-by-over-approximation (it counts more positions as escape than strictly necessary — costs recall, never
   soundness) and was validated to **100 % agreement, 0 unsound, over every shared atlas-export target**
   (N≈1139 at this writing; the probe recomputes N as the corpus changes — the load-bearing facts are AGREE=100%
   and UNSOUND=0, not the exact count) against an
   independent tsc type-checker escape oracle (`ts-escape-agree.mjs`).

3. **An OPAQUE DISPATCH in S reaches X with no occurrence the index emits.** Four channels, all closed by the
   `dynamic-reach(S)` leg (abstain `scope-dynamic`): (a) `const m = await import(var); m.X()` — a dynamic module
   load pulls X's module; (b) `import * as ns from './m'; ns[key]()` — a **static** namespace import + a computed
   member access reaches X while the index emits an occurrence for `ns`/the module, NEVER for X (this is the
   false-admit a cold review empirically reproduced against the real `scip-typescript`: all four original
   clauses passed while `run()` called X — the module-load-only test did not fire on a static namespace import);
   (c) `eval(str)` / `new Function(str)` — string dispatch. In every case X is reachable yet un-referenced, so
   bounding the target is undecidable ⇒ conservative abstain. **This is the deeper soundy boundary, stated
   plainly: the escape engine and `reverseCallers` are sound only over the occurrences SCIP actually EMITS; an
   opaque dispatch is exactly where SCIP under-emits within S, and `dynamic-reach` is the catch-all that abstains
   there.** Measured cost on Atlas: **0 of 14 package-src scopes** contain any dynamic-reach construct (226
   files, 0) — the leg is free here; codebases with heavy reflective dispatch pay more, which is correct (those
   are where a negative is genuinely undecidable).

**The one glossed premise, surfaced and measured — canon completeness.** Point 1's disjointness assumes the
index RESOLVES every static reference to a resolvable X (directly or via `canonicalizeSymbol`, #189). If a
future SCIP form emitted a static reference to X under a symbol string that neither equals X nor canon-maps to
it, that reference would be misfiled as a hole _about X_, and dropping `holeSources` would false-admit. Measured
on Atlas: the residual — a hole in a `src/` doc whose symbol is an `@atlas/*` GLOBAL top-level export that
canon missed — is **~0** (the 65 raw candidates are all nested type-literal member navigations, e.g.
`DepClaim#typeLiteral43:target`, which are runtime-erased type members, not value references; the broader
1032/1321 name-collisions are external packages (`@vitest/runner` `describe`) and test-file locals, neither a
resolvable target). Canon is complete for the `scip-typescript` indexer. **This is the documented soundy
boundary: it MUST be re-measured per indexer** — a non-TS indexer with a different symbol scheme could reopen it,
so the gate carries a per-indexer canon-completeness check, and abstains for an indexer that has not passed it.

_A second, direction-opposite canon risk (cold review):_ `canonicalizeSymbol` (`build.ts:190-193`) could in
principle map a bundled/flattened `.d.ts` reference onto a WRONG-but-real src symbol X′≠X. Then a real caller of
X is bucketed under X′, `reverseCallers(X)` misses it, and the gate false-admits "X uncalled." This is the same
soundy boundary (canon correctness), not a new one — the per-indexer canon check MUST verify canon is
INJECTIVE-enough (no two distinct source symbols collide under canon), not merely surjective. On Atlas the
measured residual is ~0 in both directions; the check is the gate's enabling precondition per indexer.

## Recall — the win, honestly bounded

The sound-groundable ceiling (escape analysis, ~1301 exported top-level Atlas targets; `escape-recall-ceiling.mjs`
recomputes): **86.2 %** — 73.6 % of value targets are non-escaping (a conservative floor; the syntactic escape
over-approximates) + 623 pure types (48 %, the always-sound path) — vs **0 %** shipped. The remaining ~26.5 % of values that escape abstain
honestly (they would need a real points-to analysis, deferred). The `dynamic-reach` leg subtracts scopes with
an opaque-dispatch construct — measured **0 of 14 (0 %)** on Atlas, so it costs no recall here; a
reflection-heavy codebase pays more, correctly. M3 measures the _net_ admit rate + the 0-false-admit property
against the independent tsc reference oracle (INCLUDING the reproduced namespace-computed-access case) before
this ships enabled.

## Implementation (seam — lead's call, not a ratification item)

- `escape(X)` reuses the shipped `@atlas/adapter-io/escape` `tsEscapeClassifier` (the one per-language piece),
  driven directly by a generic range⋈node join, fed raw SCIP occurrences (with ranges) ⋈ tree-sitter positions,
  keyed on **canonicalized** symbols (point 1). (The generic `computeEscaping` aggregation wrapper shipped under
  M1 was REMOVED in M2b — superseded before it had a production caller: the assembler inlines the join with
  witness sites + a fail-closed null-node verdict the `Set`-returning wrapper could not provide.)
- the `dynamic-reach(S)` signal is a tree-sitter scan of S's files for the four channels above
  (`import(nonliteral)` / `require(nonliteral)` / `ns[nonliteral]` on a namespace-import binding /
  `eval` / `new Function`) — localized to the door's adapter (does not touch the sealed `@atlas/index` layer).
  The alternative (splitting `holeSources()` in symbol-reverse) was considered and NOT taken: it puts a second
  concern into the sacred index layer for no soundness gain over the door-local scan.
- new abstention reasons on `AbstainedRecord['reason']`: `escape-open` (X escapes) and `scope-dynamic` (S has a
  dynamic-reach construct). Both are durable + readable, exactly as `scope-open` today (never a silent drop; #202).
- `scope-open` is RETAINED for the canon-completeness fail-closed and any indexer that has not passed the
  per-indexer canon check — the honest fallback to the old blanket behaviour.

**M2b landed + HARDENED (assembler side, cold-reviewed by lucy — every silent narrowing turned fail-closed or
gated).** The two legs are built in `escape/target-escapes.ts` (raw SCIP ranges via `deserializeSCIP` ⋈
tree-sitter, over **canonicalized** symbols) and `escape/dynamic-reach.ts` (door-local tree-sitter scan), wired
at both `createGovernedEmit` sites (`compose.ts`, `wire.ts`), both-or-neither. The cold review found five
false-admit paths against the "any codebase" spec (none reachable on atlas today — TS-only, tracked src,
scip-typescript, scopes under `packages/*/src`); all closed in one round:

- **Indexer gate (ADR item 2, mechanized):** `buildTargetEscapes` builds ONLY when the SCIP `metadata.toolInfo.name`
  is `scip-typescript` (the scheme `canonicalizeSymbol` is proven on); any other indexer ⇒ `undefined` ⇒ blanket
  fallback. This is the per-indexer canon-completeness enablement, in code (not just prose).
- **Channel #3 strengthened from syntactic `ns[k]` to `ns ESCAPES`:** a namespace binding referenced in ANY
  non-safe position (computed subscript, argument `f(ns)` / `Reflect.get(ns,k)`, assignment, computed
  destructuring `const {[k]:x}=ns`) is a channel; only static `ns.member` / `ns['literal']` stay safe (recall
  preserved). Subsumes the old syntactic form AND its siblings — the sound generalization of "a member of `ns`
  reached with no occurrence for it".
- **Channels #2/#4 broadened to member-callee forms** (`module.require(v)`, `globalThis.eval(s)`), not only the
  bare identifier.
- **JS-family (`.js/.jsx/.mjs/.cjs`) fail-closed:** such a file under S is a channel witness (this door parses
  only the TS grammar and a JS file CAN host every construct) — never a silent skip. A genuinely other-language
  file (`.py`/…) is skipped.
- **Stale-range guard:** the escape join fails closed (ESCAPING) when a (possibly stale) SCIP range resolves to a
  node whose text is not the reference's own descriptor name.
- **Documented residual (soundy boundary, stated not hidden):** the scan sees only `walkFileTree`'s output
  (git-tracked + readable) — a negation is a claim about the committed/indexed tree, so an untracked working-copy
  file is out of the model, and a tracked-but-unreadable file is a whole-index degrade (SCIP can't see it either).

**WIRED (M2a landed — door side).** The seam is now concrete on `NegationEmitDeps` (`governed-emit-negation.ts`)
as two ADDITIVE + OPTIONAL legs: `targetEscapes(target): string[]` (the escape sites of X — empty ⇒ ¬escape) and
`dynamicReach(scope): string[]` (S's opaque channels — empty ⇒ none). The door runs the target-relative gate
IFF **both** legs are wired (never a half-gate); with either absent it falls back to the `holeSources() ∩ S`
blanket byte-identically to #99b. Order on the v2 path: phantom guard (`resolves(X)`, #220) → `escape-open` →
`scope-dynamic` → refuted (`reverseCallers(X) ∩ S`) → admit. Proven at the composed door in
`negation-door-v2-escape.test.ts` (8 teeth incl. the recall win and the `ns[key]()` false-admit); the shipped
`negation-door.test.ts` (15) stays green unchanged (fallback path untouched). **PENDING (M2b — assembler side):**
build `targetEscapes` from raw SCIP ranges (`deserializeSCIP`) ⋈ the escape engine over **canonicalized**
symbols, and `dynamicReach` from a door-local tree-sitter scan, then populate both legs at the two
`createGovernedEmit` sites (`compose.ts` promote leg + `wire.ts` emit leg). Until M2b lands the live door runs
the sound fallback (no recall regression, no false-admit).

## Teeth (what a test must kill)

- an escaping X admitted as un-called ⇒ RED (a false-admit; the whole point of the `¬escape` leg).
- a scope with a dynamic-reach construct admitting a negation ⇒ RED — including the reproduced case
  `import * as ns from './m'; ns[key]()` (the cold-review counterexample; the module-load-only test passed it).
- a non-escaping, resolvable X with no caller in S, S static-hole-bearing but dynload-free ⇒ ADMIT (the recall
  win; today this RED-abstains).
- the `as`-operand escape case (`X as T` ⇒ X escapes) — already pinned in `escape-classifier.test.ts`.
- canon-completeness residual > 0 on the active indexer ⇒ the gate falls back to `scope-open` (never drops holes).

## What the owner must ratify

1. **The abstention test becomes target-relative** — amending ADR-0015 D3's completeness witness from
   "`holeSources() ∩ S == ∅`" (scope-blanket) to "`¬escape(X) ∧ no-dynamic-load(S)`" (target-relative), with
   `holeSources` retained only as the canon-completeness fallback. The honesty law (admit only a PROVEN-complete
   negative; abstain durably otherwise) is UNCHANGED.
2. **The soundy boundary is canon-completeness, re-measured per indexer** — the gate is enabled for an indexer
   only after its canon-completeness residual is measured ~0; otherwise it abstains via the retained `scope-open`.
3. **Escape is language-parametric** — the per-language piece is the ~15-line classifier (`classifier.ts`) +
   grammar; the generic range⋈node join that drives it names no language. Proven on TypeScript in-tree
   (100 %/0-unsound vs the tsc oracle) and corroborated on Python out-of-tree (a second grammar + classifier via
   the same generic join, correct verdicts). This honors the
   #99 "genesis runs on any codebase" non-negotiable; a full in-tree Python proof is a devDep away if required.

## Reproduction (all committed + re-runnable; run from the repo root after `scip-typescript index`)

- escape engine ⋈ tsc-oracle agreement (**AGREE 100 %, 0 unsound, 0 over-approx**, over all N≈1139 shared
  targets — N recomputed by the probe): `harness/probes/escape-ts-oracle-agree.mjs`.
- canon-completeness residual (**~0** threatening `@atlas` global-export canon-miss holes):
  `harness/probes/negation-canon-residual.mjs`.
- dynamic-reach per-scope abstention cost (**0 % of 14 atlas package-src scopes**):
  `harness/probes/negation-dynreach-cost.mjs`.
- recall ceiling (**86.2 %** sound-groundable: 73.6 % non-escaping values + 623 pure types, vs 0 % shipped):
  `harness/probes/escape-recall-ceiling.mjs`.
- 0-recall of the shipped scope-blanket door (92 % holes): `MCP-Statemachine/scripts/spike-negation-a1.mjs`.
- 2nd-language (Python) parametricity — CORROBORATING, OUT-OF-TREE (requires `tree-sitter-wasms`, not an atlas
  dep): the session probe; ratification item 3 rests primarily on the grammar-agnostic join CODE (only
  `classifier.ts` names a language) + the TS number above. If in-tree proof is required, add `tree-sitter-python`
  as a devDep and commit a runnable Python fixture test.
- module + teeth (in-tree): `packages/adapter-io/src/escape/{classifier,target-escapes,dynamic-reach}.ts`, `test/escape-classifier.test.ts` (the M1 `engine.ts` wrapper was superseded by the inlined SCIP⋈tree-sitter join and removed — `27b21e8`).

## Review provenance

Cold adversarial review (lucy, independent context, 2026-08-13) attacked all four soundness pillars. It
**reproduced a CRITICAL false-admit** — the static-namespace-import + computed-access channel — against the real
`scip-typescript`, and flagged that the first draft cited measurement artifacts that lived only in a session
scratchpad (unreproducible). Both are resolved in this revision: the gate's `dynamic-reach` leg now closes the
channel (measured free on Atlas), and every cited number is a committed, re-runnable probe above. The escape and
disjointness pillars were upheld mechanically; the cold review's core value — a found counterexample, not a
rubber stamp — is folded in here.

## M3 BENCHMARK — MEASURED end-to-end (2026-08-13, #95)

The v2 door was driven over the **exhaustive** candidate pool on Atlas itself — every joinable export target X
(1295) × every real `packages/*/src` scope S (19), keeping the meaningful negations (X defined OUTSIDE S):
**23 181 (X, S) pairs**, `relationKind:'calls'`. Ground truth is an **independent second extractor** — a
`ts.createProgram` built in the benchmark (NOT the SCIP index the gate reads) recording, per target, the files
where it is CALLED. The gate under test is the SHIPPED door (`createGovernedEmit(...).emit` on a `kind:'negation'`
node), authz made permissive so a gate-1 ADMIT surfaces as `emitted:true`. Re-runnable:
`ATLAS_NEG_BENCH=1 npx vitest run packages/adapter-io/test/negation-bench.test.ts` (needs a fresh
`scip-typescript index`).

**Headline (the soundness claim, SOTA — soundy generate-and-check):**

- **0 FALSE-ADMITS over 8 622 admits — admit-precision 100.00 %.** Every negation the gate admitted is TRUE per
  the independent tsc oracle. This is the whole point of the gate; a single false-admit would break it.
- 0 over-refute (every REFUTE corresponds to a real tsc reference).

**Net-recall (the #99 win, 0 % floor → measured):**

- SHIPPED (sound) recall: **37.4 %** (8 622 / 23 031 true scoped-negatives admitted) — vs the #99b blanket's
  ~0 %. Verdict split: admit 37.2 %, `scope-dynamic` 38.8 %, `escape-open` 23.5 %, refute 0.4 %.
- `escape-open` 23.5 % ≈ the predicted ~26.5 % target-escape rate — the escape analysis behaves as designed.

**Honest finding — the recall sink is a GRAMMAR PARSE GAP, not real dynamic reachability.** All 38.8 %
`scope-dynamic` abstentions trace to a `:unparsed` fail-close: the pinned `tree-sitter-typescript@0.23.2` cannot
parse two modern TS forms present in **11 production files** (`export type * from …` and inline
`readonly x: import('…').T` type annotations — the package barrels + `wire.ts` + `governed-emit-identity.ts`), so
`parseTsDoc` rejects the whole file on `rootNode.hasError` and the M2b hardening (correctly) fail-closes it as a
channel. This is **SOUND** (a file we cannot parse might hide a channel) but costs recall. A **parse-tolerant
ceiling arm** (drop `:unparsed`/`:js-unscanned`, keep only REAL channels) measures the recall the sound gate would
reach once those files parse: **75.7 %** (17 424 / 23 031) — matching the design ceiling (73.6 % non-escaping)
almost exactly — with the ceiling arm's extra 8 802 admits **all still TRUE per tsc (0 false-admits)**. So the
gate leaves **38.2 recall points on the table purely to the grammar's parse gaps**, recoverable by upgrading the
grammar (NOT by loosening the gate). NOTE: this reconciles the earlier `negation-dynreach-cost.mjs` "0 % of 14
scopes" number — that probe measured REAL channels only and predates the M2b `hasError`→fail-closed + JS-family
hardening that introduced the `:unparsed` witnesses.

**Adversarial rows (owner directive — the reproduced `ns[key]()` + all 5 hardened channels):** each driven through
the real `buildDynamicReach` over a synthetic S; every one FIRES (⇒ the door abstains `scope-dynamic`, never a
false-admit): `ns[key]()`, `import(nonliteral)`, `require(nonliteral)` (incl. member callee), `eval` (incl. member
callee), `new Function`, JS-family fail-closed. In-suite table: `test/negation-bench.test.ts` "adversarial channel
rows"; leg-level teeth: `test/dynamic-reach.test.ts`; door-level `ns[key]()`: `test/negation-door-v2-escape.test.ts`.

**FOLLOW-UP (not this ADR):** upgrade `tree-sitter-typescript` past `export type *` / inline `import()`-type support
(re-run `escape-ts-oracle-agree.mjs` to re-confirm 0-unsound), which moves SHIPPED recall 37.4 % → ~75.7 % while
keeping 0-false-admit. The LLM-proposer (A1/A3 cost) arm — cheap OpenRouter models per the owner directive — is a
separate measurement: the gate is deterministic/no-LLM, so the number above is model-independent.

### The A1/A3 PROPOSER arm (measured 2026-08-13, #95)

The gate above carries no LLM. A realistic miner needs a PROPOSER that reads a scope S and suggests negatives
for the gate to rule on. `test/negation-proposer-bench.test.ts` runs that proposer on a CHEAP model (DeepSeek
`deepseek-chat-v3.1` via the local Anthropic-compatible gateway on the owner's OpenRouter credits) and feeds
every "not-uses" suggestion through the SAME shipped gate + tsc oracle (shared via `test/support/neg-bench-lib.ts`).
Run: 8 scopes (strided across the repo, not cherry-picked), 14 targets each, 112 judgments.

- **Proposer intrinsic accuracy**: DeepSeek agreed with tsc on **111/112 (99.1%)** uses/not-uses calls.
- **Pipeline output**: 112 "not-uses" proposals → **51 ADMITTED** true groundable negatives. **A1 precision
  (admitted ∧ true / admitted) = 100.00%, 0 FALSE-ADMITS.**
- **THE KEY PROPERTY — the sound gate makes a fallible cheap proposer SAFE**: the 1 wrong "not-uses" (a symbol
  that IS called) was NOT emitted — the gate abstained/refuted it. No LLM error can produce a false negative fact,
  because the gate, not the LLM, decides. This is what lets Atlas use a $0.0003/fact model with zero precision risk.
- **A3 cost (gateway-metered, never estimated)**: **$0.017 total, ~$0.00034 per admitted fact** (45k in / 5k out).
- Corroborates the parse-gap finding LIVE: scopes containing the unparseable barrel files (adapter-io/src,
  grounding/src, kernel/src) admitted 0 (all `scope-dynamic`); clean scopes admitted 9–11 of 14. The grammar
  upgrade lifts the proposer's realized yield too, not just the exhaustive-sweep recall.

### UPDATE — the grammar parse gap is CLOSED (#233, 2026-08-13)

The M3 follow-up landed: `packages/adapter-io/src/ast.ts` `normalizeForGrammarGaps` — a LENGTH-PRESERVING rescue
of the three constructs the pinned `tree-sitter-typescript@0.23.2` (the latest published) cannot parse
(`export type *`, `import('…').T[]`, a NUL delimiter byte), applied inside `parseTsDoc` before the grammar,
with the `hasError` re-check preserved for everything else. Each construct is provably type-only or a string
interior — never a value channel/escape — so making it parse cannot hide one (teeth: `test/ast-normalize.test.ts`).
Re-measured on a fresh index, exhaustive pool (23,199 pairs):

- **SHIPPED (sound) recall: 37.4% → 80.9%** (18,654 / 23,049) — the 11 formerly-unparseable files now parse, so
  `scope-dynamic` abstentions drop from 38.8% to **0**. Only `escape-open` (18.1%, real target escapes) remains.
- **0 FALSE-ADMITS over 18,654 admits** — soundness preserved at >2× the admit volume (the whole risk of the
  change, measured clean). `escape-ts-oracle-agree.mjs` still 100% / 0-unsound.
- The proposer arm's realized yield rises with it (the barrel scopes that admitted 0 now admit).

> **CORRECTION (2026-08-17, #178 — the numbers above are INDEX-FORM-DEPENDENT and did NOT transfer).** The
> "0-FALSE-ADMITS over 18,654 admits, recall 80.9%" here was measured on a 2026-08-12 **DIST-form**
> `.atlas/index.scip` whose `canonicalizeSymbol` bridged cross-package refs. On a fresh **LOCAL-form**
> `scip-typescript` index the #196b sound mutation-bench caught the SAME door false-admitting **80.86%** of
> the tsc-FALSE negations: scip-typescript emits cross-package refs as collapsed `local` symbols that
> `symbol-reverse` dropped, so the closed-world disjointness silently failed (a LIVE T0 door-unsoundness,
> PRODUCTION-affected via `atlas verify-fact negation`). The "soundness preserved" claim was true only for the
> dist-form index. The fix (#178, `opaqueRefSources` split-feed → abstain scope-open) restores a GENUINE
> 0-false-admit that holds ACROSS index builds; recall is the number that swings with the build.
> **Measured 2026-08-17, all 0-false-admit post-fix:** committed **dist-form** index (the OPERATING case) =
> recall **32.5%** (gate-off teeth only 0.66% — cross-package resolves, so the opaque gate barely fires);
> a **dist-ABSENT rebuild** (`scip-typescript index` without building declarations first) = recall **4.25%**
> and is where the pre-fix 80.86% false-admit lived — a MISBUILD, not the operating recall; the 80.9% above
> is a separate superseded dist-form snapshot. So **"Approach-3" is a BUILD RECIPE, not a code campaign**:
> build declarations (`tsc -b`) before `scip-typescript index` so cross-package refs are dist-form and the
> existing `canonicalizeSymbol` recovers recall. This ADR's "0-FA / 80.9%" is retained as a dist-form record;
> the current story is 0-false-admit on ANY build, recall build-dependent (32.5% operating / 4.25% misbuild).
> LESSON: a number measured once with the index gitignored rots — committed artifacts must carry their own
> re-runnable checkability, and the index BUILD must be pinned or the recall number is not citable.

The residual is now the honest one the design always named: escaping targets (~18%) abstain (they would need
real points-to). The `scope-dynamic` leg stays live and sound — it just no longer fires on a parse artifact.
