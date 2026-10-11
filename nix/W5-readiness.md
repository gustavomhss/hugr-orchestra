# W5: preparation only

> Historical inspection retained below. Current source base is
> `b1cad41dc515eec9dcf474c413da853061894ac1`; the reviewed producer now exists
> (`374da1e154`, prior native evidence `37875718504`). Current Nix consumer
> wiring is **UNVALIDATED**, and the four existing dependency hashes are stale,
> measurement pending. The legacy paths/schema/staging blockers below describe
> the old baseline, not current code. Follow `distribution.md` for the deferred
> W6+Nix integrated batch. Human instruction: “NO tests/typechecks/mutations/CI/
> smoke/builds now; prepare runnable validation and measurement capture only”.

Inspection baseline: `ca74f6d0fe08b394fa56efc30d1f333b008dd3e8`, branch
`nix-closure`. Authority: `specs/orchestra-visual/RELAY-NEXT.md`, W5 and External
ownership. Maestro's `runtime-closure` checkpoint `51933f244f` plus dirty metadata
is **not** an accepted final input. This document does not certify a Nix closure.

## Actual verification

`nix --version` exited 127: `zsh:1: command not found: nix`.
No Nix evaluation, build, install check, output-contract check or mutation probe
has run here. No installer, daemon or global configuration was changed. Native
coverage remains unverified for all four declared systems below. Bun tests and
heavy suites were not run.

Two bounded derivation changes do not depend on new hashes or an artifact API:

- `orchestra.nix` defaults to the existing `./node_modules.nix`, not the nonexistent
  `./node-modules.nix`. Flake callers already pass the dependency explicitly, so
  their evaluation would not catch the broken default.
- `desktop.nix` runs `./node_modules/.bin/electron-builder`, the declared local
  build dependency, instead of `npx`, which can fetch when the executable is absent.
  A missing installed executable now fails the shell command. This only constrains
  builder lookup; it does not prove that packaging hooks cannot fetch elsewhere.

These edits remain uncompiled until a Nix-equipped runner performs the checks.

## Derivation input/output contract at the inspected baseline

| Derivation | Real inputs and behavior | Outputs |
| --- | --- | --- |
| `node_modules` | Clean-source intersection of `packages/`, `bun.lock`, root `package.json`, `patches/`, `.github/TEAM_MEMBERS`. Target-specific Bun CPU/OS; frozen install filtered to orchestra, desktop and app; scripts ignored; both Nix normalization scripts execute. | Recursive fixed-output directory containing copied `node_modules` directories, including workspace dependency links. |
| `orchestra` | Same source/version and dependency output; Nixpkgs Bun, Node, `models-dev`; `MODELS_DEV_API_JSON=${models-dev}/dist/_api.json`, explicit `ORCHESTRA_VERSION`, channel `prod`, models fetch disabled. Executes `packages/orchestra/script/build.ts --single --skip-install`, then `script/schema.ts schema.json`. | Wrapped `$out/bin/orchestra`, `$out/share/orchestra/schema.json`, bash/zsh completions when build platform can execute host. PATH supplies ripgrep and Darwin sysctl. Existing version install check enabled. |
| `orchestra-desktop` | Inherits orchestra source/version/dependencies/patches/environment, **not its compiled CLI output**. Copies Nixpkgs Electron distribution to temporary HOME, installs dependencies, runs desktop `build` with its `prebuild`, then local electron-builder `--dir`. | Linux: Electron wrapper at `$out/bin/orchestra-desktop`, unpacked resources under `$out/opt/orchestra-desktop/resources`, icons/metainfo/desktop item. Darwin: `$out/Applications/HuGR Orchestra.app` and executable wrapper. No existing desktop install check. |

`flake.nix` declares `orchestra`, `orchestra-desktop`, default alias `orchestra`,
and `node_modules_updater` for:

| Nix system | Bun native target | Current CLI build directory | Required runner |
| --- | --- | --- | --- |
| `x86_64-linux` | linux/x64, GNU | `packages/orchestra/dist/orchestra-linux-x64/bin/orchestra` | native x86_64 Linux |
| `aarch64-linux` | linux/arm64, GNU | `packages/orchestra/dist/orchestra-linux-arm64/bin/orchestra` | native aarch64 Linux |
| `x86_64-darwin` | darwin/x64 | `packages/orchestra/dist/orchestra-darwin-x64/bin/orchestra` | native x86_64 Darwin |
| `aarch64-darwin` | darwin/arm64 | `packages/orchestra/dist/orchestra-darwin-arm64/bin/orchestra` | native aarch64 Darwin |

These are declared targets, not proven supported builds. `--single` selects
`process.platform/process.arch`; it is not a cross-build interface. No Windows,
musl or x64-baseline Nix output is declared. Building every system's derivation
path on one Linux runner is not native build coverage.

## Sourced blockers and owner boundaries

