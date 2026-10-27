# CLI distribution preparation

These producers prepare versioned artifacts. Registry and release publication require the owner's actual endpoints and credentials. Preparation does not publish anything.

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

`install.sh` accepts exactly these `--target` values. The target must match the host OS, CPU and libc:

| `--target` | Host |
| --- | --- |
| `darwin-arm64` | macOS, arm64 |
| `darwin-x64`, `darwin-x64-baseline` | macOS, x64 |
| `linux-arm64`, `linux-arm64-musl` | Linux, arm64, glibc / musl |
| `linux-x64`, `linux-x64-musl`, `linux-x64-baseline`, `linux-x64-baseline-musl` | Linux, x64, glibc / musl |

Windows has no POSIX installer. The release workflow publishes `darwin-arm64`, `darwin-x64-baseline`, `linux-x64-baseline`, `linux-x64-baseline-musl`, `linux-arm64` and `linux-arm64-musl`; the other targets are accepted by the installer but not published by that workflow.

## npm packages

`prepareNpmDistribution({ payloads, out })` in `script/distribution-npm.ts` produces `out/cli` and `out/cli-<target>` registry package directories. It regenerates metadata and payload checksums, pins optional dependencies to one exact version, and preserves the complete native tree. npm-special paths that cannot be safely packed are rejected. The launcher selects compatible CPU/libc packages and forwards arguments, signals and exit status.


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
```

Windows x64 has a real npm/PE/public-CMD/service/parser/skill lifecycle proof. Unsupported runners and cleanup ambiguity are failures, not successful skips.


The installed-companion peer probe independently checks supervisor execution. It does not claim the public CLI itself exercised an omni-spawn tool turn. Musl runtime qualification, provider execution and release signing/publication are separate evidence scopes. Exact native Windows results, guest provenance, bootstrap conditions and negative controls are recorded in `docs/specs/distribution/EVIDENCE.md`.

## Release

`.github/workflows/release-cli.yml` is dispatched by hand from `dev` with a stable `version` (`X.Y.Z`). It builds the six natively qualified targets (`linux-x64-baseline`, `linux-arm64`, `darwin-arm64`, `darwin-x64-baseline`, `windows-x64-baseline`, `windows-arm64`) on their own runners, and `linux-x64-baseline-musl` and `linux-arm64-musl` with `distribution/musl-release.sh` inside the same pinned `rust:1-alpine` guests that the bundle's musl lane qualifies (pinned musl Bun, omni and musl parsers built in the guest). `script/release.ts payload` prepares and archives each build; `script/release.ts assemble` restores executable modes from each descriptor, verifies every payload and writes the npm packages (`@humanguardrail/cli`, `@humanguardrail/cli-<target>`), and `SHA256SUMS`. The npm packages are packed in that same job, because artifact upload drops Unix modes; the job installs the packed wrapper and Linux x64 package and requires `orchestra --version`, and the publish job ships those exact tarballs. The packed musl x64 package also runs `orchestra --version` in `node:22-alpine`.

Without `publish` the run is a dry run: everything is uploaded as the `release-assembled` artifact and nothing is published. With `publish`, the `release` environment job creates the GitHub release `vX.Y.Z` (archives, `SHA256SUMS`, `install.sh`), publishes the platform packages and then the wrapper to npm with provenance. It requires these secrets on the `release` environment:

| Secret | Use |
| --- | --- |
| `NPM_TOKEN` | npm automation token with publish rights on the `@humanguardrail` scope |

With `sign=true`, the macOS and Windows build jobs sign every shipped executable before it is hashed, archived or packed, and notarize the macOS ones. The `release` environment must then also hold these secrets; the workflow stops before building if one is missing:

| Secret | Use |
| --- | --- |
| `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD` | Developer ID Application certificate, imported into a temporary keychain |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization with `xcrun notarytool` |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | Azure OIDC login for Windows signing |
| `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE` | Azure Trusted Signing (`script/sign-windows.ps1`) |

Binaries are unsigned unless the release is dispatched with `sign=true`. A publish without it is allowed, but the workflow warns. npm and `install.sh` installs do not pass through the browser quarantine mark, so Gatekeeper and SmartScreen do not check them; a binary downloaded from the release page in a browser can trip them.
