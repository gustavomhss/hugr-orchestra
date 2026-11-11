# Trechos novos Protocol — seleção estreita

Todos os trechos são do commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Bytes copiados das capturas originais; nenhuma linha selecionada aparece em C01–C47/S01–S38. A leitura completa está registrada separadamente; este documento transmite somente testemunhas dos contratos e ownership declarados.

## P01 — `packages/protocol/src/groups/actions-binding.ts`

Blob `5d3c0a1f4956c97c285775ccb68b97a83b476048`; arquivo SHA-256 `0d24cd6645aae01e92a368d82bf69bf2b1d4dcf833b6e5da526dfb3138554f20`; 2530 bytes. CRUD de binding e acesso a capabilities/policy; create/update recebem BindingInput, policy usa Policy/PolicyState.

Linhas 15–20, trecho SHA-256 `c4c141200481cd561aacfb11c2d6228a7c7c603e3776bb3b25b15564a7241580`:

```typescript
  .add(HttpApiEndpoint.get("actions.binding.get", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.patch("actions.binding.update", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.BindingInput,
    success: Location.response(Actions.Binding), error: ActionsApiError,
```

Linhas 28–34, trecho SHA-256 `c776a7004cb7f559bd4339e0b9d186b6bc68ffafd095993a2a18db6462349afb`:

```typescript
  .add(HttpApiEndpoint.get("actions.binding.policy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.binding.updatePolicy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, payload: Actions.Policy,
    success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P02 — `packages/protocol/src/groups/actions-common.ts`

Blob `3421cc6bf4002e1d60b06e0b38ea4341079e9bd1`; arquivo SHA-256 `431d715398a557a4df1ec6a00abcd786fd6633a9f96136d4237348ec106aa102`; 712 bytes. Define erro público ActionsError 400, bindingID, revision positiva e limites/attempt opcionais positivos.

Linhas 6–17, trecho SHA-256 `4170aec08e5819add3a3471fc259213840ce74ef3a123c33c258984fb68520cb`:

```typescript
export class ActionsApiError extends Schema.TaggedErrorClass<ActionsApiError>()(
  "ActionsError", Actions.ErrorData.fields, { httpApiStatus: 400 },
) {}

export const BindingParams = Schema.Struct({ bindingID: Actions.BindingID })
export const BindingQuery = Schema.Struct({
  ...LocationQuery.fields,
  revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)),
})

