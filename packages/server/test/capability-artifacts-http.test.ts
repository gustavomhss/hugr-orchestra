import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { CapabilityArtifactTable } from "@orchestra/core/capability/sql"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { SessionID } from "@orchestra/schema/session-id"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { CapabilityArtifactsHttpFixture } from "./capability-artifacts-http-fixture"

const body = new TextEncoder().encode("0123456789")
const text = (response: Response) => Effect.promise(() => response.text())
const security = (hash: string) => ({
  "content-disposition": "attachment",
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox",
  "cache-control": "private, no-store",
  "accept-ranges": "bytes",
  etag: `"sha256-${hash}"`,
})
const expectHeaders = (response: Response, expected: Record<string, string>) =>
  Object.entries(expected).forEach(([name, value]) => expect([name, response.headers.get(name)]).toEqual([name, value]))

it.live("HTTP reads project only the operator Artifact and never owner, producer, metadata or host paths", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  expect(seeded.hash).toBe(createHash("sha256").update(body).digest("hex"))
  expect((yield* f.request(f.url(seeded.ref))).status).toBe(401)
  const page = yield* f.request(`/api/capability/sessions/${f.sessionID}/artifacts?limit=1`, { auth })
  expect(page.status).toBe(200)
  const decoded = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(
    Schema.decodeTo(CapabilityArtifactManagement.ArtifactPage)))(yield* text(page))
  expect(decoded.items.map((item) => item.artifact)).toEqual([seeded.ref])
  const item = yield* f.request(f.url(seeded.ref), { auth })
  expect(item.status).toBe(200)
  const json = yield* Effect.promise(() => item.json())
  expect(Object.keys(json).sort()).toEqual(["artifact", "bytes", "hash", "kind", "mime", "pinned", "timeCreated", "verification"])
  expect(json).toMatchObject({ artifact: seeded.ref, mime: "text/plain", bytes: 10, hash: seeded.hash, pinned: false })
}), 30_000)

it.live("HTTP content returns verified bytes with exact security headers and strong ETag", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body, mime: "text/html" })
  const response = yield* f.request(`${f.url(seeded.ref)}/content`, { auth })
  expect(response.status).toBe(200)
  expectHeaders(response, { ...security(seeded.hash), "content-type": "text/html", "content-length": "10" })
  expect(response.headers.get("content-range")).toBeNull()
  expect(yield* text(response)).toBe("0123456789")
}), 30_000)

it.live("HTTP content serves single byte ranges and rejects unsatisfiable ones with 416", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  const path = `${f.url(seeded.ref)}/content`
  const partial = [
    { range: "bytes=2-5", content: "bytes 2-5/10", body: "2345" },
    { range: "bytes=0-0", content: "bytes 0-0/10", body: "0" },
    { range: "bytes=4-100", content: "bytes 4-9/10", body: "456789" },
    { range: "bytes=7-", content: "bytes 7-9/10", body: "789" },
    { range: "bytes=0-", content: "bytes 0-9/10", body: "0123456789" },
    { range: "bytes=-3", content: "bytes 7-9/10", body: "789" },
    { range: "bytes=-1", content: "bytes 9-9/10", body: "9" },
    { range: "bytes=-20", content: "bytes 0-9/10", body: "0123456789" },
  ]
  yield* Effect.forEach(partial, (entry) => Effect.gen(function* () {
    const response = yield* f.request(path, { auth, headers: { range: entry.range } })
    expect([entry.range, response.status]).toEqual([entry.range, 206])
    expectHeaders(response, { ...security(seeded.hash), "content-range": entry.content,
      "content-length": String(entry.body.length), "content-type": "text/plain" })
    expect([entry.range, yield* text(response)]).toEqual([entry.range, entry.body])
  }))
  yield* Effect.forEach(["bytes=10-", "bytes=10-12", "bytes=99-", "bytes=-0"], (range) => Effect.gen(function* () {
    const response = yield* f.request(path, { auth, headers: { range } })
    expect([range, response.status]).toEqual([range, 416])
    expectHeaders(response, { ...security(seeded.hash), "content-range": "bytes */10" })
    expect(yield* text(response)).toBe("")
  }))
  const full = ["bytes=0-1,3-4", "bytes=-1,-2", "bytes=abc", "bytes=5-2", "bytes=-", "items=0-1", "bytes= 1-2", "bytes=0x1-2"]
  yield* Effect.forEach(full, (range) => Effect.gen(function* () {
    const response = yield* f.request(path, { auth, headers: { range } })
    expect([range, response.status]).toEqual([range, 200])
    expectHeaders(response, security(seeded.hash))
    expect(response.headers.get("content-range")).toBeNull()
    expect(yield* text(response)).toBe("0123456789")
  }))
  const empty = yield* f.seed({ data: new Uint8Array() })
  const none = yield* f.request(`${f.url(empty.ref)}/content`, { auth, headers: { range: "bytes=-5" } })
  expect(none.status).toBe(416)
  expect(none.headers.get("content-range")).toBe("bytes */0")
}), 30_000)

