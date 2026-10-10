import { expect } from "bun:test"
import { join } from "node:path"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Tool } from "@orchestra/core/tool/tool"
import { Integration } from "@orchestra/schema/integration"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Tracer } from "effect"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { sql } from "drizzle-orm"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return Credential.layerFrom(undefined).pipe(
    Layer.provideMerge(CapabilityPolicyFixture.layer.pipe(Layer.provideMerge(Database.layerFromPath(join(tmp.path, "native.sqlite"))))),
    Layer.provideMerge(AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]),
      [[Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })]])),
  )
})))

function probe(mode: "http-wait" | "masked-observe" | "retention-observe") {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: "channel_send" })
    const rules = [{ action: "*", resource: "*", effect: "allow" }] satisfies Parameters<typeof CapabilityPolicyFixture.setRules>[0]
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: "channel_send", effectiveRules: rules }
    const credentials = yield* Credential.Service
    const global = yield* Global.Service
    const saved = yield* credentials.create({ integrationID: Integration.ID.make("native-runtime-probe"),
      value: { type: "key", key: "probe-only-key" } })
    const connections = yield* CapabilityConnections.make
    const connection = yield* connections.create({ provider: "discord", integrationID: saved.integrationID, credentialID: saved.id,
      subjectID: "99", endpoint: "https://discord.com/api/v10", scopeHash: "a".repeat(64) })
    const target = yield* connections.createTarget(connection, { environment: "fixture", resource: { guildID: "1", channelID: "10" } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["read", "channel.send"] })
    const received = yield* Deferred.make<void>()
    const observerReached = yield* Deferred.make<void>()
    const releaseObserver = yield* Deferred.make<void>()
    const mutationExits: Exit.Exit<unknown, unknown>[] = []
    const observerExits: Exit.Exit<unknown, unknown>[] = []
    const cleanup: Cause.Cause<never>[] = []
    const callbackRows: (typeof CapabilityJobTable.$inferSelect)[] = []
    const defect = new Error("EXACT_NATIVE_CLEANUP_DEFECT")
    const counts = { posts: 0 }
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === "/api/v10/users/@me") return Response.json({ id: "99" })
        if (path === "/api/v10/guilds/1") return Response.json({ id: "1", owner_id: "99", roles: [{ id: "1", permissions: "66560" }] })
        if (path === "/api/v10/guilds/1/members/99") return Response.json({ user: { id: "99" }, roles: [] })
        if (path === "/api/v10/channels/10") return Response.json({ id: "10", guild_id: "1", type: 0, permission_overwrites: [] })
        if (path === "/api/v10/channels/10/messages" && request.method === "POST") {
          counts.posts++
          Deferred.doneUnsafe(received, Effect.void)
          if (mode === "masked-observe") return Response.json({ error: "fixture 500" }, { status: 500 })
          if (mode === "retention-observe") return Response.json({ id: "201" })
          // Bound server-side streaming resources even if client cancellation fails.
          const timer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
          return new Response(new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"))
              timer.value = setTimeout(() => controller.close(), 1000)
            },
            cancel() { clearTimeout(timer.value) },
          }))
        }
        if (path === "/api/v10/channels/10/messages/201")
          return Response.json({ id: "201", channel_id: "10", type: 0, content: "native interrupt" })
        return Response.json({ path }, { status: 404 })
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    // Facade keeps actual SQLite transaction; fault follows actual observer UPDATE and invalid SQL.
    const transaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      const result = yield* use(tx)
      const row = yield* tx.select().from(CapabilityJobTable).where(
        sql`json_extract(${CapabilityJobTable.owner}, '$.sessionID') = ${f.context.sessionID}`,
      ).get().pipe(Effect.orDie)
      if (!row || row.state !== (mode === "retention-observe" ? "completed" : "unknown")) return result
      callbackRows.push(row)
      yield* Deferred.succeed(observerReached, undefined)
      yield* Deferred.await(releaseObserver).pipe(Effect.timeout("5 seconds"), Effect.orDie)
      const failed = yield* tx.run("INSERT INTO missing_native_cleanup_table VALUES (1)").pipe(Effect.exit)
      expect(Exit.isFailure(failed)).toBe(true)
      if (Exit.isSuccess(failed)) return yield* Effect.die("REAL_CLEANUP_SQL_DID_NOT_FAIL")
      expect(failed.cause.reasons).toHaveLength(1)
      const reason = failed.cause.reasons[0]
      if (!Cause.isFailReason(reason) || !(reason.error instanceof EffectDrizzleQueryError))
        return yield* Effect.die("REAL_CLEANUP_SQL_TYPE_MISSING")
      const annotation = Context.makeUnsafe(new Map([["native-cleanup", "must-survive"]]))
      const die = Cause.makeDieReason(defect).annotate(annotation)
      const cause = Cause.fromReasons<never>([Cause.makeDieReason(reason.error).annotate(annotation), die, die])
      cleanup.push(cause)
      return yield* Effect.failCause(cause)
    }), options)
    const db = new Proxy(f.database.db, { get: (database, key) => key === "transaction" ? transaction : Reflect.get(database, key, database) })
    const jobs = yield* CapabilityJobs.make.pipe(Effect.provideService(Database.Service, { ...f.database, db }))
    const artifacts = yield* CapabilityArtifacts.make({ root: join(global.data, "native-probe-artifacts"),
      quota: mode === "retention-observe" ? 1 : undefined })
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts, fixtureOrigin: server.url.origin, timeoutMs: 10000 })
    const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
      override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        super.end(time, exit)
        if (this.name === "CapabilityChannels.mutate") mutationExits.push(exit)
        if (this.name === "CapabilityJobs.observeHost") observerExits.push(exit)
      }
    }(options) })
    const pending = yield* CapabilityInvocation.withContext(binding, Tool.settle(channels.tools.channel_send,
      { type: "tool-call", id: f.context.toolCallID, name: "channel_send", input: { provider: "discord", text: "native interrupt" } }, f.context))
      .pipe(Effect.withTracer(tracer), Effect.forkChild)
    yield* Deferred.await(mode === "http-wait" ? received : observerReached)
    // Let Bun's fetch handler return before synchronously interrupting its client fiber.
    if (mode === "http-wait") yield* Effect.sleep("20 millis")
    const interruptor = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(observerReached)
    expect(pending.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(releaseObserver, undefined)
    const exit = yield* Fiber.await(pending)
    yield* Fiber.join(interruptor)
    expect(counts.posts).toBe(1)
    expect(cleanup).toHaveLength(1)
    expect(callbackRows).toHaveLength(1)
    expect(callbackRows[0].state).toBe(mode === "retention-observe" ? "completed" : "unknown")
    expect(observerExits).toHaveLength(mode === "retention-observe" ? 2 : 1)
    expect(observerExits.filter(Exit.isFailure)).toHaveLength(1)
    expect(mutationExits).toHaveLength(1)
    const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
    expect(rows).toHaveLength(1)
    // Failed observer transaction rolled back, acknowledged provider ID still durable.
    expect(rows[0].state).toBe(mode === "retention-observe" ? "submitted" : "submitting")
    expect(rows[0].provider_id).toBe(mode === "retention-observe" ? "201" : null)
    ;[mutationExits[0], exit].forEach((observed) => {
      expect(Exit.isFailure(observed)).toBe(true)
      if (Exit.isSuccess(observed)) throw new Error("NATIVE_INTERRUPTION_BECAME_SUCCESS")
      const dies = observed.cause.reasons.filter(Cause.isDieReason)
      expect(dies.map((reason) => reason.defect)).toEqual(cleanup[0].reasons.filter(Cause.isDieReason).map((reason) => reason.defect))
      dies.forEach((reason) => expect(reason.annotations.get("native-cleanup")).toBe("must-survive"))
      expect(observed.cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([interruptor.id])
      if (mode !== "http-wait") expect(observed.cause.reasons.some(Cause.isFailReason)).toBe(true)
    })
  }).pipe(Effect.timeout("15 seconds"))
}

it.live("native interrupt during restored HTTP wait retains cleanup failures", () => probe("http-wait"), 20000)
it.live("native interrupt during masked RPC observation retains cleanup failures", () => probe("masked-observe"), 20000)
it.live("native interrupt during masked retention observation retains cleanup failures", () => probe("retention-observe"), 20000)
