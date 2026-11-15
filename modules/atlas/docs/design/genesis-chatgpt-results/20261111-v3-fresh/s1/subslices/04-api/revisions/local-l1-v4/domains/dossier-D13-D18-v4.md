# B3/v4 — revisão da redução explícita — D13–D18

Critério: disposição de domínio com membership exato, propósito/contrato/owner, evidência ou gap obrigatório e razão da profundidade. A revisão retira os claims locais detalhados da tabela antiga do corpo promovido, sem retirar paths, domínios ou necessidades. Os dois juízes decidem se a forma reduzida cumpre a necessidade congelada; o produtor não concede PASS. B1/B2 permanecem fora desta mudança; D07 preserva seus campos e membros.

Disposição das especificidades retiradas: `RETIRED_EXTRA_CLAIM`; suas lacunas não são declaradas resolvidas por fonte. Lacunas de bounded_claims retidos continuam obrigatórias.

Corpo único: `domain-disposition.md`, 38062 bytes, SHA256 `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c`. Histórico original preservado: 65726 bytes, SHA256 `95b17106dc5c26bb6d39c8d2d80b48fca8f75d35fe4f5f8ec3f232c7d71411c3`. As linhas antigas não são evidência nova nem claims atuais; disposição individual em `retired-row-claims.json`.

Este lote é autossuficiente para os claims de domínio: os literais decisivos seguem após as seções exatas do corpo. Nenhum endpoint/campo incidental da tabela antiga é claim deste v4.

## Regras comuns aos 24 domínios

Os três campos a seguir são idênticos nos 24 registros herdados e aplicam-se integralmente a cada domínio; aparecem uma vez para evitar repetição.

**Necessidade L1 (herdada):** Mandatory now: identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee.

**Dependentes bloqueados (herdado):** Any current or later claim relying on the named broader behavior requires that additional implementation/runtime evidence. Current local L1 reading was performed now.

**Profundidade e razão de adequação (herdadas):** Every listed handwritten member was read in full; the projection supplies decisive declaration/delegation/ownership branches and identifies external enforcement limits. It does not infer semantics from inventory or require an unrequested leaf-by-leaf operational audit.

As expressões de leitura “now” e “was read in full” pertencem ao registro histórico B-v3, não declaram uma releitura nesta revisão. O contrato/owner específico e o limite de aplicação desta profundidade são o bounded_claim e o conditional_gap de cada domínio abaixo.

## D13 — Board owner and planning surface

**Membros exatos (4):**

- `packages/protocol/src/groups/board.ts`
- `packages/schema/src/board-queue.ts`
- `packages/schema/src/board.ts`
- `packages/server/src/handlers/board.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Board DTOs distinguish Board planning entities, owner payloads and tree/attempt-scoped check/queue facts. Protocol declares read/mutation results and refusals. Server uses the process Board.Service and a literal owner role in the settings adapter; this is not a per-person role resolution proof or evidence that CI/merge succeeded.

**Evidência decisiva:** Q063:L11–12, Q063:L687–693, Q064:L78–85, Q064:L103–109, P13:L12–17, P13:L102–107, G57-E032:L9–12, U02:L20–20. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Board authorization, budget/queue algorithms, GitHub synchronization, CI truth and merge behavior require their implementations/runtime evidence.

## D14 — Relay workflow, hooks and external ledgers

**Membros exatos (16):**

- `packages/protocol/src/groups/relay-document.ts`
- `packages/protocol/src/groups/relay-hook.ts`
- `packages/protocol/src/groups/relay-run.ts`
- `packages/schema/src/hook-glob.ts`
- `packages/schema/src/hook-match.ts`
- `packages/schema/src/relay-arm.ts`
- `packages/schema/src/relay-authoring.ts`
- `packages/schema/src/relay-external.ts`
- `packages/schema/src/relay-hook.ts`
- `packages/schema/src/relay-ledger.ts`
- `packages/schema/src/relay-run.ts`
- `packages/schema/src/relay-sprint.ts`
- `packages/server/src/handlers/relay-document.ts`
- `packages/server/src/handlers/relay-hook.ts`
- `packages/server/src/handlers/relay-run.ts`
- `packages/server/src/relay-documents.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Relay distinguishes editable drafts, immutable publication, workflow execution binding, structural hook export and ledger integrity. Hook matchers contain actual shared matching code; export shape alone does not validate graph rules or installation. Protocol separates authoring/check/trial and external audit. Server explicitly refuses public executable check with Maestro-required 403, coordinates project authoring/install services, and treats intact external self-reported ledgers as pending rather than independent proof.

