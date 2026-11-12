import { Effect, Option } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@orchestra/core/backend-toolkit/target"
import { ReviewToolkitManifest } from "@orchestra/core/review-toolkit/manifest"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { names, print } from "./format"

export default Runtime.handler(
  Commands.commands.toolkit.commands.prefetch,
  Effect.fn("cli.toolkit.prefetch")(function* (input) {
    const manifest = { ...BackendToolkitManifest.ENGINES, ...ReviewToolkitManifest.ENGINES }
    const known = Object.keys(manifest)
    const unknown = input.engines.find((engine) => !known.includes(engine))
    if (unknown) return yield* Effect.fail(new Error(`Unknown engine "${unknown}". Available: ${known.join(", ")}`))
    const requested = Option.getOrUndefined(input.target)
    const target = BackendToolkitTarget.TARGETS.find((item) => item === requested)
    if (requested && !target)
      return yield* Effect.fail(new Error(`Unknown target "${requested}". Available: ${BackendToolkitTarget.TARGETS.join(", ")}`))
    // Keep the default backend prefetch unchanged; review pins are explicitly requested.
    const ids = input.engines.length ? input.engines : Object.keys(BackendToolkitManifest.ENGINES)
    const states = yield* BackendToolkit.prefetch<string>(ids, target).pipe(
      Effect.provideService(BackendToolkit.Manifest, manifest),
    )
    print(states, input.json)
    const broken = states.filter((state) => state.status !== "ready")
    if (broken.length) return yield* Effect.fail(new Error(`backend toolkit prefetch failed: ${names(broken)}`))
  }),
)
