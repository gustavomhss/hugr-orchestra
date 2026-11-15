# S1-04 / B3 / D13–D18

Revisão de transporte v2: tabelas locais dos 190 membros copiadas byte a byte de `review-domain-disposition.md`; os campos e alegações locais não foram reescritos. A leitura integral indicada na origem pertence à produção B-v3 herdada. Esta revisão transporta evidência, sem criar aceite.

B3: propósito, contrato e delegação local; transporte sem novo julgamento/execução. Claims e gaps abaixo são exatos; Core/runtime amplos permanecem bloqueados.
Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
M<n> = `membership-exact.json#/domains/<n-1>`: 24 arrays/190 paths conferidos, nenhuma falta/duplicação/troca; hashes no manifesto. Não houve nova leitura integral dos190.
Q/P/G57 = suplemento herdado; U = complemento autorizado do baseline. Intervalos literais separados, sem elipse inserida. Comentários não são recibos.
Paths: S=`packages/schema/src/`; P=`packages/protocol/src/groups/`; H=`packages/server/src/handlers/`; R=`packages/server/src/`; T=`packages/sdk-next/src/`.

## D13 — Board owner and planning surface

Membership: M13; 4 paths exatos.

bounded_claim:

Board DTOs distinguish Board planning entities, owner payloads and tree/attempt-scoped check/queue facts. Protocol declares read/mutation results and refusals. Server uses the process Board.Service and a literal owner role in the settings adapter; this is not a per-person role resolution proof or evidence that CI/merge succeeded.

conditional_gap:

Board authorization, budget/queue algorithms, GitHub synchronization, CI truth and merge behavior require their implementations/runtime evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/board.ts` | Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado. | P13 |
| `packages/schema/src/board-queue.ts` | Derived queue state and tree-scoped check/attempt facts. | Q064 |
| `packages/schema/src/board.ts` | Maestro/owner payload distinction and input/output secret boundary. | Q063 |
| `packages/server/src/handlers/board.ts` | Expose Board queries and owner/action commands using the process service. | G57-E032, G57-E033 |

`Q063 · S:board.ts` L11–12
```ts
// The Projects board: Maestro plans projects, epics, issues and steps; the owner answers, comments, attaches,
// undoes, pauses and holds. "Project" elsewhere is the git repo, so board types are always Board.*.
```

`Q063` L687–693
```ts
// Owner write payloads (section 5). The owner's reason is optional.

