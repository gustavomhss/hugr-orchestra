import { Effect } from "effect"
import { FabricIdentityCallbacks } from "../../src/identity-callback"
import { preparedSetup } from "./identity-preparation"

export function callbackSetup(
  root: import("@orchestra/schema/schema").AbsolutePath,
  options?: { now?: () => number; maxEntries?: number; redirectUri?: string },
) {
  return Effect.gen(function* () {
    const s = yield* preparedSetup(root, options?.now, options?.redirectUri)
    const callbacks = yield* FabricIdentityCallbacks.make({ ...s.options, maxEntries: options?.maxEntries })
    return { ...s, callbacks }
  })
}

export function response(authorizationURL: string, redirectUri: string, code = "SYNTHETIC_CALLBACK_CODE_FIRST") {
  return (
    redirectUri +
    "?" +
    new URLSearchParams({ state: new URL(authorizationURL).searchParams.get("state")!, code }).toString()
  )
}
