import * as Effect from "effect/Effect"
import { Option } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@orchestra/core/backend-toolkit/target"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { names, print } from "./format"

export default Runtime.handler(
  Commands.commands.toolkit.commands.prefetch,
  Effect.fn("cli.toolkit.prefetch")(function* (input) {
    const known = Object.keys(BackendToolkitManifest.ENGINES)
    const unknown = input.engines.find((engine) => !known.includes(engine))
    if (unknown) return yield* Effect.fail(new Error(`Unknown engine "${unknown}". Available: ${known.join(", ")}`))
    const requested = Option.getOrUndefined(input.target)
    const target = BackendToolkitTarget.TARGETS.find((item) => item === requested)
    if (requested && !target)
      return yield* Effect.fail(new Error(`Unknown target "${requested}". Available: ${BackendToolkitTarget.TARGETS.join(", ")}`))
    const ids = Object.values(BackendToolkitManifest.ENGINES)
      .map((engine) => engine.id)
      .filter((id) => !input.engines.length || input.engines.includes(id))
    const states = yield* BackendToolkit.prefetch(ids, target)
    print(states, input.json)
    const broken = states.filter((state) => state.status !== "ready")
    if (broken.length) return yield* Effect.fail(new Error(`backend toolkit prefetch failed: ${names(broken)}`))
  }),
)
