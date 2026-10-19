# Lean macOS candidate delivery

## Frozen baseline and intent

Lead assembly starts from dev ada14ff6ff537d38f6e8e54a8a92b0136f3083d8 plus reviewed
Lean source1c0d76817ebdf952f95960db1ae838a455ac3d43. Approved native selected-profile
UI stays unchanged. Target platform is native macOS x64 (user host x86_64).
Deliver a separately identified, unsigned directory app from CI; no release feed.
No PR merge, signing-secret access, private auth/DB reads or user-app restart.

## Candidate identity and isolation

Candidate identity: appId ai.hugr.orchestra.lean.candidate, productName
HuGR Lean Candidate. Dedicated builder wrapper preserves production files,
preload, renderer, backend utility sidecar, native PTY and assets; append complete
backend licenses to Resources/licenses. Archive/source/notices are pinned, not copied
parser implementation. No source or production config rewrite to make packaging pass.

Early runtime accepts ORCHESTRA_CANDIDATE_PROFILE_ROOT only for candidate identity;
absent env in normal build preserves existing behavior. Candidate app defaults to
its own Application Support directory, never dev/prod profile. Before store/lock/
logs create separate desktop and sessionData plus backend HOME/XDG/config/state/
cache/temp/DB roots. Skip original desktop migration and protocol ownership in
candidate mode. Skip login-shell env import; allowlist sidecar environment and
disable release credential inheritance. Managed machine policy reads are skipped
only in candidate mode. Never attach/reuse a running user daemon or server.

Candidate configuration must match runtime identity; appName/Safe Storage namespace
and single-instance lock cannot use production keys. No production metadata, browser
profile or credentials are copied. User-visible copy follows desktop i18n rules;
intentional candidate product name is a product label.

Candidate compilation sets `import.meta.env.ORCHESTRA_LEAN_CANDIDATE` to `"1"`;
normal config does not activate this hook. Isolation module exports
`initializeCandidateProfile(app, enabled: boolean): CandidateProfile | undefined`.
CandidateProfile owns root/desktop/session/home/data/config/cache/state/tmp/db/managed
absolute paths and appId/name. Default root is candidate appId under Application
Support; explicit root must be absolute and cannot select production/dev/beta roots.
Set environment before sidecar/backend imports, early store and single-instance lock.
Existing user-visible copy stays unchanged; candidate product name is intentional.

## Build and proof

Dedicated manual workflow uses an Intel macOS runner and asserts darwin/x64, Bun
1.3.14, Node24, actual Electron/electron-builder versions and exact checkout SHA.
No cross-architecture node_modules cache. Build actual backend via prebuild and
actual electron-vite renderer/main/preload, package unsigned --dir --x64 --publish
never. Verify real app.asar/sidecar, x86_64 native PTY, WASM, complete license material
and hashes; missing required package material fails by name.

CI launches the actual packaged app with Playwright Electron in fresh candidate
roots. Verify own window/renderer URL, authenticated own backend health, scope
changes and independent persisted item/master toggles, command history and paired
bytes/tokens. Seed only public synthetic/native fixture data and loopback model;
never run paid prompts or rely on machine Claude login. Test quit/relaunch persistence,
owned port closure and preservation. Capture own renderer only, not host desktop.
Independent controls prove isolated paths and item-off preservation; restore exact.

Actual local delivery is artifact extraction/hash verification and opening the
separate candidate, not a local build/test. Default open has no auto prompt/tool
execution. CI builds/tests only. Candidate .app and identity manifest are retained
as Actions artifacts; installer/signing/notarization/release are outside this cut.

Shared build command: from repository root,
`bun run packages/desktop/scripts/lean-candidate.ts build` then `... package`.
Output: desktop/dist-candidate/*.app and lean-candidate-build.json (built identity,
not proof of acceptance). Verification command: from desktop,
`bun test --timeout 1200000 test/lean-candidate-package.test.ts` on macOS x64 CI.
New workflow supports workflow_dispatch and push on exact `lean-candidate-build`
branch so candidate proof does not require merging a new workflow into dev.

## Write-disjoint work packages

- I isolation: desktop/src/main candidate-profile.ts, index.ts early hooks,
  server.ts environment, orchestra/config/managed.ts candidate-only guard + focused tests.
- B bundle: desktop/electron-builder.candidate.config.ts,
  electron.vite.candidate.config.ts, scripts/lean-candidate.ts + config tests.
- V verification: desktop/test/lean-candidate* tests/fixtures only; actual packaged app oracle.
- C CI: .github/workflows/lean-candidate.yml only, wired to B/V commands.
- Q source join: read-only latest plugin-boundary/Lean interplay plus scoped CI;
  repairs only parent-assigned files after findings.
- R review stack: git/PR bookkeeping only, new small explicit contract roots and
  supersession proposals; never merge or rewrite published history.

Parent owns integration, workflow command contracts and final acceptance. Maximum
six concurrent nontrivial agents, separate worktrees, bounded packets. First compiling
commit pushed, named staging, PR <=400 changed lines, source-verified scoped CI,
independent review. Full unchanged suites are not repeated.
