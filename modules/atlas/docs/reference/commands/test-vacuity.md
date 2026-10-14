# `atlas test-vacuity`

Produce **grounded test-vacuity facts** for a repository's **HEAD test files**. A test-vacuity fact (ADR-0015
**D5** / #95) is a **single-anchor `proven`** record — _named test `testName` in unit `unitKey` holds one shape of the
closed, additive-only `TestVacuityShape` vocabulary_ (normative list:
[`reference/atlas-knowledge.md`](../atlas-knowledge.md)):

- **`assertion-only-in-catch`** — every assertion-shaped call sits inside a `catch` clause and there is no
  assertion-count guard. Such a test **passes with no assertion executed** whenever the guarded call does not throw.
- **`no-assertion-in-test`** — the body contains no check at all (call _or_ getter chain), carries no
  assertion guard, discards at least one expression that is not dead code, and neither throws, `fail()`s,
  returns a value nor holds a `catch`. Such a test **executes work and can never fail on a wrong result**.

- **`assertion-never-invoked`** — a matcher rooted in `expect(...)` is referenced but never called
  (`expect(x).toBeNull;`). The matcher is a function, so the assertion **never executes** and the test passes silently.

All three are fragile shapes the oracle proves **syntactically** — neither is a claim that the test's bug fires. This command is the **reachable producer**: it walks the repo's HEAD
`*.test.ts` / `*.spec.ts` units, runs the `scanTestVacuity` AST oracle over each, seals every **proven** fact
through genesis's authority, and **persists** it.

## Invocation

```
atlas test-vacuity <path>
```

- `<path>` — required. The repository to scan. Like `atlas mine <repo>`, the producer scans the repository the
  entrypoint composed over (`process.cwd()`); a subtree path is accepted but the scan is repo-wide.

## Outcome (exit code is the whole contract)

- **exit 0** — ≥1 proven test-vacuity fact was admitted from a HEAD unit and settled **durably** through the
  governed door. Read one back with [`atlas node <id>`](./node.md) or list a unit's facts with
  [`atlas test-vacuities <unit>`](./test-vacuities.md).
- **exit 2** — **0 vacuous tests** were found (nothing to admit, **abstain-by-design**) **or** the governed emit
  door **REFUSED** every proven fact. Nothing is fabricated; on a refusal nothing lands.

```
$ atlas test-vacuity .
status: ok
next: admitted 1 proven test-vacuity fact(s) durably through the governed door — read one back with `atlas node <id>`
invariant: #95 D5: a test-vacuity is a single-anchor PROVEN AST-shape fact — named test T in unit U holds one shape of the closed, additive-only `TestVacuityShape` vocabulary (reference/atlas-knowledge.md): `assertion-only-in-catch` (every assertion-shaped call inside a catch clause, no assertion-count guard), `no-assertion-in-test` (no check at all in a body that discards work and neither throws, fails, returns a value nor catches), or `assertion-never-invoked` (a matcher rooted at the bare global `expect(` is referenced but never called, so the assertion never runs). Each is re-derivable at HEAD by `scanTestVacuity`, sealed `proven` ONLY when the injected oracle re-proves it, admitted THROUGH the governed emit door (KNOW-11 authz + ARCH-9 anchor); the PROVEN-only family has no advisory form, so an abstaining oracle yields NO fact (0-false-proven)
test-vacuity: vacuous-catch-only @ test/sample.test.ts (assertion-only-in-catch, seal: proven) — <id>
test-vacuity: unchecked-parse @ test/sample.test.ts (no-assertion-in-test, seal: proven) — <id>
```

## The 0-false-proven rail

A test whose assertions sit on the **success path** is **never** proven. The `scanTestVacuity` oracle abstains,
and because the family is **PROVEN-only** (there is no advisory test-vacuity form) an abstaining oracle yields
**no fact** — it is never named in the output. Recall is the producer's prompt; **precision is the governed
seal**. The count in `admitted N` is the number of proven facts the governed door committed **durably**.

## Authorization (governed)

`atlas test-vacuity` PERSISTS **through the governed emit door** — the same door `atlas emit`/`atlas promote`/
`atlas transition` ride. **KNOW-11 actor-scope authz** and **ARCH-9 anchor binding** apply: the acting
`ATLAS_ACTOR` must be a member of the unit's own scope (e.g. `test` for `test/sample.test.ts`), and the scope
must OWN the unit. An **unauthorized** actor is **REFUSED** (exit 2, `unauthorized`) and **nothing lands** —
there is no gate-less write path into the governed knowledge projection. Unlike `atlas transition`, this door
**runs the HEAD truth gate**: a test-vacuity grounds on the **current** test file, so a stale grounding is
refused `ungrounded`. It is **produced-only** — an _authored_ `atlas emit {kind:'test-vacuity'}` carries a
witness the door cannot re-derive and is refused outright (the forge guard).

## Honest limits (flagged, not silent)

- **Reverify replay** (re-running `scanTestVacuity` against a stored fact's witness through `atlas verify-store`)
  and its `MINED_TIER` tier-check are **deferred** (a separate wave); the producer + read surface are what this
  command ships.
- **Reachability, not execution.** The oracle proves the fragile _shape_ syntactically — it does **not** assert
  the vacuous branch is reachable at runtime. The claim is deliberately conservative.
