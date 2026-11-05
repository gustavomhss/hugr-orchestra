import { expect, test } from "bun:test"
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "@orchestra/client/contract"
import { compile } from "@orchestra/httpapi-codegen"
import { CapabilityAuthorization } from "@orchestra/protocol/middleware/capability-authorization"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { HttpApi } from "effect/unstable/httpapi"
import { FabricContextTable } from "../../../modules/fabric/src/context/sql"
import { FabricContextsFixture } from "./fabric-contexts-fixture"

type Fixture = Effect.Success<ReturnType<typeof FabricContextsFixture.make>>
const base = "/api/fabric/contexts"
const marker = ".orchestra-fabric-context"
const missing = (filename: string) => Effect.promise(() => lstat(filename).then(() => false, (error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return true
  throw error
}))
const snapshot = (f: Fixture) => Effect.gen(function* () {
  return { rows: yield* f.database.db.select().from(FabricContextTable),
    receipts: yield* f.database.db.all(sql`SELECT * FROM capability_request`),
    entries: yield* Effect.promise(() => readdir(f.root).then((entries) => entries.sort())),
    markers: yield* Effect.promise(async () => Promise.all((await readdir(f.root)).sort()
      .map((entry) => readFile(path.join(f.root, entry, marker), "utf8")))) }
})
const wire = (f: Fixture, url: string, input: Parameters<Fixture["request"]>[1], status: number) =>
  Effect.gen(function* () {
    const response = yield* f.request(url, input)
    const body = yield* Effect.promise(() => response.text())
    expect([response.status, body]).toEqual([status, expect.any(String)])
    if (status >= 400) {
      expect(body).not.toMatch(/"(?:stack|cause|Cause|sql|storageID|principal|preparation_nonce|markerNonce)"|\b(?:SELECT|INSERT|UPDATE|DELETE|SQLITE|ENOENT|EACCES)\b/)
      expect(body).not.toContain(f.directory)
      expect(body).not.toContain(f.database.storageID)
      expect(body).not.toContain("fabric-http-operator")
      expect(body).not.toContain(marker)
      if (input?.key && input.key.length > 2) expect(body).not.toContain(input.key)
    }
    return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(body)
  })

test("FHT01 passwordless bootstrap publishes canonical contexts only after explicit generated-client create", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const issued = yield* f.issue()
    const response = yield* f.request(base, { auth: issued.header })
    expect([response.status, yield* Effect.promise(() => response.text())]).toEqual([200, '{"items":[]}'])
    const client = f.client(issued.header).fabricContexts
    expect(yield* Effect.promise(() => client.preparing())).toEqual({ items: [] })
    expect(yield* f.database.db.select().from(FabricContextTable)).toEqual([])
    expect((yield* missing(f.root)) ? [] : yield* Effect.promise(() => readdir(f.root))).toEqual([])
    expect(yield* missing(path.join(f.directory, ".git"))).toBe(true)
    const first = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() => client.create({ "idempotency-key": "fht01-first" })))
    const second = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() => client.create({ "idempotency-key": "fht01-second" })))
    expect(first.context.id).not.toBe(second.context.id)
    const root = AbsolutePath.make(yield* Effect.promise(() => realpath(f.root)))
    const observed = yield* f.projects.resolve(root)
    expect(String(observed.id)).toBe("global") // Shared observed Project is not an owner ACL.
    const rows = yield* f.database.db.select().from(FabricContextTable)
    expect(rows).toHaveLength(2)
    expect(yield* Effect.promise(() => readdir(root).then((entries) => entries.sort())))
      .toEqual([first.context.id, second.context.id].sort())
    for (const info of [first, second]) {
      const raw = yield* wire(f, `${base}/${info.context.id}?generation=${info.context.generation}`, { auth: issued.header }, 200)
      expect(raw).toEqual({ context: { id: info.context.id, generation: info.context.generation },
        location: { directory: path.join(root, info.context.id), project: info.location.project } })
      expect(Object.keys(info.location.project).sort()).toEqual(["directory", "id"])
      expect(info.location.project.id).toBe(observed.id)
      expect(yield* Effect.promise(() => client.resolve(info.context))).toEqual(info)
      expect(yield* missing(path.join(info.location.directory, ".git"))).toBe(true)
      expect((yield* Effect.promise(() => stat(info.location.directory))).mode & 0o777).toBe(0o700)
      expect((yield* Effect.promise(() => stat(path.join(info.location.directory, marker)))).mode & 0o777).toBe(0o600)
      expect(rows.find((row) => row.id === info.context.id)).toMatchObject({ root,
        directory: info.location.directory, project_id: observed.id, generation: info.context.generation, state: "active" })
      for (const secret of [issued.bearer, f.database.storageID, "fabric-http-operator", "fht01-first", "fht01-second",
        ...rows.map((row) => row.preparation_nonce)]) expect(JSON.stringify(raw)).not.toContain(secret)
    }
    const page = yield* wire(f, base, { auth: issued.header }, 200)
    expect(Schema.decodeUnknownSync(FabricContext.Page)(page).items).toHaveLength(2)
    expect(page).toEqual({ items: expect.arrayContaining([first.context, second.context]) })
    expect(yield* Effect.promise(() => client.preparing())).toEqual({ items: [] })
    const paged = yield* Effect.promise(() => client.list({ limit: 1 }))
    expect(Schema.decodeUnknownSync(FabricContext.Page)(paged).items).toHaveLength(1)
    expect(Object.keys(paged).sort()).toEqual(["after", "items"])
    const next = yield* Effect.promise(() => client.list({ limit: 1, after: paged.after }))
    expect(next.items).toHaveLength(1)
    expect(next.items[0].id).not.toBe(paged.items[0].id)
  })))
}, 90000)

