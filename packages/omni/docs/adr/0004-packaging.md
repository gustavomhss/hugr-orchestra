# ADR 0004 — Packaging and runtimes for hugr-omni (npm · PyPI · crates.io)

- **Status:** proposed
- **Date:** 2026-10-01
- **Work package:** S3 (spike). Feeds W14 (packaging) and W21 (release). Contract items: C-PKG-01, C-REL-01.
- **Branch:** `spike/packaging` (throwaway code under `spikes/packaging/`; this ADR and `.github/workflows/spike-packaging.yml` are the durable outputs).

> **EVIDENCE STATUS — read first.** The GitHub Actions run could not execute: every job of every run is
> refused with *"The job was not started because your account is locked due to a billing issue."*
> (org `HuGR-Labs`, free plan, public repo; runs
> [36939509378](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36939509378),
> [36943725882](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36943725882),
> [36946492376](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36946492376); a rerun is refused the same way).
> That is an account/billing state only the Owner can fix; it is not a workflow defect. Therefore:
>
> * every answer below is backed by **LOCAL evidence** produced with the *same* scripts the workflow runs
>   (`spikes/packaging/ci/*.sh`), raw lines in `spikes/packaging/evidence/local-results.txt`;
> * local coverage = **darwin-x64** (native, macOS 15.3.2 Intel), **linux-x64-gnu** (Docker Desktop amd64, run earlier in the
>   session; Docker is now down and the disk nearly full, so nothing further could be added there) and **linux-arm64-gnu**
>   (Docker Desktop **emulated** with QEMU, *partial*: Node 22 install + smoke + Q7 only; Q8 never ran on arm64);
> * **Deno** was available only transiently (a global `npm` install of Deno 2.9.x, removed afterwards): its darwin-x64 and
>   linux-x64 results are real and kept, but cannot be re-run on this machine now; **Node 24 on macOS** likewise used a
>   temporary npm-installed binary (24.21.0);
> * **NOT VERIFIED anywhere: win32-x64-msvc and darwin-arm64** (no local machine; CI blocked), and **every GitHub-hosted
>   runner label (Q3) is documented but not exercised**;
> * once billing is fixed: `git commit --allow-empty -m rerun && git push` on `spike/packaging` (the workflow triggers on
>   push only), then replace the "LOCAL" citations by the run URL. `gh run rerun` of the failed runs re-executes the
>   *old* commit, do not use it.

**Coverage matrix (what was actually run; `ok` = fresh install from the packed artefact + smoke passed; "NOT RUN" = never executed, reason given):**

| target | Node 22 | Node 24 | Bun | Deno | pip + uv, CPython 3.10 / 3.14 | Q7 (processkit addon) | Q8 (SIGCHLD) |
|---|---|---|---|---|---|---|---|
| darwin-x64 (native) | ok | ok | ok | ok (temp. install) | ok / ok | ok (22, 24) | 0 hangs, all four runtimes |
| linux-x64-gnu (Docker amd64, no compilers) | ok | ok | ok | ok | ok / ok | ok (22, 24) | pidfd path: 0 hangs; **SIGCHLD path: HANG** on Node 22/24 and Bun (a, c), none on Deno |
| linux-arm64-gnu (QEMU, partial) | ok (install + esm + cjs) | NOT RUN (disk full) | NOT RUN | NOT RUN | NOT RUN (aarch64 wheel built, never installed) | 4/5 checks ok, `not_found_rejects` FAILED (emulation suspected) | NOT RUN |
| win32-x64-msvc | NOT RUN (no Windows machine; CI blocked) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | n/a (no SIGCHLD) |
| darwin-arm64 | NOT RUN (no Apple-silicon machine; CI blocked) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

## Context

hugr-omni is one Rust core with three front-ends: a Node-API addon for TypeScript (Node 22/24, Bun, Deno) published to
npm, a CPython extension (PyO3, abi3, CPython ≥ 3.10) published to PyPI, and the Rust crate on crates.io.
Pre-decided (not re-decided here): napi-rs, PyO3 + maturin abi3-py310, five targets (win-x64, darwin-arm64,
darwin-x64, linux-x64 glibc, linux-arm64 glibc), and the hard requirement that **installing never compiles anything**.
Questions Q1–Q8 below were put to this spike; Q7 and Q8 were added during the work by the lead.

Throwaway artefacts (named `hugr-omni-spike` / `hugr_omni_spike`, never published): `core` (one lazily-built tokio
runtime + `hello`/`delayed_hello`), `node` (napi-rs addon), `py` (PyO3 module), `smoke/*`, `ci/*`.

Versions actually used: napi 3.14.0 / napi-derive 3.6.10 / napi-build 2.6 / `@napi-rs/cli` 3.10.6; PyO3 0.29.3 /
pyo3-async-runtimes 0.29.0 / maturin 1.15.0 (`v1.15.0` in the action); tokio 1.53.1; processkit 3.3.4; Rust stable
(1.98.x locally); uv 0.12.21; Node 22.17.1 + 24.21.0 (mac), 22.23.3 (slim image), Bun 1.3.14, Deno 2.9.6,
CPython 3.10.20 / 3.14.5 (mac), 3.10.22 / 3.14.8 (slim images).

## Q&A

Notation: **CI** = GitHub run (blocked, see banner). **LOCAL** = `RESULT` line in
`spikes/packaging/evidence/local-results.txt`, produced by running the workflow's scripts on the named machine.

### Q1 — napi-rs: per-platform packages, install from tarballs, Node 22/24/Bun/Deno, no compile at install

**Answer.** Works with the current major (napi 3 / CLI 3). One root package `hugr-omni-spike` (generated CJS loader +
`.d.ts`, no `.node`, five `optionalDependencies`, no lifecycle scripts) plus five platform packages
`hugr-omni-spike-<win32-x64-msvc|darwin-arm64|darwin-x64|linux-x64-gnu|linux-arm64-gnu>` (one `.node` each, `os`/`cpu`/`libc`
fields set by `napi create-npm-dirs`). `hello()` and a tokio-backed async function run unchanged on Node 22, Node 24,
Bun and Deno on darwin-x64 and linux-x64 (linux-arm64 only partially, emulated, Node 22); ESM named imports and `require()` both work
(loader exports are statically visible).

**No compile at install**, proven three ways: (1) the tarballs contain no `binding.gyp`, no native sources and no
`preinstall|install|postinstall|prepare` script — asserted by `ci/check-tarballs.mjs` and, for what was actually
installed, `ci/check-installed.mjs`; (2) the install log is grepped for gyp/cargo/rustc/cc/maturin/"Building wheel"
(`ci/lib.sh:install_log_clean`, with a positive control that the log is non-empty); (3) Linux runs happen in
`node:22-slim`, `node:24-slim`, `oven/bun`, `denoland/deno` containers with **no compiler on PATH** (`toolchain …
present=[]`), plus a PATH tripwire (shims for cargo/rustc/cc/gcc/g++/make/node-gyp/maturin that record any call) on
POSIX hosts. Not provable on Windows by tripwire (npm resolves its bundled node-gyp by path); there only (1)+(2) apply.

