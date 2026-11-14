# S1-03 Atlas runtime preflight

Execution identity: /root/runtime_preflight. Source/candidate materialized: e3a8ab8cf56dbff1ee91272df51ffa398d882aa1, through the GitHub connector. No remote writes.

## Result
Runtime is locally executable. Bun 1.3.14 was installed in /workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/runtime-preflight/bun-runtime. Node v24.22.1 and npm 11.9.0 are the host runtimes. npm ci succeeded with the original Atlas package-lock.json and its official postinstall shim. 399 captured source/config/script files were checked against their Git blob SHA and SHA-256. Source bytes remain identical after build.

The runtime source root is /workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/runtime-preflight/candidate. This is a verified source materialization, not a Git checkout: observed_git_head is null. No Git identity, membership or original HEAD is inferred. Product tests, import, publication, index/read, policy creation and authority declarations were NOT_RUN.

## Ready commands
Use cwd /workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/runtime-preflight/candidate/modules/atlas, executable /workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/runtime-preflight/bun-runtime/node_modules/.bin/bun.

- prepare: bun scripts/genesis-native.ts prepare <isolated-source-root> <package-path-relative-to-source-root> <new-absolute-output-file>
- publish: bun scripts/genesis-native.ts publish <same-isolated-source-root> <prepared-file> <binding-approval-relative-to-source-root>
- index: bun scripts/genesis-native.ts index <same-isolated-source-root> <query-file>
- read: bun scripts/genesis-native.ts read <same-isolated-source-root> <query-file>

The output file of prepare must not exist. Keep command receipts outside the served source root. Do not mutate package/input/reference files after preparation; publication re-prepares exact bytes and compares candidate identity, absolute root and implementation hashes.

## Principal inputs still required
1. Native package with exact schema; see schema-notes.json. Do not add subslice_id at package top level because the format enforces an exact field set.
2. Every body and referenced file at its real relative path in the isolated source root. All source refs and recipe are file inputs. Protocol also becomes a live input.
3. At least two preserved semantic decisions for each artifact. Selection must be complete and reachable from roots. All dependency and navigation targets must exist in the selected package.
4. New binding decisions by the same actual judges, for the prepared candidate and every result/input identity, covering every candidate criterion plus runtime-import-binding. Semantic PASS is not binding.
5. Effective local authority under the task: policy.json, actor and nominal ratifier are evaluated by the actual governed door. I did not create or modify any policy/actor/token. Baseline .atlas/policy.json returned 404. The S4 policy-provisioning receipt describes the real S4 /root isolated declaration, not an automatic S1 authorization transfer. Parent must determine actual current task authority and preserve provenance before provision/publication.

## Boundaries
- Source observation limit is 256000 bytes. Package/body/reference default limit is 8 MiB; any file included as live input also faces observer limits.
- Cross-package dependencies are refused. Same-package dependencies must be topologically ordered with supported predecessors; all navigation targets must be present.
- Binding records are operator-supplied structured records; original requests and actual responses must be retained, not fabricated.
- Common control evidence belongs to candidate 7102f2e3a1a9a3822bcd0ae054b36ecffe9da553. It is preserved in external-prerequisites.json with receipt from 8a041ca66982dcc2b89aaed46ebe347cb3de57db. Do not transfer native binding to that candidate.
- planOwnershipUpdate and rebuildOwnershipUpdate are existing exported functions in knowledge/ownership/update-plan.ts and adapter-io/ownership-rebuild.ts. Native CLI exposes only prepare, publish, index and read; no claimed CLI rebuild command exists. The planner and recipe executor require the actual accepted manifest, live observations, captured bytes and a real evaluation callback. A source mutation/read HOLD alone is not a rebuild proof.
- No AGENTS under modules/atlas/packages tree (1092 complete tree entries), modules/atlas/AGENTS.md absent, modules/AGENTS.md absent. Root AGENTS applies.

## Receipts
- source-captures.jsonl: 399 exact path/blob/SHA-256/byte identities.
- preflight-summary.json: paths, versions, no authority, no tests.
- bun-install-receipt.json: npm install bun@1.3.14, exit 0.
- npm-ci-receipt.json: npm ci from original lockfile, exit 0.
- runtime-build-receipt.json: bun typecheck from adapter-io package directory, exit 0, with src-only materialization; this is a preparation build, NOT a full package gate or CI.
- entrypoint-load-receipt.json: real CLI invocation without arguments returns the exact usage and exit 1; proves module loading only, no operation or green gate.
- external-prerequisites.json: original connector responses for absent baseline policy, absent modules AGENTS, S4 local provisioning and common remote controls.
- schema-notes.json: strict transport/binding/query and path restrictions.

No final S1-03 acceptance is claimed by preflight.

