export * as LegacySiwc from "./siwc"

import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"
import { Siwc } from "@orchestra/core/auth/siwc"
import { SiwcRefresh } from "@orchestra/core/auth/siwc-refresh"
import { Credential } from "@orchestra/schema/credential"
import { IntegrationMethodID } from "@orchestra/schema/integration-id"
import { Auth } from "../../auth"

export const methodID = IntegrationMethodID.make("chatgpt-browser")

export function credential(value: Auth.Oauth) {
  return Credential.OAuth.make({ ...value, methodID })
}

export function requireSelected(value: Auth.Oauth, selected: Siwc.Registration) {
  const current = Siwc.registration(value.metadata)
  if (current.clientId !== selected.clientId || current.subject !== selected.subject || current.hostId !== selected.hostId)
    throw new Error("ChatGPT account changed; reload the model before inference")
  return value
}

/** Own-store refresh lease spans HTTP, JWT validation and CAS, across Locations/processes. */
export async function resolve(input: {
  getAuth: () => Promise<unknown>
  selected: Siwc.Registration
  inherited: () => Promise<boolean>
  transport?: (url: string, init: RequestInit) => Promise<Response>
  jwksURL?: URL
}) {
  const value = requireSelected(Schema.decodeUnknownSync(Auth.Oauth)(await input.getAuth()), input.selected)
  if (value.access && value.expires > Date.now() + 5 * 60 * 1000) return credential(value)
  return Auth.runPromise((store) => Auth.withRefreshLease("openai", Effect.gen(function* () {
    const current = yield* store.get("openai")
    const effective = yield* Effect.tryPromise(() => input.getAuth())
    const readonly = yield* Effect.tryPromise(() => input.inherited())
    if (readonly) throw new Error("Inherited ChatGPT OAuth credentials cannot be refreshed")
    if (current?.type !== "oauth") throw new Error("ChatGPT account removed or changed")
    requireSelected(current, input.selected)
    // A loader may expose inherited credentials even when an own entry exists.
    // Never rotate an effective credential that is not exactly this own-store row.
    const decoded = Schema.decodeUnknownSync(Auth.Oauth)(effective)
    if (!isDeepStrictEqual(Schema.encodeSync(Auth.Oauth)(current), Schema.encodeSync(Auth.Oauth)(decoded)))
      throw new Error("ChatGPT credentials are not owned by this store; sign in again")
    if (current.access && current.expires > Date.now() + 5 * 60 * 1000) return credential(current)
    const rotated = yield* Effect.tryPromise(() => SiwcRefresh.exchange(credential(current), input.transport, input.jwksURL))
    const next = new Auth.Oauth({ ...current, access: rotated.access, refresh: rotated.refresh, expires: rotated.expires,
      metadata: { ...rotated.metadata, resource: Siwc.resource } })
    if (yield* Effect.tryPromise(() => input.inherited())) throw new Error("ChatGPT credential source changed during refresh")
    if (!(yield* store.replaceIf("openai", current, next))) throw new Error("ChatGPT credential changed during refresh; reload the model")
    return credential(next)
  })))
}
