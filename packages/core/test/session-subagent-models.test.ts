import { describe, expect, test } from "bun:test"
import { LLM, LLMClient, Message } from "@orchestra/llm"
import { RequestExecutor } from "@orchestra/llm/route"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { Policy } from "@orchestra/schema/session-subagent-models"
import { Catalog } from "@orchestra/core/catalog"
import { Credential } from "@orchestra/core/credential"
import { Integration } from "@orchestra/core/integration"
import { Database } from "@orchestra/core/database/database"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import migration from "@orchestra/core/database/migration/20261012134025_session_subagent_models"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionEvent } from "@orchestra/core/session/event"
import { fromRow } from "@orchestra/core/session/info"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { asc, eq, sql } from "drizzle-orm"
import { Cause, DateTime, Effect, Layer } from "effect"
import { MaxOpsBeforeYield } from "effect/Scheduler"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const nodes = LayerNode.group([Database.node, EventV2.node, SessionSubagentModels.node])
const layer = AppNodeBuilder.build(nodes)
const it = testEffect(layer)
const root = SessionSchema.ID.make("ses_policy_root")
const child = SessionSchema.ID.make("ses_policy_child")
const grandchild = SessionSchema.ID.make("ses_policy_grandchild")
const missing = SessionSchema.ID.make("ses_policy_missing")
const ref = (providerID: string, id: string, variant?: string) =>
  ModelV2.Ref.make({
    providerID: ProviderV2.ID.make(providerID),
    id: ModelV2.ID.make(id),
    ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }),
  })
const a = ref("provider", "a")
const b = ref("provider", "b")
const c = ref("other", "c")
const allow = (...models: ModelV2.Ref[]) => ({ mode: "allowlist" as const, models })

const seed = Effect.gen(function* () {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({
      id: ProjectV2.ID.global,
      worktree: AbsolutePath.make("/project"),
      sandboxes: [],
    })
    .run()
  yield* database.db
    .insert(SessionTable)
    .values(
      [
        { id: root, parent_id: null },
        { id: child, parent_id: root },
        { id: grandchild, parent_id: child },
      ].map((entry) => ({
        ...entry,
        project_id: ProjectV2.ID.global,
        slug: entry.id,
        directory: "/project",
        title: "policy",
        version: "test",
        time_updated: 0,
      })),
    )
    .run()
})

