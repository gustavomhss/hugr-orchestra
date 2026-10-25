import { describe, expect, test } from "bun:test"
import { mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

// The daemon keeps its password under the state directory, so the test gives it a private one before it loads.
const state = await mkdtemp(path.join(tmpdir(), "daemon-port-"))
process.env.XDG_STATE_HOME = state
const { Daemon } = await import("../src/services/daemon")

const run = <A>(effect: Effect.Effect<A, unknown, Daemon.Service>) =>
  effect.pipe(Effect.provide(Daemon.layer), Effect.provide(NodeServices.layer), Effect.runPromise)

describe("daemon startOn", () => {
  test("points at a server that already answers on the port, without starting one", async () => {
    const seen: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        seen.push(`${request.method} ${new URL(request.url).pathname} ${request.headers.get("authorization")?.slice(0, 6)}`)
        return Response.json({ healthy: true, version: "x" })
      },
    })
    try {
      const url = await run(
        Effect.gen(function* () {
          const daemon = yield* Daemon.Service
          return yield* daemon.startOn(server.port!)
        }),
      )
      expect(url).toBe(`http://127.0.0.1:${server.port}`)
      expect(seen).toEqual(["GET /api/health Basic "])
    } finally {
      server.stop(true)
    }
  })
})
