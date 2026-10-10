# Native capabilities campaign — compaction handoff

## Resume instruction

Read this file first after compaction, then `capability-management-results.md`. Owner resumed after the earlier pause; the connection/target/binding management wave is now implemented and integrated. All dispatched authors/reviewers have returned. The older sections below preserve the pre-wave checkpoint history; use the results report for current implementations, corrections and verification.

User communication: Portuguese, persistent **caveman full**. Keep technical substance; code, commits and PRs use normal English. User explicitly authorized parallel work, **up to 10 agents**. Keep architecture/contracts/integration judgment with lead; isolated worktree per author/reviewer.

## Workspace and recoverable checkpoint

- Active worktree: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/native-capabilities`.
- Active branch: `native-capabilities`.
- Last completed integration: `e43015e98cd908f06a4b7d023afdc7035878514a` — scoped operator requests delivered to embedded clients.
- Current source checkpoint: `4cfebc40e881fdb1b2f524bc765a72ccd06b1a32` — shared connection Store, operator management, protected HTTP delivery, regenerated Effect/Promise clients and actual owning SDK route. Original contract-only checkpoint: `0b9590b305`.
- Remote: `fork` = `git@github.com:gustavomhss/hugr-orchestra.git`; branch pushed. Default/base branch `dev`, never assume local `main` exists.
- Original checkout `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical` is user-owned; preserve its existing changes.
- Untracked references deliberately preserved: `specs/orchestra-capabilities/` and `reports/Tools concretas para Orchestra.md`. Do not sweep them into commits.
- This handoff is committed separately after the source checkpoint; use `git log -3` for its final commit.

## Campaign goal and cadence

Native integration of **32 approved OpenClaw/Hermes assets**, actual canonical execution, selected accounts/targets, durable evidence, API/client/UI delivery, source/license provenance and semantic qualification. Shared foundations or fixtures do **not** close any A01–A32 asset.

Owner overrides for this campaign:

- **One PR and CI run only at campaign end**, no intermediate PRs/CI, including agents.
- Focused local tests explicitly allowed: `ORCHESTRA_LOCAL_TESTS=1 bun test ./test/<file>.test.ts` from the owning package. No full suites/heavy vendor qualification locally.
- `bun typecheck` from package directories only; never root typecheck or direct `tsc`.
- No paid/live vendor calls, credentials/login/account mutations, large qualification downloads, app/server restart, global env/test-guard changes.
- Commit/push explicitly owned files; inspect status, diff, recent log and complete branch file list. No `git add -A`, amend/rebase/reset/force/config changes. Normal merges.
- Independent cold reviews in slices **<=400 changed LOC**; meaningful measured mutation probes before landing. Local green is not CI green.
- Runtime dependency direction: Schema -> Core/Protocol -> Server. Client runtime only Schema/Protocol, never Core/Server. `sdk-next` composes Client/Core/Server.
- After public Protocol/Server HttpApi changes: `bun run generate` in `packages/client`; never hand-edit real generated directories. Legacy JS SDK regeneration: `./packages/sdk/js/script/build.ts` when its API changes.
- Branches <=3 words, hyphens, no slashes/type prefixes. Conventional commit messages.

## What is integrated

### Foundations and canonical execution

- Existing prerequisite chain: Schema capability IDs/refs/results/failures, source catalog/notices, descriptor store, typed permission bridge, registration identity and real Core runner binding.
- Connections: explicit credential/integration/account/endpoint references, selected targets and Session/actor bindings, generations, exact credential release, HTTPS endpoints. No ambient/newest-login selection.
- Artifacts: immutable CAS/revisions, bounded bytes/MIME verification, Session references/shares, independent durable pins, DB-storage namespace, retention/quota and private-root checks.
- Jobs: atomic `admit(...requestHash)` -> `{ref,reused}`, stable primary intent identity, truthful observations/CAS, acquired host facts, unknown submission never redispatched.
- Runtime installer: shared authentic pinned installation, bounded concurrency/coalescing, Context-preserving detached installs, real executable/readiness checks.
- Private `CapabilityInvocation` frame: original persisted root plus durable child lineage. `CapabilityPolicy` opaque permits belong to facade WeakSet; approval before locks; actor state before top-level SQLite writer; current root/placement/deny rechecked in commit.
- `CapabilityChildren`: stable SHA child IDs from parent invocation + host ordinal; durable admission/lifecycle before/after captured canonical settlement, depth8/sibling64 limits, exact ancestry, no extra model tool parts, no replay of prior child intent.
- `ToolRegistry.captured` exposes the issuing materialization only inside canonical settlement. Definition/token metadata never grants authorization.
- Error text uses the same dynamic `ToolOutputStore` byte/line limits and retention boundary as successful text. Mixed failures retain defects/interruption and annotations.

### Native leaves and MCP

- Channels: actual Slack/Discord read/send/update adapters, selected resources, permission/membership checks, durable one-shot mutation intent/ACK retention and honest ambiguity.
- Media: actual OpenAI generation/artifact edits, Runway submissions/observations; actual image decoding, bounded payload builders, interruptible HTTP + masked ACK persistence. MP4/CDN/cancel/live entitlement qualifications remain open.
- Documents/Sheets: actual bounded workers/PDF transforms/forms/raster and XLSX/CSV operations, ZIP/raw-cache safeguards, reopen/semantic checks; unsupported features fail closed. Packaged worker/WASM/RSS/platform qualification remains open.
- Discovery: bounded metadata/catalog, exact owner/ref/TTL/generations/schema/registration scope, real lazy Ajv validation, atomic descriptor/cursor publication cleanup.
- Native MCP Streamable HTTP: selected HTTPS provider host/credential, init/version/session negotiation, JSON/SSE, bounded acquisition, pagination/correlation, no mutation repost, joinable scoped disposal. No legacy SSE/stdio/resumption/tasks/OAuth-refresh claim.
- `service_find/describe/call` + twelve fixed `platform_<provider>` leaves. Service call admits a real child through the captured registry; platform leaf validates schema/selection, durable worker intent and output, preserves ACK facts and redacts credentials.
- Final dispatch checks include generic `service_call` resource, last-approval same-session catalog refresh, real allocator `validateCurrent`, and same-permit selected-state/root/token fence.
- Post-ACK inline data disclosure is fenced after cleanup/persistence. Larger JSON goes to immutable artifact with native action + **selected-state condition checked inside publication writer after approval**.
- `Tool.withOnDemand` is catalog metadata only. Default advertisement hides platform leaves; eligible definition/token lookup and canonical settlement remain available. Explicit host advertisement does not widen whole-tool eligibility or leaf permissions.
- Core Location production composition already includes `CapabilityTools.node` **transitively** via `BuiltInTools.node`. A prior exploration agent incorrectly called direct omission a gap; lead corrected it.

### Operator foundation and host/client delivery

- `CapabilityOperator.make` owns scoped principal/grants, opaque authorities/private request frames, random32-byte Bearers (digest storage), restrict-only delegation, expiry/revocation/capacity and Scope shutdown. Configured authority is trusted-host-only after Basic authentication.
- `CapabilityRequest` ledger atomically commits **local SQL-only** mutations and redacted JSON receipts. Key identity is principal + idempotency key, not payload/operation/resource. Exact retry returns original receipt; conflicts fail. Current grants and actual target checked before/inside/after writer callbacks; no fake Tool.Context or remote execution.
- Core SQL request table + generated migration: `20261009225521_capability_operator_requests.ts`.
- Protocol/Server capability middleware: independently validates Basic when configured; auth-disabled capability routes require exact host Bearer. Fresh server UUID, strict idempotency header, no query/cookie/PTY/body identity bypass. Whole mixed Causes preserved/redacted per reason.
- Public `GET /api/capability/operator` -> requestID/principal/origin/scopeHash only. Auth runs **before** caller-selected Location construction. Actual placement is checked by operator scope.
- `createRoutes(password?, operator?)`, `createEmbeddedRoutes(operator?)` accept trusted injected facade; otherwise Server creates scoped owning facade. Existing Desktop/CLI configured Basic delivery remains supported. Auth-disabled standalone host must explicitly deliver/inject its owning capability; no anonymous capability-route access.
- `sdk-next` creates its owning facade, injects it into real embedded router and supplies SDK Bearer via generated Effect client headers. Transport renews expired defaults under semaphore, preserves explicit overrides, and cannot outlive owning Scope.
- Effect codegen supports immutable validated default headers in both emitters; request overrides win, FormData boundary preserved, malformed headers throw value-free errors. Real Client regenerated after public API change.
- SQL fixes: native Bun prepare/safeIntegers/execute failures are classified only for actual SQLiteError; unexpected faults stay defects. EffectDrizzle transaction finalization retains original Cause reasons before cleanup reasons, including rollback/release/commit/Scope-close failures and interruption. `Cause.fromReasons` preserves duplicate cleanup faults.

## Important implementation traps

- Pinned Effect is `4.0.0-beta.83`; inspect installed exact source. Cached effect-smol can be beta98. Beta83 `catchTag`, `mapError`, `result`, `orDie` may extract first Fail and lose other mixed reasons. Use explicit Exit/full-reason handling at boundaries; preserve all unrelated Die/Interrupt and annotations.
- Reason `.annotate` needs `Context.makeUnsafe(new Map(reason.annotations))` in actual beta83; passing raw Map can crash despite misleading declaration/docs.
- Do not hide SQL failures with `as Effect` narrowing. Artifact/request error unions honestly include SQL classes for mixed Causes. Pure expected SQL-only failures are redacted; mixed faults propagate.
- Caller clock `now` is intentionally host callable, but must be excluded from JSON size measurement; otherwise its `toJSON` getter/method executes before Effect. All other scope data keeps complete serialized-byte bounds.
- Header validation must reject original edge/embedded CRLF and non-string/accessor values **before** native Headers coercion/trim. Native validation errors can contain tokens; replace known validation TypeErrors with constant messages.
- Filesystem artifact protection does not claim atomic ancestor confinement against malicious same-UID host. Logical committed quota does not cap physical staging/orphans.
- Independent child dispatchers restart ordinal namespace: reuse one dispatcher per parent/sibling producer; duplicate admission blocks redispatch.
- App/Claude remain legacy-root/permission-queue adaptation gaps; CodeMode still has raw MCP child path. Legacy MessageTable/PartTable projection does not establish required Core SessionMessageTable root. Do not manufacture IDs or relax root checks to bridge it.
- Core native deny floor is intentionally empty until actual host/App floor available; no App parity claim.

## Verification recorded before pause

All are **focused local** gates; cold source reviews and measured mutation failures/restoration performed. No campaign CI/PR created.

- MCP: 71 tests. Native service execution: 63. Service wrappers/allocator: 19.
- Operator authority: 23 / 1,169 assertions. Operator HTTP: 13 / 237 assertions.
- Operator request ledger: 21 / 377 assertions, real SQLite/Event/authority; writer checkpoint proves initial authorization before revocation while writer locked; real `INSERT OR ROLLBACK` mixed cleanup Cause covered.
- Header generator: 12 / 222 assertions, actual generated clients + loopback HTTP/SSE/FormData.
- SQLite prepare: 25 / 350 assertions. Transaction finalization: 15 / 245 assertions.
- Operator endpoint ordering: 1 / 7 assertions. SDK transport renewal/Scope: 2 / 8 assertions.
- SDK real embedded-router test: `test/embedded.test.ts -t "embedded client uses the real router" --timeout 30000`: 1 passed / 16 assertions. Deliberately unavailable `test/embedded` model emits expected ModelUnavailable log; no paid call.
- Core, Protocol, Server, Client, sdk-next, codegen package typechecks passed during integration.
- New management **checkpoint contracts only**: Schema + Core `bun typecheck` passed immediately before this handoff. No management implementation/runtime test exists yet.
- Mutations verified by lead include expired operator accepted when expiry removed, conflicting ledger payload replay when comparison removed, disabled-auth guard bypass, missing default auth headers, SQL errors becoming Die, transaction original Cause loss, auth-after-Location construction, and skipped bearer renewal.

## Historical next-wave plan — completed; see current results report

Initial artifacts checkpointed at `0b9590b305`:

1. `packages/schema/src/capability-management.ts`: connection summary/ref/state/credential-presence metadata; target ref-only summary; live keyset pages (`after`, limit1..32); strict target/binding/mutation inputs; opaque receipt `{requestID,reused,data}`.
2. `packages/core/src/capability/connection/store-contract.ts`: shared SQL writer interface with explicit actual Placement and Transaction; connection/target ownership/ref checks, target create/retarget/remove, disconnect, bind/unbind. Branded SessionID corrected; honest Error union.
3. `packages/core/src/capability/connection/management-contract.ts`: injected operators + shared Store; list/get/targets and six mutation methods. Methods not implemented.

Intended wave after light-context resume:

- Author A: factor shared `connection/store.ts` primitives from existing trusted `connection/index.ts`, retain model facade behavior/compatibility. One implementation of SQL ownership/generation/binding rules, no copied independent executor.
- Author B: `connection/management.ts` operator facade, real ownership/placement from stored opaque IDs, local mutation through `CapabilityRequest` receipts and shared Store. No Tool.Context or model invocation fabricated.
- Author C: Protocol groups for read/target/binding/disconnect endpoints; runtime dependencies Schema/Protocol only.
- Author D: thin Server handlers + real HTTP/SDK tests after dependencies. Lead owns aggregate routes, client contract, generation, manifests/migrations.
- Independent <=400-LOC cold slices; up to10 concurrent agents, disjoint ownership. Do not fan out unresolved design decisions.

Design points already identified, **still need final contract/packet decision**:

- Collection `list` uses authorized actual Location placement. Existing-ID routes must resolve owner from SQL; caller Location/query/body never retargets resource. Scope denial and unavailable foreign IDs should avoid existence oracle.
- Target mutations must recheck actual stored connection/target owner, state and generations **inside same writer** as request receipt. Target removal exact retry needs parent-placement proof even when target row gone; original immutable TargetRef carries connectionID, but validate authorized parent + target scope and exact original payload, never adopt arbitrary parent.
- Disconnect exact retries must reach ledger reconciliation even though connection is now disconnected/new generation; domain ref/state validation happens only on fresh callback, after current ownership/scope preflight.
- Public binding DTO has `{sessionID,actions}`, **no agentID**. Derive stable actor from actual stored Session; same placement required. Include derived actor in normalized idempotent payload; recheck Session actor inside writer so switch/race cannot silently bind another actor. Body IDs remain selectors, not grants.
- Read results must not disclose credential values/IDs, endpoints/signed URLs, scope hashes or raw target resource contents. Current DTO deliberately returns refs/state/presence only.
- Operator connection creation/subject verification is not in initial public DTOs. Existing Core `create` takes authenticated-adapter subject; do not expose arbitrary caller subjectID as proven vendor identity. Proper provider auth/connector and live qualification still own that prerequisite.
- C1 request ledger is SQL-only; no network/provider/approvals under writer. Avoid nested independent durable mutation or global Model context as shortcut.

## Key source references

- Architecture/planning local docs: `specs/orchestra-capabilities/{README,STUDY,ASSET-MAP,CONTRACTS,PLAN,ACCEPTANCE,REVIEW,IMPLEMENTATION}.md`. C1 public request context lines32–36; C2 selected connection/descriptor; I03A–D in PLAN.
- Core: `src/capability/{invocation,policy,children,tools,sql}.ts`; `operator/{contract,index,scope,request-contract,request,request-data}.ts`; `connection/index.ts`; `artifact/{index,selection,blob,mime}.ts`; `job/index.ts`; `catalog/{discovery,descriptors,cursors,schema}.ts`; `mcp/`; `service/`.
- Actual production graph: `src/location-services.ts:80` -> `tool/builtins.ts:36` -> CapabilityTools; native Registry replacements hoisted in LocationServiceMap.
- Server: `src/{auth,principal,operator,routes,location}.ts`, `middleware/capability-authorization.ts`, `handlers/capability-operator.ts`.
- Protocol: `src/{api,errors}.ts`, `middleware/capability-authorization.ts`, `groups/capability-operator.ts`.
- Client: `src/contract.ts`, generated promise/effect trees; generator source `packages/httpapi-codegen/src/index.ts`.
- SDK: `src/{orchestra,operator-transport}.ts`, `test/{operator-transport,embedded}.test.ts`.
- SQL: `core/src/database/sqlite.bun.ts`; `effect-drizzle-sqlite/src/effect-sqlite/session.ts`.
- Source/asset provenance: `packages/capability-assets/src/{providers,catalog,sources}.ts`, NOTICES/licenses; upstream clones pinned OpenClaw `2a305612539ccbb63a19b2030a05158dddd42a64`, Hermes `134e08ca6d272c9b9610ce5889e2ecff9c73adf0` under preapproved temp directory.

## Agents and worktrees — all stopped

Latest operator wave authors (reuse only after inspecting clean state/baseline; fresh context often preferable):

| Area | Task ID | Worktree / branch | Final authored checkpoint |
|---|---|---|---|
| Authority | `ses_edd1aa33affefdU0t0hdcqqn3Q` | `_worktrees/operator-authority` / `operator-authority` | `576a230e1b` |
| HTTP | `ses_edd1aa1d5ffe1ac0tOQeDJAXj2` | `_worktrees/operator-http` / `operator-http` | `902e7c79d6` |
| Request ledger | `ses_edd1aa1baffe79vMEgk1k2FHBe` | `_worktrees/operator-ledger` / `operator-ledger` | `ba669f7d27` |
| Headers | `ses_edd1aa1a7ffep6Og3kU3sCq5BT` | `_worktrees/client-headers` / `client-headers` | `cd6adc58c1` |
| SQLite prepare | `ses_edd036867ffeqD3zQzN5qPiRfu` | `_worktrees/sqlite-preparation` / `sqlite-preparation` | `94d2ea4220` |
| SQL finalization | `ses_edd036841ffeGo7YXSE0fvwKzp` | `_worktrees/sql-finalization` / `sql-finalization` | `5aee33c454` |

All integrated normally and pushed. Reviews approved after fixes; no active agent/writer work remains. Partial reviewer worktrees have intentionally missing unrelated tracked files/old HEAD plus populated target blobs; don't mistake their large `D` statuses for user deletions or stage them.

Skills used: techlead, agent-dispatch-and-landing, techlead-repo-maintenance, effect, instrument-calibration, caveman. Owner final-only CI cadence overrides generic skill intermediate-PR instructions.

## Remaining campaign obligations

Connection/auth setup, management APIs/UI, protected artifact bytes/share/export, jobs/process observation/control, durable schedule/watch/context/delivery, Workspace/mail/calendar/drive/Notion, vault opaque bindings, CLI recipes, Desktop HAR/widgets, App/Claude/CodeMode adaptation, cold packaged resources/OS matrix and real vendor sandbox/entitlement qualification. No 32-asset completeness or cross-platform/live acceptance claim. Resume next wave from contracts above, not from a claim that the campaign is finished.