Installation goes through each runtime's own package manager against a read-only localhost registry fixture
(`ci/fake-registry.mjs`, serves the very tarballs produced by `npm pack`; nothing is published): `npm install`
(Node), `bun install`, `deno install`. All three resolve `optionalDependencies` with real registry logic and install
**only** the matching platform package (`installed … packages=[hugr-omni-spike hugr-omni-spike-<platform>]`).

**Deno permission flags (exact, measured by exhaustive search over {env, ffi, read, sys}, always `--no-prompt`;
`ci/deno-flags.sh`):**
* macOS (darwin-x64): `deno run --no-prompt --allow-ffi --allow-env <file>` — the only minimal set.
* Linux glibc (linux-x64, `denoland/deno`): `--allow-ffi --allow-env` plus **either** `--allow-read` **or** `--allow-sys`
  (`minimal_sets=[{--allow-env --allow-ffi --allow-read} {--allow-env --allow-ffi --allow-sys}]`): the generated loader reads
  `/usr/bin/ldd` to detect musl and, when that read is denied, falls back to `process.report`, which needs `sys`
  (an earlier harness revision that tested only "drop one flag at a time" wrongly concluded read/sys were never needed and
  failed on Linux — the exhaustive search replaced it). Recommended and used by the Q8 runs: `--allow-ffi --allow-env --allow-read`.
* `--allow-ffi` loads the `.node`; `--allow-env` is needed for the loader's `NAPI_RS_NATIVE_LIBRARY_PATH`,
  `NAPI_RS_FORCE_WASI`, `NAPI_RS_WASI_FLAVOR`, `NAPI_RS_ENFORCE_VERSION_CHECK` reads. Scoped form that passed on both:
  `--allow-ffi --allow-env=NAPI_RS_ENFORCE_VERSION_CHECK,NAPI_RS_FORCE_WASI,NAPI_RS_NATIVE_LIBRARY_PATH,NAPI_RS_WASI_FLAVOR
  --allow-read=.,/usr/bin/ldd --allow-sys`.
* Windows: not measured. `--allow-run` is needed only by the product itself once it spawns processes (the Q8 harness uses it).

**Evidence.** CI: not run (blocked). LOCAL (darwin-x64): `js-darwin-x64-{node22,node24,bun,deno}` → lines
`RESULT Q1 installed target=darwin-x64 rt=<rt> … scripts=none gyp=none tripwire=clean`, `RESULT Q1 run … status=ok`,
`RESULT Q1 deno-permissions minimal_sets=[{--allow-env --allow-ffi}] …` (macOS) / `…[{… --allow-read} {… --allow-sys}]` (Linux).
LOCAL (linux-x64, Docker amd64): same lines with `in_container=1 image=node:22-slim|node:24-slim|oven/bun:latest|denoland/deno:latest present=[]`.
LOCAL (linux-arm64, **emulated**, partial): install from the arm64 tarball and `esm`/`cjs` smoke on `node:22-slim` passed
(`RESULT Q1 installed target=linux-arm64-gnu rt=node22 … packages=[hugr-omni-spike hugr-omni-spike-linux-arm64-gnu]`); Node 24/Bun/Deno not run on
arm64 (disk exhausted, run aborted). **Gaps:** win32-x64, darwin-arm64, native linux-arm64, and linux-arm64 × {Node 24, Bun, Deno}.

**glibc floor.** Both Linux `.node` files built with `napi build --use-napi-cross` (gcc cross toolchain with glibc 2.17
sysroot, from a Linux x64 host) require at most `GLIBC_2.15` (x64) / `GLIBC_2.17` (arm64) symbols (`RESULT Q6 node-binary … glibc_floor=GLIBC_2.15|GLIBC_2.17`,
measured with `grep -aoE 'GLIBC_[0-9.]+' | sort -Vu | tail -1`), i.e. loadable on RHEL/CentOS 7+, Debian 9+, Ubuntu 16.04+. An arm64 binary cross-built from x64 loaded and ran
in an (emulated) arm64 container, so building arm64 does not need an arm runner; testing it natively does (`ubuntu-24.04-arm`).

### Q2 — PyO3 + maturin abi3-py310: wheels, pip `--only-binary=:all:` and uv, CPython 3.10 and 3.14

