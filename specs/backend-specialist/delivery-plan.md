# Milestone 3 delivery plan — the backend specialist, complete in Orchestra

Status: 2026-10-06, live. Supersedes the open items of `execution-plan.md` §4-§5 and `session-handoff.md` §7. Base: branch `specialist-phase3`, cut from `specialist-phase2` (PR #54) at `03f038ae70`.

## 1. Cadence

- One milestone, one branch (`specialist-phase3`), one PR, one `epic` CI run, one merge.
- Each WP works in its own worktree and branch cut from `specialist-phase3`, commits there, and the lead merges it back after reviewing the diff.
- WP gate (local, every WP): `bun typecheck` in each touched package and `GODFILE_BASE_REF=fork/dev bun run check:godfile` from the repo root. Atlas WPs add `npm run typecheck` plus the guards from `.github/workflows/test.yml` in `foundation/atlas`.
- Wave gate (once per wave, lead): one batched `bun run test:ci <package> ./test/... --os both` over the wave's new test files. Never per edit.
- Milestone gate: the `epic` label on the milestone PR (full suite, Atlas job included). Merge on green; dev-owned flaky jobs get a rerun, not a fix.

## 2. Rulings taken for this milestone

| ID | Ruling |
| --- | --- |
| M3-1 | F3-D4 wins over F2.8: after compaction evicts the resume fold, the host re-pushes the same `RecordRef` once. |
| M3-2 | Superseded 2026-10-06: Maestro is the only primary agent and the backend seat is a `subagent` (owner ruling 2026-10-05, landed with PR #22). Direct use is gone, so there is no direct-mode packet header; every packet comes from Maestro. |
| M3-3 | Toolkit first cut: ast-grep 0.45.3 (npm route), sqlc 1.31.1, buf 1.73.0, gitleaks 8.30.1, kiota 1.35.0. OpenAPI Generator, protoc-gen-es, Orval and datamodel-code-generator are the second cut (they need a runtime closure). ogen and SQLx CLI are blocked: upstream ships no binaries and hosting is F5-D3/D8. |
| M3-4 | Toolkit cache lives under the user cache (`Global.Path.cache/backend-toolkit`); a missing engine is fetched again. |
| M3-5 | Skill copies are keyed `<version>-<digest12>`; old copies are kept (rollback is re-selecting an older install). F6.12's manifest is the embedded digest. |
| M3-6 | Per-reference word cap S-1b: 700 words. chi is pinned at v5.3.2 in the Go tuple. |
| M3-7 | The model never supplies frecency; Atlas assigns `INITIAL_PROJECT_FRECENCY` (F3-D6). |

## 3. Work packages

Write sets are disjoint inside a wave. Files near the godfile limit: `tool/task.ts` (748/750, net change ≤ 0 unless lines move out first), `maestro/arsenal-bindings.ts` (750, in-place only), `session/prompt.ts` (waived 1543, zero net), `session/session.ts` (do not touch), `test/tool/task.test.ts` and `test/session/prompt.test.ts` (new test files instead).

### Wave 1 (parallel)

| WP | Writes | Delivers | Tests |
| --- | --- | --- | --- |
| W1-ATLAS0 freeze | `foundation/atlas/packages/memory/src/respawn.ts` (types), `foundation/atlas/packages/adapter-io/src/{native-memory.ts (types), native-bound.ts}`, `packages/atlas-boundary/{package.json,script/build.ts,test/build.test.ts,src/generated/*}`, new `packages/opencode/src/maestro/{atlas-memory.ts,grounded-skills.ts}`, `packages/opencode/src/tool/task.ts` (move the skill-content block out) | Frozen Atlas/host memory interfaces, boundary subpath `@opencode-ai/atlas-boundary/native-memory`, task.ts budget | `atlas-boundary/test/build.test.ts` covers the new bundle |
| W1-TK core | new `packages/core/src/pinned-artifact.ts`, `packages/core/src/backend-toolkit/{manifest,target,index}.ts` (index as typed stub), tests + fixture | Verified download/extract primitive, pinned manifest for five engines | `core/test/pinned-artifact.test.ts`, `core/test/backend-toolkit-manifest.test.ts` |
| W1-SKILL wiring + Go | all six `skills/*/SKILL.md` (one line each), `references/languages/*.md` seeds, `references/{frameworks,libraries}/go/**`, `references/languages/go.md`, new `test/skill/backend-families.test.ts`, contracts README tuples | Family layout, Go references (net/http, chi, pgx 5.8.0, sqlc 1.31.1 runtime) | `test/skill/backend-families.test.ts`, existing `backend-skills.test.ts` |
| W1-HOST lock + install | `maestro/write-roots.ts`, `maestro/arsenal-bindings.ts` (in place), `server/routes/instance/httpapi/handlers/session.ts`, `session/prompt.ts` (zero net), `maestro/backend-skill-root.ts` | Reserved write-root rules cannot be added or erased from outside; loader re-reads the Session; versioned skill copies + rollback | `test/maestro/write-roots.test.ts`, `test/server/httpapi-session.test.ts`, new `test/session/prompt-tools-write-roots.test.ts`, `test/maestro/backend-skill-root.test.ts` |
| W1-BENCH (backend-bench repo) | `protocol/PRE-REGISTRATION.md` amendment, `harness/{matrix,workspace,report,regrade}.ts`, new `harness/{postgres,sealed}.ts`, `scenarios/10-go-pgx-reservation/**` | Repetitions with resume, Postgres service, sealed grader, calibrated Go/pgx slice | bench `test/report.test.ts`, `test/go-slice.test.ts` |

### Wave 2 (after wave 1 merges)

| WP | Writes | Delivers | Tests |
| --- | --- | --- | --- |
| W2-ATLAS semantics | `foundation/atlas/.../respawn.ts`, `rules.ts`, `native-memory.ts`, regenerated boundary | PR fold with `knowledgeDelta`, Atlas-owned frecency | `adapter-io/test/native-memory.test.ts` (Atlas job) |
| W2-TOOLS | new `tool/atlas-memory.ts`, `tool/registry.ts`, `maestro/roster.ts` (grants) | `atlas_memory_recall` / `atlas_memory_emit`, backend seat only | new `test/tool/atlas-memory.test.ts`, `test/agent/native-team.test.ts` |
| W2-TASKID + memory result | `packages/schema/src/maestro-event.ts`, new `maestro/logical-task.ts`, `tool/task.ts`, `maestro/{backend-work,backend-result}.ts`, SDK regen | Logical `taskId` (F2-D1/D2), fail-closed resume for `backend`, `WorkResult.taskId` and `WorkResult.memory` | `schema/test/event-manifest.test.ts`, new `test/maestro/logical-task.test.ts`, new `test/tool/task-logical-id.test.ts`, new `test/maestro/backend-memory-result.test.ts` |
| W2-TK host | `core/src/backend-toolkit/index.ts`, new `opencode/src/cli/cmd/toolkit.ts`, `opencode/src/index.ts`, `opencode/src/tool/shell.ts` (≤10 lines), contract F5 amendment | State machine, shims, `toolkit status/prefetch`, shell `prepare` | `core/test/backend-toolkit.test.ts`, `opencode/test/cli/cmd/toolkit.test.ts`, `opencode/test/tool/shell-toolkit.test.ts` |
| W2-REFS | `references/{languages,frameworks,libraries}/{python,js-ts}/**`, `references/recipes/external/{ast-grep,sqlc,buf,kiota}.md` | Python (FastAPI, Pydantic, SQLAlchemy async), JS/TS (Express, Fastify), engine recipes | `backend-families.test.ts`, `backend-skills.test.ts` |

### Wave 3

| WP | Writes | Delivers | Tests |
| --- | --- | --- | --- |
| W3-RESUME | new `maestro/{atlas-resume,atlas-resume-restore}.ts`, `tool/task.ts` (`memoryUnit`), `session/compaction.ts` (one call) | Once-only resume fold admission and residency restore | new `test/tool/task-atlas-resume.test.ts`, `test/session/atlas-resume-compaction.test.ts` |
| W3-CHARTER | `agent/prompt/backend.txt`, `specs/backend-specialist/charter-draft.md`, `maestro/validation-record.ts` (roster hash ledger), `skills/backend-implement/**` direct-use wording | Charter v3c = v3a without direct use. Evaluated and not adopted (A8: opus 21/24 vs 23/24); v3a stays, its direct-use clauses dead | `roster-hash.test.ts` pin, `native-seat-label.test.ts` prompt assertions |
| W3-EVAL | backend-bench `results/<campaign>/**` | Campaign `2026-10-06-n3` (v2 vs v3a, A6), then v3c n=3 on Claude before installing it, and the Go/pgx slice (A7) | report with per-cell k/3 |

## 4. Close

Lead merges every WP into `specialist-phase3`, updates `session-handoff.md`, runs the local gates on every touched package, opens the milestone PR with the `epic` label and auto-fix, and merges on green.

Out of this milestone: OpenAPI Generator / Node / Python closures, ogen and SQLx CLI builds, install channels (F5-D3), signing (F5-D8), Composer (legacy repo, no access), excluding `.atlas/` from the working-tree digest (F4-O4, needs a Maestro review-gate decision).
