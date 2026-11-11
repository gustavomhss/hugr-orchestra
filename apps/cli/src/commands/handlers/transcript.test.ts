import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { ProjectV2 } from "@orchestra/core/project"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { Daemon } from "../../services/daemon"
import { clientUrl, fakeDaemon, stubServer, withCapturedStdout } from "./test-support"
import transcriptExport from "./export"
import transcriptImport from "./import"

const runWith = <A>(effect: Effect.Effect<A, unknown, Daemon.Service>, baseUrl: string) =>
  effect.pipe(Effect.provideService(Daemon.Service, fakeDaemon(baseUrl)), Effect.runPromise)

const message = (index: number) => ({
  id: `msg_${index}`,
  time: { created: index },
  type: "user",
  text: `text ${index}`,
})

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
      return Response.json({
        data: Array.from({ length: 200 }, (_, index) => message(index)),
        cursor: { next: "next-page" },
      })
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
    await writeFile(
      file,
      JSON.stringify({ info: { id: "ses_live", location: { directory: "/work" } }, messages: [message(1)] }),
    )
    const writes: string[] = []
    const server = stubServer((request) => {
      const url = new URL(request.url)
      if (request.method !== "GET") writes.push(`${request.method} ${url.pathname}`)
      if (request.method === "GET" && url.pathname === "/api/session/ses_live")
        return Response.json({ data: { id: "ses_live" } })
      return new Response("not found", { status: 404 })
    })
    try {
      await expect(runWith(transcriptImport({ file }), clientUrl(server))).rejects.toThrow("already exists")
      expect(writes).toEqual([])
    } finally {
      server.stop(true)
    }
  })

  test.each([
    [
      "native",
      [
        message(1),
        { id: "msg_file", type: "user", files: [{ uri: "file:///work/a" }] },
        {
          id: "msg_2",
          type: "assistant",
          content: [
            { type: "text", text: "text " },
            { type: "tool", name: "unused" },
            { type: "text", text: "2" },
          ],
        },
      ],
    ],
    [
      "UI",
      [
        {
          info: { id: "msg_1", role: "user" },
          parts: [
            { type: "text", text: "text 1" },
            { type: "file", url: "file:///work/a" },
          ],
        },
        {
          info: { id: "msg_2", role: "assistant" },
          parts: [
            { type: "text", text: "text " },
            { type: "text", text: "2" },
          ],
        },
      ],
    ],
  ])("restores %s text in order with every synthetic admission explicitly disabling execution", async (_, messages) => {
    const dir = await mkdtemp(path.join(tmpdir(), "orchestra-import-"))
    const file = path.join(dir, "transcript.json")
    await writeFile(file, JSON.stringify({ info: { id: "ses_import", location: { directory: "/work" } }, messages }))
    const admissions: unknown[] = []
    const execution: string[] = []
    const runtime = ManagedRuntime.make(
      AppNodeBuilder.build(
        LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionStore.node, SessionV2.node]),
        [
          [Database.node, Database.layerFromPath(":memory:")],
          [
            ProjectV2.node,
            Layer.succeed(
              ProjectV2.Service,
              ProjectV2.Service.of({
                resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
                list: () => Effect.succeed([]),
                directories: () => Effect.succeed([]),
                commit: () => Effect.void,
              }),
            ),
          ],
          [
            SessionExecution.node,
            Layer.succeed(
              SessionExecution.Service,
              SessionExecution.Service.of({
                active: Effect.succeed(new Set()),
                exclusive: (_, effect) => Effect.asSome(effect),
                withRunner: () => Effect.die("Importer must never reach a runner/provider/host/tool registry"),
                resume: () =>
                  Effect.sync(() => {
                    execution.push("resume")
                  }),
                wake: () =>
                  Effect.sync(() => {
                    execution.push("wake")
                  }),
                interrupt: () => Effect.void,
              }),
            ),
          ],
        ],
      ),
    )
    const server = stubServer(async (request) => {
      const url = new URL(request.url)
      if (request.method === "GET")
        return Response.json(
          { _tag: "SessionNotFoundError", sessionID: "ses_import", message: "missing" },
          { status: 404 },
        )
      if (url.pathname === "/api/session") {
        const body = await request.json()
        return Response.json({
          data: await runtime.runPromise(Effect.flatMap(SessionV2.Service, (session) => session.create(body))),
        })
      }
      if (url.pathname === "/api/session/ses_import/synthetic") {
        const body = await request.json()
        admissions.push(body)
        const id = await runtime.runPromise(
          Effect.flatMap(SessionV2.Service, (session) =>
            session.synthetic({
              sessionID: SessionV2.ID.make("ses_import"),
              text: body.text,
              resume: body.resume,
            }),
          ),
        )
        return Response.json({ data: { id } })
      }
      execution.push(url.pathname)
      return new Response(null, { status: 204 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(transcriptImport({ file }), clientUrl(server)))
      expect(admissions).toEqual([
        { text: "text 1", resume: false },
        { text: "text 2", resume: false },
      ])
      expect(execution).toEqual([])
      const restored = await runtime.runPromise(
        Effect.flatMap(SessionV2.Service, (session) =>
          session.messages({ sessionID: SessionV2.ID.make("ses_import"), order: "asc" }),
        ),
      )
      expect(restored.map((message) => (message.type === "synthetic" ? message.text : message.type))).toEqual([
        "text 1",
        "text 2",
      ])
      expect(out).toContain("2 text messages replayed")
      // Positive control: the same real backend still schedules normal synthetic context by default.
      await runtime.runPromise(Effect.flatMap(SessionV2.Service, (session) => session.synthetic({
        sessionID: SessionV2.ID.make("ses_import"), text: "normal execution control",
      })))
      await Bun.sleep(10)
      expect(execution).toEqual(["resume"])
    } finally {
      server.stop(true)
      await runtime.dispose()
    }
  })

  test.each([
    {},
    { info: { id: "ses_invalid" }, messages: {} },
    { info: { id: "ses_invalid" }, messages: [{ text: 123 }] },
    { info: { id: "ses_invalid" }, messages: [message(1), { type: "assistant", content: [{ type: "text" }] }] },
    { info: { id: "ses_invalid" }, messages: [{ info: { id: "msg_1" }, parts: [{ type: "text", text: 123 }] }] },
    { info: { id: "ses_invalid", location: { directory: 123 } }, messages: [] },
  ])("rejects invalid transcript shape before any session mutation: %j", async (transcript) => {
    const dir = await mkdtemp(path.join(tmpdir(), "orchestra-import-"))
    const file = path.join(dir, "transcript.json")
    await writeFile(file, JSON.stringify(transcript))
    const writes: string[] = []
    const server = stubServer((request) => {
      if (request.method !== "GET") writes.push(request.url)
      if (request.method === "GET")
        return Response.json(
          { _tag: "SessionNotFoundError", sessionID: "ses_invalid", message: "missing" },
          { status: 404 },
        )
      return Response.json({ data: { id: "ses_invalid" } })
    })
    try {
      await expect(runWith(transcriptImport({ file }), clientUrl(server))).rejects.toThrow()
      expect(writes).toEqual([])
    } finally {
      server.stop(true)
    }
  })
})
