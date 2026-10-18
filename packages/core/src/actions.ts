export * as Actions from "./actions"

import { Actions } from "@orchestra/schema/actions"
import { Context, Effect, Layer, Schema, Scope, Stream } from "effect"
import { ActionsBinding } from "./actions/binding"
import { ActionsContract } from "./actions/contract"
import { ActionsError } from "./actions/error"
import { ActionsGitHubRead } from "./actions/github/index"
import { ActionsGitLabRead } from "./actions/gitlab/index"
import { ActionsOperations } from "./actions/operations"
import { ActionsReadback } from "./actions/readback"
import { ActionsResources } from "./actions/resources"
import { ActionsTransport } from "./actions/transport"
import { Database } from "./database/database"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { Location } from "./location"
import { AppProcess } from "./process"

export { ActionsError } from "./actions/error"

export interface Interface {
  readonly bindings: ActionsContract.Bindings
  readonly capabilities: (binding: Actions.BindingRef) => Effect.Effect<Actions.Capability[], ActionsError>
  readonly workflows: (binding: Actions.BindingRef, input: Actions.ListInput) => Effect.Effect<Actions.WorkflowPage, ActionsError>
  readonly source: (binding: Actions.BindingRef, input: { path: string; ref: string }) => Effect.Effect<Actions.Source, ActionsError>
  readonly graph: (binding: Actions.BindingRef, input: { path: string; ref: string }) => Effect.Effect<Actions.Graph, ActionsError>
  readonly runs: (binding: Actions.BindingRef, input: Actions.RunListInput) => Effect.Effect<Actions.RunPage, ActionsError>
  readonly run: (binding: Actions.BindingRef, id: string) => Effect.Effect<Actions.Run, ActionsError>
  readonly jobs: (binding: Actions.BindingRef, input: { runID: string; attempt?: number; cursor?: string }) => Effect.Effect<Actions.JobPage, ActionsError>
  readonly prepare: (binding: Actions.BindingRef, input: Actions.OperationIntent) => Effect.Effect<Actions.Operation, ActionsError>
  readonly operation: (binding: Actions.BindingRef, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly reconcile: (binding: Actions.BindingRef, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly resources: (binding: Actions.BindingRef, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly transferInfo: (binding: Actions.BindingRef, input: Actions.TransferInput) => Effect.Effect<Actions.TransferInfo, ActionsError>
  readonly transfer: (binding: Actions.BindingRef, input: Actions.TransferInput) => Stream.Stream<Uint8Array, ActionsError>
  readonly validateSource: (binding: Actions.BindingRef, source: Actions.Source, draft: string) => Effect.Effect<Actions.Graph, ActionsError>
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
  }
  return {
    bindings,
    capabilities: Effect.fn("Actions.capabilities")(function* (ref) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).capabilities(binding)
    }),
    workflows: Effect.fn("Actions.workflows")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).workflows(binding, input)
    }),
    source: Effect.fn("Actions.source")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).source(binding, input)
    }),
    graph: Effect.fn("Actions.graph")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const source = yield* reader(binding).source(binding, input)
      const { ActionsGraph } = yield* Effect.promise(() => import("./actions/source/graph"))
      return ActionsGraph.parse(binding.provider.kind, source)
    }),
    runs: Effect.fn("Actions.runs")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).runs(binding, input)
    }),
    run: Effect.fn("Actions.run")(function* (ref, id) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).run(binding, id)
    }),
    jobs: Effect.fn("Actions.jobs")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      return yield* reader(binding).jobs(binding, input)
    }),
    prepare: Effect.fn("Actions.prepare")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const service = yield* operations
      return yield* service.prepare(binding, input)
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
    }),
    resources: Effect.fn("Actions.resources")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      if (input.kind === "artifacts") {
        const service = yield* output(binding)
        return yield* service.artifacts(binding, input)
      }
      return yield* resources.list(binding, input)
    }),
    transferInfo: Effect.fn("Actions.transferInfo")(function* (ref, input) {
      const binding = yield* bindings.get(ref)
      const service = yield* output(binding)
      return yield* service.info(binding, input)
    }),
    transfer: (ref, input) => Stream.unwrap(Effect.gen(function* () {
      const binding = yield* bindings.get(ref)
      const service = yield* output(binding)
      return service.read(binding, input)
    })),
    validateSource: Effect.fn("Actions.validateSource")(function* (ref, source, draft) {
      const binding = yield* bindings.get(ref)
      if (source.bindingID !== binding.id)
        return yield* new ActionsError({ kind: "binding_stale", message: "Source belongs to another binding", disposition: "definitely_unsent" })
      const { ActionsAuthoring } = yield* Effect.promise(() => import("./actions/authoring/index"))
      return yield* ActionsAuthoring.make({ transport, reader: reader(binding) }).validate(binding, { ...source, text: draft })
    }),
    sourceBase: Effect.fn("Actions.sourceBase")(function* (ref, branch) {
      const binding = yield* bindings.get(ref)
      const { ActionsSourceBase } = yield* Effect.promise(() => import("./actions/authoring/base"))
      return yield* ActionsSourceBase.read({ transport, reader: reader(binding) }, binding, branch)
    }),
    validateDraft: Effect.fn("Actions.validateDraft")(function* (ref, base, path, draft) {
      const snapshot = { ...base }
      const binding = yield* bindings.get(ref)
      const { ActionsSourceBase } = yield* Effect.promise(() => import("./actions/authoring/base"))
      return yield* ActionsSourceBase.validate({ transport, reader: reader(binding) }, binding, snapshot, path, draft)
    }),
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
