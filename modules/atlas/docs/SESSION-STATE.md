# Session state — 2026-10-31

**What this file is:** the state of the work at a point in time, written so a different session, model,
harness or provider can pick it up cold. It is not a plan, and every claim carries the command that
re-derives it. Atlas now lives in Orchestra at `modules/atlas`. This version replaces the 2026-09-06 handoff,
which predates that move; read `git log --oneline -- modules/atlas/docs/SESSION-STATE.md` (and the standalone
repository's history before it) for earlier state.

## 1 — How to re-derive it

From `modules/atlas`, after `npm ci && npx tsc -b`:

- the CLI: `node packages/cli/dist/src/bin.js help`
- the index a run will use: `node packages/cli/dist/src/bin.js doctor index`
- the Atlas CI gate, from the repository root: `gh workflow run test.yml --ref <branch> -f packages=atlas`
- the repository guards, from the repository root: `bun run check:guards --base origin/dev`

Atlas tests are vitest and run only in test.yml's atlas job; `bun run test:ci` cannot reach them. Do not run
vitest on a developer machine.

## 2 — What genesis-hardening changed

The `genesis-hardening` branch (commits `00b9e03284` … `c794bc7818`) made `atlas mine` safe to run on this
repository:

- **Arms reach the workers.** Each arm's proposer pool runs that arm, not the advisory default.
- **The path argument is real.** `atlas mine [repo]` mines `[repo]`; a missing path, a non-repository or a
  missing index for a sound arm is refused with exit 2 before anything is staged.
- **Exit codes mean one thing each.** 0 complete, 1 partial (budget reached, interrupted, staging refused —
  staged work kept, resume rank printed), 2 refused or failed (the error on stderr, including git failures).
- **Several indexers, one index.** `.atlas/index.d/*.scip` is merged beside `.atlas/index.scip`, rebased by
  `index.d/roots.json`; TypeScript-only gates apply per document.
- **Only hand-written, indexed source is mined.** A default site filter (tests, fixtures, generated code,
  lockfiles, docs, data, `modules/atlas/**`, `native/omni/qa/**`) applies before churn, coupling and blame;
  `.atlas/mine-exclude` overrides it.
- **Abstained proofs are quarantined.** Such a fact is staged under its own row key and `atlas promote`
  refuses it `quarantined`.
- **A runner workflow.** `.github/workflows/atlas-genesis.yml` indexes TypeScript, Python (`modules/relay`)
  and Rust (`native/omni`), mines each arm under a site budget, and checks the result automatically: a frontier
  gate (≥85% hand-written source) and an Opus judge over a seeded sample. A `publish=true` run that passes both
  holds what the judge rejected, promotes the rest and uploads the Own snapshot as a patch. No human reviews file
  lists or facts; the snapshot PR is reviewed by CI and lucy (owner decision, archie plan v4).

## 3 — What is next

Every step after the token is a workflow dispatch read by its own job summary; none needs a human review.

1. **R1, the zero-spend run.** After the branch merges to `dev`, dispatch `atlas-genesis` with no model secret.
   The frontier gate must pass; read index coverage, per-language share, blame time and artifact sizes.
2. **Token.** The owner adds `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`). This is the owner's only step.
3. **R2a, the pilot.** A small budget, `publish=false`: the judge reports against the bar without binding.
4. **R2, the full mine** at the budget the pilot justifies, still `publish=false`.
5. **R3, publish.** The same run with `publish=true`: the judge is binding, and a passing run produces
   `atlas-own-snapshot.patch`.
6. **Snapshot PR.** Maestro opens it from the patch; CI and lucy review it.
7. **R6**, after the snapshot PR merges: a seat reads one promoted mined fact through `atlas_context` on `dev`, then this file records the run IDs and the PR.

Known gap: `atlas promote`'s success guidance still says a T2 fact is bounded out of `atlas query`
(`packages/cli/src/promote.ts`); since ADR-0013 it is served on the advisory band.
