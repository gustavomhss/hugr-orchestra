# harness — the governed-execution machinery

This directory is **not** part of the Atlas product. It is the reusable _harness_ that
governs how Atlas (and any future layer) is decomposed, built, gated, and shipped. It is
staged here so it can be lifted out cleanly into its own sibling repo — `/HuGR/orchestra` —
with a single `git mv`.

## What the harness IS

The machinery of governed execution, independent of any one product:

- **Quality gates** — `harness/gates/`. The standing bars enforced on every seat and on the
  build itself. Six today: `godfile-guard`, `layer-guard`, `reference-model-guard`,
  `spec-conformance-guard`, `id-integrity`, `command-doc-guard`. Same doctrine as the CI: the
  bar Orchestra enforces on seats is enforced on Orchestra itself.
- **Gate libraries** — `harness/lib/`. What the gates _delegate to_: `lexing.mjs` (the ONE
  TypeScript comment stripper), `reachability.mjs` (the value-vs-type analyser behind
  reference-model-guard), `drift-patterns.mjs` (the governance-count drift vocabulary). See
  the rule below — this directory exists so that `harness/gates/` can mean one thing.
- **Instruments** — `harness/probes/`. Deliberately NOT gates: a probe judges one RUN against a written
  contract and is invoked by hand, so nothing here is wired into `ci.yml` and `package.json` exposes no
  script for it. The distinction is load-bearing — a gate whose input is absent on CI exits 0 having
  checked nothing, which reads exactly like coverage. Today:
  - `genesis-output-probe.mjs` (with `atlas-store-read.mjs`, `mine-report.mjs`) — the instrument for
    `docs/design/genesis-output-contract.md`.
  - **the concurrency kit** — `model-call-shim.mjs` (a recording passthrough that stands where
    `roles.propose.cmd` stands), `fake-model.mjs` (a zero-cost stand-in model), and
    `concurrency-report.mjs` (reconstructs peak concurrency by sweeping the recorded intervals). It
    answers one question about a `mine` run — how many model calls were really in flight — and it exists
    because the hand-rolled shim it replaces answered that question wrongly. That shim named its per-call
    files `call-$(date +%s%N)`; BSD `date` does not implement `%N` and emits a literal `N`, so eight
    concurrent calls shared one set of filenames. Two things followed: peak concurrency read as 1 on a run
    that was demonstrably 8-wide (and a healthy pool was opened as a defect), and — worse — eight
    concurrent `O_TRUNC` writers overlaid one another's bytes, so the "answer" handed back to Atlas was a
    splice of up to eight different model replies. Uniqueness here is enforced by `O_CREAT|O_EXCL`, not by
    a clock; the analyser refuses a log it cannot draw a conclusion from rather than reporting a plausible
    number from unusable input.

  **`concurrency-report.test.mjs` is the one probe file `npm test` runs, and that is deliberate.** It is
  not a gate over the product — it is the CALIBRATION of a harness module, the same posture as
  `harness/lib/lexing.test.mjs`, and it takes no external input: it spawns the shim over the fake model
  eight-wide and asserts the report says exactly 8, then serially and asserts exactly 1. It therefore
  cannot be vacuous on CI, which is the property the rule below is actually protecting. An instrument
  nobody has watched succeed at the thing it measures is worth exactly what the last one was worth.

- **The execution method** — the governed pipeline `S0 → S1 → S2 → S3 → C → S4` plus the
  per-work-package execution loop `BIND → RED → GREEN → REFACTOR → GATE → SEAL`. These live
  as prompt + protocol docs under `docs/` (see the inventory below); they are harness-owned
  in-place.
- **Test-harness conventions** — the held-out **GATE** discipline and the **golden → test**
  convention (goldens are compiled into acceptance/heldout tests; a seat cannot see the
  held-out cases while building). Doctrine documented under `docs/CONVENTIONS.md` and the
  method docs; the mechanics ride in each package's own test files.
- **Governed CI/CD** — `.github/workflows/*`. `ci.yml` is the product build gate (it _runs_
  the harness gates against Atlas); `release.yml` is the CD skeleton. The workflow files are
  infra that belongs to the harness even while they gate the product.

## The RULE for `harness/gates/` (enforced, not asked for)

> **`harness/gates/` holds files that CAN FAIL and are run BY NAME in CI.
> Everything a gate imports lives in `harness/lib/`.**

