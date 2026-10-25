import { expect, test } from "bun:test"
import path from "node:path"
import { DateTime, Effect, Schema, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ResearchDispatchV2 } from "../src/v2/governance/research"
import { MaestroResearchTools } from "../src/v2/tools/research"
import { child, toolsLayer, worktree } from "./fixture/v2-governance"

// The research seat's tools as the runner settles them: under a bound dispatch whose first provider turn has run.

const run = <A, E, R>(body: (directory: string) => Effect.Effect<A, E, R | Scope.Scope>, entries: Config.Entry[] = []) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(toolsLayer(directory, entries)))
      }),
    ),
  )

const allow = [{ action: "*", resource: "*", effect: "allow" as const }]

/** A bound research child whose first provider turn has bound its logical task, and its dispatch allowance. */
const dispatch = (directory: string) =>
  Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) => draft.update(AgentV2.ID.make("jimmy"), (agent) => { agent.permissions = allow }))
    const info = yield* child(directory)
    const governance = yield* TaskGovernance.Service
    yield* governance.beforeTurn(info)
    const database = yield* Database.Service
    const admitted = yield* ResearchDispatchV2.allowance({
      db: database.db,
      events: yield* EventV2.Service,
      store: yield* SessionStore.Service,
      canonical: (id) => id,
      allowances: yield* ResearchAllowance.Service,
      location: yield* Location.Service,
    }, info)
    if (!admitted) return yield* Effect.die("fixture dispatch unbound")
    return { info, allowance: admitted.allowance }
  })

const settle = (sessionID: SessionSchema.ID, name: string, input: unknown, callID = `call_${name}`) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    const tools = yield* registry.materialize(allow)
    return (yield* tools.settle({
      sessionID,
      agent: AgentV2.ID.make("jimmy"),
      assistantMessageID: SessionMessage.ID.make("msg_research"),
      call: { type: "tool-call", id: callID, name, input },
    })).result
  })

const charged = (allowance: Parameters<typeof ResearchLedger.dispatch>[0], kind: string) =>
  ResearchLedger.dispatch(allowance).pipe(
    Effect.map((steps) =>
      steps.flatMap((step) =>
        step.type === "research.allowance.charged" && step.data.kind === kind
          ? [{ operation: step.data.operation, amount: step.data.amount }]
          : [],
      ),
    ),
  )

test("config research.limits lowers the toolkit caps the index runs under and never raises them", () =>
  run(
    () =>
      Effect.gen(function* () {
        const caps = yield* MaestroResearchTools.caps(yield* Config.Service)
        expect(caps.indexerBytes).toBe(1024)
        expect(caps.indexBytes).toBe(ResearchToolkit.Limits.indexBytes)
        expect(caps.probeBytes).toBe(ResearchToolkit.Limits.probeBytes)
      }),
    [
      Schema.decodeUnknownSync(Config.Document)({
        type: "document",
        info: { research: { limits: { indexer_bytes: 1024, index_bytes: ResearchToolkit.Limits.indexBytes * 2 } } },
      }),
    ],
  ))

test("the research seat's turns carry its inquiry snapshot and every other agent's turns do not", () =>
  run((directory) =>
    Effect.gen(function* () {
      const bound = yield* dispatch(directory)
      const registry = yield* SystemContextRegistry.Service
      const baseline = (agent: string) =>
        Effect.gen(function* () {
          return (yield* SystemContext.initialize(yield* registry.load({ sessionID: bound.info.id, agent }))).baseline ?? ""
        })
      const seat = yield* baseline("jimmy")
      expect(seat).toContain(`<inquiry state="none">`)
      expect(seat).toContain(`probe 0/${bound.allowance.probeSecondsLimit}s`)
      expect(yield* baseline("maestro")).not.toContain("<inquiry")
    }),
  ))

test("probe_run refuses once the dispatch's probe seconds are spent", () =>
  run((directory) =>
    Effect.gen(function* () {
      const bound = yield* dispatch(directory)
      const allowances = yield* ResearchAllowance.Service
      const limit = bound.allowance.probeSecondsLimit
      yield* allowances.charge(bound.allowance, "probe", "probe:msg_earlier:call_earlier", limit)
      expect(
        yield* settle(bound.info.id, "probe_run", {
          snapshot: { kind: "worktree" },
          runner: { kind: "typecheck", project: "tsconfig.json" },
        }),
      ).toEqual({
        type: "error",
        value: `Research denied: budget_exhausted: Research probe allowance exhausted (${limit}/${limit} seconds); retained work remains available`,
      })
    }),
  ))