1. **Native CLI staging is missing.** `desktop.nix` never copies `${orchestra}`
   into desktop resources. `packages/desktop/scripts/prebuild.ts` builds the Node
   server; only `dev` calls `downloadCliToResources`. The latter installs
   `@opencode-ai/cli-*` at `0.0.0-next-16350` and copies `opencode2` into
   `resources/orchestra-cli` (`scripts/utils.ts`). The current production
   electron-builder configuration only adds those CLI resources for `dev`
   (`electron-builder.config.ts:83-91`). `src/main/background-cli.ts` resolves
   packaged `process.resourcesPath/orchestra-cli`. Merely copying today's CLI
   into the source resources would still omit it in the prod package. Maestro
   owns the replacement producer, resource inclusion, bootstrap and runtime
   consumer. `packages/desktop/electron-builder.config.test.ts:128-143` currently
   asserts that beta/prod do not bundle the CLI; Maestro must reconcile that
   expectation with the final production resource contract. Nix must consume the
   final same-tree contract, not invent one.
2. **Electron version/ABI drift.** `desktop.nix` requests `electron_41`, while
   desktop `package.json` declares `electron: 42.3.3`. The locked Nixpkgs revision
   is `9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89`. Resolve availability and native
   addon compatibility on the final manifests; do not silently substitute 41 for
   42 or update the shared lock file here. Native resources include `native/`
   addon/Swift outputs, but `desktop.nix` has no explicit native build phase or
   Swift toolchain. Establish which final runtime resources each target requires.
   `packages/relay/test/node.test.ts` exercises a real Node bundle and requires
   Node >=22.16; its header identifies Electron 42.3.3/Node 24.15.0. That test is
   relevant source evidence, not proof of the Nix Electron runtime or closure.
3. **Config schema datasource.** `script/schema.ts` imports current `Config` but
   writes `ConfigV1.Info` from Core v1. Nix publishes exactly that output as
   `share/orchestra/schema.json`. Maestro/lead must decide the authoritative
   schema; packaging must not relabel a V1 schema as current V2. Source config
   readers use `orchestra.json[c]`, `.orchestra` and `ORCHESTRA_CONFIG*` controls.
4. **Identity.** Executables are `orchestra` and `orchestra-desktop`; prod desktop
   id is `ai.hugr.orchestra`, product `HuGR Orchestra`, scheme `orchestra`.
   electron-builder sets `publish: null`; keep it, including prevention of remote
   feed inference. Nix CLI metadata and desktop manifest still name
   `https://opencode.ai`; generated metainfo also names upstream issue/repo URLs.
   Lead supplies approved Orchestra homepage/support identity, not a guessed URL.
   Explicit Nix `ORCHESTRA_VERSION` bypasses `@orchestra/script`'s npm latest
   lookup; retain it. Do not introduce npm release queries as version sources.
5. **CI only evaluates.** `.github/workflows/nix-eval.yml` requires `orchestra`
   but optionally probes `desktop`, an attribute the flake does not export.
   Warning-only failure is not desktop coverage. Flake checks are not currently
   exported. Nix build contracts must become required jobs after real runs.
6. **Source closure must be re-established.** The present fileset omits everything
   outside its enumerated roots. Final Maestro resources/manifests outside those
   roots must be explicitly included by their actual paths. Keep the clean-source
   intersection and source/runtime layer boundaries. Do not widen to the entire
   repository to hide missing inputs. Preserve native Root placement/security
   constraints and Location/Session ownership; no runtime code changes belong here.

## Exact final inputs required before hashes or CLI wiring

Maestro/lead must deliver one finalized commit/tree, with no untracked/dirty
release inputs, containing:

- Root `package.json` catalogs/patch declarations, `bun.lock`, every participating
  workspace manifest (including transitive runtime/build workspaces), and actual
  files in `patches/`.
- Final CLI producer/entrypoint/build command and native per-system artifact tree:
  executable basename, target selection, accompanying files, version/channel
  semantics, native modules/shared libraries and whether the artifact is wrapped
  or raw. Today's paths above are observations, not the future API.
- Final desktop prebuild/resource inclusion/bootstrap contract and packaged
  resource location consumed by background CLI, including production channel.
- Final Node server bundle inputs/externals, Electron version/ABI, required PTY,
  addon/Swift/Linux helper resources, and exact build commands/dependencies for
  Linux and Darwin. No upstream binary fallback or unowned npm release query.
- Authoritative schema generator/config source; approved product/homepage/support
  identity; models snapshot source and offline build policy.
- Confirmed source paths for playbooks/backend skills/icons/native/runtime data,
  plus any additional roots the filtered fileset must retain.
- Native runner availability for each declared system, or an explicit owner
  decision narrowing supported targets. Evaluation alone cannot approve one.

W5 owns the four recursive `nodeModules` hashes in `nix/hashes.json`. Nixpkgs
revision/NAR hash in shared `flake.lock` belongs to the lead. `models-dev` and
Electron dependencies currently come from that locked Nixpkgs tree. CLI/desktop
are ordinary derivations, not fixed-output release downloads; their store paths
are not extra guessed fields in `hashes.json`.

