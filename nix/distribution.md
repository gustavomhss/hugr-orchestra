# Native distribution checkpoint — UNVALIDATED

<!-- NIX_BATCH_REQUEST_BEGIN -->
{"ready": false, "phase": "measure", "sourceParent": "92d41e6de02697519e38c0a620d6acac13fa933d", "measurementRun": null, "measurementAttempt": null}
<!-- NIX_BATCH_REQUEST_END -->

Consumer run `38055863264` on `92d41e6de02697519e38c0a620d6acac13fa933d` completed
all four native CLI/Desktop capture jobs successfully. Independent completion's
capture step failed, and its archival tail exceeded the existing 15-minute limit;
Relay cancelled only that already-failed tail. The four native artifacts remain
source-bound, but the run is cancelled and has no successful CI completion receipt.
The original completion oracle and all 26 finite controls passed in a separately
labelled local replay of the actual native evidence. Finite-record archiving now
preserves metadata/control bytes instead of dereferencing executable and nested
control fixtures; oracle execution and refusal logic are unchanged. Fresh source
measurement and its strict four-hash direct child must qualify this transport repair.
The inactive source checkpoint restores the exact pre-application hash blob; no
old measurement is relabelled as a new successful consumer run.

Historical request `7eb2bb766a80f130a8d0758f3337729237b9ea8a` had exact clean source
parent `1f4f2929b0153aa4f68757d9aee33d8f18f55589`. Its four-native measurement run
`37954180585` failed; no dependency hash or consumer acceptance was adopted.
This integration retains that request's ancestry but resets `ready: false`.
The final repaired source freeze must precede a fresh request-only direct child;
preserved ancestry permits a normal fast-forward of `nix-validation`, without
rewriting the published failed request or relaxing branch/source identity checks.

Fresh request `9c76824c5ce27849f42685dc3579e3201e6103af` had exact parent
`aec262940e6f86dbf55baf33ab7ebe7ccd91770f`. Run `37981869304` completed all four
native measurements and independent completion/control capture successfully.
Its status is `MEASUREMENT_ONLY_NOT_DISTRIBUTION`; the four candidate hashes have
not been applied. This integration preserves that request's ancestry and again
holds `ready: false`, so a later repaired-source request can fast-forward normally.
The new Core updater candidate changes a recorded package input; the successful
9c measurement cannot qualify a different fingerprint. Compare the actual final
source before the next capture/hash-only consumer checkpoint; never relabel artifacts.

Qualified request `d69abdf4834265f8b23fa6770907f98e2a7dc9d8`, parent
`791d7e1846588df03b64c3981fe105cea805d036`, measured all four systems successfully
in run `37989995766`. Its direct child `b208e93c6d` applied only those four hashes
and the verify request. Run `37991613494` failed before consumer builds: matching
measurement/provenance passed, but hash controls needed `d69^` and native checkout
depth 2 hid that real parent. The repair retains depth 3, preserves every control,
and is source-reviewed. Actual shallow reproduction failed before deepening and
resolved the exact qualified parent afterward; clean depth-3 replay with bytecode
disabled completed `HASH_CAPTURE_CONTROLS_OK` for the unchanged full control list.
The applied values are measured dependencies, not a consumer/product pass. This
integration retains failed-verification ancestry and holds the next request inactive
until a fresh source/root-bound capture can precede its strict hash-only child.
The retry source restores the exact pre-application stale hash fields rather than
retaining an unqualified consumer checkpoint. Fresh updater measurement remains
independent (`fakeHash`); its next real four-value application will be an actual
hash-only change. This does not guess or alter any measured candidate.

Source contract: `b1cad41dc515eec9dcf474c413da853061894ac1`, containing reviewed
producer `374da1e154`; prior producer evidence is Actions `37875718504`. That
evidence is not rerun here and does not certify Nix builds.

