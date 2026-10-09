# Native distribution checkpoint — UNVALIDATED

Source contract: `b1cad41dc515eec9dcf474c413da853061894ac1`, containing reviewed
producer `374da1e154`; prior producer evidence is Actions `37875718504`. That
evidence is not rerun here and does not certify Nix builds.

Human-authorized deferral: “NO tests/typechecks/mutations/CI/smoke/builds now;
prepare runnable validation and measurement capture only, single integrated batch
after W6+Nix ready.” No local Nix, installer, daemon or global software was used.
All new commands, output checks and controls below are **unexecuted**.

## Implemented contract

- Locked Nixpkgs is unchanged. `flake.nix` explicitly supplies local Bun 1.3.14
  and Electron 42.3.3 to consumers and exports both for capture. Node 24 supports
  Desktop's current build toolchain. The overlay follows the same wiring.
- Dependency filters are the transitive workspace dependency/dev/optional graph
  rooted at modern CLI, Orchestra's Node server, Desktop and App. All package
  trees (including Core, Schema, Protocol, Client, Server, Relay, SDK, TUI,
  toolkit/specialist skill data) remain in the clean-source fileset. Root
  `bunfig.toml`, `tsconfig.json`, lock, catalog/patch manifests and TEAM_MEMBERS
  are explicit inputs. The new producer `.c` is included through `packages/`.
- Every existing `nix/hashes.json` value is retained and **stale / measurement
  pending**. No hash is invented. Only `node_modules_updater` uses `fakeHash`.
  Toolchain ZIP hashes retain their prior independent measurement records.
- CLI calls the modern builder with one explicit native target and
  `--skip-install`. It preseeds Bun's exact native target/version fallback name
  with the already provisioned executable. No target ZIP download is needed.
- Linux patches emitted interpreter/RPATH before export. Darwin supplies
  `stdenv` compiler, `apple-sdk.sdkroot` headers/libSystem stubs, SDKROOT,
  LIBRARY_PATH and codesign. Bun 1.3.14 FFI source explicitly consumes SDKROOT
  and LIBRARY_PATH. Darwin shim's fixed-signature C entry remains unchanged.
- Reviewed exporter creates a fresh schema-1 raw tree at
  `$out/share/orchestra/cli`. `$out/bin/orchestra` is a separate binary wrapper.
  Strip/ELF fixups do not rewrite published bytes. Authoritative schema comes
  from `packages/cli/script/schema.ts` / Core `Config.Info`; install check
  regenerates and compares it. Modern completions use `--completions bash|zsh`.
- Desktop sets `ORCHESTRA_CLI_PREBUILT_DIR` to that raw tree. Production prebuild
  admits/version-checks/signs resources through existing consumer code; no CLI
  compiler fallback. Local electron-builder uses custom `.dist`, explicit native
  arch and Electron version, with rebuilds, notarization and publishing disabled.
  Ordinary derivations run sandboxed, not as network-capable dependency fetchers.
- Linux installs and launches the packaged Electron copy, preserving native
  `process.resourcesPath` for **all** extraResources. Darwin preserves
  `Applications/HuGR Orchestra.app/Contents/Resources`. Desktop wrapper supplies
  ripgrep and native sysctl where needed. Linux addon repair targets only
  `app.asar.unpacked`; post-fixup install check re-admits packaged CLI digests.

| System | Target | Native runner label |
| --- | --- | --- |
| x86_64-linux | linux-x64-baseline | ubuntu-24.04 |
| aarch64-linux | linux-arm64 | ubuntu-24.04-arm |
| x86_64-darwin | darwin-x64-baseline | macos-15-intel |
| aarch64-darwin | darwin-arm64 | macos-15 |

These are declared lanes, not build evidence. Intel Darwin remains explicit;
baseline does not certify arbitrary x64 CPUs or Rosetta.

## One lead-owned integrated batch, after W6 + Nix are ready

Freeze one committed source revision including final manifests. On each matching
native runner, the measurement half is:

```bash
system=x86_64-linux # use that runner's exact system from the table
revision=$(git rev-parse HEAD)
bash nix/check-distribution.sh measure "$system" "$revision" \
  "$RUNNER_TEMP/nix-measure-$system"
```

The script evaluates all declared consumers and the CLI default dependency
argument, captures workspace/source/toolchain inputs, then runs exactly:

```bash
nix build --no-write-lock-file --no-update-lock-file --option sandbox true \
  --no-link --print-build-logs ".#packages.$system.node_modules_updater"
```

