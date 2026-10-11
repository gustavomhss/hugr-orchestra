---
name: omni-release
description: "Procedure for releasing hugr-omni - bumping one version across the Rust workspace, the npm main package, its platform optionalDependencies and the plugin manifest; the --release gate and the release workflow that builds and proves each platform package on its own OS and CPU; pack and verify; publishing the platform packages first and hugr-omni last, only after the owner's explicit yes; the K4 note; the GitHub mirror; and adding a build target. Use when preparing or cutting an omni release, bumping its version, publishing to npm, touching release.yml, pack.mjs or verify.mjs, adding a platform target, or when asked about the gustavomhss/hugr-omni mirror."
---

# Releasing hugr-omni

A release is one version for every artifact, proven per platform before anything is published. Publishing is
**owner-gated**: an agent prepares everything, then stops and asks. The packaging rules are in
[the npm packaging notes](../../bindings/node/npm/README.md) and [ADR-0004](../../docs/adr/0004-packaging.md). The
current state of the release (what is open, what the owner decided) is in [HANDOFF.md](../../HANDOFF.md).

## When to use

- Preparing or cutting a release, or bumping the version.
- Publishing to npm, or answering "can we publish?".
- Changing `.github/workflows/release.yml`, `bindings/node/npm/pack.mjs` or `verify.mjs`.
- Adding a build target. Read [references/new-target.md](references/new-target.md).
- Anything about the GitHub repository `gustavomhss/hugr-omni`. Read [references/mirror.md](references/mirror.md).

## When not to use

- Ordinary gate runs: use the `omni-gates` skill.
- Changing the API or the protocol: use the `omni-core-change` skill. A release ships what is already merged.

## 1. Preconditions

- `conformance/pending.txt` lists no item. Every contract item passes.
- [GUARANTEES.md](../../GUARANTEES.md) states, per OS, only what has evidence (INV-09). Rows still "planned" are not
  promised.
- The integration plan's owner decision O8 holds: publish only after WP-H (the H2 to H5 fixes would otherwise ship)
  ([plan §5](../../docs/orchestra-integration.md#5-owner-decisions)).
- **K4** (time to pid against the standard library, at most 1.25 times, or at most 0.3 ms more) is judged on quiet
  CI release builds, with Linux as the reference. The macOS Rust figure (about +0.7 ms on a loaded machine) is still
  open. If the CI figure misses the target, that is a decision for the owner, not a waiver the agent grants.

## 2. Bump the version, everywhere at once

One version for all artifacts. Change it in:

- `Cargo.toml` (`[workspace.package] version`). The crates inherit it, and `Cargo.lock` follows on the next build.
- `bindings/node/package.json`: `version` **and** the eight `optionalDependencies`. `pack.mjs` asserts that the
  package lists the eight platform packages at its own version.
- `.claude-plugin/plugin.json`: `version` pins the skills plugin to it.

Then search for the old version string, to catch anything new that carries it.

## 3. Prove it

- `node scripts/ci.mjs --release` (or push a `v*` tag, which runs it on all three OSes). This adds the musl
  supervisor, Node 24, Bun and Deno, every docs block run for real, K4 on a release build, and K9 for this OS.
- The **release workflow** (`release.yml`, started by hand, or the Orchestra artifacts workflow once WP6 lands)
  builds every platform package on its own OS and CPU, packs it with the main package, and proves a clean install
  with npm, Bun and Deno. Its artifacts are the tarballs to publish. Take `hugr-omni-<version>.tgz` from a POSIX job:
  Windows cannot keep the execute bit.
- By hand on one platform: `node bindings/node/npm/pack.mjs dist <id>`, then
  `node bindings/node/npm/verify.mjs dist/tarballs node` (and `bun`, `deno`).

## 4. Publish (owner-gated)

**Stop here and ask the owner.** Publishing needs the owner's explicit yes in this conversation, and an npm account.
Show what will be published: the package names, the version, and the tarball list from the release run. Wait. A yes
for one release is not a yes for the next.

After the yes:

1. Publish the **platform packages first**: `hugr-omni-linux-x64-gnu`, `hugr-omni-linux-arm64-gnu`,
   `hugr-omni-linux-x64-musl`, `hugr-omni-linux-arm64-musl`, `hugr-omni-darwin-arm64`, `hugr-omni-darwin-x64`,
   `hugr-omni-win32-x64-msvc` and `hugr-omni-win32-arm64-msvc` (plus any target added since).
2. Publish **`hugr-omni` last.** Deno reads the packument of every optional dependency, and fails on one that does
   not exist yet.
3. The first publish ends the pre-release state. Remove the `PRE_RELEASE_INSTALL` exception from
   `scripts/readme-check/blocks.mjs`, and the pre-release notice from the README. The install lines then run in
   `--release` like any other block.
4. Tag the release on the source of truth (Orchestra `packages/omni`), never on the mirror
   ([references/mirror.md](references/mirror.md)).

## Checklist

- `pending.txt` is empty, and GUARANTEES holds only proven rows.
- The version is the same in the Cargo workspace, `package.json` (with the five optional dependencies) and
  `plugin.json`.
- `--release` is green on three OSes, and the release workflow is green for every platform.
- The owner said yes to this release.
- Platform packages were published before `hugr-omni`. `PRE_RELEASE_INSTALL` is gone after the first publish.
