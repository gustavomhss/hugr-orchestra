# Lane B-O · issues and the fixes the briefs assume

Lane B-O carries R1, R4, R5, R7, R9 and R10. Each item: what does not work as written, and the fix the briefs already
apply. Items 1, 2 and 3 need a lead decision before the named task runs; the briefs are written assuming the fix.

## 1. `atlas repair` needs one new spawn site (needs the lead, before B-R9-01b)

D24 has `atlas repair` run `scripts/materialize-own-snapshot.mjs`, commit, push and `gh pr create`. Atlas's only git seam
(`adapter-io/src/run-git.ts`) runs `git` alone and is module-internal; nothing in the CLI may start `node` or `gh`.
AGENTS.md "Spawning Processes": `bun run check:spawn-imports` fails on any `child_process` import outside
`script/spawn-allowlist.json`, and "entries are only removed, never added without the lead".

Fix assumed by B-R9-01b: ONE new allow-listed file, `modules/atlas/packages/cli/src/repair-run.ts` (`runTool(command,
args, cwd)` over `execFileSync`, no shell), used only by `repair-cli.ts` for `node` (the materializer, through
`process.execPath`), `git` (checkout -b / add / commit / push) and `gh pr create`. B-R9-01b adds the allow-list entry and a
row to `native/omni/docs/orchestra-integration.md` §3 ("CLI-only maintainer command; runs where the store exists, never
in a shipped Orchestra path"). If the lead refuses the site, the alternative is: `repair` stops after the export and
prints the materialize / commit / push / `gh pr create` commands for the maintainer to run, and B-R9-01b drops
`repair-run.ts`.

## 2. D22's ratify-token check cannot be met without one `process.env` read in the CLI (B-R4-01b)

B-L-API.md §2 says a runner never reads `process.env` (only `compose.ts` may). D22 requires `ATLAS_RATIFY_TOKEN` to be
set for `atlas territory`, and the composed runtime does not expose the token (it is threaded into the emit door only,
and `compose.ts` has no line room under the godfile cap). Precedent: `cli/src/mine.ts` already reads
`deps?.env ?? process.env`. `help-cli.test.ts` only checks that every `ATLAS_*` name `compose.ts` reads is in help, so a
second read of the SAME documented channel breaks nothing.

Fix assumed: `territory-cli.ts` `territoryPorts()` (the production ports, one function) reads
`process.env.ATLAS_RATIFY_TOKEN`; the runner itself takes the token through its ports. Rule: any non-empty token for
T1/T2, `billy` (`BILLY`, `@atlas/knowledge`) for T0 — the same rule as `ratify()` (KNOW-8).

## 3. `Territory.tier` is `T0 | T1 | T2`; D22 says "tier human-ratified" (B-R4-01b)

`contracts/src/territory.ts`: a Territory carries `{name, owner, tier, globs}` with `tier: "T0" | "T1" | "T2"`;
"human-ratified" describes WHO sets the field, not a value. D22 names no flag for it.

Fix assumed: a required `--tier <T0|T1|T2>` flag. Also pinned: `--project <id>` is required only when no
`TERRITORY-CATALOG.json` exists yet (the catalog's `projectId` is Orchestra's project id, which Atlas cannot know);
the file lives at the Atlas root (next to `OWN-SNAPSHOT.json`, where Orchestra's `maestro.atlas.directory` reads it);
declaring a name that exists REPLACES it in place (declaration order is the overlap tie-break, so it is kept);
`atlas territory` is a different command from the existing `atlas territories` (RETR-13 MISS oracle) — the page says so.

## 4. The Atlas boundary goes stale during Track B (all B-O engine tasks)

`modules/atlas/boundary/script/build.ts --check` (`bun run check:generated`, in `test.yml`'s unit-rest `packages`
lane) compares the committed bundles against a fresh build of `native-bound.ts`, `native-header.ts`,
`host-context.ts` and `own-snapshot.ts` and everything they import. B-R1-01, B-R4-01a, B-R5-01 and B-R7-01a change
files in those graphs (B-K's knowledge changes do too). D26 forbids Track B from regenerating, so that one step is red
on a full epic run until C01 regenerates. The `atlas` job (every B-O acceptance) does not run it. Proposed rule: do not
dispatch a full epic run on a Track B branch; the first full run is after C01.

## 5. R1 cannot carry `grounding` (B-R1-01, C-R1)

A project rule is `{rule, scope, grounding?}`. D14's `memory-proposal` record is `{member, rule, scope}` and B-L02 froze
it. Fix assumed: `proposeProjectRule` refuses an entry carrying `grounding` (`template-invalid`, named reason) rather
than dropping it silently; the tool description and the jimmy skill reference say a proposal is `{rule, scope}`. If
grounding matters, the fix is a D14 amendment (an optional `grounding` on both memory records) in lane B-L.

Also pinned for R1: the proposal is judged like a write up to the cap — the `project` template with Atlas's own
frecency, and the NAMED secret scanner (the review log travels in git, so an unscanned rule must never reach it). The
MEM-3 cap is judged when the steward indexes (the write). An identical OPEN proposal by the same owner reconciles to
its id. A review log with unverifiable lines refuses (`store-partial` / `store-unavailable`), like the memory door.
`at` comes from the host (`new Date().toISOString()`), never from Atlas.

## 6. R5: no `at` exists in Atlas Memory (B-R5-01)

D23 lists `eventId, task, refs, at`. A `MemoryRecord` is `{owner, kind, entry}` and the durable-log event has no time;
log order is explicitly not "latest" (F3-D3). Fix assumed: `listResumable()` returns `{store, records: [{ref, taskId,
stoppedAt, lesson}]}` in file order and claims nothing about recency; a time, if the screen wants one, comes from the
Orchestra session's emit receipts (Track C). It takes no `member` argument: a `NativeMemory` is bound to one owner
(clauses 2-4) and a parameter would let a caller name another — the owner is the binding's (plus `legacyOwners`).

## 7. R7: which source files a rebuilt unit anchors to, and carried units (B-R7-01b)

D21 does not say what `sourceBlobs` an exported unit carries; the curated `packages/genesis` fixture lists 3 files.
Fix assumed: every regular tracked file under the unit path at HEAD (`git ls-tree -r HEAD -- <unit>`, symlinks,
submodules and `.atlas/` paths excluded). Conservative: any byte under the unit makes it stale — the own-protocol
"CI Freshness Path" rule ("conservative whole-file freshness").

The materializer replaces the WHOLE snapshot and skill tree, so own-export writes a complete snapshot: the named units
are rebuilt from the live store, every other unit of the committed `OWN-SNAPSHOT.json` is carried unchanged, and
`sourceRevision` is HEAD (a carried unit that is itself stale is then refused by the materializer, by path). The
snapshot identity is `atlas-own-export:<HEAD sha>`; a rebuilt unit's `grounding` is the unit's git tree id at HEAD.

## 8. Reference-model ledger moves in lane B-O

`harness/gates/reference-model-guard.mjs` DECLARED COUNTS line, by delta (apply to whatever the line reads then):

| Task | Row | declared-modules | dead-value-exports |
|---|---|---|---|
| B-R1-01 | `native-memory.ts` row `values: 3` → `4` (`proposeProjectRule`) | 0 | +1 |
| B-R4-01a | delete the `host-context.ts` row (now called by `territory-write.ts`); add a `territory-write.ts` row (values 2) | 0 | −4 |
| B-R4-01b | delete the `territory-write.ts` row (its runner lands) | −1 | −2 |

Every other B-O module has its production caller in the same task (own-export.ts and repair-run.ts land with their
runners).

## 9. Publish order, counts and anchors (B-R4-01c, B-R7-01c, B-R9-01c)

The three publish tasks run after lane B-K has merged and the B-O worktree has merged `atlas-ui-study`, in the order
R4 → R7 → R9, each adding 1 to the three README counts and inserting after the previous B-O entry (B-L-API.md §4 B-O
anchors). Expected after B-K: 39 commands, 21 CLI-only, list ending `` `answer`. ``; after B-O: 42 and 24. Each brief
gives the delta, not the absolute number. All three commands bind `atlas-query` (they write files, never the store —
the `export` precedent) and use the README kind `ops`. New valued flags appended to `VALUED_FLAGS`: `tier`, `project`
(R4), `out` (R7), `worklist` (R9); `owner` is already valued.

## 10. R9/R10 workflows are exceptions to the CI cadence (B-R9-02, B-R10-01)

AGENTS.md "CI Cadence": "Pushes and unlabeled PRs run nothing." D24 (`atlas-worklist.yml` on push to `dev`) and D25
(`atlas-guard.yml` on every pull_request opened/synchronize/reopened) are deliberate exceptions. Both are kept light: one
ubuntu job, `npm ci` in `modules/atlas`, `npx tsc -b packages/retrieval` and one guard; `atlas-guard` exits after one
`git diff` when no Own-anchored path changed (the later steps are skipped, so the check is green and cheap). Proposed
lead action (not a task, AGENTS.md is lead-owned): append to the "CI Cadence" section "Two Atlas workflows are the
exceptions: `atlas-guard.yml` runs the Own snapshot guard on PRs that touch Own-anchored files, and `atlas-worklist.yml`
writes the stale-Own worklist on pushes to dev." Making `atlas-guard` required is branch protection (owner, D25).

Acceptance limits: `workflow_dispatch` only works once a workflow file is on the default branch, so `atlas-worklist`
is first verifiable after merge to `dev` (its push trigger runs it). `atlas-guard` runs on the PR that adds it.

## 11. Track C briefs written by this lane

- `tasks/C-R1.md`: `atlas_memory_emit` kind `project` proposes through `proposeProjectRule`. Needs C01 (boundary
  regenerated with the new export).
- `tasks/C-R5.md`: `AtlasResume.admit` takes an explicit `RecordRef`. Uses only boundary exports that exist today, so it
  does not wait for C01. `listResumable` and the host resume route stay in C01/C02.

## 12. Task split and lane order

Split (suffixes per the brief rules), so every task leaves all Atlas guards green: B-R4-01 → B-R4-01a (catalog writer,
temporary ledger row), B-R4-01b (runner + `ops-common.ts`), B-R4-01c (publish); B-R7-01 → B-R7-01a (named refusal in
`exportOwnSnapshot`), B-R7-01b (`buildOwnExport` + runner), B-R7-01c (publish); B-R9-01 → B-R9-01a (guard
`--worklist`), B-R9-01b (repair runner + spawn site), B-R9-01c (publish). B-R1-01, B-R5-01, B-R9-02 and B-R10-01 stay
whole. The README task index needs these IDs (models: a/b logic tasks B except B-R7-01a F; every publish task F) plus
C-R1 and C-R5 (B) in Track C.

Order in the B-O worktree:
1. No dependency: B-R5-01 → B-R7-01a → B-R9-01a → B-R10-01 → B-R9-02.
2. Lead merges lane B-L into `atlas-ui-study`; `git merge atlas-ui-study` here.
3. B-R4-01a → B-R4-01b → B-R7-01b → B-R9-01b (after the lead's decision on item 1).
4. Lead merges lane B-K; `git merge atlas-ui-study` here.
5. B-R1-01 (it needs B-K's B-R2-01b to have removed the `review-log.ts` ledger row: importing `review-log.ts` from
   `native-memory.ts` would otherwise make that row stale) → B-R4-01c → B-R7-01c → B-R9-01c.