Both halves are mechanically checked by `harness/gates/gate-directory.test.mjs`, and the check is
empirical rather than syntactic: `harness/` is copied into an otherwise-empty tree and every
`harness/gates/*.mjs` is run there. A gate, pointed at a tree with no `docs/` and no `packages/`,
**must** exit non-zero — it has nothing to check and saying OK would be a lie. A pure module exits 0.
That difference is the whole test, and it is what a syntactic "does the file contain `process.exit(1)`"
scan cannot give you, because such a scan passes the moment someone writes an unreachable one.

**Why the rule exists.** Three files used to sit in `harness/gates/` that `node <file>` ran to
completion, exit 0, having asserted nothing: `lexing.mjs`, `drift-patterns.mjs`, `reachability.mjs`.
Their logic was never dead — each has a vitest twin exercising it, and `reference-model-guard` genuinely
stands on `reachability.mjs`. What was false was the **location**: a directory whose entire meaning is
"these fail the build" contained files that could not fail, so the count of gates you got by listing the
directory (9) and the count you got by reading `ci.yml` (6) disagreed, and the difference looked like
coverage. They were moved to `harness/lib/` — not deleted and not given teeth, because neither of those
would have been true.

**`harness/lib/` is admin-owned too** (`CODEOWNERS`), for the reason `harness/gates/` is: rewriting
`stripComments` to return `''` makes layer-guard observe zero imports and print OK, from a path that was
inside the lock before the extraction. See `docs/governance/policy-lock.md`.

## The extraction plan (→ `/HuGR/orchestra`)

When Orchestra becomes its own repo, the split is mechanical and one-way:

1. `git mv harness/ ../orchestra/harness/` (or to the repo root of `orchestra`) — the gates
   move as-is.
2. Migrate the method docs listed in the inventory below out of Atlas `docs/` and into
   Orchestra. **They are not physically moved now** because the frozen WP cards reference them by
   pointer + content digest; moving them today would break that reference graph. At split
   time the cards are re-pointed and the digests re-anchored in one pass.
3. Move `.github/workflows/*` into Orchestra as the governed CI/CD templates; Atlas keeps a
   thin consumer copy that installs the harness as dev tooling.

Direction of the split is fixed: **Atlas depends on the harness, never the reverse.**

## The INVARIANT (one-way dependency)

> Harness code MUST NOT import `@atlas/*` product code.

Atlas consumes the harness purely as **dev tooling** (a `package.json` script invokes
`harness/gates/godfile-guard.mjs`; CI invokes the gates). The harness reasons about the repo
from the _outside_ — it reads tracked files via `git ls-files`, it does not link Atlas
internals. This keeps the future `git mv` a clean lift: nothing in `harness/` resolves an
`@atlas/*` module, so nothing breaks when it leaves.

Verify at any time:

```sh
grep -rnE "^\s*(import|export).*from '@atlas/" harness/   # must return nothing
```

**This command used to read `grep -rn "@atlas/" harness/`, and that was an overclaim** — it returns 60
lines today and returned lines for as long as the harness has had comments. `@atlas/` appears all over
`harness/` in prose (`"@atlas/contracts-owned"`), in layer-guard's import-specifier regex, and in the test
fixtures that layer-guard's own teeth are written against; none of those is an import. The invariant is
about what a module RESOLVES, so the check has to look at import positions. The narrowed command returns
nothing, and the same assertion is mechanized in `harness/gates/gate-directory.test.mjs` so it is checked
on every `npm test` rather than by whoever remembers to paste a grep.

## Inventory — harness-owned docs that stay in-place (for now)

Declared harness-owned, migrating to Orchestra at split time. Left physically under `docs/`
so the WP-card pointer + digest reference graph stays intact:

| Concern                   | Path                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| Execution protocol        | `docs/EXECUTION-PROTOCOL.md`                                            |
| Decomposition protocol    | `docs/DECOMPOSITION-PROTOCOL.md`                                        |
| Test-harness conventions  | `docs/CONVENTIONS.md`                                                   |
| Method overview           | `docs/method/README.md`                                                 |
| Pipeline stage prompts    | `docs/method/prompts/{S0,S1,S2,S3,C,S4}.md`                             |
| Review prompt             | `docs/method/prompts/review.md`                                         |
| Per-WP execution prompts  | `docs/method/prompts/exec/{BIND,RED,GREEN,REFACTOR,GATE,SEAL}.md`       |
| WP / properties templates | `docs/method/{wp-template.md,properties-template.md,product-design.md}` |

Everything else under `docs/` (requirements, roadmap, spec, reference, ADRs, design) is
**Atlas product** and stays with Atlas.
