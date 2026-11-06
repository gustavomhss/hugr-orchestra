export * as FabricIdentityTokenHttp from "./identity-token-http"

import { Effect, Option, Schema } from "effect"
import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node"
import { FabricIdentityHttps } from "./identity-https"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokenHttpContract } from "./identity-token-http-contract"

/** Private library transport. This does not establish operator authority; the contextual host owns dispatch admission. */
export const make: FabricIdentityTokenHttpContract.Factory = (options) => {
  const network = options?.network ? { ...options.network } : undefined
  const timeoutMs = options?.timeoutMs ?? 10000
  return Effect.gen(function* () {
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 10000 ||
      (network && !FabricIdentityHttps.validNetwork(network))
    )
      return yield* failure("invalid-input")
    const bind = (signal?: AbortSignal): INetworkModule => ({
      sendGetRequestAsync: async () => {
        throw failure("unavailable")
      },
      sendPostRequestAsync: async <T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> => {
        if (
          !options ||
          !FabricIdentityHttps.validCorrelation(options.correlationId) ||
          url !== FabricIdentityHttps.tokenEndpoint + "?client-request-id=" + options.correlationId ||
          typeof options?.body !== "string" ||
          Object.keys(options.headers ?? {}).some((key) =>
            ["authorization", "cookie", "proxy-authorization"].includes(key.toLowerCase()),
          )
        )
          throw failure("unavailable")
        const response = await Effect.runPromise(
          FabricIdentityHttps.post(options.body, { network, timeoutMs, signal, correlationID: options.correlationId }),
        )
        const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(response.body)
        if (Option.isNone(decoded)) throw failure("unavailable")
        // Public MSAL network API is generic over untrusted JSON. Producer/MSAL validate it before any candidate exists.
        return { status: response.status, headers: response.headers, body: decoded.value as T }
      },
    })
    return Object.freeze({ ...bind(), bind })
  })
}

function failure(code: "invalid-input" | "unavailable") {
  return new FabricIdentityTokens.Failure({ code, message: "Fabric identity exchange is unavailable" })
}
