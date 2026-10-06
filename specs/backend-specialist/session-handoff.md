# Session snapshot + handoff — the backend specialist backend specialist

Date: 2026-10-05. Purpose: respawn continuity. A new agent (e.g. inside Claude Code) reads this file first, then the listed sources, and continues from §7 without rediscovering prior decisions.

## 0. Preservation warning (read before anything else)

This file and **everything under `specs/backend-specialist/` is UNTRACKED** — a fresh clone will NOT contain it. Do not respawn in a fresh clone. Either (a) work in this same worktree (`/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin`, branch `backend-plugin`), or (b) copy `specs/backend-specialist/` into the new checkout first, or (c) ask the user to commit it. Verify with `git status --short | head` that `specs/backend-specialist/` is present before doing anything else.

## 1. Where we are

- Worktree: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin`
- Branch: `backend-plugin`, HEAD `d11d8652aa` = `fork/dev` (fast-forwarded 2026-10-05 from `76015a9`; no local commits). Refresh findings in `execution-plan.md` §1.1. Backup of `specs/backend-specialist/`: `_worktrees/backend-specs-backup-2026-10-05.tgz`.
- Original checkout preserved untouched: `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`.
- Canonical Atlas: `/Users/gustavoschneiter/Documents/HuGR/atlas` @ `b319723d5c5c86a45ad362386d8c0583ed3a10f4`.
- Canonical Composer: `/Users/gustavoschneiter/Documents/HuGR/skill-001-fastapi-production` @ `df04cf8f9c9c4307d22b6447d513b05b94c08572`.
- All work is **untracked** under `specs/backend-specialist/`. No commits, pushes or PRs. No tests/builds/installs executed by planning work (one narrow in-memory Atlas probe ran Bun against pure template/header functions only).
- No active subagents or temp worktrees remain; all P1–P5 (`backend-{host,atlas,toolkit,composer,quality}-plan`) and R46–R64 metadata worktrees were archived into `specs/backend-specialist/research/` and removed. `git worktree list` shows only this worktree for our work (verified 2026-10-05).
- No stashes belong to this work (`git stash list` entries are on unrelated branches). Our changes live only as untracked files under `specs/backend-specialist/`.

## 2. Objective (frozen)

Build the backend specialist as a backend **implementation** specialist: receives a complete packet (scope, contracts, targets, versions, checks), implements inside it, runs assigned checks, returns delta + evidence + blockers. Plugin independent of Maestro, Maestro-native, Atlas-native. No investigation, diagnosis, discovery, architecture choice, scope expansion, delegation or self-review — those are inputs from their owners.

## 3. Decisions the owner already made (do not reopen silently)

1. Caveman/plain-language summaries for chat; normal technical language in code/docs.
2. Maestro owns scope/permissions; harness owns execution/persistence/cache/compaction/enforcement; Atlas owns Knowledge + `task`/`pr`/`project`/`logbook` Memory; the backend specialist implements.
3. Scope: **Orchestra completo** (direct without Maestro + delegated). Unmodified upstream OpenCode is out of the support promise.
4. Default distribution: useful free/open-source engines ship **ready by default** (ast-grep, sqlc, ogen, Orval, datamodel-code-generator, Buf + selected plugins, SQLx CLI, OpenAPI Generator, Kiota). `hugr-compose` / `hugr-scaffold` are approved reuse candidates **conditional** on qualification.
5. Skills: six task entries (`backend-implement/api/data/concurrency/refactor/check`) + mode/domain + language/runtime/framework/version references. No Cartesian skill explosion. `backend-memory/handoff` folded into `backend-implement` guidance (Memory requirement itself stays).
6. Atlas Memory model: `project` Rules always injected (Awareness + Orientation + Rules header); `task`/`pr` consultable with own resumed-fold contract; `logbook` orchestrator-only (`orch`). Writes submit entries; Atlas derives kind and binds owner.
7. Current branch baseline is old — rebase before building.

## 4. What exists (read in this order)

1. `specs/backend-specialist/execution-plan.md` — frozen delivery plan: phases, work packages, file ownership, order, acceptance gate.
2. `specs/backend-specialist/README.md` — architecture + role boundary + work/result protocol.
3. `specs/backend-specialist/integration-flow.md` + `atlas-memory-contract.md` — Maestro/the backend specialist/Atlas flow and canonical Memory templates/limits.
4. `specs/backend-specialist/owned-tools.md` — qualified `hugr-compose`/`hugr-scaffold` contracts.
5. `specs/backend-specialist/tool-distribution.md` — ownership + approved external payload.
6. `specs/backend-specialist/skill-catalog.md` + `skill-matrix.md` — entries, variants, worked examples.
7. `specs/backend-specialist/capabilities.md`, `backend-toolbox.md` — competence, evaluation, tool shortlist.
8. `specs/backend-specialist/research/delivery-{planning,host,atlas,toolkit,composer,quality}.md` — P1–P5 source audits (evidence, blockers, file groups, checks).
9. `specs/backend-specialist/research/29-*.md` … `64-*.md` + `README.md` — tool/skill research corpus (R29–R45 implementation tools, R46–R60 skill variants, R61 Matt Pocock, R62–R64 GitHub/vendor skills).
10. `specs/backend-specialist/research/{backend-toolbox-review,skill-composition-review,skill-matrix-review}.md` — independent design reviews and dispositions.
11. `specs/backend-specialist/{atlas.md,technical-depth.md,tool-distribution.md}` + `research/skill-variants-plan.md` — foundation contract, team reference, distribution policy, variant wave record.

### Full files map (all untracked, verified 2026-10-05)

Root: `README.md`, `atlas-memory-contract.md`, `atlas.md`, `backend-toolbox.md`, `capabilities.md`, `execution-plan.md`, `integration-flow.md`, `owned-tools.md`, `session-handoff.md` (this file), `skill-catalog.md`, `skill-matrix.md`, `technical-depth.md`, `tool-distribution.md`.
Research: `01-codex.md` … `28-backend-depth.md` (R01–R28 history), `29-http-codegen.md` … `45-binary-codecs.md` (R29–R45 tools), `46-skill-composition.md` … `60-data-effect-variants.md` (R46–R60 variants), `61-matt-pocock-skills.md`, `62-github-skill-collections.md`, `63-github-plugins.md`, `64-vendor-backend-skills.md`, `README.md`, `backend-toolbox-review.md`, `delivery-{planning,host,atlas,toolkit,composer,quality}.md`, `skill-{composition-review,matrix-review,variants-plan}.md`.

## 5. Key source facts to preserve

- Native backend specialist today: roster `backend`, `subagent`-only, execution profile (read/glob/grep/bash/edit), `skill` denied; ordinary config cannot override it.
- Public V1 system-transform hook lacks selected-agent input; lifecycle hooks are invoked but do not satisfy closing-checkpoint semantics; UI/TUI route partly by `.name` and roster hashes include presentation.
- Atlas four kinds + templates verified against canonical source; resume helpers (`foldArchiveFromRecord` task-only, first-match; `spawnFold` internal, not on composed public surface) have documented gaps.
- Composer: recipe-subset selection, skeleton/delegation modes, adapter class-vs-function mismatch, CWD-escaping sidecars, unconditional overwrites — all require the qualification plan in `delivery-composer.md`.
- Toolkit pins/platforms in `delivery-toolkit.md`; ogen and SQLx CLI need CI-built binaries; musl / Win-arm64 / baseline-CPU are unqualified.
- Repo rules: tests only from package dirs (`bun test`, `bun typecheck` per package, never `tsc`); Protocol/Server HttpApi change → `bun run generate` in `packages/client`; legacy SDK via `./packages/sdk/js/script/build.ts`; Schema → Core/Protocol → Server; branch names ≤3 words, no slashes; commits `type(scope): summary`.

## 6. Open risks (do not silently resolve)

- New harness seams after refresh (`ToolSafety` intercept, `ArsenalCompletion` receipt) overlap F1/F4; decide in Phase 0, do not reinvent. See `execution-plan.md` §1.1.
- Composer license conflict: root/pyproject say Proprietary, copy footer + `CONTRACT.md` B1.0 say MIT — distribution owner must resolve before packaging copied sources.
- Lifecycle hooks exist but lack closing-checkpoint semantics; never promise guaranteed final Memory folds.
- Usage/cost telemetry maps missing counters to zero (`publish-llm-event.ts`, `runner/llm.ts`) — cannot prove free/zero-cost trials.
- CI Node mismatch (workflow asks 24.15, setup action requests 24) and unqualified musl / Win-arm64 / baseline-CPU targets — see `delivery-toolkit.md` and `delivery-quality.md`.

## 7. Next move (resume here)

1. ~~Rebase/refresh~~ done 2026-10-05 (§1.1 of `execution-plan.md`).
2. ~~Phase 0~~ done 2026-10-05: F1–F6 frozen for Phase 1 in `contracts/` (rulings in `contracts/README.md`). Composer error-code fix committed locally: Composer `399b4698` (branch `error-codes`, PR blocked: remote repo not reachable from either GitHub account), Orchestra `8b9d5d010f` (branch `composer-error-codes`, ships with the next backend specialist block).
3. **Phase 1 status 2026-10-05:** integration branch `backend-phase1` (fork, `c5b1694dbf`) holds charter v2 installed, backend-specialist-only profile with six seat-scoped skills, `backend-implement` skill, skills embedded in compiled builds, configurable labels for every native seat (`agent.<id>.name`, `HUGR_BACKEND_NAME`) with label-free versioned hashes and stable-ID routing in host/app/TUI/session-ui, `backend-result` decoder with workResult on failure and background paths, and Atlas native memory in `foundation/atlas` with union-merge `.gitattributes`. 99-test backend specialist set green locally; typecheck clean per package; CI not run (epic label). Eval bench: github.com/gustavomhss/backend-bench. Open: background workResult delivery is best effort (completion notice, `Effect.ignore`); internal `Tool.Context.agentID` is optional and plugin `agentID` falls back to the label; root `.gitattributes` lines untested (A4); old extracted skill versions accumulate; adapter-io scanner timeouts under load unconfirmed on a quiet machine; Composer fix `399b4698` unpushed (no repo access).
4. Phase 1 (parallel, ≤5 lanes, one worktree per agent, disjoint file groups from the plan): H1/H2 scaffolding, A1, T1–T4, CQ seam, S-implement drafting, Go-slice fixture prep.
4. Then Phases 2–5 per plan; first demonstrable slice is the Go/pgx/Postgres reservation repair with pause/resume + rename.

## 8. Working agreements for the respawned agent

- Continue in Portuguese, short and plain with a concrete example; technical detail on demand; keep code/docs in normal technical language.
- Prior Q&A already settled (do not re-ask): external tools are specialized generators like Rails generators, not LLM-specific; one skill may use many tools and vice versa; Matt Pocock/GitHub value = small behavior slices + conditional references, adapted not copied.
- Do not commit, push, open PRs, install toolchains or run broad suites unless the user explicitly asks; stage by name only if asked to commit.
- Do not invent APIs, hooks, MCP tools or Memory fields; verify against the pinned sources first.
- Treat research reports as evidence/options, not installed behavior; distinguish researched → authored → installed → exercised.
- Ask before crossing owner boundaries (diagnosis, architecture, scope, permissions, production operations).
