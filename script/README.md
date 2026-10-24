# Repository tooling

Root tooling owns CI requests, repository-wide checks and maintenance commands. It is not product runtime. Run tools from the repository root unless a command states another directory.

## Monolith baseline inventory

```sh
bun script/monolith-inventory.ts
bun script/monolith-inventory.ts /absolute/checkout <revision>
```

The CLI reads immutable Git objects at the requested revision (`HEAD` by default), ignoring replacement refs. It prints a JSON receipt containing source revision/tree, producer hash and fingerprint. Store receipts outside the source tree.

The capture includes:

- Bun workspace declarations, nested SDK/Node binding and Atlas npm workspace.
- Cargo member and QA manifests, explicit binary/library declarations.
- Public manifest entries, conditional imports, dependency declarations and file pins.
- Manifestless package assets, including hidden files and meaningful `dist`/`target` payloads.
- Lockfiles, declared patches and vendor files referenced by both roots and members.

The receipt qualifies syntax and declaration shape only. It does not prove Cargo resolution, import reachability, runtime behavior, installed ABI or packaged-version rollback. The library's revision-less mode captures a labelled working tree and rejects observed input/discovery drift.

## Verification

The baseline cases below are recorded coverage for the final bundle. During restructuring, the owner permits only focused checks in changed areas, without repeated passing runs; CI executes once after all deliveries. Follow `AGENTS.md` for the guarded local-test entrypoint.

```sh
bun run test:ci core test/monolith-inventory.test.ts test/monolith-inventory-source.test.ts test/process/process.test.ts --os both
```

The historical baseline included a process witness for Core's Omni positive control. A focused non-process test uses the declared control scope rather than adding unrelated process suites. The source suite verifies immutable blobs, replacement-ref resistance and revision/tree binding using a real isolated Git repository.

Package typechecks run from `packages/core` with `bun typecheck`. The baseline does not move product folders, modify runtime APIs or retire compatibility implementations.

## Module identity resolution

`@orchestra/script/module-resolver` resolves declarations from a captured inventory without scanning it again:

```ts
import { ModuleResolver } from "@orchestra/script/module-resolver"

const modules = ModuleResolver.make(inventory.modules, {
  core: { kind: "bun", name: "@orchestra/core", scope: "." },
  "sdk/js": { kind: "bun", name: "@orchestra/sdk", scope: "." },
})
const core = modules.resolve("core")
const sdk = modules.resolve({ kind: "bun", name: "@orchestra/sdk" })
```

Canonical names and caller-registered legacy aliases return the original declaration, including its captured `path`, `manifest`, exports, and scripts. Aliases support string and object selectors; explicit kind/scope must agree with the registered declaration. Alias targets are canonical identities, so registrations never chain through another alias. A folder move changes captured paths rather than the package name. Optional scope selects a particular workspace when names are shared; it is the captured workspace path, not a permanent semantic ID.

An empty inventory, invalid selector, duplicate identity, missing target, ambiguous match, or stale alias fails explicitly. Every alias is checked at construction, including unused registrations. Source directory names are not guessed from selectors. Manifestless assets retain their separate inventory surface; this resolver consumes Bun/npm/Cargo manifest declarations.

During restructuring, verification is limited to the new focused cases and package-local typecheck. Passing cases are recorded and reused; CI runs once on the final composed bundle after all deliveries. The focused resolver cases live in `packages/script/test/module-resolver.test.ts`.

## Source workspace paths

`@orchestra/script/workspace-paths` discovers the physical source root from its root manifest and `script/module-registry.json`. `WorkspacePaths.make(start)` validates a snapshot of registered package manifests and returns absolute paths through `module(aliasOrName)`, `domain("omni" | "atlas")`, and `entries`. A relocated module changes its registered path, not its identity. Paths and manifests must remain physically inside the source root.

`script/toolchain-registry.json` identifies Cargo Omni and npm Atlas separately from the Bun registry. In particular, `domain("omni")` is the native source root; `module("hugr-omni")` is its Node binding package. These checks validate paths and manifest identity, not Cargo dependency resolution.

Importing the path helper or tree-sitter admission module does not discover a workspace. Source build operations perform discovery when called; packaged admission continues to use installed resource paths. Desktop staging, Electron packaging, CLI grammar preparation, and Script version/team readers use the registered source locations.

From `apps/desktop`, `bun typecheck tsconfig.packaging.json` checks the packaging scripts and Electron configurations listed in that config. It does not check unrelated GUI proof scripts.

Nix generates its bootstrap alias config outside the checkout:

```sh
bun --no-install nix/scripts/workspace-config.ts --source /absolute/checkout --out /absolute/evidence/workspace-paths.json
```

The config has an absolute source base and registered Script/Core mappings. `nix/check-distribution.sh` passes the same config to both native output oracles and their children. The dependency fingerprint includes both registries, registered module paths, and toolchain/domain paths; missing registered manifests fail explicitly. Native Nix execution and output controls remain part of final qualification.

## Portable recovery bundles

`script/archive-inventory.ts` captures immutable Git metadata for the selected scopes. `script/recovery-bundle.ts` adds payload capture and restoration:

```ts
import { createRecoveryBundle, restoreRecoveryBundle } from "./script/recovery-bundle.ts"

const manifest = await createRecoveryBundle("/absolute/checkout", "<commit>", "/absolute/retained/bundle")
await restoreRecoveryBundle("/absolute/retained/bundle", "/absolute/restored-source")
```

The directory format is `manifest.json`, `manifest.sha256`, and deduplicated raw `blobs/<sha256>`. The manifest records commit/tree, scope ownership/readers/disposition, and each member's path, executable mode, Git blob ID, size, and content SHA-256. Git blob provenance and content SHA-256 are distinct and both are checked against payload bytes.

Creation reads immutable Git blobs sequentially without replacement refs and publishes the manifest checksum after payload writes. Output must be a new or empty owned directory outside the source. Restoration validates the complete declared member list, checksums, payloads, modes, and physical input ownership before creating output. It refuses extra/missing/corrupt entries, unsafe or overlapping paths, nonempty destinations, and destinations inside any Git checkout. It restores source bytes and modes; it does not extract retained archives or restore live application stores.

Creation and restoration claim existing empty slots before private staging, verify the claimed identity, and publish with the OS's atomic no-replace operation. A later-created slot, including an empty directory, aborts publication and remains untouched; concurrent disjoint restores cannot merge their trees. Restored members use exclusive placeholders and pinned file handles; directory identities and the destination filesystem detect aliases. Portable names exclude Windows-forbidden characters and NFC/case-equivalent member or scope names. Darwin uses `renameatx_np(RENAME_EXCL)`, Linux uses `renameat2(RENAME_NOREPLACE)`, and Windows uses `MoveFileW`; unsupported publication primitives fail without an overwrite fallback.

Retention of the output is what makes this a recovery copy. Creation alone does not establish durable storage or authorize source removal. Scope dispositions and reader uncertainty remain in the manifest for subsequent review.

Owner-retained copies and measured recovery receipts are indexed in [docs/archives](../docs/archives/README.md).
