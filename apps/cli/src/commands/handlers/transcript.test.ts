import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Option } from "effect"
import { Daemon } from "../../services/daemon"
import { clientUrl, fakeDaemon, stubServer, withCapturedStdout } from "./test-support"
import transcriptExport from "./export"
import transcriptImport from "./import"

const runWith = <A>(effect: Effect.Effect<A, unknown, Daemon.Service>, baseUrl: string) =>
  effect.pipe(Effect.provideService(Daemon.Service, fakeDaemon(baseUrl)), Effect.runPromise)

const message = (index: number) => ({ id: `msg_${index}`, time: { created: index }, type: "user", text: `text ${index}` })

describe("export", () => {
  test("pages through every message instead of stopping at the first page", async () => {
    const queries: URLSearchParams[] = []
    const server = stubServer((request) => {
      const url = new URL(request.url)
      if (url.pathname === "/api/session/ses_big") return Response.json({ data: { id: "ses_big" } })
      if (url.pathname !== "/api/session/ses_big/message") return new Response("not found", { status: 404 })
      queries.push(url.searchParams)
      if (url.searchParams.get("cursor") === "next-page")
        return Response.json({ data: Array.from({ length: 50 }, (_, index) => message(200 + index)), cursor: {} })
      return Response.json({ data: Array.from({ length: 200 }, (_, index) => message(index)), cursor: { next: "next-page" } })
    })
    try {
      const out = await withCapturedStdout(() =>
        runWith(transcriptExport({ sessionID: Option.some("ses_big") }), clientUrl(server)),
      )
      expect(JSON.parse(out).messages).toHaveLength(250)
      expect(queries).toHaveLength(2)
      expect(queries[0]?.get("order")).toBe("asc")
      expect(queries[1]?.get("cursor")).toBe("next-page")
      expect(queries[1]?.has("order")).toBe(false)
    } finally {
      server.stop(true)
    }
  })
})

describe("import", () => {
  test("refuses a transcript whose session already exists instead of appending to it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "orchestra-import-"))
    const file = path.join(dir, "transcript.json")
    await writeFile(file, JSON.stringify({ info: { id: "ses_live", location: { directory: "/work" } }, messages: [message(1)] }))
    const writes: string[] = []
    const server = stubServer((request) => {
      const url = new URL(request.url)
      if (request.method !== "GET") writes.push(`${request.method} ${url.pathname}`)
      if (request.method === "GET" && url.pathname === "/api/session/ses_live") return Response.json({ data: { id: "ses_live" } })
      return new Response("not found", { status: 404 })
    })
    try {
      await expect(runWith(transcriptImport({ file }), clientUrl(server))).rejects.toThrow("already exists")
      expect(writes).toEqual([])
    } finally {
      server.stop(true)
    }
  })
})
