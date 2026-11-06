export * as ReviewPackOxlint from "./oxlint"

import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/oxlint"
import { BackendToolkit } from "../../backend-toolkit"

export { prepare, argv, environment } from "./oxlint-input"
export { settle } from "./oxlint-result"

export const RULES = ["eslint(no-debugger)", "typescript(no-explicit-any)"] as const
export const manifest = pinned
export const templateId = "oxlint-host-sarif"
export const locate = Effect.fn("ReviewPackOxlint.locate")(function* () {
  // Provisioned artifacts on other targets are not production runtime qualification.
  if (process.platform !== "linux" || process.arch !== "x64") return { absent: "oxlint unsupported: native-runtime-unqualified" }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { absent: "oxlint unsupported: native-runtime-unqualified" }
  const states = yield* BackendToolkit.status<string>(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `oxlint unsupported: ${state.reason}` }
  return { absent: "oxlint absent" }
})
