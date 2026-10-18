# 95b — Staleness (A2) methodology

> Status: **INSTRUMENT SHIPPED** — `harness/probes/a2-staleness.mjs` + `harness/probes/a2-corpus/index.mjs`
> drive the real oracle and are exercised by `harness/probes/a2-staleness.test.mjs` (green).
> `harness/probes/a2-staleness-teeth.mjs` + `harness/probes/a2-staleness-teeth.test.mjs` are the mutation
> teeth behind §6's headline finding. Scope: axis **A2 (staleness)** of the #95 benchmark program only.
> Companion to 95a (A4 recall methodology, sketch) and the owner-ratified adjudication rubric used for A1.
> \*\*Reporting rule (§6): A2 is TWO numbers, never one blended score — non-touching precision `4/4` (real)
> and semantic cross-file staleness detection `NOT SUPPORTED` (named limitation). `true_stale_caught=6/6`
> is a tautology about the corpus's own construction, not evidence the oracle "catches staleness" — see §6.1.

## 1. What A2 measures

A1 (precision) asks: is a fact Atlas emits grounded and true of the bytes _right now_. A2 asks the question
that only matters once the repo keeps moving: **when the code a fact is anchored to changes in a
fact-INVALIDATING way, does Atlas's drift oracle mark it DRIFTED (a true-stale caught)? And when the code
around it changes in a fact-PRESERVING way — one that does not touch what the fact actually claims — does
the fact stay FRESH (no false-stale)?**

Both failure directions are real defects with different costs:

- **A true-stale MISS** (invalidating edit, oracle says FRESH) is the dangerous direction — a fact that is
  now false keeps reading as trustworthy. This is the failure mode the whole grounding door exists to
  prevent from being silent.
- **A false-stale** (preserving edit, oracle says DRIFTED) is a nuisance defect — a fact that is still true
  gets needlessly flagged for re-authoring, eroding trust in the oracle from the other direction (if
  everything drifts, drift stops being a signal).

## 2. The oracle under test — reused, not forked

The shipped drift oracle is `driftDetect(grounding, src)` (`packages/grounding/src/drift.ts`): FRESH iff
every grounding entry's recorded `subtreeHash` still resolves to the SAME structural unit at `src` (a
byte-hash of the normalized unit — the item/block's own bytes, extended over its bound leading doc-comment
per ADR-0014; no whitespace normalization, no line-range matching — GROUND-1/GROUND-5). This instrument
drives it via the arbitrary-rev capability that already wraps it for exactly this purpose —
`createRevIndex(repo).reDerives(fact, newSha)` (`packages/adapter-io/src/rev-index.ts:82`), which resolves
to `driftDetect(fact.grounding, axesAt(newSha))`. **The harness calls this function; it does not
re-implement drift detection.** A forked "does this look like it should have drifted" heuristic would only
ever agree with itself — reusing the shipped path is what makes a green A2 number mean the PRODUCT'S own
oracle was exercised, not a harness stand-in for it.

## 3. What is deliberately OUT of scope, and why

**The callee/interface-fold leg is dropped entirely — no callee-refactor case exists anywhere in this
corpus.** This was decided before the instrument was built, not discovered by it:

- The data model documents a SECOND freshness leg — GROUND-11, the "forward-closure interface `rState`"
  fold, meant to distinguish a callee's breaking signature change (drifts every caller) from a
  behavior-preserving body refactor (drifts none). Its implementation is `freshness()`
  (`packages/grounding/src/freshness.ts`).
- `freshness()` has **zero production callers**. It is not wired into `compose.ts`, not reachable from
  `gateHolds`, not reachable from `reconcile`/`doctor`. The shipped path's ONLY drift oracle is
  `driftDetect`, which folds the anchor's OWN `subtreeHash` alone and explicitly does not scan the
  dependency axis (see the "THE DEPENDENCY AXIS IS NOT SCANNED" note in `drift.ts`).
- `driftDetect` therefore **cannot distinguish** a benign callee body refactor from a breaking signature
  change of a callee — it does not look at callees at all. Scoring a "behavior-preserving callee refactor
  stays FRESH" case against `driftDetect` would be vacuously green (nothing in the oracle could ever fail
  it, because nothing in the oracle looks past the anchor's own bytes), and scoring a "breaking callee
  change drifts every caller" case would be vacuously RED for the same reason in reverse. Either way the
  measurement would report on code that is not in production, dressed as a finding about the shipped system.

