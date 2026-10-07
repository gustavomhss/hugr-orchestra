import { describe, expect } from "bun:test"
import path from "path"
import { createHash, randomUUID } from "crypto"
import { mkdirSync, readFileSync } from "fs"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Exit, Layer, Redacted, Schema, Stream } from "effect"
import { LLMClient, LLMEvent, Model, type LLMClientShape } from "@opencode-ai/llm"
import { OpenAIChat } from "@opencode-ai/llm/protocols/openai-chat"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { LedgerRead } from "@opencode-ai/relay/ledger/read"
import { LedgerVerify } from "@opencode-ai/relay/ledger/verify"
import { Config } from "../src/config"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNodePlatform } from "../src/effect/app-node-platform"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { EventTable } from "../src/event/sql"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { PermissionV2 } from "../src/permission"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { ReferenceGuidance } from "../src/reference/guidance"
import { Relay } from "../src/relay"
import { RelayHookInstall } from "../src/relay-hook-install"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionExecution } from "../src/session/execution"
import { SessionInput } from "../src/session/input"
import { SessionProjector } from "../src/session/projector"
import { SessionMessage } from "../src/session/message"
import { SessionRunner } from "../src/session/runner"
import { node } from "../src/session/runner/llm"
import { SessionRunnerModel } from "../src/session/runner/model"
import { SessionSchema } from "../src/session/schema"
import { SessionTable } from "../src/session/sql"
import { SessionStore } from "../src/session/store"
import { SkillGuidance } from "../src/skill/guidance"
import { Snapshot } from "../src/snapshot"
import { SystemContext } from "../src/system-context"
import { SystemContextRegistry } from "../src/system-context/registry"
import { MaestroArsenal } from "../src/tool/maestro-arsenal"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyProfile } from "../src/tool-safety-profile"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { PermissionFixture } from "./permission-fixture"

// WP13: installed hooks on Session events, through the same ToolSafety and Relay path as tool calls. `session-start`
// once V2Session.create stores a new Session, `prompt` before V2Session.prompt admits, `session-idle` once
// SessionRunner.run's drain settles. Real hooks.json, profile loader, Locations, durable events, Relay and ledgers; the
// native approval host stands in for the permission card.
const it = testEffect(Layer.empty)
// A work directory outside any repository belongs to the global project.
const projectID = Project.ID.global

interface Dirs {
  readonly data: string
  readonly home: string
  readonly work: string
}

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
    mkdirSync(MaestroArsenal.stateDirectory(dirs.data, projectID), { recursive: true })
    return dirs
  }),
)

function step(id: string, type: RelayHook.NodeType, parameters: Record<string, unknown>) {
  return { id, name: `Step ${id}`, type, position: [0, 0], parameters }
}

// A hook on `event` (`<operation>.<timing>`) whose actions follow the trigger as a chain.
function hook(name: string, event: string, nodes: ReadonlyArray<ReturnType<typeof step>>) {
  const [operation, timing] = event.split(".")
  return {
    schema: "relay.hook.v1",
    name,
    nodes: [step("event", RelayHook.NodeType.trigger, { operation, timing }), ...nodes],
    connections: nodes.map((item, index) => ({
      from: index === 0 ? "event" : nodes[index - 1]!.id,
      port: 0,
      to: item.id,
    })),
    binding: "host-required",
    installed: false,
  }
}

// Through the install writer, the only writer of hooks.json. ASCII fixtures compact to JSON.stringify's bytes.
function install(dirs: Dirs, snapshot: { readonly name: string }) {
  return RelayHookInstall.install({
    data: dirs.data,
    projectID,
    document: `doc-${snapshot.name}`,
    version: "v1",
    snapshot,
    sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    principal: "user:test",
  }).pipe(Effect.map((changed) => changed.install))
}

type Host = (request: ToolSafety.Approval) => Effect.Effect<void, ToolSafety.Denied>

// The registry as the native host composes it: the project's profile loader, which reads hooks.json.
const profiled = {
  ...ToolRegistry.nativeNode,
  implementation: Layer.provide(
    ToolRegistry.nativeNode.implementation as Layer.Layer<ToolRegistry.Service>,
    Layer.effect(
      ToolSafety.RuntimeProfileLoader,
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const global = yield* Global.Service
        const location = yield* Location.Service
        return ToolSafetyProfile.makeLoader(fs, {
          directory: location.directory,
          stateDirectory: MaestroArsenal.stateDirectory(global.data, location.project.id),
          projectID: location.project.id,
        })
      }),
    ),
  ),
  dependencies: [...ToolRegistry.nativeNode.dependencies, FSUtil.node, Global.node, Location.node],
}

