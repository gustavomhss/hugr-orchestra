export * as FabricIdentityTokenHttp from "./identity-token-http"

import { Effect, Option, Schema } from "effect"
import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node"
import { FabricIdentityHttps } from "./identity-https"
import { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokenHttpContract } from "./identity-token-http-contract"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

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
        const response = await Effect.runPromise(dispatch(url, options, { network, timeoutMs, signal }))
        // Public MSAL network API is generic over untrusted JSON. Producer/MSAL validate it before any candidate exists.
        return { ...response, body: response.body as T }
      },
    })
    return Object.freeze({ ...bind(), bind })
  })
}

/** Host child-fiber entrypoint: unlike the MSAL Promise API, this preserves the actual invocation for admission. */
export function dispatch<E = never, R = never>(
  url: string,
  request: NetworkRequestOptions | undefined,
  options: Readonly<{
    network?: FabricIdentityDiscoveryContract.Options["network"]
    timeoutMs: number
    signal?: AbortSignal
    admit?: Effect.Effect<void, E, R>
  }>,
) {
  return Effect.gen(function* () {
    if (
      !request ||
      !FabricIdentityHttps.validCorrelation(request.correlationId) ||
      url !== FabricIdentityHttps.tokenEndpoint + "?client-request-id=" + request.correlationId ||
      typeof request.body !== "string" ||
      Object.keys(request.headers ?? {}).some((key) =>
        ["authorization", "cookie", "proxy-authorization"].includes(key.toLowerCase()),
      )
    )
      return yield* failure("unavailable")
    const response = yield* FabricIdentityHttps.post(request.body, { ...options, correlationID: request.correlationId })
    const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(response.body)
    if (Option.isNone(decoded)) return yield* failure("unavailable")
    return { status: response.status, headers: response.headers, body: decoded.value }
  })
}

function failure(code: "invalid-input" | "unavailable") {
  return new FabricIdentityTokens.Failure({ code, message: "Fabric identity exchange is unavailable" })
}
