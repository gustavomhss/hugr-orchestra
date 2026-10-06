# The backend specialist frozen interface contracts F5 and F6 (draft for LEAD-0 freeze)

Status: draft normative text, 2026-10-05. Source basis: Orchestra worktree `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin` at HEAD `d11d8652aa`. This is read-only analysis. Nothing here was installed, built, tested or run. Paths written `S/...` are relative to that worktree. `T` = `packages/backend-specialist-toolkit`, `C` = `packages/backend-specialist`, `E` = the separate evaluator checkout, as defined in `specs/backend-specialist/execution-plan.md` §4.

Normative keywords: MUST, MUST NOT, SHOULD, MAY. **[existing]** marks a mechanism already in source at HEAD, with its anchor. **[required-new: WP]** marks a mechanism that does not exist yet and names the WP that owns building it. Neither contract adds features to the skill loader.

Owner rulings in force (not reopened here): six entry skills plus mode/domain and language/runtime/framework/version references, with no Cartesian explosion. The nine approved engine families ship ready by default. First qualification covers macOS arm64/x64, Linux glibc arm64/x64 and Windows x64. musl, Windows arm64 and baseline-CPU are separate work. E is never readable from candidate execution. External tools are specialized generators, and one skill may use many tools.

---

## F5 — Toolkit target contract

### Amendment M3 (2026-10-06): engines fetched on demand

Applies owner decision F5-OD and milestone rulings M3-3 and M3-4 (`../delivery-plan.md` §2). Where this block and a clause below disagree, this block wins. Built in `packages/core/src/pinned-artifact.ts` and `packages/core/src/backend-toolkit/`.

