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

Canonical names and caller-registered legacy aliases return the original declaration, including its captured `path`, `manifest`, exports, and scripts. A folder move changes those captured paths rather than the package name. Optional scope selects a particular workspace when names are shared; it is the captured workspace path, not a permanent semantic ID.

An empty inventory, invalid selector, duplicate identity, missing target, ambiguous match, or stale alias fails explicitly. Every alias is checked at construction, including unused registrations. Source directory names are not guessed from selectors. Manifestless assets retain their separate inventory surface; this resolver consumes Bun/npm/Cargo manifest declarations.

During restructuring, verification is limited to the new focused cases and package-local typecheck. Passing cases are recorded and reused; CI runs once on the final composed bundle after all deliveries. The focused resolver cases live in `packages/script/test/module-resolver.test.ts`.