test("FHT02 exclusive real authentication modes and current scope cannot be widened by headers or configured authority", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const issued = yield* f.issue()
    expect(yield* wire(f, base, { auth: issued.header }, 200)).toEqual({ items: [] })
    const info = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() =>
      f.client(issued.header).fabricContexts.create({ "idempotency-key": "fht02-positive" })))
    const before = yield* snapshot(f)
    expect(before.rows).toHaveLength(1)
    expect(before.receipts.length).toBeGreaterThan(0)
    const limited = yield* f.issue({ placements: "instance", actions: ["fabric.context.list"] })
    expect(yield* wire(f, base, { auth: limited.header }, 200)).toEqual({ items: [info.context] })
    const headers = { principal: "fabric-http-operator", grant: JSON.stringify({ placements: "instance", actions: ["*"] }) }
    yield* wire(f, base, { auth: limited.header, key: "fht02-denied-create", payload: {}, headers }, 403)
    yield* wire(f, `${base}/remove`, { auth: limited.header, key: "fht02-denied-delete", payload: info.context, headers }, 403)
    const root = AbsolutePath.make(yield* Effect.promise(() => realpath(f.root)))
    const project = yield* f.projects.resolve(root)
    const rootPlacement = { projectID: project.id, location: { directory: root } }
    const concrete = { projectID: info.location.project.id, location: { directory: info.location.directory } }
    for (const placements of [[rootPlacement], [concrete], [rootPlacement, concrete]]) {
      const reader = yield* f.issue({ placements, actions: ["fabric.context.read"] })
      for (const key of [undefined, "fht02-positive", "fht02-read-key"]) {
        const body = yield* wire(f, `${base}/${info.context.id}?generation=${info.context.generation}`,
          { auth: reader.header, headers, key }, placements.length === 2 ? 200 : 403)
        if (placements.length === 2) expect(body).toEqual(info)
      }
    }
    yield* wire(f, `${base}/${info.context.id}?generation=${info.context.generation}`,
      { auth: limited.header, key: "fht02-positive" }, 403)
    expect(yield* snapshot(f)).toEqual(before)

    const foreign = yield* FabricContextsFixture.make({ filename: f.filename, root: f.root, principal: "other-header-owner" })
    const foreignAuth = (yield* foreign.issue()).header
    const foreignInfo = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() =>
      foreign.client(foreignAuth).fabricContexts.create({ "idempotency-key": "fht02-foreign-positive" })))
    expect(yield* Effect.promise(() => foreign.client(foreignAuth).fabricContexts.resolve(foreignInfo.context))).toEqual(foreignInfo)
    const afterForeign = yield* snapshot(f)
    expect(yield* wire(f, base, { auth: issued.header, headers: { principal: "other-header-owner" } }, 200))
      .toEqual({ items: [info.context] })
    expect(yield* wire(f, `${base}/${info.context.id}?generation=1`,
      { auth: issued.header, headers: { principal: "other-header-owner" } }, 200)).toEqual(info)
    const unknown = FabricContext.ID.create()
    const unknownError = yield* wire(f, `${base}/${unknown}?generation=1`, { auth: issued.header }, 403)
    expect(yield* wire(f, `${base}/${foreignInfo.context.id}?generation=1`,
      { auth: issued.header, headers: { principal: "other-header-owner" } }, 403)).toEqual(unknownError)
    expect(yield* wire(f, base, { auth: foreignAuth, headers: { principal: "fabric-http-operator" } }, 200))
      .toEqual({ items: [foreignInfo.context] })
    expect(yield* snapshot(f)).toEqual(afterForeign)

    const basic = yield* FabricContextsFixture.make({ password: "synthetic-password" })
    expect(yield* wire(basic, base, { auth: basic.basic }, 200)).toEqual({ items: [] })
    const basicInfo = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() =>
      basic.client(basic.basic).fabricContexts.create({ "idempotency-key": "fht02-basic-positive" })))
    const restricted = yield* FabricContextsFixture.make({ mode: "default", filename: basic.filename, root: basic.root,
      password: "synthetic-restricted-password", scope: { placements: "instance", actions: ["fabric.context.list"] } })
    expect(yield* wire(restricted, base, { auth: restricted.basic }, 200)).toEqual({ items: [basicInfo.context] })
    const basicBefore = yield* snapshot(restricted)
    yield* wire(restricted, base, { auth: restricted.basic, key: "fht02-basic-denied", payload: {}, headers }, 403)
    yield* wire(restricted, `${base}/remove`,
      { auth: restricted.basic, key: "fht02-basic-delete-denied", payload: basicInfo.context, headers }, 403)
    expect(yield* snapshot(restricted)).toEqual(basicBefore)
    expect(yield* Effect.promise(() => basic.client(basic.basic).fabricContexts.resolve(basicInfo.context))).toEqual(basicInfo)
    for (const kind of ["missing", "wrong-basic", "bearer", "embedded-missing", "malformed", "revoked", "foreign", "basic-only"] as const) {
      const configured = ["missing", "wrong-basic", "bearer"].includes(kind)
      const denied = yield* FabricContextsFixture.make(configured ? { password: "synthetic-password" } : { mode: "embedded" })
      const own = yield* denied.issue()
      const foreign = yield* f.issue()
      if (kind === "revoked") yield* denied.operators.revoke(own.authority)
      const auth = kind === "missing" || kind === "embedded-missing" ? undefined
        : kind === "wrong-basic" ? `Basic ${Buffer.from("orchestra:wrong").toString("base64")}`
        : kind === "malformed" ? "Bearer malformed" : kind === "foreign" ? foreign.header
        : kind === "basic-only" ? denied.basic : own.header
      for (const input of [{ auth }, { auth, method: "POST", key: "fht02-rejected", payload: {} }]) {
        yield* wire(denied, base, input, 401)
        expect(yield* missing(denied.root)).toBe(true)
        expect(yield* denied.database.db.select().from(FabricContextTable)).toEqual([])
        expect(yield* denied.database.db.all(sql`SELECT * FROM capability_request`)).toEqual([])
      }
    }
    const embedded = yield* FabricContextsFixture.make({ mode: "embedded" })
    const own = yield* embedded.issue()
    expect(yield* wire(embedded, base, { auth: own.header }, 200)).toEqual({ items: [] })
  })))
}, 90000)

