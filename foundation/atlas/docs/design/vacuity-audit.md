# Vacuity audit — how much of "1717 green" is evidence

**Scope** worktree `seat-audit`, base `740bd08`. Read-only audit; every mutation below was applied,
measured, and reverted in the same process. **Nothing is fixed here** — this is a ranking to slice.

## 0. Ground truth (measured, not assumed)

| quantity                                            | value                                      | how                                                 |
| --------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| runtime tests                                       | **1717 passed + 1 todo (1718), 238 files** | clean `vitest run --exclude "**/.claude/**"`, twice |
| `it()`/`test()` sites, `packages/*/test/**.ts`      | **1624**                                   | TS AST parse (not grep)                             |
| `it()` sites in `harness/gates/*.test.mjs`          | 36                                         | **not** AST-scanned — see Blind spots               |
| `expect(` call sites                                | 5164                                       | grep                                                |
| equality asserts (`toBe`/`toEqual`/`toStrictEqual`) | 3633                                       | grep                                                |
| substring asserts (`toContain`/`toMatch`)           | 645                                        | grep                                                |
| test files containing any 40+-hex literal           | **4 files / 19 occurrences**               | `git grep -l -P "[0-9a-f]{40,}"` — **BEFORE state** |
| synthetic `'ch-*'`/`'cas:*'` fixture hashes         | 176                                        | grep                                                |
| NUL bytes in any test dir                           | **0**                                      | node `fs`, all 448 files under `packages/`          |

The NUL check matters: the only NUL-bearing file is `packages/adapter-io/src/skeleton-source.ts` (byte 8874),
which is **src, not test**. Every grep-derived count in this document is therefore sound.

The four pinned-hash files are `adapter-io/test/governance-carrier-controls.test.ts`,
`e2e-blackbox/test/s17-degenerate-anchor.blackbox.test.ts`, `kernel/test/fold-convergence.test.ts`,
`knowledge/test/degenerate-anchor.test.ts`.

## 1. THE RATE, per shape

Carriers of each shape, denominator 1624 parsed cases. **A carrier is not a finding** — it is a place to look.
Confirmed vacuity is section 2; everything else is section 3.

| #   | shape                                                             | carriers                                                       | rate      |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| S5  | a TEETH / breaks-on comment naming a mutant **nobody has run**    | 556 tests (843 individual claims)                              | **34.2%** |
| S10 | every `expect` argument is a constant — no function called        | 416                                                            | 25.6%     |
| S7  | substring assertion where a discriminant exists                   | 347                                                            | 21.4%     |
| S11 | lives in a `*.heldout.*` file (claims to be an anti-overfit gate) | 251                                                            | 15.5%     |
| S6b | assertion inside a loop                                           | 247                                                            | 15.2%     |
| S4b | `not.toContain(...)`                                              | 136                                                            | 8.4%      |
| S4a | bare `toThrow()` — any throw satisfies it                         | 96 (149 bare vs 47 argued = **76% of throw asserts are bare**) | 5.9%      |
| S4c | `not.toThrow()`                                                   | 84                                                             | 5.2%      |
| S12 | strongest assertion is `toBeDefined()`/`toBeTruthy()`             | 69                                                             | 4.2%      |
| S3  | `as unknown as` (bypasses the typecheck `57d6129` just enabled)   | 51 (16 are structural fakes)                                   | 3.1%      |
| S6a | `expect` under an `if`                                            | 14                                                             | 0.9%      |
| S1b | fast-check arbitrary narrowed by `.filter`                        | 6                                                              | 0.4%      |
| S9  | **no assertion at all**                                           | 5                                                              | 0.3%      |
| S1c | `fc.pre`                                                          | 1                                                              | 0.1%      |

Refined sub-rates (the raw carrier count over-counts):

- **S6b refined**: 111 tests assert inside a `for…of`. 75 iterate a literal array (provably non-empty ⇒ safe);
  12 iterate a computed collection **and** assert its cardinality (safe); **24 iterate a computed collection
  with no cardinality assertion** — a 0-iteration loop asserts nothing. 24/1624 = **1.5%**.