Expected nonzero result must name the exact updater derivation and recursive
SHA-256 `got:` SRI **after** frozen install, both nonempty normalization receipts
and final dependency-install receipt. Generic failures/empty outputs are blockers.
`candidate.json` is measurement data, never an automatic source rewrite.

Collect all native candidates. Lead reviews and applies only each matching
`nodeModules.<system>` field, commits that measurement checkpoint, then continues
the same integrated batch's verification half on the new exact revision:

```bash
revision=$(git rev-parse HEAD)
bash nix/check-distribution.sh verify "$system" "$revision" \
  "$RUNNER_TEMP/nix-verify-$system" "$RUNNER_TEMP/nix-measure-$system"
```

Verification requires real Actions context because existing toolchain gate binds
evidence to actual run/attempt/SHA; do not fabricate GITHUB_* identities. The
prepared manual-only `nix-distribution.yml` supplies that context and downloads
measurement evidence from the selected real run/attempt. Do not dispatch yet.
For pre-merge qualification, the lead must invoke these scripts from a real
native Actions harness, or make the new dispatch workflow available where GitHub
accepts it. A branch-only workflow file is not dispatch/runner evidence; GitHub's
`workflow_dispatch` registration requires the workflow on the default branch.
Dependency fingerprints must match measurement; hashes alone cannot mask changed
package source/data, lock/manifests, patches, toolchain, normalization or filter
recipes. Exact consumer command is:

```bash
nix build --no-write-lock-file --no-update-lock-file --option sandbox true \
  --no-link --print-out-paths --print-build-logs \
  ".#packages.$system.orchestra" ".#packages.$system.orchestra-desktop"
```

The same verification invocation runs the unchanged toolchain gate and its native
reach/hash/source controls, then real CLI/Desktop checks: manifest admission,
raw and wrapped version, ELF/Mach-O CPU, schema/completions, packaged Electron
version, actual Electron loading of a nonempty native-addon list, Linux desktop
identity/resources and Darwin app identity. It captures direct and recursive
runtime references, per-command exit/log/wall time and source revision/tree.

Output teeth mutate one **copy of the real produced CLI**: empty artifacts,
wrong version/target, changed bytes, invalid image header and wrong CPU with valid
recomputed digests, then restoration. Real production consumer and output checker must reject each
named defect. Positive/restored real copies must pass. No production output is
mutated. These controls have not run.

Completion teeth replay real current-run evidence, then separately remove job /
artifact lists, skip a native job, alter run/worker SHA or native system, and mark
a worker failed. The unchanged replay must pass; each defect must fail with its
named evidence error. The manual workflow invokes these controls after collection.

`probe-dependency-measurement.py`, wired into that same verification batch,
prepares hash-capture negative controls: replay real updater evidence
unchanged; replace stderr with a generic failure; remove each normalization or
install receipt; set exit to zero; name another derivation. Invoke the actual
`dependency_measurement.py capture` on separate evidence copies. Only unchanged
real evidence may produce a candidate. No hash probe edits committed hash fields.

## Remaining closure evidence / blockers

- Four dependency measurements and approved hash checkpoint remain missing.
- Native sandbox builds, emitted CLI interpreter/library closure, desktop
  resource inclusion and Electron/addon ABI loading remain unproved. A missing
  native dependency or incompatible prebuilt addon is a build blocker to fix at
  its actual source; no blanket missing-library ignore or rebuild/download escape.
- Native producer semantics are already reviewed within a controlled build-owned
  namespace. Arbitrary malicious same-UID namespace mutation is excluded by
  `PRODUCER-BOUNDARY.md`; packaging does not invent stronger guarantees.
- Full GUI startup, PTY operations, provider consent/authenticated health, native
  platform product harnesses and final exact-head epic qualification remain W6 /
  lead-owned. Loader checks are not those product proofs. Cold review is pending.

## Framing corrections and scheduling incident

The earlier W5 document correctly reported its old baseline, but waiting for a
future artifact API/schema is now wrong: the reviewed producer and Core schema
generator are present. Old legacy build paths, Electron 41, yargs completions and
the Electron-toolchain Linux resource root are not current consumer contracts.
Evaluation on one host cannot replace native four-lane builds.

First source checkpoint `7b30fa6ac8` unintentionally triggered the existing
push-triggered `nix-toolchain` workflow, Actions `37880278652`. Cancellation was
requested; final run is cancelled, but prepare and Linux toolchain jobs completed
first. This violated the deferred scheduling order. It is **not accepted Nix
distribution evidence**; no new hash measurement or consumer-build result is
claimed from it. Later prep commits carry `[skip ci]`, preserving workflow/gate
code while honoring the owner's no-CI order. No manual validation is run here.
