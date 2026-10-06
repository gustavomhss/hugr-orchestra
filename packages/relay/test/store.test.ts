import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Fiber, Scope } from "effect"
import { TestClock } from "effect/testing"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import { AuthoringGraph } from "../src/authoring/graph"
import { AuthoringStore } from "../src/authoring/store"

// WP8: the authoring store against the G1 goldens (test/golden/generate/authoring.py): `checksum` cases and
// `store-fixture`, which is what Python's Store reads back from test/fixtures/authoring.sqlite3.
const GOLDENS = path.join(import.meta.dir, "golden", "authoring")
const FIXTURE = path.join(import.meta.dir, "fixtures", "authoring.sqlite3")
const CHANGED = { status: 409, code: "version-conflict", message: "The workflow changed. Reload it before saving." }
const NOT_FOUND = { status: 404, code: "not-found", message: "Resource not found" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// Python's key order for a new document.
const KEYS = [
  "name",
  "nodes",
  "connections",
  "tags",
  "meta",
  "active",
  "activeVersionId",
  "isArchived",
  "id",
  "createdAt",
  "updatedAt",
  "versionId",
  "versionCounter",
]

interface Golden {
  readonly name: string
  readonly input: { readonly op: string; readonly document?: unknown; readonly workspaces?: string[] }
  readonly output: unknown
}

interface Workspace {
  readonly documents: RelayAuthoring.Document[]
  readonly checksums: Record<string, string>
  readonly versions: Record<string, RelayAuthoring.Version[]>
  readonly scopes: RelayAuthoring.Scope[]
}

const goldens: Golden[] = await Promise.all(
  readdirSync(GOLDENS)
    .sort()
    .map(async (name) => ({
      name,
      input: await Bun.file(path.join(GOLDENS, name, "input.json")).json(),
      output: await Bun.file(path.join(GOLDENS, name, "output.json"))
        .json()
        .catch(() => undefined),
    })),
)
const fixture: Record<string, Workspace> = await Bun.file(path.join(GOLDENS, "store-fixture", "output.json")).json()

const root = mkdtempSync(path.join(os.tmpdir(), "relay-store-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
let dirs = 0
const fresh = () => path.join(root, `store-${dirs++}`)

// A Python-made database, copied: opening a store writes its pragmas and schema, and the fixture must stay as built.
function pythonStore() {
  const dir = fresh()
  mkdirSync(dir, { recursive: true })
  copyFileSync(FIXTURE, path.join(dir, "authoring.sqlite3"))
  return dir
}

function run<A, E>(effect: Effect.Effect<A, E, Scope.Scope>) {
  return Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())))
}

// A refusal's status, code and exact message, as the HTTP layer answers it.
function refused<A>(effect: Effect.Effect<A, AuthoringGraph.Refusal>) {
  return Effect.flip(effect).pipe(Effect.map(fields))
}

// Run admission's answer: null when the document may run.
function admission(document: RelayAuthoring.Document | RelayAuthoring.Version) {
  return Effect.match(AuthoringStore.runnable(document), { onFailure: fields, onSuccess: () => null })
}

function fields(refusal: AuthoringGraph.Refusal) {
  return { status: refusal.status, code: refusal.code, message: refusal.message }
}

function raw(dir: string, sql: string, ...params: string[]) {
  const db = new Database(path.join(dir, "authoring.sqlite3"))
  const rows = db.query<Record<string, unknown>, string[]>(sql).all(...params)
  db.close()
  return rows
}

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")
const draft = (name: string): Partial<RelayAuthoring.Document> => ({ name })

