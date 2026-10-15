# `atlas verify-fact`

**PROVE, REFUTE, or ABSTAIN** on a typed claim about the code index — the read door of the _sound-genesis
PROVEN family_. Three pure, total, `$0`-LLM oracles (`@atlas/genesis`) decide a claim over the live
symbol-reverse view (the #99b N0 completeness feed): soundness comes from a **witnessed existence**, never
from an absence the index cannot guarantee. This is the program-checkable half of the sound-genesis gate —
the answers it gives are proofs against the index, not model judgements. Read-only: it opens no write path and
carries no governed token (`GOVERNANCE_SURFACE` stays 5).

## The three classes

| kind         | claim                                                      | verdicts                         | soundness                                                                                                                     |
| ------------ | ---------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `dependency` | _a caller of `<target>` exists under `--scope`_            | `proven` / `abstain`             | `proven` = a witnessed caller, sound in **any** world; never refutes (a cross-package absence is not sound)                   |
| `count`      | _≥ N distinct callers of `<target>` exist under `--scope`_ | `proven` / `abstain`             | `proven` = a witnessed lower bound (`--exact` additionally needs a **closed** world)                                          |
| `negation`   | _no caller of `<target>` exists under `--scope`_           | `proven` / `refuted` / `abstain` | the #220 closed-world dual: `refuted` = a witnessed counterexample (any world); `proven` only when the single scope is closed |

`abstain` is an **honest non-answer**, not a failure: the target is `local`/unresolvable, out of scope, or
the world is open. It is exit `0` with the verdict on `data`, exactly as `atlas negations` surfaces an
abstention rather than hiding it — the sound gate declining to decide is a valid answer.

## Invocation

```
atlas verify-fact <kind> <target> --scope <s> [--world <w>] [--min <n>] [--exact]
```

- `<kind>` — required. One of `dependency`, `count`, `negation`.
- `<target>` — required. The **SCIP global symbol** the claim is about (a `local ` symbol always abstains —
  it is document-scoped, #189).
- `--scope <s>` — required. The path prefix the claim ranges over (segment-wise containment: `src` covers
  `src/payments`, `sr` does **not** cover `src`). For `negation` this is the single closed scope (#220).
- `--world <w>` — optional. The completeness world the check ranges over; defaults to `--scope`. Used by
  `dependency` (to discriminate the abstain reason) and by `count --exact` (the closed-world requirement).
  Unused by `negation`.
- `--min <n>` — required for `count`. The integer lower bound N (`≤ 0` / non-integer abstains as malformed).
- `--exact` — optional boolean for `count`. Demand `=== N` under a **closed** world, not just `≥ N`.

A malformed invocation (unknown kind, empty target/scope, missing `--min` for a count) is a structured error
with guidance and a **non-zero** exit — never a throw.

## Worked examples

The first two blocks are re-run against the built binary in a fresh, un-indexed fixture repo by
`doc-transcript-guard`, so they show exactly what the product prints for those invocations. In an
un-indexed tree every global symbol is unresolvable, which is precisely the ABSTAIN case — an honest
non-answer, exit 0:

```
$ atlas verify-fact dependency greet --scope src
status: ok
next: ABSTAIN (target-unresolvable): the oracle declined to decide 'greet' — an honest non-answer, NOT a refutation; widen/close the scope, or the target is local/unresolvable/out-of-scope
invariant: VF-1: `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live symbol-reverse feed via the sound-genesis oracles (@atlas/genesis) — soundness from a WITNESSED existence, never a cross-package absence; dependency/count never refute, only negation does (#220 closed-world dual); a malformed invocation is a structured error + non-zero exit, never a throw
# exit 0
```

A malformed invocation is a structured error with guidance and a non-zero exit — never a throw:

```
$ atlas verify-fact dependency greet
status: error
next: `atlas verify-fact <kind> <target> --scope <s>` — `--scope` is the directory/path prefix the claim is about
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: missing --scope: verify-fact requires the scope the claim ranges over
# exit 1
```

The PROVEN and REFUTED postures need a real caller edge in the index, which a clean checkout does not
carry — so the two blocks below are **illustrative**. Their behaviour is mechanically pinned by
`packages/e2e-blackbox/test/s32-verify-fact.blackbox.test.ts`, which drives the shipped binary over a
controlled `.atlas/index.scip` (a defined symbol with a witnessed caller under scope), not from a clean
checkout. A witnessed caller under the scope proves a `dependency` claim — sound in any world:

```
$ atlas verify-fact dependency 'scip . . `greet`#' --scope src/app
status: ok
next: PROVEN: the dependency claim about 'scip . . `greet`#' is witnessed in the live index — a caller/definition exists under the scope, sound in any world (a proof, not a heuristic)
invariant: VF-1: `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live symbol-reverse feed via the sound-genesis oracles (@atlas/genesis) — soundness from a WITNESSED existence, never a cross-package absence; dependency/count never refute, only negation does (#220 closed-world dual); a malformed invocation is a structured error + non-zero exit, never a throw
```

That same witnessed caller REFUTES the negation of the fact — the only posture in which any oracle
returns `refuted` (the #220 closed-world dual):

```
$ atlas verify-fact negation 'scip . . `greet`#' --scope src/app
status: ok
next: REFUTED: 'scip . . `greet`#' has a witnessed counterexample under the scope — the negation is false (this verdict is reachable only for the closed-world negation class)
invariant: VF-1: `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live symbol-reverse feed via the sound-genesis oracles (@atlas/genesis) — soundness from a WITNESSED existence, never a cross-package absence; dependency/count never refute, only negation does (#220 closed-world dual); a malformed invocation is a structured error + non-zero exit, never a throw
```

## Invariant

> **VF-1** — `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live
> symbol-reverse feed via the sound-genesis oracles (`@atlas/genesis`): soundness from a **witnessed
> existence**, never a cross-package absence; `dependency`/`count` never refute, only `negation` does (the
> closed-world dual, #220); a malformed invocation is a structured error and non-zero exit, never a throw.

The oracles are pure and total — the verdict is a deterministic function of the code index at the composed
rev, so identical arguments yield a byte-identical verdict. The feed is built once at composition (the code
index is immutable within a process), unlike the mutable-projection read legs (`atlas negations`) which
re-read per call.
