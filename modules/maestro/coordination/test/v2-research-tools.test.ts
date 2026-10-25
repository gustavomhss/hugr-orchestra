import { expect, test } from "bun:test"
import path from "node:path"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Schema, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
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

// Settled as the runner settles a provider tool call: its tool part is persisted on the assistant first, and the call
// runs under the invocation frame the runner issues for it.
const settle = (sessionID: SessionSchema.ID, name: string, input: Record<string, unknown>, callID = `call_${name}`) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    const location = yield* Location.Service
    const tools = yield* registry.materialize(allow)
    const agentID = AgentV2.ID.make("jimmy")
    const assistantMessageID = SessionMessage.ID.make("msg_research")
    yield* called(sessionID, assistantMessageID, { id: callID, name, input })
    return (yield* CapabilityInvocation.withContext(
      {
        issuer: "core",
        owner: {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
          sessionID,
          agentID,
        },
        invocation: { sessionID, agentID, assistantMessageID, callID },
        rootToolName: name,
        effectiveRules: allow,
        nativeDenyFloor: [],
      },
      tools.settle({ sessionID, agent: agentID, assistantMessageID, call: { type: "tool-call", id: callID, name, input } }),
    ).pipe(Effect.orDie)).result
  })

/** Appends a running tool part for the call to the research assistant message, once per call id; the message moves to
 * the calling Session when another Session last used it. */
const called = (
  sessionID: SessionSchema.ID,
  assistantMessageID: SessionMessage.ID,
  call: { readonly id: string; readonly name: string; readonly input: Record<string, unknown> },
) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const time = DateTime.makeUnsafe(1_700_000_000_000)
    const row = yield* database.db
      .select()
      .from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, assistantMessageID))
      .get()
      .pipe(Effect.orDie)
    const existing = row?.session_id === sessionID
      ? Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
      : undefined
    const content = existing?.type === "assistant" ? existing.content : []
    if (content.some((part) => part.type === "tool" && part.id === call.id)) return
    const message = Schema.encodeSync(SessionMessage.Message)(
      SessionMessage.Assistant.make({
        id: assistantMessageID,
        type: "assistant",
        agent: "jimmy",
        model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
        content: [
          ...content,
          {
            type: "tool",
            id: call.id,
            name: call.name,
            state: { status: "running", input: call.input, content: [], structured: {} },
            time: { created: time },
          },
        ],
        time: { created: time },
      }),
    )
    const data = Object.fromEntries(Object.entries(message).filter(([key]) => key !== "id" && key !== "type"))
    yield* database.db
      .insert(SessionMessageTable)
      .values({
        id: assistantMessageID,
        session_id: sessionID,
        type: message.type,
        // Above the rows a test inserts itself.
        seq: 1_000_000,
        time_created: DateTime.toEpochMillis(time),
        data,
      })
      .onConflictDoUpdate({ target: SessionMessageTable.id, set: { session_id: sessionID, data } })
      .run()
      .pipe(Effect.orDie)
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

test("a URL capture retains the received bytes and the requested representation derived from them, each charged under its call", () =>
  run((directory) =>
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            port: 0,
            fetch: () => new Response("<html><body><h1>Title</h1><p>body text</p></body></html>", { headers: { "content-type": "text/html" } }),
          }),
        ),
        (served) => Effect.promise(() => served.stop(true)),
      )
      const bound = yield* dispatch(directory)
      const url = `http://127.0.0.1:${server.port}/page`
      const captured = String((yield* settle(bound.info.id, "research_capture", { kind: "url", url, format: "markdown" }, "call_url")).value)
      const receipt = JSON.parse(captured.split("\n\n")[0])
      expect(receipt).toMatchObject({ origin: { kind: "url", uri: url }, ref: { representation: "markdown" }, transformation: "webfetch-markdown-v1" })
      expect(receipt.derivedFrom.representation).toBe("received")
      expect(captured).toContain("# Title")
      expect((yield* charged(bound.allowance, "bytes")).map((charge) => charge.operation)).toEqual([
        "bytes:msg_research:call_url:received",
        "bytes:msg_research:call_url:markdown",
      ])
    }),
  ))

test("a history capture projects Git log and working-tree status of the bound worktree from the received Git output", () =>
  run((directory) =>
    Effect.gen(function* () {
      const git = yield* GitCli.Service
      const exec = { cwd: directory, env: MaestroResearchTools.environment(), extendEnv: false }
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "alpha\n"))
      yield* git.run(["init", "--quiet"], exec)
      yield* git.run(["add", "notes.txt"], exec)
      yield* git.run(["-c", "user.name=Research", "-c", "user.email=research@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "first"], exec)
      const head = (yield* git.run(["rev-parse", "HEAD"], exec)).text().trim()
      const bound = yield* dispatch(directory)
      const log = String((yield* settle(bound.info.id, "research_capture", { kind: "history", operation: "log", path: "notes.txt" }, "call_log")).value)
      const receipt = JSON.parse(log.split("\n\n")[0])
      expect(receipt).toMatchObject({ origin: { kind: "tool-output" }, ref: { representation: "structured-json" }, transformation: "native-git-history-v1" })
      expect(JSON.parse(log.split("\n\n")[1])).toMatchObject({ operation: "log", path: "notes.txt", revision: head, commits: [head] })
      yield* Effect.promise(() => Bun.write(path.join(directory, "notes.txt"), "beta\n"))
      const status = String((yield* settle(bound.info.id, "research_capture", { kind: "history", operation: "status" }, "call_status")).value)
      expect(JSON.parse(status.split("\n\n")[1])).toMatchObject({ operation: "status", head, dirty: [{ path: "notes.txt", status: ".M" }] })
    }),
  ))
