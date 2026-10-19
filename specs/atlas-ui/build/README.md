# Atlas UI build plan

This plan builds the Atlas screen designed in `specs/atlas-ui/mock` inside the Orchestra app, and the engine capabilities R1–R11 it needs.

- Claude (the lead) made every decision; they are in [DECISIONS.md](DECISIONS.md).
- Each task in `tasks/` is a complete brief, shaped like [TASK-TEMPLATE.md](TASK-TEMPLATE.md). An opencode model executes it and decides nothing.

## Tracks and lanes

The work is split into two plans with disjoint files, which run in parallel, plus one track that joins them.

| Track | Lane | What | Files it owns |
|---|---|---|---|
| A | A-S | Atlas surface: read and write API for the UI, boundary entry | `modules/atlas/packages/adapter-io/src/surface/**`, `modules/atlas/boundary/**` |
| A | A-H | Orchestra host: Effect service and the `atlas` httpapi group | `packages/orchestra/src/maestro/atlas-surface.ts`, `packages/orchestra/src/server/routes/instance/httpapi/{groups,handlers}/atlas.ts`, the httpapi registration line, the SDK regeneration, `packages/orchestra/test/server/atlas-*.test.ts` |
| A | A-U | App chapter: shell, model, kit, views, copy, e2e | `packages/app-shell/src/orchestra/chapters/atlas/**`, `packages/app-shell/src/i18n/orchestra-chapters/atlas*.ts`, one line each in `chapter-route.tsx`, `navigation.ts`, `sidebar.tsx`, `i18n/orchestra.ts`, `packages/app-shell/package.json`, `packages/app-shell/e2e/orchestra/chapter-atlas.spec.ts` |
| B | B-L | Shared review log and the CLI room it needs | `adapter-io/src/review-log.ts`, `cli/src/cli.ts`, `cli/src/cli-dispatch.ts`, `.gitignore`, `.gitattributes` |
| B | B-K | Knowledge-side Rs: R2, R3, R6, R8, R11 | engine files named in each brief |
| B | B-O | Ownership and memory Rs: R1, R4, R5, R7, R9, R10 | engine, scripts and workflow files named in each brief |
| C | C | Wire R1–R11 into the surface, the host and the UI | named per brief; starts after A and B merge |

- Lanes A-S, A-U and B-* can start at once. A-H starts once A06 has landed, because it consumes the regenerated boundary.
- Inside a lane, tasks run in order, one at a time, in that lane's worktree.
- B-K and B-O both need B-L's review log and CLI room first.

## Task index

The tasks live in `tasks/<ID>.md`; each brief lists its own dependencies.

- When the briefs were written, the big tasks below were split into lettered sub-tasks (A13a–c, A19a–c, B-R2-01a/b, and others).
- The exact sequence, with the lead's merge and generator steps, is in [ORDER.md](ORDER.md). Items waiting on the owner are in [OPEN.md](OPEN.md).
- Shared contracts are in `tasks/A-U-API.md` (app model and kit) and `tasks/B-L-API.md` (review log and CLI tables).
- The questions each brief writer raised, and the fix each brief assumes, are in `issues/`. Models: **F** = `opencode-go/deepseek-v4.1-flash`, **B** = `opencode-go/beam-free`.

### Track A: the screen over today's Atlas

| ID | Model | Task |
|---|---|---|
| A01 | F | `surface/types.ts`: the `AtlasSnapshot` DTO and the write-result types (D3) |
| A02 | B | `surface/read-store.ts`: facts, candidates, CAS fields, generations, policy, tracked, cas audit (port extract.py) |
| A03 | B | `surface/read-git.ts`: drift hunks, stat and commits per fact; langs; children tree (port extract.py) |
| A04 | B | `surface/read-index.ts`: dependents and dependentCount from the code index (D3) |
| A05 | B | `surface/index.ts`: `openSurface(repoPath)` with snapshot, reasoning, own, health, promote, draft, emit, link, verify |
| A06 | F | Boundary entry `./surface`, regenerate, boundary test |
| A07 | B | `maestro/atlas-surface.ts`: Effect service over the boundary, with repoPath per D5 |
| A08 | F | httpapi group `atlas`: endpoint declarations |
| A09 | B | httpapi handlers `atlas` and registration |
| A10 | F | Regenerate the SDK (`packages/sdk/js/script/build.ts`) |
| A11 | B | Server tests for the `atlas` group |
| A12 | F | App dependencies, chapter registration, navigation entry, icon, empty page, sub-route parsing |
| A13 | F | `atlas.css`: port of `mock/atlas.css` with tokens per D10 |
| A14 | F | Copy files: `atlas.ts` plus one empty `atlas-<view>.ts` per view, spread into `orchestra.ts` |
| A15 | B | `atlas-model.ts`: pure port of `mock/model.js`, with tests |
| A16 | B | `atlas-api.ts` and `atlas-controller.ts`: transport and store (Lean pattern) |
| A17 | B | `kit/*.tsx`: port of `mock/ui.js` helpers (button, pill, tier, bar, tech, newcap, toast, dialog) |
| A18 | B | Sub-navigation rail and chapter frame (crumbs, header actions, command palette) |
| A19 | B | View: overview (Home, health, travel, keep) |
| A20 | B | View: explore list |
| A21 | B | View: explore map (rings, bars, dots) |
| A22 | B | View: explore graph |
| A23 | B | View: unit page |
| A24 | B | View: fact page and inspector |
| A25 | B | View: review |
| A26 | B | View: activity |
| A27 | B | View: genesis (interview included, marked R11) |
| A28 | B | View: architecture (store chapter included) |
| A29 | B | View: ownership |
| A30 | B | View: follow one fact |
| A31 | B | View: memory seat pages |
| A32 | B | Sheets: add fact, link, promote, mine, hotset and the other dialogs from `mock/app.js` |
| A33 | B | Playwright spec `chapter-atlas.spec.ts` |