describe("checksum goldens", () => {
  const cases = goldens.filter((entry) => entry.input.op === "checksum")

  test("the goldens left to WP8 are the checksum cases and the store fixture", () => {
    expect(cases.map((entry) => entry.name)).toEqual(["checksum-key-order", "checksum-projected"])
    expect(goldens.filter((entry) => entry.input.op === "store").map((entry) => entry.name)).toEqual(["store-fixture"])
  })

  cases.forEach((entry) =>
    test(entry.name, () => {
      const output = entry.output as { text: string; checksum: string }
      // The golden is self-consistent, so equal checksums mean the hashed text is Python's byte for byte.
      expect(sha256(output.text)).toBe(output.checksum)
      expect(AuthoringStore.checksum(entry.input.document)).toBe(output.checksum)
    }),
  )

  test("keys sort by code point, which UTF-16 order does not", () => {
    // The trap the key-order golden holds: JS sorts an astral character below U+FFFF, Python above it.
    expect(["😀", "￿"].sort()).toEqual(["😀", "￿"])
    const text = (cases[0]!.output as { text: string }).text
    expect(text.indexOf('"￿"')).toBeLessThan(text.indexOf('"😀"'))
    expect(text).toContain('"position": [240.5, 1e+16]')
  })

  test("W8-1: a safe integer hashes as a Python int, any other number as a Python float", () => {
    expect(AuthoringStore.checksum({ b: 240, a: 240.0 })).toBe(sha256('{"a": 240, "b": 240}'))
    expect(AuthoringStore.checksum({ a: [0.5, 2 ** 53, 1e-5, -0] })).toBe(
      sha256('{"a": [0.5, 9007199254740992.0, 1e-05, 0]}'),
    )
    expect(AuthoringStore.checksum({ a: "é\n\u007f \u0001", b: null, c: true, d: undefined })).toBe(
      sha256('{"a": "é\\n\u007f \\u0001", "b": null, "c": true}'),
    )
    expect(() => AuthoringStore.checksum({ a: Number.NaN })).toThrow("Out of range float values are not JSON compliant")
  })
})

describe("a Python-made store", () => {
  test("reads back exactly what Python's Store read from it, per workspace", async () => {
    const before = readFileSync(FIXTURE)
    const dir = pythonStore()
    const read = await run(
      Effect.forEach(Object.keys(fixture), (workspace) =>
        Effect.gen(function* () {
          const store = yield* AuthoringStore.open(dir, workspace)
          const documents = yield* store.documents()
          const versions = yield* Effect.forEach(documents, (document) =>
            store.versions(document.id).pipe(Effect.map((list) => [document.id, list] as const)),
          )
          return [
            workspace,
            {
              documents,
              checksums: Object.fromEntries(
                documents.map((document) => [document.id, AuthoringStore.checksum(document)]),
              ),
              versions: Object.fromEntries(versions),
              scopes: yield* store.scopes(),
            },
          ] as const
        }),
      ),
    )
    // Positive control: the fixture holds documents, versions, scopes and a second workspace.
    expect(fixture["workspace-a"]!.documents).toHaveLength(3)
    expect(fixture["workspace-a"]!.scopes).toHaveLength(1)
    expect(fixture["workspace-b"]!.documents).toHaveLength(1)
    expect(Object.fromEntries(read)).toEqual(fixture)
    expect(readFileSync(FIXTURE).equals(before)).toBe(true)
  })

  test("its executions table and rows are left as they were", async () => {
    const dir = pythonStore()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "workspace-a")
        yield* store.save({ body: draft("New") })
      }),
    )
    expect(raw(dir, "SELECT workspace, id FROM executions")).toEqual([{ workspace: "workspace-a", id: "execution-1" }])
  })

  test("a rewritten row is Python's bytes: removing a scope drops only the tag", async () => {
    const dir = pythonStore()
    const scope = fixture["workspace-a"]!.scopes[0]!.id
    const sql = "SELECT id, body FROM documents WHERE workspace=? ORDER BY rowid"
    const before = raw(dir, sql, "workspace-a") as { id: string; body: string }[]
    const tag = `"tags": ["${scope}"]`
    // Positive control: exactly one Python row holds the scope, once.
    expect(before.filter((row) => row.body.includes(scope)).map((row) => row.body.split(tag).length)).toEqual([2])
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "workspace-a")
        yield* store.removeScope(scope)
        expect(yield* store.scopes()).toEqual([])
      }),
    )
    expect(raw(dir, sql, "workspace-a")).toEqual(
      before.map((row) => ({ id: row.id, body: row.body.replace(tag, '"tags": []') })),
    )
  })
})

