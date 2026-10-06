# LEAD-0 — interface contracts F1–F6

Status: 2026-10-05, **frozen for Phase 1** (F1–F4, F6, and F5 except install channels/signing, which gate only T5/T6 in Phases 2–3). Baseline: Orchestra `d11d8652aa`, Atlas `b319723d`, Composer `df04cf8f`. Source reading only; nothing executed.

| File | Contracts | Clauses |
| --- | --- | --- |
| `f1-f2-host.md` | F1 native seat adoption, F2 trusted invocation binding | 13 + 16 |
| `f3-atlas.md` | F3 Atlas provider contract | 31 |
| `f4-work-result.md` | F4 work/result + owned-tool envelope | 35 |
| `f5-f6-toolkit-skills.md` | F5 toolkit target, F6 skill/fixture | 32 + 22 |

Drafts were authored by four read-only agents. Lead spot-checked: `registry.ts:242` display-name lookup, `task.ts:425-429` receipt `taskID` = child Session ID, `mcp/catalog.ts:68-74` drops `structuredContent` on `isError`, Atlas `memory-read.ts:225-236` `spawnFold` via first-match `foldArchiveFromRecord`, deleted `publish.yml` (only `nix-eval`, `storybook`, `test`, `typecheck` workflows remain).

## 1. Owner rulings applied (2026-10-05)

- Maestro owns per-task scope, checks and acceptance; harness enforces (`ToolSafety`) and verifies (`ArsenalCompletion`); the backend specialist consumes both and builds neither.
- Direct use: the user is the Maestro. Same packet contract; only the harness completion receipt is absent.
- Composer failure detail belongs to the Composer tool-contract owner; the backend specialist requires a closed-set reason code (F4 clause 26).

## 1.1 Owner decisions answered 2026-10-05

