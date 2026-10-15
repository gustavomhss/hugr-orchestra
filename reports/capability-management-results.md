# Connection management — integrated checkpoint

## Current state

Source checkpoint: `4cfebc40e881fdb1b2f524bc765a72ccd06b1a32`, branch `native-capabilities`. This report is saved in a subsequent documentation commit. Owner resumed the campaign after compaction. The planned connection/target/binding backend wave is integrated; no campaign PR or CI was opened. All authors and independent cold reviewers returned.

Worktree: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/native-capabilities`; remote `fork`, default/base `dev`. Preserve untracked `specs/orchestra-capabilities/` and `reports/Tools concretas para Orchestra.md` and the original user-owned checkout. Commit only explicit paths.

## Delivered behavior

- Shared `CapabilityConnectionStore` SQL primitives now serve the trusted host/model facade and operator management. Explicit supplied transaction and actual placement; current refs/state/generations; retarget/disconnect/remove invalidate bindings. JSON primitives including `null` persist as parameterized JSON text, never SQL NULL.
- `CapabilityConnectionManagement` reads actual stored ownership for existing IDs; caller-selected Location cannot adopt a resource. Only redacted refs, state and credential presence are returned. Missing IDs and pure expected missing/revoked/denied private-authority failures share one constant unavailable shape; mixed Causes propagate.
- All six local mutations use durable `CapabilityRequest` receipts. A SQL-only fourth `verify(tx)` hook runs inside the immediate writer before both fresh writes and exact replay. Actual parent ownership and target association remain current even after a target is removed; fresh callbacks alone require current active state/generation. Original full refs and payloads still determine retry identity.
- Binding input accepts Session/actions, never agentID. Actor derives from persisted Session, same placement required; normalized payload includes actor. Writer rechecks actor for fresh and replay; switching actor requires a new explicit request.
- Target pagination performs one bounded ascending `limit+1` scan; denied targets are omitted without unbounded filling. Cursor is AES-256-GCM authenticated/encrypted, factory-private key, random nonce, five-minute expiry, bound to principal/scopeHash/actual placement/connection/action. It neither exposes omitted IDs nor grants authority. Handler-layer facade survives subsequent requests; factory recreation invalidates old cursors.
- Nine protected endpoints under `/api/capability/{connections,targets,bindings}` are registered in the actual Protocol and Server aggregates. Capability authentication executes before Location construction. Mutation headers carry required idempotency key; HTTP body/IDs remain selectors. Expected Fail reasons become redacted transport DTOs; Die/Interrupt and annotations remain intact.
- Generated Effect and Promise clients expose `connections.list/get/targets/disconnect/createTarget/retargetTarget/removeTarget/bind/unbind`. Both Effect emitters omit absent/undefined optional query keys while preserving required validation and valid zero/false/null/empty values. Existing generated-consumer fixture regenerated through the generator. Client regenerated via `bun run generate`; final repeat produced no generated diff.
- SDK tests cover both generated clients through owning transport, actual SQL and production handler. Existing real `Orchestra.create()` test now reaches the aggregate connection route, in addition to operator delivery. Existing bearer renewal/Scope tests pass.

## Additional defects found and closed

Store extraction exposed narrow legacy caller error contracts. Discovery, channel/service wrappers and typed test fixtures now carry honest SQL unions; no unsafe Effect narrowing or first-Fail translation was introduced.

Channel mutation and artifact-retention observation used beta83 `result`/`onExit` paths that erased original failures. Explicit Exit composition now recovers only pure expected failures with successful observation; failing observations retain original reasons first, observation reasons afterward, preserving duplicate identities and annotations. Real SQL double-fault and no-redispatch tests cover expected and mixed failures.

Native `Fiber.interrupt` qualification found a pinned Effect failure-unwind defect: `getCont(contE)` restores interruptibility, then the failure loop skips the restoration continuation and loses the pending native Cause. Existing `patches/effect@4.0.0-beta.83.patch` now fixes source and dist, preserving the prior SSE schema patch. Private WeakMap origin lineage follows only Interrupt `.annotate` clones. Identity never derives from fiber ID or annotation contents: independent native requests with identical metadata remain distinct, manually reconstructed reasons stay distinct, and body reasons are never deduplicated. Native flags and interrupted-continuation skipping remain unchanged.

## Verification — focused local, not CI

Lead verified full branch file lists/diffs, independent cold slices of at most 400 changed LOC, reviewer fixes and measured author/lead mutation probes. Meaningful lead probes removed owner directory filtering, writer actor verification, Protocol auth, optional-query omission, handler cursor lifetime and native failure-unwind handling: each went red, then restored green. Author probes additionally cover identity-colliding native requests, receipt/privacy claims, rollback and aggregate registration.

Final package typechecks passed in Schema, Core, Protocol, Server, Client, sdk-next, httpapi-codegen and effect-drizzle-sqlite. Run commands from package directories only.

| Focused check | Observed result |
| --- | --- |
| Core management files | 25 passed, 1,138 assertions in the author's isolated tree; lead independently exercised the same files and actor probe |
| Core Store owner predicate | Lead mutation failed; restoration passed, 68 assertions |
| Native interruption primitive/channel files | Lead 16 passed, 249 assertions, after measured broken-unwind probe failed three cases |
| Core ledger | Final source has 23 tests, including writer-local verification rollback and exact-replay ownership check |
| Combined Core integration run | 74 passed, one cleanup-worker watchdog timeout during concurrent validation; isolated retry of that exact test passed, three assertions. Do not label this combined invocation green |
| Protocol connections | Lead 15 passed, 287 assertions |
| Server connections/errors | Lead 7 passed, 267 assertions |
| SDK Effect/Promise management | Lead 3 passed, 184 assertions |
| Actual owning embedded router | Lead 1 passed, 18 assertions, filter `embedded client uses the real router and handlers`, timeout 30000 |
| SDK operator transport | Lead 2 passed, eight assertions |
| Codegen optional-query/default-headers | Lead 20 passed, 294 assertions |
| Strict generated-consumer fixture | Lead 1 passed, seven assertions |
| Transaction Causes | Lead 15 passed, 245 assertions |

The embedded fixture deliberately uses unavailable model `test/embedded`; its expected ModelUnavailable log is not a vendor call. Native/HTTP qualification uses temporary SQLite and loopback servers, no paid/live vendor calls or account mutations.

Dependency installation must actually replace patched runtime copies. Ordinary install retained stale runtime in author mutation checks; use a scoped filtered `bun install --frozen-lockfile --ignore-scripts --force --backend copyfile` when applying this patch, then inspect installed source/dist. Lead reinstalled package filters with copyfile and verified the native tests in the integrated tree. No lock or manifest update was required.

## Durable branch references

| Area | Final reference |
| --- | --- |
| Store + downstream channel/error fixes | `560186a6c7329457faa90ca3ceace5e842694899` |
| Management | `9a06de44d9a9a4a03c6e64e936ad33715fd6c92d` |
| Protocol | `6126f39a00f66b9bc836809faf9a359eded8ed76` |
| Effect native unwind + whitespace-only patch context cleanup | `9ccaf67057` (semantic final `a7afee5a145992d74089b6958530dcaaf75d8358`) |
| Optional query generator + committed consumer | `c230ac4d3a2fcef13483da1bf9e54192b55d21ff` |
| HTTP/SDK delivery | `4cfebc40e881fdb1b2f524bc765a72ccd06b1a32` |

Task sessions: Store `ses_edcaf97f0ffeTQ2CZj5lUKSRqn`; Management `ses_edcaf97e4ffeacQUAlr6XIjfSI`; Protocol `ses_edcaf97d5ffeTm4Ev5raOHeUb1`; Effect `ses_edc48eaf1ffeznpzp7m5EZIq24`; query generator `ses_edc16f131ffeTzugrbu4WqqRnw`; HTTP `ses_edc39a63dffeGkpRDonrMHJDuC`. Wave author/reviewer worktrees and six temporary branches were pruned after integration; their source commits remain reachable from the campaign branch. Older partial reviewer trees intentionally have missing tracked files: never stage their large D statuses.

## Next campaign work

Next work must deliver verified connection setup and explicit account/target/binding UI against these APIs; never promote arbitrary caller subjectID to authenticated vendor identity. Artifact export/share/bytes, job/process controls, schedule/watch/delivery, further native integrations and App/Claude/CodeMode adaptation remain in the campaign plan. Acceptance of all 32 assets, packaged/platform matrix and live vendor scope/entitlement qualification remain open. Final-only PR/CI cadence stays active.
