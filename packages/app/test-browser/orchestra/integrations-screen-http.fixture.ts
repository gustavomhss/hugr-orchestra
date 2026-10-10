import { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Schema } from "effect"
import type { Options, Receipt } from "../../src/orchestra/chapters/integrations-contract"

// Happy DOM replaces Response; Bun.serve needs Bun's native wire response.
const Response = (await Bun.fetch("data:application/json,{}")).constructor as typeof global.Response

export function createPendingSetup(reply: Promise<Receipt>, started: () => void) {
  const requests: { method: string; path: string }[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({ method: request.method, path: new URL(request.url).pathname })
      started()
      return Response.json(await reply)
    },
  })
  return {
    requests,
    stop: () => server.stop(true),
    connect: async (input: CapabilitySetup.Input, key: string, options?: Options) => {
      const response = await Bun.fetch(new URL("/api/capability/connections/connect", server.url), {
        method: "POST",
        signal: options?.signal,
        body: JSON.stringify(input),
        headers: { "content-type": "application/json", "idempotency-key": key },
      })
      if (!response.ok) throw { status: response.status }
      return Schema.decodeUnknownSync(CapabilityManagement.Receipt)(await response.json())
    },
  }
}