describe("SessionSubagentModels", () => {
  test("generated migration preserves historical sessions as SQL NULL and applies once", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* EffectDrizzleSqlite.makeWithDefaults()
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, title text NOT NULL)`)
        yield* db.run(sql`INSERT INTO session VALUES ('ses_historical', 'historical')`)
        yield* DatabaseMigration.applyOnly(db, [migration])
        expect(yield* db.get(sql`SELECT * FROM session`)).toEqual({
          id: "ses_historical",
          title: "historical",
          subagent_models: null,
        })
        yield* db.run(sql`UPDATE session SET subagent_models = '{"mode":"allowlist","models":[]}'`)
        yield* DatabaseMigration.applyOnly(db, [migration])
        expect(yield* db.get(sql`SELECT subagent_models FROM session`)).toEqual({
          subagent_models: '{"mode":"allowlist","models":[]}',
        })
      }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
    )
  })

  it.live("normalizes variants and tuple identities, publishes exactly one canonical durable event", () =>
    Effect.gen(function* () {
      yield* seed
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      expect(SessionSubagentModels.Policy).toBe(Policy)
      const expected = allow(a, ref("p/q", "r"), ref("p", "q/r"), ref("provider#credential", "a"))
      expect(
        yield* policies.set(root, allow(ref("provider", "a", "high"), ref("provider", "a", "low"), ...expected.models)),
      ).toEqual(expected)
      expect(yield* policies.get(root)).toEqual(expected)
      const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()
      if (!row) throw new Error("Missing policy row")
      expect(fromRow(row).subagentModels).toEqual(expected)
      expect(row.time_updated).toBeGreaterThan(0)
      const events = yield* database.db.select().from(EventTable).all()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: EventV2.versionedType(SessionEvent.SubagentModelsChanged.type, 1),
        aggregate_id: root,
        data: { sessionID: root, policy: expected, timestamp: row.time_updated },
      })
      yield* policies.set(root, { mode: "inherit" })
      expect(yield* policies.get(root)).toEqual({ mode: "inherit" })
      const cleared = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()
      expect(cleared?.subagent_models).toBeNull()
      if (!cleared) throw new Error("Missing cleared row")
      expect(fromRow(cleared).subagentModels).toBeUndefined()
    }),
  )

  it.effect("intersects ancestor ceilings; descendants cannot widen; root own chat stays unrestricted", () =>
    Effect.gen(function* () {
      yield* seed
      const policies = yield* SessionSubagentModels.Service
      yield* policies.set(root, allow(a, b))
      yield* policies.set(child, allow(b, c))
      expect(yield* policies.forSession(root)).toEqual([])
      expect(yield* policies.forSession(child)).toEqual([allow(a, b)])
      expect(yield* policies.forChild(child)).toEqual([allow(b, c), allow(a, b)])
      yield* policies.assert(root, c)
      yield* policies.assert(child, a)
      yield* policies.assert(grandchild, ref("provider", "b", "unlisted-variant"))
      expect(yield* policies.assert(grandchild, a).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      expect(yield* policies.assertChild(child, c).pipe(Effect.flip)).toMatchObject({ reason: "not-allowed" })
      yield* policies.set(child, { mode: "inherit" })
      yield* policies.assert(grandchild, a)
      expect(yield* policies.assert(grandchild, c).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      yield* policies.set(root, allow())
      yield* policies.assert(root, c)
      expect(yield* policies.assertChild(root, a).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      expect(yield* policies.assert(child, a).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
      expect(yield* policies.assert(child, undefined).pipe(Effect.flip)).toMatchObject({ reason: "unknown-identity" })
      yield* policies.assert(root, undefined)
    }),
  )

  it.effect("fails closed on missing sessions, missing parents, cycles and malformed storage", () =>
    Effect.gen(function* () {
      yield* seed
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      expect(yield* policies.get(missing).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.NotFoundError)
      expect(yield* policies.set(missing, allow()).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.NotFoundError,
      )
      expect(yield* database.db.select().from(EventTable).all()).toEqual([])
      yield* database.db.update(SessionTable).set({ parent_id: missing }).where(eq(SessionTable.id, root)).run()
      expect(yield* policies.forSession(child).pipe(Effect.flip)).toMatchObject({
        _tag: "SessionSubagentModels.InvalidChainError",
        reason: "missing-parent",
        ancestorID: missing,
      })
      yield* database.db.update(SessionTable).set({ parent_id: grandchild }).where(eq(SessionTable.id, root)).run()
      expect(yield* policies.forChild(child).pipe(Effect.flip)).toMatchObject({
        _tag: "SessionSubagentModels.InvalidChainError",
        reason: "cycle",
      })
      yield* database.db.update(SessionTable).set({ parent_id: null }).where(eq(SessionTable.id, root)).run()
      yield* Effect.forEach(
        ["{", "null", "{}", '{"mode":"allowlist"}', '{"mode":"allowlist","models":[{}]}'],
        (value) =>
          Effect.gen(function* () {
            yield* database.db
              .update(SessionTable)
              .set({ subagent_models: value })
              .where(eq(SessionTable.id, root))
              .run()
            expect(yield* policies.get(root).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.StorageError)
            expect(yield* policies.assert(child, a).pipe(Effect.flip)).toBeInstanceOf(
              SessionSubagentModels.StorageError,
            )
            const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()
            if (!row) throw new Error("Missing invalid row")
            expect(() => fromRow(row)).toThrow(SessionSubagentModels.StorageError)
          }),
      )
    }),
  )

  it.effect("keeps slash tuples and virtual credentials distinct while variants share access", () =>
    Effect.gen(function* () {
      yield* seed
      const policies = yield* SessionSubagentModels.Service
      yield* policies.set(root, allow(ref("p/q", "r"), ref("provider#one", "a", "high")))
      yield* policies.assertChild(root, ref("p/q", "r"))
      yield* policies.assertChild(root, ref("provider#one", "a", "low"))
      expect(yield* policies.assertChild(root, ref("p", "q/r")).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      expect(yield* policies.assertChild(root, a).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      expect(yield* policies.assertChild(root, ref("provider#two", "a")).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
    }),
  )

  it.effect("rolls back policy, timestamp and event together when another projector fails", () =>
    Effect.gen(function* () {
      yield* seed
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const policies = yield* SessionSubagentModels.Service
      yield* policies.set(root, allow(a))
      const before = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()
      const log = yield* database.db.select().from(EventTable).all()
      yield* events.project(SessionEvent.SubagentModelsChanged, () => Effect.die("Projection rejected"))
      expect(yield* policies.set(root, allow(b)).pipe(Effect.flip)).toMatchObject({
        _tag: "SessionSubagentModels.StorageError",
        message: "Projection rejected",
      })
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()).toEqual(before)
      expect(yield* database.db.select().from(EventTable).all()).toEqual(log)
      expect(yield* EventV2.latestSequence(database.db, root)).toBe(0)
    }),
  )

  test("reopens a real database and replays policy plus timestamp through the global service node", async () => {
    await using dir = await tmpdir()
    const persisted = AppNodeBuilder.build(nodes, [[Database.node, Database.layerFromPath(`${dir.path}/policy.db`)]])
    const run = <A, E>(
      effect: Effect.Effect<A, E, Database.Service | EventV2.Service | SessionSubagentModels.Service>,
    ) => Effect.runPromise(effect.pipe(Effect.provide(persisted), Effect.scoped))
    const recorded = await run(
      Effect.gen(function* () {
        yield* seed
        const policies = yield* SessionSubagentModels.Service
        const database = yield* Database.Service
        yield* policies.set(root, allow(a))
        yield* policies.set(root, allow(b))
        return yield* database.db.select().from(EventTable).orderBy(asc(EventTable.seq)).all()
      }),
    )
    await run(
      Effect.gen(function* () {
        const policies = yield* SessionSubagentModels.Service
        const database = yield* Database.Service
        const events = yield* EventV2.Service
        expect(yield* policies.get(root)).toEqual(allow(b))
        yield* events.remove(root)
        yield* database.db
          .update(SessionTable)
          .set({ subagent_models: null, time_updated: 0 })
          .where(eq(SessionTable.id, root))
          .run()
        yield* events.replayAll(
          recorded.map((event) => ({
            id: event.id,
            type: event.type,
            seq: event.seq,
            aggregateID: event.aggregate_id,
            data: event.data,
          })),
        )
        expect(yield* policies.get(root)).toEqual(allow(b))
        expect(recorded[1]?.data.timestamp).toEqual(
          (yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get())?.time_updated,
        )
        yield* policies.assert(child, b)
        expect(yield* policies.assert(child, a).pipe(Effect.flip)).toBeInstanceOf(
          SessionSubagentModels.ModelDeniedError,
        )
      }),
    )
  }, 30_000)

  test("ancestor walks hold one real WAL snapshot while another connection atomically changes both ceilings", async () => {
    await using dir = await tmpdir()
    const filename = `${dir.path}/snapshots.db`
    const persisted = AppNodeBuilder.build(nodes, [[Database.node, Database.layerFromPath(filename)]])
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* seed
        const database = yield* Database.Service
        const policies = yield* SessionSubagentModels.Service
        yield* policies.set(root, allow(a))
        yield* policies.set(child, allow(a))
        const writes = Effect.gen(function* () {
          const writer = yield* Database.Service
          yield* Effect.forEach(
            Array.from({ length: 100 }, (_, index) => index),
            (index) =>
              writer.db
                .run(
                  sql`UPDATE session SET subagent_models = ${JSON.stringify(allow(index % 2 ? a : b))} WHERE id IN (${root}, ${child})`,
                )
                .pipe(Effect.andThen(Effect.yieldNow)),
          )
        }).pipe(Effect.provide(Database.layerFromPath(filename)))
        yield* Effect.all(
          [
            writes,
            Effect.forEach(Array.from({ length: 100 }), () =>
              Effect.gen(function* () {
                // Force interleaving between reads; synchronous SQLite otherwise hides missing transactions.
                const ceilings = yield* policies
                  .forSession(grandchild)
                  .pipe(Effect.provideService(MaxOpsBeforeYield, 16))
                expect(ceilings).toHaveLength(2)
                expect(ceilings[0]).toEqual(ceilings[1])
              }),
            ),
          ],
          { concurrency: "unbounded" },
        )
        expect(
          yield* database.db
            .select({ policy: SessionTable.subagent_models })
            .from(SessionTable)
            .where(eq(SessionTable.id, root))
            .get(),
        ).toEqual({ policy: JSON.stringify(allow(a)) })
      }).pipe(Effect.provide(persisted), Effect.scoped),
    )
  }, 30_000)
})

const resolverTests = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Catalog.node,
      Integration.node,
      SessionRunnerModel.node,
      SessionSubagentModels.node,
      Credential.node,
    ]),
    [
      [
        Location.node,
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ],
    ],
  ),
)

resolverTests.effect(
  "policy resolver filters automatic default/fallback, denies explicit pins and keeps catalog deployment aliases",
  () =>
    Effect.gen(function* () {
      yield* seed
      const catalog = yield* Catalog.Service
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      const models = yield* SessionRunnerModel.Service
      const credentials = yield* Credential.Service
      const integrations = yield* Integration.Service
      yield* integrations.transform((draft) => draft.update(Integration.ID.make(a.providerID), () => {}))
      yield* catalog.transform((draft) => {
        draft.provider.update(a.providerID, (provider) => {
          provider.request.body.apiKey = "synthetic"
        })
        ;[a, b].forEach((ref, index) =>
          draft.model.update(ref.providerID, ref.id, (model) => {
            model.api = {
              type: "aisdk",
              package: "@ai-sdk/openai-compatible",
              url: "https://unused.example/v1",
              id: ModelV2.ID.make("shared-deployment"),
            }
            model.time.released = 10 - index
            model.enabled = true
          }),
        )
        draft.model.default.set(a.providerID, a.id)
      })
      const row = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, child)).get()
      const rootRow = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, root)).get()
      if (!row || !rootRow) throw new Error("Missing resolver sessions")
      yield* policies.set(root, allow(b))
      const automatic = yield* models.resolve(fromRow(row))
      expect(String(automatic.id)).toBe("shared-deployment")
      expect(SessionRunnerModel.reference(automatic)).toEqual(b)
      expect(yield* models.resolve({ ...fromRow(row), model: a }).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      expect(
        SessionRunnerModel.reference(
          yield* models.resolve({ ...fromRow(row), model: ref("provider", "b", "default") }),
        ),
      ).toEqual(ref("provider", "b", "default"))
      expect(SessionRunnerModel.reference(yield* models.resolve(fromRow(rootRow)))).toEqual(a)
      const credential = yield* credentials.create({
        integrationID: Integration.ID.make(a.providerID),
        label: "Separate credential",
        value: Credential.Key.make({ type: "key", key: "synthetic" }),
      })
      const virtual = ref(`${a.providerID}#${credential.id}`, b.id)
      yield* policies.set(root, allow(virtual))
      expect(SessionRunnerModel.reference(yield* models.resolve(fromRow(row)))).toEqual(virtual)
      expect(yield* models.resolve({ ...fromRow(row), model: b }).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
      yield* policies.set(root, allow())
      expect(yield* models.resolve(fromRow(row)).pipe(Effect.flip)).toBeInstanceOf(
        SessionRunnerModel.ModelNotSelectedError,
      )
      expect(yield* models.resolve({ ...fromRow(row), model: b }).pipe(Effect.flip)).toBeInstanceOf(
        SessionSubagentModels.ModelDeniedError,
      )
    }),
)