test("FHT03 closed wire inputs reject retargeting and malformed mutations without SQL, receipt or marker changes", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const issued = yield* f.issue()
    const auth = issued.header
    expect(yield* wire(f, base, { auth }, 200)).toEqual({ items: [] })
    const info = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() =>
      f.client(auth).fabricContexts.create({ "idempotency-key": "fht03-positive" })))
    const before = yield* snapshot(f)
    expect(before.rows).toHaveLength(1)
    expect(before.receipts.length).toBeGreaterThan(0)
    expect(before.markers).toHaveLength(1)
    const reject = (url: string, input: Parameters<Fixture["request"]>[1], status = 400) => Effect.gen(function* () {
      yield* wire(f, url, { auth, ...input }, status)
      expect(yield* snapshot(f)).toEqual(before)
    })
    for (const payload of [null, [], [1], "text", 1, true]) yield* reject(base, { key: "fht03-shape", payload })
    for (const field of ["principal", "path", "root", "directory", "storageID", "workspaceID", "nonce", "grant", "maxContexts"]) {
      yield* reject(base, { key: "fht03-extra", payload: { [field]: f.directory } })
      yield* reject(`${base}/remove`, { key: "fht03-ref-extra", payload: { ...info.context, [field]: f.directory } })
    }
    for (const payload of [{ id: "bad", generation: 1 }, { id: info.context.id },
      ...[0, -1, 1.5, "1", null].map((generation) => ({ id: info.context.id, generation }))]) {
      yield* reject(`${base}/remove`, { key: "fht03-ref", payload })
    }
    for (const query of ["principal=forged", "placement=forged", "location[directory]=forged", "directory=forged",
      "root=forged", "workspaceID=forged", "storageID=forged", "grant=forged"]) {
      for (const url of [base, `${base}/preparing`]) yield* reject(`${url}?${query}`, {})
      yield* reject(`${base}/${info.context.id}?generation=1&${query}`, {})
      yield* reject(`${base}?${query}`, { key: "fht03-query", payload: {} })
      yield* reject(`${base}/remove?${query}`, { key: "fht03-query-remove", payload: info.context })
    }
    for (const query of ["limit=0", "limit=33", "limit=1.5", "limit=nope", "after=bad"]) {
      yield* reject(`${base}?${query}`, {})
      yield* reject(`${base}/preparing?${query}`, {})
    }
    for (const query of ["", "generation=0", "generation=-1", "generation=1.5", "generation=nope"]) {
      yield* reject(`${base}/${info.context.id}?${query}`, {})
    }
    yield* reject(`${base}/bad?generation=1`, {})
    yield* reject(base, { method: "POST", key: "fht03-no-body" })
    for (const [url, payload] of [[base, {}], [`${base}/remove`, info.context]] as const) {
      yield* reject(url, { payload })
      for (const key of ["", " ", "a".repeat(129)]) yield* reject(url, { key, payload }, 403)
    }
    expect(yield* Effect.promise(() => f.client(auth).fabricContexts.resolve(info.context))).toEqual(info)
    expect(yield* snapshot(f)).toEqual(before)
  })))
}, 90000)