- **S11 refined**: of 251 held-out cases, **8 are byte-identical** to a visible test (comments and title
  stripped) and 35 more carry an identical assertion multiset with different setup. See §2.2 / §3.1.
- **S1 refined**: 28 files use fast-check, 20 carry a narrowing or run-count marker. Every surviving
  narrowing at HEAD is justified in-place and compensated by a deterministic witness — see §4 (good news).

## 2. CONFIRMED vacuous / non-evidential — ranked by what the false claim guards

Each entry names the mutant that was actually applied and the green it stayed.

### 2.1 (T0, worst) `packages/tools/src/guard.ts:56` — the fail-closed leg of INV-TOOLS-15 is unguarded

```ts
function contentAddressed(row: StoreRow): boolean {
  try {
    return id(row.value as CasObject) === row.key
  } catch {
    return false
  } // ← line 56
}
```

The doc comment above it states the law: _"Total: a canonical-form violation (float / bigint / symbol /
cyclic value) can never be a grounded row, so it fails closed."_ This is the governed write-door guard
(`admitOnWrite`) **and** the read-integrity leg (`admitOnRead`).

**Mutant applied**: `return false;` → `return true;` — i.e. a row whose value cannot be canonicalized is
**admitted as grounded**, opening exactly the unscoped-CLI hole TOOLS-15 exists to close.

**Result**: `packages/tools/test` (12 files, 65 tests) — **all green**. FULL SUITE — **1715/1717 green**.
The only two reds are `s10-node-door` and `s6-edge`, both in `e2e-blackbox`, and **both are wall-clock
assertions, not semantic ones**.

**Attribution (run, 2x2, on those two files alone)**:

|              | run 1                                 | run 2                                 |
| ------------ | ------------------------------------- | ------------------------------------- |
| clean        | 13/13 pass                            | 13/13 pass                            |
| guard opened | **2 failed** — `11798ms vs cap 10000` | **2 failed** — `18078ms vs cap 10000` |

> ### ⚠️ CORRECTED 2026-08-02 — THIS ATTRIBUTION IS WRONG, AND THE ERROR MATTERS MORE THAN THE FINDING DID
>
> The paragraph below originally read _"So the mutant **is** causal and reproducible (2/2 vs 0/2), not
> load."_ **It is not causal.** A later seat re-ran it and measured the opposite:
>
> - Under the mutant (rebuilt), `s10-node-door` + `s6-edge` ran **13/13 GREEN, 3 times out of 3** (7.5 s,
>   8.8 s, 8.0 s against the 10 000 ms cap).
> - The decisive probe: `process.stderr.write('GUARD-PROBE-REACHED')` at the top of `contentAddressed`,
>   rebuilt — **0 hits** across the entire black-box story, with every `expect(stderr).toBe('')` still green.
> - `s6-edge` contains **no wall-clock assertion at all** (no `Date.now`, no `toBeLessThan`), so it could
>   only ever have failed on a project timeout.
>
> The 2×2 above was HOST LOAD on a box that was running several agents. Two clean runs and two loaded runs
> is not an attribution; it is a coincidence that survived a sample of four.
>
> **The real finding is larger and worse.** `createGuard` / `createGovernedStore` / `admitOn*` have **ZERO
> production callers** — verified independently by the lead: every caller in the repository is a test
> (`packages/tools/test/*`, `packages/e2e/test/s08-transport-writedoor.e2e.test.ts`). `guard.ts` is a
> REFERENCE MODEL. The durable write door the CLI actually uses is `packages/adapter-io/src/store.ts`.
>
> So before `guard-fail-closed.test.ts` landed, mutant A was killed by **nothing at all** — not weakly, not
> by a timing proxy. And the sharper open question is not "is this guard well tested" but **"does the
> SHIPPED store have this fail-closed leg?"**, which remains UNMEASURED. Tracked as its own task.
>
> Kept rather than rewritten, because the way this doc was wrong is itself an instance of what it audits: a
> confident causal claim from four samples, about a code path nobody had checked was reachable. But read what that means: opening the
> write-door guard's fail-closed leg is detected **only** because the door then does real filesystem work and
> blows a performance budget. **Not one assertion in 1717 tests says "an uncanonicalizable row is refused."**
> The lone detector is a timing assertion in a suite whose own `vitest.workspace.ts` banner documents that its
> wall-clock "degrades sharply under host CPU contention" — i.e. the only guard on a T0 fail-closed law is the
> assertion most likely to be relaxed or quarantined as flaky. That is worse than a plain gap: the evidence
> exists, is real, and is pointed at the wrong property.