it.live("policy compaction checks catalog identity before real network, including overflow and unknown seams", () =>
  Effect.gen(function* () {
    yield* seed
    const policies = yield* SessionSubagentModels.Service
    const events = yield* EventV2.Service
    const calls: unknown[] = []
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          port: 0,
          fetch: async (request) => {
            calls.push(await request.json())
            return new Response(
              'data: {"id":"test","choices":[{"index":0,"delta":{"content":"Summary"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              { headers: { "Content-Type": "text/event-stream" } },
            )
          },
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const model = yield* SessionRunnerModel.fromCatalogModel(
      ModelV2.Info.make({
        ...ModelV2.Info.empty(b.providerID, b.id),
        api: {
          type: "aisdk",
          package: "@ai-sdk/openai-compatible",
          url: server.url.origin,
          id: ModelV2.ID.make("wire-alias"),
        },
        limit: { context: 20_000, output: 1000 },
      }),
    )
    const llm = yield* LLMClient.Service.pipe(
      Effect.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer))),
    )
    const compaction = SessionCompaction.make({ events, llm, subagentModels: policies, config: [] })
    const input = {
      sessionID: child,
      model,
      request: LLM.request({ model, messages: [Message.user("fresh".repeat(20_000))] }),
      entries: [
        {
          seq: 1,
          message: SessionMessage.User.make({
            type: "user",
            id: SessionMessage.ID.make("msg_policy_summary"),
            text: "past work ".repeat(4000),
            time: { created: DateTime.makeUnsafe(0) },
          }),
        },
      ],
    }
    yield* policies.set(root, allow(b))
    expect(yield* compaction.compactAfterOverflow(input)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ model: "wire-alias" })
    yield* policies.set(root, allow(a))
    const overflow = yield* compaction.compactAfterOverflow(input).pipe(Effect.exit)
    expect(calls).toHaveLength(1)
    expect(overflow._tag).toBe("Failure")
    if (overflow._tag === "Failure")
      expect(Cause.squash(overflow.cause)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
    const automatic = yield* compaction.compactIfNeeded(input).pipe(Effect.exit)
    expect(calls).toHaveLength(1)
    expect(automatic._tag).toBe("Failure")
    if (automatic._tag === "Failure")
      expect(Cause.squash(automatic.cause)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
    const unknown = { ...model }
    const embedded = yield* compaction.compactAfterOverflow({ ...input, model: unknown }).pipe(Effect.exit)
    expect(calls).toHaveLength(1)
    expect(embedded._tag).toBe("Failure")
    if (embedded._tag === "Failure") expect(Cause.squash(embedded.cause)).toMatchObject({ reason: "unknown-identity" })
  }),
)