export const AnswerInput = Schema.Struct({
  option: Schema.String,
  text: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AnswerInput" })
export type AnswerInput = typeof AnswerInput.Type
```

`Q064 · S:board-queue.ts` L78–85
```ts
/** One pass or fail fact, keyed by the tree it ran on. `board_ci_run` keeps the billing next to it. */
export const Check = Schema.Struct({
  id: CheckID,
  attempt: NonNegativeInt,
  kind: CheckKind,
  command: Schema.String,
  treeSha: Schema.String,
  commitSha: Schema.NullOr(Schema.String),
```

`Q064` L103–109
```ts
export const QueueResult = Schema.Struct({
  /** The PR head the card queued at; the bundle merges exactly this commit. */
  head: Schema.String,
  tree: Schema.String,
  state: ScopedState,
}).annotate({ identifier: "Board.QueueResult" })
export type QueueResult = typeof QueueResult.Type
```

`P13 · P:board.ts` L12–17
```ts
// A write the board's rules refuse; the message says what to do instead.
export class BoardRefusedError extends Schema.TaggedErrorClass<BoardRefusedError>()(
  "BoardRefusedError",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
```

`P13` L102–107
```ts
    HttpApiEndpoint.patch("board.noteEdit", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      payload: Board.NoteInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("noteEdit", "Edit a note", "Edit one of the owner's notes; GitHub and Maestro notes are refused.")),
```

`G57-E032 · H:board.ts` L9–12
```ts
    const board = yield* Board.Service

    return handlers
      .handle("board.list", (ctx) => board.summaries({ archived: ctx.query.archived }))
```

`U02 · H:board.ts` L20–20
```ts
      .handle("board.settings", (ctx) => board.settings(ctx.params.key, ctx.payload, "owner").pipe(mapErrors))
```

## D14 — Relay workflow, hooks and external ledgers

Membership: M14; 16 paths exatos.

bounded_claim:

Relay distinguishes editable drafts, immutable publication, workflow execution binding, structural hook export and ledger integrity. Hook matchers contain actual shared matching code; export shape alone does not validate graph rules or installation. Protocol separates authoring/check/trial and external audit. Server explicitly refuses public executable check with Maestro-required 403, coordinates project authoring/install services, and treats intact external self-reported ledgers as pending rather than independent proof.

conditional_gap:

Compiler/store invariants, matching equivalence, signature truth, hook enforcement, execution/recovery and atomic file/store/receipt updates remain blocked for claims requiring them. Product judge/oracle fields do not replace this task’s oracle.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/relay-document.ts` | Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria. | P37 |
| `packages/protocol/src/groups/relay-hook.ts` | Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall. | P38 |
| `packages/protocol/src/groups/relay-run.ts` | Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported. | P39 |
| `packages/schema/src/hook-glob.ts` | UTF-8 glob matcher shared by engine/UI with bounded brace nesting and platform separator. | Q065 |
| `packages/schema/src/hook-match.ts` | Path delegation and nonpath normalized wildcard matching. | Q066 |
| `packages/schema/src/relay-arm.ts` | Publication versus authority and plan/execution/task binding; host-owned checks and checkpoint intent. | Q080 |
| `packages/schema/src/relay-authoring.ts` | Incomplete draft contract preserves unknown keys; immutable version separate from live publication. | Q081 |
| `packages/schema/src/relay-external.ts` | Decoded ledger-to-display projection, not chain integrity verification. | Q082 |
| `packages/schema/src/relay-hook.ts` | Strict structural export delegates graph validation and install authority. | Q083 |
| `packages/schema/src/relay-ledger.ts` | Original-byte verification boundary and non-authorizing allow outcomes. | Q084 |
| `packages/schema/src/relay-run.ts` | Supervisor-owned run events are distinct from Relay arm ledger. | Q085 |
| `packages/schema/src/relay-sprint.ts` | Preserved original plan fields and deliberately limited control validation. | Q086 |
| `packages/server/src/handlers/relay-document.ts` | Adapt Relay document authoring, preview, trial and publication, including installed-hook lifecycle coordination. | G57-E094, G57-E096, G57-E099 |
| `packages/server/src/handlers/relay-hook.ts` | Install/update/enable/disable/reorder/uninstall and inspect pinned Relay hooks. | G57-E101, G57-E104, G57-E106 |
| `packages/server/src/handlers/relay-run.ts` | Read external Relay run ledgers, derive their displayed state, and expose a bounded audit result. | G57-E109, G57-E111 |
| `packages/server/src/relay-documents.ts` | Own the server-side project store adapter, document views, draft saving, skill compilation and refusal mapping. | G57-E131, G57-E134, G57-E135 |

`Q081 · S:relay-authoring.ts` L7–9
```ts
// Authoring documents in the relay_authoring shape (graph.py, store.py). A saved document may be an incomplete draft:
// node parameters stay open here and are checked by compile, which records diagnostics instead of refusing a save.
// Stored documents are Relay data, so unknown keys are preserved.
```

`Q081` L120–124
```ts
// The immutable body the `versions` table holds: one per publish (older stores also wrote one per save).
export const Version = Schema.Struct({ ...Document.fields, workflowId: Schema.String }).annotate({
  identifier: "RelayAuthoring.Version",
  ...preserve,
})
```

`Q080 · S:relay-arm.ts` L52–59
```ts
export const WorkflowBinding = Schema.Struct({
  definition: WorkflowDefinition,
  // External reference to the actual persisted revision; excluded from that revision's own hashed body.
  planRevisionID: Event.ID,
  executionSessionID: SessionID,
  authoritySessionID: SessionID,
  logicalTaskID: Schema.NonEmptyString,
}).annotate({ identifier: "RelayArm.WorkflowBinding" })
```

`Q083 · S:relay-hook.ts` L125–137
```ts
/**
 * The export. Structure only: the graph rules (one trigger, every node reachable, acyclic, ports in range, Block and
 * Approve only `before`) are `compile_hook`'s and the install writer's, with their own refusal messages.
 * `installed: false` is never install state; Orchestra's install record is.
 */
export const V1 = Schema.Struct({
  schema: Schema.Literal("relay.hook.v1"),
  name: NonEmptyNulFree,
  nodes: Schema.Array(Node),
  connections: Schema.Array(Connection),
  binding: Schema.Literal("host-required"),
  installed: Schema.Literal(false),
}).annotate({ identifier: "RelayHook.V1", ...strict })
```

`Q084 · S:relay-ledger.ts` L11–13
```ts
// These structs carry no excess-property annotation. Readers choose: `onExcessProperty: "error"` proves a line has
// exactly the known shape, `"preserve"` keeps lines from older writers readable. Integrity is never decided here:
// the verifier checks the original signed bytes and never reserializes a decoded line.
```

`Q066 · S:hook-match.ts` L5–6
```ts
// The hook condition matcher, shared by the engine (@orchestra/relay) and the app's hook Test, so a pattern holds in
// the Test exactly when it holds at runtime. Pure and platform-free: the caller says whether to fold case.
```

`Q066` L13–23
```ts
export const matches = (
  field: "path" | "tool" | "command" | "event",
  pattern: string,
  value: string,
  fold = false,
): boolean => {
  if (field === "path") return HookGlob.match(pattern, value)
  const normalized = pattern.replaceAll("\\", "/")
  const subject = value.replaceAll("\\", "/")
  return star(normalized, subject, fold) || (normalized.endsWith(" *") && star(normalized.slice(0, -2), subject, fold))
}
```

`P37 · P:relay-document.ts` L20–26
```ts
  "RelayForbiddenError",
  refusal,
  {
    httpApiStatus: 403,
  },
) {}

```

`P37` L306–312
```ts
    HttpApiEndpoint.post("relay.document.check", `${document}/check`, {
      params,
      query: LocationQuery,
      payload: RelayCheckInput,
      success: Location.response(RelayArm.CheckOutcome),
      error: [...RelayErrors, RelayForbiddenError],
    })
```

`P37` L353–358
```ts
    HttpApiEndpoint.post("relay.document.trial", "/api/relay/trial", {
      query: LocationQuery,
      payload: RelayTrialInput,
      success: Location.response(RelayTrial),
      error: [...RelayErrors, RelayForbiddenError],
    })
```

`P39 · P:relay-run.ts` L8–10
```ts
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
```

`G57-E096 · H:relay-document.ts` L158–164
```ts
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
          }),
        ),
```

`G57-E094 · H:relay-document.ts` L79–83
```ts
              )
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              RelayDocuments.save({
                store,
```

`G57-E104 · H:relay-hook.ts` L154–157
```ts
const binding = Effect.gen(function* () {
  const relay = yield* Relay.Service
  const location = yield* Location.Service
  return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
```

`G57-E101 · H:relay-hook.ts` L48–55
```ts
            yield* RelayDocuments.requireRepository
            const changed = yield* RelayHookInstall.install({
              ...(yield* binding),
              ...(yield* pinned(ctx.payload.document, ctx.payload.version)),
              document: ctx.payload.document,
              principal: Principal.of(ctx.request),
            })
            return yield* receipt(changed)
```

`G57-E111 · H:relay-run.ts` L94–108
```ts
// The external process records its own checks, so an intact chain proves only that nothing changed afterwards.
const audit = Effect.fnUntraced(function* (runID: string) {
  const ledger = yield* ledgerOf(runID)
  const result = yield* LedgerVerify.verify(ledger)
  const message = `${result.stdout}${result.stderr}`.split("\n")[0] ?? ""
  if (result.exit === 0)
    return {
      status: "pending" as const,
      code: "external-self-reported",
      rows: [
        { label: "Chain", value: "chain intact, self-reported" },
        { label: "Verifier", value: message },
      ],
    }
  return { status: "fail" as const, code: "ledger-broken", rows: [{ label: "Chain", value: message }] }
```

## D15 — Maestro product attribution and events

Membership: M15; 4 paths exatos.

bounded_claim:

Maestro context/attribution schemas carry actor/source references and versioned product events. PlanRevision V3 has a real missing-upstream-attribution filter; UpstreamAttribution explicitly says structural validation does not establish host-verified authorship. Public and durable-only inventories differ, and product work acceptance is separate from host verification.

conditional_gap:

Authenticity, author/dispatch authority, review independence, recovery and actual verification require product implementations and execution; these declarations grant no current Genesis PASS.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/config-maestro.ts` | Optional Atlas project/directory context configuration. | Q067 |
| `packages/schema/src/maestro-context.ts` | Grounding and actor/source-bound tool plan representation. | Q068 |
| `packages/schema/src/maestro-event.ts` | Versioned product governance facts; actual upstream-missing filter and durable-only inventory. | Q069 |
| `packages/schema/src/upstream-attribution.ts` | Strict versioned actor/dispatch references explicitly do not verify authorship. | Q070 |

`Q068 · S:maestro-context.ts` L10–16
```ts
export const Grounding = Schema.Struct({
  catalogVersion: Schema.NonEmptyString,
  snapshot: Schema.NonEmptyString,
  sourceRevision: GitHash,
  sourceIdentityHash: Hash,
  units: Names.check(Schema.isMinLength(1)),
}).annotate({ identifier: "Maestro.Grounding" })
```

`Q068` L20–25
```ts
  actor: Schema.Struct({
    projectId: Schema.NonEmptyString,
    sessionId: Schema.NonEmptyString,
    memberId: Schema.NonEmptyString,
  }),
  actorBytes: Schema.NonEmptyString,
```

`Q069 · S:maestro-event.ts` L240–240
```ts
    revision: Schema.Literal("v3"),
```

`Q069` L249–266
```ts
    upstreamAttribution: optional(Schema.UndefinedOr(UpstreamAttribution.Any)),
    grounding: optional(MaestroContext.Grounding),
  }).check(
    Schema.makeFilter((data) =>
      data.upstreamAttribution === undefined &&
      [
        data.goal,
        data.reviewRequirement,
        ...data.acceptance,
        ...data.scope,
        ...data.constraints,
        ...data.assumptions,
        ...data.risks,
      ].some((field) => field.source === "upstream")
        ? { path: ["upstreamAttribution"], issue: "UPSTREAM_ATTRIBUTION_MISSING" }
        : undefined,
    ),
  )
```

`Q069` L273–276
```ts
        type: Recorded.type,
        durable: { version: 3, aggregate: "sessionID" },
        data: RecordedV3Data,
      })),
