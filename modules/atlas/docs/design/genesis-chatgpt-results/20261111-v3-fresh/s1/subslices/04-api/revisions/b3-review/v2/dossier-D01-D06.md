# S1-04 / B3 / D01–D06

Revisão de transporte v2: tabelas locais dos 190 membros copiadas byte a byte de `review-domain-disposition.md`; os campos e alegações locais não foram reescritos. A leitura integral indicada na origem pertence à produção B-v3 herdada. Esta revisão transporta evidência, sem criar aceite.

B3: propósito, contrato e delegação local; transporte sem novo julgamento/execução. Claims e gaps abaixo são exatos; Core/runtime amplos permanecem bloqueados.
Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`.
M<n> = `membership-exact.json#/domains/<n-1>`: 24 arrays/190 paths conferidos, nenhuma falta/duplicação/troca; hashes no manifesto. Não houve nova leitura integral dos190.
Q/P/G57 = suplemento herdado; U = complemento autorizado do baseline. Intervalos literais separados, sem elipse inserida. Comentários não são recibos.
Paths: S=`packages/schema/src/`; P=`packages/protocol/src/groups/`; H=`packages/server/src/handlers/`; R=`packages/server/src/`; T=`packages/sdk-next/src/`.

## D01 — Actions provider automation

Membership: M01; 25 paths exatos.

bounded_claim:

Schema separates binding/revision, prepared operation identity and execution input; Protocol declares the provider-command API and shared Actions errors; Server delegates to Actions.Service through a binding reference and common error projection. A binding reference does not itself prove provider authorization or an executed remote effect.

conditional_gap:

Provider authorization, atomic operation/reconcile semantics and remote results require Actions/Core and relevant runtime evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/actions-binding.ts` | CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState. | P01 |
| `packages/protocol/src/groups/actions-common.ts` | Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos. | P02 |
| `packages/protocol/src/groups/actions-job.ts` | retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand. | P03 |
| `packages/protocol/src/groups/actions-operation.ts` | prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos. | P04 |
| `packages/protocol/src/groups/actions-pipeline.ts` | merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution. | P05 |
| `packages/protocol/src/groups/actions-resource.ts` | list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand. | P06 |
| `packages/protocol/src/groups/actions-run.ts` | List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor. | P07 |
| `packages/protocol/src/groups/actions-source.ts` | Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas. | P08 |
| `packages/protocol/src/groups/actions-workflow.ts` | List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution. | P09 |
| `packages/schema/src/actions.ts` | Actions six-module public barrel. | Q047 |
| `packages/schema/src/actions/command.ts` | Strict provider commands and request-only secret-bearing output. | Q051 |
| `packages/schema/src/actions/identity.ts` | Binding revision/reference and closed refusal/send-disposition vocabulary. | Q048 |
| `packages/schema/src/actions/operation.ts` | Prepared identity/preconditions and distinct execution payload. | Q049 |
| `packages/schema/src/actions/resource.ts` | Resource metadata/redaction ownership and transfer contract. | Q050 |
| `packages/schema/src/actions/run.ts` | Provider run/job state projections and pagination. | Q052 |
| `packages/schema/src/actions/workflow.ts` | Workflow/source binding and partial/unresolved graph states. | Q053 |
| `packages/server/src/handlers/actions-binding.ts` | Adapt binding CRUD, capability inspection, and binding-policy operations to Actions.Service. | G57-E008, G57-E009 |
| `packages/server/src/handlers/actions-common.ts` | Share the binding reference and typed error projection used by Actions handlers. | G57-E011 |
| `packages/server/src/handlers/actions-job.ts` | Delegate retry/play/cancel/erase commands for a job through Actions.execute. | G57-E012 |
| `packages/server/src/handlers/actions-operation.ts` | Prepare, fetch, and reconcile Actions operations. | G57-E013 |
| `packages/server/src/handlers/actions-pipeline.ts` | Select and forward merge-request and trigger pipeline operations. | G57-E014 |
| `packages/server/src/handlers/actions-resource.ts` | Translate resource listing filters and generic resource commands into Actions calls. | G57-E015 |
| `packages/server/src/handlers/actions-run.ts` | Delegate run queries, job listing, retry and run lifecycle commands to Actions. | G57-E017 |
| `packages/server/src/handlers/actions-source.ts` | Expose source base and draft/source validation, and translate source mutation commands. | G57-E020 |
| `packages/server/src/handlers/actions-workflow.ts` | Delegate workflow listing/source/graph/dispatch and enabled-state operations. | G57-E022 |

`Q048 · S:actions/identity.ts` L49–50
```ts
export const BindingRef = Schema.Struct({ id: BindingID, revision: PositiveInt })
  .annotate({ identifier: "Actions.BindingRef" })
