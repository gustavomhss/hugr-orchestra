# Claude runtime assets slice

Baseline: `05250c1a5a53817d8de2c807b9d3143708080d1b`. Branch: `claude-runtime-assets`.

Scope: pinned unmodified SDK executable resources, the centralized `processLifetime` executable option,
build staging, desktop resource wiring, Maestro playbook extraction through the existing seat skill mechanism,
and deterministic version/asset fixtures. No host session, hooks, options or plugin production edits.

The pinned SDK 0.3.289 package metadata declares Claude Code 2.1.289 and eight native optional packages:
Darwin/Linux/Windows x64 and arm64, plus Linux x64/arm64 musl. Its installed README documents the native
`claude` (`claude.exe` on Windows) resource and `pathToClaudeCodeExecutable` option for bundles.
Source execution keeps SDK resolution when no explicit executable/resource directory is supplied.

Build contract: stage `claude-code/{manifest.json,claude[.exe]}` beside each Bun executable or Node entry.
The manifest names the SDK version, Claude Code version, OS/CPU/libc target and SHA-256 of copied bytes.
Native package `README.md` and `LICENSE.md` accompany the unchanged executable. The resolver verifies the digest.
Desktop places this directory outside asar and passes its absolute directory to the Node sidecar.
Node builds default to the host target; cross-build producers can use
`bun script/build-node.ts --claude-target <darwin|win32|linux>-<x64|arm64>[-musl]`.
The matching optional native SDK package must already be installed; no missing resource triggers a download.
Desktop packaging checks that the staged target matches its OS/CPU and retains official binary bytes through signing.
Universal desktop artifacts need per-architecture producers; one native resource cannot masquerade as universal.
An explicit user installation uses the SDK's documented executable option or
`ORCHESTRA_CLAUDE_CODE_EXECUTABLE` (an absolute executable path).
`ORCHESTRA_CLAUDE_CODE_RESOURCES` names an absolute staged directory. Missing, mismatched or unsupported
resources fail as `ClaudeCodeExecutableUnavailable`; bundled execution never searches a checkout/cache.
Both the host session and promptless catalog probe already call `processLifetime`, so they share this seam.

Acceptance fixtures must prove source default resolution, explicit install precedence, missing resources,
version/target mismatch, all eight target mappings, copied-byte correspondence, deployed-root `--version`
without a query/login and complete authored playbook visibility in generated standalone plugin output.
Fixtures are authored for later exact-source artifact CI; they are not local runtime evidence.

Reviewed source audit: `maestro-orders-runtime-audit-result.md` B2/B4 (in the lead's temporary handoff directory).
Read repository/package/test AGENTS, runtime-closure PLAN and the Claude engine spec. The owner's explicit
no-tests/CI and no-integration instruction bounds this slice's verification despite the milestone PLAN's larger gate.

Owner limits: no actual model/query/login/owner-app runs; no packaging, tests or CI in this slice.
Only relevant package typechecks, serially through the shared compile queue, and godfile validation.
No integration, release, PR, dependency bump, install-channel change or hook bypass. Stage exact paths.
Exact-source artifact CI must later execute deployed-root proofs on matching OS/CPU/libc runners and packaged
Node/Electron/Bun outputs. A source typecheck cannot establish runtime closure.

Changed paths:
- Runtime: `src/claude-code/executable.ts`, `src/claude-code/sdk.ts`.
- Staging: `script/claude-code-resources.ts`, `script/build.ts`, `script/build-node.ts`.
- Desktop: `../desktop/electron-builder.config.ts`, `../desktop/src/main/server.ts`.
- Assets: `script/seat-skills.ts`, `src/maestro/playbook-content.ts`, `src/maestro/seat-skill-content.ts`,
  `src/maestro/seat-skill-root.ts`, `src/skill/index.ts`.
- Fixtures: `test/claude-code/{executable,runtime-version,deployed-assets}.test.ts`,
  `test/claude-code/fixtures/deployed-assets.ts`, `test/maestro/{playbook-assets,seat-skills-build}.test.ts`,
  `test/skill/playbooks.test.ts`.

Verification record:
- Source-only independent cold review of the resource and asset slices: approved after fixing the override fixture,
  staging Node externals, adding compiled inventory negatives and naming deployed-byte acquisition failures.
- `bun run check:godfile --base 05250c1a5a`: passed, 4460 source files, 331 legacy/size warnings, 0 errors.
- `bun typecheck` from `packages/orchestra`: passed (exit 0).
- `bun typecheck` from `packages/desktop`: passed (exit 0), after Orchestra completed.
- Initial Orchestra check found the resolver's `unknown` filename and a missing installed Core `marked` link.
  The resolver now uses the known basename it compares with the manifest. Restored the declared locked
  `marked@18.0.7` link from the existing Bun installation; no Core source, manifest or lockfile changed.
- Initial Desktop check found missing installed Session UI links to Effect 4.0.0-beta.83, Schema workspace and
  Noble Hashes 1.8.0. Restored those declared links from the existing installation/workspace, then reran the package gate.
- A shell directory mistake briefly invoked the root Turbo wrapper; it failed and its checks are not counted as
  package evidence. Verified that only the intended Desktop compiler remained, then completed the package gate.
- Logs: `/tmp/claude-runtime-assets-orchestra-typecheck.log`, `/tmp/claude-runtime-assets-desktop-typecheck.log`,
  `/tmp/claude-runtime-assets-godfile-final.log`. These are local checks, not Actions/artifact/runtime proof.
- Tests, full packaging, CI, native `--version`, model/query/login, account probes and owner-app execution: unrun.

Future exact-source artifact gates must run the fixture files above on every matching SDK target, including both
Linux libcs, and exercise the actual Node/Electron/Bun build outputs outside the checkout/cache. Narrow fixture
bundles do not establish whole desktop/package closure. Verify copied-byte digests after packaging/signing,
actual `2.1.289 (Claude Code)` output, complete plugin bytes and named negative outcomes. Missing optional native
packages, unsupported CPU/libc, unavailable target runners and universal-resource composition remain explicit
artifact-production/evidence gaps; no source check turns them green. Nix's separate `packages/cli` recipe is outside
B4 and this slice.