describe("documents", () => {
  test("a new document takes Python's defaults, key order and timestamp form", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* TestClock.setTime(1_700_000_001_002)
        const document = yield* store.save({ body: draft("A") })
        expect(Object.keys(document)).toEqual(KEYS)
        expect(document).toMatchObject({
          name: "A",
          nodes: [],
          connections: {},
          tags: [],
          meta: {},
          active: false,
          activeVersionId: null,
          isArchived: false,
          createdAt: "2023-11-14T22:13:21.002000Z",
          updatedAt: "2023-11-14T22:13:21.002000Z",
          versionCounter: 1,
        })
        expect(document.id).toMatch(UUID)
        expect(document.versionId).toMatch(UUID)
        expect(yield* store.get(document.id)).toEqual(document)
        expect(yield* store.versions(document.id)).toEqual([{ ...document, workflowId: document.id }])
        // Python's isoformat drops a fraction that is all zeros.
        yield* TestClock.setTime(1_700_000_000_000)
        expect((yield* store.save({ body: draft("B") })).createdAt).toBe("2023-11-14T22:13:20Z")
        // The row is json.dumps(ensure_ascii=False): Python's separators, raw UTF-8 and escapes.
        const named = yield* store.save({ body: draft("é\n·") })
        expect(raw(dir, "SELECT body FROM documents WHERE id=?", named.id)).toEqual([
          {
            body:
              `{"name": "é\\n·", "nodes": [], "connections": {}, "tags": [], "meta": {}, "active": false, ` +
              `"activeVersionId": null, "isArchived": false, "id": "${named.id}", ` +
              `"createdAt": "2023-11-14T22:13:20Z", "updatedAt": "2023-11-14T22:13:20Z", ` +
              `"versionId": "${named.versionId}", "versionCounter": 1}`,
          },
        ])
      }),
    )
  })

  test("a save under the current version and checksum makes the next version", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* TestClock.setTime(1_700_000_001_000)
        const first = yield* store.save({ body: { ...draft("A"), description: "kept" } })
        yield* TestClock.setTime(1_700_000_002_000)
        const second = yield* store.save({
          id: first.id,
          body: draft("B"),
          expectedVersion: first.versionId,
          expectedChecksum: AuthoringStore.checksum(first),
        })
        expect(second).toEqual({
          ...first,
          name: "B",
          updatedAt: "2023-11-14T22:13:22Z",
          versionId: second.versionId,
          versionCounter: 2,
        })
        expect(second.versionId).not.toBe(first.versionId)
        expect((yield* store.versions(first.id)).map((version) => version.versionId)).toEqual([
          second.versionId,
          first.versionId,
        ])
        expect(yield* store.version(first.id, first.versionId)).toEqual({ ...first, workflowId: first.id })
      }),
    )
  })

  test("a stale version or checksum is a 409 and writes nothing", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        const first = yield* store.save({ body: draft("A") })
        const second = yield* store.save({ id: first.id, body: draft("B") })
        const stale = AuthoringStore.checksum(first)
        expect(
          yield* refused(store.save({ id: first.id, body: draft("C"), expectedVersion: first.versionId })),
        ).toEqual(CHANGED)
        expect(
          yield* refused(
            store.save({ id: first.id, body: draft("C"), expectedVersion: second.versionId, expectedChecksum: stale }),
          ),
        ).toEqual(CHANGED)
        // Python compares any checksum it is given, an empty one included.
        expect(yield* refused(store.save({ id: first.id, body: draft("C"), expectedChecksum: "" }))).toEqual(CHANGED)
        expect(yield* store.get(first.id)).toEqual(second)
        expect(yield* store.versions(first.id)).toHaveLength(2)
      }),
    )
  })

  test("another connection's save makes this one's version stale", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const one = yield* AuthoringStore.open(dir, "w")
        const two = yield* AuthoringStore.open(dir, "w")
        const first = yield* one.save({ body: draft("A") })
        yield* one.save({ id: first.id, body: draft("B"), expectedVersion: first.versionId })
        expect(yield* refused(two.save({ id: first.id, body: draft("C"), expectedVersion: first.versionId }))).toEqual(
          CHANGED,
        )
        expect(yield* refused(two.publish(first.id, first.versionId))).toEqual({
          status: 409,
          code: "version-conflict",
          message: "The version changed before publishing",
        })
      }),
    )
  })

  test("listing is newest first, an update keeps its place, and workspaces do not see each other", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        const other = yield* AuthoringStore.open(dir, "other")
        const a = yield* store.save({ body: draft("A") })
        yield* store.save({ body: draft("B") })
        yield* store.save({ id: a.id, body: draft("A2") })
        expect((yield* store.documents()).map((document) => document.name)).toEqual(["B", "A2"])
        expect(yield* other.documents()).toEqual([])
        expect(yield* refused(other.get(a.id))).toEqual(NOT_FOUND)
        expect(yield* other.versions(a.id)).toEqual([])
        const custom = yield* store.save({ createID: "custom", body: draft("C") })
        expect(custom.id).toBe("custom")
      }),
    )
  })

  test("unknown documents and versions are 404s; removal keeps the versions, as Python does", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        const a = yield* store.save({ body: draft("A") })
        const b = yield* store.save({ body: draft("B") })
        expect(yield* refused(store.get("missing"))).toEqual(NOT_FOUND)
        expect(yield* refused(store.save({ id: "missing", body: draft("A") }))).toEqual(NOT_FOUND)
        expect(yield* refused(store.version(a.id, "missing"))).toEqual(NOT_FOUND)
        expect(yield* refused(store.version(a.id, b.versionId))).toEqual({
          status: 404,
          code: "not-found",
          message: "Version not found",
        })
        yield* store.remove(a.id)
        expect(yield* refused(store.get(a.id))).toEqual(NOT_FOUND)
        expect(yield* refused(store.remove(a.id))).toEqual(NOT_FOUND)
        expect(yield* store.versions(a.id)).toHaveLength(1)
        expect((yield* store.documents()).map((document) => document.id)).toEqual([b.id])
      }),
    )
  })
})