A2 therefore scores **only own-anchor byte granularity** — the actual shipped oracle's actual actual
behavior — and this document is where that exclusion is written down rather than silently assumed.

**Negations are excluded from this corpus.** A negation-shaped fact ("X does NOT do Y") carries a fifth
drift trigger beyond byte-hash equality — an edge-model version bump, per the #99b negation design — that
this corpus does not model or check. Every entry in `a2-corpus/index.mjs` is a plain positive
(`predicate`-shaped) grounding. If/when negation staleness is scored, it needs its own corpus and its own
oracle call (whatever endpoint reads the edge-model version), not a retrofit onto this one.

## 4. The two scored classes

Every corpus entry names ONE anchored unit in a single TS fixture file, a BASE state (committed as rev A)
and a MUTATED state (committed as rev B), and belongs to exactly one class:

| Class            | Expected verdict | A wrong verdict here is called |
| ---------------- | ---------------- | ------------------------------ |
| **preserving**   | FRESH            | false-stale                    |
| **invalidating** | DRIFTED          | true-stale miss                |

**Preserving** (the edit must not invalidate what the fact claims):

1. a line/import added ABOVE the anchored unit (`P1`);
2. a license/comment header SEPARATED from the decl by a blank line — not bound to it, per ADR-0014's
   contiguity rule (`P2`);
3. an edit to a SIBLING unit elsewhere in the file — each item/block hashes independently (`P3`);
4. a Unicode NFD→NFC normalization of the unit's bytes — the kernel's `canonicalForm` NFC-normalizes before
   hashing, so a pure decomposition/recomposition rewrite is not a real change (`P4`, KERNEL-1).

**Invalidating** (the edit changes what the anchored unit actually says or resolves to):

1. a real in-unit byte change (a returned constant `42`→`43`) (`I1`);
2. a whitespace reformat INSIDE the unit — `driftDetect` applies no whitespace normalization (`I2`);
3. a comment reindent INSIDE the unit — still a real byte change inside the anchored range (`I3`);
4. a CONTIGUOUS leading doc-comment/JSDoc edit, at ITEM granularity (`I4`);
5. the same, at BLOCK granularity — a method's own leading JSDoc (`I5`);
6. a rename of the cited symbol — the anchor's `qualifiedPath` re-keys, so the fact's ORIGINAL anchor no
   longer resolves in the mutated tree; unresolvable is DRIFTED, fail-closed (GROUND-3) (`I6`).

### The doc-comment corpus caveat (the one that would otherwise silently mislabel)

`I4`/`I5` MUST be drawn against the real parser path — `build(foldAstUnits(walkFileTree(dir)))`, exactly
what `createRevIndex.axesAt` runs — because that is the only path where ADR-0014's bound-leading-doc-comment
extension actually executes. A hand-written unit that is NOT folded through `foldAstUnits` (e.g. a
realmint-style literal `StructRef` with a manually chosen `subtreeHash`) would never see the doc-comment
folded into its bytes in the first place, so editing that comment would trivially and WRONGLY read FRESH —
not because the oracle is right, but because the fixture never exercised the code path the oracle depends
on. `I4`/`I5` are transcribed directly from the shipped acceptance suite for that exact fix
(`packages/adapter-io/test/ast-gap2-doc-comment.test.ts`, cases G-GAP2-1/G-GAP2-1b), and every entry in this
corpus (not just the doc-comment ones) is scored via the SAME real `createRevIndex` → real git commit → real
AST fold path, for the same reason: nothing here is a `driftDetect(grounding, hand-built-Axes)` unit test
standing in for the integration.

## 5. The instrument

- `harness/probes/a2-corpus/index.mjs` — the ten labeled entries (§4), pure data.
- `harness/probes/a2-staleness.mjs` — the driver. Per entry: materialize a throwaway git repo, commit the
  base state, resolve the anchor's `StructRef` via `rev.resolveAnchorAt`, commit the mutated state, ask
  `rev.reDerives(fact, B)`. Reports the confusion matrix (§6) and a per-entry pass/fail list; exits non-zero
  if any true-stale miss, false-stale, or unresolved/errored entry exists.
- `harness/probes/a2-staleness.test.mjs` — calibration: proves the instrument itself (not a mock) scores the
  shipped corpus at zero misses. This is the one file `npm test` runs, so it cannot go stale unnoticed.