### 2.2 (T0) `packages/tools/src/handler.ts:92` — the refusal-visibility guard

```ts
const isFailClosedWrite = (data: ToolData): boolean =>
  typeof data === 'object' && ...
```

Its comment: a fail-closed write _"MUST surface as a rejected `Verdict` … never a silent `ok:true` an agent
reads as success (F2/F5)"_. **Mutant**: `===` → `!==`, which makes `isFailClosedWrite` return `false` for
every object ⇒ every governance refusal renders as success. **Result**: `packages/tools/test` all 65 green.
The full-suite confirmation run was interrupted, so this is confirmed **at package level only** — the
`e2e-blackbox` MCP-parity stories may well kill it. Rank it as T0 anyway and re-measure first.

### 2.3 The tools mutation sweep, as a rate

16 mechanically-generated mutants across 7 files of `packages/tools/src`, each run against
`packages/tools/test`: **11 killed, 5 survived (31%)**. One survivor is a false positive (a `===` inside a
comment on an `export *` line), so the honest figure is **4 real survivors / 15 = 27%**. The other two:

- `push.ts:113` `harness.nativePull === 'available' && opts.pull !== undefined` → `!==` (pull-optimisation branch).
- `handler.ts:192` `d.emitted === false ? … : …` → `!==` (which fallback _message_ is chosen — cosmetic).

**This 27% is a tools-only number measured on tools-only tests.** Do not extrapolate it to the repo; it is
the one datapoint that exists.

### 2.4 Eight held-out cases that are byte-identical to the test they are supposed to independently check

`*.heldout.*` files declare themselves as anti-overfit gates — e.g. `wp-8.28-c-gen.heldout.test.ts` header:
_"Authored by the reviewer against the EXISTING src … to probe over-fit to the visible `-1` fixtures. Same
oracle surface; **different fixtures** (h1..h5, billing/ scope, 30 builds, 1200 syms)."_ For these eight the
fixtures are not different — the bodies are identical:

| held-out                                                      | visible twin                                          |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `genesis/test/wp-8.28-c-gen.heldout.test.ts:70`               | `genesis/test/wp-8.28-c-gen.test.ts:93`               |
| `genesis/test/wp-8.28-c-gen.heldout.test.ts:84`               | `genesis/test/wp-8.28-c-gen.test.ts:110`              |
| `genesis/test/wp-8.28-c-gen.heldout.test.ts:89`               | `genesis/test/wp-8.28-c-gen.test.ts:120`              |
| `genesis/test/wp-8.28-c-gen.heldout.test.ts:97`               | `genesis/test/wp-8.28-c-gen.test.ts:130`              |
| `index/test/cas.heldout.test.ts:57`                           | `index/test/cas.test.ts:69`                           |
| `knowledge/test/evaluator.know16.heldout.test.ts:50`          | `knowledge/test/evaluator.know16.test.ts:79`          |
| `knowledge/test/wp-5.15-know.tier-ratify.heldout.test.ts:126` | `knowledge/test/wp-5.15-know.tier-ratify.test.ts:143` |
| `memory/test/wp-6.24-b-mem.heldout.test.ts:115`               | `memory/test/wp-6.24-b-mem.test.ts:124`               |