### Track B: engine capabilities

| ID | Model | Task |
|---|---|---|
| B-L01 | B | Make room in `cli.ts`: move the promote/own intercept into `cli-dispatch.ts` |
| B-L02 | B | `review-log.ts`: append, read and fold, with tests (D14) |
| B-L03 | F | `.gitignore` and `.gitattributes` for `review.jsonl` |
| B-R2-01 | B | `promote [nodeKey...]` filter and the held-row skip |
| B-R2-02 | B | `hold` / `release` commands, docs pages and README counts |
| B-R3-01 | B | `propose`, `proposals` and `decide` commands over the review log |
| B-R3-02 | F | Command docs and README counts for R3 |
| B-R6-01 | B | `isRetired` predicate and the four read-point filters |
| B-R8-01 | B | `WriteRequest.replace` in upsert and authority |
| B-R8-02 | B | `emit --replace` through governed-emit, with docs |
| B-R11-01 | B | `open-questions.ts`: derive and rank `OpenQ` |
| B-R11-02 | B | `interview` and `answer` commands, the tier answer writing a proposal, the ledger row removed |
| B-R1-01 | B | Memory proposal path in `atlas_memory_emit` (kind project) |
| B-R4-01 | B | `territory` command writing the catalog |
| B-R5-01 | B | `listResumable` and explicit-ref admit |
| B-R7-01 | B | `own-export` command and named refusals in `exportOwnSnapshot` |
| B-R9-01 | B | Guard `--worklist` and the `repair` command |
| B-R9-02 | F | `atlas-worklist.yml` workflow |
| B-R10-01 | F | `atlas-guard.yml` workflow |

### Track C: wire the new capabilities into the screen

| ID | Model | Task |
|---|---|---|
| C01 | B | Surface: R2/R3/R11 reads and writes, R1 proposals, R5 list, R7 export; then regenerate the boundary |
| C02 | B | Host: endpoints for C01 and the SDK regeneration |
| C03 | B | UI: replace each `New capability` marker with the working action, one view at a time (the brief lists each marker) |
| C04 | B | Interview delegation: a model drafts answers through Orchestra's provider layer; the drafts are written as `answer` records with `drafted` |

## Running a task

```bash
specs/atlas-ui/build/run-task.sh A01
```

[`run-task.sh`](run-task.sh) does four things:
1. Picks the model from the brief.
2. Uses (or creates) the lane worktree `.claude/worktrees/atlas-build-<lane>` on branch `atlas-build-<lane>`.
3. Runs `opencode run` with the brief.
4. Saves the answer to `specs/atlas-ui/build/runs/<ID>.out`.

The lead then reviews the diff, runs the acceptance step, and commits.

## Worker contract

- Read the brief and only the files it lists. Change only the files in "Touch only".
- Never run tests, typecheck, builds or installs. Never commit, push or switch branches.
- Write files with your file-writing tool, directly at their path inside the worktree. Never use `/tmp` or any path outside the worktree, not even as a scratch copy: those calls are refused and end the session.
- When anything does not match the brief, stop and report the mismatch, word for word. Do not improvise.
- End with a short report: the files changed, plus anything that differed from the brief.
- The very last line of the answer is exactly `RESULT: DONE` when every step was applied, or `RESULT: STOPPED <one-line reason>` otherwise.
