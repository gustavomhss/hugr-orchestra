import { Effect } from "effect"
import { Orchestra } from "@orchestra/client"
import { Daemon } from "../../services/daemon"

export function withCapturedStdout(run: () => Promise<void>): Promise<string> {
  return withCaptured(process.stdout, run)
}

export function withCapturedStderr(run: () => Promise<void>): Promise<string> {
  return withCaptured(process.stderr, run)
}

async function withCaptured(stream: NodeJS.WriteStream, run: () => Promise<void>): Promise<string> {
  const original = stream.write
  let out = ""
  stream.write = ((chunk: string | Uint8Array) => {
    out += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof stream.write
  try {
    await run()
  } finally {
    stream.write = original
  }
  return out
}

export function fakeDaemon(baseUrl: string) {
  return {
    client: () => Effect.succeed(Orchestra.make({ baseUrl })),
    transport: () => Effect.succeed({ url: baseUrl, headers: {} as RequestInit["headers"] }),
    start: () => Effect.succeed(baseUrl),
    startOn: () => Effect.succeed(baseUrl),
    status: () => Effect.succeed(baseUrl),
    stop: () => Effect.void,
    password: () => Effect.succeed("test"),
    register: () => Effect.void,
  } satisfies Daemon.Interface
}

export function stubServer(handle: (request: Request) => Response | Promise<Response>) {
  return Bun.serve({ port: 0, fetch: handle })
}

export function clientUrl(server: { url: URL }) {
  return server.url.toString().replace(/\/$/, "")
}