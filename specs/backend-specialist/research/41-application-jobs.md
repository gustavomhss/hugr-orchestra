# R41 — Typed leverage for preselected application jobs and external APIs

Research date: 2026-10-03. Primary documentation, tagged source, release metadata, package metadata inspected. API excerpts and prescribed tests below **not executed or compiled**.

## Decision boundary and conditional recommendation

**Architecture owner selects; the backend specialist implements against that selection.** Scope: application business effects—refunds, invoice exports, order processing. Agent persistence, scheduling and permissions belong to harness/Maestro/Atlas.

Keep four mechanisms: **M1 typed durable effect calls; M2 atomic database/job boundaries; M3 typed task composition; M4 generated external-service clients.** M4 usually offers smallest marginal operational cost. M2 pays when application already uses selected Postgres queue. M1/M3 pay when selected application topology already needs durable multi-step execution. Installing workflow platform to shorten one small function has poor payoff.

Owner-provided implementation packet must contain:
- Selected mechanism/product; exact SDK, runtime patch, server/image or managed environment, database/driver and API/schema versions; existing registration/deployment entrypoint.
- Input/output schemas and business-operation identity; immutable request fields; same-key/different-payload rule; idempotency scope, retention and outcome after expiry.
- Effect boundaries and transaction membership; retryable/terminal errors; attempts, backoff, deadlines, cancellation, retry ownership across HTTP SDK and job runtime; prescribed compensation or ambiguous-outcome behavior.
- Exact target files and allowed edits; supplied interfaces/adapters; fixture/fault controls; expected results and exact check commands/package working directories. Paths in examples below are illustrative, not discovered repository targets.
- The backend specialist writes domain mapping, validators, selected SDK calls and prescribed tests. Missing contract field returns to owner; platform choice, investigation, diagnostic workflows and scope expansion stay outside the backend specialist assignment.

## Version, license and operational evidence

Reference snapshots, not an integration-tested compatibility matrix. Runtime minima/support statements are not deployment pins; owner supplies actual patch/image. Managed-service terms are separate from source licenses.