// ToolSafety with the native approval host bound to Session events, as the server binds it.
const hosted = (host: Host) => ({
  ...ToolSafety.node,
  implementation: Layer.effect(
    ToolSafety.Service,
    ToolSafety.make.pipe(
      Effect.map((safety) =>
        ToolSafety.Service.of({
          ...safety,
          session: (input) => safety.session(input).pipe(Effect.provideService(ToolSafety.NativeHost, { ask: host })),
        }),
      ),
    ),
  ),
})

const config = Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))

const decisions = (sessionID: string) =>
  Database.Service.use(({ db }) =>
    db
      .select({ data: EventTable.data })
      .from(EventTable)
      .where(
        and(
          eq(EventTable.aggregate_id, sessionID),
          eq(EventTable.type, EventV2.versionedType(RelayHook.Decided.type, 1)),
        ),
      )
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(
        Effect.orDie,
        Effect.map((rows) => rows.map((row) => Schema.decodeUnknownSync(RelayHook.Decided.data)(row.data))),
      ),
  )

const receipts = (dirs: Dirs, installID: string) =>
  LedgerRead.entries(path.join(dirs.data, "relay", projectID, "hooks", installID, "ledger.jsonl")).pipe(
    Effect.map((entries) => entries.map((entry) => Schema.decodeUnknownSync(RelayLedger.HookDecisionLine)(entry))),
  )

const verified = (dirs: Dirs, installID: string) =>
  LedgerVerify.verify(
    path.join(dirs.data, "relay", projectID, "hooks", installID, "ledger.jsonl"),
    Redacted.make(readFileSync(path.join(dirs.data, "relay", projectID, "ledger.key"), "utf8")),
  )

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

/** V2Session over real Locations of the work directory; `wakes` records the drains admission asked for. */
function sessions<A, E>(
  dirs: Dirs,
  body: (input: {
    readonly wakes: ReadonlyArray<string>
  }) => Effect.Effect<A, E, SessionV2.Service | Database.Service | FSUtil.Service>,
  host: Host = () => Effect.void,
) {
  const wakes: Array<string> = []
  const execution = Layer.succeed(
    SessionExecution.Service,
    SessionExecution.Service.of({
      active: Effect.succeed(new Set()),
      resume: () => Effect.void,
      interrupt: () => Effect.void,
      wake: (sessionID) => Effect.sync(() => wakes.push(sessionID)),
    }),
  )
  const layer = AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      FSUtil.node,
      SessionV2.node,
    ]),
    [
      [SessionExecution.node, execution],
      [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
      [Config.node, config],
      [Snapshot.node, Snapshot.noopLayer],
      [ToolRegistry.node, profiled],
      [ToolSafety.node, hosted(host)],
    ],
  )
  return body({ wakes }).pipe(Effect.provide(layer))
}

const create = (dirs: Dirs, sessionID?: SessionSchema.ID) =>
  SessionV2.Service.use((session) =>
    session.create({ ...(sessionID ? { id: sessionID } : {}), location: { directory: AbsolutePath.make(dirs.work) } }),
  )