it.live("HTTP unavailable, foreign, missing and denied reads share one constant 403 body", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const owned = yield* f.seed({ data: body })
  const foreignOwned = yield* f.seed({ data: body, owner: f.foreign })
  const unreferenced = yield* f.seed({ data: body, sessions: [f.peerID] })
  const listOnly = yield* f.issue({ placements: "instance", actions: ["artifact.list"] })
  const otherPlacement = yield* f.issue({ placements: [f.foreign], actions: ["*"] })
  const otherResource = yield* f.issue({ placements: "instance", actions: ["*"],
    resources: [{ kind: "artifact", id: Capability.ArtifactID.create() }] })
  const cases = [
    { path: f.url(foreignOwned.ref), auth },
    { path: f.url(unreferenced.ref), auth },
    { path: f.url({ id: Capability.ArtifactID.create(), revision: 0 }), auth },
    { path: f.url({ ...owned.ref, revision: 1 }), auth },
    { path: f.url(owned.ref, SessionID.create()), auth },
    { path: f.url(owned.ref, f.foreignSessionID), auth },
    { path: f.url(owned.ref), auth: listOnly },
    { path: f.url(owned.ref), auth: otherPlacement },
    { path: f.url(owned.ref), auth: otherResource },
  ]
  const bodies = yield* Effect.forEach(cases.flatMap((entry) => [entry, { ...entry, path: `${entry.path}/content` }]),
    (entry) => Effect.gen(function* () {
      const response = yield* f.request(entry.path, { auth: entry.auth })
      expect([entry.path, response.status]).toEqual([entry.path, 403])
      expect(response.headers.get("etag")).toBeNull()
      return yield* text(response)
    }))
  expect(new Set(bodies)).toEqual(new Set([JSON.stringify(CapabilityArtifactsHttpFixture.denied)]))
  const missingSession = yield* f.request(`/api/capability/sessions/${SessionID.create()}/artifacts`, { auth })
  expect(missingSession.status).toBe(403)
  expect(yield* text(missingSession)).toBe(JSON.stringify(CapabilityArtifactsHttpFixture.denied))
  expect((yield* f.request(f.url(owned.ref), { auth })).status).toBe(200)
}), 30_000)

it.live("HTTP malformed selectors are 400 and corrupt blobs are a constant 500 without host detail", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  const base = `/api/capability/sessions/${f.sessionID}/artifacts`
  yield* Effect.forEach([`${base}/not-an-id/0`, `${base}/${seeded.ref.id}/-1`, `${base}/${seeded.ref.id}/x`,
    ...["01", "+3", "1e2", "0x10", "%203"].map((revision) => `${base}/${seeded.ref.id}/${revision}`),
    `/api/capability/sessions/not-a-session/artifacts`, `${base}?limit=33`, `${base}?after=foreign`], (path) =>
    f.request(path, { auth }).pipe(Effect.map((response) => expect([path, response.status]).toEqual([path, 400]))))
  // Same size, different bytes at the real content-addressed path: only the SHA-256 check can catch this.
  const tampered = yield* f.seed({ data: body })
  const names = yield* Effect.promise(() => readdir(join(f.directory, "data"), { recursive: true }))
  const blob = join(f.directory, "data", names.find((name) => name.endsWith(tampered.hash)) ?? "missing-blob")
  yield* Effect.promise(async () => {
    await chmod(blob, 0o600)
    await writeFile(blob, new TextEncoder().encode("9876543210"))
    await chmod(blob, 0o400)
  })
  const mismatch = yield* f.request(`${f.url(tampered.ref)}/content`, { auth })
  expect(mismatch.status).toBe(500)
  expect(yield* Effect.promise(() => mismatch.json())).toEqual({ _tag: "UnknownError", message: "Artifact request failed" })
  expect(mismatch.headers.get("etag")).toBeNull()
  // A missing blob for the recorded hash is the IO branch of the same constant 500.
  yield* f.database.db.update(CapabilityArtifactTable).set({ hash: "f".repeat(64) })
    .where(eq(CapabilityArtifactTable.id, seeded.ref.id)).run()
  const corrupt = yield* f.request(`${f.url(seeded.ref)}/content`, { auth })
  expect(corrupt.status).toBe(500)
  expect(yield* Effect.promise(() => corrupt.json())).toEqual({ _tag: "UnknownError", message: "Artifact request failed" })
  expect(corrupt.headers.get("etag")).toBeNull()
}), 30_000)
