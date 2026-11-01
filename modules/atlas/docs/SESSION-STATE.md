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
  and Rust (`native/omni`), mines each arm under a site budget, and promotes approved candidates.

## 3 — What is next

1. **R1, the zero-spend run.** After the branch merges to `dev`, dispatch `atlas-genesis` with `mode=mine`
   and no model secret. Read the summary: index coverage, per-arm frontier (`frontier-<arm>.tsv`), blame time,
   artifact sizes.
2. **Pilot.** The same with `CLAUDE_CODE_OAUTH_TOKEN` set and a small budget; review the candidates.
3. **Full run** at the budget the pilot justifies.
4. **Promote** the owner-approved nodeKeys with `mode=promote`.
5. **Orchestra Own snapshot** from the promoted knowledge (`atlas own-export`, then the materializer).

Known gap: `atlas promote`'s success guidance still says a T2 fact is bounded out of `atlas query`
(`packages/cli/src/promote.ts`); since ADR-0013 it is served on the advisory band.
