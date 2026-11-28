# S4 runtime readiness for S2 — read-only investigation

## Decision

At the GitHub observations made in this task, no new qualified full-S2 release was published at the known S4 discovery locations. `genesis-runtime-resume` still pointed to `af0ed426b8caf0d95772e1fb174d34bab86399c4`, whose parent is `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`; `genesis-fresh-s4` still pointed to that parent. The discovery manifest remains release `20261111-v3-fresh-s4-r3`, code `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`, with native proof limited to one artifact and the released input ceiling of 256000 bytes.

The db9b423 code is a concrete, remotely tested candidate supporting a 2 MiB file observer. It is suitable for a separately named diagnostic prepare attempt when all source bytes and provenance are supplied. Its green code suite, and the earlier S1-04 diagnostic, do not supply S2 bindings or promote the release. The primary should reread the discovery branch before its final conclusion because another S4 session may publish later.

## Exact evidence

| Object | Immutable evidence |
| --- | --- |
| S4 resumption instructions | [S4-RUNTIME.md](https://github.com/gustavomhss/hugr-orchestra/blob/af0ed426b8caf0d95772e1fb174d34bab86399c4/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/S4-RUNTIME.md), blob `7241b0b64987894076a73b1b29ea52b8397f15de` |
| Released r3 manifest | [runtime-release.json](https://github.com/gustavomhss/hugr-orchestra/blob/db9b4235022c4df32fe3bfd4faeea8adcd69abb7/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json), blob `7513fcca63664ca02094e9ed9b8fab090c20295d`, 28282 bytes, SHA-256 `6de0b5f7a8911eb40c7fbcf74e74210805175ee580c0c8482249c016af1c0016` |
| Previous release selection | [7930c12f](https://github.com/gustavomhss/hugr-orchestra/commit/7930c12f92422bd334af659daa11553e79335619), chooses r3 as interim bounded release; explicitly declines r4 selection |
| Candidate code | `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, tree `3c93c4636c1e4c4b704f8be9314e22b2149e5609` |
| Candidate hosted gate | [run 43343953480](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43343953480), job `131618674434`, head db9b423, completed/success |
| Existing API diagnostic | [S1-04 prepare receipt](https://github.com/gustavomhss/hugr-orchestra/blob/d81a973d98ebe9b1f6db779bfc78af5152f14041/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/04-api/receipts/atlas-diagnostic/prepare-db9b423-final.receipt.json); code db9b423, original CLI, unmodified code, no seams, exit 0, explicitly `UNPROMOTED_SOURCE_DIAGNOSTIC_ONLY` |
| Protocol runtime | [runtime.md](https://github.com/gustavomhss/hugr-orchestra/blob/ee2521a5b966bd505cc95bd1c733e09e12f33531/.orchestra/skills/execute-genesis/references/runtime.md), blob `0e0f1607003ff49946ed7a155c268b31239930e6` |

The downloaded db9b423 job log reports 27 test files and 278 tests passed. The mutation-control step, generated-boundary step and repository-guards step succeeded. Guards report 78 rules, 1446 changed paths, 0 gate findings, 4 warnings, 0 errors. These facts apply to that run/code/suite. They do not show a full S2 prepare or consumer. The full fetched log is preserved as `pilot-db9b423.log`.

## Capability boundaries

- The r3 native prepare/binding/publish/index/read receipt chain demonstrates an actual one-artifact S4 sample on e3a8ab8.
- R3 cache reuse, affected rebuild, recovery, rollback, migration and coherent-read concurrency point to the separate common-controls candidate `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`. The manifest calls out synthetic control producers/reviewers and limits; these do not give a native S2 semantic acceptance or S2-U1 execution.
- Candidate db9b423's `ownershipInputMaxBytes = 2 * 1024 * 1024`. `readNativeFile` has an 8 MiB default cap for transport/control files, while source reads explicitly pass the 2 MiB observer cap. These are separate limits.
- Cross-package dependencies are refused by the released format. The transported package must be complete in its own declared graph.
- `prepare` writes isolated CAS and an exclusively created candidate output. It does not publish, configure policy, create reviewer decisions or activate a served state.

## Real command surface

At code revision db9b423, the CLI is `modules/atlas/scripts/genesis-native.ts`, blob `70ae6794086c73e8178e574c61fbe95739d45a6c`, 3004 bytes, SHA-256 `18dc473b79c9bf986f07677bdba728d38490e0df36e6a39763f3765f422af3ce`.

From the exact candidate's `modules/atlas` directory:

```text
bun scripts/genesis-native.ts prepare <isolated-source-root> <package-relative-to-source-root> <new-prepared-file>
bun scripts/genesis-native.ts publish <isolated-source-root> <prepared-file> <approval-relative-to-source-root>
bun scripts/genesis-native.ts index <isolated-source-root> <query-file>
bun scripts/genesis-native.ts read <isolated-source-root> <query-file>
```

For S2, the package path is:

```text
modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json
```

Package identity to require: SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`, preserved at `d1e635ed5e316b8d5d59650432268e3e81d8aff0`. All referenced bodies, source files, protocol/oracle, recipes, producer requests/responses and semantic review records must exist at the exact paths and match the package identities.

The prepared candidate includes `repo_root`, `observed_head`, implementation digests, transport digest, observations and entry inputs/results. Root relocation, changed HEAD, code, body, source or metadata can produce another candidate. Preserve the actual diagnostic root and candidate for subsequent binding; do not adopt the historical r4 ID. `publish` re-derives the candidate and rejects drift.

The standalone maintenance reproducer is:

```text
bun maintenance-operation.mjs <rebuild|publish> <runtimeAtlasRoot> <corpusRoot> <baselineManifest> <preparedTargetJsonPath> <bindingPath-relative-to-corpus>
```

Its exact path is `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs`. It calls the real product planner, rebuilder and publication ports. Its presence and successful syntax check do not prove S2-U1.

## Binding and authority prerequisites

The exact candidate requires two new actual independent decisions with purpose `runtime-import-binding`. The validator requires candidate ID, contract, all criteria and one entry record per artifact with exact result and inputs ID. Requests and responses must be preserved and hash-bound; reviewers and responses cannot be duplicated. Historical semantic approvals alone do not satisfy this.

Governed publication additionally requires an isolated Atlas policy authorizing the real actor/scope and ratification when required. The historical S4 policy-provisioning receipt records an authorized isolated /root responsibility declaration, not credentials or production authentication. Do not copy it as an S2 grant; establish and record the actual S2 authority from the current task.

New consumers must use real index/read responses from the published isolated selection, with their frozen query, limits, version trace and no source/oracle fallback. No consumer execution was done by this investigation.

## Local route is viable in principle

Initial inspection found node, npm and git; Bun was not in PATH. This is not an executor-unavailable finding.

A read-only metadata query actually succeeded:

```text
npm view bun@1.3.14 version --fetch-retries=0 --fetch-timeout=10000
=> 1.3.14, exit 0
```

Runtime protocol explicitly permits installing allowed dependencies from manifests/lockfiles and shell execution in the authorized sandbox. A pinned local toolchain can therefore be attempted without extracting credentials or using gh. The parent is investigating this route; this subtask did not install Bun or run prepare.

The existing workflow's dependency/build steps are `npm ci` and `bun typecheck`, both from `modules/atlas`. Build output is necessary: Atlas workspace packages such as @atlas/kernel and @atlas/knowledge export their compiled dist paths. Node alone is not a replacement for the current Bun entrypoint. Local typechecking/build is not a hosted CI PASS.

The parent separately confirmed an unauthenticated public git read; that result is parent evidence, not a probe performed by this subtask.

## Actions routes inspected

### atlas-pilot

At db9b423, `.github/workflows/atlas-pilot.yml` exposes `workflow_dispatch` and push triggers for `pilot-check-*` and `genesis-fresh-s4`. It runs on ubuntu-24.04, installs Atlas dependencies, typechecks, runs named regression tests and mutation controls, generates the boundary, checks guards, and uploads evidence.

A push to `genesis-interfaces-resume` does not trigger this workflow. The existing workflow also does not execute the full S2 package; it needs a narrowly scoped additional operation/job if used to collect new domain prepare evidence. It would need exact runtime/corpus refs, the package check, isolated root, stdout/stderr/exit/timing, prepared candidate, input manifest and durable upload.

Available GitHub MCP tools can create blobs/trees/commits/branches and read Actions jobs/logs/artifacts. No workflow-dispatch tool is currently exposed in the inspected registry. Fetching the workflow metadata endpoints by path and numeric ID returned wrapper INVALID_ARGUMENT 400. This is a wrapper limitation, not proof of missing workflow or unavailable UI dispatch.

### test-ci via ci-run-* and .ci-run.json

The real mechanism exists: `test-ci.yml` triggers on a pushed `ci-run-*` branch, reads and validates `.ci-run.json`, executes the requested package's test runner, then deletes the temporary branch. Creation via connected Git data APIs is consistent with the existing uploader mechanism; no gh token is needed for MCP itself.

It is not an arbitrary command transport. Runners are bun, node, pytest or playwright; the node runner accepts only named `*.node-smoke.mjs` scripts. Package resolution goes through `script/module-registry.json`, and directory overrides must match that resolver. The current registry exposes `atlas-boundary` at `modules/atlas/boundary`; it does not expose standalone `modules/atlas` as `atlas`. A request pretending `package: atlas` or substituting a directory would be rejected. The default Bun branch runs `bun test`, not Atlas's Vitest command, and does not install standalone Atlas npm dependencies.

Consequently, the existing test-ci route cannot be honestly claimed as an already-supported direct full-S2 prepare executor. A reviewed, scoped integration harness and suitable dependency/evidence handling would be needed, or a dedicated targeted extension of atlas-pilot. Do not weaken validators, use invented package mappings, or count a passing boundary suite as S2 runtime evidence.

## Capture integrity and limits

`captures.json` lists 26 immutable GitHub file captures with original refs, paths and Git blob IDs. A local Node verification recomputed every Git blob ID from the materialized bytes: 26/26 matched. These are source captures, not a checkout. `release-selection-HANDOFF.md` is reconstructed from the exact commit diff and is labeled separately from the blob-verified captures.

No runtime/product tests, prepare, binding, publication, consumer or maintenance operation ran in this subtask. No branch, policy, remote comment, workflow or release was changed. No credential lookup or gh command was executed. Tokens/physical attempts/billing are UNKNOWN.