describe("Relay hooks on V2 Session events", () => {
  it.live(
    "prompt: a Block refuses the prompt before admission; nothing is admitted or woken; the receipt verifies",
    () =>
      Effect.gen(function* () {
        const dirs = yield* fixture
        yield* sessions(dirs, ({ wakes }) =>
          Effect.gen(function* () {
            const installed = yield* install(
              dirs,
              hook("No prompts", "prompt.before", [step("act", RelayHook.NodeType.block, { message: "Not now." })]),
            )
            const session = yield* create(dirs)
            const messageID = SessionMessage.ID.create()
            const failure = yield* SessionV2.Service.use((sessions) =>
              sessions.prompt({ sessionID: session.id, id: messageID, prompt: { text: "ship it" } }),
            ).pipe(Effect.flip)
            expect(failure).toBeInstanceOf(SessionV2.PromptBlockedError)
            expect(failure).toMatchObject({
              reason: "relay-hook-block",
              detail: new ToolSafety.Denied({
                reason: "relay-hook-block",
                detail: "Blocked by hook 'No prompts': Not now.",
              }).message,
            })
            expect(yield* Database.Service.use(({ db }) => SessionInput.find(db, messageID))).toBeUndefined()
            expect(wakes).toEqual([])

            const decided = yield* decisions(session.id)
            expect(decided).toHaveLength(1)
            expect(decided[0]).toMatchObject({
              installID: installed.installID,
              nodeID: "act",
              action: "block",
              trigger: "prompt.before",
              sessionID: session.id,
              // The prompt text stays in the Session record; the decision carries its sha256.
              subject: sha256("ship it"),
              outcome: "blocked",
            })
            expect(decided[0]?.tool).toBeUndefined()
            expect(decided[0]?.callID).toBeUndefined()
            const lines = yield* receipts(dirs, installed.installID)
            expect(lines.map((line) => [line.decision, line.trigger, line.tool, line.call, line.deferred])).toEqual([
              [decided[0]!.decisionID, "prompt.before", null, null, undefined],
            ])
            expect((yield* verified(dirs, installed.installID)).exit).toBe(0)
          }),
        )
      }),
  )

  it.live("prompt: an Approve asks with the hook's words and admits once approved; a rejected ask admits nothing", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      const asks: Array<ToolSafety.Approval> = []
      const answers: Array<Effect.Effect<void, ToolSafety.Denied>> = [
        Effect.void,
        Effect.fail(new ToolSafety.Denied({ reason: "approval-native-rejected" })),
      ]
      const host: Host = (request) =>
        Effect.sync(() => asks.push(request)).pipe(Effect.andThen(answers.shift() ?? Effect.void))
      yield* sessions(
        dirs,
        ({ wakes }) =>
          Effect.gen(function* () {
            yield* install(
              dirs,
              hook("Ask first", "prompt.before", [step("act", RelayHook.NodeType.approve, { message: "Confirm." })]),
            )
            const session = yield* create(dirs)
            const approved = SessionMessage.ID.create()
            const rejected = SessionMessage.ID.create()
            const prompt = (id: SessionMessage.ID) =>
              SessionV2.Service.use((sessions) =>
                sessions.prompt({ sessionID: session.id, id, prompt: { text: "go" } }),
              )
            const admitted = yield* prompt(approved)
            // An exact retry of the admitted prompt is not asked again.
            expect((yield* prompt(approved)).admittedSeq).toBe(admitted.admittedSeq)
            const refused = yield* prompt(rejected).pipe(Effect.flip)
            expect(refused).toMatchObject({ _tag: "Session.PromptBlockedError", reason: "approval-native-rejected" })
            expect(yield* Database.Service.use(({ db }) => SessionInput.find(db, rejected))).toBeUndefined()
            expect(wakes).toEqual([session.id, session.id])

            const message = "Hook 'Ask first' asks for approval: Confirm."
            expect(
              asks.map((request) => [
                request.action,
                request.resources,
                request.message,
                request.trigger,
                request.invocation.sessionID,
                request.invocation.callID,
              ]),
            ).toEqual([
              ["relay_hook", ["prompt"], message, "prompt.before", session.id, ""],
              ["relay_hook", ["prompt"], message, "prompt.before", session.id, ""],
            ])
            expect((yield* decisions(session.id)).map((item) => [item.action, item.outcome, item.trigger])).toEqual([
              ["approve", "approved", "prompt.before"],
              ["approve", "rejected", "prompt.before"],
            ])
          }),
        host,
      )
    }),
  )

  it.live("session-start: hooks run once a new Session is stored, never undo it, and not when one is adopted", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* sessions(dirs, () =>
        Effect.gen(function* () {
          const installed = yield* install(
            dirs,
            hook("Start", "session-start.after", [
              step("note", RelayHook.NodeType.record, { message: "Started." }),
              step("fix", RelayHook.NodeType.repair, { message: "Repair the workspace." }),
            ]),
          )
          const sessionID = SessionSchema.ID.make(`ses_start_${randomUUID().replaceAll("-", "")}`)
          const session = yield* create(dirs, sessionID)
          expect(session.id).toBe(sessionID)
          // Adopting the stored Session runs no hook.
          expect((yield* create(dirs, sessionID)).id).toBe(sessionID)
          const decided = yield* decisions(sessionID)
          expect(decided.map((item) => [item.nodeID, item.action, item.outcome, item.trigger, item.subject])).toEqual([
            ["note", "record", "recorded", "session-start.after", ""],
            ["fix", "repair", "repair-required", "session-start.after", ""],
          ])
          expect((yield* receipts(dirs, installed.installID)).map((line) => line.decision)).toEqual(
            decided.map((item) => item.decisionID),
          )
          expect((yield* verified(dirs, installed.installID)).exit).toBe(0)
        }),
      )
    }),
  )

  it.live("without a hooks.json, prompts are admitted as before", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* sessions(dirs, ({ wakes }) =>
        Effect.gen(function* () {
          const session = yield* create(dirs)
          const admitted = yield* SessionV2.Service.use((sessions) =>
            sessions.prompt({ sessionID: session.id, prompt: { text: "hello" } }),
          )
          expect(admitted.sessionID).toBe(session.id)
          expect(wakes).toEqual([session.id])
          expect(yield* decisions(session.id)).toEqual([])
        }),
      )
    }),
  )
})

