export * as ReviewPackZizmor from "./zizmor"

import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/zizmor"
import { BackendToolkit } from "../../backend-toolkit"

export { RULES } from "./zizmor-rules"
export { prepare, argv, environment } from "./zizmor-input"
export { settle } from "./zizmor-result"

export const manifest = pinned
export const templateId = "zizmor-host-sarif"
export const locate = Effect.fn("ReviewPackZizmor.locate")(function* () {
  // Provisioned artifacts on other targets are not production runtime qualification.
  if (process.platform !== "linux" || process.arch !== "x64") return { absent: "zizmor unsupported: native-runtime-unqualified" }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { absent: "zizmor unsupported: native-runtime-unqualified" }
  const states = yield* BackendToolkit.status<string>(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `zizmor unsupported: ${state.reason}` }
  return { absent: "zizmor absent" }
})
