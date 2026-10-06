# Session snapshot + handoff — the backend specialist

Date: 2026-10-05. Purpose: respawn continuity. A new agent (e.g. inside Claude Code) reads this file first, then the listed sources, and continues from §7 without rediscovering prior decisions.

## 0. Where this lives

`specs/backend-specialist/` is tracked on `dev` (merged with Phase 1, PR #21). The live plan is `delivery-plan.md` next to this file.

## 1. Where we are (2026-10-06)

- Phase 1 is in `dev` (PR #21, merge `2bb9192f52`). Phase 2 is open as PR #54 (branch `specialist-phase2`, `epic` label, auto-fix on).
- The specialist's stable id is `backend`. Its display name is a variable whose default lives only in `BACKEND_DEFAULT_LABEL` (`packages/opencode/src/maestro/roster.ts`); `test/agent/specialist-name-guard.test.ts` rejects any other occurrence of that name in the repo. Refer to it by role or by id.
- Charter v3a is installed (`agent/prompt/backend.txt` = `charter-draft.md`). Evaluation lives in github.com/gustavomhss/backend-bench.
- Open owner confirmation: Maestro's display name fixed (not configurable) while other seats stay configurable; then document the name rule in `AGENTS.md` and make the guard's message explain it.

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

1. Land PR #54 (rerun dev-owned flaky jobs; merge when green).
2. Maestro fixed-name change + `AGENTS.md` name-rule section + explanatory guard message (after owner confirms).
3. Atlas recall/emit tools for the specialist and the once-only resume fold (F3 clauses 12-25, A1/A2/A4 remainder).
4. Toolkit on demand (F5, owner ruling F5-OD): ten engines plus gitleaks, fetched by the host with pinned checksums.
5. Language/framework references (F-family) for the six skills.
6. End-to-end Go/pgx reservation slice in backend-bench; repeat the charter eval with n >= 3 per cell before freezing.
7. Logical `taskId` (F2), direct-mode write roots, install/update/rollback (Q-install). Composer stays blocked (legacy repo, no access).

## 8. Working agreements for the respawned agent

- Continue in Portuguese, short and plain with a concrete example; technical detail on demand; keep code/docs in normal technical language.
- Prior Q&A already settled (do not re-ask): external tools are specialized generators like Rails generators, not LLM-specific; one skill may use many tools and vice versa; Matt Pocock/GitHub value = small behavior slices + conditional references, adapted not copied.
- Push, PR and merge are the agent's call; stage by name. CI (the `epic` label) and merges happen once per closed milestone, never per edit. Tests run only through `bun run test:ci`; locally only `bun typecheck` and the godfile check.
- Do not invent APIs, hooks, MCP tools or Memory fields; verify against the pinned sources first.
- Treat research reports as evidence/options, not installed behavior; distinguish researched → authored → installed → exercised.
- Ask before crossing owner boundaries (diagnosis, architecture, scope, permissions, production operations).
