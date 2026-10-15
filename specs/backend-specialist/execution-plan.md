# The backend specialist execution plan — zero to complete Orchestra delivery

Status: frozen execution plan, 2026-10-05. Implements the accepted architecture (`README.md`, `capabilities.md`, `tool-distribution.md`, `owned-tools.md`, `integration-flow.md`, `atlas-memory-contract.md`, `skill-catalog.md`, `skill-matrix.md`). Source audits P1–P5 are the evidence base. No implementation, installation, test run or publication is claimed by this document.

## 1. Baselines and scope decision

- Orchestra worktree: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin`, HEAD `d11d8652aa` (`fork/dev`, fast-forwarded 2026-10-05 from audit baseline `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`, +158 commits, no local commits). `specs/backend-specialist/` is intentional untracked work; HEAD does not pin it. Backup: `_worktrees/backend-specs-backup-2026-10-05.tgz`.
- Canonical Atlas: Orchestra `foundation/atlas` (owner ruling 2026-10-05). The standalone `/Users/gustavoschneiter/Documents/HuGR/atlas` (HEAD `b319723d5c`, remote HuGR-Labs/atlas, no push access) is legacy and a read-only reference; audits that cite it still describe the same code apart from formatting.
- Canonical Composer: `/Users/gustavoschneiter/Documents/HuGR/skill-001-fastapi-production`, HEAD `df04cf8f9c9c4307d22b6447d513b05b94c08572`.
- Owner scope decision: **Orchestra completo**. Complete delivery on Orchestra, direct without Maestro and delegated through Maestro. Unmodified upstream OpenCode (`orchestra-ai@1.18.27`, tag `4b7e19e315cca414121ba1d61523fef74bb3ae8b`) is out of this delivery's support promise — it lacks fork lifecycle hooks and a separate agent ID.
- Supported install targets (first qualification): macOS arm64/x64, Linux glibc arm64/x64, Windows x64. Windows arm64, Linux musl and x64-baseline CPU claims are separate work, not inherited from the host build matrix.

### 1.1 Baseline refresh `76015a9` → `d11d8652aa` (2026-10-05)

Method: every Orchestra path cited by this plan, `README.md`, `integration-flow.md` and `research/delivery-*.md` checked against `git diff --name-status 76015a9 HEAD`. Atlas and Composer HEADs unchanged. No cited Orchestra source file was deleted or renamed; "missing" paths are Atlas/Composer paths or planned new files.

Changed evidence (audits citing these are stale on the listed points until re-confirmed):

| Area | Change | Impact |
| --- | --- | --- |
| `packages/core/src/session/runner/{publish-llm-event,llm}.ts`, `packages/schema/src/session-event.ts` | Step tokens gain optional `usageKnown` (absent on historical events) | Telemetry risk narrows: unknown usage is now distinguishable on new events. Cost/zero-trial proof still needs re-check of cost path before Q-trials claim it. |
| `packages/core/src/tool-safety*.ts` (new), `packages/orchestra/src/session/tools.ts` | Every V1 tool call (native/custom, MCP, MCP resources) wrapped by `ToolSafety` `intercept`: `before`, output `inspect`, host-bound `Profile` (`writeRoots`, `neverTouch`, `askBefore`, sandbox), `NativeHost.ask` approvals | Owner ruling 2026-10-05: Maestro sets the per-task scope/profile, harness enforces through this seam, the backend specialist only consumes denials as blockers. The backend specialist builds no own scope enforcement; F1/F4 reference this seam. |
| `packages/orchestra/src/maestro/arsenal-completion.ts` (new), `packages/orchestra/src/tool/task.ts` | Governed Task dispatch takes a completion receipt (plan/task bound); host runs checks (`pass/fail/skip/missing/acquisition-error`); unfinished worker fails with `Tool safety HOLD: completion-worker-not-finished`; verified completion attached to task metadata | Owner ruling 2026-10-05: Maestro picks the checks in the packet and accepts the result, harness runs/verifies them through this receipt, the backend specialist returns delta + evidence + blockers. F4 consumes this receipt, never reinvents it. Not a closing Memory checkpoint. Direct use (no Maestro): owner ruling 2026-10-05, the user is the Maestro — the user supplies the packet (scope, checks), the backend specialist runs the assigned checks and returns evidence, the user accepts. Same packet contract both ways; only the absence of the harness receipt differs. |
| `packages/orchestra/src/plugin/hugr-composer/{client,tools}.ts` | Backend errors collapsed to `HuGR Composer backend operation failed`; failure detected from `isError`, `ok:false`, `error` in structured or JSON-text content | Composer structured-failure requirement (done #5) now loses detail at plugin boundary. Decision belongs to the Composer tool contract owner (not the backend specialist, not Maestro runtime); the backend specialist's need: a reason code it can report as blocker. |
| `packages/orchestra/src/agent/prompt/maestro.txt` | On-demand Maestro playbooks incl. `maestro-composer`; Arsenal `describe` before `execute` | Integration-flow wording for Composer routing via Maestro needs re-read. |
| `.github/workflows/test.yml` | CI runs only on `epic` label or manual dispatch; no push-to-dev trigger | Q gates must be local until epic close. Node pins unchanged (E2E `24.15`, setup-bun `24`). |
| `.github/workflows/generate.yml`, `.github/actions/setup-git-committer/` | Deleted | `delivery-quality.md` §CI rows for generate/committer are obsolete. |

## 2. What "done" means

One installed candidate satisfies every mandatory observation below, on all supported targets, through a clean install:

1. Direct use (no Maestro session) and Maestro-delegated use run the same specialist with the same packet contract.
2. Running context carries derived Awareness/Orientation plus the backend specialist's own bounded Project Rules; `task`/`pr` are explicitly consulted; own resumed-unit fold is pushed once per logical resume; Maestro `logbook` stays orchestrator-owned.
3. Six entry skills plus matching runtime/framework references load with bodies and companions; near-miss selection, local coding freedom and role boundaries behave as specified.
4. All nine approved external engine families work from the normal install without per-tool setup; representative generation/transformation runs and its output is actually used.
5. Qualified `hugr-compose` / `hugr-scaffold` preserve exact selection, output kind, create-only publication, full file/effect inventory and structured failures across native/CLI/MCP.
6. Display rename preserves stable member ID, Atlas owner, permissions and historical hashes.
7. Paired real-model trials show credible benefit or lower total time/cost/repair at the required quality bar. No data loss, false verification, scope leakage or identity corruption — these fail unconditionally.

## 3. Interfaces to freeze first (LEAD-0, serial, before parallel work)

| ID | Frozen contract | Consumers |
| --- | --- | --- |
| F1 | Native seat adoption: stable `backend` ID vs display label, primary+delegatable behavior, backend-specialist-only grants, startup name validation, Orchestra-only support claim | H1, H4, S, Q-native |
| F2 | Trusted invocation binding: project/storage/source placement, executing member, authority/execution Session, logical task/resume identity, native invocation refs; Sessionless/title/compaction distinguished | H2, H5, A4, Q-memory |
| F3 | Atlas provider contract: bound header/degradation shape, owner-vs-receipt actor, exact resume fold/admission reference, write receipts/refusals, record identity | A1–A4, H2, Q-memory |
| F4 | Work/result + owned-tool envelope: terminal reason vs verification vs acceptance; `previewed/generated/blocked/failed/interrupted` with effects inventory; native/CLI/MCP failure settlement | H5, C-Q/B/V, Q-tools |
| F5 | Toolkit target contract: supported OS/CPU/libc list, per-engine pins, Buf plugin/protoc recipe set, inventory schema, READY/activation semantics | T1–T6, Q-install/tools |
| F6 | Skill/fixture contract: asset paths/relative links, fixture manifest shape, evaluator checkout boundary, coverage declaration format | S/F/T-recipes, Q-* |

Shared barrels, hook/schema shapes and fixture contracts get one integration owner each. Generated files are never parallel hand-edit targets.

## 4. Work packages

New package roots (lead freezes names): `C = packages/backend-specialist` (specialist), `T = packages/backend-specialist-toolkit` (distribution). Evaluator checkout `E` stays separate and never readable from candidate execution.

### H — host / Maestro (Orchestra)

| WP | Exclusive files | Delivers / depends |
| --- | --- | --- |
| H1 seat adoption | `packages/orchestra/src/agent/agent.ts`, `maestro/roster.ts`, `agent/prompt/backend.txt`, skill admission seams | Real specialist registration, primary-capable + delegatable, backend-specialist-only grants. Depends F1. |
| H2 context binding | `packages/plugin/src/index.ts`, `tool.ts`; `packages/orchestra/src/plugin/index.ts`, `session/llm/request.ts`, `session/system.ts`, `session/tools.ts`, `tool/tool.ts`, `tool/registry.ts` | Actual executing-member binding into provider context; no prompt/name inference. Depends F1–F3. |
| H3 lifecycle truth | `packages/orchestra/src/session/{session,prompt,processor}.ts`, plugin trigger sites | Align start/end/stop semantics with checkpoint contract or drop unsupported claims. Depends F4. |
| H4 identity/presentation | app/TUI/session-ui selection, draft, mention, Task payload paths (P1 §identity) | Stable ID end-to-end, separate rendered label, versioned hash compatibility. Depends F1. |
| H5 task/result | `packages/orchestra/src/tool/task.ts`, `maestro/{dispatch,governed-task-reservation,validation-record,route-grant,context-tool-plan,context-record,authorization}.ts`, subagent-permissions | Strict logical-task binding, typed WorkResult preserving failure/interruption/check/Memory outcomes. Depends F2, F4. |

### A — Atlas provider → boundary → host consumer

| WP | Exclusive files | Delivers / depends |
| --- | --- | --- |
| A1 binding/IO | canonical `packages/adapter-io/src/{native-memory(new),compose,compose-runtime,index,memory-store,durable-log,memory-emit,scanner,memory-verdicts}.ts` + tests | Bound Memory composition with explicit owner/provenance/placement, state diagnostics, scanner/admission/receipt. Depends F3. |
| A2 pure semantics | canonical `packages/memory/src/{respawn,rules,inject,logbook}.ts`, `adapter-io/src/memory-read.ts` + tests | PR fold projection, exact-record resolution, scope-safe rule selection, cited-use wiring if claimed. Depends F3. |
| A3 installed boundary | `packages/atlas-boundary/{package.json,script/*,src/generated/*,test/*}` + vendored `foundation/atlas` delta/snapshot scripts | New IO/native subpath (name frozen by lead), regenerated artifacts, preserved downstream additions. Depends A1. |
| A4 host consumer | `packages/core/src/session/runner/llm.ts` + new domain producer; V1 `session/llm/request.ts`, hook types, config/schema, evidence integration | Selected-member Atlas producer, once-only admission, permissions, degraded states. Depends F2–F3, A1–A3. |

The backend specialist never imports `foundation/atlas` internals and never builds a private store/ranker.

### T — default toolkit distribution

| WP | Exclusive files | Delivers / depends |
| --- | --- | --- |
| T1 native artifacts | `T/native/**` | Acquisition/build recipes + manifests for ast-grep, sqlc, ogen, Buf, SQLx, Kiota, protoc helper. Depends F5. |
| T2 JS closure | `T/js/**` | Pinned Node 22.23.2, Orval/esbuild/ES-plugin locks, local-plugin launch metadata. Depends F5. |
| T3 Python closure | `T/python/**` | Pinned CPython 3.13.16, datamodel-code-generator wheel lock, relocation strategy. Depends F5. |
| T4 JVM closure | `T/jvm/**` | OpenAPI Generator JAR + Temurin JRE 17.0.20.1+1, extraction/legal records. Depends F5. |
| T5 assembly | `T/{package.json,script/**,bin/**,src/**}`, inventory schema | Target selector, archive layout, READY/activation contract. Consumes T1–T4. |
| T6 host integration | `packages/orchestra/script/{build,publish}.ts`, `postinstall.mjs`, `bin/orchestra`, root `install`, Dockerfile, `src/installation/**`, `cli/cmd/upgrade.ts` | Whole-payload preservation, offline install, update/rollback. Depends T5. |

Engine pins: ast-grep 0.45.3, sqlc 1.31.1, ogen 1.24.0 (CI-built), Orval 8.39.0, datamodel-code-generator 0.83.0, Buf 1.73.0 + protoc-gen-es 2.16.0, SQLx CLI 0.9.0 (CI-built), OpenAPI Generator 7.25.0, Kiota 1.35.0. Initial Buf recipe is TS-only; tonic/prost stays a project-crate path with bundled protoc helper where advertised.

### C — Composer qualification (producer repo + bridge)

| WP | Exclusive files | Delivers / depends |
| --- | --- | --- |
| CQ shared contract | `mcp_tools/{tier1,discovery,path_guard,cli,server}.py`, new `qualification.py`, `generators/prepared_artifact.py`, `scaffold_venous.py`, `scaffold_manifest.py`, packaging metadata, `tests/test_prepared_artifact.py` | Canonical schemas, capability handshake, staging/publisher, copy provenance. Depends F4. |
| CC composition | `mcp_tools/compose.py`, new `composition_contracts.py`, 3 selected adapters, compose tests, new qualified test | Exact selection, kind admission, callable descriptors, adapter/lifespan repair. Depends CQ. |
| CS scaffold | `generators/orchestrator*.py`, new `scaffold_contract.py`, model/schema/migration/route/app/security/provenance/sbom generators, scaffold tests, new qualified test | Strict shorthand/profile validation, empty-model semantics, file-only preparation, CWD/boot fixes. Depends CQ. |
| CB bridge | `packages/orchestra/src/plugin/hugr-composer/{tools,client,index}.ts`, new `qualified.ts`, composer tests/fixture | Request validation, prepare/publish binding, canonical outcome, no-replay, structured errors. Depends CQ + H1/H5 interfaces. |
| CV verification | new producer `tests/qualification/**`, new `hugr-composer-installed.test.ts` + fault fixture | Independent wheel/stdio/native/generated-app witnesses + negative controls. Depends CQ–CB. |

License/provenance conflict (Proprietary root vs MIT footer/`CONTRACT.md` B1.0) is resolved by the distribution owner before packaging copied sources.

### S — skills and recipes (`packages/backend-specialist`)

| WP | Exclusive files | Depends |
| --- | --- | --- |
| S-implement | `skills/backend-implement/SKILL.md`, `references/modes/**`, `references/continuity.md` | F6, P1/P2 contracts |
| S-api / S-data / S-concurrency / S-refactor / S-check | respective skill dirs + `references/{protocols,data,lifetimes,refactors,checks}/**` | F6, S-implement interfaces |
| F-family (12 rows: python, go, rust, js-ts, effect, next, jvm, dotnet, ruby, php, elixir + cross overlays via S-api/S-data) | `references/{frameworks,libraries}/<id>/**`, `references/languages/<id>.md` where genuinely language-level | F6, frozen version tuples |
| T-external | `references/recipes/external/**` (one per approved engine family) | F5/F6, T5 pins |
| T-owned | `references/recipes/hugr/**` | F4/F6, CQ contracts |

Content authors never own their acceptance oracles. `effect`/`next` reuse `js-ts` language guidance.

### Q — delivery verification

| WP | Owns | Depends |
| --- | --- | --- |
| Q-native | Installed registration, catalog/body/reference loading, permissions, role boundaries | H1–H2 |
| Q-memory | Real Atlas/Session/rename/resume, direct + delegated continuity | H2/H5, A1–A4 |
| Q-tools | Distributed artifacts + owned native/CLI/MCP conformance | T5–T6, CQ–CB |
| Q-install | Fresh-target install/update/uninstall, asset completeness, use instructions | T5–T6 |
| Q-family (per stack) + Q-cross | Sealed fixtures/oracles/manifests in `E`, independent of authors | S/F + frozen tuples |
| Q-driver | Thin trial runner, trace export, independent grading, paired analysis | All above |

## 5. Execution order and parallelism

- Phase 0 (serial): LEAD-0 freezes F1–F6. No implementation WP starts before its interfaces are frozen.
- Phase 1 (parallel, ≤5 lanes): H1+H2 scaffolding, A1, T1–T4 acquisition, CQ seam, S-implement drafting, Go-slice fixture preparation (baseline/oracle alongside, not after the corpus).
- Phase 2 (parallel): H3–H5, A2–A3, T5, CC+CS, S entries + first family references, Q scaffolding against frozen fixtures.
- Phase 3: A4, T6, CB real mapping, CV clean-install checks, Q-native/memory/tools/install execution.
- Phase 4: installed Go continuity slice + paired baseline/candidate comparison; then remaining tuples, transports and platform installs.
- Phase 5: consolidated independent acceptance, release notes, rollback/update verification.

Whole-file ownership per WP; shared manifests, locks, barrels and CI wiring have a single integrator. Handoffs of central files are explicit and serial.

## 6. Verification

Package-local commands only: `bun typecheck` and scoped `bun test …` from the affected package directory; never root tests or bare `tsc`. Atlas canonical packages use their Vitest workspace; Composer uses `PYTHONPATH=. … pytest … -q` in disposable checkouts. Protocol/Server HttpApi changes require `bun run generate` in `packages/client`; legacy SDK uses `./packages/sdk/js/script/build.ts`.

Every engine/operation ships positive + adverse controls: exact selection, skeleton/delegation rejection, empty-model semantics, preview byte identity, create-only/path races, full inventory, partial/cancel behavior, false-producer-success rejection, surface consistency, isolation/packaging. Oracles are calibrated (known-good and alternative-valid pass; buggy/no-op/plausible-wrong fail; missing/empty/skipped/error reject). Skipped real-binary legs are reported unqualified, never green.

## 7. Final acceptance gate

Release only when one installed candidate, on every supported target, satisfies all §2 observations plus: named degraded/refused outcomes are distinct and truthful; update/rollback preserves identities, memory, user files and prior payload; paired trials follow the frozen manifest with isolated graders and full cost accounting (unknown usage stays unknown). Critical failures — data loss, false verification, scope leakage, identity corruption — fail unconditionally and cannot be averaged away.

## 8. Source base

P1 host/standalone audit, P2 Atlas binding audit, P3 toolkit artifacts, P4 Composer qualification, P5 authorship/verification — archived under `research/delivery-*.md`. Prior contracts: `tool-distribution.md` (approved payload), `owned-tools.md` (qualified compose/scaffold), `integration-flow.md` + `atlas-memory-contract.md` (task/memory flow), `skill-catalog.md` + `skill-matrix.md` (composition and variants).