test("a file capture reserves its captured bytes under its own call, and a spent byte allowance captures nothing", () =>
  run((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "alpha\nbeta\n"))
      const bound = yield* dispatch(directory)
      expect((yield* settle(bound.info.id, "research_capture", { kind: "file", path: "notes.txt" }, "call_capture")).type).toBe("text")
      expect(yield* charged(bound.allowance, "bytes")).toEqual([{ operation: "bytes:msg_research:call_capture:text", amount: 11 }])
      const spent = yield* dispatch(directory)
      const allowances = yield* ResearchAllowance.Service
      yield* allowances.reserveBytes(spent.allowance, "bytes:msg_earlier:call_earlier:text", spent.allowance.byteLimit)
      const refused = yield* settle(spent.info.id, "research_capture", { kind: "file", path: "notes.txt" })
      expect(refused.type).toBe("error")
      expect(String(refused.value)).toStartWith("Research denied: budget_exhausted:")
    }),
  ))

test("research_view returns a source page still in context as its ref, and a pruned one in full", () =>
  run((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "alpha\nbeta\n"))
      const bound = yield* dispatch(directory)
      const captured = yield* settle(bound.info.id, "research_capture", { kind: "file", path: "notes.txt" })
      const input = { action: "source", ref: JSON.parse(String(captured.value).split("\n\n")[0]).ref }
      const database = yield* Database.Service
      const time = DateTime.makeUnsafe(1_700_000_000_000)
      const shown = (seq: number, pruned: boolean) =>
        Effect.gen(function* () {
          const message = Schema.encodeSync(SessionMessage.Message)(
            SessionMessage.Assistant.make({
              id: SessionMessage.ID.make(`msg_shown_${seq}`),
              type: "assistant",
              agent: "jimmy",
              model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
              content: [
                {
                  type: "tool",
                  id: `call_shown_${seq}`,
                  name: "research_view",
                  state: { status: "completed", input, content: [], structured: {} },
                  time: pruned ? { created: time, pruned: time } : { created: time },
                },
              ],
              time: { created: time },
            }),
          )
          yield* database.db
            .insert(SessionMessageTable)
            .values({
              id: SessionMessage.ID.make(message.id),
              session_id: bound.info.id,
              type: message.type,
              seq,
              time_created: DateTime.toEpochMillis(time),
              data: Object.fromEntries(Object.entries(message).filter(([key]) => key !== "id" && key !== "type")),
            })
            .run()
            .pipe(Effect.orDie)
        })
      yield* shown(1, true)
      const full = yield* settle(bound.info.id, "research_view", input, "call_view_1")
      expect(String(full.value)).toContain("alpha")
      expect(String(full.value)).not.toContain(`"unchanged":true`)
      yield* shown(2, false)
      const again = JSON.parse(String((yield* settle(bound.info.id, "research_view", input, "call_view_2")).value))
      expect(again).toMatchObject({ ref: input.ref, unchanged: true })
    }),
  ))

test("a retained tool's output is captured as its returned representation and settles one attempt receipt", () =>
  run((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "alpha\nbeta\n"))
      const bound = yield* dispatch(directory)
      const read = String((yield* settle(bound.info.id, "read", { path: "notes.txt" }, "call_read")).value)
      expect(read).toContain("alpha")
      expect(read).toContain("Retained output evidence: ")
      expect(read).toContain("This is the native tool's returned representation")
      const records = yield* ResearchRecords.Service
      const attempts = yield* records.view(bound.allowance.binding, { action: "attempts" })
      expect("attempts" in attempts ? attempts.attempts : []).toMatchObject([
        { outcome: "captured", stage: "representation", reason: "complete", returned: true },
      ])
    }),
  ))

test("a retried acquisition replays its retained source instead of reacquiring it", () =>
  run((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "alpha\nbeta\n"))
      const bound = yield* dispatch(directory)
      const input = { kind: "file", path: "notes.txt" }
      expect(String((yield* settle(bound.info.id, "research_capture", input, "call_retry")).value)).not.toContain("no live source")
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "gamma\n"))
      const replay = String((yield* settle(bound.info.id, "research_capture", input, "call_retry")).value)
      expect(replay).toContain("alpha\nbeta\n")
      expect(replay).toContain("Historical retained representation; no live source was reacquired.")
      expect(replay).not.toContain("gamma")
    }),
  ))