**Evidência decisiva:** Q081:L7–9, Q081:L120–124, Q080:L52–59, Q083:L125–137, Q084:L11–13, Q066:L5–6, Q066:L13–23, P37:L20–26, P37:L306–312, P37:L353–358, P39:L8–10, G57-E096:L158–164, G57-E094:L79–83, G57-E104:L154–157, G57-E101:L48–55, G57-E111:L94–108. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Compiler/store invariants, matching equivalence, signature truth, hook enforcement, execution/recovery and atomic file/store/receipt updates remain blocked for claims requiring them. Product judge/oracle fields do not replace this task’s oracle.

## D15 — Maestro product attribution and events

**Membros exatos (4):**

- `packages/schema/src/config-maestro.ts`
- `packages/schema/src/maestro-context.ts`
- `packages/schema/src/maestro-event.ts`
- `packages/schema/src/upstream-attribution.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Maestro context/attribution schemas carry actor/source references and versioned product events. PlanRevision V3 has a real missing-upstream-attribution filter; UpstreamAttribution explicitly says structural validation does not establish host-verified authorship. Public and durable-only inventories differ, and product work acceptance is separate from host verification.

**Evidência decisiva:** Q068:L10–16, Q068:L20–25, Q069:L240–240, Q069:L249–266, Q069:L273–276, Q070:L35–38, Q069:L710–714, Q069:L728–731, Q069:L766–768. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Authenticity, author/dispatch authority, review independence, recovery and actual verification require product implementations and execution; these declarations grant no current Genesis PASS.

## D16 — Meeting records and owner review

**Membros exatos (3):**

- `packages/protocol/src/groups/meeting.ts`
- `packages/schema/src/meeting.ts`
- `packages/server/src/handlers/meeting.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Meeting represents session-bound final transcript segments, retention/consent and owner review/handoff forms. Protocol exposes that lifecycle; Server delegates to SessionMeeting/Handoff services and starts consolidation on stop. A stop response is not a completed-card receipt and the wrappers do not prove all meeting ownership rules.

**Evidência decisiva:** Q071:L8–9, Q071:L40–41, Q071:L44–47, Q071:L130–132, U03:L183–191, U03:L200–204, P29:L21–25, G57-E065:L26–34, G57-E066:L86–92. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Deduplication, retention/erasure, consolidation, ownership and handoff effects require the owning implementation/runtime evidence.

## D17 — Scheduled prompt admission

**Membros exatos (3):**

- `packages/protocol/src/groups/schedule.ts`
- `packages/schema/src/scheduled-task.ts`
- `packages/server/src/handlers/schedule.ts`

**Propósito, contrato e delegação local — bounded_claim:**

ScheduledTask represents legacy-compatible IDs, cadence and started/failed admission results. Protocol declares directory-scoped scheduling operations. Server supplies Location.directory to the task service and maps invalid/not-found/run failures; returning a Session ID describes prompt admission, not completed model work.