describe("publish", () => {
  test("publishes the current version under its checksum and unpublishes it", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* TestClock.setTime(1_700_000_001_000)
        const document = yield* store.save({ body: draft("A") })
        expect(yield* refused(store.publish(document.id, "other-version"))).toEqual({
          status: 409,
          code: "version-conflict",
          message: "The version changed before publishing",
        })
        expect(yield* refused(store.publish(document.id, document.versionId, "stale"))).toEqual(CHANGED)
        expect(yield* refused(store.publish("missing", document.versionId))).toEqual(NOT_FOUND)
        yield* TestClock.setTime(1_700_000_002_000)
        const published = yield* store.publish(document.id, document.versionId, AuthoringStore.checksum(document))
        expect(published).toEqual({
          ...document,
          active: true,
          activeVersionId: document.versionId,
          updatedAt: "2023-11-14T22:13:22Z",
        })
        expect(Object.keys(published)).toEqual(KEYS)
        expect(yield* store.get(document.id)).toEqual(published)
        // Publishing names a version; it makes none.
        expect(yield* store.versions(document.id)).toHaveLength(1)
        expect(yield* refused(store.unpublish(document.id, AuthoringStore.checksum(document)))).toEqual(CHANGED)
        yield* TestClock.setTime(1_700_000_003_000)
        const unpublished = yield* store.unpublish(document.id, AuthoringStore.checksum(published))
        expect(unpublished).toEqual({
          ...published,
          active: false,
          activeVersionId: null,
          updatedAt: "2023-11-14T22:13:23Z",
        })
        expect(yield* store.unpublish(document.id)).toMatchObject({ active: false, activeVersionId: null })
        expect(yield* refused(store.unpublish("missing"))).toEqual(NOT_FOUND)
      }),
    )
  })
})