export const OptionalLimit = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional)
export const OptionalAttempt = OptionalLimit
```

## P03 — `packages/protocol/src/groups/actions-job.ts`

Blob `df7b4e04595cf59cc202f4e771549a5b26deb47b`; arquivo SHA-256 `60c097d3b0f689bb0b7ae78c3e52085ac699e417283542355b2101853096650a`; 1671 bytes. retry/play/cancel/erase usam jobID não vazio e retornam CommandExecution; comandos de cancel/erase são GitLabCommand.

Linhas 10–18, trecho SHA-256 `5f0fc8844cfb284f6f4d23509f33e55689da1edd6c48b2313c9d876f0f1864b2`:

```typescript
export const ActionsJobGroup = HttpApiGroup.make("server.actionsJob")
  .add(HttpApiEndpoint.post("actions.job.retry", "/api/actions/job/:bindingID/:jobID/retry", {
    params: Params, query: BindingQuery, payload: Actions.JobRetryCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.job.play", "/api/actions/job/:bindingID/:jobID/play", {
    params: Params, query: BindingQuery, payload: Actions.JobPlayCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P04 — `packages/protocol/src/groups/actions-operation.ts`

Blob `3f10d378e05334b87044f4682bddb955829e89c4`; arquivo SHA-256 `41181bc92b6c8e8a66cafc591e3cd096ad2819841fbeed165717039b58c629af`; 1441 bytes. prepare recebe OperationIntent; get/reconcile usam OperationID e devolvem Operation. A fonte separa admissão/readback de writes específicos.

Linhas 10–21, trecho SHA-256 `396cb7f5042d568cc3a08374482b775021bdc292a785b7c409152db235aa3430`:

```typescript
// Admission and readback are common; provider writes retain domain-specific payloads/endpoints.
export const ActionsOperationGroup = HttpApiGroup.make("server.actionsOperation")
  .add(HttpApiEndpoint.post("actions.operation.prepare", "/api/actions/operation/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.OperationIntent,
    success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.operation.get", "/api/actions/operation/:bindingID/:operationID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.operation.reconcile", "/api/actions/operation/:bindingID/:operationID/reconcile", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P05 — `packages/protocol/src/groups/actions-pipeline.ts`

Blob `9dbbab41ae7934a392b1bf1c84a724242d6327d5`; arquivo SHA-256 `9a0403bf24c224895b323679c5b2518c03719e4f2d0242d40b0f04b6c81237be`; 1190 bytes. merge-request usa mergeRequestID e MergeRequestCommand; trigger usa TriggerPipelineCommand; ambos devolvem CommandExecution.

Linhas 10–18, trecho SHA-256 `03b61cbdaa5eff073dcc75fa2c8ac8099acb731dd89a5ce98ef210834b9d373a`:

```typescript
export const ActionsPipelineGroup = HttpApiGroup.make("server.actionsPipeline")
  .add(HttpApiEndpoint.post("actions.pipeline.mergeRequest", "/api/actions/pipeline/:bindingID/merge-request/:mergeRequestID", {
    params: MergeRequestParams, query: BindingQuery, payload: Actions.MergeRequestCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.pipeline.trigger", "/api/actions/pipeline/:bindingID/trigger", {
    params: BindingParams, query: BindingQuery, payload: Actions.TriggerPipelineCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P06 — `packages/protocol/src/groups/actions-resource.ts`

Blob `ca49542c3a6106b748d9826cbc4d2a86a2f38cec`; arquivo SHA-256 `5f2536f77880ab6ed56d0391392131dec166a4876d0793efd414917fcce10cf8`; 1315 bytes. list combina ResourceListInput e limit positivo; command restringe action a create/update/delete/play/pause/keep/clear e recebe ResourceCommand.

Linhas 8–19, trecho SHA-256 `4ccd615a6760b05ab1f6672a1af1a9f78656de5a85bc0a20409381f63ebcf212`:

```typescript
const Query = Schema.Struct({ ...BindingQuery.fields, ...Actions.ResourceListInput.fields, limit: OptionalLimit })
const CommandParams = Schema.Struct({ ...BindingParams.fields, resourceKind: Actions.ResourceKind,
  action: Schema.Literals(["create", "update", "delete", "play", "pause", "keep", "clear"]) })

export const ActionsResourceGroup = HttpApiGroup.make("server.actionsResource")
  .add(HttpApiEndpoint.get("actions.resource.list", "/api/actions/resource/:bindingID", {
    params: BindingParams, query: Query, success: Location.response(Actions.ResourcePage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.resource.command", "/api/actions/resource/:bindingID/:resourceKind/:action", {
    params: CommandParams, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P07 — `packages/protocol/src/groups/actions-run.ts`

Blob `1763c6e768e40c91ca59839c587a1a5360b48ba4`; arquivo SHA-256 `76d65f1b75a0c5273b918c399b68af7ac00f880f0bfbbcec864c0424a89774ef`; 3262 bytes. List/get/jobs são readback paginado; retry/cancel/forceCancel/remove/approveFork/rename têm comandos com schemas específicos de provedor.

Linhas 8–23, trecho SHA-256 `3c9f1205e1bfd45e7e6740222d74a47e7f93285359a4db1ef51f2ec57084e04b`:

```typescript
const Params = Schema.Struct({ ...BindingParams.fields, runID: Schema.NonEmptyString })
const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.RunListInput.fields, limit: OptionalLimit })
const JobsQuery = Schema.Struct({ ...BindingQuery.fields, attempt: OptionalAttempt, cursor: Schema.optional(Schema.String) })

export const ActionsRunGroup = HttpApiGroup.make("server.actionsRun")
  .add(HttpApiEndpoint.get("actions.run.list", "/api/actions/run/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.RunPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.get", "/api/actions/run/:bindingID/:runID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Run), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.jobs", "/api/actions/run/:bindingID/:runID/jobs", {
    params: Params, query: JobsQuery, success: Location.response(Actions.JobPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.retry", "/api/actions/run/:bindingID/:runID/retry", {
    params: Params, query: BindingQuery, payload: Actions.RetryCommand,
```

## P08 — `packages/protocol/src/groups/actions-source.ts`

Blob `31d9a2c3441371883b3bb054dabd95c476d909ec`; arquivo SHA-256 `7a76272f1ec26e5ccb90705420c9ebca86f255fee55b88a3def300a538cbb0ed`; 2143 bytes. Validação de source/draft retorna Graph, com onExcessProperty:error nos DTOs de validação; branch/write/review são actions admitidas.

Linhas 8–22, trecho SHA-256 `8e4f5588a9e4888ac9d190024a7b0f52788456bc5d2ce8f1ef79709c605529a7`:

```typescript
const Params = Schema.Struct({ ...BindingParams.fields, action: Schema.Literals(["branch", "write", "review"]) })
const Validation = Schema.Struct({ source: Actions.Source, draft: Schema.String })
  .annotate({ identifier: "Actions.SourceValidation", parseOptions: { onExcessProperty: "error" } })
const DraftValidation = Schema.Struct({ base: Actions.SourceBase, path: Schema.NonEmptyString, draft: Schema.String })
  .annotate({ identifier: "Actions.DraftValidation", parseOptions: { onExcessProperty: "error" } })

export const ActionsSourceGroup = HttpApiGroup.make("server.actionsSource")
  .add(HttpApiEndpoint.get("actions.source.base", "/api/actions/source/:bindingID/base", {
    params: BindingParams, query: Schema.Struct({ ...BindingQuery.fields, ref: Schema.optional(Schema.NonEmptyString) }),
    success: Location.response(Actions.SourceBase), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.source.validateDraft", "/api/actions/source/:bindingID/validate-draft", {
    params: BindingParams, query: BindingQuery, payload: DraftValidation,
    success: Location.response(Actions.Graph), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

Linhas 27–30, trecho SHA-256 `3382228551a649105e9c5479a62a26b7fc85490d17e7205dfe6a186f3977267c`:

```typescript
  .add(HttpApiEndpoint.post("actions.source.command", "/api/actions/source/:bindingID/:action", {
    params: Params, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P09 — `packages/protocol/src/groups/actions-workflow.ts`

Blob `a3551a8dd9adc2227c9ab239a6e54ac27c1e491b`; arquivo SHA-256 `5337f5dd0f397fe53807f54897ca49a59e37f5b2bb6d936323dbc7e4cb025c93`; 2172 bytes. List/source/graph são leitura; dispatch/state aceitam DispatchCommand/WorkflowStateCommand e retornam CommandExecution.

Linhas 8–17, trecho SHA-256 `56cce89d7f88ca70d76848a64a121de12fd0f8f33245bd86e45c56067ed67b38`:

```typescript
const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.ListInput.fields, limit: OptionalLimit })
const SourceQuery = Schema.Struct({ ...BindingQuery.fields, path: Schema.NonEmptyString, ref: Schema.NonEmptyString })
const WorkflowParams = Schema.Struct({ ...BindingParams.fields, workflowID: Schema.NonEmptyString })

export const ActionsWorkflowGroup = HttpApiGroup.make("server.actionsWorkflow")
  .add(HttpApiEndpoint.get("actions.workflow.list", "/api/actions/workflow/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.WorkflowPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.workflow.source", "/api/actions/workflow/:bindingID/source", {
    params: BindingParams, query: SourceQuery, success: Location.response(Actions.Source), error: ActionsApiError,
```

Linhas 22–29, trecho SHA-256 `b592987ace46f123fac45cc9bcff1439242f94949f73916de0f57a121086876f`:

```typescript
  .add(HttpApiEndpoint.post("actions.workflow.dispatch", "/api/actions/workflow/:bindingID/:workflowID/dispatch", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.DispatchCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.workflow.state", "/api/actions/workflow/:bindingID/:workflowID/state", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.WorkflowStateCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## P10 — `packages/protocol/src/groups/agent.ts`

Blob `edc5df027602a83e1a85a90f89c8f93939d7a7c0`; arquivo SHA-256 `29757d8e109a561bff05d195979a69048c7a02c6ee20227dde48606da91d3948`; 3599 bytes. Detail anuncia tools, skills e engines/status; file get/update usam AgentFile e update declara 409 por revision stale.

Linhas 9–26, trecho SHA-256 `63d2d8954515b0747ebcca7fbfdc24cc48cc26145244ab6c322543e4efea81dc`:

```typescript
const AgentDetail = Schema.Struct({
  tools: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
  skills: Schema.Array(
    Schema.Struct({ name: Schema.String, description: Schema.String.pipe(Schema.optional), location: Schema.String }),
  ),
  /** The pinned command-line engines of the agent's toolkit, with their install state on this machine. */
  engines: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      version: Schema.String,
      license: Schema.String,
      upstream: Schema.String,
      role: Schema.Literals(["generator", "check", "indexer", "oracle"]),
      input: Schema.String,
      status: Schema.Literals(["absent", "fetching", "ready", "failed", "unsupported"]),
    }),
  ),
}).annotate({ identifier: "AgentV2.Detail" })
```

Linhas 77–91, trecho SHA-256 `7af440988fe52c379b88c17bc76056cee22de38af9ad6f65ccab441d95f4e035`:

```typescript
    HttpApiEndpoint.put("agent.file.update", "/api/agent/:agentID/file", {
      params: { agentID: Schema.String },
      query: LocationQuery,
      payload: AgentFile.Input,
      success: Location.response(AgentFile.Info),
      error: [InvalidRequestError, ConflictError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.agent.file.update",
          summary: "Update agent file",
          description:
            "Write the agent definition to this location's .orchestra/agent directory and reload the registered agents. Fails with 409 when `revision` no longer matches the file.",
        }),
```

## P11 — `packages/protocol/src/groups/atlas.ts`

Blob `1ad5dee72e17105d118eef8974cc283b68ea64ce`; arquivo SHA-256 `561bc5cfa8116287a20513d4f31c3294aaf92a12deb78ac1248e9835d26b072d`; 13026 bytes. Fachada da tela/store Atlas: distingue draft, emit, review, decisões e setup/index/mine; todos os endpoints declaram ServiceUnavailable.

Linhas 39–48, trecho SHA-256 `55f2f403bd332bb74d6209f82b78132a113ad1a0975f20e8c1f21273b59c9b2f`:

```typescript

// The Atlas screen over the requested Location's Atlas store: the legacy `/atlas/*` instance routes with the same wire
// shapes (an absent value is `null`, never omitted). A repository with no `.atlas/` answers `{ state: "empty" }`.
export const AtlasGroup = HttpApiGroup.make("server.atlas")
  .add(
    HttpApiEndpoint.get("atlas.snapshot", "/api/atlas/snapshot", {
      query: LocationQuery,
      success: Location.response(AtlasSnapshotResult),
      error: ServiceUnavailableError,
    })
```

Linhas 122–150, trecho SHA-256 `41fcdf4fa9dc2672badeea6f02e162c288a7edf5afb00e8fd4b4447e46d590a7`:

```typescript
    HttpApiEndpoint.post("atlas.draft", "/api/atlas/draft", {
      query: LocationQuery,
      payload: AtlasDraftInput,
      success: Location.response(AtlasDraftResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.draft",
          summary: "Draft and check an Atlas fact",
          description: "Compose a fact at an anchor and dry-run the emit gates; nothing is written.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.emit", "/api/atlas/emit", {
      query: LocationQuery,
      payload: AtlasEmitInput,
      success: Location.response(AtlasEmitResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.emit",
          summary: "Emit an Atlas fact",
          description: "Write a drafted fact through the governed emit door at the draft's rev.",
        }),
```

Linhas 317–330, trecho SHA-256 `9419c1725faae603a7c06e9b6499d441bb2d9559e8e59abe060b9ec1bce86890`:

```typescript
    HttpApiEndpoint.post("atlas.delegate", "/api/atlas/delegate", {
      query: LocationQuery,
      payload: AtlasDelegateInput,
      success: Location.response(AtlasDelegateResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.delegate",
          summary: "Delegate Atlas interview questions to a model",
          description:
            "A model drafts an answer to each open question; each draft keeps its question open until a person accepts it.",
        }),
```

## P12 — `packages/protocol/src/groups/behavior.ts`

Blob `425a3a163de79e880f5ff12271f799d1d2c4ead0`; arquivo SHA-256 `fb98fbb62ede3de878e903ef0c9a7a5c5ba1418ef1c4cc9fdf589682f5848753`; 1255 bytes. PUT recebe SetInput, devolve array Info e declara substituição do contexto de comportamento do projeto.

Linhas 9–23, trecho SHA-256 `82b2f559e0c9b4982f1aaadbeab5e01360148e9853439fef081b520a0a492dc8`:

```typescript
  .add(
    HttpApiEndpoint.put("behavior.set", "/api/behavior", {
      query: LocationQuery,
      payload: Behavior.SetInput,
      success: Location.response(Schema.Array(Behavior.Info)),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.behavior.set",
          summary: "Set behaviors",
          description:
            "Replace the behaviors of the requested location's project and return the stored set. Every session of the project receives them as system context from its next provider turn; removed behaviors leave the next turn's request.",
        }),
```

## P13 — `packages/protocol/src/groups/board.ts`

Blob `23b0f0389ec8ff9fa55c88ddeb85c7d3e740b57d`; arquivo SHA-256 `f8d139d54bacba1df58ea757058c5cf6ed2773cbec0f75bf6db2e7a2d8ef8bb6`; 10513 bytes. Projeto por key e issue por número positivo; reads têm DTOs específicos e writes OwnerResult, com 404/409; ownership de notas é declarado.

Linhas 6–23, trecho SHA-256 `5d773443792b819dce6309e7de825c480e987430ea94aa4b85a20629890ce4e2`:

```typescript
export class BoardNotFoundError extends Schema.TaggedErrorClass<BoardNotFoundError>()(
  "BoardNotFoundError",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

// A write the board's rules refuse; the message says what to do instead.
export class BoardRefusedError extends Schema.TaggedErrorClass<BoardRefusedError>()(
  "BoardRefusedError",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

const errors = [BoardNotFoundError, BoardRefusedError]
const IssueNumber = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt))
const project = { key: Schema.String }
const issue = { key: Schema.String, number: IssueNumber }
const child = { ...issue, id: Schema.String }
```

Linhas 52–56, trecho SHA-256 `4b96f6f7972b10f1f0118f9f9d9389a9ebb535138e9741d7fcb90f1e0bb23d5e`:

```typescript
    HttpApiEndpoint.get("board.get", "/api/board/:key", {
      params: project,
      success: Board.Snapshot,
      error: BoardNotFoundError,
    }).annotateMerge(
```

Linhas 102–116, trecho SHA-256 `308d39ae61343eb5c018c81fa1519029bb71ab9569d61209b6db7ac6ac3badbd`:

```typescript
    HttpApiEndpoint.patch("board.noteEdit", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      payload: Board.NoteInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("noteEdit", "Edit a note", "Edit one of the owner's notes; GitHub and Maestro notes are refused.")),
  )
  .add(
    HttpApiEndpoint.delete("board.noteDelete", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("noteDelete", "Delete a note", "Delete one of the owner's notes; GitHub and Maestro notes are refused."),
    ),
```

Linhas 280–286, trecho SHA-256 `cc3e0fdb435f0fbe57bc1199f10d888281bcd56434cb66050b7995cf443e83e2`:

```typescript
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "board",
      description: "Projects board: Maestro plans through its tools; the owner reads, answers, comments and steers here.",
    }),
  )
```

## P14 — `packages/protocol/src/groups/capability-connections.ts`

Blob `6359c2f9200522ae1745e2b551e3065d3660a4e9`; arquivo SHA-256 `9587fa37465609a08572e0e213014f59b5fceace360e792d64a2398081f7e993`; 4481 bytes. Páginas 1..32, mutations com idempotency-key, input de setup/binding/target e receipts diretos; aplica CapabilityAuthorization.

Linhas 9–32, trecho SHA-256 `9dbc75048f854aa4a7bb8742b3a1e25a923e0ef5a0996b02577be0ca47fa6864`:

```typescript
const Limit = Schema.NumberFromString.pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))),
  Schema.optionalKey,
).annotate({ description: "Maximum page size, 1..32. Defaults to 16." })

const ConnectionQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.ConnectionQuery.fields.after,
  limit: Limit,
})
const TargetQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityManagement.TargetQuery.fields.after,
  limit: Limit,
})
const BindingQuery = Schema.Struct({ ...LocationQuery.fields,
  after: CapabilityManagement.BindingQuery.fields.after, limit: Limit })
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })

export const CapabilityConnectionsGroup = HttpApiGroup.make("server.capability.connections")
  .add(
    HttpApiEndpoint.post("capability.connection.connect", "/api/capability/connections/connect", {
      query: LocationQuery, headers: MutationHeaders, payload: CapabilitySetup.Input,
      success: CapabilityManagement.Receipt,
```

Linhas 91–95, trecho SHA-256 `206156cace9e290e490a2fa45e3f560557d6f2ae7c81214d1a623986d31ba886`:

```typescript
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilityConnectionsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityConnectionsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P15 — `packages/protocol/src/groups/capability-operator.ts`

Blob `8cc30598b00b048918bff67b8dfd9e4c17e0e6af`; arquivo SHA-256 `86cb90696da816a6d4c39c08582be0c5aafd287ad40d38e8c8f1e9c008ed2126`; 888 bytes. Inspeciona requestID/principal/origin/scopeHash; origin é configured-auth/desktop/cli/sdk; aplica CapabilityAuthorization.

Linhas 6–16, trecho SHA-256 `64e2ef25a0d8975d2822e0c6dd13b8c3e335cf766e59be43ce1649a5b7f6bfd2`:

```typescript
export const CapabilityOperatorGroup = HttpApiGroup.make("server.capability.operator").add(
  HttpApiEndpoint.get("capability.operator.inspect", "/api/capability/operator", {
    query: LocationQuery,
    success: Schema.Struct({ requestID: Schema.String, principal: Schema.String,
      origin: Schema.Literals(["configured-auth", "desktop", "cli", "sdk"]), scopeHash: Schema.String }),
  }),
)

export const makeCapabilityOperatorGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityOperatorGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P16 — `packages/protocol/src/groups/capability-schedules.ts`

Blob `dd5dbd141492f84ecd5a54b16b27c334ebf31b0d`; arquivo SHA-256 `75201f38d78719bbd9649437ce55fa7ef18760fb0fb15c102a80739c98bc0b55`; 2701 bytes. Ações list/pause/resume/run/remove de schedules de agente; create/edit ficam no tool do agente; mutations exigem key.

Linhas 9–14, trecho SHA-256 `ae28d67c0b39430c6f0e1fb1fbebfa7776cfc03d9e3fe38e8409737030667e61`:

```typescript
const path = "/api/capability/schedules"
const item = `${path}/:scheduleID`
const params = { scheduleID: ScheduledTask.ID }
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
// Agent-created schedules only: create and edit stay with the owning agent's schedule_manage tool.
const errors = [ConflictError, UnknownError]
```

Linhas 24–43, trecho SHA-256 `7be63c32b2c96569019db1d174c35ad9fc0bfbd6ac9e48c1dd321e67cd24bcc9`:

```typescript
    HttpApiEndpoint.post("capability.schedule.pause", `${item}/pause`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }),
    HttpApiEndpoint.post("capability.schedule.resume", `${item}/resume`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Schedule, error: errors,
    }).annotateMerge(OpenApi.annotations({ description: "409 when the repeat limit is used up or a once lies in the past." })),
    HttpApiEndpoint.post("capability.schedule.run", `${item}/run`, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Started, error: errors,
    }).annotateMerge(OpenApi.annotations({
      description: "Start a run now without moving the next slot. A retry with the same idempotency key returns the same Session.",
    })),
    HttpApiEndpoint.delete("capability.schedule.remove", item, {
      params, query: LocationQuery, headers: MutationHeaders, success: CapabilityScheduleManagement.Removed, error: errors,
    }),
  )
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilitySchedulesGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilitySchedulesGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
```

## P17 — `packages/protocol/src/groups/command.ts`

Blob `6d028268790e99a5e5d0150d2cd143216fd56a56`; arquivo SHA-256 `bbd3ed5066f29c4d150539240d44350acd8f4c63035e15c0a57539e3bd31ee56`; 907 bytes. GET retorna catálogo Command.Info na localização; execução de comando não pertence a este grupo.

Linhas 9–19, trecho SHA-256 `c0facfa4506979785d07d99a61354db54b975945e44d766e1545ade89c739543`:

```typescript
    HttpApiEndpoint.get("command.list", "/api/command", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Command.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.command.list",
          summary: "List commands",
          description: "Retrieve currently registered commands.",
        }),
```

## P18 — `packages/protocol/src/groups/config.ts`

Blob `45c90cf87ab5a587c378aa2e61c2d97996835a0d`; arquivo SHA-256 `f86c534fc957edb9bc4a19d38e89a09c9482d06a63a6e79935c297d070ed01b6`; 3736 bytes. Patch global de modelo/shell/engines/providers/permissions; listas substituem as anteriores; update é NoContent.

Linhas 15–40, trecho SHA-256 `4946d8ea65309197d10a8397ad108f40eb8f830e3773aef4488d273552efdc67`:

```typescript
export const ConfigPatch = Schema.Struct({
  model: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  agents: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ engine: Schema.optional(Schema.Literals(["orchestra", "claude-code"])) })),
  ),
  disabledProviders: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "The whole list of disabled providers, stored as `provider.use` deny policies. Replaces the previous list.",
  }),
  providers: Schema.optional(Schema.Record(Schema.String, CustomProvider)).annotate({
    description: "Custom providers by ID, each replacing any previous definition of that ID.",
  }),
  permissions: Schema.optional(Permission.Ruleset).annotate({
    description:
      "The whole ordered list of tool permission rules; a later matching rule wins. Replaces the previous list.",
  }),
}).annotate({ identifier: "ConfigPatch" })

export const ConfigSettings = Schema.Struct({
  model: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  agents: Schema.Record(Schema.String, Schema.Struct({ engine: Schema.Literals(["orchestra", "claude-code"]) })),
  disabledProviders: Schema.Array(Schema.String),
  // In the user's order, since a later matching rule wins.
  permissions: Permission.Ruleset,
}).annotate({ identifier: "ConfigSettings" })
```

Linhas 56–65, trecho SHA-256 `9eecb3a62e5a77dea741cdf0e6830a65fdb23e9ab29e29e133cf76618f84f4c2`:

```typescript
    HttpApiEndpoint.patch("config.update", "/api/config", {
      payload: ConfigPatch,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.config.update",
        summary: "Update global settings",
        description:
          "Merge the default model, agent engines, disabled providers and tool permission rules into the global config document, then reload the agents and catalog of every open location.",
      }),
```

## P19 — `packages/protocol/src/groups/credential.ts`

Blob `23c549e2806d9c5a1d5187ce6d341640cc35ae8a`; arquivo SHA-256 `9c1a5962a9ea3e8fce8f5c7aeb85cefde7bc30891d00230d7fc6c3c649fb67b0`; 1439 bytes. PATCH altera somente label; DELETE remove por Credential.ID; os dois retornam NoContent e declaram ConflictError.

Linhas 8–18, trecho SHA-256 `c2d8d39b8672bc3d2fb7dcdfdcce666e61965e814d01653e679c203eef9a36ef`:

```typescript
  .add(
    HttpApiEndpoint.patch("credential.update", "/api/credential/:credentialID", {
      params: { credentialID: Credential.ID },
      query: LocationQuery,
      payload: Schema.Struct({ label: Schema.String }),
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
```

Linhas 26–36, trecho SHA-256 `de20f781c8865794c5d7d5131f68c25886fb717326554587baa0985501876895`:

```typescript
    HttpApiEndpoint.delete("credential.remove", "/api/credential/:credentialID", {
      params: { credentialID: Credential.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.credential.remove",
          summary: "Remove credential",
```

## P20 — `packages/protocol/src/groups/formatter.ts`

Blob `ad4fd15e9908fd1efce2277980d689ee07706782`; arquivo SHA-256 `563e0c55f2624483d03cc0cfdc61897d07e9f69de7a33a6b4eddf8495c4d3caa`; 949 bytes. Status dos formatters configurados/disponíveis por Location, Array(Formatter.Status).

Linhas 9–19, trecho SHA-256 `7912b6390ae70233d3a4b6feb3fa717512f8c81efef8be540727c91f2ffa2196`:

```typescript
    HttpApiEndpoint.get("formatter.status", "/api/formatter", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Formatter.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.formatter.status",
          summary: "Formatter status",
          description: "List the Location's configured formatters and whether each one is available.",
        }),
```

## P21 — `packages/protocol/src/groups/guardrail.ts`

Blob `a9c3d5c6643d271619f61f68444dca1fc5adcbc6`; arquivo SHA-256 `58b6a155fb294fc1f8ec6b592023e3df0461c154e32f0e0fbc368815eaa89ad4`; 1960 bytes. Rules e run/reports com erro400 kind/message e descrição de baseline merge-base.

Linhas 7–24, trecho SHA-256 `1a370b6a4d12deaf710a1e29707ce4eb87bd407facd6abc59e03e1141684d3f6`:

```typescript
// `kind` says why the engine could not answer, so clients can explain it without parsing the message.
export class GuardrailError extends Schema.ErrorClass<GuardrailError>("GuardrailError")(
  {
    name: Schema.Literal("GuardrailError"),
    data: Schema.Struct({
      kind: Guardrail.EngineErrorKind,
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export const GuardrailGroup = HttpApiGroup.make("server.guardrail")
  .add(
    HttpApiEndpoint.get("guardrail.rules", "/api/guardrail/rules", {
      query: LocationQuery,
      success: Location.response(Guardrail.Rules),
      error: GuardrailError,
```

Linhas 36–47, trecho SHA-256 `e03f4d2478ed02481bdd02c14799bcd2ccae2a9f5ac14abac97f5a9f824ac98f`:

```typescript
    HttpApiEndpoint.post("guardrail.run", "/api/guardrail/run", {
      query: LocationQuery,
      payload: Guardrail.RunInput,
      success: Location.response(Guardrail.Report),
      error: GuardrailError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.guardrail.run",
          summary: "Run guards",
          description: "Judge the location's current change against its guard rules and return the findings.",
```

## P22 — `packages/protocol/src/groups/health.ts`

Blob `be777a5f8d482fcb5f3b06c1a21077e2fc452bb5`; arquivo SHA-256 `a7d0a532d850330d45e04d672088dffc9df36a504bf09c95b2e78ac8b9a7f701`; 592 bytes. GET declara healthy:true, version e pid opcional; é schema de resposta, não medição de disponibilidade desta sessão.

Linhas 5–15, trecho SHA-256 `a9124d29a00ed84e523d53df54691d35c0c07392cc61be24d7f02834df8a3034`:

```typescript
  HttpApiEndpoint.get("health.get", "/api/health", {
    success: Schema.Struct({
      healthy: Schema.Literal(true),
      pid: Schema.optional(Schema.Int),
      version: Schema.String,
    }),
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.health.get",
      summary: "Check server health",
      description: "Check whether the API server is ready to accept requests.",
```

## P23 — `packages/protocol/src/groups/installation.ts`

Blob `ea13ec670bb99929cc76dcfdccc0c481870dcc0b`; arquivo SHA-256 `710926457a0a8785e2a08032ff0a1b344e3a2b885e0eef89a4b54363ab189610`; 776 bytes. POST target seleciona release, resposta success:true/version e erros 400/500; upgrade executado não foi observado.

Linhas 5–15, trecho SHA-256 `d893a4f1986f7389093aaa604ef8cb9a419acf892466e5951b3e15d5fc4adebc`:

```typescript
export const InstallationGroup = HttpApiGroup.make("server.installation").add(
  HttpApiEndpoint.post("installation.upgrade", "/api/installation/upgrade", {
    payload: Schema.Struct({ target: Schema.String }),
    success: Schema.Struct({ success: Schema.Literal(true), version: Schema.String }),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.installation.upgrade",
      summary: "Upgrade Orchestra",
      description: "Install the given Orchestra release with the package manager that installed this server.",
    }),
```

## P24 — `packages/protocol/src/groups/integration.ts`

Blob `14d98becffeda67939dbf5d87f0b63cfbd2e70ba`; arquivo SHA-256 `07d62144b0b00aa08f1c43fb3a52388b6fd1dee07881d3d0d22a701b9fc0f57f`; 7681 bytes. Discovery de métodos, connect por key/OAuth e polling/completion/cancel; endpoints OAuth por integrationID preservam compatibilidade.

Linhas 41–54, trecho SHA-256 `b5ffddadfeb9f3d28fa6c6e7bbe840353cbcfbaf82393ce6e4b001b60eb019ee`:

```typescript
    HttpApiEndpoint.delete("integration.disconnect", "/api/integration/:integrationID/connection", {
      params: { integrationID: Integration.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: ConflictError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.disconnect",
          summary: "Disconnect integration",
          description:
            "Remove every stored credential of one integration, such as a provider's saved key or sign-in. Environment variables are not stored and stay.",
        }),
```

Linhas 79–96, trecho SHA-256 `1b12c2f89f21a867c61b5365da75e4815127dc2b18df4c9bcadb1e0f0087c282`:

```typescript
    HttpApiEndpoint.post("integration.connect.oauth", "/api/integration/:integrationID/connect/oauth", {
      params: { integrationID: Integration.ID },
      query: LocationQuery,
      payload: Schema.Struct({
        methodID: Integration.MethodID,
        inputs: Inputs,
        label: Schema.optional(Schema.String),
      }),
      success: Location.response(Integration.Attempt),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.connect.oauth",
          summary: "Begin OAuth connection",
          description: "Start an OAuth attempt and return the authorization details.",
        }),
```

Linhas 100–112, trecho SHA-256 `70250569854cade9b220c4b33ab0be07a5d1ffb26cce20e4569eb2ae498101ab`:

```typescript
    HttpApiEndpoint.get("integration.oauth.status", "/api/integration/:integrationID/connect/oauth/:attemptID", {
      params: { integrationID: Integration.ID, attemptID: Integration.AttemptID },
      query: LocationQuery,
      success: Location.response(Integration.AttemptStatus),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.oauth.status",
          summary: "Get integration OAuth status",
          description: "Compatibility route for polling an OAuth attempt owned by this integration.",
        }),
```

Linhas 169–181, trecho SHA-256 `e26089cb97e61399722454e141fbcd184fd536fd394cc3558e0897251bac0edc`:

```typescript
    HttpApiEndpoint.post("integration.attempt.complete", "/api/integration/attempt/:attemptID/complete", {
      params: { attemptID: Integration.AttemptID },
      query: LocationQuery,
      payload: Schema.Struct({ code: Schema.optional(Schema.String) }),
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.integration.attempt.complete",
          summary: "Complete OAuth connection",
          description: "Complete a code-based OAuth attempt and store the resulting credential.",
```

## P25 — `packages/protocol/src/groups/lean.ts`

Blob `b83fcad1267819111ceeb2a83c165664440379b7`; arquivo SHA-256 `204a60d3ebec15a9da53f9f18d6e2612334b35dad29b90022ba1adc11614b32e`; 2253 bytes. Dashboard/update/history por item, todos com ServiceUnavailableError; não calcula economia nesta camada.

Linhas 9–14, trecho SHA-256 `4371e8ef85c8965b46abbeefa7c1f3759dac5c73579fd50c9a7065ef92c98391`:

```typescript
export const LeanGroup = HttpApiGroup.make("server.lean")
  .add(
    HttpApiEndpoint.get("lean.get", "/api/lean", {
      query: LocationQuery,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
```

Linhas 26–37, trecho SHA-256 `cd0b437fcb2655ff553b335f44939ed90f085e8c8569072c0853dc6c516927a0`:

```typescript
    HttpApiEndpoint.patch("lean.update", "/api/lean", {
      query: LocationQuery,
      payload: LeanDashboard.Update,
      success: Location.response(LeanDashboard.Info),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.update",
          summary: "Update Lean preferences",
          description: "Switch Lean or one of its items on or off for the saved profile, and return the dashboard.",
```

Linhas 42–54, trecho SHA-256 `9cdef9b2df1f33a1b067323153449b871d397d1cf2d20a8c51bc4ada83a1af6f`:

```typescript
    HttpApiEndpoint.get("lean.history", "/api/lean/history/:itemID", {
      params: { itemID: LeanCoverage.ItemID },
      query: LocationQuery,
      success: Location.response(LeanDashboard.History),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lean.history",
          summary: "Get Lean item history",
          description: "The latest executions one Lean item saved output on in this Location.",
        }),
```

## P26 — `packages/protocol/src/groups/location.ts`

Blob `7f5c91563ac986c182e397173db9e5aa4653296f`; arquivo SHA-256 `b99aa362106a3dff080f713552d9db82059fb42e2379ba825b9edb55e7e86442`; 1760 bytes. Query directory/workspace opcionais deepObject; Info direto e paths.home no endpoint de caminhos.

Linhas 5–12, trecho SHA-256 `579b2612769b55d44b8ea742480d0386580ab7bbc68e1cac6f371ee31edb4fa4`:

```typescript
export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
      workspace: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "LocationQuery" })
```

Linhas 20–23, trecho SHA-256 `2930b8e441baee0ed979ab434442e788cdf48f38dc4d2dc8d2d474f49846e186`:

```typescript
      parameters: parameters.map((parameter) =>
        parameter?.name === "location" && parameter?.in === "query"
          ? { ...parameter, style: "deepObject", explode: true }
          : parameter,
```

Linhas 33–54, trecho SHA-256 `a87efc5b49b2ce6afc4456577c1af5f299edd51de82215a4049ee0f2742c28dd`:

```typescript
export const LocationGroup = HttpApiGroup.make("server.location").add(
  HttpApiEndpoint.get("location.get", "/api/location", {
    query: LocationQuery,
    success: Location.Info,
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.location.get",
        summary: "Get location",
        description: "Resolve the requested location or the server default location.",
      }),
    ),
  HttpApiEndpoint.get("location.paths", "/api/location/paths", {
    success: LocationPaths,
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.location.paths",
      summary: "Get server paths",
      description: "Return the server user's home directory, where the app's folder picker starts.",
    }),
  ),
```

## P27 — `packages/protocol/src/groups/lsp.ts`

Blob `af1abb1824158a7d1b9f4bad3f035d2f7d3859e6`; arquivo SHA-256 `2f8262ae4f8259bf778ad2a97aef3a83dfa507b58aa3e2d55fecc1e71d9bca7c`; 877 bytes. Status de language servers conectados na Location, Array(Lsp.Status).

Linhas 9–19, trecho SHA-256 `bc12bb00627060cf08b312793a8b13d14037738c0c75a7eee911ac0a873706ed`:

```typescript
    HttpApiEndpoint.get("lsp.status", "/api/lsp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Lsp.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lsp.status",
          summary: "LSP status",
          description: "List the Location's connected language servers and their status.",
        }),
```

## P28 — `packages/protocol/src/groups/mcp.ts`

Blob `6b2d1fbbd2dabfff14404e2fcd5e04715bf338f6`; arquivo SHA-256 `40d05cb2bff6ec512c5952ffc719a68744649a6d1c89be05be9dd1e76f0904ca`; 7750 bytes. Discovery/status/config/resources/tools, mutations de config/conexão e OAuth; descrições distinguem redaction e env refs não resolvidas.

Linhas 39–53, trecho SHA-256 `64ef02999d4dedea1c5b9afd12d54e177b18aaf46b7176776533d789e94fb524`:

```typescript
  )
  .add(
    HttpApiEndpoint.get("mcp.config", "/api/mcp/config", {
      query: LocationQuery,
      success: Location.response(Schema.Record(Schema.String, Mcp.Entry)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.config",
          summary: "Read resolved MCP config",
          description:
            "Read each configured MCP server's resolved transport and endpoint. Headers, environment and OAuth settings are never returned.",
        }),
      ),
```

Linhas 86–97, trecho SHA-256 `1b886a232c978d28feb37a80456f2c868ae3c3b4fd13db55d88a9ffa6d1fe9e6`:

```typescript
    HttpApiEndpoint.put("mcp.add", "/api/mcp/:server", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ config: ConfigMCP.Server }),
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.add",
          summary: "Add MCP server",
```

Linhas 173–188, trecho SHA-256 `a177c415687966d59341a2e014bdb2c771140f3ab3773940ac6d005dd2fd534c`:

```typescript
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.auth.start",
          summary: "Start MCP OAuth",
          description:
            "Start an OAuth sign-in for a remote MCP server and return the authorization URL to open. The local callback completes the sign-in and reconnects the server; an empty URL means it was already authorized.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.auth.callback", "/api/mcp/:server/auth/callback", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ code: Schema.String }),
```

## P29 — `packages/protocol/src/groups/meeting.ts`

Blob `1a098d8e8f58b0705fcf0c3921f8a98c08a19340`; arquivo SHA-256 `2aeb305bf54748eb641ce1b691bab954d95fb2fbf1571ce0f937e58f54a6a9e1`; 6192 bytes. Start/append/stop/read/list, confirmações e handoff; ErrorReason estruturado em400, append NoContent e descrição de deduplicação.

Linhas 7–25, trecho SHA-256 `b0b3b13da057fe00d4295c02801aa252adbf5c7bdc846e40a5d9e7cc4da36a8d`:

```typescript
// `reason` says why the meeting could not change, so clients can explain it without parsing the message.
export class MeetingError extends Schema.ErrorClass<MeetingError>("MeetingError")(
  {
    name: Schema.Literal("MeetingError"),
    data: Schema.Struct({ reason: Meeting.ErrorReason }),
  },
  { httpApiStatus: 400 },
) {}

const ReadParams = Schema.Struct({ ...LocationQuery.fields, meetingID: Meeting.ID })
const ListParams = Schema.Struct({ ...LocationQuery.fields, ...Meeting.ListQuery.fields })

export const MeetingGroup = HttpApiGroup.make("server.meeting")
  .add(
    HttpApiEndpoint.post("meeting.start", "/api/meeting/start", {
      query: LocationQuery,
      payload: Meeting.StartInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
```

Linhas 38–49, trecho SHA-256 `eba42e087705ae6d3ba576d2b54e6be401f9c537d7ef78908177105812c8db2c`:

```typescript
    HttpApiEndpoint.post("meeting.append", "/api/meeting/segments", {
      query: LocationQuery,
      payload: Meeting.AppendInput,
      success: HttpApiSchema.NoContent,
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.append",
          summary: "Append meeting segments",
          description: "Append final transcript segments to a running meeting. Segments already stored are skipped.",
```

Linhas 164–176, trecho SHA-256 `0ab9e8a8a837275eb028f4b669dcfa91f51bfcd39f7194a5c355fc554b903337`:

```typescript
    HttpApiEndpoint.post("meeting.handoff", "/api/meeting/handoff", {
      query: LocationQuery,
      payload: Meeting.HandoffInput,
      success: Location.response(Meeting.HandoffResult),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.handoff",
          summary: "Send items to Maestro",
          description: "Send card items to Maestro through team_message, with their source and no transcript.",
        }),
```

## P30 — `packages/protocol/src/groups/permission.ts`

Blob `a34d8726146a5cdc1b989b583a4943290584d34b`; arquivo SHA-256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`; 5828 bytes. Queries de requests/saved e recursos de sessão; middleware placement separa endpoints prévios e session endpoints; reply é NoContent.

Linhas 60–84, trecho SHA-256 `65db8f5d7aa44e8c772b6927157fcd957e7dd11ea9a5b72779300ce60d6d4ad8`:

```typescript
    // Effect applies group middleware only to endpoints already added; session endpoints use session placement below.
    .middleware(locationMiddleware)
    .add(
      HttpApiEndpoint.post("session.permission.create", "/api/session/:sessionID/permission", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: Permission.ID.pipe(Schema.optional),
          action: Permission.Request.fields.action,
          resources: Permission.Request.fields.resources,
          save: Permission.Request.fields.save,
          metadata: Permission.Request.fields.metadata,
          source: Permission.Request.fields.source,
          agent: Agent.ID.pipe(Schema.optional),
        }),
        success: Schema.Struct({
          data: Schema.Struct({ id: Permission.ID, effect: Permission.Effect }),
        }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.create",
            summary: "Create permission request",
            description: "Evaluate and, when approval is required, create a permission request for a session.",
```

Linhas 104–128, trecho SHA-256 `2a81535fd993c0f17c77f2f3a35d92a48e73fe93cbe17435c3eca6c3f652d382`:

```typescript
      HttpApiEndpoint.get("session.permission.get", "/api/session/:sessionID/permission/:requestID", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        success: Schema.Struct({ data: Permission.Request }),
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.get",
            summary: "Get permission request",
            description: "Retrieve a pending permission request owned by a session.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.permission.reply", "/api/session/:sessionID/permission/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        payload: Schema.Struct({
          reply: Permission.Reply,
          message: Schema.String.pipe(Schema.optional),
        }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
```

## P31 — `packages/protocol/src/groups/project-copy.ts`

Blob `6e9c31ffda7a581a06f82e23b82185ffa31dd77b`; arquivo SHA-256 `b7be27f97fe517482a62e18e222aade4965880d7e4f5c60d3bb2b7f43c39c3fa`; 2589 bytes. Create omite projectID/sourceDirectory do payload e usa params/contexto; Remove omite projectID; erro400 inclui forceRequired opcional.

Linhas 10–31, trecho SHA-256 `cd5011b19bb948f7268501aec893479d439f7a00c9cb18c33e44cab395b7070b`:

```typescript
  {
    name: Schema.Literal("ProjectCopyError"),
    data: Schema.Struct({
      message: Schema.String,
      forceRequired: Schema.optional(Schema.Boolean),
    }),
  },
  { httpApiStatus: 400 },
) {}

const CreatePayload = Schema.Struct(Struct.omit(ProjectCopy.CreateInput.fields, ["projectID", "sourceDirectory"]))
const RemovePayload = Schema.Struct(Struct.omit(ProjectCopy.RemoveInput.fields, ["projectID"]))

export const ProjectCopyGroup = HttpApiGroup.make("server.projectCopy")
  .add(
    HttpApiEndpoint.post("projectCopy.create", root, {
      params: { projectID: Project.ID },
      query: LocationQuery,
      payload: CreatePayload,
      success: ProjectCopy.Copy,
      error: ProjectCopyError,
    })
```

Linhas 36–43, trecho SHA-256 `47dba7d7dcff111a307eadd8fa1a8139c5a015ffc62ea1d7a858ed9cb21332d9`:

```typescript
    HttpApiEndpoint.delete("projectCopy.remove", root, {
      params: { projectID: Project.ID },
      query: LocationQuery,
      payload: RemovePayload,
      success: HttpApiSchema.NoContent,
      error: ProjectCopyError,
    })
      .annotateMerge(locationQueryOpenApi)
```

## P32 — `packages/protocol/src/groups/project.ts`

Blob `46e212ecd9aa4c7eed43bec02f78e87a75d65b65`; arquivo SHA-256 `da3a028185367a5d87bb1ef19b0a9a387e38dc491713326c569b97d10cc37445`; 2606 bytes. Catálogo global e mutation por Project.ID; initGit é operação com LocationQuery e resposta nullable dentro do envelope.

Linhas 10–26, trecho SHA-256 `c1d9270c66c1bcfff85d168cd75f8a44ddf9cb4d576e6ed220a070ef1b87d1c8`:

```typescript
  .add(
    HttpApiEndpoint.get("project.list", "/api/project", {
      success: Schema.Array(Project.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.list",
        summary: "List projects",
        description: "Retrieve every project this server has opened, oldest first.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("project.directories", "/api/project/:projectID/directories", {
      params: { projectID: Project.ID },
      success: Schema.Array(Schema.Struct({ directory: AbsolutePath, strategy: Schema.optional(Schema.String) })),
    }).annotateMerge(
      OpenApi.annotations({
```

Linhas 35–48, trecho SHA-256 `6facfbea22a47bf6215f09657124b363b5754769bb97e3cf77d7420a09fdfefc`:

```typescript
      params: { projectID: Project.ID },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        icon: Schema.optional(Schema.Struct({ color: Schema.optional(Schema.String), override: Schema.optional(Schema.String) })),
        commands: Schema.optional(Project.Commands),
      }),
      success: Project.Info,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.project.update",
        summary: "Update project",
        description: "Rename a project or change its icon or start command.",
      }),
```

Linhas 51–61, trecho SHA-256 `2fd8be10bdb5f18067bcd40668e61bb0c3948c6f953557d08bffeb2359c81d99`:

```typescript
  .add(
    HttpApiEndpoint.post("project.initGit", "/api/project/git", {
      query: LocationQuery,
      success: Location.response(Schema.NullOr(Project.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.project.initGit",
          summary: "Initialize git",
          description:
```

## P33 — `packages/protocol/src/groups/pull-request.ts`

Blob `3b4883efab40b49a172f80ba54b4f9ee5594a6b8`; arquivo SHA-256 `2d6ffaa70170cc87e6950f8050bcd80113dfcc9fe588d8142e451afa6671de45`; 2260 bytes. List/create com erro400 kind/message e contexto host; declaração atribui efeitos ao gh/glab autenticado do servidor.

Linhas 8–21, trecho SHA-256 `2af0ab411774ade2945489bd9cdbe7d9a8edfb01675b88cff86d86250bb87abf`:

```typescript
// `kind` says why the host CLI could not answer, so clients can explain it without parsing the message.
export class PullRequestError extends Schema.ErrorClass<PullRequestError>("PullRequestError")(
  {
    name: Schema.Literal("PullRequestError"),
    data: Schema.Struct({
      kind: PullRequest.ErrorKind,
      message: Schema.String,
      host: optional(PullRequest.Host),
      branch: optional(Schema.String),
      remote: optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}
```

Linhas 25–37, trecho SHA-256 `88a90dc7e01b18b1324b915b03d064f068e53ed0107559287f74046eb88128f8`:

```typescript
    HttpApiEndpoint.get("pullRequest.list", "/api/pull-request", {
      query: LocationQuery,
      success: Location.response(PullRequest.List),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.list",
          summary: "List open pull requests",
          description:
            "List open pull requests on the location's github.com or gitlab.com remote through the gh or glab CLI signed in on the server.",
        }),
```

Linhas 41–54, trecho SHA-256 `9eb083a2ecbc0125cd1aa889d5c5d209eacf1836d866992b178aa3229da3d3ce`:

```typescript
    HttpApiEndpoint.post("pullRequest.create", "/api/pull-request", {
      query: LocationQuery,
      payload: PullRequest.CreateInput,
      success: Location.response(PullRequest.Created),
      error: PullRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.pullRequest.create",
          summary: "Create pull request",
          description:
            "Open a pull request from a pushed branch of the location's repository through the gh or glab CLI signed in on the server.",
        }),
```

## P34 — `packages/protocol/src/groups/question.ts`

Blob `c946dfc26741746eab179ba8061391ead76a182b`; arquivo SHA-256 `e128a5558fb90cd1492b3d4621be4359e66af7f9b6ca662373975d64b6b8e31b`; 3616 bytes. Pending list por Location; list/reply/reject por sessionID e requestID com middleware de sessão e erros404.

Linhas 33–62, trecho SHA-256 `19986a817f61f373b32b13e2c9b0dddfdfb79d1d8725148c4b99edb356652ada`:

```typescript
    .annotateMerge(OpenApi.annotations({ title: "questions", description: "Experimental question routes." }))
    // Effect applies group middleware only to endpoints already added; session endpoints use session placement below.
    .middleware(locationMiddleware)
    .add(
      HttpApiEndpoint.get("session.question.list", "/api/session/:sessionID/question", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Array(Question.Request) }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.list",
            summary: "List session question requests",
            description: "Retrieve pending question requests owned by a session.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.question.reply", "/api/session/:sessionID/question/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Question.ID },
        payload: Question.Reply,
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, QuestionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.reply",
            summary: "Reply to pending question request",
```

Linhas 67–78, trecho SHA-256 `7fa724d8a1537715ba985bdd2ba3103ced99ebb1eb6d3f937b62e1012484da42`:

```typescript
    .add(
      HttpApiEndpoint.post("session.question.reject", "/api/session/:sessionID/question/:requestID/reject", {
        params: { sessionID: Session.ID, requestID: Question.ID },
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, QuestionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.question.reject",
            summary: "Reject pending question request",
            description: "Reject a pending question request owned by a session.",
```

## P35 — `packages/protocol/src/groups/rag-studio.ts`

Blob `d0abf2ac581e1e560e6cc3769bdf6b5afd51ea36`; arquivo SHA-256 `765710e476d9aad6c06abcd7b9b610e34e57a57b0e1ede116a33b64b7151da10`; 6080 bytes. Sources/pipeline/revisions/search/ask/proofs; tipos explícitos de refusal embedding_off e one_pass restringem duas rotas.

Linhas 11–18, trecho SHA-256 `d24e635648231783086ed5648066efa8032daf8f6b2e5e9a364200168d8533a6`:

```typescript
// Rag Studio over the requested Location. Embedding stays off. Project source is refused as Atlas.
export const RagStudioGroup = HttpApiGroup.make("server.ragStudio")
  .add(
    HttpApiEndpoint.get("ragStudio.sources", "/api/rag-studio/sources", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RagStudio.Source)),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
```

Linhas 29–33, trecho SHA-256 `d0865fb3ce4a725a1068cb9ff035f51eb86946179dc149d651bbfec5aa54ac7d`:

```typescript
    HttpApiEndpoint.post("ragStudio.admit", "/api/rag-studio/sources", {
      query: LocationQuery,
      payload: RagStudio.PathInput,
      success: Location.response(RagStudio.AdmitResult),
      error: ServiceUnavailableError,
```

Linhas 83–104, trecho SHA-256 `08f019046472b3673679b4c32815992ee7e3d0023019e7d0ec8875546205609a`:

```typescript
    HttpApiEndpoint.post("ragStudio.search", "/api/rag-studio/search", {
      query: LocationQuery,
      payload: RagStudio.SearchInput,
      success: Location.response(Schema.Array(RagStudio.Chunk)),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.ask", "/api/rag-studio/ask", {
      query: LocationQuery,
      payload: RagStudio.AskInput,
      success: Location.response(RagStudio.QuestionResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.question", "/api/rag-studio/questions", {
      query: LocationQuery,
      payload: RagStudio.QuestionInput,
      success: Location.response(RagStudio.IdResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
```

Linhas 133–154, trecho SHA-256 `a7130679ae704fd5f2c78655980c6a2834fcf57004c7787dd5f43236af18ed3b`:

```typescript
    HttpApiEndpoint.post("ragStudio.embedding", "/api/rag-studio/embedding", {
      query: LocationQuery,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("embedding_off") })),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.pass", "/api/rag-studio/passes", {
      query: LocationQuery,
      payload: RagStudio.PassInput,
      success: Location.response(RagStudio.PassResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.passes", "/api/rag-studio/passes/batch", {
      query: LocationQuery,
      payload: RagStudio.PassesInput,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("one_pass") })),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
```

## P36 — `packages/protocol/src/groups/reference.ts`

Blob `0820aea4331c4617c4f4d5ef60bc94575e72ca6a`; arquivo SHA-256 `10cda63b26f6a8c899e61cd1da3bae24b0698efb7050af7d01abf1a9beb9b977`; 946 bytes. Somente catálogo Reference.Info na localização; não fornece acesso de conteúdo.

Linhas 9–18, trecho SHA-256 `d95db4735e0cad21512fea668506ccbe06cb3b187b182388e67dd3de6bf66035`:

```typescript
    HttpApiEndpoint.get("reference.list", "/api/reference", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Reference.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.reference.list",
          summary: "List references",
          description: "List references available in the requested location.",
```

## P37 — `packages/protocol/src/groups/relay-document.ts`

Blob `03680e54451165bb46ea12a5466322dd20357d89`; arquivo SHA-256 `4ee493b253f003a5cee6225b6acef9c9ab6b68af4d6c3775fcda126b555a5539`; 17770 bytes. Authoring e publicação; revision/checksum/force, recusa de check público e trial separado; versão publicada tem porta própria.

Linhas 15–41, trecho SHA-256 `dde27683dd38bd563320e4a7dd5493af50ead5a7e5abd4ddab94d456b5d8c80d`:

```typescript
export class RelayInvalidError extends Schema.TaggedErrorClass<RelayInvalidError>()("RelayInvalidError", refusal, {
  httpApiStatus: 400,
}) {}

export class RelayForbiddenError extends Schema.TaggedErrorClass<RelayForbiddenError>()(
  "RelayForbiddenError",
  refusal,
  {
    httpApiStatus: 403,
  },
) {}

export class RelayNotFoundError extends Schema.TaggedErrorClass<RelayNotFoundError>()("RelayNotFoundError", refusal, {
  httpApiStatus: 404,
}) {}

export class RelayConflictError extends Schema.TaggedErrorClass<RelayConflictError>()("RelayConflictError", refusal, {
  httpApiStatus: 409,
}) {}

export class RelayUnavailableError extends Schema.TaggedErrorClass<RelayUnavailableError>()(
  "RelayUnavailableError",
  refusal,
  { httpApiStatus: 503 },
) {}

export const RelayErrors = [RelayInvalidError, RelayNotFoundError, RelayConflictError, RelayUnavailableError]
```

Linhas 74–80, trecho SHA-256 `3fbc362738dbe94d71c8f618d58f5989dac190f071c4a53594fbe80e36ecfaaf`:

```typescript
/** A save of the version the editor loaded: `versionId` is required unless `force` overwrites whatever is stored. */
export const RelayDocumentUpdate = Schema.Struct({
  ...DocumentFields,
  versionId: Schema.optionalKey(Schema.String),
  expectedChecksum: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: "RelayDocumentUpdate" })
```

Linhas 306–319, trecho SHA-256 `a0d862634d8177f3f6f9cd7704f51c80b1c46949bfec493a0e11496dc905772d`:

```typescript
    HttpApiEndpoint.post("relay.document.check", `${document}/check`, {
      params,
      query: LocationQuery,
      payload: RelayCheckInput,
      success: Location.response(RelayArm.CheckOutcome),
      error: [...RelayErrors, RelayForbiddenError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.check",
          "Check workflow step",
          "Public authoring cannot execute workflow checks. This endpoint returns 403 maestro-execution-required; executable workflow checks are owned by Maestro through its approved native binding.",
        ),
```

Linhas 353–366, trecho SHA-256 `aee49894ce839b55a86193e9c0a558a038edc91962075125d4a6ae365869f3d7`:

```typescript
    HttpApiEndpoint.post("relay.document.trial", "/api/relay/trial", {
      query: LocationQuery,
      payload: RelayTrialInput,
      success: Location.response(RelayTrial),
      error: [...RelayErrors, RelayForbiddenError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.document.trial",
          "Try a check command",
          "Run one check command in the project the way a check runs, for at most 60 seconds, and return the end of its output. It grades and records nothing. An untrusted project is a 403 project-untrusted.",
        ),
      ),
```

Linhas 430–443, trecho SHA-256 `a27561a24226b68f6aeb4deaa83cad5a2bfc46c80943ae7ee8216abb03e80cbf`:

```typescript
    HttpApiEndpoint.post("relay.publish.publish", `${document}/publish`, {
      params,
      query: LocationQuery,
      payload: RelayPublishInput,
      success: Location.response(RelayDocumentView),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.publish.publish",
          "Publish Relay document",
          "Publish the document's current version once it compiles. The signed-in principal is recorded as publishedBy.",
        ),
```

## P38 — `packages/protocol/src/groups/relay-hook.ts`

Blob `dfc36c1b3b2cdf2b597e770b32c8bd4e0ce719ff`; arquivo SHA-256 `889c86dde2a4af1076f93147d98591d6682ef2eba09b8144861892f3298afb5d`; 7034 bytes. Instalações versionadas, enable/disable/order/uninstall/decision read; repair explícito exige confirm:true e preserva ledger no uninstall.

Linhas 17–47, trecho SHA-256 `3801189ced9016c4243585416602b353056c58311ddd4c802af6e8d55b7106ad`:

```typescript
/** Pin a published hook. `version` defaults to the document's published version and must be that version. */
export const RelayHookInstallInput = Schema.Struct({
  document: Schema.String,
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookInstallInput" })

/** Repin an install to its document's published version; `version`, when sent, must be that version. */
export const RelayHookUpdateInput = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayHookUpdateInput" })

export const RelayHookOrderInput = Schema.Struct({ installIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "RelayHookOrderInput",
})

/** The repair discards every install in a corrupt `hooks.json`, so the request states it. */
export const RelayHookRepairInput = Schema.Struct({ confirm: Schema.Literal(true) }).annotate({
  identifier: "RelayHookRepairInput",
})

/** The corrupt file was moved to `backup`, and `hooks.json` now holds no installs. */
export const RelayHookRepaired = Schema.Struct({
  backup: Schema.String,
  installs: Schema.Array(RelayHook.Install),
}).annotate({ identifier: "RelayHookRepaired" })

/** One `hook-decision` line of an install's ledger, with its chain sequence number. */
export const RelayHookDecision = Schema.Struct({
  ...RelayLedger.HookDecision.fields,
  seq: NonNegativeInt,
}).annotate({ identifier: "RelayHookDecision" })
```

Linhas 126–138, trecho SHA-256 `62bfba7eb516a9891ce0244432cae1a88098e05ac13119ee5f4aa0f516f944ef`:

```typescript
    HttpApiEndpoint.patch("relay.hook.order", "/api/relay/hook/order", {
      query: LocationQuery,
      payload: RelayHookOrderInput,
      success: Location.response(RelayHookInstalls),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.order",
          "Reorder installed hooks",
          "Set the evaluation order. The list must name every install exactly once, else 409 order-mismatch.",
        ),
```

Linhas 170–181, trecho SHA-256 `8511eb26002b6003846cbaf8e25fc2dcd8d85218aa7313da5d0630aafd17128d`:

```typescript
    HttpApiEndpoint.post("relay.hook.repair", "/api/relay/hook/repair", {
      query: LocationQuery,
      payload: RelayHookRepairInput,
      success: Location.response(RelayHookRepaired),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.hook.repair",
          "Repair hooks.json",
          "Only on this explicit request: a corrupt hooks.json (a regular file that does not decode or verify, or is over the size cap) is moved aside to a backup and replaced by an empty install list. A valid file, a symlink, a non-file or an unreadable file is never touched and answers 409.",
```

## P39 — `packages/protocol/src/groups/relay-run.ts`

Blob `98e60955b216d71887830cda06f8d07cd442fa98`; arquivo SHA-256 `7237bae800ad36fc21c77f3df21d5480fc11760e4f9b432e0c0f60dc06294834`; 4378 bytes. Leitura de runs e ledger externo; audit schema admite pass, mas descrição exige pending para cadeia íntegra self-reported.

Linhas 8–10, trecho SHA-256 `07bbbd4659bd8dedb3955bdcd0ed215ca12ca35c84160ce895e3714cd4235543`:

```typescript
// External runs (Relay for LangGraph), read-only: each `<location>/.relay/runs/<runID>/ledger.jsonl` rebuilt into the
// run the app's Executions screen renders. The ledger is self-reported by the external process, so its audit is never
// a pass.
```

Linhas 43–47, trecho SHA-256 `8e33823875ab9050fdc40ace1812d433adc85016f9bfd35cf3b599f7493c4fe6`:

```typescript
export const RelayExternalAudit = Schema.Struct({
  status: Schema.Literals(["pass", "fail", "pending"]),
  code: Schema.String,
  rows: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })),
}).annotate({ identifier: "RelayExternalAudit" })
```

Linhas 82–94, trecho SHA-256 `911be6259662c40ce9e486c1b3bd1c431fb216766ef26736c316d64abb6ff6da`:

```typescript
    HttpApiEndpoint.get("relay.run.audit", `${run}/audit`, {
      params,
      query: LocationQuery,
      success: Location.response(RelayExternalAudit),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.audit",
          "Audit external run",
          "Verify the run's ledger chain. An intact chain is pending external-self-reported, never pass; a broken one fails at its first bad line.",
        ),
```

Linhas 98–112, trecho SHA-256 `51bd47964e1c94fbc20fe505d31e8be0f627df5c7afa7bcad391d4388cb73d71`:

```typescript
    HttpApiEndpoint.get("relay.run.ledger", `${run}/ledger`, {
      params,
      query: Schema.Struct({
        ...LocationQuery.fields,
        after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
      error: RelayErrors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        docs(
          "v2.relay.run.ledger",
          "Read external run ledger",
          "The run's ledger entries from seq `after` on (all of them when it is 0 or absent).",
```

## P40 — `packages/protocol/src/groups/research-artifact.ts`

Blob `517434f6b238a90ee46da5790343c4c0f58b4cd5`; arquivo SHA-256 `d890554a5de05935339e01dcb74076a0cabd96d080d07b07bdd8151cf5978402`; 1650 bytes. SessionID + ArtifactID + revisão positiva, cursor opcional, ArtifactPage direto e middleware recebido; sem path de filesystem.

Linhas 9–24, trecho SHA-256 `8503ea154df3c7d0846e1720fb60df48778b2940ffb89cf37d720b5212d1dae2`:

```typescript
export class ResearchArtifactNotFoundError extends Schema.TaggedErrorClass<ResearchArtifactNotFoundError>()(
  "ResearchArtifactNotFoundError", { message: Schema.String }, { httpApiStatus: 404 },
) {}

export const makeResearchArtifactGroup = <I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.research")
    .add(HttpApiEndpoint.get("research.artifact", "/api/session/:sessionID/research/:artifactID", {
      params: Schema.Struct({ sessionID: SessionID, artifactID: Capability.ArtifactID }),
      query: Schema.Struct({ revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)), cursor: optional(Schema.String) }),
      success: Research.ArtifactPage,
      error: [ResearchArtifactNotFoundError, ConflictError, InvalidRequestError, ServiceUnavailableError],
    }).annotateMerge(OpenApi.annotations({
      identifier: "v2.research.artifact", summary: "Read an admitted research artifact revision",
      description: "Return exact retained source/document text in bounded immutable pages. Session and admitted scope determine access; arbitrary filesystem paths are not accepted.",
    })))
    .middleware(middleware)
```

## P41 — `packages/protocol/src/groups/schedule.ts`

Blob `0ca32d9e0c312fa279dbf98b1c3470252451876a`; arquivo SHA-256 `d901c49c299f7005f864dc21c0b7e1a99d4479888d10454a653dc7483c3f63c8`; 3793 bytes. CRUD e run de ScheduledTask; erros404/500 explícitos para run, descrição separa admissão e execução.

Linhas 8–21, trecho SHA-256 `59654c9144c3debaad5a127c86f2bc9c193055b8a2e7addb6919abd6d65abbfd`:

```typescript
export class ScheduleNotFoundError extends Schema.TaggedErrorClass<ScheduleNotFoundError>()(
  "ScheduleNotFoundError",
  {
    scheduleID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ScheduleRunError extends Schema.TaggedErrorClass<ScheduleRunError>()(
  "ScheduleRunError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}
```

Linhas 41–54, trecho SHA-256 `4a135bb6a227dcaef29fd6a5ddb1bb7a3f1b1ed4429fecbcf25ff89acc91c270`:

```typescript
    HttpApiEndpoint.post("schedule.create", "/api/schedule", {
      query: LocationQuery,
      payload: ScheduledTask.CreateInput,
      success: Location.response(ScheduledTask.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.create",
          summary: "Create scheduled task",
          description:
            "Schedule a prompt for the location. The server runs due slots itself; creating with an ID the location already has returns that task unchanged.",
        }),
```

Linhas 91–104, trecho SHA-256 `07059a71abb28daa8a0387c83c54c1dda5e677d8b023ba7278d72c3a098d6b1b`:

```typescript
    HttpApiEndpoint.post("schedule.run", "/api/schedule/:scheduleID/run", {
      params,
      query: LocationQuery,
      success: Location.response(ScheduledTask.RunResult),
      error: [ScheduleNotFoundError, ScheduleRunError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.schedule.run",
          summary: "Run scheduled task now",
          description:
            "Admit the task's prompt into a Session now. Serves the due slot when no run holds it, otherwise starts an extra run. A failed run is not recorded.",
        }),
```

## P42 — `packages/protocol/src/groups/skill.ts`

Blob `28b28134f9b9c751f9564737ea46034a9b36761e`; arquivo SHA-256 `290c280836fb40fbd5d963492088a4ff60c7b1d1d6315125e1317d6f58ce756f`; 2259 bytes. List e save/remove para catálogo/arquivos de projeto; save declara globals/built-ins/Atlas-governed read-only, com InvalidRequest/Conflict.

Linhas 29–42, trecho SHA-256 `b64ea5757b735aab98d937eee72c87b739e52ba5482d4a7a8060a36d2770cd31`:

```typescript
    HttpApiEndpoint.put("skill.save", "/api/skill", {
      query: LocationQuery,
      payload: Skill.SaveInput,
      success: Location.response(Skill.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.save",
          summary: "Save skill",
          description:
            "Create a project skill under .orchestra/skills, or rewrite a registered project skill file given its path. Global, built-in and Atlas-governed skills are read-only. Front matter is re-serialized as YAML.",
        }),
```

Linhas 46–56, trecho SHA-256 `7dedcf2fc8fa8c1b0bdf3b43776e040717e1027af02f054be579e04bd980ef6d`:

```typescript
    HttpApiEndpoint.delete("skill.remove", "/api/skill", {
      query: SkillRemoveQuery,
      success: Location.response(Schema.Boolean),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.remove",
          summary: "Remove skill",
          description: "Delete a registered project skill file given its path, and its folder when that is left empty.",
```

## P43 — `packages/protocol/src/groups/trust.ts`

Blob `6edc0294a84214180849fb00e25ce7f5a10ea381`; arquivo SHA-256 `5c605bf5836bc45630538c2b037e173b4062bc2d0991b6f0434d68b746bc4589`; 1986 bytes. Lista/aprova/revoga trust global com directory String; não é Location-scoped; realpath e herança são descrições de behavior.

Linhas 5–7, trecho SHA-256 `4e0b008d068d9574343bdc012cb1a064cbb3ec345ba71e1f724d9ad388eaa851`:

```typescript
const DirectoryPayload = Schema.Struct({ directory: Schema.String })

// Trust is a user decision stored in the global config, so these routes are not scoped to a Location.
```

Linhas 22–45, trecho SHA-256 `e6b9f9d63a2aa59f71be99af147d70b0f37a848d6a7dee19bce7661e10665083`:

```typescript
    HttpApiEndpoint.post("trust.approve", "/api/trust/approve", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.approve",
        summary: "Trust project",
        description:
          "Store an existing absolute project folder, resolved to its real path, in the global config's trusted_projects, then start its blocked MCP servers. Approving a folder that is already trusted changes nothing.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("trust.revoke", "/api/trust/revoke", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.revoke",
        summary: "Revoke project trust",
        description:
          "Remove a folder's own entry from the global config's trusted_projects, then stop its running local MCP servers. A folder trusted only through a parent folder stays trusted.",
      }),
```

## P44 — `packages/protocol/src/groups/vcs.ts`

Blob `394f864cc464cbaaa7c11c565c12fb738702c1a4`; arquivo SHA-256 `ed0bc013c50e318eaba1e8dc8417ff97aad0f4508dc16b67c2c58edac280b6e3`; 3386 bytes. Info/status/diff working|branch, métricas entre millis e atividade de sessão por período.

Linhas 40–55, trecho SHA-256 `c33a53c68329ba83ccbf561a6648116ce6e737e567e02bf38a79452f0d7cc516`:

```typescript
  .add(
    HttpApiEndpoint.get("vcs.diff", "/api/vcs/diff", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        mode: Schema.Literals(["working", "branch"]),
        context: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
      }),
      success: Location.response(Schema.Array(Vcs.FileDiff)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.diff",
          summary: "Diff changes",
          description:
            "Diffs of the working tree against HEAD (`working`) or against the merge base with the default branch (`branch`).",
```

Linhas 59–71, trecho SHA-256 `113a5e4972ec6608a0e8afb4b85ee4625a97ecd033732ed1e3a1685029815255`:

```typescript
  .add(
    HttpApiEndpoint.get("vcs.activity", "/api/vcs/activity", {
      query: Schema.Struct({ ...LocationQuery.fields, since: Millis, until: Millis }),
      success: Location.response(Vcs.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.vcs.activity",
          summary: "Get commit activity",
          description: "Commits, merges, authors and changed lines between two epoch-millisecond bounds.",
        }),
      ),
```

Linhas 76–88, trecho SHA-256 `345ccbff90f411135750a210e04cc83943c1fc0ca177b60561e107c2a3aed6cd`:

```typescript
      success: Location.response(SessionActivity.Activity),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.activity.session",
          summary: "Get Session activity",
          description:
            "Recorded Session activity of the location's project over a period (of the directory alone outside git).",
        }),
      ),
  )
  .annotateMerge(
```