- `harness/probes/a2-staleness-teeth.mjs` — the mutation-teeth instrument behind §6.1/§6.2: scores the SAME
  corpus's own `base`/`mutated` byte pairs against five deliberately dumb, pure verdict functions (no
  product import) and prints them alongside the real oracle's row, so the "is `6/6` a tautology" claim is
  re-derivable, not quoted.
- `harness/probes/a2-staleness-teeth.test.mjs` — pins the exact matrix each dumb mutant scores against the
  frozen corpus, pure and fast (no throwaway git repo).

Run them standalone:

```sh
node harness/probes/a2-staleness.mjs
node harness/probes/a2-staleness-teeth.mjs
```

### A flagged deviation from harness purity

`harness/README.md` states harness code must never import `@atlas/*` (so `harness/` stays a clean `git mv`
into a future Orchestra repo). `a2-staleness.mjs` imports `createRevIndex`/`initAst` from `@atlas/adapter-io`
directly — a deliberate, necessary exception: A2's whole point is to drive the PRODUCT's own oracle, and
forking a look-alike would make the axis measure nothing but its own reimplementation (§2). This is called
out here and in the seat's return card rather than silently crossed; resolving it (an explicit
measurement-instrument carve-out in the invariant, or moving the oracle-driving half behind a subprocess
boundary the way `adjudicate/judge.mjs` arm's-lengths the `claude` binary) is left open for whoever next
touches the harness/README boundary.

## 6. The honest metric — TWO numbers, never blended, and one of them is a THEOREM

Per-class true-stale/false-stale rates, not one blended accuracy number — blending would let a corpus
skewed toward the easy class hide a real weakness in the other:

```
true_stale_caught  = invalidating entries where the oracle correctly said DRIFTED
true_stale_missed  = invalidating entries where the oracle wrongly said FRESH   (dangerous)
correct_fresh      = preserving entries where the oracle correctly said FRESH
false_stale        = preserving entries where the oracle wrongly said DRIFTED  (nuisance)
```

**Measured, current corpus (10 entries, 4 preserving / 6 invalidating):**
`true_stale_caught=6/6, true_stale_missed=0/6, correct_fresh=4/4, false_stale=0/4` — zero misses in either
direction, own-anchor byte granularity, real `reDerives` end to end. Re-derive it yourself:
`node harness/probes/a2-staleness.mjs`.

### 6.1 `true_stale_caught=6/6` is a THEOREM about the corpus, not a measurement of the oracle

`driftDetect` is, by construction, "hash the anchor's own byte extent, compare to the recorded hash." Every
`invalidating` entry in this corpus is, by construction, a byte edit made INSIDE that same extent. `bytes
changed ⇒ hash changed ⇒ DRIFTED` is therefore true for ANY hash function, including one that hashes
nothing at all — a checker that answers `DRIFTED` unconditionally scores the identical `6/6` on this class.
**Committed teeth, not a claim:** `harness/probes/a2-staleness-teeth.mjs` runs the corpus's own `base`/
`mutated` byte pairs (no product import — five pure, deliberately dumb verdict functions) against the
real oracle's row. Run it: `node harness/probes/a2-staleness-teeth.mjs`.

```
checker                                                    stale   fresh   total
real oracle (reDerives, subtree hash)                       6/6    4/4   10/10
naive any-byte-in-file-changed                              6/6    0/4   6/10
always-DRIFTED (trivial constant)                            6/6    0/4   6/10
always-FRESH (trivial constant)                              0/6    4/4   4/10
naive declaration-slice (no NFC, no doc-comment binding)     4/6    3/4   7/10
line-range oracle (line-count-changed heuristic)              1/6    3/4   4/10
```

Read the `stale` column: `always-DRIFTED` — a mutant that never even looks at its input — ties the real
oracle at `6/6`. **`true_stale_caught=6/6` must never be published, on its own, as evidence the oracle
"catches staleness."** It is evidence the corpus's `invalidating` class is internally consistent with its
own labels, which is a much weaker and much less interesting claim. The two rows that DO carry real
information about the `invalidating` class are `naive declaration-slice` (4/6 — it misses `I4`/`I5` because
it does not bind the leading doc-comment, i.e. it is a measurement of ADR-0014's EXTENT rule, not of the
drift predicate) and `line-range oracle` (1/6 — it is blind to same-line content edits entirely).

