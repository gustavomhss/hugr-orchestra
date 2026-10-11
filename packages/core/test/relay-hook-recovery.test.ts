import { describe, expect } from "bun:test"
import path from "path"
import { randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { eq } from "drizzle-orm"
import { Effect, Layer, Redacted, Schema } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { RelayLedger } from "@orchestra/schema/relay-ledger"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { LedgerVerify } from "@orchestra/relay/ledger/verify"
import { Config } from "../src/config"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { EventTable } from "../src/event/sql"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { Relay } from "../src/relay"
import { RelayHookRecovery } from "../src/relay-hook-recovery"
import { RelayHookShipper } from "../src/relay-hook-shipper"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { SessionTable } from "../src/session/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const installID = "h-0000000000000001"
function harness<A, E>(
  body: (input: {
    readonly db: Database.Interface["db"]
    readonly relay: Relay.Interface
    readonly recovery: RelayHookRecovery.Interface
    readonly locations: readonly [Location.Interface, Location.Interface, Location.Interface]
    readonly at: (location: Location.Interface, before?: Effect.Effect<void>) => Effect.Effect<RelayHookRecovery.Result>
    readonly session: (index: number, location?: Location.Interface) => Effect.Effect<SessionSchema.ID>
    readonly decide: (sessionID: SessionSchema.ID, decisionID?: string) => Effect.Effect<RelayHook.Decided["data"]>
    readonly ledger: () => Effect.Effect<ReadonlyArray<RelayLedger.HookDecision>, unknown>
    readonly durable: () => Effect.Effect<ReadonlyArray<typeof EventTable.$inferSelect>>
    readonly verify: () => Effect.Effect<void, unknown>
  }) => Effect.Effect<A, E>,
) {
  return Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const placement = (dir: string, projectID: string) => {
      const directory = AbsolutePath.make(path.join(tmp.path, dir))
      return Location.Service.of({
        directory,
        project: { id: Project.ID.make(projectID), directory },
      })
    }
    const locations = [placement("one", "recovery"), placement("two", "recovery"), placement("one", "other")] as const
    const current = locations[0]
    const build = (location: Location.Interface) =>
      AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, Relay.node, RelayHookRecovery.node]), [
        [Database.node, Database.layerFromPath(path.join(tmp.path, "recovery.db"))],
        [Global.node, Global.layerWith({ data: path.join(tmp.path, "data"), home: tmp.path })],
        [Location.node, Layer.succeed(Location.Service, location)],
        [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      ])
    return yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      const relay = yield* Relay.Service
      const recovery = yield* RelayHookRecovery.Service
      const events = yield* EventV2.Service
      const session = (index: number, location = current) =>
        Effect.gen(function* () {
          yield* db
            .insert(ProjectTable)
            .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          const id = SessionSchema.ID.make(`ses_recovery_${index.toString().padStart(4, "0")}`)
          yield* db
            .insert(SessionTable)
            .values({
              id,
              project_id: location.project.id,
              directory: location.directory,
              workspace_id: location.workspaceID,
              slug: "recovery",
              title: "Recovery",
              version: "1",
            })
            .run()
            .pipe(Effect.orDie)
          return id
        })
      const decide = (sessionID: SessionSchema.ID, decisionID: string = randomUUID()) =>
        Effect.gen(function* () {
          const data = Schema.decodeUnknownSync(RelayHook.Decided.data)({
            decisionID,
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
          })
          yield* events.publish(RelayHook.Decided, data)
          return data
        })
      const ledger = () =>
        LedgerRead.entries(path.join(relay.paths.hooks, installID, "ledger.jsonl")).pipe(
          Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
          Effect.map((entries) =>
            entries.map((entry) => Schema.decodeUnknownSync(RelayLedger.HookDecisionLine)(entry)),
          ),
        )
      const at = (location: Location.Interface, before = Effect.void) =>
        Effect.gen(function* () {
          const acquired = yield* RelayHookRecovery.Service
          yield* before
          return yield* acquired.recover()
        }).pipe(Effect.provide(Layer.fresh(build(location))))
      return yield* body({
        db,
        relay,
        recovery,
        locations,
        at,
        session,
        decide,
        ledger,
        durable: () => db.select().from(EventTable).all().pipe(Effect.orDie),
        verify: () =>
          Effect.gen(function* () {
            const report = yield* LedgerVerify.verify(
              path.join(relay.paths.hooks, installID, "ledger.jsonl"),
              Redacted.make(readFileSync(relay.paths.key, "utf8")),
            )
            expect(report.exit).toBe(0)
            expect(report.stdout).toContain("[KEYED (HMAC-SHA256)]")
          }),
      })
    }).pipe(Effect.provide(build(current)))
  }).pipe(Effect.scoped)
}

