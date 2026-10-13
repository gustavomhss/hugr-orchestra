# Distribution preparation contract

Baseline: `615b2602ea`. This is a new distribution contract, not a claim that the four channels are already published or qualified.

## Shared payload

The source is one completed `packages/cli/dist/cli-<target>/` build. Its `package.json` must name `@orchestra/cli-<target>` and match the supplied version, OS and CPU from the closed builder target table. The payload preserves the complete `bin/` tree, including the executable, the enabled target's omni addon/supervisor, and every required tree-sitter package/binding/license. Packaged skills remain embedded in the compiled CLI; a source-only skill tree must not substitute for the compiled extraction.

The prepared directory contains `package.json`, `bin/**`, `distribution.json` and `checksums.sha256`. The distribution descriptor has schema `orchestra-distribution-v1`, `version`, `target` and a nonempty `files` array of `{ path, sha256, executable }`. Descriptor entries cover every payload file except the descriptor and checksum table. The checksum table also covers the descriptor. Paths are relative portable ASCII, with no empty/dot/dot-dot segment, backslash, control byte or duplicate. Only real regular files and real directories are admitted; no symlinks, hardlink tricks or special files. Unknown/missing companions and mismatched native binding targets refuse preparation. Source capture never executes build artifacts.

Preparation runs in an exclusively producer-owned namespace under the existing runtime producer boundary. It stages and publishes immutably; an existing output is reused only when the complete descriptor/file set and digests match. A conflicting existing output stays untouched. Runtime/Desktop schema1 bare-binary export remains a separate existing contract.

## Channel contracts

- **curl/POSIX:** consume a version-pinned archive plus exact archive SHA-256, validate archive paths/types before extraction and payload checksums before execution/activation. Install complete immutable version directories under a caller-selected prefix. An exclusive install lock serializes cooperating operations; activation replaces one `current` symlink atomically. The public launcher resolves into `current/bin`, preserving sibling files. Update admits the new version before activation; failed admission leaves current and prior versions intact. Rollback revalidates and selects an earlier complete version. No shell-config, credentials or application DB migration is part of this installer.
- **npm:** generate the dependency-free public wrapper metadata and per-platform packages from prepared payloads, with exact-version optional dependencies. Platform package `bin/` includes all companions. No workspace dependency escapes into generated registry packages. Clean install, replacement with the next package version and reinstall of the earlier pinned version exercise npm's actual lifecycle. The launcher keeps companion files beside the real executable; no bare-binary cache copy.
- **Homebrew:** generated formula uses version-pinned archive URLs and digests, installs the complete payload under `libexec`, and links only the public command. Qualification uses real Homebrew with isolated tap/prefix/artifacts and preserves versioned kegs for rollback. A Ruby syntax check alone is not installation evidence.
- **AUR:** generated binary PKGBUILD uses a version-pinned source and digest, installs the complete payload under `/usr/lib/orchestra`, and links `/usr/bin/orchestra`. Qualification uses real makepkg and pacman in an isolated Arch environment for install/upgrade/downgrade. Bash syntax validation alone is not package-manager evidence.

## Qualification and release

Installer unit proofs may use inert synthetic payload bytes or test executables to calibrate lifecycle/integrity failures, and must say so. A channel is runtime-qualified only after the actual compiled native CLI is installed through that channel and executes version, companion loading and embedded-skill extraction. Build/run on matching native runners; an unavailable target is a named blocker, not a successful skip. Include two separately versioned real builds for upgrade/rollback evidence. Do not touch the running desktop app or normal user state; qualification uses isolated HOME/config/data/cache/database/prefixes.

Run change-scoped tests and mutation RED/GREEN at milestone completion; full integration CI once the milestone is closed. Artifact preparation/qualification may produce CI artifacts. Public registry/tap/AUR publishing, release creation and signing/notarization are the final release step and require their actual owner-controlled endpoints and credentials. No published channel claim is inferred from a generated recipe.