**Evidência decisiva:** Q072:L8–18, Q072:L25–30, Q072:L33–38, Q072:L40–42, P41:L91–96, G57-E115:L24–28, G57-E118:L65–69, G57-E119:L77–82. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`, `s1.api.session-contract`, `s1.api.stream-contract`.

**Lacuna condicional — conditional_gap:**

Timing, timezone, cross-directory policy, persistent idempotency and exactly-once scheduling remain Core/runtime claims.

## D18 — Lean output and numeric provenance

**Membros exatos (6):**

- `packages/protocol/src/groups/lean.ts`
- `packages/schema/src/lean-coverage.ts`
- `packages/schema/src/lean-dashboard.ts`
- `packages/schema/src/lean-engine.ts`
- `packages/schema/src/lean-metrics.ts`
- `packages/server/src/handlers/lean.ts`

**Propósito, contrato e delegação local — bounded_claim:**

Lean separates reducer/preserve inventory, accepted engine IDs, local savings estimates and an actual strict persisted-record decoder. The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics. Protocol and Server expose Location-derived profile preferences/collector history; no savings or performance was measured.

**Evidência decisiva:** Q073:L6–6, Q073:L10–11, Q075:L3–9, Q074:L14–20, Q076:L28–36, Q076:L53–56, Q076:L71–80, Q076:L87–92, P25:L26–31, G57-E056:L17–22, G57-E056:L29–29, U06:L40–47. As identidades e os literais estão nos dossiês vinculantes desta revisão.

**Contexto existente:** `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.server-edge`, `s1.api.surface-disposition`.

**Lacuna condicional — conditional_gap:**

Reducer correctness, recorded history, realized savings and runtime application of settings remain dependent implementation/execution claims.

## Literais decisivos do lote

### D13

`packages/schema/src/board.ts` — blob `a6c4f61ba821da08f9b972df0236dc5cbfc7eb5a`.

`Q063` L11–12
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

`packages/schema/src/board-queue.ts` — blob `69f607bb08fda8f0bd4530ce31655009d477abc1`.

`Q064` L78–85
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

`packages/protocol/src/groups/board.ts` — blob `23b0f0389ec8ff9fa55c88ddeb85c7d3e740b57d`.

`P13` L12–17
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

`packages/server/src/handlers/board.ts` — blob `9b11b400cbcc5da7dfcd6dbd9a04a09425868bde`.

`G57-E032` L9–12
```ts
    const board = yield* Board.Service

    return handlers
      .handle("board.list", (ctx) => board.summaries({ archived: ctx.query.archived }))
```

`U02` L20–20
```ts
      .handle("board.settings", (ctx) => board.settings(ctx.params.key, ctx.payload, "owner").pipe(mapErrors))
```

### D14

`packages/schema/src/relay-authoring.ts` — blob `5582a1f0bd68eed7c2b7cbc9b89fdb61f66cd3f0`.

`Q081` L7–9
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

`packages/schema/src/relay-arm.ts` — blob `9f08a74f49e3d1de47e5679a11c61482818360d6`.

`Q080` L52–59
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

`packages/schema/src/relay-hook.ts` — blob `bbb8d99e0cd45965a82be8bc7ab228feb949e9d2`.

`Q083` L125–137
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

`packages/schema/src/relay-ledger.ts` — blob `7f4d6dc91d39f3df30ff9f4ee097ec77d4e758f5`.

`Q084` L11–13
```ts
// These structs carry no excess-property annotation. Readers choose: `onExcessProperty: "error"` proves a line has
// exactly the known shape, `"preserve"` keeps lines from older writers readable. Integrity is never decided here:
// the verifier checks the original signed bytes and never reserializes a decoded line.
```

`packages/schema/src/hook-match.ts` — blob `0f64acf307d37cc37e949de4a3ed215491f5ecb5`.

`Q066` L5–6
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

`packages/protocol/src/groups/relay-document.ts` — blob `03680e54451165bb46ea12a5466322dd20357d89`.

`P37` L20–26
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

`packages/protocol/src/groups/relay-run.ts` — blob `98e60955b216d71887830cda06f8d07cd442fa98`.

`P39` L8–10
```ts
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
```

`packages/server/src/handlers/relay-document.ts` — blob `de7ff959ced8b2d0b4a2947add0f1a9600ffc845`.

`G57-E096` L158–164
```ts
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
          }),
        ),
