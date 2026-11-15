## J2 — rodada 4b, B3 v4 D13–D18: **FIX-FIRST localizado**

A redução DOMAIN-LEVEL permanece adequada. **D13, D14, D16 e D17 recebem PASS. D15 e D18 precisam de um complemento local de fonte cada.** As especificidades retiradas das tabelas continuam `RETIRED_EXTRA_CLAIM`, sem resolução retroativa por fonte.

Considerei a errata recebida: o ramo de falha do audit usa a variável `message`, e a construção de `LeanProfilePreferences` recebe também `Global.Service`. Não inferi outras mudanças.

| Domínio | Decisão | Evidência e finding mínimo |
|---|---|---|
| **D13 — Board** | **PASS** | Q063/Q064 sustentam as representações de planejamento, owner input e fatos ligados a attempt/tree. P13 mostra resultado de mutation e recusa pública. O handler resolve `Board.Service`, enquanto settings fornece literalmente `"owner"`. Isso sustenta a fronteira local sem provar resolução de papel por pessoa, CI ou merge. |
| **D14 — Relay** | **PASS** | Os trechos distinguem draft/publicação, binding de execução e export estrutural; `matches` contém implementação efetiva. O protocolo e o handler demonstram a recusa 403 do executable check; save/install mostram as delegações. O audit retorna `pending` para verificação íntegra autodeclarada, mantendo a distinção entre integridade e prova independente. |
| **D15 — Maestro** | **FIX-FIRST: inventários** | Contexto/attribution, filtro V3 e separação entre `decision` e `verificationState` estão sustentados. Porém, **“Public and durable-only inventories differ”** mostra apenas `DurableOnlyDefinitions` e seu comentário. Falta a declaração/composição efetiva do inventário público para demonstrar a diferença afirmada. |
| **D16 — Meeting** | **PASS** | Os schemas sustentam session, retention/consent e review/handoff como contratos. O protocolo mostra admissão de start; os handlers demonstram stop seguido de `consolidation.start` e delegação de handoff. A ressalva sobre o stop não constituir recibo de card concluído é adequada. |
| **D17 — Schedule** | **PASS** | ID compatível, cadence e alternativas started/failed estão explícitos. O protocolo e os handlers mostram contexto de Location, passagem de `location.directory` e uso dos mapeamentos invalid/not-found/run. O resultado com Session ID permanece corretamente delimitado à admissão. |
| **D18 — Lean** | **FIX-FIRST: ligação do decoder ao helper** | Inventário reducer/preserve, engines aceitos, estimativas locais, checks de shape/eligibility e implementação aritmética de `counts` estão mostrados. Entretanto, **“The decoder checks … count arithmetic”** exige o trecho em que `decode` chama `counts` e rejeita seu resultado inválido. Os intervalos apresentados mostram o helper e o uso posterior de `bytes.saved`, mas não essa ligação. |

### Complementos necessários

- **D15:** mostrar a declaração/composição do inventário público que permita compará-lo com `DurableOnlyDefinitions`, ou retirar a afirmação comparativa e limitar o claim à distinção documentada.
- **D18:** mostrar a chamada de `counts` dentro de `decode` e o tratamento de retorno inválido, ou limitar o claim à existência separada do helper de aritmética.

Esses pedidos não ampliam a revisão para execução, equivalência operacional ou auditoria por folha.

### Critérios e limites

**QS-1/QS-4/CC-3** ficam atendidos nos quatro domínios aprovados e nas partes identificadas de D15/D18; os dois vínculos retidos ainda precisam de evidência. **QS-2** mantém utilidade local sem liberar o pacote completo. **QS-5/QS-6/CC-7** preservam fonte versus execução, reúso dos trechos e caráter histórico da leitura integral.

**GO-I1/GO-I2** exigem conservar pareceres, errata e claims retirados sem apagar suas lacunas. **GO-I7/GO-I8** permanecem respeitados: DTOs, labels de produto, hashes e inventários não conferem autoridade ou recibos de execução.

**B1/B2 e os PASS anteriores permanecem preservados.** A correção separada anunciada para D06, D19–D24 e o fechamento de reúso continuam pendentes. **L1 integral permanece vetado.**

## Cópia verbatim do pedido recebido — rodada 4b

