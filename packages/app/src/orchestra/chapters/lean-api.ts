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

export function createLeanAPI(sdk: Pick<DirectorySDK, "client" | "directory" | "protocol">): LeanDashboard.Transport {
  const response = async <T>(
    run: () => Promise<{ data?: unknown; error?: unknown; response?: Response }>,
    decode: (value: unknown) => T,
    signal?: AbortSignal,
  ) => {
    const protocol = await sdk.protocol
    signal?.throwIfAborted()
    if (protocol !== "v1") throw new LeanAPIError("unsupported")
    // Retain the SDK's directory/auth/fetch/error interceptors; inspect HTTP status before throwing.
    const result = await run()
    if (result.response && [404, 405, 501].includes(result.response.status)) throw new LeanAPIError("unsupported")
    if (result.error !== undefined) throw result.error
    try {
      return decode(result.data)
    } catch (cause) {
      throw new LeanAPIError("invalid", cause)
    }
  }
  return {
    read: (signal) => response(
      () => sdk.client.project.lean({ directory: sdk.directory }, { signal, throwOnError: false }), decodeInfo, signal,
    ),
    update: (leanProfileUpdate, signal) => response(
      () => sdk.client.project.leanUpdate({ directory: sdk.directory, leanProfileUpdate }, { signal, throwOnError: false }),
      decodeInfo, signal,
    ),
    history: (itemID, signal) => response(
      () => sdk.client.project.leanHistory({ directory: sdk.directory, itemID }, { signal, throwOnError: false }),
      decodeHistory, signal,
    ),
  }
}
