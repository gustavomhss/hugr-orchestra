import { expect } from "bun:test"
import type { Socket } from "bun"
import { Actions } from "../../schema/src/actions"
import { ActionsTransferError, makeActionsTransfer } from "../src/actions-transfer"

export const binding = { id: Actions.BindingID.make("ab_fixture"), revision: 7 }
export const operationID = Actions.OperationID.make("aop_fixture")
export const location = { directory: "/project with spaces/é", workspace: "ws/name?&=" }
export const target = {
  kind: "artifact",
  id: "42/#?&=é",
  runID: "run/9",
  attempt: 3,
  path: "reports/archive #1.zip",
} as const

export function actionsFixture(handler: (request: Request) => Response | Promise<Response>) {
  const requests: Array<{ method: string; url: URL; headers: Headers }> = []
  const calls: RequestInit[] = []
  const responses: Response[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push({ method: request.method, url: new URL(request.url), headers: request.headers })
      return handler(request)
    },
  })
  return {
    server,
    requests,
    calls,
    responses,
    client: makeActionsTransfer({
      baseUrl: new URL("/configured/base", server.url).href,
      headers: { authorization: "Bearer fixture-auth", "x-configured": "kept", "x-override": "old" },
      fetch: Object.assign(
        (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          calls.push(init ?? {})
          return fetch(input, init).then((response) => {
            responses.push(response)
            return response
          })
        },
        { preconnect: fetch.preconnect },
      ),
    }),
    async [Symbol.asyncDispose]() {
      await server.stop(true)
    },
  }
}

// Socket-level fixture keeps Content-Length and exposes abrupt disconnects faithfully.
export function actionsSocketFixture(handler: (socket: Socket<{ replied: boolean }>) => void) {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    data: { replied: false },
    socket: {
      data(socket) {
        if (socket.data.replied) return
        socket.data.replied = true
        handler(socket)
      },
    },
  })
  return {
    client: makeActionsTransfer({ baseUrl: `http://127.0.0.1:${server.port}` }),
    async [Symbol.asyncDispose]() {
      server.stop(true)
    },
  }
}

export async function digest(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) throw new Error("Missing raw response/request body")
  const reader = stream.getReader()
  const hasher = new Bun.CryptoHasher("sha256")
  let bytes = 0
  let chunks = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) return { bytes, chunks, hash: hasher.digest("hex") }
      bytes += next.value.byteLength
      chunks++
      hasher.update(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function within<T>(promise: Promise<T>, ms = 3_000) {
  return Promise.race([
    promise,
    Bun.sleep(ms).then(() => {
      throw new Error("HTTP fixture deadline exceeded")
    }),
  ])
}

export async function failure(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => {
      throw new Error("Expected transfer failure")
    },
    (error: unknown) => error,
  )
  expect(error).toBeInstanceOf(ActionsTransferError)
  if (!(error instanceof ActionsTransferError)) throw error
  return error
}