**Answer.** One wheel per platform, tag `cp310-abi3-<platform>`, installs on CPython 3.10 **and** 3.14 unchanged:
`macosx_10_12_x86_64` (270,279 B), `manylinux_2_28_x86_64` (303,662 B), `manylinux_2_28_aarch64` (294,064 B) were built
here (macOS wheel natively; the Linux wheels cross-built on the Mac with `maturin --zig --compatibility manylinux_2_28`, **not**
through the CI's manylinux container path); the aarch64 wheel was **never installed or run**; `macosx_11_0_arm64` and `win_amd64`
are expected from maturin by the same recipe and **not verified**. With
`pip install --only-binary=:all: --no-index --find-links wheels hugr-omni-spike` and with
`uv pip install --only-binary :all: --no-index --find-links wheels hugr-omni-spike` (all wheels offered; the installer
picked the compatible one) both `hello()` and the async function ran on 3.10 and 3.14. Linux in
`python:3.10-slim` / `python:3.14-slim` with no compiler (`toolchain … present=[]`). pip/uv logs are grepped for
"Building wheel|maturin|cargo|rustc" (clean, with positive control `Successfully installed …` / `Installed 1 package`).
PyO3 0.29 needs **no** `extension-module` feature (maturin sets `PYO3_BUILD_EXTENSION_MODULE`).

**Async bridge (evaluated).** (a) `pyo3-async-runtimes` 0.29 `tokio::future_into_py` — the maintained successor of
pyo3-asyncio, pinned to the PyO3 minor, stable API → **recommended**. (b) PyO3-native `#[pyfunction] async fn`
(feature `experimental-async`; guide says "still in active development", asyncio only, no public `Coroutine`
constructor) → works in the harness (`hello_async_native`) but not recommended yet. Both resolved on the core runtime
thread (`async-hello …@hugr-omni-rt`), resumed the coroutine on the event-loop thread (`resumes_on_loop_thread=ok`),
survived 200 concurrent calls, task cancellation, a second event loop in the same process and a sync call from a worker
thread.

**Evidence.** CI: not run. LOCAL: `py-darwin-x64-py3.10`, `…py3.14`, `py-linux-x64-gnu-py3.10`, `…py3.14` →
`RESULT Q2 run … pm=pip|uv status=ok wheel=hugr_omni_spike-0.0.0-cp310-abi3-<tag>.whl`,
`RESULT Q2 toolchain … in_container=1 … present=[]`. **Gaps:** win_amd64, macosx arm64 wheels never built or run.

### Q3 — GitHub-hosted runner labels (public repo)

**Answer (documentation only — no job could start).** From
[GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
(fetched 2026-10-01), free and unlimited for public repositories:

| target | label used in the workflow | notes |
|---|---|---|
| linux-x64 | `ubuntu-24.04` | 4 CPU / 16 GB |
| linux-arm64 | `ubuntu-24.04-arm` | native arm64, 4 CPU / 16 GB; also `ubuntu-22.04-arm`, `ubuntu-26.04-arm` |
| win-x64 | `windows-latest` (= windows-2025) | `windows-11-arm` exists but is not a target |
| darwin-arm64 | `macos-latest` (docs: currently macos-26, arm64, 3 CPU M1 / 7 GB); `macos-14`, `macos-15`, `macos-26` pinnable | |
| darwin-x64 | **`macos-15-intel`** (also `macos-26-intel`), 4 CPU / 14 GB | an Intel label exists, so no cross-compile + Rosetta fallback is needed |

The workflow also prints `RESULT Q3 runner label=… image=… uname=… cpus=…` from every job (`ci/runner-info.sh`) and build
durations, to be harvested after the billing fix. **Not exercised:** all five labels.

**Evidence.** CI: blocked — run [36946492376](https://github.com/HuGR-Labs/hugr-omni/actions/runs/36946492376),
every job, annotation *"…account is locked due to a billing issue."* LOCAL cannot answer Q3.

### Q4 — Async runtime: one tokio runtime per process, owned by the core

**Answer / recommendation.** The core owns **one** lazily-initialised multi-thread tokio runtime
(`static RT: OnceLock<Runtime>`; built on the first async call, never at module load — `runtime_started()` is `false`
after `require`/`import` in every runtime and language). Bindings do not build runtimes; they hand a future to the
core and only *settle* a promise:

* **napi-rs:** do **not** use `#[napi] async fn` for product code. Stock napi (`tokio_rt`) starts its **own** runtime
  (threads named `tokio-rt-worker` in the harness, a second runtime next to ours). Use `Env::create_deferred()` →
  `JsDeferred`, spawn the work on the core runtime, and call `deferred.resolve/reject` from the tokio thread. napi
  creates the deferred together with a Node-API **threadsafe function** on the JS thread
  (`napi_create_threadsafe_function`), registers an env-cleanup hook, and `resolve()` ends in
  `napi_call_threadsafe_function`, so the JS value is created and the promise settled **on the JS thread**; if the env is
  tearing down, the pending deferred is rejected instead of touching a dead env (napi 3.14 `js_values/deferred.rs`).
  napi 3.14 also has an `async-runtime` SPI (`unsafe trait AsyncRuntime`, `register_async_runtime`): rejected, it is
  `unsafe`, brand new, and its contract (no thread may touch addon code after `shutdown`) is exactly the hard part.
* **PyO3:** `pyo3_async_runtimes::tokio::init_with_runtime(core::runtime())` (takes `&'static Runtime`, hence the
  `OnceLock`), then `future_into_py`. The future runs on the core runtime; on completion it takes the GIL on the tokio
  thread and completes the asyncio future through `loop.call_soon_threadsafe` (`pyo3-async-runtimes/src/generic.rs`,
  `call_soon_threadsafe`), so the event loop thread, not the tokio thread, resumes the awaiting coroutine.
  Cancelling the awaiting task is safe (the orphaned tokio task finishes into a cancelled future).

Observable proof in the smoke tests: the async result is stamped with the thread that ran it: `@hugr-omni-rt` for the
recommended path, `@tokio-rt-worker` for the stock napi path; the promise/coroutine resumes on the JS/event-loop
thread; 200 concurrent calls; Python survives a second `asyncio.run` and cancellation. Works on Node 22/24, Bun and
Deno (darwin-x64 and linux-x64; the stock path also works on all four, it is just a second runtime).

**Evidence.** LOCAL: `SMOKE_JSON …"async_core":"async-hello 20ms@hugr-omni-rt"…"stock_async_info":"async-hello-stock
10ms@tokio-rt-worker"` for every runtime (logs `js-*` runs); python `SMOKE_JSON …"async_native_pyo3":"…@hugr-omni-rt"`.
The tokio runtime must be built with `enable_all()` (IO + time + signal drivers) because `tokio::process` needs them.

### Q5 — Trusted publishing (no long-lived tokens): steps for the Owner (nothing configured by this spike)

One workflow file, `.github/workflows/release.yml`, with **three publish jobs, each in its own GitHub Environment**
(`npm`, `pypi`, `crates-io`), each with `permissions: { id-token: write, contents: read }`. Create the three
environments first (repo → Settings → Environments) and add **Required reviewers = the Owner** to each: that is the
manual approval that makes "the Owner publishes" real. The workflow *file name* and the *environment name* are what each
registry pins, so do not rename them afterwards.

**npm** ([Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers); provenance:
[docs.npmjs.com/generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements)).
Six packages = six configurations (root + 5 platform packages; the setting is per package).
1. Each package must exist on the registry before a trusted publisher can be added in its settings (the docs are
   silent on first publish, community reports and the settings location say it must exist): the Owner publishes the
   **first** version of each of the six names once from their own machine (`npm publish --access public`, interactive
   login + 2FA; no token is stored). Verify this at the time, the rule may have changed.
2. For each package: npmjs.com → package → **Settings → Trusted publisher → GitHub Actions** → organisation/user
   `HuGR-Labs`, repository `hugr-omni`, workflow filename `release.yml` (filename only), environment `npm`.
3. Same page: **Publishing access → "Require two-factor authentication and disallow tokens"** so token publishes are dead.
4. In the job: npm CLI ≥ 11.5.1 and Node ≥ 22.14 (use `actions/setup-node` with `node-version: 24`), then `npm publish
   <tarball> --access public` — OIDC is picked up automatically; provenance is generated automatically for public
   repos/packages. Limits: ≤ 10 trusted publishers per package; self-hosted runners unsupported.

**PyPI** ([Trusted publishers](https://docs.pypi.org/trusted-publishers/);
[new project / pending publisher](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/);
[existing project](https://docs.pypi.org/trusted-publishers/adding-a-publisher/);
[publish action](https://github.com/pypa/gh-action-pypi-publish)). One project.
1. *First release (project does not exist yet):* pypi.org → account menu → **Publishing** → add a **pending
   publisher**: PyPI project name (the real one), owner `HuGR-Labs`, repository `hugr-omni`, workflow `release.yml`,
   environment `pypi`. The first successful publish creates the project and converts the pending publisher into a normal
   one. A pending publisher **does not reserve the name** until used: publish promptly.
2. *Later / existing project:* project → **Manage → Publishing → Add a trusted publisher** with the same fields.
3. Job: `permissions: id-token: write`, `environment: pypi`, then `uses: pypa/gh-action-pypi-publish@release/v1` with
   `packages-dir: wheels` (attestations are on by default). No API token anywhere. Upload wheels only (see Decision).

**crates.io** ([Trusted Publishing](https://crates.io/docs/trusted-publishing);
[RFC 3691](https://rust-lang.github.io/rfcs/3691-trusted-publishing-cratesio.html);
[rust-lang/crates-io-auth-action](https://github.com/rust-lang/crates-io-auth-action)). One configuration per crate.
1. A trusted-publishing token **cannot create a crate** (crates.io source:
   `"Trusted Publishing tokens do not support creating new crates. Publish the crate manually, first"`). The Owner
   publishes the first version of each crate once with a short-lived scoped API token created for that purpose
   (crates.io → Account Settings → API Tokens, scope `publish-new`, expiry ≤ 1 day), then **revokes it**.
2. For each crate: crates.io → crate → **Settings → Trusted Publishing → Add**: owner `HuGR-Labs`, repository
   `hugr-omni`, workflow `release.yml`, environment `crates-io`.
3. Same page: enable **"Require trusted publishing"** (crates.io `trustpub_only`) so tokens stop working.
4. Job: `permissions: id-token: write`, `environment: crates-io`, `uses: rust-lang/crates-io-auth-action@v1` (`id: auth`),
   then `cargo publish` with `CARGO_REGISTRY_TOKEN: ${{ steps.auth.outputs.token }}` (the token is revoked in the action's
   post step).

Order of operations for the Owner, once: (1) environments + reviewers; (2) first manual publishes (npm ×6, crates ×N);
(3) register trusted publishers (npm ×6, PyPI pending ×1, crates ×N); (4) disable token publishing; (5) first tagged
release through `release.yml`. Sketch of the three jobs is in "Workflow snippets" (not run in this spike).

### Q6 — Artifact size per target and install time per package manager

Sizes (stripped, `opt-level=s`, fat LTO, `panic=unwind`), **LOCAL**; the processkit-free baseline is the same addon
(napi + core + tokio, no processkit):

| target | `.node` baseline | `.node` + processkit(+pty) | npm platform tarball (packed addon = processkit + Q8 diagnostics) | wheel (no processkit) |
|---|---|---|---|---|
| darwin-x64 | 460,080 B | 980,632 B | 542,932 B | 270,279 B |
| linux-x64-gnu | 517,216 B | 1,090,760 B | 592,219 B | 303,662 B |
| linux-arm64-gnu | 484,232 B | 1,037,296 B | 574,393 B | 294,064 B |
| win32-x64-msvc, darwin-arm64 | — not measured — | | | — not built — |

Install time, **LOCAL**, darwin-x64 native (warm DNS, loopback fixture registry, no download time included, tiny
payload): npm ≈ 0.9–4.9 s (tarball + 5 packument lookups; noisy, machine was under load), bun ≈ 0.2–0.4 s, deno ≈ 0.4–1.6 s,
pip ≈ 1.0–1.9 s, uv ≈ 0.3–0.6 s. Linux numbers measured in Docker Desktop on a Mac (VM, host-gateway network, `--no-cache`) are 2–13 s and
are **not representative**: use the CI `RESULT Q6 install-time …` lines after the billing fix. Build times (cold):
~45–200 s per `napi build` variant in the Linux container; CI timings pending.

### Q7 — napi addon on top of `processkit` (features `pty`)

**Answer.** `processkit` 3.3.4 (MIT, MSRV 1.88, `features = ["pty"]`) compiles into the napi addon and an async
`runCommand(program, args, pty?)` → exit code works: exit 7/0 returned exactly, a program under a PTY (`openpty` on Unix)
returns its code, a missing program rejects with a clear message, 20 concurrent runs resolve correctly — in the **packed
tarball installed from a fresh project on Node 22 (and Node 24)**: darwin-x64 native and linux-x64 (container).
The call runs on the core runtime and settles through `JsDeferred`, like every other async function (Q4). Needs the
tokio runtime built with `enable_all()`.
**Binary-size impact (A/B, only the processkit dependency toggled):** darwin-x64 +520,552 B (460,080 → 980,632, ×2.13);
linux-x64-gnu +573,544 B (517,216 → 1,090,760, ×2.11); linux-arm64-gnu +553,064 B (484,232 → 1,037,296, ×2.14). I.e. the
native package roughly doubles, to ~1.0–1.1 MB per platform (≈ 0.54 MB gzip).
Dependency footprint: +19 crates on Unix (processkit, async-trait, bytes, core_detect, encoding_rs, errno, mio,
multiversion_no_op, `mutants`, rustversion, scopeguard, signal-hook-registry, simdutf8, socket2, thiserror(+impl),
tokio-macros, tokio-stream, tokio-util; 34 → 53 in `cargo tree`), plus windows-sys 0.61 on Windows; **no `cc` crate in the
graph** (no C compiler needed to build, only a linker).
**Gaps:** win32-x64 (ConPTY path) and darwin-arm64 not run; the Windows PTY test is the most likely to fail on a hosted
runner. linux-arm64 (emulated, Node 22): exit codes, PTY and 20 concurrent runs passed, but the *missing program* check
**resolved instead of rejecting** (`"not_found_rejects":"FAIL: resolved"`) — suspected QEMU user-mode artefact (a syscall used by the
PATH lookup is not emulated), unverified: re-run on `ubuntu-24.04-arm` before trusting processkit there. **See Q8 before adopting.**

**Evidence.** LOCAL: `RESULT Q1 run target=darwin-x64 rt=node22 script=q7 status=ok` (+ node24, linux-x64) and
`SMOKE_Q7_JSON …"exit_7":"ok","exit_0":"ok","exit_3_under_pty":"ok","not_found_rejects":"ok","concurrent_20":"ok"`;
sizes: `RESULT Q7 size-impact target=… baseline_bytes=… processkit_only_bytes=… processkit_delta_bytes=…` (local builds; the
workflow's node-pack job emits the same line from CI builds once it can run).

### Q8 — SIGCHLD interplay between processkit (tokio) and the host runtime's own child-process machinery

**Question.** Does a non-chaining SIGCHLD handler installed by Node/Bun/Deno (libuv etc.) make processkit's wait hang?
**Method** (`smoke/smoke-q8.mjs`, driven by `ci/js-test.sh:run_q8`): children are `/bin/sh -c "exit N"` on both sides;
scenario **a** = processkit spawn+wait → runtime-native spawn+wait → processkit spawn+wait; **b** = the reverse order;
**c** = both concurrently (2 + 2 children at once); 50 iterations each; every wait guarded by a 10 s timeout; one
scenario per fresh process (SIGCHLD state is process-global and "first spawn" must be real). Native side:
`node:child_process`, `Bun.spawn`, `Deno.Command`, and `node:child_process` inside Bun/Deno. A hang that persists trips a
circuit breaker after 3 consecutive hung waits of the same kind (the handler never comes back; the counts below are
therefore *lower bounds* and `aborted_early=true` marks them).
**Instrument calibration.** A positive control installs a deliberately non-chaining handler
(`sabotageSigchld()`: `signal(SIGCHLD, noop)` after processkit's first spawn): the harness **must** report hangs, and it
does (e.g. `control=sabotage verdict=HANG first_hang=i0:pk2`) in Node 22/24, Bun and Deno on macOS and on Linux with the
signal path; a run whose control is not detected fails the job. A second control shows the mitigation survives the same
sabotage (**macOS Node 22 and Bun only**; not run on Linux, Node 24 or Deno).

**Finding 1 — the exposure depends on how tokio waits, not only on the runtime.** tokio 1.53 has two child reapers
(`src/process/unix/mod.rs: build_child`): `PidfdReaper` on Linux when `pidfd_open` succeeds (kernel ≥ 5.3 and not blocked by
seccomp), otherwise `SignalReaper`, which is woken only by tokio's own SIGCHLD handler (macOS/BSD, and Linux without
pidfd: older kernels — check distro backports, e.g. RHEL 8 ships a 4.18-based kernel — or sandboxes that block `pidfd_open`). On the pidfd path SIGCHLD is irrelevant: the
sabotage control cannot hang it (`control … detected=no note=linux-pidfd-path-does-not-use-SIGCHLD`) and the real
scenarios show 0 hangs. To exercise the other path on Linux a second container pass runs with a seccomp profile that
returns `ENOSYS` for `pidfd_open` (`ci/seccomp-no-pidfd.json`); there the control is detected.

**Finding 2 — measured hang counts** (processkit waits hung / total; native waits never hung):
| runtime (native spawn API tested) | macOS darwin-x64 (SIGCHLD-driven reaper) | Linux x64, kernel-default (pidfd reaper) | Linux x64, **SIGCHLD reaper** (pidfd blocked by seccomp) |
|---|---|---|---|
| Node 22.17 / 22.23 (`child_process`) | 0 hangs — a, b, c × 50 it | 0 hangs — a, b, c × 50 it | **HANG a** (3/4 pk waits hung, breaker at it 2) · **HANG b** (3/4, it 4) · **HANG c** (5/6, it 3) |
| Node 24.21 (`child_process`) | 0 | 0 | **HANG a** (5/8, it 4) · **HANG b** (3/4, it 4) · **HANG c** (17/28, it 14) |
| Bun 1.3.14 (`Bun.spawn` and `node:child_process`) | 0 | 0 | **HANG a** (3/4, it 2) · b: 0 hangs (50/50 it) · **HANG c** (3/4, it 2) |
| Deno 2.9.x (`Deno.Command` and `node:child_process`) | 0 | 0 | 0 hangs in a, b, c |
| *std::process + blocking wait (mitigation)*, all four runtimes | 0 | 0 | 0 (50 it × a, b, c each) |
| Windows | no SIGCHLD — not applicable, not run | | |

"a/b/c" are the scenarios above; "N/M pk waits hung" counts processkit waits that hit the 10 s timeout before the circuit
breaker fired (`aborted_early=true`, `it` = iteration reached); a hung wait never completes later, so the true count for 50
iterations is "all of them from the first hang on". Native-side waits (libuv/Bun/Deno) never hung in any run. All exit codes
were correct (`wrong=0`). Mechanism, observed with the addon's `sigchldState()` probe: on Linux's SIGCHLD path, after a libuv child has run
SIGCHLD is back to `SIG_DFL` (`sigchld=[…,i0.after_pk1=handler,i0.after_native=SIG_DFL,i0.after_pk2=SIG_DFL,…]`), i.e. the
handler tokio had installed is gone. tokio registers its SIGCHLD handler **once per process** (`get_or_init` in
`tokio/src/signal/unix.rs: signal_enable`) and never re-installs it, so every later processkit wait is never woken —
and *any* libuv child run after tokio's registration has this effect (scenario b hangs too, from iteration 1: the first
processkit wait succeeds, the next libuv child wipes the handler, the following processkit wait hangs). On macOS libuv never changes the SIGCHLD disposition
(`SIG_DFL`/`handler` unchanged across native spawns) and Deno's own embedded tokio coexists, hence 0 hangs there.

**Finding 3 — mitigation that works (experiment, not processkit):** run the child with `std::process` and wait for it on
a dedicated blocking thread (`spawn_blocking(child.wait)`, i.e. `waitpid` on that one pid; `runCommandStd` in the addon).
It never depends on SIGCHLD or on tokio's signal driver: 0 hangs in every scenario and runtime on the signal path
(`pk_impl=stdwait … verdict=NO_HANG`), and it survives the sabotage control on the two runtimes where that second control ran
(`RESULT Q8 mitigation-survives-sabotage target=darwin-x64 rt=node22|bun … yes`; NOT RUN on Linux, Node 24, Deno).

**Reading for the pivot (judgement, flagged as such).** processkit on the **pidfd path** coexists with libuv/Bun/Deno in
every combination tried. On the **signal path** it does not under **Node 22, Node 24 and Bun** (Linux; Deno never hung). macOS shows 0 hangs for all four
runtimes, but macOS is a SIGCHLD-driven platform, so that result rests on libuv/Bun/Deno *not* clobbering tokio's handler
there (observed: `sigchldState()` stays `handler` across native spawns) — a property of today's runtime versions, not a guarantee. Because the glibc floor chosen in Q1 (2.17) deliberately
admits CentOS/RHEL 7–8 era kernels, **a design that waits through tokio's SIGCHLD reaper is not safe inside the three
host runtimes on every supported Linux**. Either wait via per-child blocking `waitpid` in the core (shown to work), or
adopt processkit only after it offers a wait path independent of SIGCHLD (and re-run this harness as a gate).

**Evidence.** LOCAL — exact `RESULT Q8 …` lines (`kernel_path=default|signal`, per target/runtime/variant/scenario) are in
the evidence file and sampled in the ledger below. **Gaps:** win32 has no SIGCHLD (skipped by design);
darwin-arm64 not run; linux-arm64 only emulated; CI blocked.

## Decision

1. **npm:** root package + 5 optional platform packages, built with `@napi-rs/cli` 3.x / napi 3.x, `napi8`, Linux glibc
   targets cross-built with `--use-napi-cross` (glibc ≥ 2.17), CJS loader generated by the CLI, **no lifecycle
   scripts, ever**; `engines.node >=22`. Per-package publish with trusted publishing; do **not** use `napi pre-publish`
   (it runs `npm publish`); keep `optionalDependencies` static and assert them in CI (`check-tarballs.mjs`).
2. **PyPI:** maturin 1.15 + PyO3 0.29, `abi3-py310`, mixed layout (`python-source`), wheels only — **no sdist is uploaded
   to PyPI** (an sdist makes `pip` fall back to compiling on an unsupported platform; we want "No matching distribution"
   instead). manylinux_2_28 on x64 and on the native arm runner, `macosx_10_12_x86_64` / `macosx_11_0_arm64`, `win_amd64`.
   `pip install --only-binary=:all:` and uv are both release gates.
3. **crates.io:** plain source crates; keep `cc`-based build scripts out of the dependency graph so the only native
   requirement of a Rust consumer is the linker rustc already needs.
4. **Runtime:** one lazily-built tokio runtime owned by the core; bindings only settle promises/futures
   (napi `JsDeferred`; PyO3 `pyo3-async-runtimes` + `init_with_runtime`). No `#[napi] async fn`, no napi `async-runtime`
   SPI, no PyO3 `experimental-async` in product code.
5. **Runners:** `ubuntu-24.04`, `ubuntu-24.04-arm`, `windows-latest`, `macos-latest` (arm64), `macos-15-intel` — documented,
   pending a first successful run.
6. **Install tests:** fresh job per (target × runtime/installer), installing the packed artefacts from a localhost registry
   fixture through the runtime's own package manager; Linux in slim, compiler-free containers; Deno with
   `--allow-ffi --allow-env --allow-read` (Linux; macOS needs no read).
7. **Release:** a single `release.yml`, three environment-gated jobs, trusted publishing on all three registries, no
   long-lived tokens after the one-time manual first publishes (Q5).
8. **Process waiting (Q7/Q8):** do not let the product's correctness depend on tokio's SIGCHLD-driven reaper while hosted
   inside Node/Bun/Deno. processkit is acceptable only behind a gate: the Q8 harness (including its positive control and
   the pidfd-blocked pass) must be green on every target before any adoption, or the core waits with dedicated blocking
   `waitpid` threads. **This is the lead's decision; the ADR records the evidence and the cheaper safe option.**

## Rejected alternatives

- **node-gyp / `cmake-js` / source build at install, or `prebuild-install` / postinstall download:** violates "install
  never compiles/needs network beyond the registry"; pnpm ≥ 10 and Bun skip lifecycle scripts by default.
- **A single fat npm package with all `.node` files:** ~5× download for everyone; the optional-dependency split costs nothing.
- **WASM-only addon:** no PTY/process control, perf and API gaps.
- **PyO3 `#[pyfunction] async fn` as the bridge:** experimental, asyncio-only; fine later, not now.
- **per-version CPython wheels (cp310, cp311, …):** 5× the wheels; abi3 covers 3.10–3.14 with one.
- **universal2 macOS wheel / `napi universalize`:** larger downloads for no benefit given Intel and arm runners exist.
- **Building arm64 natively only on `ubuntu-24.04-arm` against the runner's glibc (2.39):** raises the glibc floor
  (fails on Debian 12/RHEL 8); use the old-glibc cross toolchain or manylinux containers.
- **`napi pre-publish`:** publishes as a side effect.
- **Local verdaccio registry:** a writable registry; the read-only fixture does the same job without any publish step.
- **Rosetta + cross-compile for darwin-x64:** unnecessary, `macos-15-intel` exists (docs).

## Consequences

### Dependency allowlist (for the product)

Rust (runtime): `tokio` 1 (`rt-multi-thread`, `time`, + `process`/`net`/`io-util`/`sync`/`signal` only if processkit is adopted),
`napi` 3.x (`default-features=false`, `napi8`; **no** `tokio_rt`), `napi-derive` 3.x, `napi-build` 2.x (build),
`pyo3` 0.29.x (`abi3-py310`; no `extension-module`), `pyo3-async-runtimes` 0.29.x (`tokio-runtime`), `libc`.
**Conditional (Q7/Q8):** `processkit` 3.3.x (`pty`) and its tree (`tokio-util`, `tokio-stream`, `async-trait`, `thiserror` 2,
`encoding_rs`, `signal-hook-registry`, `mio`, `socket2`, `windows-sys` 0.61, `mutants`). **Denied:** any crate whose build
script needs a C compiler (`cc`, `cmake`, `bindgen` with libclang); `napi` features `async-runtime`, `tokio_rt`;
PyO3 `experimental-async`; PyO3 `extension-module`.
Tooling pinned in CI: `@napi-rs/cli` 3.10.x, maturin 1.15.x (`PyO3/maturin-action`), uv, `Swatinem/rust-cache`,
`dtolnay/rust-toolchain`, `oven-sh/setup-bun`, `denoland/setup-deno`; pin actions by commit SHA in the product repo.
Runtime support statement: Node ≥ 22 (N-API 8), Bun and Deno latest; CPython ≥ 3.10 (abi3); glibc ≥ 2.17 (node) /
2.28 (wheels).

### Workflow snippets W14 should copy

Source of truth: commit `spike/packaging` @ HEAD, paths below (condensed here).

1. **Build matrix** (`node-build`): five `include` rows `{id,target,os,napi_extra}`; steps `dtolnay/rust-toolchain@stable
   (targets: ${{matrix.target}})`, `Swatinem/rust-cache@v2 (workspaces: …)`, `npm ci`,
   `npx napi build --platform --release --target ${{matrix.target}} ${{matrix.napi_extra}}` where `napi_extra =
   --use-napi-cross` for both Linux rows (built on `ubuntu-24.04`), empty otherwise; then
   `ci/build-report.sh` (size, glibc floor via `grep -aoE 'GLIBC_[0-9.]+' | sort -Vu | tail -1`, minos on macOS);
   upload `.node` + the generated `index.js`/`index.d.ts` (identical across targets — asserted). Only while the processkit
   question is open: two extra size-only builds (`--no-default-features`, and `--no-default-features --features processkit`).
2. **Pack** (`node-pack`, `ci/node-pack.sh`): `napi create-npm-dirs`, copy artefacts to `artifacts/`, `napi artifacts`
   (strict: fails if any configured target has no binary), `npm pack` each package, then `ci/check-tarballs.mjs`
   (6 tarballs, no scripts/gyp/sources, one `.node` per platform package, 5 optionalDependencies at the root version).
3. **Fresh-install test** (`node-test`, `ci/js-job.sh` + `js-test.sh`): matrix `target × rt(node22,node24,bun,deno)`;
   Linux inside `node:22-slim|node:24-slim|oven/bun|denoland/deno` via `docker run --network host` against
   `ci/fake-registry.mjs`; project `.npmrc` → `registry=http://127.0.0.1:<port>/`; `npm install --foreground-scripts
   --loglevel=verbose` / `bun install` / `deno install`; assertions: no toolchain, log clean, no lifecycle scripts, only the
   matching platform package installed, then `smoke.mjs`, `smoke.cjs`, `ci/deno-flags.sh`.
4. **Wheels** (`py-build`): `PyO3/maturin-action@v1` with `maturin-version: v1.15.0`, `target`, `manylinux: 2_28` (Linux)
   / `off`, `args: --release --out dist`, `working-directory: …/py`; Linux arm64 on `ubuntu-24.04-arm`.
5. **Wheel install test** (`py-test`, `ci/py-job.sh` + `py-test.sh`): `target × {3.10, 3.14}`; Linux in
   `python:3.X-slim`; `python -m venv` + `pip install --only-binary=:all: --no-index --find-links wheels`, and
   `uv pip install --only-binary :all: --no-index --find-links wheels`; all five wheels offered so tag selection is tested.
6. **Q8 gate** (inside `js-test.sh:run_q8*`): keep it as a permanent job if processkit (or any tokio-process dependency)
   is adopted: scenarios a/b/c, positive control, pidfd-blocked second pass (`ci/seccomp-no-pidfd.json`).
7. **Release sketch (W21, not run here):**
```yaml
on: { push: { tags: ["v*"] } }
permissions: { contents: read }
jobs:
  npm:
    environment: npm
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/download-artifact@v8     # the tarballs built and tested earlier in the same run
      - uses: actions/setup-node@v7
        with: { node-version: "24" }           # npm >= 11.5.1, Node >= 22.14
      - run: for t in tarballs/*.tgz; do npm publish "$t" --access public; done   # OIDC, provenance automatic
  pypi:
    environment: pypi
    permissions: { id-token: write }
    steps:
      - uses: actions/download-artifact@v8
      - uses: pypa/gh-action-pypi-publish@release/v1
        with: { packages-dir: wheels }
  crates:
    environment: crates-io
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v7
      - uses: rust-lang/crates-io-auth-action@v1
        id: auth
      - run: cargo publish
        env: { CARGO_REGISTRY_TOKEN: "${{ steps.auth.outputs.token }}" }
```

### Other consequences

- C-PKG-01 and K9 can be implemented as above; C-REL-01's post-publish smoke should reuse `js-test.sh`/`py-test.sh` with the
  real registries instead of the fixture. Deno's own `deno install npm:<pkg>` against the fixture works pre-publish, so the
  post-publish check mostly confirms the registry side.
- User-visible download sizes: ≈ 0.54–0.59 MB per native npm platform package (with processkit; the tarball is gzip) and
  ≈ 0.27–0.30 MB per wheel.
- Bun caches by `name@version`: re-using a version number with different bytes served a **stale cached tarball** locally
  (symptom: `runCommand is not a function`). Test jobs must start with a clean cache (CI does) and local loops must use
  `BUN_INSTALL_CACHE_DIR=$(mktemp -d)`.
- The generated napi loader tries `require('<platform package>')`, so a broken `optionalDependencies` resolution shows as
  "Cannot find native binding"; keep `check-tarballs.mjs` as a gate.

## Open risks

1. **CI never ran** (billing lock): runner labels, Windows (npm/bun/deno/pip/uv, ConPTY via processkit, `.node` loading in Bun/Deno), darwin-arm64
   (ad-hoc signing of the `.node`, Bun/Deno loading) and the linux-arm64 *native* path are unverified. Highest-risk first runs:
   Windows × (Bun, Deno, PTY test) and `macos-latest` × Deno.
2. **processkit + host-runtime SIGCHLD (Q8)**: reproduced on the signal path (Linux without pidfd) under Node 22, Node 24 and Bun
   (deterministic, persistent hang); not under Deno, not on the pidfd path, not on macOS in the combinations tried. Kernels < 5.3 and seccomp-restricted containers are in the supported set.
   Processes the *application* spawns with the runtime's own API are unaffected, but the core's waits are not safe there.
3. **Linux arm64 verified only under emulation** (QEMU user-mode): signal and syscall behaviour (including pidfd) differ from a real kernel.
4. **Windows**: processkit PTY (ConPTY) and Job Objects unexercised here; no SIGCHLD there (Q8 skipped by design).
5. **First-publish constraints**: npm and crates.io need a manual first publish per name (Q5); a PyPI pending publisher does not reserve the name.
   Name squatting between spike and release is possible; consider claiming names early.
6. **Deno**: scoped `--allow-env` list comes from the generated loader and may change with napi CLI releases (re-run `ci/deno-flags.sh`).
   Deno's `deno install npm:` path was exercised only through the fixture, not the real registry.
7. **Pinned-by-tag actions** in the spike (`@v7`, `@v2`…): the product must pin by SHA; maturin-action/napi-cross download toolchains at build time (supply chain).
8. **Size**: processkit roughly doubles the addon; acceptable, but PyO3 wheels will grow similarly if the core links it.
9. **Version coupling**: napi-rs 3.x is moving fast (14 minors seen; new `async-runtime` SPI); PyO3 minors break often; pin and review each bump.
10. **Evidence provenance**: sizes/timings are from one Intel Mac and Docker Desktop; CI timings and sizes will differ slightly (different rustc, linker, runners).

## Appendix — reproduce

- Local: `spikes/packaging/ci/{js-job,py-job}.sh` (see script headers; env `RT`, `TARGET`, `PYV`, `USE_DOCKER`, `DOCKER_NETWORK`,
  `CONTAINER_REGISTRY_HOST`, `DOCKER_PLATFORM`). Q8 only: `Q8_SCENARIO=a|b|c Q8_NATIVE=default|nodecp [Q8_SABOTAGE=1] [Q8_PK=stdwait] node smoke-q8.mjs`.
- CI after the billing fix: push any commit to `spike/packaging`, then `gh run list --branch spike/packaging`,
  `gh run watch <id> --exit-status`, and read the `summary` job (all `RESULT` lines, also in the step summary).

## Appendix — evidence ledger (LOCAL; selected lines, trimmed; full set in `spikes/packaging/evidence/local-results.txt`)

**Q1 — install without compiling, run, Deno flags**
```
RESULT Q1 installed target=darwin-x64 rt=node22 pm=npm packages=[hugr-omni-spike hugr-omni-spike-darwin-x64] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=2)
RESULT Q1 installed target=darwin-x64 rt=bun pm=bun packages=[hugr-omni-spike hugr-omni-spike-darwin-x64] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=2)
RESULT Q1 installed target=darwin-x64 rt=deno pm=deno packages=[hugr-omni-spike hugr-omni-spike-darwin-x64@0.0.0 hugr-omni-spike@0.0.0] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=5)
RESULT Q1 installed target=linux-x64-gnu rt=node22 pm=npm packages=[hugr-omni-spike hugr-omni-spike-linux-x64-gnu] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=2)
RESULT Q1 installed target=linux-x64-gnu rt=bun pm=bun packages=[hugr-omni-spike hugr-omni-spike-linux-x64-gnu] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=2)
RESULT Q1 installed target=linux-x64-gnu rt=deno pm=deno packages=[hugr-omni-spike hugr-omni-spike-linux-x64-gnu@0.0.0 hugr-omni-spike@0.0.0] scripts=none gyp=none tripwire=clean (CLEAN packages_checked=5)
RESULT Q1 toolchain target=linux-x64-gnu rt=node22 in_container=1 image=node:22-slim present=[]
RESULT Q1 toolchain target=linux-x64-gnu rt=node24 in_container=1 image=node:24-slim present=[]
RESULT Q1 toolchain target=linux-x64-gnu rt=bun in_container=1 image=oven/bun:latest present=[]
RESULT Q1 toolchain target=linux-x64-gnu rt=deno in_container=1 image=denoland/deno:latest present=[]
RESULT Q1 deno-permissions minimal_sets=[{--allow-env --allow-ffi}] chosen=[--allow-env --allow-ffi] verdict=OK deno 2.9.6 (stable, release, x86_64-apple-darwin)
RESULT Q1 deno-permissions minimal_sets=[{--allow-env --allow-ffi --allow-read} {--allow-env --allow-ffi --allow-sys}] chosen=[--allow-env --allow-ffi --allow-read] verdict=OK deno 2.9.7 (stable, release, x86_64-unknown-linux-gnu)
```

**Q2 — wheels, pip --only-binary and uv, CPython 3.10/3.14**
```
RESULT Q2 toolchain target=darwin-x64 py=3.10 in_container=0 image=host present=[gcc cc c++ g++ clang make cmake cargo rustc]
RESULT Q2 run target=darwin-x64 py=3.10 pm=pip status=ok wheel=hugr_omni_spike-0.0.0-cp310-abi3-macosx_10_12_x86_64.whl
RESULT Q2 run target=darwin-x64 py=3.10 pm=uv status=ok
RESULT Q2 test target=darwin-x64 py=3.10 status=ok pip_ms=1942 uv_ms=602
RESULT Q2 toolchain target=darwin-x64 py=3.14 in_container=0 image=host present=[gcc cc c++ g++ clang make cmake cargo rustc]
RESULT Q2 run target=darwin-x64 py=3.14 pm=pip status=ok wheel=hugr_omni_spike-0.0.0-cp310-abi3-macosx_10_12_x86_64.whl
RESULT Q2 run target=darwin-x64 py=3.14 pm=uv status=ok
RESULT Q2 test target=darwin-x64 py=3.14 status=ok pip_ms=1031 uv_ms=305
RESULT Q2 toolchain target=linux-x64-gnu py=3.10 in_container=1 image=python:3.10-slim present=[]
RESULT Q2 run target=linux-x64-gnu py=3.10 pm=pip status=ok wheel=hugr_omni_spike-0.0.0-cp310-abi3-manylinux_2_28_x86_64.whl
RESULT Q2 run target=linux-x64-gnu py=3.10 pm=uv status=ok
RESULT Q2 test target=linux-x64-gnu py=3.10 status=ok pip_ms=4067 uv_ms=1023
RESULT Q2 toolchain target=linux-x64-gnu py=3.14 in_container=1 image=python:3.14-slim present=[]
RESULT Q2 run target=linux-x64-gnu py=3.14 pm=pip status=ok wheel=hugr_omni_spike-0.0.0-cp310-abi3-manylinux_2_28_x86_64.whl
RESULT Q2 run target=linux-x64-gnu py=3.14 pm=uv status=ok
RESULT Q2 test target=linux-x64-gnu py=3.14 status=ok pip_ms=2636 uv_ms=1237
```

**Q6/Q7 — sizes, glibc floor, processkit impact**
```
RESULT Q6 node-binary variant=full target=darwin-x64 bytes=988864 gzip_bytes=533773 minos=10.12
RESULT Q6 node-binary variant=baseline target=darwin-x64 bytes=460080 gzip_bytes=227585 minos=10.12
RESULT Q6 node-binary variant=processkit-only target=darwin-x64 bytes=980632 gzip_bytes=529893 minos=10.12
RESULT Q6 node-binary variant=full target=linux-x64-gnu bytes=1098952 gzip_bytes=579182 glibc_floor=GLIBC_2.15 needed=[]
RESULT Q6 node-binary variant=baseline target=linux-x64-gnu bytes=517216 gzip_bytes=248064 glibc_floor=GLIBC_2.14 needed=[]
RESULT Q6 node-binary variant=processkit-only target=linux-x64-gnu bytes=1090760 gzip_bytes=575576 glibc_floor=GLIBC_2.15 needed=[]
RESULT Q6 node-binary variant=full target=linux-arm64-gnu bytes=1045488 gzip_bytes=556816 glibc_floor=GLIBC_2.17 needed=[]
RESULT Q6 node-binary variant=baseline target=linux-arm64-gnu bytes=484232 gzip_bytes=236465 glibc_floor=GLIBC_2.17 needed=[]
RESULT Q6 node-binary variant=processkit-only target=linux-arm64-gnu bytes=1037296 gzip_bytes=553018 glibc_floor=GLIBC_2.17 needed=[]
RESULT Q7 size-impact target=darwin-x64 baseline_bytes=460080 processkit_only_bytes=980632 processkit_delta_bytes=520552 factor=2.13 full_with_q8_bytes=988864
RESULT Q7 size-impact target=linux-x64-gnu baseline_bytes=517216 processkit_only_bytes=1090760 processkit_delta_bytes=573544 factor=2.11 full_with_q8_bytes=1098952
RESULT Q7 size-impact target=linux-arm64-gnu baseline_bytes=484232 processkit_only_bytes=1037296 processkit_delta_bytes=553064 factor=2.14 full_with_q8_bytes=1045488
RESULT Q6 wheel file=hugr_omni_spike-0.0.0-cp310-abi3-macosx_10_12_x86_64.whl bytes=270279
RESULT Q6 wheel file=hugr_omni_spike-0.0.0-cp310-abi3-manylinux_2_28_aarch64.whl bytes=294064
RESULT Q6 wheel file=hugr_omni_spike-0.0.0-cp310-abi3-manylinux_2_28_x86_64.whl bytes=303662
```

**Q7 — the packed addon runs a command (Node 22/24)**
```
RESULT Q1 run target=darwin-x64 rt=node22 script=q7 status=ok
RESULT Q1 run target=darwin-x64 rt=node24 script=q7 status=ok
RESULT Q1 run target=linux-x64-gnu rt=node22 script=q7 status=ok
RESULT Q1 run target=linux-x64-gnu rt=node24 script=q7 status=ok
```

**Q8 — calibration (positive control) and mitigation**
```
RESULT Q8 control target=darwin-x64 rt=node22 kernel_path=default detected=yes
RESULT Q8 control target=darwin-x64 rt=node24 kernel_path=default detected=yes
RESULT Q8 control target=darwin-x64 rt=bun kernel_path=default detected=yes
RESULT Q8 control target=darwin-x64 rt=deno kernel_path=default detected=yes
RESULT Q8 control target=linux-x64-gnu rt=node22 kernel_path=default detected=no note=linux-pidfd-path-does-not-use-SIGCHLD
RESULT Q8 control target=linux-x64-gnu rt=node22 kernel_path=signal detected=yes
RESULT Q8 control target=linux-x64-gnu rt=node24 kernel_path=default detected=no note=linux-pidfd-path-does-not-use-SIGCHLD
RESULT Q8 control target=linux-x64-gnu rt=node24 kernel_path=signal detected=yes
RESULT Q8 control target=linux-x64-gnu rt=bun kernel_path=default detected=no note=linux-pidfd-path-does-not-use-SIGCHLD
RESULT Q8 control target=linux-x64-gnu rt=bun kernel_path=signal detected=yes
RESULT Q8 control target=linux-x64-gnu rt=deno kernel_path=default detected=no note=linux-pidfd-path-does-not-use-SIGCHLD
RESULT Q8 control target=linux-x64-gnu rt=deno kernel_path=signal detected=yes
RESULT Q8 mitigation-survives-sabotage target=darwin-x64 rt=node22 kernel_path=default yes
RESULT Q8 mitigation-survives-sabotage target=darwin-x64 rt=bun kernel_path=default yes
```

**Q8 — Linux x64, SIGCHLD path (pidfd blocked), Node 22: processkit hangs, std-wait does not**
```
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=processkit scenario=a iterations=2/50 pk_waits=4 pk_hangs=3 native_hangs=0 aborted_early=true first_hang=i0:pk2 verdict=HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=processkit scenario=b iterations=4/50 pk_waits=4 pk_hangs=3 native_hangs=0 aborted_early=true first_hang=i1:pk verdict=HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=processkit scenario=c iterations=3/50 pk_waits=6 pk_hangs=5 native_hangs=0 aborted_early=true first_hang=i0:pkA verdict=HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=stdwait scenario=a iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=stdwait scenario=b iterations=50/50 pk_waits=50 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=signal pk_impl=stdwait scenario=c iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
```

**Q8 — no hangs on Linux x64 pidfd path and on macOS (Node 22 shown; every runtime is in the evidence file)**
```
RESULT Q8 target=darwin-x64 rt=node22 kernel_path=default pk_impl=processkit scenario=a iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=darwin-x64 rt=node22 kernel_path=default pk_impl=processkit scenario=b iterations=50/50 pk_waits=50 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=darwin-x64 rt=node22 kernel_path=default pk_impl=processkit scenario=c iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=default pk_impl=processkit scenario=a iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=default pk_impl=processkit scenario=b iterations=50/50 pk_waits=50 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
RESULT Q8 target=linux-x64-gnu rt=node22 kernel_path=default pk_impl=processkit scenario=c iterations=50/50 pk_waits=100 pk_hangs=0 native_hangs=0 aborted_early=false first_hang=none verdict=NO_HANG
```