describe("Relay hook Location recovery", () => {
  it.live("exact project/directory/null-workspace ownership excludes other Locations and orphans", () =>
    harness((h) =>
      Effect.gen(function* () {
        const own = yield* h.decide(yield* h.session(0))
        yield* h.decide(own.sessionID) // DISTINCT Session IDs despite multiple decisions.
        yield* h.decide(yield* h.session(1, h.locations[1]))
        yield* h.decide(yield* h.session(2, h.locations[2]))
        yield* h.decide(yield* h.session(3, { ...h.locations[0], workspaceID: WorkspaceID.make("wrk_explicit") }))
        const deleted = yield* h.session(4)
        yield* h.decide(deleted)
        yield* h.db.delete(SessionTable).where(eq(SessionTable.id, deleted)).run().pipe(Effect.orDie)
        yield* h.decide(SessionSchema.ID.make("ses_orphan"))
        const durable = yield* h.durable()
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 1, errors: 0 })
        expect((yield* h.ledger()).map((line) => [line.session, line.deferred])).toEqual(
          Array.from({ length: 2 }, () => [own.sessionID, true]),
        )
        // Fresh service acquisition retains disk idempotency, with no installed hook or execution service.
        expect((yield* h.at(h.locations[0])).attemptedSessions).toBe(1)
        expect(yield* h.ledger()).toHaveLength(2)
        yield* h.verify()
        expect((yield* h.at(h.locations[1])).attemptedSessions).toBe(1)
        expect((yield* h.ledger()).map((line) => line.session)).toEqual([
          own.sessionID,
          own.sessionID,
          "ses_recovery_0001",
        ])
        expect((yield* h.at(h.locations[2])).attemptedSessions).toBe(1)
        expect(yield* h.durable()).toEqual(durable)
      }),
    ),
  )

  it.live("cursor pages beyond 64 Sessions in stable Session-ID order", () =>
    harness((h) =>
      Effect.gen(function* () {
        const ids = yield* Effect.forEach(
          Array.from({ length: 67 }, (_, index) => 66 - index),
          (index) =>
            Effect.gen(function* () {
              const id = yield* h.session(index)
              yield* h.decide(id)
              return id
            }),
        )
        const durable = yield* h.durable()
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 67, errors: 0 })
        expect((yield* h.ledger()).map((line) => line.session)).toEqual(ids.toSorted())
        expect((yield* h.ledger()).every((line) => line.deferred)).toBe(true)
        expect(yield* h.durable()).toEqual(durable)
        yield* h.verify()
      }),
    ),
  )

  it.live("concurrent live/recovery shipment preserves inFlight and receipt dedup", () =>
    harness((h) =>
      Effect.gen(function* () {
        const sessionID = yield* h.session(0)
        const missed = yield* h.decide(sessionID)
        const current = randomUUID()
        yield* RelayHookShipper.track(
          current,
          Effect.gen(function* () {
            yield* h.decide(sessionID, current)
            yield* Effect.all([h.recovery.recover(), h.at(h.locations[0])], { concurrency: "unbounded" })
            expect((yield* h.ledger()).map((line) => line.decision)).toEqual([missed.decisionID])
            yield* Effect.all(
              [RelayHookShipper.ship({ relay: h.relay, db: h.db, sessionID, current }), h.recovery.recover()],
              { concurrency: "unbounded" },
            )
          }),
        )
        yield* h.recovery.recover()
        expect((yield* h.ledger()).map((line) => [line.decision, line.deferred])).toEqual([
          [missed.decisionID, true],
          [current, undefined],
        ])
        yield* h.verify()
      }),
    ),
  )

  it.live("key write and ledger failures remain best-effort attempts, retry writes real receipts", () =>
    harness((h) =>
      Effect.gen(function* () {
        yield* h.decide(yield* h.session(0))
        yield* h.decide(yield* h.session(1))
        const durable = yield* h.durable()
        // A real directory at the key path refuses key creation on both platforms.
        mkdirSync(h.relay.paths.key, { recursive: true })
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 2, errors: 2 })
        expect(yield* h.ledger()).toEqual([])
        rmSync(h.relay.paths.key, { recursive: true })
        // A non-directory hook root prevents real receipt writes after key acquisition.
        writeFileSync(h.relay.paths.hooks, "blocked")
        expect((yield* h.recovery.recover()).attemptedSessions).toBe(2)
        expect(existsSync(path.join(h.relay.paths.hooks, installID, "ledger.jsonl"))).toBe(false)
        rmSync(h.relay.paths.hooks)
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 2, errors: 0 })
        expect(yield* h.ledger()).toHaveLength(2)
        expect(yield* h.durable()).toEqual(durable)
        yield* h.verify()
      }),
    ),
  )

  it.live("empty selection and invalid decoded rows never initialize Relay disk", () =>
    harness((h) =>
      Effect.gen(function* () {
        yield* h.session(0)
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 0, errors: 0 })
        expect(existsSync(h.relay.paths.root)).toBe(false)
        const invalid = yield* h.decide(yield* h.session(1))
        yield* h.db
          .update(EventTable)
          .set({ data: { invalid: true } })
          .where(eq(EventTable.aggregate_id, invalid.sessionID))
          .run()
          .pipe(Effect.orDie)
        // Unversioned names are not durable V1 decisions eligible for this pass.
        const unversioned = yield* h.decide(yield* h.session(2))
        yield* h.db
          .update(EventTable)
          .set({ type: RelayHook.Decided.type })
          .where(eq(EventTable.aggregate_id, unversioned.sessionID))
          .run()
          .pipe(Effect.orDie)
        const durable = yield* h.durable()
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 1, errors: 0 })
        expect(existsSync(h.relay.paths.root)).toBe(false)
        expect(yield* h.durable()).toEqual(durable)
      }),
    ),
  )

  it.live("explicit workspace returns unsupported scope without DB or filesystem work", () =>
    harness((h) =>
      Effect.gen(function* () {
        const explicit = { ...h.locations[0], workspaceID: WorkspaceID.make("wrk_explicit") }
        yield* h.decide(yield* h.session(0, explicit))
        yield* h.decide(yield* h.session(1))
        const durable = yield* h.durable()
        expect(yield* h.at(explicit)).toEqual({ scope: "unsupported-workspace", attemptedSessions: 0, errors: 0 })
        expect(existsSync(h.relay.paths.root)).toBe(false)
        expect(yield* h.durable()).toEqual(durable)
        // Destroy selection table: explicit scope still succeeds without querying it.
        expect(yield* h.at(explicit, h.db.run("DROP TABLE session").pipe(Effect.orDie, Effect.asVoid))).toEqual({
          scope: "unsupported-workspace",
          attemptedSessions: 0,
          errors: 0,
        })
        expect(yield* h.recovery.recover()).toEqual({ scope: "implicit-local", attemptedSessions: 0, errors: 1 })
      }),
    ),
  )
})