```

`Q070 · S:upstream-attribution.ts` L35–38
```ts
    identifier: "Maestro.UpstreamAttribution.V1",
    description: "Upstream proposal references. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })
```

`Q069 · S:maestro-event.ts` L710–714
```ts
export namespace WorkResult {
  // Shared transitional contract: host verification and Maestro acceptance remain independent facts.
  export const Decided = Event.define({
    type: "maestro.work_result.decided",
    durable: { version: 1, aggregate: "authoritySessionID" },
```

`Q069` L728–731
```ts
      decision: Schema.Literals(["accepted", "rejected"]),
      verificationState: Schema.Literals(["not-host-verified", "host-verified", "host-failed", "host-incomplete"]),
      terminalReason: Schema.Literals(["ended", "blocked", "failed", "interrupted"]),
      reason: optional(Schema.String),
```

`Q069` L766–768
```ts
/** Maestro events stored and replayed by the host but never part of the public event surface. */
export const DurableOnlyDefinitions = Event.inventory(Task.WorkflowReviewHeld, Task.WorkflowRebound,
  Task.WorkflowReviewFindings, Task.ResumeAdmitted)
```

## D16 — Meeting records and owner review

Membership: M16; 3 paths exatos.

bounded_claim:

Meeting represents session-bound final transcript segments, retention/consent and owner review/handoff forms. Protocol exposes that lifecycle; Server delegates to SessionMeeting/Handoff services and starts consolidation on stop. A stop response is not a completed-card receipt and the wrappers do not prove all meeting ownership rules.

conditional_gap:

Deduplication, retention/erasure, consolidation, ownership and handoff effects require the owning implementation/runtime evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/meeting.ts` | Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação. | P29 |
| `packages/schema/src/meeting.ts` | Final segments, retention/consent, owner consolidation and handoff intent. | Q071 |
| `packages/server/src/handlers/meeting.ts` | Adapt meeting capture, state edits, consolidation start and handoff. | G57-E065, G57-E066 |

`Q071 · S:meeting.ts` L8–9
```ts
// Meeting: the durable record of one live-seat meeting and its final transcript segments.
// Audio and partial captions never reach this record; only final segments do.
```

`Q071` L40–41
```ts
// kept stores segments and claims; ephemeral keeps segments only during the call and the card after stop.
export const Retention = Schema.Literals(["kept", "ephemeral"]).annotate({ identifier: "Meeting.Retention" })
```

`Q071` L44–47
```ts
// Asked at every start: whether the other participants were told the meeting is captured.
export const Consent = Schema.Literals(["announced", "not-needed", "unknown"]).annotate({
  identifier: "Meeting.Consent",
})
```

`Q071` L130–132
```ts
export const StartInput = Schema.Struct({
  sessionID: SessionID,
  title: Schema.String,
```

`U03 · S:meeting.ts` L183–191
```ts
export const ConfirmInput = Schema.Struct({
  meetingID: ID,
  items: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.String, verdict: Schema.Literals(["confirmed", "disputed", "dismissed"]) })),
  ),
  people: Schema.optional(
    Schema.Array(Schema.Struct({ proposalID: Schema.String, verdict: Schema.Literals(["new", "merge", "dismissed"]) })),
  ),
}).annotate({ identifier: "Meeting.ConfirmInput" })
```

`U03` L200–204
```ts
// Sends items to Maestro through team_message with their source and no transcript.
export const HandoffInput = Schema.Struct({ meetingID: ID, itemIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "Meeting.HandoffInput",
})
export interface HandoffInput extends Schema.Schema.Type<typeof HandoffInput> {}
```

`P29 · P:meeting.ts` L21–25
```ts
    HttpApiEndpoint.post("meeting.start", "/api/meeting/start", {
      query: LocationQuery,
      payload: Meeting.StartInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
```

`G57-E065 · H:meeting.ts` L26–34
```ts
      .handle("meeting.stop", (ctx) =>
        response(
          Effect.gen(function* () {
            const meeting = yield* SessionMeeting.Service
            const consolidation = yield* MeetingConsolidation.Service
            const stopped = yield* meeting.stop(ctx.payload).pipe(Effect.mapError(apiError))
            // The card is built in the background; stop answers before it is ready.
            yield* consolidation.start(stopped.id)
            return stopped
```

`G57-E066 · H:meeting.ts` L86–92
```ts
      .handle("meeting.handoff", (ctx) =>
        response(
          Effect.gen(function* () {
            const handoff = yield* SessionMeeting.HandoffService
            return yield* handoff.handoff(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
```

## D17 — Scheduled prompt admission

Membership: M17; 3 paths exatos.

bounded_claim:

ScheduledTask represents legacy-compatible IDs, cadence and started/failed admission results. Protocol declares directory-scoped scheduling operations. Server supplies Location.directory to the task service and maps invalid/not-found/run failures; returning a Session ID describes prompt admission, not completed model work.

conditional_gap:

Timing, timezone, cross-directory policy, persistent idempotency and exactly-once scheduling remain Core/runtime claims.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/schedule.ts` | CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução. | P41 |
| `packages/schema/src/scheduled-task.ts` | Legacy IDs and admission-level started/failed run contract. | Q072 |
| `packages/server/src/handlers/schedule.ts` | List/create/update/remove/run regular schedules in the current directory. | G57-E114, G57-E115, G57-E118, G57-E119 |

`Q072 · S:scheduled-task.ts` L8–18
```ts
// Tasks saved on a device before the server owned schedules carry UUIDs, so any short non-empty ID is accepted.
export const ID = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)).pipe(
  Schema.brand("ScheduledTask.ID"),
  statics((schema) => ({ create: () => schema.make("tsk_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Cadence = Schema.Literals(["once", "hourly", "daily", "weekly"]).annotate({
  identifier: "ScheduledTask.Cadence",
})
export type Cadence = typeof Cadence.Type
```

`Q072` L25–30
```ts
export const StartedRun = Schema.Struct({
  outcome: Schema.Literal("started"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.StartedRun" })
```

`Q072` L33–38
```ts
export const FailedRun = Schema.Struct({
  outcome: Schema.Literal("failed"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  error: Schema.String,
}).annotate({ identifier: "ScheduledTask.FailedRun" })
```

`Q072` L40–42
```ts
// What the latest settled run actually did: its prompt was admitted into a Session, or it failed before that.
export type Run = StartedRun | FailedRun
export const Run = Schema.Union([StartedRun, FailedRun]).annotate({ identifier: "ScheduledTask.Run" })
```

`P41 · P:schedule.ts` L91–96
```ts
    HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", {
      params,
      query: LocationQuery,
      success: Location.response(ScheduledTask.RunResult),
      error: [ScheduleNotFoundError, ScheduleRunError],
    })
```

`G57-E115 · H:schedule.ts` L24–28
```ts
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.create(location.directory, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
```

`G57-E118 · H:schedule.ts` L65–69
```ts
          const location = yield* Location.Service
          return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
```

`G57-E119 · H:schedule.ts` L77–82
```ts
function notFound(error: ScheduledTask.NotFoundError) {
  return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` })
}

function invalid(error: ScheduledTask.InvalidError) {
  return new InvalidRequestError({ message: error.message, field: error.field })
```

## D18 — Lean output and numeric provenance

Membership: M18; 6 paths exatos.

bounded_claim:

Lean separates reducer/preserve inventory, accepted engine IDs, local savings estimates and an actual strict persisted-record decoder. The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics. Protocol and Server expose Location-derived profile preferences/collector history; no savings or performance was measured.

conditional_gap:

Reducer correctness, recorded history, realized savings and runtime application of settings remain dependent implementation/execution claims.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/lean.ts` | Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada. | P25 |
| `packages/schema/src/lean-coverage.ts` | Coverage inventory distinguishes reducer/preserve and maps profiles. | Q073 |
| `packages/schema/src/lean-dashboard.ts` | Saved-profile savings projection explicitly labels local token estimates. | Q074 |
| `packages/schema/src/lean-engine.ts` | Current and legacy persisted engine IDs. | Q075 |
| `packages/schema/src/lean-metrics.ts` | Strict decoder of numeric provenance and arithmetic, separate from factual truth. | Q076 |
| `packages/server/src/handlers/lean.ts` | Expose Lean preferences, collector state, and history for a Location-derived owner. | G57-E056 |

`Q073 · S:lean-coverage.ts` L6–6
```ts
// Group labels/categories are Orchestra presentation; exact evidence does not imply a reducer.
```

`Q073` L10–11
```ts
  { id: "pytest", label: "pytest", category: "test", mode: "reducer", profiles: ["pytest"], exact: [] },
  { id: "jest", label: "Jest", category: "test", mode: "preserve", profiles: ["jest"], exact: [] },
```

`Q075 · S:lean-engine.ts` L3–9
```ts
export const legacy = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
/** Lossless 0.2.0 engine; its saved decisions stay decodable after the 0.4.0 upgrade. */
export const lossless = "hugr-lean@0.2.0:369206cd0a468904" as const
/** Parent updates this only after verifying the immutable package artifact (sha256 prefix). */
export const current = "hugr-lean@0.4.0:5ff983c58aa056d8" as const
export type ID = typeof legacy | typeof lossless | typeof current
export const accepted: readonly string[] = Object.freeze([legacy, lossless, current])
```

`Q074 · S:lean-dashboard.ts` L14–20
```ts
/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
  calls: NonNegativeInt,
  tokenCalls: NonNegativeInt,
}).annotate({ identifier: "LeanProfileSavings" })
```

`Q076 · S:lean-metrics.ts` L28–36
```ts
export const decode: (value: unknown) => Decision | undefined = (value) => {
  try {
    const root = record(value, ["version", "scope", "owner", "orchestraProfile", "model", "engine", "itemID", "producer",
      "eligible", "status", "reason", "filterProfile", "bytes", "tokens", "durationMs"])
    if (!root || root.version !== 1 || root.scope !== "standard-registry"
      || typeof root.engine !== "string" || !LeanEngine.accepted.includes(root.engine)
      || (root.itemID !== undefined && (typeof root.itemID !== "string" || !LeanCoverage.ids.some((id) => id === root.itemID)))
      || (root.producer !== "native-shell" && root.producer !== "native-tool" && root.producer !== "unverified")
      || typeof root.eligible !== "boolean" || (root.eligible && root.producer === "unverified")
```

`Q076` L53–56
```ts
    if (!tokens) return undefined
    if (root.status === "passthrough") {
      if (bytes.saved !== 0 || (tokens.kind === "estimated" && tokens.saved !== 0)) return undefined
    } else if (!root.eligible || root.producer === "unverified" || bytes.saved <= 0) return undefined
```

`Q076` L71–80
```ts

// Snapshot only own whitelisted fields, once. Never retain caller-owned objects or accessors.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const own = Reflect.ownKeys(value)
  if (own.some((key) => typeof key !== "string" || !keys.includes(key))) return undefined
  return Object.fromEntries(own.map((key) => [key, Reflect.get(value, key)]))
}
```

`Q076` L87–92
```ts
function counts(value: unknown): Decision["bytes"] | undefined {
  const part = record(value, ["before", "after", "saved"])
  if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number"
    || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0
    || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
  return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
```

`P25 · P:lean.ts` L26–31
```ts
    HttpApiEndpoint.patch("lean.update", "/api/lean", {
      query: LocationQuery,
      payload: LeanDashboard.Update,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
```

`G57-E056 · H:lean.ts` L17–22
```ts
    const preferences = LeanProfilePreferences.make(yield* FSUtil.Service, yield* Global.Service)
    const collector = LeanProject.make(yield* Database.Service)
    const owner = Effect.gen(function* () {
      const location = yield* Location.Service
      return { projectID: location.project.id, directory: location.directory }
    })
```

`G57-E056` L29–29
```ts
            return yield* collector.read(yield* preferences.read(yield* owner), yield* LeanOutput.configured())
```

`U06 · H:lean.ts` L40–47
```ts
      .handle("lean.history", (ctx) =>
        response(
          Effect.gen(function* () {
            const state = yield* preferences.read(yield* owner)
            return yield* collector.history(state.scope, ctx.params.itemID)
          }).pipe(Effect.mapError(unavailable)),
        ),
      )
```

