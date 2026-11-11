# S5 ownership: CLI, Omni, distribution, and platform

> **Artifact state:** author-side cumulative candidate (L1–L4), not independently accepted.
>
> **Execution:** `40bacfb3-0f05-4d4c-b045-0b7cf449e2ad`
>
> **Source revision:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`
>
> **Protocol revision:** `ee2521a5b966bd505cc95bd1c733e09e12f33531`
>
> **Evaluation oracle:** `S5-L1-002` at commit `7c8e95d00491a2f5a15054e6c0ca8845763b718b`
>
> **Recovery limitation:** the recovered conversation has no native subagent or persistent-judge tool, and its sandbox has neither a GitHub checkout nor Bun. Every statement below is therefore either source-observed, workflow-defined, historically evidenced by an explicitly named receipt, or deliberately marked unproved. No product test or workflow run was executed by this recovery.

## 1. Evidence vocabulary

Use these states literally. They are not interchangeable.

| State | Meaning |
| --- | --- |
| `SOURCE_OBSERVED` | The pinned source revision contains the stated code, configuration, or contract. |
| `WORKFLOW_DEFINED` | A workflow declares the stated gate or matrix. This does **not** mean that a run succeeded for this candidate. |
| `HISTORICALLY_GREEN` | A pinned source document identifies a concrete earlier run for the stated promise. It does not certify a changed candidate. |
| `DECLARED_LIMIT` | The contract deliberately names a hole or weaker containment tier. |
| `PLANNED` | The guarantee table says evidence is still absent for that row/platform. |
| `RECOVERY_UNEXECUTED` | This recovery did not run the command, test, build, or workflow. |
| `BLOCKED_INDEPENDENCE` | The required independent producer or persistent judge could not be instantiated in this recovered tool context. |

A target row, package name, or build branch is not proof that the runtime guarantee is green. A workflow file is not a workflow receipt. A README is not authoritative when executable packaging code contradicts it.

## 2. Population and grouped ownership (L1)

The fixed S5 partition owns **927 Git entries**. The retained execution plan groups them as:

| Group | Fixed entries | Ownership depth |
| --- | ---: | --- |
| `apps/cli/**` | 162 | Direct L1–L4 ownership: command graph, handlers, daemon, launcher, build, tests, and package payload. |
| `native/**` | 426 | Direct L1–L4 ownership: hugr-omni contract, supervisor, bindings, conformance, native build, fixtures, and platform guarantees. |
| Platform and cross-cutting remainder | 339 | Direct or grouped L1–L4 ownership: root scripts/configuration, GitHub workflows/actions, `packages/script`, Nix, patches, distribution proofs, and related transversal contracts. |
| **Union** | **927** | No entry may silently disappear. Generated files, fixtures, tests, assets, and history receive grouped depth when individual prose would add no decision value. |

This artifact is a cumulative **ownership map and maintenance model**, not a claim that every one of the 927 entries has passed semantic judgment. The mechanical population remains exact; semantic acceptance remains blocked until the required independent pair evaluates the exact package.

### 2.1 CLI ownership

The CLI is the composition application. It owns:

- the public `orchestra` command surface and options;
- lazy command-handler binding;
- default TUI launch and headless `run`;
- local daemon lifecycle, authenticated registration, and attachment;
- the headless HTTP server used by desktop, web, and scripts;
- the npm shim that chooses and launches a native executable;
- the native build and payload assembly for CLI artifacts;
- distribution tests and release preparation.

The package is an **application entrypoint**, not a general library API. Its public npm `bin` is `bin/orchestra.cjs`; that shim locates a platform package and starts the native executable.

### 2.2 Omni ownership

`native/omni` is the source of truth for process and terminal semantics. It owns:

- public process/PTY contract and typed failures;
- supervisor protocol and lifecycle;
- whole-tree containment and termination;
- output draining, loss accounting, cancellation, timeout, and resource limits;
- Node/TypeScript binding and platform packages;
- conformance scenarios, fixtures, and per-OS evidence;
- Rust build, lint, and test gates.

Orchestra integration is intentionally narrow: `packages/core/src/omni.ts` is the only Orchestra module allowed to import `hugr-omni`, and it does so dynamically. Other product modules reach Omni through governed Core process surfaces.

### 2.3 Platform and distribution ownership

Platform ownership connects source code to shipped bytes. It includes:

- the closed CLI target matrix;
- mapping from CLI targets to Omni companions;
- CPU, libc, native format, and execute-bit admission;
- Tree-sitter native binding production and packaging;
- pinned ripgrep acquisition, integrity verification, licensing, and signatures;
- compile evidence and payload validation;
- GitHub qualification, native Omni gates, guards, and release orchestration;
- Nix-specific decisions, including `RIPGREP_BUNDLED=false` when the packager provides `rg` on `PATH`.

## 3. CLI execution model (L2)

### 3.1 Invocation chain

For an npm install, the normal chain is:

1. **`bin/orchestra.cjs`** runs under Node.
2. It derives the platform package family from operating system and CPU.
3. On x64 it detects AVX2 and selects an optimized package or a baseline fallback.
4. On Linux it determines glibc versus musl. An unknown libc fails closed instead of guessing; `ORCHESTRA_BIN_PATH` is the explicit escape hatch.
5. It searches upward through `node_modules` for the matching `@humanguardrail/cli-*` package, or uses its cached `.orchestra` binary.
6. It spawns the native executable, forwards `SIGINT`, `SIGTERM`, and `SIGHUP`, and mirrors exit code or terminating signal.
7. The compiled binary starts at **`src/omni-entry.ts`**.
8. Omni preflight runs before the command graph for any invocation that may spawn.
9. Preflight imports **`src/index.ts`**, which constructs the Effect CLI runtime, supplies Node services and the daemon layer, and runs the selected command.
10. `Runtime.handlers` binds command specs to lazy module loaders; only the selected handler is imported.

The non-spawning preflight exceptions are deliberately narrow: version/help and `db path`. A packaged CLI whose target enables Omni fails immediately when the addon or supervisor cannot be loaded.

### 3.2 Command graph and handler binding

The canonical command and option declaration is:

- `apps/cli/src/commands/commands.ts`

The canonical loader map is:

- `apps/cli/src/index.ts`

The binder is:

- `apps/cli/src/framework/runtime.ts`

A command change is incomplete unless all applicable surfaces agree:

1. command spec, aliases, arguments, flags, defaults, hidden state;
2. loader entry in `Runtime.handlers`;
3. handler implementation;
4. help and user documentation;
5. focused tests and distribution tests when packaging or invocation changes;
6. module-boundary and spawn-import guards.

The runtime recursively walks the command tree. A leaf loader becomes a lazily imported handler; a node may also have a `$` handler. The environment available to normal handlers is the daemon service plus the blessed Effect child-process spawner. Database access is intentionally not global because opening it applies migrations; only database handlers provide it.

### 3.3 Default, `serve`, and `run`

**Default invocation**

- Obtains an authenticated daemon transport.
- Starts the server if needed.
- Lazy-loads the TUI and connects it to that transport.

**`serve`**

- Builds the HTTP routes and product host contributions.
- Resolves the web UI from `ORCHESTRA_WEB_UI_DIR`, a sibling `web` directory, or the development `apps/web/dist`.
- Uses the environment password only for a desktop-owned launch; otherwise obtains the persistent daemon password.
- Deletes server username/password from `process.env` after capture so children cannot inherit them.
- Imports eligible legacy transcripts before the server answers.
- Binds the requested port or searches from 4096 upward.
- Optionally registers the bound server with the daemon state.
- Coordinates signal shutdown, connection closure, and finalizers under a bounded grace.

**`run`**

- Validates incompatible options such as `--fork` without a resumed session and `--port` with `--attach`.
- Sends local file URIs to a same-machine daemon, but inlines files for an attached server that may not share the filesystem.
- Enforces a 10 MiB per-inline-file limit and refuses inline directories.
- Chooses explicit attachment, a daemon on a requested port, or the default daemon transport.
- Supports a minimal TUI mode or a headless event-rendering mode.
- Rejects questions in headless sessions and auto-rejects permissions unless `--auto` is explicitly supplied.
- Resolves, resumes, or forks sessions; selects an optional primary agent and model; reports failure by process exit status.

These behaviors are user-visible contracts. A refactor that preserves TypeScript types but changes file transfer, session selection, permission handling, daemon authentication, or output framing is not behavior-preserving.

## 4. Daemon lifecycle and security (L2/L3)

`apps/cli/src/services/daemon.ts` is a deliberate direct-spawn exception.

### 4.1 State

The daemon stores under the Core XDG state path:

- `server.json`: registration containing ID, version, URL, and PID;
- `password`: a private persistent credential.

Both are written through temporary files and rename. Password and registration files use mode `0600`.

### 4.2 Health and compatibility

A registration is usable only when:

1. it decodes under the registration schema;
2. the authenticated health endpoint answers successfully;
3. for compatible reuse, the registered version equals `InstallationVersion`.

Transport failures are distinguished from unhealthy application responses. A stale registration is removed rather than trusted.

### 4.3 Start and stop

A compiled CLI reuses a healthy daemon of the same version. Otherwise it stops the prior authenticated registration and launches a detached `serve --register` process, then waits under a deadline for a compatible health response.

Stopping is defensive:

- it authenticates the current server before signaling its recorded PID;
- it compares the entire registration to avoid killing a process after PID reuse or registration replacement;
- it sends `SIGTERM`, waits, rechecks the registration, and only then escalates to `SIGKILL`;
- an unauthenticated or stale registration is removed without signaling the recorded PID.

### 4.4 Why this is outside Omni containment

The daemon must outlive the invoking CLI. Omni's process-tree containment is designed to stop owned trees when their host or scope ends. Replacing the detached daemon launch with an ordinary Omni child would invert the lifetime contract and can destroy the service when the caller exits.

The exception is still governed:

- it is listed in `script/spawn-allowlist.json`;
- its reason is documented in the Omni integration contract;
- adding another direct spawn requires an explicit lead decision;
- ordinary product process paths do not inherit this exemption.

## 5. Omni process contract (L2)

The v0.1 TypeScript contract is frozen. Its parity unit includes run/spawn, cwd, environment, PTY, timeout, grace, cancellation, stdin, output limits, text/bytes, output streams, child lifecycle, exit/result, and typed errors.

Key invariants:

- no shell interpretation of ordinary arguments;
- Windows batch files are passed through `cmd.exe` only with safe quoting or are refused;
- validation happens before any process exists;
- output is always drained so a child cannot block on a full pipe;
- output has one consumer; a second claim is invalid;
- dropped streaming bytes are counted and surfaced in order;
- `wait()` reports root exit, while `stop()` governs the entire reachable tree;
- `run()` waits for root and output completion, then applies its bounded descendant cleanup;
- cancellation, timeout, memory limits, and explicit stop have distinct reasons;
- PTY is one output channel and has bounded dimensions;
- no panic may cross FFI.

### 5.1 Supervisor boundary

Every Omni-owned child is created by the supervisor. The host avoids fork, host signal handlers, global console mutation, and Tokio process/SIGCHLD observation. The supervisor owns platform-specific containment:

- Unix: root session, with declared escape behavior;
- Windows: Job object with breakaway refused.

The supervisor does not depend on the public `hugr-omni` crate, and imports follow the documented downward layer order.

### 5.2 Loader and companion pairing

`packages/core/src/omni.ts`:

- is the single dynamic import seam;
- accepts explicit addon/supervisor paths before first load;
- locates side-by-side shipped companions, desktop resources, or checkout builds;
- refuses incomplete or mismatched candidates;
- avoids silently borrowing a supervisor from another profile;
- strips `HUGR_OMNI_*` from child environments;
- records Omni spawns and legacy delegations for positive-control tests.

A strict-mode run with any delegation is a failure. A run that claims to test Omni but performs zero Omni spawns is also a failed positive control.

### 5.3 Declared containment limits

Do not strengthen the promise beyond `GUARANTEES.md`.

Examples of declared limits include:

- a deliberate Unix `setsid` escapee can leave the root session;
- certain fast fork-and-exit relay patterns can evade confirmation;
- if the supervisor dies on Unix, existing trees continue unprotected; Windows Jobs still close with the supervisor;
- a host that does not ignore `SIGPIPE` can die on a write to closed stdin;
- macOS has a small CLOEXEC timing window around a received descriptor;
- evidence is per promise and per platform.

These are not implementation trivia. They are the boundary of the product claim.

## 6. Spawn governance (L1/L3)

The repository rejects direct spawning imports unless the exact file/module pair is admitted by `script/spawn-allowlist.json`.

### 6.1 Governing rules

- New exemptions require a lead decision.
- Documentation explains major groups, but the JSON allowlist is the machine-readable source of truth.
- Only `packages/core/src/omni.ts` imports `hugr-omni`.
- Effect callers use the governed `ChildProcessSpawner` surface.
- Some interactive, detached, synchronous-probe, build, test, Electron, Atlas, or third-party SDK seams deliberately remain outside Omni.

### 6.2 CLI exceptions

Two central CLI exceptions are valid for different reasons:

| Path | Reason |
| --- | --- |
| `apps/cli/src/services/daemon.ts` | Detached daemon must outlive the caller. |
| `apps/cli/bin/orchestra.cjs` | Bootstrap launcher and bounded platform detection run before Orchestra code; it must start the selected native binary with inherited terminal behavior. |

A review must ask whether the lifetime and I/O contract matches an existing exception, not simply count `child_process` imports.

### 6.3 Change impact

For any new process launch:

1. classify it as contained product work, interactive terminal work, detached/outliving work, synchronous bounded detection, build/proof code, or external SDK-managed work;
2. use the governed Core/Effect process surface for contained product work;
3. do not add an allowlist row to make a guard green;
4. if an exception is truly necessary, record the lead decision and update both machine-readable and explanatory contracts;
5. add a positive-control test that proves the intended Omni path actually ran.

## 7. Native target and payload model (L1/L2)

### 7.1 Closed CLI target matrix

`apps/cli/script/targets.ts` defines twelve internal build targets:

- Linux ARM64;
- Linux x64 optimized and baseline;
- Linux ARM64 musl;
- Linux x64 musl optimized and baseline;
- macOS ARM64;
- macOS x64 optimized and baseline;
- Windows ARM64;
- Windows x64 optimized and baseline.

The matrix is closed. An unknown `--target` fails before build-time snapshots or dependencies are loaded.

### 7.2 Current Omni mapping

At the pinned source revision, `packages/script/src/omni.ts` maps and enables Omni companions for all twelve CLI targets, including Linux musl and Windows ARM64.

This conflicts with the limitation paragraph still present in `apps/cli/README.md`, which says Omni is disabled for Linux musl and Windows ARM64. The executable packaging contract is the current authority; the README text is a tracked documentation defect and must not be served as current implementation truth.

For each enabled target, the packager requires:

- regular non-empty addon and supervisor files;
- matching native CPU;
- matching Linux libc;
- valid ELF, Mach-O, or PE format;
- the expected Linux interpreter when dynamically linked;
- executable supervisor mode when the producing host can witness it.

Release/cross builds take companions from `OMNI_ARTIFACTS/<id>/`. A single native build may use the checkout's matching release/debug output. A partial profile cannot borrow its missing companion from another profile.

### 7.3 Tree-sitter

Tree-sitter native bindings are packaged beside the CLI under `bin/tree-sitter`.

The producer:

- checks native machine identifiers rather than trusting directory names;
- requires the core binding and required grammars;
- rejects stale preferred `build/Release` binaries for another CPU;
- validates Linux libc;
- rebuilds mislabeled/missing bindings only on a matching native host;
- requires same-CPU musl production under a musl runtime and rebuilds all relevant packages from source;
- exports target-keyed bundles for cross-build consumption;
- validates the copied bundle again.

A target row therefore does not mean any host can manufacture that target's bindings.

### 7.4 Ripgrep

The default packaged CLI stages pinned ripgrep bytes plus license materials and a manifest. The bundle code:

- chooses a target pin where upstream publishes one;
- reads an offline archive or downloads with bounded retries;
- verifies archive SHA-256 before unpacking;
- verifies the executable against its pin;
- writes license materials and provenance;
- verifies regular-file and executable properties;
- permits signed macOS/Windows bytes only through an explicit signature verifier.

`RIPGREP_BUNDLED=false` is an explicit packager contract, used by Nix-style packaging that provides `rg` on `PATH`. It is not a silent missing dependency.

## 8. Build pipeline (L2/L3)

`apps/cli/script/build.ts` is fail-fast and evidence-producing.

### 8.1 Pre-build

1. Parse `--single`, `--baseline`, `--target`, and evidence flags.
2. Reject zero/multiple/unknown target values.
3. Resolve workspace/module paths.
4. Remove prior distribution output for a full build.
5. Resolve Omni companions for **all selected builds before building any**.
6. Optionally install the frozen workspace dependency set for all OS/CPU variants.
7. Resolve Tree-sitter companions after install; unavailable native evidence stops the build.

### 8.2 Compile

For each selected target:

- compile entrypoint `src/omni-entry.ts`;
- define exact version, channel, packaged skills, models snapshot, libc, Omni enabled state, and ripgrep policy;
- embed seat skills through a virtual module;
- perform a non-output analysis build when compile evidence is enabled;
- capture raw resolved source identity and effective compiler byte counts;
- audit the Solid transform toolchain and permitted package versions;
- compile the native Bun executable;
- require a non-empty metafile and a regular executable;
- reject changed inputs, changed effective compiler input sets, or changed toolchain during the build;
- emit versioned compile evidence beside, not inside, the payload root.

### 8.3 Stage

After a successful compile:

- copy the Omni addon and supervisor beside the executable;
- copy and revalidate Tree-sitter bindings;
- stage pinned ripgrep when enabled and available for the target;
- stage Lean notices;
- write the target package metadata.

The payload admits only the documented package metadata and `bin/**`. Native companions are real side-by-side files, not embedded temporary extractions.

## 9. Qualification and release (L3)

### 9.1 Guards

The `guards` workflow runs cheap source tripwires on every pull request. It loads the guard engine from the base branch when possible so the change under test cannot weaken its own judge. A protected approval label counts only when applied by an actor with write/maintain/admin access.

### 9.2 Omni native gate

The `omni` workflow defines a three-OS gate:

- Ubuntu 24.04;
- Windows Server 2022;
- macOS 14 ARM64.

It invokes `node scripts/ci.mjs` in `native/omni`. This workflow definition is `WORKFLOW_DEFINED`; this recovery did not dispatch or observe a run for the S5 candidate.

### 9.3 Distribution bundle

The distribution bundle is a pre-release qualification workflow. Its static phase includes focused typechecks, spawn-import checks, godfile checks, and diff hygiene.

Its qualification matrix exercises native host lanes for:

- Linux x64 and ARM64;
- Windows x64 and ARM64;
- macOS ARM64 and Intel;
- Linux musl x64 and ARM64;
- CLI and supporting Core packages.

It validates exact requested test files, prepares native dependencies, runs ABI proofs, executes focused distribution tests, and requires a nonce-bound Omni positive control. Release publication calls this workflow and stops on failure.

### 9.4 Release CLI

`release-cli` is manually dispatched with a stable version and defaults to a non-publishing dry run.

Observed release rules include:

- publication requires the `dev` branch and an unreleased semver;
- publishing invokes the full distribution bundle at the release SHA;
- native builds run on matching host/CPU lanes;
- musl builds run inside pinned Alpine guests;
- signing is optional but, when requested, covers shipped macOS/Windows native binaries before payload hashes and archives;
- each built executable must report the requested version;
- payload preparation verifies the result before upload;
- only `publish=true` creates public GitHub/npm channels.

No release was run by this recovery.

## 10. Change-impact procedures (L3)

### 10.1 Add or change a CLI command

1. Modify `commands.ts`.
2. Add/update the lazy loader in `index.ts`.
3. Implement the handler under the command handler tree.
4. Confirm the handler requirements are satisfied by the shared runtime.
5. Update user documentation if the public surface changes.
6. Add focused CLI tests.
7. If the change affects startup, environment, process creation, native files, or output framing, also run distribution qualification lanes.
8. Run boundary, spawn-import, godfile, formatting, typecheck, and diff checks through the repository-prescribed CI path.

### 10.2 Change daemon behavior

Preserve:

- authenticated health before PID signaling;
- version compatibility;
- atomic private state writes;
- password removal before child inheritance;
- full-registration equality before escalation;
- detached lifetime;
- bounded startup and shutdown.

A daemon change must be tested for stale registration, PID reuse, version mismatch, failed health, concurrent registration replacement, graceful stop, forced stop, and password secrecy.

### 10.3 Change Omni or a process call

1. Determine whether the public frozen contract changes.
2. Identify affected conformance items and OS columns.
3. Preserve single-import and allowlist boundaries.
4. Add platform-specific tests and positive controls.
5. Run the full native gate on all three OS families.
6. Do not update `GUARANTEES.md` to green without a concrete matching run.
7. Review output-loss, root-versus-tree completion, cancellation, timeout, PTY, PID reuse, and host/supervisor death semantics.

### 10.4 Add or change a target

Update every affected authority, not only `targets.ts`:

- CLI target row and package naming;
- npm shim selection/fallback;
- Omni target mapping and companion artifact producer;
- Tree-sitter artifact key and native host lane;
- ripgrep pin or explicit packager policy;
- runtime proof;
- distribution qualification;
- release matrix and assembly;
- signing/notarization where applicable;
- docs and guarantee evidence.

A target is not complete until install, launch, native companion loading, process positive control, payload integrity, and relevant contract suite are demonstrated on the target.

### 10.5 Change packaged native bytes

The exact changed bytes may affect:

- compile-evidence input identity;
- CPU/libc admission;
- signature and notarization;
- payload hashes/checksums;
- npm platform packages and install script;
- desktop staging;
- Nix derivations;
- release archive reproducibility.

Never regenerate a manifest to bless unexpected bytes. Re-establish the producer and provenance.

## 11. Diagnostic playbooks (L4)

### 11.1 `orchestra` cannot find its binary

Check in order:

1. `ORCHESTRA_BIN_PATH` override;
2. detected OS and architecture;
3. AVX2 baseline decision on x64;
4. Linux libc detection;
5. installed `@humanguardrail/cli-*` package;
6. cached `.orchestra` binary beside the shim;
7. package-manager optional-dependency behavior.

An unknown Linux libc is an intentional refusal, not a fallback bug.

### 11.2 Omni preflight failed

The error occurs before the command graph. Check:

1. whether this target was built with Omni enabled;
2. explicit `HUGR_OMNI_ADDON`/`HUGR_OMNI_SUPERVISOR` only for controlled CI/development;
3. side-by-side `hugr_omni.node` and supervisor near the real executable;
4. CPU, libc, file format, execute bit, and profile pairing;
5. whether `Omni.configure` ran before first load;
6. whether the binding supports explicit configure when companions are not siblings.

Do not disable preflight to make a packaged command start.

### 11.3 Service will not start or stop

Inspect:

- private registration and password files;
- authenticated health error category;
- registration version;
- child exit during the 20-second startup deadline;
- whether another registration replaced the first;
- whether stop declined to signal because authentication or registration equality failed.

The refusal to signal a stale PID is a safety property.

### 11.4 Tree-sitter packaging failed

Use the named failure:

- `TARGET_UNSUPPORTED`: no machine mapping;
- `PREBUILDS_MISSING`: package/core/grammar absent;
- `ARCH_MISMATCH`: mislabeled binary and no matching host rebuild;
- `CORE_BINDING_MISSING`: target host must build it;
- `NATIVE_GLIBC_BUILD_REQUIRED` or `NATIVE_MUSL_BUILD_REQUIRED`: wrong producer runtime;
- `BUNDLE_INCOMPLETE`: copied payload is missing or incompatible.

Do not copy a same-named `.node` file from another CPU/libc.

### 11.5 Ripgrep packaging failed

Check:

- target pin existence;
- offline archive filename under `RIPGREP_ARCHIVES`;
- archive SHA-256;
- executable SHA-256;
- license material presence;
- execute mode;
- signature verifier and signed/unsigned policy.

If the packager declares `RIPGREP_BUNDLED=false`, verify that `rg` is actually present on the runtime `PATH`.

### 11.6 A process survived

First classify it:

- Omni-owned tree;
- documented direct-spawn exception;
- deliberate Unix session escapee;
- Docker/container cleanup path;
- clipboard/browser/detached helper;
- external SDK-managed subprocess.

For an Omni tree, capture root/session or Job membership, `processes()` behavior, stop reason, grace deadline, supervisor liveness, host death mode, and platform. Compare only against the exact guarantee tier; do not report a documented escape as a generic proof that all containment failed.

### 11.7 A platform claim is uncertain

Answer with three layers:

1. source-observed mapping or mechanism;
2. current `GUARANTEES.md` state (`green`, `declared`, or `planned`);
3. missing run/scenario/host evidence.

Abstain from “supported” when layer 2 or 3 is missing.

## 12. Known contradiction and required correction

### DOC-CONFLICT-S5-001

**Conflict**

- `apps/cli/README.md` says Omni is disabled for Linux musl and Windows ARM64.
- `packages/script/src/omni.ts` enables all twelve targets and validates musl and Windows ARM64 companions.
- release and distribution workflow definitions include musl and Windows ARM64 lanes.

**Current decision**

Treat the executable packaging code and qualification/release definitions as implementation authority. Preserve the README statement as stale evidence; do not silently erase it from provenance.

**Required repository correction**

Update the README limitation section so it accurately separates:

- current Omni enablement;
- Tree-sitter native production requirements;
- ripgrep pin availability or packager-provided `PATH`;
- per-platform guarantee evidence.

That documentation edit should be reviewed as a product-contract correction, not bundled into this Genesis result artifact.

## 13. Validation plan and current status

| Obligation | Current state |
| --- | --- |
| Fixed population identity | `SOURCE_OBSERVED`; retained partition says 927 entries. |
| Oracle frozen before body | Complete: `S5-L1-002`. |
| Author-side cumulative L1–L4 body | This artifact. |
| Source conflict preserved | Complete in this body and superseding oracle. |
| Exact source checkout and product commands | `RECOVERY_UNEXECUTED`; sandbox lacks checkout and Bun. |
| GitHub Actions for this candidate | `RECOVERY_UNEXECUTED`. |
| Independent producer isolation | `BLOCKED_INDEPENDENCE`. |
| Persistent J1 and J2 on exact package | `BLOCKED_INDEPENDENCE`; no fabricated decisions. |
| S4 runtime release availability | Available as `20261111-v3-fresh-s4-r2`; its sample judgments are not reusable for S5. |
| S5 native package preparation | Pending exact body/package materialization. |
| S5 publication/index/read | Pending new exact bindings and authorized runtime operation. |
| Domain consumer trace | Pending prepared/published S5 candidate. |
| Final handoff and seal | Pending all blockers above. |

## 14. Maintainer checklist

Before accepting a change in this domain:

- [ ] The source revision and target matrix are explicit.
- [ ] Command spec, loader, handler, docs, and tests agree.
- [ ] Process launches use the governed surface or a lead-approved exact exception.
- [ ] Lifetime semantics are preserved for detached/interactive exceptions.
- [ ] Omni companion pairs are target-correct and side by side.
- [ ] Tree-sitter CPU/libc production is native or backed by admitted target artifacts.
- [ ] Ripgrep bytes, licenses, and signatures/pins verify, or the packager explicitly provides `rg`.
- [ ] Compile and payload evidence bind the bytes that will ship.
- [ ] The relevant native, distribution, and guard workflows ran on the candidate.
- [ ] Omni positive control proves an Omni spawn occurred; strict mode has zero delegations.
- [ ] Per-platform guarantees cite matching runs; unsupported rows remain planned/declared.
- [ ] Documentation contradictions are resolved rather than repeated.
- [ ] Independent judges evaluated the exact body, source captures, candidate, and criteria.
- [ ] Consumer traces prove shallow, intermediate, and deep retrieval without source-tree fallback.

## 15. Source ledger

All source observations are pinned to `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

| Path | Role | Git blob (when captured) |
| --- | --- | --- |
| `apps/cli/README.md` | CLI guide; contains tracked stale Omni limitation | `4578855d677e8cfa43388992ee5c1e09b957a4fd` |
| `apps/cli/package.json` | application package and scripts | `c9c071a3db4543abab9f02dfd25a494881a23377` |
| `apps/cli/bin/orchestra.cjs` | npm native launcher | `d8515ec3600a92c719c4656d8d143e780ff42deb` |
| `apps/cli/src/index.ts` | runtime assembly and lazy loader map | `65566f305c1e92cb1fdd2a50e942dbd1834551b6` |
| `apps/cli/src/framework/runtime.ts` | spec-to-handler binder | `02d1d778896d87fd360a75f10d749342c0698ea1` |
| `apps/cli/src/services/daemon.ts` | daemon lifecycle and authenticated registration | `c6b5124fd3b2ef67d387f96c0b04026e598fac3d` |
| `apps/cli/src/omni-entry.ts` | packaged preflight entrypoint | `3a328f28a5db6102f0f0707fd3ef7327780d5d30` |
| `apps/cli/src/omni-preflight.ts` | no-spawn command classification | `e6b21f278639173eed310f8600f7a394ca608f9a` |
| `apps/cli/src/commands/handlers/default.ts` | default TUI path | `d0a9968e5d8e553c852b0aa724097d2a2c8de849` |
| `apps/cli/src/commands/handlers/serve.ts` | HTTP server and shutdown path | `f11a2c92019d75847eac7b87d0b762cf944e7c93` |
| `apps/cli/src/commands/handlers/run.ts` | headless/mini run behavior | `48943a08bc30c9926c0563bce3b9a702bcb511db` |
| `apps/cli/script/targets.ts` | closed twelve-target matrix | `e09e053bb0753b096b5a7c9e5a751aa4a4862c23` |
| `apps/cli/script/build.ts` | compile, evidence, and payload staging | `a5066b1fe295a10c5463e33f4a256fb3dab32cc4` |
| `packages/core/src/omni.ts` | sole loader, pairing, environment, positive control | `94a19789cef782806a80432c9a86f28bccbdecac` |
| `packages/script/src/omni.ts` | current target-to-companion authority | `559a7cec19bfa9c2dac18eaf3280ca9e3db93eee` |
| `packages/script/src/tree-sitter-prebuilds.ts` | native grammar production/admission | captured through connector at source revision |
| `packages/core/src/ripgrep/bundle.ts` | pinned bundle and verification | `72d1b057fbdc9e8ba38fa5ffb00687a91c592762` |
| `native/omni/AGENTS.md` | native invariants and gates | `d934b4eb0318ca6ec9286a944d1bab90d7d80dff` |
| `native/omni/docs/api-contract.md` | frozen public process contract | captured through connector at source revision |
| `native/omni/docs/orchestra-integration.md` | integration boundary and exceptions | captured through connector at source revision |
| `native/omni/GUARANTEES.md` | per-OS promise/evidence table | `f51a3796266b532865e59e1b1f8147ff2ff23573` |
| `script/spawn-allowlist.json` | machine-readable spawn exceptions | `532e0a09e7ca43777ec6f9792f9429bb73148348` |
| `.github/workflows/guards.yml` | source guard workflow | `e4d9f852f9d37078da17fac6ecb56e24cf51a74f` |
| `.github/workflows/omni.yml` | native three-OS gate | `f3bc81db7c1c6230f3b79a0f8acd444aea5633b0` |
| `.github/workflows/distribution-bundle.yml` | pre-release qualification | `9ff7ba447f6da199891615d43756498bd9e99eb6` |
| `.github/workflows/release-cli.yml` | dry-run/publish/sign/release orchestration | captured through connector at source revision |

## 16. Decision summary

1. The CLI is a thin npm launcher plus a compiled composition application with lazy handlers and a separate authenticated daemon.
2. Omni owns contained process-tree semantics; direct spawn imports are exceptions, not alternate defaults.
3. The daemon and launcher are valid governed exceptions because their lifetime or bootstrap contract is incompatible with normal Omni containment.
4. The current packaging code enables Omni for all twelve CLI targets; the README limitation is stale.
5. Native target admission is multi-dimensional: OS, CPU, libc, AVX2 tier, file format, companion pairing, and evidence.
6. Tree-sitter and ripgrep each have independent provenance/admission contracts; neither can be inferred from a target name.
7. Build, qualification, and release definitions are strong but do not become candidate evidence until the workflows actually run.
8. Platform support claims remain bounded by `GUARANTEES.md` and exact run evidence.
9. This body is useful author-side knowledge, but it is not semantically accepted, published, or consumer-proven until the remaining protocol obligations are satisfied.