describe("scopes", () => {
  test("names are stripped as Python strips them and compared as casefold compares them", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* TestClock.setTime(1_700_000_001_000)
        const review = yield* store.saveScope({ name: " \u001cStraße\u0085　" })
        expect(review).toEqual({
          id: review.id,
          name: "Straße",
          description: "",
          createdAt: "2023-11-14T22:13:21Z",
          updatedAt: "2023-11-14T22:13:21Z",
        })
        expect(review.id).toMatch(UUID)
        expect(yield* refused(store.saveScope({ name: " \t\u001f " }))).toEqual({
          status: 400,
          code: "invalid-request",
          message: "A scope needs a name",
        })
        // U+FEFF is not space to Python.
        expect((yield* store.saveScope({ name: "﻿Marked" })).name).toBe("﻿Marked")
        const duplicate = { status: 409, code: "duplicate-scope", message: "This scope already exists" }
        expect(yield* refused(store.saveScope({ name: "STRASSE" }))).toEqual(duplicate)
        yield* store.saveScope({ name: "ΟΔΟΣ" })
        expect(yield* refused(store.saveScope({ name: "οδοσ" }))).toEqual(duplicate)
        // casefold keeps the dotless ı apart from I and i.
        yield* store.saveScope({ name: "I" })
        yield* store.saveScope({ name: "ı" })
        expect(yield* refused(store.saveScope({ name: "i" }))).toEqual(duplicate)
        yield* TestClock.setTime(1_700_000_002_000)
        const renamed = yield* store.saveScope({ name: "STRASSE", description: "Reviews" }, review.id)
        expect(renamed).toEqual({
          ...review,
          name: "STRASSE",
          description: "Reviews",
          updatedAt: "2023-11-14T22:13:22Z",
        })
        expect(yield* refused(store.saveScope({ name: "New" }, "missing"))).toEqual(NOT_FOUND)
        expect((yield* store.scopes()).map((scope) => scope.name)).toEqual(["STRASSE", "﻿Marked", "ΟΔΟΣ", "I", "ı"])
      }),
    )
  })

  test("W8-2: case pairs newer than the runtime's Unicode tables are not duplicates", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        // Unicode 16 folds U+A7CB to U+0264; CPython 3.14 refuses the second name, Bun's Unicode 15.1 tables do not.
        yield* store.saveScope({ name: "ɤ" })
        expect((yield* store.saveScope({ name: "Ɤ" })).name).toBe("Ɤ")
      }),
    )
  })

  test("removing a scope removes it from every document's tags and nothing else", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        const scope = yield* store.saveScope({ name: "Review" })
        const kept = yield* store.saveScope({ name: "Kept" })
        const text = yield* store.save({ body: { ...draft("A"), tags: [scope.id, kept.id] } })
        const object = yield* store.save({ body: { ...draft("B"), tags: [{ id: scope.id }] } })
        const untagged = yield* store.save({ body: draft("C") })
        yield* store.removeScope(scope.id)
        expect(yield* store.get(text.id)).toEqual({ ...text, tags: [kept.id] })
        expect(yield* store.get(object.id)).toEqual({ ...object, tags: [] })
        expect(yield* store.get(untagged.id)).toEqual(untagged)
        expect((yield* store.scopes()).map((entry) => entry.id)).toEqual([kept.id])
        expect(yield* refused(store.removeScope(scope.id))).toEqual(NOT_FOUND)
      }),
    )
  })
})

