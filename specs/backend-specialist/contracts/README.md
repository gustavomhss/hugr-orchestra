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
| F1-D3 | ~~The backend specialist is visible in the app/TUI agent picker by default.~~ **Superseded for the desktop app (2026-10-06, dev #31):** the user talks only to Maestro; the composer has no agent choice and every session runs on `maestro`. **Superseded everywhere by the harness rewrite (epic #22):** Maestro is the only primary agent. | ~~The seat stays primary-capable for the TUI/CLI and for Maestro delegation; app direct use goes through Maestro.~~ The seat is a `subagent` in the app, TUI, CLI and ACP; all use goes through Maestro's delegation, so F1.6's primary mode and the charter's direct use no longer occur. |
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
| S-1b | Each file under `references/` is capped at 700 whitespace words (milestone 3 ruling M3-6), with no exceptions; `continuity.md` was trimmed under the cap. | Keeps one read per reference cheap. Enforced by `packages/opencode/test/skill/backend-families.test.ts`. |
| F6-D3a | Frozen Go tuple: Go 1.25+, `net/http` + `context`, chi `v5.3.2`, pgx `v5.8.0`, sqlc `1.31.1` runtime output with `sql_package: pgx/v5` (M3-6 pins chi). | Closes F6-D3 for Go; the Go references state these pins and `backend-families.test.ts` rejects any other version of them. |
| F6-D3b | Frozen Python tuple: CPython `3.12.11`, FastAPI `0.118.0` on Starlette `0.48.0`, Pydantic `2.11.7`, SQLAlchemy `2.0.43` asyncio, HTTPX `0.28.1` for tests (versions inspected in research R48). No async driver version is frozen; the project lock governs it. | Closes F6-D3 for Python; the Python references state these pins and `backend-families.test.ts` rejects any other version in the family. |
| F6-D3c | Frozen JS/TS tuple: Node.js `22.18.0`, Express `5.1.0` (router `2.2.0`), Fastify `5.6.1`, Zod `4.1.8`, pg `8.16.3`; Bun `1.3.14` only where the packet selects Bun (research R51). Express `4.21.2` and Fastify `4.29.1` are delta sections inside `express.md` and `fastify.md`, not frozen majors, so F6.4 keeps one file per framework. | Closes F6-D3 for JS/TS; `backend-families.test.ts` rejects any other version in the family. |
| F6-R1 | Engine recipes `recipes/external/{ast-grep,sqlc,buf,kiota}.md` state the M3-3 pins (ast-grep `0.45.3`, sqlc `1.31.1`, buf `1.73.0`, kiota `1.35.0`) and run only `"$BACKEND_TOOLKIT_BIN/<engineId>"`; a `toolkit-not-ready:` or `unsupported-target:` output becomes a `tool` blocker. buf covers lint, build and breaking only (no generation plugin in the first cut). gitleaks is a host-side scanner and has no seat recipe. | F6.11 for the first toolkit cut; `backend-families.test.ts` checks the recipe set, pins and invocation path. |
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

## 5. Host write roots (H5 slice, 2026-10-05)

Built on branch `write-roots`; the charter v3a note asked for this instead of more prose.

- **Binding.** Task takes optional `writePaths` (worktree-relative files or directories). Only the backend seat (stable ID `backend`) honors it; other members ignore it. Validation refuses absolute paths, any `..` segment, empty entries and symlink escapes before a child exists (`Task denied: write-path-*`). The host stores the canonical roots as reserved `tool_safety_write_root` rules in the child Session's permission ruleset, so governed and authorized reservation snapshots carry them unchanged; a governed replay asking for other roots fails `reservation-write-roots-mismatch`, an authorized replay fails `reservation-binding-mismatch`. A plain `task_id` resume adopts the resuming dispatch's roots.
- **Enforcement.** `ArsenalBindings.withSession` wraps the project profile loader for a bound Session (`WriteRoots.loader`): `writeRoots` = bound roots narrowed to the project profile's own roots, `requireSandbox: true`, `sandbox.scratch: true`, `sandbox.unconfinedFallback: true`. Absent or empty `writePaths` binds `writeRoots: []`, so edit, write and apply_patch fail `Tool safety HOLD: write-outside-physical-roots` on every platform, with or without a sandbox. Shell commands run under the platform sandbox with writes allowed only under the roots, `/dev/null`, and a fresh per-command scratch dir exported as `TMPDIR`/`TMP`/`TEMP` (F5-D5). Seatbelt `file-write*` also denies chmod/chflags outside the roots.
- **No sandbox yet (owner decision 2026-10-06).** Where the host has no sandbox, a bound child's shell command runs without the write jail instead of being held. It is never silent: the ToolSafety observation of that call carries `shellWrites: "unenforced"` and `shellSandbox: { kind: "none", reason }`. Profiles without `unconfinedFallback` keep the old HOLD (`required-process-sandbox-unavailable`, `sandbox-platform-unavailable`). Reasons: `sandbox-platform-unsupported: <platform>`, `sandbox-dependency-missing: <executables>`, `sandbox-runtime-acquiring`, `sandbox-runtime-not-acquired` (status only), `sandbox-runtime-acquisition-failed: <step>`.
- **Sandbox on demand.** macOS uses the built-in seatbelt (`/usr/bin/sandbox-exec`). On Linux the jail is `srt` (npm `@anthropic-ai/sandbox-runtime`, pinned 0.0.78) over bubblewrap. `srt` on `PATH` is used as is; otherwise the first sandbox-bound command starts a background fetch of the pinned `srt` tarball, its four npm dependencies and ripgrep 15.1.0 (which `srt` needs on Linux), each from its official source (npm registry, ripgrep GitHub release) and checked against a pinned sha512 before anything is extracted. It installs into `<cache>/sandbox-runtime/0.0.78-<arch>` in one rename and is run by the host's own JS runtime (`BUN_BE_BUN=1` for the compiled binary). The command that started the fetch runs unconfined; later ones use the jail. A failed fetch is retried after five minutes. bubblewrap (`bwrap`) and `socat` come from the system package manager: the host never installs them; when either is missing nothing is fetched and the reason names it. Windows: `srt` is alpha there and needs an elevated `srt windows-install` (local account plus machine-wide WFP filters), which the host does not run, so Windows stays unenforced.
- **Toolchain caches.** In a jailed command with a scratch dir, `GOCACHE`, `XDG_CACHE_HOME`, `npm_config_cache`, `BUN_INSTALL_CACHE_DIR`, `PIP_CACHE_DIR` and `UV_CACHE_DIR` point inside the scratch dir (empty per command, so no warm cache). Unconfined commands keep their own. Checked on macOS seatbelt: `go test` fails without this and passes with it, including modules read from an existing `GOMODCACHE` (left alone: Go only reads it offline); `npm run`, `bun <file>`, `pip list` and `cargo run --offline` on a crate without dependencies pass either way. Not covered: cargo with registry dependencies (`CARGO_HOME` holds config and the registry, so it is not redirected), and anything that has to download (network is denied in the jail).
- **Host fact.** `workResult.writeRoots` lists the enforced roots, worktree-relative; `[]` means read-only. `workResult.shellWrites`/`shellSandbox` say whether the child's shell commands got the jail: the worst fact among the child's commands in this process (`unenforced` sticks), or, if none ran, what this host would give one now.
- **Gaps.** A missing directory root can be created by the edit tools, not by the shell (creating its parent is outside the roots). `writePaths` is not part of the approval `taskHash` or the authorization intent hash: the user approves the prompt, and the reservation, not the approval, binds the roots. Root `.` includes `.git`. The fetched `srt` is checked when downloaded, not on every use: an unconfined command that ran before it was installed could have changed files under the cache dir, as it could any binary on `PATH`. Ubuntu 24.04+ restricts unprivileged user namespaces by default; there every `srt` command fails (it does not fall back to unconfined) until the host's AppArmor setting allows bubblewrap. The Linux `srt` path has no live test here (CI runners have no bubblewrap); the tests run a stand-in `srt` to check the invocation, settings and env.
- **Direct use (F2-D3), not built.** A primary backend Session has no dispatch to carry `writePaths`. It needs a host-owned binding the user sets for the Session (a session-level command or API that writes the same reserved rules after validation), plus a default for an unbound direct Session (today: unrestricted, as before). The model must never be able to set it.

## 6. F5 Amendment M3 (2026-10-06)

F5 now describes engines fetched on demand (`f5-f6-toolkit-skills.md`, "Amendment M3"), applying F5-OD, M3-3 and M3-4:

- The toolkit lives in the user cache (`Global.Path.cache/backend-toolkit`, override `BACKEND_TOOLKIT_ROOT`); eviction is fine, an evicted engine is fetched again.
- Per-engine states (`absent`, `fetching`, `ready`, `failed`, `unsupported`) replace releases, inventory and activation (F5.15–F5.24, F5-A, F5-C, F5-D).
- Routes: ast-grep from npm, buf as the raw executable; gitleaks 8.30.1 joins F5.5.
- F5-D7 is satisfied: the manifest compiles into the host.
- First cut is five engines: ast-grep, sqlc, buf, gitleaks, kiota (M3-3).
- The shell tool exposes `BACKEND_TOOLKIT_BIN` to the native backend seat only and fetches the engines a command names before running it; a failure blocks the command with `toolkit-not-ready:failed:<engine>:<cause>` or `unsupported-target:<reason>`. `toolkit status` and `toolkit prefetch` are the CLI.

## 7. F5 Amendment M4 (2026-10-06)

Ruling M4-1, written into `f5-f6-toolkit-skills.md` as "Amendment M4":

- Hosted engines run on pinned runtimes: `orval` and `protoc-gen-es` on Node, `openapi-generator` on the Temurin JRE, `datamodel-codegen` on CPython. No ambient interpreter is used (F5.8).
- npm and pip closures are pinned by lockfile and hash list: `npm ci --ignore-scripts` over a lockfile with an integrity for every package, `pip install --require-hashes --no-deps --only-binary=:all:` over a list with a sha256 for every wheel; a jar is pinned by its own digest.
- Runtimes are shared per user cache: one install per version and target under `<TK>/runtimes/<id>/<version>-<target>/`, used by every engine on it.
- A runtime that cannot be made ready blocks its engines with `toolkit-not-ready:failed:<engine>:runtime-<cause>`.