// The runner over a fake provider that answers with text, in the work directory's Location.
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: (() =>
      Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "text" }),
        LLMEvent.textDelta({ id: "text", text: "Done." }),
        LLMEvent.textEnd({ id: "text" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ])) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })

function runner<A, E>(
  dirs: Dirs,
  body: Effect.Effect<A, E, SessionRunner.Service | Database.Service | FSUtil.Service>,
) {
  const directory = AbsolutePath.make(dirs.work)
  const layer = AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      FSUtil.node,
      Relay.node,
      node,
    ]),
    [
      [Snapshot.node, Snapshot.noopLayer],
      [LayerNodePlatform.llmClient, client],
      [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
      [SystemContextRegistry.node, AppNodeBuilder.build(SystemContextRegistry.node)],
      [
        Location.node,
        Layer.succeed(Location.Service, Location.Service.of({ directory, project: { id: projectID, directory } })),
      ],
      [SkillGuidance.node, Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
      [
        ReferenceGuidance.node,
        Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
      ],
      [Config.node, config],
      [PermissionV2.node, PermissionFixture.normalLayer],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
      [ToolRegistry.node, profiled],
    ],
  )
  return body.pipe(Effect.provide(layer))
}

describe("Relay hooks when a V2 drain settles", () => {
  it.live("session-idle: hooks run once the drain settles and only record; a drain that never ran fires none", () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* runner(
        dirs,
        Effect.gen(function* () {
          const installed = yield* install(
            dirs,
            hook("Stop", "session-idle.after", [
              step("note", RelayHook.NodeType.record, { message: "Stopped." }),
              step("fix", RelayHook.NodeType.repair, { message: "Leave the tree clean." }),
            ]),
          )
          const sessionID = SessionSchema.ID.make(`ses_idle_${randomUUID().replaceAll("-", "")}`)
          const { db } = yield* Database.Service
          yield* db
            .insert(ProjectTable)
            .values({ id: projectID, worktree: AbsolutePath.make(dirs.work), sandboxes: [] })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          yield* db
            .insert(SessionTable)
            .values({
              id: sessionID,
              project_id: projectID,
              slug: "idle",
              directory: dirs.work,
              title: "idle",
              version: "test",
            })
            .run()
            .pipe(Effect.orDie)
          const run = (force: boolean) => SessionRunner.Service.use((runner) => runner.run({ sessionID, force }))
          // Nothing pending and no force: no drain, so no idle.
          yield* run(false)
          expect(yield* decisions(sessionID)).toEqual([])
          // The Repair has no result to fail after the drain: the drain still succeeds.
          expect(Exit.isSuccess(yield* run(true).pipe(Effect.exit))).toBe(true)
          const decided = yield* decisions(sessionID)
          expect(decided.map((item) => [item.nodeID, item.outcome, item.trigger])).toEqual([
            ["note", "recorded", "session-idle.after"],
            ["fix", "repair-required", "session-idle.after"],
          ])
          expect((yield* receipts(dirs, installed.installID)).map((line) => line.decision)).toEqual(
            decided.map((item) => item.decisionID),
          )
          expect((yield* verified(dirs, installed.installID)).exit).toBe(0)
        }),
      )
    }),
  )
})
