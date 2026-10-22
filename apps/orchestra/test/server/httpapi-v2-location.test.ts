import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Context, Schema } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-orchestra-directory", directory)
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      ...init,
      headers,
    }),
    context,
  )
}

const Event = Schema.Struct({
  id: EventV2.ID,
  type: Schema.String,
  location: Schema.optional(Location.Ref),
  data: Schema.Unknown,
})

async function* eventStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const boundary = buffer.match(/(?:\r\n|\r|\n){2}/)
      if (!boundary || boundary.index === undefined) {
        const value = await reader.read()
        if (value.done) return
        buffer += decoder.decode(value.value, { stream: true })
        continue
      }

      const record = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary[0].length)
      const data = record
        .split(/\r\n|\r|\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
      if (data.length) yield Schema.decodeUnknownSync(Event)(JSON.parse(data.join("\n")))
    }
  } finally {
    try {
      await reader.cancel()
    } finally {
      reader.releaseLock()
    }
  }
}

async function readEvent(reader: AsyncIterator<typeof Event.Type>) {
  const value = await reader.next()
  if (value.done) throw new Error("event stream closed")
  return value.value
}

async function readEventType(reader: AsyncIterator<typeof Event.Type>, type: string) {
  // Booting a Location registers the native archie seat, which emits one plugin.added per internal plugin first.
  for (let index = 0; index < 100; index++) {
    const event = await readEvent(reader)
    if (event.type === type) return event
  }
  throw new Error(`timed out waiting for ${type}`)
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 location HttpApi", () => {
  test("decodes EventV2 location refs without resolved project metadata", () => {
    expect(
      Schema.decodeUnknownSync(Event)({
        id: "evt_test",
        type: "file.watcher.updated",
        location: { directory: "/tmp/project" },
        data: {},
      }),
    ).toMatchObject({ location: { directory: "/tmp/project" } })
  })

  test("returns command and skill snapshots with resolved locations", async () => {
    await using tmp = await tmpdir({ git: true })

    for (const route of ["/api/command", "/api/skill"]) {
      const response = await request(route, tmp.path)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        location: { directory: string; project: { id: string } }
        data: unknown
      }
      expect(body.data).toBeArray()
      expect(body.location.directory).toBe(tmp.path)
      expect(body.location.project.id).toBeTruthy()
    }
  })

  test("honors the plain directory query like location[directory]", async () => {
    await using target = await tmpdir({ git: true })
    await using other = await tmpdir({ git: true })
    const read = async (query: string, route = "/api/command") => {
      // The header places the default Location elsewhere, so only the query can select the target.
      const response = await request(`${route}${query}`, other.path)
      return {
        status: response.status,
        body: (await response.json()) as { location?: { directory: string; project: { id: string } } },
      }
    }
    const encoded = encodeURIComponent(target.path)
    const plain = await read(`?directory=${encoded}`)
    const nested = await read(`?location[directory]=${encoded}`)
    const both = await read(`?directory=${encoded}&location[directory]=${encoded}`)
    const nestedWins = await read(`?directory=${encodeURIComponent(other.path)}&location[directory]=${encoded}`)
    const neither = await read("")
    const skill = await read(`?directory=${encoded}`, "/api/skill")

    expect(plain.status).toBe(200)
    expect(plain.body.location?.directory).toBe(target.path)
    expect(plain.body.location?.project.id).toBe(nested.body.location?.project.id)
    expect(both.status).toBe(200)
    expect(both.body.location?.directory).toBe(target.path)
    expect(nestedWins.status).toBe(200)
    expect(nestedWins.body.location?.directory).toBe(target.path)
    expect(skill.body.location?.directory).toBe(target.path)
    expect(neither.status).toBe(200)
    expect(neither.body.location?.directory).toBe(other.path)
  })

  test("answers a missing location directory with a declared 400 on every location route", async () => {
    await using tmp = await tmpdir({ git: true })
    const missing = path.join(tmp.path, "removed-project")

    for (const route of ["/api/location", "/api/provider", "/api/command", "/api/agent"]) {
      const response = await request(`${route}?location[directory]=${encodeURIComponent(missing)}`, tmp.path)
      expect({ route, status: response.status }).toEqual({ route, status: 400 })
      expect(await response.json()).toMatchObject({
        _tag: "InvalidRequestError",
        kind: "location_not_found",
        field: "location.directory",
        message: `Directory not found: ${missing}`,
      })
    }
  })

  test("keeps a booted session readable and removable after its directory is removed", async () => {
    await using root = await tmpdir({ git: true })
    const project = path.join(root.path, "project")
    await mkdir(project)
    const created = await request("/api/session", root.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { directory: project } }),
    })
    expect(created.status).toBe(200)
    const session = ((await created.json()) as { data: { id: string } }).data
    expect((await request(`/api/session/${session.id}/todo`, root.path)).status).toBe(200)

    // Only a failed boot is a bad request: the Location booted above serves database-backed routes from the cache.
    await rm(project, { recursive: true })
    expect((await request(`/api/session/${session.id}/todo`, root.path)).status).toBe(200)
    expect((await request(`/api/session/${session.id}`, root.path, { method: "DELETE" })).status).toBeLessThan(300)
  })

  test("streams native EventV2 payloads across locations", async () => {
    await using subscriber = await tmpdir({ git: true })
    await using publisher = await tmpdir({ git: true })
    const response = await request("/api/event", subscriber.path)
    const reader = eventStream(response.body!)
    const connected = await readEvent(reader)
    expect(connected.type).toBe("server.connected")
    expect(connected.location).toBeUndefined()

    const created = await request("/session", publisher.path, { method: "POST" })
    expect(created.status).toBe(200)
    expect(await readEventType(reader, "session.created")).toMatchObject({
      type: "session.created",
      location: { directory: publisher.path },
      data: { sessionID: expect.any(String) },
    })
    await reader.return(undefined)
  })
})
