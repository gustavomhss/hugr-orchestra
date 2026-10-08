# Runtime distribution and integration closure

Baseline: `fork/dev` at `2d5d5d2f81770207a346aa14394fc4e6eedd6b39` (rename milestone #92).

## Demand and stopping rule

Ship owned Orchestra CLI artifacts in the desktop and WSL; remove unowned SDK/release registry dependencies; prove real Nix builds; make OAuth authorization identify Orchestra. Every work package must satisfy its named acceptance items, preserve the invariants below and provide current Actions evidence. One integrated milestone PR and merge close this work.

Owner clarification: **“nao, tem que aparecer orchestra”**. Own OAuth registrations and provider approval are completion requirements. Configurable IDs or mocked consent screens alone do not satisfy that item. Missing operational access is a named blocker, not a silently deferred requirement.

Cadence correction from the owner: **“vamos rapido, sem suites de teste pesadas rodando a cada wp, cada agent testa so o que mexeu, PR so no final do milestone ok?”** Each WP runs only its changed-file/changed-behavior checks. Cross-target builds, complete package suites, full matrices and the single milestone PR wait for integration/closure. Batch controls where they answer the same changed behavior; do not repeat full work for every edit.

Product architecture steering: the owner decided to transfer decomposition, planning, tasks and WPs from Maestro to a new team member, **Archie**, which another front is building. The owner renamed the proposed planner from Wallie to Archie; older snapshots use the former name. Maestro owns orchestration, organization and decisions, with further decision/orchestration capabilities planned later. Existing runtime snapshots must distinguish the current installed contract from this owner-directed transition. This implementation wave's own engineering plan is not the product's future Maestro capability charter; roster/prompt migrations require coordination with the Archie owner and current executable gates. Stable member IDs and charters must come from that front's frozen interface, not be guessed from display names.

## Recovered implementation facts

- Desktop still installs upstream CLI packages and expects a Rust service-password command its owned V2 CLI does not implement.
- The owned V2 CLI builder emits a differently named executable and its entrypoint reports `local` even in compiled builds.
- WSL installation is disabled; its foreground startup arguments/password convention belong to the other runtime.
- Core serves bundled public SDK modules, but npm dependency resolution and warm caches can still fetch/expose registry SDK copies.
- Release version bumps fetch an unowned npm package name.
- Nix hashes cover installed dependency output, not lockfile bytes; evaluation alone cannot establish a working build.
- OAuth app IDs and some provider attribution fields remain third-party identities. A new app requires real registration/entitlement, not a locally invented ID.

These are source observations, not measured red-test results. The baseline acceptance runs below must record actual failures before implementations are graded.

## Invariants

1. Client runtime never imports Core or Server; existing Schema/Core/Protocol/Server direction remains intact.
2. V2 prompt admission, process-global Session execution and Location-scoped runners remain unchanged.
3. No upstream executable/installer or unowned SDK package is a runtime fallback.
4. Declared public SDK imports use bundled objects; unknown/deep imports cannot execute a planted registry copy. Ordinary plugin dependencies still work.
5. Copilot, xAI, DigitalOcean and other changed OAuth flows must display Orchestra through real registered identities. No fabricated client IDs, insecure TLS or hidden third-party fallback.
6. Preserve OpenCode Zen/Go provider protocol and Codex `originator: opencode` until the owner's real compatibility probe justifies changing it.
7. Artifact target, version and bytes are explicit and verified; caches cannot silently reuse another executable.
8. Test data, daemons and credentials are isolated. Do not restart the running app/server or use its data roots for smoke tests.
9. Tests run on Actions; local package typecheck/godfile only. Stage by exact paths. No hook bypass, force push, shared git-config edits or bulk cleanup.
10. Visual/Relay branches remain owned by their peer. Any necessary new user-facing copy goes through the shared i18n rules and visual coordination.

## Frozen cross-package contracts

### Owned V2 CLI

- Executable name: `orchestra[.exe]`.
- Target argument: `--target <platform-arch[-baseline][-musl]>`, validated against the builder's actual target set.
- Output: `packages/cli/dist/cli-<target>/bin/orchestra[.exe]`.
- Targeted builds replace only that target's output; other target artifacts are retained.
- `--version` reports the compiled `InstallationVersion`; the manifest and background daemon registration use the same version.
- Native desktop commands: `service status`, `service start`, `service password`.
- WSL foreground command: `serve --hostname 0.0.0.0 --port <allocated>`.
- WSL reads its owned guest's private credential through `service password` before foreground serve; no legacy logging flags or unused host-generated password.
- The existing full CLI/Node desktop server is a separate active runtime; this milestone does not retire it.

### Desktop artifact manifest

Location in development: `packages/desktop/resources/cli/manifest.json`; packaged: `<resourcesPath>/cli/manifest.json`.

```ts
type CliArtifactManifest = {
  schema: 1
  version: string
  artifacts: ReadonlyArray<{ target: string; file: string; sha256: string }>
}
```

`file` is a basename within the manifest directory. Targets are unique, versions nonempty, SHA-256 lower-case hexadecimal. Files must be regular files confined to that directory. Digests are computed after signing/staging. Build/staging never fetches CLI packages from npm.

Native preferred targets: `darwin-arm64`, `darwin-x64-baseline`, `windows-arm64`, `windows-x64-baseline`, `linux-arm64`, `linux-x64-baseline`. Windows desktop bundles also carry Linux x64-baseline and arm64 artifacts for supported WSL guests. Unsupported CPU/ABI must fail explicitly.

Shared reader: `packages/desktop/src/main/cli-artifacts.ts`:

```ts
export type CliArtifactManifest = {
  schema: 1
  version: string
  artifacts: ReadonlyArray<{ target: string; file: string; sha256: string }>
}
export function nativeCliTarget(platform: string, arch: string): string
export function readCliManifest(directory: string): Promise<CliArtifactManifest>
export function verifyCliArtifact(directory: string, target: string): Promise<{ path: string; version: string }>
```

Packaging includes the CLI directory outside app.asar for every channel. The descriptor version is authoritative for WSL server checks; desktop release metadata must align with its built artifacts. No binary cache hit is trusted without checking its bytes.

### SDK closure

Authoritative public subpaths are `packages/plugin/package.json#exports`. Any materialized install bridge has no registry dependency on workspace packages; it re-exports the bundled canonical module objects. Npm's resolver must handle direct, transitive, optional/peer and alias declarations without SDK metadata/tarball requests to external registries. Warm-cache behavior must meet the same contract. Use the real resolver/loopback registry for tests; no mocked Arborist success.

Resolver seam is the installed Arborist/pacote `packumentCache` contract. Pacote 21.5.0 keys it as
`full:<registry>/<escaped-name>` or `corgi:<registry>/<escaped-name>` and checks `has/get` before requesting metadata.
The SDK adapter returns an owned manifest for the canonical SDK name, including alias requests, at its actual package
version. Its tarball is a generated dependency-free re-export bridge served by a private loopback listener for the
scoped install; no external SDK metadata/tarball endpoint is used. Ordinary packuments retain the resolver's behavior.
Arborist receives this cache during ideal-tree creation and reification. Warm installed trees/locks and bundled SDK
nodes must be reconciled to that same bridge before return; aliases are identified by the resolver's parsed edge spec,
not by a regexp on arbitrary package text. The actual resolver fixtures must validate this seam before implementation
is graded; an unsupported resolver behavior is a blocker, not permission to weaken alias/cache coverage.

## Acceptance spine and ownership

| ID | Acceptance item | Owner |
|---|---|---|
| A01 | Release/preview versions derive from owned source/explicit overrides with registry networking disabled; invalid bump inputs fail. | W1 |
| A02 | Owned compiled V2 CLI has correct name/version and real service/serve commands on supported targets. | W2 |
| A03 | Native desktop stages/verifies owned artifacts, starts its isolated service and includes artifacts in every channel; fresh dev bootstrap works. | W3 |
| A04 | WSL selects guest architecture, installs/updates owned bytes atomically without upstream download, and reaches authenticated health. | W4 |
| A05 | Real npm resolver installs ordinary dependencies but performs zero external SDK fetches for direct/transitive/alias/peer/optional cases, including warm caches. | W5 |
| A06 | Bundled public SDK identities survive Bun, Node, compiled binary and OpenTUI; planted unknown/deep SDK imports fail. | W5 |
| A07 | Each OAuth authorize/poll/refresh path uses its owned configured registration; missing registration produces a named setup blocker. | W6 |
| A08 | Real login/consent identifies Orchestra and entitled inference remains usable; refresh/re-login verified without leaking credentials. **Human/operational evidence required.** | W6 + owner |
| A09 | Attribution probes record tiny redacted requests and preserve compatibility/plan entitlement; unprobed identities stay explicitly unresolved. | W6 |
| A10 | Nix dependency hashes are regenerated/deterministic on all four declared platforms; wrong hashes fail. | W7 |
| A11 | Real Nix CLI and desktop builds/install checks pass, with matching Electron/platform artifacts; evaluation-only/skips cannot satisfy this item. | W7 |
| A12 | Integrated seam checks, independent reviews/mutation probes and full applicable exact-head epic CI pass; manifest and generated sources correspond. | Lead |

Baseline evidence lives with the named test runs. Already-green items are existing capability evidence, not proof of newly implemented work; the delta still requires a targeted failing counterexample.

## Exact verification matrix

- Native distribution targets: Darwin x64-baseline/arm64, Windows x64-baseline/arm64, Linux x64-baseline/arm64. Each must compile to the expected executable format/architecture and version. Native executable smoke/service checks run on matching OS/CPU runners; an unavailable required runner is an infrastructure blocker, not a skip counted as proof. Builder support for existing musl variants must not regress.
- Desktop channels: dev, beta, prod. Each package configuration includes the same owned manifest/native executable outside app.asar; Windows channels additionally include both Linux guest artifacts. A clean bootstrap must install/find Electron, build its own artifacts, launch the desktop process in isolated app data and prove its server is ready through the real integration path.
- WSL guests: supported Bash/coreutils Linux guests on x64 and arm64. Tests cover new installation, update, existing foreign executable, wrong digest/architecture, interrupted copy, version mismatch, symlink/traversal rejection, cancellation and unhealthy startup. Failure preserves the previously installed executable. A protected API request with the guest credential succeeds and a wrong credential is rejected; mere open port/HTTP 200 is insufficient. Real Windows/WSL transport evidence is required in addition to Linux transfer/script tests.
- Artifact provenance: manifest SHA matches the actually staged bytes after signing; compiled `--version` matches manifest and server registration. Reused staged caches are checked again. Missing/malformed descriptors, duplicate targets and altered cached executables fail or are replaced atomically from verified owned bytes; no network fallback.
- Resolver forms: direct, transitive at two depths, alias, peer, optional, and multiple requested SDK ranges, each cold and warm. Include existing package locks, permissive/planted SDK exports and bundled nested SDK copies. Unsupported SDK versions produce a local named error rather than registry fallback. Ordinary dependency metadata/tarball fetch and execution provide the positive control for zero SDK requests. Canonical public and alias imports must not execute planted bytes; arbitrary code explicitly bundled by a selected third-party plugin is not claimed to be a sandboxed program.
- SDK authority: exactly the seven exports in the plugin manifest (root, tool, tui, effect, effect/integration, effect/plugin, promise). Exercise ESM imports and supported require paths under Bun, Node desktop bundle and compiled Bun; OpenTUI covers its UI entrypoint and mixed imports. Unknown canonical SDK subpaths fail before disk evaluation. Type-only exports are verified as such instead of receiving fake runtime identity checks.
- OAuth registrations: Copilot, xAI, DigitalOcean, plus OpenAI/Codex if its visible app identity also needs replacement. Official issuer/grant/callback/scope requirements remain provider-owned. Verify ID propagation for authorization, device polling, token exchange and refresh/re-login, no fallback to known third-party app IDs, and preservation of account/model/plan entitlement. The actual consent page/registered-app record must say Orchestra; this operational/human item never becomes green from a configured string or local mock.
- Attribution probes: one request per configured provider/variant, no project code/transcript/tools, output limit at most 16 tokens, no automatic retry. Compare existing versus proposed identity using the same model/account. Results store only provider/model, identity variant, HTTP/error classification and minimal usage; token/refresh/password/authorization values never enter logs/artifacts. Unsupported or missing credentials are named unresolved evidence and block closure of that provider item.
- Nix systems: `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`. The fake-hash updater must produce the resolver's hash-mismatch result; unrelated acquisition/build failures are not hashes. Two independent clean dependency-output builds produce the same recursive hash per platform. Deliberately wrong hashes fail actual builds. CLI and desktop both build/install, CLI version/help execute, and installed desktop/server smoke runs on matching OS with the configured Electron version.
- Required seams: W1 version → W2 compiled version → W3 signed manifest/cache → W4 copied guest/version/auth; W5 actual resolver → runtime module identity on every supported import path; final W1–W6 dependency inputs → W7 hashes/builds. These require real integration checks, not only per-package unit results.
- Final evidence: independent author/reviewer contexts, measured red baseline/counterexample and green result, exact file manifest, generator correspondence, local package typechecks/godfile and full applicable exact-head Actions. No missing required item or skipped required check is a pass. Final merge must have the validated tree; an operational blocker keeps this milestone open.

## Work packages and conflict map

| WP | Responsibility / write ownership | Dependencies |
|---|---|---|
| W1 | `packages/script/src/index.ts`, version tests; owned release metadata only | none |
| W2 | `packages/cli/script/**`, `packages/cli/bin/**`, `packages/cli/src/index.ts`, CLI build/runtime tests | W1 version contract |
| W3 | Desktop native scripts/staging, `cli-artifacts.ts`, `background-cli.ts`, Electron bootstrap and packaging tests/config | W2 artifact contract |
| W4 | Desktop `src/main/wsl/**`, WSL tests; consumes shared reader without editing it | W2/W3 contract |
| W5 | Core npm/SDK install/resolution and tests; SDK/OpenTUI integration files by explicit lead assignment | npm seam freeze |
| W6 | Provider/OAuth identities, registration/probe harness and tests; source maps/config list frozen before edits | owner registrations/access |
| W7 | `nix/**`, hash tooling and real-build CI; no desktop/script package edits | final manifests/artifacts/dependencies |
| Lead | root/package manifests, shared lockfile, rename ledger, acceptance anchor, CI integration, final evidence and merge | all |

The first six execution fronts are disjoint or contract-bound. W7 can prepare tooling in parallel but final hash/build capture follows final dependency inputs. Shared files never get concurrent writers. Default maximum six nontrivial execution agents, plus short cold reviews as slots free; heavy builds/tests stay on Actions.

## Verification and landing

1. Author concrete baseline failures for assigned acceptance items and run them on Actions.
2. Obtain independent cold acceptance-suite critique before implementation; reconcile two consecutive rounds with no missing items.
3. Compile against frozen seams; push the first useful commit for resumability.
4. Each agent returns SHA, exact file set, actual gate URLs/results, mutation before/after and blockers. No self-reported pass substitutes for evidence.
5. Lead reads all gate changes first, reviews full file manifest and independently verifies controls/results before integrating.
6. Regenerate public SDK/Client only through their generators when public APIs change. Recompute Nix hashes after final dependency inputs.
7. One final milestone PR/epic CI; merge only the exact validated head. A08 operational blockers remain blockers until real evidence is supplied.