| ID | Decision | Consequence for the contracts |
| --- | --- | --- |
| F1-D3 | ~~The backend specialist is visible in the app/TUI agent picker by default.~~ **Superseded for the desktop app (2026-10-06, dev #31):** the user talks only to Maestro; the composer has no agent choice and every session runs on `maestro`. | The seat stays primary-capable for the TUI/CLI and for Maestro delegation; app direct use goes through Maestro. |
| F3-D5 | Atlas Memory and Knowledge are versioned in Git with the repository. A worktree's Memory has value only once its code merges; the canonical state is the default branch (`dev`/`main`). | Memory is written as tracked files inside the task worktree and merges with the code. Resume reads the branch's own Memory. A1 must make the Memory log merge-safe (append-only records with stable IDs, e.g. a union merge driver or one file per record) so parallel branches do not conflict. F4-O4 working-tree digest excludes the Atlas Memory paths so Memory writes never change the verified code delta. F3-D7 stands: writes come from the harness Atlas binding, not from the backend specialist's file tools. |
| F6-D2 | Evaluator checkout E is a separate private repository `backend-bench`, modeled on `maestro-bench`. Never installed with the backend specialist and never readable from candidate execution. | Q-family/Q-driver own it; Go fixture prep starts there. |
| F5-OD | Engines are fetched **on demand**, not bundled in the install payload. Amends owner decision 4: "ready by default" now means no per-tool setup, not pre-downloaded. | The harness (not the backend specialist, whose sandbox blocks network) fetches an exact pinned version, verifies its checksum, and caches it in a shared per-user dir on first use. Offline hosts use an explicit prefetch command. F5 inventory/READY semantics become per-engine `absent → fetching → ready / failed`. T1–T4 produce pinned manifests + checksums instead of bundled payloads; T5/T6 shrink. |
| F3-D9 | Ship `gitleaks` (MIT) in the backend specialist toolkit as the pre-write secret scanner. | F5 engine list gains a tenth family; T1 pins version and targets. Memory writes are never refused `scanner-unavailable` on supported installs. |

## 2. Lead rulings (technical defaults; owner may override)

| ID | Ruling | Why |
| --- | --- | --- |
| F1-D1 | Invalid configured label: start with the default label (`BACKEND_DEFAULT_LABEL`), surface a configuration error. | Cosmetic input must not block startup; stable ID unaffected. |
| F1-D2 | Config key is the source; `HUGR_BACKEND_NAME` is an override of it. | Config is persisted and reviewable; env stays for CI/ops. |
| F2-D1 | Direct use: host generates logical `taskId` at first backend specialist turn; user may name it in the packet, host validates and binds. | Same packet contract both modes; never model-supplied. |
| F2-D2 | Fail-closed unknown/mismatched `task_id` only for the backend specialist and governed dispatch. | Avoid changing generic Task behavior outside this delivery. |
| F2-D3 | Direct use binds the user's packet scope into a per-Session ToolSafety profile. | Follows from "user is the Maestro": same enforcement, not charter-only. New H5 work. |
| F3-D1 | First delivery: own top-12 ranked project rules, unscoped; amend claim. Scope-aware selection later. | Smallest truthful claim. |
| F3-D2 | PR resume fold includes `knowledgeDelta`. | Field exists in `pr` kind; dropping it loses experience. |
| F3-D3 | Ambiguous resume without receipt: refuse `ambiguous`, return blocker. | Fail closed; never guess the unit. |
| F3-D4 | After compaction evicts the fold: host re-pushes the same `RecordRef` once. | Residency restore, not a new fold. |
| F3-D6 | Initial frecency comes from Atlas default policy, never the model. | Atlas owns ranking. |
| F3-D7 | Atlas storage writes are harness-owned foundation storage, outside the task ToolSafety profile. | Harness owns persistence; Memory is not task output. |
| F3-D8 | Single-writer-process admission suffices for first delivery. | Matches process-local Session drains (`AGENTS.md`). |
| F4-O1 | Maestro may accept unarmed delegated results; the packet decides, verification shows `not-host-verified`. | Maestro owns acceptance policy; F4 supports both. |
| F4-O2 | Accepting `host-failed`/`host-incomplete` is allowed only with a recorded reason. | Known-baseline/flaky cases exist; never silent. |
| F4-O3 | Durable accept/reject record for delegated work; conversational for direct. | Maestro already has durable dispatch records. |
| F4-O4 | Harness binds a working-tree digest for verification; the backend specialist never commits. | The backend specialist role excludes repo operations. |
| F4-O5 | Packet decides whether the backend specialist pre-runs checks in armed mode; default yes for cheap checks. | Maestro owns checks; earlier repair. |
| F5-D1 | Accept measured per-target OS floors as the support claim. | Avoid rebuilding upstream engines. |
| F5-D2 | Buf recipe set TS-only (`buf-ts-es`) in first qualification; no bundled protoc. | Already the plan's initial set. |
| F5-D4 | Unqualified targets refuse with `UNSUPPORTED_TARGET`. | Never ship unverified binaries as ready. |
| F5-D5 | Scratch is a host-provided per-invocation dir added to `writeRoots`. | Keeps ToolSafety authoritative. |
| F5-D6 | Builder pins: Go ≥1.25.0 for ogen, Rust ≥1.94.0 for sqlx-cli, exact versions chosen in T1; no `mysql-rsa` initially. | Technical; Postgres-first slice. |
| F5-D7 | Exact host-version lock for the toolkit. | Simplest rollback/update story. |
| F6-D1 | Register skills via V1 `skills.paths`. | P1: V2 adapter stays separate; one path to qualify. |
| F6-D3 | First frozen tuple: Go `chi + pgx 5.8.0 + sqlc 1.31.1` (first slice). Other families freeze when their WP starts. | Matches the first demonstrable slice. |

| F4-CH | Charter draft amends F4: the `backend-result` card has no tool-call IDs (H5 binds by exact path and command+cwd; else `unbound`) and carries a closed `outcome: done \| blocked` that H5 maps to terminal `blocked`. | See `../charter-draft.md` CH-3, CH-7. |

| S-1 | SKILL.md body cap is 1,000 words (amends F6, which set none); references carry detail. | Enforced by `packages/opencode/test/skill/backend-skills.test.ts`. |
| S-2 | Armed mode: the packet decides whether the backend specialist pre-runs checks; default is not to (charter wins). Amends F4-O5. | Avoids duplicate runs and keeps one rule in the prompt. |
| S-3 | Resume fold missing or ambiguous → `packet` blocker; Atlas store partial or unavailable → `atlas` blocker. | Fills the kind F3 cl. 20 leaves unnamed. |
| S-open | A required `lesson` with no real lesson: the TaskMemoryEntry template has no "none" value and inventing one is forbidden. Owner: Atlas template (A1/A2). | Raised by S-implement; continuity.md stays silent until decided. |

| F4-BG | Background Task: the Task part keeps `terminal.reason: "running"`; the final `workResult` travels on the parent's existing completion notice. Amends F4 cl. 35. Delivery is best effort today. | Durable delivery is open (H5). |

## 3. Owner decisions pending

| ID | Question | Blocks |
| --- | --- | --- |
| F5-D3 | Install channels carrying the toolkit (curl / npm / Homebrew / AUR). No release workflow exists at HEAD. | T5, T6 (Phase 2–3) |
| F5-D8 | Re-sign / notarize bundled third-party executables. | T6 (Phase 3) |

## 4. New risk

- Release pipeline removed: `publish.yml`, containers, deploy and nix-hashes workflows were deleted in `fork/dev`. Every install channel's toolkit assembly/publish job is new work, and no workflow runs on macOS.