test("FHT07 official compiler, reflected middleware and real OpenAPI expose exactly five Location-free canonical operations", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const issued = yield* f.issue()
    expect(yield* wire(f, base, { auth: issued.header }, 200)).toEqual({ items: [] })
    expect(yield* Effect.promise(() => f.client(issued.header).fabricContexts.list())).toEqual({ items: [] })
    const expected = [
      { name: "list", method: "get", path: base, fields: ["after", "limit"], schema: FabricContext.Page, identifier: "FabricContext.Page" },
      { name: "preparing", method: "get", path: `${base}/preparing`, fields: ["after", "limit"], schema: FabricContext.Page, identifier: "FabricContext.Page" },
      { name: "create", method: "post", path: base, fields: ["idempotency-key"], schema: FabricContext.Info, identifier: "FabricContext.Info" },
      { name: "resolve", method: "get", path: `${base}/{id}`, fields: ["id", "generation"], schema: FabricContext.Info, identifier: "FabricContext.Info" },
      { name: "remove", method: "post", path: `${base}/remove`, fields: ["id", "generation", "idempotency-key"], schema: FabricContext.Ref, identifier: "FabricContext.Ref" },
    ]
    const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
    const groups = contract.groups.filter((group) => group.identifier === "fabricContexts")
    expect(groups).toHaveLength(1)
    expect(groups[0].endpoints.map((item) => ({ name: item.operation.name, fields: item.input.map((field) => field.name).sort() })))
      .toEqual(expected.map((item) => ({ name: item.name, fields: item.fields.toSorted() })))
    const reflected: string[] = []
    HttpApi.reflect(ClientApi, { onGroup() {}, onEndpoint({ group, endpoint, middleware }) {
      if (group.identifier !== "server.fabric.context") return
      reflected.push(endpoint.name)
      const item = expected.find((item) => `fabric.context.${item.name}` === endpoint.name)
      expect(item).toBeDefined()
      expect([...endpoint.success]).toEqual([item!.schema])
      const keys = [...middleware].map((service) => service.key)
      expect(keys).toContain(CapabilityAuthorization.key)
      expect(keys).not.toContain("@orchestra/client/LocationMiddleware")
      expect(keys).not.toContain("@orchestra/client/SessionLocationMiddleware")
    } })
    expect(reflected.sort()).toEqual(expected.map((item) => `fabric.context.${item.name}`).sort())
    const document = Schema.decodeUnknownSync(Schema.Struct({
      paths: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
      components: Schema.Struct({ schemas: Schema.Record(Schema.String, Schema.Unknown) }),
    }))(yield* wire(f, "/openapi.json", { auth: issued.header }, 200))
    expect(Object.entries(document.paths).flatMap(([url, methods]) => url.startsWith(base)
      ? Object.keys(methods).map((method) => `${method} ${url}`) : []).sort())
      .toEqual(expected.map((item) => `${item.method} ${item.path}`).sort())
    for (const item of expected) {
      expect(Object.hasOwn(document.components.schemas, item.identifier)).toBe(true)
      expect(document.paths[item.path][item.method]).toMatchObject({ responses: { "200": {
        content: { "application/json": { schema: { $ref: `#/components/schemas/${item.identifier}` } } },
      } } })
      if (item.name === "create" || item.name === "remove") {
        expect(document.paths[item.path][item.method]).toMatchObject({ requestBody: {
          content: { "application/json": { schema: { $ref: `#/components/schemas/FabricContext.${item.name === "create" ? "Create" : "Ref"}` } } },
        } })
      }
    }
    // Runtime Core/Server dependency absence is a separate source-review obligation, not proved by these fields.
  })))
}, 90000)

