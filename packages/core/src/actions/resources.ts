export * as ActionsResources from "./resources"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import type { AppProcess } from "../process"
import { ActionsContract } from "./contract"
import { ActionsError } from "./error"

export function make(input: {
  transport: ActionsContract.Transport
  reader: (binding: Actions.Binding) => ActionsContract.ReadAdapter
  directory: string
  proc: AppProcess.Interface
}) {
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