### 6.2 All the corpus's discriminating power lives in the 4 `preserving` rows

The `fresh` column is where mutants actually fail against the real oracle: `naive any-byte-in-file-changed`
and `always-DRIFTED` both score `0/4`, `naive declaration-slice` and `line-range oracle` both score `3/4`.
Only the real oracle scores `4/4`. **`P4` (Unicode NFD→NFC) is the strongest single case in the whole
corpus**: the base and mutated bytes are LITERALLY DIFFERENT (`café` as one precomposed codepoint vs. `e` +
a combining accent — 5 bytes vs. 6), yet the text is the same string under Unicode canonical equivalence,
and only the real oracle (which NFC-normalizes before hashing, KERNEL-1) survives it — every dumb mutant
that looks at bytes at all gets it wrong.

**Report `non-touching precision: 4/4 measured (0 false-drift)` as the real, defensible number this axis
proves.** It is real because every dumb byte-level mutant fails at least one of these four cases, and it is
valuable because false-stale is the nuisance failure mode that erodes trust in the oracle from the "everything
drifts" direction (§1).

### 6.3 What this axis does NOT show: semantic cross-file staleness — NOT SUPPORTED

§3 already excludes the callee/interface-fold leg because `freshness()` has zero production callers. Put
plainly, for the benchmark-results reader: **this means the shipped drift oracle does NOT detect semantic
staleness** — a fact can go FALSE while its own anchored bytes stay byte-for-byte unchanged, and `reDerives`
reports it FRESH regardless, because `driftDetect` folds only the local anchor's own subtree hash and never
looks at what it calls or what calls it (drift.ts's own "THE DEPENDENCY AXIS IS NOT SCANNED" note, §3).

A concrete falsifying counter-example (not run against the corpus — this is exactly the callee-refactor
shape §3 excludes, described here so the exclusion is not left abstract):

> Fact: `sortedNames()` returns a sorted array. `sortedNames()`'s own body is `return names.slice(this.list)`
> — it never mentions `.sort()` itself; the sort happens because it delegates to a helper, e.g.
> `namesOf(this.list)`, which currently does the sorting. If `namesOf`'s body drops its `.sort()` call, the
> fact "returns sorted" is now FALSE — but `sortedNames()`'s own anchored bytes (`return
names.slice(this.list)`... whatever calls `namesOf`) never changed. `reDerives` re-hashes the SAME bytes,
> gets the SAME hash, and reports FRESH. Running this case today would score the real oracle a
> `true_stale_missed` — that is precisely why no such case is in this corpus (§3): including it would either
> require a wired second oracle leg that does not exist in production, or would report a real defect as if
> it were this axis's finding to fix.

Same shape, interface-widening version: fact "`handle(req)` accepts `{id: string}`" grounded on `handle`'s
own signature; the imported `Request` interface it destructures widens `id` to `string | number` in another
file. `handle`'s own bytes are untouched; the fact is now imprecise; `reDerives` says FRESH.

**Do not report a blended "staleness detection" number for A2.** Report exactly two claims:
non-touching precision `4/4` (real, measured, discriminating — §6.2), and semantic cross-file staleness
detection `NOT SUPPORTED` (named limitation, falsifying example above, root cause: `driftDetect` never scans
the dependency axis). `true_stale_caught=6/6` is neither of these two claims; per §6.1 it is a tautology
about the corpus's own construction and must not stand in for either.

This is a measurement of the shipped oracle against a SMALL, hand-authored corpus, not a claim of
zero-defect drift detection at scale. Each corpus entry carries its own re-runnable check (its `base` and
`mutated` bytes are literal, committed data, not a description) — growing the corpus against real
repository files (rather than the single-function fixtures here) and widening the mutation vocabulary
(multi-hunk diffs, cross-language fixtures once AST folding covers them) is the natural next step before
this axis is reported as a benchmark number rather than an instrument calibration.

## 7. What this deliberately does NOT do

- **No callee/interface-fold scoring** — §3, restated as a named limitation with a falsifying example in §6.3.
- **No negation staleness** — §3.
- **No claim about `reconcile`'s mechanical/semantic classifier** — that consumes `reDerives`'s verdict one
  layer up (via `axesIfResolved`'s provenance gate) and is out of scope for this axis; A2 stops at the
  oracle `reDerives` itself calls.
- **No cost/latency measurement** — that is A3's job (`docs/design/` cost methodology, separate axis).
