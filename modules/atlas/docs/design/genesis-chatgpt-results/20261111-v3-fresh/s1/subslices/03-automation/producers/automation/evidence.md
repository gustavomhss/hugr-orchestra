# Arquivo integral de evidência selecionada: Actions, Board e agendamento

Artefato `s1.core.automation` · baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38` · repositório `gustavomhss/hugr-orchestra`.

Todos os blocos são transcrições literais dos bytes UTF-8 capturados por `github.fetch_blob`. Linhas são 1-based inclusivas; intervalos separados omitem contexto, não inserem código. Git blob SHA1 e SHA256 são da fonte completa, não de uma versão reformatada. Cada fence preserva os bytes de seu intervalo (a quebra que fecha o fence não é parte da fonte quando a última linha não a contém).

O archive é `sources/<path>`; `captures.json` fixa os 204 arquivos e `coverage.jsonl` fixa suas disposições. Os IDs abaixo ligam este documento às seções do `body.md`. Só leitura estática ocorreu; testes existentes são NOT_RUN.


## A01 — Fachada preguiçosa, snapshot e roteamento

Vínculo: `body.md` §1, 3; archive de evidência: `evidence.md`, seção `A01`.


### `packages/core/src/actions.ts`

Archive: `sources/packages/core/src/actions.ts` · bytes: 12779 · Git blob: `4f81df84763bd63e7680de8fd40c60b583ef68ca` · SHA256: `08c5f306bc1c53b978a4254eba0fc708d9a4bfbb30fb63ead23c237f359fceef`.

Papel da fonte: Fachada da Location; construção lazy, congelamento de entrada e reconciliador efetivamente escolhido.


Linhas **39–85**; SHA256 do intervalo `85683ffcc6e21d378a3e216eb3fe954e082062ae01c76bc71a5a0990aad4da1b`:

~~~~typescript
  readonly sourceBase: (binding: Actions.BindingRef, ref?: string) => Effect.Effect<Actions.SourceBase, ActionsError>
  readonly validateDraft: (binding: Actions.BindingRef, base: Actions.SourceBase, path: string, draft: string) => Effect.Effect<Actions.Graph, ActionsError>
  readonly execute: (
    binding: Actions.BindingRef, kind: Actions.OperationKind, input: Actions.ExecuteInput,
    target: Actions.OperationTarget,
  ) => Effect.Effect<Actions.CommandExecution, ActionsError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Actions") {}

export const make = Effect.fn("Actions.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  transport?: ActionsContract.Transport
}) {
  const config = { ...input }
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const transport = config.transport ?? (yield* ActionsTransport.make({ directory: config.directory }))
  const lifetime = yield* Scope.Scope
  const database = yield* Database.Service
  const operations = yield* Effect.cached(ActionsOperations.make(config).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(lifetime),
  ))
  const github = ActionsGitHubRead.make({ transport })
  const gitlab = ActionsGitLabRead.make({ transport })
  const reader = (binding: Actions.Binding) => binding.provider.kind === "github" ? github : gitlab
  const resources = ActionsResources.make({ transport, reader, directory: config.directory, proc })
  const output = (binding: Actions.Binding) => Effect.promise(() => import("./actions/output/index")).pipe(
    Effect.map(({ ActionsOutput }) => ActionsOutput.make({ transport, reader: reader(binding) })),
  )

  // Actions is Location-scoped, but a non-Git Location must still boot other services.
  // Resolve repository state only when an Actions method is requested.
  const store = () => ActionsBinding.make({ ...config, resolve: transport.resolve }).pipe(
    Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, proc),
  )
  const bindings: ActionsContract.Bindings = {
    list: () => store().pipe(Effect.flatMap((bindings) => bindings.list())),
    create: (input) => store().pipe(Effect.flatMap((bindings) => bindings.create(input))),
    update: (id, input) => store().pipe(Effect.flatMap((bindings) => bindings.update(id, input))),
    remove: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.remove(ref))),
    get: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.get(ref))),
    policy: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.policy(ref))),
    updatePolicy: (ref, policy) => store().pipe(Effect.flatMap((bindings) => bindings.updatePolicy(ref, policy))),
~~~~


Linhas **123–133**; SHA256 do intervalo `261f4f5aba2950ebbbb2ac28453bbe03c1d09a6c079851cd120b77759fadcb54`:

~~~~typescript
    }),
    operation: Effect.fn("Actions.operation")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.get(binding, id)
    }),
    reconcile: Effect.fn("Actions.reconcile")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.reconcile(binding, id, (intent, acknowledged) =>
        ActionsReadback.observe(reader(binding), binding, intent, acknowledged))
~~~~


Linhas **171–216**; SHA256 do intervalo `979798c8f117f8644132e6a5ead7834f5c1b26882c99856fd595db55f19e3bd3`:

~~~~typescript
    execute: Effect.fn("Actions.execute")(function* (ref, kind, input, target) {
      const selected = { ...ref }
      const submission = structuredClone(input)
      const expected = { ...target }
      const binding = yield* bindings.get(selected)
      const transient = { output: undefined as Actions.CommandOutput | undefined }
      const service = yield* operations
      const operation = yield* service.execute(binding, submission, (intent, payload) => Effect.gen(function* () {
        if (intent.kind !== kind || (["workflowID", "runID", "jobID", "resourceID", "resourceKind", "scope", "path", "ref"] as const)
          .some((key) => expected[key] !== undefined && intent.target[key] !== expected[key]))
          return yield* new ActionsError({ kind: "intent_conflict", message: "Command endpoint differs from the admitted native target", disposition: "definitely_unsent" })
        const result: ActionsContract.CommandResult = yield* Effect.gen(function* () {
          if (intent.kind.startsWith("source.")) {
            const { ActionsAuthoring } = yield* Effect.promise(() => import("./actions/authoring/index"))
            return yield* ActionsAuthoring.make({ transport, reader: reader(binding) }).perform(binding, intent, payload)
          }
          if (intent.target.resourceKind) return yield* resources.perform(binding, intent, payload)
          if (binding.provider.kind === "github") {
            const { ActionsGitHubCommands } = yield* Effect.promise(() => import("./actions/github/commands"))
            return yield* ActionsGitHubCommands.make({ transport, reader: github }).perform(binding, intent, payload)
          }
          const { ActionsGitLabCommands } = yield* Effect.promise(() => import("./actions/gitlab/commands"))
          return yield* ActionsGitLabCommands.make({ transport, reader: gitlab }).perform(binding, intent, payload)
        })
        transient.output = result.output === undefined ? undefined : yield* Schema.decodeUnknownEffect(Schema.toType(Actions.CommandOutput), {
          onExcessProperty: "error",
        })(result.output).pipe(Effect.mapError(() => new ActionsError({
          kind: "outcome_unknown", message: "Native command returned an invalid one-time output",
        })))
        return result.acknowledgement
      }))
      return { operation, ...(transient.output === undefined ? {} : { output: transient.output }) }
    }),
  } satisfies Interface
})

const layer = Layer.effect(Service, Effect.gen(function* () {
  const location = yield* Location.Service
  const global = yield* Global.Service
  return yield* make({ directory: location.directory, workspaceID: location.workspaceID,
    projectID: location.project.id, stateDirectory: global.data })
}).pipe(Effect.orDie))

export const node = makeLocationNode({
  service: Service, layer, deps: [Location.node, Global.node, FSUtil.node, AppProcess.node, Database.node],
})
~~~~


### `packages/core/src/actions/contract.ts`

Archive: `sources/packages/core/src/actions/contract.ts` · bytes: 5462 · Git blob: `62521cbd3f4860049c3480a2bf9f2ed650c6c9f8` · SHA256: `c69997923b14da057a5cab4b3e9077884263d43c02f98dee1da44fedf65ae9bc`.

Papel da fonte: Seams de reader/transport/operations; separa acknowledgment persistido de saída de comando.


Linhas **10–36**; SHA256 do intervalo `2bd1fa16a0b4bd85621f7d51a78270dde16473a80420c60aa3fd909ef0225b28`:

~~~~typescript
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | boolean>>
  readonly body?: Json
}
export type Response = { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly data: Json }
export type BindingIdentity = { readonly projectID: string; readonly projectPath: string; readonly account: string }
export type BindingResolver = (provider: Actions.Provider, projectPath: string) => Effect.Effect<BindingIdentity, ActionsError>
export type CommandResult = { readonly acknowledgement: Actions.OperationAcknowledgement; readonly output?: Actions.CommandOutput }
export type RawResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Stream.Stream<Uint8Array, ActionsError>
  readonly close: Effect.Effect<void>
}
export type BoundRequest = Request & { readonly method: "GET"; readonly body?: never }

export interface Transport {
  readonly resolve: BindingResolver
  readonly request: (binding: Actions.Binding, input: Request) => Effect.Effect<Response, ActionsError>
  readonly bytes: (binding: Actions.Binding, input: Request) => Stream.Stream<Uint8Array, ActionsError>
  readonly open?: (binding: Actions.Binding, input: BoundRequest) => Effect.Effect<RawResponse, ActionsError, Scope.Scope>
  readonly upload: (
    binding: Actions.Binding,
    input: Request,
    file: { readonly filename: string; readonly bytes: Stream.Stream<Uint8Array, ActionsError> },
  ) => Effect.Effect<Response, ActionsError>
}
~~~~


Linhas **48–88**; SHA256 do intervalo `12a838c0514293a325d2eb48abe36256ac2a193f2b5ce01ab2b1ee71e9bf2aaf`:

~~~~typescript
export interface Adapter {
  readonly capabilities: (binding: Actions.Binding) => Effect.Effect<Actions.Capability[], ActionsError>
  readonly workflows: (binding: Actions.Binding, input: Actions.ListInput) => Effect.Effect<Actions.WorkflowPage, ActionsError>
  readonly source: (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) => Effect.Effect<Actions.Source, ActionsError>
  readonly runs: (binding: Actions.Binding, input: Actions.RunListInput) => Effect.Effect<Actions.RunPage, ActionsError>
  readonly run: (binding: Actions.Binding, id: string) => Effect.Effect<Actions.Run, ActionsError>
  readonly jobs: (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) => Effect.Effect<Actions.JobPage, ActionsError>
  readonly resources: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, input: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    intent: Actions.OperationIntent,
    acknowledgement?: Actions.OperationAcknowledgement,
  ) => Effect.Effect<Actions.OperationObservation, ActionsError>
  readonly transfer: (binding: Actions.Binding, input: Actions.TransferInput) => Stream.Stream<Uint8Array, ActionsError>
}

export interface Operations {
  readonly prepare: (binding: Actions.Binding, input: Actions.OperationIntent) => Effect.Effect<Actions.Operation, ActionsError>
  readonly execute: (
    binding: Actions.Binding,
    input: Actions.ExecuteInput,
    perform: (intent: Actions.OperationIntent, payload: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
  readonly get: (binding: Actions.Binding, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    id: Actions.OperationID,
    observe: (intent: Actions.OperationIntent, acknowledgement?: Actions.OperationAcknowledgement) => Effect.Effect<Actions.OperationObservation, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
}

export type ReadAdapter = Pick<Adapter, "capabilities" | "workflows" | "source" | "runs" | "run" | "jobs">
export interface Commands {
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}

export interface ResourceDomain {
  readonly list: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}
~~~~


### `packages/core/src/actions/error.ts`

Archive: `sources/packages/core/src/actions/error.ts` · bytes: 246 · Git blob: `5557a68cf67417c2c3149f6f130952297114ecbd` · SHA256: `9ce2b3a2943588b3bf4676773f9966a75f347aa84522b9ae96131ba9839017e7`.

Papel da fonte: Erro tipado do domínio Actions usado na classificação, não texto livre de stderr.


Linhas **1–6**; SHA256 do intervalo `9ce2b3a2943588b3bf4676773f9966a75f347aa84522b9ae96131ba9839017e7`:

~~~~typescript
export * as ActionsErrors from "./error"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"

export class ActionsError extends Schema.TaggedErrorClass<ActionsError>()("ActionsError", Actions.ErrorData.fields) {}
~~~~


## A02 — Binding físico e estado externo

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A02`.


### `packages/core/src/actions/binding.ts`

Archive: `sources/packages/core/src/actions/binding.ts` · bytes: 11296 · Git blob: `0012bd2c459c7c9899ce63aa6d4bb69760e9647a` · SHA256: `fa7b2380b5ea1c3b10195b17e2015fed34f0501df2e16cfa7fe497969dba83bc`.

Papel da fonte: Resolução de remoto bruto/efetivo antes de auth, referência confiável e revisão sem retarget.


Linhas **25–100**; SHA256 do intervalo `f887627ba910b22ad36e14bf0b858d039c513f82bf88c5be228bfeb867ede259`:

~~~~typescript
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const directory = yield* ActionsState.canonical(input.directory)
  yield* fs.realPath(directory).pipe(Effect.mapError(invalid))
  const git = Effect.fnUntraced(function* (args: string[]) {
    const result = yield* proc.run(ChildProcess.make("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd: directory,
      // Git placement/config environment must not redirect this trusted Location, including Windows key casing.
      env: Object.fromEntries(Object.entries(process.env).filter((entry) => !/^GIT_/i.test(entry[0]))),
      extendEnv: false,
      stdin: "ignore",
    }), { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" }).pipe(
      Effect.mapError(() => new ActionsError({ kind: "transport_failed", message: "Unable to inspect the repository's git configuration." })),
    )
    if (result.stdoutTruncated)
      return yield* new ActionsError({ kind: "metadata_truncated", message: "Git configuration exceeds the Actions read limit." })
    if (result.exitCode !== 0) return yield* invalid()
    // POSIX filenames may end in CR: only LF terminates git output there. NUL-delimited config stays intact.
    return result.stdout.toString("utf8").replace(process.platform === "win32" ? /\r?\n$/ : /\n$/, "")
  })
  const repository = yield* git(["rev-parse", "--show-toplevel"]).pipe(Effect.mapError((error) => error.kind === "invalid_input"
    ? new ActionsError({ kind: "not_found", message: "This folder is not a Git repository." })
    : error))
  const state = yield* ActionsState.make({ ...input, directory, repository })
  const target = Effect.fnUntraced(function* (request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    const provider = yield* checked(() => ActionsState.provider(decoded.provider))
    const projectPath = yield* checked(() => ActionsState.projectPath(provider.kind, decoded.projectPath))
    if (!ActionsState.validRemote(decoded.remote)) return yield* invalid()
    // Validate every fetch URL, including git's insteadOf expansion, before touching provider authentication.
    const raw = yield* git(["config", "--null", "--get-all", `remote.${decoded.remote}.url`])
    const effective = yield* git(["remote", "get-url", "--all", decoded.remote])
    yield* checked(() => [...raw.split("\0").filter(Boolean), ...effective.split(/\r?\n/)].forEach((remote) =>
      matchRemote(remote, provider, projectPath)))
    const identity = yield* input.resolve(provider, projectPath)
    if (!identity.projectID.trim() || /[\x00-\x20\x7f]/.test(identity.projectID) ||
      !identity.account || /[\x00-\x20\x7f]/.test(identity.account))
      return yield* new ActionsError({ kind: "transport_failed", message: "Provider returned invalid project or account identity." })
    yield* checked(() => ActionsState.projectPath(provider.kind, identity.projectPath))
    if (!samePath(provider.kind, projectPath, identity.projectPath))
      return yield* new ActionsError({ kind: "host_mismatch", message: "Provider returned a different project path." })
    return { ...decoded, provider, projectID: identity.projectID, projectPath: identity.projectPath, account: identity.account }
  })
  const record = Effect.fnUntraced(function* (document: ActionsState.Document, ref: Actions.BindingRef) {
    // A Binding is also a BindingRef; project away caller metadata and use only the trusted store's Location.
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingRef)(ref).pipe(Effect.mapError(invalid))
    const current = document.records.find((item) => item.binding.id === decoded.id)
    if (!current) return yield* new ActionsError({ kind: "binding_missing", message: "Actions binding does not exist at this Location." })
    if (current.binding.revision !== decoded.revision)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding revision has changed.", bindingID: decoded.id })
    return current
  })
  const list = Effect.fn("ActionsBinding.list")(function* () {
    return (yield* state.read()).records.map((item) => item.binding)
  })
  const create = Effect.fn("ActionsBinding.create")(function* (request: Actions.BindingInput) {
    return yield* state.change((document) => Effect.gen(function* () {
      const resolved = yield* target(request)
      if (resolved.expectedRevision !== undefined) return yield* invalid()
      if (document.records.some((item) => item.binding.remote === resolved.remote || ActionsState.identityKey(item.binding) === ActionsState.identityKey(resolved)))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions project or remote is already bound at this Location." })
      const binding: Actions.Binding = {
        id: Actions.BindingID.create(), revision: 1, remote: resolved.remote, provider: resolved.provider,
        projectID: resolved.projectID, projectPath: resolved.projectPath, account: resolved.account,
        directory, ...(input.workspaceID === undefined ? {} : { workspaceID: input.workspaceID }),
      }
      return { document: { ...document, records: [...document.records, { binding, policy: {} }] }, value: binding }
    }))
  })
  const update = Effect.fn("ActionsBinding.update")(function* (id: Actions.BindingID, request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    if (decoded.expectedRevision === undefined)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding update requires an expected revision." })
    const expectedRevision = decoded.expectedRevision
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, { id, revision: expectedRevision })
~~~~


Linhas **104–161**; SHA256 do intervalo `9cdfa8fb198c30c407b084d62d86cae06baa2178433c10248cf4b3026e5c9794`:

~~~~typescript
      if (document.records.some((item) => item !== current && item.binding.remote === resolved.remote))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions remote is already bound at this Location.", bindingID: id })
      const binding = { ...current.binding, revision: current.binding.revision + 1, remote: resolved.remote,
        provider: resolved.provider, projectPath: resolved.projectPath, account: resolved.account }
      return { document: { ...document, records: document.records.map((item) => item === current ? { ...item, binding } : item) }, value: binding }
    }))
  })
  const get = Effect.fn("ActionsBinding.get")(function* (ref: Actions.BindingRef) {
    return (yield* record(yield* state.read(), ref)).binding
  })
  const remove = Effect.fn("ActionsBinding.remove")(function* (ref: Actions.BindingRef) {
    yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      return { document: { ...document, records: document.records.filter((item) => item !== current) }, value: undefined }
    }))
  })
  const policy = Effect.fn("ActionsBinding.policy")(function* (ref: Actions.BindingRef) {
    const current = yield* record(yield* state.read(), ref)
    return { binding: { id: current.binding.id, revision: current.binding.revision }, policy: current.policy }
  })
  const updatePolicy = Effect.fn("ActionsBinding.updatePolicy")(function* (ref: Actions.BindingRef, policy: Actions.Policy) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.Policy, STRICT)(policy).pipe(Effect.mapError(invalid))
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      const binding = { ...current.binding, revision: current.binding.revision + 1 }
      return {
        document: { ...document, records: document.records.map((item) => item === current ? { binding, policy: decoded } : item) },
        value: { binding: { id: binding.id, revision: binding.revision }, policy: decoded },
      }
    }))
  })
  return { list, create, update, get, remove, policy, updatePolicy } satisfies ActionsContract.Bindings
})

function samePath(kind: Actions.ProviderKind, left: string, right: string) {
  return kind === "github" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function matchRemote(text: string, provider: Actions.Provider, projectPath: string) {
  if (/[\x00-\x20\x7f]/.test(text)) throw invalid()
  const scp = /^(?:git@)?([A-Za-z0-9.-]+):([^/].*)$/.exec(text)
  const remote = scp ? { protocol: "ssh:", hostname: scp[1].toLowerCase(), host: scp[1].toLowerCase(), path: scp[2] }
    : Option.getOrUndefined(parseURL(text).pipe(Option.map((url) => {
      if (url.password || (url.protocol === "https:" ? url.username : url.username && url.username !== "git") ||
        !["https:", "ssh:"].includes(url.protocol) || url.search || url.hash) throw invalid()
      // URL parsing normalizes dot segments; reject them before that normalization can hide a different repository.
      if (/\/(?:\.|\.\.)(?:\/|$)|%|\\/.test(text)) throw invalid()
      return { protocol: url.protocol, hostname: url.hostname, host: url.host, path: url.pathname.slice(1) }
    })))
  if (!remote) throw invalid()
  const alias = remote.protocol === "ssh:" ? SSH_HOSTS[remote.hostname] : undefined
  const expected = new URL(`https://${provider.hostname}`)
  if ((remote.protocol === "https:" ? remote.host !== expected.host : (alias ?? remote.hostname) !== expected.hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the explicit Actions host." })
  const actual = ActionsState.projectPath(provider.kind, remote.path.replace(/\.git$/, ""))
  if (!samePath(provider.kind, actual, projectPath))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the Actions project path." })
}
~~~~


### `packages/core/src/actions/state.ts`

Archive: `sources/packages/core/src/actions/state.ts` · bytes: 8827 · Git blob: `c24ab01417fdea32688d26007e04d8fdac1d43ca` · SHA256: `a47ce41b196dd2c95e9724824d554472f93466be0220a02f1b019e855c3b9faf`.

Papel da fonte: JSON estrito fora do checkout, falha de integridade, permissões e mutex local.


Linhas **18–73**; SHA256 do intervalo `e048861693471b9bd5e71baf834dd6b92a4db5c26030149c6bc1078a1f4432a1`:

~~~~typescript
  records: Schema.Array(Schema.Struct({ binding: Actions.Binding, policy: Actions.Policy })),
})
export type Document = typeof Document.Type
const url = Option.liftThrowable((text: string) => new URL(text))
const utf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))

export const canonical = Effect.fn("ActionsState.canonical")(function* (directory: string) {
  if (!directory || directory.includes("\0"))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions directory." })
  return yield* Effect.tryPromise({
    try: () => PhysicalPath.physicalPath(path.resolve(FSUtil.windowsPath(directory))),
    catch: () => new ActionsError({ kind: "invalid_input", message: "Actions directory is unavailable." }),
  })
})

export function locationKey(directory: string, workspaceID?: string) {
  return createHash("sha256").update(JSON.stringify([directory, workspaceID ?? null])).digest("hex")
}

export const make = Effect.fn("ActionsState.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  repository: string
}) {
  const fs = yield* FSUtil.Service
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(input.projectID) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(input.projectID) ||
    (input.workspaceID !== undefined && (!input.workspaceID || /[\x00-\x1f\x7f]/.test(input.workspaceID))))
    return yield* new ActionsError({ kind: "invalid_input", message: "Invalid Actions project or workspace identity." })
  const root = yield* canonical(input.stateDirectory)
  const repository = yield* canonical(input.repository)
  if (FSUtil.contains(repository, root))
    return yield* new ActionsError({ kind: "invalid_input", message: "Actions state must be outside the repository." })
  const target = path.join(root, "actions", input.projectID, locationKey(input.directory, input.workspaceID), "bindings.json")
  const failed = () => new ActionsError({ kind: "maintenance_required", message: "Actions binding state is unavailable or corrupt." })
  const physical = Effect.fnUntraced(function* () {
    if ((yield* canonical(target).pipe(Effect.mapError(failed))) !== target)
      return yield* failed()
  })
  function parents(directory: string): Effect.Effect<void, ActionsError> {
    return Effect.gen(function* () {
      const info = yield* fs.stat(directory).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)), Effect.mapError(failed),
      )
      if (info) {
        if (info.type !== "Directory") return yield* failed()
        return
      }
      if (path.dirname(directory) === directory) return yield* failed()
      yield* parents(path.dirname(directory))
    })
  }
  const decode = Effect.fnUntraced(function* (text: string) {
    const document = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Document), STRICT)(text).pipe(Effect.mapError(failed))
~~~~


Linhas **77–166**; SHA256 do intervalo `a8c9f5123985104b0bf075100c00e7c1ed04985c85079f9f87461889e37337dc`:

~~~~typescript
      return yield* failed()
    yield* Effect.try({
      try: () => document.records.forEach((record) => {
        const binding = record.binding
        if (binding.directory !== input.directory || binding.workspaceID !== input.workspaceID ||
          !validRemote(binding.remote) || !binding.projectID.trim() || /[\x00-\x20\x7f]/.test(binding.projectID) ||
          !binding.account || /[\x00-\x20\x7f]/.test(binding.account) ||
          projectPath(binding.provider.kind, binding.projectPath) !== binding.projectPath ||
          JSON.stringify(provider(binding.provider)) !== JSON.stringify(binding.provider)) throw failed()
      }),
      catch: failed,
    })
    return document
  })
  const read = Effect.fnUntraced(function* () {
    yield* physical()
    // ENOTDIR can look like NotFound on a platform; a blocked parent is corruption, not an empty store.
    yield* parents(path.dirname(target))
    const info = yield* fs.stat(target).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(failed),
    )
    if (!info) return { version: 1, records: [] } satisfies Document
    if (info.type !== "File" || info.size > MAX_BYTES) return yield* failed()
    const bytes = yield* fs.readFile(target).pipe(Effect.mapError(failed))
    const text = utf8(bytes)
    if (bytes.length > MAX_BYTES || Option.isNone(text)) return yield* failed()
    return yield* decode(text.value)
  })
  const write = Effect.fnUntraced(function* (document: Document) {
    const text = JSON.stringify(document)
    if (Buffer.byteLength(text) > MAX_BYTES) return yield* failed()
    yield* decode(text)
    yield* physical()
    yield* fs.makeDirectory(path.dirname(target), { recursive: true, mode: 0o700 }).pipe(Effect.mapError(failed))
    yield* physical()
    const temp = path.join(path.dirname(target), `.bindings.${randomUUID()}.tmp`)
    yield* fs.writePhysical(temp, text, { exclusive: true }).pipe(
      Effect.andThen(fs.chmod(temp, 0o600)),
      Effect.andThen(physical()),
      Effect.andThen(fs.rename(temp, target)),
      Effect.mapError(failed),
      Effect.ensuring(Effect.try({ try: () => rmSync(temp, { force: true }), catch: failed }).pipe(Effect.ignore)),
      Effect.uninterruptible,
    )
  })
  return {
    read: () => locks.withLock(target)(read()),
    change: <A>(edit: (document: Document) => Effect.Effect<{ document: Document; value: A }, ActionsError>) =>
      locks.withLock(target)(Effect.gen(function* () {
        const next = yield* edit(yield* read())
        yield* write(next.document)
        return next.value
      })),
  }
})

export function validRemote(remote: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote) && remote.split("/").every((part) => part && part !== "." && part !== "..")
}

export function projectPath(kind: Actions.ProviderKind, text: string) {
  const parts = text.split("/")
  if ((kind === "github" ? parts.length !== 2 : parts.length < 2) ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === ".." || part.endsWith(".git")))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid provider project path." })
  return text
}

export function provider(input: Actions.Provider): Actions.Provider {
  const host = Option.getOrUndefined(url(`https://${input.hostname}`))
  const api = Option.getOrUndefined(url(input.apiOrigin))
  if (!host || !api || !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(input.hostname) ||
    host.username || host.password || host.pathname !== "/" || host.search || host.hash ||
    host.hostname.endsWith(".") || host.hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-")) ||
    api.protocol !== "https:" || api.username || api.password || api.pathname !== "/" || api.search || api.hash ||
    /[\x00-\x20\x7f]/.test(input.apiOrigin))
    throw new ActionsError({ kind: "invalid_input", message: "Invalid Actions provider host or API origin." })
  const hostname = host.host
  if (["ssh.github.com", "altssh.gitlab.com", "api.github.com"].includes(host.hostname) ||
    (host.hostname === "github.com" && (input.kind !== "github" || api.origin !== "https://api.github.com" || host.port)) ||
    (host.hostname === "gitlab.com" && (input.kind !== "gitlab" || api.origin !== "https://gitlab.com" || host.port)) ||
    (!["github.com", "gitlab.com"].includes(host.hostname) && api.host !== hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Actions provider host and API origin do not match." })
  return { kind: input.kind, hostname, apiOrigin: api.origin, ...(input.version === undefined ? {} : { version: input.version }) }
}

export function identityKey(binding: Pick<Actions.Binding, "provider" | "projectID">) {
  return JSON.stringify([binding.provider.kind, binding.provider.hostname, binding.provider.apiOrigin, binding.projectID])
}
~~~~


## A03 — Identidade de cursor e capacidades qualificadas

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A03`.


### `packages/core/src/actions/cursor.ts`

Archive: `sources/packages/core/src/actions/cursor.ts` · bytes: 3689 · Git blob: `3c61a40570a65ef162d6ab908f70b09b1a22aa93` · SHA256: `42629421f0bb3f1c6c48c37c256899929890a718f6072228669d58340ad56373`.

Papel da fonte: Cursor liga binding/revisão/provider/escopo/filtros e paginação limitada.


Linhas **9–82**; SHA256 do intervalo `48125035df35e87917cd9a38e6cdf7ba6cee13c500afb264947f8c9d5e8c7902`:

~~~~typescript
const Cursor = Schema.Struct({
  binding: Actions.BindingID,
  revision: Schema.Int,
  provider: Actions.ProviderKind,
  host: Schema.String,
  project: Schema.String,
  scope: Schema.String,
  filters: Schema.String,
  page: PositivePage,
})
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Cursor))

export function page(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, cursor?: string) {
  if (cursor === undefined) return 1
  const value = cursor.length <= 2048 ? decode(Buffer.from(cursor, "base64url").toString("utf8")) : Option.none()
  if (Option.isNone(value) || value.value.binding !== binding.id || value.value.revision !== binding.revision ||
    value.value.provider !== binding.provider.kind || value.value.host !== binding.provider.hostname ||
    value.value.project !== binding.projectID || value.value.scope !== scope || value.value.filters !== fingerprint(filters))
    throw new ActionsError({ kind: "invalid_input", message: "Actions cursor does not belong to this binding and selection", disposition: "definitely_unsent" })
  return value.value.page
}

export function encode(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, page: number) {
  return Buffer.from(JSON.stringify(Cursor.make({
    binding: binding.id, revision: binding.revision, provider: binding.provider.kind,
    host: binding.provider.hostname, project: binding.projectID, scope, filters: fingerprint(filters), page,
  }))).toString("base64url")
}

export function next(headers: Readonly<Record<string, string>>) {
  const explicit = headers["x-next-page"]
  if (explicit !== undefined) {
    if (explicit === "") return
    const page = positive(explicit)
    if (page === undefined) throw paginationError()
    return page
  }
  const link = headers.link?.split(",").find((part) => /;\s*rel="?next"?(?:\s*;|\s*$)/.test(part))
  const address = link && /^\s*<([^>]+)>/.exec(link)?.[1]
  const parsed = address ? URL.parse(address, "https://pagination.invalid") : undefined
  if (!link) return
  const page = parsed && positive(parsed.searchParams.get("page") ?? "")
  if (page === undefined || page === null) throw paginationError()
  return page
}

export function total(headers: Readonly<Record<string, string>>) {
  const raw = headers["x-total"]
  if (raw === undefined) return
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw paginationError()
  return Number(raw)
}

export function limit(input?: number) {
  if (input === undefined) return 50
  if (!Number.isSafeInteger(input) || input < 1 || input > 100)
    throw new ActionsError({ kind: "invalid_input", message: "Actions page size must be between 1 and 100", disposition: "definitely_unsent" })
  return input
}

function positive(text: string) {
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > 100_000) return
  return Number(text)
}

function fingerprint(filters: Readonly<Record<string, unknown>>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(filters)
    .filter(([key, value]) => key !== "cursor" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)))).digest("hex")
}

function paginationError() {
  return new ActionsError({ kind: "transport_failed", message: "Provider returned invalid Actions pagination metadata" })
}
~~~~


### `packages/core/src/actions/github/catalog.ts`

Archive: `sources/packages/core/src/actions/github/catalog.ts` · bytes: 7466 · Git blob: `6fba4351d5bb942754a6609c3ddb82c55ae3dc36` · SHA256: `d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04`.

Papel da fonte: Capacidades dependem de leitura concreta, sem promover write desconhecido.


Linhas **75–89**; SHA256 do intervalo `455f1fe743977b23f97bc5fb37b143999bd61dae43140649011a45915e44cf92`:

~~~~typescript
export const capabilities = Effect.fn("ActionsGitHubRead.capabilities")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  const repo = yield* GitHubNative.repository(transport, binding)
  // Prove this Actions endpoint, not only repository visibility or a repo role.
  yield* workflows(transport, binding, { limit: 1 })
  const observedAt = Date.now()
  const scopes = repo.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  const evidence = [scopes === undefined ? undefined : `Observed classic OAuth scopes: ${scopes.join(", ") || "none"}`,
    repo.native.permissions === undefined ? undefined : `Observed repository permissions: ${Object.entries(repo.native.permissions).map(([key, value]) => `${key}=${value}`).join(", ")}`]
    .filter((value) => value !== undefined).join("; ")
  return [Actions.Capability.make({ operation: "workflows.list", state: "available", scope: `repository:${binding.projectID}`,
    reason: "Native workflows GET succeeded", observedAt }),
    ...["source.read", "runs.list", "runs.read", "jobs.list", "workflow.dispatch", "workflow.enable", "workflow.disable", "source.write", "run.retry", "run.cancel", "run.delete"].map((operation) =>
      Actions.Capability.make({ operation, state: "unknown", scope: `repository:${binding.projectID}`,
        reason: `Endpoint or target eligibility has not been proved${evidence ? `; ${evidence}` : ""}`, observedAt }))]
})
~~~~


## A04 — Catálogo e fonte GitHub com identidade imutável

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A04`.


### `packages/core/src/actions/github/index.ts`

Archive: `sources/packages/core/src/actions/github/index.ts` · bytes: 855 · Git blob: `bca13413b5e00aeb317fdca0a8db0de21fa76562` · SHA256: `0f585e30bf78620b2878f7b2431af6186d0a401730325fe401f1ff9138329320`.

Papel da fonte: Composição concreta dos readers GitHub.


Linhas **1–17**; SHA256 do intervalo `0f585e30bf78620b2878f7b2431af6186d0a401730325fe401f1ff9138329320`:

~~~~typescript
export * as ActionsGitHubRead from "./index"

import { ActionsContract } from "../contract"
import { GitHubCatalog } from "./catalog"
import { GitHubRuns } from "./runs"
import { GitHubJobs } from "./jobs"

export function make(input: { transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return {
    capabilities: (binding) => GitHubCatalog.capabilities(input.transport, binding),
    workflows: (binding, selection) => GitHubCatalog.workflows(input.transport, binding, selection),
    source: (binding, selection) => GitHubCatalog.source(input.transport, binding, selection),
    runs: (binding, selection) => GitHubRuns.list(input.transport, binding, selection),
    run: (binding, id) => GitHubRuns.read(input.transport, binding, id),
    jobs: (binding, selection) => GitHubJobs.list(input.transport, binding, selection),
  }
}
~~~~


### `packages/core/src/actions/github/native.ts`

Archive: `sources/packages/core/src/actions/github/native.ts` · bytes: 7552 · Git blob: `9de483d99f461e35c200b1fdcc2a0ce3f6224dac` · SHA256: `8624a7b9db3ea727bd4142c0233b37259f0a92ba457c31c658a8ce52f096a712`.

Papel da fonte: IDs/SHAs nativos, lookup por repository ID e validação de paginação Link.


Linhas **12–40**; SHA256 do intervalo `96b92d8c6042bb827f839f2e70e45e3005e9da97f2c4886ee6add51c0e40c2f2`:

~~~~typescript
])
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i))
export const Time = Schema.String.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/))
export const Repository = Schema.Struct({
  id: ID, full_name: Schema.NonEmptyString,
  default_branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  permissions: Schema.optionalKey(Schema.Struct({
    pull: Schema.optionalKey(Schema.Boolean), push: Schema.optionalKey(Schema.Boolean),
    admin: Schema.optionalKey(Schema.Boolean), maintain: Schema.optionalKey(Schema.Boolean),
  })),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "github", disposition: "definitely_unsent" })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown, label: string): A {
  const value = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(value)) throw error(binding, "transport_failed", `GitHub returned invalid ${label} metadata`)
  return value.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value)) throw error(binding, "invalid_input", "GitHub target ID must be a canonical positive decimal")
  return value
}

~~~~


Linhas **60–69**; SHA256 do intervalo `5b0bcd1ab6121cf5f9fa4654d234b3c897f4ea08f71faea8746e0998e926d537`:

~~~~typescript
export const repository = Effect.fn("ActionsGitHubRead.repository")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* error(binding, "host_mismatch", "GitHub read adapter requires a GitHub binding")
  const target = yield* checked(binding, () => id(binding, binding.projectID))
  const response = yield* get(transport, binding, { method: "GET", path: `repositories/${target}` })
  return yield* checked(binding, () => {
    const native = decode(binding, Repository, response.data, "repository")
    if (String(native.id) !== binding.projectID) throw error(binding, "binding_stale", "GitHub repository ID does not match the binding")
    return { native, path: `repositories/${target}`, headers: response.headers }
  })
})
~~~~


Linhas **87–121**; SHA256 do intervalo `0c3ddfb39264cf30f0f6395107416e0810965ce98a2e30c70d826f21b0fcfb08`:

~~~~typescript
export function pagination(binding: Actions.Binding, response: ActionsContract.Response, request: ActionsContract.Request,
  selected: ReturnType<typeof selection>, count: number, nativeTotal?: number) {
  const headers = response.headers
  const next = ActionsCursor.next(headers)
  const headerTotal = ActionsCursor.total(headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "GitHub returned invalid or incomplete pagination metadata")
  if (nativeTotal !== undefined && headerTotal !== undefined && nativeTotal !== headerTotal) throw fail()
  if (count > selected.per_page || (next !== undefined && next !== selected.page + 1)) throw fail()
  if (headers.link !== undefined) {
    if (ActionsCursor.next({ link: headers.link }) !== next) throw fail()
    const origin = binding.provider.apiOrigin.replace(/\/$/, "")
    const expected = new URL(`${origin}/${request.path}`)
    headers.link.split(",").forEach((part) => {
      const match = /^\s*<([^>]+)>;\s*rel="?(next|prev|first|last)"?\s*$/.exec(part)
      const url = match && URL.parse(match[1])
      if (!match || !url || url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw fail()
      const page = url.searchParams.get("page")
      if (!page || !/^[1-9]\d*$/.test(page) || Number(page) > 100_000) throw fail()
      const query = Object.fromEntries(url.searchParams)
      if (Array.from(url.searchParams.keys()).length !== Object.keys(query).length) throw fail()
      const wanted = { ...request.query, page: Number(page) }
      if (Object.keys(query).length !== Object.keys(wanted).length ||
          Object.entries(wanted).some(([key, value]) => query[key] !== String(value))) throw fail()
    })
  }
  if (total !== undefined && ((count > 0 && total < (selected.page - 1) * selected.per_page + count) ||
      (next === undefined && total > selected.page * selected.per_page) || (next !== undefined && total <= selected.page * selected.per_page))) throw fail()
  if (next !== undefined && count === 0) throw fail()
  if (next === undefined && total === undefined && count === selected.per_page && headers.link === undefined && headers["x-next-page"] === undefined) throw fail()
  return {
    ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }),
    ...(total === undefined ? {} : { total }), capturedAt: Date.now(),
  }
}
~~~~


### `packages/core/src/actions/github/catalog.ts`

Archive: `sources/packages/core/src/actions/github/catalog.ts` · bytes: 7466 · Git blob: `6fba4351d5bb942754a6609c3ddb82c55ae3dc36` · SHA256: `d6dfdfe937306ddec89ca7c43589d3c812f445797f5365c839af6ba303da2c04`.

Papel da fonte: Workflow nativo e fonte com commit, path, bytes, UTF-8 e Git blob verificados.


Linhas **18–72**; SHA256 do intervalo `968bd91204d393a7487e4e697facb0b8e4f0f8db4e3dc4c954f3433c2949b8cb`:

~~~~typescript
export const workflows = Effect.fn("ActionsGitHubRead.workflows")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.ListInput) {
  const selected = yield* GitHubNative.checked(binding, () => {
    if (input.query !== undefined || input.state !== undefined)
      throw GitHubNative.error(binding, "invalid_input", "GitHub workflow listing does not support server-side query or state filters")
    return GitHubNative.selection(binding, "github.workflows", {}, input.cursor, input.limit)
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: `${repo.path}/actions/workflows`, query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Workflows, response.data, "workflow list")
    return { items: data.workflows.map((item): Actions.Workflow => ({
      id: String(item.id), bindingID: binding.id, name: item.name, path: item.path, state: item.state,
      ...(repo.native.default_branch ? { defaultRef: repo.native.default_branch } : {}),
      dispatchable: false, dispatchState: "unknown", ...(item.updated_at === undefined ? {} : { updatedAt: item.updated_at }),
    })), ...GitHubNative.pagination(binding, response, request, selected, data.workflows.length, data.total_count) }
  })
})

// Resolve mutable ref once; contents always uses the resulting immutable commit.
// https://docs.github.com/en/rest/commits/commits#get-a-commit
// https://docs.github.com/en/rest/repos/contents#get-repository-content
export const source = Effect.fn("ActionsGitHubRead.source")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { path: string; ref: string }) {
  const target = yield* GitHubNative.checked(binding, () => ({ path: GitHubNative.path(binding, input.path), ref: GitHubNative.ref(binding, input.ref) }))
  const repo = yield* GitHubNative.repository(transport, binding)
  const commitResponse = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/commits/${encodeURIComponent(target.ref)}` })
  const commit = yield* GitHubNative.checked(binding, () => {
    const native = GitHubNative.decode(binding, Commit, commitResponse.data, "commit")
    if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(target.ref) && target.ref.toLowerCase() !== native.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_conflict", "GitHub resolved commit does not match the requested immutable ref")
    return native
  })
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/contents/${target.path}`, query: { ref: commit.sha } })
  const content = yield* GitHubNative.checked(binding, () => {
    const content = GitHubNative.decode(binding, Content, response.data, "source content")
    if (content.path !== input.path) throw GitHubNative.error(binding, "source_unresolved", "GitHub source path does not match the requested file")
    if (content.type !== "file" || content.target !== undefined || content.submodule_git_url !== undefined || content.encoding !== "base64" || content.content === undefined)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub did not return authoritative full file content")
    if (content.size > 1024 * 1024 || content.content.length > 1500 * 1024)
      throw GitHubNative.error(binding, "metadata_truncated", "GitHub source exceeds the bounded content limit")
    const encoded = content.content.replace(/[\r\n]/g, "")
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source is not canonical Base64")
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.toString("base64") !== encoded || bytes.length !== content.size)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source content is incomplete")
    // GitHub supports both repository object algorithms; preserve either full ID.
    // https://docs.github.com/en/rest/repos/repos#get-the-hash-algorithm-for-a-repository
    if (createHash(content.sha.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== content.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source bytes do not match the authoritative blob ID")
    return { native: content, bytes }
  })
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content.bytes),
    catch: () => GitHubNative.error(binding, "source_unresolved", "GitHub source is not valid UTF-8") })
  return { bindingID: binding.id, path: content.native.path, ref: input.ref, commit: commit.sha, version: content.native.sha, text, editable: false }
~~~~


## A05 — Runs e jobs GitHub preservam tentativa

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A05`.


### `packages/core/src/actions/github/runs.ts`

Archive: `sources/packages/core/src/actions/github/runs.ts` · bytes: 9329 · Git blob: `ab56898ee021b474d882ecb6ef84282fe618ed30` · SHA256: `03a7cb4acf1a709fb8c289cede6f44045b70735107117d890e6c61f3fc1594c4`.

Papel da fonte: Filtros representáveis e projeção sem inventar finishedAt.


Linhas **20–83**; SHA256 do intervalo `4a6b8cc6d089490d0254c3199c8a59214ba98917e81d3306087d324de93da3d6`:

~~~~typescript
export const list = Effect.fn("ActionsGitHubRead.runs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.RunListInput) {
  const query = yield* GitHubNative.checked(binding, () => {
    if (input.workflowID !== undefined) GitHubNative.id(binding, input.workflowID)
    if (input.ref !== undefined) GitHubNative.ref(binding, input.ref)
    if (input.commit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.commit)) throw GitHubNative.error(binding, "invalid_input", "GitHub run commit filter requires a full SHA")
    if (input.event !== undefined && !/^[a-z][a-z0-9_]{0,127}$/.test(input.event)) throw GitHubNative.error(binding, "invalid_input", "GitHub event filter is invalid")
    if (input.actor !== undefined && !/^[A-Za-z0-9-]+(?:\[bot\])?$/.test(input.actor)) throw GitHubNative.error(binding, "invalid_input", "GitHub actor filter is invalid")
    if (input.status !== undefined && !statuses.has(input.status)) throw GitHubNative.error(binding, "invalid_input", "GitHub run status filter is invalid")
    return Object.fromEntries(Object.entries({ branch: input.ref, event: input.event, status: input.status,
      head_sha: input.commit, actor: input.actor, created: created(binding, input) }).filter((entry): entry is [string, string] => entry[1] !== undefined))
  })
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.runs", { ...query, workflowID: input.workflowID }, input.cursor, input.limit))
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: input.workflowID === undefined ? `${repo.path}/actions/runs` : `${repo.path}/actions/workflows/${input.workflowID}/runs`,
    query: { ...query, page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Runs, response.data, "run list")
    return { items: data.workflow_runs.map((item) => {
      if (input.workflowID !== undefined && String(item.workflow_id) !== input.workflowID)
        throw GitHubNative.error(binding, "transport_failed", "GitHub returned a run from another workflow")
      return project(binding, item)
    }), ...GitHubNative.pagination(binding, response, request, selected, data.workflow_runs.length, data.total_count) }
  })
})

// https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
export const read = Effect.fn("ActionsGitHubRead.run")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, target: string) {
  yield* GitHubNative.checked(binding, () => GitHubNative.id(binding, target))
  const repo = yield* GitHubNative.repository(transport, binding)
  return yield* at(transport, binding, repo.path, target)
})

export const at = Effect.fn("ActionsGitHubRead.runAt")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, repo: string, target: string) {
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo}/actions/runs/${target}` })
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Run, response.data, "run")
    if (String(data.id) !== target) throw GitHubNative.error(binding, "transport_failed", "GitHub returned another run ID")
    return project(binding, data)
  })
})

function project(binding: Actions.Binding, data: typeof Run.Type): Actions.Run {
  if (String(data.repository.id) !== binding.projectID)
    throw GitHubNative.error(binding, "binding_stale", "GitHub run repository ID does not match the binding")
  // Native updated_at is not an authoritative completion time, so it never becomes finishedAt; once a run is
  // completed it is the last native stamp, which is what the GitHub UI and CLI use for run duration.
  const duration = data.status === "completed" && data.updated_at !== undefined && data.run_started_at !== undefined
    ? Math.round((Date.parse(data.updated_at) - Date.parse(data.run_started_at)) / 1000) : undefined
  return { id: String(data.id), bindingID: binding.id, workflowID: String(data.workflow_id), name: data.name,
    ref: data.head_branch, commit: data.head_sha, event: data.event, status: data.status,
    repositoryID: String(data.repository.id), createdAt: data.created_at, url: data.html_url,
    ...(data.actor == null ? {} : { actor: data.actor.login }),
    ...(data.triggering_actor == null ? {} : { triggeringActor: data.triggering_actor.login }),
    ...(data.updated_at === undefined ? {} : { updatedAt: data.updated_at }),
    ...(data.conclusion === undefined ? {} : { conclusion: data.conclusion }),
    ...(data.run_attempt === undefined ? {} : { attempt: data.run_attempt }),
    ...(data.display_title === undefined ? {} : { title: data.display_title }),
    ...(data.run_number === undefined ? {} : { number: data.run_number }),
    ...(duration === undefined || !Number.isFinite(duration) || duration < 0 ? {} : { duration }),
    ...(data.run_started_at === undefined ? {} : { startedAt: data.run_started_at }) }
}

// GitHub created uses inclusive native range/comparison syntax, not updated filters.
~~~~


Linhas **85–120**; SHA256 do intervalo `344a1630c56ea36a2666cf142ed43739d99c3cea77c9d34dda402238610690fb`:

~~~~typescript
function created(binding: Actions.Binding, input: Actions.RunListInput) {
  if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
    throw GitHubNative.error(binding, "capability_unavailable", "GitHub workflow runs do not support native updated-time filters")
  if (input.created !== undefined && (input.createdAfter !== undefined || input.createdBefore !== undefined))
    throw GitHubNative.error(binding, "invalid_input", "GitHub created cannot be combined with explicit created-time bounds")
  if (input.created !== undefined) {
    const range = input.created.split("..")
    if (range.length === 1) {
      date(binding, input.created.replace(/^[<>]=?/, ""))
      return input.created
    }
    if (range.length !== 2 || range.every((bound) => bound === "*"))
      throw GitHubNative.error(binding, "invalid_input", "GitHub created filter requires a native date comparison or range")
    const after = range[0] === "*" ? undefined : date(binding, range[0])
    const before = range[1] === "*" ? undefined : date(binding, range[1])
    if (after !== undefined && before !== undefined && after > before)
      throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
    return input.created
  }
  const after = input.createdAfter === undefined ? undefined : date(binding, input.createdAfter)
  const before = input.createdBefore === undefined ? undefined : date(binding, input.createdBefore)
  if (after !== undefined && before !== undefined && after > before)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
  if (input.createdAfter !== undefined && input.createdBefore !== undefined) return `${input.createdAfter}..${input.createdBefore}`
  if (input.createdAfter !== undefined) return `>=${input.createdAfter}`
  if (input.createdBefore !== undefined) return `<=${input.createdBefore}`
}

function date(binding: Actions.Binding, value: string) {
  const instant = Date.parse(value)
  const local = value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19)
  if (!/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d))?$/.test(value) || !Number.isFinite(instant) ||
      new Date(`${local}Z`).toISOString().slice(0, 19) !== local)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time bound requires a valid ISO date or second-resolution timestamp with timezone")
  return instant
}
~~~~


### `packages/core/src/actions/github/jobs.ts`

Archive: `sources/packages/core/src/actions/github/jobs.ts` · bytes: 4682 · Git blob: `dbd8e1e17265f8439ba932be4b88d002b6984d79` · SHA256: `7bc8c9a73de49cc8acefbff94fdf03d72ca3a595e3d0451012db6b54a23ffc86`.

Papel da fonte: Fixa e confere run_attempt ao listar/ler jobs.


Linhas **15–61**; SHA256 do intervalo `03936b34e5607c6971306954f460531152b978d548e25a285ce0c1399c19d9d2`:

~~~~typescript
  runner_name: Schema.optionalKey(Schema.NullOr(Schema.String)), runner_id: Schema.optionalKey(RunnerID),
  labels: Schema.optionalKey(Schema.Array(Schema.String)), runner_group_id: Schema.optionalKey(RunnerID),
  started_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)), completed_at: Schema.optionalKey(Schema.NullOr(GitHubNative.Time)),
  steps: Schema.Array(Step) })
const Jobs = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), jobs: Schema.Array(Job) })

// https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
export const list = Effect.fn("ActionsGitHubRead.jobs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { runID: string; attempt?: number; cursor?: string }) {
  yield* GitHubNative.checked(binding, () => {
    GitHubNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw GitHubNative.error(binding, "invalid_input", "GitHub run attempt must be a positive safe integer")
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const run = yield* GitHubRuns.at(transport, binding, repo.path, input.runID)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined)
    return yield* GitHubNative.error(binding, "capability_unavailable", "GitHub did not prove the current run attempt; select an explicit attempt")
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.jobs",
    { runID: input.runID, attempt }, input.cursor))
  // Current selection is resolved once, then pinned before a rerun can advance it.
  const request = { method: "GET", path: `${repo.path}/actions/runs/${input.runID}/attempts/${attempt}/jobs`,
    query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Jobs, response.data, "job list")
    return { items: data.jobs.map((job): Actions.Job => {
      if (String(job.run_id) !== input.runID || (job.run_attempt !== undefined && job.run_attempt !== attempt))
        throw GitHubNative.error(binding, "transport_failed", "GitHub job run or attempt does not match the selection")
      return { id: String(job.id), bindingID: binding.id, runID: String(job.run_id), name: job.name,
        status: job.status, kind: "job",
        ...(job.conclusion === undefined ? {} : { conclusion: job.conclusion }),
        ...(job.runner_name == null ? {} : { runner: job.runner_name }),
        ...(job.runner_id == null ? {} : { runnerID: String(job.runner_id) }),
        ...(job.runner_group_id == null ? {} : { runnerGroupID: String(job.runner_group_id) }),
        ...(job.labels === undefined ? {} : { runnerLabels: job.labels }),
        // The pinned endpoint proves identity even on payloads omitting run_attempt.
        attempt,
        ...(job.started_at == null ? {} : { startedAt: job.started_at }),
        ...(job.completed_at == null ? {} : { finishedAt: job.completed_at }),
        steps: job.steps.map((step) => ({ number: step.number, name: step.name, status: step.status,
          ...(step.conclusion === undefined ? {} : { conclusion: step.conclusion }),
          ...(step.started_at == null ? {} : { startedAt: step.started_at }),
          ...(step.completed_at == null ? {} : { finishedAt: step.completed_at }) })) }
    }), ...GitHubNative.pagination(binding, response, request, selected, data.jobs.length, data.total_count) }
  })
})
~~~~


## A06 — GitLab: um slot de CI e fonte local qualificada

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A06`.


### `packages/core/src/actions/gitlab/index.ts`

Archive: `sources/packages/core/src/actions/gitlab/index.ts` · bytes: 494 · Git blob: `b73b4d7a730c58874e09b7df4f35be2ee13853b8` · SHA256: `7a6c70d16d96826f03d861001aa079307acc8d8fcc7d5d660b537d4d9d927b4b`.

Papel da fonte: Composição concreta dos readers GitLab.


Linhas **1–11**; SHA256 do intervalo `7a6c70d16d96826f03d861001aa079307acc8d8fcc7d5d660b537d4d9d927b4b`:

~~~~typescript
export * as ActionsGitLabRead from "./index"

import { ActionsContract } from "../contract"
import { ActionsGitLabCatalog } from "./catalog"
import { ActionsGitLabRuns } from "./runs"
import { ActionsGitLabJobs } from "./jobs"

export function make(input: { readonly transport: ActionsContract.Transport }): ActionsContract.ReadAdapter {
  return { ...ActionsGitLabCatalog.make(input.transport), ...ActionsGitLabRuns.make(input.transport),
    jobs: ActionsGitLabJobs.make(input.transport) }
}
~~~~


### `packages/core/src/actions/gitlab/native.ts`

Archive: `sources/packages/core/src/actions/gitlab/native.ts` · bytes: 10614 · Git blob: `d6cf026dcbfb9023285415a9dd16842951e39ac0` · SHA256: `4f61c33643ab30ba295e4e84619c1a3ec4d1dd029d6ce32407029553691eadcc`.

Papel da fonte: Schema de identidades, slot de pipeline, path e versão de servidor observada.


Linhas **10–42**; SHA256 do intervalo `2c549dd00f699310e26bb3f500eaeb8f2747bed5acdd1d4d308973da18a5083d`:

~~~~typescript
// https://docs.gitlab.com/api/pipelines/ and https://docs.gitlab.com/api/jobs/
// https://docs.gitlab.com/api/repository_files/
export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i))
const nullableText = Schema.optional(Schema.NullOr(Schema.String))
const access = Schema.NullOr(Schema.Struct({ access_level: Schema.Int }))
export const Project = Schema.Struct({
  id: ID, path_with_namespace: Schema.NonEmptyString, name: Schema.NullOr(Schema.String),
  ci_config_path: nullableText, default_branch: nullableText,
  jobs_enabled: Schema.optional(Schema.Boolean), builds_access_level: Schema.optional(Schema.String),
  repository_access_level: Schema.optional(Schema.String), archived: Schema.optional(Schema.Boolean),
  permissions: Schema.optional(Schema.Struct({ project_access: Schema.optional(access), group_access: Schema.optional(access) })),
})
export const Pipeline = Schema.Struct({
  id: ID, iid: Schema.optional(ID), project_id: ID, sha: SHA, ref: Schema.NullOr(Schema.String), source: Schema.NonEmptyString, status: Schema.NullOr(Schema.NonEmptyString),
  name: nullableText, web_url: nullableText, created_at: nullableText, updated_at: nullableText,
  started_at: nullableText, finished_at: nullableText,
  duration: Schema.optional(Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)))),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, username: Schema.NonEmptyString }))),
})
export const Job = Schema.Struct({
  id: ID, name: Schema.String, status: Schema.NullOr(Schema.NonEmptyString), stage: Schema.String, allow_failure: Schema.Boolean,
  pipeline: Schema.Struct({ id: ID, project_id: ID }),
  started_at: nullableText, finished_at: nullableText, retried: Schema.optional(Schema.Boolean),
  runner: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, description: nullableText }))),
})
export const Bridge = Schema.Struct({
  ...Job.fields,
  downstream_pipeline: Schema.NullOr(Schema.Struct({ id: ID, project_id: Schema.optional(ID) })),
})
~~~~


Linhas **72–122**; SHA256 do intervalo `1f409584989edba070ffab23c87d24803cf1d5e5f1d7ac1890e2138e00e6f17a`:

~~~~typescript
    return yield* checked(binding, () => {
      const value = decode(binding, Pipeline, response.data, "pipeline")
      requirePipeline(binding, value, id)
      return value
    })
  })
  const metadata = Effect.fn("ActionsGitLabRead.metadata")(function* (binding: Actions.Binding) {
    const target = yield* checked(binding, () => {
      const host = URL.parse(`https://${binding.provider.hostname}`)
      const origin = URL.parse(binding.provider.apiOrigin)
      if (!host || !origin || host.host !== binding.provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        origin.protocol !== "https:" || origin.host !== host.host || origin.username || origin.password || origin.search || origin.hash ||
        (binding.provider.apiOrigin !== host.origin && binding.provider.apiOrigin !== `${host.origin}/api/v4`))
        throw error(binding, "host_mismatch", "GitLab metadata requires the exact canonical bound HTTPS host and API origin")
      return { hostname: binding.provider.hostname, apiOrigin: binding.provider.apiOrigin }
    })
    // Authenticated W1 transport supplies this observation, never client Provider.version.
    // https://docs.gitlab.com/api/metadata/
    const response = yield* get(binding, "metadata")
    return yield* checked(binding, () => {
      const value = decode(binding, Metadata, response.data, "instance metadata")
      if (!value.version) throw error(binding, "capability_unavailable", "GitLab metadata did not establish a native instance version")
      return VersionObservation.make({ ...target, version: value.version, observedAt: Date.now() })
    })
  })
  return { get, project, pipeline, metadata }
}

export function requireVersion(binding: Actions.Binding, observation: typeof VersionObservation.Type, minimum: readonly number[], feature: string) {
  if (observation.hostname !== binding.provider.hostname || observation.apiOrigin !== binding.provider.apiOrigin)
    throw error(binding, "host_mismatch", "GitLab version observation belongs to a different bound host or API origin")
  const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(observation.version)
  if (!version || !version.slice(1).every((part) => Number.isSafeInteger(Number(part))) ||
    Number(version[1]) < minimum[0] || (Number(version[1]) === minimum[0] && Number(version[2]) < minimum[1]))
    throw error(binding, "capability_unavailable", `GitLab ${feature} requires native metadata proving GitLab ${minimum.join(".")} or newer`)
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "GitLab read metadata could not be interpreted safely") })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, label: string): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, "transport_failed", `GitLab returned invalid native ${label} metadata`)
  return result.value
}

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab",
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
~~~~


Linhas **143–170**; SHA256 do intervalo `6cb90e4f134319c475c8fda45e018a31827ead88c5c7078fd77dca8b46934353`:

~~~~typescript
export function localPath(path: string) {
  return !!path && !/[:@\x00-\x1f\x7f\\]/.test(path) && !path.startsWith("/") &&
    !path.split("/").some((part) => !part || part === "." || part === "..") && !/[?*{}$]/.test(path)
}

export function requirePipeline(binding: Actions.Binding, pipeline: typeof Pipeline.Type, id?: string) {
  if (String(pipeline.project_id) !== binding.projectID || (id !== undefined && String(pipeline.id) !== id))
    throw error(binding, "binding_stale", "GitLab pipeline does not belong to the requested native project and pipeline")
}

export function conclusion(status: string | null) {
  return status !== null && ["success", "failed", "canceled", "skipped"].includes(status) ? status : undefined
}

export function selection(binding: Actions.Binding, input: object, fields: readonly string[], schema: Schema.Top) {
  if (typeof input !== "object" || input === null || Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)))
    throw error(binding, "invalid_input", "GitLab read selection does not match the Actions input schema")
  const unsupported = Object.keys(input).find((key) => !fields.includes(key))
  if (unsupported) throw error(binding, "invalid_input", `GitLab read filter '${unsupported}' is not represented by this Actions contract`)
}

export function pagination(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, headers: Readonly<Record<string, string>>, page: number) {
  const next = ActionsCursor.next(headers)
  if (next !== undefined && next <= page) throw error(binding, "transport_failed", "GitLab pagination did not advance")
  const total = ActionsCursor.total(headers)
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, scope, filters, next) }),
    ...(total === undefined ? {} : { total }) }
}
~~~~


### `packages/core/src/actions/gitlab/catalog.ts`

Archive: `sources/packages/core/src/actions/gitlab/catalog.ts` · bytes: 7296 · Git blob: `a7a087856e35e01764382211abebfddfa00c133d` · SHA256: `546e21ae307d414ec385b7de7963b1756535a22beb66ff277c007111fe0b6478`.

Papel da fonte: Config path nativo sem fallback indevido; hash e versão composta da fonte.


Linhas **13–87**; SHA256 do intervalo `d2610719440ed99b06f5cd7b5a2854d28e4d2e7c5117083ad14fbae588c0c018`:

~~~~typescript
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["cursor", "limit", "query", "state"], Actions.ListInput)
      const page = ActionsCursor.page(binding, "gitlab.workflows", { ...input, limit: ActionsCursor.limit(input.limit) }, input.cursor)
      if (page !== 1) throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab project pipeline catalog has only one entry")
    })
    const project = yield* native.project(binding)
    const workflow = toWorkflow(binding, project)
    const items = (!input.query || workflow.name?.includes(input.query) || workflow.path.includes(input.query)) &&
      (input.state === undefined || workflow.state === input.state) ? [workflow] : []
    return { items, total: items.length, capturedAt: Date.now() }
  })
  const source = Effect.fn("ActionsGitLabRead.source")(function* (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["path", "ref"], Schema.Struct({ path: Schema.NonEmptyString, ref: Schema.NonEmptyString }))
      if (!ActionsGitLabNative.localPath(input.path)) throw ActionsGitLabNative.error(binding, "source_unresolved",
        "GitLab external, project-qualified or dynamic CI source requires separate resolution; no local configuration fallback")
      if (!input.ref || /[\x00-\x1f\x7f\\]/.test(input.ref) || input.ref.split("/").some((part) => !part || part === "." || part === ".."))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab source ref must name an exact commit, branch or tag")
    })
    const project = yield* native.project(binding)
    const configured = ActionsGitLabNative.configPath(project)
    // Current settings cannot deny a historical file or local include addressed
    // by its immutable commit. That read does not prove a run-definition join.
    if (input.path === ".gitlab-ci.yml" && configured !== input.path && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(input.ref)))
      return yield* ActionsGitLabNative.error(binding, "source_unresolved", "GitLab native CI configuration is custom, external or unobserved; default file is not a substitute")
    const commitResponse = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/commits/${encodeURIComponent(input.ref)}`)
    const commit = yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.decode(binding, ActionsGitLabNative.Commit, commitResponse.data, "commit"))
    // Resolve branch BEFORE content, then request that exact immutable commit.
    // https://docs.gitlab.com/api/commits/#retrieve-a-commit
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/files/${encodeURIComponent(input.path)}`, { ref: commit.id })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const file = ActionsGitLabNative.decode(binding, ActionsGitLabNative.File, response.data, "repository file")
      if (file.file_path !== input.path || file.commit_id !== commit.id)
        throw ActionsGitLabNative.error(binding, "source_conflict", "GitLab source identity differs from the requested file and resolved commit")
      const bytes = Buffer.from(file.content, "base64")
      const text = bytes.toString("utf8")
      if (bytes.toString("base64") !== file.content || !Buffer.from(text, "utf8").equals(bytes))
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab source content is not exact base64-encoded UTF-8 text")
      // File API may transcode text. Prove fidelity to the identified raw blob,
      // not merely to the API's decoded view: H("blob <byte-length>\0" + bytes).
      // https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
      // https://git-scm.com/docs/hash-function-transition (blob payload unchanged)
      if (createHash(file.blob_id.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== file.blob_id.toLowerCase())
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab decoded source bytes do not match the identified raw Git blob")
      return Actions.Source.make({ bindingID: binding.id, path: input.path, ref: input.ref, commit: commit.id,
        version: JSON.stringify({ blob_id: file.blob_id, last_commit_id: file.last_commit_id }), text,
        // Read permission, roles and branch protection cannot prove write eligibility.
        editable: false, diagnostics: ["Write permission and ref protection are not observed; source is read-only"] })
    })
  })
  const capabilities = Effect.fn("ActionsGitLabRead.capabilities")(function* (binding: Actions.Binding) {
    const project = yield* native.project(binding)
    const observedAt = Date.now()
    const scope = `projects/${binding.projectID}`
    const permissions = [project.permissions?.project_access?.access_level, project.permissions?.group_access?.access_level]
      .filter((value) => value !== undefined)
    const context = `Native project read succeeded; access levels ${permissions.length ? permissions.join(",") : "unobserved"}; advisory client version ${binding.provider.version ?? "unset"}; native version unobserved by this inspection`
    return [Actions.Capability.make({ operation: "workflows.read", state: "available", reason: context, scope, observedAt }),
      ...["source.read", "runs.read", "jobs.read"].map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; endpoint-specific read permission not observed` })),
      ...Actions.OperationKind.literals.map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; token scope, native operation eligibility and protected-ref permissions not observed` })),
    ]
  })
  return { workflows, source, capabilities }
}

function toWorkflow(binding: Actions.Binding, project: typeof ActionsGitLabNative.Project.Type) {
  const path = ActionsGitLabNative.configPath(project)
  const disabled = project.jobs_enabled === false || project.builds_access_level === "disabled" || project.archived === true
  const state = path === undefined || !ActionsGitLabNative.localPath(path) ? "source_unresolved" : disabled ? "disabled" : "configured"
  return Actions.Workflow.make({ id: ActionsGitLabNative.workflowID(binding), bindingID: binding.id, name: project.name,
    ...(project.default_branch ? { defaultRef: project.default_branch } : {}),
    path: path ?? "", state, dispatchable: false, dispatchState: disabled ? "unavailable" : "unknown" })
}
~~~~


## A07 — Runs/jobs/bridges GitLab sem tentativa fabricada

Vínculo: `body.md` §1; archive de evidência: `evidence.md`, seção `A07`.


### `packages/core/src/actions/gitlab/runs.ts`

Archive: `sources/packages/core/src/actions/gitlab/runs.ts` · bytes: 9251 · Git blob: `5c1611e2e163457eb6f17cc44f386f597ccaccd6` · SHA256: `4cb9c8b7a73b12019ee9f60b36b2c116ccac833ab12f73307e5c37ba6341cdab`.

Papel da fonte: Pipeline nativa e gates por metadata para filtros; tempos nativos.


Linhas **12–116**; SHA256 do intervalo `3f426c25128ebc99d3f16f9de9459f467d7c488eb57d15f1107c8525d28cc7ee`:

~~~~typescript
  .pipe(Schema.decodeTo(Schema.DateTimeUtcFromString))
const Source = Schema.Literals(["unknown", "push", "web", "trigger", "schedule", "api", "external", "pipeline", "chat", "webide",
  "merge_request_event", "external_pull_request_event", "parent_pipeline", "ondemand_dast_scan", "ondemand_dast_validation",
  "security_orchestration_policy", "container_registry_push", "duo_workflow", "pipeline_execution_policy_schedule"])
// Closed API enum. 14.2 declares source but gates the finder behind a flag; 14.3 removes it.
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/finders/ci/pipelines_finder.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/finders/ci/pipelines_finder.rb (parent_pipeline)
// https://gitlab.com/gitlab-org/gitlab/-/blob/v14.3.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.0.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.4.0-ee/app/models/concerns/enums/ci/pipeline.rb
// https://gitlab.com/gitlab-org/gitlab/-/blob/v17.9.0-ee/app/models/concerns/enums/ci/pipeline.rb
const sourceMinimum = {
  unknown: [14, 3], push: [14, 3], web: [14, 3], trigger: [14, 3], schedule: [14, 3], api: [14, 3], external: [14, 3],
  pipeline: [14, 3], chat: [14, 3], webide: [14, 3], merge_request_event: [14, 3], external_pull_request_event: [14, 3],
  ondemand_dast_scan: [14, 3], ondemand_dast_validation: [14, 3], security_orchestration_policy: [14, 3],
  parent_pipeline: [17, 0], container_registry_push: [17, 0], duo_workflow: [17, 4], pipeline_execution_policy_schedule: [17, 9],
}

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  const runs = Effect.fn("ActionsGitLabRead.runs")(function* (binding: Actions.Binding, input: Actions.RunListInput) {
    const query = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["workflowID", "cursor", "limit", "ref", "event", "status", "commit", "actor", "created",
        "createdAfter", "createdBefore", "updatedAfter", "updatedBefore"], Actions.RunListInput)
      if (input.workflowID !== undefined && input.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab workflowID must select this native project pipeline/config slot")
      if (input.created !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab created filter is ambiguous; use explicit created_after/created_before fields")
      if (input.status !== undefined && !statuses.includes(input.status))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab status filter must use a documented native pipeline status")
      if (input.event !== undefined && Option.isNone(Schema.decodeUnknownOption(Source)(input.event)))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab event filter must use a qualified native pipeline source")
      if ([input.ref, input.event, input.commit, input.actor].some((value) => value !== undefined && (!value || /[\x00-\x1f\x7f]/.test(value))))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab pipeline filters must be nonempty native strings")
      return { per_page: ActionsCursor.limit(input.limit),
        ...(input.ref === undefined ? {} : { ref: input.ref }), ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.event === undefined ? {} : { source: input.event }), ...(input.commit === undefined ? {} : { sha: input.commit }),
        ...(input.actor === undefined ? {} : { username: input.actor }), ...rangeQuery(binding, input) }
    })
    const page = yield* ActionsGitLabNative.checked(binding, () => ActionsCursor.page(binding, "gitlab.runs", query, input.cursor))
    if (input.event !== undefined || input.createdAfter !== undefined || input.createdBefore !== undefined || input.updatedAfter !== undefined || input.updatedBefore !== undefined) {
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => {
        if (input.event !== undefined) {
          const source = ActionsGitLabNative.decode(binding, Source, input.event, "source selection")
          ActionsGitLabNative.requireVersion(binding, observation, sourceMinimum[source], `source=${source}`)
        }
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v17.11.0-ee/lib/api/ci/pipelines.rb
        if (input.createdAfter !== undefined || input.createdBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [17, 11], "created_after/created_before")
        // https://gitlab.com/gitlab-org/gitlab/-/blob/v12.6.0-ee/lib/api/pipelines.rb
        if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
          ActionsGitLabNative.requireVersion(binding, observation, [12, 6], "updated_after/updated_before")
      })
    }
    yield* native.project(binding)
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines`, { ...query, page })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const pipelines = ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Pipeline), response.data, "pipeline list")
      pipelines.forEach((pipeline) => {
        ActionsGitLabNative.requirePipeline(binding, pipeline)
        if (input.event !== undefined && pipeline.source !== input.event)
          throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab returned a pipeline outside the requested native source selection")
      })
      if (new Set(pipelines.map((pipeline) => String(pipeline.id))).size !== pipelines.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab pipeline page contains duplicate native IDs")
      return { items: pipelines.map((pipeline) => toRun(binding, pipeline)), capturedAt: Date.now(),
        ...ActionsGitLabNative.pagination(binding, "gitlab.runs", query, response.headers, page) }
    })
  })
  const run = Effect.fn("ActionsGitLabRead.run")(function* (binding: Actions.Binding, id: string) {
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.nativeID(binding, id, "pipeline ID"))
    yield* native.project(binding)
    return toRun(binding, yield* native.pipeline(binding, id))
  })
  return { runs, run }
}

function toRun(binding: Actions.Binding, pipeline: typeof ActionsGitLabNative.Pipeline.Type) {
  return Actions.Run.make({ id: String(pipeline.id), bindingID: binding.id, workflowID: ActionsGitLabNative.workflowID(binding),
    name: pipeline.name === undefined ? `Pipeline ${pipeline.id}` : pipeline.name, ref: pipeline.ref, commit: pipeline.sha, event: pipeline.source,
    repositoryID: String(pipeline.project_id),
    ...(pipeline.name ? { title: pipeline.name } : {}),
    ...(pipeline.iid === undefined ? {} : { number: Number(pipeline.iid) }),
    status: pipeline.status, ...(ActionsGitLabNative.conclusion(pipeline.status) === undefined ? {} : { conclusion: pipeline.status }),
    ...(pipeline.user ? { actor: pipeline.user.username } : {}),
    ...(pipeline.created_at === undefined || pipeline.created_at === null ? {} : { createdAt: pipeline.created_at }),
    ...(pipeline.started_at === undefined || pipeline.started_at === null ? {} : { startedAt: pipeline.started_at }),
    ...(pipeline.finished_at === undefined || pipeline.finished_at === null ? {} : { finishedAt: pipeline.finished_at }),
    ...(pipeline.updated_at === undefined || pipeline.updated_at === null ? {} : { updatedAt: pipeline.updated_at }),
    ...(pipeline.duration === undefined || pipeline.duration === null ? {} : { duration: pipeline.duration }),
    ...(pipeline.web_url === undefined || pipeline.web_url === null ? {} : { url: pipeline.web_url }),
  })
}

function rangeQuery(binding: Actions.Binding, input: Actions.RunListInput) {
  const entries = Object.entries({ created_after: input.createdAfter, created_before: input.createdBefore,
    updated_after: input.updatedAfter, updated_before: input.updatedBefore })
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
  if (!entries.length) return {}
  entries.forEach(([key, value]) => {
    if (Option.isNone(Schema.decodeUnknownOption(Timestamp)(value)))
      throw ActionsGitLabNative.error(binding, "invalid_input", `GitLab ${key} must be an ISO 8601 timestamp with a timezone`)
  })
  return Object.fromEntries(entries)
}
~~~~


### `packages/core/src/actions/gitlab/jobs.ts`

Archive: `sources/packages/core/src/actions/gitlab/jobs.ts` · bytes: 4992 · Git blob: `5eef5ef7e30087596d06535bf9f4775704a8d033` · SHA256: `5f2ef28c5898a8375a57a0c85d053cea34a3f3981319d1bbb619db7599a5f8bf`.

Papel da fonte: Coleções jobs e bridges em cursor distinto, include_retried e ownership.


Linhas **15–69**; SHA256 do intervalo `2e230d38ce978e2e573c4fbdebbfb0515ed162112ad6c3acf852bd215bb69457`:

~~~~typescript
export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  return Effect.fn("ActionsGitLabRead.jobs")(function* (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) {
    const filters = { runID: input.runID, per_page: perPage, include_retried: true, pagination: "jobs-then-bridges-v1" }
    const position = yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["runID", "attempt", "cursor"], Schema.Struct({
        runID: Schema.NonEmptyString, attempt: Schema.optional(Schema.Int), cursor: Schema.optional(Schema.String),
      }))
      ActionsGitLabNative.nativeID(binding, input.runID, "pipeline ID")
      if (input.attempt !== undefined) throw ActionsGitLabNative.error(binding, "capability_unavailable", "GitLab job retries have native job IDs, not pipeline run_attempt numbers")
      return ActionsCursor.page(binding, "gitlab.jobs", filters, input.cursor)
    })
    yield* native.project(binding)
    yield* native.pipeline(binding, input.runID)
    const bridges = position > bridgeOffset
    const page = bridges ? position - bridgeOffset : position
    // The documented bridges route retains compatibility with pre-19.2 GitLab.
    // https://docs.gitlab.com/api/jobs/#list-all-trigger-jobs-by-pipeline
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/pipelines/${input.runID}/${bridges ? "bridges" : "jobs"}`,
      { page, per_page: perPage, ...(bridges ? {} : { include_retried: true }) })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const jobs = bridges ? ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Bridge), response.data, "bridge list")
        : ActionsGitLabNative.decode(binding, Schema.Array(ActionsGitLabNative.Job), response.data, "job list")
      jobs.forEach((job) => {
        if (String(job.pipeline.id) !== input.runID || String(job.pipeline.project_id) !== binding.projectID)
          throw ActionsGitLabNative.error(binding, "binding_stale", "GitLab job does not belong to the requested native project and pipeline")
      })
      if (new Set(jobs.map((job) => String(job.id))).size !== jobs.length)
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab job page contains duplicate native IDs")
      const next = ActionsCursor.next(response.headers)
      ActionsCursor.total(response.headers) // Validate even though it is not a composite total.
      if (next !== undefined && (next <= page || next > bridgeOffset))
        throw ActionsGitLabNative.error(binding, "transport_failed", "GitLab jobs pagination is non-advancing or exceeds the cursor range")
      const position = next === undefined ? bridges ? undefined : bridgeOffset + 1 : (bridges ? bridgeOffset : 0) + next
      return { items: jobs.map((job) => toJob(binding, job, bridges)), capturedAt: Date.now(),
        ...(position === undefined ? {} : { next: ActionsCursor.encode(binding, "gitlab.jobs", filters, position) }) }
    })
  })
}

function toJob(binding: Actions.Binding, job: typeof ActionsGitLabNative.Job.Type | typeof ActionsGitLabNative.Bridge.Type, bridges: boolean) {
  return Actions.Job.make({ id: String(job.id), bindingID: binding.id, runID: String(job.pipeline.id), name: job.name,
    status: job.status, stage: job.stage, allowFailure: job.allow_failure, kind: bridges ? "bridge" : "job",
    ...(ActionsGitLabNative.conclusion(job.status) === undefined ? {} : { conclusion: job.status }),
    ...(job.retried === undefined ? {} : { retried: job.retried }),
    ...(job.runner ? { runner: String(job.runner.id), runnerID: String(job.runner.id) } : {}),
    ...(job.started_at === undefined || job.started_at === null ? {} : { startedAt: job.started_at }),
    ...(job.finished_at === undefined || job.finished_at === null ? {} : { finishedAt: job.finished_at }),
    ...("downstream_pipeline" in job && job.downstream_pipeline ? { downstreamID: String(job.downstream_pipeline.id),
      ...(job.downstream_pipeline.project_id === undefined ? {} : { downstreamProjectID: String(job.downstream_pipeline.project_id) }) } : {}),
    // REST gives neither execution steps nor predecessor IDs. Same name/stage
    // proves neither retryOf nor definitionID (parallel/matrix jobs can match).
    steps: [],
  })
}
~~~~


## A08 — Orçamento e segurança do parser YAML

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A08`.


### `packages/core/src/actions/source/document.ts`

Archive: `sources/packages/core/src/actions/source/document.ts` · bytes: 13276 · Git blob: `52ec9f767dad9ba0cec28ec25ec4f7e4c16a163b` · SHA256: `7948e08d19341892df7f4cd8ae38f3cdb27694a197e1b462c3b4efdb96d90ce3`.

Papel da fonte: Parsing limitado antes e durante expansão; valores e chaves estritos.


Linhas **10–81**; SHA256 do intervalo `0e458c56f12b7d3d6f921c41d4f538302c30b99bf2a7fab75db3ccc215608084`:

~~~~typescript
export function diagnostics() {
  const items: string[] = []
  const severity = { partial: false, unresolved: false }
  return {
    items,
    work: { lexemes: 0, triviaPeak: 0, parserNext: 0, parserEnd: 0, cstNodes: 0, compositions: 0, resolutions: 0, merges: 0 },
    add(kind: "partial" | "unresolved", message: string, critical = false) {
      severity[kind] = true
      if (critical && items.length >= limits.diagnostics - 1) {
        items[limits.diagnostics - 1] = `source_${kind}:${message}; diagnostics_truncated`.slice(0, limits.diagnosticLength)
        return
      }
      if (items.length < limits.diagnostics - 1) {
        items.push(`source_${kind}:${message}`.slice(0, limits.diagnosticLength))
        return
      }
      if (items.length === limits.diagnostics - 1) items.push("source_partial:diagnostics_truncated")
    },
    state(): "complete" | "partial" | "unresolved" {
      return severity.unresolved ? "unresolved" : severity.partial ? "partial" : "complete"
    },
  }
}
export type Diagnostics = ReturnType<typeof diagnostics>

export function read(text: string, provider: "github" | "gitlab", report: Diagnostics): {
  value: Schema.JsonObject; references: string[][]; header?: Schema.JsonObject
} | undefined {
  if (text.length > limits.sourceBytes || new TextEncoder().encode(text).length > limits.sourceBytes) {
    report.add("unresolved", "source_limit:maximum 1048576 UTF-8 bytes")
    return
  }
  // YAML conversion can throw for unresolved aliases or expansion limits; contain that library boundary.
  try {
    const documents = preflight(text, provider, report)
    if (!documents) return
    const parsed = documents.map((document, index) => compose(
      text.slice(index === 0 ? 0 : document.offset, documents[index + 1]?.offset ?? text.length), provider, report,
      index === 0 ? 0 : document.offset,
    ))
    if (parsed.some((document) => document === undefined)) return
    const first = parsed[0]
    if (!first) {
      report.add("unresolved", "unsafe_document:expected finite JSON mapping")
      return
    }
    if (provider === "github") return first
    if (parsed.length === 1 && first.value.spec === undefined) return first
    if (Object.keys(first.value).some((key) => key !== "spec") || !object(first.value.spec)
      || first.value.spec.inputs !== undefined && !object(first.value.spec.inputs)) {
      report.add("unresolved", "gitlab_header_invalid:expected isolated spec header")
      return
    }
    const body = parsed[1]
    if (body && !documents[1].start.some((token) => token.type === "doc-start") || body?.value.spec !== undefined) {
      report.add("unresolved", "gitlab_header_invalid:expected --- then one body without spec")
      return
    }
    return { value: body?.value ?? {}, references: body?.references ?? [], header: first.value }
  } catch (error) {
    const alias = error instanceof ReferenceError
    report.add("unresolved", alias ? "yaml_alias:unresolved or excessive alias expansion" : "yaml_conversion:invalid or excessive structure")
  }
}

function preflight(text: string, provider: "github" | "gitlab", report: Diagnostics) {
  const lexemes: string[] = []
  const counts = { aliases: 0, trivia: 0, scalar: false, offset: 0 }
  const lexical = new Lexer().lex(text)
  // Precheck the entire Lexer stream before either Parser or parseDocument can scan pending trivia.
  // 1024 trivia lexemes allow substantial comment blocks while bounding the library's quadratic prefix scans.
  while (true) {
~~~~


Linhas **85–151**; SHA256 do intervalo `66912d6c6d309939c0f4a2277699c000f4c0b0346c6c419c6ea2a7a4c3afa861`:

~~~~typescript
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return
    }
    // A SCALAR marker owns the next lexeme, even when block/plain scalar data starts with whitespace or '#'.
    const payload = counts.scalar
    const type = payload ? null : CST.tokenType(next.value)
    counts.scalar = !payload && next.value === CST.SCALAR
    counts.trivia = type === "space" || type === "newline" || type === "comment" ? counts.trivia + 1 : 0
    report.work.triviaPeak = Math.max(report.work.triviaPeak, counts.trivia)
    if (counts.trivia > limits.trivia) {
      report.add("unresolved", `trivia_limit:maximum 1024 consecutive trivia lexemes; offset ${counts.offset}`)
      return
    }
    if (type === "alias" && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (payload || type !== "scalar" && type !== "doc-mode" && type !== "flow-error-end") counts.offset += next.value.length
    lexemes.push(next.value)
  }
  const parser = new Parser()
  const documents: CST.Document[] = []
  const receive = (token: CST.Token) => {
    if (token.type === "document") documents.push(token)
    if (documents.length > (provider === "github" ? 1 : 2)) {
      report.add("unresolved", "yaml_MULTIPLE_DOCS:only GitLab spec header plus one body supported")
      return false
    }
    return true
  }
  if (!lexemes.every((lexeme) => {
    if (parser.stack.length > limits.depth + 2) {
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return false
    }
    ++report.work.parserNext
    return Array.from(parser.next(lexeme)).every(receive)
  })) return
  ++report.work.parserEnd
  if (!Array.from(parser.end()).every(receive)) return
  const pending = documents.flatMap((document) => document.value ? [{ token: document.value, depth: 0 }] : [])
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++report.work.cstNodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
      return
    }
    if (entry.token.type === "block-map" || entry.token.type === "block-seq" || entry.token.type === "flow-collection") {
      const mapping = entry.token.type === "block-map" || entry.token.type === "flow-collection" && entry.token.start.type === "flow-map-start"
      if (!entry.token.items.every((item) => {
        if (mapping && (item.key || item.sep) && (!item.key || !CST.isScalar(item.key))) {
          report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings, not aliases or collections")
          return false
        }
        if ((item.key || item.value) && ++report.work.cstNodes > limits.nodes) {
          report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
          return false
        }
        if (item.key) pending.push({ token: item.key, depth: entry.depth + 1 })
        if (item.value) pending.push({ token: item.value, depth: entry.depth + 1 })
        return true
      })) return
    }
  }
  return documents
}
~~~~


Linhas **156–207**; SHA256 do intervalo `07f7056868911b86e34002d81ef88e9eb24db43f80f641a5970fa5cc1b7064b5`:

~~~~typescript
  const document = parseDocument(text, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: provider === "gitlab", logLevel: "error",
  })
  document.errors.forEach((error) => report.add("unresolved", `yaml_${error.code}:offset ${offset + error.pos[0]}`))
  if (document.errors.length) return
  if (document.directives.yaml.version !== "1.2") {
    report.add("unresolved", "yaml_version:only YAML 1.2 supported")
    return
  }
  document.warnings.forEach((warning) => report.add("partial", `yaml_${warning.code}:offset ${offset + warning.pos[0]}`))
  const references: string[][] = []
  const pending: { node: unknown; depth: number; path: string[] }[] = [{ node: document.contents, depth: 0, path: [] }]
  const counts = { nodes: 0, aliases: 0 }
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++counts.nodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "structure_limit:maximum depth 64 and 50000 nodes")
      return
    }
    if (isAlias(entry.node) && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (isAlias(entry.node)) {
      const target = entry.node.resolve(document)
      if (target) pending.push({ node: target, depth: entry.depth, path: entry.path })
    }
    if (isPair(entry.node)) {
      if (isScalar(entry.node.key) && ["__proto__", "constructor", "prototype"].includes(String(entry.node.key.value))) {
        report.add("unresolved", "unsafe_key:prototype-sensitive mapping key")
        return
      }
      const key = isScalar(entry.node.key) ? String(entry.node.key.value) : ""
      pending.push({ node: entry.node.key, depth: entry.depth, path: entry.path }, {
        node: entry.node.value, depth: entry.depth, path: [...entry.path, key],
      })
    }
    if (isMap(entry.node) || isSeq(entry.node)) {
      if (isMap(entry.node)) {
        const keys = new Set<string>()
        if (!entry.node.items.every((pair) => {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
            report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings")
            return false
          }
          if (keys.has(pair.key.value)) {
            report.add("unresolved", `yaml_DUPLICATE_KEY:offset ${offset + (pair.key.range?.[0] ?? 0)}`)
            return false
          }
          keys.add(pair.key.value)
~~~~


Linhas **238–276**; SHA256 do intervalo `ac38ead42182bc717a3c2d2c7b8ad0a68a2f8d64c1f700ece9090cb6ff81f3c3`:

~~~~typescript
function safeJson(value: unknown, ancestors: Set<object>, depth: number, count: { nodes: number }): boolean {
  if (++count.nodes > limits.nodes || depth > limits.depth) return false
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false
  if (Object.keys(value).some((key) => ["__proto__", "constructor", "prototype"].includes(key))) return false
  ancestors.add(value)
  const safe = Object.values(value).every((child: unknown) => safeJson(child, ancestors, depth + 1, count))
  ancestors.delete(value)
  return safe
}

export function object(value: Schema.Json | undefined): value is Schema.JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
}

export function strings(value: Schema.Json | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string" && entry.length > 0)
}

export function expression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("${{")
  if (Array.isArray(value)) return value.some((child) => expression(child))
  return object(value) && Object.values(value).some((child) => expression(child))
}

export function inputExpression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("$[[")
  if (Array.isArray(value)) return value.some((child) => inputExpression(child))
  return object(value) && Object.values(value).some((child) => inputExpression(child))
}

export function condition(value: Schema.Json | undefined, path: string, report: Diagnostics) {
  if (value === undefined) return
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  report.add("unresolved", `condition_invalid:${path}`)
}
~~~~


## A09 — Grafo de definição GitHub

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A09`.


### `packages/core/src/actions/source/graph.ts`

Archive: `sources/packages/core/src/actions/source/graph.ts` · bytes: 3845 · Git blob: `9979794cf9f26e006fa36651ba026ecf044a65e2` · SHA256: `0219fc70d60d16887c37ac9cd9a3b9cf9aac5e586716d918d5cb2667550c8e0f`.

Papel da fonte: Partialidade, nós de definição, needs e detecção de ciclos.


Linhas **10–74**; SHA256 do intervalo `57daa7cb6ba2e2fefe5cb4715bb9e075afc2a95a0d339feaf72180b0eab5aa85`:

~~~~typescript
export function parse(provider: Actions.ProviderKind, source: Actions.Source): Actions.Graph {
  const report = diagnostics()
  source.diagnostics?.forEach((message) => report.add("partial", `source_diagnostic:${message}`))
  if (source.includes?.length) report.add("partial", "source_includes:external source not resolved")
  const document = read(source.text, provider, report)
  if (!document) return { source, state: "unresolved", jobs: [], diagnostics: report.items }
  const inputs = document.header ? inputDefinitions(document.header, report) : undefined
  if (provider === "gitlab" && inputExpression(document.value)) report.add("partial", "inputs_unresolved:body interpolation retained without evaluation")
  const result = provider === "github" ? github(document.value, report) : gitlab(document.value, report, document.references)
  // Inspect only definition-level edges. Matrix cells and provider execution IDs are separate data.
  const jobs = new Map(result.jobs.map((job) => [job.id, job]))
  const degree = new Map(result.jobs.map((job) => [job.id, job.needs.filter((id) => jobs.has(id)).length]))
  const outgoing = new Map<string, string[]>()
  result.jobs.forEach((job) => job.needs.forEach((id) => {
    if (!jobs.has(id)) return
    const destinations = outgoing.get(id)
    if (destinations) {
      destinations.push(job.id)
      return
    }
    outgoing.set(id, [job.id])
  }))
  const ready = result.jobs.filter((job) => degree.get(job.id) === 0).map((job) => job.id)
  const processed = { count: 0 }
  while (processed.count < ready.length) {
    const id = ready[processed.count++]
    if (id === undefined) break
    outgoing.get(id)?.forEach((child) => {
      const remaining = (degree.get(child) ?? 0) - 1
      degree.set(child, remaining)
      if (remaining === 0) ready.push(child)
    })
  }
  if (processed.count !== result.jobs.length) {
    report.add("unresolved", `needs_cycle:${result.jobs.filter((job) => (degree.get(job.id) ?? 0) > 0).map((job) => job.id).join(",")}`)
  }
  return { source, ...result, header: document.header, inputs, state: report.state(), diagnostics: report.items }
}

function inputDefinitions(header: Schema.JsonObject, report: Diagnostics): Actions.InputDefinition[] {
  if (!object(header.spec)) return []
  if (header.spec.include !== undefined) report.add("partial", "inputs_include_unresolved:external input definitions not fetched")
  if (!object(header.spec.inputs)) return []
  return Object.entries(header.spec.inputs).flatMap(([name, configuration]) => {
    const config = configuration === null ? {} : configuration
    if (!object(config) || !name) {
      report.add("unresolved", `input_invalid:${name}`)
      return []
    }
    if (config.rules !== undefined || inputExpression(config)) {
      report.add("partial", `input_unresolved:${name}:conditional or interpolated input definition`)
      return []
    }
    const definition = {
      name, type: config.type === undefined ? "string" : config.type, required: !Object.hasOwn(config, "default"),
      description: config.description, default: config.default, options: config.options,
    }
    if (!Schema.is(Actions.InputDefinition)(definition) || !["string", "boolean", "number", "array"].includes(definition.type)) {
      report.add("unresolved", `input_invalid:${name}:unsupported native input shape`)
      return []
    }
    if (config.regex !== undefined) report.add("partial", `input_constraints:${name}:native regex retained without evaluation`)
    return [definition]
  })
}
~~~~


### `packages/core/src/actions/source/github.ts`

Archive: `sources/packages/core/src/actions/source/github.ts` · bytes: 3773 · Git blob: `48042830d79b37d23fa901759eeeaa2f56fd8253` · SHA256: `18b5e3799d02c347f7c80b58264e4e8bc6c5d8c07f7d1559a65186a9313c6bca`.

Papel da fonte: Jobs/needs locais, matrix/reusable parcialmente resolvidos.


Linhas **10–62**; SHA256 do intervalo `6b683d231e2019f5e936c3988404a815ae3b5817786410a5c508b8fc41adc53c`:

~~~~typescript
  }
  if (document.on === undefined) report.add("unresolved", "triggers_missing:GitHub requires on")
  if (document.on !== undefined && typeof document.on !== "string" && !strings(document.on) && !object(document.on)) {
    report.add("unresolved", "triggers_invalid:expected native event string, array or mapping")
  }
  const definitions = document.jobs
  const jobs = Object.entries(definitions).flatMap(([id, configuration]): Actions.GraphJob[] => {
    if (!id || !object(configuration)) {
      report.add("unresolved", `job_invalid:jobs.${id}`)
      return []
    }
    const needs = configuration.needs === undefined ? [] : typeof configuration.needs === "string"
      ? [configuration.needs] : strings(configuration.needs) ? configuration.needs : undefined
    if (!needs || needs.some((need) => !need)) report.add("unresolved", `needs_invalid:jobs.${id}`)
    needs?.forEach((need) => {
      if (!Object.hasOwn(definitions, need)) report.add("unresolved", `needs_missing:jobs.${id}->${need}`)
    })
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:jobs.${id}`)
    const strategy = object(configuration.strategy) ? configuration.strategy : undefined
    const matrix = strategy?.matrix
    if (matrix !== undefined && expression(matrix)) report.add("partial", `matrix_dynamic:jobs.${id}`)
    if (matrix !== undefined && !object(matrix) && typeof matrix !== "string") report.add("unresolved", `matrix_invalid:jobs.${id}`)
    if (typeof configuration.uses === "string") report.add("partial", `reusable_unresolved:jobs.${id}`)
    if (configuration.uses !== undefined && typeof configuration.uses !== "string") report.add("unresolved", `reusable_invalid:jobs.${id}`)
    if (Object.hasOwn(configuration, "<<")) report.add("partial", `yaml_merge_unsupported:jobs.${id}`)
    const steps = configuration.steps === undefined ? [] : Array.isArray(configuration.steps)
      ? configuration.steps.flatMap((step, index): Actions.GraphStep[] => {
        if (!object(step)) {
          report.add("unresolved", `step_invalid:jobs.${id}.steps.${index}`)
          return []
        }
        if (step.uses !== undefined && typeof step.uses !== "string" || step.run !== undefined && typeof step.run !== "string") {
          report.add("unresolved", `step_command_invalid:jobs.${id}.steps.${index}`)
        }
        return [{
          name: typeof step.name === "string" ? step.name : typeof step.id === "string" ? step.id
            : typeof step.uses === "string" ? step.uses : `Step ${index + 1}`,
          uses: typeof step.uses === "string" ? step.uses : undefined,
          run: typeof step.run === "string" ? step.run : undefined,
          condition: condition(step.if, `jobs.${id}.steps.${index}`, report),
        }]
      }) : undefined
    if (!steps) report.add("unresolved", `steps_invalid:jobs.${id}`)
    return [{
      id, name: typeof configuration.name === "string" ? configuration.name : id,
      needs: needs ?? [], condition: condition(configuration.if, `jobs.${id}`, report),
      runner: configuration["runs-on"], matrix,
      reusable: typeof configuration.uses === "string" ? configuration.uses : undefined,
      configuration, steps: steps ?? [],
    }]
  })
  return { jobs, triggers: document.on }
}
~~~~


## A10 — Resolução local de GitLab

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A10`.


### `packages/core/src/actions/source/gitlab.ts`

Archive: `sources/packages/core/src/actions/source/gitlab.ts` · bytes: 11989 · Git blob: `2c78794a932b7b1680a0571a975201c55676feef` · SHA256: `cc2827422fb5962c93b849d212d0755eb040485689cd1c43219d7e885550c79c`.

Papel da fonte: Includes não executados, extends/default distintos, needs locais sem inventar stage edges.


Linhas **12–97**; SHA256 do intervalo `ff9e7223c780674ae92fe6e34756fe8012bfa4185e2a1a96358db3725f915da1`:

~~~~typescript
  const opaque = (path: readonly string[]) => references.some((reference) => path.every((key, index) => reference[index] === key))
  const includes = document.include
  if (includes !== undefined) report.add("partial", "include_unresolved:external GitLab configuration not fetched")
  const explicit = document.stages === undefined ? document.types : document.stages
  const stages = opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? undefined
    : explicit === undefined ? includes === undefined ? [".pre", "build", "test", "deploy", ".post"] : undefined
    : strings(explicit) ? [...new Set([".pre", ...explicit, ".post"])] : undefined
  if (explicit !== undefined && !stages) report.add(opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? "partial" : "unresolved", "stages_unresolved:expected literal native stage name array")
  if (strings(explicit) && new Set(explicit).size !== explicit.length) report.add("unresolved", "stages_duplicate")
  const definitions = new Map(Object.entries(document).filter(([key]) => !reserved.has(key)))
  const resolved = new Map<string, Schema.JsonObject>()
  const levels = new Map<string, number>()
  const resolving = new Set<string>()
  const failed = new Set<string>()
  const parentsByID = new Map<string, string[]>()
  function resolve(id: string, depth = 0): Schema.JsonObject | undefined {
    if (!resolutionVisit(report)) return
    // Depth and active ancestry affect failure. A deep/cyclic caller must not poison a later shallow caller.
    const context = JSON.stringify([id, depth, Array.from(resolving)])
    if (failed.has(context)) return
    const fail = (message: string) => {
      failed.add(context)
      report.add("partial", message)
    }
    const cached = resolved.get(id)
    if (depth + (levels.get(id) ?? 0) > 11 || resolving.has(id)) {
      fail(`extends_unresolved:cycle or more than 11 levels at ${id}`)
      return
    }
    const raw = definitions.get(id)
    if (!object(raw)) {
      fail(`extends_missing:${id}`)
      return
    }
    if (opaque([id]) && depth > 0 || opaque([id, "extends"])) {
      fail(`extends_unresolved:opaque native reference at ${id}`)
      return
    }
    if (cached) return cached
    if (raw.extends === undefined || raw.extends === null) {
      resolved.set(id, raw)
      levels.set(id, 0)
      return raw
    }
    if (includes !== undefined) {
      fail(`extends_unresolved:unfetched includes may contribute parent configuration at ${id}`)
      return
    }
    const parents = parentsByID.get(id) ?? []
    if (!parentsByID.has(id)) {
      const candidates = typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends : undefined
      if (!candidates || !candidates.every((parent) => {
        if (!resolutionVisit(report) || typeof parent !== "string" || !parent) return false
        parents.push(parent)
        return true
      })) {
        fail(`extends_invalid:${id}`)
        return
      }
      // Validate each immutable parent list once; repeated callers must not rescan wide failed lists.
      parentsByID.set(id, parents)
    }
    resolving.add(id)
    const result: { value: Schema.JsonObject } = { value: {} }
    const sound = parents.every((parent) => {
      const config = resolve(parent, depth + 1)
      if (!config) return false
      const value = merge(result.value, config, report)
      if (!value) return false
      result.value = value
      return true
    })
    resolving.delete(id)
    if (!sound) {
      failed.add(context)
      return
    }
    // GitLab reverse deep merge: later parent wins; child wins; arrays/null replace, never concatenate.
    const effective = merge(result.value, raw, report)
    if (!effective) {
      failed.add(context)
      return
    }
    resolved.set(id, effective)
    levels.set(id, 1 + parents.reduce((maximum, parent) => Math.max(maximum, levels.get(parent) ?? 0), 0))
    return effective
~~~~


Linhas **100–179**; SHA256 do intervalo `36cbe1173758ea8ff7e5a777d64ef737e21d1b18da59c62722b6d9a2e1267a62`:

~~~~typescript
    if (id.startsWith(".")) return []
    if (!id || !object(raw)) {
      report.add("unresolved", `job_invalid:${id}`)
      return []
    }
    const effective = resolve(id)
    // Unfetched includes may redefine even known templates/jobs. Keep only source-local projections.
    const config = effective ? applyDefaults(document, effective, report, opaque, id) : raw
    if (inputExpression(id) || inputExpression(config)) report.add("partial", `inputs_unresolved:${id}:native interpolation retained`)
    const uncertain = opaque([id, "<<"])
    if (uncertain) report.add("partial", `merge_unresolved:opaque native reference at ${id}`)
    const stage = uncertain || opaque([id, "stage"]) || inputExpression(config.stage) ? undefined : typeof config.stage === "string" ? config.stage
      : config.stage === undefined && effective && includes === undefined ? "test" : undefined
    if (config.stage !== undefined && typeof config.stage !== "string") report.add(uncertain || opaque([id, "stage"]) ? "partial" : "unresolved", `stage_invalid:${id}`)
    if (stage && stages && !stages.includes(stage)) report.add(includes === undefined ? "unresolved" : "partial", `stage_missing:${id}->${stage}`)
    const status = object(config.needs) && typeof config.needs.pipeline === "string" && config.needs.pipeline.length > 0 && config.needs.job === undefined
    if (status) report.add("partial", `needs_pipeline_status:${id}`)
    const needs = uncertain || opaque([id, "needs"]) ? undefined : config.needs === undefined || status ? [] : Array.isArray(config.needs) ? config.needs.flatMap((need): string[] => {
      if (typeof need === "string" && need) {
        if (inputExpression(need)) return []
        if (!definitions.has(need) || need.startsWith(".")) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need}`)
        return [need]
      }
      if (!object(need) || typeof need.job !== "string" || !need.job) {
        report.add("unresolved", `needs_invalid:${id}`)
        return []
      }
      if (inputExpression(need.job)) return []
      if (need.project !== undefined || need.pipeline !== undefined) {
        report.add("partial", `needs_external:${id}->${need.job}`)
        return []
      }
      if (need.optional !== undefined && typeof need.optional !== "boolean" || need.artifacts !== undefined && typeof need.artifacts !== "boolean") {
        report.add("unresolved", `needs_options_invalid:${id}->${need.job}`)
      }
      if (!definitions.has(need.job) || need.job.startsWith(".")) {
        if (need.optional !== true) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need.job}`)
        return []
      }
      if (need.parallel !== undefined) report.add("partial", `needs_parallel:${id}->${need.job}`)
      return [need.job]
    }) : inputExpression(config.needs) ? [] : undefined
    if (!needs) report.add(uncertain || opaque([id, "needs"]) ? "partial" : "unresolved", `needs_invalid:${id}`)
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:${id}`)
    if (config.trigger !== undefined) report.add("partial", `downstream_unresolved:${id}`)
    if (config.rules !== undefined || config.only !== undefined || config.except !== undefined) report.add("partial", `selection_native:${id}`)
    if (config.parallel !== undefined && !object(config.parallel) && typeof config.parallel !== "number") report.add("partial", `parallel_unresolved:${id}`)
    return [{
      id, name: id, needs: needs ?? [], stage,
      runner: uncertain ? undefined : config.tags, matrix: !uncertain && object(config.parallel) ? config.parallel.matrix : undefined,
      configuration: raw, steps: [],
    }]
  })
  if (jobs.length === 0) report.add(includes === undefined ? "unresolved" : "partial", "jobs_missing:no local execution definitions")
  return { jobs, stages, includes, triggers: document.workflow }
}

function merge(parent: Schema.JsonObject, child: Schema.JsonObject, report: Diagnostics): Schema.JsonObject | undefined {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return
  }
  const entries: [string, Schema.Json][] = []
  const sound = [...new Set([...Object.keys(parent), ...Object.keys(child)])].every((key) => {
    if (!mergeVisit(report)) return false
    const value = child[key]
    const previous = parent[key]
    const result = value === undefined ? previous : object(value) && object(previous) ? merge(previous, value, report) : value
    if (result === undefined) return false
    entries.push([key, result])
    return true
  })
  return sound ? Object.fromEntries(entries) : undefined
}

function resolutionVisit(report: Diagnostics) {
  if (report.work.resolutions === limits.resolutions) {
    report.add("partial", `resolution_limit:${limits.resolutions} visits`, true)
    return false
  }
~~~~


Linhas **181–240**; SHA256 do intervalo `848d22322d16e61e84e7cebf5bfa9cea2ae8a455a48580e5fdb6d22d20830f2c`:

~~~~typescript
  return true
}

function mergeVisit(report: Diagnostics) {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return false
  }
  ++report.work.merges
  return true
}

const defaultKeys = new Set([
  "after_script", "artifacts", "before_script", "cache", "hooks", "id_tokens", "image",
  "interruptible", "retry", "services", "tags",
])

export function applyDefaults(document: Schema.JsonObject, config: Schema.JsonObject, report: Diagnostics, opaque = (_path: readonly string[]) => false, id?: string) {
  if (document.default === undefined) return config
  const inheritance = object(config.inherit) ? config.inherit.default : undefined
  if (config.inherit !== undefined && !object(config.inherit)
    || inheritance !== undefined && typeof inheritance !== "boolean" && !Array.isArray(inheritance)
    || inputExpression(config.inherit) || id !== undefined && opaque([id, "inherit"])
    || opaque(["default"]) || !object(document.default)) {
    report.add("partial", "defaults_unresolved:expected literal defaults and inherit:default boolean or allowlist")
    return config
  }
  if (inheritance === false) return config
  const allowed = new Set<string>()
  if (Array.isArray(inheritance) && !inheritance.every((key) => {
    if (!mergeVisit(report)) return false
    if (typeof key !== "string" || !defaultKeys.has(key)) return false
    allowed.add(key)
    return true
  })) {
    report.add("partial", "defaults_unresolved:unsupported or excessive inherit:default allowlist")
    return config
  }
  if (document.include !== undefined) {
    report.add("partial", "defaults_unresolved:unfetched includes may contribute job overrides")
    return config
  }
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return config
  }
  const entries: [string, Schema.Json][] = []
  const sound = Object.entries(document.default).every(([key, value]) => {
    if (!mergeVisit(report)) return false
    if (!defaultKeys.has(key)) {
      report.add("partial", `default_unsupported:${key}`)
      return true
    }
    if (Array.isArray(inheritance) && !allowed.has(key) || Object.hasOwn(config, key)) return true
    // Native defaults copy whole keywords; they never deep-merge into an explicit job keyword.
    entries.push([key, value])
    return true
  })
  return sound ? { ...Object.fromEntries(entries), ...config } : config
}
~~~~


## A11 — Base e input de autoria

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A11`.


### `packages/core/src/actions/authoring/index.ts`

Archive: `sources/packages/core/src/actions/authoring/index.ts` · bytes: 2854 · Git blob: `7a555bdb35cedd26ab5ddc151c1d068b40eb0144` · SHA256: `219a11d44b682e37a729f0ef4060ad2eda6eae05737dbac5de2325b6b3b10075`.

Papel da fonte: Snapshot de draft, validação local e lint remoto opcional.


Linhas **15–52**; SHA256 do intervalo `c2d375f55f741bdbb6a07428d786224bb6e8de6e168f85d9835ead409abe67e1`:

~~~~typescript
// Local validation projects native YAML; it never evaluates expressions or claims provider acceptance.
export function validate(binding: Actions.Binding, source: Actions.Source): Actions.Graph {
  if (source.bindingID !== binding.id)
    return { source, state: "unresolved", jobs: [], diagnostics: ["source_unresolved:binding_mismatch"] }
  if (source.text.length <= limits.sourceBytes && !source.text.isWellFormed())
    return { source, state: "unresolved", jobs: [], diagnostics: ["source_unresolved:unicode_invalid:source must be well-formed Unicode"] }
  return ActionsGraph.parse(binding.provider.kind, source)
}

export function make(services: Services) {
  return {
    validate: Effect.fn("ActionsAuthoring.validate")(function* (binding: Actions.Binding, source: Actions.Source): Effect.fn.Return<Actions.Graph, ActionsError> {
      const frozen = yield* guard(binding, () => {
        decode(binding, Schema.toType(Actions.Binding), binding)
        decode(binding, Schema.toType(Actions.Source), source)
        return { binding: { ...binding, provider: { ...binding.provider } }, source: { ...source } }
      })
      const graph = validate(frozen.binding, frozen.source)
      if (frozen.binding.provider.kind === "github" || graph.state === "unresolved") return graph
      const { lint } = yield* Effect.promise(() => import("./lint"))
      return yield* lint(services, frozen.binding, frozen.source, graph)
    }),
    perform: Effect.fn("ActionsAuthoring.perform")(function* (
      binding: Actions.Binding, intent: Actions.OperationIntent, payloadJson: ActionsContract.Json,
    ): Effect.fn.Return<ActionsContract.CommandResult, ActionsError> {
      const frozen = yield* guard(binding, () => capture(binding, intent, payloadJson))
      const prepared = yield* before(frozen.binding, Effect.gen(function* () {
        if (frozen.binding.provider.kind === "gitlab") {
          const { plan } = yield* Effect.promise(() => import("./gitlab"))
          return yield* plan(services, frozen.binding, frozen.intent, frozen.payload)
        }
        return yield* plan(services, frozen.binding, frozen.intent, frozen.payload)
      }))
      // The durable parent owns admission, receipt reads and phase sequencing. This call sends once.
      return yield* send(services, frozen.binding, prepared)
    }),
  }
}
~~~~


### `packages/core/src/actions/authoring/input.ts`

Archive: `sources/packages/core/src/actions/authoring/input.ts` · bytes: 8268 · Git blob: `92f38a96b425e8cbb9f6e1946c6c40fa78218e81` · SHA256: `93d7315954e83b280a4c1ae64b6882bb1d341b80e448cf1fd36330c30ed58fd2`.

Papel da fonte: Schemas estritos, branch/path/texto e versões próprias de provider.


Linhas **12–124**; SHA256 do intervalo `0692b98c3a6ff2dfbe75471d77be3b1160020f0228584803d5c6f57585453e93`:

~~~~typescript
export const Branch = Schema.Struct({ provider, branch: Schema.NonEmptyString }).annotate({ parseOptions: strict })
export const Write = Schema.Struct({
  provider, mode: Schema.Literals(["create", "update"]), message: Schema.NonEmptyString, text: Schema.String,
  name: Schema.optionalKey(Schema.NonEmptyString),
  template: Schema.optionalKey(Schema.Literals(["Build and test", "Release", "Blank configuration"])),
}).annotate({ parseOptions: strict })
export const Review = Schema.Struct({ provider, title: Schema.NonEmptyString, text: Schema.String }).annotate({ parseOptions: strict })
export const Version = Schema.Struct({ blob_id: GitHubNative.SHA, last_commit_id: GitHubNative.SHA })
const Capture = Schema.Struct({ binding: Actions.Binding, intent: Actions.OperationIntent, payload: Schema.Json })

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent") {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown, sent = false): A {
  const decoded = Schema.decodeUnknownOption(schema, sent ? undefined : strict)(value)
  if (Option.isNone(decoded)) throw error(binding, sent ? "outcome_unknown" : "invalid_input",
    sent ? "Source mutation response did not prove native identity" : "Source command does not match its strict schema",
    sent ? "unknown" : "definitely_unsent")
  return decoded.value
}

export function native<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider did not prove source preflight identity")
  return decoded.value
}

export function branch(binding: Actions.Binding, value: string) {
  if (!value || value.length > 1024 || !value.isWellFormed() || /[\s\\%?#{}:\x00-\x1f\x7f~^*\[]/.test(value) || value.includes("..") ||
    value.includes("@{") || value === "@" || value.startsWith("-") || value.endsWith(".") ||
    value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw error(binding, "invalid_input", "Source branch must be an exact safe native branch name")
  if (value.startsWith("refs/") || Option.isSome(Schema.decodeUnknownOption(GitHubNative.SHA)(value)))
    throw error(binding, "invalid_input", "Source mutations require a short branch name, not an immutable object or qualified ref")
  return value
}

export function sourcePath(binding: Actions.Binding, value: string | undefined) {
  if (!value || value.length > 4096 || !value.isWellFormed())
    throw error(binding, "invalid_input", "Source commands require an exact admitted repository path")
  if (binding.provider.kind === "gitlab") {
    if (!ActionsGitLabNative.localPath(value))
      throw error(binding, "source_unresolved", "GitLab source proposals require an exact local repository path")
    return value
  }
  GitHubNative.path(binding, value)
  if (!value.startsWith(".github/workflows/") || !/^[^/]+\.ya?ml$/i.test(value.slice(".github/workflows/".length)))
    throw error(binding, "source_unresolved", "GitHub source proposals require a native workflow YAML path")
  return value
}

export function bytes(text: string) {
  if (text.length > limits.sourceBytes || !text.isWellFormed())
    throw new ActionsError({ kind: "invalid_input", message: "Source must be well-formed Unicode within 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  const value = new TextEncoder().encode(text)
  if (value.length > limits.sourceBytes)
    throw new ActionsError({ kind: "invalid_input", message: "Source exceeds 1048576 UTF-8 bytes", disposition: "definitely_unsent" })
  return value
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  decode(binding, Schema.toType(Capture), { binding, intent, payload })
  // Snapshot before the first await. Mutation values never become durable intent fields.
  const value = decode(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (value.intent.binding.id !== value.binding.id || value.intent.binding.revision !== value.binding.revision)
    throw error(binding, "binding_stale", "Source command binding differs from admission")
  if (!["source.branch", "source.write", "source.review"].includes(value.intent.kind))
    throw error(binding, "invalid_input", "Source command kind belongs to another dispatcher")
  if (Object.keys(value.intent.target).some((key) => !["ref", "path", "resourceID"].includes(key)))
    throw error(binding, "invalid_input", "Historical runs and execution targets cannot authorize source mutations")
  if (value.intent.expected?.attempt !== undefined || value.intent.expected?.resourceVersion !== undefined)
    throw error(binding, "invalid_input", "Source commands require source versions and commits, not execution or resource versions")
  if (!value.intent.target.ref || !value.intent.expected?.commit)
    throw error(binding, "invalid_input", "Source commands require an admitted branch and immutable expected commit")
  branch(binding, value.intent.target.ref)
  decode(binding, GitHubNative.SHA, value.intent.expected.commit)
  sourcePath(binding, value.intent.target.path)
  if (value.intent.expected.sourceVersion !== undefined) {
    if (!value.intent.target.path) throw error(binding, "invalid_input", "Source version requires an admitted path")
    version(binding, value.intent.expected.sourceVersion)
  }
  if (value.intent.kind === "source.branch") {
    if (!value.intent.target.resourceID) throw error(binding, "invalid_input", "Branch creation requires its admitted new branch")
    branch(binding, value.intent.target.resourceID)
    if (value.intent.target.resourceID === value.intent.target.ref)
      throw error(binding, "invalid_input", "Source branch must differ from its captured base")
  }
  if (value.intent.kind === "source.write" && (!value.intent.target.path || value.intent.target.resourceID !== undefined))
    throw error(binding, "invalid_input", "Source writes require only their admitted path and branch")
  if (value.intent.kind === "source.review" && value.intent.target.resourceID !== undefined)
    branch(binding, value.intent.target.resourceID)
  return value
}

export function version(binding: Actions.Binding, value: string) {
  return binding.provider.kind === "github" ? { blob_id: decode(binding, GitHubNative.SHA, value), last_commit_id: undefined }
    : decode(binding, Schema.fromJsonString(Version).annotate({ parseOptions: strict }), value)
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source) {
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit)
    throw error(binding, "source_unresolved", "Reader did not prove the admitted source identity")
  decode(binding, GitHubNative.SHA, value.commit)
  const selected = version(binding, value.version)
  bytes(value.text)
  const expected = intent.expected?.sourceVersion === undefined ? undefined : version(binding, intent.expected.sourceVersion)
  if (value.commit.toLowerCase() !== intent.expected?.commit?.toLowerCase() || expected !== undefined &&
    (selected.blob_id.toLowerCase() !== expected.blob_id.toLowerCase() ||
      selected.last_commit_id?.toLowerCase() !== expected.last_commit_id?.toLowerCase()))
    throw error(binding, "source_conflict", "Native source changed after admission")
  return value
}
~~~~


### `packages/core/src/actions/authoring/base.ts`

Archive: `sources/packages/core/src/actions/authoring/base.ts` · bytes: 4981 · Git blob: `3c18b87555faf8d09b789ac5dc7316c6721f0f58` · SHA256: `401a807ef4861a182c4ad70985f5d13d9b43a714693ec78ad2d9ec0dc1b83d7d`.

Papel da fonte: Observa branch padrão e commit, revalida base, hash local do draft.


Linhas **15–72**; SHA256 do intervalo `fac4b1ced65ba43d035aa0e6ec35cdc82478907fc963d1c21edc5dcd0683d22d`:

~~~~typescript
  object: Schema.Struct({ type: Schema.Literal("commit"), sha: GitHubNative.SHA }) })
const GitLabRef = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })

export const read = Effect.fn("ActionsSourceBase.read")(function* (
  services: Services, binding: Actions.Binding, ref?: string,
): Effect.fn.Return<Actions.SourceBase, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    if (ref !== undefined) branch(binding, ref)
    return { binding: { ...binding, provider: { ...binding.provider } }, ref }
  })
  if (frozen.binding.provider.kind === "github") {
    const repository = yield* GitHubNative.repository(services.transport, frozen.binding)
    const selected = frozen.ref ?? repository.native.default_branch
    if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitHub repository has no observed default branch")
    const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
    const response = yield* GitHubNative.get(services.transport, frozen.binding,
      { method: "GET", path: `${repository.path}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}` })
    const value = yield* guard(frozen.binding, () => native(frozen.binding, GitHubRef, response.data))
    if (value.ref !== `refs/heads/${name}`) return yield* error(frozen.binding, "source_conflict", "GitHub branch identity differs from the requested branch")
    return { bindingID: frozen.binding.id, ref: name, commit: value.object.sha }
  }
  const project = yield* ActionsGitLabNative.make(services.transport).project(frozen.binding)
  const selected = frozen.ref ?? project.default_branch
  if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitLab project has no observed default branch")
  const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
  const root = yield* guard(frozen.binding, () => ActionsGitLabNative.projectPath(frozen.binding))
  const response = yield* get(services, frozen.binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(frozen.binding, () => native(frozen.binding, GitLabRef, response.data))
  if (value.name !== name) return yield* error(frozen.binding, "source_conflict", "GitLab branch identity differs from the requested branch")
  return { bindingID: frozen.binding.id, ref: name, commit: value.commit.id }
})

export const validate = Effect.fn("ActionsSourceBase.validate")(function* (
  services: Services, binding: Actions.Binding, base: Actions.SourceBase, path: string, draft: string,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    const admitted = decode(binding, Schema.toType(Actions.SourceBase), base)
    if (admitted.bindingID !== binding.id) throw error(binding, "source_unresolved", "Source base belongs to another binding")
    branch(binding, admitted.ref)
    const draftBytes = bytes(draft)
    GitHubNative.path(binding, path)
    if (binding.provider.kind === "github" && (!path.startsWith(".github/workflows/") || path.split("/").length !== 3 || !/\.ya?ml$/i.test(path)))
      throw error(binding, "invalid_input", "GitHub draft path must be a workflow YAML file")
    if (binding.provider.kind === "gitlab" && !ActionsGitLabNative.localPath(path))
      throw error(binding, "invalid_input", "GitLab draft path must be a local repository path")
    // A draft digest identifies local text, never a native optimistic mutation version.
    const source: Actions.Source = { bindingID: admitted.bindingID, path, ref: admitted.ref, commit: admitted.commit,
      version: `draft:sha256:${createHash("sha256").update(draftBytes).digest("hex")}`, text: draft, editable: false }
    decode(binding, Schema.toType(Actions.Source), source)
    return { binding: { ...binding, provider: { ...binding.provider } }, base: { ...admitted }, source }
  })
  const current = yield* read(services, frozen.binding, frozen.base.ref)
  if (current.commit.toLowerCase() !== frozen.base.commit.toLowerCase())
    return yield* error(frozen.binding, "source_conflict", "Source branch moved after base admission")
  return yield* ActionsAuthoring.make(services).validate(frozen.binding, frozen.source)
})
~~~~


## A12 — Publicação GitHub em fases

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A12`.


### `packages/core/src/actions/authoring/github.ts`

Archive: `sources/packages/core/src/actions/authoring/github.ts` · bytes: 6777 · Git blob: `fefe6fd6df55ea6fee6f898b9b5e37b13c650307` · SHA256: `bdcb41b748e4a4ac148867cfbcffe6638ed5dc2b07f3e6bfc25746f7f9134790`.

Papel da fonte: Branch/contents/review com identidade, bytes e novo commit, sem transação remota única.


Linhas **14–99**; SHA256 do intervalo `75f772e09363f174e9f0c0e0f7d86b653feb27b1c3b6817a9deb5880755e2376`:

~~~~typescript
  commit: Schema.Struct({ sha: GitHubNative.SHA }),
})
const Pull = Schema.Struct({
  id: GitHubNative.ID, number: GitHubNative.ID, html_url: Schema.NonEmptyString, title: Schema.NonEmptyString,
  body: Schema.NullOr(Schema.String), state: Schema.Literal("open"),
  head: Schema.Struct({ ref: Schema.NonEmptyString, sha: GitHubNative.SHA, repo: Schema.Struct({ id: GitHubNative.ID }) }),
  base: Schema.Struct({ ref: Schema.NonEmptyString, repo: Schema.Struct({ id: GitHubNative.ID }) }),
})

export const plan = Effect.fn("ActionsAuthoring.github")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "github") throw error(binding, "invalid_input", "Source command provider differs from the bound repository")
    if ("text" in value) bytes(value.text)
    return value
  })
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const repo = yield* GitHubCommandCommon.authority(services, binding)
  const ref = yield* head(services, binding, repo.root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "Source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)

  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${repo.root}/contents/${GitHubNative.path(binding, path)}`, ref)
    return {
      request: { method: "POST", path: `${repo.root}/git/refs`, body: { ref: `refs/heads/${command.branch}`, sha: ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.ref !== `refs/heads/${command.branch}` || value.object.sha.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitHub did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its blob precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text)
      return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    // Contents create has native absence semantics; update supplies the authoritative blob SHA.
    return {
      request: { method: "PUT", path: `${repo.root}/contents/${GitHubNative.path(binding, path)}`, body: {
        message: command.message, content: Buffer.from(bytes(command.text)).toString("base64"), branch: intent.target.ref ?? "",
        ...(previous ? { sha: previous.version } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, Content, response.data, true))
        if (value.content.path !== path || value.content.sha.toLowerCase() !== blob(command.text, value.content.sha))
          return yield* error(binding, "outcome_unknown", "GitHub did not prove the written path and blob", "unknown")
        return yield* written(services, binding, intent, command.text, value.commit.sha, value.content.sha)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? repo.native.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, repo.root, base)
  return {
    request: { method: "POST", path: `${repo.root}/pulls`, body: { head: intent.target.ref ?? "", base, title: command.title, body: command.text } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Pull, response.data, true)
      if (String(value.head.repo.id) !== binding.projectID || String(value.base.repo.id) !== binding.projectID ||
        value.head.ref !== intent.target.ref || value.head.sha.toLowerCase() !== ref.toLowerCase() || value.base.ref !== base ||
        value.title !== command.title || (value.body ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitHub did not prove the exact same-repository review request", "unknown")
      const id = String(value.number)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.html_url, `/${repo.native.full_name}/pull/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.githubHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.ref !== `refs/heads/${name}`) return yield* error(binding, "source_conflict", "GitHub branch identity differs from admission")
  return value.object.sha
})
~~~~


## A13 — Publicação GitLab em fases

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A13`.


### `packages/core/src/actions/authoring/gitlab.ts`

Archive: `sources/packages/core/src/actions/authoring/gitlab.ts` · bytes: 7205 · Git blob: `2e17c642d355cdb595332f3069a0928ef192ae08` · SHA256: `aba55ae13260350fc70490bbf9930e19cb648babb5f555b23c3c350161e479a9`.

Papel da fonte: Branch/file/MR; create versus update com last_commit_id e confirmação.


Linhas **14–101**; SHA256 do intervalo `16f512f520497065cb002c59a7bfd13ffb2e29a74dec2cc6c960eeb755a6ea45`:

~~~~typescript
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID,
  source_branch: Schema.NonEmptyString, target_branch: Schema.NonEmptyString, sha: ActionsGitLabNative.SHA,
  title: Schema.NonEmptyString, description: Schema.NullOr(Schema.String), state: Schema.Literal("opened"), web_url: Schema.NonEmptyString,
})

export const plan = Effect.fn("ActionsAuthoring.gitlab")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "gitlab") throw error(binding, "invalid_input", "Source command provider differs from the bound project")
    if ("text" in value) bytes(value.text)
    return value
  })
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const project = yield* before(binding, ActionsGitLabNative.make(services.transport).project(binding))
  yield* actor(services, binding)
  if (project.archived === true || project.repository_access_level === "disabled")
    return yield* error(binding, "permission_denied", "GitLab project metadata denies source writes")
  // Missing role/scope evidence remains unknown; native authorization decides this explicit write.
  // This is an explicit repository-file proposal, not a change to the project's CI config slot.
  const ref = yield* head(services, binding, root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "GitLab source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)
  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${root}/repository/files/${encodeURIComponent(path)}`, ref)
    return {
      request: { method: "POST", path: `${root}/repository/branches`, body: { branch: command.branch, ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.name !== command.branch || value.commit.id.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitLab did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its file precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text) return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    const fileVersion = previous ? yield* guard(binding, () => decode(binding, Schema.fromJsonString(Version), previous.version)) : undefined
    return {
      request: { method: command.mode === "create" ? "POST" : "PUT", path: `${root}/repository/files/${encodeURIComponent(path)}`, body: {
        branch: intent.target.ref ?? "", commit_message: command.message, content: command.text,
        ...(fileVersion ? { last_commit_id: fileVersion.last_commit_id } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, File, response.data, true))
        if (value.file_path !== path || value.branch !== intent.target.ref)
          return yield* error(binding, "outcome_unknown", "GitLab did not prove the written file and branch", "unknown")
        return yield* written(services, binding, intent, command.text)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? project.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, root, base)
  return {
    request: { method: "POST", path: `${root}/merge_requests`, body: {
      source_branch: intent.target.ref ?? "", target_branch: base, title: command.title, description: command.text,
    } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Merge, response.data, true)
      if (String(value.project_id) !== binding.projectID || String(value.source_project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID ||
        value.source_branch !== intent.target.ref || value.target_branch !== base || value.sha.toLowerCase() !== ref.toLowerCase() ||
        value.title !== command.title || (value.description ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitLab did not prove the exact same-project review request", "unknown")
      const id = String(value.iid)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.web_url, `/${project.path_with_namespace}/-/merge_requests/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.gitlabHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.name !== name) return yield* error(binding, "source_conflict", "GitLab branch identity differs from admission")
  return value.commit.id
})
~~~~


## A14 — Readback de autoria, lint e editor schedule

Vínculo: `body.md` §2; archive de evidência: `evidence.md`, seção `A14`.


### `packages/core/src/actions/authoring/remote.ts`

Archive: `sources/packages/core/src/actions/authoring/remote.ts` · bytes: 8787 · Git blob: `0ef1c6bbc54e8e4a73bc9e82a7f1b6653161d3d7` · SHA256: `458a706a6415cb1e3d554169149215269f49bcbd5a5fc77f51162840cfcb13d8`.

Papel da fonte: Readback após write, distinção unsent/unknown, identidade da review e ausência qualificada.


Linhas **13–129**; SHA256 do intervalo `09e1b8c2a0af01cc84c230d312c2a705b3b2bf4da2b8535626ecf4eb19e449b5`:

~~~~typescript
  readonly request: ActionsContract.Request
  readonly status: number
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<ActionsContract.CommandResult, ActionsError>
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError
    ? error(binding, cause.kind, cause.message, cause.disposition) : error(binding, "invalid_input", "Source metadata could not be validated") })
}

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((cause) => error(binding, cause.kind, "Source mutation preflight failed")))
}

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  // Once a write was sent, a failed proof is never a definitive rejection or a retry instruction.
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Source mutation outcome was not proved", "unknown")))
}

export const get = Effect.fn("ActionsAuthoring.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) }))
  if (response.status !== 200) {
    const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, failure.kind, "Source preflight read was rejected")
  }
  return response
})

export const actor = Effect.fn("ActionsAuthoring.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "not_authenticated", "Source authoring requires the captured signed-in account")
  const response = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => binding.provider.kind === "github"
    ? native(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : native(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (account.toLowerCase() !== binding.account.toLowerCase())
    return yield* error(binding, "binding_stale", "Source authoring account changed after admission")
})

/** Call only after the exact project, actor and base branch/commit have been proved. */
export const absent = Effect.fn("ActionsAuthoring.absent")(function* (services: Services, binding: Actions.Binding, path: string, commit: string) {
  // Keep the transport's rejection evidence until classification. A generic/partial not_found is not absence.
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, query: { ref: commit } }).pipe(
    Effect.catchIf((cause) => cause.kind === "not_found" && cause.disposition === "definitely_rejected", () => Effect.succeed(undefined)),
  ))
  if (!response || response.status === 404) return
  if (response.status === 200) return yield* error(binding, "source_conflict", "New source file already exists at the admitted base commit")
  const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
  return yield* error(binding, failure.kind, "Source file absence was not proved")
})

export const current = Effect.fn("ActionsAuthoring.current")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "invalid_input", "Source precondition requires a path and branch")
  const value = yield* before(binding, readSource(services, binding, intent.target.path, intent.target.ref))
  return yield* guard(binding, () => source(binding, intent, value))
})

export function blob(text: string, algorithm: string) {
  const value = bytes(text)
  return createHash(algorithm.length === 40 ? "sha1" : "sha256").update(`blob ${value.length}\0`).update(value).digest("hex")
}

export const written = Effect.fn("ActionsAuthoring.written")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, text: string, commit?: string, blobID?: string,
) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "outcome_unknown", "Written source target is missing", "unknown")
  const value = yield* readSource(services, binding, intent.target.path, intent.target.ref)
  return yield* guard(binding, () => {
    const native = version(binding, value.version)
    if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit ||
      value.commit.toLowerCase() === intent.expected?.commit?.toLowerCase() ||
      commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase() || value.text !== text ||
      native.blob_id.toLowerCase() !== blob(text, native.blob_id) || blobID !== undefined && native.blob_id.toLowerCase() !== blobID.toLowerCase() ||
      native.last_commit_id !== undefined && native.last_commit_id.toLowerCase() !== value.commit.toLowerCase())
      throw error(binding, "outcome_unknown", "Provider did not prove the exact written file, branch, blob and new commit", "unknown")
    decode(binding, GitHubNative.SHA, value.commit)
    return { acknowledgement: { resourceID: value.commit } }
  })
})

const readSource = Effect.fn("ActionsAuthoring.readSource")(function* (services: Services, binding: Actions.Binding, path: string, ref: string) {
  if (binding.provider.kind === "github") return yield* services.reader.source(binding, { path, ref })
  // Read the exact local file at the proved branch head. Project CI settings do not select a proposal's path.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  yield* guard(binding, () => branch(binding, ref))
  const response = yield* get(services, binding, `${root}/repository/branches/${encodeURIComponent(ref)}`)
  const head = yield* guard(binding, () => native(binding, Schema.Struct({ name: Schema.NonEmptyString,
    commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) }), response.data))
  if (head.name !== ref) return yield* error(binding, "source_conflict", "GitLab branch identity differs from the admitted source")
  const value = yield* services.reader.source(binding, { path, ref: head.commit.id })
  if (value.bindingID !== binding.id || value.path !== path || value.ref !== head.commit.id || value.commit !== head.commit.id)
    return yield* error(binding, "source_unresolved", "Reader did not prove the exact local file at the observed branch head")
  return { ...value, ref }
})

export function reviewURL(binding: Actions.Binding, url: string, path: string) {
  const parsed = URL.parse(url)
  if (!parsed || parsed.protocol !== "https:" || parsed.host !== binding.provider.hostname || parsed.username || parsed.password ||
    parsed.search || parsed.hash || parsed.pathname !== path)
    throw error(binding, "outcome_unknown", "Review response did not prove its native request URL", "unknown")
  return url
}

export const send = Effect.fn("ActionsAuthoring.send")(function* (services: Services, binding: Actions.Binding, plan: Plan) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, plan.request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Source provider write failed", disposition)
  }))
  if (response.status !== plan.status) {
    if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
      const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
      return yield* error(binding, failure.kind, "Source provider write was rejected", "definitely_rejected")
    }
    return yield* error(binding, "outcome_unknown", "Source write returned an unqualified native status", "unknown")
  }
  return yield* after(binding, plan.acknowledge(response))
})
~~~~


### `packages/core/src/actions/authoring/lint.ts`

Archive: `sources/packages/core/src/actions/authoring/lint.ts` · bytes: 2071 · Git blob: `dca58f1b7cf7eaa4b4afdb25f18bb4ec9234d868` · SHA256: `35372e153a34ae76a23bc8d631ca762c169994db3a1d452c4e4ceb8f2920d5cc`.

Papel da fonte: Lint sem dry-run/jobs não amplia topologia.


Linhas **1–30**; SHA256 do intervalo `35372e153a34ae76a23bc8d631ca762c169994db3a1d452c4e4ceb8f2920d5cc`:

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsGitLabNative } from "../gitlab/native"
import type { ActionsError } from "../error"
import { diagnostics } from "../source/document"
import type { Services } from "./input"
import { guard } from "./remote"

const Lint = Schema.Struct({ valid: Schema.Boolean, errors: Schema.Array(Schema.String), warnings: Schema.Array(Schema.String) })

export const lint = Effect.fn("ActionsAuthoring.gitlabLint")(function* (
  services: Services, binding: Actions.Binding, source: Actions.Source, graph: Actions.Graph,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  // CI lint is an explicit user-requested computation, not a durable mutation or a dry-run pipeline.
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const result = yield* services.transport.request(binding, {
    method: "POST", path: `${root}/ci/lint`,
    body: { content: source.text, include_jobs: false, dry_run: false },
  }).pipe(Effect.map((response) => response.status === 200 ? Schema.decodeUnknownOption(Lint)(response.data) : Option.none()),
    Effect.catch(() => Effect.succeed(Option.none())))
  const report = diagnostics()
  report.items.push(...graph.diagnostics)
  if (Option.isNone(result)) report.add("partial", "gitlab_lint_unavailable:provider validation was not established", true)
  if (Option.isSome(result) && (!result.value.valid || result.value.errors.length > 0))
    report.add("unresolved", "gitlab_lint_invalid:provider rejected this source", true)
  if (Option.isSome(result) && result.value.warnings.length > 0) report.add("partial", "gitlab_lint_warning:provider returned validation warnings", true)
  // Native lint never upgrades local includes/rules/matrices into claimed execution topology.
  return { ...graph, state: graph.state === "unresolved" || report.state() === "unresolved" ? "unresolved"
    : graph.state === "partial" || report.state() === "partial" ? "partial" : "complete", diagnostics: report.items }
})
~~~~


### `packages/core/src/actions/authoring/schedule.ts`

Archive: `sources/packages/core/src/actions/authoring/schedule.ts` · bytes: 4994 · Git blob: `189f4f3903314afb6b6d8c86b50dbbccb0309869` · SHA256: `2151bb5ece4c4d2a635ede984a8668620e8f619000e720af35370b0f87bc561b`.

Papel da fonte: Edição localizada de on.schedule com recusas para estrutura ambígua.


Linhas **11–77**; SHA256 do intervalo `83d6fa83209158b40c0a29b1b533af4b1b2c955eed0f51d628942653ebed8fee`:

~~~~typescript
  if (!checked || report.state() === "unresolved") throw invalid("Schedule source failed bounded YAML preflight")
  if (cronEntries.length > 1000 || cronEntries.some((cron) => typeof cron !== "string" || !cron || cron.length > 256 ||
    !cron.isWellFormed() || /[\r\n\x00]/.test(cron))) throw invalid("Schedule entries require bounded, nonempty native cron strings")
  const document = parseDocument(sourceText, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: false, logLevel: "error",
  })
  if (document.errors.length || !isMap(document.contents)) throw invalid("Schedule source requires one YAML mapping")
  const original = document.get("on", true)
  if (isAlias(original)) throw invalid("Aliased workflow triggers require an explicit source edit")
  if ((isMap(original) || isSeq(original) || isScalar(original)) && original.anchor)
    throw invalid("Anchored workflow triggers require an explicit source edit")
  const events = isMap(original) ? original : document.createNode({})
  if (!isMap(events)) throw invalid("Workflow triggers could not be represented as a native mapping")
  if (!isMap(original) && original !== undefined) {
    const names = isScalar(original) && typeof original.value === "string" ? [original.value]
      : isSeq(original) && original.items.every((item) => isScalar(item) && typeof item.value === "string")
        ? original.items.map((item) => isScalar(item) ? String(item.value) : "") : undefined
    if (!names || new Set(names).size !== names.length || names.some((name) => !name || name === "schedule"))
      throw invalid("Workflow triggers require literal unique native events")
    // Build once rather than repeatedly calling YAMLMap.set's linear key lookup.
    events.items = names.map((name) => new Pair(document.createNode(name), document.createNode(null)))
    if (isScalar(original) || isSeq(original)) {
      events.commentBefore = original.commentBefore
      events.comment = original.comment
    }
  }
  if (events.has("<<")) throw invalid("Merged workflow triggers require an explicit source edit")
  const existing = events.get("schedule", true)
  if (existing !== undefined && (!isSeq(existing) || existing.anchor || existing.items.some((item) => !isMap(item) || item.anchor ||
    !isScalar(item.get("cron", true)) || typeof item.get("cron") !== "string" || item.has("<<"))))
    throw invalid("Schedule entries require literal cron mappings; aliases and merges stay source-owned")
  if (isSeq(existing) && existing.items.length === cronEntries.length &&
    existing.items.every((item, index) => isMap(item) && item.get("cron") === cronEntries[index])) return sourceText
  if (existing === undefined && cronEntries.length === 0) return sourceText
  if (cronEntries.length === 0) {
    // Keep comments attached to the removed schedule field as event-map trailing comments.
    if (isSeq(existing)) events.comment = [events.comment, existing.commentBefore, existing.comment].filter(Boolean).join("\n") || undefined
    events.delete("schedule")
  }
  if (cronEntries.length > 0) {
    const schedule = isSeq(existing) ? existing : document.createNode([])
    if (!isSeq(schedule)) throw invalid("Schedule entries could not be represented as a native sequence")
    schedule.items = cronEntries.map((cron, index) => {
      const previous = schedule.items[index]
      if (!isMap(previous)) return document.createNode({ cron })
      const scalar = previous.get("cron", true)
      if (!isScalar(scalar) || scalar.anchor) throw invalid("Schedule cron must remain an unanchored scalar")
      // Mutate only the scalar value: entry comments, quote style and unknown keys remain owned by YAML.
      scalar.value = cron
      return previous
    })
    events.set("schedule", schedule)
  }
  if (!isMap(original)) document.set("on", events)
  const encoded = document.toString({ lineWidth: 0 })
  const result = (sourceText.startsWith("\uFEFF") && !encoded.startsWith("\uFEFF") ? "\uFEFF" : "") +
    (sourceText.includes("\r\n") ? encoded.replace(/\r?\n/g, "\r\n") : encoded)
  bytes(result)
  const output = diagnostics()
  if (!read(result, "github", output) || output.state() === "unresolved") throw invalid("Schedule edit failed bounded YAML output validation")
  return result
}

function invalid(message: string) {
  return new ActionsError({ kind: "source_unresolved", message, provider: "github", disposition: "definitely_unsent" })
}
~~~~


## A15 — Admissão durável da intenção

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A15`.


### `packages/core/src/actions/operations.ts`

Archive: `sources/packages/core/src/actions/operations.ts` · bytes: 12124 · Git blob: `83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` · SHA256: `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`.

Papel da fonte: Prepara intenção sob identidade da Location e dedupe client ID; payload de execute separado.


Linhas **16–45**; SHA256 do intervalo `2e4e2a525f9d66cd07bd6465e837e8aafbed08dbcf92e84e0ef695b9e1f76d50`:

~~~~typescript
export const make = Effect.fn("ActionsOperations.make")(function* (locationInput: {
  readonly directory: string
  readonly workspaceID?: string
  readonly projectID: string
}) {
  const input = { ...locationInput }
  const database = yield* Database.Service
  if (!path.isAbsolute(input.directory) || !input.projectID)
    return yield* Effect.fail(error("invalid_input", "Actions operations require a trusted absolute Location and project"))
  const directory = yield* Effect.tryPromise({
    try: () => realpath(input.directory),
    catch: () => error("invalid_input", "Actions operation Location is unavailable"),
  })
  const location = JSON.stringify([input.projectID, directory, input.workspaceID ?? null])
  yield* recover(database.db)
  const disposed = yield* Deferred.make<void>()
  const lifetime = { closed: false, requests: new Set<Fiber.Fiber<unknown, unknown>>() }
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    lifetime.closed = true
    const requests = Array.from(lifetime.requests)
    yield* Deferred.succeed(disposed, undefined)
    yield* Fiber.awaitAll(requests)
  }).pipe(Effect.uninterruptible))

  const validate = (binding: Actions.Binding) => {
    if (lifetime.closed) return error("binding_missing", "Actions operation Location was disposed")
    if (binding.directory !== directory || binding.workspaceID !== input.workspaceID)
      return error("host_mismatch", "Actions binding does not belong to this Location")
    if (!binding.account?.trim()) return error("not_authenticated", "Actions operations require a signed-in provider account")
  }
~~~~


Linhas **60–121**; SHA256 do intervalo `b4040a238d40fe38f5b7965803db7c3de67f65c5a099420342b97fb8c57b2f29`:

~~~~typescript
  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
      const inserted = yield* tx.insert(ActionsOperationTable).values({
        id: Actions.OperationID.create(),
        location_key: location,
        project_id: input.projectID,
        directory,
        workspace_id: input.workspaceID,
        binding_id: binding.id,
        binding_revision: binding.revision,
        provider_kind: binding.provider.kind,
        provider_hostname: binding.provider.hostname,
        provider_api_origin: binding.provider.apiOrigin,
        provider_project_id: binding.projectID,
        actor: binding.account ?? "",
        client_id: decoded.clientID,
        kind: decoded.kind,
        target: decoded.target,
        expected: decoded.expected,
        state: "prepared",
        time_created: now,
        time_expires: now + LEASE,
        time_updated: now,
      }).returning().get()
      if (!inserted) return yield* Effect.fail(error("maintenance_required", "Actions operation admission could not be stored"))
      return receipt(inserted)
    }), { behavior: "immediate" }))
~~~~


### `packages/core/src/actions/operations/sql.ts`

Archive: `sources/packages/core/src/actions/operations/sql.ts` · bytes: 1580 · Git blob: `63cad8cb4926acd4adc6c285bd6b1f1f64a238cc` · SHA256: `07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75`.

Papel da fonte: Schema persistido e chave única; não armazena execute input.


Linhas **1–35**; SHA256 do intervalo `07f2de775a5e5352859f1bf041e32865b3681ec2db85fd4e367823fe2a00da75`:

~~~~typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Actions } from "@orchestra/schema/actions"

export const ActionsOperationTable = sqliteTable(
  "actions_operation",
  {
    id: text().$type<Actions.OperationID>().primaryKey(),
    location_key: text().notNull(),
    project_id: text().notNull(),
    directory: text().notNull(),
    workspace_id: text(),
    binding_id: text().$type<Actions.BindingID>().notNull(),
    binding_revision: integer().notNull(),
    provider_kind: text().$type<Actions.ProviderKind>().notNull(),
    provider_hostname: text().notNull(),
    provider_api_origin: text().notNull(),
    provider_project_id: text().notNull(),
    actor: text().notNull(),
    client_id: text().notNull(),
    kind: text().$type<Actions.OperationKind>().notNull(),
    target: text({ mode: "json" }).$type<Actions.OperationTarget>().notNull(),
    expected: text({ mode: "json" }).$type<Actions.OperationExpected>(),
    state: text().$type<Actions.Operation["state"]>().notNull(),
    time_created: integer().notNull(),
    time_expires: integer().notNull(),
    time_updated: integer().notNull(),
    result: text({ mode: "json" }).$type<Actions.Operation["result"]>(),
    reason: text(),
  },
  (table) => [
    uniqueIndex("actions_operation_location_binding_client_idx").on(table.location_key, table.binding_id, table.client_id),
    index("actions_operation_state_expires_idx").on(table.state, table.time_expires),
    index("actions_operation_state_updated_idx").on(table.state, table.time_updated),
  ],
)
~~~~


## A16 — CAS, limite de execução e recuperação sem replay

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A16`.


### `packages/core/src/actions/operations.ts`

Archive: `sources/packages/core/src/actions/operations.ts` · bytes: 12124 · Git blob: `83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` · SHA256: `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`.

Papel da fonte: Claim prepared→sending, fiber antes de CAS e único perform fora da transação.


Linhas **124–169**; SHA256 do intervalo `822fe3dba0acb33ebb31b4c0cd260cc9997222c4c66c271e69aabacc81aa4039`:

~~~~typescript
  const execute: ActionsContract.Operations["execute"] = Effect.fn("ActionsOperations.execute")((bindingInput, submission, perform) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, submission.id)
      const denied = access(row, location, binding, submission.id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", submission.id))
      const now = yield* Clock.currentTimeMillis
      const expired = unavailable(row, now)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "prepared") return receipt(row)

      // Register before the durable claim so disposal cannot race the CAS/cleanup
      // handoff. This fiber remains the caller's request, never a shared worker.
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
        const claimed = yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
          if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
          // Sample time after acquiring SQLite's write reservation, not before
          // waiting for it. A lease may expire while the request waits to claim.
          const claimTime = yield* Clock.currentTimeMillis
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
        return yield* get(binding, row.id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )
~~~~


### `packages/core/src/actions/operations/storage.ts`

Archive: `sources/packages/core/src/actions/operations/storage.ts` · bytes: 7588 · Git blob: `d7633da87c8fe5b41319e23c6ca9e9092d152e4e` · SHA256: `433462cdc96bbeda49a85f46e9c96954cee753822165329caac5c26c748ff2b4`.

Papel da fonte: Leases/retenção/limites, recuperação lifetime e finalização do ledger.


Linhas **10–142**; SHA256 do intervalo `87f15ea2317e514795af4453e7df10ce271d981c8fa47a88e318a790ffbaa2ce`:

~~~~typescript
export type Row = typeof ActionsOperationTable.$inferSelect
export const LEASE = 24 * 60 * 60 * 1000
export const RETENTION = 30 * LEASE
export const UNKNOWN_LIMIT = 10_000
export const LEDGER_LIMIT = 100_000
export const DEADLINE = "30 seconds"
export const RECEIPT_EXPIRED = "Actions operation receipt retention elapsed"
export const LEASE_EXPIRED = "Actions operation lease expired"

export function error(kind: Actions.ErrorKind, message: string, operationID?: Actions.OperationID) {
  return new ActionsError({ kind, message, operationID })
}

export function safe<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError((cause) =>
      cause instanceof ActionsError ? cause : error("maintenance_required", "Actions operation storage is unavailable"),
    ),
    Effect.catchDefect(() => Effect.fail(error("maintenance_required", "Actions operation storage is unavailable"))),
  )
}

export function receipt(row: Row): Actions.Operation {
  return {
    id: row.id,
    bindingID: row.binding_id,
    clientID: row.client_id,
    kind: row.kind,
    state: row.state,
    target: row.target,
    createdAt: row.time_created,
    expiresAt: row.time_expires,
    updatedAt: row.time_updated,
    ...(row.result == null ? {} : { result: row.result }),
    ...(row.reason === null ? {} : { reason: row.reason }),
  }
}

export function intent(row: Row): Actions.OperationIntent {
  return {
    clientID: row.client_id,
    binding: { id: row.binding_id, revision: row.binding_revision },
    kind: row.kind,
    target: row.target,
    ...(row.expected === null ? {} : { expected: row.expected }),
  }
}

export const equivalent = Schema.toEquivalence(Actions.OperationIntent)

export function matches(row: Row, binding: Actions.Binding) {
  return row.binding_revision === binding.revision && row.actor === binding.account &&
    row.provider_kind === binding.provider.kind && row.provider_hostname === binding.provider.hostname &&
    row.provider_api_origin === binding.provider.apiOrigin && row.provider_project_id === binding.projectID
}

export function access(row: Row | undefined, location: string, binding: Actions.Binding, id: Actions.OperationID) {
  if (!row || row.location_key !== location || row.binding_id !== binding.id)
    return error("operation_missing", "Actions operation does not exist in this binding and Location", id)
  if (row.actor !== binding.account) return error("not_authenticated", "Actions operation belongs to another account", id)
  if (row.binding_revision !== binding.revision) return error("binding_stale", "Actions operation binding revision changed", id)
  if (!matches(row, binding)) return error("host_mismatch", "Actions operation provider identity changed", id)
}

export function unavailable(row: Row, now: number) {
  if (row.state === "expired" && row.reason === RECEIPT_EXPIRED)
    return error("operation_missing", RECEIPT_EXPIRED, row.id)
  if (row.state === "expired" || (row.state === "prepared" && row.time_expires <= now))
    return error("operation_expired", "Actions operation lease expired", row.id)
  if (["accepted", "confirmed", "rejected"].includes(row.state) && row.time_updated <= now - RETENTION)
    return error("operation_missing", "Actions operation receipt retention elapsed", row.id)
}

export const find = (db: Pick<DB, "select">, id: Actions.OperationID) =>
  safe(db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, id)).get())

export const sweep = (db: Pick<DB, "update">, now: number) =>
  Effect.gen(function* () {
    yield* db.update(ActionsOperationTable).set({ state: "expired", time_updated: now, result: null, reason: LEASE_EXPIRED }).where(
      and(eq(ActionsOperationTable.state, "prepared"), lte(ActionsOperationTable.time_expires, now)),
    ).run()
    // Keep the admission key and intent forever. Deleting a receipt would allow
    // a delayed prepare with the same logical intent to issue another command.
    yield* db.update(ActionsOperationTable).set({ state: "expired", result: null, reason: RECEIPT_EXPIRED }).where(and(
      inArray(ActionsOperationTable.state, ["accepted", "confirmed", "rejected"]),
      lte(ActionsOperationTable.time_updated, now - RETENTION),
    )).run()
  })

// Database identity outlives Location services. Rebuilding a Location must never
// recover another live request's sending row as though the process restarted.
const recovery = new WeakMap<DB, { readonly lock: Semaphore.Semaphore; done: boolean }>()

export const recover = (db: DB) => Effect.suspend(() => {
  const shared = recovery.get(db) ?? { lock: Semaphore.makeUnsafe(1), done: false }
  recovery.set(db, shared)
  return shared.lock.withPermit(Effect.gen(function* () {
    if (shared.done) return
    yield* safe(db.update(ActionsOperationTable).set({
      state: "outcome_unknown",
      time_updated: yield* Clock.currentTimeMillis,
      reason: "Provider outcome was not established before database restart",
    }).where(eq(ActionsOperationTable.state, "sending")).run())
    shared.done = true
  })).pipe(Effect.uninterruptible)
})

export const finalize = (db: DB, id: Actions.OperationID, exit: Exit.Exit<Actions.OperationAcknowledgement, ActionsError>) => Effect.gen(function* () {
  const rejected = Exit.isFailure(exit) ? definitive(exit.cause) : undefined
  const row = yield* safe(db.update(ActionsOperationTable).set({
    state: Exit.isSuccess(exit) ? "accepted" : rejected ? "rejected" : "outcome_unknown",
    result: Exit.isSuccess(exit) ? exit.value : null,
    time_updated: yield* Clock.currentTimeMillis,
    reason: Exit.isSuccess(exit) ? null : rejected?.disposition === "definitely_unsent"
      ? "Provider command was definitely not sent"
      : rejected ? "Provider command was definitively rejected" : "Provider outcome was not established",
  }).where(and(eq(ActionsOperationTable.id, id), eq(ActionsOperationTable.state, "sending"))).returning().get())
  if (!row) return yield* Effect.fail(error("maintenance_required", "Actions operation receipt could not be finalized", id))
})

export function identity(row: Row) {
  return and(
    eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, row.location_key),
    eq(ActionsOperationTable.project_id, row.project_id), eq(ActionsOperationTable.directory, row.directory),
    row.workspace_id === null ? isNull(ActionsOperationTable.workspace_id) : eq(ActionsOperationTable.workspace_id, row.workspace_id),
    eq(ActionsOperationTable.binding_id, row.binding_id), eq(ActionsOperationTable.binding_revision, row.binding_revision),
    eq(ActionsOperationTable.provider_kind, row.provider_kind), eq(ActionsOperationTable.provider_hostname, row.provider_hostname),
    eq(ActionsOperationTable.provider_api_origin, row.provider_api_origin), eq(ActionsOperationTable.provider_project_id, row.provider_project_id),
    eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.client_id, row.client_id),
    eq(ActionsOperationTable.kind, row.kind), eq(ActionsOperationTable.target, row.target),
    row.expected === null ? isNull(ActionsOperationTable.expected) : eq(ActionsOperationTable.expected, row.expected),
  )
}
~~~~


### `packages/core/src/actions/operations/outcome.ts`

Archive: `sources/packages/core/src/actions/operations/outcome.ts` · bytes: 2037 · Git blob: `6ad54f11c415134b4eb590194e2079f09ef01aed` · SHA256: `3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c`.

Papel da fonte: Ack estrito, erro definitivo tipado e identidade de observação imutável.


Linhas **1–40**; SHA256 do intervalo `3d89a3a86b0d51b2c153088397c952599dc8b75b5469a5a27a8efc7395ece20c`:

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { Cause, Effect, Option, Schema } from "effect"
import { ActionsError } from "../error"

export const decodeAcknowledgement = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationAcknowledgement), {
  onExcessProperty: "error",
})

export const decodeObservation = Schema.decodeUnknownEffect(Schema.toType(Actions.OperationObservation), {
  onExcessProperty: "error",
})

export function definitive(cause: Cause.Cause<unknown>) {
  if (Cause.hasInterrupts(cause)) return
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure) || !(failure.value instanceof ActionsError)) return
  if (failure.value.disposition === "definitely_unsent" || failure.value.disposition === "definitely_rejected")
    return failure.value
}

export function combine(original?: Actions.OperationAcknowledgement, observed?: Actions.OperationAcknowledgement) {
  if ((["runID", "jobID", "resourceID", "attempt"] as const).some((field) => {
    return original?.[field] !== undefined && observed?.[field] !== undefined && original[field] !== observed[field]
  })) return new ActionsError({ kind: "intent_conflict", message: "Actions observation changed acknowledged native identity" })
  if (!original && !observed) return
  return { ...original, ...Schema.encodeSync(Actions.OperationAcknowledgement)(observed ?? {}) }
}

export function attributed(acknowledgement?: Actions.OperationAcknowledgement) {
  return acknowledgement?.unattributed !== true &&
    !!(acknowledgement?.runID || acknowledgement?.jobID || acknowledgement?.resourceID)
}

export const checkedAcknowledgement = (input: unknown) => decodeAcknowledgement(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "outcome_unknown", message: "Actions provider acknowledgement is invalid" })),
)

export const checkedObservation = (input: unknown) => decodeObservation(input).pipe(
  Effect.mapError(() => new ActionsError({ kind: "invalid_input", message: "Actions operation observation is invalid" })),
)
~~~~


## A17 — Reconciliação exata e seus limites

Vínculo: `body.md` §3; archive de evidência: `evidence.md`, seção `A17`.


### `packages/core/src/actions/operations.ts`

Archive: `sources/packages/core/src/actions/operations.ts` · bytes: 12124 · Git blob: `83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` · SHA256: `f4180bfeabef99c0eaddace3f1da7242fb8dacd7d63fb948b84cc014f59a89d4`.

Papel da fonte: Só accepted/unknown observáveis; observe não executa mutação.


Linhas **171–204**; SHA256 do intervalo `81b2f8b45cea40ca3040b704915808559db0a304662fb2efe0029c4b167d4f9a`:

~~~~typescript
  const reconcile: ActionsContract.Operations["reconcile"] = Effect.fn("ActionsOperations.reconcile")((bindingInput, id, observe) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, id)
      const denied = access(row, location, binding, id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
      const expired = unavailable(row, yield* Clock.currentTimeMillis)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "accepted" && row.state !== "outcome_unknown") return receipt(row)
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        const observation = yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : observe(
          structuredClone(intent(row)), row.result == null ? undefined : structuredClone(row.result),
        )).pipe(
          Effect.flatMap(checkedObservation), Effect.scoped, Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.interrupt
            const failure = Cause.findErrorOption(cause)
            return Effect.fail(Option.isSome(failure) && failure.value instanceof ActionsError
              ? failure.value : error("transport_failed", "Actions operation observation failed", id))
          }),
        ))
        const observed = yield* update(database.db, row, observation)
        return observed ? receipt(observed) : yield* get(binding, id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  return { prepare, execute, get, reconcile } satisfies ActionsContract.Operations
})
~~~~


### `packages/core/src/actions/operations/readback.ts`

Archive: `sources/packages/core/src/actions/operations/readback.ts` · bytes: 1667 · Git blob: `16146919f0a4fb7101a72bee160cdcdc642ad90f` · SHA256: `80de0b27f0b95536f35fd87186241ef51bd9a66a9e47a19cca1df104010f86a8`.

Papel da fonte: Promotion CAS só com atribuição suficiente; pending preserva recibo.


Linhas **1–27**; SHA256 do intervalo `80de0b27f0b95536f35fd87186241ef51bd9a66a9e47a19cca1df104010f86a8`:

~~~~typescript
import { Actions } from "@orchestra/schema/actions"
import { and, eq, isNull } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { ActionsError } from "../error"
import { attributed, combine } from "./outcome"
import { ActionsOperationTable } from "./sql"
import { identity, safe, unavailable, type DB, type Row } from "./storage"

export const update = (db: DB, row: Row, observation: Actions.OperationObservation) => db.transaction((tx) => Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const expired = unavailable(row, now)
  if (expired) return yield* Effect.fail(expired)
  const acknowledgement = combine(row.result ?? undefined, observation.acknowledgement)
  if (acknowledgement instanceof ActionsError) return yield* Effect.fail(acknowledgement)
  // The adapter proves the exact native identity. Empty/unattributed replies
  // cannot confirm anything, and polling never changes unknown into accepted.
  const state = observation.state === "pending" || !attributed(acknowledgement) ? row.state : observation.state
  return yield* tx.update(ActionsOperationTable).set({
    state,
    result: acknowledgement ?? null,
    time_updated: state === row.state ? row.time_updated : now,
    reason: state === "rejected" ? "Provider command rejection was confirmed" : state === "confirmed" ? null : row.reason,
  }).where(and(
    identity(row), eq(ActionsOperationTable.state, row.state), eq(ActionsOperationTable.time_updated, row.time_updated),
    row.result == null ? isNull(ActionsOperationTable.result) : eq(ActionsOperationTable.result, row.result),
  )).returning().get()
}), { behavior: "immediate" }).pipe(safe)
~~~~


### `packages/core/src/actions/readback.ts`

Archive: `sources/packages/core/src/actions/readback.ts` · bytes: 2118 · Git blob: `26e01af0e8dad921d4f7a408e2642a851da3903d` · SHA256: `891d45078014fc821bba1a9ea69e68b4a822545e79cf1e5ee5f9f0bcc86acac2`.

Papel da fonte: Dispatch sem runID não é adivinhado; retry exige tentativa; cancel exige estado observado.


Linhas **1–35**; SHA256 do intervalo `891d45078014fc821bba1a9ea69e68b4a822545e79cf1e5ee5f9f0bcc86acac2`:

~~~~typescript
export * as ActionsReadback from "./readback"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "./contract"
import type { ActionsError } from "./error"

export const observe = Effect.fn("ActionsReadback.observe")(function* (
  reader: ActionsContract.ReadAdapter,
  binding: Actions.Binding,
  intent: Actions.OperationIntent,
  acknowledged?: Actions.OperationAcknowledgement,
): Effect.fn.Return<Actions.OperationObservation, ActionsError> {
  // Unattributed dispatch cannot be recovered by guessing a nearby run.
  if (acknowledged?.unattributed || !acknowledged?.runID) return { state: "pending" }
  const run = yield* reader.run(binding, acknowledged.runID)
  if (intent.expected?.commit && run.commit !== intent.expected.commit) return { state: "pending" }
  if (intent.target.runID && run.id !== intent.target.runID) return { state: "pending" }
  if (intent.kind === "workflow.dispatch") {
    if (intent.target.workflowID && run.workflowID !== intent.target.workflowID) return { state: "pending" }
    if (intent.target.ref && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.ref !== intent.target.ref.replace(/^refs\/heads\//, "")) return { state: "pending" }
    if (intent.target.ref && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(intent.target.ref) &&
      run.commit.toLowerCase() !== intent.target.ref.toLowerCase()) return { state: "pending" }
    if (run.event !== "workflow_dispatch" && binding.provider.kind === "github") return { state: "pending" }
    return { state: "confirmed", acknowledgement: acknowledged }
  }
  if ((intent.kind === "run.retry" || intent.kind === "run.retryFailed") && acknowledged.attempt !== undefined &&
    run.attempt !== undefined && run.attempt >= acknowledged.attempt)
    return { state: "confirmed", acknowledgement: acknowledged }
  if ((intent.kind === "run.cancel" || intent.kind === "run.forceCancel") &&
    (run.conclusion === "cancelled" || run.status === "canceled"))
    return { state: "confirmed", acknowledgement: acknowledged }
  return { state: "pending" }
})
~~~~


## A18 — Dispatch GitHub, autoridade e inputs

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A18`.


### `packages/core/src/actions/github/commands.ts`

Archive: `sources/packages/core/src/actions/github/commands.ts` · bytes: 3076 · Git blob: `c4fcb4746c7bbefa8603afe01913816606181922` · SHA256: `02e462e14767c1d1b3a6e2294fb1d14c668d50e9f515eaec76b20cad1401e67b`.

Papel da fonte: Decodifica kind/payload e escolhe comando concreto.


Linhas **10–38**; SHA256 do intervalo `52358cb85d175ea9679d9e3e0004a8685283dd4826a665b541d095d9a562bfe3`:

~~~~typescript

export function make(services: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  return { perform: Effect.fn("ActionsGitHubCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const frozen = yield* GitHubCommandCommon.capture(binding, intent, payload)
    if (frozen.intent.kind === "workflow.dispatch") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubDispatch, frozen.payload))
      return yield* GitHubWorkflowCommands.dispatch(services, frozen.binding, frozen.intent, input)
    }
    if (frozen.intent.kind === "workflow.enable" || frozen.intent.kind === "workflow.disable") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.WorkflowStateCommand.fields.input, frozen.payload))
      if (input.enabled !== (frozen.intent.kind === "workflow.enable"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Workflow state payload conflicts with the admitted operation")
      return yield* GitHubWorkflowCommands.state(services, frozen.binding, frozen.intent, input.enabled)
    }
    if (frozen.intent.kind === "run.retry" || frozen.intent.kind === "run.retryFailed") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.RetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github" || input.mode !== (frozen.intent.kind === "run.retry" ? "all" : "failed"))
        return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Retry mode or provider conflicts with the admitted operation")
      return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    if (frozen.intent.kind === "job.retry") {
      const input = yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.JobRetryCommand.fields.input, frozen.payload))
      if (input.provider !== "github") return yield* GitHubCommandCommon.fail(frozen.binding, "invalid_input", "Job retry belongs to another provider")
      return yield* GitHubJobCommands.retry(services, frozen.binding, frozen.intent, input.enableDebugLogging)
    }
    yield* GitHubCommandCommon.guard(frozen.binding, () => GitHubCommandCommon.input(frozen.binding, Actions.GitHubCommand.fields.input, frozen.payload))
    return yield* GitHubRunCommands.perform(services, frozen.binding, frozen.intent)
  }) }
}
~~~~


### `packages/core/src/actions/github/commands/common.ts`

Archive: `sources/packages/core/src/actions/github/commands/common.ts` · bytes: 13052 · Git blob: `e9ee98a334dd701d076a29900dc47ccdba7a3f01` · SHA256: `b1a6b5b2081d754e5b57f93fadaf56153ca38d133450a05e3c7145bcbf21cfa7`.

Papel da fonte: Snapshot, permissões negativas, source/run esperados e ator revalidado antes do envio.


Linhas **21–166**; SHA256 do intervalo `58da22e6ecfbd69cd58470593c2624181755370c0e6521bb2b5703db73a44014`:

~~~~typescript
}

export function input<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, value: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(value, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) throw fail(binding, "invalid_input", "GitHub command payload does not match its frozen native schema")
  return decoded.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A, kind: Actions.ErrorKind = "invalid_input") {
  return Effect.try({ try: fn, catch: (error) => error instanceof ActionsError ? error : fail(binding, kind, "GitHub command metadata could not be validated") })
}

export const capture = Effect.fn("ActionsGitHubCommands.capture")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  return yield* guard(binding, () => {
    input(binding, Capture, { binding, intent, payload })
    // Clone all admission and execute data before the first remote await. No payload hash or log.
    const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
    if (frozen.binding.provider.kind !== "github" || !supported.has(frozen.intent.kind))
      throw fail(binding, "invalid_input", "Command does not belong to the GitHub execution dispatcher")
    if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
      throw fail(binding, "binding_stale", "Command admission does not match the current binding revision")
    const target = frozen.intent.target
    const workflow = frozen.intent.kind.startsWith("workflow.")
    const job = frozen.intent.kind === "job.retry"
    const allowed = new Set(workflow ? ["workflowID", "path", "ref"] : job ? ["jobID", "runID", "workflowID", "path", "ref"] : ["runID", "workflowID", "path", "ref"])
    if (Object.keys(target).some((key) => !allowed.has(key)))
      throw fail(binding, "invalid_input", "Command target contains fields belonging to another native operation")
    const id = workflow ? target.workflowID : job ? target.jobID : target.runID
    if (id === undefined) throw fail(binding, "invalid_input", "Command requires its admitted native target ID")
    GitHubNative.id(binding, id)
    if (target.runID !== undefined) GitHubNative.id(binding, target.runID)
    if (target.workflowID !== undefined) GitHubNative.id(binding, target.workflowID)
    if (target.ref !== undefined) GitHubNative.ref(binding, target.ref)
    if (target.path !== undefined) GitHubNative.path(binding, target.path)
    if (workflow && frozen.intent.expected?.attempt !== undefined)
      throw fail(binding, "invalid_input", "Workflow commands do not have a native run-attempt precondition")
    if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
    if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
    return frozen
  })
})

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((error) => fail(binding, error.kind, `GitHub command preflight failed (${error.kind})`)))
}

export const get = Effect.fn("ActionsGitHubCommands.get")(function* (services: Services, binding: Actions.Binding, path: string) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path }))
  if (response.status !== 200) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command preflight request was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsGitHubCommands.authority")(function* (services: Services, binding: Actions.Binding) {
  const root = yield* guard(binding, () => `repositories/${GitHubNative.id(binding, binding.projectID)}`)
  const response = yield* get(services, binding, root)
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Repository, response.data, "repository"), "transport_failed")
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native repository does not match command admission")
  yield* actor(services, binding)
  if (native.permissions?.push === false || native.archived === true)
    return yield* fail(binding, "permission_denied", "Native repository metadata denies command writes")
  const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
    return yield* fail(binding, "permission_denied", "Observed classic OAuth scopes deny repository writes")
  // Missing scope/role evidence stays unknown. Native authorization decides this
  // explicit command; no available write capability or fine-grained role is invented.
  return { root, native, headers: response.headers }
})

const actor = Effect.fn("ActionsGitHubCommands.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "GitHub binding has no verified actor account")
  const user = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => GitHubNative.decode(binding, Account, user.data, "signed-in account"), "not_authenticated")
  if (account.login.toLowerCase() !== binding.account.toLowerCase())
    return yield* fail(binding, "binding_stale", "GitHub signed-in account changed after command admission")
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response) {
  if (expected?.resourceVersion === undefined) return
  if (!response.headers.etag) throw fail(binding, "capability_unavailable", "Native resource version was not observed")
  if (response.headers.etag !== expected.resourceVersion) throw fail(binding, "source_conflict", "Native resource version changed after admission")
}

export function source(binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Source, path: string, ref: string, commit?: string) {
  if (value.bindingID !== binding.id || value.path !== path || value.ref !== ref || value.commit === undefined)
    throw fail(binding, "source_unresolved", "Reader did not prove the admitted native source identity")
  input(binding, GitHubNative.SHA, value.commit)
  input(binding, GitHubNative.SHA, value.version)
  if ((commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase()) ||
      (intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase()))
    throw fail(binding, "source_conflict", "Native source changed after command admission")
}

export const run = Effect.fn("ActionsGitHubCommands.runPreflight")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, id: string) {
  const value = yield* before(binding, services.reader.run(binding, id))
  if (value.id !== id || value.bindingID !== binding.id || value.repositoryID !== binding.projectID)
    return yield* fail(binding, "binding_stale", "Reader did not prove the admitted native run ownership")
  yield* guard(binding, () => input(binding, GitHubNative.SHA, value.commit))
  if (value.attempt === undefined || !Number.isSafeInteger(value.attempt) || value.attempt < 1)
    return yield* fail(binding, "capability_unavailable", "Native run attempt was not proved")
  if ((intent.expected?.commit !== undefined && value.commit.toLowerCase() !== intent.expected.commit.toLowerCase()) ||
      (intent.expected?.attempt !== undefined && value.attempt !== intent.expected.attempt) ||
      (intent.target.ref !== undefined && value.ref !== intent.target.ref) ||
      (intent.target.workflowID !== undefined && value.workflowID !== intent.target.workflowID))
    return yield* fail(binding, "source_conflict", "Native run source or attempt changed after admission")
  return value
})

export const historical = Effect.fn("ActionsGitHubCommands.historicalSource")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, value: Actions.Run, response?: ActionsContract.Response) {
  if (intent.expected?.sourceVersion === undefined && intent.target.path === undefined && (intent.kind === "job.retry" || intent.expected?.resourceVersion === undefined)) return
  const metadata = response ?? (yield* get(services, binding, `repositories/${binding.projectID}/actions/runs/${value.id}`))
  yield* guard(binding, () => {
    const native = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, head_sha: GitHubNative.SHA,
      run_attempt: GitHubNative.Positive, path: Schema.NonEmptyString, repository: Schema.Struct({ id: GitHubNative.ID }),
      status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)), event: Schema.String }), metadata.data, "run source")
    if (String(native.id) !== value.id || String(native.repository.id) !== binding.projectID || native.head_sha.toLowerCase() !== value.commit.toLowerCase() || native.run_attempt !== value.attempt)
      throw fail(binding, "source_conflict", "Native run metadata changed during preflight")
    if (native.status !== value.status || native.conclusion !== value.conclusion || native.event !== value.event)
      throw fail(binding, "source_conflict", "Native run conditions changed during preflight")
    if (intent.target.path !== undefined && native.path !== intent.target.path) throw fail(binding, "source_conflict", "Admitted source path does not match native run provenance")
    if (intent.kind !== "job.retry") version(binding, intent.expected, metadata)
  })
  if (intent.expected?.sourceVersion === undefined) return
  const native = yield* guard(binding, () => GitHubNative.decode(binding, Schema.Struct({ path: Schema.NonEmptyString }), metadata.data, "run path"))
  const selected = yield* before(binding, services.reader.source(binding, { path: native.path, ref: value.commit }))
  yield* guard(binding, () => source(binding, intent, selected, native.path, value.commit, value.commit))
})

export const send = Effect.fn("ActionsGitHubCommands.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  // gh reloads CLI credentials per invocation; recheck actor immediately before send.
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) => {
    const disposition = error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.disposition : "unknown"
    return new ActionsError({ kind: disposition === "unknown" ? "outcome_unknown" : error.kind, provider: "github", bindingID: binding.id,
      message: "GitHub command request failed", disposition, retryAfter: error.retryAfter })
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const error = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* fail(binding, error.kind, "GitHub command was rejected by the provider", "definitely_rejected")
  }
  return yield* fail(binding, "outcome_unknown", "GitHub command returned an unrecognized acknowledgement", "unknown")
})
~~~~


### `packages/core/src/actions/github/commands/inputs.ts`

Archive: `sources/packages/core/src/actions/github/commands/inputs.ts` · bytes: 5159 · Git blob: `177837b7dfbc0272414263be7e2a24606839534c` · SHA256: `38c08aef5b55f2bdbef46c771e7974ff77a0408304a9bb9fcc4f572800baecaa`.

Papel da fonte: Inputs workflow_dispatch limitados/tipados com defaults e choices.


Linhas **10–69**; SHA256 do intervalo `9703926d5ffe04dbe8281a741bb9e97abc13f92cd8d4631f618407af175760ef`:

~~~~typescript
const Definition = Schema.Struct({ type: Schema.optionalKey(Types),
  required: Schema.optionalKey(Schema.Boolean), description: Schema.optionalKey(Schema.String),
  default: Schema.optionalKey(Value), options: Schema.optionalKey(Schema.Array(Schema.String)) })

// Inspect native on.workflow_dispatch structurally; never evaluate YAML expressions.
export function definitions(binding: Actions.Binding, source: Actions.Source, report = diagnostics()): Record<string, typeof Definition.Type & { type: typeof Types.Type }> {
  if (Buffer.byteLength(source.text) > 128 * 1024)
    throw GitHubCommandCommon.fail(binding, "metadata_truncated", "Workflow exceeds bounded dispatch-definition parsing")
  const document = read(source.text, "github", report)
  if (document === undefined || report.state() !== "complete")
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source is not a proved native YAML mapping")
  if (!object(document.value.jobs) || Object.keys(document.value.jobs).length === 0)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Workflow dispatch source has no native job definitions")
  // Document diagnostics cover bounded structural parsing, not graph completeness.
  // Dynamic matrices and reusable jobs do not invalidate a proved dispatch trigger.
  const on = document.value.on
  if (on === "workflow_dispatch" || (strings(on) && on.includes("workflow_dispatch"))) return {}
  if (!object(on) || !Object.hasOwn(on, "workflow_dispatch"))
    throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Workflow source does not declare native workflow_dispatch")
  const configuration = Schema.decodeUnknownOption(Schema.Struct({ inputs: Schema.optionalKey(Schema.Record(Schema.String, Schema.NullOr(Definition))) }))
    (on.workflow_dispatch ?? {}, { onExcessProperty: "error" })
  if (Option.isNone(configuration)) throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch input definitions are unresolved")
  if (Object.keys(configuration.value.inputs ?? {}).length > 25)
    throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native workflow_dispatch defines more than 25 inputs")
  return Object.fromEntries(Object.entries(configuration.value.inputs ?? {}).map(([name, definition]) => {
    const value = definition ?? {}
    const type = value.type ?? "string"
    if (type === "choice" && (!value.options?.length || value.options.some((option) => !option)))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native choice input has no proved choices")
    if (value.options !== undefined && type !== "choice")
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Native input options do not match their declared type")
    if (typeof value.default === "string" && value.default.includes("${{"))
      throw GitHubCommandCommon.fail(binding, "source_unresolved", "Dynamic dispatch input defaults cannot be evaluated during admission")
    const result = { ...value, type }
    if (value.default !== undefined) validate(binding, result, value.default, "source_unresolved")
    return [name, result]
  }))
}

export function values(binding: Actions.Binding, registry: ReturnType<typeof definitions>, provided: Readonly<Record<string, string | number | boolean>> = {}) {
  if (Object.keys(provided).length > 25 || Object.keys(provided).some((key) => !Object.hasOwn(registry, key)))
    throw GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch input keys do not match the selected native workflow")
  return Object.fromEntries(Object.entries(registry).flatMap(([name, definition]) => {
    const value = Object.hasOwn(provided, name) ? provided[name] : definition.default
    if (value === undefined) {
      if (definition.required) throw GitHubCommandCommon.fail(binding, "invalid_input", "A required native dispatch input is missing")
      return []
    }
    validate(binding, definition, value, "invalid_input")
    return [[name, value]]
  }))
}

function validate(binding: Actions.Binding, definition: { type: string; required?: boolean; options?: readonly string[] }, value: string | number | boolean, kind: Actions.ErrorKind) {
  if ((definition.type === "boolean" && typeof value !== "boolean") ||
      (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) ||
      (["string", "choice", "environment"].includes(definition.type) && typeof value !== "string") ||
      (definition.required && value === "") || (definition.type === "choice" && !definition.options?.some((option) => option === value)))
    throw GitHubCommandCommon.fail(binding, kind, "Dispatch input value does not match its proved native definition")
}
~~~~


### `packages/core/src/actions/github/commands/workflow.ts`

Archive: `sources/packages/core/src/actions/github/commands/workflow.ts` · bytes: 6811 · Git blob: `bc9677ced86d82f08db5a38ae948bcca3b1406eb` · SHA256: `7330ca26082e22e8a81c89285afc18002903188555c96d1d60565fae993f7b2f`.

Papel da fonte: Dispatch prova fonte padrão e selecionada; 204 unattributed, 200 ID qualificado.


Linhas **10–79**; SHA256 do intervalo `27d01d77cc1a96a7eb60d7aa78eed20cfed4717389ecafdef5f652d4579c2736`:

~~~~typescript

// https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
export const dispatch = Effect.fn("ActionsGitHubCommands.dispatch")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, input: typeof Actions.GitHubDispatch.Type) {
  if (intent.target.ref === undefined || input.ref !== intent.target.ref)
    return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch ref does not match the admitted native target")
  const { GitHubDispatchInputs } = yield* Effect.promise(() => import("./inputs"))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (workflow.state !== "active") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow is not active for dispatch")
  const branch = repository.native.default_branch
  if (!branch) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native default branch was not observed")
  const admission = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: branch }))
  yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, { ...intent, expected: undefined }, admission, workflow.path, branch)
    GitHubDispatchInputs.definitions(binding, admission)
  }, "source_unresolved")
  // Default-branch eligibility and selected-ref execution source are separate proofs.
  const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: input.ref }))
  const definitions = yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, intent, selected, workflow.path, input.ref)
    return GitHubDispatchInputs.definitions(binding, selected)
  }, "source_unresolved")
  const inputs = yield* GitHubCommandCommon.guard(binding, () => GitHubDispatchInputs.values(binding, definitions, input.inputs))
  yield* Effect.forEach(Object.entries(definitions).filter(([name, definition]) => definition.type === "environment" && Object.hasOwn(inputs, name)), ([name]) => Effect.gen(function* () {
    const target = yield* GitHubCommandCommon.guard(binding, () => {
      const value = inputs[name]
      if (typeof value !== "string" || !value || value.length > 255 || value !== value.trim() || /[\\%{}:\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === ".."))
        throw GitHubCommandCommon.fail(binding, "invalid_input", "Environment input requires an exact native environment name")
      return { value, segment: encodeURIComponent(value) }
    })
    const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/environments/${target.segment}`)
    yield* GitHubCommandCommon.guard(binding, () => {
      const environment = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString }), response.data, "environment")
      if (environment.name.toLowerCase() !== target.value.toLowerCase()) throw GitHubCommandCommon.fail(binding, "source_conflict", "Native environment identity changed during preflight")
    })
  }))
  const response = yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/workflows/${workflow.id}/dispatches`, body: { ref: input.ref, inputs } }, [200, 204])
  if (response.status === 204) return { acknowledgement: { unattributed: true } }
  const result = Schema.decodeUnknownOption(Dispatch)(response.data)
  if (Option.isNone(result)) return yield* GitHubCommandCommon.fail(binding, "outcome_unknown", "GitHub dispatch did not return a complete native run acknowledgement", "unknown")
  return { acknowledgement: { runID: String(result.value.workflow_run_id) } }
})

// https://docs.github.com/en/rest/actions/workflows#enable-a-workflow
export const state = Effect.fn("ActionsGitHubCommands.workflowState")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, enabled: boolean) {
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (!["active", "disabled_manually", "disabled_inactivity", "disabled_fork"].includes(workflow.state))
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow state does not support this transition")
  if (intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined) {
    if (intent.target.ref === undefined) return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Source preconditions require the admitted source ref")
    const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
    yield* GitHubCommandCommon.guard(binding, () => GitHubCommandCommon.source(binding, intent, selected, workflow.path, intent.target.ref ?? ""))
  }
  yield* GitHubCommandCommon.send(services, binding, { method: "PUT", path: `${repository.root}/actions/workflows/${workflow.id}/${enabled ? "enable" : "disable"}` }, [204])
  return { acknowledgement: {} }
})

const read = Effect.fn("ActionsGitHubCommands.workflowPreflight")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, root: string) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.workflowID ?? ""))
  const response = yield* GitHubCommandCommon.get(services, binding, `${root}/actions/workflows/${id}`)
  return yield* GitHubCommandCommon.guard(binding, () => {
    const workflow = GitHubNative.decode(binding, Workflow, response.data, "workflow")
    if (String(workflow.id) !== id || (intent.target.path !== undefined && intent.target.path !== workflow.path))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native workflow identity or path does not match admission")
    GitHubNative.path(binding, workflow.path)
    GitHubCommandCommon.version(binding, intent.expected, response)
    return { id, path: workflow.path, state: workflow.state }
  })
})
~~~~


## A19 — Run/job GitHub: elegibilidade e acknowledgment

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A19`.


### `packages/core/src/actions/github/commands/run.ts`

Archive: `sources/packages/core/src/actions/github/commands/run.ts` · bytes: 4900 · Git blob: `20a65fe64b3559988856c829670ebb82296f9113` · SHA256: `a54d15a5e3870a09fc98708de4ee41aa09acaf2175b6d9c9e0e4249e6646fe78`.

Papel da fonte: Retry terminal sem inventar attempt; cancel/force/delete/fork têm condições próprias.


Linhas **10–59**; SHA256 do intervalo `401ec763bac5df99cb1c4266a4fcac6408be01d8c04573250c9f2580d86a0b94`:

~~~~typescript
  event: Schema.String, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  repository: Schema.Struct({ id: GitHubNative.ID, private: Schema.Boolean }),
  head_repository: Schema.NullOr(Schema.Struct({ id: GitHubNative.ID, fork: Schema.Boolean })) })

// https://docs.github.com/en/rest/actions/workflow-runs
export const perform = Effect.fn("ActionsGitHubCommands.run")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.runID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const run = yield* GitHubCommandCommon.run(services, binding, intent, id)
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  const target = `${repository.root}/actions/runs/${id}`
  if (intent.kind === "run.retry" || intent.kind === "run.retryFailed") {
    if (run.status !== "completed" || (intent.kind === "run.retryFailed" && !["failure", "cancelled", "timed_out"].includes(run.conclusion ?? "")))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not eligible for the admitted retry mode")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.retry" ? "rerun" : "rerun-failed-jobs"}`,
      body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
    // The admitted run is known; the newly-created attempt is not returned here.
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.cancel" || intent.kind === "run.forceCancel") {
    if (run.status === null || !active.has(run.status))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run is not in a cancelable execution state")
    if (intent.kind === "run.forceCancel" && (binding.provider.hostname !== "github.com" || binding.provider.apiOrigin !== "https://api.github.com" || repository.headers["x-github-api-version-selected"] !== "2026-03-10"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native force-cancel route has no observed supported host/API-version evidence")
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/${intent.kind === "run.cancel" ? "cancel" : "force-cancel"}` }, [202])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.delete") {
    if (run.status !== "completed") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Only a terminal native run may be deleted")
    yield* GitHubCommandCommon.send(services, binding, { method: "DELETE", path: target }, [204])
    return { acknowledgement: { runID: id } }
  }
  if (intent.kind === "run.approveFork") {
    if (run.event !== "pull_request" || (run.status !== "action_required" && run.conclusion !== "action_required"))
      return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native run does not require fork pull-request approval")
    const response = yield* GitHubCommandCommon.get(services, binding, target)
    yield* GitHubCommandCommon.guard(binding, () => {
      const native = GitHubNative.decode(binding, Fork, response.data, "fork approval")
      if (String(native.id) !== id || String(native.repository.id) !== binding.projectID || native.run_attempt !== run.attempt || native.head_sha.toLowerCase() !== run.commit.toLowerCase())
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork run changed during preflight")
      if (native.event !== run.event || native.status !== run.status || native.conclusion !== run.conclusion)
        throw GitHubCommandCommon.fail(binding, "source_conflict", "Native fork approval conditions changed during preflight")
      if (native.repository.private || !native.head_repository?.fork || String(native.head_repository.id) === binding.projectID)
        throw GitHubCommandCommon.fail(binding, "capability_unavailable", "Native public-fork ownership was not proved")
    })
    yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${target}/approve` }, [201])
    return { acknowledgement: { runID: id } }
  }
  return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Command does not belong to the GitHub run dispatcher")
})
~~~~


### `packages/core/src/actions/github/commands/job.ts`

Archive: `sources/packages/core/src/actions/github/commands/job.ts` · bytes: 2482 · Git blob: `01828a587ca7443e08fc0ecdcff55bf1ebeca863` · SHA256: `b753ad05386cd13df639a4000b7fd35db4db8431e66f1ab27633acdbeb314591`.

Papel da fonte: Job retry valida ownership/attempt e retorna IDs já conhecidos.


Linhas **9–33**; SHA256 do intervalo `9494a8db1e30da775bbbde5b91a05e6e4a721a3fa247809f442cdf27d5c05286`:

~~~~typescript
  run_attempt: Schema.optionalKey(GitHubNative.Positive), status: Schema.NullOr(Schema.String) })

// https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run
export const retry = Effect.fn("ActionsGitHubCommands.jobRetry")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, debug?: boolean) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.jobID ?? ""))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/actions/jobs/${id}`)
  const job = yield* GitHubCommandCommon.guard(binding, () => {
    const native = GitHubNative.decode(binding, Job, response.data, "job retry")
    if (String(native.id) !== id || (intent.target.runID !== undefined && String(native.run_id) !== intent.target.runID))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native job does not match its admitted run ownership")
    GitHubCommandCommon.version(binding, intent.expected, response)
    return native
  })
  const run = yield* GitHubCommandCommon.run(services, binding, intent, String(job.run_id))
  if (job.run_attempt === undefined) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job attempt was not observed")
  if (job.run_attempt !== run.attempt || job.head_sha.toLowerCase() !== run.commit.toLowerCase())
    return yield* GitHubCommandCommon.fail(binding, "source_conflict", "Native job source or attempt is stale")
  if (job.status !== "completed" || run.status !== "completed")
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native job/run is not terminal for retry")
  yield* GitHubCommandCommon.historical(services, binding, intent, run)
  yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/jobs/${id}/rerun`,
    body: debug === undefined ? {} : { enable_debug_logging: debug } }, [201, 204])
  return { acknowledgement: { jobID: id, runID: String(job.run_id) } }
})
~~~~


## A20 — GitLab: plano, role, dispatch e trigger

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A20`.


### `packages/core/src/actions/gitlab/commands.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands.ts` · bytes: 2258 · Git blob: `d3f432fc7b0c434bfcb9a88adeabfcfae5829033` · SHA256: `2be56b6ff21b0f9a63d929b0b38f75fad2d29705476dbd5d13f63634f803c00e`.

Papel da fonte: Plano é construído antes do único envio principal; qualifica resposta.


Linhas **8–33**; SHA256 do intervalo `eba173ca1ec4f94e1b47d7f42aba37e490b7d03a345ba4550a8804a6fdcccf42`:

~~~~typescript
import { GitLabCommandShared } from "./commands/shared"
import { GitLabCommandLaunch } from "./commands/launch"
import { GitLabCommandRuns } from "./commands/runs"
import { GitLabCommandJobs } from "./commands/jobs"
import { GitLabCommandMergeRequest } from "./commands/merge-request"

export function make(input: { readonly transport: ActionsContract.Transport; readonly reader: ActionsContract.ReadAdapter }): ActionsContract.Commands {
  const launch = GitLabCommandLaunch.make(input)
  const run = GitLabCommandRuns.make(input)
  const job = GitLabCommandJobs.make(input)
  const mergeRequest = GitLabCommandMergeRequest.make(input)
  return { perform: Effect.fn("ActionsGitLabCommands.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const plan = yield* Effect.gen(function* () {
      const admitted = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandShared.admit(binding, intent))
      if (admitted.kind === "workflow.dispatch" || admitted.kind === "pipeline.trigger") return yield* launch(binding, admitted, payload)
      if (admitted.kind === "pipeline.mergeRequest") return yield* mergeRequest(binding, admitted, payload)
      if (admitted.kind.startsWith("run.")) return yield* run(binding, admitted, payload)
      return yield* job(binding, admitted, payload)
    }).pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    // One write, owned by the caller's durable execution scope. W1 captures the
    // same credential snapshot for native actor preflight and this HTTP mutation.
    const response = yield* input.transport.request(binding, plan.request)
    if (!plan.statuses.includes(response.status)) return yield* GitLabCommandShared.error(binding, "outcome_unknown", "GitLab command returned an unqualified native write status", true)
    return { acknowledgement: yield* plan.acknowledge(response) }
  }) }
}
~~~~


### `packages/core/src/actions/gitlab/commands/native.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/native.ts` · bytes: 5006 · Git blob: `96c48f417a9df123e151215ff757186932fe1895` · SHA256: `ceac62595d8c7647e4a4277dbc893f9f7c4a71faada7fc50b1614a4474cdfc63`.

Papel da fonte: Roles observados e project policies; ausência não vira autoridade.


Linhas **10–72**; SHA256 do intervalo `c4fd98d5a2bb451365ce146f85f342d391db237b68871b47d4f3a45b86689a12`:

~~~~typescript
  ci_pipeline_variables_minimum_override_role: Schema.optional(Schema.String),
  ci_restrict_pipeline_cancellation_role: Schema.optional(Schema.String), merge_pipelines_enabled: Schema.optional(Schema.Boolean),
})
export const Job = Schema.Struct({ ...ActionsGitLabNative.Job.fields,
  ref: Schema.String, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }),
  pipeline: Schema.Struct({ id: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA, ref: Schema.String }),
  archived: Schema.optional(Schema.Boolean), erased_at: Schema.optional(Schema.NullOr(Schema.String)),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ username: Schema.String }))),
})
export const Ref = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })
export const MergeRequest = Schema.Struct({ id: ActionsGitLabNative.ID, iid: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA,
  source_branch: Schema.NonEmptyString, state: Schema.String,
})

export function make(transport: ActionsContract.Transport) {
  const read = ActionsGitLabNative.make(transport)
  return { ...read,
    project: Effect.fn("ActionsGitLabCommands.project")(function* (binding: Actions.Binding) {
      const response = yield* read.get(binding, ActionsGitLabNative.projectPath(binding))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const project = GitLabCommandShared.native(binding, Project, response.data)
        if (String(project.id) !== binding.projectID) throw GitLabCommandShared.error(binding, "binding_stale", "GitLab native project differs from the admitted project")
        return project
      })
    }),
    ref: Effect.fn("ActionsGitLabCommands.ref")(function* (binding: Actions.Binding, ref: string) {
      const response = yield* read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(ref)}`)
        .pipe(Effect.catch((error) => error.kind === "not_found"
          ? read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/tags/${encodeURIComponent(ref)}`) : Effect.fail(error)))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const result = GitLabCommandShared.native(binding, Ref, response.data)
        if (result.name !== ref) throw GitLabCommandShared.error(binding, "source_conflict", "GitLab native branch/tag ref differs from the admitted ref")
        return result.commit.id
      })
    }),
  }
}

export function role(binding: Actions.Binding, project: typeof Project.Type, minimum: number) {
  if (project.archived === true || project.jobs_enabled === false || project.builds_access_level === "disabled" || project.repository_access_level === "disabled")
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project is archived or execution is disabled")
  const levels = [project.permissions?.project_access, project.permissions?.group_access]
    .filter((value) => value !== undefined).map((value) => value?.access_level ?? 0)
  if (levels.some((value) => ![0, 5, 10, 15, 20, 30, 40, 50].includes(value)))
    throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab observed role is not a qualified native access level")
  const level = Math.max(0, ...levels)
  if (level >= minimum) return level
  if (levels.length !== 2) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab effective project/group write role is not observed")
  throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project/group role denies this execution command")
}

export function variables(binding: Actions.Binding, project: typeof Project.Type, level: number, present: boolean) {
  if (!present) return
  const minimum = project.ci_pipeline_variables_minimum_override_role
  if (minimum === "no_one_allowed" || minimum === "owner" && level < 50 || minimum === "maintainer" && level < 40 || minimum === "developer" && level < 30)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native pipeline-variable override policy denies this command")
}

export function cancellation(binding: Actions.Binding, project: typeof Project.Type, level: number) {
  if (project.ci_restrict_pipeline_cancellation_role === "no_one" || project.ci_restrict_pipeline_cancellation_role === "maintainer" && level < 40)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native cancellation policy denies this command")
}
~~~~


### `packages/core/src/actions/gitlab/commands/launch.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/launch.ts` · bytes: 4234 · Git blob: `69db848d7513a074b960851e27c12a39438ebd47` · SHA256: `444fe50cc00d0aaed2895b18ca25e11baca9fe281a917c0260674b5449540579`.

Papel da fonte: Dispatch/trigger distinguem token/body/endpoint e provam ref/config.


Linhas **10–52**; SHA256 do intervalo `36d0cb2ddba984c38cc741248ca145c1be08d4e52ec33cd38f972e15dc72f4f5`:

~~~~typescript

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.launch")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const command = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["workflowID", "ref", "path"], ["ref"])
      const value = intent.kind === "pipeline.trigger"
        ? GitLabCommandShared.decode(binding, Actions.TriggerPipelineCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabDispatch, payload)
      if (value.ref !== intent.target.ref) throw GitLabCommandShared.error(binding, "invalid_input", "GitLab execute ref differs from its admitted ref")
      return value
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const sha = yield* native.ref(binding, command.ref)
    yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.commit(binding, intent, sha, command.ref)
      GitLabCommandNative.variables(binding, project, level, command.variables !== undefined && Object.keys(command.variables).length > 0)
      if (intent.target.path !== undefined && intent.target.path !== ActionsGitLabNative.configPath(project))
        throw GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI path differs from native project configuration")
    })
    const path = ActionsGitLabNative.configPath(project)
    if (command.inputs !== undefined || intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!path || !ActionsGitLabNative.localPath(path)) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit input/source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, sha, path)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab launch did not establish ref-bound source")
      yield* GitLabCommandInputs.check(binding, input.transport, source, command.inputs)
    }
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if ("token" in command) return GitLabCommandShared.json(binding, { ref: command.ref, token: command.token,
        ...(command.variables === undefined ? {} : { variables: command.variables }), ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
      if (command.variables && new Set(command.variables.map((variable) => variable.key)).size !== command.variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab pipeline variables must have distinct native keys")
      return GitLabCommandShared.json(binding, { ref: command.ref,
        ...(command.variables === undefined ? {} : { variables: command.variables.map((variable) => ({ key: variable.key, value: variable.value,
          ...(variable.variable_type === undefined ? {} : { variable_type: variable.variable_type }) })) }),
        ...(command.inputs === undefined ? {} : { inputs: command.inputs }) })
    })
    return { request: { method: "POST", path: `${ActionsGitLabNative.projectPath(binding)}/${"token" in command ? "trigger/pipeline" : "pipeline"}`, body },
      statuses: [201], acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { commit: sha, ref: command.ref, sources: "token" in command ? ["trigger", "pipeline"] : ["api"] })) }
  })
}
~~~~


### `packages/core/src/actions/gitlab/commands/shared.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/shared.ts` · bytes: 5846 · Git blob: `b15f4a3edb40e83274490b3c789cf2581aac9a5a` · SHA256: `0af91cc662eb4578cf1f16e967743fe9d69fb356d6c58555f50826b399e23a97`.

Papel da fonte: Payload estrito, commit/ref e resposta pipeline nativa vinculada.


Linhas **11–83**; SHA256 do intervalo `2bcd811d93b1dda580549ec7e39bb6ac1462bf50f07ee35b74682fc627587282`:

~~~~typescript
export type Plan = { readonly request: ActionsContract.Request; readonly statuses: readonly number[];
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError> }

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, sent = false) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab", disposition: sent ? "unknown" : "definitely_unsent" })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown): S["Type"] {
  const result = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command payload or intent does not match its native schema")
  return result.value
}

export function json(binding: Actions.Binding, data: unknown) {
  const result = Schema.decodeUnknownOption(Schema.Json)(data)
  if (Option.isNone(result)) throw error(binding, "invalid_input", "GitLab command requires finite JSON values")
  return result.value
}

export function admit(binding: Actions.Binding, input: Actions.OperationIntent) {
  const intent = decode(binding, Actions.OperationIntent, input)
  ActionsGitLabNative.projectPath(binding)
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw error(binding, "binding_stale", "GitLab command binding and admitted revision differ")
  if (!kinds.includes(intent.kind)) throw error(binding, "invalid_input", "GitLab command kind belongs to a different dispatcher")
  if (intent.expected?.attempt !== undefined) throw error(binding, "capability_unavailable", "GitLab has native retry job identities, not run_attempt preconditions")
  if (intent.expected?.resourceVersion !== undefined) throw error(binding, "capability_unavailable", "This GitLab execution command has no native resourceVersion precondition")
  if (intent.expected?.commit !== undefined && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(intent.expected.commit)))
    throw error(binding, "invalid_input", "GitLab expected commit must be an immutable Git object ID")
  if (intent.target.workflowID !== undefined && intent.target.workflowID !== ActionsGitLabNative.workflowID(binding))
    throw error(binding, "invalid_input", "GitLab workflow target must identify this project's native pipeline/config slot")
  return intent
}

export function target(binding: Actions.Binding, intent: Actions.OperationIntent, allowed: readonly string[], required: readonly string[]) {
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(intent.target, key)))
    throw error(binding, "invalid_input", "GitLab admitted target does not match this native command")
}

export function commit(binding: Actions.Binding, intent: Actions.OperationIntent, sha: string, ref: string | null) {
  if (intent.expected?.commit !== undefined && intent.expected.commit !== sha || intent.target.ref !== undefined && intent.target.ref !== ref)
    throw error(binding, "source_conflict", "GitLab native commit or ref changed since admission")
}

export const source = Effect.fn("ActionsGitLabCommands.sourcePrecondition")(function* (
  binding: Actions.Binding, intent: Actions.OperationIntent, reader: ActionsContract.ReadAdapter, sha: string, path?: string,
) {
  const selected = intent.target.path ?? path
  if (!selected) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "source_unresolved", "A sourceVersion precondition requires the admitted native source path")
    return
  }
  const source = yield* reader.source(binding, { path: selected, ref: sha })
  if (source.bindingID !== binding.id || source.path !== selected || source.commit !== sha ||
    intent.expected?.sourceVersion !== undefined && source.version !== intent.expected.sourceVersion)
    return yield* error(binding, "source_conflict", "GitLab source identity or version changed since admission")
  return source
})

export function native<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, sent = false): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, sent ? "outcome_unknown" : "transport_failed", "GitLab returned invalid command identity metadata", sent)
  return result.value
}

export function pipeline(binding: Actions.Binding, data: unknown, expected: { id?: string; commit?: string; ref?: string | null; sources?: readonly string[]; name?: string }) {
  const value = native(binding, ActionsGitLabNative.Pipeline, data, true)
  if (String(value.project_id) !== binding.projectID || expected.id !== undefined && String(value.id) !== expected.id ||
    expected.commit !== undefined && value.sha !== expected.commit || expected.ref !== undefined && value.ref !== expected.ref ||
    expected.sources !== undefined && !expected.sources.includes(value.source) || expected.name !== undefined && value.name !== expected.name)
    throw error(binding, "outcome_unknown", "GitLab mutation response did not prove the exact project, pipeline, source and ref", true)
  return { runID: String(value.id) }
}
~~~~


## A21 — GitLab: inputs autoritativos e merge request

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A21`.


### `packages/core/src/actions/gitlab/commands/inputs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/inputs.ts` · bytes: 4814 · Git blob: `12ba907ddadcd0103fa07da0eeabe7bede5fc9f5` · SHA256: `c1f72bbe27861b2f51e5f0fa2fe67bcbca6f48d2a7c0b08acd451395c9ab476f`.

Papel da fonte: Gate 18.1 e schema local sem includes desconhecidos; regex não é executada como JS.


Linhas **9–80**; SHA256 do intervalo `514bd17bb798b82fae408b086bdc6c041387ae6acd2cf6932557f75eda55ae30`:

~~~~typescript

const Input = Schema.Struct({
  type: Schema.optional(Schema.Literals(["string", "number", "boolean", "array"])), default: Schema.optional(Schema.Json),
  options: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))),
  description: Schema.optional(Schema.String), regex: Schema.optional(Schema.String), rules: Schema.optional(Schema.Json),
})
const Header = Schema.Struct({ spec: Schema.Struct({ inputs: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Input))) }) })

export const check = Effect.fn("ActionsGitLabCommands.inputs")(function* (
  binding: Actions.Binding, transport: ActionsContract.Transport, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>,
) {
  const values = yield* ActionsGitLabNative.checked(binding, () => validate(binding, source, supplied))
  if (supplied !== undefined) {
    const native = ActionsGitLabNative.make(transport)
    const observation = yield* native.metadata(binding)
    // API inputs: 17.10 feature-flagged; 18.1 GA. No client-version or flag guesses.
    // https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline
    // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.1.0-ee/lib/api/ci/helpers/pipelines_helpers.rb
    yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [18, 1], "pipeline inputs"))
  }
  return values
})

function validate(binding: Actions.Binding, source: Actions.Source, supplied?: Readonly<Record<string, ActionsContract.Json>>) {
  const definitions = projection(source.text)
  if (definitions === undefined) {
    if (supplied !== undefined) throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input declarations are not proven by bounded local source")
    return
  }
  // RE2 and conditional native input rules are not JavaScript regex predicates.
  // Keep raw constraints authoritative; explicit values need native validation
  // outside this slice before they can be admitted under these declarations.
  if (supplied !== undefined && Object.values(definitions).some((config) => config?.regex !== undefined || config?.rules !== undefined))
    throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab input regex/rules constraints are not locally verified")
  const values = supplied ?? {}
  if (Object.keys(values).some((key) => !Object.hasOwn(definitions, key)))
    throw GitLabCommandShared.error(binding, "invalid_input", "GitLab inputs contain a key not declared in the ref-bound CI header")
  Object.entries(definitions).forEach(([key, definition]) => {
    const config = definition ?? {}
    const type = config.type ?? "string"
    if (config.default !== undefined && !valid(type, config.default))
      throw GitLabCommandShared.error(binding, "source_unresolved", "GitLab CI input default does not match its declared native type")
    const value = Object.hasOwn(values, key) ? values[key] : config.default
    if (value === undefined || !valid(type, value))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab required input is missing or has a different native type")
    if (config.options !== undefined && (type === "array" || !config.options.some((option) => option === value)))
      throw GitLabCommandShared.error(binding, "invalid_input", "GitLab input does not match a declared native option")
  })
  // Native provider applies omitted defaults. Preserve supplied values without coercion.
  return supplied
}

function valid(type: string, value: ActionsContract.Json) {
  return type === "array" ? Array.isArray(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type
}

function projection(text: string) {
  const report = diagnostics()
  const document = read(text, "gitlab", report)
  if (!document) return
  if (document.header === undefined) {
    // Parsed headerless local source proves no declarations. An unfetched
    // include may supply declarations: undefined is unknown, never empty.
    if (document.value.include !== undefined) return
    return {}
  }
  const spec = document.header.spec
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || "include" in spec || inputExpression(spec)) return
  const decoded = Schema.decodeUnknownOption(Header, { onExcessProperty: "error" })(document.header)
  if (Option.isNone(decoded)) return
  return decoded.value.spec.inputs ?? {}
}
~~~~


### `packages/core/src/actions/gitlab/commands/merge-request.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/merge-request.ts` · bytes: 4177 · Git blob: `38a983b2834d42964934b1699b17d92637e8fab8` · SHA256: `4db4f1c18a91be6292d2b8a10c493ffe81a5893036f45b8fdee62a3e40b000b1`.

Papel da fonte: MR aberto no mesmo projeto; IID, source e head/merge refs próprios.


Linhas **10–53**; SHA256 do intervalo `3e8f290cf5bda2f064aeb5a79213ead08628093ba2c5f613b6b157e280700d2c`:

~~~~typescript

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.mergeRequest")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const iid = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["resourceID", "workflowID", "ref", "path"], ["resourceID"])
      GitLabCommandShared.decode(binding, Actions.MergeRequestCommand.fields.input, payload)
      return ActionsGitLabNative.nativeID(binding, intent.target.resourceID ?? "", "merge request IID")
    })
    const project = yield* native.project(binding)
    yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const path = `${ActionsGitLabNative.projectPath(binding)}/merge_requests/${iid}`
    const response = yield* native.get(binding, path)
    const mr = yield* ActionsGitLabNative.checked(binding, () => {
      const value = GitLabCommandShared.native(binding, GitLabCommandNative.MergeRequest, response.data)
      if (String(value.iid) !== iid || String(value.project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab merge request IID does not belong to the admitted native project")
      if (value.state !== "opened") throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab merge request pipeline requires an open native merge request")
      if (String(value.source_project_id) !== binding.projectID)
        throw GitLabCommandShared.error(binding, "source_unresolved", "Fork merge request execution requires separate native source-project placement proof")
      GitLabCommandShared.commit(binding, intent, value.sha, value.source_branch)
      return value
    })
    const configured = ActionsGitLabNative.configPath(project)
    if (intent.target.path !== undefined && intent.target.path !== configured)
      return yield* GitLabCommandShared.error(binding, "source_conflict", "GitLab admitted CI source path differs from native configuration")
    if (intent.expected?.sourceVersion !== undefined || intent.target.path !== undefined) {
      if (!configured || !ActionsGitLabNative.localPath(configured))
        return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab explicit MR source preconditions require resolved local CI configuration")
      const source = yield* GitLabCommandShared.source(binding, intent, input.reader, mr.sha, configured)
      if (!source) return yield* GitLabCommandShared.error(binding, "source_unresolved", "GitLab MR pipeline did not prove head source")
      yield* GitLabCommandInputs.check(binding, input.transport, source)
    }
    // https://docs.gitlab.com/api/merge_requests/#create-merge-request-pipeline
    return { request: { method: "POST", path: `${path}/pipelines` }, statuses: [201],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        const value = GitLabCommandShared.native(binding, ActionsGitLabNative.Pipeline, response.data, true)
        if (value.ref !== `refs/merge-requests/${iid}/head` && value.ref !== `refs/merge-requests/${iid}/merge`)
          throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab MR launch did not return the exact native merge request ref", true)
        return GitLabCommandShared.pipeline(binding, response.data, { sources: ["merge_request_event"],
          commit: value.ref.endsWith("/head") ? mr.sha : intent.expected?.commit })
      }) }
  })
}
~~~~


## A22 — Run/job GitLab: sem equivalências GitHub

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A22`.


### `packages/core/src/actions/gitlab/commands/runs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/runs.ts` · bytes: 3685 · Git blob: `999c7e5cd6c6d8d33cbe63ad601923b308eff3e4` · SHA256: `0c210556925c4d2f025c6942b2512e8ab782ae748aa51b0336dde859c441ec30`.

Papel da fonte: Retry/cancel/rename/delete pela política e resposta pipeline, sem copiar lista terminal GitHub.


Linhas **9–47**; SHA256 do intervalo `b9e290190f255ecd73886bd678ed598e21a97101e1b0a8de51dd851dcfd5606b`:

~~~~typescript

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.run")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const name = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["runID", "workflowID", "ref", "path"], ["runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "run.rename") return GitLabCommandShared.decode(binding, Actions.RenameCommand.fields.input, payload).name
      const value = intent.kind === "run.retry" ? GitLabCommandShared.decode(binding, Actions.RetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, intent.kind === "run.delete" ? 50 : 30))
    if (intent.kind === "run.rename") {
      const observation = yield* native.metadata(binding)
      // https://gitlab.com/gitlab-org/gitlab/-/blob/v18.4.0-ee/lib/api/ci/pipelines.rb
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [16, 6], "pipeline name metadata"))
    }
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    yield* ActionsGitLabNative.checked(binding, () => {
      if (run.id !== intent.target.runID || run.bindingID !== binding.id || run.workflowID !== ActionsGitLabNative.workflowID(binding))
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab selected pipeline belongs to a different native target")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      if (intent.kind === "run.cancel") GitLabCommandNative.cancellation(binding, project, level)
    })
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const path = `${ActionsGitLabNative.projectPath(binding)}/pipelines/${run.id}`
    if (intent.kind === "run.delete") return { request: { method: "DELETE", path }, statuses: [204],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => {
        if (response.data !== null) throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab deletion did not return an exact native empty acknowledgement", true)
        return { runID: run.id }
      }) }
    return { request: { method: name === undefined ? "POST" : "PUT", path: `${path}/${name === undefined ? intent.kind === "run.retry" ? "retry" : "cancel" : "metadata"}`,
      ...(name === undefined ? {} : { body: { name } }) }, statuses: intent.kind === "run.retry" ? [200, 201] : [200],
      acknowledge: (response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.pipeline(binding, response.data,
        { id: run.id, commit: run.commit, sources: [run.event], ref: run.ref, name })) }
  })
}
~~~~


### `packages/core/src/actions/gitlab/commands/jobs.ts`

Archive: `sources/packages/core/src/actions/gitlab/commands/jobs.ts` · bytes: 11307 · Git blob: `176a10632f895603fc8cc2b7baef1327db90377e` · SHA256: `0e59d1b73ef755e2e29d0e0dcb829c127f9cc6b642773c973510afe5d3e0f310`.

Papel da fonte: Jobs e bridges, retry com novo ID, play e erase com gates de versão/ownership.


Linhas **13–133**; SHA256 do intervalo `09a1c58a5c213964392697ec99e88da27e3a97d28fbe5bc6d5213a1f4218669b`:

~~~~typescript
  erased_at: Schema.optional(Schema.NullOr(Schema.String)) })

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const native = GitLabCommandNative.make(input.transport)
  return Effect.fn("ActionsGitLabCommands.job")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json): Effect.fn.Return<GitLabCommandShared.Plan, import("../../error").ActionsError> {
    const variables = yield* ActionsGitLabNative.checked(binding, () => {
      GitLabCommandShared.target(binding, intent, ["jobID", "runID", "workflowID", "ref", "path"], ["jobID", "runID"])
      ActionsGitLabNative.nativeID(binding, intent.target.jobID ?? "", "job ID")
      ActionsGitLabNative.nativeID(binding, intent.target.runID ?? "", "pipeline ID")
      if (intent.kind === "job.play") return GitLabCommandShared.decode(binding, Actions.JobPlayCommand.fields.input, payload).variables
      const value = intent.kind === "job.retry" ? GitLabCommandShared.decode(binding, Actions.JobRetryCommand.fields.input, payload)
        : GitLabCommandShared.decode(binding, Actions.GitLabCommand.fields.input, payload)
      if (value.provider !== "gitlab") throw GitLabCommandShared.error(binding, "invalid_input", "GitLab command provider does not match this binding")
    })
    const project = yield* native.project(binding)
    const level = yield* ActionsGitLabNative.checked(binding, () => GitLabCommandNative.role(binding, project, 30))
    const run = yield* input.reader.run(binding, intent.target.runID ?? "")
    const path = `${ActionsGitLabNative.projectPath(binding)}/jobs/${intent.target.jobID}`
    const selected = yield* native.get(binding, path).pipe(
      Effect.map((response) => ({ kind: "job", data: response.data })),
      Effect.catch((error) => error.kind === "not_found"
        ? findBridge(binding, input.reader, run.id, intent.target.jobID ?? "").pipe(Effect.map((job) => ({ kind: "bridge", data: job }))) : Effect.fail(error)),
    )
    if (selected.kind === "bridge") {
      if (intent.kind === "job.cancel" || intent.kind === "job.erase")
        return yield* GitLabCommandShared.error(binding, "capability_unavailable", "GitLab bridge jobs have no native build cancel/erase endpoint")
      const observation = yield* native.metadata(binding)
      yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding, observation, [17, 0], "bridge job retry/play"))
    }
    const job = yield* ActionsGitLabNative.checked(binding, () => {
      const detail = selected.kind === "job" ? GitLabCommandShared.native(binding, GitLabCommandNative.Job, selected.data) : undefined
      const bridge = selected.kind === "bridge" ? GitLabCommandShared.native(binding, Actions.Job, selected.data) : undefined
      if (detail && (String(detail.id) !== intent.target.jobID || String(detail.pipeline.id) !== intent.target.runID || String(detail.pipeline.project_id) !== binding.projectID ||
        detail.commit.id !== run.commit || detail.pipeline.sha !== run.commit || detail.ref !== run.ref || detail.pipeline.ref !== run.ref) ||
        bridge && (bridge.id !== intent.target.jobID || bridge.runID !== run.id || bridge.bindingID !== binding.id || bridge.kind !== "bridge") ||
        run.id !== intent.target.runID || run.bindingID !== binding.id)
        throw GitLabCommandShared.error(binding, "binding_stale", "GitLab job does not belong to the exact admitted project, pipeline, commit and ref")
      GitLabCommandShared.commit(binding, intent, run.commit, run.ref)
      const status = detail?.status ?? bridge?.status
      if (detail?.archived === true) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab archived job is not eligible for this command")
      if (intent.kind === "job.play" && status !== "manual")
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab manual play requires an observed manual job")
      if (intent.kind === "job.retry" && !["success", "failed", "canceled"].includes(status ?? ""))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job retry requires an observed finished retryable job")
      if (intent.kind === "job.erase" && (!GitLabCommandShared.terminal.includes(status ?? "") || detail?.erased_at))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab erase requires a terminal, non-archived, unerased job")
      if (intent.kind === "job.cancel") GitLabCommandNative.cancellation(binding, project, level)
      return detail
    })
    if (intent.kind === "job.erase" && level < 40) {
      if (!job || job.user?.username !== binding.account) return yield* GitLabCommandShared.error(binding, "permission_denied", "GitLab erase requires Maintainer access or the job's unprotected-ref creator")
      const ref = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(job.ref)}`)
      yield* ActionsGitLabNative.checked(binding, () => {
        const branch = GitLabCommandShared.native(binding, Schema.Struct({ ...GitLabCommandNative.Ref.fields, protected: Schema.Boolean }), ref.data)
        if (branch.name !== job.ref || branch.protected) throw GitLabCommandShared.error(binding, "permission_denied", "GitLab developer-owned erase requires a proved unprotected native ref")
      })
    }
    yield* GitLabCommandShared.source(binding, intent, input.reader, run.commit)
    const body = yield* ActionsGitLabNative.checked(binding, () => {
      if (variables === undefined) return
      if (variables.some((variable) => variable.variable_type === "file"))
        throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab job play variables do not support native file variable_type")
      if (new Set(variables.map((variable) => variable.key)).size !== variables.length)
        throw GitLabCommandShared.error(binding, "invalid_input", "GitLab job play variables must have distinct native keys")
      GitLabCommandNative.variables(binding, project, level, variables.length > 0)
      return { job_variables_attributes: variables.map((variable) => ({ key: variable.key, value: variable.value })) }
    })
    const verb = intent.kind.slice(4)
    return { request: { method: "POST", path: `${path}/${verb}`, ...(body === undefined ? {} : { body }) }, statuses: [200, 201],
      acknowledge: Effect.fn("ActionsGitLabCommands.jobAcknowledgement")(function* (response: ActionsContract.Response) {
        const returned = yield* ActionsGitLabNative.checked(binding, () => {
          const value = GitLabCommandShared.native(binding, ReturnedJob, response.data, true)
          requireSource(binding, value, run)
          if (intent.kind !== "job.retry" && String(value.id) !== intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation returned a different native job ID", true)
          if (intent.kind === "job.retry" && String(value.id) === intent.target.jobID)
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job retry did not establish a replacement native job ID", true)
          return value
        })
        // Some native response shapes omit owning pipeline metadata. Read the exact
        // acknowledged ID once; never attribute a retry by matching names or times.
        const verified = returned.pipeline && intent.kind !== "job.erase" ? returned
          : selected.kind === "bridge" ? yield* findBridge(binding, input.reader, run.id, String(returned.id)).pipe(
            Effect.map((job) => ({ id: job.id, pipeline: { id: job.runID, project_id: binding.projectID } })),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab bridge write was accepted but exact returned-ID readback failed", true)),
          ) : yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/jobs/${returned.id}`).pipe(
            Effect.flatMap((response) => ActionsGitLabNative.checked(binding, () => GitLabCommandShared.native(binding, ReturnedJob, response.data, true))),
            Effect.mapError(() => GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job write was accepted but exact readback failed", true)),
          )
        return yield* ActionsGitLabNative.checked(binding, () => {
          requireSource(binding, verified, run)
          if (String(verified.id) !== String(returned.id) || !verified.pipeline || String(verified.pipeline.id) !== run.id || String(verified.pipeline.project_id) !== binding.projectID ||
            intent.kind === "job.erase" && (!("erased_at" in verified) || !verified.erased_at))
            throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab mutation response/readback did not prove exact job ownership or erasure", true)
          return { runID: run.id, jobID: String(returned.id) }
        })
      }) }
  })
}

function requireSource(binding: Actions.Binding, value: typeof ReturnedJob.Type, run: Actions.Run) {
  if (value.pipeline && (String(value.pipeline.id) !== run.id || String(value.pipeline.project_id) !== binding.projectID ||
    value.pipeline.sha !== undefined && value.pipeline.sha !== run.commit || value.pipeline.ref !== undefined && value.pipeline.ref !== run.ref) ||
    value.commit !== undefined && value.commit.id !== run.commit || value.ref !== undefined && value.ref !== run.ref)
    throw GitLabCommandShared.error(binding, "outcome_unknown", "GitLab job mutation contradicted admitted native pipeline/source identity", true)
}

const findBridge = Effect.fn("ActionsGitLabCommands.exactBridge")(function* (binding: Actions.Binding, reader: ActionsContract.ReadAdapter, runID: string, id: string) {
  const seen = new Set<string>()
  const selection: { cursor?: string } = {}
  while (seen.size < 2000) {
    const page = yield* reader.jobs(binding, { runID, cursor: selection.cursor })
    const job = page.items.find((job) => job.id === id && job.kind === "bridge" && job.bindingID === binding.id && job.runID === runID)
    if (job) return job
    if (page.next === undefined) return yield* GitLabCommandShared.error(binding, "not_found", "GitLab exact native bridge job was not found in the owning pipeline")
    if (seen.has(page.next)) break
    seen.add(page.next)
    selection.cursor = page.next
  }
  return yield* GitLabCommandShared.error(binding, "metadata_truncated", "GitLab bridge ownership lookup exceeded bounded native pagination")
})
~~~~


## A23 — Recursos, versão e fases parciais

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A23`.


### `packages/core/src/actions/resources.ts`

Archive: `sources/packages/core/src/actions/resources.ts` · bytes: 3620 · Git blob: `7d4d4c2248900819af4ace7731982ede0f67179f` · SHA256: `cb6e5bc0a32a104f697459fb39550b0ae12dc6f68c94d38364fff903d6726b94`.

Papel da fonte: Roteamento por recurso e publicação GH schedule como source.write.


Linhas **15–66**; SHA256 do intervalo `3389be9667d03d1311c0608bd7b996e3680eed51ae192a565af25c89b4cdaa26`:

~~~~typescript
  const domain = Effect.fn("ActionsResources.domain")(function* (binding: Actions.Binding, kind: Actions.ResourceKind) {
    const services = { transport: input.transport, reader: input.reader(binding) }
    if (kind === "variables") {
      const { ActionsVariables } = yield* Effect.promise(() => import("./resources/variables"))
      return ActionsVariables.make(services)
    }
    if (kind === "environments" || kind === "deployments") {
      const { ActionsEnvironments } = yield* Effect.promise(() => import("./resources/environments"))
      return ActionsEnvironments.make(services)
    }
    if (kind === "policy") {
      const { ActionsPolicy } = yield* Effect.promise(() => import("./resources/policy"))
      return ActionsPolicy.make(services)
    }
    const { ActionsResourceGraphQL } = yield* Effect.promise(() => import("./resources/gitlab-graphql"))
    const graphql = ActionsResourceGraphQL.make(input.directory, input.proc)
    if (kind === "runners") {
      const { ActionsRunners } = yield* Effect.promise(() => import("./resources/runners"))
      return ActionsRunners.make({ ...services, graphql })
    }
    if (kind === "caches") {
      const { ActionsCaches } = yield* Effect.promise(() => import("./resources/caches"))
      return ActionsCaches.make({ ...services, graphql })
    }
    if (kind === "schedules") {
      const { ActionsSchedules } = yield* Effect.promise(() => import("./resources/schedules"))
      const { ActionsAuthoring } = yield* Effect.promise(() => import("./authoring/index"))
      const authoring = ActionsAuthoring.make(services)
      return ActionsSchedules.make({ ...services, publish: (binding, intent, source, text) => authoring.perform(binding, {
        ...intent, kind: "source.write", target: { path: source.path, ref: source.ref },
        expected: { commit: source.commit, sourceVersion: source.version },
      }, { provider: binding.provider.kind, mode: "update", text, message: "Update workflow schedule" }) })
    }
    return yield* new ActionsError({ kind: "invalid_input", message: "Resource kind is outside the selected Actions surface", disposition: "definitely_unsent" })
  })
  return {
    list: Effect.fn("ActionsResources.list")(function* (binding: Actions.Binding, query: Actions.ResourceListInput) {
      const selected = yield* domain(binding, query.kind)
      return yield* selected.list(binding, query)
    }),
    perform: Effect.fn("ActionsResources.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      if (!intent.target.resourceKind)
        return yield* new ActionsError({ kind: "invalid_input", message: "Resource mutation requires an admitted native kind", disposition: "definitely_unsent" })
      if (intent.target.resourceKind === "artifacts") {
        const { ActionsArtifactCommands } = yield* Effect.promise(() => import("./output/mutations"))
        return yield* ActionsArtifactCommands.make(input)(binding, intent, payload)
      }
      const selected = yield* domain(binding, intent.target.resourceKind)
      return yield* selected.perform(binding, intent, payload)
    }),
  }
}
~~~~


### `packages/core/src/actions/resources/native.ts`

Archive: `sources/packages/core/src/actions/resources/native.ts` · bytes: 13033 · Git blob: `948787643b01ec9d52340a7b5e913b6ca071749d` · SHA256: `a53465358378f169c381ca67f90597976732655e9da173bb8125df7601f101e1`.

Papel da fonte: Alvo estrito, fonte/versão selecionadas, autoridade e send seguro.


Linhas **55–188**; SHA256 do intervalo `3eb2bd54d2c6d19a917233c4964969d74b1a02c4852fed978731839693b4866e`:

~~~~typescript
export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
  kind: Actions.ResourceKind, operations: readonly Actions.OperationKind[], fields: readonly string[] = []) {
  input(binding, Capture, { binding, intent, payload })
  const frozen = input(binding, Schema.fromJsonString(Capture), JSON.stringify({ binding, intent, payload }))
  if (frozen.intent.binding.id !== frozen.binding.id || frozen.intent.binding.revision !== frozen.binding.revision)
    throw error(binding, "binding_stale", "Resource command admission differs from the current binding revision")
  if (frozen.intent.target.resourceKind !== kind || !operations.includes(frozen.intent.kind) ||
      Object.keys(frozen.intent.target).some((key) => !["resourceKind", "resourceID", "scope", "ref", "path", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource command target belongs to another native operation")
  sameScope(frozen.binding, frozen.intent.target.scope)
  if (frozen.intent.expected?.attempt !== undefined) throw error(binding, "invalid_input", "Resource commands have no run-attempt precondition")
  if (frozen.intent.expected?.commit !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.commit)
  if (frozen.intent.expected?.sourceVersion !== undefined) input(binding, GitHubNative.SHA, frozen.intent.expected.sourceVersion)
  return frozen
}

export function selection(binding: Actions.Binding, value: Actions.ResourceListInput, kind: Actions.ResourceKind, fields: readonly string[]) {
  input(binding, Selection, { binding, input: value })
  const frozen = input(binding, Schema.fromJsonString(Selection), JSON.stringify({ binding, input: value }))
  if (frozen.input.kind !== kind || Object.keys(frozen.input).some((key) => !["kind", "scope", ...fields].includes(key)))
    throw error(binding, "invalid_input", "Resource selection contains unsupported filters")
  sameScope(frozen.binding, frozen.input.scope)
  return frozen
}

export const before = <A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) => effect.pipe(
  Effect.mapError((cause) => error(binding, cause.kind, `Resource preflight failed (${cause.kind})`)),
)

export const get = Effect.fn("ActionsResources.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query === undefined ? {} : { query }) }))
  if (response.status !== 200) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource read was rejected")
  }
  return response
})

export const authority = Effect.fn("ActionsResources.authority")(function* (services: Services, binding: Actions.Binding, minimum = 40) {
  if (binding.provider.kind === "github") {
    const repo = yield* GitHubCommandCommon.authority(services, binding)
    return { root: repo.root, headers: repo.headers, runnerAdmin: repo.native.permissions?.admin, level: undefined, project: undefined }
  }
  const response = yield* get(services, binding, ActionsGitLabNative.projectPath(binding))
  const authority = yield* checked(binding, () => {
    const project = decode(binding, GitLabCommandNative.Project, response.data)
    if (String(project.id) !== binding.projectID) throw error(binding, "binding_stale", "Native project differs from the bound project")
    return { project, level: GitLabCommandNative.role(binding, project, minimum) }
  })
  yield* actor(services, binding)
  return { root: ActionsGitLabNative.projectPath(binding), headers: response.headers, runnerAdmin: undefined, ...authority }
})

export const actor = Effect.fn("ActionsResources.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "binding_stale", "Resource mutation requires a verified bound actor")
  const response = yield* get(services, binding, "user")
  const name = yield* checked(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : decode(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (binding.provider.kind === "github" ? name.toLowerCase() !== binding.account.toLowerCase() : name !== binding.account)
    return yield* error(binding, "binding_stale", "Native resource actor changed after admission")
})

export const send = Effect.fn("ActionsResources.send")(function* (services: Services, binding: Actions.Binding,
  request: ActionsContract.Request, statuses: readonly number[]) {
  if (binding.provider.kind === "github") return yield* GitHubCommandCommon.send(services, binding, request, statuses)
  // W1 checks the actor and write with one credential snapshot. No mutation retry.
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Native resource mutation failed", disposition)
  }))
  if (statuses.includes(response.status)) return response
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
    const cause = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, cause.kind, "Native resource mutation was rejected", "definitely_rejected")
  }
  return yield* error(binding, "outcome_unknown", "Native resource mutation returned an unqualified status", "unknown")
})

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Write occurred; native acknowledgement could not be proved", "unknown")))
}

// Snapshot versions cover decoded, explicitly selected metadata, never enrollment secrets.
export function version(value: ActionsContract.Json) {
  const canonical = (item: ActionsContract.Json): string => item !== null && typeof item === "object"
    ? Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
      : `{${Object.entries<ActionsContract.Json>(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`
    : JSON.stringify(item)
  return `native:${createHash("sha256").update(canonical(value)).digest("hex")}`
}

export function requireVersion(binding: Actions.Binding, intent: Actions.OperationIntent, current: string) {
  if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== current)
    throw error(binding, "source_conflict", "Native resource metadata changed after admission")
}

export function pagination(binding: Actions.Binding, response: ActionsContract.Response,
  selected: ReturnType<typeof GitHubNative.selection>, count: number) {
  const next = ActionsCursor.next(response.headers)
  const total = ActionsCursor.total(response.headers)
  if (count > selected.per_page || next !== undefined && (next !== selected.page + 1 || count === 0) ||
    total !== undefined && (total < (selected.page - 1) * selected.per_page + count || next === undefined && total > selected.page * selected.per_page) ||
    count === selected.per_page && next === undefined && total === undefined && response.headers["x-next-page"] === undefined && response.headers.link === undefined)
    throw error(binding, "metadata_truncated", "Native resource page lacks complete advancing pagination evidence")
  return ActionsGitLabNative.pagination(binding, selected.scope, selected.filters, response.headers, selected.page)
}

export const source = Effect.fn("ActionsResources.sourcePrecondition")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (intent.target.ref === undefined && intent.target.path === undefined && intent.expected?.commit === undefined && intent.expected?.sourceVersion === undefined) return
  if (!intent.target.ref) return yield* error(binding, "invalid_input", "Resource source preconditions require an admitted exact ref")
  const ref = yield* checked(binding, () => GitHubNative.ref(binding, intent.target.ref ?? ""))
  const response = yield* get(services, binding, binding.provider.kind === "github"
    ? `repositories/${binding.projectID}/commits/${encodeURIComponent(ref)}`
    : `projects/${binding.projectID}/repository/commits/${encodeURIComponent(ref)}`)
  const sha = yield* checked(binding, () => {
    const sha = binding.provider.kind === "github" ? decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha
      : decode(binding, Schema.Struct({ id: ActionsGitLabNative.SHA }), response.data).id
    if (intent.expected?.commit !== undefined && sha.toLowerCase() !== intent.expected.commit.toLowerCase())
      throw error(binding, "source_conflict", "Native resource ref moved after admission")
    return sha
  })
  if (!intent.target.path) {
    if (intent.expected?.sourceVersion !== undefined) return yield* error(binding, "invalid_input", "Resource sourceVersion requires an admitted exact path")
    return { commit: sha }
  }
  yield* checked(binding, () => GitHubNative.path(binding, intent.target.path ?? ""))
  const value = yield* before(binding, services.reader.source(binding, { path: intent.target.path, ref: sha }))
  if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== sha || value.commit?.toLowerCase() !== sha.toLowerCase() ||
    intent.expected?.sourceVersion !== undefined && value.version.toLowerCase() !== intent.expected.sourceVersion.toLowerCase())
    return yield* error(binding, "source_conflict", "Native resource source identity changed after admission")
  return { commit: sha, source: value }
})
~~~~


### `packages/core/src/actions/resources/config-common.ts`

Archive: `sources/packages/core/src/actions/resources/config-common.ts` · bytes: 12418 · Git blob: `091480332aea03f03b8ab3cfcd21dfbe8b27fa84` · SHA256: `aee5e20b10091ab8c4c20daf21c72e45a583e7cfc162b0a5e5e162a61e5b7afd`.

Papel da fonte: Plano em fases: falha após primeira escrita é unknown, sem rollback.


Linhas **23–169**; SHA256 do intervalo `30984567ff2750f4f571180bee6f8a4ab2ae6722078e325cd043ed3d8043b817`:

~~~~typescript
})

export function fail(binding: Actions.Binding, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "definitely_unsent", retryAfter?: number) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind, disposition,
    ...(retryAfter === undefined ? {} : { retryAfter }) })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, value: unknown, native = false): S["Type"] {
  const parsed = Schema.decodeUnknownOption(schema)(value, native ? {} : { onExcessProperty: "error" })
  if (Option.isNone(parsed)) throw fail(binding, native ? "transport_failed" : "invalid_input", native
    ? "Provider returned invalid configuration metadata" : "Configuration payload does not match its strict native form")
  return parsed.value
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError ? cause : fail(binding, "invalid_input", "Configuration input could not be validated") })
}

export function capture(binding: Actions.Binding, intent: Actions.OperationIntent, kind: Actions.ResourceKind, review = false) {
  const frozen = decode(binding, Capture, structuredClone({ binding, intent }))
  if (intent.binding.id !== binding.id || intent.binding.revision !== binding.revision)
    throw fail(binding, "binding_stale", "Configuration admission does not match the current binding revision")
  if ((!review && !["resource.create", "resource.update", "resource.delete"].includes(intent.kind)) ||
      (review && intent.kind !== "deployment.review") || intent.target.resourceKind !== kind)
    throw fail(binding, "invalid_input", "Configuration intent belongs to another operation or resource domain")
  const allowed = review ? ["resourceKind", "resourceID", "scope", "runID"] : ["resourceKind", "resourceID", "scope"]
  if (Object.keys(intent.target).some((key) => !allowed.includes(key)) || !intent.target.resourceID || intent.target.scope === undefined)
    throw fail(binding, "invalid_input", "Configuration target requires an exact native name and scope")
  decode(binding, Text, intent.target.resourceID)
  decode(binding, Text, intent.target.scope)
  if (Object.keys(intent.expected ?? {}).some((key) => key !== "resourceVersion" && !(review && ["commit", "attempt"].includes(key))))
    throw fail(binding, "invalid_input", "Configuration intent contains an unrelated precondition")
  root(binding)
  return frozen
}

export function selection(binding: Actions.Binding, input: Actions.ResourceListInput, kind: Actions.ResourceKind, allowed: readonly string[]) {
  const frozen = decode(binding, Actions.ResourceListInput, structuredClone(input))
  if (frozen.kind !== kind || Object.keys(frozen).some((key) => !["kind", "cursor", "limit", ...allowed].includes(key)))
    throw fail(binding, "invalid_input", "Configuration list contains an unsupported selection")
  root(binding)
  return frozen
}

export function root(binding: Actions.Binding) {
  if (!/^[1-9]\d{0,127}$/.test(binding.projectID)) throw fail(binding, "invalid_input", "Configuration requires an immutable native project ID")
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${binding.projectID}`
}

function httpKind(status: number): Actions.ErrorKind {
  return status === 401 ? "not_authenticated" : status === 403 ? "permission_denied" : status === 404 ? "not_found"
    : status === 409 || status === 412 ? "source_conflict" : status === 422 || status === 400 ? "invalid_input"
    : status === 429 ? "rate_limited" : "transport_failed"
}

export const get = Effect.fn("ActionsConfig.get")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, missing = false): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const response = yield* services.transport.request(binding, request).pipe(Effect.catch((error) =>
    missing && error.kind === "not_found" && error.disposition === "definitely_rejected"
      ? Effect.succeed({ status: 404, headers: {}, data: null })
      : Effect.fail(fail(binding, error.kind, `Configuration preflight failed (${error.kind})`, "definitely_unsent", error.retryAfter))))
  if (response.status !== 200 && !(missing && response.status === 404))
    return yield* fail(binding, httpKind(response.status), `Configuration read returned HTTP ${response.status}`)
  return response
})

export const actor = Effect.fn("ActionsConfig.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* fail(binding, "binding_stale", "Configuration requires a verified bound account")
  const response = yield* get(services, binding, { method: "GET", path: "user" })
  const native = yield* guard(binding, () => binding.provider.kind === "github"
    ? decode(binding, Schema.Struct({ id: ID, login: Text }), response.data, true)
    : decode(binding, Schema.Struct({ id: ID, username: Text }), response.data, true))
  const account = "login" in native ? native.login : native.username
  if (typeof account !== "string" || (binding.provider.kind === "github" ? account.toLowerCase() !== binding.account.toLowerCase() : account !== binding.account))
    return yield* fail(binding, "binding_stale", "Signed-in configuration account changed after admission")
  return String(native.id)
})

export const project = Effect.fn("ActionsConfig.project")(function* (services: Services, binding: Actions.Binding, write = false, admin = false) {
  const path = yield* guard(binding, () => root(binding))
  const response = yield* get(services, binding, { method: "GET", path })
  const native = yield* guard(binding, () => decode(binding, Project, response.data, true))
  if (String(native.id) !== binding.projectID) return yield* fail(binding, "binding_stale", "Native configuration project differs from binding")
  if (write) {
    yield* actor(services, binding)
    const levels = [native.permissions?.project_access, native.permissions?.group_access]
      .filter((access) => access !== undefined).map((access) => access?.access_level ?? 0)
    if (native.archived || (binding.provider.kind === "github"
      ? native.permissions?.[admin ? "admin" : "push"] === false
      : levels.length === 2 && Math.max(...levels) < 40))
      return yield* fail(binding, "permission_denied", "Observed project role denies this configuration write")
    const scopes = response.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
    if (binding.provider.kind === "github" && scopes?.length && !scopes.includes("repo") && !(native.private === false && scopes.includes("public_repo")))
      return yield* fail(binding, "permission_denied", "Observed OAuth scopes deny repository configuration writes")
  }
  return { path, native, response }
})

export function version(binding: Actions.Binding, expected: Actions.OperationExpected | undefined, response: ActionsContract.Response, metadata: ActionsContract.Json) {
  const current = JSON.stringify(metadata)
  if (expected?.resourceVersion !== undefined && expected.resourceVersion !== current && expected.resourceVersion !== response.headers.etag)
    throw fail(binding, "source_conflict", "Native configuration identity, scope or version changed after admission")
  return response.headers.etag ?? current
}

export function identity(binding: Actions.Binding, name: string, scope: string, nativeID?: string) {
  return { provider: binding.provider.kind, projectID: binding.projectID, bindingID: binding.id,
    bindingRevision: binding.revision, name, scope, ...(nativeID === undefined ? {} : { id: nativeID }) }
}

export function page(binding: Actions.Binding, input: Actions.ResourceListInput, phase = "") {
  const limit = ActionsCursor.limit(input.limit)
  const scope = `config:${input.kind}:${phase}`
  const filters = { scope: input.scope, resourceID: input.resourceID, query: input.query, per_page: limit }
  return { limit, scope, filters, number: ActionsCursor.page(binding, scope, filters, input.cursor) }
}

export function pagination(binding: Actions.Binding, selected: ReturnType<typeof page>, response: ActionsContract.Response, count: number, total?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  if (count > selected.limit || (next !== undefined && (next !== selected.number + 1 || count === 0)) ||
      (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || (headerTotal !== undefined && total !== headerTotal) ||
        (count > 0 && total < (selected.number - 1) * selected.limit + count) ||
        (count === 0 && total > (selected.number - 1) * selected.limit) ||
        (next === undefined && total > selected.number * selected.limit) || (next !== undefined && total <= selected.number * selected.limit))) ||
      (next === undefined && total === undefined && count === selected.limit && response.headers.link === undefined && response.headers["x-next-page"] === undefined))
    throw fail(binding, "metadata_truncated", "Provider configuration pagination is incomplete")
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }), capturedAt: Date.now() }
}

export const send = Effect.fn("ActionsConfig.send")(function* (services: Services, binding: Actions.Binding, request: ActionsContract.Request, statuses: readonly number[]) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, request).pipe(Effect.mapError((error) =>
    fail(binding, error.disposition === "definitely_unsent" || error.disposition === "definitely_rejected" ? error.kind : "outcome_unknown",
      "Provider configuration write failed", error.disposition ?? "unknown", error.retryAfter)))
  if (statuses.includes(response.status)) return response
  const rejected = [400, 401, 403, 404, 409, 412, 422, 429].includes(response.status)
  return yield* fail(binding, rejected ? httpKind(response.status) : "outcome_unknown", `Provider configuration write returned HTTP ${response.status}`,
    rejected ? "definitely_rejected" : "unknown")
})

export const stages = Effect.fn("ActionsConfig.stages")(function* (services: Services, binding: Actions.Binding,
  requests: readonly { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[]) {
  yield* Effect.forEach(requests, (stage, index) => send(services, binding, stage.request, stage.statuses).pipe(
    Effect.mapError((error) => index === 0 ? fail(binding, error.kind, `Environment phase '${stage.phase}' failed (${error.kind})`, error.disposition ?? "unknown", error.retryAfter)
      : fail(binding, "outcome_unknown", `Environment configuration partially applied; phase '${stage.phase}' failed (${error.kind}); read back before another operation`, "unknown", error.retryAfter)),
  ), { concurrency: 1, discard: true })
})
~~~~


## A24 — Variables/secrets: scope, redaction e criptografia

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A24`.


### `packages/core/src/actions/resources/variables.ts`

Archive: `sources/packages/core/src/actions/resources/variables.ts` · bytes: 17420 · Git blob: `2b8bf42f1867f93bd05188893c5a1d49fa6b0c93` · SHA256: `4483cec419b1ac22628dd01c1386b9470fcd5511b2d0cd9a956b9736cfc2ca4e`.

Papel da fonte: Identidade key+scope, hidden/masked, mutações e sealed box sem persistir valor no ack.


Linhas **15–207**; SHA256 do intervalo `a76b265cb29a4675dc45a9920533f25a30eb019b9fc6c3c513ba6c954985335a`:

~~~~typescript
const Delete = Schema.Struct(Identity)
const Form = Schema.Struct({ ...Identity, value: C.Value,
  protected: Schema.optionalKey(Schema.Boolean), masked: Schema.optionalKey(Schema.Boolean), hidden: Schema.optionalKey(Schema.Boolean) })
// https://docs.gitlab.com/api/project_level_variables/ returns sensitive values.
// Project them away before metadata reaches Resource or any version fingerprint.
const GitLabVariable = Schema.Struct({ key: C.Text, environment_scope: C.Text, protected: Schema.Boolean, masked: Schema.Boolean,
  hidden: Schema.optionalKey(Schema.Boolean), variable_type: Schema.Literals(["env_var", "file"]), raw: Schema.optionalKey(Schema.Boolean) })
const PublicKey = Schema.Struct({ key_id: C.Text, key: Schema.String })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsVariables.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => C.selection(binding, input, "variables", ["scope", "resourceID", "query"]))
      const project = yield* C.project(services, binding)
      if (binding.provider.kind === "gitlab") {
        const selected = yield* C.guard(binding, () => C.page(binding, frozen))
        const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/variables`, query: { page: selected.number, per_page: selected.limit } })
        return yield* C.guard(binding, () => {
          const native = C.decode(binding, Schema.Array(GitLabVariable), response.data, true)
          const raw = C.decode(binding, Schema.Array(Schema.Json), response.data, true)
          const items = native.map((item, index) => gitlabResource(binding, item, raw[index]))
            .filter((item) => (frozen.scope === undefined || item.scope === frozen.scope) && (frozen.resourceID === undefined || item.name === frozen.resourceID) &&
              (frozen.query === undefined || item.name.includes(frozen.query)))
          return { items, ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }
        })
      }
      const scope = frozen.scope ?? "Repository"
      const path = yield* githubScope(services, binding, project.path, scope)
      const page = yield* ActionsVariableGitHubPage.list(services, binding, { ...frozen, scope }, path)
      return yield* C.guard(binding, () => {
        return { items: page.rows.map((item) => githubResource(binding, item, scope)).filter((item) =>
          (frozen.resourceID === undefined || item.name === frozen.resourceID) && (frozen.query === undefined || item.name.includes(frozen.query))),
          ...(page.next === undefined ? {} : { next: page.next }), capturedAt: page.capturedAt }
      })
    }),
    perform: Effect.fn("ActionsVariables.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "variables")
        const input = C.decode(binding, intent.kind === "resource.delete" ? Delete : Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind) throw C.fail(binding, "intent_conflict", "Variable provider changed after operation admission")
        const renamed = input.name !== intent.target.resourceID
        const moved = input.scope !== intent.target.scope
        if ((renamed || moved) && intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Variable create/delete identity differs from admission")
        if (renamed && (input.provider !== "github" || input.type !== "Variable"))
          throw C.fail(binding, "capability_unavailable", "Field 'name' cannot rename this native variable or secret in one operation")
        if (moved && input.provider !== "gitlab")
          throw C.fail(binding, "capability_unavailable", "Field 'scope' requires separate GitHub create/delete operations")
        if ((renamed || moved) && intent.expected?.resourceVersion === undefined)
          throw C.fail(binding, "source_conflict", "Changing variable key or scope requires an admitted native resource version")
        if (!/^[A-Za-z0-9_]{1,255}$/.test(input.name) || (input.provider === "github" && (!/^[A-Za-z_]/.test(input.name) || /^GITHUB_/i.test(input.name))))
          throw C.fail(binding, "invalid_input", "Variable name is not a native configuration key")
        if (input.provider === "github" && ["protected", "masked", "hidden"].some((key) => key in input))
          throw C.fail(binding, "invalid_input", "GitHub has no GitLab variable flag fields")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true)
      if (frozen.binding.provider.kind === "github") return yield* githubWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
      return yield* gitlabWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
    }),
  }
}

function githubResource(binding: Actions.Binding, item: typeof ActionsVariableGitHubPage.Secret.Type | typeof ActionsVariableGitHubPage.Variable.Type, scope: string): Actions.Resource {
  const type = "value" in item ? "Variable" : "Secret"
  const metadata = { name: item.name, scope, type, created_at: item.created_at, updated_at: item.updated_at }
  return { id: JSON.stringify([item.name, scope, type]), bindingID: binding.id, kind: "variables", name: item.name, scope,
    sensitive: type === "Secret", owner: "Project", data: { ...metadata, nativeIdentity: C.identity(binding, item.name, scope),
      resourceVersion: JSON.stringify(metadata), ...(type === "Secret" ? { redacted: true } : "value" in item ? { value: item.value } : {}) } }
}

function gitlabResource(binding: Actions.Binding, item: typeof GitLabVariable.Type, raw: ActionsContract.Json): Actions.Resource {
  const sensitive = item.masked || item.hidden !== false
  const type = sensitive ? "Secret" : "Variable"
  const value = sensitive ? undefined : C.decode(binding, Schema.Struct({ value: Schema.String }), raw, true).value
  const metadata = { name: item.key, scope: item.environment_scope, type, protected: item.protected, masked: item.masked,
    ...(item.hidden === undefined ? {} : { hidden: item.hidden }), variable_type: item.variable_type, ...(item.raw === undefined ? {} : { raw: item.raw }) }
  return { id: JSON.stringify([item.key, item.environment_scope, type]), bindingID: binding.id, kind: "variables", name: item.key,
    scope: item.environment_scope, owner: "Project", sensitive, data: { ...metadata,
      nativeIdentity: C.identity(binding, item.key, item.environment_scope), resourceVersion: JSON.stringify(metadata), redacted: sensitive,
      flags: [item.protected ? "Protected" : "", item.masked ? "Masked" : "", item.hidden ? "Hidden" : ""].filter(Boolean),
      ...(item.hidden === undefined ? { sourceUnresolved: "Native hidden flag was not observed; value stays redacted" } : {}),
      ...(value === undefined ? {} : { value }) } }
}

const githubScope = Effect.fn("ActionsVariables.githubScope")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, scope: string) {
  if (scope === "Repository") return `${root}/actions`
  yield* C.guard(binding, () => C.decode(binding, C.Text, scope))
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(scope)}` })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, name: C.Text }), response.data, true))
  if (native.name !== scope) return yield* C.fail(binding, "source_conflict", "Native environment scope changed")
  return `${root}/environments/${encodeURIComponent(scope)}`
})

const githubWrite = Effect.fn("ActionsVariables.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  const name = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.resourceID))
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const path = yield* githubScope(services, binding, root, scope)
  const collection = `${path}/${input.type === "Secret" ? "secrets" : "variables"}`
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(name)}` }, true)
  if (intent.kind === "resource.create" && response.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable already exists at the admitted key and scope")
  if (intent.kind !== "resource.create" && response.status === 404) return yield* C.fail(binding, "source_conflict", "Variable disappeared from the admitted key and scope")
  if (response.status === 200) yield* C.guard(binding, () => {
    const native = input.type === "Secret" ? C.decode(binding, ActionsVariableGitHubPage.Secret, response.data, true)
      : C.decode(binding, ActionsVariableGitHubPage.Variable, response.data, true)
    if (native.name !== name) throw C.fail(binding, "source_conflict", "Native variable key changed")
    C.version(binding, intent.expected, response, { name: native.name, scope, type: input.type,
      created_at: native.created_at, updated_at: native.updated_at })
  })
  if (name !== input.name) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}` }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable rename destination already exists")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (input.type === "Secret") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/public-key` })
    const key = yield* C.guard(binding, () => C.decode(binding, PublicKey, response.data, true))
    const { default: sodium } = yield* Effect.tryPromise({ try: () => import("libsodium-wrappers"),
      catch: () => C.fail(binding, "capability_unavailable", "Secret encryption requires libsodium-wrappers@0.7.15") })
    yield* Effect.tryPromise({ try: () => sodium.ready,
      catch: () => C.fail(binding, "capability_unavailable", "Native libsodium secret encryption could not initialize") })
    const encrypted = yield* Effect.try({ try: () => {
      const publicKey = sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL)
      if (publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) throw C.fail(binding, "transport_failed", "Provider public key has invalid length")
      const bytes = new TextEncoder().encode(input.value)
      // Standard libsodium sealed box, not a hand-built crypto approximation.
      try { return sodium.to_base64(sodium.crypto_box_seal(bytes, publicKey), sodium.base64_variants.ORIGINAL) }
      finally { sodium.memzero(bytes) }
    }, catch: (cause) => C.fail(binding, cause instanceof ActionsError ? cause.kind : "transport_failed", "Native secret public key could not be encrypted") })
    yield* C.send(services, binding, { method: "PUT", path: `${collection}/${encodeURIComponent(input.name)}`, body: { encrypted_value: encrypted, key_id: key.key_id } }, [201, 204])
    return { acknowledgement: { resourceID: input.name } }
  }
  yield* C.send(services, binding, { method: intent.kind === "resource.create" ? "POST" : "PATCH",
    path: intent.kind === "resource.create" ? collection : `${collection}/${encodeURIComponent(name)}`, body: { name: input.name, value: input.value } }, [201, 204])
  return { acknowledgement: { resourceID: input.name } }
})

const gitlabWrite = Effect.fn("ActionsVariables.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  // Environment scopes are exact native strings, including a literal 'Repository'.
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const collection = `${root}/variables`
  const query = { "filter[environment_scope]": scope }
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`, query }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Variable existence changed at the admitted key and scope")
  const existing = response.status === 200 ? yield* C.guard(binding, () => {
    const native = C.decode(binding, GitLabVariable, response.data, true)
    if (native.key !== input.name || native.environment_scope !== scope) throw C.fail(binding, "source_conflict", "Native variable key or scope changed")
    const resource = gitlabResource(binding, native, response.data)
    if (intent.kind === "resource.delete" && resource.sensitive !== (input.type === "Secret"))
      throw C.fail(binding, "source_conflict", "Native variable sensitivity changed after admission")
    const metadata = C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true)
    if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== metadata.resourceVersion)
      throw C.fail(binding, "source_conflict", "Native variable controls or scope changed after admission")
    return native
  }) : undefined
  if (scope !== input.scope) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`,
      query: { "filter[environment_scope]": input.scope } }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable destination scope already contains this native key")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}`, query }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (existing && input.hidden !== undefined && input.hidden !== existing.hidden)
    return yield* C.fail(binding, "capability_unavailable", "GitLab hidden is create-only; existing hiding state must be retained")
  const masked = input.masked ?? (input.type === "Secret")
  if (input.type === "Secret" && !masked && !input.hidden) return yield* C.fail(binding, "invalid_input", "GitLab has no independent Secret type; Secret requires masked or hidden controls")
  if (input.hidden && !masked) return yield* C.fail(binding, "invalid_input", "GitLab hidden creation requires masked_and_hidden")
  if (!existing && input.hidden) {
    const response = yield* C.get(services, binding, { method: "GET", path: "metadata" })
    const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ version: C.Text }), response.data, true))
    const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(native.version)
    if (!version || Number(version[1]) < 17 || (Number(version[1]) === 17 && Number(version[2]) < 4))
      return yield* C.fail(binding, "capability_unavailable", "Hidden variable creation requires observed GitLab 17.4 or newer")
  }
  yield* C.send(services, binding, { method: existing ? "PUT" : "POST", path: existing ? `${collection}/${encodeURIComponent(input.name)}` : collection,
    ...(existing ? { query } : {}), body: { ...(existing ? {} : { key: input.name }), value: input.value, environment_scope: input.scope,
      protected: input.protected ?? existing?.protected ?? false, masked,
      ...(input.hidden && !existing ? { masked_and_hidden: true } : {}),
      variable_type: existing?.variable_type ?? "env_var", ...(existing?.raw === undefined ? {} : { raw: existing.raw }) } }, [200, 201])
  // GitLab echoes values after writes. Only admitted native identity may leave this callback.
  return { acknowledgement: { resourceID: input.name } }
})
~~~~


### `packages/core/src/actions/resources/config-variable-github-page.ts`

Archive: `sources/packages/core/src/actions/resources/config-variable-github-page.ts` · bytes: 4453 · Git blob: `0ac96117ca2d882142c04ba700efac2b42e60073` · SHA256: `840684c984c0c57f586008b8d3e357be5bb1d8f298dc1bb64e4fe1c8a452ae20`.

Papel da fonte: Dois fluxos paginados GH vars/secrets sob limite e cursor composto.


Linhas **9–59**; SHA256 do intervalo `bd030bfdeb5960401153e925583461975ecd2221d14fb5c22545eaf3de2af28b`:

~~~~typescript
const C = ActionsConfigCommon
export const Variable = Schema.Struct({ name: C.Text, value: Schema.String, created_at: Schema.String, updated_at: Schema.String })
export const Secret = Schema.Struct({ name: C.Text, created_at: Schema.String, updated_at: Schema.String })
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Cursor = Schema.Struct({ variable: Schema.optionalKey(Schema.String), secret: Schema.optionalKey(Schema.String) })

export const list = Effect.fn("ActionsVariables.githubPage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const budget = yield* C.guard(binding, () => ActionsCursor.limit(input.limit))
  if (budget === 1) return yield* one(services, binding, input, path)
  const cursor = yield* C.guard(binding, () => {
    if (input.cursor === undefined) return undefined
    if (!input.cursor.startsWith("combined:") || input.cursor.length > 8192) throw C.fail(binding, "invalid_input", "Invalid combined variable cursor")
    const value = C.decode(binding, Schema.fromJsonString(Cursor), Buffer.from(input.cursor.slice(9), "base64url").toString("utf8"))
    if (!value.variable && !value.secret) throw C.fail(binding, "invalid_input", "Combined variable cursor has no native continuation")
    return value
  })
  const pages = yield* Effect.forEach((["variable", "secret"] as const).filter((kind) => cursor === undefined || cursor[kind] !== undefined),
    (kind) => read(services, binding, { ...input, limit: Math.floor(budget / 2), cursor: cursor?.[kind] }, path, kind, budget), { concurrency: 1 })
  const next = Object.fromEntries(pages.flatMap((page) => page.next === undefined ? [] : [[page.kind, page.next]]))
  return { rows: pages.flatMap((page) => page.rows), capturedAt: Date.now(),
    ...(Object.keys(next).length ? { next: `combined:${Buffer.from(JSON.stringify(next)).toString("base64url")}` } : {}) }
})

const read = Effect.fn("ActionsVariables.githubNativePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string, kind: "variable" | "secret", budget: number) {
  const selected = yield* C.guard(binding, () => C.page(binding, input, `${kind}:budget${budget}`))
  const response = yield* C.get(services, binding, { method: "GET", path: `${path}/${kind === "secret" ? "secrets" : "variables"}`,
    query: { page: selected.number, per_page: selected.limit } })
  return yield* C.guard(binding, () => {
    const native = kind === "secret"
      ? C.decode(binding, Schema.Struct({ total_count: Count, secrets: Schema.Array(Secret) }), response.data, true)
      : C.decode(binding, Schema.Struct({ total_count: Count, variables: Schema.Array(Variable) }), response.data, true)
    const rows = "secrets" in native ? native.secrets : native.variables
    return { rows, kind, ...C.pagination(binding, selected, response, rows.length, native.total_count) }
  })
})

const one = Effect.fn("ActionsVariables.githubSinglePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const kind = input.cursor?.startsWith("secret:") ? "secret" : "variable"
  const page = yield* read(services, binding, { ...input, cursor: input.cursor?.replace(/^(?:secret|variable):/, "") }, path, kind, 1)
  if (kind === "secret") return { rows: page.rows, capturedAt: page.capturedAt, ...(page.next ? { next: `secret:${page.next}` } : {}) }
  const secretSelection = yield* C.guard(binding, () => C.page(binding, { ...input, cursor: undefined }, "secret:budget1"))
  if (page.rows.length === 0 && page.next === undefined) {
    const secrets = yield* read(services, binding, { ...input, cursor: undefined }, path, "secret", 1)
    return { rows: secrets.rows, capturedAt: secrets.capturedAt, ...(secrets.next ? { next: `secret:${secrets.next}` } : {}) }
  }
  return { rows: page.rows, capturedAt: page.capturedAt, next: page.next ? `variable:${page.next}`
    : `secret:${ActionsCursor.encode(binding, secretSelection.scope, secretSelection.filters, 1)}` }
})
~~~~


### `packages/core/src/actions/resources/config-sodium.d.ts`

Archive: `sources/packages/core/src/actions/resources/config-sodium.d.ts` · bytes: 812 · Git blob: `8580645c5635998ff84dd397e88eb3bd131826ef` · SHA256: `88816907c0381d3ba2094c97a9572036f6ce757e10d2498b29d14150f4f5ebba`.

Papel da fonte: Tipagem estreita do wrapper libsodium; não é implementação criptográfica.


Linhas **1–15**; SHA256 do intervalo `88816907c0381d3ba2094c97a9572036f6ce757e10d2498b29d14150f4f5ebba`:

~~~~typescript
// Narrow declaration for the pinned lazy runtime dependency; no crypto implementation lives here.
declare module "libsodium-wrappers" {
  const sodium: {
    readonly ready: Promise<void>
    readonly crypto_box_PUBLICKEYBYTES: number
    readonly base64_variants: { readonly ORIGINAL: number }
    readonly from_base64: (value: string, variant: number) => Uint8Array
    readonly to_base64: (value: Uint8Array, variant: number) => string
    readonly crypto_box_seal: (value: Uint8Array, publicKey: Uint8Array) => Uint8Array
    readonly memzero: (value: Uint8Array) => void
    readonly crypto_box_keypair: () => { publicKey: Uint8Array; privateKey: Uint8Array }
    readonly crypto_box_seal_open: (value: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) => Uint8Array
  }
  export default sodium
}
~~~~


## A25 — Environments e reviewers representáveis

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A25`.


### `packages/core/src/actions/resources/config-environment-schema.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-schema.ts` · bytes: 2818 · Git blob: `68c018139273310ac5cfd10d220b965b09ea62da` · SHA256: `86af948872e70184a9ed866b6c5cda97809f680ca887cc177934fa9ace399b2a`.

Papel da fonte: Schemas nativos GH/GL para regras, refs e formas de reviewers.


Linhas **5–37**; SHA256 do intervalo `54d3ae19befc889dd55e395c3db954fde2c64753c4dca26d33b1bd7351471c6e`:

~~~~typescript

const C = ActionsConfigCommon
// Native contracts: https://docs.github.com/en/rest/deployments/environments
// https://docs.gitlab.com/api/environments/ and /api/protected_environments/.
const Reviewer = Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({
  id: C.ID, login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text),
}) })
export const GitHub = Schema.Struct({ id: C.ID, name: C.Text, created_at: Schema.String, updated_at: Schema.String,
  protection_rules: Schema.Array(Schema.Struct({ type: C.Text, id: Schema.optionalKey(C.ID),
    wait_timer: Schema.optionalKey(Schema.Int), prevent_self_review: Schema.optionalKey(Schema.Boolean),
    reviewers: Schema.optionalKey(Schema.Array(Reviewer)) })),
  deployment_branch_policy: Schema.NullOr(Schema.Struct({ protected_branches: Schema.Boolean, custom_branch_policies: Schema.Boolean })),
})
export const BranchPolicy = Schema.Struct({ id: C.ID, name: C.Text, type: Schema.Literals(["branch", "tag"]) })
export const BranchPolicies = Schema.Struct({ total_count: Schema.Int, branch_policies: Schema.Array(BranchPolicy) })
export const GitLab = Schema.Struct({ id: C.ID, name: C.Text, state: C.Text,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)), tier: Schema.optionalKey(Schema.NullOr(Schema.String)),
  updated_at: Schema.optionalKey(Schema.String),
})
export const Access = Schema.Struct({ id: C.ID, user_id: Schema.optionalKey(Schema.NullOr(C.ID)),
  group_id: Schema.optionalKey(Schema.NullOr(C.ID)), access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  access_level_description: Schema.optionalKey(Schema.String), required_approvals: Schema.optionalKey(Schema.Int) })
export const Protected = Schema.Struct({ name: C.Text, deploy_access_levels: Schema.Array(Access),
  required_approval_count: Schema.optionalKey(Schema.Int), approval_rules: Schema.optionalKey(Schema.Array(Access)) })
export const Delete = Schema.Struct({ provider: C.Provider, name: C.Text })
export const Form = Schema.Struct({ provider: C.Provider, name: C.Text, reviewers: Schema.String, refs: C.Text,
  timer: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 43_200 }))), preventSelfReview: Schema.Boolean,
  description: Schema.optionalKey(Schema.String), tier: Schema.optionalKey(Schema.Literals(["production", "staging", "testing", "development", "other"])) })
export const Review = Schema.Struct({ provider: C.Provider, decision: Schema.Literals(["Approve", "Reject"]), comment: C.Value })

export function patterns(refs: string) {
  return Array.from(new Set(refs.split(",").map((ref) => ref.trim()).filter(Boolean)))
}
~~~~


### `packages/core/src/actions/resources/config-environment-reviewers.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-reviewers.ts` · bytes: 2604 · Git blob: `9110df8c9a839c9db3476ecdfbfe6e9d9955bc6e` · SHA256: `64222df345434d4400ec50653b25f03b94252d2bf0ecee5a8090ffa24f34c65e`.

Papel da fonte: Wildcards/grupos/múltiplas aprovações podem ser read-only; lookup user exato.


Linhas **6–32**; SHA256 do intervalo `597bcfba0604b51d59bcb2a9adf4b006085907aa06c3c2ff9ca25075f78a0510`:

~~~~typescript
import { ActionsEnvironmentGitLab } from "./config-environment-gitlab"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

export const read = Effect.fn("ActionsEnvironmentReviewers.read")(function* (services: ActionsConfigCommon.Services,
  binding: Actions.Binding, policies: readonly (typeof ActionsEnvironmentSchema.Protected.Type)[], name: string) {
  const matching = policies.filter((policy) => ActionsEnvironmentGitLab.matches(policy.name, name))
  if (matching.some((policy) => policy.name.includes("*"))) return { reviewersReadOnly: true }
  const exact = matching.filter((policy) => policy.name === name)
  if (exact.length !== 1) return { reviewersReadOnly: true }
  const policy = exact[0]
  if (policy.required_approval_count !== undefined && policy.approval_rules === undefined && policy.required_approval_count !== 0)
    return { reviewersReadOnly: true }
  const rules = policy.approval_rules ?? []
  if (rules.length > 6 || rules.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return { reviewersReadOnly: true }
  const ids = yield* ActionsConfigCommon.guard(binding, () => rules.map((rule) => ActionsConfigCommon.decode(binding, ActionsConfigCommon.ID, rule.user_id, true)))
  const usernames = yield* Effect.forEach(ids, (id) => Effect.gen(function* () {
    const response = yield* ActionsConfigCommon.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(String(id))}` })
    const user = yield* ActionsConfigCommon.guard(binding, () => ActionsConfigCommon.decode(binding,
      Schema.Struct({ id: ActionsConfigCommon.ID, username: ActionsConfigCommon.Text }), response.data, true))
    if (String(user.id) !== String(id)) return yield* ActionsConfigCommon.fail(binding, "source_conflict", "GitLab reviewer lookup returned a different native ID")
    if (!/^[A-Za-z0-9_.-]+$/.test(user.username)) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer username cannot be represented by the configuration form")
    return user.username
  }), { concurrency: 1 })
  if (new Set(usernames).size !== usernames.length) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer usernames are not distinct")
  return { reviewers: usernames.join(","), reviewersReadOnly: false }
})
~~~~


### `packages/core/src/actions/resources/config-environment-github.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-github.ts` · bytes: 10164 · Git blob: `258f9fcb61eeb90c457b2f116ebdbd406bbb340e` · SHA256: `fc9f6dab5045d664abe9fa5b5c665c190a70039b2bc4484a6829d274de5c2dbc`.

Papel da fonte: Branch/tag policies em fases, inventário limitado e timer não inventado.


Linhas **10–114**; SHA256 do intervalo `705745e6dd12e0e09e0ebf37cb43054f38970182f5f257b1a138d345c0b01869`:

~~~~typescript
const S = ActionsEnvironmentSchema

export const policies = Effect.fn("ActionsEnvironments.githubPolicies")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string,
  environment: typeof S.GitHub.Type) {
  if (!environment.deployment_branch_policy?.custom_branch_policies) return []
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(environment.name)}/deployment-branch-policies`,
    query: { per_page: 100, page: 1 } })
  return yield* C.guard(binding, () => {
    const value = C.decode(binding, S.BranchPolicies, response.data, true)
    if (value.branch_policies.length !== value.total_count || response.headers.link?.includes('rel="next"') || response.headers["x-next-page"])
      throw C.fail(binding, "metadata_truncated", "Environment ref policies exceed the bounded configuration read")
    return value.branch_policies
  })
})

export function resource(binding: Actions.Binding, environment: typeof S.GitHub.Type, refs: readonly (typeof S.BranchPolicy.Type)[]): Actions.Resource {
  const reviewers = environment.protection_rules.find((rule) => rule.type === "required_reviewers")
  const names = (reviewers?.reviewers ?? []).map((reviewer) => reviewer.type === "User" ? reviewer.reviewer.login
    : reviewer.reviewer.slug === undefined ? undefined : `team:${reviewer.reviewer.slug}`)
  const metadata = { ...environment, refPolicies: refs }
  return { id: environment.name, bindingID: binding.id, kind: "environments", name: environment.name, scope: "Repository", owner: "Project",
    data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Repository", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), reviewers: names.filter((name) => name !== undefined).join(", "),
      reviewerIdentities: (reviewers?.reviewers ?? []).map((reviewer) => ({ type: reviewer.type, id: String(reviewer.reviewer.id),
        ...(reviewer.reviewer.login ? { login: reviewer.reviewer.login } : {}), ...(reviewer.reviewer.slug ? { slug: reviewer.reviewer.slug } : {}) })),
      ...(names.some((name) => name === undefined) ? { sourceUnresolved: "Native reviewer name was not returned; use reviewerIdentities" } : {}),
      refs: environment.deployment_branch_policy === null ? "*" : environment.deployment_branch_policy.protected_branches ? "Protected branches"
        : Array.from(new Set(refs.map((policy) => policy.name))).join(", "),
      timer: environment.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer ?? 0,
      ...(reviewers?.prevent_self_review === undefined ? {} : { preventSelfReview: reviewers.prevent_self_review }),
      description: "Repository deployment environment" } }
}

export const write = Effect.fn("ActionsEnvironments.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string) {
  if (intent.target.scope !== "Repository") return yield* C.fail(binding, "invalid_input", "GitHub environment scope must be Repository")
  const path = `${root}/environments/${encodeURIComponent(input.name)}`
  const response = yield* C.get(services, binding, { method: "GET", path }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const native = response.status === 200 ? yield* C.guard(binding, () => C.decode(binding, S.GitHub, response.data, true)) : undefined
  if (native && native.name !== input.name) return yield* C.fail(binding, "source_conflict", "Native environment name changed after admission")
  const current = native ? yield* policies(services, binding, root, native) : []
  if (native) yield* C.guard(binding, () => C.version(binding, intent.expected, response, { ...native, refPolicies: current }))
  if (!native && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.description !== undefined || input.tier !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitHub environments do not expose description or tier fields")
  const protectedOnly = input.refs === "Protected branches" && native?.deployment_branch_policy?.protected_branches === true
  const wanted = protectedOnly ? ["*"] : S.patterns(input.refs)
  if (!wanted.length || wanted.length > 8 || wanted.some((ref) => /[\s\x00-\x1f\x7f]/.test(ref)) || (wanted.includes("*") && wanted.length !== 1))
    return yield* C.fail(binding, "invalid_input", "Environment requires at most eight exact branch/tag patterns, or '*' alone")
  const required = yield* resolveReviewers(services, binding, root, input.reviewers)
  const desired = wanted[0] === "*" ? [] : wanted.flatMap((name) => [{ name, type: "branch" }, { name, type: "tag" }])
  const changes = desired.filter((policy) => !current.some((item) => item.name === policy.name && item.type === policy.type))
  const deleted = current.filter((policy) => !desired.some((item) => item.name === policy.name && item.type === policy.type))
  const currentTimer = native?.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer
  const timer = input.timer ?? currentTimer
  if (current.length > 32) return yield* C.fail(binding, "metadata_truncated", "Environment policy mutation exceeds its bounded native phases")
  // Ref patterns require separate native endpoints. Validate the entire plan before
  // the first write; a later rejection explicitly reports partial application.
  yield* C.stages(services, binding, [
    { phase: "protection", statuses: [200], request: { method: "PUT", path, body: {
      // Do not request a paid timer feature merely to send its absent zero default.
      ...(timer !== undefined && (timer > 0 || currentTimer !== undefined) ? { wait_timer: timer } : {}),
      prevent_self_review: input.preventSelfReview, reviewers: required,
      deployment_branch_policy: protectedOnly ? { protected_branches: true, custom_branch_policies: false }
        : desired.length ? { protected_branches: false, custom_branch_policies: true } : null } } },
    ...deleted.map((policy) => ({ phase: `remove ref policy ${policy.id}`, statuses: [204], request: {
      method: "DELETE" as const, path: `${path}/deployment-branch-policies/${policy.id}` } })),
    ...changes.map((policy) => ({ phase: `add ${policy.type} ref policy`, statuses: [200, 201], request: {
      method: "POST" as const, path: `${path}/deployment-branch-policies`, body: policy } })),
  ])
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.githubReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "GitHub supports up to six distinct environment reviewers")
  return yield* Effect.forEach(reviewers, (name) => Effect.gen(function* () {
    if (name.startsWith("team:")) {
      const slug = name.slice(5)
      if (!/^[A-Za-z0-9-]+$/.test(slug)) return yield* C.fail(binding, "source_unresolved", "Team reviewers require exact 'team:slug' identity")
      const response = yield* C.get(services, binding, { method: "GET", path: `${root}/teams`, query: { per_page: 100, page: 1 } })
      const teams = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, slug: C.Text })), response.data, true))
      const matches = teams.filter((team) => team.slug === slug)
      if (matches.length !== 1 || response.headers.link?.includes("next") || teams.length === 100 || !Number.isSafeInteger(Number(matches[0].id)))
        return yield* C.fail(binding, "source_unresolved", "Repository team list did not prove one exact reviewer identity")
      return { type: "Team", id: Number(matches[0].id) }
    }
    if (!/^[A-Za-z0-9-]+$/.test(name)) return yield* C.fail(binding, "source_unresolved", "User reviewers require an exact login, not a display name")
    const response = yield* C.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(name)}` })
    const user = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, login: C.Text }), response.data, true))
    if (user.login.toLowerCase() !== name.toLowerCase() || !Number.isSafeInteger(Number(user.id)))
      return yield* C.fail(binding, "source_unresolved", "Native user lookup did not prove the exact reviewer login and ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/collaborators/${encodeURIComponent(user.login)}/permission` })
    const permission = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ permission: C.Text,
      user: Schema.Struct({ id: C.ID, login: C.Text }) }), access.data, true))
    if (String(permission.user.id) !== String(user.id) || permission.user.login.toLowerCase() !== user.login.toLowerCase() || !["read", "write", "admin"].includes(permission.permission))
      return yield* C.fail(binding, "source_unresolved", "Native repository lookup did not prove eligible reviewer access")
    return { type: "User", id: Number(user.id) }
  }), { concurrency: 1 })
})
~~~~


### `packages/core/src/actions/resources/config-environment-gitlab.ts`

Archive: `sources/packages/core/src/actions/resources/config-environment-gitlab.ts` · bytes: 10953 · Git blob: `610ab3c2831e40f288decfde7667af2387be313f` · SHA256: `873b53054d0e9bb1fad5a94400fefb7cbb11b96a23244cb9260e31f7e0e5f7ac`.

Papel da fonte: Constraints GL próprios, delete stopped, metadata e approvals em fases.


Linhas **11–116**; SHA256 do intervalo `e778bb8b2b1ac404a2b1a6b3313e4192791807eec1a623b3f9d6f721adfa3751`:

~~~~typescript

export const protections = Effect.fn("ActionsEnvironments.gitlabProtections")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments`, query: { page: 1, per_page: 100 } })
  return yield* C.guard(binding, () => {
    const native = C.decode(binding, Schema.Array(S.Protected), response.data, true)
    if (response.headers["x-next-page"] || response.headers.link?.includes("next") || native.length === 100)
      throw C.fail(binding, "metadata_truncated", "Protected environments exceed the bounded policy read")
    return native
  })
})

export function matches(pattern: string, name: string) {
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(name)
}

export function resource(binding: Actions.Binding, environment: typeof S.GitLab.Type, protectedEnvironments: readonly (typeof S.Protected.Type)[],
  project: typeof C.Project.Type): Actions.Resource {
  const policies = protectedEnvironments.filter((item) => matches(item.name, environment.name))
  const metadata = { ...environment, protectedPolicies: policies }
  return { id: environment.name, name: environment.name, bindingID: binding.id, kind: "environments", scope: "Project", owner: "Project",
    status: environment.state, data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Project", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), ...(environment.description === undefined ? {} : { description: environment.description }),
      reviewerIdentities: policies.flatMap((policy) => (policy.approval_rules ?? []).map((rule) => ({ ...rule, policyName: policy.name }))),
      sourceUnresolved: "GitLab reviewer rules identify users, groups and roles by native ID; display names require lookup",
      refs: { state: "source_unresolved", source: "CI configuration rules", reason: "Protected environments do not enforce branch or tag patterns" },
      ...(project.allow_pipeline_trigger_approve_deployment === undefined ? {} : {
        preventSelfReview: !project.allow_pipeline_trigger_approve_deployment, preventSelfReviewScope: "Project",
        preventSelfReviewSource: "allow_pipeline_trigger_approve_deployment" }),
      policyScope: "Project protected environments", timer: { state: "unavailable", reason: "GitLab has no native environment wait timer" } } }
}

export const find = Effect.fn("ActionsEnvironments.gitlabFind")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, name: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments`, query: { name, page: 1, per_page: 100 } })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
  if (native.length > 1 || native.some((item) => item.name !== name) || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "source_conflict", "GitLab did not prove one exact environment name")
  return native[0]
})

export const write = Effect.fn("ActionsEnvironments.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string, project: typeof C.Project.Type) {
  if (intent.target.scope !== "Project") return yield* C.fail(binding, "invalid_input", "GitLab environment scope must be Project")
  const environment = yield* find(services, binding, root, input.name)
  if ((intent.kind === "resource.create") !== (environment === undefined)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const protectedEnvironments = yield* protections(services, binding, root)
  const matching = protectedEnvironments.filter((policy) => matches(policy.name, input.name))
  if (environment) yield* C.guard(binding, () => C.version(binding, intent.expected, { status: 200, headers: {}, data: null },
    { ...environment, protectedPolicies: matching }))
  if (!environment && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    if (!environment || environment.state !== "stopped") return yield* C.fail(binding, "capability_unavailable", "GitLab environment must already be stopped before deletion")
    yield* C.send(services, binding, { method: "DELETE", path: `${root}/environments/${environment.id}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.timer !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitLab has no native environment timer field")
  if (input.refs !== "*") return yield* C.fail(binding, "capability_unavailable", "Field 'refs' requires a reviewed CI rules source change; protected environments cannot enforce it")
  if (project.allow_pipeline_trigger_approve_deployment === undefined || input.preventSelfReview !== !project.allow_pipeline_trigger_approve_deployment)
    return yield* C.fail(binding, "capability_unavailable", "Field 'preventSelfReview' belongs to observed project deployment approval settings, not this environment")
  if (matching.some((policy) => policy.name !== input.name)) return yield* C.fail(binding, "capability_unavailable", "Wildcard protected policy owns this environment; configure that native policy separately")
  const existing = matching[0]
  // A successful collection lookup distinguishes absence from plan/access denial;
  // a direct read then proves the exact existing policy before changing its rules.
  const policy = existing ? yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments/${encodeURIComponent(input.name)}` }) : undefined
  const current = policy ? yield* C.guard(binding, () => C.decode(binding, S.Protected, policy.data, true)) : undefined
  if (current && JSON.stringify(current) !== JSON.stringify(existing)) return yield* C.fail(binding, "source_conflict", "Protected environment policy changed during preflight")
  const reviewers = yield* resolveReviewers(services, binding, root, input.reviewers)
  if (!current && reviewers.length) return yield* C.fail(binding, "source_unresolved",
    "Field 'reviewers' requires an existing protected environment deploy_access_levels policy; this form cannot invent deploy permissions")
  if (current?.required_approval_count && current.approval_rules === undefined)
    return yield* C.fail(binding, "capability_unavailable", "Legacy required_approval_count cannot be replaced by unobserved approval_rules")
  if (current?.approval_rules?.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return yield* C.fail(binding, "capability_unavailable", "Field 'reviewers' cannot replace native group/role or multi-approval policy through a username-only form")
  const rules = reviewers.map((user_id) => ({ user_id, required_approvals: 1 }))
  const removed = (current?.approval_rules ?? []).map((rule) => ({ id: rule.id, _destroy: true }))
  const requests: { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[] = [
    ...(!environment ? [{ phase: "create environment", statuses: [201], request: { method: "POST" as const, path: `${root}/environments`,
      body: { name: input.name, ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }]
      : input.description !== undefined || input.tier !== undefined ? [{ phase: "environment metadata", statuses: [200], request: {
        method: "PUT" as const, path: `${root}/environments/${environment.id}`, body: {
          ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }] : []),
    ...(current ? [{ phase: "protected environment approvals", statuses: [200], request: {
      method: "PUT" as const, path: `${root}/protected_environments/${encodeURIComponent(input.name)}`,
      body: { approval_rules: [...removed, ...rules] } } }] : []),
  ]
  if (removed.length > 32 || requests.length === 0) return yield* C.fail(binding, "invalid_input", "Environment mutation is empty or exceeds bounded approval changes")
  yield* C.stages(services, binding, requests)
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.gitlabReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "Environment supports at most six exact reviewer usernames")
  return yield* Effect.forEach(reviewers, (username) => Effect.gen(function* () {
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) return yield* C.fail(binding, "source_unresolved", "GitLab reviewers require exact usernames, not display names or roles")
    const response = yield* C.get(services, binding, { method: "GET", path: "users", query: { username } })
    const users = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, username: C.Text })), response.data, true))
    if (users.length !== 1 || users[0].username !== username || !Number.isSafeInteger(Number(users[0].id)))
      return yield* C.fail(binding, "source_unresolved", "GitLab lookup did not prove one exact reviewer username and native ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/members/all/${users[0].id}` })
    const member = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, username: C.Text, access_level: Schema.Int }), access.data, true))
    if (String(member.id) !== String(users[0].id) || member.username !== username || ![20, 30, 40, 50].includes(member.access_level))
      return yield* C.fail(binding, "source_unresolved", "GitLab project membership did not prove eligible reviewer access")
    return Number(member.id)
  }), { concurrency: 1 })
})
~~~~


## A26 — Deployment review e assimetria do listing

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A26`.


### `packages/core/src/actions/resources/environments.ts`

Archive: `sources/packages/core/src/actions/resources/environments.ts` · bytes: 5333 · Git blob: `bf40e7c0a1e0eb17c0ac15f64b27ccaee1203292` · SHA256: `fc92638ae218671edd85d17f5c52b3de8b899d209dda930afd3fffdab5cee9fa`.

Papel da fonte: List valida environments; runID seleciona pending review.


Linhas **17–72**; SHA256 do intervalo `069bd68077cc2ec4fe73dfeb81c0fc10785d5679d4fc3348c4af0aedcec63dcc`:

~~~~typescript
export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsEnvironments.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => {
        const selected = C.selection(binding, input, "environments", ["resourceID", "runID", "scope"])
        if (selected.scope !== undefined && selected.scope !== (binding.provider.kind === "github" ? "Repository" : "Project"))
          throw C.fail(binding, "invalid_input", "Environment list scope must match the native project scope")
        return selected
      })
      const project = yield* C.project(services, binding)
      if (frozen.runID !== undefined) {
        if (frozen.cursor !== undefined || frozen.limit !== undefined) return yield* C.fail(binding, "invalid_input", "Pending deployment review uses a bounded native snapshot, not list pagination")
        return yield* ActionsDeploymentReview.list(services, binding, frozen.runID, frozen.resourceID)
      }
      const selected = yield* C.guard(binding, () => C.page(binding, frozen))
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/environments`,
        query: { page: selected.number, per_page: selected.limit,
          ...(binding.provider.kind === "gitlab" && frozen.resourceID !== undefined ? { name: frozen.resourceID } : {}) } })
      if (binding.provider.kind === "github") {
        const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ total_count: Schema.Int,
          environments: Schema.Array(S.GitHub) }), response.data, true))
        const items = yield* Effect.forEach(native.environments.filter((item) => frozen.resourceID === undefined || item.name === frozen.resourceID),
          (environment) => Effect.gen(function* () {
            const refs = yield* ActionsEnvironmentGitHub.policies(services, binding, project.path, environment)
            return ActionsEnvironmentGitHub.resource(binding, environment, refs)
          }), { concurrency: 1 })
        return yield* C.guard(binding, () => ({ items, ...C.pagination(binding, selected, response, native.environments.length, native.total_count) }))
      }
      const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
      const protectedEnvironments = yield* ActionsEnvironmentGitLab.protections(services, binding, project.path)
      const items = yield* Effect.forEach(native.filter((environment) => frozen.resourceID === undefined || environment.name === frozen.resourceID), (environment) => Effect.gen(function* () {
        const item = ActionsEnvironmentGitLab.resource(binding, environment, protectedEnvironments, project.native)
        if (frozen.resourceID === undefined) return item
        const reviewers = yield* ActionsEnvironmentReviewers.read(services, binding, protectedEnvironments, environment.name)
        return { ...item, data: { ...C.decode(binding, Schema.Record(Schema.String, Schema.Json), item.data), reviewersReadOnly: reviewers.reviewersReadOnly,
          ...(typeof reviewers.reviewers === "string" ? { reviewers: reviewers.reviewers } : {}) } }
      }), { concurrency: 1 })
      return yield* C.guard(binding, () => ({ items,
        ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }))
    }),
    perform: Effect.fn("ActionsEnvironments.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      if (intent.kind === "deployment.review") return yield* ActionsDeploymentReview.perform(services, binding, intent, payload)
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "environments")
        const input = C.decode(binding, intent.kind === "resource.delete" ? S.Delete : S.Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || input.name !== intent.target.resourceID)
          throw C.fail(binding, "intent_conflict", "Environment provider or name changed after admission")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      return frozen.binding.provider.kind === "github"
        ? yield* ActionsEnvironmentGitHub.write(services, frozen.binding, frozen.intent, frozen.input, project.path)
        : yield* ActionsEnvironmentGitLab.write(services, frozen.binding, frozen.intent, frozen.input, project.path, project.native)
    }),
  }
}
~~~~


### `packages/core/src/actions/resources/config-deployment-review.ts`

Archive: `sources/packages/core/src/actions/resources/config-deployment-review.ts` · bytes: 9534 · Git blob: `53cd89baf0c85dfd338c6da6a119445ecb101066` · SHA256: `fcd8809b52ee73a044bc0ab61f88377cb882b72054708fa72e77771c81c5b400`.

Papel da fonte: Aprovação por run/env/commit/versão; GL não executa job.


Linhas **13–110**; SHA256 do intervalo `346aa4a241c5ee62717ec10d440f72e8051929b533df8b61fbeef57c487a66bd`:

~~~~typescript
  reviewers: Schema.Array(Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({ id: C.ID,
    login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text) }) })) })
const Deployment = Schema.Struct({ id: C.ID, status: C.Text, sha: C.Text, ref: C.Text,
  environment: Schema.Struct({ id: C.ID, name: C.Text }),
  deployable: Schema.NullOr(Schema.Struct({ id: C.ID, pipeline: Schema.Struct({ id: C.ID }) })),
  pending_approval_count: Schema.optionalKey(Schema.Int),
  approval_summary: Schema.optionalKey(Schema.Struct({ rules: Schema.Array(Schema.Struct({
    user_id: Schema.optionalKey(Schema.NullOr(C.ID)), group_id: Schema.optionalKey(Schema.NullOr(C.ID)),
    access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)), required_approvals: Schema.Int,
  })) })),
})

export const list = Effect.fn("ActionsEnvironments.pendingReview")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string, name?: string) {
  const run = yield* checkedRun(services, binding, runID)
  const root = C.root(binding)
  if (binding.provider.kind === "github") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${root}/actions/runs/${runID}/pending_deployments` })
    const pending = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Pending), response.data, true))
    return { items: pending.filter((item) => name === undefined || item.environment.name === name).map((item): Actions.Resource => ({
      id: item.environment.name, name: item.environment.name, bindingID: binding.id, kind: "environments", scope: "Repository", status: "waiting",
      data: { ...item, runID, commit: run.commit, ...(run.attempt === undefined ? {} : { attempt: run.attempt }),
        nativeIdentity: C.identity(binding, item.environment.name, "Repository", String(item.environment.id)), resourceVersion: JSON.stringify(item) },
    })), capturedAt: Date.now() }
  }
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/deployments`, query: {
    status: "blocked", ...(name === undefined ? {} : { environment: name }), per_page: 100, page: 1 } })
  const deployments = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Deployment), response.data, true))
  if (deployments.length === 100 || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "metadata_truncated", "Pending deployment read exceeds its bounded native page")
  return { items: deployments.filter((item) => String(item.deployable?.pipeline.id) === runID && (name === undefined || item.environment.name === name))
    .map((item): Actions.Resource => ({ id: item.environment.name, name: item.environment.name, bindingID: binding.id,
      kind: "environments", scope: "Project", status: item.status, data: { ...item, runID,
        nativeIdentity: C.identity(binding, item.environment.name, "Project", String(item.environment.id)),
        deploymentID: String(item.id), resourceVersion: JSON.stringify(item) } })), capturedAt: Date.now() }
})

export const perform = Effect.fn("ActionsEnvironments.review")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  payload: ActionsContract.Json) {
  const frozen = yield* C.guard(binding, () => {
    const capture = C.capture(binding, intent, "environments", true)
    const input = C.decode(binding, S.Review, structuredClone(payload))
    if (input.provider !== binding.provider.kind || !intent.target.runID || !/^[1-9]\d*$/.test(intent.target.runID))
      throw C.fail(binding, "invalid_input", "Deployment review requires its bound provider and native run ID")
    return { ...capture, input, name: C.decode(binding, C.Text, intent.target.resourceID), runID: intent.target.runID }
  })
  const scope = frozen.binding.provider.kind === "github" ? "Repository" : "Project"
  if (frozen.intent.target.scope !== scope) return yield* C.fail(binding, "intent_conflict", "Deployment review scope differs from admission")
  yield* C.project(services, frozen.binding)
  yield* C.actor(services, frozen.binding)
  const run = yield* checkedRun(services, frozen.binding, frozen.runID)
  if ((frozen.intent.expected?.commit !== undefined && frozen.intent.expected.commit !== run.commit) ||
      (frozen.intent.expected?.attempt !== undefined && frozen.intent.expected.attempt !== run.attempt))
    return yield* C.fail(binding, "source_conflict", "Deployment run source or attempt changed after admission")
  const root = C.root(frozen.binding)
  const pending = yield* list(services, frozen.binding, frozen.runID, frozen.name)
  if (pending.items.length !== 1) return yield* C.fail(binding, "source_unresolved", "Native pending deployments did not prove one admitted run and environment")
  const currentRun = yield* checkedRun(services, frozen.binding, frozen.runID)
  if (currentRun.commit !== run.commit || currentRun.attempt !== run.attempt)
    return yield* C.fail(binding, "source_conflict", "Deployment run changed during native approval preflight")
  const resource = pending.items[0]
  const metadata = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true))
  if (frozen.intent.expected?.resourceVersion !== undefined && frozen.intent.expected.resourceVersion !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native deployment review state changed after admission")
  if (frozen.binding.provider.kind === "github") {
    const context = yield* C.guard(binding, () => C.decode(binding, Pending, resource.data, true))
    if (!context.current_user_can_approve) return yield* C.fail(binding, "permission_denied", "GitHub pending deployment metadata denies this reviewer")
    const id = Number(context.environment.id)
    if (!Number.isSafeInteger(id)) return yield* C.fail(binding, "source_unresolved", "GitHub pending environment ID cannot be represented safely")
    yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/actions/runs/${frozen.runID}/pending_deployments`,
      body: { environment_ids: [id], state: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200])
    return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
  }
  const context = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ deploymentID: C.Text }), resource.data, true))
  const response = yield* C.get(services, frozen.binding, { method: "GET", path: `${root}/deployments/${context.deploymentID}` })
  const deployment = yield* C.guard(binding, () => C.decode(binding, Deployment, response.data, true))
  if (String(deployment.id) !== context.deploymentID || deployment.environment.name !== frozen.name ||
      String(deployment.deployable?.pipeline.id) !== frozen.runID || deployment.sha !== run.commit || deployment.status !== "blocked")
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment ownership or approval state changed")
  if (JSON.stringify(deployment) !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment approval rules changed during preflight")
  if (!deployment.approval_summary && deployment.pending_approval_count === undefined)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment response did not establish native approval capability")
  if (deployment.pending_approval_count !== undefined && deployment.pending_approval_count <= 0)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment no longer needs approval; manual execution remains separate")
  yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/deployments/${context.deploymentID}/approval`,
    body: { status: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200, 201])
  return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
})

const checkedRun = Effect.fn("ActionsEnvironments.reviewRun")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string) {
  if (!/^[1-9]\d*$/.test(runID)) return yield* C.fail(binding, "invalid_input", "Deployment review requires a native decimal run ID")
  const run = yield* services.reader.run(binding, runID).pipe(Effect.mapError((error) => C.fail(binding, error.kind, `Deployment run read failed (${error.kind})`)))
  if (run.id !== runID || run.bindingID !== binding.id || run.repositoryID !== binding.projectID)
    return yield* C.fail(binding, "binding_stale", "Reader did not prove deployment run project ownership")
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(run.commit))
    return yield* C.fail(binding, "source_unresolved", "Reader did not prove a native deployment source commit")
  return run
})
~~~~


## A27 — Policy local versus configuração remota

Vínculo: `body.md` §1, 4; archive de evidência: `evidence.md`, seção `A27`.


### `packages/core/src/actions/resources/policy.ts`

Archive: `sources/packages/core/src/actions/resources/policy.ts` · bytes: 7481 · Git blob: `17cfdc17b154c76d935cd8e99d8ea2e07f71c68b` · SHA256: `c0e90e28da9148e24a6fc56df68566122215d9ba6d1b47f6222fc4b079b425e2`.

Papel da fonte: Retenção local não configura provider; approved-actions e project settings nativos.


Linhas **8–85**; SHA256 do intervalo `c58468deb42dc4f221b31df5d401b359fae9aacd449268056410282721741a4a`:

~~~~typescript
const C = ActionsConfigCommon
const Permissions = Schema.Struct({ enabled: Schema.Boolean,
  allowed_actions: Schema.optionalKey(Schema.Literals(["all", "local_only", "selected"])) })
const Selected = Schema.Struct({ github_owned_allowed: Schema.Boolean, verified_allowed: Schema.Boolean, patterns_allowed: Schema.Array(Schema.String) })
const GitLabSettings = Schema.Struct({ id: C.ID,
  keep_latest_artifact: Schema.optionalKey(Schema.Boolean), build_timeout: Schema.optionalKey(Schema.Int),
  auto_cancel_pending_pipelines: Schema.optionalKey(Schema.String),
  builds_access_level: Schema.optionalKey(Schema.String), ci_config_path: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ci_pipeline_variables_minimum_override_role: Schema.optionalKey(Schema.String),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})
const Form = Schema.Struct({ provider: C.Provider,
  retention: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 }))),
  policy: Schema.optionalKey(Schema.Literals(["Project default", "Restricted to approved actions"])) })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsPolicy.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      yield* C.guard(binding, () => {
        const frozen = C.selection(binding, input, "policy", ["resourceID", "scope"])
        if (frozen.cursor !== undefined || frozen.limit !== undefined || (frozen.resourceID !== undefined && frozen.resourceID !== "project-settings") ||
            (frozen.scope !== undefined && frozen.scope !== (binding.provider.kind === "github" ? "Repository" : "Project")))
          throw C.fail(binding, "invalid_input", "Project settings are one native project policy snapshot")
      })
      const project = yield* C.project(services, binding)
      const scope = binding.provider.kind === "github" ? "Repository" : "Project"
      if (binding.provider.kind === "gitlab") return yield* C.guard(binding, () => {
        const native = C.decode(binding, GitLabSettings, project.response.data, true)
        return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
          data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: native, resourceVersion: JSON.stringify(native),
            retention: { state: "source_unresolved", source: "Instance default and CI artifacts:expire_in", writable: false },
            policy: { state: "unavailable", reason: "GitLab has no GitHub approved-actions execution policy" },
            localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Instance / group / CI configuration" } } }], capturedAt: Date.now() }
      })
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/actions/permissions` })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selection = native.allowed_actions === "selected" ? yield* C.get(services, binding,
        { method: "GET", path: `${project.path}/actions/permissions/selected-actions` }) : undefined
      const selected = selection ? yield* C.guard(binding, () => C.decode(binding, Selected, selection.data, true)) : undefined
      const metadata = { ...native, ...(selected === undefined ? {} : { selectedActions: selected }) }
      return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
        data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: metadata, resourceVersion: JSON.stringify(metadata),
          ...(native.allowed_actions === "all" ? { policy: "Project default" } : native.allowed_actions === "selected" ? { policy: "Restricted to approved actions" }
            : { policy: { state: "source_unresolved", reason: "Native allowed_actions is not one of the mock policy options" } }),
          retention: { state: "source_unresolved", source: "Provider artifact/log default and workflow retention-days", writable: false },
          localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Organization / enterprise" } } }], capturedAt: Date.now() }
    }),
    perform: Effect.fn("ActionsPolicy.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "policy")
        const input = C.decode(binding, Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || intent.target.resourceID !== "project-settings" ||
            intent.target.scope !== (binding.provider.kind === "github" ? "Repository" : "Project") || intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Project policy mutation does not match the admitted settings identity")
        if (input.retention !== undefined) throw C.fail(binding, "capability_unavailable",
          "Field 'retention' must update the Actions binding policy store; repository PATCH and GitLab project settings do not represent artifact retention days")
        if (input.policy === undefined) throw C.fail(binding, "invalid_input", "Project policy mutation has no supported field")
        if (binding.provider.kind === "gitlab") throw C.fail(binding, "capability_unavailable",
          "Field 'policy' has no GitLab approved-actions equivalent; local execution policy belongs to the Actions binding policy store")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      const path = `${project.path}/actions/permissions`
      const response = yield* C.get(services, frozen.binding, { method: "GET", path })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selectedResponse = native.allowed_actions === "selected" || frozen.input.policy === "Restricted to approved actions"
        ? yield* C.get(services, frozen.binding, { method: "GET", path: `${path}/selected-actions` }) : undefined
      const selected = selectedResponse ? yield* C.guard(binding, () => C.decode(binding, Selected, selectedResponse.data, true)) : undefined
      if (frozen.input.policy === "Restricted to approved actions" && !selected)
        return yield* C.fail(binding, "source_unresolved", "Native selected-actions policy did not establish the existing approved action set")
      yield* C.guard(binding, () => C.version(frozen.binding, frozen.intent.expected, response,
        { ...native, ...(native.allowed_actions === "selected" && selected ? { selectedActions: selected } : {}) }))
      yield* C.send(services, frozen.binding, { method: "PUT", path, body: { enabled: native.enabled,
        allowed_actions: frozen.input.policy === "Restricted to approved actions" ? "selected" : "all" } }, [204])
      return { acknowledgement: { resourceID: "project-settings" } }
    }),
  }
}
~~~~


## A28 — Caches e fronteira GraphQL GitLab

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A28`.


### `packages/core/src/actions/resources/caches.ts`

Archive: `sources/packages/core/src/actions/resources/caches.ts` · bytes: 13087 · Git blob: `d272111f079a5a22c09fde175c43c132e8048cca` · SHA256: `1cf002b729c4043e352d60d02a81f0aacd58d58b971bba16f834a2ab6be6b95b`.

Papel da fonte: GH key/ref exige inventário; GL invalida namespace futuro, conserva blobs existentes.


Linhas **14–152**; SHA256 do intervalo `750188927592808316ae463665f2e8eead27957fe63906b1361e36d54a758126`:

~~~~typescript
const Usage = Schema.Struct({ full_name: Schema.NonEmptyString, active_caches_size_in_bytes: GitHubNative.Count, active_caches_count: GitHubNative.Count })
const Delete = Schema.Struct({ provider: Schema.Literal("github"), name: Schema.optionalKey(Schema.NonEmptyString), ref: Schema.optionalKey(Schema.NonEmptyString) })
const Clear = Schema.Struct({ data: Schema.Struct({ runnerCacheClear: Schema.NullOr(Schema.Struct({ errors: Schema.Array(Schema.String) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsCaches.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "caches",
        binding.provider.kind === "github" ? ["resourceID", "ref", "query", "cursor", "limit"] : []))
      const current = frozen.binding
      if (current.provider.kind === "gitlab") {
        const project = yield* ActionsGitLabNative.make(services.transport).project(current)
        return { items: [{ id: current.projectID, bindingID: current.id, kind: "caches" as const, name: "Project runner caches",
          scope: ActionsResourceNative.scope(current), data: { nativeID: current.projectID, projectID: current.projectID,
            scope: "Every cache key in this project", storage: "Runner or external object storage", inventory: "native_unavailable",
            projectWide: true, existingBlobsRetained: true, futureJobsOnly: true, resourceVersion: projectVersion(project) } }], total: 1, capturedAt: Date.now() }
      }
      const repo = yield* GitHubNative.repository(services.transport, current)
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        if (frozen.input.ref !== undefined) cacheRef(current, frozen.input.ref)
        return GitHubNative.selection(current, "github.caches", { ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
          ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }, frozen.input.cursor, frozen.input.limit)
      })
      const query = { page: selected.page, per_page: selected.per_page, ...(frozen.input.query === undefined ? {} : { key: frozen.input.query }),
        ...(frozen.input.ref === undefined ? {} : { ref: frozen.input.ref }) }
      const response = yield* ActionsResourceNative.get(services, current, `${repo.path}/actions/caches`, query)
      const measured = yield* usage(services, current)
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Caches, response.data)
        if (frozen.input.resourceID !== undefined && !native.actions_caches.some((cache) => String(cache.id) === frozen.input.resourceID))
          throw ActionsResourceNative.error(current, "not_found", "Cache ID was not in this native key/ref page; select its exact key/ref cursor")
        return { items: native.actions_caches.filter((cache) => frozen.input.resourceID === undefined || String(cache.id) === frozen.input.resourceID)
          .map((cache): Actions.Resource => ({ id: String(cache.id), bindingID: current.id, kind: "caches", name: cache.key,
            scope: ActionsResourceNative.scope(current), data: { nativeID: String(cache.id), key: cache.key, ref: cache.ref,
              size: cache.size_in_bytes, sizeInBytes: cache.size_in_bytes, createdAt: cache.created_at, lastAccessedAt: cache.last_accessed_at,
              age: cache.last_accessed_at, version: cache.version, resourceVersion: cacheVersion(cache), usage: measured } })),
          ...GitHubNative.pagination(current, response, { method: "GET", path: `${repo.path}/actions/caches`, query }, selected, native.actions_caches.length, native.total_count) }
      })
    }),
    perform: Effect.fn("ActionsCaches.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "caches", ["resource.delete", "cache.clear"]))
      const current = frozen.binding
      const admitted = frozen.intent
      const authority = yield* ActionsResourceNative.authority(services, current, current.provider.kind === "gitlab" ? 30 : 40)
      yield* ActionsResourceNative.source(services, current, admitted)
      if (current.provider.kind === "gitlab") {
        yield* ActionsResourceNative.checked(current, () => {
          const input = ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
          if (input.provider !== "gitlab" || admitted.kind !== "cache.clear" || admitted.target.resourceID !== undefined && admitted.target.resourceID !== current.projectID)
            throw ActionsResourceNative.error(current, "invalid_input", "GitLab cache invalidation requires cache.clear at whole-project scope")
        })
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, projectVersion(project)))
        if (!services.graphql) return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitLab cache clear requires bound /api/graphql transport; /api/v4/graphql is not a native endpoint")
        const response = yield* services.graphql(current, { kind: "cacheClear" }).pipe(Effect.mapError((cause) =>
          ActionsResourceNative.error(current, cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.kind : "outcome_unknown",
            "GitLab cache-clear request failed", cause.disposition ?? "unknown")))
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Clear, response.data, true)
          if (response.status !== 200 || native.errors?.length || !native.data.runnerCacheClear || native.data.runnerCacheClear.errors.length)
            throw ActionsResourceNative.error(current, "outcome_unknown", "GitLab did not acknowledge project cache namespace invalidation", "unknown")
          return { acknowledgement: { resourceID: current.projectID } }
        }))
      }
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = ActionsResourceNative.input(current, Delete, frozen.payload)
        if (!admitted.target.resourceID && !value.name) throw ActionsResourceNative.error(current, "invalid_input", "GitHub cache deletion requires a native ID or exact cache key")
        if (value.ref !== undefined) cacheRef(current, value.ref)
        if (value.ref !== admitted.target.ref)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache execute ref differs from the admitted exact ref")
        if (!admitted.target.resourceID && admitted.expected?.resourceVersion !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Cache resourceVersion binds one native cache ID; key-wide deletion requires explicit native IDs")
        if (admitted.target.resourceID !== undefined) ActionsResourceNative.id(current, admitted.target.resourceID)
        return value
      })
      // GitHub has no cache-ID GET. Bounded exact-key/ref inventory proves ID mapping;
      // a full/partial page can never be mistaken for complete key-wide preflight.
      const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/caches`, {
        per_page: 100, page: 1, ...(input.name === undefined ? {} : { key: input.name }), ...(input.ref === undefined ? {} : { ref: input.ref }),
      })
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Caches, response.data))
      const cache = yield* ActionsResourceNative.checked(current, () => {
        const exact = native.actions_caches.filter((cache) => (input.name === undefined || cache.key === input.name) && (input.ref === undefined || cache.ref === input.ref))
        if (admitted.target.resourceID !== undefined) {
          const cache = exact.find((cache) => String(cache.id) === admitted.target.resourceID)
          if (!cache) throw ActionsResourceNative.error(current, native.total_count > native.actions_caches.length ? "metadata_truncated" : "not_found",
            "Native cache ID was not proved for this key/ref; provide its exact native key/ref selection")
          ActionsResourceNative.requireVersion(current, admitted, cacheVersion(cache))
          return cache
        }
        if (native.total_count > native.actions_caches.length) throw ActionsResourceNative.error(current, "metadata_truncated", "Key-wide cache deletion requires complete bounded native key/ref inventory; select individual IDs")
        if (!exact.length) throw ActionsResourceNative.error(current, "not_found", "No native cache matched the exact cache key/ref")
        return undefined
      })
      if (cache) {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches/${cache.id}` }, [204])
        return { acknowledgement: { resourceID: String(cache.id) } }
      }
      const written = yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/caches`,
        query: { key: input.name ?? "", ...(input.ref === undefined ? {} : { ref: input.ref }) } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const deleted = ActionsResourceNative.decode(current, Caches, written.data, true)
        if (!deleted.actions_caches.length || deleted.actions_caches.some((cache) => cache.key !== input.name || input.ref !== undefined && cache.ref !== input.ref))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Cache-key deletion response did not prove the exact admitted key/ref", "unknown")
      }))
      return { acknowledgement: { unattributed: true } }
    }),
  }
}

export const usage = Effect.fn("ActionsCaches.usage")(function* (services: ActionsResourceNative.Services, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab project API does not expose per-key cache storage usage")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/cache/usage`)
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Usage, response.data)
    if (native.full_name !== repo.native.full_name) throw ActionsResourceNative.error(binding, "binding_stale", "Cache usage identity differs from the immutable repository lookup")
    return { sizeInBytes: native.active_caches_size_in_bytes, count: native.active_caches_count, refresh: "approximately_five_minutes", capturedAt: Date.now() }
  })
})

function cacheRef(binding: Actions.Binding, ref: string) {
  GitHubNative.ref(binding, ref)
  if (!/^refs\/(?:heads\/.+|pull\/[1-9]\d*\/merge)$/.test(ref))
    throw ActionsResourceNative.error(binding, "invalid_input", "Cache ref must be an exact native refs/heads/... or refs/pull/.../merge value")
}

function cacheVersion(cache: typeof Cache.Type) {
  return ActionsResourceNative.version({ id: String(cache.id), key: cache.key, ref: cache.ref, version: cache.version,
    createdAt: cache.created_at, sizeInBytes: cache.size_in_bytes })
}

function projectVersion(project: typeof ActionsGitLabNative.Project.Type) {
  return ActionsResourceNative.version({ projectID: String(project.id), archived: project.archived ?? null,
    jobsEnabled: project.jobs_enabled ?? null, buildsAccessLevel: project.builds_access_level ?? null })
}
~~~~


### `packages/core/src/actions/resources/gitlab-graphql.ts`

Archive: `sources/packages/core/src/actions/resources/gitlab-graphql.ts` · bytes: 6809 · Git blob: `08a1072c00be8d3ce858fbe6b57772f96afd2f78` · SHA256: `d29a849b8ae2fe1e8eb08ee947f8275bcee8b62e8c4a006d45f738e69758fb2c`.

Papel da fonte: GraphQL allowlist, IDs globais e auth/TLS nativos; respostas limitadas.


Linhas **12–96**; SHA256 do intervalo `111a62431e36adef5efaaaaddce15a957d0cceb3c8424404214712fc2e493b1d`:

~~~~typescript
import { ActionsResponse } from "../transport/response"
import { ActionsResourceNative } from "./native"

export type Command = { readonly kind: "runner"; readonly id: string } | { readonly kind: "cacheClear" }
export type Request = (binding: Actions.Binding, command: Command) => Effect.Effect<ActionsContract.Response, ActionsError>

// REST W1 deliberately binds /api/v4. This separate seam binds /api/graphql,
// keeps the same qualified CLI/TLS snapshot, and exposes only mock-required calls.
export function make(directory: string, proc: AppProcess.Interface): Request {
  return Effect.fn("ActionsResources.gitlabGraphQL")(function* (admitted: Actions.Binding, input: Command) {
    const binding = yield* ActionsResourceNative.checked(admitted, () => ActionsResourceNative.input(admitted, Schema.fromJsonString(Actions.Binding), JSON.stringify(admitted)))
    const command = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.input(binding, Schema.Union([
      Schema.Struct({ kind: Schema.Literal("runner"), id: Schema.NonEmptyString }), Schema.Struct({ kind: Schema.Literal("cacheClear") }),
    ]), input))
    const target = yield* ActionsResourceNative.checked(binding, () => {
      const provider = structuredClone(binding.provider)
      const host = URL.parse(`https://${provider.hostname}`)
      if (provider.kind !== "gitlab" || !host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        ![host.origin, `${host.origin}/api/v4`].includes(provider.apiOrigin))
        throw ActionsResourceNative.error(binding, "host_mismatch", "GitLab GraphQL requires the exact bound canonical HTTPS host")
      const project = ActionsResourceNative.id(binding, binding.projectID)
      return { provider, url: `${host.origin}/api/graphql`, body: command.kind === "runner" ? {
        query: "query OrchestraRunnerOwner($id: CiRunnerID!) { runner(id: $id) { id runnerType ownerProject { id } tagList } }",
        variables: { id: `gid://gitlab/Ci::Runner/${ActionsResourceNative.id(binding, command.id)}` },
      } : {
        query: "mutation OrchestraClearRunnerCache($projectId: ProjectID!) { runnerCacheClear(input: { projectId: $projectId }) { errors } }",
        variables: { projectId: `gid://gitlab/Project/${project}` },
      } }
    })
    const snapshot = yield* ActionsCredentials.read(proc, directory, target.provider)
    if (command.kind === "cacheClear") {
      if (!binding.account) return yield* ActionsResourceNative.error(binding, "binding_stale", "Cache clear requires a verified bound actor")
      const actor = yield* ActionsHttp.metadata(target.provider, snapshot, { method: "GET", path: "user" }).pipe(
        Effect.mapError((cause) => ActionsResourceNative.error(binding, cause.kind, "GitLab cache-clear actor preflight failed")),
      )
      const user = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.NonEmptyString }))(actor.data)
      if (actor.status !== 200 || Option.isNone(user) || user.value.username !== binding.account)
        return yield* ActionsResourceNative.error(binding, "binding_stale", "GitLab cache-clear actor differs from the binding")
    }
    const response = yield* Effect.tryPromise({
      try: (signal) => new Promise<{ status: number; headers: Record<string, string>; bytes: Buffer }>((resolve, reject) => {
        const state = { phase: "handshake" as "handshake" | "http_possible", size: 0, chunks: [] as Buffer[] }
        const req = request(target.url, {
          method: "POST", agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal,
          ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
          checkServerIdentity: (hostname, certificate) => {
            const error = checkServerIdentity(hostname, certificate)
            if (!error) state.phase = "http_possible"
            return error
          },
          headers: { ...snapshot.headers, "Content-Type": "application/json", Connection: "close" },
        })
        const fail = (cause: ActionsError) => { reject(cause); req.destroy() }
        const deadline = setTimeout(() => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL deadline exceeded", "unknown")), 30_000)
        req.once("close", () => clearTimeout(deadline))
        req.once("error", (cause) => { clearTimeout(deadline); reject(ActionsHttp.requestError(target.provider, cause, state.phase)) })
        req.once("socket", (socket) => socket.once("secureConnect", () => { state.phase = "http_possible" }))
        req.once("response", (incoming) => {
          state.phase = "http_possible"
          incoming.once("aborted", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response ended prematurely", "unknown")))
          incoming.once("error", () => fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response failed", "unknown")))
          incoming.on("data", (chunk: Buffer) => {
            state.size += chunk.length
            if (state.size > 2 * 1024 * 1024) {
              incoming.destroy()
              fail(ActionsResourceNative.error(binding, "metadata_truncated", "GitLab GraphQL metadata capture limit exceeded", "unknown"))
              return
            }
            state.chunks.push(chunk)
          })
          incoming.once("end", () => {
            clearTimeout(deadline)
            if (!incoming.complete) { fail(ActionsResourceNative.error(binding, "outcome_unknown", "GitLab GraphQL response was incomplete", "unknown")); return }
            resolve({ status: incoming.statusCode ?? 0, headers: Object.fromEntries(Object.entries(incoming.headers)
              .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
              .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])), bytes: Buffer.concat(state.chunks) })
          })
        })
        req.end(JSON.stringify(target.body))
      }),
      catch: (cause) => cause instanceof ActionsError ? cause : ActionsResourceNative.error(binding, "transport_failed", "GitLab GraphQL request failed", "unknown"),
    })
    return yield* ActionsResponse.http(target.provider, response.status, response.headers, response.bytes)
  })
}
~~~~


## A29 — Runner ownership e enrollment

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A29`.


### `packages/core/src/actions/resources/runners.ts`

Archive: `sources/packages/core/src/actions/resources/runners.ts` · bytes: 26618 · Git blob: `5d27a887b6a1890a92d83b0310b3bc624f83bf47` · SHA256: `87a6b7a7a23e4aaa162366761f68282f64190e7a2555cf353f67a22aa3cac0b6`.

Papel da fonte: GH repo scope/JIT/custom labels; GL ownerProject, assigns, inherited e delete sem impacto externo.


Linhas **20–75**; SHA256 do intervalo `305fc6e924051ca00f05a52199ef220d2759780f491c461622872995d0fd2c5e`:

~~~~typescript
const GitHubList = Schema.Struct({ total_count: GitHubNative.Count, runners: Schema.Array(GitHubRunner) })
const GitLabRunner = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.NullOr(Schema.String),
  runner_type: Schema.Literals(["project_type", "group_type", "instance_type"]), status: Schema.NonEmptyString,
  paused: Schema.Boolean, job_execution_status: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tag_list: Schema.optionalKey(Schema.Array(Schema.String)), locked: Schema.optionalKey(Schema.Boolean),
  projects: Schema.optionalKey(Schema.Array(Schema.Struct({ id: ActionsGitLabNative.ID }))) })
const Owner = Schema.Struct({ data: Schema.Struct({ runner: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString,
  runnerType: Schema.Literals(["PROJECT_TYPE", "GROUP_TYPE", "INSTANCE_TYPE"]),
  ownerProject: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString })), tagList: Schema.NullOr(Schema.Array(Schema.String)) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
const platforms = {
  "Linux x64": ["linux", "x64"], "Linux ARM64": ["linux", "ARM64"],
  "macOS ARM64": ["macOS", "ARM64"], "macOS x64": ["macOS", "x64"], "Windows x64": ["windows", "x64"],
} as const
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsRunners.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "runners", ["resourceID", "query", "cursor", "limit"]))
      const current = frozen.binding
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (current.provider.kind === "gitlab" && frozen.input.query !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "GitLab project runner API has no native name-search filter")
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        return GitHubNative.selection(current, `${current.provider.kind}.runners`,
          { ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) }, frozen.input.cursor, frozen.input.limit)
      })
      if (current.provider.kind === "github") {
        const repo = yield* GitHubNative.repository(services.transport, current)
        const root = `${repo.path}/actions/runners`
        if (frozen.input.resourceID !== undefined) {
          const response = yield* ActionsResourceNative.get(services, current, `${root}/${frozen.input.resourceID}`)
          const runner = yield* ActionsResourceNative.checked(current, () => github(current, ActionsResourceNative.decode(current, GitHubRunner, response.data), frozen.input.resourceID, repo.native.permissions?.admin !== false))
          return { items: [runner], capturedAt: Date.now(), total: 1 }
        }
        const request = { method: "GET", path: root, query: { page: selected.page, per_page: selected.per_page,
          ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) } } as const
        const response = yield* ActionsResourceNative.get(services, current, root, request.query)
        return yield* ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, GitHubList, response.data)
          return { items: native.runners.map((runner) => github(current, runner, undefined, repo.native.permissions?.admin !== false)),
            ...GitHubNative.pagination(current, response, request, selected, native.runners.length, native.total_count) }
        })
      }
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const response = yield* ActionsResourceNative.get(services, current, `projects/${current.projectID}/runners`, { page: selected.page, per_page: selected.per_page })
      const runners = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schema.Array(GitLabRunner), response.data))
      // Only project-visible IDs may enter detail/ownership reads. Never enumerate /runners or /runners/all.
      const items = yield* Effect.forEach(runners.filter((runner) => frozen.input.resourceID === undefined || String(runner.id) === frozen.input.resourceID),
        (runner) => gitlab(services, current, runner), { concurrency: 4 })
      if (frozen.input.resourceID !== undefined && items.length === 0)
        return yield* ActionsResourceNative.error(current, "not_found", "Runner was not present in the selected native project page; select its exact project cursor")
      return { items, capturedAt: Date.now(), ...yield* ActionsResourceNative.checked(current, () =>
        ActionsResourceNative.pagination(current, response, selected, runners.length)) }
    }),
~~~~


Linhas **95–210**; SHA256 do intervalo `ba11ccef33d85dcf7b3108ced84c0b8178dc7a3333e03cead18dc4064d0f6064`:

~~~~typescript
      const authority = yield* ActionsResourceNative.authority(services, current)
      if (current.provider.kind === "github") yield* ActionsResourceNative.checked(current, () => {
        if (authority.runnerAdmin === false)
          throw ActionsResourceNative.error(current, "permission_denied", "Observed repository role denies runner administration")
        const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
        if (scopes?.length && !scopes.includes("repo"))
          throw ActionsResourceNative.error(current, "permission_denied", "Observed classic OAuth token lacks repo scope required for runner administration")
      })
      yield* ActionsResourceNative.source(services, current, admitted)
      if (create) {
        if (Schema.is(Token)(config)) {
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/registration-token` }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ token: Schema.NonEmptyString, expires_at: GitHubNative.Time }), response.data, true)
            return { acknowledgement: { unattributed: true }, output: Actions.CommandOutput.make({ kind: "runnerToken", token: native.token, expiresAt: native.expires_at }) }
          }))
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner enrollment requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
        if (current.provider.kind === "github") {
          if (config.runnerGroupID === undefined) return yield* ActionsResourceNative.error(current, "invalid_input", "GitHub JIT enrollment requires an explicit native runnerGroupID; no group ID is guessed")
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/generate-jitconfig`,
            body: { name: config.name, runner_group_id: config.runnerGroupID, labels } }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ runner: Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString,
              labels: Schema.Array(GitHubLabel), runner_group_id: Schema.optionalKey(GitHubNative.Positive) }), encoded_jit_config: Schema.NonEmptyString }), response.data, true)
            if (native.runner.name !== config.name || native.runner.runner_group_id !== undefined && native.runner.runner_group_id !== config.runnerGroupID ||
              labels.some((label) => !native.runner.labels.some((item) => item.name.toLowerCase() === label.toLowerCase())))
              throw ActionsResourceNative.error(current, "outcome_unknown", "JIT configuration did not acknowledge the requested runner identity", "unknown")
            return { acknowledgement: { resourceID: String(native.runner.id) }, output: Actions.CommandOutput.make({ kind: "runnerJit",
              runnerID: String(native.runner.id), encodedConfiguration: native.encoded_jit_config }) }
          }))
        }
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [16, 0], "user-linked runner enrollment"))
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: "user/runners",
          body: { runner_type: "project_type", project_id: current.projectID, description: config.name, tag_list: labels, locked: true, run_untagged: false } }, [201])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Schema.Struct({ id: ActionsGitLabNative.ID, token: Schema.NonEmptyString,
            token_expires_at: Schema.optionalKey(Schema.NullOr(Schema.String)) }), response.data, true)
          return { acknowledgement: { resourceID: String(native.id) }, output: Actions.CommandOutput.make({ kind: "runnerToken", runnerID: String(native.id),
            token: native.token, ...(native.token_expires_at ? { expiresAt: native.token_expires_at } : {}) }) }
        }))
      }
      const runnerID = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, admitted.target.resourceID ?? ""))
      if (current.provider.kind === "github") {
        if (admitted.kind === "runner.assign") return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitHub has no repository runner-assignment operation; enroll a repository runner")
        const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/runners/${runnerID}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitHubRunner, response.data))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, versionGithub(native)))
        if (String(native.id) !== runnerID) return yield* ActionsResourceNative.error(current, "binding_stale", "Native repository runner ID differs from admission")
        if (admitted.kind !== "resource.update") {
          yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/runners/${runnerID}` }, [204])
          return { acknowledgement: { resourceID: runnerID } }
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner label editing requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => {
          if (config.name !== native.name || config.runnerGroupID !== undefined)
            throw ActionsResourceNative.error(current, "capability_unavailable", "GitHub repository API edits labels only; runner renaming/group changes require native re-enrollment")
          const requested = routing(current, config.labels, config.platform)
          const readonly = native.labels.filter((label) => label.type === "read-only").map((label) => label.name.toLowerCase())
          const observed = platform(native.labels.map((label) => label.name))
          if (observed !== config.platform || readonly.some((label) => !requested.some((item) => item.toLowerCase() === label)))
            throw ActionsResourceNative.error(current, "capability_unavailable", "Platform/read-only labels describe the installed runner and cannot be changed by label editing")
          return requested.filter((label) => !readonly.includes(label.toLowerCase()))
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `${authority.root}/actions/runners/${runnerID}/labels`, body: { labels } }, [200])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ labels: Schema.Array(GitHubLabel) }), written.data, true)
          const custom = data.labels.filter((label) => label.type === "custom").map((label) => label.name.toLowerCase()).sort()
          if (JSON.stringify(custom) !== JSON.stringify(labels.map((label) => label.toLowerCase()).sort()))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner labels did not acknowledge the requested routing", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      const response = yield* ActionsResourceNative.get(services, current, `runners/${runnerID}`)
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitLabRunner, response.data))
      const owner = yield* ownership(services, current, native)
      yield* ActionsResourceNative.checked(current, () => {
        if (String(native.id) !== runnerID || native.runner_type !== "project_type" || !owner.projectID ||
          admitted.kind !== "runner.assign" && owner.projectID !== current.projectID)
          throw ActionsResourceNative.error(current, "permission_denied", "Inherited or externally owned runners are read-only in this project")
        ActionsResourceNative.requireVersion(current, admitted, versionGitlab(native, owner))
      })
      if (admitted.kind === "runner.assign") {
        const owned = yield* ActionsResourceNative.get(services, current, `projects/${owner.projectID}`)
        yield* ActionsResourceNative.checked(current, () => {
          const project = ActionsResourceNative.decode(current, GitLabCommandNative.Project, owned.data)
          if (String(project.id) !== owner.projectID) throw ActionsResourceNative.error(current, "binding_stale", "Runner owner project identity changed during assignment preflight")
          GitLabCommandNative.role(current, project, 40)
          if (native.locked === true && owner.projectID !== current.projectID)
            throw ActionsResourceNative.error(current, "permission_denied", "Locked runner cannot be assigned outside its owning project")
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/runners`, body: { runner_id: runnerID } }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (String(ActionsResourceNative.decode(current, GitLabRunner, written.data, true).id) !== runnerID)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Runner assignment response did not prove its exact native ID", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!native.projects?.some((project) => String(project.id) === current.projectID))
        return yield* ActionsResourceNative.error(current, "binding_stale", "Runner is not currently assigned to the bound native project")
      if (admitted.kind !== "resource.update") {
        if (native.projects.length !== 1) return yield* ActionsResourceNative.error(current, "permission_denied", "Deleting this runner would affect other projects; remove their assignments in the owning native scope first")
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `runners/${runnerID}` }, [204])
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner configuration requires name, labels and platform")
      const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
      const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `runners/${runnerID}`, body: { description: config.name, tag_list: labels } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, GitLabRunner, written.data, true)
        if (String(data.id) !== runnerID || data.description !== config.name || JSON.stringify(data.tag_list?.slice().sort()) !== JSON.stringify(labels.slice().sort()))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner configuration did not acknowledge requested fields", "unknown")
      }))
      return { acknowledgement: { resourceID: runnerID } }
~~~~


Linhas **215–286**; SHA256 do intervalo `8cce127c8ec33ff3329645ec04189cdb68c0f88d13b40cfb4d33ac0c0eecc54d`:

~~~~typescript
function routing(binding: Actions.Binding, labels: string | readonly string[], selected: typeof Platform.Type) {
  const supplied = typeof labels === "string" ? labels.split(",").map((item) => item.trim()) : labels.slice()
  if (supplied.some((label) => !label || label.length > 255 || /[\x00-\x1f\x7f]/.test(label)) || supplied.length > 100)
    throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing requires bounded nonempty labels/tags")
  const reserved = ["linux", "macos", "windows", "x64", "arm64", "self-hosted"]
  const result = [...(binding.provider.kind === "github" ? ["self-hosted"] : []), ...platforms[selected],
    ...supplied.filter((label) => !reserved.includes(label.toLowerCase()))]
  const unique = Array.from(new Map(result.map((label) => [label.toLowerCase(), label])).values())
  if (unique.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing exceeds native label/tag limit")
  return unique
}

function platform(labels: readonly string[]) {
  const normalized = labels.map((label) => label.toLowerCase())
  return Object.entries(platforms).find((entry) => entry[1].every((label) => normalized.includes(label.toLowerCase())))?.[0]
}

function versionGithub(runner: typeof GitHubRunner.Type) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.name, os: runner.os,
    status: runner.status, busy: runner.busy,
    labels: runner.labels.map((label) => ({ name: label.name, type: label.type })).sort((left, right) => left.name.localeCompare(right.name)) })
}

function github(binding: Actions.Binding, runner: typeof GitHubRunner.Type, requested?: string, writable = true): Actions.Resource {
  if (requested !== undefined && String(runner.id) !== requested) throw ActionsResourceNative.error(binding, "binding_stale", "Repository runner identity changed")
  // Native repository-scoped runner endpoint proves registration ownership. Label names prove no ownership.
  return { id: String(runner.id), bindingID: binding.id, kind: "runners", name: runner.name, scope: ActionsResourceNative.scope(binding),
    status: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
    data: { nativeID: String(runner.id), labels: runner.labels.map((label) => label.name), os: runner.os,
      state: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
      ...(platform(runner.labels.map((label) => label.name)) ? { platform: platform(runner.labels.map((label) => label.name)) ?? "" } : {}),
      origin: "Project runner", inherited: false, editable: writable, removable: writable, platformKind: "routing", resourceVersion: versionGithub(runner) } }
}

const ownership = Effect.fn("ActionsRunners.gitlabOwnership")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type) {
  if (runner.runner_type !== "project_type") return { projectID: undefined, labels: runner.tag_list ?? [] }
  if (!services.graphql) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner ownership requires the bound /api/graphql seam; REST assignments do not prove owner project")
  const response = yield* ActionsResourceNative.before(binding, services.graphql(binding, { kind: "runner", id: String(runner.id) }))
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Owner, response.data)
    if (response.status !== 200 || native.errors?.length || !native.data.runner || native.data.runner.id !== `gid://gitlab/Ci::Runner/${runner.id}` || native.data.runner.runnerType !== "PROJECT_TYPE")
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab did not prove this project runner's native ownership")
    const owner = native.data.runner.ownerProject?.id
    if (!owner || !/^gid:\/\/gitlab\/Project\/[1-9]\d*$/.test(owner))
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner owner project is not visible to the current actor")
    return { projectID: owner.split("/").at(-1), labels: native.data.runner.tagList ?? [] }
  })
})

function versionGitlab(runner: typeof GitLabRunner.Type, owner: { projectID?: string; labels: readonly string[] }) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.description, type: runner.runner_type,
    status: runner.status, paused: runner.paused, jobExecutionStatus: runner.job_execution_status ?? null,
    ownerProjectID: owner.projectID ?? null, labels: owner.labels.slice().sort(), locked: runner.locked ?? null,
    projects: runner.projects?.map((project) => String(project.id)).sort() ?? [] })
}

const gitlab = Effect.fn("ActionsRunners.gitlabResource")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type): Effect.fn.Return<Actions.Resource, import("../error").ActionsError> {
  const response = yield* ActionsResourceNative.get(services, binding, `runners/${runner.id}`)
  const detail = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, GitLabRunner, response.data))
  if (String(detail.id) !== String(runner.id) || detail.runner_type !== runner.runner_type)
    return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project runner detail changed identity/type")
  const owner = yield* ownership(services, binding, detail)
  const inherited = detail.runner_type !== "project_type" || owner.projectID !== binding.projectID
  return { id: String(detail.id), bindingID: binding.id, kind: "runners", name: detail.description ?? "", scope: ActionsResourceNative.scope(binding),
    status: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
    data: { nativeID: String(detail.id), labels: owner.labels, runnerType: detail.runner_type, paused: detail.paused,
      state: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
      ...(platform(owner.labels) ? { platform: platform(owner.labels) ?? "" } : {}),
      origin: detail.runner_type === "instance_type" ? "Inherited instance runner" : detail.runner_type === "group_type" ? "Inherited group runner"
        : inherited ? "Inherited project runner" : "Project runner", inherited, editable: !inherited, removable: !inherited,
      ownerProjectID: owner.projectID ?? null, platformKind: "routing", resourceVersion: versionGitlab(detail, owner) } }
})
~~~~


## A30 — Schedules GitLab nativos

Vínculo: `body.md` §4; archive de evidência: `evidence.md`, seção `A30`.


### `packages/core/src/actions/resources/schedules.ts`

Archive: `sources/packages/core/src/actions/resources/schedules.ts` · bytes: 31805 · Git blob: `700bc3658ebb06113d9027f740ff16d1e5f69cea` · SHA256: `e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab`.

Papel da fonte: GL owner/ref/timezone/active, inputs e fases variables; play sem pipeline ID.


Linhas **20–235**; SHA256 do intervalo `7359d812fa9f6795da1e945cdabc736ea8defaaea9c636749abadcdbdcf5684d`:

~~~~typescript
  variables: Schema.optionalKey(Schema.Array(Variable)), enabled: Schema.optionalKey(Schema.Boolean) })
const Toggle = Schema.Struct({ provider: Schema.Literal("gitlab"), enabled: Schema.Boolean })
const Schedule = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.String, ref: Schema.NonEmptyString,
  cron: Schema.NonEmptyString, cron_timezone: Schema.NonEmptyString, active: Schema.Boolean,
  updated_at: Schema.NonEmptyString, next_run_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  owner: Schema.Struct({ id: ActionsGitLabNative.ID, username: Schema.NonEmptyString }),
  variables: Schema.optionalKey(Schema.Array(Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }))),
  inputs: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, value: Value }))) })
const Workflow = Schema.Struct({ id: GitHubNative.ID, path: Schema.NonEmptyString, name: Schema.NonEmptyString, state: Schema.NonEmptyString })

export type Publish = (binding: Actions.Binding, intent: Actions.OperationIntent, source: Actions.Source, text: string) => Effect.Effect<ActionsContract.CommandResult, import("../error").ActionsError>
type Services = ActionsResourceNative.Services & { readonly publish?: Publish }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsSchedules.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "schedules", ["resourceID", "cursor", "limit"]))
      const current = frozen.binding
      if (current.provider.kind === "github") return yield* githubList(services, current, frozen.input)
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const selected = yield* ActionsResourceNative.checked(current, () => GitHubNative.selection(current, "gitlab.schedules", {}, frozen.input.cursor, frozen.input.limit))
      const root = `projects/${current.projectID}/pipeline_schedules`
      if (frozen.input.resourceID !== undefined) {
        const id = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, frozen.input.resourceID ?? ""))
        const response = yield* ActionsResourceNative.get(services, current, `${root}/${id}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schedule, response.data))
        if (String(native.id) !== id) return yield* ActionsResourceNative.error(current, "binding_stale", "Native schedule ID differs from the requested project schedule")
        return { items: [resource(current, native)], total: 1, capturedAt: Date.now() }
      }
      const response = yield* ActionsResourceNative.get(services, current, root, { page: selected.page, per_page: selected.per_page })
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Schema.Array(Schedule), response.data)
        return { items: native.map((item) => resource(current, item)), capturedAt: Date.now(), ...ActionsResourceNative.pagination(current, response, selected, native.length) }
      })
    }),
    perform: Effect.fn("ActionsSchedules.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "schedules",
        ["resource.create", "resource.update", "resource.delete", "schedule.play", "schedule.takeOwnership"], ["workflowID"]))
      const current = frozen.binding
      const admitted = frozen.intent
      if (current.provider.kind === "github") return yield* githubEdit(services, current, admitted, frozen.payload)
      if (admitted.target.workflowID !== undefined && admitted.target.workflowID !== ActionsGitLabNative.workflowID(current))
        return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule workflow does not identify the bound project CI configuration")
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = admitted.kind === "resource.create" ? ActionsResourceNative.input(current, Form, frozen.payload)
          : admitted.kind === "resource.update" ? ActionsResourceNative.input(current, Schema.Union([Form, Toggle]), frozen.payload)
            : ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
        if (value.provider !== "gitlab") throw ActionsResourceNative.error(current, "invalid_input", "Schedule payload belongs to another provider")
        if (admitted.kind === "resource.create" && (admitted.target.resourceID !== undefined || admitted.expected?.resourceVersion !== undefined))
          throw ActionsResourceNative.error(current, "invalid_input", "New project schedules have no existing resource ID/version")
        if (admitted.kind !== "resource.create" && admitted.target.resourceID === undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Schedule mutation requires an admitted native schedule ID")
        if (Schema.is(Form)(value)) {
          if (value.ref !== admitted.target.ref)
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule execute ref differs from admission")
          ActionsScheduleYaml.cron(current, value.cron)
          GitHubNative.ref(current, value.ref)
          if (value.zone.length > 255 || /[\x00-\x1f\x7f]/.test(value.zone))
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule timezone must be a bounded native timezone name")
        }
        return value
      })
      const form = Schema.is(Form)(input) ? input : undefined
      const authority = yield* ActionsResourceNative.authority(services, current, admitted.kind === "schedule.takeOwnership" ? 40 : 30)
      const selectedSource = yield* ActionsResourceNative.source(services, current, admitted)
      const id = admitted.target.resourceID
      const native = id === undefined ? undefined : yield* getSchedule(services, current, id)
      if (native) yield* ActionsResourceNative.checked(current, () => {
        ActionsResourceNative.requireVersion(current, admitted, version(native))
        if (admitted.kind === "resource.update" && native.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "permission_denied", "Schedule editing requires its current owner; take ownership before editing")
        if (admitted.kind === "resource.delete" && native.owner.username !== current.account && (authority.level ?? 0) < 40)
          throw ActionsResourceNative.error(current, "permission_denied", "Deleting another actor's schedule requires the native Maintainer role")
        if (!form && admitted.target.ref !== undefined && !sameRef(native.ref, admitted.target.ref))
          throw ActionsResourceNative.error(current, "source_conflict", "Native schedule ref differs from the admitted execution ref")
      })
      const overrides = form ? yield* ActionsResourceNative.checked(current, () => formOverrides(current, form)) : undefined
      if (overrides?.variables?.length) yield* ActionsResourceNative.checked(current, () => {
        if (!authority.project) throw ActionsResourceNative.error(current, "capability_unavailable", "Schedule variable policy was not observed")
        GitLabCommandNative.variables(current, authority.project, authority.level ?? 0, true)
      })
      if (overrides?.inputs !== undefined) {
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [18, 1], "schedule inputs"))
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        const path = ActionsGitLabNative.configPath(project)
        if (!path || !ActionsGitLabNative.localPath(path)) return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require an authoritative local CI spec header")
        if (!selectedSource || admitted.target.path !== undefined && admitted.target.path !== path)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require the captured native CI path/ref/commit")
        const source = yield* ActionsResourceNative.before(current, services.reader.source(current, { path, ref: selectedSource.commit }))
        if (source.bindingID !== current.id || source.path !== path || source.ref !== selectedSource.commit || source.commit !== selectedSource.commit)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule input declarations were not proved at the admitted source ref")
        yield* ActionsResourceNative.before(current, GitLabCommandInputs.check(current, services.transport, source, overrides.inputs))
      }
      const path = `${authority.root}/pipeline_schedules${id === undefined ? "" : `/${id}`}`
      if (admitted.kind === "schedule.play") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/play` }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ message: Schema.Literal("201 Created") }), response.data, true)
          return data
        }))
        return { acknowledgement: { resourceID: id, unattributed: true } }
      }
      if (admitted.kind === "schedule.takeOwnership") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/take_ownership` }, [201, 200])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
          if (String(data.id) !== id || data.owner.username !== current.account)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule ownership response did not prove the current actor", "unknown")
          return { acknowledgement: { resourceID: String(data.id) } }
        }))
      }
      if (admitted.kind === "resource.delete") {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path }, [204])
        return { acknowledgement: { resourceID: id } }
      }
      if (overrides?.inputs !== undefined && native && native.inputs === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule input names were not observed; replacement cannot be planned safely")
      const body: ActionsContract.Json | undefined = form ? { description: form.name, cron: form.cron, cron_timezone: form.zone, ref: form.ref,
        ...(form.enabled === undefined ? {} : { active: form.enabled }), ...(overrides?.inputs === undefined ? {} : { inputs: [
          ...Object.entries(overrides.inputs).map(([name, value]) => ({ name, value })),
          ...(native?.inputs ?? []).filter((item) => !Object.hasOwn(overrides.inputs ?? {}, item.name)).map((item) => ({ name: item.name, destroy: true })),
        ] }) }
        : Schema.is(Toggle)(input) ? { active: input.enabled } : undefined
      if (!body) return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule command requires its exact native form")
      if (overrides?.variables && native && native.variables === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule variable keys/types were not observed; variable edits cannot be planned safely")
      const response = yield* ActionsResourceNative.send(services, current, { method: id === undefined ? "POST" : "PUT", path, body }, id === undefined ? [201] : [200])
      const written = yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
        if (id !== undefined && String(data.id) !== id || form &&
          (data.description !== form.name || data.cron !== form.cron || data.cron_timezone !== form.zone || !sameRef(data.ref, form.ref)) ||
          Schema.is(Toggle)(input) && data.active !== input.enabled)
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested form fields", "unknown")
        if (id === undefined && data.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "outcome_unknown", "New schedule response did not prove current actor ownership", "unknown")
        return data
      }))
      if (overrides?.inputs !== undefined) {
        const observed = written.inputs === undefined ? yield* ActionsResourceNative.after(current, getSchedule(services, current, String(written.id))) : written
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (observed.inputs === undefined || !Schema.toEquivalence(Schema.Json)(Object.fromEntries(observed.inputs.map((item) => [item.name, item.value])), overrides.inputs ?? {}))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested input values", "unknown")
        }))
      }
      // Variable endpoints are separate writes. Once the schedule write succeeds,
      // any later failure is partial/unknown; never roll back or automatically retry.
      if (overrides?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(overrides.variables, (variable) => Effect.gen(function* () {
        const exists = native?.variables?.some((item) => item.key === variable.key) ?? false
        const variableResponse = yield* ActionsResourceNative.send(services, current, { method: exists ? "PUT" : "POST",
          path: `${authority.root}/pipeline_schedules/${written.id}/variables${exists ? `/${encodeURIComponent(variable.key)}` : ""}`, body: variable }, exists ? [200] : [201])
        yield* ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Variable, variableResponse.data, true)
          if (data.key !== variable.key || data.value !== variable.value || data.variable_type !== (variable.variable_type ?? "env_var"))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable response did not acknowledge its exact native key/type/value", "unknown")
        })
      }), { concurrency: 1 }))
      if (overrides?.variables && native?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(
        native.variables.filter((item) => !overrides.variables?.some((variable) => variable.key === item.key)),
        (variable) => Effect.gen(function* () {
          const response = yield* ActionsResourceNative.send(services, current, { method: "DELETE",
            path: `${authority.root}/pipeline_schedules/${written.id}/variables/${encodeURIComponent(variable.key)}` }, [202])
          yield* ActionsResourceNative.checked(current, () => {
            const deleted = ActionsResourceNative.decode(current, Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }), response.data, true)
            if (deleted.key !== variable.key || deleted.variable_type !== variable.variable_type)
              throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable deletion did not acknowledge its exact native key/type", "unknown")
          })
        }), { concurrency: 1 },
      ))
      return { acknowledgement: { resourceID: String(written.id) } }
    }),
  }
}

function formOverrides(binding: Actions.Binding, input: typeof Form.Type) {
  if ([input.input !== undefined, input.inputs !== undefined, input.variables !== undefined].filter(Boolean).length > 1)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule overrides require one unambiguous input/variable representation")
  if (input.inputMode !== undefined && input.input === undefined)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule inputMode requires the mock input field")
  const pair = input.input ? /^([A-Za-z_][A-Za-z0-9_]{0,254})=([\s\S]*)$/.exec(input.input) : undefined
  if (input.input && !pair) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule input field requires one exact key=value pair")
  const inputs = input.inputs ?? (input.input !== undefined && input.inputMode === "input" ? pair ? { [pair[1]]: pair[2] } : {} : undefined)
  const variables = input.variables ?? (input.input !== undefined && input.inputMode !== "input" ? pair ? [{ key: pair[1], value: pair[2], variable_type: "env_var" as const }] : [] : undefined)
  if (variables && (new Set(variables.map((item) => item.key)).size !== variables.length || variables.some((item) => !/^[A-Za-z0-9_]{1,255}$/.test(item.key))))
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule variables require unique bounded native keys")
  if (variables && variables.length > 100 || inputs && Object.keys(inputs).length > 100 || input.input !== undefined && input.input.length > 1024 * 1024)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule override configuration exceeds the bounded resource edit limit")
  return { inputs, variables }
}

function sameRef(native: string, selected: string) {
  return native === selected || !selected.startsWith("refs/") && (native === `refs/heads/${selected}` || native === `refs/tags/${selected}`)
}

function version(native: typeof Schedule.Type) {
  return ActionsResourceNative.version({ id: String(native.id), name: native.description, ref: native.ref,
    cron: native.cron, zone: native.cron_timezone, enabled: native.active, ownerID: String(native.owner.id), updatedAt: native.updated_at })
}

function resource(binding: Actions.Binding, native: typeof Schedule.Type): Actions.Resource {
  return { id: String(native.id), bindingID: binding.id, kind: "schedules", name: native.description, scope: ActionsResourceNative.scope(binding), owner: native.owner.username,
    status: native.active ? "Active" : "Paused", data: { nativeID: String(native.id), cron: native.cron, zone: native.cron_timezone, ref: native.ref,
      enabled: native.active, actor: native.owner.username, ownerID: String(native.owner.id), currentActor: binding.account ?? null,
      ownedByCurrentActor: native.owner.username === binding.account, editable: native.owner.username === binding.account,
      nextRunAt: native.next_run_at ?? null, resourceVersion: version(native), inputValuesRedacted: true,
      inputNames: native.inputs?.map((item) => item.name) ?? [], variableKeys: native.variables?.map((item) => ({ key: item.key, type: item.variable_type })) ?? [] } }
}

const getSchedule = Effect.fn("ActionsSchedules.get")(function* (services: Services, binding: Actions.Binding, id: string) {
  yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, id))
  const response = yield* ActionsResourceNative.get(services, binding, `projects/${binding.projectID}/pipeline_schedules/${id}`)
  const native = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schedule, response.data))
  if (String(native.id) !== id) return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project schedule ID differs from admission")
  return native
})

~~~~


## A31 — Schedules GitHub são source.write

Vínculo: `body.md` §2, 4; archive de evidência: `evidence.md`, seção `A31`.


### `packages/core/src/actions/resources/schedule-yaml.ts`

Archive: `sources/packages/core/src/actions/resources/schedule-yaml.ts` · bytes: 5345 · Git blob: `cd3a52f384a522b74910f01ea0278efc1fa5a12f` · SHA256: `57ef9c02ab37eb8cebeb87cd3a307673211f989e1bb8036cf3d4799a2b783abd`.

Papel da fonte: Cron literal e edição limitada do documento, sem execução remota.


Linhas **10–81**; SHA256 do intervalo `743d55ad0909c55d4b8406e43527dea8e5c7037fce9b278bdd1f45537e36a1e1`:

~~~~typescript

export function inspect(binding: Actions.Binding, text: string) {
  const report = diagnostics()
  const document = read(text, "github", report)
  if (!document || report.state() !== "complete")
    throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule YAML failed the shared bounded CI document guard")
  if (!object(document.value.on)) return []
  const schedules = document.value.on.schedule
  if (schedules === undefined) return []
  const entries = ActionsResourceNative.input(binding, Schedules, schedules)
  if (entries.length > 100) throw ActionsResourceNative.error(binding, "metadata_truncated", "Workflow schedule count exceeds the bounded resource limit")
  entries.forEach((entry) => cron(binding, entry.cron))
  return entries
}

// Called by SourcePublisher's injected resource callback. It changes on.schedule
// only; the publisher retains branch/blob/commit admission and actual writes.
export function edit(binding: Actions.Binding, text: string, schedules: readonly { readonly cron: string }[]) {
  inspect(binding, text)
  if (schedules.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "At most 100 workflow schedules can be authored in one bounded edit")
  schedules.forEach((entry) => cron(binding, entry.cron))
  const document = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false, resolveKnownTags: false, logLevel: "error" })
  const trigger = document.get("on", true)
  if (isAlias(trigger)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased workflow triggers require an explicit source-editor change")
  if (trigger === undefined) document.set("on", document.createNode({}))
  if (isScalar(trigger) && typeof trigger.value === "string") document.set("on", document.createNode({ [trigger.value]: null }))
  if (isSeq(trigger)) {
    if (trigger.items.some((node) => !isScalar(node) || typeof node.value !== "string"))
      throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow event sequence could not be edited without changing other triggers")
    document.set("on", document.createNode(Object.fromEntries(trigger.items.filter(isScalar).map((node) => [String(node.value), null]))))
  }
  const events = document.get("on", true)
  if (!isMap(events)) throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow triggers must be an explicit editable mapping")
  const existing = events.get("schedule", true)
  if (isAlias(existing)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased schedules require an explicit source-editor change")
  if (!schedules.length) events.delete("schedule")
  if (schedules.length) {
    if (isSeq(existing)) existing.items = schedules.map((entry, index) => {
      const node = existing.items[index]
      if (node === undefined) return document.createNode({ cron: entry.cron })
      if (!isMap(node) || isAlias(node.get("cron", true)))
        throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule aliases require an explicit source-editor change")
      node.set("cron", entry.cron)
      return node
    })
    if (!isSeq(existing)) events.set("schedule", document.createNode(schedules.map((entry) => ({ cron: entry.cron }))))
  }
  const result = document.toString()
  inspect(binding, result)
  return result
}

export function cron(binding: Actions.Binding, value: string) {
  // Native provider remains the cron parser/validator. Reject unsafe framing and
  // wrong field count here, rather than claiming a local cron dialect is native.
  if (value.length > 256 || /[\r\n\x00-\x1f\x7f]/.test(value) || value.trim().split(/ +/).length !== 5)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule cron requires five bounded native fields")
  if (binding.provider.kind === "github") {
    const names = [[], [], [], ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]]
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
    const valid = value.trim().split(/ +/).every((field, index) => field.split(",").every((item) => {
      const parts = item.split("/")
      if (parts.length > 2 || parts[1] !== undefined && (!/^[1-9]\d*$/.test(parts[1]) || Number(parts[1]) > 1000)) return false
      if (parts[0] === "*") return true
      const bounds = parts[0].split("-").map((part) => /^\d+$/.test(part) ? Number(part) : names[index].indexOf(part.toUpperCase()) + (index === 3 ? 1 : 0))
      return bounds.length <= 2 && bounds.every((part) => Number.isInteger(part) && part >= ranges[index][0] && part <= ranges[index][1]) &&
        (bounds.length === 1 || bounds[0] <= bounds[1])
    }))
    if (!valid) throw ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule cron must use its supported five-field POSIX syntax")
  }
  return value
}
~~~~


### `packages/core/src/actions/resources/schedules.ts`

Archive: `sources/packages/core/src/actions/resources/schedules.ts` · bytes: 31805 · Git blob: `700bc3658ebb06113d9027f740ff16d1e5f69cea` · SHA256: `e5664133d84a54b2187f6ba5b61d4d564579d7a58e6ed5801cc437f5454cc4ab`.

Papel da fonte: GH default branch e blob esperado, limites de inventário, sem play/ownership/pause API.


Linhas **237–335**; SHA256 do intervalo `fcd306c0a13ed7e0b8226dbf4ded79f2da6019afb0f4cf4cf8902e88def2d21d`:

~~~~typescript
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch) return yield* ActionsResourceNative.error(binding, "source_unresolved", "GitHub schedule listing requires the observed native default branch")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/commits/${encodeURIComponent(repo.native.default_branch)}`)
  const commit = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha)
  const page = yield* ActionsResourceNative.before(binding, services.reader.workflows(binding, { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), limit: input.limit ?? 20 }))
  const files = page.items.length === 0 ? new Set<string>() : yield* workflowFiles(services, binding, repo.path, commit)
  const selected = page.items.filter((workflow) => (input.resourceID === undefined || workflow.id === input.resourceID) && files.has(workflow.path))
  // One unreadable workflow source must not hide the schedules of the others: it
  // is reported as its own item. Auth, permission, rate-limit and transport
  // failures still fail the page.
  const items = yield* Effect.forEach(selected, (workflow) => Effect.gen(function* () {
    if (workflow.bindingID !== binding.id || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Native schedule workflow path/ownership was not proved")
    const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: commit }))
    if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== commit || source.commit !== commit)
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Workflow schedule source did not prove the native default-branch commit")
    const schedules = yield* ActionsResourceNative.checked(binding, () => ActionsScheduleYaml.inspect(binding, source.text))
    if (!schedules.length) return undefined
    return { id: workflow.id, bindingID: binding.id, kind: "schedules" as const, name: workflow.name ?? workflow.path,
      scope: ActionsResourceNative.scope(binding), status: workflow.state === "active" ? "Active" : workflow.state,
      data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, sourceVersion: source.version, commit,
        resourceVersion: ActionsResourceNative.version({ workflowID: workflow.id, sourceVersion: source.version, state: workflow.state }),
        cron: schedules.map((item) => item.cron).join(" · "), schedules, zone: "UTC", ref: repo.native.default_branch ?? "",
        enabled: workflow.state === "active", origin: "Workflow YAML", editMode: "source", bestEffort: true } }
  }).pipe(Effect.catchIf((error) => unreadable.includes(error.kind), (error) => Effect.succeed({ id: workflow.id, bindingID: binding.id, kind: "schedules" as const,
    name: workflow.name ?? workflow.path, scope: ActionsResourceNative.scope(binding),
    data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, commit, ref: repo.native.default_branch ?? "", zone: "UTC",
      origin: "Workflow YAML", editMode: "source", bestEffort: true, unreadable: true, problem: error.message, problemKind: error.kind } }))),
  { concurrency: 4 })
  // Cursor advances native workflows, including workflows with no schedules;
  // native workflow totals are not misrepresented as schedule totals.
  return { items: items.filter((item) => item !== undefined), capturedAt: Date.now(), ...(page.next === undefined ? {} : { next: page.next }) }
})

// Failures that describe one workflow source, not the provider connection.
const unreadable: readonly Actions.ErrorKind[] = ["source_unresolved", "source_conflict", "metadata_truncated", "invalid_input", "not_found"]

// The native list keeps workflows whose file left the default branch (deleted
// or branch-only) and GitHub-managed `dynamic/...` workflows. Neither has a
// default-branch YAML schedule and reading their source fails, so only files
// present in `.github/workflows` at the default-branch commit are read.
// https://docs.github.com/en/rest/repos/contents#get-repository-content
const workflowFiles = Effect.fn("ActionsSchedules.workflowFiles")(function* (services: Services, binding: Actions.Binding, repo: string, commit: string) {
  // Keep the transport's rejection evidence: only a definite 404 proves the directory is absent.
  const response = yield* ActionsResourceNative.before(binding, services.transport.request(binding, { method: "GET", path: `${repo}/contents/.github/workflows`, query: { ref: commit } }).pipe(
    Effect.catchIf((cause) => cause.kind === "not_found" && cause.disposition === "definitely_rejected", () => Effect.succeed(undefined)),
  ))
  if (!response || response.status === 404) return new Set<string>()
  if (response.status !== 200) {
    const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* ActionsResourceNative.error(binding, failure.kind, "Workflow directory listing was rejected")
  }
  return yield* ActionsResourceNative.checked(binding, () => {
    const entries = ActionsResourceNative.decode(binding, Schema.Array(Schema.Struct({ type: Schema.String, path: Schema.String })), response.data)
    // The contents API stops at 1,000 directory entries without saying so.
    if (entries.length >= 1000) throw ActionsResourceNative.error(binding, "metadata_truncated", "Workflow directory listing reached the native contents limit")
    return new Set(entries.filter((entry) => entry.type === "file").map((entry) => entry.path))
  })
})

const githubEdit = Effect.fn("ActionsSchedules.githubEdit")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  if (!["resource.create", "resource.update", "resource.delete"].includes(intent.kind))
    return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedules are workflow YAML; play/ownership controls have no native schedule API")
  const input = yield* ActionsResourceNative.checked(binding, () => intent.kind === "resource.delete"
    ? ActionsResourceNative.input(binding, ActionsResourceNative.ProviderOnly, payload) : ActionsResourceNative.input(binding, Form, payload))
  if (input.provider !== "github") return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule payload belongs to another provider")
  if (!services.publish) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedule changes require the owning SourcePublisher callback; open Edit YAML")
  const workflowID = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, intent.target.workflowID ?? intent.target.resourceID ?? ""))
  if (intent.target.resourceID !== undefined && intent.target.resourceID !== workflowID)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule workflow and resource target identities differ")
  const authority = yield* ActionsResourceNative.authority(services, binding)
  const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("workflow"))
    return yield* ActionsResourceNative.error(binding, "permission_denied", "Observed classic OAuth scopes deny publishing workflow-source changes")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch || intent.target.ref !== repo.native.default_branch || !intent.expected?.sourceVersion || !intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule authoring requires captured default-branch ref, sourceVersion and commit")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/workflows/${workflowID}`)
  const workflow = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Workflow, response.data))
  if (String(workflow.id) !== workflowID || workflow.path !== intent.target.path || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Captured schedule source path differs from the exact native workflow")
  const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
  if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== intent.target.ref || source.version !== intent.expected.sourceVersion || source.commit !== intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Workflow schedule source moved after admission")
  const text = yield* ActionsResourceNative.checked(binding, () => {
    ActionsResourceNative.requireVersion(binding, intent, ActionsResourceNative.version({ workflowID, sourceVersion: source.version, state: workflow.state }))
    const existing = ActionsScheduleYaml.inspect(binding, source.text)
    if (intent.kind === "resource.delete") return ActionsScheduleYaml.edit(binding, source.text, [])
    if (!Schema.is(Form)(input)) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule command requires its exact native form")
    if (input.name !== workflow.name || input.zone !== "UTC" || input.ref !== intent.target.ref || input.input || input.inputs !== undefined || input.variables !== undefined || input.inputMode !== undefined || input.enabled !== undefined)
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitHub cron triggers have no separate name, execution inputs, timezone or pause state; edit workflow YAML explicitly")
    if (intent.kind === "resource.update" && existing.length !== 1)
      throw ActionsResourceNative.error(binding, "invalid_input", "Multiple workflow cron entries require an explicit source-editor edit")
    if (intent.kind === "resource.create" && existing.length)
      throw ActionsResourceNative.error(binding, "source_conflict", "Workflow already contains schedules; edit its existing YAML")
    return ActionsScheduleYaml.edit(binding, source.text, [{ cron: input.cron }])
  })
  return yield* services.publish(binding, intent, source, text)
})
~~~~


## A32 — CLI GitHub e lifecycle de processo

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A32`.


### `packages/core/src/actions/transport.ts`

Archive: `sources/packages/core/src/actions/transport.ts` · bytes: 5201 · Git blob: `a028169bb585fb81c24889148ea61aa631c521af` · SHA256: `0bee331d9b87db900ad4310366fb4b3a7abdc7f2c6e915e926754c6eced6d2ae`.

Papel da fonte: Composição GH CLI/GL HTTP; open/upload não são capabilities universais.


Linhas **15–67**; SHA256 do intervalo `b92def9f6ae4f37482dcddb97d559c3d744025db183d55edacbe7cb960bb7811`:

~~~~typescript
  const proc = yield* AppProcess.Service
  const gitlab = ActionsGitlab.make(input.directory, proc)

  const request = Effect.fn("ActionsTransport.request")(function* (provider: Actions.Provider, request: ActionsContract.Request) {
    const executable = yield* ActionsCli.target(provider)
    const path = yield* ActionsCli.endpoint(provider, request)
    if (request.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(request.body)))
      return yield* ActionsCli.error(provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
    const body = request.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(request.body)))
    return yield* ActionsProcess.capture(proc, provider, ActionsCli.command(
      input.directory, provider, executable, ActionsCli.args(provider, request, path, true),
      request.body === undefined ? "ignore" : "pipe",
    ), body).pipe(Effect.flatMap((result) => ActionsResponse.parse(provider, result)))
  })

  const resolve = Effect.fn("ActionsTransport.resolve")(function* (provider: Actions.Provider, projectPath: string) {
    if (!projectPath || projectPath.startsWith("/") || projectPath.endsWith("/") ||
        projectPath.split("/").some((part) => !part || part === "." || part === "..") ||
        /[\s\\%?#{}:\x00-\x1f\x7f]/.test(projectPath) || (provider.kind === "github" && projectPath.split("/").length !== 2))
      return yield* ActionsCli.error(provider, "invalid_input", "Project path must be an exact native repository path", "definitely_unsent")
    if (provider.kind === "gitlab") return yield* gitlab.resolve(provider, projectPath)
    const project = yield* request(provider, { method: "GET", path: provider.kind === "github"
      ? `repos/${projectPath.split("/").map(encodeURIComponent).join("/")}` : `projects/${encodeURIComponent(projectPath)}` })
    const identity = ActionsIdentity.project(provider, project.data)
    if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
    const user = yield* request(provider, { method: "GET", path: "user" })
    const account = ActionsIdentity.account(provider, user.data)
    if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
    return { ...identity.value, account: account.value }
  })

  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })),
  )
  return {
    resolve,
    request: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.request(binding, value) : request(binding.provider, value)),
    open: (binding, value) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.open(binding, value)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub raw output uses the qualified CLI byte transport", "definitely_unsent"))),
    bytes: (binding, value) => Stream.unwrap(bound(binding, Effect.gen(function* () {
      if (binding.provider.kind === "gitlab") return gitlab.bytes(binding, value)
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
      const executable = yield* ActionsCli.target(binding.provider)
      const path = yield* ActionsCli.endpoint(binding.provider, value)
      if (value.method !== "GET" || value.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsProcess.bytes(proc, binding.provider, ActionsCli.command(input.directory, binding.provider, executable, ActionsCli.args(binding.provider, value, path, false), "ignore"))
        .pipe(Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition, bindingID: binding.id })))
    }))),
    upload: (binding, value, file) => bound(binding, binding.provider.kind === "gitlab" ? gitlab.upload(binding, value, file)
      : Effect.fail(ActionsCli.error(binding.provider, "capability_unavailable", "GitHub Actions does not provide native Secure File upload", "definitely_unsent"))),
  }
})
~~~~


### `packages/core/src/actions/transport/cli.ts`

Archive: `sources/packages/core/src/actions/transport/cli.ts` · bytes: 5166 · Git blob: `695d1c8b2cc0872ad8e2a3d554a4b010674f834c` · SHA256: `94d766a8ffb45ec126698e2cf571f7a328261579edc1969147f2043c500df819`.

Papel da fonte: Args sem shell, origin/path/headers e ambiente sem prompts/debug.


Linhas **8–90**; SHA256 do intervalo `3075e146b731255ac4f2016c4304125d130cadc196c1cc1329bdd0af2612a575`:

~~~~typescript
import { ActionsError } from "../error"

export const names = { github: "gh", gitlab: "glab" } as const

export function error(provider: Actions.Provider, kind: Actions.ErrorKind, message: string, disposition: Actions.SendDisposition = "unknown") {
  return new ActionsError({ kind, message, provider: provider.kind, disposition })
}

export const target = Effect.fn("ActionsTransport.target")(function* (provider: Actions.Provider) {
  const host = URL.parse(`https://${provider.hostname}`)
  if (!host || host.host !== provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash)
    return yield* error(provider, "host_mismatch", "Provider hostname must be an explicit canonical HTTPS host", "definitely_unsent")
  const origin = provider.kind === "github" && provider.hostname === "github.com"
    ? "https://api.github.com"
    : host.origin
  const base = provider.kind === "gitlab" ? `${origin}/api/v4` : `${origin}/api/v3`
  if (provider.apiOrigin !== origin && (provider.hostname === "github.com" || provider.apiOrigin !== base))
    return yield* error(provider, "host_mismatch", "Provider API origin does not match the CLI hostname", "definitely_unsent")
  if ((provider.kind === "gitlab" && provider.hostname === "github.com") ||
      (provider.kind === "github" && provider.hostname === "gitlab.com"))
    return yield* error(provider, "host_mismatch", "Provider kind does not match the hostname", "definitely_unsent")
  const executable = which(names[provider.kind])
  if (!executable) return yield* error(provider, "cli_missing", `${names[provider.kind]} is not installed on this server`, "definitely_unsent")
  return executable
})

export const endpoint = Effect.fn("ActionsTransport.endpoint")(function* (provider: Actions.Provider, input: ActionsContract.Request) {
  // Raw CLI/URL syntax is separate from encoded segment data. An encoded slash
  // belongs to one native GitLab project/file argument, never a new URL authority.
  const segments = yield* Effect.try({
    try: () => input.path.replace(/^\//, "").split("/").map(decodeURIComponent),
    catch: () => error(provider, "invalid_input", "Request path has invalid URL encoding", "definitely_unsent"),
  })
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(input.method) ||
      !/^\/?[A-Za-z0-9_]/.test(input.path) || /[\s\\?#{}:]/.test(input.path) ||
      segments.some((segment) => /\\|%[0-9a-f]{2}|[\x00-\x1f\x7f]/i.test(segment) ||
        segment.split("/").some((part) => !part || part === "." || part === "..")))
    return yield* error(provider, "invalid_input", "Request path must be a literal relative API endpoint", "definitely_unsent")
  const entries = Object.entries(input.query ?? {})
  if (entries.some(([key, value]) => !/^[\w[\].-]+$/.test(key) ||
      /token|secret|password|authorization|private.?key|^value$/i.test(key) ||
      (typeof value === "number" && !Number.isFinite(value))))
    return yield* error(provider, "invalid_input", "Sensitive values belong in JSON stdin, not query arguments", "definitely_unsent")
  const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()
  return `${input.path.replace(/^\//, "")}${query ? `?${query}` : ""}`
})

export function command(directory: string, provider: Actions.Provider, executable: string, args: readonly string[], stdin: "pipe" | "ignore") {
  const env = {
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_DEBUG: "", GH_FORCE_TTY: "",
    GLAB_NO_PROMPT: "1", GLAB_CHECK_UPDATE: "false", GLAB_SHOW_WHATS_NEW: "false",
    GLAB_NOTIFY_SKILL_UPDATES: "false", GLAB_DEBUG: "false", GLAB_DEBUG_HTTP: "false",
    GLAB_SEND_TELEMETRY: "false", CI: "false", GITLAB_CI: "false",
    NO_COLOR: "1", CLICOLOR: "0", CLICOLOR_FORCE: "0", FORCE_COLOR: "0", TERM: "dumb",
    GH_PAGER: "", GLAB_PAGER: "", PAGER: "",
    // A nonempty slash overrides glab's configured subfolder and trims to root.
    GITLAB_API_HOST: provider.hostname, GLAB_API_PROTOCOL: "https", GITLAB_SUBFOLDER: "/",
  }
  return ChildProcess.make(executable, args, {
    cwd: directory,
    shell: false,
    extendEnv: false,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !Object.keys(env).some((name) => name === key.toUpperCase()))),
      ...env,
    },
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    forceKillAfter: "1 second",
  })
}

export function args(provider: Actions.Provider, input: ActionsContract.Request, path: string, metadata: boolean) {
  return [
    "api", "--hostname", provider.hostname, "--method", input.method,
    ...(metadata ? ["--include"] : []),
    ...(provider.kind === "github" && provider.hostname === "github.com"
      ? ["--header", "X-GitHub-Api-Version: 2026-03-10"] : []),
    ...(input.body === undefined ? [] : ["--header", "Content-Type: application/json", "--input", "-"]),
    "--", path,
  ]
}
~~~~


### `packages/core/src/actions/transport/process.ts`

Archive: `sources/packages/core/src/actions/transport/process.ts` · bytes: 5454 · Git blob: `5da8d9899becf4814f9a3011adfafc50d20c5239` · SHA256: `03b52b82e18a5a9a0ec515895218574eefbc433597eeb64b0fb13f452575ce9b`.

Papel da fonte: Metadata/bytes com budgets, finalizador kill e EOF depende de exit.


Linhas **9–91**; SHA256 do intervalo `85abcb3254195f0f84af789a4855b49930641e94fdb5491c98baa10982e62f2a`:

~~~~typescript
import { ActionsResponse } from "./response"

const METADATA_LIMIT = 2 * 1024 * 1024
const STDERR_LIMIT = 16 * 1024

export const capture = Effect.fn("ActionsTransport.capture")(function* (
  proc: AppProcess.Interface,
  provider: Actions.Provider,
  command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    // A producer's unsent error cannot describe the CLI call after stdin starts.
    return yield* collect(proc, provider, command, stdin).pipe(
      Effect.mapError((cause) => cause instanceof ActionsError
        ? new ActionsError({ ...cause, message: cause.message, disposition: "unknown" })
        : ActionsCli.error(provider, "transport_failed", "Provider CLI process failed")),
    )
  })).pipe(
    Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "transport_failed", "Provider CLI metadata deadline exceeded")) }),
  )
})

export function bytes(proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command) {
  return Stream.unwrap(Effect.gen(function* () {
    if (provider.kind !== "github") return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab API calls require the HTTPS transport", "definitely_unsent")
    const scope = yield* Scope.make()
    // Successful early stream disposal cannot adopt a live transfer child.
    yield* Effect.addFinalizer((exit) => Scope.close(scope, Exit.isFailure(exit) ? exit : Exit.interrupt()))
    const stopped = yield* Deferred.make<never, ActionsError>()
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
      const error = ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer deadline exceeded")
      yield* Deferred.fail(stopped, error)
      yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
    }))))
    const handle = yield* proc.spawn(command).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    // Expected signal termination is data, not an unobserved failed monitor fiber.
    const exited = yield* handle.exitCode.pipe(Effect.exit, Effect.forkIn(scope))
    const stderr = yield* AppProcess.collectStream(handle.stderr, STDERR_LIMIT).pipe(Effect.exit, Effect.forkIn(scope))
    const tail = Stream.fromEffect(Effect.gen(function* () {
      const code = yield* Fiber.join(exited).pipe(Effect.flatMap((exit) => exit))
      const diagnostic = yield* Fiber.join(stderr).pipe(Effect.flatMap((exit) => exit))
      if (code !== 0) {
        const error = ActionsResponse.failure(provider, code, diagnostic.buffer)
        return yield* new ActionsError({ ...error, message: error.message, disposition: error.disposition, kind: error.kind === "transport_failed" ? "transfer_failed" : error.kind })
      }
    })).pipe(Stream.drain)
    const pull = yield* Stream.toPull(Stream.concat(handle.stdout, tail)).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(stopped)))
    const stderrFailure = Fiber.join(stderr).pipe(Effect.flatMap((exit) => Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.never))
    return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      const exit = yield* pull.pipe(Effect.raceFirst(stderrFailure), Effect.raceFirst(Deferred.await(stopped)), Effect.exit)
      if (yield* Deferred.isDone(stopped)) return yield* Deferred.await(stopped)
      return yield* exit
    })))
  })).pipe(
    Stream.mapError((cause) => cause instanceof ActionsError ? cause : ActionsCli.error(provider, "transfer_failed", "Provider CLI byte transfer failed")),
  )
}

const collect = Effect.fn("ActionsTransport.collect")(function* (
  proc: AppProcess.Interface, provider: Actions.Provider, command: ChildProcess.Command,
  stdin: Stream.Stream<Uint8Array, ActionsError> = Stream.empty,
) {
  const handle = yield* proc.spawn(command)
  const result = yield* Effect.all({
    stdout: bounded(handle.stdout, provider, METADATA_LIMIT),
    stderr: bounded(handle.stderr, provider, STDERR_LIMIT),
    exitCode: handle.exitCode, input: Stream.run(stdin, handle.stdin),
  }, { concurrency: "unbounded" })
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
})

function bounded<E>(stream: Stream.Stream<Uint8Array, E>, provider: Actions.Provider, limit: number) {
  return Stream.runFoldEffect(stream, () => ({ chunks: [] as Uint8Array[], size: 0 }), (state, chunk) => {
    if (state.size + chunk.byteLength > limit)
      return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "Provider CLI output exceeded the metadata capture limit"))
    state.chunks.push(chunk)
    state.size += chunk.byteLength
    return Effect.succeed(state)
  }).pipe(Effect.map((state) => Buffer.concat(state.chunks)))
}
~~~~


### `packages/core/src/actions/transport/identity.ts`

Archive: `sources/packages/core/src/actions/transport/identity.ts` · bytes: 1531 · Git blob: `4d9b3812a6078439d5a654bc198e5426e55b1cb2` · SHA256: `0760871fde3a3eb2f8b3a5895cae66a50266a2b731208af0a533b31570536a4a`.

Papel da fonte: Parser de conta/projeto nativos: identidade não é display text.


Linhas **1–24**; SHA256 do intervalo `0760871fde3a3eb2f8b3a5895cae66a50266a2b731208af0a533b31570536a4a`:

~~~~typescript
export * as ActionsIdentity from "./identity"

import { Option, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"

const nativeID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^0*[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
const githubProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, full_name: Schema.NonEmptyString }))
const gitlabProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, path_with_namespace: Schema.NonEmptyString }))
const githubAccount = Schema.decodeUnknownOption(Schema.Struct({ login: Schema.String.check(Schema.isPattern(/^(?=.{1,39}$)[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\[bot\])?$/)) }))
const gitlabAccount = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.String.check(Schema.isPattern(/^(?=.{2,255}$)(?!.*\.\.)(?!.*\.(?:git|atom)$)[a-zA-Z0-9_][a-zA-Z0-9_.-]*[a-zA-Z0-9_-]$/i)) }))

export function project(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github"
    ? githubProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.full_name })))
    : gitlabProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.path_with_namespace })))
}

export function account(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github" ? githubAccount(data).pipe(Option.map((data) => data.login))
    : gitlabAccount(data).pipe(Option.map((data) => data.username))
}
~~~~


## A33 — Snapshot de credenciais e HTTP GitLab

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A33`.


### `packages/core/src/actions/transport/credentials.ts`

Archive: `sources/packages/core/src/actions/transport/credentials.ts` · bytes: 5469 · Git blob: `e9fb72f248bb8500d5fc14d053ddb95396be3819` · SHA256: `36b0b3a3ed180de68ed8c8497c7231728ec4aabfd79fd67de34e33654b109010`.

Papel da fonte: Versão glab qualificada, snapshot de token/TLS limitado e regular.


Linhas **10–85**; SHA256 do intervalo `512cb2ad7aaf3a72706ebce521b3222e5ffbe539992329684014dbdabc20fa3e`:

~~~~typescript
import { AppProcess } from "../../process"
import { ActionsCli } from "./cli"

const commit = "570955d4252f860d6b0cbf3fd2ec44f86a7e6957"
const keys = ["token", "job_token", "is_oauth2", "ca_cert", "client_cert", "client_key"] as const

// Request-memory only. This module neither reads/copies a CLI config file nor
// exports credential values through the public Transport response/identity seam.
export const read = Effect.fn("ActionsTransport.credentials")(function* (proc: AppProcess.Interface, directory: string, provider: Actions.Provider) {
  const executable = yield* ActionsCli.target(provider)
  const command = ActionsCli.command(directory, provider, executable, [], "ignore")
  const get = (args: string[]) => Effect.scoped(Effect.gen(function* () {
    const handle = yield* proc.spawn(ChildProcess.make(executable, args, command.options))
    const result = yield* Effect.all({
      stdout: capture(handle.stdout), stderr: capture(handle.stderr), code: handle.exitCode,
    }, { concurrency: "unbounded" })
    if (result.code !== 0) return yield* ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read", "definitely_unsent")
    return yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout).replace(/\r?\n$/, ""),
      catch: () => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration is not valid UTF-8", "definitely_unsent"),
    })
  })).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "not_authenticated", "GitLab local sign-in configuration could not be read safely", "definitely_unsent")),
    Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(ActionsCli.error(provider, "not_authenticated", "GitLab local configuration deadline exceeded", "definitely_unsent")) }),
  )
  const version = /^glab (\S+) \(([a-f0-9]+)\)$/.exec(yield* get(["version"]))
  if (version?.[1] !== "1.118.0" || !version[2] || version[2].length < 8 || !commit.startsWith(version[2]))
    return yield* ActionsCli.error(provider, "capability_unavailable", "GitLab local configuration reads require qualified glab 1.118.0", "definitely_unsent")
  const values = Object.fromEntries(yield* Effect.forEach(keys, (key) => get(["config", "get", key, "--host", provider.hostname]).pipe(Effect.map((value) => [key, value] as const))))
  const env = command.options.env ?? {}
  // Match v1.118.0's environment-PAT precedence over a stored OAuth flag.
  const oauth = values.is_oauth2 === "true" && (!(env.GITLAB_TOKEN || env.GITLAB_ACCESS_TOKEN) || !!env.GLAB_IS_OAUTH2)
  const token = values.token || (!oauth ? values.job_token : "")
  if (!token || !/^[\x21-\x7e]+$/.test(token))
    return yield* ActionsCli.error(provider, "not_authenticated", "GitLab sign-in is missing or unusable; sign in with the CLI", "definitely_unsent")
  if (!!values.client_cert !== !!values.client_key)
    return yield* ActionsCli.error(provider, "invalid_input", "GitLab mTLS requires both client certificate and key", "definitely_unsent")
  const material = (reference: string) => reference ? file(directory, reference).pipe(
    Effect.mapError(() => ActionsCli.error(provider, "invalid_input", "Configured GitLab TLS material could not be read safely", "definitely_unsent")),
  ) : Effect.succeed(undefined)
  const tls = yield* Effect.all({ ca: material(values.ca_cert), cert: material(values.client_cert), key: material(values.client_key) })
  return {
    headers: { [oauth ? "Authorization" : values.token ? "PRIVATE-TOKEN" : "JOB-TOKEN"]: oauth ? `Bearer ${token}` : token },
    ca: tls.ca ? [...rootCertificates, tls.ca] : undefined,
    cert: tls.cert, key: tls.key,
  }
})
export type Snapshot = Effect.Success<ReturnType<typeof read>>

function capture<E>(stream: Stream.Stream<Uint8Array, E>) {
  return stream.pipe(Stream.runFoldEffect(() => ({ bytes: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
    if (state.bytes + chunk.length > 16 * 1024) return Effect.fail(new Error("Local configuration capture limit"))
    state.bytes += chunk.length
    state.chunks.push(chunk)
    return Effect.succeed(state)
  }), Effect.map((state) => Buffer.concat(state.chunks)))
}

function file(directory: string, reference: string) {
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => open(path.resolve(directory, reference), constants.O_RDONLY | constants.O_NONBLOCK)),
    (handle) => Effect.tryPromise(async () => {
      if (!(await handle.stat()).isFile()) throw new Error("TLS reference is not a regular file")
      const buffer = Buffer.alloc(256 * 1024 + 1)
      const state = { bytes: 0 }
      while (state.bytes < buffer.length) {
        const read = await handle.read(buffer, state.bytes, buffer.length - state.bytes, null)
        if (!read.bytesRead) break
        state.bytes += read.bytesRead
      }
      if (state.bytes === buffer.length) throw new Error("TLS material capture limit")
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, state.bytes))
    }),
    (handle) => Effect.promise(() => handle.close()),
  )
}
~~~~


### `packages/core/src/actions/transport/gitlab.ts`

Archive: `sources/packages/core/src/actions/transport/gitlab.ts` · bytes: 5999 · Git blob: `a21535f1c3014d492d7f07e98250bfb9e6cc3b3a` · SHA256: `94a67ca1521b8ce37b40b34a93d36d9986bdbf3727e2152399dd69b14214aef0`.

Papel da fonte: Mesma credencial para ator e write, rotas stream/upload admitidas.


Linhas **11–73**; SHA256 do intervalo `6c072aa785a5d6603fa77d5915ecde5fe63c5bd8a3b2fe3e188436b2dc83cddc`:

~~~~typescript
import { ActionsHttp } from "./http"
import { ActionsIdentity } from "./identity"

export function make(directory: string, proc: AppProcess.Interface) {
  const validate = Effect.fn("ActionsTransport.gitlabActor")(function* (binding: Actions.Binding, snapshot: ActionsCredentials.Snapshot) {
    if (!binding.account) return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab binding has no verified sign-in identity", "definitely_unsent")
    const user = yield* ActionsHttp.metadata(binding.provider, snapshot, { method: "GET", path: "user" })
      .pipe(Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "definitely_unsent" })))
    const account = ActionsIdentity.account(binding.provider, user.data)
    if (Option.isNone(account) || account.value !== binding.account)
      return yield* ActionsCli.error(binding.provider, "binding_stale", "GitLab sign-in identity changed; rebind before mutation", "definitely_unsent")
  })
  return {
    resolve: Effect.fn("ActionsTransport.gitlabResolve")(function* (provider: Actions.Provider, projectPath: string) {
      const snapshot = yield* ActionsCredentials.read(proc, directory, provider)
      const project = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: `projects/${encodeURIComponent(projectPath)}` })
      const identity = ActionsIdentity.project(provider, project.data)
      if (Option.isNone(identity)) return yield* ActionsCli.error(provider, "transport_failed", "Provider did not return native project identity")
      const user = yield* ActionsHttp.metadata(provider, snapshot, { method: "GET", path: "user" })
      const account = ActionsIdentity.account(provider, user.data)
      if (Option.isNone(account)) return yield* ActionsCli.error(provider, "not_authenticated", "Provider did not return the current signed-in account")
      return { ...identity.value, account: account.value }
    }),
    request: Effect.fn("ActionsTransport.gitlabRequest")(function* (binding: Actions.Binding, input: ActionsContract.Request) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.body !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.body)))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Request body must be JSON metadata", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      if (input.method !== "GET") yield* validate(binding, snapshot)
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input)
    }),
    open: Effect.fn("ActionsTransport.gitlabOpen")(function* (binding: Actions.Binding, input: ActionsContract.BoundRequest) {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined || input.query !== undefined ||
        !/^[1-9]\d{0,127}$/.test(binding.projectID) ||
        !new RegExp(`^projects/${binding.projectID}/jobs/[1-9]\\d{0,127}/(?:trace|artifacts(?:/.*)?)$`).test(input.path))
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw opening requires an exact bound GitLab job trace or artifact GET", "definitely_unsent")
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      return yield* ActionsHttp.openRaw(binding.provider, snapshot, input)
    }),
    bytes: (binding: Actions.Binding, input: ActionsContract.Request) => Stream.unwrap(Effect.gen(function* () {
      yield* ActionsCli.endpoint(binding.provider, input)
      if (input.method !== "GET" || input.body !== undefined)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Raw byte downloads require GET without a body", "definitely_unsent")
      return ActionsHttp.bytes(binding.provider, yield* ActionsCredentials.read(proc, directory, binding.provider), input)
    })),
    upload: Effect.fn("ActionsTransport.gitlabUpload")(function* (binding: Actions.Binding, input: ActionsContract.Request, file: { filename: string; bytes: Stream.Stream<Uint8Array, ActionsError> }) {
      if (!file.filename || file.filename === "." || file.filename === ".." || file.filename !== file.filename.trim() ||
          /[\\/:\x00-\x1f\x7f]/.test(file.filename) || file.filename.length > 255 || input.method !== "POST" ||
          input.path.replace(/^\//, "") !== `projects/${encodeURIComponent(binding.projectID)}/secure_files` ||
          input.body !== undefined || input.query?.name !== file.filename)
        return yield* ActionsCli.error(binding.provider, "invalid_input", "Secure File upload requires an exact safe filename and matching native name query", "definitely_unsent")
      yield* ActionsCli.endpoint(binding.provider, input)
      const snapshot = yield* ActionsCredentials.read(proc, directory, binding.provider)
      yield* validate(binding, snapshot)
      const boundary = `orchestra-${randomUUID()}`
      const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${file.filename}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename.replace(/["\\]/g, "\\$&")}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
      const body = Stream.concat(Stream.make(prefix), Stream.concat(file.bytes, Stream.make(new TextEncoder().encode(`\r\n--${boundary}--\r\n`))))
      return yield* ActionsHttp.metadata(binding.provider, snapshot, input, body, `multipart/form-data; boundary=${boundary}`)
    }),
  }
}
~~~~


### `packages/core/src/actions/transport/http.ts`

Archive: `sources/packages/core/src/actions/transport/http.ts` · bytes: 10713 · Git blob: `cb71e6424c0f4b9c7e714667f1298e46fe3a502d` · SHA256: `b3e60d9d087592f8847f53d94e60d3ece75cf827014407f9b4a66dfc78cc0ae7`.

Papel da fonte: TLS verificado, same origin sem redirect, phase HTTP sticky, backpressure e abort.


Linhas **15–186**; SHA256 do intervalo `6428ba8fb8f58081fb7e62d7c1e8ef05bd7e6a48b916484798fcb4e798f1997e`:

~~~~typescript

const certificateFailures = new Set([
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_REVOKED", "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
])

export function requestError(provider: Actions.Provider, cause: unknown, phase: "handshake" | "http_possible") {
  const verification = cause instanceof Error && "code" in cause && typeof cause.code === "string" && certificateFailures.has(cause.code)
  return ActionsCli.error(provider, "transport_failed", verification ? "GitLab TLS verification failed" : "GitLab HTTPS request failed",
    verification && phase === "handshake" ? "definitely_unsent" : "unknown")
}

export const metadata = Effect.fn("ActionsTransport.httpsMetadata")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError> = input.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(input.body))),
  contentType = "application/json",
) {
  return yield* Effect.scoped(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, body, contentType, "30 seconds")
    const response = yield* handle.response
    const result = yield* responseBytes(provider, response, handle).pipe(Stream.runFoldEffect(() => ({ size: 0, chunks: [] as Uint8Array[] }), (state, chunk) => {
      if (state.size + chunk.length > 2 * 1024 * 1024)
        return Effect.fail(ActionsCli.error(provider, "metadata_truncated", "GitLab metadata capture limit exceeded"))
      state.size += chunk.length
      state.chunks.push(chunk)
      return Effect.succeed(state)
    }))
    yield* Fiber.join(handle.input)
    return yield* ActionsResponse.http(provider, response.statusCode ?? 0, headers(response), Buffer.concat(result.chunks))
  }))
})

export function bytes(provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request) {
  return Stream.unwrap(Effect.gen(function* () {
    const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes")
    const response = yield* handle.response
    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) > 299) {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400)
        return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
      return yield* ActionsResponse.failure(provider, 1, Buffer.alloc(0), response.statusCode, headers(response), true)
    }
    return responseBytes(provider, response, handle)
  }))
}

export const openRaw = Effect.fn("ActionsTransport.httpsOpenRaw")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.BoundRequest,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (provider.kind !== "gitlab" || input.method !== "GET" || input.body !== undefined)
    return yield* ActionsCli.error(provider, "invalid_input", "Native raw opening requires a GitLab GET without a body", "definitely_unsent")
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  const handle = yield* open(provider, snapshot, input, Stream.empty, "application/octet-stream", "5 minutes").pipe(Scope.provide(scope))
  const response = yield* handle.response
  return {
    status: response.statusCode ?? 0, headers: headers(response), body: responseBytes(provider, response, handle),
    close: Scope.close(scope, Exit.void),
  }
})

const open = Effect.fn("ActionsTransport.httpsOpen")(function* (
  provider: Actions.Provider, snapshot: ActionsCredentials.Snapshot, input: ActionsContract.Request,
  body: Stream.Stream<Uint8Array, ActionsError>, contentType: string, deadline: "30 seconds" | "5 minutes",
) {
  const endpoint = yield* ActionsCli.endpoint(provider, input)
  const origin = URL.parse(provider.apiOrigin)
  const url = origin && URL.parse(`${origin.origin}/api/v4/${endpoint}`)
  if (!origin || !url || url.protocol !== "https:" || url.origin !== origin.origin || url.host !== provider.hostname)
    return yield* ActionsCli.error(provider, "host_mismatch", "GitLab HTTPS destination differs from the binding origin", "definitely_unsent")
  const response = yield* Deferred.make<IncomingMessage, ActionsError>()
  const failure = yield* Deferred.make<never, ActionsError>()
  const abort = new AbortController()
  const state = { error: undefined as ActionsError | undefined, response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
    phase: "handshake" as "handshake" | "http_possible" }
  const req = yield* Effect.acquireRelease(Effect.try({
    try: () => request(url, {
      method: input.method, agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal: abort.signal,
      ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
      // Verification success precedes authenticated HTTP. Keep this transition
      // sticky: later renegotiation/certificate/TLS failures cannot prove unsent.
      checkServerIdentity: (hostname, certificate) => {
        const error = checkServerIdentity(hostname, certificate)
        if (!error) state.phase = "http_possible"
        return error
      },
      headers: { ...snapshot.headers, "Content-Type": contentType, Connection: "close" },
    }),
    catch: () => ActionsCli.error(provider, "invalid_input", "GitLab HTTPS request could not be constructed safely", "definitely_unsent"),
  }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
  const fail = (error: ActionsError) => {
    state.error ??= error
    Deferred.doneUnsafe(response, Exit.fail(state.error))
    Deferred.doneUnsafe(failure, Exit.fail(state.error))
  }
  req.on("error", (cause) => {
    fail(requestError(provider, cause, state.phase))
  })
  req.on("socket", (socket) => {
    state.socket = socket
    socket.once("secureConnect", () => { state.phase = "http_possible" })
  })
  req.once("response", (incoming) => {
    state.phase = "http_possible"
    state.response = incoming
    incoming.on("error", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed")))
    incoming.on("aborted", () => fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))
    Deferred.doneUnsafe(response, Exit.succeed(incoming))
  })
  yield* Effect.forkScoped(Effect.sleep(deadline).pipe(Effect.andThen(Effect.sync(() => {
    fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS deadline exceeded"))
    abort.abort()
    state.response?.destroy()
    state.socket?.destroy()
    req.destroy()
  }))))
  const sent = yield* Effect.forkScoped(Stream.runForEach(body, (chunk) => Effect.callback<void, ActionsError>((resume) => {
    const progress = { written: false, returned: false, drained: false, blocked: false }
    const done = () => {
      if (!progress.returned || !progress.written || (progress.blocked && !progress.drained)) return
      req.off("drain", drain)
      resume(Effect.void)
    }
    const drain = () => { progress.drained = true; done() }
    // Bun can signal drain synchronously during write. Install before writing;
    // wait on callback plus backpressure instead of accumulating the whole body.
    req.once("drain", drain)
    progress.blocked = !req.write(chunk, (error) => {
      if (error) { req.off("drain", drain); resume(Effect.fail(ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload failed"))); return }
      progress.written = true; done()
    })
    progress.returned = true
    done()
    return Effect.sync(() => req.off("drain", drain))
  }).pipe(Effect.andThen(Effect.callback<void>((resume) => {
    // Let the Node/Bun I/O pump consume a chunk before the next producer pull.
    const turn = setImmediate(() => resume(Effect.void))
    return Effect.sync(() => clearImmediate(turn))
  })))).pipe(
    Effect.andThen(Effect.callback<void>((resume) => {
      const finished = () => resume(Effect.void)
      req.once("finish", finished)
      req.end()
      return Effect.sync(() => req.off("finish", finished))
    })),
    Effect.raceFirst(Deferred.await(failure)),
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: "unknown" })),
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause)
      return Effect.fail(error instanceof ActionsError ? error : ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS upload producer failed"))
    }),
    Effect.tapError((error) => Effect.sync(() => { fail(error); abort.abort(); state.socket?.destroy(); req.destroy() })),
  ))
  return { response: Deferred.await(response).pipe(Effect.raceFirst(Deferred.await(failure))), failure: Deferred.await(failure), input: sent, state }
})

function responseBytes(provider: Actions.Provider, response: IncomingMessage, handle: Effect.Success<ReturnType<typeof open>>) {
  return NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => response,
    onError: () => handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response failed"),
  }).pipe(
    Stream.concat(Stream.fromEffect(Effect.suspend(() => response.complete && !response.aborted ? Effect.void
      : Effect.fail(handle.state.error ?? ActionsCli.error(provider, "transfer_failed", "GitLab HTTPS response ended prematurely")))).pipe(Stream.drain)),
    Stream.interruptWhen(handle.failure),
    Stream.mapError((error) => handle.state.error ?? error),
  )
}

function headers(response: IncomingMessage) {
  return Object.fromEntries(Object.entries(response.headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]))
}
~~~~


## A34 — Classificação de resposta e incerteza

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A34`.


### `packages/core/src/actions/transport/response.ts`

Archive: `sources/packages/core/src/actions/transport/response.ts` · bytes: 4934 · Git blob: `09aed710878c0e33f33b7e1a8d566074a44ad30a` · SHA256: `dbe2d9284661b36cee41b379cba34f29cd6910df7757b10b94136eb12e6d8192`.

Papel da fonte: Só resposta JSON/headers completos e exit normal sustentam rejeição definitiva.


Linhas **8–76**; SHA256 do intervalo `053df9cb3928be6780ea9764f01cacd16e82794c0140e57dfea811e7fbc6b510`:

~~~~typescript

const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Json)))

export const http = Effect.fn("ActionsTransport.httpResponse")(function* (provider: Actions.Provider, status: number, headers: Record<string, string>, body: Buffer) {
  if (status >= 300 && status < 400)
    return yield* ActionsCli.error(provider, "host_mismatch", "Authenticated GitLab redirects require explicit credential-free transfer")
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(body),
    catch: () => ActionsCli.error(provider, "transport_failed", "GitLab metadata is not valid UTF-8"),
  })
  const data = json(text)
  if (status < 200 || status > 299) return yield* failure(provider, 1, Buffer.alloc(0), status, headers, Option.isSome(data))
  if ([201, 202, 204].includes(status) && !text.trim()) return { status, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "GitLab response is not valid JSON metadata")
  return { status, headers, data: data.value }
})

export const parse = Effect.fn("ActionsTransport.response")(function* (
  provider: Actions.Provider,
  result: { stdout: Buffer; stderr: Buffer; exitCode: number },
): Effect.fn.Return<ActionsContract.Response, ActionsError> {
  const text = result.stdout.toString("utf8")
  const boundary = /\r?\n\r?\n/.exec(text)
  const status = /^HTTP\/\d+(?:\.\d+)? (\d{3})(?: [^\r\n]*)?\r?\n/.exec(text)
  if (!boundary || !status) {
    if (result.exitCode !== 0) return yield* failure(provider, result.exitCode, result.stderr)
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response is missing HTTP status or headers")
  }
  const lines = text.slice(status[0].length, boundary.index).split(/\r?\n/).filter(Boolean)
  if (lines.some((line) => !/^[!#$%&'*+.^_`|~\w-]+:[^\r\n]*$/.test(line)))
    return yield* ActionsCli.error(provider, "transport_failed", "CLI response has invalid HTTP headers")
  const headers = Object.fromEntries(lines.reduce((headers, line) => {
    const index = line.indexOf(":")
    const key = line.slice(0, index).toLowerCase()
    const value = line.slice(index + 1).trim()
    headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : value)
    return headers
  }, new Map<string, string>()))
  const code = Number(status[1])
  const body = text.slice(boundary.index + boundary[0].length)
  const data = json(body)
  if (code < 200 || code > 299 || result.exitCode !== 0)
    return yield* failure(provider, result.exitCode, result.stderr, code, headers, Option.isSome(data))
  if ([201, 202, 204].includes(code) && !body.trim()) return { status: code, headers, data: null }
  if (Option.isNone(data)) return yield* ActionsCli.error(provider, "transport_failed", "CLI response is not valid JSON metadata")
  return { status: code, headers, data: data.value }
})

export function failure(provider: Actions.Provider, exitCode: number, stderr: Buffer, status?: number, headers: Record<string, string> = {}, complete = false) {
  const code = status ?? Number(/\bHTTP[ :]+(\d{3})\b/i.exec(stderr.toString("utf8"))?.[1])
  const retry = headers["retry-after"]
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry)
    : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
    : headers["x-ratelimit-remaining"] === "0" && /^\d+$/.test(headers["x-ratelimit-reset"] ?? "")
      ? Math.max(0, Number(headers["x-ratelimit-reset"]) - Math.floor(Date.now() / 1000)) : undefined
  const kind = code === 429 || (code === 403 && (retry !== undefined || headers["x-ratelimit-remaining"] === "0"))
    ? "rate_limited" : code === 401 ? "not_authenticated" : code === 403 ? "permission_denied" : code === 404 ? "not_found"
      : (provider.kind === "github" && exitCode === 4) || /auth login|not logged in|not authenticated|login first|invalid token/i.test(stderr.toString("utf8"))
        ? "not_authenticated" : "transport_failed"
  // Provider diagnostics can echo submitted secrets. Only classifications leave this boundary.
  return new ActionsError({
    kind, provider: provider.kind, message: `Provider request failed${code ? ` (HTTP ${code})` : ""}`,
    retryAfter: seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined,
    // Require complete bounded JSON and a normal CLI HTTP-error exit. Partial
    // output, stderr HTTP hints and exit codes alone cannot prove rejection.
    disposition: complete && (exitCode === 0 || exitCode === 1) && status !== undefined && [400, 401, 403, 404, 409, 422, 429].includes(status)
      ? "definitely_rejected" : "unknown",
  })
}
~~~~


### `packages/core/src/actions/transport/http.ts`

Archive: `sources/packages/core/src/actions/transport/http.ts` · bytes: 10713 · Git blob: `cb71e6424c0f4b9c7e714667f1298e46fe3a502d` · SHA256: `b3e60d9d087592f8847f53d94e60d3ece75cf827014407f9b4a66dfc78cc0ae7`.

Papel da fonte: Falha de TLS anterior ao HTTP versus possibilidade de write remoto.


Linhas **91–113**; SHA256 do intervalo `896710fc1b577c78abd18cd040bb1e80bf2f20d87ec0029ffd10243e6e0e4b21`:

~~~~typescript
  const req = yield* Effect.acquireRelease(Effect.try({
    try: () => request(url, {
      method: input.method, agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2", signal: abort.signal,
      ca: snapshot.ca, cert: snapshot.cert, key: snapshot.key,
      // Verification success precedes authenticated HTTP. Keep this transition
      // sticky: later renegotiation/certificate/TLS failures cannot prove unsent.
      checkServerIdentity: (hostname, certificate) => {
        const error = checkServerIdentity(hostname, certificate)
        if (!error) state.phase = "http_possible"
        return error
      },
      headers: { ...snapshot.headers, "Content-Type": contentType, Connection: "close" },
    }),
    catch: () => ActionsCli.error(provider, "invalid_input", "GitLab HTTPS request could not be constructed safely", "definitely_unsent"),
  }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
  const fail = (error: ActionsError) => {
    state.error ??= error
    Deferred.doneUnsafe(response, Exit.fail(state.error))
    Deferred.doneUnsafe(failure, Exit.fail(state.error))
  }
  req.on("error", (cause) => {
    fail(requestError(provider, cause, state.phase))
  })
~~~~


## A35 — Alvos de bytes e identidade do artifact

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A35`.


### `packages/core/src/actions/output/index.ts`

Archive: `sources/packages/core/src/actions/output/index.ts` · bytes: 4816 · Git blob: `97a1115aea631b1a1b8b7dc6ad438e3fb5bb1ace` · SHA256: `acf076da8a2806947561dc865a4eeb1db09d34494a3fb977c81166e04acbbc00`.

Papel da fonte: Budgets separados metadata/bytes, scope finaliza stream, sem Range arbitrário.


Linhas **12–66**; SHA256 do intervalo `d062291064dcf53afc59eded1f2680f43588d892b75f17d5eb17838f0070f76d`:

~~~~typescript

export function make(input: { transport: ActionsContract.Transport; reader: ActionsContract.ReadAdapter }) {
  const bound = <A, R>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError, R>) => effect.pipe(
    Effect.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
      bindingID: binding.id, provider: binding.provider.kind })))
  return {
    artifacts: (binding: Actions.Binding, value: Actions.ResourceListInput) => bound(binding,
      OutputArtifacts.list(input.transport, input.reader, binding, value).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
        orElse: () => Effect.fail(OutputNative.error(binding, "transport_failed", "CI artifact inventory deadline exceeded")) }))),
    info: (binding: Actions.Binding, value: Actions.TransferInput): Effect.Effect<OutputHeaders.Info, ActionsError> => bound(binding,
      Effect.scoped(Effect.gen(function* () {
        const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
        if (binding.provider.kind === "github") return target.info
        const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target)
        const info = yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
        yield* opened.response.close
        return info
      })).pipe(Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "CI output metadata deadline exceeded")) }))),
    read: (binding: Actions.Binding, value: Actions.TransferInput): Stream.Stream<Uint8Array, ActionsError> => Stream.unwrap(bound(binding,
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
        const failure = yield* Deferred.make<never, ActionsError>()
        // Closing child scope tears down socket/process directly; pull-based stream
        // timeouts alone cannot release resources under a blocked consumer.
        yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.gen(function* () {
          const error = OutputNative.error(binding, "transfer_failed", "CI output transfer deadline exceeded")
          yield* Deferred.fail(failure, error)
          // Finish resource finalizers even if downstream disposes this watchdog.
          yield* Scope.close(scope, Exit.fail(error)).pipe(Effect.uninterruptible)
        }))))
        const stream = yield* Effect.gen(function* () {
          const target = yield* OutputTarget.resolve(input.transport, input.reader, binding, value)
          if (binding.provider.kind === "github") return input.transport.bytes(binding, target.request)
          const opened = yield* OutputDownload.open(input.transport, input.reader, binding, value, target, true)
          if (opened.response.status === 206 || opened.response.headers["content-range"] !== undefined)
            return yield* OutputNative.error(binding, "transfer_failed", "CI output endpoint returned an unrequested partial transfer")
          yield* OutputNative.checked(binding, () => OutputHeaders.info(binding, opened.info, opened.response.headers))
          return opened.response.body
        }).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Bind the channel's actual resource scope, not merely its service context.
        // Nested Stream.unwrap (GH spawn) acquires in this watchdog-owned scope.
        const pull = yield* Stream.toPull(stream).pipe(Scope.provide(scope), Effect.raceFirst(Deferred.await(failure)))
        // Preserve deadline failure across downstream-held chunks and cached EOF.
        return Stream.fromPull(Effect.succeed(Effect.gen(function* () {
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          const exit = yield* pull.pipe(Effect.raceFirst(Deferred.await(failure)), Effect.exit)
          if (yield* Deferred.isDone(failure)) return yield* Deferred.await(failure)
          return yield* exit
        }))).pipe(
          Stream.mapError((error) => new ActionsError({ ...error, message: error.message, disposition: error.disposition,
            bindingID: binding.id, provider: binding.provider.kind })))
      }))),
  }
}
~~~~


### `packages/core/src/actions/output/artifacts.ts`

Archive: `sources/packages/core/src/actions/output/artifacts.ts` · bytes: 5515 · Git blob: `56d6c846172b96e1130b2bf8737712af9e0c5be0` · SHA256: `be26b08a227078ed6c0363be1f47ebdceda0b27a46749ad208d2642ea3ef46a7`.

Papel da fonte: Metadados GH/GL com artifactID/jobID e version allowlist.


Linhas **12–73**; SHA256 do intervalo `db691e3fb33a8b00c6856932b17700fe1ee1528431ddb7f50f7b42f77a0e4ab1`:

~~~~typescript
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.ResourceListInput,
): Effect.fn.Return<Actions.ResourcePage, ActionsError> {
  const selected = yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.ResourceListInput, ["kind", "runID", "cursor", "limit", "query"])
    if (input.kind !== "artifacts") throw OutputNative.error(binding, "capability_unavailable", "CI output only lists native artifacts")
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.query !== undefined && (binding.provider.kind !== "github" || input.query.length > 1024 || /[\x00-\x1f\x7f]/.test(input.query)))
      throw OutputNative.error(binding, "invalid_input", "Artifact name filtering requires a bounded native GitHub name")
    const limit = ActionsCursor.limit(input.limit)
    const scope = `output:artifacts:${input.runID ?? "project"}`
    const filters = { runID: input.runID, name: input.query, per_page: limit }
    return { limit, scope, filters, page: ActionsCursor.page(binding, scope, filters, input.cursor) }
  })
  const root = yield* OutputNative.project(transport, binding)
  if (input.runID !== undefined) yield* OutputNative.run(reader, binding, input.runID)
  const request: ActionsContract.Request = {
    method: "GET",
    path: binding.provider.kind === "github"
      ? `${root}/actions/${input.runID ? `runs/${input.runID}/` : ""}artifacts`
      : `${root}/${input.runID ? `pipelines/${input.runID}/jobs` : "jobs"}`,
    query: { page: selected.page, per_page: selected.limit,
      ...(input.query === undefined ? {} : { name: input.query }),
      ...(binding.provider.kind === "gitlab" && input.runID ? { include_retried: true } : {}) },
  }
  const response = yield* OutputNative.get(transport, binding, request.path, request.query)
  return yield* OutputNative.checked(binding, () => {
    if (binding.provider.kind === "github") {
      const value = OutputNative.decode(binding, Schema.Struct({ total_count: OutputNative.Count,
        artifacts: Schema.Array(OutputNative.Artifact).check(Schema.isMaxLength(100)) }), response.data)
      const items = value.artifacts.map((artifact) => {
        OutputNative.artifactOwner(binding, artifact, undefined, input.runID)
        // Explicit native allowlist: no archive_download_url, actor tokens or unbounded provider JSON.
        return Actions.Resource.make({ id: String(artifact.id), bindingID: binding.id, kind: "artifacts",
          name: artifact.name, scope: String(artifact.workflow_run.id), status: artifact.expired ? "expired" : "available",
           data: { id: artifact.id, name: artifact.name, resourceVersion: OutputVersion.github(artifact), size_in_bytes: artifact.size_in_bytes, expired: artifact.expired,
            workflow_run: { id: artifact.workflow_run.id, repository_id: artifact.workflow_run.repository_id,
              ...(artifact.workflow_run.head_repository_id === undefined ? {} : { head_repository_id: artifact.workflow_run.head_repository_id }) },
            ...(artifact.digest === undefined ? {} : { digest: artifact.digest }),
            ...(artifact.created_at === undefined ? {} : { created_at: artifact.created_at }),
            ...(artifact.updated_at === undefined ? {} : { updated_at: artifact.updated_at }),
            ...(artifact.expires_at === undefined ? {} : { expires_at: artifact.expires_at }) } })
      })
      return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
        selected.page, items.length, selected.limit, value.total_count) }
    }
    const jobs = OutputNative.decode(binding, Schema.Array(OutputNative.GitLabJob).check(Schema.isMaxLength(100)), response.data)
    const items = jobs.map((job) => {
      OutputNative.gitlabOwner(binding, job, undefined, input.runID)
      // GitLab archive identity IS job ID. Inventory includes erased/expired/no-artifact jobs.
      return Actions.Resource.make({ id: String(job.id), bindingID: binding.id, kind: "artifacts", name: OutputNative.gitlabArchive(job)?.filename ?? job.name,
        scope: String(job.pipeline.id), owner: String(job.id), status: OutputNative.gitlabState(job),
         data: { id: job.id, name: job.name, resourceVersion: OutputVersion.gitlab(job), status: job.status, pipeline: job.pipeline,
          artifacts: job.artifacts.map((artifact) => ({ file_type: artifact.file_type, size: artifact.size, filename: artifact.filename,
            ...(artifact.file_format === undefined ? {} : { file_format: artifact.file_format }) })),
          ...(job.artifacts_file === undefined ? {} : { artifacts_file: job.artifacts_file }),
          ...(job.artifacts_expire_at === undefined ? {} : { artifacts_expire_at: job.artifacts_expire_at }),
          ...(job.erased_at === undefined ? {} : { erased_at: job.erased_at }) } })
    })
    return { items, ...OutputNative.pagination(binding, request, selected.scope, selected.filters, response,
      selected.page, jobs.length, selected.limit) }
  })
})
~~~~


### `packages/core/src/actions/output/target.ts`

Archive: `sources/packages/core/src/actions/output/target.ts` · bytes: 7464 · Git blob: `9195013d45d2b5deec234398d8a4fde834bf8edd` · SHA256: `162391bc77848f4dc03cb6b340375cfc732bc7f3137a810998196ef17f03bf2d`.

Papel da fonte: Validação de kind/path/run/job/attempt e ownership antes de transferir.


Linhas **12–103**; SHA256 do intervalo `4970031d31fbcf96e7c9e59d152ee73fe76ddae67daf83055500b8796d732198`:

~~~~typescript
export const resolve = Effect.fn("ActionsOutput.target")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.TransferInput,
): Effect.fn.Return<Target, ActionsError> {
  yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.TransferInput, ["kind", "id", "runID", "attempt", "path"])
    OutputNative.id(binding, input.id)
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw OutputNative.error(binding, "invalid_input", "CI output attempt must be a safe positive native integer")
    if (input.kind === "secureFile") throw OutputNative.error(binding, "capability_unavailable", "Secure Files are outside CI output")
    if (input.path !== undefined) {
      OutputNative.filePath(binding, input.path)
      if (binding.provider.kind !== "gitlab" || input.kind !== "artifact")
        throw OutputNative.error(binding, "capability_unavailable", "Direct artifact file reads require the native GitLab job API")
    }
    if (binding.provider.kind === "gitlab" && (input.kind === "runLog" || input.attempt !== undefined))
      throw OutputNative.error(binding, "capability_unavailable", "GitLab exposes job traces and immutable job IDs, not pipeline logs or numeric run attempts")
    if (binding.provider.kind === "github" && input.kind === "artifact" && input.attempt !== undefined)
      throw OutputNative.error(binding, "capability_unavailable", "GitHub artifact metadata does not attribute an artifact to a numeric run attempt")
    if (input.kind === "runLog" && input.runID !== undefined && input.id !== input.runID)
      throw OutputNative.error(binding, "invalid_input", "Run log ID must equal the selected run ID")
  })
  const root = yield* OutputNative.project(transport, binding)
  if (binding.provider.kind === "gitlab") {
    const response = yield* OutputNative.get(transport, binding, `${root}/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const job = OutputNative.decode(binding, OutputNative.GitLabJob, response.data)
      OutputNative.gitlabOwner(binding, job, input.id, input.runID)
      if (job.erased_at) throw OutputNative.error(binding, "not_found", "GitLab job output was erased")
      if (input.kind === "artifact" && OutputNative.gitlabState(job) === "expired")
        throw OutputNative.error(binding, "not_found", "GitLab job artifacts are expired or unavailable")
      if (input.kind === "artifact" && !OutputNative.gitlabArchive(job))
        throw OutputNative.error(binding, "capability_unavailable", "GitLab job has no native downloadable artifact archive")
      return job
    })
    yield* OutputNative.run(reader, binding, String(job.pipeline.id))
    const archive = OutputNative.gitlabArchive(job)
    const path = input.path === undefined ? undefined : yield* OutputNative.checked(binding, () => OutputNative.filePath(binding, input.path ?? ""))
    return { request: { method: "GET", path: `${root}/jobs/${input.id}/${input.kind === "jobLog" ? "trace" : `artifacts${path === undefined ? "" : `/${path}`}`}` },
      info: { filename: OutputHeaders.filename(input.kind === "jobLog" ? `job-${input.id}.log`
        : input.path ?? archive?.filename ?? `job-${input.id}-artifacts.zip`, `job-${input.id}.bin`),
        contentType: input.kind === "jobLog" || path !== undefined ? "text/plain" : "application/zip",
        ...(input.kind === "artifact" && path === undefined && archive ? { size: archive.size } : {}) } }
  }
  if (input.kind === "artifact") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/artifacts/${input.id}`)
    const artifact = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.Artifact, response.data)
      OutputNative.artifactOwner(binding, value, input.id, input.runID)
      if (value.expired) throw OutputNative.error(binding, "not_found", "GitHub artifact has expired")
      return value
    })
    yield* OutputNative.run(reader, binding, String(artifact.workflow_run.id))
    return { request: { method: "GET", path: `${root}/actions/artifacts/${input.id}/zip` },
      info: { filename: OutputHeaders.filename(`${artifact.name}.zip`, `artifact-${input.id}.zip`), contentType: "application/zip",
        size: artifact.size_in_bytes, ...(artifact.digest ? { digest: artifact.digest } : {}) } }
  }
  if (input.kind === "jobLog") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.GitHubJob, response.data)
      if (String(value.id) !== input.id || (input.runID !== undefined && String(value.run_id) !== input.runID) ||
        (input.attempt !== undefined && value.run_attempt !== input.attempt))
        throw OutputNative.error(binding, "binding_stale", "GitHub log job differs from the selected job, run or attempt")
      return value
    })
    yield* requireAttempt(transport, reader, binding, root, String(job.run_id), job.run_attempt)
    return { request: { method: "GET", path: `${root}/actions/jobs/${input.id}/logs` },
      info: { filename: `job-${input.id}-attempt-${job.run_attempt}.log`, contentType: "text/plain" } }
  }
  const run = yield* OutputNative.run(reader, binding, input.id)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined) return yield* OutputNative.error(binding, "capability_unavailable", "GitHub run metadata did not identify the log attempt")
  yield* requireAttempt(transport, reader, binding, root, input.id, attempt, run)
  return { request: { method: "GET", path: `${root}/actions/runs/${input.id}/attempts/${attempt}/logs` },
    info: { filename: `run-${input.id}-attempt-${attempt}-logs.zip`, contentType: "application/zip" } }
})

const requireAttempt = Effect.fn("ActionsOutput.attempt")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, root: string,
  runID: string, attempt: number, observed?: Actions.Run,
) {
  const run = observed ?? (yield* OutputNative.run(reader, binding, runID))
  if (run.attempt === undefined || attempt > run.attempt)
    return yield* OutputNative.error(binding, "binding_stale", "Selected GitHub log attempt does not exist on this run")
  const response = yield* OutputNative.get(transport, binding, `${root}/actions/runs/${runID}/attempts/${attempt}`)
  yield* OutputNative.checked(binding, () => {
    const value = OutputNative.decode(binding, OutputNative.GitHubAttempt, response.data)
    if (String(value.id) !== runID || String(value.repository.id) !== binding.projectID || value.run_attempt !== attempt)
      throw OutputNative.error(binding, "binding_stale", "GitHub native log attempt belongs to a different repository, run or attempt")
  })
})
~~~~


### `packages/core/src/actions/output/native.ts`

Archive: `sources/packages/core/src/actions/output/native.ts` · bytes: 10694 · Git blob: `93f8202c25955c4105c25f2ccdfada2df3352ad3` · SHA256: `200f3167fa58f45c0d9470ae9d50145392a05bb23f193c22e750214ca73a775b`.

Papel da fonte: Schemas nativos, ownership e erased/expired/available/unavailable.


Linhas **12–67**; SHA256 do intervalo `8e75fc6d36c8173180e20ffb098e224c4eeefe93f6ce39945bc5a821608c596e`:

~~~~typescript
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Text = Schema.String.check(Schema.isMaxLength(4096))
export const Time = Schema.String.check(Schema.isMaxLength(64),
  Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/),
  Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value)) ? undefined : "Invalid native timestamp"))
export const Artifact = Schema.Struct({
  id: ID, name: Text, size_in_bytes: Count, expired: Schema.Boolean,
  created_at: Schema.optionalKey(Time), updated_at: Schema.optionalKey(Time), expires_at: Schema.optionalKey(Schema.NullOr(Time)),
  digest: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/i)))),
  workflow_run: Schema.Struct({ id: ID, repository_id: ID, head_repository_id: Schema.optionalKey(ID),
    head_branch: Schema.optionalKey(Schema.NullOr(Text)), head_sha: Schema.optionalKey(Text) }),
})
export const GitHubJob = Schema.Struct({ id: ID, run_id: ID, run_attempt: Positive, name: Text })
export const GitHubAttempt = Schema.Struct({ id: ID, run_attempt: Positive, repository: Schema.Struct({ id: ID }) })
export const GitLabFile = Schema.Struct({ file_type: Text, size: Count, filename: Text, file_format: Schema.optionalKey(Schema.NullOr(Text)) })
const EmptyArtifactFile = Schema.Struct({}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const GitLabJob = Schema.Struct({
  id: ID, name: Text, status: Schema.NullOr(Text), pipeline: Schema.Struct({ id: ID, project_id: ID }),
  artifacts: Schema.Array(GitLabFile).check(Schema.isMaxLength(1000)),
  artifacts_file: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Struct({ filename: Text, size: Count }), EmptyArtifactFile]))),
  artifacts_expire_at: Schema.optionalKey(Schema.NullOr(Time)), erased_at: Schema.optionalKey(Schema.NullOr(Time)),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind,
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "CI output metadata could not be interpreted safely") })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider returned invalid native CI output metadata")
  return decoded.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value))
    throw error(binding, "invalid_input", "CI output target ID must be a canonical positive decimal")
  return value
}

export function root(binding: Actions.Binding) {
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${id(binding, binding.projectID)}`
}

export function selection(binding: Actions.Binding, input: object, schema: Schema.Top, fields: readonly string[]) {
  if (Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)) || Object.keys(input).some((key) => !fields.includes(key)))
    throw error(binding, "invalid_input", "CI output selection contains invalid or unsupported fields")
}
~~~~


Linhas **88–116**; SHA256 do intervalo `4e9a14a8a3f4422b5576a0a15a524e1187dd674678d1fd8893a7627f07321976`:

~~~~typescript
  const response = yield* get(transport, binding, path)
  yield* checked(binding, () => {
    if (String(decode(binding, Schema.Struct({ id: ID }), response.data).id) !== binding.projectID)
      throw error(binding, "binding_stale", "CI output project identity differs from the immutable binding")
  })
  return path
})

export const run = Effect.fn("ActionsOutput.run")(function* (reader: ActionsContract.ReadAdapter, binding: Actions.Binding, runID: string) {
  yield* checked(binding, () => id(binding, runID))
  const value = yield* reader.run(binding, runID)
  return yield* checked(binding, () => {
    if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024)
      throw error(binding, "metadata_truncated", "CI output run metadata capture limit exceeded")
    const run = decode(binding, Actions.Run, value)
    if (run.attempt !== undefined && (!Number.isSafeInteger(run.attempt) || run.attempt < 1))
      throw error(binding, "transport_failed", "CI output run metadata returned an invalid attempt")
    if (run.id !== runID || run.bindingID !== binding.id || (run.repositoryID !== undefined && run.repositoryID !== binding.projectID))
      throw error(binding, "binding_stale", "CI output run does not belong to this binding and run selection")
    return run
  })
})

export function pagination(binding: Actions.Binding, request: ActionsContract.Request, scope: string,
  filters: Readonly<Record<string, unknown>>, response: ActionsContract.Response, page: number, count: number, limit: number, nativeTotal?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "Provider returned invalid CI output pagination metadata")
~~~~


Linhas **142–167**; SHA256 do intervalo `ee7c3631dbea8f91763b54d4ce250a2e44decbafdde0bb1b60df85631a988073`:

~~~~typescript
export function gitlabOwner(binding: Actions.Binding, job: typeof GitLabJob.Type, jobID?: string, runID?: string) {
  if (String(job.pipeline.project_id) !== binding.projectID || (jobID !== undefined && String(job.id) !== jobID) ||
    (runID !== undefined && String(job.pipeline.id) !== runID))
    throw error(binding, "binding_stale", "GitLab artifact job does not belong to the selected project, pipeline and job")
}

export function artifactOwner(binding: Actions.Binding, artifact: typeof Artifact.Type, artifactID?: string, runID?: string) {
  if (String(artifact.workflow_run.repository_id) !== binding.projectID || (artifactID !== undefined && String(artifact.id) !== artifactID) ||
    (runID !== undefined && String(artifact.workflow_run.id) !== runID))
    throw error(binding, "binding_stale", "GitHub artifact does not belong to the selected repository, run and artifact")
}

export function gitlabState(job: typeof GitLabJob.Type) {
  if (job.erased_at) return "erased"
  if (job.artifacts_expire_at && Date.parse(job.artifacts_expire_at) <= Date.now()) return "expired"
  if (gitlabArchive(job)) return "available"
  return "unavailable"
}

export function gitlabArchive(job: typeof GitLabJob.Type) {
  const file = job.artifacts_file
  if (file && "filename" in file && typeof file.filename === "string" && "size" in file && typeof file.size === "number" && file.filename)
    return { filename: file.filename, size: file.size }
  const artifact = job.artifacts.find((file) => file.file_type === "archive" && !!file.filename)
  return artifact && { filename: artifact.filename, size: artifact.size }
}
~~~~


## A36 — URL assinada, renovação e headers

Vínculo: `body.md` §5; archive de evidência: `evidence.md`, seção `A36`.


### `packages/core/src/actions/output/download.ts`

Archive: `sources/packages/core/src/actions/output/download.ts` · bytes: 2496 · Git blob: `b3e1e73f3a0f7f3604bae702cb749983f4178f29` · SHA256: `4dcb6f81b4fd186dbcd19da13ff1a0c0a47df7ba9e4ea7eb8ee5734959d4b8f7`.

Papel da fonte: Um renewal read-only antes de bytes, sem replay parcial, rechecagem de identidade.


Linhas **7–39**; SHA256 do intervalo `c572906d26876d85f5cc200fdfa3edfaacbef14948fe7a9c756607f29b9b3631`:

~~~~typescript
import { ActionsResponse } from "../transport/response"
import { OutputNative } from "./native"
import { OutputSigned } from "./signed"
import { OutputTarget } from "./target"

export const open = Effect.fn("ActionsOutput.downloadOpen")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding,
  input: Actions.TransferInput, target: OutputTarget.Target, renew = false,
): Effect.fn.Return<{ response: ActionsContract.RawResponse; info: Actions.TransferInfo }, ActionsError, Scope.Scope> {
  if (!transport.open) return yield* OutputNative.error(binding, "capability_unavailable", "GitLab CI output requires the scoped native raw-opening transport")
  const native = yield* transport.open(binding, target.request)
  if (native.status >= 200 && native.status < 300) return { response: native, info: target.info }
  if (![301, 302, 303, 307, 308].includes(native.status)) {
    yield* native.close
    return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), native.status, { ...native.headers })
  }
  const location = native.headers.location
  yield* native.close
  if (!location) return yield* OutputNative.error(binding, "transfer_failed", "Native CI output redirect has no Location")
  const base = yield* OutputNative.checked(binding, () => new URL(`${new URL(binding.provider.apiOrigin).origin}/api/v4/${target.request.path}`))
  const signed = yield* OutputSigned.follow(binding, location, base)
  if (signed.status >= 200 && signed.status < 300) return { response: signed, info: target.info }
  yield* signed.close
  // One read-only renewal, before any byte reaches caller. Revalidate identities
  // and GET original native endpoint; never replay an expired signed URL.
  if (renew && [401, 403, 404].includes(signed.status)) {
    const fresh = yield* OutputTarget.resolve(transport, reader, binding, input)
    if (fresh.request.path !== target.request.path)
      return yield* OutputNative.error(binding, "binding_stale", "Signed URL renewal changed the selected native output endpoint")
    return yield* open(transport, reader, binding, input, fresh, false)
  }
  return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), signed.status, { ...signed.headers })
})
~~~~


### `packages/core/src/actions/output/signed.ts`

Archive: `sources/packages/core/src/actions/output/signed.ts` · bytes: 5817 · Git blob: `e3f97544c559f1cc5b67623a047a431a37219117` · SHA256: `0432ae5abfc0aa4d7cefb225433a0da3e3cff8539e110dab54dafedf9e833bc8`.

Papel da fonte: Getter separado sem credenciais nativas; HTTPS, timeout e redirects limitados.


Linhas **11–90**; SHA256 do intervalo `f28fbffd2afee9d5324bd3e5dfbc6fe19d08f9d216470fc582bf3355ebfec2d8`:

~~~~typescript
import { ActionsError } from "../error"
import { OutputNative } from "./native"

export function destination(binding: Actions.Binding, location: string | undefined, base?: URL) {
  const url = location !== undefined && URL.parse(location, base)
  if (!location || location.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(location) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(location) || !url || url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.hash || location.includes("#"))
    throw OutputNative.error(binding, "host_mismatch", "Signed CI output destination must be credential-free HTTPS without fragments or controls")
  return url
}

// Bare Node HTTPS. Deliberately accepts neither native credentials, client TLS
// material, cookies nor caller headers. Every redirect is separately validated.
export const open = Effect.fn("ActionsOutput.signedOpen")(function* (
  binding: Actions.Binding, url: URL,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  yield* OutputNative.checked(binding, () => destination(binding, url.href))
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  return yield* Effect.gen(function* () {
    const response = yield* Deferred.make<IncomingMessage, ActionsError>()
    const failure = yield* Deferred.make<never, ActionsError>()
    const state = { response: undefined as IncomingMessage | undefined, socket: undefined as Socket | undefined,
      error: undefined as ActionsError | undefined }
    const abort = new AbortController()
    const req = yield* Effect.acquireRelease(Effect.try({
      try: () => request(url, {
        method: "GET", agent: false, signal: abort.signal, rejectUnauthorized: true, minVersion: "TLSv1.2",
        checkServerIdentity, maxHeaderSize: 16 * 1024,
        headers: { Accept: "application/octet-stream", Connection: "close" },
      }),
      catch: () => OutputNative.error(binding, "transfer_failed", "Signed CI output request could not be opened"),
    }), (req) => Effect.sync(() => { abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy() }))
    const fail = (error: ActionsError) => {
      state.error ??= error
      Deferred.doneUnsafe(response, Exit.fail(state.error))
      Deferred.doneUnsafe(failure, Exit.fail(state.error))
    }
    req.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output HTTPS or TLS request failed")))
    req.on("socket", (socket) => { state.socket = socket })
    req.once("response", (incoming) => {
      state.response = incoming
      incoming.on("error", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response failed")))
      incoming.on("aborted", () => fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))
      Deferred.doneUnsafe(response, Exit.succeed(incoming))
    })
    // Own watchdog closes socket even when downstream holds a chunk forever.
    yield* Effect.forkScoped(Effect.sleep("5 minutes").pipe(Effect.andThen(Effect.sync(() => {
      fail(OutputNative.error(binding, "transfer_failed", "Signed CI output deadline exceeded"))
      abort.abort(); state.response?.destroy(); state.socket?.destroy(); req.destroy()
    }))))
    req.end()
    const incoming = yield* Deferred.await(response).pipe(Effect.timeoutOrElse({ duration: "30 seconds",
      orElse: () => Effect.fail(OutputNative.error(binding, "transfer_failed", "Signed CI output response header deadline exceeded")) }))
    return { status: incoming.statusCode ?? 0,
      headers: Object.fromEntries(Object.entries(incoming.headers)
        .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
        .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])),
      body: NodeStream.fromReadable<Uint8Array, ActionsError>({ evaluate: () => incoming,
        onError: () => state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response failed") }).pipe(
        Stream.concat(Stream.fromEffect(Effect.suspend(() => incoming.complete && !incoming.aborted ? Effect.void
          : Effect.fail(state.error ?? OutputNative.error(binding, "transfer_failed", "Signed CI output response ended prematurely")))).pipe(Stream.drain)),
        Stream.interruptWhen(Deferred.await(failure)), Stream.mapError((error) => state.error ?? error)),
      close: Scope.close(scope, Exit.void) }
  }).pipe(Scope.provide(scope), Effect.tapError(() => Scope.close(scope, Exit.void)))
})

export const follow = Effect.fn("ActionsOutput.signedFollow")(function* (
  binding: Actions.Binding, location: string, base: URL, hops = 0,
): Effect.fn.Return<ActionsContract.RawResponse, ActionsError, Scope.Scope> {
  if (hops >= 3) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect limit exceeded")
  const url = yield* OutputNative.checked(binding, () => destination(binding, location, base))
  const response = yield* open(binding, url)
  if (![301, 302, 303, 307, 308].includes(response.status)) return response
  const next = response.headers.location
  yield* response.close
  if (!next) return yield* OutputNative.error(binding, "transfer_failed", "Signed CI output redirect has no Location")
  return yield* follow(binding, next, url, hops + 1)
})
~~~~


### `packages/core/src/actions/output/headers.ts`

Archive: `sources/packages/core/src/actions/output/headers.ts` · bytes: 3345 · Git blob: `f7d5a6f28a5e7752f07ec01008136dc470c6fe61` · SHA256: `80cb68c5a02e39fd450630d1e8817d7435ada999c212c3b1e8e568a0d1a35549`.

Papel da fonte: Filename seguro e metadados limitados não são checksum da transferência.


Linhas **7–46**; SHA256 do intervalo `ca1737d85f6dd34e48d4d0eedd29c2e74c7740c5f474b1135b3911d51e742223`:

~~~~typescript
// is invented when the public input has no range field.
export type Info = Actions.TransferInfo & { readonly contentRange?: string; readonly acceptRanges?: string }

export function filename(value: string, fallback: string) {
  const name = value.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "_").trim().slice(0, 200).replace(/[. ]+$/, "")
  if (!name || name === "." || name === "..") return fallback
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name
}

export function info(binding: Actions.Binding, native: Actions.TransferInfo, headers: Readonly<Record<string, string>>): Info {
  const disposition = headers["content-disposition"]
  if (disposition !== undefined && (disposition.length > 8192 || /[\x00-\x1f\x7f]/.test(disposition)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Disposition")
  const extended = disposition && /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = disposition && /(?:^|;)\s*filename=(?:"([^"\r\n]*)"|([^;]*))/i.exec(disposition)
  const name = extended ? decodeURIComponent(extended.trim()) : plain?.[1] ?? plain?.[2]?.trim()
  const type = safeHeader(binding, headers["content-type"], 512)
  if (type !== undefined && !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;[^\r\n]*)?$/.test(type))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Type")
  const length = headers["content-length"]
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Length")
  const digest = safeHeader(binding, headers["content-digest"] ?? headers.digest ?? headers["x-amz-checksum-sha256"] ?? native.digest, 1024)
  const contentRange = safeHeader(binding, headers["content-range"], 128)
  if (contentRange !== undefined && !/^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/.test(contentRange))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Range")
  const acceptRanges = headers["accept-ranges"]
  if (acceptRanges !== undefined && acceptRanges !== "bytes" && acceptRanges !== "none")
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Accept-Ranges")
  return { filename: filename(name ?? native.filename, native.filename), contentType: type ?? native.contentType,
    ...(length === undefined ? (native.size === undefined ? {} : { size: native.size }) : { size: Number(length) }),
    ...(digest === undefined ? {} : { digest }), ...(contentRange === undefined ? {} : { contentRange }),
    ...(acceptRanges === undefined ? {} : { acceptRanges }) }
}

function safeHeader(binding: Actions.Binding, value: string | undefined, maximum: number) {
  if (value !== undefined && (value.length > maximum || /[\x00-\x1f\x7f]/.test(value)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output transfer headers")
  return value
}
~~~~


## A37 — Mutações de artifact e versão selecionada

Vínculo: `body.md` §4, 5; archive de evidência: `evidence.md`, seção `A37`.


### `packages/core/src/actions/output/mutations.ts`

Archive: `sources/packages/core/src/actions/output/mutations.ts` · bytes: 4523 · Git blob: `2d165747ebfc35f05a4c0244fd06134780482b88` · SHA256: `b9151642332518eec3151825cb55bd2b0f65ba275d77e1d107ac29feb3a323e0`.

Papel da fonte: Delete/keep nativos, target/version/ownership, GH keep indisponível.


Linhas **9–58**; SHA256 do intervalo `7e9d07d2bf887335d6c11e7d7281d8cdc0d9e6dadae65b7ceb8eacd295cf9ee2`:

~~~~typescript

const Input = Schema.Struct({ provider: Actions.ProviderKind })

export function make(input: { transport: ActionsContract.Transport; reader: (binding: Actions.Binding) => ActionsContract.ReadAdapter }) {
  return Effect.fn("ActionsArtifacts.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
    const services = { transport: input.transport, reader: input.reader(binding) }
    const id = yield* ActionsResourceNative.checked(binding, () => {
      const decoded = ActionsResourceNative.input(binding, Input, payload)
      if (decoded.provider !== binding.provider.kind || intent.target.resourceKind !== "artifacts" ||
        intent.binding.id !== binding.id || intent.binding.revision !== binding.revision || !intent.target.resourceID ||
        !["resource.delete", "artifact.keep"].includes(intent.kind) || intent.expected?.attempt !== undefined || intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined ||
        Object.keys(intent.target).some((key) => !["resourceKind", "resourceID", "scope", "runID"].includes(key)))
        throw ActionsResourceNative.error(binding, "invalid_input", "Artifact command does not match its native admission")
      return ActionsResourceNative.id(binding, intent.target.resourceID)
    })
    if (binding.provider.kind === "github" && intent.kind === "artifact.keep")
      return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub Actions has no native artifact keep operation")
    const authority = yield* ActionsResourceNative.authority(services, binding, intent.kind === "artifact.keep" ? 30 : 40)
    if (binding.provider.kind === "github") {
      const path = `${authority.root}/actions/artifacts/${id}`
      const response = yield* ActionsResourceNative.get(services, binding, path)
      yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
        const native = ActionsResourceNative.decode(binding, OutputNative.Artifact, response.data)
        OutputNative.artifactOwner(binding, native, id, intent.target.runID)
        if (intent.target.scope !== undefined && intent.target.scope !== String(native.workflow_run.id))
          throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native run")
        ActionsResourceNative.requireVersion(binding, intent, OutputVersion.github(native))
      }))
      yield* ActionsResourceNative.send(services, binding, { method: "DELETE", path }, [204])
      return { acknowledgement: { resourceID: id } }
    }
    const job = yield* ActionsResourceNative.get(services, binding, `${authority.root}/jobs/${id}`)
    const native = yield* ActionsResourceNative.before(binding, ActionsResourceNative.checked(binding, () => {
      const native = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, job.data)
      OutputNative.gitlabOwner(binding, native, id, intent.target.runID)
      if (intent.target.scope !== undefined && intent.target.scope !== String(native.pipeline.id))
        throw ActionsResourceNative.error(binding, "binding_stale", "Artifact scope differs from its admitted native pipeline")
      ActionsResourceNative.requireVersion(binding, intent, OutputVersion.gitlab(native))
      return native
    }))
    const response = yield* ActionsResourceNative.send(services, binding, { method: intent.kind === "artifact.keep" ? "POST" : "DELETE",
      path: `${authority.root}/jobs/${id}/artifacts${intent.kind === "artifact.keep" ? "/keep" : ""}` }, intent.kind === "artifact.keep" ? [200] : [204])
    if (intent.kind === "artifact.keep") yield* ActionsResourceNative.after(binding, ActionsResourceNative.checked(binding, () => {
      const kept = ActionsResourceNative.decode(binding, OutputNative.GitLabJob, response.data, true)
      OutputNative.gitlabOwner(binding, kept, id, String(native.pipeline.id))
      if (kept.artifacts_expire_at !== null) throw ActionsResourceNative.error(binding, "outcome_unknown", "Native artifact keep response did not prove removed expiry", "unknown")
    }))
    return { acknowledgement: { resourceID: id } }
  })
}
~~~~


### `packages/core/src/actions/output/version.ts`

Archive: `sources/packages/core/src/actions/output/version.ts` · bytes: 1050 · Git blob: `a42fd54db9202bf822a439bb47ce4f216101a8e1` · SHA256: `935301ed0b3e64a03122d40ef4fcf58ef119c5c8b04c04b1f113bcb29163c6b9`.

Papel da fonte: Fingerprint só de metadados selecionados; distinção expiry ausente/null.


Linhas **1–16**; SHA256 do intervalo `935301ed0b3e64a03122d40ef4fcf58ef119c5c8b04c04b1f113bcb29163c6b9`:

~~~~typescript
export * as OutputVersion from "./version"

import { ActionsResourceNative } from "../resources/native"
import { OutputNative } from "./native"

export function github(value: typeof OutputNative.Artifact.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.workflow_run.id), repositoryID: String(value.workflow_run.repository_id),
    size: value.size_in_bytes, expired: value.expired, digest: value.digest ?? null, createdAt: value.created_at ?? null,
    updatedAt: value.updated_at ?? null, expiryObserved: value.expires_at !== undefined, expiresAt: value.expires_at ?? null })
}

export function gitlab(value: typeof OutputNative.GitLabJob.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.pipeline.id), projectID: String(value.pipeline.project_id),
    archive: value.artifacts_file ?? null, artifacts: value.artifacts, erasedAt: value.erased_at ?? null,
    expiryObserved: value.artifacts_expire_at !== undefined, expiresAt: value.artifacts_expire_at ?? null })
}
~~~~


## B01 — Serviço Board e porta Maestro

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B01`.


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.

Papel da fonte: Transações immediate, atividade e publicação; ciclos host e falha de storage.


Linhas **73–95**; SHA256 do intervalo `81f0175e090e3fcd7472c16dd88a81d57875d0e536561ccaec262c5628b37508`:

~~~~typescript
// The board service enforces the contract's rules (docs/specs/projects-board/CONTRACT.md section 1). Every write runs
// in one immediate transaction that also appends its activity row, then publishes `board.changed` after commit.

export type Error = NotFoundError | RefusedError | BudgetPausedError

export interface Interface {
  /** Archived projects are left out unless `archived` is true. */
  readonly summaries: (options?: { readonly archived?: boolean }) => Effect.Effect<Board.Summary[]>
  readonly snapshot: (key: string) => Effect.Effect<Board.Snapshot, NotFoundError>
  readonly read: (input: Board.ReadInput) => Effect.Effect<Board.Read, NotFoundError>
  readonly issuePage: (key: string, number: number) => Effect.Effect<Board.IssuePage, NotFoundError>
  /** Spend per card, epic, seat and project from session cost and cached CI minutes; never fetches GitHub. */
  readonly spend: (key: string) => Effect.Effect<Board.SpendReport, NotFoundError>
  /** Every answered question, newest first. */
  readonly decisions: (key: string) => Effect.Effect<Board.Decision[], NotFoundError>
  /** What backs a card's status: PR, checks, attempts, guardrail result, crash reason and when it was verified. */
  readonly proof: (key: string, number: number) => Effect.Effect<Board.Proof, NotFoundError>
  readonly activity: (key: string, since?: string) => Effect.Effect<Board.Activity[], NotFoundError>
  readonly project: (input: Board.ProjectInput) => Effect.Effect<Board.WriteResult, Error>
  readonly epic: (input: Board.EpicInput) => Effect.Effect<Board.WriteResult, Error>
  readonly issue: (input: Board.IssueInput) => Effect.Effect<Board.WriteResult, Error>
  readonly move: (input: Board.MoveInput) => Effect.Effect<Board.WriteResult, Error>
  readonly steps: (input: Board.StepsInput) => Effect.Effect<Board.WriteResult, Error>
~~~~


Linhas **181–198**; SHA256 do intervalo `4df68de5a7ea6554c09b3fa4c31f3f0ffc25d7c868552c177c97aa668f3ddec3`:

~~~~typescript
      const quiet = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work, { behavior: "immediate" }).pipe(dieOnStorage)

      // Every committed board write is one forecast evaluation of its project; GitHub mirror writes are not.
      const write = <A extends { readonly changed: Changed }, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        quiet((tx) => work(tx).pipe(Effect.tap((result) => BoardMoney.evaluate(tx, result.changed.project)))).pipe(
          Effect.tap((result) => events.publish(Board.Event.Changed, result.changed)),
        )

      const reading = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work).pipe(dieOnStorage)

      const issueRecords = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: IssueRow[]) {
        if (rows.length === 0) return []
        const ids = rows.map((row) => row.id)
        const known = yield* numbers(tx, project)
        const steps = yield* tx
          .select()
~~~~


Linhas **566–642**; SHA256 do intervalo `14e3f9c7ced2c6fcd330df96ddcead5ec558a71e164415ec888af355d62eeba6`:

~~~~typescript
      const github = BoardGithub.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        publish: (changed) => events.publish(Board.Event.Changed, changed),
        log,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
      })
      const ci = BoardCi.make({
        ...options,
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
      })
      const snapshots = BoardSnapshot.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        scanner: options.scanner
          ? Effect.succeed(options.scanner)
          : BackendToolkit.ensure("gitleaks").pipe(
              Effect.map((ready) => [ready.executable]),
              Effect.orElseSucceed(() => undefined),
              Effect.provideService(AppProcess.Service, proc),
            ),
        remote: (directory, project) => ci.contract(directory, project).pipe(Effect.map((contract) => contract.snapshots.remote)),
        env: options.env,
      })

      const conflicts = BoardConflicts.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        git: gitRunner(proc, options.env),
        base: (directory, project) => ci.contract(directory, project).pipe(Effect.map((contract) => contract.base)),
        publish: (changed) => events.publish(Board.Event.Changed, changed),
      })

      const queue = BoardQueue.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        proc,
        env: options.env,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
        contract: ci.contract,
        publish: (changed) => events.publish(Board.Event.Changed, changed),
        record: options.record,
        affected: options.affected,
      })

      if (options.poll)
        yield* conflicts.sweep().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("60 seconds")), Effect.forkScoped)

      if (options.poll) yield* queue.tick().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("60 seconds")), Effect.forkScoped)

      if (options.poll)
        yield* snapshots.sweep().pipe(Effect.ignore, Effect.repeat(Schedule.spaced("10 minutes")), Effect.forkScoped)

      if (options.poll)
        yield* reading((tx) =>
          tx
            .select({ key: BoardProjectTable.key, id: BoardProjectTable.id, github: BoardProjectTable.github_repo })
            .from(BoardProjectTable)
            .where(ne(BoardProjectTable.status, "archived"))
            .all(),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                if (row.github) {
                  yield* github.sync(row.key)
                  yield* github.ci(row.key)
                }
                // CI minutes are spend too: a fetch can be what pushes the forecast past 90%.
                const raised = yield* quiet((tx) => BoardMoney.evaluate(tx, row.id))
                if (raised) yield* events.publish(Board.Event.Changed, { project: row.id, activity: raised })
              }),
            ),
          ),
          Effect.ignore,
          Effect.repeat(Schedule.spaced("60 seconds")),
          Effect.forkScoped,
        )
~~~~


Linhas **1675–1692**; SHA256 do intervalo `c8261c503599a38b87613b43b6ce35b6713e6afb32b7eab10cd434bcbac54f8d`:

~~~~typescript
export const layer = layerWith({ poll: true, record: recordPort })

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
})

// Storage failures are defects: the board has no recovery for a broken database.
function dieOnStorage<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, SqlError | EffectDrizzleQueryError> =>
        error instanceof SqlError || error instanceof EffectDrizzleQueryError,
      Effect.die,
    ),
  )
}
~~~~


### `packages/core/src/board/tools.ts`

Archive: `sources/packages/core/src/board/tools.ts` · bytes: 8288 · Git blob: `d1ba07e4231da173fb5aa5478375cba7f99c00b4` · SHA256: `87638e1e13b803490987df2a5d33fd39e9c899ad7208a7b9d54d6f0635463eb5`.

Papel da fonte: Tools do Board guardadas para o agente default Maestro.


Linhas **24–42**; SHA256 do intervalo `a78ecf94894c3ba1ba5432b343aa092eacd3c68ea7454fa1ea1db39133646db1`:

~~~~typescript
} from "@orchestra/schema/board"
import { AgentV2 } from "../agent"
import { makeGlobalNode } from "../effect/app-node"
import { ApplicationTools } from "../tool/application-tools"
import { Tool } from "../tool/tool"
import { Board } from "./board"

// The board tools are Maestro's only way to read and plan the board (contract section 4). Seats other than Maestro get a
// failure even when a profile would let them call the tool.

export const node = makeGlobalNode({
  name: "board/tools",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tools = yield* ApplicationTools.Service
      const board = yield* Board.Service
      yield* tools
        .register({
          board_read: Tool.make({
~~~~


Linhas **145–161**; SHA256 do intervalo `9ac6c7a450d2abcd294d0c34b86870c934c43c9654a762fb4800d088cc7dd9d6`:

~~~~typescript
              "Decide a held bundle, by its number (KEY-B<n>). merge ships a flaky bundle as tested: its failing tests passed three scoped reruns. retry closes a flaky bundle, or releases a paused one, so the queue cuts its cards into a new bundle. release, with card, lets one held card of a dissolved bundle ride a bundle alone. Give the reason.",
            input: BundleInput,
            output: BundleResult,
            execute: (input, context) => guard(context, board.bundle(input)),
          }),
        })
        .pipe(Effect.orDie)
    }),
  ),
  deps: [ApplicationTools.node, Board.node],
})

function guard<A>(context: Tool.Context, effect: Effect.Effect<A, Board.Error>) {
  if (context.agent !== AgentV2.defaultID)
    return Effect.fail(new Tool.Failure({ message: "The board tools belong to Maestro; ask Maestro to change the board." }))
  return effect.pipe(Effect.mapError((error) => new Tool.Failure({ message: error.message })))
}
~~~~


### `packages/core/src/board/rows.ts`

Archive: `sources/packages/core/src/board/rows.ts` · bytes: 3810 · Git blob: `10ebc542ef2fedcb6498be9379b77bd0e314471c` · SHA256: `3814113d4826f52c72bdede0c437837caca0a2f7de53af0ca0b960b156d4efcb`.

Papel da fonte: Projeção de rows; decision outcome por default e anexos sem path/credentialID.


Linhas **12–113**; SHA256 do intervalo `b809e83c9f9cb8fa8b71d2332b8b9bd0baa6495b68347d1236010ef51328e3d0`:

~~~~typescript
export function touched(row: ActivityRow) {
  return [...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})].filter((key) => key !== "id")
}

export function toProject(row: ProjectRow): Board.Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    goal: row.goal,
    targetDate: row.target_date,
    budgetUsd: row.budget_usd,
    repoProjectID: row.repo_project_id,
    githubRepo: row.github_repo,
    status: row.status,
    pausedReason: row.paused_reason,
    autoAcceptIntake: row.auto_accept_intake,
    githubState: row.github_state,
    githubError: row.github_error,
    githubSyncedAt: row.github_synced_at,
  }
}

export function toEpic(key: string, row: typeof BoardEpicTable.$inferSelect): Board.Epic {
  return {
    id: row.id,
    number: row.number,
    ref: `${key}-E${row.number}`,
    title: row.title,
    goal: row.goal,
    position: row.position,
    status: row.status,
    githubMilestone: row.github_milestone,
  }
}

export function toQuestion(
  row: QuestionRow,
  known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> },
): Board.Question {
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    text: row.text,
    options: row.options,
    recommended: row.recommended,
    costOfWaiting: row.cost_of_waiting,
    blocking: row.blocking,
    status: row.status,
    answerOption: row.answer_option,
    answerText: row.answer_text,
    answeredAt: row.answered_at,
    timeCreated: row.time_created,
  }
}

export function toDecision(row: DecisionRow, known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> }): Board.Decision {
  const chosen = row.options.find((option) => option.id === row.chosen)
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    date: row.answered_at,
    question: row.question,
    options: row.options,
    recommended: row.recommended,
    chosen: row.chosen,
    chosenLabel: chosen?.label ?? row.chosen,
    text: row.chosen_text,
    answeredBy: row.answered_by,
    outcome: row.outcome ?? "applied, no result yet",
    outcomeAt: row.outcome_at,
    supersedes: row.supersedes_id,
    overturnedBy: row.overturned_by_id,
  }
}

export function toNote(row: typeof BoardNoteTable.$inferSelect, issue: number): Board.Note {
  return { id: row.id, issue, author: row.author, kind: row.kind, body: row.body, timeCreated: row.time_created }
}

// Never the stored path or credential id.
export function toAttachment(row: typeof BoardAttachmentTable.$inferSelect, issue: number): Board.Attachment {
  return { id: row.id, issue, kind: row.kind, name: row.name, mime: row.mime, size: row.size, timeCreated: row.time_created }
}

export function toActivity(row: ActivityRow, issues: Map<string, number>): Board.Activity {
  return {
    id: row.id,
    issue: row.issue_id ? (issues.get(row.issue_id) ?? null) : null,
    actor: row.actor,
    action: row.action,
    reason: row.reason,
    before: row.before,
    after: row.after,
    undoes: row.undoes,
    undoneBy: row.undone_by,
    timeCreated: row.time_created,
  }
}

~~~~


### `packages/core/src/board/shared.ts`

Archive: `sources/packages/core/src/board/shared.ts` · bytes: 9436 · Git blob: `6ef7b42006697e252dcf6b4542e8a36354591ce4` · SHA256: `7372c16b39f3077dddddfdfec7555bd5008cd489c90ce3546126fc38289ae2de`.

Papel da fonte: Runner Git limitado, atividade e waits/forecast por dependências e perguntas.


Linhas **48–70**; SHA256 do intervalo `a1fd1133d86aed5de129c7ff0a80dd330985b2ac9196e5bb3080141158cc81d5`:

~~~~typescript
export function gitRunner(proc: AppProcess.Interface, base?: NodeJS.ProcessEnv) {
  return (cwd: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
    proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
          cwd,
          env: { ...base, ...env },
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
      )
      .pipe(
        Effect.map((result) => ({ code: result.exitCode, out: result.stdout.toString("utf8").trim(), err: result.stderr.toString("utf8").trim() })),
        Effect.catch((error) => Effect.succeed({ code: 1, out: "", err: error.message })),
      )
}


/** The position after the last card in `stage`. */
export const endOf = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID, stage: Board.Stage) {
  const row = yield* tx
    .select({ position: sql<number | null>`max(${BoardIssueTable.position})` })
~~~~


Linhas **121–150**; SHA256 do intervalo `4de016f03c1527b6174d669c9b87c27cc705636ea53a77f499a27167c56c3a87`:

~~~~typescript
export const log = Effect.fnUntraced(function* (
  tx: Tx,
  input: {
    readonly project: Board.ProjectID
    readonly issue?: Board.IssueID | null
    readonly actor: Board.Actor
    readonly action: Board.Action
    readonly reason?: string | null
    readonly before?: Fields | null
    readonly after?: Fields | null
    readonly undoes?: Board.ActivityID
  },
) {
  const id = Board.ActivityID.create()
  yield* tx
    .insert(BoardActivityTable)
    .values({
      id,
      project_id: input.project,
      issue_id: input.issue ?? null,
      actor: input.actor,
      action: input.action,
      reason: input.reason ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      undoes: input.undoes ?? null,
    })
    .run()
  return id
})
~~~~


Linhas **179–239**; SHA256 do intervalo `60720337b1b4a15c4503252b5f294386dc70025671c9f38975948fd3da4947ef`:

~~~~typescript
export const forecastOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  const issues = yield* tx
    .select({
      id: BoardIssueTable.id,
      number: BoardIssueTable.number,
      epic: BoardIssueTable.epic_id,
      stage: BoardIssueTable.stage,
      enteredAt: BoardIssueTable.stage_entered_at,
      paused: BoardIssueTable.paused,
    })
    .from(BoardIssueTable)
    .where(eq(BoardIssueTable.project_id, project.id))
    .all()
  const epics = yield* tx
    .select()
    .from(BoardEpicTable)
    .where(and(eq(BoardEpicTable.project_id, project.id), ne(BoardEpicTable.status, "cut")))
    .orderBy(asc(BoardEpicTable.position), asc(BoardEpicTable.number))
    .all()
  const known = yield* numbers(tx, project)
  const blocked = yield* tx
    .select({ issue: BoardQuestionTable.issue_id })
    .from(BoardQuestionTable)
    .where(
      and(
        eq(BoardQuestionTable.project_id, project.id),
        eq(BoardQuestionTable.status, "open"),
        eq(BoardQuestionTable.blocking, true),
      ),
    )
    .all()
  const upstream =
    issues.length === 0
      ? []
      : yield* tx
          .select({ issue: BoardDependencyTable.issue_id, key: BoardProjectTable.key, number: BoardIssueTable.number, stage: BoardIssueTable.stage })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
          .where(inArray(BoardDependencyTable.issue_id, issues.map((row) => row.id)))
          .orderBy(asc(BoardProjectTable.key), asc(BoardIssueTable.number))
          .all()
  return BoardForecast.plan({
    items: issues.map((row) => {
      const dependency = upstream.find((item) => item.issue === row.id && item.stage !== "shipped" && item.stage !== "cut")
      return {
        epic: row.epic ? (known.epics.get(row.epic) ?? null) : null,
        stage: row.stage,
        enteredAt: row.enteredAt,
        waitsOn: dependency
          ? `${dependency.key}-${dependency.number}`
          : row.paused || blocked.some((item) => item.issue === row.id)
            ? `${project.key}-${row.number}`
            : null,
      }
    }),
    epics: epics.map((row) => ({ number: row.number, ref: `${project.key}-E${row.number}` })),
    targetDate: project.target_date,
    now: yield* Clock.currentTimeMillis,
  })
})
~~~~


### `packages/core/src/board/sql.ts`

Archive: `sources/packages/core/src/board/sql.ts` · bytes: 16144 · Git blob: `2784e4042e5d383f2f19250ed9efc3c388623cde` · SHA256: `752ca66b251fbe7691755f5bace14b5848112bb8da759570f7276637265464e4`.

Papel da fonte: Persistência de plano, checks, attempts, queue/bundles e histórico distinto.


Linhas **169–280**; SHA256 do intervalo `248d1cb6ca14ba7c61896c09b09851309af9b4a40d61679e43318f8bb9d00dd9`:

~~~~typescript
// One row per answered question; overturning an answer adds a row that supersedes the old one, which stays.
export const BoardDecisionTable = sqliteTable(
  "board_decision",
  {
    id: text().$type<Board.DecisionID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .references(() => BoardIssueTable.id, { onDelete: "set null" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "set null" }),
    question_id: text().$type<Board.QuestionID>().notNull(),
    question: text().notNull(),
    options: text({ mode: "json" }).$type<ReadonlyArray<Board.Option>>().notNull(),
    recommended: text().notNull(),
    chosen: text().notNull(),
    chosen_text: text(),
    answered_by: text().$type<Board.Actor>().notNull(),
    answered_at: integer().notNull(),
    outcome: text(),
    outcome_at: integer(),
    supersedes_id: text().$type<Board.DecisionID>(),
    overturned_by_id: text().$type<Board.DecisionID>(),
    ...Timestamps,
  },
  (table) => [index("board_decision_project_idx").on(table.project_id, table.answered_at)],
)

// GitHub Actions runs of a card's PR with the billable time, fetched on the poll and never per render.
export const BoardCiRunTable = sqliteTable(
  "board_ci_run",
  {
    run_id: integer().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    attempt: integer().notNull(),
    // Billable milliseconds across runner kinds, and what they cost at GitHub's per-minute rates.
    billable_ms: integer().notNull(),
    cost_usd: real().notNull(),
    ...Timestamps,
  },
  (table) => [index("board_ci_run_issue_idx").on(table.issue_id)],
)

// The pass or fail ledger (merge-queue spec section 5.2): one row per check, keyed by the tree it ran on, so a result
// stays valid on any commit with the same tree and drops after an edit.
export const BoardCheckTable = sqliteTable(
  "board_check",
  {
    id: text().$type<Board.CheckID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    attempt: integer().notNull(),
    kind: text().$type<Board.CheckKind>().notNull(),
    // The scoped command after substitution, or the workflow file: same tree and same command is the same check.
    command: text().notNull(),
    tree_sha: text().notNull(),
    commit_sha: text(),
    outcome: text().$type<Board.CheckOutcome>().notNull(),
    url: text(),
    failing: text({ mode: "json" }).$type<string[]>().notNull(),
    started_at: integer().notNull(),
    ended_at: integer(),
    ...Timestamps,
  },
  (table) => [index("board_check_issue_tree_idx").on(table.issue_id, table.tree_sha)],
)

// One row per dispatch of a card (merge-queue spec section 4.2). The host writes it; `board_issue.attempts` is max(n).
export const BoardAttemptTable = sqliteTable(
  "board_attempt",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    seat: text(),
    session_id: text(),
    worktree: text(),
    branch: text(),
    pr_number: integer(),
    // The Task's declared write set, matched against base advances (section 8.4).
    write_paths: text({ mode: "json" }).$type<string[]>().notNull(),
    // The last snapshot commit pushed to refs/orchestra/wip/<KEY>/a<n>, and its tree.
    snapshot_sha: text(),
    snapshot_tree: text(),
    snapshot_at: integer(),
    // Why the last snapshot was not pushed (a scanner hit, no scanner, a refused push); cleared by the next push.
    snapshot_blocked: text(),
    // The base commit the card last failed to merge with, and the conflicting files; cleared when it merges clean.
    conflict_base: text(),
    conflict_files: text({ mode: "json" }).$type<string[]>(),
    cause: text(),
    outcome: text().$type<Board.AttemptOutcome>(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.issue_id, table.n] })],
)
~~~~


Linhas **342–430**; SHA256 do intervalo `521e17f1030f8a11102e63e6558d683cf869425d27df510e1f0612339a3e1078`:

~~~~typescript
// One row per card in the queue stage (merge-queue spec section 6). `head_sha` is the PR head the scoped checks passed on.
export const BoardQueueTable = sqliteTable(
  "board_queue",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .primaryKey()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    head_sha: text().notNull(),
    urgent: integer({ mode: "boolean" }).notNull().default(false),
    flush: integer({ mode: "boolean" }).notNull().default(false),
    hold: text().$type<"held" | "alone">(),
    queued_at: integer().notNull(),
    ...Timestamps,
  },
  (table) => [index("board_queue_project_idx").on(table.project_id, table.queued_at)],
)

// A bundle PR: queued cards merged onto one base tip and tested together (section 6.2). `merged_on` is the base tip it
// merged onto when that differs from `base_sha` (merge-if-disjoint).
export const BoardBundleTable = sqliteTable(
  "board_bundle",
  {
    id: text().$type<Board.BundleID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    branch: text().notNull(),
    pr_number: integer(),
    base_sha: text().notNull(),
    head_sha: text().notNull(),
    tree_sha: text().notNull(),
    rebuilds: integer().notNull().default(0),
    status: text().$type<"open" | "merged" | "dissolved" | "red" | "base-red" | "probing" | "probe-green" | "infra" | "paused" | "flaky" | "accepted" | "isolated">().notNull(),
    merged_on: text(),
    culprit: text(),
    failing: text({ mode: "json" }).$type<ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>>(),
    fix_issue_id: text().$type<Board.IssueID>(),
    // The lane's affected packages (section 7); null runs the whole suite.
    packages: text({ mode: "json" }).$type<ReadonlyArray<string>>(),
    ...Timestamps,
  },
  (table) => [uniqueIndex("board_bundle_number_idx").on(table.project_id, table.n)],
)

export const BoardBundleMemberTable = sqliteTable(
  "board_bundle_member",
  {
    bundle_id: text()
      .$type<Board.BundleID>()
      .notNull()
      .references(() => BoardBundleTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    head_sha: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.bundle_id, table.issue_id] })],
)

// Section 6.4: a test that failed in a bundle and then passed three scoped reruns of its head. `count` grows each time
// another bundle sees the same test go flaky; `bundle_id` is the latest one.
export const BoardFlakeTable = sqliteTable(
  "board_flake",
  {
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    test: text().notNull(),
    bundle_id: text()
      .$type<Board.BundleID>()
      .notNull()
      .references(() => BoardBundleTable.id, { onDelete: "cascade" }),
    first_seen: integer().notNull(),
    count: integer().notNull(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.project_id, table.test] })],
)
~~~~


## B02 — Transições e autoridade do card

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B02`.


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.

Papel da fonte: requireActive, dependencies/steps, move/hold/budget/intake com pré-condições particulares.


Linhas **279–307**; SHA256 do intervalo `326b625d37ce4e87a4a5f4ff67b4b3efcec12508e69fbb97c45f02507153a5b5`:

~~~~typescript
      const trail = Effect.fnUntraced(function* (issue: IssueRow, directory: string | null, fresh: boolean) {
        if (!issue.pr_number || !directory) return { state: "none", branch: issue.branch } satisfies Board.Trail
        const key = `${directory}#${issue.pr_number}`
        const now = yield* Clock.currentTimeMillis
        const hit = cache.get(key)
        if (!fresh && hit && now - hit.at < TRAIL_MS) return hit.trail
        cache.delete(key)
        const pulls = yield* PullRequest.make({ directory, env: options.env }).pipe(
          Effect.provideService(AppProcess.Service, proc),
        )
        return yield* pulls.read(issue.pr_number).pipe(
          Effect.map(
            (pr): Board.Trail => ({
              state: "ok",
              branch: pr.branch,
              pr,
              verifiedAt: now,
              commits: pr.commits.map((commit) => ({ hash: commit.hash, message: commit.message, seat: issue.seat })),
            }),
          ),
          Effect.tap((value) => Effect.sync(() => cache.set(key, { at: now, trail: value }))),
          Effect.catchTag("PullRequest.HostError", (error) =>
            Effect.succeed<Board.Trail>(
              error.kind === "not_authenticated"
                ? { state: "signed_out", message: "GitHub is signed out; sign in with gh to see the git trail." }
                : { state: "error", message: error.message },
            ),
          ),
        )
~~~~


Linhas **427–486**; SHA256 do intervalo `2d1cdabbbbe136f5a27cdbda009e2dd8397ed9f7717f792e4c0ea43460d1eb0e`:

~~~~typescript
      const requireActive = (project: ProjectRow, issue?: IssueRow): Effect.Effect<void, RefusedError> => {
        if (project.status === "archived") return Effect.fail(archived(project))
        if (project.status === "paused")
          return Effect.fail(
            new RefusedError({
              message: `${project.key} is paused by the owner${project.paused_reason ? ` (${project.paused_reason})` : ""}; only board_question works until they resume it.`,
            }),
          )
        if (issue?.paused)
          return Effect.fail(
            new RefusedError({
              message: `${project.key}-${issue.number} is paused by the owner; only board_question works until they resume it.`,
            }),
          )
        return Effect.void
      }

      const resolveRepo = Effect.fnUntraced(function* (tx: Tx, repo: string) {
        const row = yield* tx
          .select({ id: ProjectTable.id })
          .from(ProjectTable)
          .where(
            path.isAbsolute(repo)
              ? eq(ProjectTable.worktree, AbsolutePath.make(path.resolve(repo)))
              : eq(ProjectTable.id, ProjectSchema.ID.make(repo)),
          )
          .get()
        if (!row) return yield* new NotFoundError({ message: `No Orchestra project matches the repo ${repo}; open it in Orchestra first.` })
        return row.id
      })

      const resolveDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, list: readonly string[]) {
        return yield* Effect.forEach(list, (ref) =>
          Effect.gen(function* () {
            const match = /^(?:([A-Z]{2,6})-)?(\d+)$/.exec(ref.trim())
            if (!match) return yield* new RefusedError({ message: `"${ref}" is not an issue ref; use ${project.key}-12 or 12.` })
            const owner = match[1] && match[1] !== project.key ? yield* loadProject(tx, match[1]) : project
            return (yield* loadIssue(tx, owner, Number(match[2]))).id
          }),
        )
      })

      const setDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, list: readonly string[]) {
        const ids = Array.from(new Set(yield* resolveDependencies(tx, project, list)))
        const edges = (yield* tx.select().from(BoardDependencyTable).all()).filter((edge) => edge.issue_id !== issue.id)
        const cycle = ids.find((id) => reaches(edges, id, issue.id, new Set()))
        if (cycle)
          return yield* new RefusedError({
            message:
              cycle === issue.id
                ? `${project.key}-${issue.number} cannot depend on itself.`
                : `That dependency would make a cycle: ${list.join(", ")} already waits on ${project.key}-${issue.number}.`,
          })
        yield* tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue.id)).run()
        if (ids.length > 0)
          yield* tx
            .insert(BoardDependencyTable)
            .values(ids.map((id) => ({ issue_id: issue.id, depends_on_id: id })))
            .run()
      })
~~~~


Linhas **894–912**; SHA256 do intervalo `958c71a5638f0280b7bbf271fab8e06494ed505a35228afd5ec8e60178d75232`:

~~~~typescript
        issue: Effect.fn("Board.issue")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              yield* requireActive(project)
              const epic =
                input.epic === undefined ? undefined : input.epic === null ? null : (yield* loadEpic(tx, project, input.epic)).id
              const now = yield* Clock.currentTimeMillis
              const fields = {
                title: input.title,
                body: input.body,
                type: input.type,
                epic_id: epic,
                estimate: input.estimate,
                seat: input.seat,
                session_id: input.session,
                branch: input.branch,
                pr_number: input.pr,
                attempts: input.attempts,
~~~~


Linhas **965–1037**; SHA256 do intervalo `2439a783b23373c28766872ba166cc46c43ce7b964035e01d47fe26d75b75c87`:

~~~~typescript
                      "type",
                      "epic_id",
                      "stage",
                      "position",
                      "estimate",
                      "seat",
                      "session_id",
                      "branch",
                      "pr_number",
                      "stage_entered_at",
                      "crash_reason",
                      "guardrail_rule",
                      "area",
                      "order",
                      "record",
                    ]),
                    ...(input.depends_on ? { depends_on: input.depends_on } : {}),
                  },
                })
                return yield* issueResult(tx, project, id, activity)
              }
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              if (issue.stage === "review" && input.pr === null)
                return yield* new RefusedError({
                  message: `${project.key}-${issue.number} is in Review, which needs its PR; move it out of Review before unlinking the PR.`,
                })
              if (issue.stage === "queue" && ((input.pr !== undefined && input.pr !== issue.pr_number) || input.branch !== undefined))
                return yield* new RefusedError({
                  message: `${project.key}-${issue.number} is queued at its PR head; take it out with board_dequeue before changing its PR or branch.`,
                })
              // The record merges field by field so Maestro can fill it in over several calls; risk merges one level down.
              const record = input.record
                ? {
                    ...issue.record,
                    ...input.record,
                    ...(input.record.risk ? { risk: { ...issue.record?.risk, ...input.record.risk } } : {}),
                  }
                : undefined
              const change = diff(issue, { ...fields, record })
              const before = input.depends_on ? (yield* refs(tx, "depends", [issue.id])).map((item) => item.ref) : undefined
              // Compare as full refs so "12" and "LCH-12" are the same dependency.
              const wanted = input.depends_on
                ?.map((ref) => (/^\d+$/.test(ref.trim()) ? `${project.key}-${ref.trim()}` : ref.trim()))
                .toSorted()
              const dependencies =
                wanted && before && JSON.stringify(before.toSorted()) !== JSON.stringify(wanted)
                  ? { before: { depends_on: before }, after: { depends_on: wanted } }
                  : undefined
              if (!change && !dependencies)
                return yield* new RefusedError({ message: `Nothing to change on ${project.key}-${issue.number}.` })
              if (dependencies) yield* setDependencies(tx, project, issue, dependencies.after.depends_on)
              const dirty = Object.keys(change?.after ?? {}).some((key) => MIRRORED.includes(key)) && project.github_repo !== null
              if (change || dirty)
                yield* tx
                  .update(BoardIssueTable)
                  .set({ ...change?.after, ...(dirty ? { github_dirty: true } : {}) })
                  .where(eq(BoardIssueTable.id, issue.id))
                  .run()
              yield* BoardSnapshot.follow(tx, issue, change?.after ?? {})
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.update",
                reason: input.reason,
                before: { ...change?.before, ...dependencies?.before },
                after: { ...change?.after, ...dependencies?.after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
~~~~


Linhas **1040–1147**; SHA256 do intervalo `c2361c17220f0e9c21f38e39d280ed263b2a33f4020bbd4a91f61f5b9638357b`:

~~~~typescript
        move: Effect.fn("Board.move")(function* (input) {
          if (input.stage === "intake")
            return yield* new RefusedError({ message: "Intake holds only GitHub-born issues; Maestro cannot move an issue into it." })
          if (input.stage === "queue")
            return yield* new RefusedError({ message: "Only the host moves a card into Queue; verify it and call board_queue." })
          const ref = `${input.project}-${input.number}`
          // A Shipped move with a PR needs a live, uncached proof that the PR is merged, read before the write lock.
          const checked = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              return { issue, directory: yield* worktree(tx, project) }
            }),
          )
          const proof =
            input.stage === "shipped" && checked.issue.pr_number && !checked.issue.hold_before_merge
              ? yield* trail(checked.issue, checked.directory, true)
              : undefined
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              if (issue.stage === "intake")
                return yield* new RefusedError({ message: `${ref} is in Intake; the owner accepts or declines it first.` })
              if (issue.stage === "queue")
                return yield* new RefusedError({ message: `${ref} is queued; take it out with board_dequeue first.` })
              if (input.stage === "review" && !issue.pr_number)
                return yield* new RefusedError({ message: `${ref} has no PR; link one with board_issue before Review.` })
              if (input.stage === "shipped" && issue.hold_before_merge)
                return yield* new RefusedError({
                  message: `${ref} is on hold before merge; only the owner can release it. Do not merge its PR.`,
                })
              if (input.stage === "shipped" && issue.pr_number) {
                if (issue.pr_number !== checked.issue.pr_number || !proof)
                  return yield* new RefusedError({ message: `${ref}'s PR changed while it was being checked; try again.` })
                if (proof.state === "none")
                  return yield* new RefusedError({
                    message: `${input.project} has no repo linked, so PR #${issue.pr_number} cannot be checked as merged.`,
                  })
                if (proof.state === "signed_out")
                  return yield* new RefusedError({
                    message: `GitHub is signed out, so PR #${issue.pr_number} cannot be checked as merged; ${ref} stays where it is.`,
                  })
                if (proof.state === "error")
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} could not be read: ${proof.message}` })
                if (!proof.pr.merged)
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} for ${ref} is not merged yet.` })
              }
              yield* BoardMoney.requireRoom(tx, project, issue, input.stage, ref)
              const now = yield* Clock.currentTimeMillis
              const moved = issue.stage !== input.stage
              const next = {
                stage: input.stage,
                position:
                  input.position ?? (moved ? yield* endOf(tx, project.id, input.stage) : issue.position),
                stage_entered_at: moved ? now : issue.stage_entered_at,
              }
              const change = diff(issue, next)
              if (!change) return yield* new RefusedError({ message: `${ref} is already there.` })
              yield* tx
                .update(BoardIssueTable)
                .set({ ...change.after, ...(moved && project.github_repo !== null ? { github_dirty: true } : {}) })
                .where(eq(BoardIssueTable.id, issue.id))
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.move",
                reason: input.reason,
                ...change,
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        steps: Effect.fn("Board.steps")(function* (input) {
          if (input.steps.filter((step) => step.status === "active").length > 1)
            return yield* new RefusedError({ message: "Only one step can be active at a time." })
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              const before = yield* stepsOf(tx, issue.id)
              const after = input.steps.map((step): Board.Step => ({ title: step.title, status: step.status, now: step.now ?? null }))
              if (JSON.stringify(before) === JSON.stringify(after))
                return yield* new RefusedError({ message: `${project.key}-${issue.number} already has these steps.` })
              yield* replaceSteps(tx, issue.id, after)
              if (project.github_repo !== null)
                yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "steps.set",
                reason: input.reason,
                before: { steps: before },
                after: { steps: after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),
~~~~


Linhas **1555–1602**; SHA256 do intervalo `8ccedb6286503b6f1b3be6a51994f8d51abd541093f50c1a2f08355af4034683`:

~~~~typescript
      function setProjectPause(key: string, paused: boolean, reason?: string) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (project.status === "archived") return yield* archived(project)
            if ((project.status === "paused") === paused)
              return yield* new RefusedError({ message: `${key} is ${paused ? "already paused" : "not paused"}.` })
            const next = paused
              ? { status: "paused" as const, paused_reason: reason ?? null }
              : { status: "active" as const, paused_reason: null }
            yield* tx.update(BoardProjectTable).set(next).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "pause.set",
              reason: reason ?? null,
              before: { status: project.status, paused_reason: project.paused_reason },
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function setArchived(key: string, archive: boolean) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (archive && project.status !== "shipped" && project.status !== "paused")
              return yield* new RefusedError({
                message:
                  project.status === "archived"
                    ? `${key} is already archived.`
                    : `${key} is ${project.status}; only a shipped or paused project can be archived.`,
              })
            if (!archive && project.status !== "archived") return yield* new RefusedError({ message: `${key} is not archived.` })
            const next = archive ? ("archived" as const) : ("paused" as const)
            yield* tx.update(BoardProjectTable).set({ status: next }).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "archive.set",
              before: { status: project.status },
              after: { status: next },
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
~~~~


Linhas **1621–1671**; SHA256 do intervalo `d75866811e8432d4f5355fda7abc4601fdf106c1ad206496e347a434a382ede2`:

~~~~typescript
      function ownerIssue(
        key: string,
        number: number,
        action: Board.Action,
        next: (issue: IssueRow) => string | Partial<Pick<IssueRow, "paused" | "hold_before_merge">>,
      ) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            const fields = next(issue)
            if (typeof fields === "string") return yield* new RefusedError({ message: fields })
            yield* tx.update(BoardIssueTable).set(fields).where(eq(BoardIssueTable.id, issue.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, Object.keys(fields)),
              after: fields,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function intake(key: string, number: number, action: "intake.accept" | "intake.decline", stage: "backlog" | "cut") {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            if (issue.stage !== "intake") return yield* new RefusedError({ message: `${key}-${number} is not in Intake.` })
            const now = yield* Clock.currentTimeMillis
            const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: now }
            yield* tx
              .update(BoardIssueTable)
              .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
              .where(eq(BoardIssueTable.id, issue.id))
              .run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, ["stage", "position", "stage_entered_at"]),
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }
~~~~


## B03 — Decisão durável, undo, nota e anexo

Vínculo: `body.md` §6; archive de evidência: `evidence.md`, seção `B03`.


### `packages/core/src/board/decision.ts`

Archive: `sources/packages/core/src/board/decision.ts` · bytes: 5365 · Git blob: `4b219f5b62517b2c4f9749a1a99e6257cfeff167` · SHA256: `7fdd5f2d2d0dfa0414b70b870e4ff75ca62fe7af36c62c90e583663af8833b43`.

Papel da fonte: Escolha, supersession e resultado narrado sem prova externa.


Linhas **8–129**; SHA256 do intervalo `ed98b5f4370f01bae4e6d4ee20ed198ee884c31752ec5c2a2f5d92e7764966fa`:

~~~~typescript
import { NotFoundError, RefusedError, changed, loadProject, log, numbers } from "./shared"
import type { ProjectRow, QuestionRow, Tx } from "./shared"

// Every answered question is kept as a decision; overturning one links the old to the new instead of editing it.

export const list = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const known = yield* numbers(tx, project)
  const rows = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(eq(BoardDecisionTable.project_id, project.id))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .all()
  return rows.map((row) => toDecision(row, known))
})

/** The decision row an answer leaves behind. */
export const record = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, question: QuestionRow, input: Board.AnswerInput, now: number) {
  const id = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id,
      project_id: project.id,
      issue_id: question.issue_id,
      epic_id: question.epic_id,
      question_id: question.id,
      question: question.text,
      options: question.options,
      recommended: question.recommended,
      chosen: input.option,
      chosen_text: input.text ?? null,
      answered_by: "owner",
      answered_at: now,
    })
    .run()
  return id
})

export const change = Effect.fnUntraced(function* (tx: Tx, key: string, id: string, input: Board.DecisionChangeInput) {
  const project = yield* loadProject(tx, key)
  const old = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(and(eq(BoardDecisionTable.id, id as Board.DecisionID), eq(BoardDecisionTable.project_id, project.id)))
    .get()
  if (!old) return yield* new NotFoundError({ message: `Decision ${id} is not on ${key}.` })
  if (old.overturned_by_id)
    return yield* new RefusedError({ message: "That decision was already overturned; change the newer one instead." })
  if (!old.options.some((option) => option.id === input.option))
    return yield* new RefusedError({ message: `Pick one of: ${old.options.map((option) => option.id).join(", ")}.` })
  const text = input.text ?? null
  if (old.chosen === input.option && old.chosen_text === text)
    return yield* new RefusedError({ message: "That is already the answer." })
  const now = yield* Clock.currentTimeMillis
  const next = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id: next,
      project_id: project.id,
      issue_id: old.issue_id,
      epic_id: old.epic_id,
      question_id: old.question_id,
      question: old.question,
      options: old.options,
      recommended: old.recommended,
      chosen: input.option,
      chosen_text: text,
      answered_by: "owner",
      answered_at: now,
      supersedes_id: old.id,
    })
    .run()
  yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
  // Maestro reads the question's answer, so it carries the current one.
  yield* tx
    .update(BoardQuestionTable)
    .set({ answer_option: input.option, answer_text: text, answered_at: now })
    .where(eq(BoardQuestionTable.id, old.question_id))
    .run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: old.issue_id,
    actor: "owner",
    action: "question.answer",
    before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
    after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
  })
  return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
})

export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
  const project = yield* loadProject(tx, input.project)
  const row = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(
      and(
        eq(BoardDecisionTable.project_id, project.id),
        isNull(BoardDecisionTable.overturned_by_id),
        or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
      ),
    )
    .orderBy(desc(BoardDecisionTable.answered_at))
    .get()
  if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
  if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
  const now = yield* Clock.currentTimeMillis
  yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: row.issue_id,
    actor: "maestro",
    action: "question.answer",
    reason: input.reason,
    before: { id: row.question_id, outcome: row.outcome },
    after: { id: row.question_id, decision: row.id, outcome: input.outcome },
  })
  return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
})
~~~~


### `packages/core/src/board/thread.ts`

Archive: `sources/packages/core/src/board/thread.ts` · bytes: 2142 · Git blob: `8c6fd3f62aeabca7d652f38cdc8740fbbd1abeba` · SHA256: `e3cb87f165438aba44cf9cde3ab49be59975fed42d45d4d71317016dfec60ad9`.

Papel da fonte: Threads host readonly, ID determinístico e insert idempotente.


Linhas **9–57**; SHA256 do intervalo `579c8115a2089178664a504e8d726df13c2d5f927a38fffa5d6bb42bd04edbf8`:

~~~~typescript
// Callers pass either the database or an open transaction.
type Tx = Pick<Database.Interface["db"], "select" | "insert">

// Thread notes are written by the host only; they are read-only to people. Their ids are deterministic, so an exact
// retry of the same work hits the primary key and writes nothing twice.

export const card = Effect.fnUntraced(function* (tx: Tx, key: string) {
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) return undefined
  const dash = key.lastIndexOf("-")
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key.slice(0, dash))).get()
  if (!project) return undefined
  return yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, Number(key.slice(dash + 1)))))
    .get()
})

export const bySession = Effect.fnUntraced(function* (tx: Tx, sessionID: string) {
  return yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.session_id, sessionID)).get()
})

export const last = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const note = yield* tx
    .select()
    .from(BoardNoteTable)
    .where(and(eq(BoardNoteTable.issue_id, issue), isNotNull(BoardNoteTable.kind)))
    .orderBy(desc(BoardNoteTable.time_created), desc(BoardNoteTable.id))
    .limit(1)
    .get()
  return note?.kind ?? undefined
})

export const write = Effect.fnUntraced(function* (
  tx: Tx,
  input: { readonly id: string; readonly issue: Board.IssueID; readonly kind: Board.NoteKind; readonly author: string; readonly body: string },
) {
  yield* tx
    .insert(BoardNoteTable)
    .values({
      id: Board.NoteID.make(input.id),
      issue_id: input.issue,
      author: input.author,
      body: input.body,
      kind: input.kind,
    })
    .onConflictDoNothing()
    .run()
})
~~~~


### `packages/core/src/board/board.ts`

Archive: `sources/packages/core/src/board/board.ts` · bytes: 83719 · Git blob: `0488f3819c967df78abd4d6a5a94805e48b3213e` · SHA256: `9b0f56eb1b4c8a78bec8b6af3ce16a71a25bfdcb4e3a3b581317b4126f99141d`.

Papel da fonte: Pergunta/answer, armazenamento de anexos e remoção, undo conflito por campos.


Linhas **1149–1273**; SHA256 do intervalo `1a882ca6aa22de4608e6c24840267c7bf6dbf28cc546d84b39365553637f257e`:

~~~~typescript
        // Questions stay open to Maestro while paused: asking is how it reaches the owner.
        question: Effect.fn("Board.question")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              if (project.status === "archived") return yield* archived(project)
              if (input.action === "withdraw") {
                const question = yield* tx
                  .select()
                  .from(BoardQuestionTable)
                  .where(and(eq(BoardQuestionTable.id, input.id), eq(BoardQuestionTable.project_id, project.id)))
                  .get()
                if (!question) return yield* new NotFoundError({ message: `Question ${input.id} is not on ${project.key}.` })
                if (question.status !== "open")
                  return yield* new RefusedError({ message: `Question ${input.id} is already ${question.status}.` })
                yield* tx.update(BoardQuestionTable).set({ status: "withdrawn" }).where(eq(BoardQuestionTable.id, question.id)).run()
                const activity = yield* log(tx, {
                  project: project.id,
                  issue: question.issue_id,
                  actor: "maestro",
                  action: "question.withdraw",
                  reason: input.reason,
                  before: { id: question.id, status: "open" },
                  after: { id: question.id, status: "withdrawn" },
                })
                return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
              }
              const ids = input.options.map((option) => option.id)
              if (new Set(ids).size !== ids.length) return yield* new RefusedError({ message: "Option ids must be unique." })
              if (!ids.includes(input.recommended))
                return yield* new RefusedError({ message: `The recommended option must be one of: ${ids.join(", ")}.` })
              const issue = input.issue === undefined ? null : (yield* loadIssue(tx, project, input.issue)).id
              const epic = input.epic === undefined ? null : (yield* loadEpic(tx, project, input.epic)).id
              const id = Board.QuestionID.create()
              yield* tx
                .insert(BoardQuestionTable)
                .values({
                  id,
                  project_id: project.id,
                  issue_id: issue,
                  epic_id: epic,
                  text: input.text,
                  options: input.options,
                  recommended: input.recommended,
                  cost_of_waiting: input.cost_of_waiting ?? null,
                  blocking: input.blocking ?? false,
                  status: "open",
                })
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue,
                actor: "maestro",
                action: "question.ask",
                reason: input.reason,
                after: {
                  id,
                  epic_id: epic,
                  text: input.text,
                  options: input.options,
                  recommended: input.recommended,
                  cost_of_waiting: input.cost_of_waiting ?? null,
                  blocking: input.blocking ?? false,
                  kind: null,
                },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue) }
            }),
          )
          return done.result
        }),

        answer: Effect.fn("Board.answer")(function* (key, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const question = yield* tx
                .select()
                .from(BoardQuestionTable)
                .where(and(eq(BoardQuestionTable.id, id as Board.QuestionID), eq(BoardQuestionTable.project_id, project.id)))
                .get()
              if (!question) return yield* new NotFoundError({ message: `Question ${id} is not on ${key}.` })
              if (question.status !== "open") return yield* new RefusedError({ message: `That question is already ${question.status}.` })
              if (!question.options.some((option) => option.id === input.option))
                return yield* new RefusedError({
                  message: `Pick one of: ${question.options.map((option) => option.id).join(", ")}.`,
                })
              const now = yield* Clock.currentTimeMillis
              yield* tx
                .update(BoardQuestionTable)
                .set({ status: "answered", answer_option: input.option, answer_text: input.text ?? null, answered_at: now })
                .where(eq(BoardQuestionTable.id, question.id))
                .run()
              const decision = yield* BoardDecision.record(tx, project, question, input, now)
              const activity = yield* log(tx, {
                project: project.id,
                issue: question.issue_id,
                actor: "owner",
                action: "question.answer",
                before: { id: question.id, status: "open" },
                after: {
                  id: question.id,
                  status: "answered",
                  answer_option: input.option,
                  answer_text: input.text ?? null,
                  decision,
                },
              })
              return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
            }),
          )
          return done.result
        }),

        changeDecision: Effect.fn("Board.changeDecision")(function* (key, id, input) {
          return (yield* write((tx) => BoardDecision.change(tx, key, id, input))).result
        }),

        decisionOutcome: Effect.fn("Board.decisionOutcome")(function* (input) {
          return (yield* write((tx) => BoardDecision.outcome(tx, input))).result
        }),

        settings: Effect.fn("Board.settings")(function* (key, input, actor) {
          return (yield* write((tx) => BoardMoney.settings(tx, key, input, actor))).result
        }),
~~~~


Linhas **1295–1467**; SHA256 do intervalo `cb086966612b58a1a0f4885a59f23e28191b2e8205b56001fd9051a26cf4821c`:

~~~~typescript
        // A secret's value goes only to the credential store, inside the same transaction; the board keeps its label.
        attach: Effect.fn("Board.attach")(function* (key, number, input) {
          const id = Board.AttachmentID.create()
          const content = input.kind === "secret" ? input.value : input.data
          if (!content)
            return yield* new RefusedError({
              message: input.kind === "secret" ? "A secret needs a `value`." : "A file needs base64 `data`.",
            })
          const file =
            input.kind === "secret"
              ? undefined
              : { bytes: Buffer.from(content, "base64"), path: path.join(global.data, "board", id, path.basename(input.name)) }
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              if (input.kind === "secret") {
                const credential = yield* credentials.create({
                  integrationID: Integration.ID.make("board"),
                  label: input.name,
                  value: { type: "key", key: content },
                })
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({ id, issue_id: issue.id, kind: "secret", name: input.name, credential_id: credential.id })
                  .run()
              }
              if (input.kind !== "secret" && file) {
                yield* Effect.promise(() => Bun.write(file.path, file.bytes))
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({
                    id,
                    issue_id: issue.id,
                    kind: input.kind,
                    name: input.name,
                    mime: input.mime ?? null,
                    size: file.bytes.length,
                    path: file.path,
                  })
                  .run()
              }
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.add",
                after: { id, kind: input.kind, name: input.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id) }
            }),
          )
          return done.result
        }),

        editNote: Effect.fn("Board.editNote")(function* (key, number, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "edited")
              if (found.note.body === input.body) return yield* new RefusedError({ message: "That note already says this." })
              yield* tx.update(BoardNoteTable).set({ body: input.body }).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.edit",
                before: { id: found.note.id, body: found.note.body },
                after: { id: found.note.id, body: input.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        deleteNote: Effect.fn("Board.deleteNote")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "deleted")
              yield* tx.delete(BoardNoteTable).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.delete",
                before: { id: found.note.id, body: found.note.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        // The activity row keeps the label only; a secret's value never leaves the credential store, which loses it here.
        removeAttachment: Effect.fn("Board.removeAttachment")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              const attachment = yield* tx
                .select()
                .from(BoardAttachmentTable)
                .where(and(eq(BoardAttachmentTable.id, id as Board.AttachmentID), eq(BoardAttachmentTable.issue_id, issue.id)))
                .get()
              if (!attachment) return yield* new NotFoundError({ message: `Attachment ${id} is not on ${key}-${number}.` })
              yield* tx.delete(BoardAttachmentTable).where(eq(BoardAttachmentTable.id, attachment.id)).run()
              if (attachment.credential_id)
                yield* tx.delete(CredentialTable).where(eq(CredentialTable.id, attachment.credential_id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.remove",
                before: { id: attachment.id, kind: attachment.kind, name: attachment.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id), file: attachment.path }
            }),
          )
          const file = done.file
          if (file) yield* Effect.promise(() => fs.rm(path.dirname(file), { recursive: true, force: true }))
          return done.result
        }),

        undo: Effect.fn("Board.undo")(function* (key, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const target = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.id, id as Board.ActivityID), eq(BoardActivityTable.project_id, project.id)))
                .get()
              if (!target) return yield* new NotFoundError({ message: `Activity ${id} is not on ${key}.` })
              const undoable =
                target.action === "github.overwrite" || (target.actor === "maestro" && UNDOABLE.includes(target.action))
              if (!undoable)
                return yield* new RefusedError({
                  message: "Only Maestro's plan changes and GitHub overwrites can be undone; reverse owner actions by doing the opposite.",
                })
              if (target.undone_by) return yield* new RefusedError({ message: "That change was already undone." })
              const later = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.project_id, project.id), gt(BoardActivityTable.id, target.id)))
                .all()
              const keys = touched(target)
              const conflict = later.find(
                (row) =>
                  !row.undone_by &&
                  !(row.undoes && row.undoes > target.id) &&
                  entity(row) === entity(target) &&
                  touched(row).some((item) => keys.includes(item)),
              )
              if (conflict)
                return yield* new RefusedError({
                  message: `Changed since: a later ${conflict.action} touched the same fields, so this undo would clobber newer work.`,
                })
              yield* apply(tx, project, target, target.before)
              const activity = yield* log(tx, {
                project: project.id,
                issue: target.issue_id,
                actor: "owner",
                action: "undo",
                before: target.after,
                after: target.before,
                undoes: target.id,
              })
              yield* tx.update(BoardActivityTable).set({ undone_by: activity }).where(eq(BoardActivityTable.id, target.id)).run()
              return { result: { activity }, changed: changed(project.id, activity, target.issue_id) }
            }),
          )
          return done.result
        }),
~~~~


## B04 — Mirror GitHub tem semântica própria

Vínculo: `body.md` §7; archive de evidência: `evidence.md`, seção `B04`.


### `packages/core/src/board/github.ts`

Archive: `sources/packages/core/src/board/github.ts` · bytes: 32508 · Git blob: `7a29abd5907dfb6f0443756ad8b2a6f7e7cf133e` · SHA256: `15775b713425cb60f68003099198918a4b567431e426bd351c50ba4971d36702`.

Papel da fonte: Mirror since/ETag limitado, Board vence plano, comentários por ID, CI TTL/cache e taxas fixas.


Linhas **59–83**; SHA256 do intervalo `65a2f3db14cba478325e9ec3a59280cd7f1e86d39de70ef0db2c6090e832e772`:

~~~~typescript
/** The real runner: the user's `gh`, with its own sign-in, never prompting. */
export function runner(proc: AppProcess.Interface, env?: NodeJS.ProcessEnv): Gh {
  return (args, stdin) =>
    Effect.suspend(() => {
      const executable = which("gh", env ?? process.env)
      if (!executable) return Effect.succeed({ exitCode: 127, stdout: "", stderr: "gh is not installed on this server" })
      return proc
        .run(
          ChildProcess.make(executable, [...args], {
            env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
            extendEnv: true,
            stdin: "ignore",
          }),
          { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "30 seconds", stdin },
        )
        .pipe(
          Effect.map((result) => ({
            exitCode: result.exitCode,
            stdout: result.stdout.toString("utf8"),
            stderr: result.stderr.toString("utf8"),
          })),
          Effect.catch((error) => Effect.succeed({ exitCode: 1, stdout: "", stderr: error.message })),
        )
    })
}
~~~~


Linhas **126–158**; SHA256 do intervalo `9c3d604f18ec71589bff1e053b0ea2c3c37b84beee4fb2f8ecb654cec786011e`:

~~~~typescript
// GitHub's per-minute rates for hosted runners; public repositories bill nothing, which the timing endpoint reports as 0 ms.
const RATES: Record<string, number> = { UBUNTU: 0.008, WINDOWS: 0.016, MACOS: 0.08 }
/** CI minutes are refreshed at most this often unless the owner forces it. */
const CI_TTL = 10 * 60_000

const PAGE = 100
const MAX_PAGES = 5
const MARKER = /<!-- orchestra-board:([A-Z]+)-(\d+) -->/
const FOOTER = "\n\n---\nTracked on the Orchestra board as "
const COLORS = { stage: "5319e7", type: "0e8a16" }

export function make(deps: Deps) {
  const gate = Semaphore.makeUnsafe(1)

  /** Pulls from GitHub, then pushes dirty cards. Manual retry and the 60 second poll both come here. */
  const sync = (key: string): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const failed = yield* pull(project, project.github_repo).pipe(
          Effect.andThen(follow(project, project.github_repo)),
          Effect.andThen(push(project, project.github_repo)),
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )
~~~~


Linhas **164–313**; SHA256 do intervalo `4c2aa0e93cb97fdfdec4ca9247b835c0c56dac0bcc46d5810a5b5b7d3277b6d0`:

~~~~typescript
  const ci = (key: string, force = false): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const repo = project.github_repo
        const now = yield* Clock.currentTimeMillis
        if (!force && project.ci_synced_at !== null && now - project.ci_synced_at < CI_TTL)
          return { status: "done", state: project.github_state, error: project.github_error } as const
        const issues = yield* deps.quiet((tx) =>
          tx
            .select()
            .from(BoardIssueTable)
            .where(and(eq(BoardIssueTable.project_id, project.id), sql`${BoardIssueTable.pr_number} is not null`, sql`${BoardIssueTable.stage} != 'cut'`))
            .all(),
        )
        const failed = yield* Effect.forEach(issues, (issue) => runs(project, repo, issue), { discard: true }).pipe(
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        if (!failed)
          yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ ci_synced_at: now }).where(eq(BoardProjectTable.id, project.id)).run())
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )

  const runs = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    const pull = Option.getOrUndefined(decodePull((yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null)).body))
    if (!pull) return
    const found = Option.getOrUndefined(
      decodeRuns((yield* get(`repos/${repo}/actions/runs?head_sha=${encodeURIComponent(pull.head.sha)}&per_page=${PAGE}`, null)).body),
    )
    const known = new Set(
      (yield* deps.quiet((tx) =>
        tx.select({ id: BoardCiRunTable.run_id }).from(BoardCiRunTable).where(eq(BoardCiRunTable.issue_id, issue.id)).all(),
      )).map((row) => row.id),
    )
    const fresh = (found?.workflow_runs ?? []).filter((run) => run.status === "completed" && !known.has(run.id))
    yield* Effect.forEach(
      fresh,
      (run) =>
        Effect.gen(function* () {
          const timing = Option.getOrUndefined(decodeTiming((yield* get(`repos/${repo}/actions/runs/${run.id}/timing`, null)).body))
          const billable = Object.entries(timing?.billable ?? {})
          const ms = billable.reduce((all, [, value]) => all + value.total_ms, 0)
          const cost = billable.reduce((all, [runner, value]) => all + (value.total_ms / 60_000) * (RATES[runner.toUpperCase()] ?? RATES.UBUNTU), 0)
          yield* deps.quiet((tx) =>
            tx
              .insert(BoardCiRunTable)
              .values({
                run_id: run.id,
                project_id: project.id,
                issue_id: issue.id,
                name: run.name ?? "workflow",
                attempt: run.run_attempt ?? 1,
                billable_ms: Math.round(ms),
                cost_usd: cost,
              })
              .onConflictDoNothing()
              .run(),
          )
        }),
      { discard: true },
    )
  })

  /**
   * The PR is the fact a card follows on every sync: an open PR moves a Building card to Review, a merged one moves it
   * from Building or Review to Shipped and clears its crash reason. Maestro still moves every other stage; a paused
   * project or card, and an owner hold before merge, keep the card where it is.
   */
  const follow = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    if (project.status !== "active") return
    const issues = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.pr_number} is not null`,
            sql`${BoardIssueTable.stage} in ('building', 'review')`,
          ),
        )
        .all(),
    )
    yield* Effect.forEach(issues, (issue) => advance(project, repo, issue), { discard: true })
  })

  const advance = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    // One unreadable PR (deleted, renamed repo, a blip) leaves its card alone; it must not stop the rest of the sync.
    const read = yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null).pipe(Effect.option)
    const pull = Option.getOrUndefined(Option.flatMap(read, (result) => decodePull(result.body)))
    const stage = pull?.merged ? ("shipped" as const) : pull?.state === "open" ? ("review" as const) : undefined
    if (!stage || issue.paused) return
    const from: ReadonlyArray<Board.Stage> = stage === "shipped" ? ["building", "review"] : ["building"]
    if (!from.includes(issue.stage) || (stage === "shipped" && issue.hold_before_merge)) return
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const next = {
          stage,
          position: yield* endOf(tx, project.id, stage),
          stage_entered_at: now,
          ...(stage === "shipped" ? { crash_reason: null } : {}),
        }
        yield* tx.update(BoardIssueTable).set({ ...next, github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
        const activity = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "issue.move",
          reason: stage === "shipped" ? `PR #${issue.pr_number} merged on GitHub.` : `PR #${issue.pr_number} is open on GitHub.`,
          before: {
            stage: issue.stage,
            position: issue.position,
            stage_entered_at: issue.stage_entered_at,
            ...(stage === "shipped" ? { crash_reason: issue.crash_reason } : {}),
          },
          after: next,
        })
        return { project: project.id, issue: issue.id, activity }
      }),
    )
    yield* deps.publish(changed)
  })

  const settle = Effect.fnUntraced(function* (project: ProjectRow, state: Board.GithubState, error: string | null) {
    const now = yield* Clock.currentTimeMillis
    const set = { github_state: state, github_error: error, ...(state === "ok" ? { github_synced_at: now } : {}) }
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set(set).where(eq(BoardProjectTable.id, project.id)).run()
        if (project.github_state === state && project.github_error === error) return undefined
        const activity = yield* deps.log(tx, {
          project: project.id,
          actor: "github",
          action: "github.state",
          before: { github_state: project.github_state, github_error: project.github_error },
          after: { github_state: state, github_error: error },
        })
        return { project: project.id, activity }
      }),
    )
    if (changed) yield* deps.publish(changed)
  })
~~~~


Linhas **317–433**; SHA256 do intervalo `e888dc738c7b5b0ce969e573d426ddd5115bb0eed018ff1f86656ad1e6998606`:

~~~~typescript
  const pull = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const now = yield* Clock.currentTimeMillis
    // The mirror starts now: issues that were already on GitHub are not imported into Intake.
    const start = project.github_since ?? now
    const issues = yield* pages(repo, "issues", "state=all&sort=updated&direction=asc", start, project.github_issues_etag, decodeIssues)
    for (const item of issues.items) if (!item.pull_request) yield* ingest(project, item)
    const comments = yield* pages(repo, "issues/comments", "sort=updated&direction=asc", start, project.github_comments_etag, decodeComments)
    for (const item of comments.items) yield* comment(project, item)
    const newest = issues.items.reduce((high, item) => Math.max(high, Date.parse(item.updated_at) || 0), start)
    yield* deps.quiet((tx) =>
      tx
        .update(BoardProjectTable)
        .set({
          github_since: newest,
          github_issues_etag: issues.etag ?? project.github_issues_etag,
          github_comments_etag: comments.etag ?? project.github_comments_etag,
        })
        .where(eq(BoardProjectTable.id, project.id))
        .run(),
    )
  })

  /** Reads a list endpoint with `since` and the stored ETag; a 304 is an empty page. */
  const pages = <T extends { readonly updated_at: string }>(
    repo: string,
    path: string,
    query: string,
    since: number,
    etag: string | null,
    decode: (text: string) => Option.Option<ReadonlyArray<T>>,
  ) =>
    Effect.gen(function* () {
      const items: T[] = []
      let cursor = since
      let seen = etag
      let latest: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = yield* get(`repos/${repo}/${path}?${query}&per_page=${PAGE}&since=${new Date(cursor).toISOString()}`, seen)
        if (res.status === 304) break
        const batch = decode(res.body)
        if (Option.isNone(batch)) return yield* new Failure({ kind: "error", message: `GitHub returned ${path} in a shape the board does not read.` })
        items.push(...batch.value)
        latest = res.etag ?? latest
        seen = null
        const last = batch.value.at(-1)?.updated_at
        const next = last ? Date.parse(last) : cursor
        if (batch.value.length < PAGE || !(next > cursor)) break
        cursor = next
      }
      return { items, etag: latest }
    })

  const ingest = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Issue.Type) {
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const marker = MARKER.exec(item.body ?? "")
        const rows = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all()
        const known =
          rows.find((row) => row.github_number === item.number) ??
          (marker?.[1] === project.key ? rows.find((row) => row.number === Number(marker[2]) && row.github_number === null) : undefined)
        if (!known) {
          // Closed issues are history; a marker with no matching card is another board's.
          if (item.state !== "open" || marker) return undefined
          return yield* intake(tx, project, item)
        }
        if (known.github_number === null)
          yield* tx.update(BoardIssueTable).set({ github_number: item.number, github_node_id: item.node_id }).where(eq(BoardIssueTable.id, known.id)).run()
        // A pending push or an issue the owner has not accepted yet is not compared.
        if (known.github_dirty || known.stage === "intake") return undefined
        return yield* compare(tx, project, known, item)
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  const intake = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, item: typeof Issue.Type) {
    const fresh = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, project.id)).get()
    const stage = project.auto_accept_intake ? ("backlog" as const) : ("intake" as const)
    const id = Board.IssueID.create()
    const number = fresh?.next_issue_number ?? project.next_issue_number
    const names = item.labels.map((label) => label.name.toLowerCase())
    const row = {
      id,
      project_id: project.id,
      number,
      title: item.title,
      body: item.body ?? "",
      type: names.includes("bug") ? ("bug" as const) : names.includes("chore") ? ("chore" as const) : ("feature" as const),
      stage,
      position: yield* endOf(tx, project.id, stage),
      stage_entered_at: yield* Clock.currentTimeMillis,
      github_number: item.number,
      github_node_id: item.node_id,
      // An accepted card still needs its stage label and footer on GitHub.
      github_dirty: stage !== "intake",
    }
    yield* tx.insert(BoardIssueTable).values(row).run()
    yield* tx.update(BoardProjectTable).set({ next_issue_number: number + 1 }).where(eq(BoardProjectTable.id, project.id)).run()
    const activity = yield* deps.log(tx, {
      project: project.id,
      issue: id,
      actor: "github",
      action: "issue.create",
      reason: `Opened on GitHub as #${item.number} by ${item.user?.login ?? "someone"}.`,
      after: {
        number,
        title: row.title,
        body: row.body,
        type: row.type,
        stage,
        position: row.position,
        stage_entered_at: row.stage_entered_at,
        github_number: row.github_number,
      },
    })
    return { project: project.id, issue: id, activity } as Changed
  })
~~~~


Linhas **435–611**; SHA256 do intervalo `58b8762bd6de747cd3ec6e947b91e4607425e15a4bca8be530b91ecb00134d6f`:

~~~~typescript
  // Board wins for stage and steps; GitHub's edits to title or body are overwritten, but the owner can undo that.
  const compare = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, item: typeof Issue.Type) {
    const ref = `${project.key}-${issue.number}`
    const text = item.body ?? ""
    let last: Board.ActivityID | undefined
    if (MARKER.test(text)) {
      const theirs: Record<string, string> = {}
      const ours: Record<string, string> = {}
      const body = unmirrored(text)
      if (item.title !== issue.title) {
        theirs.title = item.title
        ours.title = issue.title
      }
      if (body !== issue.body.trim()) {
        theirs.body = body
        ours.body = issue.body
      }
      if (Object.keys(theirs).length > 0) {
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "github.overwrite",
          reason: `GitHub had a different ${Object.keys(theirs).join(" and ")} for ${ref}; the next push restores the board's.`,
          before: theirs,
          after: ours,
        })
        yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
      }
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    if ((item.state === "closed") !== shut) {
      const said = item.state === "closed" ? "closed" : "reopened"
      const asked = `GitHub #${item.number} (${ref}) was ${said} on GitHub, but the board has it in ${issue.stage}.`
      const open = yield* tx
        .select({ id: BoardQuestionTable.id })
        .from(BoardQuestionTable)
        .where(and(eq(BoardQuestionTable.issue_id, issue.id), eq(BoardQuestionTable.status, "open"), eq(BoardQuestionTable.text, asked)))
        .get()
      if (!open) {
        const id = Board.QuestionID.create()
        const options = [
          { id: "keep", label: "Keep the board's stage", consequence: "The next push puts the GitHub issue back the way the board has it." },
          { id: "follow", label: "Follow GitHub", consequence: "Move the card to match GitHub, then the two agree." },
        ]
        yield* tx
          .insert(BoardQuestionTable)
          .values({
            id,
            project_id: project.id,
            issue_id: issue.id,
            text: asked,
            options,
            recommended: "keep",
            cost_of_waiting: null,
            blocking: false,
            status: "open",
          })
          .run()
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "question.ask",
          reason: `GitHub #${item.number} was ${said}; the board does not apply that on its own.`,
          after: {
            id,
            epic_id: null,
            text: asked,
            options,
            recommended: "keep",
            cost_of_waiting: null,
            blocking: false,
            kind: null,
          },
        })
      }
      // The next push restores the board's state unless the plan changes first.
      yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
    }
    return last ? ({ project: project.id, issue: issue.id, activity: last } as Changed) : undefined
  })

  const comment = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Comment.Type) {
    const number = Number(item.issue_url.split("/").at(-1))
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const issue = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.github_number, number)))
          .get()
        if (!issue) return undefined
        const have = yield* tx.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.github_comment_id, item.id)).get()
        if (have) return undefined
        const id = Board.NoteID.create()
        const author = `github:${item.user?.login ?? "unknown"}`
        yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author, body: item.body, github_comment_id: item.id }).run()
        const activity = yield* deps.log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author, body: item.body } })
        return { project: project.id, issue: issue.id, activity } as Changed
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  // ---- board to GitHub ----

  const push = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const due = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.stage} != 'intake'`,
            or(eq(BoardIssueTable.github_dirty, true), isNull(BoardIssueTable.github_number)),
          ),
        )
        .orderBy(asc(BoardIssueTable.time_updated))
        .all(),
    )
    const labels = new Set<string>()
    for (const issue of due) yield* pushOne(project, repo, issue, labels)
  })

  const pushOne = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow, labels: Set<string>) {
    const ref = `${project.key}-${issue.number}`
    const { steps, epic } = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const steps = yield* tx.select().from(BoardStepTable).where(eq(BoardStepTable.issue_id, issue.id)).orderBy(asc(BoardStepTable.position)).all()
        const epic = issue.epic_id ? yield* tx.select().from(BoardEpicTable).where(eq(BoardEpicTable.id, issue.epic_id)).get() : undefined
        return { steps, epic }
      }),
    )
    const milestone = epic ? yield* milestoneOf(project, repo, epic) : null
    const ours = [`stage:${issue.stage}`, `type:${issue.type}`]
    for (const name of ours) {
      if (labels.has(name)) continue
      yield* send("POST", `repos/${repo}/labels`, { name, color: COLORS[name.startsWith("stage") ? "stage" : "type"] }, [422])
      labels.add(name)
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    const state = shut ? { state: "closed", state_reason: issue.stage === "cut" ? "not_planned" : "completed" } : { state: "open" }
    const content = { title: issue.title, body: render(project.key, issue, steps) }

    const existing = issue.github_number
    const created =
      existing === null
        ? Option.getOrUndefined(decodeCreated((yield* send("POST", `repos/${repo}/issues`, { ...content, labels: ours, ...(milestone ? { milestone } : {}) })).body))
        : undefined
    if (existing === null && !created) return yield* new Failure({ kind: "error", message: `GitHub did not return the new issue for ${ref}.` })
    const number = (created?.number ?? existing) as number
    // Keep labels people added; only the board's stage and type labels are replaced.
    const theirs =
      existing === null
        ? []
        : Option.match(decodeIssue((yield* get(`repos/${repo}/issues/${number}`, null)).body), {
            onNone: () => [],
            onSome: (found) => found.labels.map((label) => label.name).filter((name) => !/^(stage|type):/.test(name)),
          })
    // A new issue is created open with its labels; closing it, and every update, goes through PATCH.
    if (existing !== null || shut)
      yield* send("PATCH", `repos/${repo}/issues/${number}`, { ...content, ...state, labels: [...theirs, ...ours], milestone })
    yield* deps.quiet((tx) =>
      tx
        .update(BoardIssueTable)
        .set({
          github_number: number,
          github_node_id: created?.node_id ?? issue.github_node_id,
          // A write that landed while the push was in flight keeps the card dirty.
          github_dirty: sql`case when ${BoardIssueTable.time_updated} = ${issue.time_updated} then 0 else 1 end`,
        })
        .where(eq(BoardIssueTable.id, issue.id))
        .run(),
    )
  })
~~~~


Linhas **625–688**; SHA256 do intervalo `c6b6da5e01da5880b8103abae07605fda7d74f158a5a09f8fa7f38af0de92e53`:

~~~~typescript
  /** GET with headers, so the ETag and a 304 are visible. */
  const get = Effect.fnUntraced(function* (endpoint: string, etag: string | null) {
    const result = yield* deps.gh(["api", "-i", endpoint, ...(etag ? ["-H", `If-None-Match: ${etag}`] : [])])
    const head = /^HTTP\/\S+\s+(\d{3})/.exec(result.stdout)
    const status = head ? Number(head[1]) : undefined
    if (status === 304) return { status, body: "", etag }
    if (status !== undefined && status >= 200 && status < 300 && result.exitCode === 0) {
      const split = /\r?\n\r?\n/.exec(result.stdout)
      const headers = result.stdout.slice(0, split?.index ?? 0)
      return { status, body: result.stdout.slice((split?.index ?? 0) + (split?.[0].length ?? 0)), etag: /^etag:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null }
    }
    return yield* fail(result, status)
  })

  const send = Effect.fnUntraced(function* (method: "POST" | "PATCH", endpoint: string, payload: unknown, tolerate: ReadonlyArray<number> = []) {
    const result = yield* deps.gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify(payload))
    if (result.exitCode === 0) return { body: result.stdout }
    const status = Number(/HTTP (\d{3})/.exec(result.stderr)?.[1] ?? NaN)
    if (tolerate.includes(status)) return { body: result.stdout }
    return yield* fail(result, Number.isNaN(status) ? undefined : status)
  })

  const fail = (result: GhResult, status: number | undefined) => {
    const line = result.stderr.split(/\r?\n/).find((text) => text.trim()) ?? `gh exited with ${result.exitCode}`
    const code = status ?? (Number(/HTTP (\d{3})/.exec(result.stderr)?.[1]) || undefined)
    const signedOut =
      result.exitCode === 4 || /auth login|not logged in|not authenticated|HTTP 401|401 Unauthorized|Bad credentials/i.test(result.stderr) || code === 401
    const limited = code === 429 || /rate limit/i.test(result.stderr) || (code === 403 && /x-ratelimit-remaining:\s*0/i.test(result.stdout))
    return new Failure({
      kind: signedOut ? "signed_out" : limited ? "rate_limited" : "error",
      message: redact(signedOut ? `GitHub is not signed in on this server: ${line}` : line).slice(0, 300),
      status: code,
    })
  }

  return { sync, ci }
}

/** The issue body GitHub shows: the card body, the steps as a task list, and the footer with the hidden marker. */
export function render(key: string, issue: Pick<IssueRow, "number" | "body">, steps: ReadonlyArray<{ readonly title: string; readonly status: Board.StepStatus }>) {
  const list = steps.map((step) => `- [${step.status === "done" || step.status === "skipped" ? "x" : " "}] ${step.status === "skipped" ? `~~${step.title}~~` : step.title}`)
  return [
    issue.body.trim(),
    list.length > 0 ? `### Steps\n${list.join("\n")}` : "",
    `---\nTracked on the Orchestra board as ${key}-${issue.number}. <!-- orchestra-board:${key}-${issue.number} -->`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The card's own text inside a mirrored body: without the steps list and the footer the mirror appends. */
export function unmirrored(text: string) {
  const plain = text.replace(/\r\n/g, "\n")
  const cut = plain.lastIndexOf(FOOTER)
  const head = cut >= 0 ? plain.slice(0, cut) : plain.replace(/^---\nTracked on the Orchestra board as .*$/m, "")
  const steps = head.lastIndexOf("### Steps\n")
  const tail = steps >= 0 ? head.slice(steps + "### Steps\n".length) : ""
  const listed = steps >= 0 && tail.split("\n").every((line) => /^- \[[ x]\] /.test(line))
  return (listed ? head.slice(0, steps) : head).trim()
}

function redact(text: string) {
  return text.replace(/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})/g, "[token]")
}
~~~~


## B05 — Medição parcial, orçamento e forecast

Vínculo: `body.md` §6, 7; archive de evidência: `evidence.md`, seção `B05`.


### `packages/core/src/board/money.ts`

Archive: `sources/packages/core/src/board/money.ts` · bytes: 9068 · Git blob: `2e898a1aaf5d8740ced0bcd0a8afe0baa3996bc9` · SHA256: `30254e118087b0f8ac51e48b0c1f4a5f2e7bfd7a4bf2907267fe37c13a8a582b`.

Papel da fonte: Custos Sessions/filhos e CI cache; threshold/forecast e bloqueio só de nova entrada building.


Linhas **21–191**; SHA256 do intervalo `0842c0e45d0484a268bea2e9802cdc1c4f0f0190fc7175e7bbe2b026874539f3`:

~~~~typescript
// Spend reads rows only: session cost and the CI minutes the poll cached. `forecast` null leaves the finish unknown.
export const spendOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, forecast: Board.Forecast | null) {
  const issues = yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), ne(BoardIssueTable.stage, "cut")))
    .orderBy(asc(BoardIssueTable.number))
    .all()
  const known = yield* numbers(tx, project)
  const linked = issues.flatMap((row) => (row.session_id ? [row.session_id] : []))
  const ids = linked as (typeof SessionTable.$inferSelect)["id"][]
  const sessions =
    linked.length === 0
      ? []
      : yield* tx
          .select({
            id: SessionTable.id,
            parent: SessionTable.parent_id,
            cost: SessionTable.cost,
            model: SessionTable.model,
            tokens:
              sql<number>`${SessionTable.tokens_input} + ${SessionTable.tokens_output} + ${SessionTable.tokens_reasoning} + ${SessionTable.tokens_cache_read} + ${SessionTable.tokens_cache_write}`,
          })
          .from(SessionTable)
          .where(or(inArray(SessionTable.id, ids), inArray(SessionTable.parent_id, ids)))
          .all()
  const runs = yield* tx
    .select({ issue: BoardCiRunTable.issue_id, usd: sql<number>`sum(${BoardCiRunTable.cost_usd})` })
    .from(BoardCiRunTable)
    .where(eq(BoardCiRunTable.project_id, project.id))
    .groupBy(BoardCiRunTable.issue_id)
    .all()
  const spends = issues.map((row) => {
    const own = sessions.filter((item) => row.session_id !== null && (item.id === row.session_id || item.parent === row.session_id))
    const ci: BoardSpend.Ci =
      !row.pr_number || !project.github_repo
        ? { kind: "none" }
        : project.ci_synced_at === null
          ? { kind: "pending" }
          : { kind: "ok", usd: runs.find((item) => item.issue === row.id)?.usd ?? 0 }
    return BoardSpend.card({
      sessions: own.map((item) => ({ model: item.model?.id ?? null, provider: item.model?.providerID ?? null, cost: item.cost, tokens: item.tokens })),
      ci,
    })
  })
  const epicOf = (row: IssueRow) => (row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null)
  const flagged = BoardSpend.flags(issues.map((row, index) => ({ epic: epicOf(row), spend: spends[index]! })))
  const cards = issues.map(
    (row, index): Board.CardSpend => ({
      ...spends[index]!,
      issue: row.number,
      ref: `${project.key}-${row.number}`,
      epic: epicOf(row),
      seat: row.seat,
      flagged: flagged[index]!.flagged,
      epicMedianUsd: flagged[index]!.median,
    }),
  )
  const epics = Array.from(new Set(cards.flatMap((card) => (card.epic === null ? [] : [card.epic]))))
    .toSorted((a, b) => a - b)
    .map((number): Board.EpicSpend => ({ ...BoardSpend.total(cards.filter((card) => card.epic === number)), epic: number, ref: `${project.key}-E${number}` }))
  const seats = Array.from(new Set(cards.flatMap((card) => (card.seat === null ? [] : [card.seat]))))
    .toSorted()
    .map((seat): Board.SeatSpend => ({ ...BoardSpend.total(cards.filter((card) => card.seat === seat)), seat }))
  const total = BoardSpend.total(spends)
  const now = yield* Clock.currentTimeMillis
  return {
    project: total,
    budget: BoardSpend.budget({
      budgetUsd: project.budget_usd,
      spentUsd: total.usd,
      forecastUsd: forecast ? BoardSpend.finish({ spentUsd: total.usd, since: project.time_created, now, forecast }) : null,
    }),
    cards,
    epics,
    seats,
    infraSyncedAt: project.ci_synced_at,
  } satisfies Board.SpendReport
})

// Persists how many evaluations in a row put P50 past the target date, and raises the one pre-emptive budget
// question when the forecast finish crosses 90% of the budget. Returns the activity of a question it raised.
export const evaluate = Effect.fnUntraced(function* (tx: Tx, id: string) {
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, id as Board.ProjectID)).get()
  if (!project) return undefined
  const forecast = yield* forecastOf(tx, project)
  const streak = BoardForecast.late(forecast.project) ? project.forecast_late_streak + 1 : 0
  if (streak !== project.forecast_late_streak)
    yield* tx.update(BoardProjectTable).set({ forecast_late_streak: streak }).where(eq(BoardProjectTable.id, project.id)).run()
  if (project.budget_usd === null || project.status === "archived" || forecast.project.forecast.kind === "done") return undefined
  const budget = (yield* spendOf(tx, project, forecast.project.forecast)).budget
  if (budget.forecastUsd === null || budget.forecastPercent === null || budget.forecastPercent < BoardSpend.QUESTION * 100) return undefined
  // One question per budget figure: raising the budget makes a new one possible, answering never re-asks.
  const kind = `budget:${project.budget_usd}`
  const asked = yield* tx
    .select({ id: BoardQuestionTable.id })
    .from(BoardQuestionTable)
    .where(and(eq(BoardQuestionTable.project_id, project.id), eq(BoardQuestionTable.kind, kind)))
    .get()
  if (asked) return undefined
  const question = Board.QuestionID.create()
  const text = `${project.key} is forecast to spend about $${budget.forecastUsd.toFixed(2)} by its finish, ${Math.round(budget.forecastPercent)}% of its $${project.budget_usd.toFixed(2)} budget. What should happen?`
  const options = [
    { id: "raise", label: "Raise the budget", consequence: "Work continues; set the new amount in the project settings." },
    { id: "cut", label: "Cut scope to fit", consequence: "Maestro proposes which cards to cut; the budget stays." },
    { id: "continue", label: "Keep going as is", consequence: "Work continues until 100%, then new work stops." },
  ]
  yield* tx
    .insert(BoardQuestionTable)
    .values({
      id: question,
      project_id: project.id,
      issue_id: null,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
      status: "open",
    })
    .run()
  return yield* log(tx, {
    project: project.id,
    actor: "maestro",
    action: "question.ask",
    reason: "The forecast finish crossed 90% of the budget.",
    after: {
      id: question,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
    },
  })
})

/** A project at its whole budget starts no new work; a card already building keeps going. */
export const requireRoom = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage, ref: string) {
  if (stage !== "building" || issue.stage === "building" || project.budget_usd === null) return
  const budget = (yield* spendOf(tx, project, null)).budget
  if (budget.state !== "paused") return
  return yield* new BudgetPausedError({
    message: `${project.key} has spent $${budget.spentUsd.toFixed(2)} of its $${project.budget_usd.toFixed(2)} budget, so no new work starts; ${ref} stays where it is. Work in progress continues. Ask the owner to raise the budget.`,
  })
})

export const settings = Effect.fnUntraced(function* (
  tx: Tx,
  key: string,
  input: { readonly target_date?: number | null; readonly budget_usd?: number | null; readonly reason?: string },
  actor: "owner" | "maestro",
) {
  const project = yield* loadProject(tx, key)
  if (project.status === "archived") return yield* archived(project)
  const change = diff(project, { target_date: input.target_date, budget_usd: input.budget_usd })
  if (!change) return yield* new RefusedError({ message: `Nothing to change on ${key}.` })
  yield* tx.update(BoardProjectTable).set(change.after).where(eq(BoardProjectTable.id, project.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    actor,
    action: "project.upsert",
    reason: input.reason ?? null,
    ...change,
  })
  return { result: { activity }, changed: changed(project.id, activity) }
})
~~~~


### `packages/core/src/board/spend.ts`

Archive: `sources/packages/core/src/board/spend.ts` · bytes: 6301 · Git blob: `c5c82e700282b4ba2fad710a5a87daae0328b6f9` · SHA256: `11d1284e196ac2f72708d88a47d7f839f5e380d0f4cc87e0a196d4b4c32d45ce`.

Papel da fonte: Measured/not-metered/partial e thresholds; forecast monetário é estimativa.


Linhas **9–143**; SHA256 do intervalo `8b29dbba388c8ec62d9540aa1a14062e078323166feec729ba100fdebcc7885f`:

~~~~typescript
/** Providers whose engine runs on a subscription: they report no per-token price. */
const SUBSCRIPTION = ["claude-code"]

export const WARN = 0.8
export const PAUSE = 1
export const QUESTION = 0.9
export const FLAG = 3
/** Peers an epic needs before its median means anything. */
const PEERS = 2

export type Session = {
  readonly model: string | null
  readonly provider: string | null
  readonly cost: number
  readonly tokens: number
}

/** `none`: no PR, nothing to attribute. `pending`: a PR whose runs have not been fetched yet. */
export type Ci = { readonly kind: "none" } | { readonly kind: "pending" } | { readonly kind: "ok"; readonly usd: number }

/** One card's spend. Subagent sessions of the card's session are included by the caller. */
export function card(input: { readonly sessions: readonly Session[]; readonly ci: Ci }): Board.Spend {
  const metered = input.sessions.filter((item) => item.cost > 0 && !subscription(item))
  const unmetered = input.sessions.filter((item) => item.tokens > 0 && !metered.includes(item))
  const byModel = Object.entries(
    metered.reduce<Record<string, number>>((all, item) => ({ ...all, [item.model ?? "unknown"]: (all[item.model ?? "unknown"] ?? 0) + item.cost }), {}),
  )
    .map(([model, usd]) => ({ model, usd }))
    .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model))
  const models: Board.Meter =
    input.sessions.length === 0
      ? { kind: "not-metered", source: "no session linked" }
      : metered.length > 0 || unmetered.length === 0
        ? { kind: "usd", usd: sum(metered.map((item) => item.cost)) }
        : { kind: "not-metered", source: unmetered.some(subscription) ? "subscription engine, no per-token price" : "no price reported" }
  const infra: Board.Meter =
    input.ci.kind === "ok"
      ? { kind: "usd", usd: input.ci.usd }
      : { kind: "not-metered", source: input.ci.kind === "pending" ? "GitHub Actions not fetched yet" : "no PR linked" }
  return {
    models,
    infra,
    byModel,
    usd: usd(models) + usd(infra),
    partial: (metered.length > 0 && unmetered.length > 0) || input.ci.kind === "pending",
  }
}

/** Adds spends together: a part is metered when any member of it is. */
export function total(items: readonly Board.Spend[]): Board.Spend {
  const part = (pick: (item: Board.Spend) => Board.Meter): Board.Meter => {
    const meters = items.map(pick)
    const first = meters.find((meter) => meter.kind === "not-metered")
    return meters.some((meter) => meter.kind === "usd") || !first ? { kind: "usd", usd: sum(meters.map(usd)) } : first
  }
  const models = part((item) => item.models)
  const infra = part((item) => item.infra)
  const merged = items
    .flatMap((item) => item.byModel)
    .reduce<Record<string, number>>((all, item) => ({ ...all, [item.model]: (all[item.model] ?? 0) + item.usd }), {})
  return {
    models,
    infra,
    byModel: Object.entries(merged)
      .map(([model, value]) => ({ model, usd: value }))
      .toSorted((a, b) => b.usd - a.usd || a.model.localeCompare(b.model)),
    usd: usd(models) + usd(infra),
    partial:
      items.some((item) => item.partial) ||
      items.some((item) => item.models.kind === "not-metered") && items.some((item) => item.models.kind === "usd" && item.models.usd > 0),
  }
}

/** Flags a card at 3 times the median of its epic peers; cards outside an epic are never flagged. */
export function flags(cards: readonly { readonly epic: number | null; readonly spend: Board.Spend }[]) {
  return cards.map((item) => {
    if (item.epic === null || item.spend.models.kind !== "usd" || item.spend.usd <= 0) return { flagged: false, median: null }
    const peers = cards
      .filter((other) => other !== item && other.epic === item.epic && other.spend.models.kind === "usd" && other.spend.usd > 0)
      .map((other) => other.spend.usd)
    if (peers.length < PEERS) return { flagged: false, median: null }
    const middle = median(peers)
    return { flagged: item.spend.usd >= FLAG * middle, median: middle }
  })
}

export function budget(input: {
  readonly budgetUsd: number | null
  readonly spentUsd: number
  readonly forecastUsd: number | null
}): Board.Budget {
  if (input.budgetUsd === null)
    return { budgetUsd: null, spentUsd: input.spentUsd, percent: null, state: "none", forecastUsd: input.forecastUsd, forecastPercent: null }
  const share = (value: number) => (input.budgetUsd! > 0 ? (value / input.budgetUsd!) * 100 : 100)
  return {
    budgetUsd: input.budgetUsd,
    spentUsd: input.spentUsd,
    percent: share(input.spentUsd),
    state: input.spentUsd >= input.budgetUsd * PAUSE ? "paused" : input.spentUsd >= input.budgetUsd * WARN ? "warn" : "ok",
    forecastUsd: input.forecastUsd,
    forecastPercent: input.forecastUsd === null ? null : share(input.forecastUsd),
  }
}

/** Spend at the forecast finish: what is spent plus the burn rate over the time left to the forecast P50. */
export function finish(input: {
  readonly spentUsd: number
  /** When the project started spending. */
  readonly since: number
  readonly now: number
  readonly forecast: Board.Forecast
}) {
  if (input.forecast.kind === "done") return input.spentUsd
  if (input.forecast.kind !== "dates") return null
  const burn = input.spentUsd / Math.max(1, (input.now - input.since) / DAY)
  return input.spentUsd + burn * Math.max(0, (input.forecast.p50 - input.now) / DAY)
}

function subscription(item: Session) {
  return item.provider !== null && SUBSCRIPTION.includes(item.provider)
}

function usd(meter: Board.Meter) {
  return meter.kind === "usd" ? meter.usd : 0
}

function sum(values: readonly number[]) {
  return values.reduce((all, value) => all + value, 0)
}

function median(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}
~~~~


### `packages/core/src/board/forecast.ts`

Archive: `sources/packages/core/src/board/forecast.ts` · bytes: 6656 · Git blob: `8c5aa204de45ec477861b3c5ea3c37aa1fe78eab` · SHA256: `4c30459dd7de865d5536d9a24a842b19a14bbeffd5ae4597a8df5f0b76fa06fd`.

Papel da fonte: Monte Carlo do histórico Board com mínimo, seed e horizonte; waits/late.


Linhas **8–94**; SHA256 do intervalo `9057d30893177b65b8c115792adab1507524e6b3780c41cb5d86683414443e12`:

~~~~typescript
const DAY = 86_400_000
const NEEDED = 5
const TRIALS = 1000
const HORIZON = 3650
const SEED = 0x9e3779b9
const OPEN: readonly Board.Stage[] = ["backlog", "ready", "building", "review", "queue"]

export type Item = {
  readonly epic: number | null
  readonly stage: Board.Stage
  /** For a shipped issue, the moment it shipped. */
  readonly enteredAt: number
  /** The issue ref this one is blocked on: an unshipped dependency, or itself when paused or asked a blocking question. */
  readonly waitsOn: string | null
}

/** The project forecast and, in position order, one per epic; an epic's dates include the open epics before it. */
export function plan(input: {
  readonly items: readonly Item[]
  readonly epics: readonly { readonly number: number; readonly ref: string }[]
  readonly targetDate: number | null
  readonly now: number
}) {
  const shipped = input.items.filter((item) => item.stage === "shipped")
  const open = input.items.filter((item) => OPEN.includes(item.stage))
  const openOf = (epic: number) => open.filter((item) => item.epic === epic)
  const cumulative = input.epics.map((_, index) =>
    input.epics.slice(0, index + 1).reduce((sum, epic) => sum + openOf(epic.number).length, 0),
  )
  const today = Math.floor(input.now / DAY)
  const runs =
    shipped.length >= NEEDED
      ? simulate(
          throughput(
            shipped.map((item) => item.enteredAt),
            today,
          ),
          [...cumulative, open.length],
          today,
        )
      : []
  const forecast = (items: readonly Item[], shippedHere: number, run?: { readonly p50: number; readonly p85: number }): Board.Forecast => {
    if (items.length === 0 && (shippedHere > 0 || shipped.length >= NEEDED)) return { kind: "done" }
    const waits = items.every((item) => item.waitsOn !== null) ? items[0]?.waitsOn : undefined
    if (waits) return { kind: "waits", on: waits }
    if (!run) return { kind: "insufficient", shipped: shipped.length, needed: NEEDED }
    return {
      kind: "dates",
      p50: run.p50,
      p85: run.p85,
      vsTarget:
        input.targetDate === null
          ? null
          : { p50: Math.round((run.p50 - input.targetDate) / DAY), p85: Math.round((run.p85 - input.targetDate) / DAY) },
    }
  }
  const epics = input.epics.map((epic, index) => ({
    epic: epic.number,
    ref: epic.ref,
    shipped: shipped.filter((item) => item.epic === epic.number).length,
    remaining: openOf(epic.number).length,
    forecast: forecast(
      openOf(epic.number),
      shipped.filter((item) => item.epic === epic.number).length,
      runs[index],
    ),
  }))
  const pole = epics.reduce<number | undefined>((best, epic) => {
    if (epic.forecast.kind !== "dates") return best
    const current = best === undefined ? undefined : epics[best]?.forecast
    if (current?.kind === "dates" && current.p85 >= epic.forecast.p85) return best
    return epics.indexOf(epic)
  }, undefined)
  return {
    project: {
      shipped: shipped.length,
      remaining: open.length,
      targetDate: input.targetDate,
      forecast: forecast(open, shipped.length, runs.at(-1)),
    } satisfies Board.ProjectForecast,
    epics: epics.map((epic, index): Board.EpicForecast => ({ ...epic, setsDate: index === pole })),
  }
}

/** P50 past the target date; two consecutive evaluations like this turn the project's health to at_risk. */
export function late(forecast: Board.ProjectForecast) {
  return forecast.forecast.kind === "dates" && forecast.forecast.vsTarget !== null && forecast.forecast.vsTarget.p50 > 0
~~~~


Linhas **119–162**; SHA256 do intervalo `bd1f176f48b58462b0af0cbee4812dd8d3849e9c92fbdb030c6fa0887fc795f1`:

~~~~typescript
/** Issues shipped per UTC day, from the first ship day through today, zero days included. */
function throughput(shippedAt: readonly number[], today: number) {
  const first = Math.min(today, ...shippedAt.map((at) => Math.floor(at / DAY)))
  const counts = Array.from({ length: today - first + 1 }, () => 0)
  shippedAt.forEach((at) => {
    counts[Math.min(Math.floor(at / DAY), today) - first]++
  })
  return counts
}

/** For each target count, the P50 and P85 day (UTC midnight epoch ms) by which that many more issues ship. */
function simulate(samples: readonly number[], targets: readonly number[], today: number) {
  const random = mulberry32(SEED)
  const goal = Math.max(...targets)
  const trials = Array.from({ length: TRIALS }, () => {
    const progress: number[] = []
    // Cumulative issues shipped after each simulated day.
    while ((progress.at(-1) ?? 0) < goal && progress.length < HORIZON)
      progress.push((progress.at(-1) ?? 0) + (samples[Math.floor(random() * samples.length)] ?? 0))
    return progress
  })
  return targets.map((target) => {
    const days = trials
      .map((progress) => {
        const index = progress.findIndex((count) => count >= target)
        return index === -1 ? HORIZON : index + 1
      })
      .toSorted((a, b) => a - b)
    return {
      p50: (today + (days[Math.ceil(TRIALS * 0.5) - 1] ?? HORIZON)) * DAY,
      p85: (today + (days[Math.ceil(TRIALS * 0.85) - 1] ?? HORIZON)) * DAY,
    }
  })
}

function mulberry32(seed: number) {
  const state = { value: seed >>> 0 }
  return () => {
    state.value = (state.value + 0x6d2b79f5) >>> 0
    const a = Math.imul(state.value ^ (state.value >>> 15), state.value | 1)
    const b = a ^ (a + Math.imul(a ^ (a >>> 7), a | 61))
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296
  }
}
~~~~


## B06 — CI do tree e correlação por heurística

Vínculo: `body.md` §7; archive de evidência: `evidence.md`, seção `B06`.


### `packages/core/src/board/ci.ts`

Archive: `sources/packages/core/src/board/ci.ts` · bytes: 25362 · Git blob: `77bc3370fc8a34249a2baf19ee10c7e8151cdc6b` · SHA256: `7a67b182097690e957ec40cf04f753e2695047f7b2fa5f19b792d8db9e38c7dd`.

Papel da fonte: Contrato/defaults, índice timestamp, ledger por tree/comando, affected e run heurístico.


Linhas **137–226**; SHA256 do intervalo `03403023a375a2f3b3e8b53221db84ab349b66d61b32f200b6a393bd8855c404`:

~~~~typescript
  /** The contract read from the base branch: a change to it goes through a PR like any other change. */
  const contract = Effect.fnUntraced(function* (directory: string, project: ProjectRow) {
    const origin = yield* git(directory, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    const ref = origin.code === 0 ? origin.out : "HEAD"
    const shown = yield* git(directory, ["show", `${ref}:.orchestra/ci.json`])
    const base = origin.code === 0 ? origin.out.replace(/^origin\//, "") : (yield* git(directory, ["rev-parse", "--abbrev-ref", "HEAD"])).out
    if (shown.code !== 0) return yield* defaults(base, project)
    const decoded = decodeFile(shown.out)
    if (decoded._tag === "Failure")
      return yield* new RefusedError({
        message: `.orchestra/ci.json on ${ref} is invalid, so CI is not run: ${decoded.failure.message.split("\n")[0]}. Fix the file on the base branch.`,
      })
    const file = decoded.success
    return {
      base: file.base ?? base,
      scoped: { tests: file.scoped?.tests ?? null, workflows: file.scoped?.workflows ?? [] },
      full: { label: file.full?.label ?? null, checks: file.full?.checks ?? [], control: file.full?.control ?? null },
      bundle: {
        size: file.bundle?.size ?? 4,
        max: file.bundle?.max ?? 16,
        waitMinutes: file.bundle?.waitMinutes ?? 45,
        onBaseMoved: file.bundle?.onBaseMoved ?? "retest",
      },
      budget: { jobs: file.budget?.jobs ?? null },
      lanes: file.lanes
        ? {
            by: "turbo",
            global: file.lanes.global ?? [],
            fullEvery: file.lanes.fullEvery ?? 0,
            jobs: file.lanes.jobs ?? null,
            workflows: file.lanes.workflows ?? [],
          }
        : null,
      snapshots: { remote: file.snapshots?.remote ?? "origin" },
      merge: "merge",
      source: "file",
    } satisfies Contract
  })

  const defaults = Effect.fnUntraced(function* (base: string, project: ProjectRow) {
    const rules = project.github_repo ? yield* deps.gh(["api", `repos/${project.github_repo}/rules/branches/${base}`]) : undefined
    const required =
      rules?.exitCode === 0 &&
      Option.getOrElse(decodeRules(rules.stdout), () => []).some((rule) => rule.type === "required_status_checks")
    return {
      base,
      scoped: { tests: null, workflows: [] },
      full: { label: null, checks: [], control: null },
      bundle: { size: required ? 4 : 1, max: 16, waitMinutes: 45, onBaseMoved: "retest" },
      budget: { jobs: null },
      lanes: null,
      snapshots: { remote: "origin" },
      merge: "merge",
      source: required ? "required-checks" : "no-ci",
    } satisfies Contract
  })

  /** The tree of the worktree as it stands, from a temporary index so the worktree and its index stay untouched. */
  const snapshot = Effect.fnUntraced(function* (directory: string) {
    const index = yield* git(directory, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-check-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          // The copy keeps the index's mtime: git trusts an entry's stat only when it is older than the index file, so a
          // fresh mtime would hide an edit of the same size made in the same second as the last index write.
          yield* Effect.promise(() => fs.cp(index.out, env.GIT_INDEX_FILE, { preserveTimestamps: true }).catch(() => undefined))
          const added = yield* git(directory, ["add", "-A"], env)
          const tree = yield* git(directory, ["write-tree"], env)
          if (added.code !== 0 || tree.code !== 0)
            return yield* new RefusedError({ message: `Could not read the tree of ${directory}: ${added.err || tree.err}` })
          return tree.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  const cardWorktree = Effect.fnUntraced(function* (directory: string, issue: IssueRow, ref: string) {
    if (!issue.branch) return yield* new RefusedError({ message: `${ref} has no branch; link one with board_issue first.` })
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    const found = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    if (!found) return yield* new RefusedError({ message: `${ref}'s branch ${issue.branch} is checked out in no worktree of ${directory}.` })
    return found
  })
~~~~


Linhas **234–454**; SHA256 do intervalo `1b9e289e7e0d05df2170a1578a4524c3e9cfae7857290c21fb8fa44a1e39e2d7`:

~~~~typescript
  const runTests = Effect.fnUntraced(function* (input: {
    readonly issue: IssueRow
    readonly cwd: string
    readonly argv: ReadonlyArray<string>
    readonly tree: string
  }) {
    const startedAt = yield* Clock.currentTimeMillis
    const executable = which(input.argv[0] ?? "", deps.env ?? process.env) ?? input.argv[0] ?? ""
    const result = yield* deps.proc
      .run(ChildProcess.make(executable, input.argv.slice(1), { cwd: input.cwd, env: deps.env, extendEnv: true, stdin: "ignore" }), {
        combineOutput: true,
        maxOutputBytes: 16 * 1024 * 1024,
        timeout: "90 minutes",
      })
      .pipe(Effect.result)
    const output = result._tag === "Success" ? (result.success.output?.toString("utf8") ?? "") : ""
    const outcome: Board.CheckOutcome =
      result._tag === "Failure" ? "error" : result.success.exitCode === 0 ? "pass" : "fail"
    const commit = yield* git(input.cwd, ["rev-parse", "HEAD"])
    const row = {
      id: Board.CheckID.create(),
      issue_id: input.issue.id,
      attempt: input.issue.attempts,
      kind: "scoped" as const,
      command: input.argv.join(" "),
      tree_sha: input.tree,
      commit_sha: commit.code === 0 ? commit.out : null,
      outcome,
      url: output.match(RUN_URL)?.at(-1) ?? null,
      failing: result._tag === "Failure" ? [result.failure.message] : outcome === "fail" ? failing(output) : [],
      started_at: startedAt,
      ended_at: yield* Clock.currentTimeMillis,
    }
    yield* insert(row)
    return row
  })

  // The workspace packages a card's tree changes against base, by turbo's affected set: the root `//` alone is no
  // package, and a file the lanes call global counts as one. Undefined when turbo cannot tell.
  const packages = Effect.fnUntraced(function* (cwd: string, tree: string, terms: Contract) {
    const base = yield* git(cwd, ["merge-base", "HEAD", `origin/${terms.base}`])
    const from = base.code === 0 ? base.out : (yield* git(cwd, ["merge-base", "HEAD", terms.base])).out
    // turbo compares commits, so the tree, which may hold uncommitted edits, gets a commit of its own that no ref keeps.
    const to = (yield* git(cwd, [...AUTHOR, "commit-tree", tree, "-p", "HEAD", "-m", "ci_run tree"])).out
    if (!from || !to) return undefined
    const files = (yield* git(cwd, ["diff", "--name-only", from, to])).out.split("\n").filter(Boolean)
    if (terms.lanes && global(files, terms.lanes.global)) return ["the whole repository"]
    return (yield* affected(deps, cwd, from, to))?.filter((name) => name !== "//")
  })

  /** Dispatches each workflow once per pushed tree, and settles pending dispatches from `gh run list`. */
  const workflows = Effect.fnUntraced(function* (input: {
    readonly project: ProjectRow
    readonly issue: IssueRow
    readonly files: ReadonlyArray<string>
    readonly dispatch: boolean
    readonly notes: string[]
  }) {
    if (input.files.length === 0) return
    const repo = input.project.github_repo
    if (!repo || !input.issue.branch) {
      input.notes.push("The contract's workflows need a GitHub repository and a branch; none was dispatched.")
      return
    }
    const known = yield* rows(input.issue.id)
    yield* Effect.forEach(
      known.filter((row) => row.kind === "workflow" && row.outcome === "pending"),
      (row) => settle(repo, input.issue.branch ?? "", row),
    )
    if (!input.dispatch) return
    const head = yield* deps.gh(["api", `repos/${repo}/branches/${input.issue.branch}`])
    const branch = head.exitCode === 0 ? Option.getOrUndefined(decodeBranch(head.stdout)) : undefined
    if (!branch) {
      input.notes.push(`${input.issue.branch} is not pushed, so the contract's workflows wait for the push.`)
      return
    }
    const tree = branch.commit.commit.tree.sha
    const fresh = input.files.filter(
      (file) => !known.some((row) => row.kind === "workflow" && row.command === file && row.tree_sha === tree && row.outcome !== "error"),
    )
    yield* Effect.forEach(fresh, (file) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const sent = yield* deps.gh(["workflow", "run", file, "--ref", input.issue.branch ?? "", "-R", repo])
        yield* insert({
          id: Board.CheckID.create(),
          issue_id: input.issue.id,
          attempt: input.issue.attempts,
          kind: "workflow",
          command: file,
          tree_sha: tree,
          commit_sha: branch.commit.sha,
          outcome: sent.exitCode === 0 ? "pending" : "error",
          url: null,
          failing: sent.exitCode === 0 ? [] : [sent.stderr.trim() || `gh workflow run ${file} failed`],
          started_at: startedAt,
          ended_at: sent.exitCode === 0 ? null : startedAt,
        })
      }),
    )
  })

  const settle = Effect.fnUntraced(function* (repo: string, branch: string, row: typeof BoardCheckTable.$inferSelect) {
    const listed = yield* deps.gh([
      "run", "list", "-R", repo, "--workflow", row.command, "--branch", branch, "--event", "workflow_dispatch",
      "--json", "headSha,status,conclusion,url,createdAt", "--limit", "20",
    ])
    // A dispatch returns no run id: the run is the newest one on the dispatched commit created after the dispatch.
    const run = Option.getOrElse(decodeRuns(listed.stdout), () => []).find(
      (item) => item.headSha === row.commit_sha && Date.parse(item.createdAt) >= row.started_at - 60_000,
    )
    if (!run) return
    if (run.status !== "completed") {
      if (row.url !== run.url) yield* deps.quiet((tx) => tx.update(BoardCheckTable).set({ url: run.url }).where(eq(BoardCheckTable.id, row.id)).run())
      return
    }
    const outcome: Board.CheckOutcome =
      run.conclusion === "success" ? "pass" : run.conclusion === "failure" || run.conclusion === "timed_out" ? "fail" : "error"
    yield* deps.quiet((tx) =>
      tx
        .update(BoardCheckTable)
        .set({ outcome, url: run.url, failing: outcome === "pass" ? [] : [row.command], ended_at: Date.now() })
        .where(and(eq(BoardCheckTable.id, row.id), eq(BoardCheckTable.outcome, "pending")))
        .run(),
    )
  })

  return {
    contract,
    snapshot,
    run: Effect.fnUntraced(function* (input: Board.CiRunInput) {
      const found = yield* deps.quiet((tx) =>
        Effect.gen(function* () {
          const project = yield* loadProject(tx, input.project)
          const issue = yield* loadIssue(tx, project, input.issue)
          return { project, issue, directory: yield* worktree(tx, project) }
        }),
      )
      const ref = `${found.project.key}-${found.issue.number}`
      if (!found.directory) return yield* new RefusedError({ message: `${found.project.key} has no repo; set one with board_project.` })
      const terms = yield* contract(found.directory, found.project)
      const cwd = yield* cardWorktree(found.directory, found.issue, ref)
      const tree = yield* snapshot(cwd)
      const notes: string[] = []
      const dispatch = input.run !== false

      if (terms.scoped.tests === null)
        notes.push(
          terms.source === "required-checks"
            ? "No .orchestra/ci.json: the scoped gate is the PR's own checks."
            : terms.source === "no-ci"
              ? "No .orchestra/ci.json and no required checks: the scoped gate is land's verification only."
              : "The contract has no scoped.tests command.",
        )
      // A contract that tests per package and a card that changes none, such as a docs-only card: nothing is there to
      // test, so the ledger records an explicit `none` check instead of refusing or running the whole suite.
      const bare = terms.scoped.tests?.includes("{package}") === true && !input.package
      if (bare) {
        const touched = yield* packages(cwd, tree, terms)
        if (touched === undefined)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}, and turbo could not tell which packages it changes.` })
        if (touched.length > 0)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}: it changes ${touched.join(", ")}.` })
        notes.push(`${ref} changes no workspace package, so there is nothing to test: the scoped tests record \`${UNTOUCHED}\`.`)
        const done = (yield* rows(found.issue.id)).some((row) => row.kind === "scoped" && row.tree_sha === tree && row.command === UNTOUCHED)
        if (dispatch && !done) {
          const now = yield* Clock.currentTimeMillis
          yield* insert({
            id: Board.CheckID.create(),
            issue_id: found.issue.id,
            attempt: found.issue.attempts,
            kind: "scoped",
            command: UNTOUCHED,
            tree_sha: tree,
            commit_sha: null,
            outcome: "pass",
            url: null,
            failing: [],
            started_at: now,
            ended_at: now,
          })
        }
      }
      if (terms.scoped.tests !== null && !bare) {
        const argv = yield* command(terms.scoped.tests, input, ref)
        const done = (yield* rows(found.issue.id)).some(
          (row) => row.kind === "scoped" && row.tree_sha === tree && row.command === argv.join(" ") && row.outcome !== "error",
        )
        if (dispatch && !done) yield* runTests({ issue: found.issue, cwd, argv, tree })
      }
      yield* workflows({ project: found.project, issue: found.issue, files: terms.scoped.workflows, dispatch, notes })

      const checks = (yield* rows(found.issue.id)).filter((row) => row.tree_sha === tree).sort((a, b) => a.started_at - b.started_at)
      return {
        tree,
        state: state(checks, terms),
        checks: checks.map(toCheck),
        notes,
      } satisfies Board.CiRunResult
    }),
  }
}

export type Interface = ReturnType<typeof make>
export type Error = NotFoundError | RefusedError

/**
 * `scoped-red` when the latest result of any check on the tree failed; `scoped-green` when the contract requires
 * something and every required check passed on the tree. Rows must all be on the one tree.
 */
export function state(
  rows: ReadonlyArray<typeof BoardCheckTable.$inferSelect>,
  terms: Pick<Contract, "scoped">,
): Board.ScopedState {
  const latest = [...new Map(rows.toSorted((a, b) => a.started_at - b.started_at).map((row) => [`${row.kind}:${row.command}`, row])).values()]
  if (latest.some((row) => row.outcome === "fail")) return "scoped-red"
  if (terms.scoped.tests === null && terms.scoped.workflows.length === 0) return null
  const tests = terms.scoped.tests === null || latest.some((row) => row.kind === "scoped" && row.outcome === "pass")
  const flows = terms.scoped.workflows.every((file) => latest.some((row) => row.kind === "workflow" && row.command === file && row.outcome === "pass"))
  return tests && flows ? "scoped-green" : null
}
~~~~


Linhas **456–504**; SHA256 do intervalo `5319a9e607f4d0a8efa96c8b38e8f9d8be644711969a66a2ed7791a5b4602db2`:

~~~~typescript
// Split on whitespace with no shell: `{files}` becomes one argument per file and `{package}` is filled in place.
export function command(template: string, input: { readonly package?: string; readonly files?: ReadonlyArray<string> }, ref: string) {
  if (template.includes("{package}") && !input.package)
    return Effect.fail(new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}.` }))
  return Effect.succeed(
    template
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((token) => (token === "{files}" ? [...(input.files ?? [])] : [token.replaceAll("{package}", input.package ?? "")])),
  )
}

// Bun prints each test file as a header line and `(fail)` under it; vitest prints `FAIL |project| <file> > <test>`; tsc and
// tsgo print each type error with its file path; test:ci prints a failed job as `=== name: failure ===`. Colors are stripped.
export function failing(colored: string) {
  const output = colored.replace(/\x1b\[[0-9;]*m/g, "")
  const bun = output
    .split("\n")
    .reduce(
      (acc, line) => {
        const header = line.trim().match(/^(\S+\.test\.[cm]?[jt]sx?):$/)
        if (header) return { file: header[1], found: acc.found }
        if (line.includes("(fail)") && acc.file) return { file: acc.file, found: acc.found.add(acc.file) }
        return acc
      },
      { file: undefined as string | undefined, found: new Set<string>() },
    ).found
  const types = output.split("\n").flatMap((line) => line.trim().match(/^(\S+\.[cm]?tsx?)(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+/)?.[1] ?? [])
  const vitest = output.split("\n").flatMap((line) => line.trim().match(/^FAIL\s+(?:\|[^|]+\|\s+)?(\S+\.[cm]?[jt]sx?)\b/)?.[1] ?? [])
  const files = [...new Set([...bun, ...vitest, ...types])]
  if (files.length > 0) return files
  return [...output.matchAll(/^=== (.+): failure ===$/gm)].map((match) => match[1] ?? "").filter(Boolean)
}

// A turbo run prints each package's output between `##[group]<package>:test` and `##[endgroup]`; the bun test files
// that failed inside a group belong to that package. Windows paths come back with forward slashes.
export function packaged(colored: string) {
  return colored
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split(/^##\[group\]/m)
    .slice(1)
    .flatMap((section) => {
      const name = section.match(/^(\S+):test\r?$/m)?.[1]
      const files = failing(section.split(/^##\[endgroup\]/m)[0] ?? "")
        .filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))
        .map((file) => file.replaceAll("\\", "/"))
      return name && files.length > 0 ? [{ package: name, files }] : []
    })
}
~~~~


## B07 — Admissão na fila e head exato

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B07`.


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.

Papel da fonte: Review/PR/record/dependencies/scoped-green antes de enfileirar, recheck TX e dequeue.


Linhas **75–188**; SHA256 do intervalo `9c8f13e7e18a62d2d23088590d4b4cfcf78884dcc7fb3d2b9302c30ab860a1b6`:

~~~~typescript
  const enqueue = Effect.fnUntraced(function* (input: Board.QueueInput) {
    const ref = `${input.project}-${input.number}`
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        const attempt = yield* tx
          .select()
          .from(BoardAttemptTable)
          .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
          .orderBy(desc(BoardAttemptTable.n))
          .get()
        const waits = yield* tx
          .select({ number: BoardIssueTable.number, stage: BoardIssueTable.stage })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue.id))
          .all()
        return { project, issue, attempt, waits, directory: yield* worktree(tx, project) }
      }).pipe(Effect.result),
    )
    if (found._tag === "Failure") return yield* found.failure
    const { project, issue } = found.success
    if (issue.stage !== "review") return yield* new RefusedError({ message: `${ref} is in ${issue.stage}; only a Review card is queued.` })
    if (!issue.pr_number) return yield* new RefusedError({ message: `${ref} has no PR to queue.` })
    if (!project.github_repo || !found.success.directory)
      return yield* new RefusedError({ message: `${input.project} needs a linked repository and its GitHub repo before cards queue.` })
    if (issue.paused) return yield* new RefusedError({ message: `${ref} is paused.` })
    if (found.success.attempt?.conflict_base)
      return yield* new RefusedError({
        message: `${ref} conflicts with base in ${(found.success.attempt.conflict_files ?? []).join(", ")}; merge base in its worktree first.`,
      })
    const waiting = found.success.waits.filter((dep) => dep.stage !== "shipped" && dep.stage !== "queue")
    if (waiting.length > 0)
      return yield* new RefusedError({
        message: `${ref} depends on ${waiting.map((dep) => `${input.project}-${dep.number}`).join(", ")}, which is neither shipped nor queued.`,
      })
    const missing = incomplete(issue.record)
    if (missing.length > 0)
      return yield* new RefusedError({ message: `${ref}'s PR record has no ${missing.join(", ")}; write it with board_issue first.` })
    const follow = issue.record?.follow_ups ?? []
    if (follow.length > 0) {
      const known = yield* deps.quiet((tx) =>
        tx.select({ number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all(),
      )
      const unknown = follow.filter((key) => !known.some((row) => key === `${input.project}-${row.number}`))
      if (unknown.length > 0)
        return yield* new RefusedError({ message: `${ref}'s follow-ups ${unknown.join(", ")} are not cards on ${input.project}.` })
    }
    const directory = found.success.directory
    const contract = yield* deps.contract(directory, project).pipe(Effect.mapError((error) => new RefusedError({ message: error.message })))
    const pr = yield* head(directory, project.github_repo, issue.pr_number)
    const checks = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardCheckTable)
        .where(and(eq(BoardCheckTable.issue_id, issue.id), eq(BoardCheckTable.tree_sha, pr.tree)))
        .all(),
    )
    const state = BoardCi.state(checks, contract)
    if (state === "scoped-red") return yield* new RefusedError({ message: `${ref} is scoped-red on its PR head; fix it before queueing.` })
    const required = contract.scoped.tests !== null || contract.scoped.workflows.length > 0
    if (required && state !== "scoped-green")
      return yield* new RefusedError({
        message: `${ref} is not scoped-green on its PR head ${pr.sha.slice(0, 10)}; run ci_run on that tree first.`,
      })
    const now = yield* Clock.currentTimeMillis
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const current = yield* loadIssue(tx, project, input.number)
        if (current.stage !== "review" || current.pr_number !== issue.pr_number)
          return yield* new RefusedError({ message: `${ref} changed while it was being checked; try again.` })
        yield* tx
          .insert(BoardQueueTable)
          .values({ issue_id: issue.id, project_id: project.id, head_sha: pr.sha, urgent: input.urgent ?? false, flush: input.flush ?? false, queued_at: now })
          .run()
        const moved = yield* place(tx, project, current, "queue")
        const activity = yield* log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "maestro",
          action: "queue.add",
          reason: input.reason,
          before: moved.before,
          after: { ...moved.after, head: pr.sha, urgent: input.urgent ?? false },
        })
        return changed(project.id, activity, issue.id)
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success)
    yield* drift(deps, project, issue, directory, contract.base, pr.sha)
    yield* describe(project, issue.id, contract.base)
    return { head: pr.sha, tree: pr.tree, state }
  })

  const dequeue = Effect.fnUntraced(function* (input: Board.DequeueInput) {
    const ref = `${input.project}-${input.number}`
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        if (issue.stage !== "queue") return yield* new RefusedError({ message: `${ref} is not queued.` })
        const open = yield* openBundles(tx, project.id)
        const members = yield* Effect.forEach(open, (bundle) => isMember(tx, bundle.id, issue.id))
        const back = yield* release(tx, project, issue, "maestro", "queue.remove", input.reason)
        return { project, back, bundle: open.find((_, index) => members[index]) }
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success.back)
    if (done.success.bundle) yield* dissolve(done.success.project, done.success.bundle, `${ref} left the queue.`)
    return { dissolved: done.success.bundle?.n ?? null }
  })
~~~~


Linhas **716–723**; SHA256 do intervalo `4a116cb7d5db34a686e0d66f22b2293214e90d1004de2f866428df843a6a64c3`:

~~~~typescript
export function incomplete(record: Board.PrRecord | null) {
  const blank = (text: string | undefined) => !text?.trim()
  return [
    ...(blank(record?.intent) ? ["Intent"] : []),
    ...(blank(record?.decisions) ? ["Decisions"] : []),
    ...(blank(record?.not_covered) ? ["Not covered"] : []),
    ...(record?.risk?.level ? [] : ["Risk level"]),
  ]
~~~~


### `packages/core/src/board/queue-record.ts`

Archive: `sources/packages/core/src/board/queue-record.ts` · bytes: 15266 · Git blob: `7ade81c640d6524360161d2c018ba1038c471f2e` · SHA256: `1414c1df2d7b08fc0027fe108275d4b07e343a56a56ded5f2119f196101f92d4`.

Papel da fonte: Fetch do head nativo, movido volta Review e caminho de record PR.


Linhas **47–85**; SHA256 do intervalo `de8fa9eba9fb8854611f04020233b22bd519df1571a8bfb4dce9716daf284440`:

~~~~typescript
  const head = Effect.fnUntraced(function* (directory: string, repo: string, pr: number) {
    const pulled = yield* deps.gh(["api", `repos/${repo}/pulls/${pr}`])
    const pull = pulled.exitCode === 0 ? Option.getOrUndefined(decodePull(pulled.stdout)) : undefined
    if (!pull) return yield* new RefusedError({ message: `PR #${pr} could not be read: ${pulled.stderr.trim() || "no head"}.` })
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", pull.head.ref])
    const fetched = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `${pull.head.sha}^{commit}`])).out
    if (fetched !== pull.head.sha)
      return yield* new RefusedError({ message: `PR #${pr}'s head ${pull.head.sha.slice(0, 10)} is not on origin/${pull.head.ref}.` })
    return {
      sha: pull.head.sha,
      tree: (yield* git(directory, ["rev-parse", `${pull.head.sha}^{tree}`])).out,
      labels: (pull.labels ?? []).map((label) => label.name),
    }
  })

  /** A queued card whose PR head moved since it queued goes back to Review: its new head is not verified. */
  const moved = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, sha: string | undefined) {
    const back = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const why = `The PR head moved${sha ? ` to ${sha.slice(0, 10)}` : ""} after it queued; verify it and queue it again.`
        yield* insertNote(tx, row, issue, why)
        return yield* release(tx, row, issue, "github", "queue.remove", why)
      }),
    )
    yield* deps.publish(back)
  })

  const note = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, body: string) {
    const done = yield* deps.quiet((tx) => insertNote(tx, row, issue, body))
    yield* deps.publish(done)
  })

  /** Rewrites the card's PR body through the record port; unbound, the body stays as the seat wrote it. */
  const describe = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    if (!deps.record || !row.github_repo) return
    const found = yield* recordOf(row, issue, base)
    if (!found?.pr) return
    yield* deps.gh(["pr", "edit", String(found.pr), "--repo", row.github_repo, "--body-file", "-"], deps.record.pr(found.record))
  })
~~~~


## B08 — Corte, lanes e full gate

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B08`.


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.

Papel da fonte: Busy local, cut por tamanho/espera/epic/fix, filtros, bundle merge/PR/workflow e adaptação.


Linhas **271–466**; SHA256 do intervalo `e606e20b5c79682bad9e33f6dbf5ecbef1be12aa97861daaae07c4f8985ba1dd`:

~~~~typescript
  // Projects settle concurrently, and a project still settling (a scoped run can take minutes) is skipped, never run twice.
  const busy = new Set<string>()

  /** One pass over every active project: settle the open bundles, then cut. The poll runs it every minute. */
  const tick = Effect.fnUntraced(function* () {
    const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
    yield* Effect.forEach(
      rows,
      (row) =>
        Effect.gen(function* () {
          if (busy.has(row.id)) return
          busy.add(row.id)
          yield* project(row).pipe(Effect.ignore, Effect.ensuring(Effect.sync(() => busy.delete(row.id))))
        }),
      { concurrency: 2, discard: true },
    )
  })

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory || !row.github_repo) return
    const repo = row.github_repo
    const contract = yield* deps.contract(directory, row)
    const open = yield* deps.quiet((tx) => openBundles(tx, row.id))
    yield* Effect.forEach(open, (bundle) => settle(row, repo, directory, contract, bundle), { discard: true })
    if (contract.lanes) return yield* spread(row, repo, directory, contract, contract.lanes)
    if (open.length > 0) return
    yield* cut(row, repo, directory, contract)
  })

  /**
   * Section 7.2: the queued cards that may go, grouped into lanes, each cut into its own bundle beside the bundles in
   * flight. Affected sets are recomputed against the current tip at every cut. A repository with no workspace graph,
   * a paused or flaky bundle, and a red base with no failing tests keep the whole project on phase 1's single conveyor.
   * Section 7.3: a closed epic is cut as one global lane, so the epic bundle runs the whole suite; every `fullEvery`
   * lane landings a safety run tests the whole suite on base; and a base red with failing tests F pauses only the lanes
   * that touch F's packages while its fix card rides alone.
   */
  const spread = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    config: NonNullable<BoardCi.Contract["lanes"]>,
  ) {
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const open = yield* openBundles(tx, row.id)
        const members = open.length
          ? yield* tx
              .select({ issue: BoardBundleMemberTable.issue_id })
              .from(BoardBundleMemberTable)
              .where(inArray(BoardBundleMemberTable.bundle_id, open.map((bundle) => bundle.id)))
              .all()
          : []
        const stopped = yield* tx
          .select({ id: BoardBundleTable.id })
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), inArray(BoardBundleTable.status, ["paused", "flaky"])))
          .get()
        const closed = yield* tx
          .select()
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), notInArray(BoardBundleTable.status, ["open", "accepted", "probe-green"])))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const cards = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .all()
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
              .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
              .where(inArray(BoardDependencyTable.issue_id, ids))
              .all()
          : []
        const attempts = ids.length
          ? yield* tx
              .select()
              .from(BoardAttemptTable)
              .where(and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome)))
              .all()
          : []
        const epics = [...new Set(cards.map((card) => card.issue.epic_id).filter((id) => id !== null))]
        const epicOpen = epics.length
          ? yield* tx
              .select({ epic: BoardIssueTable.epic_id, stage: BoardIssueTable.stage })
              .from(BoardIssueTable)
              .where(and(inArray(BoardIssueTable.epic_id, epics), notInArray(BoardIssueTable.stage, ["shipped", "cut"])))
              .all()
          : []
        // The base red still open: the latest bundle whose fix card has neither shipped nor been cut.
        const active = yield* tx
          .select({ failing: BoardBundleTable.failing, fix_issue_id: BoardBundleTable.fix_issue_id })
          .from(BoardBundleTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleTable.fix_issue_id))
          .where(and(eq(BoardBundleTable.project_id, row.id), isNotNull(BoardBundleTable.failing), notInArray(BoardIssueTable.stage, ["shipped", "cut"])))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        // Landings are counted from the bundle rows: a bundle with no first member is a base probe or a safety run.
        const history =
          config.fullEvery > 0
            ? yield* tx
                .select({ status: BoardBundleTable.status, packages: BoardBundleTable.packages, member: BoardBundleMemberTable.issue_id })
                .from(BoardBundleTable)
                .leftJoin(
                  BoardBundleMemberTable,
                  and(eq(BoardBundleMemberTable.bundle_id, BoardBundleTable.id), eq(BoardBundleMemberTable.position, 0)),
                )
                .where(eq(BoardBundleTable.project_id, row.id))
                .orderBy(desc(BoardBundleTable.n))
                .all()
            : []
        return {
          open,
          stopped: stopped !== undefined,
          baseRed: closed?.status === "base-red" && closed.base_sha === tip && !closed.failing,
          cards: cards.filter((card) => !members.some((member) => member.issue === card.issue.id)),
          waits,
          attempts,
          epicOpen,
          red: active?.failing && active.fix_issue_id ? { failing: active.failing, fix_issue_id: active.fix_issue_id } : undefined,
          history,
        }
      }),
    )
    if (found.stopped) return
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (!graph || found.baseRed) {
      if (found.open.length > 0) return
      return yield* cut(row, repo, directory, contract)
    }
    const cards = yield* Effect.forEach(found.cards, (card) =>
      Effect.gen(function* () {
        const bundleable =
          card.queue.hold !== "held" &&
          !card.issue.hold_before_merge &&
          !card.issue.paused &&
          !found.attempts.some((item) => item.issue_id === card.issue.id && item.conflict_base) &&
          found.waits.filter((dep) => dep.issue === card.issue.id).every((dep) => dep.stage === "shipped")
        const shape = { id: card.issue.id, bundleable, urgent: card.queue.urgent, order: card.issue.order, queuedAt: card.queue.queued_at }
        if (!bundleable) return { ...shape, affected: [] }
        // Section 6.1 rule c: the bundle that closes an epic runs the whole suite, whatever its cards touch.
        const closing = card.issue.epic_id !== null && found.epicOpen.filter((item) => item.epic === card.issue.epic_id).every((item) => item.stage === "queue")
        if (closing) return { ...shape, affected: null }
        // The queued head is fetched only when this clone lacks it; a head that moved goes back to Review, as in `cut`.
        const present = (yield* git(directory, ["cat-file", "-e", `${card.queue.head_sha}^{commit}`])).code === 0
        const current = present ? undefined : yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        if (!present && current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          return undefined
        }
        const files = (yield* git(directory, ["diff", "--name-only", `${tip}...${card.queue.head_sha}`])).out.split("\n").filter(Boolean)
        if (global(files, config.global)) return { ...shape, affected: null }
        return { ...shape, affected: (yield* affected(deps, directory, tip, card.queue.head_sha)) ?? null }
      }),
    )
    // Section 7.3: the whole suite runs on base after every `fullEvery` lane landings since it last ran (0 is off).
    const since = found.history.findIndex((bundle) =>
      bundle.member === null ? bundle.status !== "open" && bundle.status !== "dissolved" : bundle.status === "merged" && bundle.packages === null,
    )
    const landings = found.history
      .slice(0, since === -1 ? undefined : since)
      .filter((bundle) => bundle.member !== null && bundle.status === "merged" && bundle.packages !== null).length
    const safety = config.fullEvery > 0 && landings >= config.fullEvery && !found.history.some((bundle) => bundle.member === null && bundle.status === "open")
    if (safety)
      yield* probe(
        row,
        repo,
        directory,
        contract,
        tip,
        `Safety run: ${landings} lane bundles landed since ${contract.base} last ran the whole suite; this runs it on ${contract.base} at ${tip.slice(0, 10)}.`,
        [],
      )
    const shaped = cards.filter((card) => card !== undefined)
    const broken = found.red
    // The fix card rides alone in its own lane; F's packages count as in flight, so overlapping lanes wait behind it.
    const fix = broken ? shaped.find((card) => card.id === broken.fix_issue_id && card.bundleable) : undefined
    const room = capacity(contract.budget.jobs, config.jobs) - found.open.length - (safety ? 1 : 0) - (fix ? 1 : 0)
    if (fix) yield* cut(row, repo, directory, contract, { ids: [fix.id], packages: fix.affected }, broken)
    const going = lanes(
      shaped.filter((card) => card.id !== broken?.fix_issue_id),
      [...found.open.map((bundle) => bundle.packages), ...(broken ? [broken.failing.map((group) => group.package)] : [])],
      room,
    )
    yield* Effect.forEach(going, (lane) => cut(row, repo, directory, contract, lane), { discard: true })
  })
~~~~


Linhas **472–708**; SHA256 do intervalo `d834ac18b754d834e4fdb125e2111c2e425b86561b007c6329b41c780dadfffc`:

~~~~typescript
  const cut = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    lane?: Lane<Board.IssueID>,
    broken?: Pick<typeof BoardBundleTable.$inferSelect, "failing" | "fix_issue_id">,
  ) {
    const now = yield* Clock.currentTimeMillis
    const queued = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const all = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .orderBy(desc(BoardQueueTable.urgent), asc(BoardQueueTable.queued_at))
          .all()
        const cards = lane
          ? lane.ids.flatMap((id) => all.filter((card) => card.issue.id === id))
          : all
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, on: BoardDependencyTable.depends_on_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
              .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
              .where(inArray(BoardDependencyTable.issue_id, ids))
              .all()
          : []
        const attempts = ids.length
          ? yield* tx
              .select()
              .from(BoardAttemptTable)
              .where(and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome)))
              .all()
          : []
        const epics = [...new Set(cards.map((card) => card.issue.epic_id).filter((id) => id !== null))]
        const open = epics.length
          ? yield* tx
              .select({ epic: BoardIssueTable.epic_id, stage: BoardIssueTable.stage })
              .from(BoardIssueTable)
              .where(and(inArray(BoardIssueTable.epic_id, epics), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
              .all()
          : []
        // A green base probe only clears base: the red bundle it was probing for still decides the next cut. A lane's last
        // bundles are the closed ones that share a card with it, so a red in one lane splits only that lane.
        const closed = lane
          ? (yield* tx
              .select({ bundle: BoardBundleTable })
              .from(BoardBundleTable)
              .innerJoin(BoardBundleMemberTable, eq(BoardBundleMemberTable.bundle_id, BoardBundleTable.id))
              .where(
                and(
                  eq(BoardBundleTable.project_id, row.id),
                  notInArray(BoardBundleTable.status, ["open", "accepted"]),
                  inArray(BoardBundleMemberTable.issue_id, lane.ids),
                ),
              )
              .orderBy(desc(BoardBundleTable.n))
              .all())
              .map((item) => item.bundle)
              .filter((bundle, index, list) => list.findIndex((other) => other.id === bundle.id) === index)
              .slice(0, 2)
          : yield* tx
              .select()
              .from(BoardBundleTable)
              .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open")))
              .orderBy(desc(BoardBundleTable.n))
              .limit(2)
              .all()
        const last = closed[0]?.status === "probe-green" ? closed[1] : closed[0]
        const lastMembers = last
          ? yield* tx.select().from(BoardBundleMemberTable).where(eq(BoardBundleMemberTable.bundle_id, last.id)).all()
          : []
        return { cards, waits, attempts, open, settled: yield* BoardLedger.settled(tx, row.id), last: last && { status: last.status, base_sha: last.base_sha, members: lastMembers.length, rebuilds: last.rebuilds, fix: last.fix_issue_id, failing: last.failing } }
      }),
    )
    if (queued.cards.length === 0) return
    if (queued.last?.status === "paused" || queued.last?.status === "flaky") return
    const full = size(queued.settled, contract.bundle)
    const alone = queued.cards.find((card) => card.queue.hold === "alone")
    const split = (queued.last?.status === "red" && queued.last.members > 1) || queued.last?.status === "probing"
    const cap = alone ? 1 : split && queued.last ? Math.max(1, Math.floor(queued.last.members / 2)) : full
    const due =
      alone !== undefined ||
      broken !== undefined ||
      queued.last?.status === "base-red" ||
      split ||
      queued.cards.length >= full ||
      queued.cards.some((card) => card.queue.flush) ||
      now - Math.min(...queued.cards.map((card) => card.queue.queued_at)) >= contract.bundle.waitMinutes * 60_000 ||
      queued.cards.some(
        (card) => card.issue.epic_id !== null && queued.open.filter((item) => item.epic === card.issue.epic_id).every((item) => item.stage === "queue"),
      )
    if (!due) return
    const base = contract.base
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!tip) return
    // Section 6.8 phase 1: while base stays red, only its fix card is cut, alone. With lanes, `spread` hands the fix card in.
    const fixing = lane
      ? broken
      : queued.last?.status === "base-red" && tip === queued.last.base_sha
        ? { failing: queued.last.failing, fix_issue_id: queued.last.fix }
        : undefined
    const fix = fixing ? queued.cards.find((card) => card.issue.id === fixing.fix_issue_id) : undefined
    if (fixing && !fix) return
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bundle-${row.key}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, tip])
    if (added.code !== 0) return
    const ejections: Array<{ readonly card: string; readonly cause: string }> = []
    const members = yield* Effect.gen(function* () {
      const taken: Array<{ readonly issue: IssueRow; readonly head: string; readonly labels: ReadonlyArray<string> }> = []
      for (const card of fix ? [fix] : alone ? [alone] : queued.cards) {
        if (taken.length >= cap) break
        if (card.queue.hold === "held") continue
        if (card.issue.hold_before_merge || card.issue.paused) continue
        const attempt = queued.attempts.find((item) => item.issue_id === card.issue.id)
        if (attempt?.conflict_base) continue
        const ready = queued.waits
          .filter((dep) => dep.issue === card.issue.id)
          .every((dep) => dep.stage === "shipped" || taken.some((item) => item.issue.id === dep.on))
        if (!ready) continue
        const current = yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        const key = `${row.key}-${card.issue.number}`
        if (current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          ejections.push({ card: key, cause: "head moved after it queued" })
          continue
        }
        const message = [
          `Merge ${key}: ${card.issue.title}`,
          ...(deps.record ? ["", deps.record.trailer({ WP: key, Attempt: `a${attempt?.n ?? 0}` })] : []),
        ].join("\n")
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", message, card.queue.head_sha])
        if (merged.code === 0) {
          taken.push({ issue: card.issue, head: card.queue.head_sha, labels: current.labels })
          continue
        }
        const files = (yield* git(scratch, ["diff", "--name-only", "--diff-filter=U"])).out.split("\n").filter(Boolean)
        yield* git(scratch, ["merge", "--abort"])
        ejections.push({ card: key, cause: "conflicts with the bundle" })
        yield* note(row, card.issue, `conflicts-with-queue: merging onto the bundle so far conflicts in ${files.join(", ") || "its changes"}; it stays queued.`)
      }
      return taken
    })
    const n = yield* deps.quiet((tx) => nextBundle(tx, row.id))
    if (members.length > 0) yield* recordBundle(row, scratch, members.map((member) => member.issue), `${row.key}-B${n}`)
    const bundleHead = (yield* git(scratch, ["rev-parse", "HEAD"])).out
    const tree = (yield* git(scratch, ["rev-parse", "HEAD^{tree}"])).out
    yield* git(directory, ["worktree", "remove", "--force", scratch])
    if (members.length === 0) return
    const branch = `bundle-${row.key}-${n}`
    const lanePackages = lane?.packages && dispatched({ packages: lane.packages }, contract) ? lane.packages : null
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${bundleHead}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const records = deps.record
      ? (yield* Effect.forEach(members, (member) => recordOf(row, member.issue.id, base))).filter((item) => item !== undefined)
      : []
    const body = deps.record
      ? deps.record.bundle({ members: records, testedOn: tip, skew: 0, ciRuns: 0, ciMinutes: 0, ejections })
      : `Bundle ${row.key}-B${n}, assembled by Orchestra's merge queue: ${members.map((member) => `${row.key}-${member.issue.number}`).join(", ")}.`
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        base,
        "--head",
        branch,
        "--title",
        `chore(queue): bundle ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label && !lanePackages ? ["--label", contract.full.label] : []),
        // A guard approval a member carries covers its change in the bundle too; the bundle PR is what the guard reads.
        ...[...new Set(members.flatMap((member) => member.labels))]
          .filter((label) => label === "guardrail-approved" || label.startsWith("guardrail-approved:"))
          .flatMap((label) => ["--label", label]),
      ],
      body,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    // Section 7.2: a lane's full gate runs only its packages, dispatched by hand: a label would start the whole suite.
    if (lanePackages)
      yield* Effect.forEach(
        contract.lanes?.workflows ?? [],
        (workflow) => deps.gh(["workflow", "run", workflow, "--repo", repo, "--ref", branch, "-f", `packages=${lanePackages.join(",")}`]),
        { discard: true },
      )
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const id = Board.BundleID.create()
        yield* tx
          .insert(BoardBundleTable)
          .values({
            id,
            project_id: row.id,
            n,
            branch,
            pr_number: number,
            base_sha: tip,
            head_sha: bundleHead,
            tree_sha: tree,
            status: "open",
            rebuilds: queued.last?.status === "isolated" ? queued.last.rebuilds + 1 : 0,
            failing: fix ? fixing?.failing ?? null : null,
            fix_issue_id: fix ? fix.issue.id : null,
            packages: lane?.packages ?? null,
          })
          .run()
        yield* tx
          .insert(BoardBundleMemberTable)
          .values(members.map((member, position) => ({ bundle_id: id, issue_id: member.issue.id, head_sha: member.head, position })))
          .run()
        yield* tx
          .update(BoardQueueTable)
          .set({ flush: false, hold: null })
          .where(inArray(BoardQueueTable.issue_id, members.map((member) => member.issue.id)))
          .run()
        return yield* Effect.forEach(members, (member) =>
          log(tx, {
            project: row.id,
            issue: member.issue.id,
            actor: "github",
            action: "bundle.cut",
            after: { bundle: n, pr: number, base: tip, head: bundleHead },
          }).pipe(Effect.map((activity) => changed(row.id, activity, member.issue.id))),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    yield* Effect.forEach(members, (member) => describe(row, member.issue.id, base), { discard: true })
  })
~~~~


Linhas **727–733**; SHA256 do intervalo `c95f2ac08f54bc6fbae6aeff5044934a470c7ca26f87371660400c80815d08f6`:

~~~~typescript
export function size(outcomes: ReadonlyArray<string | null>, bundle: BoardCi.Contract["bundle"]) {
  if (outcomes.length < 50) return bundle.size
  const p = outcomes.filter((outcome) => outcome === "ejected").length / outcomes.length
  if (p === 0) return bundle.max
  if (p >= 1) return 1
  return Math.min(bundle.max, Math.max(1, Math.floor(Math.log(0.75) / Math.log(1 - p))))
}
~~~~


### `packages/core/src/board/queue-lanes.ts`

Archive: `sources/packages/core/src/board/queue-lanes.ts` · bytes: 4203 · Git blob: `f9d68042af8b19bf79e155818f940dbf5c828d08` · SHA256: `62429a1b7a77a627622ce5a9e7dd4d74c9b04b51cb1856058f6a124cb5c2cdb1`.

Papel da fonte: Overlap por affected: unknown global, blocked não passa/não bloqueia; capacidade.


Linhas **8–85**; SHA256 do intervalo `a0c4e78188793d88f776916887c6fe461db86d366f1c21deef3276bfdbd6fcf3`:

~~~~typescript
  readonly id: Id
  readonly affected: Affected
  /** False for a card on hold, `held`, conflicting or waiting on an unshipped dependency: it neither goes nor blocks. */
  readonly bundleable: boolean
  readonly urgent: boolean
  readonly order: number | null
  readonly queuedAt: number
}

export type Lane<Id> = { readonly ids: ReadonlyArray<Id>; readonly packages: Affected }

/**
 * The lanes to cut now, earliest first. Rule 1: a card goes only when it overlaps no bundle in flight. Rule 2: it never
 * goes ahead of an earlier bundleable card that overlaps it and waits. A global card goes only alone or with other
 * global cards, so once the bundles in flight land it runs the whole suite; every card behind it waits. The cards that
 * go are grouped into connected components of overlapping sets, and at most `room` lanes are returned.
 */
export function lanes<Id>(cards: ReadonlyArray<Card<Id>>, flight: ReadonlyArray<Affected>, room = Infinity) {
  const sorted = cards.filter((card) => card.bundleable).toSorted(earlier)
  const going = sorted.reduce(
    (acc, card) => {
      const free =
        !flight.some((other) => overlaps(other, card.affected)) &&
        !acc.waiting.some((other) => overlaps(other, card.affected)) &&
        (card.affected === null
          ? acc.going.every((other) => other.affected === null)
          : !acc.going.some((other) => other.affected === null))
      if (free) return { going: [...acc.going, card], waiting: acc.waiting }
      return { going: acc.going, waiting: [...acc.waiting, card.affected] }
    },
    { going: [] as Array<Card<Id>>, waiting: [] as Affected[] },
  ).going
  // Cards with no affected package share one lane instead of one each.
  const linked = (a: Affected, b: Affected) => overlaps(a, b) || (a?.length === 0 && b?.length === 0)
  const first = (group: ReadonlyArray<Card<Id>>) => Math.min(...group.map((card) => sorted.indexOf(card)))
  return going
    .reduce(
      (groups, card) => {
        const joined = groups.filter((group) => group.some((member) => linked(member.affected, card.affected)))
        return [...groups.filter((group) => !joined.includes(group)), [...joined.flat(), card]]
      },
      [] as Array<Array<Card<Id>>>,
    )
    .toSorted((a, b) => first(a) - first(b))
    .slice(0, Math.max(0, room))
    .map(
      (group): Lane<Id> => ({
        ids: group.toSorted((a, b) => sorted.indexOf(a) - sorted.indexOf(b)).map((card) => card.id),
        packages: group.some((card) => card.affected === null)
          ? null
          : [...new Set(group.flatMap((card) => card.affected ?? []))].toSorted(),
      }),
    )
}

/** Earlier means urgent first, then `order` when both cards have one, then time queued (spec section 4.4). */
export function earlier<Id>(a: Card<Id>, b: Card<Id>) {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order
  return a.queuedAt - b.queuedAt
}

export function overlaps(a: Affected, b: Affected) {
  if (a === null || b === null) return true
  return a.some((name) => b.includes(name))
}

/** Whether a diff touches a global path: a changed file that matches one of the contract's `lanes.global` globs. */
export function global(files: ReadonlyArray<string>, globs: ReadonlyArray<string>) {
  const patterns = globs.map((glob) => new Bun.Glob(glob))
  return files.some((file) => patterns.some((pattern) => pattern.match(file)))
}

/** Section 7.5: at most floor(budget.jobs / J) lanes in flight, J the jobs one lane gate uses; uncapped when either is unknown. */
export function capacity(budget: number | null, jobs: number | null) {
  if (budget === null || jobs === null) return Infinity
  return Math.max(1, Math.floor(budget / jobs))
}
~~~~


### `packages/core/src/board/queue-shared.ts`

Archive: `sources/packages/core/src/board/queue-shared.ts` · bytes: 11579 · Git blob: `108a40f374649e7498dad8f1d0033d3c8a984d41` · SHA256: `8382123484f1557dbff529a7c291d1aadf4b6ee435357a8a9e27db91e7d04cea`.

Papel da fonte: Gate por rollup, affected real e correlação por workflow/head.


Linhas **33–111**; SHA256 do intervalo `3f2640acbb52022f96502b553c43736dc72ad752b423d462b024debec23deb15`:

~~~~typescript
export const Rollup = Schema.Struct({
  headRefOid: Schema.String,
  statusCheckRollup: Schema.Array(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      context: Schema.optional(Schema.String),
      status: Schema.optional(Schema.String),
      conclusion: Schema.optional(Schema.NullOr(Schema.String)),
      state: Schema.optional(Schema.String),
      workflowName: Schema.optional(Schema.String),
      detailsUrl: Schema.optional(Schema.String),
    }),
  ),
})
export const decodeRollup = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup))
export const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup.fields.statusCheckRollup))
export const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"])
export const PASSED = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"])
export const INFRA = new Set(["CANCELLED", "TIMED_OUT", "STARTUP_FAILURE"])
export const AUTHOR = ["-c", "user.name=Orchestra", "-c", "user.email=orchestra@users.noreply.github.com"]

/** `full.checks` names the checks that gate the bundle, matched by check or by the workflow that ran it; with none named, every reported check must pass. */
export function judge(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const gates = gating(rollup, contract)
  if (gates.some((check) => check.done && FAILED.has(check.result))) return "red"
  if (contract.full.checks.some((name) => !gates.some((check) => check.name === name || check.workflow === name))) return "pending"
  if (gates.length === 0) return contract.source === "no-ci" ? "green" : "pending"
  return gates.every((check) => check.done && PASSED.has(check.result)) ? "green" : "pending"
}

export function gating(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const checks = rollup.map((item) => ({
    name: item.name ?? item.context ?? "",
    done: item.state ? item.state !== "PENDING" && item.state !== "EXPECTED" : item.status === "COMPLETED",
    result: item.conclusion ?? item.state ?? "",
    workflow: item.workflowName ?? "",
    url: item.detailsUrl ?? "",
  }))
  return contract.full.checks.length > 0
    ? checks.filter((check) => contract.full.checks.includes(check.name) || contract.full.checks.includes(check.workflow))
    : checks
}

const Dry = Schema.Struct({ packages: Schema.Array(Schema.String) })
const decodeDry = Schema.decodeUnknownOption(Schema.fromJsonString(Dry))

/**
 * Section 7.1's affected set from `turbo`: the packages a commit range touches and every package that depends on them.
 * Turbo reads the workspace graph from its working tree, so it runs in a detached checkout of `to` merged onto `from`,
 * the tree that lands: the project's own checkout may sit on any branch, and its stale package list once sent a lane
 * gate a package base no longer has. A range that does not merge cleanly has no affected set.
 */
export const affected = Effect.fnUntraced(function* (deps: Pick<Deps, "affected" | "proc" | "env">, directory: string, from: string, to: string) {
  if (deps.affected) return yield* deps.affected(directory, from, to)
  const bun = which("bun", deps.env ?? process.env)
  if (!bun) return undefined
  const git = gitRunner(deps.proc, deps.env)
  const merged = yield* git(directory, ["merge-tree", "--write-tree", from, to])
  if (merged.code !== 0) return undefined
  const landed = (yield* git(directory, [...AUTHOR, "commit-tree", merged.out.split("\n")[0] ?? "", "-p", from, "-p", to, "-m", "chore(queue): affected"])).out
  if (!landed) return undefined
  const checkout = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-affected-")))
  const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", checkout, landed])
  const result = added.code !== 0 ? undefined : yield* deps.proc
    .run(
      ChildProcess.make(bun, ["x", "turbo", "run", "typecheck", `--filter=...[${from}...${landed}]`, "--dry=json"], {
        cwd: checkout,
        env: { ...deps.env, TURBO_TELEMETRY_DISABLED: "1" },
        extendEnv: true,
        stdin: "ignore",
      }),
      { maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
    )
    .pipe(Effect.orElseSucceed(() => undefined))
  if (added.code === 0) yield* git(directory, ["worktree", "remove", "--force", checkout])
  yield* Effect.promise(() => fs.rm(checkout, { recursive: true, force: true }))
  if (!result || result.exitCode !== 0) return undefined
  return Option.getOrUndefined(decodeDry(result.stdout.toString("utf8")))?.packages
})
~~~~


Linhas **114–173**; SHA256 do intervalo `1d32ebaa0b5af8886736e5552ad2262ea188083a790f0251e4336299d7cfbb6a`:

~~~~typescript
export const openBundles = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  return yield* tx
    .select()
    .from(BoardBundleTable)
    .where(and(eq(BoardBundleTable.project_id, project), inArray(BoardBundleTable.status, ["open", "accepted"])))
    .orderBy(asc(BoardBundleTable.n))
    .all()
})

/** The next bundle number of the project; lanes cut several bundles, so it is never derived from one bundle. */
export const nextBundle = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  const last = yield* tx
    .select({ n: BoardBundleTable.n })
    .from(BoardBundleTable)
    .where(eq(BoardBundleTable.project_id, project))
    .orderBy(desc(BoardBundleTable.n))
    .get()
  return (last?.n ?? 0) + 1
})

/** A lane bundle's gate dispatches the lane workflows with its packages instead of applying the full label. */
export function dispatched(bundle: { readonly packages: ReadonlyArray<string> | null }, contract: BoardCi.Contract) {
  return bundle.packages !== null && (contract.lanes?.workflows.length ?? 0) > 0
}

const Runs = Schema.Array(Schema.Struct({ databaseId: Schema.Number, workflowName: Schema.String, headSha: Schema.String, createdAt: Schema.String }))
const decodeDispatches = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))
const Jobs = Schema.Struct({
  jobs: Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String, conclusion: Schema.NullOr(Schema.String), url: Schema.String })),
})
const decodeJobs = Schema.decodeUnknownOption(Schema.fromJsonString(Jobs))

/**
 * A lane bundle's checks in rollup shape. A workflow_dispatch run never shows in its PR's status rollup, so the jobs
 * come from the newest dispatched run of each workflow on the bundle head.
 */
export const dispatchRollup = Effect.fnUntraced(function* (deps: Deps, repo: string, branch: string, head: string) {
  const listed = yield* deps.gh([
    "run", "list", "--repo", repo, "--branch", branch, "--event", "workflow_dispatch",
    "--json", "databaseId,workflowName,headSha,createdAt", "--limit", "20",
  ])
  const runs = Option.getOrElse(decodeDispatches(listed.exitCode === 0 ? listed.stdout : ""), () => [])
    .filter((run) => run.headSha === head)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const latest = runs.filter((run, index) => runs.findIndex((other) => other.workflowName === run.workflowName) === index)
  const jobs = yield* Effect.forEach(latest, (run) =>
    deps.gh(["run", "view", String(run.databaseId), "--repo", repo, "--json", "jobs"]).pipe(
      Effect.map((viewed) =>
        Option.getOrElse(decodeJobs(viewed.exitCode === 0 ? viewed.stdout : ""), () => ({ jobs: [] })).jobs.map((job) => ({
          name: job.name,
          workflowName: run.workflowName,
          status: job.status.toUpperCase(),
          conclusion: job.conclusion ? job.conclusion.toUpperCase() : null,
          detailsUrl: job.url,
        })),
      ),
    ),
  )
  return jobs.flat()
})
~~~~


Linhas **185–216**; SHA256 do intervalo `148e7665e42a25f51e99143a6fa1c88812ebaa4721933fd346e964cc403593a8`:

~~~~typescript
export const place = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage) {
  const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: yield* Clock.currentTimeMillis }
  yield* tx
    .update(BoardIssueTable)
    .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
    .where(eq(BoardIssueTable.id, issue.id))
    .run()
  return { before: { stage: issue.stage, position: issue.position, stage_entered_at: issue.stage_entered_at }, after: next }
})

/** Takes a card out of the queue and back to Review. */
export const release = Effect.fnUntraced(function* (
  tx: Tx,
  project: ProjectRow,
  issue: IssueRow,
  actor: Board.Actor,
  action: Board.Action,
  reason: string,
) {
  yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue.id)).run()
  const current = (yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue.id)).get()) ?? issue
  const moving = yield* place(tx, project, current, "review")
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor, action, reason, before: moving.before, after: moving.after })
  return changed(project.id, activity, issue.id)
})

export const insertNote = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, body: string) {
  const id = Board.NoteID.create()
  yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "orchestra", body }).run()
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
  return changed(project.id, activity, issue.id)
})
~~~~


### `packages/core/src/board/queue-drift.ts`

Archive: `sources/packages/core/src/board/queue-drift.ts` · bytes: 1233 · Git blob: `95761efe467c8f318cad7200ea7787fc15cdb10c` · SHA256: `6c3ccc9eee3cc220ac01e8a0a92c6c1fe4fd06ddf03f9780e4f218d46aaf338c`.

Papel da fonte: Area declarada versus affected gera nota, sem negar integração por si.


Linhas **1–21**; SHA256 do intervalo `6c3ccc9eee3cc220ac01e8a0a92c6c1fe4fd06ddf03f9780e4f218d46aaf338c`:

~~~~typescript
import { Effect } from "effect"
import type { IssueRow, ProjectRow } from "./shared"
import { affected, insertNote } from "./queue-shared"
import type { Deps } from "./queue-shared"

/**
 * Section 4.4's plan drift: a card whose real affected set left its planned `area` raises one `integration` line for
 * Maestro to send to `archie` as a plan revision. It never refuses: the card queues under its real set. Without an
 * `area`, or without `turbo`, there is nothing to compare and no line.
 */
export const drift = Effect.fnUntraced(function* (deps: Deps, project: ProjectRow, issue: IssueRow, directory: string, base: string, head: string) {
  if (!issue.area) return
  const real = yield* affected(deps, directory, `origin/${base}`, head)
  const extra = real?.filter((name) => !issue.area?.includes(name)) ?? []
  if (extra.length === 0) return
  const ref = `${project.key}-${issue.number}`
  const text = `${ref} left its planned area: it also affects ${extra.join(", ")}, which its plan did not list. Send it to archie as a plan revision; the card still queues.`
  const done = yield* deps.quiet((tx) => insertNote(tx, project, issue, text))
  yield* deps.publish(done)
  yield* Effect.logWarning(`integration: ${text}`)
})
~~~~


## B09 — Red, infra, base e isolamento

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B09`.


### `packages/core/src/board/queue-settle.ts`

Archive: `sources/packages/core/src/board/queue-settle.ts` · bytes: 27575 · Git blob: `a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb` · SHA256: `3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5`.

Papel da fonte: Pending, infra retry limitado, probes/isolamento e fix/flaky têm estados próprios.


Linhas **44–236**; SHA256 do intervalo `2edbf1a817885423e4f87d6e67200d70268a48eaede12716db5b974b12684f23`:

~~~~typescript
  const settle = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
  ) {
    if (!bundle.pr_number) return yield* dissolve(row, bundle, "The bundle PR was not opened.")
    const viewed = yield* deps.gh(["pr", "view", String(bundle.pr_number), "--repo", repo, "--json", "statusCheckRollup,headRefOid"])
    const viewedRollup = viewed.exitCode === 0 ? Option.getOrUndefined(decodeRollup(viewed.stdout)) : undefined
    if (!viewedRollup) return
    if (viewedRollup.headRefOid !== bundle.head_sha) return yield* dissolve(row, bundle, "Someone pushed to the bundle branch.")
    const rollup = dispatched(bundle, contract)
      ? { ...viewedRollup, statusCheckRollup: yield* dispatchRollup(deps, repo, bundle.branch, bundle.head_sha) }
      : viewedRollup
    const judged = judge(rollup.statusCheckRollup, contract)
    if (judged === "pending") return
    // Section 6.8: the fix card rides alone and is judged only on F, so a gate red elsewhere on base does not block it.
    const fixed =
      judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null
        ? yield* tryOn(directory, contract.scoped.tests, bundle, bundle.failing, [bundle.head_sha])
        : undefined
    if (judged === "red" && bundle.failing && bundle.fix_issue_id && contract.scoped.tests !== null && fixed === undefined) return
    // Section 6.4: Maestro accepted this flaky bundle, so its red gate ships as tested.
    const verdict = bundle.status === "accepted" || fixed === true ? "green" : judged
    const members = yield* deps.quiet((tx) =>
      tx
        .select({ member: BoardBundleMemberTable, issue: BoardIssueTable })
        .from(BoardBundleMemberTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
        .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
        .orderBy(asc(BoardBundleMemberTable.position))
        .all(),
    )
    // A bundle with no members is a base probe: it never merges, it only says whether base is green. A red probe or safety
    // run (section 7.3, packages set) is read like any base red, so only the lanes touching its failing packages pause.
    if (members.length === 0 && verdict === "green")
      return yield* close(row, repo, bundle, `probed ${contract.base} at ${bundle.base_sha.slice(0, 10)}`, "probe-green")
    if (members.length === 0) return yield* safety(row, repo, directory, contract, bundle, rollup.statusCheckRollup)
    if (fixed === false) {
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} carried this fix alone and ${bundle.failing?.flatMap((group) => group.files).join(", ")} still fail; it is back in Review.`, "fix did not turn its tests green")
      return yield* close(row, repo, bundle, "is red; the fix did not turn its tests green", "base-red")
    }
    if (verdict === "red") {
      const found = yield* failures(repo, rollup.statusCheckRollup, contract)
      const cause = found.files.length > 0 ? ` Failing: ${found.files.join(", ")}.` : ""
      const paused = Effect.gen(function* () {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure twice; the ${row.key} queue is paused until Maestro retries it, and this card stays queued.`),
          { discard: true },
        )
        yield* Effect.logWarning(`integration: ${row.key} queue paused, bundle ${row.key}-B${bundle.n} failed on infrastructure twice`)
        return yield* close(row, repo, bundle, "failed on infrastructure twice; the queue is paused", "paused")
      })
      // An infrastructure red reruns only its failed jobs, in the same runs, so the green jobs stand and the bundle stays
      // open. A run already on its second attempt failed on infrastructure twice. A red whose runs cannot be read or
      // rerun falls back to rebuilding the bundle.
      const attempts = found.infra
        ? yield* Effect.forEach(found.runs, (run) =>
            deps
              .gh(["run", "view", run, "--repo", repo, "--json", "attempt,status"])
              .pipe(Effect.map((read) => (read.exitCode === 0 ? Option.getOrUndefined(decodeAttempt(read.stdout)) : undefined))),
          )
        : []
      const rerunnable = attempts.length > 0 && attempts.every((attempt) => attempt !== undefined)
      // GitHub can still report the last attempt's jobs for a moment after a rerun starts.
      if (rerunnable && attempts.some((attempt) => attempt?.status !== "completed")) return
      if (rerunnable && attempts.some((attempt) => (attempt?.attempt ?? 1) > 1)) return yield* paused
      const rerun = rerunnable ? yield* Effect.forEach(found.runs, (run) => deps.gh(["run", "rerun", run, "--failed", "--repo", repo])) : []
      if (rerunnable && rerun.every((result) => result.exitCode === 0)) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns its failed jobs once and this card stays queued.`),
          { discard: true },
        )
        return
      }
      // A red the gate cannot pin on a failing test, on a base that is red too, has nothing to wait for: base-red would
      // hold the queue until base turns green on its own. Read it as infrastructure instead: rebuild once, then pause.
      const infra = Effect.gen(function* () {
        const previous = yield* deps.quiet((tx) =>
          tx
            .select({ status: BoardBundleTable.status })
            .from(BoardBundleTable)
            .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open"), ne(BoardBundleTable.id, bundle.id)))
            .orderBy(desc(BoardBundleTable.n))
            .get(),
        )
        if (previous?.status === "infra") return yield* paused
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns it once and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "failed on infrastructure; the queue reruns it", "infra")
      })
      if (found.infra) return yield* infra
      const sha10 = bundle.base_sha.slice(0, 10)
      const scoped = runnable(contract, found) && contract.scoped.tests !== null ? yield* scope(directory, contract.scoped.tests, bundle, found.groups) : undefined
      if (scoped === "flaky") return yield* flaky(row, bundle, members.map((item) => item.issue), found.groups.flatMap((group) => group.files))
      const based = scoped ? (scoped === "base" ? "red" : "green") : yield* baseState(row, repo, directory, bundle.base_sha, contract)
      if (based === "unknown") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; the queue tests ${contract.base} alone first and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        yield* close(row, repo, bundle, `is red; the queue tests ${contract.base} alone first`, "probing")
        return yield* probe(
          row,
          repo,
          directory,
          contract,
          bundle.base_sha,
          `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; this runs the full gate on ${contract.base} alone.`,
          null,
        )
      }
      if (based === "red" && found.groups.length === 0) return yield* infra
      if (based === "red") {
        // Section 6.8: F fails on base itself, so its culprit is bisected and a fix card opens; the bundle is not blamed.
        if (scoped === "base" && contract.scoped.tests !== null) {
          const culprit = yield* bisect(row, directory, contract.scoped.tests, bundle, found.groups)
          const fix = yield* fixCard(row, contract.base, culprit, found.groups)
          yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ culprit: culprit ?? null, failing: found.groups, fix_issue_id: fix }).where(eq(BoardBundleTable.id, bundle.id)).run())
          yield* Effect.logWarning(`integration: ${row.key} ${contract.base} is red at ${sha10}${culprit ? `, first failing at ${culprit.slice(0, 10)}` : ""}; ${pausing(contract, found.groups)}`)
        }
        yield* Effect.forEach(
          members,
          (item) =>
            note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red, and so does ${contract.base} at ${sha10}; this card stays queued until ${contract.base} is green.`),
          { discard: true },
        )
        return yield* close(row, repo, bundle, `is red because ${contract.base} at ${sha10} is red`, "base-red")
      }
      // Section 6.3 steps 3-6: a code red that ran scoped is searched with scoped runs, not halved through full gates.
      if (scoped === "code" && members.length > 1 && contract.scoped.tests !== null) {
        if (bundle.rebuilds >= 2) return yield* hold(row, repo, bundle, members, "went red after two rebuilds")
        const isolated = yield* isolate(directory, contract.scoped.tests, bundle, found.groups, members)
        if (isolated?.culprits.length === 0) return yield* hold(row, repo, bundle, members, "went red and halving found no culprit")
        if (isolated) {
          const culprits = isolated.culprits
          const fileList = found.groups.flatMap((group) => group.files).join(", ")
          // A culprit found by halving fails only once merged after earlier members, never alone.
          const where =
            isolated.after.length > 0
              ? `once merged after ${isolated.after.map((issue) => `${row.key}-${issue.number}`).join(", ")}`
              : `on ${contract.base} alone`
          yield* eject(
            row,
            bundle,
            culprits,
            `Bundle ${row.key}-B${bundle.n} went red, and this card fails ${fileList} ${where}; it is back in Review.`,
            isolated.after.length > 0 ? "failed its scoped tests after earlier members" : "failed its scoped tests alone",
          )
          const keys = culprits.map((issue) => `${row.key}-${issue.number}`).join(", ")
          const rest = members.filter((item) => !culprits.some((culprit) => culprit.id === item.issue.id))
          yield* deps.quiet((tx) =>
            tx
              .update(BoardQueueTable)
              .set({ flush: true })
              .where(inArray(BoardQueueTable.issue_id, rest.map((item) => item.issue.id)))
              .run(),
          )
          yield* Effect.forEach(
            rest,
            (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red; ${keys} failed alone and left it, and the queue rebuilds it with this card.`),
            { discard: true },
          )
          return yield* close(row, repo, bundle, `is red; ${keys} ejected, the queue rebuilds it`, "isolated")
        }
      }
      if (members.length > 1) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red on its full gate; the queue splits it to find the cause and this card stays queued.${cause}`),
          { discard: true },
        )
        // Flush keeps the surviving half due next tick, even after its first half merges and the rest is below full size.
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "is red; the queue splits it to find the cause", "red")
      }
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} went red with only this card on ${contract.base} at ${sha10}; it is back in Review.${cause}`, "red alone on the full gate")
      return yield* close(row, repo, bundle, "is red", "red")
~~~~


Linhas **367–493**; SHA256 do intervalo `2c80735846d680595fdf46e4dc3ce6ddb97080546d721af2c2806ff78a1e925c`:

~~~~typescript
  const dissolve = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, reason: string) {
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const members = yield* tx
          .select({ issue: BoardBundleMemberTable.issue_id })
          .from(BoardBundleMemberTable)
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .all()
        return yield* Effect.forEach(members, (member) =>
          log(tx, { project: row.id, issue: member.issue, actor: "github", action: "bundle.dissolve", reason, after: { bundle: bundle.n } }).pipe(
            Effect.map((activity) => changed(row.id, activity, member.issue)),
          ),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    if (row.github_repo) yield* close(row, row.github_repo, bundle, "dissolved")
  })

  /**
   * Section 7.3: a red base probe or safety run. Infrastructure closes it as `infra`; F that passes on base when rerun
   * closes it green; F that fails on base is bisected and gets a fix card, and only the lanes touching F's packages pause.
   * A red whose failures are not scoped tests pauses the whole project until Maestro retries it.
   */
  const safety = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    rollup: Parameters<typeof failures>[1],
  ) {
    const found = yield* failures(repo, rollup, contract)
    const sha10 = bundle.base_sha.slice(0, 10)
    if (found.infra) return yield* close(row, repo, bundle, `failed on infrastructure on ${contract.base} at ${sha10}`, "infra")
    const template = contract.scoped.tests
    const scoped = runnable(contract, found) && template !== null ? yield* scope(directory, template, bundle, found.groups) : undefined
    if (scoped === "flaky" || scoped === "code")
      return yield* close(row, repo, bundle, `found ${found.files.join(", ")} passing on ${contract.base} at ${sha10} when rerun`, "probe-green")
    // A red with no scoped failing tests has no fix card to cut, and a `base-red` without one waits for a base that only
    // the queue moves, so it pauses for Maestro instead.
    if (scoped === undefined || template === null) {
      yield* Effect.logWarning(`integration: ${row.key} probe found ${contract.base} red at ${sha10}, and its failures are not scoped tests; the queue is paused until Maestro retries it`)
      return yield* close(row, repo, bundle, `found ${contract.base} red at ${sha10}; the queue is paused`, "paused")
    }
    const culprit = yield* bisect(row, directory, template, bundle, found.groups)
    const fix = yield* fixCard(row, contract.base, culprit, found.groups)
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ culprit: culprit ?? null, failing: found.groups, fix_issue_id: fix }).where(eq(BoardBundleTable.id, bundle.id)).run())
    yield* Effect.logWarning(`integration: ${row.key} safety run found ${contract.base} red at ${sha10}${culprit ? `, first failing at ${culprit.slice(0, 10)}` : ""}; ${pausing(contract, found.groups)}`)
    return yield* close(row, repo, bundle, `found ${contract.base} red at ${sha10}`, "base-red")
  })

  const close = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    why: string,
    status: typeof BoardBundleTable.$inferSelect.status = "dissolved",
  ) {
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status }).where(eq(BoardBundleTable.id, bundle.id)).run())
    if (bundle.pr_number)
      yield* deps.gh(["pr", "close", String(bundle.pr_number), "--repo", repo, "--delete-branch", "--comment", `Bundle ${row.key}-B${bundle.n} ${why}.`])
  })

  /** Gives each issue back to Review with `text` and releases its queue row; the caller decides the bundle's fate. */
  const eject = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, text: string, reason: string) {
    const back = yield* deps.quiet((tx) =>
      Effect.forEach(issues, (issue) =>
        Effect.gen(function* () {
          yield* insertNote(tx, row, issue, text)
          yield* tx
            .update(BoardAttemptTable)
            .set({ outcome: "ejected" })
            .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
            .run()
          yield* BoardSnapshot.dispatch(tx, issue, { cause: `ejected:${row.key}-B${bundle.n}` })
          return yield* release(tx, row, issue, "github", "bundle.dissolve", reason)
        }),
      ),
    )
    yield* Effect.forEach(back, deps.publish, { discard: true })
  })

  /** Section 6.3: a dissolved bundle's cards stay held until Maestro releases them one at a time with `board_bundle`. */
  const hold = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    members: ReadonlyArray<{ readonly member: typeof BoardBundleMemberTable.$inferSelect; readonly issue: IssueRow }>,
    why: string,
  ) {
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ hold: "held" })
        .where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id)))
        .run(),
    )
    yield* Effect.forEach(
      members,
      (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} ${why}; it dissolved and this card is held until Maestro releases it with board_bundle.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} ${why}; its cards are held. Release them one at a time with board_bundle, dequeue a suspect, or send F to jimmy.`)
    return yield* close(row, repo, bundle, why)
  })

  return { settle, dissolve, close }
}

// F runs scoped only when every failing file is a bun test file under a package group; otherwise base is judged by its checks or a probe.
function runnable(
  contract: BoardCi.Contract,
  found: { readonly files: ReadonlyArray<string>; readonly groups: ReadonlyArray<{ readonly files: ReadonlyArray<string> }> },
) {
  return (
    contract.scoped.tests !== null &&
    found.groups.length > 0 &&
    found.files.every((file) => found.groups.some((group) => group.files.includes(file.replaceAll("\\", "/"))))
  )
}

// Section 7.3: with lanes a base red pauses only the lanes whose packages overlap the failing ones.
function pausing(contract: BoardCi.Contract, groups: ReadonlyArray<{ readonly package: string }>) {
  if (!contract.lanes) return "only its fix card is cut until it is green"
  return `lanes touching ${[...new Set(groups.map((group) => group.package))].join(", ")} pause until its fix card lands; disjoint lanes keep landing`
}
~~~~


### `packages/core/src/board/queue-red.ts`

Archive: `sources/packages/core/src/board/queue-red.ts` · bytes: 23316 · Git blob: `57bcf02fe9c1eea69282f53a0c97799a89aacb5f` · SHA256: `c9a29e07575731d8becdcfea5e2571c018b294c4c4e88b1de078a17c1d61e5c8`.

Papel da fonte: Logs desconhecidos não provam infra; base tests, classifiers, bisect, fix card e flaky.


Linhas **38–120**; SHA256 do intervalo `77d58d8cb9c7fea197b781970ca0cc23e1f8289ee89b7e9c68d12286c833cc2b`:

~~~~typescript
  const failures = Effect.fnUntraced(function* (repo: string, rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
    const failed = gating(rollup, contract).filter((check) => check.done && FAILED.has(check.result))
    const read = yield* Effect.forEach(failed, (check) =>
      Effect.gen(function* () {
        if (INFRA.has(check.result)) return { files: [] as string[], groups: [], infra: true }
        const job = check.url.match(/\/job\/(\d+)/)?.[1]
        const log = job ? yield* deps.gh(["api", `repos/${repo}/actions/jobs/${job}/logs`]) : undefined
        const text = log?.exitCode === 0 ? log.stdout.replace(/^\S+Z /gm, "") : ""
        const files = text ? BoardCi.failing(text) : []
        const control = contract.full.control
        const silent = control !== null && control.jobs.some((prefix) => check.name.startsWith(prefix)) && !text.includes(control.line)
        const stopped = /##\[error\](The action '.*' has timed out after \d+ minutes|The operation was canceled)/.test(text)
        return { files, groups: text ? BoardCi.packaged(text) : [], infra: (silent || stopped) && text !== "" && files.length === 0 }
      }),
    )
    return {
      files: [...new Set(read.flatMap((item) => item.files))],
      groups: read.flatMap((item) => item.groups),
      infra: read.length > 0 && read.every((item) => item.infra),
      // The Actions runs the failed jobs belong to, which an infrastructure red reruns in place.
      runs: [...new Set(failed.flatMap((check) => check.url.match(/\/actions\/runs\/(\d+)\//)?.[1] ?? []))],
    }
  })

  /**
   * Whether base was green or red at `sha`: a base probe on that commit decides first, then a green whole-suite run on
   * the same tree, then the commit's own checks. A base reached by an outside merge often has no runs; that is unknown,
   * never green.
   */
  const baseState = Effect.fnUntraced(function* (row: ProjectRow, repo: string, directory: string, sha: string, contract: BoardCi.Contract) {
    const probed = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status })
        .from(BoardBundleTable)
        .where(and(eq(BoardBundleTable.project_id, row.id), eq(BoardBundleTable.base_sha, sha), inArray(BoardBundleTable.status, ["probe-green", "base-red"])))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (probed) return probed.status === "probe-green" ? "green" : "red"
    if (yield* greenTree(row, directory, sha)) return "green"
    const read = yield* deps.gh(["api", `repos/${repo}/commits/${sha}/check-runs`, "--jq", "[.check_runs[] | {name, status: (.status | ascii_upcase), conclusion: ((.conclusion // \"\") | ascii_upcase)}]"])
    const runs = read.exitCode === 0 ? Option.getOrUndefined(decodeRuns(read.stdout)) : undefined
    const verdict = runs && runs.length > 0 ? judge(runs, contract) : "pending"
    return verdict === "pending" ? "unknown" : verdict
  })

  /**
   * Whether `sha`'s tree is one the whole suite already passed on: the head of a merged bundle that ran the whole suite,
   * or a green base probe or safety run. A fast-forward lands the bundle head itself, so base then carries the tree its
   * gate tested and needs no probe. A fix card's bundle was judged only on F, and an accepted flaky bundle shipped red, so
   * neither counts. The newest twenty runs are enough: an older tree is rarely base again.
   */
  const greenTree = Effect.fnUntraced(function* (row: ProjectRow, directory: string, sha: string) {
    const runs = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status, base_sha: BoardBundleTable.base_sha, tree_sha: BoardBundleTable.tree_sha })
        .from(BoardBundleTable)
        .where(
          and(
            eq(BoardBundleTable.project_id, row.id),
            or(
              and(
                eq(BoardBundleTable.status, "merged"),
                isNull(BoardBundleTable.packages),
                isNull(BoardBundleTable.fix_issue_id),
                notExists(tx.select({ id: BoardFlakeTable.bundle_id }).from(BoardFlakeTable).where(eq(BoardFlakeTable.bundle_id, BoardBundleTable.id))),
              ),
              eq(BoardBundleTable.status, "probe-green"),
            ),
          ),
        )
        .orderBy(desc(BoardBundleTable.n))
        .limit(20)
        .all(),
    )
    if (runs.length === 0) return false
    const probes = runs.filter((run) => run.status === "probe-green").map((run) => `${run.base_sha}^{tree}`)
    const read = yield* git(directory, ["rev-parse", `${sha}^{tree}`, ...probes])
    if (read.code !== 0) return false
    const trees = read.out.split("\n")
    const tree = trees[0]
    return trees.slice(1).includes(tree) || runs.some((run) => run.status === "merged" && run.tree_sha === tree)
  })
~~~~


Linhas **143–259**; SHA256 do intervalo `c704c8c315e32f9f06d261533dde26b89fb2a7df4ef3536c2b1328d32e398898`:

~~~~typescript
  const scope = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    // Checkouts are added one at a time: concurrent `git worktree add` on one repository can race on its lock files.
    const checkouts = yield* Effect.forEach([bundle.base_sha, bundle.head_sha], (sha) =>
      Effect.gen(function* () {
        const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-scope-${bundle.n}-`)))
        const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, sha])
        if (added.code === 0) return scratch
        yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
        return undefined
      }),
    )
    const base = checkouts[0]
    const head = checkouts[1]
    const outcome =
      base && head
        ? yield* Effect.all(
            [
              runGroups(base, template, bundle.branch, groups).pipe(Effect.flatMap((pass) => (pass ? Effect.succeed(true) : runGroups(base, template, bundle.branch, groups)))),
              runGroups(head, template, bundle.branch, groups).pipe(
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
              ),
            ],
            { concurrency: 2 },
          )
        : undefined
    yield* Effect.forEach(checkouts, (scratch) => (scratch ? git(directory, ["worktree", "remove", "--force", scratch]) : Effect.void), { discard: true })
    if (!outcome) return undefined
    return !outcome[0] ? ("base" as const) : outcome[1] ? ("flaky" as const) : ("code" as const)
  })

  /** Runs F on base plus `heads` merged in order; false when a merge conflicts or a group fails, undefined when the checkout fails. */
  const tryOn = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    heads: ReadonlyArray<string>,
  ) {
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-isolate-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      for (const head of heads) {
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", "isolate", head])
        if (merged.code !== 0) return false
      }
      return yield* runGroups(scratch, template, bundle.branch, groups)
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /**
   * Section 6.3 steps 3-6: the culprits of a code red whose failing tests F ran scoped. Each candidate runs alone on base
   * with its in-bundle dependencies; when none fails alone, a binary search over the member prefixes finds the member
   * whose addition turns red, with the members merged before it in `after`. Undefined when a checkout fails; an empty
   * `culprits` means no culprit.
   */
  const isolate = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    members: ReadonlyArray<{ issue: IssueRow; member: typeof BoardBundleMemberTable.$inferSelect }>,
  ) {
    const failing = groups.flatMap((group) => group.files)
    const ids = members.map((item) => item.issue.id)
    const links = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardDependencyTable)
        .where(and(inArray(BoardDependencyTable.issue_id, ids), inArray(BoardDependencyTable.depends_on_id, ids)))
        .all(),
    )
    const diffs = yield* Effect.forEach(members, (item) =>
      git(directory, ["diff", "--name-only", bundle.base_sha, item.member.head_sha]).pipe(
        Effect.map((diff) => ({ item, touches: diff.out.split("\n").some((file) => failing.includes(file)) })),
      ),
    )
    const touching = diffs.flatMap((entry) => (entry.touches ? [entry.item] : []))
    const candidates = touching.length > 0 ? touching : members
    // One at a time: concurrent `git worktree add` on one repository races on its lock files.
    const singles = yield* Effect.forEach(
      candidates,
      (item) => {
        const after = members.filter((dep) => links.some((link) => link.issue_id === item.issue.id && link.depends_on_id === dep.issue.id))
        return tryOn(directory, template, bundle, groups, [...after.map((dep) => dep.member.head_sha), item.member.head_sha])
      },
      { concurrency: 1 },
    )
    if (singles.includes(undefined)) return undefined
    const culprits = candidates.filter((_, index) => singles[index] === false)
    if (culprits.length > 0) return { culprits: culprits.map((item) => item.issue), after: [] }
    let lo = 1
    let hi = members.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      const prefix = yield* tryOn(directory, template, bundle, groups, members.slice(0, mid).map((item) => item.member.head_sha))
      if (prefix === undefined) return undefined
      if (prefix === false) hi = mid
      if (prefix === true) lo = mid + 1
    }
    // The full prefix was never run by the search: when the search reaches it, it decides whether there is a culprit at all.
    if (lo === members.length) {
      const whole = yield* tryOn(directory, template, bundle, groups, members.map((item) => item.member.head_sha))
      if (whole === undefined) return undefined
      if (whole) return { culprits: [], after: [] }
    }
    return { culprits: members.slice(lo - 1, lo).map((item) => item.issue), after: members.slice(0, lo - 1).map((item) => item.issue) }
  })
~~~~


Linhas **266–391**; SHA256 do intervalo `157cbbadab742a9fd6e30f5949f499d112c6a7c4f077f9630bbb232ef4f97611`:

~~~~typescript
  const bisect = Effect.fnUntraced(function* (
    row: ProjectRow,
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const found = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status, base_sha: BoardBundleTable.base_sha, head_sha: BoardBundleTable.head_sha })
        .from(BoardBundleTable)
        .where(
          and(
            eq(BoardBundleTable.project_id, row.id),
            or(and(eq(BoardBundleTable.status, "merged"), isNull(BoardBundleTable.packages)), eq(BoardBundleTable.status, "probe-green")),
          ),
        )
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (!found) return undefined
    const good = found.status === "merged" ? found.head_sha : found.base_sha
    if ((yield* git(directory, ["merge-base", "--is-ancestor", good, bundle.base_sha])).code !== 0) return undefined
    const commits = (yield* git(directory, ["rev-list", "--first-parent", "--reverse", `${good}..${bundle.base_sha}`])).out.split("\n").filter(Boolean)
    if (commits.length === 0) return undefined
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bisect-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      // The last commit is known to fail, so the search only narrows within the list.
      let lo = 0
      let hi = commits.length - 1
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if ((yield* git(scratch, ["checkout", "--quiet", "--detach", commits[mid] ?? ""])).code !== 0) return undefined
        const passes = yield* runGroups(scratch, template, bundle.branch, groups)
        if (passes) lo = mid + 1
        if (!passes) hi = mid
      }
      return commits[lo]
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /** Section 6.8: the open fix card for a red base, reused while an earlier one has not shipped. */
  const fixCard = Effect.fnUntraced(function* (
    row: ProjectRow,
    base: string,
    culprit: string | undefined,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const open = yield* deps.quiet((tx) =>
      tx
        .select({ id: BoardIssueTable.id })
        .from(BoardBundleTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleTable.fix_issue_id))
        .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (open) return open.id
    const files = groups.flatMap((group) => group.files).join(", ")
    const title = `Fix ${base}: ${files} fail${culprit ? ` since ${culprit.slice(0, 10)}` : ""}`
    const body = `${base} fails ${files}.${culprit ? ` Bisect found ${culprit} as the first failing commit.` : " The queue has no green point to bisect from."} The queue cuts only this card until ${base} is green; it rides alone and merges when these tests pass.`
    const created = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        // `row` may be stale: the next issue number comes from a fresh read.
        const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, row.id)).get()
        if (!project) return yield* Effect.die(`${row.key} has no project row to file its fix card in.`)
        const id = Board.IssueID.create()
        const position = yield* endOf(tx, row.id, "backlog")
        const entered = yield* Clock.currentTimeMillis
        yield* tx
          .insert(BoardIssueTable)
          .values({
            id,
            project_id: row.id,
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            epic_id: null,
            stage: "backlog",
            position,
            estimate: null,
            seat: null,
            session_id: null,
            branch: null,
            pr_number: null,
            attempts: 0,
            crash_reason: null,
            guardrail_rule: null,
            record: null,
            stage_entered_at: entered,
            github_dirty: project.github_repo !== null,
          })
          .run()
        yield* tx
          .update(BoardProjectTable)
          .set({ next_issue_number: project.next_issue_number + 1 })
          .where(eq(BoardProjectTable.id, row.id))
          .run()
        const activity = yield* log(tx, {
          project: row.id,
          issue: id,
          actor: "github",
          action: "issue.create",
          reason: "base is red",
          after: {
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            stage: "backlog",
            position,
            stage_entered_at: entered,
          },
        })
        return { id, changed: changed(row.id, activity, id) }
      }),
    )
    yield* deps.publish(created.changed)
    return created.id
  })
~~~~


Linhas **398–472**; SHA256 do intervalo `6b744706876aefb11857a09a19675c914214f7e96cb2c79c13f3bf0412b94bde`:

~~~~typescript
  const probe = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    sha: string,
    body: string,
    packages: ReadonlyArray<string> | null,
  ) {
    const head = (yield* git(directory, [...AUTHOR, "commit-tree", `${sha}^{tree}`, "-p", sha, "-m", "chore(queue): base probe"])).out
    if (!head) return
    const n = yield* deps.quiet((tx) => nextBundle(tx, row.id))
    const branch = `bundle-${row.key}-${n}`
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${head}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const dispatch = dispatched({ packages }, contract)
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        contract.base,
        "--head",
        branch,
        "--title",
        `chore(queue): base probe ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label && !dispatch ? ["--label", contract.full.label] : []),
      ],
      body,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    if (dispatch)
      yield* Effect.forEach(contract.lanes?.workflows ?? [], (workflow) => deps.gh(["workflow", "run", workflow, "--repo", repo, "--ref", branch]), {
        discard: true,
      })
    yield* deps.quiet((tx) =>
      tx
        .insert(BoardBundleTable)
        .values({ id: Board.BundleID.create(), project_id: row.id, n, branch, pr_number: number, base_sha: sha, head_sha: head, tree_sha: "", status: "open", packages })
        .run(),
    )
  })

  /** Section 6.4: a flaky bundle keeps its PR open and its members queued until Maestro merges or retries it. */
  const flaky = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, tests: ReadonlyArray<string>) {
    const now = yield* Clock.currentTimeMillis
    yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardBundleTable).set({ status: "flaky" }).where(eq(BoardBundleTable.id, bundle.id)).run()
        yield* Effect.forEach(
          tests,
          (test) =>
            tx
              .insert(BoardFlakeTable)
              .values({ project_id: row.id, test, bundle_id: bundle.id, first_seen: now, count: 1 })
              .onConflictDoUpdate({ target: [BoardFlakeTable.project_id, BoardFlakeTable.test], set: { bundle_id: bundle.id, count: sql`${BoardFlakeTable.count} + 1` } })
              .run(),
          { discard: true },
        )
      }),
    )
    yield* Effect.forEach(
      issues,
      (issue) => note(row, issue, `Bundle ${row.key}-B${bundle.n} went red, and ${tests.join(", ")} then passed three scoped reruns of its head: it is flaky. Maestro merges it or retries it; this card stays queued.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} flaky: ${tests.join(", ")} failed, then passed on rerun. Merge or retry.`)
  })

  return { failures, baseState, scope, tryOn, isolate, bisect, fixCard, probe, flaky }
}
~~~~


## B10 — Merge, recuperação e limite de revogação

Vínculo: `body.md` §8; archive de evidência: `evidence.md`, seção `B10`.


### `packages/core/src/board/queue-settle.ts`

Archive: `sources/packages/core/src/board/queue-settle.ts` · bytes: 27575 · Git blob: `a0165ce506ae7c07a7a79e9793e8b09f3cda0fcb` · SHA256: `3dac27cec16c0d5003485753de4a132110a6251f628e040f49304a357d7f4ae5`.

Papel da fonte: Revalida heads/tip, recupera push já feito e usa force-with-lease; skew disjunto registra tested/merged.


Linhas **238–364**; SHA256 do intervalo `f32168826219143231099b6cebff734fdeaef4da36077694b52ff931a147e6a2`:

~~~~typescript
    // Section 6.6: a member head that moved since assembly dequeues that member and the bundle is rebuilt.
    const heads = yield* Effect.forEach(members, (item) =>
      head(directory, repo, item.issue.pr_number ?? 0).pipe(
        Effect.map((current) => ({ item, sha: current.sha as string | undefined })),
        Effect.orElseSucceed(() => ({ item, sha: undefined })),
      ),
    )
    const stale = heads.filter((entry) => entry.sha !== entry.item.member.head_sha)
    if (stale.length > 0) {
      yield* Effect.forEach(stale, (entry) => moved(row, entry.item.issue, entry.sha), { discard: true })
      return yield* dissolve(row, bundle, `${stale.map((entry) => `${row.key}-${entry.item.issue.number}`).join(", ")} moved after assembly.`)
    }
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    // Section 8.5: a host that died after pushing base but before writing the rows finds the bundle already in base,
    // so it only records the merge: no second push and no rebuilt bundle.
    const already = tip !== bundle.base_sha && (yield* git(directory, ["merge-base", "--is-ancestor", bundle.head_sha, tip])).code === 0
    const landed = already
      ? { target: tip, on: null }
      : tip === bundle.base_sha
        ? { target: bundle.head_sha, on: null }
        : yield* skew(directory, contract, bundle, tip, row)
    if (!landed) return yield* dissolve(row, bundle, `${contract.base} moved to ${tip.slice(0, 10)}; the bundle is rebuilt and retested.`)
    const pushed = already
      ? { code: 0 }
      : yield* git(directory, [
          "push",
          "--quiet",
          `--force-with-lease=refs/heads/${contract.base}:${landed.on ?? bundle.base_sha}`,
          "origin",
          `${landed.target}:refs/heads/${contract.base}`,
        ])
    if (pushed.code !== 0) return
    const shipped = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx
          .update(BoardBundleTable)
          .set({ status: "merged", merged_on: landed.on })
          .where(eq(BoardBundleTable.id, bundle.id))
          .run()
        return yield* Effect.forEach(members, (item) =>
          Effect.gen(function* () {
            yield* tx
              .update(BoardAttemptTable)
              .set({ outcome: "merged" })
              .where(and(eq(BoardAttemptTable.issue_id, item.issue.id), isNull(BoardAttemptTable.outcome)))
              .run()
            yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, item.issue.id)).run()
            const moving = yield* place(tx, row, item.issue, "shipped")
            const activity = yield* log(tx, {
              project: row.id,
              issue: item.issue.id,
              actor: "github",
              action: "bundle.merge",
              before: moving.before,
              after: { ...moving.after, bundle: bundle.n, merged: landed.target, ...(landed.on ? { on: landed.on } : {}) },
            })
            return changed(row.id, activity, item.issue.id)
          }),
        )
      }),
    )
    yield* Effect.forEach(shipped, deps.publish, { discard: true })
    yield* git(directory, ["push", "--quiet", "origin", "--delete", bundle.branch])
    // Snapshot refs go only once the merge is on the remote, and only for shipped cards.
    yield* Effect.forEach(
      members,
      (item) =>
        Effect.gen(function* () {
          const remote = contract.snapshots.remote
          const refs = (yield* git(directory, ["ls-remote", remote, `refs/orchestra/wip/${row.key}-${item.issue.number}/*`])).out
            .split("\n")
            .map((line) => line.split("\t")[1])
            .filter((name): name is string => Boolean(name))
          if (refs.length > 0) yield* git(directory, ["push", "--quiet", remote, "--delete", ...refs])
          yield* describe(row, item.issue.id, contract.base)
        }),
      { discard: true },
    )
  })

  /**
   * Section 6.5 `merge-if-disjoint`: the merge commit of the tested head onto the new tip, when the two merge clean and
   * what moved base does not overlap what the bundle changed. Undefined means retest. A lane bundle always takes this
   * path (section 7.3): lanes in flight are disjoint by construction, so retesting every lane behind the first to land
   * would serialize them again.
   */
  const skew = Effect.fnUntraced(function* (
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    tip: string,
    row: ProjectRow,
  ) {
    if (contract.bundle.onBaseMoved !== "merge-if-disjoint" && bundle.packages === null) return undefined
    const merged = yield* git(directory, ["merge-tree", "--write-tree", tip, bundle.head_sha])
    if (merged.code !== 0) return undefined
    // Every bundle's record commit appends to the union-merged logs under `.atlas/`, so two lanes always share those
    // paths; a clean merge-tree already proves they combine, and they hold no code.
    const paths = (range: string) =>
      git(directory, ["diff", "--name-only", range]).pipe(
        Effect.map((diffed) => diffed.out.split("\n").filter((file) => file && !file.startsWith(".atlas/"))),
      )
    const theirs = yield* paths(`${bundle.base_sha}..${tip}`)
    const ours = yield* paths(`${bundle.base_sha}..${bundle.head_sha}`)
    if (theirs.some((file) => ours.includes(file))) return undefined
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (graph) {
      const left = yield* affected(deps, directory, bundle.base_sha, tip)
      const right = yield* affected(deps, directory, bundle.base_sha, bundle.head_sha)
      if (!left || !right || left.some((name) => right.includes(name))) return undefined
    }
    const commit = yield* git(directory, [
      ...AUTHOR,
      "commit-tree",
      merged.out.split("\n")[0] ?? "",
      "-p",
      tip,
      "-p",
      bundle.head_sha,
      "-m",
      `Merge bundle ${row.key}-B${bundle.n} onto ${contract.base}\n\nTested on ${bundle.base_sha}, merged on ${tip}.`,
    ])
    if (commit.code !== 0 || !commit.out) return undefined
    return { target: commit.out, on: tip }
  })
~~~~


### `packages/core/src/board/queue.ts`

Archive: `sources/packages/core/src/board/queue.ts` · bytes: 38106 · Git blob: `5194680fdf6bd598ececadf5f63c3339a945357d` · SHA256: `dd50c583530d4b6dd5de417fcd8b0e0abd0774e792ba7806c507b58e8386188f`.

Papel da fonte: Controles de hold/pause são filtros no corte, não prova de rechecagem no settle.


Linhas **309–350**; SHA256 do intervalo `3021413801ad981c39e8a61f90555439b2ea79856d8dbd9909c214c1f8426987`:

~~~~typescript
  const spread = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    config: NonNullable<BoardCi.Contract["lanes"]>,
  ) {
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const open = yield* openBundles(tx, row.id)
        const members = open.length
          ? yield* tx
              .select({ issue: BoardBundleMemberTable.issue_id })
              .from(BoardBundleMemberTable)
              .where(inArray(BoardBundleMemberTable.bundle_id, open.map((bundle) => bundle.id)))
              .all()
          : []
        const stopped = yield* tx
          .select({ id: BoardBundleTable.id })
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), inArray(BoardBundleTable.status, ["paused", "flaky"])))
          .get()
        const closed = yield* tx
          .select()
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), notInArray(BoardBundleTable.status, ["open", "accepted", "probe-green"])))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const cards = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .all()
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
~~~~


Linhas **584–618**; SHA256 do intervalo `82758cfb849cb1fbbafdaa95cd628ae482482f0deb3505555ed4b339959ed285`:

~~~~typescript
    const members = yield* Effect.gen(function* () {
      const taken: Array<{ readonly issue: IssueRow; readonly head: string; readonly labels: ReadonlyArray<string> }> = []
      for (const card of fix ? [fix] : alone ? [alone] : queued.cards) {
        if (taken.length >= cap) break
        if (card.queue.hold === "held") continue
        if (card.issue.hold_before_merge || card.issue.paused) continue
        const attempt = queued.attempts.find((item) => item.issue_id === card.issue.id)
        if (attempt?.conflict_base) continue
        const ready = queued.waits
          .filter((dep) => dep.issue === card.issue.id)
          .every((dep) => dep.stage === "shipped" || taken.some((item) => item.issue.id === dep.on))
        if (!ready) continue
        const current = yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        const key = `${row.key}-${card.issue.number}`
        if (current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          ejections.push({ card: key, cause: "head moved after it queued" })
          continue
        }
        const message = [
          `Merge ${key}: ${card.issue.title}`,
          ...(deps.record ? ["", deps.record.trailer({ WP: key, Attempt: `a${attempt?.n ?? 0}` })] : []),
        ].join("\n")
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", message, card.queue.head_sha])
        if (merged.code === 0) {
          taken.push({ issue: card.issue, head: card.queue.head_sha, labels: current.labels })
          continue
        }
        const files = (yield* git(scratch, ["diff", "--name-only", "--diff-filter=U"])).out.split("\n").filter(Boolean)
        yield* git(scratch, ["merge", "--abort"])
        ejections.push({ card: key, cause: "conflicts with the bundle" })
        yield* note(row, card.issue, `conflicts-with-queue: merging onto the bundle so far conflicts in ${files.join(", ") || "its changes"}; it stays queued.`)
      }
      return taken
    })
~~~~


## B11 — Snapshot e conflitos

Vínculo: `body.md` §9; archive de evidência: `evidence.md`, seção `B11`.


### `packages/core/src/board/snapshot.ts`

Archive: `sources/packages/core/src/board/snapshot.ts` · bytes: 15010 · Git blob: `cc39cdec652c05bf969da8543335da1703a663fc` · SHA256: `8939a3de7e1123e7e650144adb79dfe5828706c73e6b34ab942bcc2edb626012`.

Papel da fonte: Attempt e refs WIP, scanner obrigatório, push não garante rows/restore globais.


Linhas **17–42**; SHA256 do intervalo `8d3e207267b9b348cfb581a724d71b19c849b55b781e35831676f38adcad6000`:

~~~~typescript
// Push early (docs/specs/maestro-lead/merge-queue.md section 8.1): the host writes a card's worktree to a snapshot
// commit through a temporary index and pushes it to refs/orchestra/wip/<KEY>/a<n>. The worktree, its index and its
// HEAD stay untouched, so seats still never commit.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  /** The gitleaks command (executable and leading arguments), or undefined when none can be had; then no snapshot is pushed. */
  readonly scanner: Effect.Effect<ReadonlyArray<string> | undefined>
  /** The project's snapshot remote from its CI contract; a failure blocks the push rather than guess a remote. */
  readonly remote: (directory: string, project: ProjectRow) => Effect.Effect<string, { readonly message: string }>
  readonly env?: NodeJS.ProcessEnv
}

export type Attempt = typeof BoardAttemptTable.$inferSelect

/**
 * What one snapshot did. `blocked` says why nothing was pushed. `missing` means the worktree is gone with no snapshot
 * to restore it from; `restored` means a gone worktree was re-created at its snapshot commit (spec 8.5).
 */
export type Result =
  | { readonly status: "pushed" | "unchanged"; readonly ref: string; readonly sha: string }
  | { readonly status: "blocked"; readonly ref: string; readonly reason: string }
  | { readonly status: "missing"; readonly ref: string; readonly worktree: string | null }
  | { readonly status: "restored"; readonly ref: string; readonly worktree: string; readonly sha: string }
  | { readonly status: "none" }
~~~~


Linhas **57–93**; SHA256 do intervalo `d7d86f0c7433e6ab16c194589be150320632eb759f9ce0eef921eddfa1716bb2`:

~~~~typescript
  const tree = Effect.fnUntraced(function* (cwd: string) {
    const index = yield* git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-snapshot-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          yield* Effect.promise(() => fs.copyFile(index.out, env.GIT_INDEX_FILE).catch(() => undefined))
          const added = yield* git(cwd, ["add", "-A"], env)
          const written = yield* git(cwd, ["write-tree"], env)
          if (added.code !== 0 || written.code !== 0) return undefined
          return written.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  /** Scans the commits `from..to` with gitleaks; anything but a clean exit blocks the push. */
  const scan = Effect.fnUntraced(function* (cwd: string, range: string) {
    const scanner = yield* deps.scanner
    if (!scanner) return "no secret scanner (gitleaks) is available"
    const result = yield* deps.proc
      .run(
        ChildProcess.make(scanner[0], [...scanner.slice(1), "git", "--no-banner", "--redact", "--exit-code", "1", "--log-opts", range, cwd], {
          cwd,
          env: deps.env,
          extendEnv: true,
          stdin: "ignore",
        }),
        { combineOutput: true, maxOutputBytes: 1024 * 1024, timeout: "120 seconds" },
      )
      .pipe(Effect.result)
    if (result._tag === "Failure") return `the secret scanner could not run: ${result.failure.message}`
    if (result.success.exitCode === 0) return undefined
    if (result.success.exitCode === 1) return "the secret scanner found a secret in the changed files"
    return `the secret scanner could not run (exit ${result.success.exitCode})`
  })
~~~~


Linhas **119–230**; SHA256 do intervalo `0a79d532cb6e30a49ed5682f490475eb674c0416b13e5a07091e818170b6902c`:

~~~~typescript
  /** The card's worktree: the one recorded on the attempt, else the worktree that has the card's branch checked out. */
  const locate = Effect.fnUntraced(function* (directory: string | null, issue: IssueRow, attempt: Attempt) {
    if (attempt.worktree) return attempt.worktree
    if (!directory || !issue.branch) return null
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    // git lists Windows paths with forward slashes; resolve keeps the recorded path in the platform's form.
    const listedPath = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    const found = listedPath && path.resolve(listedPath)
    if (found) yield* update(attempt, { worktree: found })
    return found ?? null
  })

  /**
   * Re-creates a gone worktree on the card's branch, then writes the snapshot's tree over its files only, so HEAD and
   * index are the branch's again and the work in progress shows as uncommitted, as before the loss (section 8.1).
   * The branch is checked out detached when another worktree holds it.
   */
  const restore = Effect.fnUntraced(function* (directory: string, project: ProjectRow, branch: string, cwd: string, sha: string, ref: string) {
    const remote = yield* deps.remote(directory, project).pipe(Effect.orElseSucceed(() => undefined))
    if (!remote) return false
    yield* git(directory, ["worktree", "prune"])
    const fetched = yield* git(directory, ["fetch", "--quiet", "--no-tags", remote, ref])
    if (fetched.code !== 0) return false
    const added =
      (yield* git(directory, ["worktree", "add", cwd, branch])).code === 0 ||
      (yield* git(directory, ["worktree", "add", "--detach", cwd, branch])).code === 0
    if (!added) return false
    // No-overlay restore also deletes the files the snapshot lacks.
    return (yield* git(cwd, ["restore", `--source=${sha}`, "--worktree", "--", "."])).code === 0
  })

  const push = Effect.fnUntraced(function* (issue: Board.IssueID) {
    const found = yield* find(issue)
    const attempt = found?.attempt
    if (!found || !attempt) return { status: "none" } satisfies Result
    const ref = `refs/orchestra/wip/${found.project.key}-${found.issue.number}/a${attempt.n}`
    const cwd = yield* locate(found.directory, found.issue, attempt)
    if (!cwd || !existsSync(cwd)) {
      const sha = attempt.snapshot_sha
      const branch = found.issue.branch
      if (cwd && sha && branch && found.directory && (yield* restore(found.directory, found.project, branch, cwd, sha, ref)))
        return { status: "restored", ref, worktree: cwd, sha } satisfies Result
      // A card with no worktree on record never had one to lose (not started, or works outside one): nothing drifted.
      if (!cwd) return { status: "missing", ref, worktree: cwd } satisfies Result
      if (!warned.has(issue)) {
        warned.add(issue)
        yield* Effect.logWarning(`drift: ${found.project.key}-${found.issue.number} worktree ${cwd} is gone and has no snapshot to restore`)
      }
      return { status: "missing", ref, worktree: cwd } satisfies Result
    }
    warned.delete(issue)
    const current = yield* tree(cwd)
    if (!current) return { status: "blocked", ref, reason: `could not read the tree of ${cwd}` } satisfies Result
    if (current === attempt.snapshot_tree && attempt.snapshot_sha)
      return { status: "unchanged", ref, sha: attempt.snapshot_sha } satisfies Result
    // The first snapshot's parent is the worktree's HEAD, so the scan and the push carry only the seat's change.
    const parent = attempt.snapshot_sha ?? (yield* git(cwd, ["rev-parse", "HEAD"])).out
    const commit = yield* git(
      cwd,
      ["commit-tree", current, ...(parent ? ["-p", parent] : []), "-m", `orchestra snapshot ${found.project.key}-${found.issue.number} a${attempt.n}`],
      IDENTITY,
    )
    const blocked = (reason: string) =>
      update(attempt, { snapshot_blocked: reason }).pipe(Effect.as({ status: "blocked", ref, reason } satisfies Result))
    if (commit.code !== 0) return yield* blocked(`could not write the snapshot commit: ${commit.err}`)
    const hit = yield* scan(cwd, parent ? `${parent}..${commit.out}` : commit.out)
    if (hit) return yield* blocked(hit)
    const remote = yield* deps.remote(found.directory ?? cwd, found.project).pipe(Effect.result)
    if (remote._tag === "Failure") return yield* blocked(remote.failure.message)
    const pushed = yield* git(cwd, ["push", "--no-verify", "--force", remote.success, `${commit.out}:${ref}`])
    if (pushed.code !== 0) return yield* blocked(`the push to ${remote.success} failed: ${pushed.err.split("\n").at(-1)}`)
    yield* update(attempt, {
      snapshot_sha: commit.out,
      snapshot_tree: current,
      snapshot_at: yield* Clock.currentTimeMillis,
      snapshot_blocked: null,
    })
    return { status: "pushed", ref, sha: commit.out } satisfies Result
  })

  return {
    tree,
    push,
    /**
     * `pushed` when the worktree's tree equals the last pushed snapshot's tree, else `local`. Null with no open attempt
     * or no worktree to read. The host records a snapshot only after its push succeeded, so the row stands for the remote.
     */
    state: Effect.fnUntraced(function* (issue: Board.IssueID) {
      const found = yield* find(issue)
      if (!found?.attempt) return null satisfies Board.PushState
      const cwd = yield* locate(found.directory, found.issue, found.attempt)
      if (!cwd || !existsSync(cwd)) return null satisfies Board.PushState
      const current = yield* tree(cwd)
      return (current && current === found.attempt.snapshot_tree ? "pushed" : "local") satisfies Board.PushState
    }),
    /** Snapshots every Building card with an open attempt: the 10 minute timer. */
    sweep: Effect.fnUntraced(function* () {
      const issues = yield* deps.quiet((tx) =>
        tx
          .selectDistinct({ id: BoardIssueTable.id })
          .from(BoardIssueTable)
          .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
          .where(and(eq(BoardIssueTable.stage, "building"), isNull(BoardAttemptTable.outcome)))
          .all(),
      )
      return yield* Effect.forEach(issues, (row) => push(row.id))
    }),
~~~~


Linhas **237–309**; SHA256 do intervalo `a1cc382a488f16a2be397bb997564c974ad4f96891696a2e6384835f7132cb6e`:

~~~~typescript
export const open = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  return latest && latest.outcome === null ? latest : undefined
})

/**
 * Records a dispatch of `issue`: the open attempt ends (`failed` when the card has a crash reason, else `superseded`)
 * and attempt n+1 opens with what it runs on. `board_issue.attempts` becomes the new n.
 */
export const dispatch = Effect.fnUntraced(function* (
  tx: Tx,
  issue: IssueRow,
  input: { readonly worktree?: string; readonly writePaths?: ReadonlyArray<string>; readonly cause?: string },
) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue.id))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  if (latest && latest.outcome === null)
    yield* tx
      .update(BoardAttemptTable)
      .set({ outcome: issue.crash_reason ? "failed" : "superseded" })
      .where(and(eq(BoardAttemptTable.issue_id, issue.id), eq(BoardAttemptTable.n, latest.n)))
      .run()
  const n = (latest?.n ?? 0) + 1
  const cause = input.cause ?? (n === 1 ? null : `failed:${issue.crash_reason ?? "redispatched"}`)
  yield* tx
    .insert(BoardAttemptTable)
    .values({
      issue_id: issue.id,
      n,
      seat: issue.seat,
      session_id: issue.session_id,
      worktree: input.worktree ?? null,
      branch: issue.branch,
      pr_number: issue.pr_number,
      write_paths: [...(input.writePaths ?? [])],
      cause,
    })
    .run()
  yield* tx.update(BoardIssueTable).set({ attempts: n }).where(eq(BoardIssueTable.id, issue.id)).run()
  if (n > 1)
    yield* BoardThread.write(tx, { id: `bno_rework_${issue.id}_${n}`, issue: issue.id, kind: "rework", author: "orchestra", body: cause ?? "redispatched" })
  return n
})

/**
 * Keeps attempts in step with an issue update: a new Session opens the next attempt, and a changed seat, branch or PR
 * is written to the open one. The crash reason the card had before the update decides how the old attempt ended.
 */
export const follow = Effect.fnUntraced(function* (tx: Tx, before: IssueRow, after: Fields) {
  const updated = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, before.id)).get()
  if (!updated) return
  if (typeof after.session_id === "string" && after.session_id !== before.session_id) {
    yield* dispatch(tx, { ...updated, crash_reason: before.crash_reason ?? updated.crash_reason }, {})
    return
  }
  if (!["seat", "branch", "pr_number"].some((key) => key in after)) return
  yield* tx
    .update(BoardAttemptTable)
    .set({ seat: updated.seat, branch: updated.branch, pr_number: updated.pr_number })
    .where(and(eq(BoardAttemptTable.issue_id, before.id), isNull(BoardAttemptTable.outcome)))
    .run()
})
~~~~


### `packages/core/src/board/conflicts.ts`

Archive: `sources/packages/core/src/board/conflicts.ts` · bytes: 8573 · Git blob: `06e450683e7c3428b8d466cd91696806c9ef5419` · SHA256: `c27c266af8e4461d76d253f6d13f8cc8ac4d1edeb7780e9726bb445fbab8a7ba`.

Papel da fonte: Observa avanço de base em branches Review/Queue e registra conflito; não rebaseia.


Linhas **10–12**; SHA256 do intervalo `0438c1c209379544e4bdb2a54c945829468ba4ed0fe38f2e06420e17d4155e81`:

~~~~typescript
// Targeted rebase notices (docs/specs/maestro-lead/merge-queue.md section 8.4): when base advances, only cards whose
// write set the merge touched are checked with `git merge-tree`, and only they get a note. The host never rebases or
// merges into a seat's worktree.
~~~~


Linhas **35–113**; SHA256 do intervalo `6e34798f39cd53da4e83c5929265ab63037bd0f27371f321927c5b77154d224f`:

~~~~typescript
// Review cards are about to queue and queued cards are about to be bundled: a conflict holds a queued card out of the
// next bundle until its worktree merges base.
const WATCHED: ReadonlyArray<Board.Stage> = ["review", "queue"]

// A project with no watched card has nobody to warn, so its fetch can wait. A later sweep diffs from the stored base
// SHA to the new head, so a delayed fetch loses no changed file; it only delays the note.
const IDLE_FETCH = 5 * 60_000
// Projects are checked two at a time: each check spawns git and writes the database.
const CONCURRENCY = 2

export function make(deps: Deps) {
  // When each project's remote base was last fetched, in process memory: a restart fetches once on the first sweep.
  const fetched = new Map<string, number>()

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory) return []
    const base = yield* deps.base(directory, row).pipe(Effect.orElseSucceed(() => undefined))
    if (!base) return []
    // The ref read below is local and cheap, so every sweep sees a base that any other fetch already moved.
    const now = yield* Clock.currentTimeMillis
    const last = fetched.get(row.id)
    if (last === undefined || now - last >= IDLE_FETCH || (yield* watching(row))) {
      fetched.set(row.id, now)
      yield* deps.git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    }
    const head = (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!head || head === row.base_sha) return []
    // The first sighting only records where base stands: there is no earlier merge to compare with.
    if (!row.base_sha) {
      yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run())
      return []
    }
    const touched = (yield* deps.git(directory, ["diff", "--name-only", `${row.base_sha}..${head}`])).out.split("\n").filter(Boolean)
    const cards = yield* deps.quiet((tx) =>
      tx
        .select({ issue: BoardIssueTable, attempt: BoardAttemptTable })
        .from(BoardIssueTable)
        .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
        .where(and(eq(BoardIssueTable.project_id, row.id), inArray(BoardIssueTable.stage, [...WATCHED]), isNull(BoardAttemptTable.outcome)))
        .all(),
    )
    const notices = yield* Effect.forEach(cards, (card) =>
      Effect.gen(function* () {
        const tip = card.issue.branch
          ? (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/heads/${card.issue.branch}`])).out
          : ""
        const target = tip || card.attempt.snapshot_sha
        if (!target) return undefined
        // The declared write set plus what the card really changed, so a card with no declared set is still covered.
        const writes = [
          ...card.attempt.write_paths,
          ...(yield* deps.git(directory, ["diff", "--name-only", `${head}...${target}`])).out.split("\n").filter(Boolean),
        ]
        const overlap = touched.filter((file) => writes.some((site) => covers(site, file)))
        // A card that conflicted before is checked again on every advance, so a fix on base clears it.
        if (overlap.length === 0 && !card.attempt.conflict_base) return undefined
        const merged = yield* deps.git(directory, ["merge-tree", "--write-tree", "--name-only", "--no-messages", head, target])
        if (merged.code > 1) return undefined
        const files = merged.code === 1 ? merged.out.split("\n").slice(1).filter(Boolean) : []
        return {
          issue: card.issue.id,
          base: head,
          touched: overlap,
          verdict: files.length > 0 ? "conflict" : "clean",
          files: [...new Set(files)],
          cleared: files.length === 0 && card.attempt.conflict_base !== null,
        } satisfies Notice
      }),
    ).pipe(Effect.map((all) => all.filter((notice) => notice !== undefined)))
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run()
        return yield* Effect.forEach(notices, (notice) => record(tx, row, base, notice))
      }),
    )
    yield* Effect.forEach(published, (item) => (item ? deps.publish(item) : Effect.void))
    return notices
  })
~~~~


Linhas **130–165**; SHA256 do intervalo `69d575a0f26a660c0dc9a60dbc9efcce2364af8903e1c739f3ef474858a103cf`:

~~~~typescript
  const record = Effect.fnUntraced(function* (tx: Tx, row: ProjectRow, base: string, notice: Notice) {
    const conflict = notice.verdict === "conflict"
    yield* tx
      .update(BoardAttemptTable)
      .set({ conflict_base: conflict ? notice.base : null, conflict_files: conflict ? [...notice.files] : null })
      .where(and(eq(BoardAttemptTable.issue_id, notice.issue), isNull(BoardAttemptTable.outcome)))
      .run()
    const at = `${base} at ${notice.base.slice(0, 10)}`
    const body = conflict
      ? `${at} conflicts with this card in ${notice.files.join(", ")}. Merge ${base} in the card's worktree on its next dispatch.`
      : notice.cleared
        ? `${at} merges clean with this card again.`
        : `${at} touched ${notice.touched.join(", ")}; merges clean.`
    const id = Board.NoteID.create()
    yield* tx.insert(BoardNoteTable).values({ id, issue_id: notice.issue, author: "orchestra", body }).run()
    const activity = yield* log(tx, { project: row.id, issue: notice.issue, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
    return changed(row.id, activity, notice.issue)
  })

  return {
    /** Checks every active project's base; the poll runs it every minute. A project with no watched card fetches at most every 5 minutes. */
    sweep: Effect.fnUntraced(function* () {
      const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
      return (yield* Effect.forEach(rows, project, { concurrency: CONCURRENCY })).flat()
    }),
  }
}

export type Interface = ReturnType<typeof make>

/** The arsenal's `conflictVerdict` site semantics against a changed file: line ranges drop, patterns are globs. */
function covers(site: string, file: string) {
  const bare = site.replace(/:L\d+(?:-\d+)?$/, "").replace(/^\.\//, "")
  if (/(?<!\\)[*?]/.test(bare)) return new Bun.Glob(bare).match(file)
  return bare.replace(/\\([\\*?])/g, "$1") === file
}
~~~~


## B12 — Record Atlas e replay de plano

Vínculo: `body.md` §9; archive de evidência: `evidence.md`, seção `B12`.


### `packages/core/src/board/queue-record.ts`

Archive: `sources/packages/core/src/board/queue-record.ts` · bytes: 15266 · Git blob: `7ade81c640d6524360161d2c018ba1038c471f2e` · SHA256: `1414c1df2d7b08fc0027fe108275d4b07e343a56a56ded5f2119f196101f92d4`.

Papel da fonte: Record separa host/prosa; visibility conservadora/redaction, campos não observados vazios.


Linhas **92–212**; SHA256 do intervalo `965526f75cd3794968fb9b32867d75e7bfb9f31a567bd1aac82b9b9757b2ea4f`:

~~~~typescript
  const recordBundle = Effect.fnUntraced(function* (row: ProjectRow, scratch: string, issues: ReadonlyArray<IssueRow>, label: string) {
    const now = yield* Clock.currentTimeMillis
    // An unknown visibility is treated as public, so free text never reaches a tree that might be.
    const visibility = yield* deps.gh(["api", `repos/${row.github_repo}`, "--jq", ".private"])
    const redact = visibility.exitCode !== 0 || visibility.stdout.trim() !== "true"
    const ids = issues.map((issue) => issue.id)
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const attempts = yield* tx.select().from(BoardAttemptTable).where(inArray(BoardAttemptTable.issue_id, ids)).all()
        const sessions = attempts.flatMap((attempt) => (attempt.session_id ? [attempt.session_id as (typeof SessionTable.$inferSelect)["id"]] : []))
        return {
          attempts,
          activity: yield* tx
            .select()
            .from(BoardActivityTable)
            .where(eq(BoardActivityTable.project_id, row.id))
            .orderBy(asc(BoardActivityTable.time_created), asc(BoardActivityTable.id))
            .all(),
          numbers: yield* tx.select({ id: BoardIssueTable.id, number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, row.id)).all(),
          notes: yield* tx
            .select()
            .from(BoardNoteTable)
            .where(inArray(BoardNoteTable.issue_id, ids))
            .orderBy(asc(BoardNoteTable.time_created), asc(BoardNoteTable.id))
            .all(),
          checks: yield* tx.select().from(BoardCheckTable).where(inArray(BoardCheckTable.issue_id, ids)).all(),
          sessions: sessions.length ? yield* tx.select().from(SessionTable).where(inArray(SessionTable.id, sessions)).all() : [],
          parts: sessions.length
            ? yield* tx
                .select({ session: PartTable.session_id, id: PartTable.id, data: PartTable.data })
                .from(PartTable)
                .where(inArray(PartTable.session_id, sessions))
                .orderBy(asc(PartTable.id))
                .all()
            : [],
        }
      }),
    )
    const iso = (ms: number) => new Date(ms).toISOString()
    const keyOf = (issue: Board.IssueID) => found.numbers.find((item) => item.id === issue)?.number
    yield* Effect.sync(() => {
      const written = new Set(readBoard(scratch).events.map((event) => event.activity))
      found.activity
        .filter((item) => !written.has(item.id))
        .forEach((item) => {
          const number = item.issue_id ? keyOf(item.issue_id) : undefined
          appendBoardEvent(scratch, BoardTree.event(row.key, number ? `${row.key}-${number}` : undefined, item), { redact })
        })
      issues.forEach((issue) => {
        const key = `${row.key}-${issue.number}`
        // readCard's events omit text, which collapses the union; narrow on the fields themselves.
        const seen = new Set(
          readCard(scratch, key).events.flatMap((event) =>
            "thread" in event && "from" in event ? [`${event.at} ${event.thread} ${event.from}`] : [],
          ),
        )
        found.notes
          .filter((note) => note.issue_id === issue.id)
          .forEach((note) => {
            const at = iso(note.time_created)
            if (!note.kind || seen.has(`${at} ${note.kind} ${note.author}`)) return
            appendCardEvent(scratch, key, { kind: "message", thread: note.kind, from: note.author, text: note.body, at }, { redact })
          })
        const own = found.attempts.filter((attempt) => attempt.issue_id === issue.id)
        const recorded = new Set(attemptNumbers(scratch, key))
        const last = Math.max(0, ...own.map((attempt) => attempt.n))
        own
          .filter((attempt) => !recorded.has(attempt.n))
          .forEach((attempt) => {
            const session = found.sessions.find((item) => item.id === attempt.session_id)
            if (!session) return
            const parts = found.parts.filter((part) => part.session === session.id)
            appendAttempt(
              scratch,
              key,
              attempt.n,
              {
                seat: attempt.seat ?? "",
                session: session.id,
                engine: session.model?.providerID ?? "",
                model: session.model?.id ?? "",
                tokensIn: session.tokens_input,
                tokensOut: session.tokens_output + session.tokens_reasoning,
                tokensCache: session.tokens_cache_read + session.tokens_cache_write,
                toolUses: parts.filter((part) => part.data.type === "tool").length,
                wallTime: session.time_updated - session.time_created,
                retries: 0,
                reworks: attempt.n - 1,
                gates: found.checks.filter((check) => check.issue_id === issue.id).map((check) => `${check.kind} ${check.command}`),
                verdict: attempt.n === last ? "landed" : "reworked",
                // The digest of the stored transcript parts; the transcript itself travels with the session archive.
                transcriptSha: createHash("sha256").update(JSON.stringify(parts)).digest("hex") as Parameters<typeof appendAttempt>[3]["transcriptSha"],
                costMicroUsd: Math.round(session.cost * 1_000_000),
              },
              { redact, at: iso(session.time_updated) },
            )
          })
        const record = issue.record
        if (!issue.pr_number || !record) return
        appendLogbookEntry(
          scratch,
          {
            prId: String(issue.pr_number),
            at: iso(now),
            territories: [],
            shipped: record.change?.trim() || record.intent?.trim() || issue.title,
            decisions: record.decisions ?? "",
            tradeoffs: record.not_covered ?? "",
            risks: [record.risk?.level, record.risk?.breaks, record.risk?.undo && `Undo: ${record.risk.undo}`].filter(Boolean).join(". "),
            openThreads: record.follow_ups?.length ? record.follow_ups.join(", ") : "None.",
            links: [key],
          },
          { redact },
        )
        appendMilestone(scratch, { card: key, pr: issue.pr_number })
      })
    })
    yield* git(scratch, ["add", "--", ".atlas"])
    if ((yield* git(scratch, ["diff", "--cached", "--quiet"])).code === 0) return
    yield* git(scratch, [...AUTHOR, "commit", "--quiet", "-m", `chore(queue): record ${label}`])
  })
~~~~


Linhas **215–303**; SHA256 do intervalo `d2456ba5d665d149ae03486df4bd86f23f5541131b598e84c69911b82d03870d`:

~~~~typescript
  const recordOf = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    const now = yield* Clock.currentTimeMillis
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const card = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
        const checks = yield* tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all()
        const attempts = yield* tx.select().from(BoardAttemptTable).where(eq(BoardAttemptTable.issue_id, issue)).orderBy(asc(BoardAttemptTable.n)).all()
        const queued = yield* tx.select().from(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue)).get()
        const bundle = yield* tx
          .select({ n: BoardBundleTable.n, status: BoardBundleTable.status, base: BoardBundleTable.base_sha, head: BoardBundleMemberTable.head_sha })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardBundleTable, eq(BoardBundleTable.id, BoardBundleMemberTable.bundle_id))
          .where(eq(BoardBundleMemberTable.issue_id, issue))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const epic = card?.epic_id
          ? yield* tx.select({ number: BoardEpicTable.number }).from(BoardEpicTable).where(eq(BoardEpicTable.id, card.epic_id)).get()
          : undefined
        const depends = yield* tx
          .select({ number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue))
          .all()
        return { card, checks, attempts, queued, bundle, epic, depends, directory: yield* worktree(tx, row) }
      }),
    )
    const card = found.card
    const record = card?.record
    if (!card || !record?.risk?.level) return undefined
    const head = found.bundle?.head ?? found.queued?.head_sha
    // Against the bundle's base once bundled: after it ships, base already contains the card.
    const numstat =
      head && found.directory
        ? (yield* git(found.directory, ["diff", "--numstat", `${found.bundle?.base ?? `refs/remotes/origin/${base}`}...${head}`])).out
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"))
        : []
    const state =
      card.stage === "shipped" ? "merged" : found.bundle?.status === "open" ? "bundled" : found.queued ? "queued" : "not queued"
    return {
      pr: card.pr_number,
      title: card.title,
      head: head ?? "",
      record: {
        intent: record.intent ?? "",
        change: { text: record.change ?? "", start: [] },
        decisions: record.decisions?.trim() ? [record.decisions] : [],
        notCovered: record.not_covered ?? "",
        risk: { level: record.risk.level, breaks: record.risk.breaks ?? "", notice: "", undo: record.risk.undo ?? "" },
        followUps: record.follow_ups ?? [],
        facts: {
          files: numstat.length,
          added: numstat.reduce((sum, item) => sum + (Number(item[0]) || 0), 0),
          removed: numstat.reduce((sum, item) => sum + (Number(item[1]) || 0), 0),
          packages: [],
          ownUnits: [],
        },
        evidence: {
          doneWhen: [],
          reviews: [],
          checks: found.checks.map((check) => ({
            name: `${check.kind} ${check.command}`,
            state: check.outcome,
            ...(check.url ? { url: check.url } : {}),
          })),
          used: "unseen",
        },
        cost: {
          attempts: found.attempts.map((attempt) => ({ n: attempt.n, cause: attempt.cause ?? "" })),
          ciRuns: found.checks.length,
          ciMinutes: Math.round(
            found.checks.reduce((sum, check) => sum + Math.max(0, (check.ended_at ?? check.started_at) - check.started_at), 0) / 60_000,
          ),
          wallMs: now - card.time_created,
        },
        lineage: {
          card: `${row.key}-${card.number}`,
          ...(found.epic ? { epic: `${row.key}-E${found.epic.number}` } : {}),
          dependsOn: found.depends.map((dep) => `${row.key}-${dep.number}`),
          seats: [...new Set(found.attempts.map((attempt) => attempt.seat).filter((seat) => seat !== null))],
        },
        integration: {
          state,
          ...(found.bundle ? { bundle: `${row.key}-B${found.bundle.n}`, testedOn: found.bundle.base } : {}),
        },
      } satisfies BoardRecord.PrRecord,
    }
~~~~


### `packages/core/src/board/record.ts`

Archive: `sources/packages/core/src/board/record.ts` · bytes: 2988 · Git blob: `754a3d0e90e3fc92349d3080f37ff1d9c4f1a96a` · SHA256: `919161b5e11cf65f1fc0a2f857a63d45b54d56d1bd5b211d13b10794db87faed`.

Papel da fonte: Port Atlas/fallback: texto não se transforma em evidência por estar em um record.


Linhas **10–67**; SHA256 do intervalo `58ceaccc62f8e757bc2a7850c7246f82cd4e60db871446d50c03c4bdebd2f67c`:

~~~~typescript
  readonly pr: (record: PrRecord) => string
  readonly bundle: (record: BundleRecord) => string
  readonly trailer: (trailer: Trailer) => string
}

/** The trailer on a card's merge commit inside a bundle; Atlas's `Trailer` keys the host knows. */
export type Trailer = { readonly WP: string; readonly Attempt: string }

export type RiskLevel = "low" | "medium" | "high"

/** Strings are Markdown written by Maestro; every other field is a host fact. Facts core has no source for stay empty. */
export type PrRecord = {
  readonly intent: string
  readonly change: { readonly text: string; readonly start: ReadonlyArray<string> }
  readonly decisions: ReadonlyArray<string>
  readonly notCovered: string
  readonly risk: { readonly level: RiskLevel; readonly breaks: string; readonly notice: string; readonly undo: string }
  readonly followUps: ReadonlyArray<string>
  readonly facts: {
    readonly files: number
    readonly added: number
    readonly removed: number
    readonly packages: ReadonlyArray<string>
    readonly ownUnits: ReadonlyArray<{ readonly unit: string; readonly skill: string }>
  }
  readonly evidence: {
    readonly doneWhen: ReadonlyArray<{ readonly line: string; readonly command: string; readonly result: string }>
    readonly reviews: ReadonlyArray<{
      readonly kind: string
      readonly verdict: string
      readonly findings: ReadonlyArray<{ readonly at: string; readonly text: string; readonly closed?: string }>
    }>
    readonly checks: ReadonlyArray<{ readonly name: string; readonly state: string; readonly url?: string }>
    readonly used: "as-user" | "unseen"
  }
  readonly cost: {
    readonly attempts: ReadonlyArray<{ readonly n: number; readonly cause: string }>
    readonly ciRuns: number
    readonly ciMinutes: number
    readonly wallMs: number
  }
  readonly lineage: {
    readonly card: string
    readonly epic?: string
    readonly dependsOn: ReadonlyArray<string>
    readonly seats: ReadonlyArray<string>
  }
  readonly integration: { readonly state: string; readonly bundle?: string; readonly testedOn?: string }
}

export type BundleRecord = {
  readonly members: ReadonlyArray<{ readonly title: string; readonly head: string; readonly record: PrRecord }>
  readonly testedOn: string
  readonly skew: number
  readonly ciRuns: number
  readonly ciMinutes: number
  readonly ejections: ReadonlyArray<{ readonly card: string; readonly cause: string }>
}
~~~~


### `packages/core/src/board/tree.ts`

Archive: `sources/packages/core/src/board/tree.ts` · bytes: 19770 · Git blob: `9a14e96aa37e6135380b730025756b0e80bfe661` · SHA256: `68edc94c79b05a0225c269efd0a8550ba05def07d4b8f9492766676eef99a8ed`.

Papel da fonte: Replay em banco vazio de atividades de plano; exclui estado operacional/arquivos.


Linhas **21–99**; SHA256 do intervalo `ba1f55be9927ec7c096f475f7b16fc7a1d29cbdc4a5689eaa521a876c085e665`:

~~~~typescript
// The board log in the record tree (`.atlas/board`) and the import that rebuilds the board from it. Import restores
// projects, epics, issues, steps, dependencies, questions, decisions, notes and the activity log itself. The queue,
// bundles, attempts, checks and GitHub sync state are re-derived from git, GitHub and the card records, so import leaves
// them empty. Attachments are left out on purpose: their bytes and secrets never enter the log.

export class UnknownActionError extends Schema.TaggedErrorClass<UnknownActionError>()("BoardTree.UnknownActionError", {
  activity: Schema.String,
  action: Schema.String,
}) {}

export class ReplayError extends Schema.TaggedErrorClass<ReplayError>()("BoardTree.ReplayError", {
  activity: Schema.String,
  message: Schema.String,
}) {}

// Free text a board write may hold; the log keeps it out of `before` and `after` so a public tree can drop it.
const PROSE = ["description", "body", "reason", "text", "question", "answer", "answer_text", "record", "cause", "options", "cost_of_waiting", "paused_reason", "crash_reason"]
// A prose value that is not a string travels as JSON under this suffix, so import can parse it back.
const JSON_SUFFIX = ".json"

/** The board event for one activity row; `issue` is the card key when the row names an issue. */
export function event(project: string, issue: string | undefined, row: ActivityRow): BoardEventInput {
  const text = prose(row)
  return {
    activity: row.id,
    project,
    ...(issue ? { issue } : {}),
    actor: row.actor,
    action: row.action,
    at: new Date(row.time_created).toISOString(),
    ...(row.before ? { before: structure(row.before) } : {}),
    ...(row.after ? { after: structure(row.after) } : {}),
    ...(row.undoes ? { undoes: row.undoes } : {}),
    ...(Object.keys(text).length > 0 ? { text } : {}),
  }
}

/** Rebuilds the board of an empty database from the record tree at `repoPath`. */
export const restore = Effect.fnUntraced(function* (tx: Tx, repoPath: string) {
  if (yield* tx.select({ id: BoardProjectTable.id }).from(BoardProjectTable).get())
    return yield* new ReplayError({ activity: "", message: "Import needs an empty board." })
  // Ids are minted in order within a millisecond, so they break ties inside one; across milliseconds they can wrap.
  const events = readBoard(repoPath).events.toSorted((a, b) => (a.at === b.at ? a.activity.localeCompare(b.activity) : a.at.localeCompare(b.at)))
  const cards = new Map<string, Board.IssueID>()
  for (const item of events) {
    const apply = APPLIERS[item.action as Board.Action]
    if (!apply) return yield* new UnknownActionError({ activity: item.activity, action: item.action })
    const redacted = item.text === undefined && item.textHash !== undefined
    const before = merge(item.before, item.text, "before")
    const after = merge(item.after, item.text, "after")
    const ctx = { tx, item, before, after, at: Date.parse(item.at), cards, project: yield* projectOf(tx, item) }
    yield* apply(ctx)
    const project = ctx.project ?? (yield* projectOf(tx, item))
    if (!project) return yield* new ReplayError({ activity: item.activity, message: `Project ${item.project} does not exist.` })
    yield* tx
      .insert(BoardActivityTable)
      .values({
        id: item.activity as Board.ActivityID,
        project_id: project.id,
        issue_id: item.issue ? (cards.get(item.issue) ?? null) : null,
        actor: item.actor as Board.Actor,
        action: item.action as Board.Action,
        // A public tree carries only the prose's hash; the gap stays visible in the log.
        reason: redacted ? `[redacted ${item.textHash}]` : (item.text?.reason ?? null),
        before,
        after,
        undoes: (item.undoes as Board.ActivityID | undefined) ?? null,
        time_created: ctx.at,
      })
      .run()
    if (item.undoes)
      yield* tx
        .update(BoardActivityTable)
        .set({ undone_by: item.activity as Board.ActivityID })
        .where(eq(BoardActivityTable.id, item.undoes as Board.ActivityID))
        .run()
  }
  return events.length
})
~~~~


Linhas **140–179**; SHA256 do intervalo `b63837e0833b939fed6778daae8b07a8e464b0e88b000e39d6ae59e24b4d81cc`:

~~~~typescript
const APPLIERS: Record<Board.Action, (ctx: Context) => Effect.Effect<void, ReplayError | EffectDrizzleQueryError>> = {
  "project.upsert": Effect.fnUntraced(function* (ctx) {
    if (ctx.project) return yield* updateProject(ctx)
    yield* ctx.tx
      .insert(BoardProjectTable)
      .values({
        id: Board.ProjectID.create(),
        key: ctx.item.project,
        name: String(ctx.after?.name ?? ctx.item.project),
        goal: String(ctx.after?.goal ?? ""),
        target_date: (ctx.after?.target_date as number | null | undefined) ?? null,
        github_repo: (ctx.after?.github_repo as string | null | undefined) ?? null,
        status: "active",
        github_state: "off",
        next_issue_number: 1,
        next_epic_number: 1,
      })
      .run()
  }),
  "epic.upsert": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    const id = String(ctx.after?.id ?? ctx.before?.id) as Board.EpicID
    if (ctx.before) {
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    const number = Number(ctx.after?.number)
    yield* ctx.tx
      .insert(BoardEpicTable)
      .values({
        id,
        project_id: project.id,
        number,
        title: String(ctx.after?.title ?? ""),
        goal: String(ctx.after?.goal ?? ""),
        position: Number(ctx.after?.position ?? number),
        status: (ctx.after?.status as Board.Epic["status"] | undefined) ?? "open",
      })
      .run()
    yield* ctx.tx
~~~~


Linhas **212–237**; SHA256 do intervalo `c8cc7a64c652a917ede9c7c79c0b2880ddd43572cd2a8b0f7eb3627fde55aa6c`:

~~~~typescript
      .set({ next_issue_number: Math.max(project.next_issue_number, number + 1) })
      .where(eq(BoardProjectTable.id, project.id))
      .run()
    ctx.cards.set(`${project.key}-${number}`, id)
    if (Array.isArray(ctx.after?.depends_on)) yield* dependencies(ctx, id, ctx.after.depends_on)
  }),
  "issue.update": (ctx) => issueFields(ctx),
  "issue.move": (ctx) => issueFields(ctx),
  "intake.accept": (ctx) => issueFields(ctx),
  "intake.decline": (ctx) => issueFields(ctx),
  "hold.set": (ctx) => issueFields(ctx),
  "queue.add": (ctx) => issueFields(ctx),
  "queue.remove": (ctx) => issueFields(ctx),
  "bundle.merge": (ctx) => issueFields(ctx),
  // A dissolve by eject sends the card back to review; a plain dissolve names only the bundle.
  "bundle.dissolve": (ctx) => issueFields(ctx),
  "bundle.cut": nothing,
  "pause.set": (ctx) => (ctx.item.issue ? issueFields(ctx) : updateProject(ctx)),
  "archive.set": (ctx) => updateProject(ctx),
  "steps.set": Effect.fnUntraced(function* (ctx) {
    yield* steps(ctx, yield* requireIssue(ctx), ctx.after?.steps)
  }),
  "question.ask": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    yield* ctx.tx
      .insert(BoardQuestionTable)
~~~~


Linhas **283–306**; SHA256 do intervalo `dd20f8e32b938bdd9a83e37746f965e4bfc760ea096c789acad4240e176ff130`:

~~~~typescript
      .update(BoardQuestionTable)
      .set({ status: "answered", answer_option: chosen, answer_text: chosenText, answered_at: ctx.at })
      .where(eq(BoardQuestionTable.id, question))
      .run()
    yield* ctx.tx
      .insert(BoardDecisionTable)
      .values({
        id: decision,
        project_id: row.project_id,
        issue_id: row.issue_id,
        epic_id: row.epic_id,
        question_id: question,
        question: row.text,
        options: row.options,
        recommended: row.recommended,
        chosen,
        chosen_text: chosenText,
        answered_by: "owner",
        answered_at: ctx.at,
        supersedes_id: standing?.id ?? null,
      })
      .run()
    if (standing)
      yield* ctx.tx.update(BoardDecisionTable).set({ overturned_by_id: decision }).where(eq(BoardDecisionTable.id, standing.id)).run()
~~~~


Linhas **344–367**; SHA256 do intervalo `9439b226ab47eac81341533d07b51e48edd1f4878b07927823f54fe7c4743d25`:

~~~~typescript
      .where(eq(BoardActivityTable.id, String(ctx.item.undoes) as Board.ActivityID))
      .get()
    if (!target) return yield* new ReplayError({ activity: ctx.item.activity, message: `Undo target ${ctx.item.undoes} is not in the log.` })
    if (target.action === "question.withdraw") {
      yield* ctx.tx
        .update(BoardQuestionTable)
        .set({ status: ctx.after?.status === "withdrawn" ? "withdrawn" : "open" })
        .where(eq(BoardQuestionTable.id, String(target.after?.id ?? target.before?.id) as Board.QuestionID))
        .run()
      return
    }
    if (target.action === "epic.upsert") {
      const id = String(target.after?.id ?? target.before?.id) as Board.EpicID
      if (!ctx.after) return yield* Effect.asVoid(ctx.tx.delete(BoardEpicTable).where(eq(BoardEpicTable.id, id)).run())
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    if (!ctx.item.issue || !ctx.after) return
    const issue = yield* requireIssue(ctx)
    if (Array.isArray(ctx.after.steps)) yield* steps(ctx, issue, ctx.after.steps)
    if (Array.isArray(ctx.after.depends_on)) yield* dependencies(ctx, issue, ctx.after.depends_on)
    yield* issueFields(ctx)
  }),
}
~~~~


Linhas **404–414**; SHA256 do intervalo `1c7f78635ecd76a85a5e3d9fcf3e2eca6124ea0c921aeeabc19f4e6af06c62b1`:

~~~~typescript
const dependencies = Effect.fnUntraced(function* (ctx: Context, issue: Board.IssueID, refs: ReadonlyArray<unknown>) {
  const project = yield* requireProject(ctx)
  yield* ctx.tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue)).run()
  // Older rows logged a bare number; the board resolved it inside the card's own project.
  const targets = refs.flatMap((ref) => {
    const key = /^\d+$/.test(String(ref)) ? `${project.key}-${ref}` : String(ref)
    const id = ctx.cards.get(key)
    return id && id !== issue ? [{ issue_id: issue, depends_on_id: id }] : []
  })
  if (targets.length > 0) yield* ctx.tx.insert(BoardDependencyTable).values(targets).run()
})
~~~~


Linhas **440–472**; SHA256 do intervalo `be339b4cd8928f00fa94282a581d8cf1e06537ec79f0da5753a106a4c3744eae`:

~~~~typescript
function prose(row: Pick<ActivityRow, "reason" | "before" | "after">) {
  const sides = [
    ["before", row.before],
    ["after", row.after],
  ] as const
  return Object.fromEntries([
    ...(row.reason ? [["reason", row.reason]] : []),
    ...sides.flatMap((side) =>
      Object.entries(side[1] ?? {})
        .filter((entry) => PROSE.includes(entry[0]) && entry[1] !== undefined)
        .map((entry) =>
          typeof entry[1] === "string" ? [`${side[0]}.${entry[0]}`, entry[1]] : [`${side[0]}.${entry[0]}${JSON_SUFFIX}`, JSON.stringify(entry[1])],
        ),
    ),
  ])
}

// Puts a side's prose back into its structure. Without text (a public tree) the prose keys stay absent.
function merge(side: BoardEvent["before"], text: BoardEvent["text"], name: "before" | "after"): Fields | null {
  if (!side && !Object.keys(text ?? {}).some((key) => key.startsWith(`${name}.`))) return null
  const prefix = `${name}.`
  return {
    ...side,
    ...Object.fromEntries(
      Object.entries(text ?? {})
        .filter((entry) => entry[0].startsWith(prefix))
        .map((entry) => {
          const key = entry[0].slice(prefix.length)
          return key.endsWith(JSON_SUFFIX) ? [key.slice(0, -JSON_SUFFIX.length), JSON.parse(entry[1])] : [key, entry[1]]
        }),
    ),
  }
}
~~~~


## B13 — Proof e ledger: origem de fatos e ausência

Vínculo: `body.md` §7, 9; archive de evidência: `evidence.md`, seção `B13`.


### `packages/core/src/board/proof.ts`

Archive: `sources/packages/core/src/board/proof.ts` · bytes: 2553 · Git blob: `6bd1374e707dd7f80975f37e2c03e02a9ee97a95` · SHA256: `6451c593372c579f0a2e116adc25fc824b1240519ad9110b6637d63935ba2608`.

Papel da fonte: Combina fato PR/CI vivo e registros; verificado em instante, sem fabricar CI quando falha.


Linhas **11–65**; SHA256 do intervalo `527c7678c22f477cd2d52e42a217719b80ac2b55741c4fe4b3689797508d1d22`:

~~~~typescript
// What backs a card's status. The stored half is read in a transaction; the live half (PR, checks) comes from the trail.

const ATTEMPTS = 3

export const load = Effect.fnUntraced(function* (tx: Tx, key: string, number: number) {
  const project = yield* loadProject(tx, key)
  const row = yield* loadIssue(tx, project, number)
  const known = yield* numbers(tx, project)
  const decided = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(and(eq(BoardDecisionTable.issue_id, row.id), isNull(BoardDecisionTable.overturned_by_id)))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .limit(1)
    .get()
  return { project, row, directory: yield* worktree(tx, project), decided: decided ? toDecision(decided, known) : null }
})

type Loaded = Effect.Success<ReturnType<typeof load>>

export function build(key: string, loaded: Loaded, live: Board.Trail, summary: string | null) {
  const rule = loaded.row.guardrail_rule
  return {
    issue: loaded.row.number,
    ref: `${key}-${loaded.row.number}`,
    banner:
      loaded.project.github_state === "signed_out" || live.state === "signed_out"
        ? "GitHub sign-in expired. Sign in with gh to refresh pull request and CI status."
        : null,
    pr:
      live.state === "ok"
        ? {
            number: live.pr.number,
            state: live.pr.state,
            merged: live.pr.merged,
            commits: live.pr.commits.length,
            lastSha: live.pr.commits.at(-1)?.hash ?? null,
          }
        : null,
    ci:
      live.state === "ok"
        ? { checks: live.pr.checks, failing: live.pr.checks.find((check) => failed(check.conclusion))?.name ?? null }
        : null,
    attempts: { n: loaded.row.attempts, of: ATTEMPTS },
    guardrail: rule ? { rule, summary } : null,
    crashReason: loaded.row.crash_reason,
    verifiedAt: live.state === "ok" ? (live.verifiedAt ?? null) : null,
    decidedBy: loaded.decided,
  } satisfies Board.Proof
}

/** A check conclusion that is neither a pass nor a skip. */
export function failed(conclusion: string | null) {
  return conclusion !== null && !["success", "neutral", "skipped"].includes(conclusion.toLowerCase())
}
~~~~


### `packages/core/src/board/ledger.ts`

Archive: `sources/packages/core/src/board/ledger.ts` · bytes: 3914 · Git blob: `282e862105def593673fa404ca9ce87991b31fe2` · SHA256: `07f029330ac42176b6bac035d8fdbc2d81d72decd6b83004b6a9627e02351b2c`.

Papel da fonte: Métricas derivadas das rows disponíveis, medianas e null por falta de base.


Linhas **11–94**; SHA256 do intervalo `f171213d8e4a678b31f144b8c32914c7990f472db44cba00fa5005589632ba81`:

~~~~typescript
  const merges = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(
      and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "bundle.merge"), isNotNull(BoardActivityTable.issue_id)),
    )
    .all()
  const adds = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "queue.add"), isNotNull(BoardActivityTable.issue_id)))
    .orderBy(asc(BoardActivityTable.time_created))
    .all()
  const checks = yield* tx
    .select({ issue: BoardCheckTable.issue_id, ended: BoardCheckTable.ended_at })
    .from(BoardCheckTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardCheckTable.issue_id))
    .where(
      and(
        eq(BoardIssueTable.project_id, project.id),
        eq(BoardCheckTable.kind, "scoped"),
        eq(BoardCheckTable.outcome, "pass"),
        isNotNull(BoardCheckTable.ended_at),
      ),
    )
    .all()
  const outcomes = yield* settled(tx, project.id)
  const shipped = yield* tx
    .select({ id: BoardIssueTable.id })
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, "shipped")))
    .all()
  const attempts =
    shipped.length === 0
      ? []
      : yield* tx
          .select({ issue: BoardAttemptTable.issue_id })
          .from(BoardAttemptTable)
          .where(inArray(BoardAttemptTable.issue_id, shipped.map((row) => row.id)))
          .all()

  const queueWait = median(
    merges.flatMap((merge) => {
      const added = adds.filter((add) => add.issue === merge.issue && add.at <= merge.at).at(-1)
      return added ? [merge.at - added.at] : []
    }),
  )
  const leadTime = median(
    merges.flatMap((merge) => {
      const passed = checks.flatMap((check) =>
        check.issue === merge.issue && check.ended !== null && check.ended <= merge.at ? [check.ended] : [],
      )
      return passed.length === 0 ? [] : [merge.at - Math.min(...passed)]
    }),
  )
  const ejected = outcomes.filter((outcome) => outcome === "ejected").length
  return {
    queueWait,
    redRate: outcomes.length === 0 ? null : ejected / outcomes.length,
    reworkRate: attempts.length === 0 ? null : attempts.length / shipped.length,
    leadTime,
  } satisfies Board.Ledger
})

/** The outcomes of the project's last 50 settled attempts: the red rate and the bundle size both read them. */
export const settled = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow["id"]) {
  const rows = yield* tx
    .select({ outcome: BoardAttemptTable.outcome })
    .from(BoardAttemptTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardAttemptTable.issue_id))
    .where(and(eq(BoardIssueTable.project_id, project), inArray(BoardAttemptTable.outcome, ["merged", "ejected"])))
    .orderBy(desc(BoardAttemptTable.time_updated))
    .limit(50)
    .all()
  return rows.map((row) => row.outcome)
})

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}
~~~~


## S01 — Duas políticas e identidades persistidas

Vínculo: `body.md` §10; archive de evidência: `evidence.md`, seção `S01`.


### `packages/core/src/scheduled-task/shared.ts`

Archive: `sources/packages/core/src/scheduled-task/shared.ts` · bytes: 4949 · Git blob: `b997b9d2bb4246d3101c243fe0217ce9fcc30885` · SHA256: `b7ca14671135a068909b9163fa8c21d1ce2487f5d54d08e09adcd7585acf5540`.

Papel da fonte: Claim/Outcome e insert IDs determinísticos com slot/revisão/manual key.


Linhas **14–85**; SHA256 do intervalo `da6fb4b8a07dd11eafbdeb9f36529c94153cdd52dfd34e5e01ac118c5215cc03`:

~~~~typescript
  id: Schema.String,
}) {}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("ScheduledTask.InvalidError", {
  field: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ScheduledTask.ConflictError", {
  id: Schema.String,
}) {}

export class RunError extends Schema.TaggedErrorClass<RunError>()("ScheduledTask.RunError", {
  reason: Schema.String,
}) {}

export type Task = typeof ScheduledTaskTable.$inferSelect
export type LegacyTask = Task & { cadence: ScheduledTask.Cadence }
export type RunRow = typeof ScheduledTaskRunTable.$inferSelect
export type Claim = {
  readonly id: string
  readonly task: Task
  readonly sessionID: SessionV2.ID
  readonly messageID: SessionMessage.ID
  readonly prompt: string
}
export type Outcome =
  | { type: "started"; sessionID: SessionV2.ID }
  | { type: "failed"; error: string }
  | { type: "revoked" }
  | { type: "void" }

export const LEGACY = eq(ScheduledTaskTable.policy, "legacy-browser")

export type Store = ReturnType<typeof store>

// The rows both policies share. `lease` marks this process's claims: a restarted process takes its old claims
// over once their lease ends.
export function store(db: Database.Interface["db"], lease: string) {
  const immediate = <A, E>(effect: Effect.Effect<A, E>) =>
    db.transaction(() => effect, { behavior: "immediate" }).pipe(Effect.orDie)

  // A directory-scoped lookup serves the legacy routes, which never see capability rows.
  const find = (id: ScheduledTask.ID, directory?: AbsolutePath) =>
    db
      .select()
      .from(ScheduledTaskTable)
      .where(
        directory
          ? and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), LEGACY)
          : eq(ScheduledTaskTable.id, id),
      )
      .get()

  const lastRuns = (tasks: Task[]) =>
    tasks.length === 0
      ? Effect.succeed([])
      : db
          .select()
          .from(ScheduledTaskRunTable)
          .where(
            and(
              inArray(
                ScheduledTaskRunTable.task_id,
                tasks.map((task) => task.id),
              ),
              inArray(ScheduledTaskRunTable.state, ["started", "failed"]),
            ),
          )
          .orderBy(desc(ScheduledTaskRunTable.time_settled))
          .all()
          .pipe(Effect.orDie)
~~~~


Linhas **94–144**; SHA256 do intervalo `44ca91ffd937bb3791a931e9078a65e653287ccd20e854cf11adc5cd1bb3cd7e`:

~~~~typescript
  const claim = Effect.fn("ScheduledTask.claim")(function* (
    task: Task,
    slot: number | undefined,
    now: number,
    manualKey?: string,
  ) {
    // Capability IDs derive from (task, revision, slot) or the manual key, so an edit never reuses a Session.
    const ids =
      task.policy === "capability"
        ? ScheduledTaskModel.slotIDs(
            slot === undefined ? `${task.id}:manual:${manualKey}` : `${task.id}:${task.revision}`,
            slot ?? task.time_created,
          )
        : slot === undefined
          ? undefined
          : ScheduledTaskModel.slotIDs(task.id, slot)
    const claimed = {
      id: crypto.randomUUID(),
      task,
      sessionID: ids ? SessionV2.ID.make(ids.session) : SessionV2.ID.create(),
      messageID: ids ? SessionMessage.ID.make(ids.message) : SessionMessage.ID.create(),
      prompt: task.prompt,
    }
    yield* db
      .insert(ScheduledTaskRunTable)
      .values({
        id: claimed.id,
        task_id: task.id,
        slot: slot ?? null,
        revision: task.revision,
        manual_key: manualKey ?? null,
        state: "running",
        session_id: claimed.sessionID,
        message_id: claimed.messageID,
        prompt: claimed.prompt,
        owner: lease,
        time_claimed: now,
      })
      .run()
    return claimed
  })

  return { db, lease, immediate, find, lastRuns, advance, claim }
}

export function toRun(run: RunRow): ScheduledTask.Run {
  const time = run.time_settled ?? run.time_claimed
  const slot = run.slot === null ? {} : { slot: run.slot }
  if (run.state === "failed") return { outcome: "failed", time, ...slot, error: run.error ?? "" }
  return { outcome: "started", time, ...slot, sessionID: run.session_id }
}
~~~~


### `packages/core/src/scheduled-task/sql.ts`

Archive: `sources/packages/core/src/scheduled-task/sql.ts` · bytes: 3559 · Git blob: `f7b58d09202d0eb4026623b587363798a0908874` · SHA256: `822bcafeaf764d56be959c3c5184e2e3e76bbca52ae6c678477728e0df3899a7`.

Papel da fonte: Policy, owner, revision e unicidades task/revision/slot e manual key.


Linhas **10–76**; SHA256 do intervalo `4697f568e4e41f6c333e807b847d490680fff0a5f05b1c3b57775e32af6e15e6`:

~~~~typescript
  "scheduled_task",
  {
    id: text().$type<ScheduledTask.ID>().primaryKey(),
    directory: absoluteColumn().notNull(),
    name: text().notNull(),
    prompt: text().notNull(),
    // Capability rows add interval and cron. Weekly capability rows encode `day * 1440 + minute of day` in `minute`.
    cadence: text().$type<ScheduledTask.Cadence | "interval" | "cron">().notNull(),
    timezone: text().notNull(),
    minute: integer().notNull(),
    next: integer().notNull(),
    enabled: integer({ mode: "boolean" }).notNull(),
    runs: integer().notNull(),
    missed: integer(),
    // Capability schedules (schedule_manage) carry an owner and a revision; legacy-browser tasks keep the
    // imported device semantics and stay invisible to the capability leaf.
    policy: text().$type<"legacy-browser" | "capability">().notNull().default("legacy-browser"),
    revision: integer().notNull().default(0),
    owner: text({ mode: "json" }).$type<Capability.Owner>(),
    interval_minutes: integer(),
    cron: text(),
    catch_up: text().$type<"latest" | "skip">(),
    repeat_limit: integer(),
    // Slots never run because a later slot overtook them or the catch-up policy skipped them.
    skipped: integer().notNull().default(0),
    disabled_reason: text().$type<"exhausted" | "owner-missing">(),
    ...Timestamps,
  },
  (table) => [
    index("scheduled_task_directory_idx").on(table.directory),
    index("scheduled_task_due_idx").on(table.enabled, table.next),
  ],
)

// One row per run. A slot run is unique per task and slot, which is what keeps a slot to one run across
// ticks, Run now, processes sharing the database and restarts. Extra runs (Run now) have no slot.
export const ScheduledTaskRunTable = sqliteTable(
  "scheduled_task_run",
  {
    id: text().primaryKey(),
    task_id: text()
      .$type<ScheduledTask.ID>()
      .notNull()
      .references(() => ScheduledTaskTable.id, { onDelete: "cascade" }),
    slot: integer(),
    // Slot runs are unique per task, revision and slot; an edit starts a new revision.
    revision: integer().notNull().default(0),
    // Manual runs of capability schedules dedupe on the caller's key; they never consume a slot.
    manual_key: text(),
    state: text().$type<"running" | "started" | "failed" | "revoked">().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    // What a running claim dispatches, so a claim taken over after a crash retries the exact prompt.
    // Runs imported from device storage do not know them.
    message_id: text().$type<SessionMessage.ID>(),
    prompt: text(),
    error: text(),
    // Process that holds a running claim; a claim older than its lease may be taken over.
    owner: text(),
    time_claimed: integer().notNull(),
    time_settled: integer(),
  },
  (table) => [
    uniqueIndex("scheduled_task_run_slot_idx").on(table.task_id, table.revision, table.slot),
    uniqueIndex("scheduled_task_run_manual_idx").on(table.task_id, table.manual_key),
    index("scheduled_task_run_state_idx").on(table.state, table.time_claimed),
  ],
)
~~~~


### `packages/core/src/scheduled-task/port.ts`

Archive: `sources/packages/core/src/scheduled-task/port.ts` · bytes: 2092 · Git blob: `8ea347436e18a93f8dc43926c7fb84108fc0a20c` · SHA256: `5fb969a9e8a030b02e31ff1678e1e0c2887c4e30c3078a5016642131de95ead7`.

Papel da fonte: Port vinculado a Scope evita ciclo de imports; restaura vínculo anterior.


Linhas **1–41**; SHA256 do intervalo `5fb969a9e8a030b02e31ff1678e1e0c2887c4e30c3078a5016642131de95ead7`:

~~~~typescript
export * as ScheduledTaskPort from "./port"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import type { ScheduledTaskCapability } from "./capability"

// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.succeed(Service, Service.of({
    create: (owner, input) => Effect.flatMap(current, (api) => api.create(owner, input)),
    list: (owner) => Effect.flatMap(current, (api) => api.list(owner)),
    placed: (placement) => Effect.flatMap(current, (api) => api.placed(placement)),
    get: (owner, id) => Effect.flatMap(current, (api) => api.get(owner, id)),
    update: (owner, id, input) => Effect.flatMap(current, (api) => api.update(owner, id, input)),
    pause: (owner, id) => Effect.flatMap(current, (api) => api.pause(owner, id)),
    resume: (owner, id) => Effect.flatMap(current, (api) => api.resume(owner, id)),
    remove: (owner, id) => Effect.flatMap(current, (api) => api.remove(owner, id)),
    run: (owner, id, key) => Effect.flatMap(current, (api) => api.run(owner, id, key)),
  })),
  deps: [],
})
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.

Papel da fonte: Owner exato Session/agent/project/location versus placed operator.


Linhas **26–87**; SHA256 do intervalo `d19ba3a800783cb9c599163494df45c2612afbbbc4a7def4a9fe8fd1f64444da`:

~~~~typescript
/**
 * Capability schedules (schedule_manage). Every call is scoped to `owner`: a schedule owned by anyone else
 * is NotFound, exactly like an unknown ID. The legacy methods never see these rows.
 */
export interface Interface {
  readonly create: (
    owner: Capability.Owner,
    input: CapabilityCreate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.InvalidError>
  readonly list: (owner: Capability.Owner) => Effect.Effect<Schedule[]>
  /** Every capability schedule of the placement with its owner, for the operator surface; never a caller-scoped read. */
  readonly placed: (
    placement: Pick<Capability.Owner, "projectID" | "location">,
  ) => Effect.Effect<{ owner: Capability.Owner; schedule: Schedule }[]>
  readonly get: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Bumps the revision, recomputes `next`, and revokes claims of older revisions not yet admitted. */
  readonly update: (
    owner: Capability.Owner,
    id: ID,
    input: CapabilityUpdate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly pause: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Rolls to the next future slot; a past once or an exhausted repeat cannot resume. */
  readonly resume: (
    owner: Capability.Owner,
    id: ID,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly remove: (owner: Capability.Owner, id: ID) => Effect.Effect<void, ScheduledTaskShared.NotFoundError>
  /** Manual run deduped on `manualKey`: a retry returns the same Session. Never moves `next` or counts. */
  readonly run: (
    owner: Capability.Owner,
    id: ID,
    manualKey: string,
  ) => Effect.Effect<
    { sessionID: SessionV2.ID; reused: boolean },
    ScheduledTaskShared.NotFoundError | ScheduledTaskShared.RunError
  >
}

// Capability halves of the Service layer. `plan`, `holds` and `present` serve the shared claim, dispatch and
// settle path; `api` builds the public methods once that path exists.
export function make(store: ScheduledTaskShared.Store, sessions: SessionV2.Interface) {
  const { db, lease, immediate, find, lastRuns, advance, claim } = store

  const owned = (owner: Capability.Owner, id: ID) =>
    find(id).pipe(Effect.map((task) => (task && sameOwner(task, owner) ? task : undefined)))

  const schedules = Effect.fn("ScheduledTask.schedules")(function* (tasks: Task[]) {
    const runs = yield* lastRuns(tasks)
    return tasks.map((task) =>
      toSchedule(
        task,
        runs.find((run) => run.task_id === task.id),
      ),
    )
  })

  const getOwned = Effect.fn("ScheduledTask.getOwned")(function* (owner: Capability.Owner, id: ID) {
    const task = yield* owned(owner, id).pipe(Effect.orDie)
    if (!task) return yield* new ScheduledTaskShared.NotFoundError({ id })
    return (yield* schedules([task]))[0]!
  })
~~~~


Linhas **147–157**; SHA256 do intervalo `0ee18d68e963ebff15fe7a48490f6bd49449bbc5c9a283919bb4a635fbcb2df1`:

~~~~typescript
  const present = (owner: Capability.Owner) =>
    sessions.get(owner.sessionID).pipe(
      Effect.map(
        (session) =>
          session.projectID === owner.projectID &&
          session.location.directory === owner.location.directory &&
          session.location.workspaceID === owner.location.workspaceID &&
          session.agent === owner.agentID,
      ),
      Effect.catchTag("Session.NotFoundError", () => Effect.succeed(false)),
    )
~~~~


Linhas **238–268**; SHA256 do intervalo `340db3d906d443b472c27d7b995a1f13f61e7959eb2119941eb60f3d775300c8`:

~~~~typescript
    list: Effect.fn("ScheduledTask.capability.list")(function* (owner) {
      const tasks = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(eq(ScheduledTaskTable.directory, owner.location.directory), eq(ScheduledTaskTable.policy, "capability")),
        )
        .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
        .all()
        .pipe(Effect.orDie)
      return yield* schedules(tasks.filter((task) => sameOwner(task, owner)))
    }),
    placed: Effect.fn("ScheduledTask.capability.placed")(function* (placement) {
      const tasks = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(eq(ScheduledTaskTable.directory, placement.location.directory), eq(ScheduledTaskTable.policy, "capability")),
        )
        .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
        .all()
        .pipe(Effect.orDie)
      const found = tasks.flatMap((task) => {
        const owner = task.policy === "capability" ? task.owner : null
        if (!owner || owner.projectID !== placement.projectID || owner.location.directory !== placement.location.directory ||
          owner.location.workspaceID !== placement.location.workspaceID) return []
        return [{ task, owner }]
      })
      const listed = yield* schedules(found.map((item) => item.task))
      return found.map((item, index) => ({ owner: item.owner, schedule: listed[index]! }))
    }),
~~~~


Linhas **384–394**; SHA256 do intervalo `c0ef15fab7ce45caf1bf6f0ea12dbebff6a76cc0ca84476bcca8559bf9a2cbef`:

~~~~typescript
function sameOwner(task: Task, owner: Capability.Owner) {
  const stored = task.policy === "capability" ? task.owner : null
  return (
    stored !== null &&
    stored.sessionID === owner.sessionID &&
    stored.agentID === owner.agentID &&
    stored.projectID === owner.projectID &&
    stored.location.directory === owner.location.directory &&
    stored.location.workspaceID === owner.location.workspaceID
  )
}
~~~~


## S02 — Política legacy e DST

Vínculo: `body.md` §10, 11; archive de evidência: `evidence.md`, seção `S02`.


### `packages/core/src/scheduled-task/model.ts`

Archive: `sources/packages/core/src/scheduled-task/model.ts` · bytes: 6670 · Git blob: `a5560b15853e2941c31bf9e803560bbea0c24c4e` · SHA256: `f29962a40bd89bca23cff892d3ff01fcfa8e660b390c4831c88ca7cc695f0b5d`.

Papel da fonte: Cadência once/daily/weekly, catch-up e DST compatible, IDs task/slot.


Linhas **8–103**; SHA256 do intervalo `ac1e83abb73708355a2a25c428e4959ea1f0bfe65d9d8f5287012e6fc7374028`:

~~~~typescript
// The part of a task that decides when it runs. `minute` is the intended local time of day in `timezone`;
// daily and weekly slots are rebuilt from it, so a slot moved by a DST gap does not drag later slots with it.
export type Timing = {
  readonly cadence: ScheduledTask.Cadence
  readonly minute: number
  readonly timezone: string
  readonly next: number
  readonly enabled: boolean
  readonly missed?: number
}

export type Plan = { type: "wait" } | { type: "run"; slot: number; missed?: number } | { type: "skip"; slot: number }

const HOUR = 3_600_000
const DAY = 24 * HOUR
const LATE = DAY

// What the scheduler owes a task at `now`. Only the latest due slot can run; older slots were overtaken
// and count as missed. A one-off or weekly slot more than a day late is skipped, never caught up. Hourly
// and daily slots are always within one cadence of the next slot.
export function plan(task: Timing, now: number): Plan {
  if (!task.enabled || task.next > now) return { type: "wait" }
  if (task.cadence === "once")
    return now - task.next > LATE ? { type: "skip", slot: task.next } : { type: "run", slot: task.next }
  const slot = previous(task, task.cadence, following(task, task.cadence, task.next, now))
  if (task.cadence === "weekly" && now - slot > LATE) return { type: "skip", slot }
  if (slot === task.next) return { type: "run", slot }
  return { type: "run", slot, missed: previous(task, task.cadence, slot) }
}

// A run whose prompt was admitted. A run that served `slot` moves the task past it; an extra run (Run now
// with no due slot, or a slot rescheduled while it ran) only rolls a slot that is already behind `time`.
// One-off tasks pause.
export function recordRun<T extends Timing>(task: T, run: { time: number; slot?: number; missed?: number }): T {
  const from = run.slot ?? task.next
  return {
    ...task,
    missed: run.slot === undefined ? task.missed : run.missed,
    enabled: task.cadence === "once" ? false : task.enabled,
    next: task.cadence === "once" ? task.next : following(task, task.cadence, from, run.time),
  }
}

export function skipRun<T extends Timing>(task: T, slot: number, now: number): T {
  if (task.cadence === "once") return { ...task, missed: slot, enabled: false }
  return { ...task, missed: slot, next: following(task, task.cadence, slot, now) }
}

// A one-off task whose time has passed cannot resume; it needs a new future time first.
export function canResume(task: Timing, now: number) {
  return task.cadence !== "once" || task.next > now
}

export function resume<T extends Timing>(task: T, now: number): T {
  if (task.cadence === "once") return { ...task, enabled: true }
  return { ...task, enabled: true, next: following(task, task.cadence, task.next, now) }
}

// First slot after `now`, stepping from slot `from`. Hourly slots are absolute hours. Daily and weekly slots
// are calendar days at `minute` in the task's zone: a time that does not exist (spring-forward gap) runs at
// the same offset after the gap that day only, and an ambiguous time (fall-back) runs once, at its first
// occurrence.
export function following(zone: { minute: number; timezone: string }, cadence: Recurring, from: number, now: number) {
  if (from > now) return from
  if (cadence === "hourly") return from + (Math.floor((now - from) / HOUR) + 1) * HOUR
  const step = cadence === "daily" ? 1 : 7
  const start = Math.max(1, Math.floor((now - from) / (step * DAY)))
  const slots = Array.from({ length: 3 }, (_, index) => local(zone, from, (start + index) * step))
  return slots.find((slot) => slot > now) ?? local(zone, from, (start + 3) * step)
}

export function previous(zone: { minute: number; timezone: string }, cadence: Recurring, slot: number) {
  if (cadence === "hourly") return slot - HOUR
  return local(zone, slot, cadence === "daily" ? -1 : -7)
}

export function validZone(timezone: string) {
  return Option.isSome(DateTime.zoneMakeNamed(timezone))
}

// Local time of day, in minutes after midnight, of an instant in `timezone`.
export function localMinute(time: number, timezone: string) {
  const parts = DateTime.toParts(DateTime.makeZonedUnsafe(time, { timeZone: timezone }))
  return parts.hour * 60 + parts.minute
}

// Deterministic IDs for the run that serves `slot`, so a retry, a second process or a restart reconciles
// with the Session and prompt a first attempt already created instead of starting another run. The time
// prefix matches the ID layout of Sessions (descending) and messages (ascending).
export function slotIDs(taskID: string, slot: number) {
  const seed = `${taskID}:${slot}`
  return {
    session: `ses_${stamp(slot, true)}${digest(`session:${seed}`)}`,
    message: `msg_${stamp(slot, false)}${digest(`message:${seed}`)}`,
  }
}
~~~~


Linhas **126–140**; SHA256 do intervalo `67060e5bb07a9cdd4c045b60e33f39da586cd83daf17498f012c1e74fa283457`:

~~~~typescript
// 14 base62 characters from a non-cryptographic hash; IDs only need to be stable and well spread.
function digest(text: string) {
  return Array.from({ length: 14 }, (_, index) => BASE62[hash(text, index) % 62]).join("")
}

function hash(text: string, seed: number) {
  const codes = Array.from(text, (char) => char.charCodeAt(0))
  const [a, b] = codes.reduce(
    ([h1, h2], code) => [Math.imul(h1 ^ code, 2654435761), Math.imul(h2 ^ code, 1597334677)],
    [0xdeadbeef ^ seed, 0x41c6ce57 ^ seed],
  )
  const h1 = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  const h2 = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
~~~~


### `packages/core/src/scheduled-task.ts`

Archive: `sources/packages/core/src/scheduled-task.ts` · bytes: 26123 · Git blob: `0a89bbdc576091ca01445e45e1500ed4008898a9` · SHA256: `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`.

Papel da fonte: Legacy criação/update/resume/remove e projeção isolada.


Linhas **120–150**; SHA256 do intervalo `2c9389acbe801e644a1eb39ee555f167cdaf76fe926d1c81e9675d134214de33`:

~~~~typescript
    // Plans the task at `now` under the write lock. A skipped slot is recorded as missed, and a due slot is
    // claimed when no run holds it. `extra` (Run now) claims an extra run whenever the slot is not claimed.
    const begin = (id: ID, now: number, input: { directory?: AbsolutePath; extra: boolean }) =>
      immediate(
        Effect.gen(function* () {
          const task = yield* find(id, input.directory)
          if (!task) return { type: "missing" } as const
          if (task.policy === "capability") return yield* cap.plan(task, now)
          if (!legacy(task)) return { type: "idle" } as const
          const due = ScheduledTaskModel.plan(timing(task), now)
          if (due.type === "skip") yield* write(task, ScheduledTaskModel.skipRun(timing(task), due.slot, now), now)
          if (due.type === "run") {
            const held = yield* db
              .select({ state: ScheduledTaskRunTable.state })
              .from(ScheduledTaskRunTable)
              .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.slot, due.slot)))
              .get()
            if (!held) return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
            // A settled run of the slot the task points at means the slot was served before (the task was set
            // back to it); move past it without serving it again.
            if (held.state !== "running")
              yield* write(
                task,
                ScheduledTaskModel.recordRun(timing(task), { time: now, slot: due.slot, missed: due.missed }),
                now,
              )
          }
          if (input.extra) return { type: "claimed", claim: yield* claim(task, undefined, now) } as const
          return { type: "idle" } as const
        }),
      )
~~~~


Linhas **349–450**; SHA256 do intervalo `a9d706daa0c4917bd09039d05fa11270b8e29dd4f9c1897bc7890deadec49d52`:

~~~~typescript
    const capability = cap.api({ dispatch, settle })
    yield* ScheduledTaskPort.bind(capability)
    return Service.of({
      list: Effect.fn("ScheduledTask.list")(function* (directory) {
        const tasks = yield* db
          .select()
          .from(ScheduledTaskTable)
          .where(and(eq(ScheduledTaskTable.directory, directory), ScheduledTaskShared.LEGACY))
          .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
          .all()
          .pipe(Effect.orDie)
        return yield* infos(tasks.filter(legacy))
      }),
      create: Effect.fn("ScheduledTask.create")(function* (directory, input) {
        if (!ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const id = input.id ?? ID.create()
        const last = input.history?.last
        const existing = yield* immediate(
          Effect.gen(function* () {
            const current = yield* find(id)
            if (current) return current
            yield* db
              .insert(ScheduledTaskTable)
              .values({
                id,
                directory,
                name: input.name,
                prompt: input.prompt,
                cadence: input.cadence,
                timezone: input.timezone,
                minute: input.minute ?? ScheduledTaskModel.localMinute(input.next, input.timezone),
                next: input.next,
                enabled: input.enabled ?? true,
                runs: input.history?.runs ?? 0,
                missed: input.history?.missed ?? null,
                time_created: now,
                time_updated: now,
              })
              .run()
            if (last)
              yield* db
                .insert(ScheduledTaskRunTable)
                .values({
                  id: crypto.randomUUID(),
                  task_id: id,
                  state: "started",
                  session_id: last.sessionID,
                  time_claimed: last.time,
                  time_settled: last.time,
                })
                .run()
          }),
        )
        // Reusing an ID adopts the task it names, unchanged; an ID from another directory is a conflict.
        if (existing && existing.directory !== directory) return yield* new ConflictError({ id })
        return yield* get(directory, id).pipe(Effect.orDie)
      }),
      update: Effect.fn("ScheduledTask.update")(function* (directory, id, input) {
        if (input.timezone !== undefined && !ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const result = yield* immediate(
          Effect.gen(function* () {
            const task = yield* find(id, directory)
            if (!task || !legacy(task)) return "missing" as const
            const timed = input.next !== undefined || input.timezone !== undefined || input.cadence !== undefined
            const next = input.next ?? task.next
            const timezone = input.timezone ?? task.timezone
            const edited = {
              ...timing(task),
              cadence: input.cadence ?? task.cadence,
              timezone,
              next,
              // A new time re-anchors the time of day and clears the missed slot, as saving the editor does.
              ...(timed ? { minute: ScheduledTaskModel.localMinute(next, timezone), missed: undefined } : {}),
            }
            const enabled = toggle(edited, input.enabled, input.next !== undefined, now)
            if (!enabled) return "past" as const
            yield* db
              .update(ScheduledTaskTable)
              .set({
                name: input.name ?? task.name,
                prompt: input.prompt ?? task.prompt,
                cadence: enabled.cadence,
                timezone: enabled.timezone,
                minute: enabled.minute,
                next: enabled.next,
                enabled: enabled.enabled,
                missed: enabled.missed ?? null,
                time_updated: now,
              })
              .where(eq(ScheduledTaskTable.id, id))
              .run()
            return "updated" as const
          }),
        )
        if (result === "missing") return yield* new NotFoundError({ id })
        if (result === "past")
          return yield* new InvalidError({ field: "next", message: "A one-off task needs a future time to resume." })
        return yield* get(directory, id)
~~~~


Linhas **452–473**; SHA256 do intervalo `33af707bbdc83ec68ed17d3977113232ec1bf552d908f6607760beb4cfa6ad44`:

~~~~typescript
      remove: Effect.fn("ScheduledTask.remove")(function* (directory, id) {
        const removed = yield* db
          .delete(ScheduledTaskTable)
          .where(
            and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), ScheduledTaskShared.LEGACY),
          )
          .returning({ id: ScheduledTaskTable.id })
          .all()
          .pipe(Effect.orDie)
        if (removed.length === 0) return yield* new NotFoundError({ id })
      }),
      run: Effect.fn("ScheduledTask.run")(function* (directory, id) {
        const begun = yield* begin(id, yield* Clock.currentTimeMillis, { directory, extra: true })
        if (begun.type !== "claimed") return yield* new NotFoundError({ id })
        const outcome = yield* dispatch(begun.claim)
        if (outcome.type !== "started") {
          yield* settle(begun.claim, { type: "void" })
          return yield* new RunError({ reason: outcome.type === "failed" ? outcome.error : "owner-missing" })
        }
        yield* settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID }
      }),
~~~~


Linhas **506–557**; SHA256 do intervalo `e797bbb411c865796335bf01099e8cbc36705d33d4274b143c3a08d7647a971b`:

~~~~typescript
function legacy(task: Task): task is LegacyTask {
  return task.policy === "legacy-browser" && task.cadence !== "interval" && task.cadence !== "cron"
}

function timing(task: LegacyTask): ScheduledTaskModel.Timing {
  return {
    cadence: task.cadence,
    minute: task.minute,
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    missed: task.missed ?? undefined,
  }
}

// Turning a task on: a new time resumes it as given, a recurring task rolls to its next future slot, and a
// one-off whose time passed cannot resume (`undefined`).
function toggle(task: ScheduledTaskModel.Timing, enabled: boolean | undefined, retimed: boolean, now: number) {
  if (enabled === undefined || enabled === task.enabled) return task
  if (!enabled || retimed) return { ...task, enabled }
  if (!ScheduledTaskModel.canResume(task, now)) return undefined
  return ScheduledTaskModel.resume(task, now)
}

function toInfo(task: LegacyTask, run: RunRow | undefined): Info {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    cadence: task.cadence,
    timezone: task.timezone,
    minute: task.minute,
    next: task.next,
    enabled: task.enabled,
    runs: task.runs,
    ...(task.missed === null ? {} : { missed: task.missed }),
    ...(run ? { last: ScheduledTaskShared.toRun(run) } : {}),
  }
}

// The failure as the page shows it.
function reason(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause)
  if (error instanceof SessionV2.PromptConflictError)
    return `Prompt ${error.messageID} conflicts with an earlier prompt in ${error.sessionID}`
  if (error instanceof SessionV2.NotFoundError) return `Session not found: ${error.sessionID}`
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function logFailure(cause: Cause.Cause<unknown>) {
  return Effect.logError("Scheduled task failed", cause)
~~~~


## S03 — Capability: cron, intervalo e catch-up

Vínculo: `body.md` §10, 11; archive de evidência: `evidence.md`, seção `S03`.


### `packages/core/src/scheduled-task/capability-model.ts`

Archive: `sources/packages/core/src/scheduled-task/capability-model.ts` · bytes: 10649 · Git blob: `b92983cab05a5cff1ae32f459378192d07ddfc0b` · SHA256: `256620d07285f1e60c7e6023f4101e4f8738a565f43a6b859d8c1a7861230620`.

Papel da fonte: Cron cinco campos numéricos/OR, interval anchor, latest/skip e DST first-valid.


Linhas **27–218**; SHA256 do intervalo `55ec262ee2af39f654921d149d6b8d375a24b6adc6d5465bf65c5aedbcc73cc4`:

~~~~typescript
const MINUTE = 60_000
const DAY = 86_400_000
// A once slot later than this is skipped; with catchUp "skip" a slot later than one tick is not run.
const LATE = DAY
const TICK = MINUTE
// Local days searched for the next match: 28 years covers the weekday cycle of any date and Feb 29 across 2100.
const HORIZON = 28 * 366
const LIMIT = 100_000
// Bounds of minute, hour, day-of-month, month and day-of-week (7 is also Sunday).
const LOW = [0, 0, 1, 1, 0]
const HIGH = [59, 23, 31, 12, 7]
const MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

type Clock = { zone: DateTime.TimeZone; cron: Cron; times: number[] }

/** Five Vixie fields separated by ASCII spaces or tabs, with `*`, lists, ranges and steps; names, macros and
 * seconds are rejected, as is a rule that can never fire. */
export function parseCron(expression: string): Cron | undefined {
  const fields = expression.split(/[ \t]+/).filter((field) => field !== "")
  if (fields.length !== 5) return undefined
  const sets = fields.map((field, index) => parseField(field, LOW[index], HIGH[index]))
  if (!sets.every((set): set is number[] => set !== undefined)) return undefined
  const cron = {
    minutes: new Set(sets[0]),
    hours: new Set(sets[1]),
    days: new Set(sets[2]),
    months: new Set(sets[3]),
    weekdays: new Set(sets[4].map((day) => day % 7)),
    // Vixie: a day field that starts with `*` is unrestricted, even with a step.
    dayRestricted: !fields[2].startsWith("*"),
    weekdayRestricted: !fields[4].startsWith("*"),
  }
  // With both day fields restricted any matching weekday fires; otherwise some selected month must hold the day.
  const possible =
    (cron.dayRestricted && cron.weekdayRestricted) ||
    sets[3].some((month) => sets[2].some((day) => day <= MONTH_DAYS[month]))
  return possible ? cron : undefined
}

/** First slot strictly after `after`; DST gaps resolve to the next valid local instant; undefined for a past once. */
export function nextAfter(timing: Timing, after: number): number | undefined {
  const cadence = timing.cadence
  if (!inRange(after)) return undefined
  if (cadence.kind === "once") return cadence.at > after ? cadence.at : undefined
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    const slot = timing.next > after ? timing.next : timing.next + (Math.floor((after - timing.next) / step) + 1) * step
    return inRange(slot) ? slot : undefined
  }
  const clock = wallClock(timing)
  if (!clock) return undefined
  // Wall times at or before `after`'s own map to instants at or before it; inside a repeated hour later wall
  // times can too, so the scan keeps going until an instant passes `after`.
  return scan(clock, Math.floor(localWall(clock.zone, after) / MINUTE) * MINUTE, 1, (instant) => instant > after)
}

/** What a capability schedule owes at `now`. A once slot more than 24h late is skipped. */
export function plan(timing: Timing, now: number): Plan {
  if (!timing.enabled || timing.next > now) return { type: "wait" }
  if (timing.cadence.kind === "once")
    return now - timing.next > LATE ? { type: "skip", skipped: 1 } : { type: "run", slot: timing.next, skipped: 0 }
  const due = overdue(timing, now)
  if (timing.catchUp === "skip" && now - due.latest > TICK) return { type: "skip", skipped: due.count }
  return { type: "run", slot: due.latest, skipped: due.count - 1 }
}

// The latest due slot and the due count including the owed `next`; without a usable zone or rule, only `next`.
function overdue(timing: Timing, now: number) {
  const cadence = timing.cadence
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    const count = Math.floor((now - timing.next) / step) + 1
    return { latest: timing.next + (count - 1) * step, count }
  }
  const clock = wallClock(timing)
  const latest = clock && inRange(now) ? latestSlot(clock, now) : undefined
  if (!clock || latest === undefined || latest <= timing.next) return { latest: timing.next, count: 1 }
  return { latest, count: 1 + countWalls(clock, localWall(clock.zone, timing.next), localWall(clock.zone, latest)) }
}

function wallClock(timing: Timing): Clock | undefined {
  const cadence = timing.cadence
  if (cadence.kind === "once" || cadence.kind === "interval") return undefined
  const zone = Option.getOrUndefined(DateTime.zoneMakeNamed(timing.timezone))
  // Daily and weekly are the cron rules "M H * * *" and "M H * * D".
  const cron = parseCron(
    cadence.kind === "cron"
      ? cadence.expression
      : `${cadence.time.split(":").map(Number).reverse().join(" ")} * * ${cadence.kind === "weekly" ? cadence.day : "*"}`,
  )
  if (!zone || !cron) return undefined
  const times = [...cron.hours].flatMap((hour) => [...cron.minutes].map((minute) => hour * 60 + minute))
  return { zone, cron, times: times.sort((a, b) => a - b) }
}

// The last slot at or before `now`. When `now` is in the second pass of a repeated hour, wall times up to one
// offset change past its own already ran, so the backward scan starts that much later.
function latestSlot(clock: Clock, now: number) {
  const repeat = Math.max(0, localWall(clock.zone, now - DAY) - (now - DAY) - (localWall(clock.zone, now) - now))
  const start = Math.floor((localWall(clock.zone, now) + repeat) / MINUTE) * MINUTE + MINUTE
  return scan(clock, start, -1, (instant) => instant <= now)
}

// The first accepted instant among matching wall times from `from`; resolution is monotone in wall time.
function scan(clock: Clock, from: number, step: 1 | -1, accept: (instant: number) => boolean) {
  let wall = seek(clock, from, step)
  for (let index = 0; wall !== undefined && index < LIMIT; index++) {
    const instant = resolve(clock.zone, wall)
    if (accept(instant)) return instant
    wall = seek(clock, wall, step)
  }
  return undefined
}

// The first matching local wall time after `bound` (step 1) or the last one before it (step -1).
function seek(clock: Clock, bound: number, step: 1 | -1) {
  const first = Math.floor(bound / DAY)
  for (let index = 0; index <= HORIZON; index++) {
    const day = first + index * step
    if (!matchesDay(clock.cron, day)) continue
    const walls = clock.times.map((time) => day * DAY + time * MINUTE)
    const wall = step === 1 ? walls.find((wall) => wall > bound) : walls.findLast((wall) => wall < bound)
    if (wall !== undefined) return wall
  }
  return undefined
}

function matchesDay(cron: Cron, day: number) {
  const date = new Date(day * DAY)
  if (!cron.months.has(date.getUTCMonth() + 1)) return false
  const dayOfMonth = cron.days.has(date.getUTCDate())
  const weekday = cron.weekdays.has(date.getUTCDay())
  return cron.dayRestricted && cron.weekdayRestricted ? dayOfMonth || weekday : dayOfMonth && weekday
}

// Matching wall times in (from, to].
function countWalls(clock: Clock, from: number, to: number) {
  const first = Math.floor(from / DAY)
  const last = Math.floor(to / DAY)
  return Array.from({ length: Math.min(Math.max(0, last - first + 1), LIMIT) }, (_, index) => first + index).reduce(
    (total, day) => {
      if (!matchesDay(clock.cron, day)) return total
      if (day > first && day < last) return total + clock.times.length
      const walls = clock.times.map((time) => day * DAY + time * MINUTE)
      return total + walls.filter((wall) => wall > from && wall <= to).length
    },
    0,
  )
}

// The instant of a local wall time: the earlier one when the hour repeats, and the first instant after the gap
// when the wall time does not exist (02:30 on a spring-forward day runs at 03:00).
function resolve(zone: DateTime.TimeZone, wall: number) {
  const instant = DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(wall, { timeZone: zone, adjustForTimeZone: true, disambiguation: "earlier" }),
  )
  if (localWall(zone, instant) === wall) return instant
  // In a gap "earlier" lands before it; the gap ends at the first minute whose local time passes `wall`.
  return (
    Array.from({ length: 24 * 60 }, (_, index) => instant + (index + 1) * MINUTE).find(
      (candidate) => localWall(zone, candidate) > wall,
    ) ?? instant
  )
}

// Local wall-clock time of an instant, encoded as UTC epoch ms.
function localWall(zone: DateTime.TimeZone, instant: number) {
  return instant + DateTime.zonedOffset(DateTime.makeZonedUnsafe(instant, { timeZone: zone }))
}

// Effect DateTime rejects instants near the edge of the Date range.
function inRange(instant: number) {
  return Math.abs(instant) < 8e15
}

function parseField(field: string, min: number, max: number) {
  const items = field.split(",").map((item) => parseItem(item, min, max))
  return items.every((item): item is number[] => item !== undefined) ? items.flat() : undefined
}

function parseItem(item: string, min: number, max: number) {
  const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(item)
  if (!match) return undefined
  // A step needs `*` or a range; `a/n` is not Vixie syntax.
  if (match[4] !== undefined && match[1] === undefined && match[3] === undefined) return undefined
  const low = match[1] ? min : Number(match[2])
  const high = match[1] ? max : Number(match[3] ?? match[2])
  const step = Number(match[4] ?? 1)
  // Like cronie, a step above the field maximum is rejected.
  if (low < min || high > max || low > high || step < 1 || step > max) return undefined
  return Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, index) => low + index * step)
}
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.

Papel da fonte: Cadence persistida e primeiro slot validado; timezone/catchUp/limit.


Linhas **397–453**; SHA256 do intervalo `43661a6fccbd7b87d11c6c00653c8b23994780dc438c8c699d96e51e6d1c2d38`:

~~~~typescript
function encode(cadence: CapabilityScheduleContract.Cadence) {
  const columns = { minute: 0, interval_minutes: null, cron: null }
  if (cadence.kind === "interval")
    return { ...columns, cadence: "interval" as const, interval_minutes: cadence.minutes }
  if (cadence.kind === "daily") return { ...columns, cadence: "daily" as const, minute: clockMinute(cadence.time) }
  if (cadence.kind === "weekly")
    return { ...columns, cadence: "weekly" as const, minute: cadence.day * 1440 + clockMinute(cadence.time) }
  if (cadence.kind === "cron") return { ...columns, cadence: "cron" as const, cron: cadence.expression }
  return { ...columns, cadence: "once" as const }
}

function decode(task: Task): CapabilityScheduleContract.Cadence {
  const time = clock(task.minute % 1440)
  if (task.cadence === "interval") return { kind: "interval", minutes: task.interval_minutes ?? 0 }
  if (task.cadence === "daily") return { kind: "daily", time }
  if (task.cadence === "weekly") return { kind: "weekly", day: Math.floor(task.minute / 1440), time }
  if (task.cadence === "cron") return { kind: "cron", expression: task.cron ?? "" }
  return { kind: "once", at: task.next }
}

function capabilityTiming(task: Task): ScheduledTaskCapabilityModel.Timing {
  return {
    cadence: decode(task),
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    catchUp: task.catch_up ?? "latest",
  }
}

// The first slot of a new or edited definition; an enabled once must lie ahead. Errors come back as values.
function firstSlot(
  input: Omit<ScheduledTaskCapabilityModel.Timing, "next">,
  now: number,
): number | ScheduledTaskShared.InvalidError {
  if (!ScheduledTaskModel.validZone(input.timezone))
    return new ScheduledTaskShared.InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
  if (input.cadence.kind === "cron" && !ScheduledTaskCapabilityModel.parseCron(input.cadence.expression))
    return new ScheduledTaskShared.InvalidError({
      field: "cadence",
      message: `Invalid cron expression: ${input.cadence.expression}`,
    })
  if (input.cadence.kind === "once")
    return input.enabled && input.cadence.at <= now
      ? new ScheduledTaskShared.InvalidError({ field: "cadence", message: "A one-off schedule needs a future time." })
      : input.cadence.at
  return (
    ScheduledTaskCapabilityModel.nextAfter({ ...input, next: now }, now) ??
    new ScheduledTaskShared.InvalidError({ field: "cadence", message: "The cadence never fires." })
  )
}

// The slot after `after`, or disabled once none is left (a once that ran or was skipped).
function following(timing: ScheduledTaskCapabilityModel.Timing, after: number) {
  const next = ScheduledTaskCapabilityModel.nextAfter(timing, after)
  return next === undefined ? { enabled: false } : { next }
}
~~~~


Linhas **468–493**; SHA256 do intervalo `8d9b123875139ad94ed6c0eea49370500f77f9c4173b2c666e4218ec2308cddf`:

~~~~typescript
function toSchedule(task: Task, run: RunRow | undefined): Schedule {
  return {
    id: task.id,
    revision: task.revision,
    name: task.name,
    prompt: task.prompt,
    cadence: decode(task),
    timezone: task.timezone,
    catchUp: task.catch_up ?? "latest",
    ...(task.repeat_limit === null ? {} : { repeat: task.repeat_limit }),
    enabled: task.enabled,
    ...(task.disabled_reason === null ? {} : { disabledReason: task.disabled_reason }),
    ...(task.enabled ? { next: task.next } : {}),
    runs: task.runs,
    skipped: task.skipped,
    ...(run ? { last: ScheduledTaskShared.toRun(run) } : {}),
  }
}

function clockMinute(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}
~~~~


## S04 — Admissão de prompt, lease e corrida de revogação

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S04`.


### `packages/core/src/scheduled-task.ts`

Archive: `sources/packages/core/src/scheduled-task.ts` · bytes: 26123 · Git blob: `0a89bbdc576091ca01445e45e1500ed4008898a9` · SHA256: `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`.

Papel da fonte: Duas holds, SessionInput durável, started apenas admissão, lease/takeover sem duplicar prompt.


Linhas **23–32**; SHA256 do intervalo `5a2ab1604f7021867fc7de41bf584ea0246dffc1feba184d019d8c6cb6355a54`:

~~~~typescript
// A running claim older than this belongs to a process that stopped mid-dispatch. Dispatch is a few local
// writes, so a live process settles long before.
export const LEASE = 120_000
export const TICK = Duration.seconds(15)
const TICK_MILLIS = Duration.toMillis(TICK)
// The daemon never sleeps longer than this while something is scheduled, so a clock that jumped or a machine that
// slept is noticed within a minute.
const SLEEP_LIMIT = 60_000
// Settled runs kept per task. Only the latest is shown; a slot can no longer run once the task moved past it.
const KEEP = 20
~~~~


Linhas **152–264**; SHA256 do intervalo `1564c0fe2daff34036d950ef0a100bc8e6d2af6ac982ba1c683474333dfb0ced`:

~~~~typescript
    // The path a user prompt takes: the Session (adopted when its ID exists), durable admission, then a wake.
    // Legacy runs are Maestro Sessions in the task's directory. A capability run uses its owner's agent and
    // placement, and only while the owner Session still exists there with that agent. `admitted` is a takeover
    // retrying a prompt that is already durable, which only reconciles and wakes.
    const dispatch = (claimed: Claim, admitted = false) =>
      Effect.gen(function* () {
        const owner = claimed.task.policy === "capability" ? claimed.task.owner : undefined
        if (claimed.task.policy === "capability" && !(owner && (yield* cap.present(owner))))
          return { type: "revoked" } as const
        // Checked before the Session too, so a void claim leaves no empty Session behind.
        const checked = claimed.task.policy === "capability" && !admitted
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        const session = yield* sessions.create({
          id: claimed.sessionID,
          agent: owner?.agentID ?? AgentV2.defaultID,
          location: owner?.location ?? { directory: claimed.task.directory },
        })
        // An edit, pause or removal since the claim voids it before admission. What remains is the window from this
        // read to the durable admission inside `sessions.prompt` (its prompt hooks included); a claim revoked in it
        // still settles with an honest `started` receipt.
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return { type: "started", sessionID: session.id } as const
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // A capability prompt that was admitted before the failure (a wake that failed, say) did start.
            const durable =
              claimed.task.policy === "capability" ? yield* SessionInput.find(db, claimed.messageID) : undefined
            if (durable) return { type: "started", sessionID: durable.sessionID } as const
            return { type: "failed", error: reason(cause) } as const
          }),
        ),
      )

    const settle = Effect.fn("ScheduledTask.settle")(function* (claimed: Claim, outcome: Outcome) {
      const now = yield* Clock.currentTimeMillis
      yield* immediate(
        Effect.gen(function* () {
          const run = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(eq(ScheduledTaskRunTable.id, claimed.id))
            .get()
          // A claim an edit revoked while its prompt was being admitted keeps an honest receipt; it never counts
          // toward repeat or moves `next`, so this race can admit one run past the repeat limit.
          if (run?.state === "revoked" && outcome.type === "started")
            return yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "started", session_id: outcome.sessionID, error: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          // Gone with its task, taken over after the lease ended (the new lease settles it), or revoked by an edit.
          if (run?.state !== "running" || run.owner !== lease) return
          if (outcome.type === "void")
            return yield* db.delete(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, run.id)).run()
          yield* db
            .update(ScheduledTaskRunTable)
            .set({
              state: outcome.type,
              error: outcome.type === "failed" ? outcome.error : outcome.type === "revoked" ? "owner-missing" : null,
              owner: null,
              time_settled: now,
            })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          const task = yield* find(claimed.task.id)
          if (!task) return
          if (task.policy === "capability")
            yield* advance(task, ScheduledTaskCapability.settledCapability(task, run, outcome), now)
          if (legacy(task)) {
            // The task still points at (or before) the served slot unless it was rescheduled while the run
            // started; then the run counts as an extra run and the task keeps its new time.
            const slot = run.slot !== null && task.next <= run.slot ? run.slot : undefined
            const missed =
              slot !== undefined && task.cadence !== "once" && task.next < slot
                ? ScheduledTaskModel.previous(task, task.cadence, slot)
                : undefined
            // A failed slot is consumed like a run, so it is never retried; a failure leaves a rescheduled task alone.
            const advanced =
              outcome.type === "started" || slot !== undefined
                ? ScheduledTaskModel.recordRun(timing(task), { time: now, slot, missed })
                : timing(task)
            yield* advance(
              task,
              {
                next: advanced.next,
                enabled: advanced.enabled,
                missed: advanced.missed ?? null,
                runs: outcome.type === "started" ? task.runs + 1 : task.runs,
              },
              now,
            )
          }
          const kept = db
            .select({ id: ScheduledTaskRunTable.id })
            .from(ScheduledTaskRunTable)
            .where(and(eq(ScheduledTaskRunTable.task_id, task.id), ne(ScheduledTaskRunTable.state, "running")))
            .orderBy(desc(ScheduledTaskRunTable.time_settled))
            .limit(KEEP)
          yield* db
            .delete(ScheduledTaskRunTable)
            .where(
              and(
                eq(ScheduledTaskRunTable.task_id, task.id),
                ne(ScheduledTaskRunTable.state, "running"),
                notInArray(ScheduledTaskRunTable.id, kept),
              ),
            )
            .run()
        }),
      )
    })
~~~~


Linhas **272–320**; SHA256 do intervalo `6e24e6eacc0901fbf25b44f9ac9f04230d04d6fbfa5680246b0653c325653345`:

~~~~typescript
    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
    })

    const tick = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const stale = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.state, "running"), lt(ScheduledTaskRunTable.time_claimed, now - LEASE)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stale, (run) => takeOver(run, now).pipe(Effect.catchCause(logFailure)), { discard: true })
      const due = yield* db
        .select({ id: ScheduledTaskTable.id })
        .from(ScheduledTaskTable)
        .where(and(eq(ScheduledTaskTable.enabled, true), lte(ScheduledTaskTable.next, now)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(due, (task) => serve(task.id, now).pipe(Effect.catchCause(logFailure)), { discard: true })
    }).pipe(Effect.withSpan("ScheduledTask.tick"))
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.

Papel da fonte: Holds confere revisão/lease/enabled, revoke ignora input já admitido.


Linhas **89–145**; SHA256 do intervalo `ee1eb3ad2d95d7f033ff555794f9a45ed215cca7880bd207c05abd410dd986c0`:

~~~~typescript
  // Capability planning under the write lock. A run moves `next` to the claimed slot, so the overtaken slots are
  // counted once even when a stopped claim is voided and the slot planned again.
  const beginCapability = Effect.fn("ScheduledTask.beginCapability")(function* (task: Task, now: number) {
    const timing = capabilityTiming(task)
    const due = ScheduledTaskCapabilityModel.plan(timing, now)
    if (due.type === "wait") return { type: "idle" } as const
    const skipped = task.skipped + due.skipped
    if (due.type === "skip") {
      yield* advance(task, { skipped, ...following(timing, now) }, now)
      return { type: "idle" } as const
    }
    const held = yield* db
      .select({ state: ScheduledTaskRunTable.state })
      .from(ScheduledTaskRunTable)
      .where(
        and(
          eq(ScheduledTaskRunTable.task_id, task.id),
          eq(ScheduledTaskRunTable.revision, task.revision),
          eq(ScheduledTaskRunTable.slot, due.slot),
        ),
      )
      .get()
    if (held?.state === "running") return { type: "idle" } as const
    // Served before (the schedule was set back to it): move past it without serving it again.
    if (held) {
      yield* advance(task, { skipped, ...following(timing, due.slot) }, now)
      return { type: "idle" } as const
    }
    yield* advance(task, { skipped, next: due.slot }, now)
    return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
  })

  const holds = (claimed: Claim) =>
    db
      .select({
        state: ScheduledTaskRunTable.state,
        lease: ScheduledTaskRunTable.owner,
        slot: ScheduledTaskRunTable.slot,
        claimed: ScheduledTaskRunTable.revision,
        revision: ScheduledTaskTable.revision,
        enabled: ScheduledTaskTable.enabled,
      })
      .from(ScheduledTaskRunTable)
      .innerJoin(ScheduledTaskTable, eq(ScheduledTaskTable.id, ScheduledTaskRunTable.task_id))
      .where(eq(ScheduledTaskRunTable.id, claimed.id))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map(
          (row) =>
            row?.state === "running" &&
            row.lease === lease &&
            row.claimed === row.revision &&
            // A manual run may start while the schedule is paused.
            (row.enabled || row.slot === null),
        ),
      )
~~~~


Linhas **179–200**; SHA256 do intervalo `513c91773cba56fac7fbc73beb9f656b94e4aef53c3078a579eb79abaddbef38`:

~~~~typescript
  // Marks the task's running claims in `scope` whose prompt was never admitted as revoked.
  const revoke = (task: Task, now: number, scope: SQL) =>
    Effect.gen(function* () {
      const pending = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.state, "running"), scope))
        .all()
      yield* Effect.forEach(
        pending,
        (run) =>
          Effect.gen(function* () {
            if (run.message_id && (yield* SessionInput.find(db, run.message_id))) return
            yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "revoked", error: "revoked by an edit", owner: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          }),
        { discard: true },
      )
    })
~~~~


## S05 — Revisão, manual key e contabilização

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S05`.


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.

Papel da fonte: Update/pause/remove revogam limites próprios; manual dedupe e slot started conta.


Linhas **159–177**; SHA256 do intervalo `a7a3f002281c8c3f306081a1087c1f1241bc30530632df9db48a9972eb71b53d`:

~~~~typescript
  // Runs `edit` on the owner's schedule under the write lock, then reads it back. Errors come back as values so
  // the transaction commits only what the edit wrote.
  const change = <E extends ScheduledTaskShared.InvalidError>(
    owner: Capability.Owner,
    id: ID,
    edit: (task: Task, now: number) => Effect.Effect<E | undefined, unknown>,
  ) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const failed = yield* immediate(
        Effect.gen(function* () {
          const task = yield* owned(owner, id)
          if (!task) return new ScheduledTaskShared.NotFoundError({ id })
          return yield* edit(task, now)
        }),
      )
      if (failed) return yield* failed
      return yield* getOwned(owner, id)
    })
~~~~


Linhas **270–378**; SHA256 do intervalo `2274cb5aab2a469e5f7178dabfc28018c1e3610c14fd6db04626d41839865b0a`:

~~~~typescript
    update: (owner, id, input) =>
      change(owner, id, (task, now) =>
        Effect.gen(function* () {
          const current = capabilityTiming(task)
          const cadence = input.cadence ?? current.cadence
          const timezone = input.timezone ?? task.timezone
          const catchUp = input.catchUp ?? current.catchUp
          const next = firstSlot({ cadence, timezone, catchUp, enabled: task.enabled }, now)
          if (typeof next !== "number") return next
          const revision = task.revision + 1
          const repeat = input.repeat === undefined ? task.repeat_limit : input.repeat
          // A limit at or below the runs already admitted exhausts the schedule now.
          const exhausted = repeat !== null && task.runs >= repeat
          yield* advance(
            task,
            {
              ...(exhausted ? { enabled: false, disabled_reason: "exhausted" as const } : {}),
              name: input.name ?? task.name,
              prompt: input.prompt ?? task.prompt,
              ...encode(cadence),
              timezone,
              catch_up: catchUp,
              repeat_limit: repeat,
              next,
              revision,
            },
            now,
          )
          // Unstarted claims of older revisions never admit their prompt; an admitted one keeps its receipt.
          yield* revoke(task, now, lt(ScheduledTaskRunTable.revision, revision))
        }),
      ),
    // Pausing revokes unstarted slot claims; a manual run may still start while paused.
    pause: (owner, id) =>
      change<never>(owner, id, (task, now) =>
        Effect.gen(function* () {
          yield* advance(task, { enabled: false }, now)
          yield* revoke(task, now, isNotNull(ScheduledTaskRunTable.slot))
          return undefined
        }),
      ),
    resume: (owner, id) =>
      change(owner, id, (task, now) =>
        Effect.gen(function* () {
          if (task.enabled) return
          if (task.repeat_limit !== null && task.runs >= task.repeat_limit)
            return new ScheduledTaskShared.InvalidError({
              field: "repeat",
              message: "The schedule used all its runs; raise repeat first.",
            })
          const next = firstSlot({ ...capabilityTiming(task), enabled: true }, now)
          if (typeof next !== "number") return next
          yield* advance(task, { enabled: true, disabled_reason: null, next }, now)
        }),
      ),
    remove: Effect.fn("ScheduledTask.capability.remove")(function* (owner, id) {
      const removed = yield* immediate(
        Effect.gen(function* () {
          if (!(yield* owned(owner, id))) return false
          yield* db.delete(ScheduledTaskTable).where(eq(ScheduledTaskTable.id, id)).run()
          return true
        }),
      )
      if (!removed) return yield* new ScheduledTaskShared.NotFoundError({ id })
    }),
    run: Effect.fn("ScheduledTask.capability.run")(function* (owner, id, manualKey) {
      const now = yield* Clock.currentTimeMillis
      const begun = yield* immediate(
        Effect.gen(function* () {
          const task = yield* owned(owner, id)
          if (!task) return { type: "missing" } as const
          const prior = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(and(eq(ScheduledTaskRunTable.task_id, id), eq(ScheduledTaskRunTable.manual_key, manualKey)))
            .get()
          if (prior) return { type: "prior", run: prior } as const
          return { type: "claimed", claim: yield* claim(task, undefined, now, manualKey) } as const
        }),
      )
      if (begun.type === "missing") return yield* new ScheduledTaskShared.NotFoundError({ id })
      if (begun.type === "prior") {
        // A revoked manual claim stays revoked: the same call never runs, a new call (new key) may.
        if (begun.run.state === "revoked")
          return yield* new ScheduledTaskShared.RunError({
            reason: `${begun.run.error ?? "revoked"}; retrying the same call will not run`,
          })
        // A claim still starting elsewhere (or stopped before its lease ended) is reused only once admitted.
        const admitted = begun.run.message_id && (yield* SessionInput.find(db, begun.run.message_id))
        if (begun.run.state === "running" && !admitted)
          return yield* new ScheduledTaskShared.RunError({ reason: "This run is still starting; retry shortly." })
        return { sessionID: begun.run.session_id, reused: true }
      }
      const outcome = yield* ops.dispatch(begun.claim)
      if (outcome.type === "started") {
        yield* ops.settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID, reused: false }
      }
      // Nothing was admitted, so the same call may retry; a missing owner disables the schedule.
      yield* ops.settle(begun.claim, outcome.type === "revoked" ? outcome : { type: "void" })
      return yield* new ScheduledTaskShared.RunError({
        reason:
          outcome.type === "failed"
            ? outcome.error
            : outcome.type === "void"
              ? "The schedule changed before the run started."
              : "owner-missing",
      })
    }),
~~~~


Linhas **455–466**; SHA256 do intervalo `293f0c3d7328a3a34be4fbb7553c3c3f23c667397a2ed78565946651ec9d734f`:

~~~~typescript
// A settled capability claim. Manual runs never move the schedule or count. A slot counts once its prompt was
// admitted; a failed slot is consumed, never retried. An edit since the claim already recomputed `next`.
export function settledCapability(task: Task, run: RunRow, outcome: Outcome): Partial<Task> {
  if (outcome.type === "revoked") return { enabled: false, disabled_reason: "owner-missing" }
  if (run.slot === null) return {}
  const runs = outcome.type === "started" ? task.runs + 1 : task.runs
  const moved =
    run.revision === task.revision && task.next <= run.slot ? following(capabilityTiming(task), run.slot) : {}
  if (task.repeat_limit !== null && runs >= task.repeat_limit)
    return { runs, ...moved, enabled: false, disabled_reason: "exhausted" }
  return { runs, ...moved }
}
~~~~


## S06 — Daemon, wake e inferência estática de create

Vínculo: `body.md` §12; archive de evidência: `evidence.md`, seção `S06`.


### `packages/core/src/scheduled-task.ts`

Archive: `sources/packages/core/src/scheduled-task.ts` · bytes: 26123 · Git blob: `0a89bbdc576091ca01445e45e1500ed4008898a9` · SHA256: `8c204bd55a8cf8fd1dbddc232f5dfa84b9190822d074ccc72e85594e457af12b`.

Papel da fonte: Wrapper immediate notifica Queue; idle sem tasks/runs espera wake.


Linhas **85–103**; SHA256 do intervalo `b7e542e5c0eada5df4d09df8ff3651d93414bbbf0898f1d63323a305ec1d61c0`:

~~~~typescript
    // At most one pending wake: the daemon needs to know that something was written, not how many times.
    const woken = yield* Queue.sliding<void>(1)
    const store = ScheduledTaskShared.store(db, crypto.randomUUID())
    // Every task write, legacy or capability, runs under `immediate`, so each one wakes a sleeping daemon.
    const tasks = {
      ...store,
      immediate: <A, E>(effect: Effect.Effect<A, E>) =>
        store.immediate(effect).pipe(Effect.tap(() => Queue.offer(woken, undefined))),
    }
    const { lease, immediate, find, lastRuns, advance, claim } = tasks
    const cap = ScheduledTaskCapability.make(tasks, sessions)

    const infos = Effect.fn("ScheduledTask.infos")(function* (tasks: LegacyTask[]) {
      const runs = yield* lastRuns(tasks)
      return tasks.map((task) =>
        toInfo(
          task,
          runs.find((run) => run.task_id === task.id),
        ),
~~~~


Linhas **304–347**; SHA256 do intervalo `28fd466233f2407409a4c50808fccd67b509444218e30847861849915f617269`:

~~~~typescript
    const tick = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const stale = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.state, "running"), lt(ScheduledTaskRunTable.time_claimed, now - LEASE)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stale, (run) => takeOver(run, now).pipe(Effect.catchCause(logFailure)), { discard: true })
      const due = yield* db
        .select({ id: ScheduledTaskTable.id })
        .from(ScheduledTaskTable)
        .where(and(eq(ScheduledTaskTable.enabled, true), lte(ScheduledTaskTable.next, now)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(due, (task) => serve(task.id, now).pipe(Effect.catchCause(logFailure)), { discard: true })
    }).pipe(Effect.withSpan("ScheduledTask.tick"))

    const untilDue = Effect.gen(function* () {
      // Writes the tick itself made are not news. A write that lands after the reads below leaves its wake in the
      // queue, and one that landed before them is read.
      yield* Queue.clear(woken)
      const now = yield* Clock.currentTimeMillis
      const next = yield* db
        .select({ at: min(ScheduledTaskTable.next) })
        .from(ScheduledTaskTable)
        .where(eq(ScheduledTaskTable.enabled, true))
        .get()
        .pipe(Effect.orDie)
      const claimed = yield* db
        .select({ at: min(ScheduledTaskRunTable.time_claimed) })
        .from(ScheduledTaskRunTable)
        .where(eq(ScheduledTaskRunTable.state, "running"))
        .get()
        .pipe(Effect.orDie)
      // The next due slot, and the moment a running claim goes stale and can be taken over.
      const wanted = [next?.at, claimed?.at == null ? undefined : claimed.at + LEASE + 1].filter((at) => at != null)
      // Nothing is scheduled and nothing is running: only a task write can make a tick useful.
      if (wanted.length === 0) return yield* Queue.take(woken)
      const at = Math.min(...wanted)
      // A slot already due that the tick left alone (a held run, say) is retried at the old cadence, not in a spin.
      const delay = at > now ? Math.min(at - now, SLEEP_LIMIT) : TICK_MILLIS
      yield* Effect.race(Effect.sleep(delay), Queue.take(woken))
    })
~~~~


Linhas **484–504**; SHA256 do intervalo `d8260ed62db849067ad504d83604e8de09ed938e092c9349144e71ef2eb6dd83`:

~~~~typescript
/** Serves due slots on the server whether or not any client is open, starting with a pass at boot. */
export const daemonNode = makeGlobalNode({
  name: "scheduled-task-daemon",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tasks = yield* Service
      // A failed pass (the database was busy, say) must not stop later passes.
      yield* tasks.tick.pipe(
        Effect.catchCause(logFailure),
        Effect.andThen(
          tasks.untilDue.pipe(
            Effect.catchCause((cause) => logFailure(cause).pipe(Effect.andThen(Effect.sleep(TICK)))),
          ),
        ),
        Effect.forever,
        Effect.forkScoped,
      )
    }),
  ),
  deps: [node],
})
~~~~


### `packages/core/src/scheduled-task/capability.ts`

Archive: `sources/packages/core/src/scheduled-task/capability.ts` · bytes: 21721 · Git blob: `ab0410651446d3d1d98d9d8028a3ad79bb46aecb` · SHA256: `d024c2e05f0afc70fe49b801ee77b892a8097f5d499cd097d60f230cae67044e`.

Papel da fonte: Create usa db.insert diretamente; elo com Queue depende de wrapper/caller.


Linhas **202–237**; SHA256 do intervalo `660548bc878233f7b7fd06f1a3c423612aec4d7f613c4e5d1ff818f8c8a1ba9b`:

~~~~typescript
  // The public methods, over the shared dispatch and settle path.
  const api = (ops: {
    dispatch: (claimed: Claim) => Effect.Effect<Outcome>
    settle: (claimed: Claim, outcome: Outcome) => Effect.Effect<void>
  }): Interface => ({
    create: Effect.fn("ScheduledTask.capability.create")(function* (owner, input) {
      const now = yield* Clock.currentTimeMillis
      const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      const catchUp = input.catchUp ?? "latest"
      const enabled = input.enabled ?? true
      const next = firstSlot({ cadence: input.cadence, timezone, catchUp, enabled }, now)
      if (typeof next !== "number") return yield* next
      const id = ScheduledTask.ID.create()
      yield* db
        .insert(ScheduledTaskTable)
        .values({
          id,
          directory: owner.location.directory,
          name: input.name,
          prompt: input.prompt,
          ...encode(input.cadence),
          timezone,
          next,
          enabled,
          runs: 0,
          policy: "capability",
          owner,
          catch_up: catchUp,
          repeat_limit: input.repeat ?? null,
          time_created: now,
          time_updated: now,
        })
        .run()
        .pipe(Effect.orDie)
      return yield* getOwned(owner, id).pipe(Effect.orDie)
    }),
~~~~


## T01 — Testes existentes: intenção verificável, NOT_RUN

Vínculo: `body.md` §13; archive de evidência: `evidence.md`, seção `T01`.


### `packages/core/test/actions/readback.test.ts`

Archive: `sources/packages/core/test/actions/readback.test.ts` · bytes: 14628 · Git blob: `817254ee4c663e5ae3d2d61639d4c70a7cafe009` · SHA256: `b10276afdb9bcfda8f704de349657d320511703049c604df3ee1e26978e99412`.

Papel da fonte: Assertions existentes para retry sem tentativa e ausência de confirmação GitLab.


Linhas **182–231**; SHA256 do intervalo `b145215ca93279f47eeec4e28cad49f8e1bf31556ef49a2fe96798550deb936a`:

~~~~typescript
  it.live(`retry readback requires native attempt: ${retry.name}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create()
      f.native.github = {
        ...Object.fromEntries(Object.entries(f.native.github).filter(([key]) => key !== "run_attempt")),
        ...(retry.attempt === undefined ? {} : { run_attempt: retry.attempt }),
      }
      const command = intent(binding, f.commit, {
        kind: "run.retryFailed",
        target: { runID },
        expected: { commit: f.commit, attempt: 3 },
      })
      const receipt = yield* accepted(f, binding, command, {
        runID,
        ...(retry.acknowledged === undefined ? {} : { attempt: retry.acknowledged }),
      })
      expect((yield* f.api.reconcile(binding, receipt.id)).state).toBe(retry.state)
      expect((yield* row(f, receipt.id))?.expected).toEqual(command.expected)
    }),
  )
})

it.live("GitLab retry stays pending when native pipeline exposes no attempt", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create(gitlab)
    const receipt = yield* accepted(f, binding, intent(binding, f.commit, { kind: "run.retry", target: { runID } }), {
      runID,
      attempt: 4,
    })
    expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
    expect(f.requests.map((call) => call.input.path)).toEqual(["projects/5678", `projects/5678/pipelines/${runID}`])
  }),
)
const cancellations = [
  { provider: github, status: "in_progress", conclusion: null, state: "accepted" },
  { provider: github, status: "completed", conclusion: "cancelled", state: "confirmed" },
  { provider: gitlab, status: "canceling", conclusion: null, state: "accepted" },
  { provider: gitlab, status: "canceled", conclusion: null, state: "confirmed" },
] satisfies {
  provider: Actions.Provider
  status: string
  conclusion: string | null
  state: Actions.Operation["state"]
}[]
cancellations.forEach((cancel) => {
  it.live(`${cancel.provider.kind} cancel requires desired native status: ${cancel.status}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
~~~~


### `packages/core/test/actions-resource-schedules.test.ts`

Archive: `sources/packages/core/test/actions-resource-schedules.test.ts` · bytes: 13709 · Git blob: `56f5d0629d1b482e953bc28801155c8f06b03ffb` · SHA256: `30ea7374a0b515d6a96ece1296e40a68957c5839e5ae59be9b88bacd30ee31f5`.

Papel da fonte: Fixture de falha após criação sem rollback/retry.


Linhas **22–51**; SHA256 do intervalo `9878883b5668e79af595869504055190e73b4a31f513a3e835da3c25fc7e1ac9`:

~~~~typescript
it.live("partial schedule creation and variable rejection stays outcome_unknown; no rollback or retry", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path.endsWith("/variables") ? { status: 403, data: { message: "synthetic-secret-rejection" } } : undefined
  const error = yield* ActionsSchedules.make(fixture).perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.create", "schedules"), target: { resourceKind: "schedules", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "target=synthetic-secret-value" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(JSON.stringify(error)).not.toContain("synthetic-secret")
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => request.path))
    .toEqual(["projects/9347/pipeline_schedules", "projects/9347/pipeline_schedules/13/variables"])
}))

it.live("explicit empty schedule variable field clears observed native keys using 202 deletion acknowledgements", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request): ActionsResourceFixture.Reply | undefined => {
    if (request.path.endsWith("/variables/target")) return { status: 202, data: { key: "target", value: "synthetic-private-value", variable_type: "env_var" } }
    if (request.method === "GET" && request.path.endsWith("/pipeline_schedules/13"))
      return { data: { ...ActionsResourceFixture.schedule, variables: [{ key: "target", value: "synthetic-private-value", variable_type: "env_var" }] } }
  }
  const schedules = ActionsSchedules.make(fixture)
  const page = yield* schedules.list(fixture.binding, { kind: "schedules", resourceID: "13" })
  expect(JSON.stringify(page)).not.toContain("synthetic-private-value")
  expect(yield* schedules.perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.update", "schedules", "13"), target: { resourceKind: "schedules", resourceID: "13", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "" }))
    .toEqual({ acknowledgement: { resourceID: "13" } })
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => [request.method, request.path]))
    .toEqual([["PUT", "projects/9347/pipeline_schedules/13"], ["DELETE", "projects/9347/pipeline_schedules/13/variables/target"]])
}))

~~~~


### `packages/core/test/actions-transport-gitlab-http.test.ts`

Archive: `sources/packages/core/test/actions-transport-gitlab-http.test.ts` · bytes: 15150 · Git blob: `142f2e1116aad7479389f8640c0c5c9b4c1be4a9` · SHA256: `177c37ffc41d22526e737abf31f214250bef0e8a0d5f031515477419c324d875`.

Papel da fonte: Fixture TLS write/reset exige unknown, não envio repetido.


Linhas **28–49**; SHA256 do intervalo `0ea7ea1e35337455dc6b2194f62637ae3a5783501726e0e74e62b2d63e0e04f1`:

~~~~typescript
it.live("real TLS peer consumes mutation body before reset; transport outcome stays unknown and redacted", Effect.gen(function* () {
  const fixture = yield* ActionsHttpFixture.make()
  const body = { ref: "main", value: "synthetic-mutation-value" }
  const state = { consumed: 0 }
  fixture.serverState.handler = (request, response) => {
    if (request.url === "/api/v4/user") {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"id":913,"username":"fixture-user"}'); return
    }
    request.on("data", (chunk) => { state.consumed += chunk.length })
    request.once("end", () => request.socket.destroy())
  }
  const error = yield* fixture.service.request(fixture.binding(), { method: "POST", path: "projects/9347/pipeline", body }).pipe(Effect.flip)
  const mutation = fixture.requests.find((request) => request.method === "POST")
  expect(state.consumed).toBe(Buffer.byteLength(JSON.stringify(body)))
  expect(mutation?.size).toBe(state.consumed)
  expect(mutation?.digest).toBe(createHash("sha256").update(JSON.stringify(body)).digest("hex"))
  expect(error).toMatchObject({ kind: "transport_failed", disposition: "unknown", bindingID: fixture.binding().id })
  expect(JSON.stringify(error)).not.toContain("synthetic-provider")
  expect(JSON.stringify(error)).not.toContain(body.value)
  expect(fixture.requests.map((request) => [request.method, request.path])).toEqual([["GET", "/api/v4/user"], ["POST", "/api/v4/projects/9347/pipeline"]])
}), 120_000)

~~~~


### `packages/core/test/board-budget.test.ts`

Archive: `sources/packages/core/test/board-budget.test.ts` · bytes: 10675 · Git blob: `d7be43a0a867980844c94009c138bc0bba6e5693` · SHA256: `34a372da5e198a2cc1330fd429ca2a9da647205c8801ff39f60e4fdeb1040dbc`.

Papel da fonte: Assertions de decisão superseded/outcome preservados.


Linhas **93–130**; SHA256 do intervalo `3b2d1ca25d7be0d94d6a68e9663b81b496287cfb7b8a53e896b6ab6d7e36321b`:

~~~~typescript
  it.live("an answered question becomes a decision; overturning keeps both, linked", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "DEC", name: "Decisions", reason: "Start." })
      yield* board.issue({ project: "DEC", title: "Pick", reason: "Plan." })
      yield* board.question({ action: "ask", project: "DEC", issue: 1, text: "A or B?", options, recommended: "a", reason: "Blocks." })
      const question = (yield* board.snapshot("DEC")).questions[0]!
      yield* board.answer("DEC", question.id, { option: "b" })

      const first = (yield* board.decisions("DEC"))[0]!
      expect(first).toMatchObject({
        issue: 1,
        question: "A or B?",
        recommended: "a",
        chosen: "b",
        chosenLabel: "Option B",
        answeredBy: "owner",
        outcome: "applied, no result yet",
        supersedes: null,
        overturnedBy: null,
      })

      yield* board.decisionOutcome({ project: "DEC", id: question.id, outcome: "B shipped in the first week.", reason: "It landed." })
      expect((yield* board.decisions("DEC"))[0]?.outcome).toBe("B shipped in the first week.")

      yield* board.changeDecision("DEC", first.id, { option: "a", text: "On reflection A." })
      const all = yield* board.decisions("DEC")
      expect(all).toHaveLength(2)
      const current = all.find((item) => item.supersedes === first.id)!
      expect(current).toMatchObject({ chosen: "a", text: "On reflection A.", overturnedBy: null })
      expect(all.find((item) => item.id === first.id)?.overturnedBy).toBe(current.id)
      expect(Exit.isFailure(yield* Effect.exit(board.changeDecision("DEC", first.id, { option: "b" })))).toBe(true)
      expect(Exit.isFailure(yield* Effect.exit(board.changeDecision("DEC", current.id, { option: "zzz" })))).toBe(true)
      // The card names the decision that moved it.
      expect((yield* board.proof("DEC", 1)).decidedBy?.id).toBe(current.id)
    }),
  )

~~~~


### `packages/core/test/board-queue.test.ts`

Archive: `sources/packages/core/test/board-queue.test.ts` · bytes: 16848 · Git blob: `8ded9fcbbcd0b414bbea9ed2e43a6e36ab931f78` · SHA256: `9f75b5fe9d6cea03242d2e40a1db43602fe984a48134e1635c6d3510c010aec8`.

Papel da fonte: Simulação de host morto após push, sem segundo merge.


Linhas **145–187**; SHA256 do intervalo `e1a377eb640a85d0904a9619dd7317f2904bd9c53ae0d98276aeb9251ed30288`:

~~~~typescript
  it.live("a host that pushed base and died before writing the rows merges once on restart", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QCR", 2)
      yield* card(repo, "QCR", 1, "a.txt")
      yield* card(repo, "QCR", 2, "b.txt")
      yield* board.queue({ project: "QCR", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QCR", number: 2, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.get(102)).toBe("bundle-QCR-1")
      yield* board.queueTick()
      repo.remote.conclusion = "SUCCESS"

      const database = yield* Database.Service
      const open = yield* database.db
        .select({ head: BoardBundleTable.head_sha })
        .from(BoardBundleTable)
        .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
        .where(and(eq(BoardProjectTable.key, "QCR"), eq(BoardBundleTable.status, "open")))
        .get()
        .pipe(Effect.orDie)
      if (!open) return yield* Effect.die("The bundle is not open.")
      yield* Effect.promise(() => git(repo.directory, "push", "--quiet", "origin", `${open.head}:refs/heads/main`))

      yield* board.queueTick()
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["shipped", "shipped"])
      expect(yield* bundleStatuses(repo)).toEqual(["merged"])
      expect(yield* origin(repo, "main")).toBe(open.head)
    }),
  )

  it.live("two ticks at once settle a project only once", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QLK", 1)
      yield* card(repo, "QLK", 1, "a.txt")
      yield* board.queue({ project: "QLK", number: 1, reason: "Verified.", flush: true })
      yield* Effect.all([board.queueTick(), board.queueTick()], { concurrency: 2, discard: true })
      expect(yield* bundleStatuses(repo)).toHaveLength(1)
      expect(repo.remote.pulls.size).toBe(2)
    }),
  )

~~~~


### `packages/core/test/scheduled-task-capability.test.ts`

Archive: `sources/packages/core/test/scheduled-task-capability.test.ts` · bytes: 24066 · Git blob: `c96b90a80f985a84c74f8859c211b533f8600db6` · SHA256: `85eb84f706e0228bb8e4202c45d4b4c0ab8645bb2a04427b573cebd335b12af9`.

Papel da fonte: Simulação de revogação durante admissão, manual reuse e isolamento.


Linhas **308–395**; SHA256 do intervalo `53e2b614c31b2368839227f8fbc926f585971f2d9e29af08cbe188818db57033`:

~~~~typescript
  it.effect("an edit after admission keeps the old revision's started receipt and its new next", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      const edits: ScheduledTask.Schedule[] = []
      hook.onWake = tasks.capability.update(owner, created.id, { cadence: { kind: "interval", minutes: 120 } }).pipe(
        Effect.map((schedule) => edits.push(schedule)),
        Effect.asVoid,
        Effect.orDie,
      )
      yield* tasks.tick
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.revision, row.state, row.session_id])).toEqual([
        [0, "started", ids.session],
      ])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
        revision: 1,
        runs: 1,
        next: edits[0]!.next,
        last: { outcome: "started", sessionID: ids.session },
      })
    }),
  )

  it.effect("a claim revoked while its prompt was admitted settles as started without counting", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      // What an edit racing admission leaves behind: the claim revoked after the recheck.
      hook.onWake = db
        .update(ScheduledTaskRunTable)
        .set({ state: "revoked", owner: null })
        .where(eq(ScheduledTaskRunTable.task_id, created.id))
        .run()
        .pipe(Effect.asVoid, Effect.orDie)
      yield* tasks.tick
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.state, row.session_id])).toEqual([["started", ids.session]])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 0, next: slot })
    }),
  )
})

describe("ScheduledTask capability manual runs", () => {
  it.effect("a manual run dedupes on its key and never moves next or counts", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      yield* TestClock.setTime(start + 10 * MINUTE)
      const key = "invocation:msg_assistant:call_1"
      // The wake fails after admission: the prompt did start, so the run reports it and a retry reuses it.
      hook.failWake = true
      const first = yield* tasks.capability.run(owner, created.id, key)
      hook.failWake = false
      const retry = yield* tasks.capability.run(owner, created.id, key)
      expect(first).toEqual({
        sessionID: SessionV2.ID.make(ScheduledTaskModel.slotIDs(`${created.id}:manual:${key}`, start).session),
        reused: false,
      })
      expect(retry).toEqual({ sessionID: first.sessionID, reused: true })
      expect(yield* sessions.get(first.sessionID)).toMatchObject({ agent: "reviewer", location })
      const other = yield* tasks.capability.run(owner, created.id, "invocation:msg_assistant:call_2")
      expect(other.sessionID).not.toBe(first.sessionID)
      expect(yield* inputs).toHaveLength(2)
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 0, next: created.next })

      yield* TestClock.setTime(created.next! + MINUTE)
      yield* tasks.tick
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 1 })
      expect(yield* inputs).toHaveLength(3)
    }),
  )
})

~~~~


Linhas **470–550**; SHA256 do intervalo `861d9e4a5f4df7b4e7ec6ef99774be9ca3abbe77e70acc6a93f003213fbd95e7`:

~~~~typescript
      expect(yield* tasks.capability.get(gone, orphan.id)).toMatchObject({
        enabled: false,
        disabledReason: "owner-missing",
      })
      expect(yield* inputs).toHaveLength(0)
    }),
  )
})

describe("ScheduledTask capability isolation", () => {
  it.effect("legacy routes never see capability rows and legacy rows keep their behavior", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start - 10 * MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const legacy = yield* tasks.create(directory, {
        name: "Legacy",
        prompt: "Legacy prompt.",
        cadence: "hourly",
        next: start,
        timezone: "America/New_York",
      })
      const schedule = yield* tasks.capability.create(owner, hourly)
      expect((yield* tasks.list(directory)).map((task) => task.id)).toEqual([legacy.id])
      expect(yield* tasks.update(directory, schedule.id, { name: "x" }).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.run(directory, schedule.id).pipe(Effect.flip)).toBeInstanceOf(ScheduledTask.NotFoundError)
      expect(yield* tasks.remove(directory, schedule.id).pipe(Effect.flip)).toBeInstanceOf(ScheduledTask.NotFoundError)
      expect((yield* tasks.capability.list(owner)).map((item) => item.id)).toEqual([schedule.id])
      // Unknown, legacy and foreign IDs fail identically.
      const stranger = { ...owner, sessionID: SessionV2.ID.make("ses_stranger") }
      expect(yield* tasks.capability.get(owner, legacy.id).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.capability.get(stranger, schedule.id).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.capability.list(stranger)).toEqual([])

      yield* TestClock.setTime(start + MINUTE)
      yield* tasks.tick
      const ids = ScheduledTaskModel.slotIDs(legacy.id, start)
      expect(yield* sessions.get(SessionV2.ID.make(ids.session))).toMatchObject({ agent: "maestro" })
      expect((yield* tasks.list(directory))[0]).toMatchObject({ runs: 1, next: start + HOUR })
      const row = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(eq(ScheduledTaskTable.id, legacy.id))
        .get()
        .pipe(Effect.orDie)
      expect(row).toMatchObject({ policy: "legacy-browser", revision: 0, owner: null, skipped: 0 })
    }),
  )

  it.effect("the migrated slot index is unique per task, revision and slot", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const columns = yield* db
        .all<{ name: string }>(sql`PRAGMA index_info('scheduled_task_run_slot_idx')`)
        .pipe(Effect.orDie)
      expect(columns.map((column) => column.name)).toEqual(["task_id", "revision", "slot"])
      const indexes = yield* db
        .all<{ name: string; unique: number }>(sql`PRAGMA index_list(scheduled_task_run)`)
        .pipe(Effect.orDie)
      expect(
        indexes
          .filter(
            (index) => index.name.startsWith("scheduled_task_run_") && index.name !== "scheduled_task_run_state_idx",
          )
          .map((index) => [index.name, index.unique])
          .sort(),
      ).toEqual([
        ["scheduled_task_run_manual_idx", 1],
        ["scheduled_task_run_slot_idx", 1],
      ])
    }),
  )
})
~~~~


### `packages/core/test/scheduled-task.test.ts`

Archive: `sources/packages/core/test/scheduled-task.test.ts` · bytes: 21239 · Git blob: `4d242fd64503184fbfe362fc52907c67539a3686` · SHA256: `0fb2f943f7e8595d5df3996d4fd671455f357cb5fcad2f35631a82c9d494d4b6`.

Papel da fonte: Slots failed consumidos e takeover por lease com mesmos IDs.


Linhas **184–248**; SHA256 do intervalo `701041cb8a81631265c2cd16ca46580aefa6f89f886e2b2746d85c3fcec55c11`:

~~~~typescript
  it.effect("a failed run is recorded with its reason and its slot is not retried", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const created = yield* tasks.create(directory, hourly)
      // The slot's message ID already holds another prompt, so admission conflicts.
      const ids = slotIDs(created.id, slot)
      yield* sessions.create({ id: ids.session, location: { directory } })
      yield* sessions.prompt({ id: ids.message, sessionID: ids.session, prompt: { text: "Something else." } })
      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* tasks.tick
      expect(yield* first(tasks)).toMatchObject({
        runs: 0,
        next: slot + HOUR,
        last: { outcome: "failed", slot, error: expect.stringContaining("conflicts") },
      })
      expect((yield* runRows).map((row) => row.state)).toEqual(["failed"])
      expect(yield* inputs).toHaveLength(1)
    }),
  )
})

describe("ScheduledTask restart recovery", () => {
  it.effect("a stopped process's claim is left alone until its lease ends, then finished without a second prompt", () =>
    Effect.gen(function* () {
      wakes.length = 0
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      yield* TestClock.setTime(slot + MINUTE)
      const ids = yield* stopped({ task: created, slot, claimed: slot + MINUTE, admitted: true })
      wakes.length = 0
      yield* tasks.tick
      expect(yield* first(tasks)).toMatchObject({ runs: 0, next: slot })

      yield* TestClock.setTime(slot + MINUTE + ScheduledTask.LEASE + 1)
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      // The exact retry reconciles the admitted prompt and wakes its Session.
      expect(wakes).toEqual([ids.session])
      expect(yield* first(tasks)).toMatchObject({
        runs: 1,
        next: slot + HOUR,
        last: { outcome: "started", sessionID: ids.session },
      })
      expect((yield* runRows).map((row) => [row.slot, row.state, row.owner])).toEqual([[slot, "started", null]])
    }),
  )

  it.effect("a stopped claim that never admitted its prompt is void, and the slot is served once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      const ids = yield* stopped({ task: created, slot, claimed: slot - MINUTE, admitted: false })
      yield* TestClock.setTime(slot + ScheduledTask.LEASE)
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.slot, row.state])).toEqual([[slot, "started"]])
      expect(yield* first(tasks)).toMatchObject({ runs: 1, next: slot + HOUR })
    }),
  )

~~~~
