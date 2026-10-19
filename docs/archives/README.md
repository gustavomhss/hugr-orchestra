# Retained source recovery copies

This directory indexes owner-retained recovery bundles outside Git. Bundle manifests retain exact member paths, modes, sizes, Git blob provenance, content SHA-256, source revision/tree, and scope readers/disposition. The small checked-in index pins the manifest digest and records the observed recovery scope.

## Visual handoff

[`visual-handoff.json`](visual-handoff.json) identifies the complete `specs/orchestra-visual/handoff` snapshot at `e87fd95799cba0220abf5c86b203bc8d82b29732`: 57 files, 227,881,816 bytes. It includes archive parts, approved mock archive, receipts/manifests, and the original reconstruction utility together.

The owner selected `HuGR/orchestra-recovery` outside this checkout; the agreed local location is `/Users/gustavoschneiter/Documents/HuGR/orchestra-recovery`. Retain the bundle and its receipt until the owner closes the rollback window. An ephemeral CI artifact is not the retained copy.

To restore, run from a checkout containing the recovery API. Choose a new/empty output directory outside any Git checkout:

```ts
import { restoreRecoveryBundle } from "./script/recovery-bundle.ts"

await restoreRecoveryBundle(
  "/Users/gustavoschneiter/Documents/HuGR/orchestra-recovery/visual-handoff-e87fd95799cb",
  "/absolute/empty-recovery-output",
)
```

Before restoration, compare `manifest.json` SHA-256 with the index. The retained receipt contains the full independently checked member list and each content digest. Actual restore compared every byte and supported executable mode against immutable source Git objects; member-list equality ruled out omissions/additions. Missing and corrupt payload controls failed before creating output.

The restored original `restore-evidence.ts` reconstructed the historical tarball from its ordered parts. Its complete 207,658,700-byte output matched SHA-256 `27921a7b12d047070c8c4672f110a56c5edef9a97dcb608f6b8826d1b4e16d48`.

This checkpoint restores source files, including opaque archives, and verifies historical archive reconstruction. The handoff directory has since been removed from the tree. Restore it from this bundle when it is needed.

## Visual evidence and screenshots

[`visual-evidence.json`](visual-evidence.json) identifies `specs/orchestra-visual/evidence` and `specs/orchestra-visual/screenshots` at `ca6d9b5625bca4ca0bd7c42b09f50105ad4c1ad3`: 100 files, 12,994,044 bytes. The bundle is `visual-evidence-ca6d9b5625bc` in the same retention directory, and it restores the same way as the handoff bundle.

All 100 restored files hashed to their source Git blobs before the directories were removed from the tree. The design documents that cite this evidence (`VERIFICATION.md`, `COVERAGE.md`, `DELIVERY.md`) stay in `docs/specs/orchestra-visual`.

## Backend specialist evidence

[`backend-evidence.json`](backend-evidence.json) identifies `specs/backend-specialist/evidence` at `0ff924411761fb41419ba95c1f997188bd902a3e`: 95 files, 694,502 bytes, in bundle `backend-evidence-0ff924411761`. All 95 restored files hashed to their source Git blobs before the directory was removed. `docs/specs/backend-specialist/acceptance.md` still cites these receipts by their original paths.

## Actions parity screenshots

[`actions-parity.json`](actions-parity.json) identifies `specs/actions/parity` at `0ff924411761fb41419ba95c1f997188bd902a3e`: 35 images, 4,971,377 bytes, in bundle `actions-parity-0ff924411761`. All 35 restored files hashed to their source Git blobs before the directory was removed. `docs/specs/actions/UI-MOCK-PARITY.md` still cites them by their original paths.