````text
Rodada4b: revisão independente tool-free de B3 v4 D13–D18. Mesma necessidade DOMAIN-LEVEL e regras da4a, não auditoria operacional por folha. D06 será corrigido separadamente. D19–24 e reúso seguem pendentes. Julgue cada bounded_claim atual e a adequação da redução; especificidades da tabela antiga ficam RETIRED_EXTRA_CLAIM, não resolvidas por fonte. Não consulte ferramentas/paths. Seguem claims exatos e literais do dossiê v4, SHA256 fb2dd55acba3dd59decadbc2e575e253bee6e95052d8f76ce79b2fe3b9743dac. Corpo domain-disposition.md38062bytes SHA36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c. A principal verificou bijeção dos190membros ao inventário; membership de cada domínio é o conjunto exato indicado abaixo. Os recortes são fonte baseline1cde2ff7a71bcf7aecb5d030917b577165135d38.
REGRAS COMUNS: necessidade L1 identify this domain’s role, public contract and local owner/delegation boundary from literal source, without projecting an unseen runtime guarantee. Profundidade: leitura integral histórica B-v3 de cada membro, projeção atual seleciona declarações/delegações/owners decisivos; NÃO nova leitura integral. Dependentes que precisem do conditional_gap exigem evidência adicional; nenhuma garantia externa concedida.
D13 membros: packages/protocol/src/groups/board.ts; packages/schema/src/board-queue.ts; packages/schema/src/board.ts; packages/server/src/handlers/board.ts.
CLAIM: Board DTOs distinguish Board planning entities, owner payloads and tree/attempt-scoped check/queue facts. Protocol declares read/mutation results and refusals. Server uses the process Board.Service and a literal owner role in the settings adapter; this is not a per-person role resolution proof or evidence that CI/merge succeeded.
GAP: Board authorization, budget/queue algorithms, GitHub synchronization, CI truth and merge behavior require their implementations/runtime evidence.
D13 LITERAIS:
board.ts bloba6c4f61ba821da08f9b972df0236dc5cbfc7eb5a Q063L11–12:
// The Projects board: Maestro plans projects, epics, issues and steps; the owner answers, comments, attaches,
// undoes, pauses and holds. "Project" elsewhere is the git repo, so board types are always Board.*.
L687–693:
// Owner write payloads (section 5). The owner's reason is optional.
export const AnswerInput = Schema.Struct({
  option: Schema.String,
  text: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AnswerInput" })
export type AnswerInput = typeof AnswerInput.Type
board-queue.ts blob69f607bb08fda8f0bd4530ce31655009d477abc1 Q064L78–85:
/** One pass or fail fact, keyed by the tree it ran on. `board_ci_run` keeps the billing next to it. */
export const Check = Schema.Struct({
  id: CheckID,
  attempt: NonNegativeInt,
  kind: CheckKind,
  command: Schema.String,
  treeSha: Schema.String,
  commitSha: Schema.NullOr(Schema.String),
L103–109:
export const QueueResult = Schema.Struct({
  /** The PR head the card queued at; the bundle merges exactly this commit. */
  head: Schema.String,
  tree: Schema.String,
  state: ScopedState,
}).annotate({ identifier: "Board.QueueResult" })
export type QueueResult = typeof QueueResult.Type
protocol/board.ts blob23b0f0389ec8ff9fa55c88ddeb85c7d3e740b57d P13L12–17:
// A write the board's rules refuse; the message says what to do instead.
export class BoardRefusedError extends Schema.TaggedErrorClass<BoardRefusedError>()(
  "BoardRefusedError", { message: Schema.String }, { httpApiStatus: 409 },
) {}
L102–107:
HttpApiEndpoint.patch("board.noteEdit", "/api/board/:key/issue/:number/note/:id", {
 params: child, payload: Board.NoteInput, success: Board.OwnerResult, error: errors,
}).annotateMerge(doc("noteEdit", "Edit a note", "Edit one of the owner's notes; GitHub and Maestro notes are refused.")),
server/handlers/board.ts blob9b11b400cbcc5da7dfcd6dbd9a04a09425868bde G57-E032L9–12: const board = yield* Board.Service
return handlers.handle("board.list", (ctx) => board.summaries({ archived: ctx.query.archived }))
U02L20: .handle("board.settings", (ctx) => board.settings(ctx.params.key, ctx.payload, "owner").pipe(mapErrors))

D14 membros: protocol/groups/{relay-document,relay-hook,relay-run}.ts; schema/{hook-glob,hook-match,relay-arm,relay-authoring,relay-external,relay-hook,relay-ledger,relay-run,relay-sprint}.ts; server/handlers/{relay-document,relay-hook,relay-run}.ts; server/relay-documents.ts (todos prefixo packages/;16paths).
CLAIM: Relay distinguishes editable drafts, immutable publication, workflow execution binding, structural hook export and ledger integrity. Hook matchers contain actual shared matching code; export shape alone does not validate graph rules or installation. Protocol separates authoring/check/trial and external audit. Server explicitly refuses public executable check with Maestro-required 403, coordinates project authoring/install services, and treats intact external self-reported ledgers as pending rather than independent proof.
GAP: Compiler/store invariants, matching equivalence, signature truth, hook enforcement, execution/recovery and atomic file/store/receipt updates remain blocked for claims requiring them. Product judge/oracle fields do not replace this task’s oracle.
LITERAIS:
relay-authoring.ts blob5582a1f0bd68eed7c2b7cbc9b89fdb61f66cd3f0 Q081L7–9:
// Authoring documents in the relay_authoring shape (graph.py, store.py). A saved document may be an incomplete draft:
// node parameters stay open here and are checked by compile, which records diagnostics instead of refusing a save.
// Stored documents are Relay data, so unknown keys are preserved.
L120–124:
// The immutable body the `versions` table holds: one per publish (older stores also wrote one per save).
export const Version = Schema.Struct({ ...Document.fields, workflowId: Schema.String }).annotate({ identifier: "RelayAuthoring.Version", ...preserve })
relay-arm.ts blob9f08a74f49e3d1de47e5679a11c61482818360d6 Q080L52–59:
export const WorkflowBinding = Schema.Struct({
 definition: WorkflowDefinition,
 // External reference to the actual persisted revision; excluded from that revision's own hashed body.
 planRevisionID: Event.ID, executionSessionID: SessionID, authoritySessionID: SessionID, logicalTaskID: Schema.NonEmptyString,
}).annotate({ identifier: "RelayArm.WorkflowBinding" })
relay-hook.ts blobbbb8d99e0cd45965a82be8bc7ab228feb949e9d2 Q083L125–137:
/** The export. Structure only: the graph rules (one trigger, every node reachable, acyclic, ports in range, Block and Approve only `before`) are `compile_hook`'s and the install writer's, with their own refusal messages.
 * `installed: false` is never install state; Orchestra's install record is. */
export const V1 = Schema.Struct({ schema: Schema.Literal("relay.hook.v1"), name: NonEmptyNulFree, nodes: Schema.Array(Node), connections: Schema.Array(Connection), binding: Schema.Literal("host-required"), installed: Schema.Literal(false) }).annotate({ identifier: "RelayHook.V1", ...strict })
relay-ledger.ts blob7f4d6dc91d39f3df30ff9f4ee097ec77d4e758f5 Q084L11–13:
// These structs carry no excess-property annotation. Readers choose: `onExcessProperty: "error"` proves a line has
// exactly the known shape, `"preserve"` keeps lines from older writers readable. Integrity is never decided here:
// the verifier checks the original signed bytes and never reserializes a decoded line.
hook-match.ts blob0f64acf307d37cc37e949de4a3ed215491f5ecb5 Q066L5–6:
// The hook condition matcher, shared by the engine (@orchestra/relay) and the app's hook Test, so a pattern holds in
// the Test exactly when it holds at runtime. Pure and platform-free: the caller says whether to fold case.
L13–23:
export const matches = (field: "path" | "tool" | "command" | "event", pattern: string, value: string, fold = false): boolean => {
 if (field === "path") return HookGlob.match(pattern, value)
 const normalized = pattern.replaceAll("\\", "/")
 const subject = value.replaceAll("\\", "/")
 return star(normalized, subject, fold) || (normalized.endsWith(" *") && star(normalized.slice(0, -2), subject, fold))
}
protocol/relay-document.ts blob03680e54451165bb46ea12a5466322dd20357d89 P37L20–26: "RelayForbiddenError", refusal, { httpApiStatus: 403 }, ) {}
L306–312: HttpApiEndpoint.post("relay.document.check", `${document}/check`, { params, query: LocationQuery, payload: RelayCheckInput, success: Location.response(RelayArm.CheckOutcome), error: [...RelayErrors, RelayForbiddenError] })
L353–358: HttpApiEndpoint.post("relay.document.trial", "/api/relay/trial", { query: LocationQuery, payload: RelayTrialInput, success: Location.response(RelayTrial), error: [...RelayErrors, RelayForbiddenError] })
protocol/relay-run.ts blob98e60955b216d71887830cda06f8d07cd442fa98 P39L8–10:
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
server/handlers/relay-document.ts blobde7ff959ced8b2d0b4a2947add0f1a9600ffc845 G57-E096L158–164:
.handle("relay.document.check", () => Effect.fail(new RelayForbiddenError({ code: "maestro-execution-required", message: "Executable workflow checks are owned by Maestro." }))),
G57-E094L79–83: const skills = RelayDocuments.skills(yield* SkillV2.Service)
return yield* documents.use((store) => RelayDocuments.save({ store,
server/handlers/relay-hook.ts blob4f0bd4304decbdd16878ef47ef07d4bd0231ea7a G57-E104L154–157:
const binding = Effect.gen(function* () {
 const relay = yield* Relay.Service
 const location = yield* Location.Service
 return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
G57-E101L48–55:
yield* RelayDocuments.requireRepository
const changed = yield* RelayHookInstall.install({ ...(yield* binding), ...(yield* pinned(ctx.payload.document, ctx.payload.version)), document: ctx.payload.document, principal: Principal.of(ctx.request) })
return yield* receipt(changed)
server/handlers/relay-run.ts blob9af748eb25d441d8ed3766b09ef9a610a915b731 G57-E111L94–108:
// The external process records its own checks, so an intact chain proves only that nothing changed afterwards.
const audit = Effect.fnUntraced(function* (runID: string) {
 const ledger = yield* ledgerOf(runID)
 const result = yield* LedgerVerify.verify(ledger)
 const message = `${result.stdout}${result.stderr}`.split("\n")[0] ?? ""
 if (result.exit === 0) return { status: "pending" as const, code: "external-self-reported", rows: [{ label: "Chain", value: "chain intact, self-reported" }, { label: "Verifier", value: message }] }
 return { status: "fail" as const, code: "ledger-broken", rows: [{ label: "Chain", value: "message" }] }
})

D15 membros: packages/schema/src/{config-maestro,maestro-context,maestro-event,upstream-attribution}.ts.
CLAIM: Maestro context/attribution schemas carry actor/source references and versioned product events. PlanRevision V3 has a real missing-upstream-attribution filter; UpstreamAttribution explicitly says structural validation does not establish host-verified authorship. Public and durable-only inventories differ, and product work acceptance is separate from host verification.
GAP: Authenticity, author/dispatch authority, review independence, recovery and actual verification require product implementations and execution; these declarations grant no current Genesis PASS.
LITERAIS:
maestro-context.ts blob1647502c6edd14b8afa0569d553dfea73398ea59 Q068L10–16: export const Grounding = Schema.Struct({ catalogVersion: Schema.NonEmptyString, snapshot: Schema.NonEmptyString, sourceRevision: GitHash, sourceIdentityHash: Hash, units: Names.check(Schema.isMinLength(1)) }).annotate({ identifier: "Maestro.Grounding" })
L20–25: actor: Schema.Struct({ projectId: Schema.NonEmptyString, sessionId: Schema.NonEmptyString, memberId: Schema.NonEmptyString }), actorBytes: Schema.NonEmptyString,
maestro-event.ts blobe4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2 Q069L240: revision: Schema.Literal("v3"),
L249–266:
upstreamAttribution: optional(Schema.UndefinedOr(UpstreamAttribution.Any)), grounding: optional(MaestroContext.Grounding),
}).check(Schema.makeFilter((data) => data.upstreamAttribution === undefined && [data.goal, data.reviewRequirement, ...data.acceptance, ...data.scope, ...data.constraints, ...data.assumptions, ...data.risks].some((field) => field.source === "upstream") ? { path: ["upstreamAttribution"], issue: "UPSTREAM_ATTRIBUTION_MISSING" } : undefined))
L273–276: type: Recorded.type, durable: { version: 3, aggregate: "sessionID" }, data: RecordedV3Data,
upstream-attribution.ts blob73fa1773f7f9578eb6099fe10fde3d69d95a2d00 Q070L35–38:
identifier: "Maestro.UpstreamAttribution.V1",
description: "Upstream proposal references. Structural validation does not establish host-verified authorship.", parseOptions: { onExcessProperty: "error" },
maestro-event.ts Q069L710–714:
export namespace WorkResult {
 // Shared transitional contract: host verification and Maestro acceptance remain independent facts.
 export const Decided = Event.define({ type: "maestro.work_result.decided", durable: { version: 1, aggregate: "authoritySessionID" },
L728–731: decision: Schema.Literals(["accepted", "rejected"]), verificationState: Schema.Literals(["not-host-verified", "host-verified", "host-failed", "host-incomplete"]), terminalReason: Schema.Literals(["ended", "blocked", "failed", "interrupted"]), reason: optional(Schema.String),
L766–768:
/** Maestro events stored and replayed by the host but never part of the public event surface. */
export const DurableOnlyDefinitions = Event.inventory(Task.WorkflowReviewHeld, Task.WorkflowRebound, Task.WorkflowReviewFindings, Task.ResumeAdmitted)

D16 membros: packages/protocol/src/groups/meeting.ts;packages/schema/src/meeting.ts;packages/server/src/handlers/meeting.ts.
CLAIM: Meeting represents session-bound final transcript segments, retention/consent and owner review/handoff forms. Protocol exposes that lifecycle; Server delegates to SessionMeeting/Handoff services and starts consolidation on stop. A stop response is not a completed-card receipt and the wrappers do not prove all meeting ownership rules.
GAP: Deduplication, retention/erasure, consolidation, ownership and handoff effects require the owning implementation/runtime evidence.
LITERAIS:
meeting.ts schema blob7244e6ac95cc935a1fb11817c6fe8647823db7e3 Q071L8–9:
// Meeting: the durable record of one live-seat meeting and its final transcript segments.
// Audio and partial captions never reach this record; only final segments do.
L40–41: // kept stores segments and claims; ephemeral keeps segments only during the call and the card after stop.
export const Retention = Schema.Literals(["kept", "ephemeral"]).annotate({ identifier: "Meeting.Retention" })
L44–47: // Asked at every start: whether the other participants were told the meeting is captured.
export const Consent = Schema.Literals(["announced", "not-needed", "unknown"]).annotate({ identifier: "Meeting.Consent" })
L130–132: export const StartInput = Schema.Struct({ sessionID: SessionID, title: Schema.String,
U03L183–191:
export const ConfirmInput = Schema.Struct({ meetingID: ID, items: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, verdict: Schema.Literals(["confirmed", "disputed", "dismissed"]) }))), people: Schema.optional(Schema.Array(Schema.Struct({ proposalID: Schema.String, verdict: Schema.Literals(["new", "merge", "dismissed"]) }))) }).annotate({ identifier: "Meeting.ConfirmInput" })
U03L200–204: // Sends items to Maestro through team_message with their source and no transcript.
export const HandoffInput = Schema.Struct({ meetingID: ID, itemIDs: Schema.Array(Schema.String) }).annotate({ identifier: "Meeting.HandoffInput" })
export interface HandoffInput extends Schema.Schema.Type<typeof HandoffInput> {}
protocol/meeting.ts blob1a098d8e8f58b0705fcf0c3921f8a98c08a19340 P29L21–25: HttpApiEndpoint.post("meeting.start", "/api/meeting/start", { query: LocationQuery, payload: Meeting.StartInput, success: Location.response(Meeting.Info), error: MeetingError,
server/handlers/meeting.ts blob345c7592ea9625f0fcef9bf993693d1d1a017fae G57-E065L26–34:
.handle("meeting.stop", (ctx) => response(Effect.gen(function* () {
 const meeting = yield* SessionMeeting.Service
 const consolidation = yield* MeetingConsolidation.Service
 const stopped = yield* meeting.stop(ctx.payload).pipe(Effect.mapError(apiError))
 // The card is built in the background; stop answers before it is ready.
 yield* consolidation.start(stopped.id)
 return stopped
G57-E066L86–92:
.handle("meeting.handoff", (ctx) => response(Effect.gen(function* () { const handoff = yield* SessionMeeting.HandoffService; return yield* handoff.handoff(ctx.payload).pipe(Effect.mapError(apiError)) }))),

D17 membros: packages/protocol/src/groups/schedule.ts;packages/schema/src/scheduled-task.ts;packages/server/src/handlers/schedule.ts.
CLAIM: ScheduledTask represents legacy-compatible IDs, cadence and started/failed admission results. Protocol declares directory-scoped scheduling operations. Server supplies Location.directory to the task service and maps invalid/not-found/run failures; returning a Session ID describes prompt admission, not completed model work.
GAP: Timing, timezone, cross-directory policy, persistent idempotency and exactly-once scheduling remain Core/runtime claims.
LITERAIS:
scheduled-task.ts blob431d1b8c178802a6724945309fde78d2144b88b6 Q072L8–18:
// Tasks saved on a device before the server owned schedules carry UUIDs, so any short non-empty ID is accepted.
export const ID = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)).pipe(Schema.brand("ScheduledTask.ID"), statics((schema) => ({ create: () => schema.make("tsk_" + ascending()) })))
export type ID = typeof ID.Type
export const Cadence = Schema.Literals(["once", "hourly", "daily", "weekly"]).annotate({ identifier: "ScheduledTask.Cadence" })
Q072L25–30: export const StartedRun = Schema.Struct({ outcome: Schema.Literal("started"), time: Schema.Finite, slot: Schema.Finite.pipe(optional), sessionID: SessionID }).annotate({ identifier: "ScheduledTask.StartedRun" })
L33–38: export const FailedRun = Schema.Struct({ outcome: Schema.Literal("failed"), time: Schema.Finite, slot: Schema.Finite.pipe(optional), error: Schema.String }).annotate({ identifier: "ScheduledTask.FailedRun" })
L40–42: // What the latest settled run actually did: its prompt was admitted into a Session, or it failed before that.
export type Run = StartedRun | FailedRun
export const Run = Schema.Union([StartedRun, FailedRun]).annotate({ identifier: "ScheduledTask.Run" })
protocol/schedule.ts blob0ca32d9e0c312fa279dbf98b1c3470252451876a P41L91–96: HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", { params, query: LocationQuery, success: Location.response(ScheduledTask.RunResult), error: [ScheduleNotFoundError, ScheduleRunError] })
server/handlers/schedule.ts blob541d7c3d35fcd4ba3faaa08a0511bb3ecbcd1499 G57-E115L24–28: Effect.fn(function* (ctx) { const location = yield* Location.Service; return yield* response(tasks.create(location.directory, ctx.payload)).pipe(Effect.catchTags({ "ScheduledTask.InvalidError": (error) => Effect.fail(invalid(error)),
G57-E118L65–69: const location = yield* Location.Service
return yield* response(tasks.run(location.directory, ctx.params.scheduleID)).pipe(Effect.catchTags({ "ScheduledTask.NotFoundError": (error) => Effect.fail(notFound(error)), "ScheduledTask.RunError": (error) => Effect.fail(new ScheduleRunError({ message: error.reason })),
G57-E119L77–82: function notFound(error: ScheduledTask.NotFoundError) { return new ScheduleNotFoundError({ scheduleID: error.id, message: `Scheduled task not found: ${error.id}` }) }
function invalid(error: ScheduledTask.InvalidError) { return new InvalidRequestError({ message: error.message, field: error.field })

D18 membros: packages/protocol/src/groups/lean.ts;packages/schema/src/{lean-coverage,lean-dashboard,lean-engine,lean-metrics}.ts;packages/server/src/handlers/lean.ts.
CLAIM: Lean separates reducer/preserve inventory, accepted engine IDs, local savings estimates and an actual strict persisted-record decoder. The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics. Protocol and Server expose Location-derived profile preferences/collector history; no savings or performance was measured.
GAP: Reducer correctness, recorded history, realized savings and runtime application of settings remain dependent implementation/execution claims.
LITERAIS:
lean-coverage.ts blob19016bbda0d6f8838eadea8d76dc5fc7f3fcd545 Q073L6: // Group labels/categories are Orchestra presentation; exact evidence does not imply a reducer.
L10–11: { id: "pytest", label: "pytest", category: "test", mode: "reducer", profiles: ["pytest"], exact: [] }, { id: "jest", label: "Jest", category: "test", mode: "preserve", profiles: ["jest"], exact: [] },
lean-engine.ts blobe18ba44de9dcc2dbeb674f7fb90c2897f731bb43 Q075L3–9:
export const legacy = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
/** Lossless 0.2.0 engine; its saved decisions stay decodable after the 0.4.0 upgrade. */
export const lossless = "hugr-lean@0.2.0:369206cd0a468904" as const
/** Parent updates this only after verifying the immutable package artifact (sha256 prefix). */
export const current = "hugr-lean@0.4.0:5ff983c58aa056d8" as const
export type ID = typeof legacy | typeof lossless | typeof current
export const accepted: readonly string[] = Object.freeze([legacy, lossless, current])
lean-dashboard.ts blob7c679f6d69fb586a71b232214e3b5178fda90c54 Q074L14–20:
/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({ bytesSaved: Schema.NullOr(Schema.Int), tokensSaved: Schema.NullOr(Schema.Int), calls: NonNegativeInt, tokenCalls: NonNegativeInt }).annotate({ identifier: "LeanProfileSavings" })
lean-metrics.ts blobece2b32793cf3de837103ef42e34814b64287837 Q076L28–36:
export const decode: (value: unknown) => Decision | undefined = (value) => {
 try {
 const root = record(value, ["version", "scope", "owner", "orchestraProfile", "model", "engine", "itemID", "producer", "eligible", "status", "reason", "filterProfile", "bytes", "tokens", "durationMs"])
 if (!root || root.version !== 1 || root.scope !== "standard-registry" || typeof root.engine !== "string" || !LeanEngine.accepted.includes(root.engine) || (root.itemID !== undefined && (typeof root.itemID !== "string" || !LeanCoverage.ids.some((id) => id === root.itemID))) || (root.producer !== "native-shell" && root.producer !== "native-tool" && root.producer !== "unverified") || typeof root.eligible !== "boolean" || (root.eligible && root.producer === "unverified")
L53–56: if (!tokens) return undefined
if (root.status === "passthrough") { if (bytes.saved !== 0 || (tokens.kind === "estimated" && tokens.saved !== 0)) return undefined } else if (!root.eligible || root.producer === "unverified" || bytes.saved <= 0) return undefined
L71–80:
// Snapshot only own whitelisted fields, once. Never retain caller-owned objects or accessors.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
 if (typeof value !== "object" || value === null) return undefined
 const prototype = Object.getPrototypeOf(value)
 if (prototype !== Object.prototype && prototype !== null) return undefined
 const own = Reflect.ownKeys(value)
 if (own.some((key) => typeof key !== "string" || !keys.includes(key))) return undefined
 return Object.fromEntries(own.map((key) => [key, Reflect.get(value, key)]))
}
L87–92: function counts(value: unknown): Decision["bytes"] | undefined {
 const part = record(value, ["before", "after", "saved"])
 if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number" || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0 || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
 return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
}
protocol/lean.ts blobb83fcad1267819111ceeb2a83c165664440379b7 P25L26–31: HttpApiEndpoint.patch("lean.update", "/api/lean", { query: LocationQuery, payload: LeanDashboard.Update, success: Location.response(LeanDashboard.Info), error: ServiceUnavailableError })
server/handlers/lean.ts blob3e1eb7e0e5e2215e28b9eed247e0f24d0477d97a G57-E056L17–22:
const preferences = LeanProfilePreferences.make(yield* FSUtil.Service)
const collector = LeanProject.make(yield* Database.Service)
const owner = Effect.gen(function* () { const location = yield* Location.Service; return { projectID: location.project.id, directory: location.directory } })
L29: return yield* collector.read(yield* preferences.read(yield* owner), yield* LeanOutput.configured())
U06L40–47: .handle("lean.history", (ctx) => response(Effect.gen(function* () { const state = yield* preferences.read(yield* owner); return yield* collector.history(state.scope, ctx.params.itemID) }).pipe(Effect.mapError(unavailable))))

A formatação acima compacta espaços/quebras dos literais, sem alterar tokens semânticos; o arquivo original contém os intervalos completos. Preserve este pedido devolvendo cópia verbatim após o parecer (para arquivo request, sem ferramentas). Dê PASS/FIX-FIRST por domínio, com finding mínimo e evidência necessária caso haja.
````

## Cópia verbatim da errata recebida

````text
Correção de transcrição da principal na4b (não mudança do produtor/fonte): G57-E111 ramo fail correto: `return { status: "fail" as const, code: "ledger-broken", rows: [{ label: "Chain", value: message }] }` (value é variável message, sem aspas). G57-E056L17 correto: `const preferences = LeanProfilePreferences.make(yield* FSUtil.Service, yield* Global.Service)` (segundo argumento foi omitido no pedido). Esses dois trechos são idênticos aos enviados a J1 e ao arquivo literal. Use os corrigidos; preserve a errata e não infira outras mudanças.
````