```

`Q049 · S:actions/operation.ts` L17–17
```ts
// Admission stores identity and optimistic preconditions, never a mutation's values.
```

`Q049` L38–44
```ts
export const OperationIntent = Schema.Struct({
  clientID: Schema.NonEmptyString,
  binding: BindingRef,
  kind: OperationKind,
  target: OperationTarget,
  expected: optional(OperationExpected),
}).annotate({ identifier: "Actions.OperationIntent" })
```

`Q049` L77–78
```ts
export const ExecuteInput = Schema.Struct({ id: OperationID, input: Schema.Json })
  .annotate({ identifier: "Actions.ExecuteInput" })
```

`P02 · P:actions-common.ts` L6–8
```ts
export class ActionsApiError extends Schema.TaggedErrorClass<ActionsApiError>()(
  "ActionsError", Actions.ErrorData.fields, { httpApiStatus: 400 },
) {}
```

`P03 · P:actions-job.ts` L11–14
```ts
  .add(HttpApiEndpoint.post("actions.job.retry", "/api/actions/job/:bindingID/:jobID/retry", {
    params: Params, query: BindingQuery, payload: Actions.JobRetryCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

`G57-E013 · H:actions-operation.ts` L9–12
```ts
    .handle("actions.operation.prepare", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.prepare(bindingRef(ctx), ctx.payload)
    })))
```

`G57-E011 · H:actions-common.ts` L7–20
```ts
export function bindingRef(input: { params: { bindingID: BindingID }; query: { revision: number } }) {
  return { id: input.params.bindingID, revision: input.query.revision }
}

export function result<A, R>(data: Effect.Effect<A, Actions.ActionsError, R>) {
  return response(data.pipe(Effect.mapError(apiError)))
}

export function apiError(error: Actions.ActionsError) {
  return new ActionsApiError({
    kind: error.kind, message: error.message, bindingID: error.bindingID, provider: error.provider,
    resourceID: error.resourceID, retryAfter: error.retryAfter, operationID: error.operationID,
    disposition: error.disposition,
  })
```

## D02 — Agent, behavior, skill and prompt instructions

Membership: M02; 16 paths exatos.

bounded_claim:

These contracts separate agent/skill/command configuration and host-rendered reminders from executing turns. Agent-file revisions and behavior replacement are public inputs; Server resolves the Location-owned catalog/services and delegates writes, with local name/conflict/error handling. SDK or HTTP exposure is not evidence that a tool/model ran.

conditional_gap:

File containment, effective permission policy, reload convergence and provider/tool execution need their implementation or execution evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/agent.ts` | Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale. | P10 |
| `packages/protocol/src/groups/behavior.ts` | PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto. | P12 |
| `packages/protocol/src/groups/command.ts` | GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo. | P17 |
| `packages/protocol/src/groups/skill.ts` | List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict. | P42 |
| `packages/schema/src/agent-file.ts` | Agent markdown input/read revision and ordered permission update contract. | Q001 |
| `packages/schema/src/agent.ts` | Agent engine/model/request/mode/toolkit/permission representation. | Q002 |
| `packages/schema/src/behavior.ts` | Stable behavior ID and ordered project instruction replacement. | Q003 |
| `packages/schema/src/command.ts` | Command template/catalog shape, not a command executor. | Q004 |
| `packages/schema/src/llm.ts` | Provider metadata and text/file tool-content union. | Q005 |
| `packages/schema/src/prompt-context.ts` | Host-owned reminders explicitly do not override permissions/tools. | Q006 |
| `packages/schema/src/session-subagent-models.ts` | Delegated provider/model allowlist or inherited policy. | Q008 |
| `packages/schema/src/skill.ts` | Skill metadata/save revision intent and local/URL/embedded source identity. | Q007 |
| `packages/server/src/handlers/agent.ts` | List/annotate agents, present materialized tools and available skills, and edit configuration agent files. | G57-E024, G57-E026, G57-E027 |
| `packages/server/src/handlers/behavior.ts` | Set the Location behavior selection through BehaviorV2. | G57-E031 |
| `packages/server/src/handlers/command.ts` | Expose the slash-command catalog. | G57-E040 |
| `packages/server/src/handlers/skill.ts` | List/save/remove skill files through the Location skill service. | G57-E120, G57-E121, G57-E122 |

`Q001 · S:agent-file.ts` L29–34
```ts
// Omitted fields are removed from the file, except `permission`: omitted leaves the file's rules as they are.
// `revision` is the value a read returned; a write fails when the file changed since.
export const Input = Schema.Struct({
  ...fields,
  revision: Schema.String.pipe(optional),
}).annotate({ identifier: "AgentFile.Input" })
```

`Q003 · S:behavior.ts` L19–22
```ts
export const SetInput = Schema.Struct({
  /** The complete set, in order. An empty list removes every behavior from the project. */
  behaviors: Schema.Array(Info),
}).annotate({ identifier: "Behavior.SetInput" })
```

`Q006 · S:prompt-context.ts` L5–9
```ts
/** Host-owned, ordered rendered reminders. Neutral text, never permission or tool overrides. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  reminders: Schema.Array(Schema.String),
}).annotate({ identifier: "PromptContext.Info" })
```

`P10 · P:agent.ts` L77–83
```ts
    HttpApiEndpoint.put("agent.file.update", "/api/agent/:agentID/file", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      payload: AgentFile.Input,
      success: Location.response(AgentFile.Info),
      error: [InvalidRequestError, ConflictError, UnknownError],
    })
```

`G57-E026 · H:agent.ts` L75–85
```ts
          const name = yield* requireName(ctx.params.agentID)
          const location = yield* Location.Service
          const agents = yield* AgentV2.Service
          const file = yield* ConfigAgentFile.write(location.directory, name, ctx.payload).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.mapError((error) =>
              error instanceof ConfigAgentFile.ConflictError
                ? new ConflictError({ message: error.message, resource: error.path })
                : failure(error),
            ),
          )
```

`G57-E027 · H:agent.ts` L129–138
```ts
function requireName(name: string) {
  if (ConfigAgentFile.validName(name)) return Effect.succeed(name)
  return Effect.fail(
    new InvalidRequestError({
      message: "Agent names are 1-64 letters, numbers, hyphens or underscores and not a reserved device name.",
      kind: "agent_name",
      field: "agentID",
    }),
  )
}
```

`G57-E031 · H:behavior.ts` L11–18
```ts
    Effect.fn(function* (ctx) {
      const behavior = yield* BehaviorV2.Service
      return yield* response(behavior.set(ctx.payload.behaviors)).pipe(
        Effect.catchTag("BehaviorV2.DuplicateError", (error) =>
          Effect.fail(new InvalidRequestError({ message: error.message, kind: "duplicate", field: "behaviors" })),
        ),
      )
    }),
```

`G57-E040 · H:command.ts` L6–8
```ts
export const CommandHandler = HttpApiBuilder.group(Api, "server.command", (handlers) =>
  handlers.handle("command.list", () => response(SlashCommand.list())),
)
```

`G57-E120 · H:skill.ts` L16–27
```ts
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        const input = ctx.payload
        return yield* response(
          skill.save(location.directory, {
            name: input.name,
            description: input.description,
            content: input.content,
            location: input.path,
            mtime: input.mtime,
          }),
        ).pipe(Effect.catchTag("SkillWriteError", (error) => Effect.fail(writeError(error))))
```

## D03 — Permission and question requests

Membership: M03; 7 paths exatos.

bounded_claim:

Schema defines request/reply/saved-rule forms and Protocol distinguishes Location and Session endpoints. Server permission get/reply and question reply/reject inspect the requested record and compare its sessionID before delegation; absent/foreign records map to the corresponding not-found error. These local checks do not establish every Core lifecycle invariant.

conditional_gap:

Decision policy, saved-entry authorization, persistence and concurrent lifecycle behavior remain Core/runtime prerequisites.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/permission.ts` | Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent. | P30 |
| `packages/protocol/src/groups/question.ts` | Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404. | P34 |
| `packages/schema/src/permission-saved.ts` | Saved project/action/resource permission record. | Q010 |
| `packages/schema/src/permission.ts` | Request/reply plus modern and historical Session permission shapes. | Q009 |
| `packages/schema/src/question.ts` | Session request identity and ordered answer payload. | Q011 |
| `packages/server/src/handlers/permission.ts` | Expose pending/saved permission requests and session-specific ask/read/reply routes. | G57-E067, G57-E069 |
| `packages/server/src/handlers/question.ts` | List questions and answer/reject a question belonging to the path Session. | G57-E079, G57-E081 |

`Q009 · S:permission.ts` L34–40
```ts
export const Request = Schema.Struct({
  id: ID,
  ...RequestFields,
}).annotate({ identifier: "PermissionV2.Request" })
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const Reply = Schema.Literals(["once", "always", "reject"]).annotate({ identifier: "PermissionV2.Reply" })
```

`Q010 · S:permission-saved.ts` L14–19
```ts
export const Info = Schema.Struct({
  id: ID,
  projectID: ProjectID,
  action: Schema.String,
  resource: Schema.String,
}).annotate({ identifier: "PermissionSaved.Info" })
```

`Q011 · S:question.ts` L52–58
```ts
export const Request = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  questions: Schema.Array(Info).annotate({ description: "Questions to ask" }),
  tool: Tool.pipe(optional),
}).annotate({ identifier: "QuestionV2.Request" })
export interface Request extends Schema.Schema.Type<typeof Request> {}
```

`P30 · P:permission.ts` L60–64
```ts
    // Effect applies group middleware only to endpoints already added; session endpoints use session placement below.
    .middleware(locationMiddleware)
    .add(
      HttpApiEndpoint.post("session.permission.create", "/api/session/:sessionID/permission", {
        params: { sessionID: Session.ID },
```

`G57-E067 · H:permission.ts` L10–12
```ts
function missingRequest(id: PermissionV2.ID) {
  return new PermissionNotFoundError({ requestID: id, message: `Permission request not found: ${id}` })
}
```

`G57-E069 · H:permission.ts` L62–64
```ts
          const request = yield* (yield* PermissionV2.Service).get(ctx.params.requestID)
          if (!request || request.sessionID !== ctx.params.sessionID) return yield* missingRequest(ctx.params.requestID)
          return { data: request }
```

`G57-E069` L69–75
```ts
        Effect.fn(function* (ctx) {
          const permission = yield* PermissionV2.Service
          const request = yield* permission.get(ctx.params.requestID)
          if (!request || request.sessionID !== ctx.params.sessionID) return yield* missingRequest(ctx.params.requestID)
          yield* permission
            .reply({ requestID: ctx.params.requestID, reply: ctx.payload.reply, message: ctx.payload.message })
            .pipe(Effect.catchTag("PermissionV2.NotFoundError", () => missingRequest(ctx.params.requestID)))
```

`G57-E079 · H:question.ts` L19–23
```ts
      const question = yield* QuestionV2.Service
      const request = (yield* question.list()).find((request) => request.id === requestID)
      if (!request || request.sessionID !== sessionID) return yield* missingRequest(requestID)
      return yield* use(question)
    })
```

`G57-E081 · H:question.ts` L40–46
```ts
        "session.question.reply",
        Effect.fn(function* (ctx) {
          yield* withOwnedQuestion(ctx.params.sessionID, ctx.params.requestID, (question) =>
            question
              .reply({ requestID: ctx.params.requestID, answers: ctx.payload.answers })
              .pipe(Effect.catchTag("QuestionV2.NotFoundError", () => missingRequest(ctx.params.requestID))),
          )
```

`U01 · H:question.ts` L8–10
```ts
function missingRequest(id: QuestionV2.ID) {
  return new QuestionNotFoundError({ requestID: id, message: `Question request not found: ${id}` })
}
```

`U01` L51–57
```ts
        "session.question.reject",
        Effect.fn(function* (ctx) {
          yield* withOwnedQuestion(ctx.params.sessionID, ctx.params.requestID, (question) =>
            question
              .reject(ctx.params.requestID)
              .pipe(Effect.catchTag("QuestionV2.NotFoundError", () => missingRequest(ctx.params.requestID))),
          )
```

## D04 — Session projections and invalidations

Membership: M04; 4 paths exatos.

bounded_claim:

Revert, activity, todo and compaction modules describe session-bound records/notifications. They do not perform revert or activity computation; todo status/priority remain String fields. Existing session/stream bodies cover admission and delivery boundaries separately.

conditional_gap:

Revert effects, activity calculation, compaction and todo persistence require the owning service before an implementation claim.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/schema/src/revert.ts` | Revert anchor and optional snapshot/diff/file list. | Q012 |
| `packages/schema/src/session-activity.ts` | Activity projection with period, timestamps and truncated status. | Q013 |
| `packages/schema/src/session-compaction-event.ts` | session.compacted notification. | Q014 |
| `packages/schema/src/session-todo.ts` | Todo fields use String status/priority and publish session-linked updates. | Q015 |

`Q012 · S:revert.ts` L17–24
```ts
export const State = Schema.Struct({
  messageID: SessionMessage.ID,
  partID: Schema.String.pipe(optional),
  snapshot: Schema.String.pipe(optional),
  diff: Schema.String.pipe(optional),
  files: Schema.Array(FileDiff).pipe(optional),
}).annotate({ identifier: "Revert.State" })
export interface State extends Schema.Schema.Type<typeof State> {}
```

`Q013 · S:session-activity.ts` L33–34
```ts
export const Activity = Schema.Struct({
  period: Period,
```

`Q013` L40–45
```ts
  activeMs: Schema.Array(Schema.Finite).annotate({
    description: "Per bucket, wall clock during which any root-session assistant turn was running",
  }),
  sessions: Schema.Array(ActivitySession),
  facts: Schema.Array(Fact),
  truncated: Schema.Boolean.annotate({ description: "True when more than 200000 messages were in range" }),
```

`Q014 · S:session-compaction-event.ts` L6–11
```ts
export const Compacted = Event.define({
  type: "session.compacted",
  schema: {
    sessionID: SessionID,
  },
})
```

`Q015 · S:session-todo.ts` L7–15
```ts
export const Info = Schema.Struct({
  content: Schema.String.annotate({ description: "Brief description of the task" }),
  status: Schema.String.annotate({
    description: "Current status of the task: pending, in_progress, completed, cancelled",
  }),
  priority: Schema.String.annotate({
    description: "Priority level of the task: high, medium, low",
  }),
}).annotate({ identifier: "Todo" })
```

`Q015` L18–25
```ts
const Updated = define({
  type: "todo.updated",
  schema: {
    sessionID: SessionID,
    todos: Schema.Array(Info),
  },
})
export const Event = { Updated, Definitions: inventory(Updated) }
```

## D05 — Project, workspace and copy context

Membership: M05; 15 paths exatos.

bounded_claim:

Schema supplies identity and project/workspace/copy shapes; Protocol separates global project/catalog calls from Location query context. Server location registration, project initialization and copy creation delegate to the corresponding services; copy creation supplies project/source context from the route and Location. ID/path representations are not complete filesystem authority.

conditional_gap:

Isolation, copy destruction/force behavior, Git effects, uniqueness under every execution and workspace lifecycle require their owners and pertinent runtime evidence.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/location.ts` | Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos. | P26 |
| `packages/protocol/src/groups/project-copy.ts` | Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional. | P31 |
| `packages/protocol/src/groups/project.ts` | Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope. | P32 |
| `packages/schema/src/identifier.ts` | Ascending/descending identifier construction with timestamp/counter/random input. | Q016 |
| `packages/schema/src/project-copy.ts` | Named strategy with create/remove copy context. | Q022 |
| `packages/schema/src/project-directories.ts` | Project directory invalidation. | Q021 |
| `packages/schema/src/project-id.ts` | Project brand and global sentinel. | Q017 |
| `packages/schema/src/project.ts` | Repository project Info and project.updated event. | Q020 |
| `packages/schema/src/workspace-event.ts` | Workspace ready/failed/connectivity status events. | Q023 |
| `packages/schema/src/workspace-id.ts` | Workspace prefix validator and constructor. | Q018 |
| `packages/schema/src/workspace.ts` | Workspace identity/event facade. | Q019 |
| `packages/schema/src/worktree-event.ts` | Worktree ready/failed notifications. | Q024 |
| `packages/server/src/handlers/location.ts` | Describe a requested Location and make its project known before Sessions exist. | G57-E058, G57-E059 |
| `packages/server/src/handlers/project-copy.ts` | Delegate copy lifecycle and supply optional LLM-generated copy names. | G57-E072 |
| `packages/server/src/handlers/project.ts` | List/update projects and initialize a Git project before Location services can exist. | G57-E075, G57-E076 |

`Q018 · S:workspace-id.ts` L5–7
```ts
export const WorkspaceID = Schema.String.check(Schema.isStartsWith("wrk")).pipe(
  Schema.brand("WorkspaceV2.ID"),
  statics((schema) => {
```

`Q020 · S:project.ts` L31–34
```ts
export const Info = Schema.Struct({
  id: ID,
  worktree: Schema.String,
  vcs: optional(Vcs),
```

`Q022 · S:project-copy.ts` L11–17
```ts
export const CreateInput = Schema.Struct({
  projectID: ProjectID,
  strategy: StrategyID,
  sourceDirectory: AbsolutePath,
  directory: AbsolutePath,
  name: optional(Schema.String),
}).annotate({ identifier: "ProjectCopy.CreateInput" })
```

`P26 · P:location.ts` L5–12
```ts
export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
      workspace: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "LocationQuery" })
```

`P32 · P:project.ts` L11–14
```ts
    HttpApiEndpoint.get("project.list", "/api/project", {
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
```

`G57-E058 · H:location.ts` L19–24
```ts
          // Opening a directory makes its project known, with its repository, before any Session exists in it.
          yield* ProjectV2.record(database.db, events, {
            id: location.project.id,
            directory: location.project.directory,
            vcs: location.vcs,
          })
```

`G57-E072 · H:project-copy.ts` L52–60
```ts
          const copies = yield* ProjectCopy.Service
          const location = yield* Location.Service
          return yield* badRequest(
            copies.create({
              ...ctx.payload,
              projectID: ctx.params.projectID,
              sourceDirectory: location.project.directory,
            }),
          )
```

`G57-E076 · H:project.ts` L35–37
```ts
          const location = ref(yield* HttpServerRequest.HttpServerRequest)
          const project = yield* ProjectV2.initGit({ db: database.db, events, git, projects }, location.directory)
          const resolved = yield* projects.resolve(location.directory)
```

## D06 — Files, references, Git and pull requests

Membership: M06; 13 paths exatos.

bounded_claim:

The Schema modules represent file entries/diffs, reference sources, VCS answers and host-CLI pull requests. Protocol declares query/input/error shapes; Server delegates reference/Git/PR work to Location services and maps the PR host error. No file access or remote PR was performed by this production.

conditional_gap:

Path confinement, host credentials, Git correctness and remote writes remain dependent implementation/runtime claims.

Tabela local herdada (bytes exatos):

| Exact member | Local L1 purpose | Additional evidence |
| --- | --- | --- |
| `packages/protocol/src/groups/pull-request.ts` | List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor. | P33 |
| `packages/protocol/src/groups/reference.ts` | Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo. | P36 |
| `packages/protocol/src/groups/vcs.ts` | Info/status/diff working\|branch, métricas entre millis e atividade de sessão por período. | P44 |
| `packages/schema/src/file-diff.ts` | File delta counts/status and optional patch. | Q025 |
| `packages/schema/src/filesystem-watcher.ts` | Watcher add/change/unlink notification. | Q026 |
| `packages/schema/src/filesystem.ts` | Relative file/directory entry and search match DTOs. | Q027 |
| `packages/schema/src/pull-request.ts` | Host-CLI remote PR contract with typed refusal kinds. | Q031 |
| `packages/schema/src/reference.ts` | Local absolute-path or Git repository/branch reference source. | Q030 |
| `packages/schema/src/vcs-event.ts` | Branch change notification. | Q029 |
| `packages/schema/src/vcs.ts` | Branch/diff/apply/activity responses; no Git operation. | Q028 |
| `packages/server/src/handlers/pull-request.ts` | List/create pull requests using the Location PullRequest service. | G57-E077, G57-E078 |
| `packages/server/src/handlers/reference.ts` | Expose the reference catalog. | G57-E092 |
| `packages/server/src/handlers/vcs.ts` | Expose Location Git status/diff/activity and scoped Session activity. | G57-E127, G57-E129 |

`Q025 · S:file-diff.ts` L6–12
```ts
export const Info = Schema.Struct({
  file: optional(Schema.String),
  patch: optional(Schema.String),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: optional(Schema.Literals(["added", "deleted", "modified"])),
}).annotate({ identifier: "SnapshotFileDiff" })
```

`Q027 · S:filesystem.ts` L15–18
```ts
export const Entry = Schema.Struct({
  path: RelativePath,
  type: Schema.Literals(["file", "directory"]),
}).annotate({ identifier: "FileSystem.Entry" })
```

`Q028 · S:vcs.ts` L3–4
```ts
// The version-control answers the server gives about a working directory: its branch, changed files, diffs and commit
// activity.
```

`Q030 · S:reference.ts` L28–30
```ts
export const Source = Schema.Union([LocalSource, GitSource])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Reference.Source" })
```

`Q031 · S:pull-request.ts` L6–8
```ts
// Pull requests on the repository's GitHub or GitLab remote, read and opened through the host CLI
// (gh or glab) that the user already signed in to on the server.
export const Host = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "PullRequest.Host" })
```

`P44 · P:vcs.ts` L41–48
```ts
    HttpApiEndpoint.get("vcs.diff", "/api/vcs/diff", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        mode: Schema.Literals(["working", "branch"]),
        context: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Vcs.FileDiff)),
    })
```

`G57-E077 · H:pull-request.ts` L20–24
```ts
        response(
          Effect.gen(function* () {
            const pullRequests = yield* PullRequest.Service
            return yield* pullRequests.create(ctx.payload).pipe(Effect.mapError(apiError))
          }),
```

`G57-E078 · H:pull-request.ts` L30–40
```ts
function apiError(error: PullRequest.HostError) {
  return new PullRequestError({
    name: "PullRequestError",
    data: {
      kind: error.kind,
      message: error.message,
      host: error.host,
      branch: error.branch,
      remote: error.remote,
    },
  })
```

`G57-E092 · H:reference.ts` L6–8
```ts
export const ReferenceHandler = HttpApiBuilder.group(Api, "server.reference", (handlers) =>
  handlers.handle("reference.list", () => response(Reference.Service.use((reference) => reference.list()))),
)
```

`G57-E127 · H:vcs.ts` L37–39
```ts
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return []
            return yield* Vcs.status(git, location.directory, location.project.directory)
```