This is the `SCN-KNOW-3b-1` shape exactly. `SCN-GEN-13e-2` is the purest: its whole body is
`expect(DEFAULT_CEGIS_K).toBe(1); expect(DEFAULT_CEGIS_K).toBeLessThanOrEqual(1);` — no fixture at all, and
the second assertion is implied by the first. The tier-ratify pair is the most load-bearing (T0 ratification).

Also: one **visible↔visible** identical pair, `e2e-blackbox/test/s12-grounding-kinds.blackbox.test.ts:213`
== `e2e-blackbox/test/s4-drift.blackbox.test.ts:72`.

### 2.5 Five tests with no assertion at all

`e2e-blackbox/test/s12-grounding-kinds.blackbox.test.ts:305`, `kernel/test/merge-fold.test.ts:107`,
`persist/test/scrub-adjacent-store.test.ts:134`, `:139`, `persist/test/transcript-store-redaction.test.ts:258`.
(Some are `it.each` templates whose assertions live in the table — verify before acting.)

## 3. SUSPECTED — carriers I did NOT execute. These are suspicions, not findings.

| #   | suspicion                                                                                                                                                                     | count        | what would settle it                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **843 TEETH/breaks-on mutant claims across 556 tests, none mechanically verified.** The suite's dominant form of evidence is an unaudited comment.                            | 556/1624     | apply each named mutant; report kill rate. `governed-link.test.ts:119` is the precedent — a claim that was **wrong twice** and measured green                                                                                                       |
| 3.2 | 35 held-out cases with an identical assertion multiset but different setup                                                                                                    | 35/251       | diff the fixtures; keep only those whose inputs differ materially                                                                                                                                                                                   |
| 3.3 | 24 tests asserting inside a loop over a **computed** collection with no cardinality guard                                                                                     | 24/1624      | insert `expect(coll.length).toBeGreaterThan(0)` before the loop and run (script: `scratchpad/loops2.mjs`)                                                                                                                                           |
| 3.4 | 96 tests with a bare `toThrow()`; only 4 of them also build a fixture that throws a _named_ message                                                                           | 96/1624      | replace with `toThrow(/msg/)`. Note the mechanical detector found the SCN-GE-5 shape **almost extinct**                                                                                                                                             |
| 3.5 | 16 structural fakes cast `as unknown as <Interface>` — the only remaining bypass of the test typecheck                                                                        | 16 sites     | drop the cast, let `tsc -b` speak. Sites incl. `read-provenance-refusal.test.ts:127`, `doctor-provenance-total.test.ts:27`, `wp-9.1.1-a-cli.test.ts:39`, `wp-doctor-cli.test.ts:42`, `wp-9.x-argmarshal.test.ts:39` (all `RevIndex`/`WiredHandler`) |
| 3.6 | 207 hand-pinned minted-field literals (`nodeKey`/`contentHash`/`subtreeHash`/`anchorKey`/`axisHash`) across 41 files; **23 of those files never call a mint function at all** | 41/251 files | for each, ask whether the test's claim is _about_ the mint (SCN-GROUND-5b shape) or merely consumes a key                                                                                                                                           |
| 3.7 | 136 `not.toContain` + 84 `not.toThrow` negative assertions                                                                                                                    | 220          | for each, check the asserted-absent string is not rewritten downstream                                                                                                                                                                              |
| 3.8 | 347 tests assert a substring where `reasonOf` (a discriminant) exists; 645 substring vs 3633 equality asserts                                                                 | 347/1624     | 4 files mix both: `governed-emit-incumbent.test.ts` (5), `governed-emit.test.ts` (4), `governed-link.test.ts` (3), `door-regression-support.ts` (1)                                                                                                 |

## 4. What is in BETTER shape than the eleven suggest

Reported with the same weight, because it is also a finding:

- **All eleven training instances are remediated at HEAD**, several with measured, self-incriminating notes
  that are exactly the standard this audit wants — e.g. `governed-link.test.ts:119`: _"MEASURED, both halves,
  full suite: dropping either half alone leaves 221/221 green, and this case CANNOT detect it."_
