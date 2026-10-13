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

Tests run on GitHub Actions through the snapshot uploader; local test execution remains disabled.

```sh
bun run test:ci core test/monolith-inventory.test.ts test/monolith-inventory-source.test.ts test/process/process.test.ts --os both
```

The process suite is intentional: Core's Omni positive control requires an actual process spawn. The source suite verifies immutable blobs, replacement-ref resistance and revision/tree binding using a real isolated Git repository.

Package typechecks run from `packages/core` with `bun typecheck`. The baseline does not move product folders, modify runtime APIs or retire compatibility implementations.
