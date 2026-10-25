import { expect } from "bun:test"
import { CapabilityArtifactReferenceTable } from "@orchestra/core/capability/sql"
import { Effect } from "effect"
import { it } from "@orchestra/core/test/lib/effect"
import { CapabilityArtifactsHttpFixture } from "./capability-artifacts-http-fixture"

const body = new TextEncoder().encode("0123456789")
const text = (response: Response) => Effect.promise(() => response.text())

function mint(f: Effect.Success<ReturnType<typeof CapabilityArtifactsHttpFixture.make>>, path: string, auth?: string) {
  return Effect.gen(function* () {
    const response = yield* f.request(`${path}/content-ticket`, { method: "POST", auth })
    expect(response.status).toBe(200)
    const ticket: { url: string; expiresAt: number } = yield* Effect.promise(() => response.json())
    return ticket
  })
}

it.live("HTTP content tickets serve the same bytes and ranges without an Authorization header", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body, mime: "video/mp4" })
  expect((yield* f.request(`${f.url(seeded.ref)}/content-ticket`, { method: "POST" })).status).toBe(401)
  const ticket = yield* mint(f, f.url(seeded.ref), auth)
  expect(ticket.url).toMatch(/^\/api\/capability\/content\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
  expect(ticket.expiresAt).toBeGreaterThan(Date.now())
  const direct = yield* f.request(`${f.url(seeded.ref)}/content`, { auth })
  const full = yield* f.request(ticket.url)
  expect(full.status).toBe(200)
  ;["content-type", "content-length", "etag", "content-disposition", "content-security-policy", "accept-ranges"]
    .forEach((name) => expect([name, full.headers.get(name)]).toEqual([name, direct.headers.get(name)]))
  expect(yield* text(full)).toBe("0123456789")
  const partial = yield* f.request(ticket.url, { headers: { range: "bytes=2-5" } })
  expect(partial.status).toBe(206)
  expect(partial.headers.get("content-range")).toBe("bytes 2-5/10")
  expect(yield* text(partial)).toBe("2345")
}), 30_000)

it.live("HTTP content tickets reject expired, tampered and spliced tickets with an empty 401", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const first = yield* f.seed({ data: body })
  const second = yield* f.seed({ data: new TextEncoder().encode("other") })
  const a = yield* mint(f, f.url(first.ref), auth)
  const b = yield* mint(f, f.url(second.ref), auth)
  const [payloadA, macA] = a.url.slice(a.url.lastIndexOf("/") + 1).split(".")
  const payloadB = b.url.slice(b.url.lastIndexOf("/") + 1).split(".")[0]
  // Ticket A's signature cannot authorize artifact B's claim, nor an edited copy of A's own claim.
  const forged = [`${payloadB}.${macA}`, `${payloadA}x.${macA}`, `${payloadA}.${macA[0] === "A" ? "B" : "A"}${macA.slice(1)}`,
    "garbage"]
  yield* Effect.forEach(forged, (ticket) => Effect.gen(function* () {
    const response = yield* f.request(`/api/capability/content/${ticket}`)
    expect([ticket, response.status]).toEqual([ticket, 401])
    expect(yield* text(response)).toBe("")
  }))
  expect((yield* f.request(a.url)).status).toBe(200)

  const short = yield* CapabilityArtifactsHttpFixture.make({ ticketTtlMillis: 1 })
  const seeded = yield* short.seed({ data: body })
  const expired = yield* mint(short, short.url(seeded.ref), yield* short.issue())
  yield* Effect.sleep("10 millis")
  const late = yield* short.request(expired.url)
  expect(late.status).toBe(401)
  expect(yield* text(late)).toBe("")
}), 30_000)

it.live("HTTP content tickets return 404 once the referenced artifact is gone", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const seeded = yield* f.seed({ data: body })
  const ticket = yield* mint(f, f.url(seeded.ref), yield* f.issue())
  yield* f.database.db.delete(CapabilityArtifactReferenceTable).run()
  expect((yield* f.request(ticket.url)).status).toBe(404)
}), 30_000)
