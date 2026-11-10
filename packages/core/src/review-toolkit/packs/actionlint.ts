export * as ReviewPackActionlint from "./actionlint"

import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/actionlint"
import { BackendToolkit } from "../../backend-toolkit"

export { RULES } from "./actionlint-report"
export { prepare, argv, environment } from "./actionlint-input"
export { settle } from "./actionlint-result"

export const manifest = pinned
export const templateId = "actionlint-host-json"
export const parserId = "actionlint"

export const locate = Effect.fn("ReviewPackActionlint.locate")(function* () {
  // The static PE import scan does not qualify every Windows runtime API.
  if (process.platform === "win32") return { absent: "actionlint unsupported: windows-api-unqualified" }
  const states = yield* BackendToolkit.status(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `actionlint unsupported: ${state.reason}` }
  return { absent: "actionlint absent" }
})
