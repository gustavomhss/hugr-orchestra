import { Effect } from "effect"
import { Orchestra } from "@orchestra/client"
import { Daemon } from "../../services/daemon"

export async function withCapturedStdout(run: () => Promise<void>): Promise<string> {
  const original = process.stdout.write
  let out = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    await run()
  } finally {
    process.stdout.write = original
  }
  return out
}

export function fakeDaemon(baseUrl: string) {
  return {
    client: () => Effect.succeed(Orchestra.make({ baseUrl })),
    transport: () => Effect.succeed({ url: baseUrl, headers: {} as RequestInit["headers"] }),
    start: () => Effect.succeed(baseUrl),
    status: () => Effect.succeed(baseUrl),
    stop: () => Effect.void,
    password: () => Effect.succeed("test"),
    register: () => Effect.void,
  } satisfies Daemon.Interface
}

export function stubServer(handle: (request: Request) => Response) {
  return Bun.serve({ port: 0, fetch: handle })
}

export function clientUrl(server: { url: URL }) {
  return server.url.toString().replace(/\/$/, "")
}