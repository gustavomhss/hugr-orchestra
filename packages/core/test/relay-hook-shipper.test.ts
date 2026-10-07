import { describe, expect } from "bun:test"
import path from "path"
import { randomUUID } from "crypto"
import { mkdirSync, readFileSync } from "fs"
import { Effect, Layer, Redacted, Schema } from "effect"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { LedgerRead } from "@opencode-ai/relay/ledger/read"
import { LedgerVerify } from "@opencode-ai/relay/ledger/verify"
import { Config } from "../src/config"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { Project } from "../src/project"
import { Relay } from "../src/relay"
import { RelayHookShipper } from "../src/relay-hook-shipper"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// WP13: hook receipts. Durable `relay.hook.decided` events, the real Relay service and real ledgers: each decision
// becomes one `hook-decision` line, once, and a decision that missed its own receipt ships late as `deferred`.
const it = testEffect(Layer.empty)
const projectID = "shipper-project"
const sha256 = "a".repeat(64)

const fixture = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(
  Effect.map((tmp) => {
    const dirs = {
      data: path.join(tmp.path, "data"),
      home: path.join(tmp.path, "home"),
      work: path.join(tmp.path, "work"),
    }
    Object.values(dirs).forEach((dir) => mkdirSync(dir))
    return dirs
  }),
)

function harness<A, E>(
  body: (input: {
    readonly relay: Relay.Interface
    readonly db: Database.Interface["db"]
    readonly sessionID: SessionSchema.ID
    // A tool call's decision, or with `session` a Session event's, which has no tool or call ID.
    readonly decide: (
      fields?: Partial<RelayHook.Decided["data"]>,
      session?: boolean,
    ) => Effect.Effect<RelayHook.Decided["data"]>
    readonly ledger: (installID: string) => Effect.Effect<ReadonlyArray<RelayLedger.HookDecision>, unknown>
  }) => Effect.Effect<A, E>,
) {
  return Effect.gen(function* () {
    const dirs = yield* fixture
    const directory = AbsolutePath.make(dirs.work)
    const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, FSUtil.node, Relay.node]), [
      [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of({ directory, project: { id: Project.ID.make(projectID), directory } }),
        ),
      ],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
    ])
    return yield* Effect.gen(function* () {
      const relay = yield* Relay.Service
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const sessionID = SessionSchema.ID.make(`ses_shipper_${randomUUID().replaceAll("-", "")}`)
      const decide = (fields: Partial<RelayHook.Decided["data"]> = {}, session = false) =>
        Effect.gen(function* () {
          const data = Schema.decodeUnknownSync(RelayHook.Decided.data)({
            decisionID: randomUUID(),
            installID: "h-0000000000000001",
            version: "v1",
            sha256,
            nodeID: "act",
            action: "block",
            trigger: "edit.before",
            ...(session ? {} : { tool: "edit", callID: `call-${randomUUID()}` }),
            sessionID,
            subject: "src/generated/types.ts",
            outcome: "blocked",
            durationMs: 3,
            ...fields,
          })
          yield* events.publish(RelayHook.Decided, data)
          return data
        })
      const ledger = (installID: string) =>
        LedgerRead.entries(path.join(relay.paths.hooks, installID, "ledger.jsonl")).pipe(
          Effect.map((entries) =>
            entries.map((entry) => Schema.decodeUnknownSync(RelayLedger.HookDecisionLine)(entry)),
          ),
        )
      return yield* body({ relay, db, sessionID, decide, ledger })
    }).pipe(Effect.provide(layer))
  }).pipe(Effect.scoped)
}

const verified = (relay: Relay.Interface, installID: string) =>
  LedgerVerify.verify(
    path.join(relay.paths.hooks, installID, "ledger.jsonl"),
    Redacted.make(readFileSync(relay.paths.key, "utf8")),
  )

