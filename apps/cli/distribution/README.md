# CLI distribution preparation

These producers prepare versioned artifacts. Registry, tap, AUR and release publication require the owner's actual endpoints and credentials. Preparation does not publish anything.

## Complete payload

Build the requested target with `apps/cli/script/build.ts`. An enabled target requires its real omni addon and supervisor; every target requires its matching tree-sitter bundle. Skills are embedded from the canonical seat trees during this build.

The shared API lives in `apps/cli/script/distribution-payload.ts`:

```ts
const manifest = await prepareDistribution({ dist, out, version, target })
await verifyDistribution(out, { version, target })
const archive = await archiveDistribution({ directory: out, file })
```

`dist` contains `cli-<target>/`; `out` is the complete prepared directory, not a parent containing another `cli-<target>`. Use canonical paths without linked ancestors. On Darwin, the existing native publication adapter requires `ORCHESTRA_ARTIFACT_DARWIN_SDK`, obtainable with `xcrun --sdk macosx --show-sdk-path`.

The directory includes `package.json`, the full `bin/` tree, `distribution.json` and `checksums.sha256`. The descriptor records every payload file's digest and executable flag. Archives may normalize modes; consumers restore flags from the descriptor. Publication refuses replacement; identical prepared directories are reusable, while archive filenames are exclusive.

## POSIX installation

Supply an exact version, native target, archive and trusted archive digest:

```sh
sh apps/cli/distribution/install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version 1.18.27 \
  --target linux-x64-baseline \
  --archive /absolute/path/orchestra.tar.gz \
  --sha256 "$ARCHIVE_SHA256"

"$HOME/.local/orchestra/bin/orchestra" --version
```

HTTPS archives are also accepted. The installer serializes cooperating operations with a prefix lock, admits a complete immutable version, then atomically replaces `current`. It preserves sibling native files. It does not edit shell configuration or migrate application databases.

Update uses the same command with the next version and digest. Rollback revalidates the retained version:

```sh
sh apps/cli/distribution/install.sh \
  --prefix "$HOME/.local/orchestra" \
  --target linux-x64-baseline \
  --rollback 1.18.27
```

The initial installer supports native Linux/Darwin x64 and arm64, with explicit baseline x64 variants. Musl and Windows require separate installer qualification.

## npm and package recipes

`prepareNpmDistribution({ payloads, out })` in `script/distribution-npm.ts` produces `out/cli` and `out/cli-<target>` registry package directories. It regenerates metadata and payload checksums, pins optional dependencies to one exact version, and preserves the complete native tree. npm-special paths that cannot be safely packed are rejected. The launcher selects compatible CPU/libc packages and forwards arguments, signals and exit status.

`distributionRecipes({ version, assets })` in `script/distribution-recipes.ts` renders Homebrew and AUR sources. `assets` must contain exact HTTPS URL/digest records for `darwin-arm64`, `darwin-x64-baseline`, `linux-arm64` and `linux-x64-baseline`. This milestone accepts stable `X.Y.Z` recipe versions. Both recipes restore descriptor executable flags; AUR preserves bytes with `!strip` and declares its build/runtime dependencies.

## Embedded skills

`PackagedSkills` in `@orchestra/core/packaged-skills` materializes the embedded full entry/reference trees when required Location configuration opens. Cache identity includes the exact version hash and complete tree digest. Existing valid trees are reused; corrupt trees fail admission. Old trees remain available for rollback, and user skill sources retain override priority. `--version` does not trigger extraction.

Publication uses a cooperative mkdir lock in a user-owned cache namespace. A crashed unpublished writer's lock is not stolen; acquisition fails by name. A verified complete publication remains readable despite an abandoned lock. This is not a guarantee against an authorized hostile namespace writer.

## Hosted qualification

Tests run through `test:ci`, never locally. Native proofs compile two real versions and exercise the public installed launcher, parser loading, installed addon/supervisor, authenticated service/catalog and complete extracted skill bytes. npm's loopback registry proves actual package-manager lifecycle; it does not qualify a public registry endpoint.