describe("seeding", () => {
  test("every shipped profile has a runnable decision", () => {
    expect(
      readdirSync(AuthoringStore.PROFILES_DIRECTORY)
        .filter((file) => file.endsWith(".sprint.json"))
        .map((file) => file.slice(0, -".sprint.json".length))
        .sort(),
    ).toEqual([...AuthoringStore.PROFILES.keys()].sort())
    expect([...AuthoringStore.PROFILES].filter((entry) => entry[1]).map((entry) => entry[0])).toEqual([
      "tdd_feature",
      "wp-execute",
    ])
  })

  test("seeds each profile once, as Python projects it, marked with its profile", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* AuthoringStore.seedProfiles(store)
        const seeded = yield* store.documents()
        // Newest first: file-name order, reversed.
        expect(seeded.map((document) => [document.id, document.name, document.meta.relay?.profile])).toEqual(
          ["wp-execute", "tdd_feature", "spec-decompose", "research-v2", "planning", "design"].map((name) => [
            `relay-${name}`,
            `Relay · ${name}`,
            name,
          ]),
        )
        // The Python store seeded tdd_feature in the fixture: the same document, plus the mark.
        const python = fixture["workspace-a"]!.documents.find((document) => document.id === "relay-tdd_feature")!
        const tdd = seeded.find((document) => document.id === "relay-tdd_feature")!
        expect(tdd).toEqual({
          ...python,
          createdAt: tdd.createdAt,
          updatedAt: tdd.updatedAt,
          versionId: tdd.versionId,
          meta: { ...python.meta, relay: { ...python.meta.relay, profile: "tdd_feature" } },
        })
        // Seeding again changes nothing, an edited seed included.
        const edited = yield* store.save({ id: "relay-tdd_feature", body: draft("Mine") })
        yield* AuthoringStore.seedProfiles(store)
        expect(yield* store.documents()).toEqual(
          seeded.map((document) => (document.id === edited.id ? edited : document)),
        )
      }),
    )
  })

  test("only tdd_feature and wp-execute run; the other profiles refuse with profile-tools-missing", async () => {
    const dir = fresh()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* AuthoringStore.seedProfiles(store)
        const outcomes = yield* Effect.forEach(yield* store.documents(), (document) =>
          Effect.gen(function* () {
            const version = (yield* store.versions(document.id))[0]!
            return [document.meta.relay?.profile, yield* admission(document), yield* admission(version)]
          }),
        )
        const tools = (profile: string) => ({
          status: 409,
          code: "profile-tools-missing",
          message: `The ${profile} profile checks its work with Relay tools that are not available yet. It can be edited, but it cannot run.`,
        })
        expect(outcomes).toEqual(
          ["wp-execute", "tdd_feature", "spec-decompose", "research-v2", "planning", "design"].map((profile) => {
            const expected = AuthoringStore.PROFILES.get(profile) ? null : tools(profile)
            return [profile, expected, expected]
          }),
        )
        // A store Python seeded has no mark: the shipped profile's ID names it.
        const other = yield* AuthoringStore.open(fresh(), "w")
        expect(yield* admission(yield* other.save({ createID: "relay-planning", body: draft("Python seed") }))).toEqual(
          tools("planning"),
        )
        expect(yield* admission(yield* other.save({ createID: "relay-planning-copy", body: draft("Copy") }))).toBeNull()
        // A mark this version does not know is refused.
        const unknown = yield* store.save({ body: { ...draft("Later"), meta: { relay: { profile: "later" } } } })
        expect(yield* admission(unknown)).toEqual(tools("later"))
        expect(yield* admission(yield* store.save({ body: draft("Plain") }))).toBeNull()
      }),
    )
  })

  test("the fixture's Python-seeded tdd_feature runs", async () => {
    const dir = pythonStore()
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "workspace-a")
        const tdd = yield* store.get("relay-tdd_feature")
        expect(tdd.meta.relay?.profile).toBeUndefined()
        expect(yield* admission(tdd)).toBeNull()
      }),
    )
  })

  test("profile files seed in Python's path order; a missing or empty catalog is a 503", async () => {
    const profiles = fresh()
    mkdirSync(profiles, { recursive: true })
    const text = readFileSync(path.join(AuthoringStore.PROFILES_DIRECTORY, "tdd_feature.sprint.json"))
    // "a-b.sprint.json" sorts before "a.sprint.json" ('-' < '.'), though "a" sorts before "a-b".
    writeFileSync(path.join(profiles, "a.sprint.json"), text)
    writeFileSync(path.join(profiles, "a-b.sprint.json"), text)
    writeFileSync(path.join(profiles, "notes.yaml"), "")
    const empty = fresh()
    mkdirSync(empty, { recursive: true })
    writeFileSync(path.join(empty, "tdd_feature.yaml"), "")
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(fresh(), "w")
        yield* AuthoringStore.seedProfiles(store, profiles)
        expect((yield* store.documents()).map((document) => document.id)).toEqual(["relay-a", "relay-a-b"])
        expect(yield* refused(AuthoringStore.seedProfiles(store, path.join(profiles, "missing")))).toEqual({
          status: 503,
          code: "profiles-unavailable",
          message: "The installed Relay profile directory is unavailable",
        })
        expect(yield* refused(AuthoringStore.seedProfiles(store, empty))).toEqual({
          status: 503,
          code: "profiles-unavailable",
          message: "The installed Relay profile catalog is empty",
        })
      }),
    )
  })
})

describe("open", () => {
  test("creates the data directory and only the documents, versions and scopes tables, in WAL mode", async () => {
    const dir = path.join(fresh(), "nested", "data")
    await run(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(dir, "w")
        yield* store.save({ body: draft("A") })
        // The write went through the WAL, which closing the store folds back and removes.
        expect(existsSync(path.join(dir, "authoring.sqlite3-wal"))).toBe(true)
      }),
    )
    expect(existsSync(path.join(dir, "authoring.sqlite3-wal"))).toBe(false)
    expect(raw(dir, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).toEqual([
      { name: "documents" },
      { name: "scopes" },
      { name: "versions" },
    ])
    expect(raw(dir, "PRAGMA journal_mode")).toEqual([{ journal_mode: "wal" }])
  })

  test("an interrupted fiber still closes the database", async () => {
    const dir = fresh()
    const opened = Promise.withResolvers<void>()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const store = yield* AuthoringStore.open(dir, "w")
              yield* store.save({ body: draft("A") })
              opened.resolve()
              return yield* Effect.never
            }),
          ),
        )
        yield* Effect.promise(() => opened.promise)
        expect(existsSync(path.join(dir, "authoring.sqlite3-wal"))).toBe(true)
        yield* Fiber.interrupt(fiber)
      }),
    )
    expect(existsSync(path.join(dir, "authoring.sqlite3-wal"))).toBe(false)
    expect(raw(dir, "SELECT count(*) AS n FROM documents")).toEqual([{ n: 1 }])
  })
})
