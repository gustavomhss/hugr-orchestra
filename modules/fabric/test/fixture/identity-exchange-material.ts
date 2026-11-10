import { Effect } from "effect"
import { FabricIdentityExchangeMaterial } from "../../src/identity-exchange-material"
import { callbackSetup, response } from "./identity-callback"

export function exchangeMaterialSetup(root: import("@orchestra/schema/schema").AbsolutePath, now?: () => number) {
  return Effect.gen(function* () {
    const s = yield* callbackSetup(root, { now })
    const ready = yield* s.run(s.callbacks.register(s.selection))
    s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
    const claim = yield* s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt }))
    if (claim.outcome !== "claimed") throw new Error("Expected a real authorized callback claim")
    const reader = yield* FabricIdentityExchangeMaterial.make(s.options)
    return { ...s, ready, claim, reader, selected: { context: s.info.context, attempt: claim.attempt } }
  })
}