```sh
bun run test:ci cli ./test/distribution-native.test.ts ./test/distribution-process.test.ts --os linux
bun run test:ci cli ./test/distribution-native.test.ts ./test/distribution-process.test.ts --os linux-arm64
bun run test:ci cli ./test/distribution-native.test.ts ./test/distribution-process.test.ts --os macos
bun run test:ci cli ./test/distribution-native.test.ts ./test/distribution-process.test.ts --os macos-intel
bun run test:ci cli ./test/distribution-homebrew.test.ts ./test/distribution-process.test.ts --os macos
bun run test:ci cli ./test/distribution-homebrew.test.ts ./test/distribution-process.test.ts --os macos-intel
```

Homebrew qualification uses a private cloned prefix/tap, real `brew install --formula` then `brew upgrade --formula` with automatic cleanup disabled, checksum-negative controls and explicit public-link rollback. Checksum refusal preserves the complete `Cellar/orchestra` tree (all retained kegs, receipts, bytes, modes and links) and the exact `bin/orchestra`, `opt/orchestra` and `var/homebrew/linked/orchestra` activation entries; the previous public launcher stays linked during upgrade validation. Homebrew infrastructure directories may initialize. Separate private prefix/Cellar/repository identity guards remain mandatory. AUR also has native x64/ARM64 makepkg/pacman install, update and retained-package downgrade proofs in pinned Arch/ArchLinuxARM guests. Windows x64 has a real npm/PE/public-CMD/service/parser/skill lifecycle proof. Unsupported runners and cleanup ambiguity are failures, not successful skips.

The Homebrew fixture pins brew and an official sparse core checkout, including the real `pkgconf` metadata needed by its macOS upgrade lookup. It verifies that metadata before qualification; the private Cellar does not inherit host packages. Exact revisions, hosted results and mutation controls are recorded in `specs/distribution/EVIDENCE.md`.

The installed-companion peer probe independently checks supervisor execution. It does not claim the public CLI itself exercised an omni-spawn tool turn. Musl runtime qualification, provider execution and release signing/publication are separate evidence scopes. Exact native Windows/AUR results, guest provenance, bootstrap conditions and negative controls are recorded in `specs/distribution/EVIDENCE.md`.

## Release

`.github/workflows/release-cli.yml` is dispatched by hand from `dev` with a stable `version` (`X.Y.Z`). It builds the six natively qualified targets (`linux-x64-baseline`, `linux-arm64`, `darwin-arm64`, `darwin-x64-baseline`, `windows-x64-baseline`, `windows-arm64`) on their own runners, and `linux-x64-baseline-musl` and `linux-arm64-musl` with `distribution/musl-release.sh` inside the same pinned `rust:1-alpine` guests that the bundle's musl lane qualifies (pinned musl Bun, omni and musl parsers built in the guest). `script/release.ts payload` prepares and archives each build; `script/release.ts assemble` restores executable modes from each descriptor, verifies every payload and writes the npm packages (`@hugr/cli`, `@hugr/cli-<target>`), the Homebrew formula, the AUR `PKGBUILD` (its `.SRCINFO` comes from real `makepkg` in an Arch container) and `SHA256SUMS`. The npm packages are packed in that same job, because artifact upload drops Unix modes; the job installs the packed wrapper and Linux x64 package and requires `orchestra --version`, and the publish job ships those exact tarballs. The packed musl x64 package also runs `orchestra --version` in `node:22-alpine`.

Without `publish` the run is a dry run: everything is uploaded as the `release-assembled` artifact and nothing is published. With `publish`, the `release` environment job creates the GitHub release `vX.Y.Z` (archives, `SHA256SUMS`, `install.sh`), publishes the platform packages and then the wrapper to npm with provenance, commits `Formula/orchestra.rb` to `gustavomhss/homebrew-tap` and pushes `PKGBUILD` and `.SRCINFO` to the AUR package `orchestra-bin`. It requires these secrets on the `release` environment:

| Secret | Use |
| --- | --- |
| `NPM_TOKEN` | npm automation token with publish rights on the `@hugr` scope |
| `HOMEBREW_TAP_TOKEN` | fine-grained GitHub token with contents write on `gustavomhss/homebrew-tap` |
| `AUR_SSH_PRIVATE_KEY` | private SSH key registered on the AUR account that owns `orchestra-bin` |

Binaries are not code-signed or notarized in this release flow.