- **First cut (M3-3).** Five engines: `ast-grep` 0.45.3, `sqlc` 1.31.1, `buf` 1.73.0, `gitleaks` 8.30.1 and `kiota` 1.35.0, pinned in `packages/core/src/backend-toolkit/manifest.ts` for the five F5.1 targets. OpenAPI Generator, `protoc-gen-es`, Orval and datamodel-code-generator are the second cut: they need a runtime closure, so the F5.5 private runtimes wait for them. `ogen` and `sqlx-cli` are blocked: upstream ships no binaries and hosting our builds is F5-D3/F5-D8.
- **Routes (amends F5.5).** `ast-grep` comes from the npm package `@ast-grep/cli-<target>` (pinned to the registry's `dist.integrity`) and exposes `ast-grep` only. `buf` is the raw upstream `buf-<OS>-<arch>` executable, not an archive; its `protoc-gen-buf-*` plugins are not fetched. `gitleaks` 8.30.1 (F3-D9) is added. Every pin is an SRI digest of the download, and the download is checked against it before any byte reaches the disk.
- **Placement (M3-4, replaces F5.14).** `<TK>` is `Global.Path.cache/backend-toolkit`; `BACKEND_TOOLKIT_ROOT` overrides it. Eviction is allowed: an evicted engine is `absent` and is fetched again on its next need.
- **Layout (replaces F5.15 and F5.20–F5.22).** Each engine installs into `<TK>/engines/<id>/<version>-<target>/` through one rename of a complete staging directory, with `.complete` written last. Once the engine is ready, the host writes its launcher at `<TK>/bin/<id>` (POSIX `sh`) or `<TK>/bin/<id>.cmd` (Windows) through a temp file and one rename. The launcher sets the engine's manifest `env` (kiota's `KIOTA_OFFLINE_ENABLED` and `KIOTA_CLI_TELEMETRY_OPTOUT`) and execs the engine with the caller's arguments; F5.16 items 2–4 still hold. There are no releases, `inventory.json`, `active.json` or activation: the manifest compiled into the host is the inventory.
- **States (replaces F5.23, F5.24 and F5.31's `toolkit-not-ready:<substate>`).** Toolkit state is per engine: `absent`, `fetching`, `ready` (install directory and executable), `failed` (the install cause and when it failed) or `unsupported` (the F5.3 reason). Concurrent needs in one host process share one fetch. A failure is remembered for five minutes; inside that window every need fails with it without fetching again, and the first need after it retries. No representative operation runs at fetch time; F5.25 moves to Q-tools. The blocker reasons are `toolkit-not-ready:failed:<engine>:<cause>` and `unsupported-target:<reason>`.
- **Exposure (amends F5.17).** The shell tool sets `BACKEND_TOOLKIT_BIN=<TK>/bin` only for the native backend seat; it does not use the `shell.env` hook and no other member gets the variable. Before a seat command runs, the host scans it for `$BACKEND_TOOLKIT_BIN/<id>`, `${BACKEND_TOOLKIT_BIN}/<id>` and `$env:BACKEND_TOOLKIT_BIN\<id>` (either separator) and makes each named engine ready, waiting for the fetch. A command that names no engine never fetches. When an engine cannot be made ready, the command does not run and the tool output is the blocker reason, which the seat reports as a `tool` blocker.
- **Status and prefetch (replaces F5-D).** `toolkit status [--json]` prints one state per engine (`[{ engine, version, target?, status, ... }]`). `toolkit prefetch [ids...] [--target <id>]` fetches ahead of first use, for offline hosts; a target other than the host's installs without a launcher. Both exit non-zero when any listed engine is `failed` or `unsupported` (prefetch also when one is not `ready`).
- **F5-D7 satisfied.** The manifest compiles into the host, so the engine set is locked to the host version by construction; F5.27's `hostCompat` check is dropped.
- **Repair, update, channels (amends F5.26, F5.28, F5.29).** Repair is removing an engine directory or the cache; the next need fetches it again. A host update with new pins installs side by side under a new `<version>-<target>`; old directories stay until the cache is evicted. Install channels carry no engines; their postcondition is that the first need, or `toolkit prefetch`, fetches them.

### Contract

**Targets**

F5.1 The first-qualification target set is closed and has exactly five members. Target IDs use npm `os`/`cpu` spelling to match the existing platform-package selectors (`S/packages/opencode/script/build.ts:53-114`, `S/packages/opencode/script/publish.ts:34-79`):

| Target ID | os | cpu | libc | CPU floor claimed |
| --- | --- | --- | --- | --- |
| `darwin-arm64` | darwin | arm64 | n/a | Apple silicon |
| `darwin-x64` | darwin | x64 | n/a | x86-64 with AVX2 (host non-baseline variant) |
| `linux-arm64` | linux | arm64 | glibc | ARMv8.0-A |
| `linux-x64` | linux | x64 | glibc | x86-64 with AVX2 (host non-baseline variant) |
| `win32-x64` | win32 | x64 | n/a | x86-64 with AVX2 (host non-baseline variant) |

F5.2 Toolkit target detection MUST use the same normalization the host installers use. That means Rosetta-translated darwin-x64 maps to `darwin-arm64` (`S/install:95-100`), and musl is detected via `/etc/alpine-release` or `ldd --version` (`S/install:117-127`, `S/packages/opencode/script/postinstall.mjs:80-95`). AVX2 detection follows `S/install:130-155`. The toolkit selector MUST NOT copy the host's cross-variant fallback order (`postinstall.mjs:97-118`, which can pick a musl or baseline package on a glibc/AVX2 host). The toolkit target is either an exact match or `UNSUPPORTED_TARGET`.

F5.3 Hosts that are linux-musl (including the Alpine Docker image `S/packages/opencode/Dockerfile:1-16`), win32-arm64, or x64 without AVX2 MUST report toolkit state `UNSUPPORTED_TARGET` with a reason (`libc-musl`, `cpu-arm64-windows`, `cpu-baseline`). The installer MUST NOT report READY on them, and MUST NOT silently install a payload built for another target. Whether the host itself still installs on those targets is outside F5.

F5.4 The OS-version floor and glibc floor per target are **measured, not assumed**. Each floor MUST equal the maximum requirement across the whole closure for that target: native ELF/Mach-O/PE linkage audit, Node 22.23.2 (glibc ≥2.28, macOS ≥11, Windows ≥10), the .NET 10 self-contained Kiota payload, CPython PBS and Temurin. T5 records the floors in the inventory (F5.20). Until the owner accepts the measured floors, F5.1 makes no OS-version claim (see Open owner decisions).

**Engine and runtime pins**

F5.5 The approved payload is pinned exactly. A change to any pin is a contract amendment. Engines:

| Engine ID | Version | Artifact route | Built by | License |
| --- | --- | --- | --- | --- |
| `ast-grep` | 0.45.3 | npm `@ast-grep/cli-<target>` tarball (Amendment M3); expose `ast-grep` only, never `sg` | upstream | MIT |
| `sqlc` | 1.31.1 | upstream `sqlc_1.31.1_<os>_<arch>` archive | upstream | MIT |
| `ogen` | 1.24.0 | module `github.com/ogen-go/ogen/cmd/ogen@v1.24.0`, source rev `0d865e7e568f1b36e5e6788e39aa5cd14e02999f`; `CGO_ENABLED=0`, `GOAMD64=v1` | our CI (T1) | Apache-2.0 |
| `orval` | 8.39.0 | npm closure, all `@orval/*` pinned, plus `esbuild` 0.28.0 with its `@esbuild/<os>-<cpu>` binary | upstream packages, assembled by T2 | MIT |
| `datamodel-code-generator` | 0.83.0 | py3-none-any wheel plus a resolver-validated wheel lock including Black and isort | upstream wheels, assembled by T3 | MIT |
| `buf` | 1.73.0 | raw upstream `buf-<OS>-<arch>` executable (Amendment M3; the `protoc-gen-buf-*` plugins are not fetched) | upstream | Apache-2.0 |
| `protoc-gen-es` | 2.16.0 | npm `@bufbuild/protoc-gen-es`, `@bufbuild/protobuf` and `@bufbuild/protoplugin` 2.16.0 | upstream packages, assembled by T2 | Apache-2.0 |
| `sqlx-cli` | 0.9.0 | crate source SHA `003b698e99e024f3621b8043a2426fde5b741171`; `cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features rustls,postgres,mysql,sqlite,sqlx-toml`; ships `sqlx` and `cargo-sqlx` | our CI (T1) | MIT OR Apache-2.0 |
| `openapi-generator` | 7.25.0 | release asset `openapi-generator-cli-7.25.0.jar`, invoked as a direct JAR (no npm/bash updater wrapper) | upstream | Apache-2.0 |
| `kiota` | 1.35.0 | upstream `{osx,linux,win}-{arm64,x64}.zip` self-contained RID archive, complete | upstream | MIT |
| `gitleaks` | 8.30.1 | upstream `gitleaks_8.30.1_<os>_<arch>` tar.gz (zip on Windows) (F3-D9, Amendment M3) | upstream | MIT |

Private runtimes:

| Runtime ID | Version | Route | Serves |
| --- | --- | --- | --- |
| `node` | 22.23.2 | official `node-v22.23.2-<os>-<arch>` archive | orval, protoc-gen-es |
| `cpython` | 3.13.16, PBS release 20261003 | `install_only_stripped`, GIL-enabled, baseline x86_64 (not v2/v3/v4, not freethreaded) | datamodel-code-generator |
| `temurin-jre` | 17.0.20.1+1 | `OpenJDK17U-jre_<arch>_<os>_hotspot_17.0.20.1_1` | openapi-generator |

Conditional helper: `protoc` 36.2 with `include/google/protobuf/*.proto`. It ships only if F5.9 advertises a protoc-dependent recipe (Open owner decision F5-D2).

F5.6 Every pin in F5.5 MUST be identical across all five targets. Per-target version skew is forbidden.

F5.7 The builder toolchains for CI-built engines (ogen: Go ≥1.25.0; sqlx-cli: Rust ≥1.94.0) MUST be pinned exactly and recorded in the inventory as `builder`. Builds use generic CPU targets. The exact toolchain versions are Open owner decision F5-D6.

F5.8 The toolkit MUST NOT invoke an ambient `node`, `python`, `java`, `dotnet`, `go`, `cargo` or an unpinned copy of any engine. The one exception is a project-pinned route declared by a recipe under F5.30.

**Buf plugin / protoc recipe set**

F5.9 The advertised Buf generation recipe set for first qualification has exactly one member, `buf-ts-es`:
- Buf 1.73.0 with the local plugin `protoc-gen-es` 2.16.0 on the private Node.
- Options `target=ts,import_extension=js`, plus `include_imports: true` where custom-option imports need output.
- Connect-ES 2.2.0 is an application runtime dependency, not a generator. No `protoc-gen-connect-es` v1 is shipped.
- Buf's built-in `lint`, `build` and `breaking` are part of the `buf` engine and need no extra plugin.

F5.10 No remote plugin, BSR-hosted generation or registry fetch may be part of any advertised recipe. A `buf.gen.yaml` that uses `remote:` is a project input the recipe MUST reject as "remote plugin not supported offline". It MUST NOT be reported as a toolkit defect.

F5.11 `protoc_builtin` targets and the Rust `tonic-prost-build` path are not part of `buf-ts-es`. tonic/prost stay project build crates. If F5-D2 approves the protoc helper, the recipe set gains exactly one member, `protoc-rust-tonic`: the bundled `protoc` 36.2 plus include root, exposed only through `PROTOC` and `PROTOC_INCLUDE` set by the launcher. No fictitious `protoc-gen-tonic` binary may be shipped.

F5.12 The project's `buf.gen.yaml` MUST reference the plugin by bare name (`local: protoc-gen-es`). The toolkit MUST NOT write absolute machine paths into project files. The `buf` launcher (F5.16) prepends the active release's plugin-launcher directory to `PATH` **for the buf child process only**.

F5.13 Adding a language plugin (Go, gRPC, Connect, validation) is a contract amendment. It brings its actual plugin artifact, runtime closure, recipe and representative operation. Buf installation alone never implies it.

**Layout, resolution and invocation**

F5.14 Toolkit root placement. The toolkit root `<TK>` MUST be on a real filesystem (not a Bun virtual-FS embed) and MUST be outside:
- `Global.Path.data` and `Global.Path.state` (`S/packages/core/src/global.ts:11-27`). The ToolSafety sandbox denies both **read and write** to these (`S/packages/core/src/tool-safety-sandbox.ts:73-77`, `:88-90` for seatbelt and `:101` for srt `denyRead`), so a toolkit placed there cannot run under a sandboxed profile.
- `Global.Path.cache` and `Global.Path.bin` (`global.ts:12,22`). These are evictable caches, so a toolkit placed there would not have stable READY.
- The project worktree and any write root.

The canonical location is `<hostRoot>/toolkit/`, where `<hostRoot>` is `dirname(dirname(hostExecutable))`. The installer MAY override it with `BACKEND_TOOLKIT_ROOT`. **[required-new: T5 resolver, T6 channel placement]**

F5.15 Directory layout inside `<TK>`:
```text
<TK>/
  active.json                         # activation pointer (F5.22), the only mutable file at <TK> level
  releases/<releaseId>/               # immutable once activated; releaseId = <toolkitVersion>-<targetId>
    inventory.json                    # F5.20
    bin/                              # launchers: POSIX `<name>`, Windows `<name>.cmd` or `<name>.exe`
    plugins/bin/                      # plugin launchers prepended to PATH only by the `buf` launcher
    native/<engineId>/...             # T1 output
    js/{node/,lib/...}                # T2 output (Node runtime + locked trees)
    python/{cpython/,site-packages/}  # T3 output
    jvm/{jre/,openapi-generator-cli-7.25.0.jar}  # T4 output
    licenses/<componentId>/...        # full license/notice texts
    locks/                            # package-lock.json, Python lock, Cargo.lock, go.sum used to build
  staging/                            # in-progress releases only, never resolved by launchers
```

F5.16 Launcher contract. Each engine has exactly one launcher at `releases/<id>/bin/<engineId>` (POSIX) or `bin/<engineId>.cmd|.exe` (Windows). A launcher:
1. execs the absolute runtime and entry point from the same release, with an argv array (no shell re-parsing);
2. sets only the child-scoped environment listed in the inventory `env`. This includes `PYTHONNOUSERSITE=1`, `PYTHONDONTWRITEBYTECODE=1`, `-I` for Python, `KIOTA_OFFLINE_ENABLED=true`, `KIOTA_CLI_TELEMETRY_OPTOUT=true`, the `buf` plugin PATH from F5.12, and `PROTOC`/`PROTOC_INCLUDE` when applicable;
3. preserves the caller's CWD and project configuration resolution;
4. passes the engine's exit code and stdio through unchanged.

Launchers MUST NOT mutate `JAVA_HOME`, the user `PATH`, project locks or global caches.

F5.17 Exposure to the shell. The host exposes the active release's `bin/` to invocations as one environment variable, `BACKEND_TOOLKIT_BIN=<TK>/releases/<activeId>/bin`. It uses the existing V1 plugin hook `shell.env` (**[existing]** `S/packages/plugin/src/index.ts:270-273`, merged into every shell call at `S/packages/opencode/src/tool/shell.ts:421-430`, and used for PTY at `S/packages/opencode/src/plugin/pty-environment.ts:18`). The host MUST NOT prepend the toolkit to the user `PATH`, so ambient and project-pinned tools are never shadowed. Recipes invoke `"$BACKEND_TOOLKIT_BIN/<engineId>"` (POSIX) or `& "$env:BACKEND_TOOLKIT_BIN\<engineId>.cmd"` (PowerShell). The hook input carries `sessionID`/`callID` but no agent ID, so the variable is visible to every member's shell. That is acceptable: it is a path, not a grant. **[required-new: H2 registers the hook; T5 supplies the value]** The V2 runner has no equivalent hook at HEAD, so the V2 shell path is unclaimed until H2 adds one.

F5.18 Invocation is ordinary native shell execution. It is therefore governed by the native `bash` permission (the backend specialist execution profile allows `bash`, `S/packages/opencode/src/maestro/roster.ts:10-18`) and by ToolSafety intercept (`S/packages/opencode/src/session/tools.ts:542` boundary). The toolkit adds no permission, MCP server or daemon. The shell external-directory scan only inspects arguments of file-operating commands (`shell.ts:403-409`), so invoking a launcher by absolute path does not need `external_directory`.

F5.19 Sandbox compatibility. Every representative operation (F5.25) MUST succeed under both ToolSafety sandbox kinds. Under seatbelt (macOS), writes outside the physical `writeRoots` and all `network*` are denied (`tool-safety-sandbox.ts:84-91`). Under srt, `allowWrite: roots` applies and `allowedDomains` defaults to `[]` (`:96-101`). Therefore:
- engines MUST NOT need network at invocation;
- the release tree MUST be read-only-safe (Python bytecode precompiled at assembly, JVM `-XX:-UsePerfData`, no first-run cache population inside `<TK>`);
- any scratch or temporary writes go to `BACKEND_TOOLKIT_SCRATCH` when it is set (Open owner decision F5-D5 says where).

Under a sandboxed profile, an operation that inherently needs a live TCP database (for example SQLx `prepare` against PostgreSQL) is reported as the project prerequisite/profile blocker `network-denied-by-profile`. It is not a toolkit defect.

**Inventory**

F5.20 Each release ships exactly one `inventory.json` conforming to Schema F5-A. The inventory is release metadata. It is not a runtime catalog protocol, and no agent-facing tool exposes it. T5 is its sole writer. T1–T4 contribute fragments (Schema F5-B) that T5 merges.

F5.21 The inventory MUST list every file that launchers or engines read from the release, with its SHA-256 and mode. A file present on disk but absent from the inventory is permitted only under `licenses/`. A file listed in the inventory but absent on disk means the release is NOT_READY.

**READY and activation**

F5.22 Activation is a single atomic replacement of `<TK>/active.json` (Schema F5-C): write to a temp file in `<TK>`, then rename over the old one. A symlink switch MUST NOT be used, because Windows symlinks need privilege. Launchers and the F5.17 resolver read only `active.json`.

F5.23 Toolkit state is exactly one of these values. Each is distinct and reported verbatim:

| State | Meaning |
| --- | --- |
| `READY` | `active.json` exists; the referenced release dir exists; the `inventory.json` SHA-256 equals `active.json.inventorySha256`; `active.json.checks` holds a `pass` for every engine in the inventory, including each advertised recipe's representative operation; `hostCompat` (F5.27) matches the running host |
| `NOT_INSTALLED` | no `active.json` |
| `NOT_READY` | `active.json` present but one of the READY predicates fails. Sub-reason is one of `missing-file`, `integrity-mismatch`, `check-failed:<engineId>/<opId>`, `host-incompatible` |
| `UNSUPPORTED_TARGET` | per F5.3, with its reason |

`READY` is evaluated at setup, after update and on explicit status/repair. At invocation the launcher only checks that its release dir exists. Full re-hashing on every call is not required.

F5.24 Setup order is fixed:
1. stage the complete target payload into `staging/<releaseId>`;
2. verify every file against the inventory;
3. run every representative operation (F5.25) from the staged release, with a fresh HOME, ambient runtimes absent from PATH and network denied;
4. move to `releases/<releaseId>`;
5. atomically write `active.json`.

Failure at any step leaves the previous `active.json` untouched. An interrupted download, a missing asset or a failing operation never activates. A missing promised component on a supported target is an installation defect and setup MUST exit non-zero.

F5.25 Representative operations are fixed per engine, as listed in `S/specs/backend-specialist/research/delivery-toolkit.md` §"Exact representative operations". Install-time checks use the tool-only legs, which need no user project, Rust toolchain or DB:

| Engine | Install-time operation |
| --- | --- |
| ast-grep | rewrite plus no-match JSON |
| sqlc | `generate` and `diff` with `--no-database --no-remote` |
| ogen | generate from the bundled contract |
| orval | generate plus mutator bundling via esbuild |
| datamodel-code-generator | generate plus `--check` |
| buf | `lint`/`build`/`generate` (`buf-ts-es`)/`breaking` |
| sqlx-cli | SQLite `database create` plus `migrate run` |
| openapi-generator | Spring interface-only generate |
| kiota | CSharp generate |

Each check asserts non-empty expected artifacts. Exit 0 alone is insufficient. The fixture inputs ship under `releases/<id>/selfcheck/` and are listed in the inventory. Compile/run legs that need project SDKs or databases (Go, JDK 17/Maven, .NET SDK, Rust/Postgres) belong to release qualification (Q-tools), not to end-user setup.

F5.26 Repair (same version) MUST re-run F5.24 steps 2–3 against the active release, even when the host's same-version shortcut would skip it (`S/packages/opencode/src/cli/cmd/upgrade.ts:46-57`).

F5.27 Host coupling: `inventory.hostCompat.opencodeVersion` is the exact host version the release was assembled for. This mirrors the exact same-version `optionalDependencies` rule (`publish.ts:34-79`). If the running host version differs, the state is `NOT_READY/host-incompatible` (F5-D7 may relax this to a range).

F5.28 Update and rollback:
- An update installs a new release side-by-side through F5.24.
- `active.json.previous` names the prior release, which is retained until a later successful activation. Rollback re-points `active.json` to `previous` after re-verification.
- On Windows, deleting a superseded release is deferred while any of its executables or DLLs are in use.
- Rollback restores only the engine/runtime/launcher set. It never touches generated application files, project locks or databases.
- Toolkit update MUST NOT independently auto-update engines or regenerate project output.

F5.29 Every advertised install channel MUST produce the same postcondition: `<TK>` laid out per F5.15 and state `READY` (or `UNSUPPORTED_TARGET`). This covers the curl `install` script, npm `opencode-ai` with platform optional deps plus postinstall, and Homebrew/AUR if advertised. Per-channel deltas from HEAD:
- `install` moves only `opencode` (`S/install:343`), and `--binary` copies only the binary.
- postinstall links one executable and verifies only `--version` (`postinstall.mjs:119-189`).
- If `--ignore-scripts` or omitted optional deps leave the payload incomplete, the result is `NOT_INSTALLED`. It MUST NOT be reported as success.

F5.30 Project-pinned precedence. A recipe MAY invoke a project-declared, pinned engine route instead of `$BACKEND_TOOLKIT_BIN`, for example the project's lockfile `orval` via its own package manager, or a project `tools.go` ogen. Two conditions apply: the route is already materialized offline, and its version is compatible with the recipe. A mismatch between the project-required version and the bundled pin is reported as `engine-version-mismatch(project=<v>, bundled=<v>)`. The bundled version is never silently substituted.

F5.31 Invocation outcome vocabulary is consumed by F4 as blocker reasons. F4 owns the envelope:
- `toolkit-not-ready:<substate>`
- `unsupported-target:<reason>`
- `engine-failure:<engineId>:<exit>`, a real engine error, distinct from no-op/no-match where the engine defines one (ast-grep exit 1 = no match)
- `project-prerequisite-missing:<what>` (DB, SDK, compiler, local `$ref`)
- `network-denied-by-profile`
- `remote-plugin-unsupported`
- `engine-version-mismatch`

Scope denials come from ToolSafety and are passed through unchanged.

F5.32 Licenses: `licenses/` MUST carry full texts and notices for every component and transitive dependency, including Apache NOTICE files, the GPL-2.0-with-Classpath-Exception JRE legal notices plus source-availability statement, the PSF/PBS component licenses and the Node bundled licenses. The host MIT label does not cover any of them.

### Schemas

F5-A, F5-B, F5-C and F5-D are superseded for the on-demand toolkit by Amendment M3; they stay as the record of the bundled design.

**F5-A `inventory.json`** (one per release; T5 sole writer)
```jsonc
{
  "schema": "backend-toolkit-inventory/1",
  "toolkitVersion": "string (semver)",
  "releaseId": "string (= <toolkitVersion>-<targetId>)",
  "target": {
    "id": "darwin-arm64 | darwin-x64 | linux-arm64 | linux-x64 | win32-x64",
    "os": "darwin | linux | win32",
    "cpu": "arm64 | x64",
    "libc": "glibc | null",
    "cpuFloor": "string (e.g. x86-64-avx2 | armv8.0-a)",
    "osFloor": { "macos": "string|null", "windows": "string|null", "glibc": "string|null" },
    "osFloorEvidence": [ { "componentId": "string", "requirement": "string", "source": "linkage-audit | vendor-doc" } ]
  },
  "hostCompat": { "opencodeVersion": "string (exact)" },
  "runtimes": [ {
    "id": "node | cpython | temurin-jre | protoc",
    "version": "string",
    "source": { "kind": "url | npm | pypi | maven | crate | go-module", "coordinate": "string", "upstreamIntegrity": "string|null" },
    "root": "string (relative to release dir)",
    "license": { "spdx": "string", "files": ["licenses/<id>/..."] }
  } ],
  "engines": [ {
    "id": "ast-grep | sqlc | ogen | orval | datamodel-code-generator | buf | protoc-gen-es | sqlx-cli | openapi-generator | kiota",
    "origin": "external",
    "upstream": "string (owner/repo)",
    "version": "string (exact, == F5.5)",
    "license": { "spdx": "string", "files": ["licenses/<id>/..."] },
    "artifact": {
      "kind": "upstream-binary | ci-built | npm-closure | wheel-closure | jar",
      "coordinate": "string (release asset URL from assets[].browser_download_url, or package coordinate)",
      "upstreamIntegrity": "string|null (npm dist.integrity, sha256.txt, SHASUMS256, PyPI digest)",
      "sourceRevision": "string|null (required when kind=ci-built)",
      "builder": { "toolchain": "string", "flags": ["string"], "lock": "locks/<file>" } // required when kind=ci-built
    },
    "runtime": "node | cpython | temurin-jre | null",
    "launcher": { "posix": "bin/<id>", "windows": "bin/<id>.cmd | bin/<id>.exe" },
    "argv": ["string (relative paths resolved against release dir; e.g. js/node/bin/node, js/lib/node_modules/orval/dist/bin/orval.mjs)"],
    "env": { "KEY": "value (child-scoped only)" },
    "pluginOf": "string|null (e.g. protoc-gen-es -> buf)",
    "recipes": ["recipe IDs, e.g. buf-ts-es"],
    "selfcheck": { "opId": "string", "fixture": "selfcheck/<id>/", "argv": ["string"], "expectArtifacts": ["relative glob"], "expectExit": 0 },
    "projectPrerequisites": ["string (e.g. 'Go toolchain to compile output', 'reachable DB for prepare')"],
    "network": "none"
  } ],
  "recipes": [ { "id": "buf-ts-es | protoc-rust-tonic", "engines": ["engine IDs"], "advertised": true } ],
  "files": [ { "path": "string (relative, '/' separators)", "sha256": "hex", "mode": "0755|0644", "componentId": "string" } ],
  "locks": [ { "kind": "npm | python | cargo | go", "path": "locks/<file>", "sha256": "hex" } ]
}
```

**F5-B per-closure fragment** (T1–T4 output; same `engines[]`/`runtimes[]`/`files[]` element shapes as F5-A, plus):
```jsonc
{ "schema": "backend-toolkit-fragment/1", "producer": "T1 | T2 | T3 | T4", "targetId": "string",
  "subtree": "native | js | python | jvm", "runtimes": [...], "engines": [...], "files": [...], "locks": [...] }
```

**F5-C `active.json`** (the only mutable toolkit-root file)
```jsonc
{
  "schema": "backend-toolkit-active/1",
  "releaseId": "string",
  "inventorySha256": "hex",
  "activatedAt": "RFC3339",
  "hostVersion": "string",
  "checks": [ { "engineId": "string", "opId": "string", "outcome": "pass | fail", "detail": "string|null" } ],
  "previous": "releaseId | null"
}
```

**F5-D status output** (T5 CLI `backend-toolkit status --json` **[required-new: T5]**; consumed by Q-install, the installer and H5 blockers)
```jsonc
{ "state": "READY | NOT_INSTALLED | NOT_READY | UNSUPPORTED_TARGET",
  "reason": "string|null", "targetId": "string|null", "releaseId": "string|null",
  "bin": "absolute path | null", "failing": [ { "engineId": "string", "opId": "string" } ] }
```

### Source anchors

- Host target matrix, naming and archive layout: `S/packages/opencode/script/build.ts:53-114,145-201,218-244` (unchanged since 76015a9).
- Installer detection and moves: `S/install:84-140` (Rosetta `95-100`, musl `117-127`, AVX2 `130-155`), whole-binary-only move `S/install:343`.
- npm postinstall: `S/packages/opencode/script/postinstall.mjs:80-118` (cross-variant fallback), `:119-189` (single executable plus `--version`).
- Exact-version platform deps: `S/packages/opencode/script/publish.ts:34-79`. Docker is musl: `S/packages/opencode/Dockerfile:1-16`.
- Same-version upgrade shortcut: `S/packages/opencode/src/cli/cmd/upgrade.ts:46-57`. Installation delegation: `S/packages/opencode/src/installation/index.ts:145-165,265-320`.
- Global paths: `S/packages/core/src/global.ts:11-27`.
- ToolSafety sandbox: `S/packages/core/src/tool-safety-sandbox.ts:40-58` (required-sandbox denials), `:65-77` (roots and read/write deny list incl. `Global.Path.data`/`state`), `:84-91` (seatbelt `deny network*`, writes outside roots), `:96-101` (srt `allowWrite`/`allowedDomains`).
- Shell env hook: `S/packages/plugin/src/index.ts:270-273`; consumer `S/packages/opencode/src/tool/shell.ts:421-430`; external-dir scan limited to file commands `shell.ts:403-409`.
- The backend specialist execution profile: `S/packages/opencode/src/maestro/roster.ts:10-18,54-63`; native recheck `S/packages/opencode/src/session/tools.ts:96-105` (was `87-103` at 76015a9).
- Pins and artifact evidence: `S/specs/backend-specialist/execution-plan.md` §4 T; `S/specs/backend-specialist/research/delivery-toolkit.md` §§engine pins, runtime closure, Buf closure, representative operations, primary evidence index [A][S1][O][J][P][B][E][X][G][K][N][PY][T][PR].
- Product policy: `S/specs/backend-specialist/tool-distribution.md` §§"What by default guarantees", "Approved initial default payload", "Availability and responsibility".

### Consumers

| Consumer | Uses |
| --- | --- |
| T1 native | F5.5 pins/routes, F5.7 builders, F5-B fragment, F5.15 `native/` subtree |
| T2 JS | Node pin, Orval/esbuild/ES-plugin closure, F5.12 plugin PATH launcher, F5-B |
| T3 Python | CPython/PBS pin, wheel lock, F5.19 read-only/bytecode rule, F5-B |
| T4 JVM | JAR + JRE pins, legal records (F5.32), F5-B |
| T5 assembly | sole owner of F5-A/C/D, F5.14–F5.24 resolver, launchers, activation, status CLI |
| T6 host integration | F5.14 placement, F5.24 order, F5.26 repair, F5.28 update/rollback, F5.29 per-channel postcondition |
| H2 | F5.17 `shell.env` registration |
| T-external recipes (S) | F5.9–F5.13, F5.17 invocation form, F5.30 precedence, F5.31 outcomes |
| Q-install | F5.1–F5.3 target matrix, F5.23 states, F5.24 negative controls (corrupt/remove one file, interrupt before activation, offline archive, paths with spaces, ignore-scripts) |
| Q-tools | F5.25 install-time ops plus the full compile/run legs from delivery-toolkit.md, under sandbox (F5.19) |

### Non-goals

- Supporting musl, Windows arm64 or no-AVX2 x64 (reported as `UNSUPPORTED_TARGET`, per the owner ruling).
- Any runtime tool catalog, MCP wrapper or package-manager daemon. (First-use fetch is no longer a non-goal: Amendment M3.)
- Provisioning project prerequisites: databases, container engines, Go/JDK/.NET/Rust SDKs, project generated-code runtime dependencies.
- Scope or permission enforcement. That belongs to ToolSafety and the native profile, and the backend specialist only consumes denials.
- Desktop/Electron sidecar packaging. It joins only if a desktop channel is advertised.
- Fabricated digests, sizes or timings. Assembled hashes are produced only by the release build.

### Open owner decisions

- **F5-D1 OS floors:** accept the measured per-target floors (F5.4) as the support claim, or set floors first and rebuild/replace components that exceed them. Known pressure: the .NET 10 support table lists macOS 15+ only, against Node's macOS 11. The glibc floor is unknown until the ELF audit, and ast-grep is built on Ubuntu 22.04.
- **F5-D2 protoc helper:** ship `protoc` 36.2 plus includes and advertise `protoc-rust-tonic` in first qualification, or keep the Buf recipe set TS-only (`buf-ts-es`) and leave tonic/prost purely project-owned.
- **F5-D3 advertised install channels:** which of curl `install`, npm `opencode-ai`, Homebrew and AUR carry the first-qualified toolkit. HEAD has no release workflow at all (`publish.yml` deleted, see Drift), so every channel's toolkit assembly/publish job is new work.
- **F5-D4 unqualified targets:** on musl, win-arm64 or no-AVX2 hosts, refuse the toolkit (`UNSUPPORTED_TARGET`, default in F5.3), or install a best-effort payload labelled unqualified.
- **F5-D5 sandbox scratch:** where `BACKEND_TOOLKIT_SCRATCH` lives when ToolSafety requires a sandbox. Options are a host-provided per-invocation dir that the profile owner adds to `writeRoots`, or an engine-output subdirectory inside an already-authorized root.
- **F5-D6 builder pins:** exact Go version for ogen (≥1.25.0) and Rust version for sqlx-cli (≥1.94.0), and whether to add the `mysql-rsa` feature.
- **F5-D7 host coupling:** exact host-version lock (F5.27 default), or an independent toolkit version with a declared host-compat range. Satisfied by Amendment M3: the manifest compiles into the host.
- **F5-D8 signing:** whether bundled third-party executables are re-signed or notarized (macOS Gatekeeper/quarantine on extracted archives; Windows SmartScreen). The deleted `publish.yml` previously ran Azure Trusted Signing for the Windows CLI only.

---

## F6 — Skill / fixture contract

### Contract

**Shipped asset tree**

F6.1 The authored skill source root is `C/skills/` (`packages/backend-specialist/skills/`). It contains exactly six entry directories and nothing else at its top level:
`backend-implement/`, `backend-api/`, `backend-data/`, `backend-concurrency/`, `backend-refactor/`, `backend-check/`.

F6.2 Each entry directory contains exactly one `SKILL.md` whose frontmatter `name` equals the directory name. The constraints below come from loader behavior at HEAD:
- Frontmatter MUST contain `name` (string) and `description` (string). V1 `isSkillFrontmatter` requires `name` (`S/packages/opencode/src/skill/index.ts:54-60`). Skills without `description` are omitted from the advertised list (`index.ts:367-369`).
- No other frontmatter key is relied upon. V2 `slash` (`S/packages/core/src/skill.ts:33-37`) MUST be absent. No `extends`, `requires`, permission or auto-load keys may appear, because neither loader implements them.
- Names MUST NOT begin with `own_`, which V1 routes to Atlas Own skills (`S/packages/opencode/src/tool/skill.ts:36-53`). They MUST NOT equal `customize-opencode`, the built-in (`index.ts:33,324-329`; `S/packages/core/src/plugin/skill.ts:13-30`).
- Names MUST be unique across all discovered sources. V1 loads concurrently and lets the last writer win with only a warning (`index.ts:131-145,284-287`). V2 lets the later source win (`S/packages/core/src/skill.ts:110-118`). Shadowing is a packaging defect, never specialization.

F6.3 No file named `SKILL.md` may exist anywhere under `C/skills/` except the six in F6.2. V1 scans `**/SKILL.md` and V2 scans `{*.md,**/SKILL.md}` (`index.ts:24-26`; `core/src/skill.ts:78-80`), so a nested one would register as a skill. No `*.md` file may exist directly in `C/skills/`, because V2 registers root-level `*.md` under its basename (`core/src/skill.ts:88-93`).

F6.4 All shared references live under exactly one tree, `C/skills/backend-implement/references/`, which has a single source of truth. Fixed subtrees and owning WPs:

| Path under `references/` | Owner WP | Content |
| --- | --- | --- |
| `continuity.md` | S-implement | Atlas/handoff common guidance |
| `modes/{feature,repair,refactor,migration,optimization,tests}.md` | S-implement | change-mode procedures |
| `protocols/<topic>.md` | S-api | REST/gRPC/GraphQL/SSE/WS/webhook/upload/codec |
| `data/<topic>.md` | S-data | query/transaction/migration-phase |
| `lifetimes/<topic>.md` | S-concurrency | cancellation, streams, jobs, retries |
| `refactors/<topic>.md` | S-refactor | scoped transformation, syntax vs symbol |
| `checks/<topic>.md` | S-check | fixture/test procedures |
| `cards/<topic>.md` | the entry that links it | conditional cards (app-auth, observability, codecs, prescribed optimization) |
| `languages/<familyId>.md` | F-family | only for genuinely language-level families (`python`, `go`, `rust`, `js-ts`, `jvm`, `dotnet`, `ruby`, `php`, `elixir`); `effect` and `next` link `languages/js-ts.md` |
| `frameworks/<familyId>/<frameworkId>.md` | F-family | one file per framework |
| `frameworks/<familyId>/<frameworkId>-v<major>.md` | F-family | only when a frozen tuple set carries ≥2 majors with divergent procedure (e.g. `express-v4.md`/`express-v5.md`); otherwise version deltas are sections inside the one file |
| `libraries/<familyId>/<libraryId>.md` | F-family | drivers/ORMs/queues (pgx, sqlc-runtime usage, SQLAlchemy, EF Core, Ecto, ...) |
| `recipes/external/<engineId>.md` | T-external | exactly one per F5.5 engine family; `<engineId>` ∈ F5-A `engines[].id` (Buf + `protoc-gen-es` share `buf.md`) |
| `recipes/hugr/<operationId>.md` | T-owned | `hugr-compose.md`, `hugr-scaffold.md` |

`<familyId>` ∈ {`python`, `go`, `rust`, `js-ts`, `effect`, `next`, `jvm`, `dotnet`, `ruby`, `php`, `elixir`, `cross`}. Creating a new subtree or familyId is a contract amendment. This layout is how the "no Cartesian explosion" ruling is enforced structurally: files are keyed by one dimension each, never by combinations.

F6.5 Other entries (`backend-api/` etc.) MAY contain only their `SKILL.md`. Any entry-local asset requires a contract amendment. That keeps every reference in one tree.

F6.6 Every file under `C/skills/` MUST be:
- a regular file. No symlinks: V1 lists companions with `follow: false` (`tool/skill.ts:67-74`), and Windows symlinks are unreliable.
- UTF-8 with LF line endings.
- named with lowercase ASCII `[a-z0-9-]` plus `.md`, with a relative path from `C/skills/` of ≤120 characters (headroom for Windows MAX_PATH under deep install roots).

**Relative links**

F6.7 Every reference to another asset MUST be a Markdown link with a **relative** target that uses `/` separators, written from the linking file's own directory. Examples: from `backend-api/SKILL.md`, `../backend-implement/references/protocols/rest.md`; from a framework file, `../../languages/go.md`.

F6.8 A link target MUST resolve to an existing file inside the shipped `skills/` root after normalization. Absolute paths, `file:` URLs, links that escape `skills/`, and anchors to non-existent headings are defects. External `https:` links are allowed only as citations and MUST NOT carry content the procedure depends on.

F6.9 Reachability: every file under `references/` MUST be reachable from at least one `SKILL.md` through a chain of explicit links of depth ≤2 (entry → reference → reference). The sampled companion list is never a delivery mechanism. Both skill tools return the body plus at most 10 sampled paths: V1 uses ripgrep `limit: 10` (`tool/skill.ts:65-96`), V2 uses sorted `slice(0, 10)` (`core/src/tool/skill.ts:84-91`). Content is delivered only by ordinary authorized `read` calls.

F6.10 Each reference uses the card headings from `S/specs/backend-specialist/skill-catalog.md` §"A useful variant card" as level-2 headings, in this order, omitting any heading that does not apply: `Applicability`, `Non-trigger`, `Inputs`, `Steps`, `Tools and outputs`, `Limits and checks`. Version applicability goes in prose under `Applicability`. Machine-readable coverage lives only in F6.20, never in frontmatter.

F6.11 External recipes (`recipes/external/*.md`):
- MUST state the exact F5.5 pin and invoke only through `$BACKEND_TOOLKIT_BIN/<engineId>` (F5.17) or a declared project-pinned route (F5.30).
- MUST name the generated-vs-handwritten ownership boundary and the separate project prerequisites.
- MUST map engine failures to the F5.31 vocabulary.

A pin in a recipe that differs from the inventory is a packaging-lint failure. Recipes treat engines as specialized generators. One entry skill MAY link many recipes, and recipes never imply a framework choice.

**Installation, registration and read access**

F6.12 The installed skill root is a real-filesystem copy of `C/skills/`. Installers MUST ship it byte-identical with `C/skills-manifest.json` (Schema F6-A), which sits next to it (outside `skills/`, so no loader lists it). T6 owns placement, and the root is resolved like F5.14 (`<hostRoot>/backend/skills/`). Q-native verifies installed bytes against the manifest, which detects stale bodies after update or restart.

Amendment (M3-5): in a compiled build the manifest is the content digest of the embedded skill tree (SHA-256 over sorted `path\0sha256(bytes)` lines). The host copies the tree to `<cache>/backend-skills/<version>-<digest12>/` (the first 12 hex digits of that digest), so two builds never share a copy even when their version strings match (every unversioned build is `local`). A copy that fails verification against its digest is replaced whole; no other copy is touched. Old copies are kept, so an update never removes a tree a running process reads and a rollback re-selects the older install's own copy.

F6.13 Registration uses existing source mechanisms only:
- V1: config `skills.paths` (`S/packages/core/src/v1/config/skills.ts:5-12`, scanned with `**/SKILL.md` at `index.ts:255-264`), or a config directory's `skill/`/`skills/` (`index.ts:212-215`).
- V2: a plugin `ctx.skill.transform(draft => draft.source(DirectorySource{ type: "directory", path }))`, the pattern of `S/packages/core/src/config/plugin/skill.ts:18-46`.

`skills.urls` / `UrlSource` (network pull) MUST NOT be used. The route choice belongs to H1 (F6-D1). Registration MUST NOT place assets under `.opencode/skills/own/`, which is reserved for Atlas Own (`index.ts:125-129,218-254`).

F6.14 Admission and read access are host-owned prerequisites. F6 states them but does not implement them.

At HEAD the backend specialist native seat permission is exactly the `execution` profile (`roster.ts:10-18`, applied at `S/packages/opencode/src/agent/agent.ts:291-300`), and the native recheck denies anything that profile denies (`session/tools.ts:96-105`). As a result:
- (a) `skill` is denied;
- (b) `external_directory` is denied. The default skill-dir allow-list at `agent.ts:110-125` applies only to non-native agents. Reading an installed companion outside the worktree goes through `assertExternalDirectoryEffect` (`S/packages/opencode/src/tool/external-directory.ts:15-45`, called from `S/packages/opencode/src/tool/read.ts:266-269`) and is therefore denied.

**[required-new: H1]** must admit `skill` for exactly the six F6.2 names and allow `external_directory` for the registered backend specialist skill root, `<root>/*`, read-only. Until H1 lands, Q-native MUST report companion delivery as blocked. It MUST NOT be treated as passing.

F6.15 V1 and V2 differ in discovery, collision and caching: V1 uses per-instance state, while V2 has a process cache keyed by source with no file-watch invalidation (`core/src/skill.ts:107-119`). A claim for one runtime path does not transfer to the other. Q-native qualifies each claimed path separately.

**Fixtures and the evaluator boundary**

F6.16 Evaluator checkout `E` is a separate Git repository (its own `.git`, not a worktree, branch, ref, remote or submodule of the candidate repository). It holds `E/fixtures/<familyId>/<fixtureId>/`, `E/oracles/<familyId>/<fixtureId>/`, `E/manifests/<familyId>/<fixtureId>.json` (Schema F6-B) and `E/calibration/**`. Q-family/Q-cross/Q-memory own their subtrees. Content authors (S/F/T) MUST NOT write to E.

F6.17 During candidate execution, E MUST NOT be readable. All of the following hold:
1. E's physical path is outside the candidate worktree, every registered skill/config/reference directory, `<TK>`, and every `external_directory` allow pattern.
2. The trial profile lists E's real path in ToolSafety `neverTouch` or `sandbox.denyPaths`. These are denied for read and write under both sandbox kinds (`tool-safety-sandbox.ts:73-77,88-90,101`), and `neverTouch` forces `requireSandbox` (`S/packages/core/src/tool-safety-profile.ts:64-66`). A trial whose sandbox cannot be established (`required-process-sandbox-unavailable` etc., `tool-safety-sandbox.ts:40-58`) is void, not run unsandboxed.
3. No oracle, reference solution, expected value or prior trial outcome is copied into the candidate filesystem, Git history/refs, Atlas stores or any network-reachable location.
4. The driver copies only the manifest's `candidateVisible` set into the candidate workspace.

Grading runs after the candidate process exits, from a separate process that may read E.

F6.18 `C/test/delivery/**` (Q-native, Q-memory, Q-tools, Q-install) contains deterministic conformance tests. These are not sealed oracles and MAY live in the candidate repository. A file that encodes a family task's expected business outcome belongs in E, not in C.

F6.19 Every fixture is calibrated before use. Each of known-good and alternative-valid MUST pass. Each of buggy, no-op and plausible-wrong MUST fail for its named reason. Missing report, zero selected cases, forced skip and verifier error MUST reject. A fixture with `calibration.status != "calibrated"` contributes no `exercised` evidence.

**Coverage declaration**

F6.20 `C/eval/coverage.json` (Schema F6-C) is the single coverage declaration. The lead/integrator is its sole writer. It references fixtures by ID only and MUST NOT contain oracle content, expected values or control solutions. It is not part of the shipped skill bundle (F6.12).

F6.21 Coverage states are cumulative and never interchangeable: `researched` → `authored` → `installed` → `exercised`. Each state requires the evidence named in F6-C. A tuple is **advertised** only when `exercised` holds on every first-qualification target it claims, through a calibrated fixture and the installed candidate. A skipped real-binary or real-service leg leaves the tuple unqualified.

F6.22 A tuple is one row of concrete components (component, language/runtime, frameworks, libraries/drivers, services, features, toolkit engines). Tuples are declared per family. Cross-dimension combinations (mode × protocol × runtime × framework) are covered by Q-cross overlay fixtures that reuse family environments. They are never enumerated as a product.

### Schemas

**F6-A `C/skills-manifest.json`** (generated at packaging; integrator-owned)
```jsonc
{
  "schema": "backend-skills-manifest/1",
  "bundleRevision": "string (source commit or content hash)",
  "entries": [ { "name": "backend-implement | backend-api | backend-data | backend-concurrency | backend-refactor | backend-check",
                 "path": "<name>/SKILL.md", "sha256": "hex" } ],
  "files": [ { "path": "string (relative to skills/, '/' separators)", "sha256": "hex", "owner": "WP id" } ],
  "links": [ { "from": "path", "to": "path" } ],          // resolved edges; lint proves F6.7–F6.9
  "recipePins": [ { "path": "references/recipes/external/<engineId>.md", "engineId": "string", "version": "string" } ]
}
```

**F6-B `E/manifests/<familyId>/<fixtureId>.json`** (Q-family/Q-cross owner)
```jsonc
{
  "schema": "backend-fixture/1",
  "fixtureId": "string (globally unique)",
  "familyId": "python | go | rust | js-ts | effect | next | jvm | dotnet | ruby | php | elixir | cross",
  "tupleId": "string (F6-C tuples[].id) | null for cross",
  "owner": "Q-<familyId> | Q-cross | Q-memory",
  "tuple": {
    "component": "string",
    "language": { "id": "string", "version": "string" },
    "runtime": { "id": "string", "version": "string" },
    "frameworks": [ { "id": "string", "version": "string" } ],
    "libraries": [ { "id": "string", "version": "string" } ],
    "services": [ { "kind": "postgres | mysql | sqlite | redis | amqp | ...", "version": "string", "provisioning": "string" } ],
    "features": ["string"],
    "engines": [ { "id": "F5 engine id", "version": "F5 pin" } ]
  },
  "task": {
    "mode": "feature | repair | refactor | migration | optimization | tests",
    "packet": "fixtures/<familyId>/<fixtureId>/packet.md",   // candidate-visible
    "diagnosis": "path | null",                              // required when mode=repair
    "expectedEntries": ["skill names expected to load"],
    "expectedReferences": ["references/... paths expected to be read"],
    "nearMiss": ["references/... paths whose loading is a selection error"],
    "outOfRoleTemptations": ["string"]
  },
  "repository": { "baseArtifact": { "kind": "git-bundle | tar", "path": "string", "sha256": "hex" },
                  "baseCommit": "string", "dirtyState": "path | null" },
  "checks": {
    "disclosed": [ { "id": "string", "cwd": "string", "argv": ["string"], "env": { "K": "V" }, "timeoutS": 0, "report": "junit | tap | json | exit", "mandatoryCaseIds": ["string"] } ],
    "sealed": [ { "id": "string", "oracle": "oracles/<familyId>/<fixtureId>/<file>" } ]
  },
  "controls": { "knownGood": "path", "alternativeValid": ["path"], "buggy": "path", "noop": "path", "plausibleWrong": [ { "path": "path", "expectedFailure": "string" } ] },
  "calibration": { "status": "uncalibrated | calibrated | invalidated", "evidence": "calibration/<...>", "hostTarget": "F5 target id", "date": "RFC3339" },
  "environment": { "targets": ["F5 target ids"], "network": "denied | declared", "allowedHosts": ["string"], "cacheState": "cold | warm" },
  "visibility": { "candidateVisible": ["paths copied into candidate workspace"], "sealed": ["paths never copied"] },
  "version": 1
}
```

**F6-C `C/eval/coverage.json`** (integrator sole writer)
```jsonc
{
  "schema": "backend-coverage/1",
  "tuples": [ {
    "id": "string (e.g. go/chi-pgx-sqlc/1)",
    "familyId": "string",
    "components": { /* same shape as F6-B tuple */ },
    "references": ["references/... paths serving this tuple"],
    "recipes": ["engine ids"],
    "states": {
      "researched": { "sources": ["specs/backend-specialist/research/<file>:<lines>"] },
      "authored":   { "bundleRevision": "string", "paths": ["..."] } ,
      "installed":  { "runs": [ { "target": "F5 target id", "runId": "string", "skillsManifestSha256": "hex" } ] },
      "exercised":  { "fixtures": ["fixtureId"], "runs": [ { "target": "F5 target id", "runId": "string", "outcome": "pass | fail | void" } ] }
    },
    "claimedTargets": ["F5 target ids"],
    "advertised": false
  } ],
  "engines": [ { "id": "F5 engine id", "version": "F5 pin",
                 "targets": { "<F5 target id>": "unqualified | installed | exercised" } } ],
  "cross": [ { "fixtureId": "string", "overlays": ["protocol/data/mode labels"], "reusesTuples": ["tuple ids"] } ]
}
```
A state that lacks its evidence fields is treated as absent. `advertised` MUST be false unless F6.21 holds.

### Source anchors

- V1 discovery patterns and sources: `S/packages/opencode/src/skill/index.ts:22-26,179-277`; add/collision `:106-146`; Own reserve `:125-129,218-254`; advertisement filter `:356-361,367-392`.
- V1 skill tool: own_ routing `S/packages/opencode/src/tool/skill.ts:36-53`; body + sampled ≤10 paths, `follow:false` `:54-97`.
- V2 skill service: `S/packages/core/src/skill.ts:33-37` (frontmatter), `:73-105` (`{*.md,**/SKILL.md}`, root-level basename naming), `:107-119` (cache, later-source-wins).
- V2 skill tool: `S/packages/core/src/tool/skill.ts:35-52,72-97` (sorted first 10 files).
- V2 source registration: `S/packages/core/src/config/plugin/skill.ts:18-46`; built-in `S/packages/core/src/plugin/skill.ts:13-30`. V1 config schema `S/packages/core/src/v1/config/skills.ts:5-12`.
- Native seat permission: `S/packages/opencode/src/maestro/roster.ts:10-18`; `S/packages/opencode/src/agent/agent.ts:110-125` (non-native skill-dir allow), `:291-300` (native seat uses profile only); `S/packages/opencode/src/session/tools.ts:96-105`.
- Read external-directory gate: `S/packages/opencode/src/tool/read.ts:266-269`; `S/packages/opencode/src/tool/external-directory.ts:15-45`.
- Sandbox deny for E: `S/packages/core/src/tool-safety-sandbox.ts:40-58,73-77,84-101`; `S/packages/core/src/tool-safety-profile.ts:64-66`.
- Layout, WP ownership and acceptance: `S/specs/backend-specialist/execution-plan.md` §4 S/Q; `S/specs/backend-specialist/research/delivery-quality.md` §§"Disjoint work packages", "Framework/version coverage", "Concrete complete-delivery acceptance work", "Paired real-model evaluation" items 1, 4 and 5; `S/specs/backend-specialist/skill-catalog.md` §§"Reference layout and loading", "A useful variant card", "Authorship order and status"; `S/specs/backend-specialist/skill-matrix.md`.

### Consumers

| Consumer | Uses |
| --- | --- |
| S-implement, S-api/data/concurrency/refactor/check | F6.1–F6.11 layout, names, links, card headings |
| F-family (12 rows) | F6.4 `languages/`/`frameworks/`/`libraries/` keys, F6.10, F6.22 tuple granularity |
| T-external / T-owned | F6.4 `recipes/`, F6.11 (with F5.17/F5.30/F5.31) |
| H1 | F6.2 names to admit, F6.13 registration route, F6.14 read access |
| T6 | F6.12 installed placement and manifest |
| Q-native | F6.9 reachability, F6.12 byte identity, F6.14 blocked-vs-pass, F6.15 per-runtime qualification |
| Q-family / Q-cross / Q-memory | F6.16–F6.19, F6-B |
| Q-driver | F6.17 isolation steps, `candidateVisible` copy, post-exit grading |
| Integrator | F6-A, F6-C, F6.20–F6.21 |

### Non-goals

- Loader features: inheritance, `requires`, framework matching, reference auto-loading, frontmatter grants or version selectors. None of these exist and F6 does not add them.
- Per-technology advertised skills such as `backend-python`. Profiles stay references until independent reuse earns promotion through a contract amendment.
- Enumerating mode × domain × runtime × framework × tool cells.
- A coverage or fixture runtime service. The manifests are files read by Q-driver and the integrator.
- Hosting or provisioning of E, its CI and model/provider credentials (Q owners).

### Open owner decisions

- **F6-D1 registration route:** V1 `skills.paths`, a V2 plugin `DirectorySource`, or both. This decides which runtime path(s) Q-native must qualify (F6.15).
- **F6-D2 E custody:** where E is hosted (local-only checkout or private remote), and who besides Q owners may read it.
- **F6-D3 first frozen tuple per family:** which exact tuple(s) each of the 12 families declares first. The research anchors in delivery-quality.md are not resolved locks. Examples: Go `chi + pgx 5.8.0 + sqlc 1.31.1`, or also Gin/Echo; Next 15 vs 16.

---

## Drift since 76015a9

Checked with `git diff --name-status 76015a9 HEAD` against the anchors cited by `delivery-toolkit.md`, `delivery-quality.md` and the plan. Rows marked **new** are not recorded in `execution-plan.md` §1.1.

| Anchor | At 76015a9 | At d11d8652aa | Impact on F5/F6 |
| --- | --- | --- | --- |
| `.github/workflows/publish.yml` (**new**) | 517-line release workflow: version bump, `packages/opencode/script/build.ts` (line 92), Windows CLI Azure Trusted Signing + repack (lines 124-214), Electron Apple codesign, container login | **Deleted** in `e935bfced4` | No release pipeline exists at HEAD. `publish.ts` and `build.ts` are unchanged but have no CI caller. Toolkit assembly/publication and any signing are entirely new work (F5-D3, F5-D8). Plan §1.1 names only `generate.yml`. |
| `containers.yml`, `deploy.yml`, `nix-hashes.yml`, `publish-vscode.yml`, `release-github-action.yml` + 13 triage/PR workflows (**new**) | present | **Deleted** | Docker image channel has no build job (it was musl anyway, F5.3). Nix hash maintenance is gone. |
| `.github/workflows/generate.yml`, `.github/actions/setup-git-committer/` | present | Deleted (already in §1.1) | `delivery-quality.md` §CI row for `generate.yml:8-39` is obsolete. |
| `.github/workflows/test.yml` | push to dev + PR | `pull_request: [labeled]` + `workflow_dispatch`, every job gated on `epic` label (already in §1.1) | Line anchors shifted: godfile `24-41`→`23-41`; Atlas `43-161`→`44-163`; unit `163-227`→`165-229`; e2e `229-288`→`232-302`. **New:** the unit/e2e matrix is still `ubuntu-latest` + `windows-latest` only, and no workflow at HEAD has a macOS runner, so `darwin-arm64`/`darwin-x64` Q-install needs new runners. |
| `.github/workflows/typecheck.yml`, `nix-eval.yml`, `storybook.yml` (**new**) | push/PR | epic-label/dispatch only | `delivery-quality.md` `typecheck.yml:10-24` anchor shifted by +1–2 lines. Same epic-only cadence, so all Q gates stay local until epic close. |
| Node pins | E2E `24.15`, setup-bun `24` | unchanged: `test.yml:258` `24.15` vs `.github/actions/setup-bun/action.yml:16` `24` | Mismatch persists. The effective E2E Node version is still unqualified. Unrelated to toolkit Node 22.23.2, which is private (F5.8). |
| `packages/core/src/tool-safety*.ts` (new files; §1.1 covers the seam) | absent | sandbox denies read+write on `Global.Path.data`/`state`, denies network under seatbelt, denies writes outside `writeRoots` (`tool-safety-sandbox.ts:65-101`) | **New consequence:** this constrains toolkit placement (F5.14), read-only release and scratch (F5.19, F5-D5), DB-backed recipes (`network-denied-by-profile`), and provides the E read barrier (F6.17). |
| `packages/opencode/src/session/tools.ts` native recheck | `87-103` | `96-105` | Anchor shift only. The behavior (native profile denies `skill`/`external_directory`) is unchanged and is the F6.14 blocker. |
| `packages/core/test/tool-skill.test.ts` | — | gains `askExplicit` stub (PermissionV2 interface grew) | Skill tool anchors in `packages/core/src/tool/skill.ts` and `packages/opencode/src/tool/skill.ts` are unchanged. The test still substitutes services, so it is not installed-admission evidence. |
| Host packaging files cited by delivery-toolkit (`build.ts`, `publish.ts`, `postinstall.mjs`, `bin/opencode`, `install`, `Dockerfile`, `installation/**`, `upgrade.ts`) | — | not in diff | Anchors valid as cited. |
| `packages/core/src/session/runner/{publish-llm-event,llm}.ts` | missing usage → 0 | optional `usageKnown` (already in §1.1) | `delivery-quality.md` paired-eval item 7 anchor `publish-llm-event.ts:16-27` is stale. Not an F5/F6 input. |
| Root `package.json` / `packages/opencode/package.json` | — | tree-sitter patch added; `@opencode-ai/maestro-arsenal` workspace dep added | Shared lock/manifest integrator only. No toolkit pin impact. |