## Final hash and build procedure (not executed)

On each matching native runner, use the **same final tree**, Nixpkgs lock, Bun
version, filters, normalization scripts and completed source/artifact wiring.
For example, for `system=x86_64-linux`:

```sh
nix --version
nix eval --raw .#packages.x86_64-linux.orchestra.drvPath
nix eval --raw .#packages.x86_64-linux.orchestra-desktop.drvPath
nix build --no-link --print-build-logs .#packages.x86_64-linux.node_modules_updater
```

Also evaluate the CLI's default dependency argument, which flake callers mask:

```sh
nix eval --impure --raw --expr '
  let
    flake = builtins.getFlake (toString ./.);
    pkgs = flake.inputs.nixpkgs.legacyPackages.x86_64-linux;
  in (pkgs.callPackage ./nix/orchestra.nix {}).drvPath
'
```

Run the expression on the clean finalized checkout. Negative control: temporarily
restore `./node-modules.nix` in that checkout and confirm this command fails on
that path, then restore the actual filename. This tests the real default branch,
not a copied expression or a stub derivation. It has not run here.

The updater intentionally uses `lib.fakeHash`. Accept its reported `got:` SRI
hash only when the failure is specifically the output hash mismatch for
`orchestra-node_modules`, after successful frozen install and both normalization
scripts. Missing source, install/script failures, empty output, inability to build
the platform, or a mismatched derivation name are named blockers, not hash data.
Record the complete command/log/exit and final tree SHA. Never copy another
system's hash or reuse one from the unfinished peer tree. Update only the matching
`nodeModules.<system>` entry, then build both packages with the real hashes:

```sh
nix build --no-link --print-build-logs \
  .#packages.x86_64-linux.orchestra \
  .#packages.x86_64-linux.orchestra-desktop
```

Repeat for the other native systems. Record per-target output store paths and
runtime references (`nix-store --query --references STORE_PATH` and
`nix path-info --recursive STORE_PATH`). Missing native runner is BLOCKED, not
successful evaluation. Changes to dependency closure/normalization/lock require
fresh dependency hashes and rebuilds; unrelated ordinary source changes still
require final package builds even when the fixed dependency output is unchanged.

Build-contract acceptance must exercise the real outputs: installed CLI version
and config schema, required completions on executable targets; Linux launcher,
archive/unpacked resources/metainfo/icons; Darwin app identity/launcher/resources;
and the final packaged native Orchestra CLI at Maestro's final resource path,
with expected version and architecture. Validate required native dependencies
against the actual artifacts, not a duplicated manifest in a test. A JSON schema
that merely parses is not proof of current Config correspondence. Test the real
generator/output against the approved authoritative schema.

## Exact lead-owned evaluation workflow patch proposal

Gate category: **repair + extension**. Make the actual desktop attribute required;
remove the warning-only nonexistent-attribute lane. Apply only after verifying
the candidate workflow and its negative controls on a Nix-equipped runner.

```diff
--- a/.github/workflows/nix-eval.yml
+++ b/.github/workflows/nix-eval.yml
@@
-          PACKAGES="orchestra"
-          # TODO: move 'desktop' to PACKAGES when #11755 is fixed
-          OPTIONAL_PACKAGES="desktop"
+          PACKAGES="orchestra orchestra-desktop"
+          test -n "$SYSTEMS" || { echo "::error::EMPTY_SYSTEMS"; exit 1; }
+          test -n "$PACKAGES" || { echo "::error::EMPTY_PACKAGES"; exit 1; }
@@
-          echo ""
-          echo "=== Evaluating optional packages ==="
-          for system in $SYSTEMS; do
-            echo ""
-            echo "--- $system ---"
-            for pkg in $OPTIONAL_PACKAGES; do
-              printf "  %s: " "$pkg"
-              if output=$(nix eval ".#packages.$system.$pkg.drvPath" --raw 2>&1); then
-                echo "✓"
-              else
-                echo "✗"
-                echo "::warning::Evaluation failed for packages.$system.$pkg"
-                echo "$output"
-              fi
-            done
-          done
-
```

This patch is evaluation-only. Negative controls required on the real candidate:
remove `orchestra-desktop` from flake exports (required eval must fail naming its
attribute), set each list empty (named failure), and omit a derivation source
input (eval/build must fail, never skip). Restore and run the real positive case.
Missing flake/output/command already causes a nonzero Nix command in the required
lane. Zero probes, skipped jobs or warning-only failures cannot be accepted.
These controls have **not** run locally.

The lead must then add required **native build** jobs using the two-package
`nix build` command above with each matrix system's real value, native runner
mapping, and final output-contract assertions. Matrix/runner labels and final
CLI assertions cannot be specified honestly until the owner supplies native
runner availability and Maestro's artifact contract. Do not call the evaluation
workflow a build gate or publish a placeholder green build job.
