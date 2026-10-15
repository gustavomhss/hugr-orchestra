import { describe, expect } from "bun:test"
import path from "path"
import { randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { Context, Deferred, Effect, Exit, Layer, Queue, Redacted, Schema, Scope } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { RelayLedger } from "@orchestra/schema/relay-ledger"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { LedgerVerify } from "@orchestra/relay/ledger/verify"
import { Config } from "../src/config"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { makeLocationNode } from "../src/effect/app-node"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { EventTable } from "../src/event/sql"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { buildLocationServiceMap, locationServices, LocationServiceMap } from "../src/location-services"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { Relay } from "../src/relay"
import { RelayHookRecovery } from "../src/relay-hook-recovery"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { SessionTable } from "../src/session/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const installID = "h-0000000000000001"

// Keep the production map/hoist/tap and real recovery dependencies. Unrelated model/tool nodes are inert.
const inert = locationServices.dependencies
  .filter((node) => ![Location.node.name, Relay.node.name, RelayHookRecovery.node.name].includes(node.name))
  .map((node): LayerNode.Replacement => [node, Layer.empty])

function fixture<A, E>(
  body: (input: {
    readonly db: Database.Interface["db"]
    readonly relay: Relay.Interface
    readonly location: Location.Interface
    readonly seed: (index: number, location?: Location.Interface) => Effect.Effect<SessionSchema.ID>
    readonly map: (replacement?: Layer.Layer<RelayHookRecovery.Service>) => Layer.Layer<LocationServiceMap.Service>
    readonly finished: Queue.Queue<RelayHookRecovery.Result>
  }) => Effect.Effect<A, E, Scope.Scope>,
) {
  return Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const directory = AbsolutePath.make(path.join(tmp.path, "project"))
    const location = Location.Service.of({ directory, project: { id: Project.ID.make("startup"), directory } })
    const replacements: LayerNode.Replacements = [
      [Database.node, Database.layerFromPath(path.join(tmp.path, "startup.db"))],
      [Global.node, Global.layerWith({ data: path.join(tmp.path, "data"), home: tmp.path })],
      [Location.node, Layer.succeed(Location.Service, location)],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
    ]
    return yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const relay = yield* Relay.Service
      const events = yield* EventV2.Service
      const finished = yield* Queue.unbounded<RelayHookRecovery.Result>()
      // Observe completion without copying the primitive or starting a worker in a service factory.
      const observed = makeLocationNode({
        service: RelayHookRecovery.Service,
        deps: [Database.node, Relay.node, Location.node],
        layer: Layer.unwrap(
          Effect.gen(function* () {
            const database = yield* Database.Service
            const relay = yield* Relay.Service
            const location = yield* Location.Service
            return LayerNode.compile(RelayHookRecovery.node, [
              [Database.node, Layer.succeed(Database.Service, database)],
              [Relay.node, Layer.succeed(Relay.Service, relay)],
              [Location.node, Layer.succeed(Location.Service, location)],
            ]).pipe(
              Layer.flatMap((context) => {
                const recovery = Context.get(context, RelayHookRecovery.Service)
                return Layer.succeed(RelayHookRecovery.Service, {
                  recover: () => recovery.recover().pipe(Effect.tap((result) => Queue.offer(finished, result))),
                })
              }),
            )
          }),
        ),
      })
      const map = (replacement?: Layer.Layer<RelayHookRecovery.Service>) =>
        buildLocationServiceMap([
          ...inert,
          ...replacements,
          [
            Project.node,
            Layer.succeed(
              Project.Service,
              Project.Service.of({
                resolve: (directory) => Effect.succeed({ id: location.project.id, directory }),
                directories: () => Effect.succeed([]),
                commit: () => Effect.void,
              }),
            ),
          ],
          [RelayHookRecovery.node, replacement ?? observed],
        ])
      const seed = (index: number, placement = location) =>
        Effect.gen(function* () {
          yield* database.db
            .insert(ProjectTable)
            .values({
              id: placement.project.id,
              worktree: placement.directory,
              sandboxes: [],
            })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          const sessionID = SessionSchema.ID.make(`ses_startup_${index}`)
          yield* database.db
            .insert(SessionTable)
            .values({
              id: sessionID,
              project_id: placement.project.id,
              directory: placement.directory,
              workspace_id: placement.workspaceID,
              slug: "startup",
              title: "Startup",
              version: "1",
            })
            .run()
            .pipe(Effect.orDie)
          yield* events.publish(
            RelayHook.Decided,
            Schema.decodeUnknownSync(RelayHook.Decided.data)({
              decisionID: randomUUID(),
              sessionID,
              installID,
              version: "v1",
              sha256: "a".repeat(64),
              nodeID: "act",
              action: "block",
              trigger: "edit.before",
              tool: "edit",
              callID: randomUUID(),
              subject: "src/types.ts",
              outcome: "blocked",
              durationMs: 1,
            }),
          )
          return sessionID
        })
      return yield* body({ db: database.db, relay, location, seed, map, finished })
    }).pipe(
      Effect.provide(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, Relay.node]), replacements)),
    )
  }).pipe(Effect.scoped)
}

