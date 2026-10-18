export * as OutputDownload from "./download"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Scope } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsResponse } from "../transport/response"
import { OutputNative } from "./native"
import { OutputSigned } from "./signed"
import { OutputTarget } from "./target"

export const open = Effect.fn("ActionsOutput.downloadOpen")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding,
  input: Actions.TransferInput, target: OutputTarget.Target, renew = false,
): Effect.fn.Return<{ response: ActionsContract.RawResponse; info: Actions.TransferInfo }, ActionsError, Scope.Scope> {
  if (!transport.open) return yield* OutputNative.error(binding, "capability_unavailable", "GitLab CI output requires the scoped native raw-opening transport")
  const native = yield* transport.open(binding, target.request)
  if (native.status >= 200 && native.status < 300) return { response: native, info: target.info }
  if (![301, 302, 303, 307, 308].includes(native.status)) {
    yield* native.close
    return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), native.status, { ...native.headers })
  }
  const location = native.headers.location
  yield* native.close
  if (!location) return yield* OutputNative.error(binding, "transfer_failed", "Native CI output redirect has no Location")
  const base = yield* OutputNative.checked(binding, () => new URL(`${new URL(binding.provider.apiOrigin).origin}/api/v4/${target.request.path}`))
  const signed = yield* OutputSigned.follow(binding, location, base)
  if (signed.status >= 200 && signed.status < 300) return { response: signed, info: target.info }
  yield* signed.close
  // One read-only renewal, before any byte reaches caller. Revalidate identities
  // and GET original native endpoint; never replay an expired signed URL.
  if (renew && [401, 403, 404].includes(signed.status)) {
    const fresh = yield* OutputTarget.resolve(transport, reader, binding, input)
    if (fresh.request.path !== target.request.path)
      return yield* OutputNative.error(binding, "binding_stale", "Signed URL renewal changed the selected native output endpoint")
    return yield* open(transport, reader, binding, input, fresh, false)
  }
  return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), signed.status, { ...signed.headers })
})