describe("Relay hook receipts", () => {
  it.live("a decision ships once, on time; one that missed its receipt ships late; the ledger verifies", () =>
    harness(({ relay, db, sessionID, decide, ledger }) =>
      Effect.gen(function* () {
        // Relay was unavailable when the first decision was made, so nothing shipped then.
        const missed = yield* decide()
        const session = yield* decide(
          { action: "record", trigger: "prompt.before", subject: "b".repeat(64), outcome: "recorded" },
          true,
        )
        yield* RelayHookShipper.ship({ relay, db, sessionID, current: session.decisionID })
        const lines = yield* ledger("h-0000000000000001")
        expect(lines.map((line) => [line.decision, line.deferred])).toEqual([
          [missed.decisionID, true],
          [session.decisionID, undefined],
        ])
        expect(lines[0]).toMatchObject({
          event: "hook-decision",
          install: "h-0000000000000001",
          version: "v1",
          node: "act",
          action: "block",
          trigger: "edit.before",
          tool: "edit",
          session: sessionID,
          call: missed.callID,
          subject: "src/generated/types.ts",
          outcome: "blocked",
        })
        // A Session event has no tool call.
        expect(lines[1]).toMatchObject({ trigger: "prompt.before", tool: null, call: null, subject: "b".repeat(64) })

        // Idempotent by decision ID, whoever ships again.
        yield* RelayHookShipper.ship({ relay, db, sessionID, current: session.decisionID })
        yield* RelayHookShipper.ship({ relay, db, sessionID })
        expect((yield* ledger("h-0000000000000001")).length).toBe(2)

        const verdict = yield* verified(relay, "h-0000000000000001")
        expect(verdict.exit).toBe(0)
        expect(verdict.stdout).toContain("LEDGER INTACT — 2 chained entries [KEYED (HMAC-SHA256)]")
      }),
    ),
  )

  it.live("a decision on its way to its own receipt is not shipped late by another call", () =>
    harness(({ relay, db, sessionID, decide, ledger }) =>
      Effect.gen(function* () {
        const own = randomUUID()
        const other = yield* RelayHookShipper.track(
          own,
          Effect.gen(function* () {
            yield* decide({ decisionID: own })
            // A parallel call's decision ships while this one is still being published.
            const other = yield* decide()
            yield* RelayHookShipper.ship({ relay, db, sessionID, current: other.decisionID })
            expect((yield* ledger("h-0000000000000001")).map((line) => line.decision)).toEqual([other.decisionID])
            yield* RelayHookShipper.ship({ relay, db, sessionID, current: own })
            return other
          }),
        )
        expect((yield* ledger("h-0000000000000001")).map((line) => [line.decision, line.deferred])).toEqual([
          [other.decisionID, undefined],
          [own, undefined],
        ])
      }),
    ),
  )

  it.live("each install keeps its own ledger, and only decisions up to the current one ship", () =>
    harness(({ relay, db, sessionID, decide, ledger }) =>
      Effect.gen(function* () {
        const first = yield* decide({ installID: "h-0000000000000002" })
        const current = yield* decide({ installID: "h-0000000000000003" })
        const later = yield* decide({ installID: "h-0000000000000003" })
        yield* RelayHookShipper.ship({ relay, db, sessionID, current: current.decisionID })
        expect((yield* ledger("h-0000000000000002")).map((line) => [line.decision, line.deferred])).toEqual([
          [first.decisionID, true],
        ])
        expect((yield* ledger("h-0000000000000003")).map((line) => [line.decision, line.deferred])).toEqual([
          [current.decisionID, undefined],
        ])
        yield* RelayHookShipper.ship({ relay, db, sessionID, current: later.decisionID })
        expect((yield* ledger("h-0000000000000003")).map((line) => line.decision)).toEqual([
          current.decisionID,
          later.decisionID,
        ])
        expect((yield* verified(relay, "h-0000000000000002")).exit).toBe(0)
        expect((yield* verified(relay, "h-0000000000000003")).exit).toBe(0)
      }),
    ),
  )
})
