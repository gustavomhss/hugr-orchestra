export * as ActionsAuthoring from "./index"
export { editSchedule } from "./schedule"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsGraph } from "../source/graph"
import { limits } from "../source/document"
import { capture, decode } from "./input"
import type { Services } from "./input"
import { plan } from "./github"
import { guard, before, send } from "./remote"

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
