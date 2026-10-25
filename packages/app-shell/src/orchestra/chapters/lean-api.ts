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

/** The V2 server serves the dashboard through `orchestra` (`/api/lean`); without it the server counts as unsupported. */
export function createLeanAPI(sdk: Pick<DirectorySDK, "directory">, orchestra?: LeanClient): LeanDashboard.Transport {
  const response = async <T>(
    run: (client: LeanClient) => Promise<{ data: unknown }>,
    decode: (value: unknown) => T,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted()
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
  const location = { directory: sdk.directory }
  return {
    read: (signal) => response((client) => client.lean.get({ location }, { signal }), decodeInfo, signal),
    update: (leanProfileUpdate, signal) =>
      response((client) => client.lean.update({ location, ...leanProfileUpdate }, { signal }), decodeInfo, signal),
    history: (itemID, signal) =>
      response((client) => client.lean.history({ location, itemID }, { signal }), decodeHistory, signal),
  }
}

function missing(error: ClientError) {
  const cause = error.cause
  return typeof cause === "object" && cause !== null && "status" in cause && [404, 405, 501].includes(Number(cause.status))
}