```

`G57-E094` L79–83
```ts
              )
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              RelayDocuments.save({
                store,
```

`packages/server/src/handlers/relay-hook.ts` — blob `4f0bd4304decbdd16878ef47ef07d4bd0231ea7a`.

`G57-E104` L154–157
```ts
const binding = Effect.gen(function* () {
  const relay = yield* Relay.Service
  const location = yield* Location.Service
  return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
```

`G57-E101` L48–55
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

`packages/server/src/handlers/relay-run.ts` — blob `9af748eb25d441d8ed3766b09ef9a610a915b731`.

`G57-E111` L94–108
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

### D15

`packages/schema/src/maestro-context.ts` — blob `1647502c6edd14b8afa0569d553dfea73398ea59`.

`Q068` L10–16
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

`packages/schema/src/maestro-event.ts` — blob `e4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2`.

`Q069` L240–240
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

`packages/schema/src/upstream-attribution.ts` — blob `73fa1773f7f9578eb6099fe10fde3d69d95a2d00`.

`Q070` L35–38
```ts
    identifier: "Maestro.UpstreamAttribution.V1",
    description: "Upstream proposal references. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })
```

`packages/schema/src/maestro-event.ts` — blob `e4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2`.

`Q069` L710–714
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

### D16

`packages/schema/src/meeting.ts` — blob `7244e6ac95cc935a1fb11817c6fe8647823db7e3`.

`Q071` L8–9
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

`U03` L183–191
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

`packages/protocol/src/groups/meeting.ts` — blob `1a098d8e8f58b0705fcf0c3921f8a98c08a19340`.

`P29` L21–25
```ts
    HttpApiEndpoint.post("meeting.start", "/api/meeting/start", {
      query: LocationQuery,
      payload: Meeting.StartInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
```

`packages/server/src/handlers/meeting.ts` — blob `345c7592ea9625f0fcef9bf993693d1d1a017fae`.

`G57-E065` L26–34
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

`G57-E066` L86–92
```ts
      .handle("meeting.handoff", (ctx) =>
        response(
          Effect.gen(function* () {
            const handoff = yield* SessionMeeting.HandoffService
            return yield* handoff.handoff(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
```

### D17

`packages/schema/src/scheduled-task.ts` — blob `431d1b8c178802a6724945309fde78d2144b88b6`.

`Q072` L8–18
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

`packages/protocol/src/groups/schedule.ts` — blob `0ca32d9e0c312fa279dbf98b1c3470252451876a`.

`P41` L91–96
```ts
    HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", {
      params,
      query: LocationQuery,
      success: Location.response(ScheduledTask.RunResult),
      error: [ScheduleNotFoundError, ScheduleRunError],
    })
```

`packages/server/src/handlers/schedule.ts` — blob `541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499`.

`G57-E115` L24–28
```ts
        Effect.fn(function* (ctx) {
          const location = yield* Location.Service
          return yield* response(tasks.create(location.directory, ctx.payload)).pipe(
            Effect.catchTags({
              "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
```

`G57-E118` L65–69
```ts
          const location = yield* Location.Service
          return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(
            Effect.catchTags({
              "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)),
              "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
```

`G57-E119` L77–82
```ts
function notFound(error: ScheduledTask.NotFoundError) {
  return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` })
}

function invalid(error: ScheduledTask.InvalidError) {
  return new InvalidRequestError({ message: error.message, field: error.field })
```

### D18

`packages/schema/src/lean-coverage.ts` — blob `19016bbda0d6f8838eadea8d76dc5fc7f3fcd545`.

`Q073` L6–6
```ts
// Group labels/categories are Orchestra presentation; exact evidence does not imply a reducer.
```

`Q073` L10–11
```ts
  { id: "pytest", label: "pytest", category: "test", mode: "reducer", profiles: ["pytest"], exact: [] },
  { id: "jest", label: "Jest", category: "test", mode: "preserve", profiles: ["jest"], exact: [] },
```

`packages/schema/src/lean-engine.ts` — blob `e18ba44de9dcc2dbeb674f7fb90c2897f731bb43`.

`Q075` L3–9
```ts
export const legacy = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
/** Lossless 0.2.0 engine; its saved decisions stay decodable after the 0.4.0 upgrade. */
export const lossless = "hugr-lean@0.2.0:369206cd0a468904" as const
/** Parent updates this only after verifying the immutable package artifact (sha256 prefix). */
export const current = "hugr-lean@0.4.0:5ff983c58aa056d8" as const
export type ID = typeof legacy | typeof lossless | typeof current
export const accepted: readonly string[] = Object.freeze([legacy, lossless, current])
```

`packages/schema/src/lean-dashboard.ts` — blob `7c679f6d69fb586a71b232214e3b5178fda90c54`.

`Q074` L14–20
```ts
/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
  calls: NonNegativeInt,
  tokenCalls: NonNegativeInt,
}).annotate({ identifier: "LeanProfileSavings" })
```

`packages/schema/src/lean-metrics.ts` — blob `ece2b32793cf3de837103ef42e34814b64287837`.

`Q076` L28–36
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

`packages/protocol/src/groups/lean.ts` — blob `b83fcad1267819111ceeb2a83c165664440379b7`.

`P25` L26–31
```ts
    HttpApiEndpoint.patch("lean.update", "/api/lean", {
      query: LocationQuery,
      payload: LeanDashboard.Update,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
```

`packages/server/src/handlers/lean.ts` — blob `3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a`.

`G57-E056` L17–22
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

`U06` L40–47
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