| Product | Inspected SDK/server version and runtime | License and operational cost |
|---|---|---|
| Restate | SDK **1.17.2**, server **1.7.13**; [tagged README](https://github.com/restatedev/sdk-typescript/blob/v1.17.2/README.md) supports Node ≥22, Bun or Deno; SDK/server compatibility table included | [SDK MIT](https://github.com/restatedev/sdk-typescript/blob/v1.17.2/LICENSE); [server BSL-1.1](https://github.com/restatedev/restate/blob/v1.7.13/LICENSE). Stateful Restate service, durable storage, deployment registration and retained journals required. |
| Temporal | [TS packages **1.24.0**](https://github.com/temporalio/sdk-typescript/blob/v1.24.0/packages/worker/package.json), [server **1.32.0**](https://github.com/temporalio/temporal/releases/tag/v1.32.0); [supported Node 20/22/24](https://github.com/temporalio/sdk-typescript/blob/v1.24.0/README.md), worker package ≥20.3 | SDK MIT; [server MIT](https://github.com/temporalio/temporal/blob/v1.32.0/LICENSE). Service plus persistence/Cloud, separate workers, history and versioning obligations. Native Core/Node sandbox; Bun client compatibility does not establish supported Bun workers. Keep `@temporalio/*` versions aligned. |
| DBOS | [`@dbos-inc/dbos-sdk` **5.2.11**](https://registry.npmjs.org/@dbos-inc%2fdbos-sdk/5.2.11), Node ≥20; Drizzle datasource **5.2.11** | MIT package metadata. [Embedded library + Postgres](https://docs.dbos.dev/architecture), system schema/checkpoints; optional Conductor. Single-process restart recovery and distributed failover differ: distributed recovery needs owner-supplied coordination, e.g. Conductor. |
| Trigger.dev | [SDK **4.7.2**](https://github.com/triggerdotdev/trigger.dev/blob/v4.7.2/packages/trigger-sdk/package.json), engine/CLI release **4.7.2**; SDK Node ≥18.20; task execution runtime separately selected | [SDK MIT](https://github.com/triggerdotdev/trigger.dev/blob/v4.7.2/packages/trigger-sdk/LICENSE), [platform Apache-2.0](https://github.com/triggerdotdev/trigger.dev/blob/v4.7.2/LICENSE). [Self-host stack](https://trigger.dev/docs/self-hosting/overview): webapp, Postgres, Redis, supervisors/runners; keep CLI/release aligned. Docs list checkpoints and autoscaling as Cloud-only. |
| Hatchet | [TS SDK **1.33.1** at server tag **0.107.0**](https://github.com/hatchet-dev/hatchet/blob/v0.107.0/sdks/typescript/package.json), Node ≥20 | [MIT](https://github.com/hatchet-dev/hatchet/blob/v0.107.0/LICENSE). [API/engine + Postgres + connected workers](https://docs.hatchet.run/v1/architecture-and-guarantees); RabbitMQ optional in larger deployments. Application execution state remains engine-specific. |
| River | [**0.48.0**, Go **1.26.0**, toolchain **1.26.6**](https://github.com/riverqueue/river/blob/v0.48.0/go.mod) | [MPL-2.0](https://github.com/riverqueue/river/blob/v0.48.0/LICENSE), file-level copyleft. Postgres-backed path assessed: migrations, worker lifecycle, connection/load budget and retention. Pro features separate; base typed jobs/transactional enqueue suffice here. |
| Graphile Worker | [**0.18.0**](https://github.com/graphile/worker/blob/v0.18.0/package.json); [Node ≥22.18, Postgres ≥12 feature floor](https://worker.graphile.org/docs/requirements), upstream drops EOL support | MIT. Postgres schema/functions plus Node workers; operational coupling to application database. Core queue assessed; Pro separate. |
| OpenAPI TypeScript/fetch | [generator **7.13.0**](https://github.com/openapi-ts/openapi-typescript/blob/openapi-typescript%407.13.0/packages/openapi-typescript/package.json), [client **0.17.0**](https://github.com/openapi-ts/openapi-typescript/blob/openapi-fetch%400.17.0/packages/openapi-fetch/package.json); generator docs recommend Node ≥20; fetch client documents Node ≥18 | Both MIT. Build-time schema generation plus small HTTP client; vendor API remains runtime dependency. Pin schema revision and generator; provider semantics do not come from OpenAPI. |
| Stripe Node | [**23.0.0**, Node ≥20](https://github.com/stripe/stripe-node/blob/v23.0.0/package.json); [API **2026-09-30.endive**](https://github.com/stripe/stripe-node/blob/v23.0.0/src/apiVersion.ts), [OpenAPI revision **v2526**](https://github.com/stripe/stripe-node/blob/v23.0.0/OPENAPI_VERSION) | MIT SDK; Stripe account/API commercial dependency. Generated resource methods and types plus maintained HTTP behavior. |

Restate BSL grant permits licensee-authored production applications/internal platforms; restricts public managed services exposing Restate APIs for third-party deployments. Each release changes to Apache-2.0 after four years. MIT SDK does not erase server licensing or operational coupling.

## M1 — Typed durable effect calls: Restate, Temporal, DBOS

**Input task:** “Implement already-designed refund → record receipt workflow; retain refund ID through worker restart.” `RefundInput` and `refund(input): Promise<string>` are supplied application contracts; effect implementation appears in M4.

| Selected engine | Actual API shape | Runtime supplies; direct code payoff |
|---|---|---|
| Restate | `await ctx.run("refund", () => refund(input), { maxRetryAttempts: 3 })`; typed service composition: `ctx.serviceClient<Billing>({ name: "Billing" }).refund(input)` | Records completed step results; replays handler against journal; retries unfinished work. Typed service proxy preserves declared handler arguments/results. Replaces custom progress flags, replay dispatch and RPC DTO duplication. |
| Temporal TS | `proxyActivities<{ refund: typeof refund }>({ startToCloseTimeout: "30 seconds", retry: { maximumAttempts: 3 } })`, then `await effects.refund(input)`; import `refund` with `import type` | Records Activity scheduling/results in Workflow history; dispatches and retries Activities, replays deterministic Workflow code. Function-signature proxy removes hand-written task-name/argument/result wrappers. |
| DBOS | `const refundWorkflow = DBOS.registerWorkflow(async (input: RefundInput) => DBOS.runStep(() => refund(input), { name: "refund", retriesAllowed: true, maxAttempts: 3 }), { name: "refundWorkflow" })`; `await DBOS.startWorkflow(refundWorkflow, { workflowID: input.operationId })(input)` | Stores input/step outputs in Postgres; returns typed workflow handle/result; skips checkpointed steps on recovery. Replaces application resume bookkeeping without separate orchestration server. |

**The backend specialist still writes:** effect bodies, runtime input checks, compact serializable outputs, prescribed business branches/error translation, compensation when specified, and bindings in supplied endpoint/worker. Deterministic sequencing and deployed-code compatibility remain obligations. Numerical settings above illustrative; retry/attempt fields must follow selected SDK semantics and owner contract.

**Failure limits:** Restate normally retries errors except `TerminalError`; Temporal Activities can repeat after timeout or lost completion, and cancellation delivery depends on heartbeats/cooperation. DBOS step error retries require explicit enablement (`shouldRetry` can filter errors); uncaught workflow exceptions terminate workflow. DBOS step timeouts are cooperative: ignored abort can leave work running while retry starts. Completed journal/history/checkpoint entry suppresses replay of that effect; external acceptance **before** entry persistence remains duplicate-effect window.

**Admission limits:** Restate ingress idempotency keys have configurable retention (documented default: 24 hours after completion); Temporal needs explicit Workflow ID conflict/reuse policy; DBOS same workflow ID returns existing handle by default. These identities govern admission, not atomicity with payment provider or application DB. Same-key payload equivalence must follow application contract, not inferred from typed signatures.

**Prescribed valid test:** valid partial-refund input returns expected ID and reaches receipt step; permanent business rejection takes specified terminal path, transient error follows prescribed retry policy. Runtime checkpoint observer must confirm refund completion before recovery test.
**Prescribed lost-response tests:** (1) proxy confirms provider accepted refund, holds response until worker terminated before checkpoint, then drops response; restart same execution: replay uses identical business idempotency key and returns same refund ID, with one provider refund despite repeated requests. (2) persist step completion, stop worker before receipt: recover same execution; recorded refund returns without another provider request. (3) lose workflow-admission response: repeat stable identity and assert same execution or prescribed duplicate-ID reconciliation within retention.

Primary semantics: Restate [steps](https://docs.restate.dev/develop/ts/durable-steps), [typed RPC](https://docs.restate.dev/develop/ts/service-communication), [ingress retention](https://docs.restate.dev/services/invocation/clients/typescript-sdk); Temporal [typed Activities](https://docs.temporal.io/develop/typescript/activities/execution), [timeouts/heartbeats](https://docs.temporal.io/develop/typescript/activities/timeouts), [client](https://docs.temporal.io/develop/typescript/client/temporal-client); DBOS [workflows](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial), [steps/retries/cancellation](https://docs.dbos.dev/typescript/tutorials/step-tutorial).

## M2 — Atomic application database/job boundaries: River, Graphile, DBOS transactions

**Input task:** “Commit order and enqueue receipt together in existing Postgres transaction.” For selected DBOS design, related task: “Commit account credit and its workflow checkpoint together.”

| Selected implementation | Actual code/API | Runtime supplies; the backend specialist still writes |
|---|---|---|
| River | ``type ReceiptArgs struct { OrderID string `json:"order_id"` }``; `func (ReceiptArgs) Kind() string { return "receipt" }`; `client.InsertTx(ctx, tx, ReceiptArgs{OrderID: id}, nil)`; worker accepts `*river.Job[ReceiptArgs]` | Queue insert participates in caller's transaction; typed args serialize/decode into typed worker. The backend specialist writes order SQL, transaction/error handling, registration and receipt effect; hand-built enqueue relay unnecessary for this same-DB path. |
| Graphile Worker | Same transaction/connection: `SELECT graphile_worker.add_job('receipt', json_build_object('orderId', $1), max_attempts := 3)`; executor `Task` receives `unknown` payload | SQL enqueue + queue claiming/retry. The backend specialist validates payload and implements receipt. `GraphileWorker.Tasks` augmentation enables typed `addJob`/`Task<"receipt">`, but direct SQL and old queued payloads bypass compile-time types. |
| DBOS datasource | `await dataSource.runTransaction(() => creditAccount(dataSource.client, input), { name: "credit" })` using selected Drizzle datasource | Atomically commits application SQL and datasource checkpoint in that database transaction. The backend specialist writes typed ORM query/business constraints and binds supplied datasource; plain `DBOS.runStep` around arbitrary SQL does not supply this atomicity. |

**Failure/transaction limits:** atomic enqueue closes DB→queue dual-write gap, not DB→HTTP gap. River/Graphile workers may execute again after effect succeeded but completion was lost. River `river.JobCompleteTx[*riverpgxv5.Driver](ctx, tx, job)` can co-commit DB-only changes and completion; ordinary completion happens separately. DBOS guarantee likewise covers participating database writes/checkpoint, not external APIs, another datasource or entire workflow.

**Idempotency limits:** River unique-job rules have configured args/state/time scope and job-retention horizon. Graphile `job_key` default can replace queued payload or create second job when first locked; successful jobs are deleted, so key is not permanent dedupe history. The backend specialist still implements owner-prescribed unique business-operation admission and immutable-payload check; on exact retry, enqueue only when operation is newly admitted. Never equate enqueue uniqueness with external-effect uniqueness.

**Prescribed valid tests:** with worker paused, committed transaction yields order plus executable job; rollback yields neither, observed from second connection; resumed worker sees committed order. For DBOS datasource, valid credit returns expected balance and checkpoint.
**Prescribed lost-response tests:** drop DB commit acknowledgement after server commits, retry same business operation, assert one order/admission and one enqueue before draining worker. Kill worker after external receipt acceptance but before completion and assert provider-specific dedupe/ambiguity contract. For DB-only River completion or DBOS transaction, lose commit response and recover; assert one balance change and durable job completion/checkpoint. Inspect DBOS datasource checkpoint while workflow remains open: completion cleans datasource checkpoints. Mocked transaction callback cannot prove these outcomes.

Primary semantics: River [typed jobs/InsertTx](https://riverqueue.com/docs/inserting-and-working-jobs), [transactional enqueue](https://riverqueue.com/docs/transactional-enqueueing), [at-least-once/JobCompleteTx](https://riverqueue.com/docs/reliable-workers), [uniqueness](https://riverqueue.com/docs/unique-jobs); Graphile [SQL API](https://worker.graphile.org/docs/sql-add-job), [types](https://worker.graphile.org/docs/typescript), [job-key limits](https://worker.graphile.org/docs/job-key); DBOS [transaction/checkpoint boundary](https://docs.dbos.dev/typescript/tutorials/transaction-tutorial), [datasource metadata](https://registry.npmjs.org/@dbos-inc%2fdrizzle-datasource/5.2.11).

## M3 — Typed task composition and results: Trigger.dev, Hatchet

**Input task:** “Implement prescribed invoice-render → publish job graph, or prescribed render batch.” High payoff: payload/output inference and durable parent-child result plumbing replace stringly typed messages, result polling and hand-written join state.

Trigger.dev API excerpt, inside supplied task modules; `renderInvoice` is supplied domain function:
```ts
import { task, idempotencyKeys } from "@trigger.dev/sdk"
export const render = task({
  id: "render-invoice",
  retry: { maxAttempts: 3 },
  run: async (input: { invoiceId: string }) => renderInvoice(input.invoiceId),
})
// Inside the selected parent task's run function:
const idempotencyKey = await idempotencyKeys.create(input.operationId, { scope: "global" })
const rendered = await render.triggerAndWait({ invoiceId: input.invoiceId }, { idempotencyKey }).unwrap()
```
`rendered` inherits child return type. `triggerAndWait` is task-only; `.unwrap()` throws on child failure, while raw result uses `ok`/`output`/`error`. Selected batch uses `render.batchTriggerAndWait([{ payload: { invoiceId } }])`, not `Promise.all` around wait calls. Backend trigger can use type-only task import with `tasks.trigger<typeof render>("render-invoice", payload, options)`.

Hatchet alternative, supplied client and illustrative TTL:
```ts
const dag = hatchet.workflow<{ invoiceId: string; operationId: string }>({
  name: "invoice-export",
  idempotency: { strategy: "ttl", expression: "input.operationId", ttlMs: 3_600_000 },
})
const render = dag.task({ name: "render", fn: (input) => renderInvoice(input.invoiceId) })
dag.task({ name: "publish", parents: [render], fn: async (_, ctx) => publish(await ctx.parentOutput(render)) })
```
Parent reference carries output type; engine persists completed task outputs and resolves declared dependencies. Boundary validation still requires supplied schema/validator; TS annotation alone validates nothing at runtime.

**The backend specialist still writes:** actual rendering/upload code, input validation, prescribed task graph, branch/error handling, stable business keys and worker/task registration in provided files. Artifact references and deterministic destination keys come from contract. Engine supplies task dispatch/retry, retained results and parent waits; deployment, retention and engine migration remain operational costs.

**Failure/idempotency limits:** Trigger retries run body from top. Trigger key deduplicates triggers only; child can retry its own effects. Since 4.3.1 raw strings inside tasks default to parent-run scope; explicit global scope still scoped to task/environment. Keys default to 30-day TTL and failed runs clear key. Hatchet is at-least-once; TTL-based keys suppress admission within window, status-based keys release at terminal state. Hatchet duplicate SDK trigger raises `IdempotencyCollisionError` carrying `existingRunExternalId`, unlike Trigger's existing handle. Neither engine makes application DB updates atomic with remote trigger or upload.

**Prescribed valid test:** expected child payload/output flows into publish; selected batch preserves prescribed item/result association; exhausted child failure follows declared parent policy. Include wrong-payload/wrong-output typecheck fixture plus runtime malformed-payload case.
**Prescribed lost-response tests:** let engine accept trigger, drop reply, repeat key: Trigger returns same run; Hatchet collision identifies original run. Resume within same parent/graph execution after recorded child success and assert retained child reused. Separately accept upload then lose task completion: retry must reuse deterministic object/business operation key. Exercise configured TTL expiry/failure-key release; new admission is allowed there and external dedupe remains separately required.

Primary semantics: Trigger [task definition](https://trigger.dev/docs/tasks/overview), [typed waits/batches](https://trigger.dev/docs/triggering), [idempotency limits](https://trigger.dev/docs/idempotency); Hatchet [tasks](https://docs.hatchet.run/v1/tasks), [typed DAG](https://docs.hatchet.run/v1/directed-acyclic-graphs), [collision/TTL/status behavior](https://docs.hatchet.run/v1/idempotency).

## M4 — Generated external-service clients with explicit effect contract

**Input task:** “Implement selected Stripe partial-refund adapter” or “map approved CMS OpenAPI operation into existing sync job.” Prefer maintained vendor SDK when available; owner-approved generation useful when vendor supplies reliable versioned schema but insufficient client.

Concrete Stripe effect body, called only at selected job/activity/step boundary:
```ts
import Stripe from "stripe"
const stripe = new Stripe(apiKey, { apiVersion: "2026-09-30.endive", maxNetworkRetries: 1 })
const refund = await stripe.refunds.create(
  { payment_intent: input.paymentIntentId, amount: input.amount },
  { idempotencyKey: `refund:${input.operationId}`, timeout: 10_000 },
)
return refund.id
```
Stripe [generated source](https://github.com/stripe/stripe-node/blob/v23.0.0/src/resources/Refunds.ts) exposes `RefundCreateParams`, `RequestOptions`, `Promise<Response<Refund>>` and resource methods generated from OpenAPI. SDK handles serialization, auth transport, typed error objects, pagination helpers and bounded network retry. Returned refund object/ID is API acceptance, not proof refund reached terminal `succeeded`; owner supplies status/webhook policy.

Generic typed-code generation path: owner supplies pinned OpenAPI 3.0/3.1 artifact/hash and package-local generator, e.g. `openapi-typescript vendor.yaml -o src/generated/vendor.d.ts` (not run here). Generated `paths` feed actual client:
```ts
import createClient from "openapi-fetch"
import type { paths } from "./generated/vendor"
const client = createClient<paths>({ baseUrl })
const result = await client.GET("/blogposts/{post_id}", { params: { path: { post_id: input.postId } } })
```
Path/method, required parameters, request bodies and declared success/error response shapes derive from schema. `result.data`/`result.error` depend on HTTP outcome; network failures can throw. [Generator](https://openapi-ts.dev/introduction) emits runtime-free types; [fetch wrapper](https://openapi-ts.dev/openapi-fetch/) supplies transport/serialization, not durable retry, runtime response validation or business success checks. The backend specialist writes mapping, supplied validation/auth/error policy and domain-result handling, not duplicate DTOs or hand-built endpoint serializers.

**Idempotency/transaction limits:** use operation ID stable across worker/process retries and separate application runs, scoped to business action/account; SDK-generated per-request keys alone do not establish that scope. Stripe [idempotency](https://docs.stripe.com/api/idempotent_requests) saves first executed status/body, including `500`; mismatched parameters error; keys may be pruned after ≥24 hours; validation/concurrency rejection before execution is not saved. Cross-DB atomicity remains absent. Plain “check sent flag, send, mark sent” leaves crash gap; without provider dedupe/query, owner must prescribe ambiguous outcome rather than fabricate exactly-once behavior.

**Retry contract:** pin aggregate job/SDK budget and timeout behavior. Stripe 23.0.0 [README](https://github.com/stripe/stripe-node/blob/v23.0.0/README.md#network-retries) documents one connection-closed reattempt even with `maxNetworkRetries: 0`; zero is not universal single-send guarantee. HTTP timeout/cancellation does not prove provider rejected operation. Match API version to generated types; tolerate documented open enums and validate domain invariants.

**Prescribed valid test:** sandbox partial refund yields expected payment/amount and refund ID; CMS request uses correct path encoding and maps declared response. Wrong amount type/missing path parameter must fail selected package typecheck; malformed runtime response must take specified validation path.
**Prescribed lost-response test:** funded sandbox payment leaves room for multiple partial refunds; proxy confirms provider acceptance, holds reply until process terminated before completion acknowledgement, then discards reply. New process reconstructs SDK and retries identical operation/key/parameters within retention. Assert same refund ID, one provider refund, multiple observed HTTP attempts. Change parameters under same key and assert provider rejection. Simulated post-retention ambiguity must follow owner contract, not blind create. Without stable cross-process idempotency key, duplicate partial refunds must make test fail—full refund would be weak control because provider may reject second refund anyway.

## Prescribed verification reach

Tests above are acceptance recipes for future selected implementation, **not results from this research**. Owner supplies available service/sandbox fixtures and fault hooks; research performed documentation/metadata reads only.
- Exercise actual SDK against selected engine/database/provider sandbox. Unit fakes can check mapping; they cannot establish runtime durability, transaction membership or provider idempotency.
- Every lost-response test proves fault happened **after acceptance/commit**, then observes durable business state and identities. Merely throwing before outbound call does not exercise uncertain success.
- Calibrate checks with owner-prescribed negative controls: wrong typed payload rejected; changing retry key causes duplicate partial effect; moving enqueue outside transaction breaks rollback expectation. Fault-hook-not-reached or missing environment is failed/incomplete evidence, not passing coverage.
- The backend specialist runs exactly packet checks from supplied package directory; for this repository, typecheck uses `bun typecheck`, never direct `tsc` or root tests. Platform selection and service provisioning belong in architecture packet before implementation begins.

**Bottom line:** typed SDKs remove translation and recovery boilerplate when aligned with preselected design. Durable completion, unique admission and provider idempotency are separate guarantees. Keep those boundaries explicit; price server/runtime ownership before crediting shorter business code.