describe("Relay hook recovery startup", () => {
  it.live("automatic recovery after Location open ships only owned decisions once without a prompt", () =>
    fixture((h) =>
      Effect.gen(function* () {
        const own = yield* h.seed(0)
        yield* h.seed(1, { ...h.location, directory: AbsolutePath.make(path.join(h.location.directory, "other")) })
        yield* h.seed(2, { ...h.location, project: { ...h.location.project, id: Project.ID.make("other") } })
        yield* h.seed(3, { ...h.location, workspaceID: WorkspaceID.make("wrk_explicit") })
        const before = yield* h.db.select().from(EventTable).all().pipe(Effect.orDie)
        const ledgerPath = path.join(h.relay.paths.hooks, installID, "ledger.jsonl")
        expect(existsSync(ledgerPath)).toBe(false)
        yield* Effect.gen(function* () {
          const locations = yield* LocationServiceMap.Service
          yield* Layer.build(locations.get(h.location))
          expect(yield* Queue.take(h.finished).pipe(Effect.timeout("10 seconds"))).toEqual({
            scope: "implicit-local",
            attemptedSessions: 1,
            errors: 0,
          })
          yield* Layer.build(locations.get(h.location))
          expect(yield* Queue.size(h.finished)).toBe(0)
        }).pipe(Effect.provide(h.map()))
        // A replacement map scope starts another pass, but persisted receipt dedup prevents another append.
        yield* Effect.gen(function* () {
          const locations = yield* LocationServiceMap.Service
          yield* Layer.build(locations.get(h.location))
          expect((yield* Queue.take(h.finished).pipe(Effect.timeout("10 seconds"))).attemptedSessions).toBe(1)
        }).pipe(Effect.provide(h.map()))
        const entries = yield* LedgerRead.entries(ledgerPath)
        expect(entries.map((entry) => Schema.decodeUnknownSync(RelayLedger.HookDecisionLine)(entry))).toMatchObject([
          { session: own, deferred: true },
        ])
        expect(entries).toHaveLength(1)
        const report = yield* LedgerVerify.verify(ledgerPath, Redacted.make(readFileSync(h.relay.paths.key, "utf8")))
        expect(report.exit).toBe(0)
        expect(report.stdout).toContain("[KEYED (HMAC-SHA256)]")
        expect(yield* h.db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual(before)
      }),
    ),
  )

  it.live("bad key does not fail Location acquisition; startup reports an honest failed attempt", () =>
    fixture((h) =>
      Effect.gen(function* () {
        yield* h.seed(0)
        mkdirSync(h.relay.paths.key, { recursive: true })
        yield* Effect.gen(function* () {
          const locations = yield* LocationServiceMap.Service
          const context = yield* Layer.build(locations.get(h.location))
          expect(Context.get(context, Location.Service).directory).toBe(h.location.directory)
          expect(yield* Queue.take(h.finished).pipe(Effect.timeout("10 seconds"))).toEqual({
            scope: "implicit-local",
            attemptedSessions: 1,
            errors: 1,
          })
          expect(existsSync(path.join(h.relay.paths.hooks, installID, "ledger.jsonl"))).toBe(false)
        }).pipe(Effect.provide(h.map()))
      }),
    ),
  )

  it.live("empty project and reserved explicit workspace do not initialize Relay disk", () =>
    fixture((h) =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const locations = yield* LocationServiceMap.Service
          yield* Layer.build(locations.get(h.location))
          expect(yield* Queue.take(h.finished).pipe(Effect.timeout("10 seconds"))).toEqual({
            scope: "implicit-local",
            attemptedSessions: 0,
            errors: 0,
          })
          expect(existsSync(h.relay.paths.root)).toBe(false)
          expect(existsSync(h.relay.paths.key)).toBe(false)
          // Destroy the selection table: explicit placement must still finish with no DB query.
          yield* h.db.run("DROP TABLE session").pipe(Effect.orDie)
          yield* Layer.build(locations.get({ ...h.location, workspaceID: WorkspaceID.make("wrk_explicit") }))
          expect(yield* Queue.take(h.finished).pipe(Effect.timeout("10 seconds"))).toEqual({
            scope: "unsupported-workspace",
            attemptedSessions: 0,
            errors: 0,
          })
          expect(existsSync(h.relay.paths.root)).toBe(false)
        }).pipe(Effect.provide(h.map()))
      }),
    ),
  )

  it.live("acquisition never awaits the pass and closing the map scope interrupts its worker", () =>
    fixture((h) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const interrupted = yield* Deferred.make<void>()
        const replacement = Layer.succeed(RelayHookRecovery.Service, {
          recover: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            ),
        })
        const scope = yield* Scope.make()
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
        const context = yield* Layer.buildWithScope(h.map(replacement), scope)
        const locations = Context.get(context, LocationServiceMap.Service)
        yield* Layer.buildWithScope(locations.get(h.location), scope).pipe(Effect.timeout("10 seconds"))
        yield* Deferred.await(started).pipe(Effect.timeout("10 seconds"))
        expect(yield* Deferred.isDone(interrupted)).toBe(false)
        yield* Scope.close(scope, Exit.void)
        expect(yield* Deferred.isDone(interrupted)).toBe(true)
      }),
    ),
  )
})