- **Typechecking the tests (`57d6129`) mechanically killed the SCN-GE-5 shape** for every _annotated_ fake.
  A fake missing an interface method is now a build error. Residue is only the 16 `as unknown as` casts (3.5).
- **Generator narrowing is not a live problem.** The two proven-false narrowings carry loud
  "GENERATOR WIDTH IS LOAD-BEARING" banners; the remaining ones are justified with measurements
  (`index/test/retrieval.test.ts:80` documents _"232/3000 seeds failed at numRuns 100 — 7.7%… It read as
  load flake for two seats. The product agrees with itself; only the generator disagreed"_) and each is
  compensated by a deterministic witness for the excluded corner.
- **The digest is genuinely anchored, not merely self-consistent**: `kernel/test/canonical.test.ts:87`
  asserts `id(x) === bytesToHex(blake3(canonicalForm(x)))` against `@noble/hashes` — an independent oracle.
- **The tree really is green**: 1717 pass, verified on two clean full runs.
- Only 5 assertion-free tests and 3 `skip`/`todo` in 1624.

## 5. Checklist a future reviewer can run

1. `git grep -l -P "[0-9a-f]{40,}" -- packages | grep /test/ | wc -l` — nothing pinned = nothing checked.
2. `file(1)` (or node `fs`) over every test dir; a single NUL makes grep-derived counts silently short.
3. For every `fc.uniqueArray(selector:)` / arbitrary `.filter` — **does it exclude the law's own corner?**
   A narrowing with a comment explaining why is a confession; read the comment, then delete the narrowing
   and re-run.
4. For every fixture field that production is supposed to compute (`nodeKey`, `contentHash`, `subtreeHash`,
   `anchorKey`) — is it hand-pinned? Then the mint is untested.
5. For every fake: is it _annotated_ with its interface (checked) or `as unknown as` (not checked)?
6. For every bare `toThrow()` / `not.toContain()` — would any throw, or any rewrite, satisfy it?
7. For every TEETH/breaks-on comment — **apply the mutant.** If it stays green the comment is a lie.
8. For every assertion inside a loop — is the iterated collection provably non-empty?
9. Prefer a discriminant (`reasonOf`) over a substring.
10. Diff every `*.heldout.*` body against its visible twin; identical bodies are not independent evidence.
11. If the only test that turns red for a mutant is a **timing** assertion, the property has no test —
    record it as a gap, not as coverage (see 2.1).

## 6. Blind spots — what this audit does NOT cover

- **`harness/gates/*.test.mjs` (3 files, 36 `it()` sites) were not AST-scanned** — my parser filtered to `.ts`.
  Every rate above therefore has denominator 1624, not the full ~1660 authored cases.
- **Only ONE package was mutation-swept** (`tools`: 7 src files, 16 mutation points). The other 14 packages —
  including `kernel`, `knowledge`, `adapter-io`, `persist` — have **no** measured mutation score. The 27%
  survival figure is tools-only.
- **§2.2 is package-level only**; its full-suite run was interrupted.
- **§2.1 is now attributed** (2x2 clean-vs-mutant on the two files: 0/2 vs 2/2). What remains unmeasured is
  whether any _semantic_ e2e assertion could be made to catch it — I only proved none currently does.
- **The loop-emptiness prober (3.3) was written but never run** — it lost its slot to the full-suite runs.
  Script is at `scratchpad/loops2.mjs`; the probe harness at `scratchpad/probe.mjs`.
- **`e2e-blackbox` subprocess/MCP stories were only statically scanned**, never mutation-probed.
- **Goldens-vs-transcription drift not checked**: I did not verify that `docs/requirements/goldens-*.md`
  still says what the tests transcribing them assert. `wp-4.10-a-grd.test.ts:134` shows this drifts.
- One self-inflicted measurement error, recorded so it is not repeated: my first full-suite baseline read
  "5 failed" because a mutation sweep was concurrently rewriting `packages/tools/src` while `e2e-blackbox`
  spawned CLI subprocesses that read those files from disk. The clean re-run is 1717/1717.
