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
Desktop places this directory outside asar and passes its absolute directory to the Node sidecar.
An explicit user installation uses the SDK's documented executable option or
`ORCHESTRA_CLAUDE_CODE_EXECUTABLE` (an absolute executable path).
`ORCHESTRA_CLAUDE_CODE_RESOURCES` names an absolute staged directory. Missing, mismatched or unsupported
resources fail as `ClaudeCodeExecutableUnavailable`; bundled execution never searches a checkout/cache.
Both the host session and promptless catalog probe already call `processLifetime`, so they share this seam.

Acceptance fixtures must prove source default resolution, explicit install precedence, missing resources,
version/target mismatch, all eight target mappings, copied-byte correspondence, deployed-root `--version`
without a query/login and complete authored playbook visibility in generated standalone plugin output.
Fixtures are authored for later exact-source artifact CI; they are not local runtime evidence.

Owner limits: no actual model/query/login/owner-app runs; no packaging, tests or CI in this slice.
Only relevant package typechecks, serially through the shared compile queue, and godfile validation.
No integration, release, PR, dependency bump, install-channel change or hook bypass. Stage exact paths.
Exact-source artifact CI must later execute deployed-root proofs on matching OS/CPU/libc runners and packaged
Node/Electron/Bun outputs. A source typecheck cannot establish runtime closure.
