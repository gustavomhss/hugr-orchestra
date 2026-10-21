import { ClientError, type Orchestra } from "@orchestra/client"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { Schema } from "effect"
import type { DirectorySDK } from "@/context/sdk"

export class LeanAPIError extends Error {
  constructor(readonly reason: "unsupported" | "invalid", cause?: unknown) {
    super(reason, { cause })
  }
}

// Unknown generated counters/time become trusted numbers only after public Schema decoding.
const decodeInfo = Schema.decodeUnknownSync(LeanDashboard.Info, { onExcessProperty: "ignore" })
const decodeHistory = Schema.decodeUnknownSync(LeanDashboard.History, { onExcessProperty: "ignore" })

type LeanClient = Pick<ReturnType<typeof Orchestra.make>, "lean">

/** The V2 server serves the dashboard through `orchestra` (`/api/lean`); without it a V2 server counts as unsupported. */
export function createLeanAPI(
  sdk: Pick<DirectorySDK, "client" | "directory" | "protocol">,
  orchestra?: LeanClient,
): LeanDashboard.Transport {
  const current = async <T>(run: (client: LeanClient) => Promise<{ data: unknown }>, decode: (value: unknown) => T) => {
    if (!orchestra) throw new LeanAPIError("unsupported")
    const result = await run(orchestra).catch((error: unknown) => {
      // A server that predates the route answers with an undeclared 404.
      if (error instanceof ClientError && missing(error)) throw new LeanAPIError("unsupported", error)
      throw error
    })
    try {
      return decode(result.data)
    } catch (cause) {
      throw new LeanAPIError("invalid", cause)
    }
  }
  const response = async <T>(
    run: () => Promise<{ data?: unknown; error?: unknown; response?: Response }>,
    decode: (value: unknown) => T,
    signal?: AbortSignal,
    v2?: (client: LeanClient) => Promise<{ data: unknown }>,
  ) => {
    const protocol = await sdk.protocol
    signal?.throwIfAborted()
    if (protocol === "v2" && v2) return current(v2, decode)
    // Retain the SDK's directory/auth/fetch/error interceptors; inspect HTTP status before throwing.
    const result = await run()
    if (result.response && [404, 405, 501].includes(result.response!.status)) throw new LeanAPIError("unsupported")
    if (result.error !== undefined) throw result.error
    try {
      return decode(result.data)
    } catch (cause) {
      throw new LeanAPIError("invalid", cause)
    }
  }
  const location = { directory: sdk.directory }
  return {
    read: (signal) => response(
      () => sdk.client.project.lean({ directory: sdk.directory }, { signal, throwOnError: false }), decodeInfo, signal,
      (client) => client.lean.get({ location }, { signal }),
    ),
    update: (leanProfileUpdate, signal) => response(
      () => sdk.client.project.leanUpdate({ directory: sdk.directory, leanProfileUpdate }, { signal, throwOnError: false }),
      decodeInfo, signal,
      (client) => client.lean.update({ location, ...leanProfileUpdate }, { signal }),
    ),
    history: (itemID, signal) => response(
      () => sdk.client.project.leanHistory({ directory: sdk.directory, itemID }, { signal, throwOnError: false }),
      decodeHistory, signal,
      (client) => client.lean.history({ location, itemID }, { signal }),
    ),
  }
}

function missing(error: ClientError) {
  const cause = error.cause
  return typeof cause === "object" && cause !== null && "status" in cause && [404, 405, 501].includes(Number(cause.status))
}