test("FHT08 default Basic and embedded Bearer routers use the host root and the same real database/operator", async () => {
  for (const entry of [
    { mode: "default", defaultRoot: false }, { mode: "embedded", defaultRoot: false },
    { mode: "default", defaultRoot: true }, { mode: "embedded", defaultRoot: true },
  ] as const) {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const f = yield* FabricContextsFixture.make({ ...entry,
        ...(entry.mode === "default" ? { password: "synthetic-password" } : {}) })
      const issued = yield* f.issue()
      const auth = entry.mode === "default" ? f.basic : issued.header
      if (entry.defaultRoot) expect(String(f.root)).toBe(path.join(f.directory, "fabric", "contexts"))
      expect(yield* missing(f.root)).toBe(true)
      yield* wire(f, base, {}, 401)
      expect(yield* missing(f.root)).toBe(true)
      expect(yield* wire(f, base, { auth }, 200)).toEqual({ items: [] })
      expect(yield* missing(path.join(f.directory, ".git"))).toBe(true)
      expect(yield* f.database.db.select().from(FabricContextTable)).toEqual([])
      const client = f.client(auth).fabricContexts
      const info = Schema.decodeUnknownSync(FabricContext.Info)(yield* Effect.promise(() => client.create({ "idempotency-key": "fht08-create" })))
      expect(String(info.location.directory)).toBe(path.join(yield* Effect.promise(() => realpath(f.root)), info.context.id))
      expect(yield* Effect.promise(() => client.resolve(info.context))).toEqual(info)
      expect(yield* Effect.promise(() => client.preparing())).toEqual({ items: [] })
      const before = yield* snapshot(f)
      expect(before.rows).toHaveLength(1)
      expect(before.rows[0]).toMatchObject({ id: info.context.id, directory: info.location.directory, state: "active" })
      for (const input of [{ payload: { directory: f.directory } }, { payload: {} }]) {
        yield* wire(f, input.payload.directory ? base : `${base}?location[directory]=${encodeURIComponent(f.directory)}`,
          { auth, key: "fht08-retarget", ...input }, 400)
        expect(yield* snapshot(f)).toEqual(before)
      }
      const removed = Schema.decodeUnknownSync(FabricContext.Ref)(yield* Effect.promise(() =>
        client.remove({ ...info.context, "idempotency-key": "fht08-remove" })))
      expect(removed.id).toBe(info.context.id)
      expect(yield* f.database.db.select().from(FabricContextTable)).toMatchObject([
        { id: removed.id, generation: removed.generation, state: "deleted", root: before.rows[0].root },
      ])
      expect(yield* Effect.promise(() => client.list())).toEqual({ items: [] })
      expect(yield* Effect.promise(() => client.preparing())).toEqual({ items: [] })
    })))
  }
}, 90000)