Historical human-authorized cadence: “NO tests/typechecks/mutations/CI/smoke/builds now;
prepare runnable validation and measurement capture only, single integrated batch
after W6+Nix ready.” No local Nix, installer, daemon or global software was used.
Consumer verification and output qualification below remain **unexecuted**.
Repair `5f7e3b0c7c` passed offline replay/negative-control conformance against the
actual failed Linux artifacts; that is parser evidence, not native measurement
acceptance. Changed package inputs require a new four-native capture.

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
# Inside the prepared native Actions worker, after its real API fetch/download:
export MEASUREMENT_RUN_ID="$MEASUREMENT_RUN"
export MEASUREMENT_RUN_ATTEMPT="$MEASUREMENT_ATTEMPT"
export MEASUREMENT_PROVENANCE_DIR="$RUNNER_TEMP/measurement-provenance-$system"
bash nix/check-distribution.sh verify "$system" "$revision" \
  "$RUNNER_TEMP/nix-verify-$system" \
  "$MEASUREMENT_PROVENANCE_DIR/workers/nix-distribution-measure-$MEASUREMENT_RUN_ID-$MEASUREMENT_RUN_ATTEMPT-$system"
```

Verification requires real Actions context because the unchanged toolchain gate
binds evidence to actual run/attempt/SHA; do not fabricate GITHUB_* identities.
`nix-distribution.yml` now has a concrete premerge bootstrap: a push to exactly
`nix-validation`, changing exactly the request-bearing `nix/distribution.md`.
The prepare job rejects an inactive request before installing Nix. The request
must name its actual commit parent, and its commit may change only this document
(measurement) or this document plus `nix/hashes.json` (verification).

After readiness, the lead creates `nix-validation` at the final integrated source
SHA. Set the marked JSON to `ready: true`, `phase: "measure"`, `sourceParent` equal
to that known parent SHA, and null measurement IDs; commit only this document
without `[skip ci]`, then push `fork nix-validation`. This registers/runs the new
workflow from the pushed branch, without a separate workflow PR/default-branch
merge. Ordinary `nix-closure` source pushes cannot trigger it. A branch-only
`gh workflow run` is still not a bootstrap route.

After the selected measurement attempt and independent completion both succeed,
the lead applies the four measured hashes and updates the request to
`phase: "verify"`, its exact real `measurementRun`/`measurementAttempt`, and
`sourceParent` equal to the measurement source SHA. Commit both owned files in
one direct-child checkpoint without `[skip ci]`; push the same branch. One final
milestone PR remains lead-owned. Later manual dispatch is usable only after
default-branch registration, and must match the committed ready request.

Verification first fetches the selected attempt, latest run, actual workflow
identity, repository, Git commit/tree, attempt-specific jobs, artifact metadata
and compare API from GitHub. It requires completed/success, exact workflow
ID/path, repository/head/attempt and successful independent completion receipt
plus its full control records. All native worker artifacts are metadata-bound to
that run/head. Candidate revision/tree/system and dependency identity must agree
with those API facts, captured inputs and current inputs; relabelling cannot
qualify. Only one direct-child hash/request change is accepted after measurement.
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
version, packaged Electron `createRequire` resolution of the actual platform
node-pty package from `app.asar/out/main/index.js`, its real `spawn` export and
loaded native binding, supplemental native-addon loading, Linux desktop
identity/resources and Darwin app identity. It captures direct and recursive
runtime references, per-command exit/log/wall time and source revision/tree.

Output teeth mutate one **copy of the real produced CLI**: empty artifacts,
wrong version/target, changed bytes, invalid image header and wrong CPU with valid
recomputed digests, then restoration. Real production consumer and output checker must reject each
named defect. Positive/restored real copies must pass. No production output is
mutated. These controls have not run.

Completion requires exact native job/artifact sets, explicitly named prepare /
completion roles, and the full immutable output ledger declared in
`probe-distribution.ts`. Structured verdicts must match each declared failure;
generic setup errors and positive-only subsets do not qualify. PTY controls repack
one real archive in a private fixture, separately removing the required binding
and breaking its actual package entrypoint, with unchanged/restored positives.

Completion/provenance teeth are declared in `probe-distribution-completion.py`:
empty/extra/duplicate/unknown lanes and artifacts, wrong workflow/head/attempt,
failed or cancelled measurement, failed independent completion, relabelled
candidate/capture, positive-only control subsets, negative setup failures and
non-hash checkpoint changes. They invoke the actual parser on copies of real
captured evidence. All controls remain unexecuted until the combined batch.

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
