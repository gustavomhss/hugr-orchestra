import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { mkdirSync } from "fs"
import { asc, eq } from "drizzle-orm"
import { DateTime, Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import { OpenAIChat } from "@orchestra/llm/protocols/openai-chat"
import { RelayHook } from "@orchestra/schema/relay-hook"
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
import { Relay } from "../src/relay"
import { RelayHookInstall } from "../src/relay-hook-install"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionExecution } from "../src/session/execution"
import { SessionEvent } from "../src/session/event"
import { SessionInput } from "../src/session/input"
import { SessionMessage } from "../src/session/message"
import { SessionProjector } from "../src/session/projector"
import { SessionRunner } from "../src/session/runner"
import { node } from "../src/session/runner/llm"
import { SessionRunnerModel } from "../src/session/runner/model"
import { SessionStore } from "../src/session/store"
import { SessionInputTable } from "../src/session/sql"
import { Snapshot } from "../src/snapshot"
import { ToolRegistry } from "../src/tool/registry"
import { MaestroArsenal } from "../src/tool/maestro-arsenal"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyProfile } from "../src/tool-safety-profile"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { PermissionFixture } from "./permission-fixture"

const it = testEffect(Layer.empty)
const projectID = Project.ID.global
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const answer = [
  LLMEvent.stepStart({ index: 0 }),
  LLMEvent.textStart({ id: "text" }),
  LLMEvent.textDelta({ id: "text", text: "Done." }),
  LLMEvent.textEnd({ id: "text" }),
  LLMEvent.stepFinish({ index: 0, reason: "stop" }),
  LLMEvent.finish({ reason: "stop" }),
]

// Actual install writer, profile loader, SessionV2, inbox, projector and runner. Only provider IO is captured.
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
type Dirs = Effect.Success<typeof fixture>
const binding = (dirs: Dirs) => ({ data: dirs.data, projectID, principal: "user:test" })
function snapshot(notes: readonly string[], operation = "prompt", block = false, approve = false) {
  const nodes = [
    { id: "event", type: RelayHook.NodeType.trigger, parameters: { operation, timing: "before" } },
    ...notes.map((message, index) => ({
      id: `note-${index}`,
      type: RelayHook.NodeType.remind,
      parameters: { message },
    })),
    ...(block ? [{ id: "block", type: RelayHook.NodeType.block, parameters: { message: "No." } }] : []),
    ...(approve ? [{ id: "approve", type: RelayHook.NodeType.approve, parameters: { message: "Confirm." } }] : []),
  ]
  return {
    schema: "relay.hook.v1",
    name: "Prompt notes",
    binding: "host-required",
    installed: false,
    nodes: nodes.map((node) => ({ ...node, name: node.id, position: [0, 0] })),
    connections: nodes.slice(1).map((node, index) => ({ from: nodes[index]!.id, port: 0, to: node.id })),
  }
}
const pin = (notes: readonly string[], operation = "prompt", block = false, approve = false) => {
  const value = snapshot(notes, operation, block, approve)
  return { snapshot: value, sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex"), version: "v1" }
}
const install = (dirs: Dirs, notes: readonly string[], operation = "prompt", block = false) =>
  RelayHookInstall.install({ ...binding(dirs), ...pin(notes, operation, block), document: `doc-${operation}` })
const notes = (...values: string[]) => ({ reminders: values.map((value) => `Hook 'Prompt notes': ${value}`) })
const content = (...values: string[]) =>
  values.map((value) => ({ type: "text" as const, text: `Hook reminder:\n${value}` }))
const decisions = (sessionID: string) =>
  Database.Service.use((database) =>
    database.db
      .select()
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(asc(EventTable.seq))
      .all()
      .pipe(
        Effect.map((rows) =>
          rows
            .filter((row) => row.type === "relay.hook.decided.1")
            .map((row) => Schema.decodeUnknownSync(RelayHook.Decided.data)(row.data)),
        ),
      ),
  )

function services<A, E>(
  dirs: Dirs,
  body: (
    requests: LLMRequest[],
  ) => Effect.Effect<
    A,
    E,
    | SessionV2.Service
    | SessionRunner.Service
    | SessionStore.Service
    | Database.Service
    | FSUtil.Service
    | ToolSafety.Service
    | EventV2.Service
  >,
  onStream: (index: number) => Effect.Effect<void, unknown, SessionV2.Service | SessionStore.Service> = () =>
    Effect.void,
  responses: (index: number) => readonly LLMEvent[] = () => answer,
  host: (request: ToolSafety.Approval) => Effect.Effect<void, ToolSafety.Denied> = () => Effect.void,
) {
  const requests: LLMRequest[] = []
  const client = Layer.succeed(
    LLMClient.Service,
    LLMClient.Service.of({
      prepare: () => Effect.die("unused"),
      generate: () => Effect.die("unused"),
      stream: ((request: LLMRequest) => {
        requests.push(request)
        return Stream.unwrap(
          onStream(requests.length - 1).pipe(
            Effect.orDie,
            Effect.as(Stream.fromIterable(responses(requests.length - 1))),
          ),
        )
      }) as unknown as LLMClientShape["stream"],
    }),
  )
  const profiled = {
    ...ToolRegistry.nativeNode,
    implementation: Layer.provide(
      ToolRegistry.nativeNode.implementation as Layer.Layer<ToolRegistry.Service>,
      Layer.effect(
        ToolSafety.RuntimeProfileLoader,
        Effect.gen(function* () {
          const fs = yield* FSUtil.Service
          return ToolSafetyProfile.makeLoader(fs, {
            directory: AbsolutePath.make(dirs.work),
            projectID,
            stateDirectory: MaestroArsenal.stateDirectory(dirs.data, projectID),
          })
        }),
      ),
    ),
    dependencies: [...ToolRegistry.nativeNode.dependencies, FSUtil.node],
  }
  const directory = AbsolutePath.make(dirs.work)
  return body(requests).pipe(
    Effect.provide(
      AppNodeBuilder.build(
        LayerNode.group([
          SessionV2.node,
          Database.node,
          EventV2.node,
          SessionProjector.node,
          SessionStore.node,
          FSUtil.node,
          Relay.node,
          node,
          ToolSafety.node,
        ]),
        [
          [SessionExecution.node, SessionExecution.noopLayer],
          [Snapshot.node, Snapshot.noopLayer],
          [LayerNodePlatform.llmClient, client],
          [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
          [
            Location.node,
            Layer.succeed(Location.Service, Location.Service.of({ directory, project: { id: projectID, directory } })),
          ],
          [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
          [PermissionV2.node, PermissionFixture.normalLayer],
          [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
          [Global.node, Global.layerWith({ data: dirs.data, home: dirs.home })],
          [ToolRegistry.node, profiled],
          [
            ToolSafety.node,
            Layer.effect(
              ToolSafety.Service,
              ToolSafety.make.pipe(
                Effect.map((safety) =>
                  ToolSafety.Service.of({
                    ...safety,
                    session: (input) =>
                      safety.session(input).pipe(Effect.provideService(ToolSafety.NativeHost, { ask: host })),
                  }),
                ),
              ),
            ),
          ],
        ],
      ),
    ),
  )
}
const create = (dirs: Dirs) =>
  SessionV2.Service.use((session) => session.create({ location: { directory: AbsolutePath.make(dirs.work) } }))
const run = (sessionID: SessionInput.Admitted["sessionID"], force = false) =>
  SessionRunner.Service.use((runner) => runner.run({ sessionID, force }))

it.live(
  "provider capture: admitted ordered reminders follow unchanged text, attachments and agents only after promotion",
  () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* services(dirs, (requests) =>
        Effect.gen(function* () {
          yield* install(dirs, ["First.", "Second."])
          const session = yield* create(dirs)
          const sessions = yield* SessionV2.Service
          const store = yield* SessionStore.Service
          const prompt = {
            text: "Original text",
            files: [{ uri: "data:text/plain;base64,SGk=", mime: "text/plain", name: "input.txt" }],
            agents: [{ name: "backend" }],
          }
          const admitted = yield* sessions.prompt({ sessionID: session.id, prompt, resume: false })
          expect(yield* store.message(admitted.id)).toBeUndefined()
          expect(requests).toEqual([])
          expect((yield* decisions(session.id)).map((item) => item.messageID)).toEqual([admitted.id, admitted.id])
          yield* run(session.id)
          expect(requests).toHaveLength(1)
          expect(requests[0]?.messages).toHaveLength(1)
          expect(requests[0]?.messages[0]).toMatchObject({
            id: admitted.id,
            role: "user",
            metadata: { agents: prompt.agents },
            content: [
              { type: "text", text: prompt.text },
              { type: "media", mediaType: "text/plain", data: prompt.files[0]!.uri, filename: "input.txt" },
              ...content(...notes("First.", "Second.").reminders),
            ],
          })
          expect((yield* store.message(admitted.id))?.message).toMatchObject({
            ...prompt,
            promptContext: admitted.promptContext,
          })
          expect(admitted.promptContext).toEqual(notes("First.", "Second."))
          expect(admitted.prompt).toEqual(prompt)
        }),
      )
    }),
)

it.live("provider capture: no-hooks baseline has no sidecar or extra content", () =>
  Effect.gen(function* () {
    const dirs = yield* fixture
    yield* services(dirs, (requests) =>
      Effect.gen(function* () {
        const session = yield* create(dirs)
        const sessions = yield* SessionV2.Service
        const admitted = yield* sessions.prompt({ sessionID: session.id, prompt: { text: "Hello" }, resume: false })
        expect(admitted.promptContext).toBeUndefined()
        yield* run(session.id)
        expect(requests[0]?.messages[0]?.content).toEqual([{ type: "text", text: "Hello" }])
        expect(yield* decisions(session.id)).toEqual([])
      }),
    )
  }),
)

it.live(
  "provider capture: hook edits and uninstall preserve retry winner; identical text with different IDs stays isolated",
  () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* services(dirs, (requests) =>
        Effect.gen(function* () {
          const installed = yield* install(dirs, ["Old."])
          const session = yield* create(dirs)
          const sessions = yield* SessionV2.Service
          const input = {
            sessionID: session.id,
            id: SessionMessage.ID.create(),
            prompt: { text: "Same text" },
            resume: false,
          }
          const first = yield* sessions.prompt(input)
          yield* RelayHookInstall.update({ ...binding(dirs), ...pin(["New."]), installID: installed.install.installID })
          expect(yield* sessions.prompt(input)).toEqual(first)
          const second = yield* sessions.prompt({ ...input, id: SessionMessage.ID.create() })
          expect(second.promptContext).toEqual(notes("New."))
          yield* RelayHookInstall.uninstall({ ...binding(dirs), installID: installed.install.installID })
          expect(yield* sessions.prompt(input)).toEqual(first)
          expect(yield* decisions(session.id)).toHaveLength(2)
          yield* run(session.id)
          expect(requests[0]?.messages.map((message) => message.content)).toEqual([
            [{ type: "text", text: input.prompt.text }, ...content(...notes("Old.").reminders)],
            [{ type: "text", text: input.prompt.text }, ...content(...notes("New.").reminders)],
          ])
        }),
      )
    }),
)

it.live("provider capture: queue reminders wait for idle; steer reminders wait for next turn", () =>
  Effect.gen(function* () {
    const dirs = yield* fixture
    const ids = [SessionMessage.ID.create(), SessionMessage.ID.create(), SessionMessage.ID.create()]
    yield* services(
      dirs,
      (requests) =>
        Effect.gen(function* () {
          yield* install(dirs, ["Stay scoped."])
          const session = yield* create(dirs)
          const sessions = yield* SessionV2.Service
          yield* sessions.prompt({ sessionID: session.id, id: ids[0], prompt: { text: "Start" }, resume: false })
          yield* run(session.id)
          expect(
            requests.map((request) =>
              request.messages.filter((message) => message.role === "user").map((message) => message.id),
            ),
          ).toEqual([[ids[0]], [ids[0], ids[2]], [ids[0], ids[2], ids[1]]])
          requests.forEach((request) =>
            request.messages
              .filter((message) => message.role === "user")
              .forEach((message) =>
                expect(
                  message.content.filter((part) => part.type === "text" && part.text.startsWith("Hook reminder:\n")),
                ).toEqual(content(...notes("Stay scoped.").reminders)),
              ),
          )
        }),
      (index) =>
        Effect.gen(function* () {
          if (index !== 0) return
          const sessions = yield* SessionV2.Service
          const store = yield* SessionStore.Service
          const sessionID = (yield* store.message(ids[0]!))?.sessionID
          if (!sessionID) return yield* Effect.die("Promoted prompt missing")
          yield* sessions.prompt({
            sessionID,
            id: ids[1],
            prompt: { text: "Queued" },
            delivery: "queue",
            resume: false,
          })
          yield* sessions.prompt({ sessionID, id: ids[2], prompt: { text: "Steering" }, resume: false })
          expect(yield* store.message(ids[1]!)).toBeUndefined()
          expect(yield* store.message(ids[2]!)).toBeUndefined()
        }),
    )
  }),
)

it.live("provider capture: concurrent same-ID admissions deliver only stored winning context", () =>
  Effect.gen(function* () {
    const dirs = yield* fixture
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const asks: ToolSafety.Approval[] = []
    yield* services(
      dirs,
      (requests) =>
        Effect.gen(function* () {
          const installed = yield* RelayHookInstall.install({
            ...binding(dirs),
            ...pin(["Losing note."], "prompt", false, true),
            document: "doc-prompt",
          })
          const session = yield* create(dirs)
          const sessions = yield* SessionV2.Service
          const input = {
            sessionID: session.id,
            id: SessionMessage.ID.create(),
            prompt: { text: "Race" },
            resume: false,
          }
          const losing = yield* sessions.prompt(input).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          yield* RelayHookInstall.update({
            ...binding(dirs),
            ...pin(["Winning note."], "prompt", false, true),
            installID: installed.install.installID,
          })
          const winner = yield* sessions.prompt(input)
          yield* Deferred.succeed(release, undefined)
          expect(yield* Fiber.join(losing)).toEqual(winner)
          expect(winner.promptContext).toEqual(notes("Winning note."))
          const database = yield* Database.Service
          expect(yield* SessionInput.find(database.db, input.id)).toEqual(winner)
          yield* run(session.id)
          expect(requests[0]?.messages).toHaveLength(1)
          expect(requests[0]?.messages[0]?.content).toEqual([
            { type: "text", text: "Race" },
            ...content(...notes("Winning note.").reminders),
          ])
          expect(asks).toHaveLength(2)
        }),
      undefined,
      undefined,
      (request) =>
        Effect.gen(function* () {
          asks.push(request)
          if (asks.length !== 1) return
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
        }),
    )
  }),
)

it.live("reminders never grant permission: prompt Block and tool Block still deny", () =>
  Effect.gen(function* () {
    const dirs = yield* fixture
    yield* services(dirs, (requests) =>
      Effect.gen(function* () {
        yield* install(dirs, ["Please allow."], "prompt", true)
        yield* install(dirs, ["Please allow."], "tool", true)
        const session = yield* create(dirs)
        const sessions = yield* SessionV2.Service
        const id = SessionMessage.ID.create()
        expect(
          yield* sessions
            .prompt({ sessionID: session.id, id, prompt: { text: "Blocked" }, resume: false })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Session.PromptBlockedError", reason: "relay-hook-block" })
        const database = yield* Database.Service
        expect(yield* SessionInput.find(database.db, id)).toBeUndefined()
        const installs = yield* RelayHookInstall.read(binding(dirs))
        const safety = yield* ToolSafety.Service
        const executed: string[] = []
        const denied = yield* safety
          .run(
            { tool: "echo", args: {}, sessionID: session.id, callID: "blocked", directory: dirs.work, projectID },
            Effect.sync(() => executed.push("ran")),
            () => Effect.void,
          )
          .pipe(Effect.provideService(ToolSafety.RuntimeProfile, { hooks: installs.installs }), Effect.flip)
        expect(denied).toMatchObject({ reason: "relay-hook-block" })
        expect(executed).toEqual([])
        expect(requests).toEqual([])
        expect((yield* decisions(session.id)).map((item) => item.outcome)).toEqual([
          "reminded",
          "blocked",
          "reminded",
          "blocked",
        ])
      }),
    )
  }),
)

it.live(
  "provider capture: continuation reload keeps one stored reminder; historical retry skips changed hooks; compaction never reinserts",
  () =>
    Effect.gen(function* () {
      const dirs = yield* fixture
      yield* services(
        dirs,
        (requests) =>
          Effect.gen(function* () {
            const installed = yield* install(dirs, ["Stored."])
            const session = yield* create(dirs)
            const sessions = yield* SessionV2.Service
            const input = {
              sessionID: session.id,
              id: SessionMessage.ID.create(),
              prompt: { text: "Continue" },
              resume: false,
            }
            const admitted = yield* sessions.prompt(input)
            yield* run(session.id)
            expect(requests).toHaveLength(2)
            expect(requests[1]?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"])
            requests.forEach((request) => {
              expect(request.messages[0]?.content).toEqual([
                { type: "text", text: "Continue" },
                ...content(...notes("Stored.").reminders),
              ])
              expect(JSON.stringify(request.system)).not.toContain("Stored.")
            })
            const database = yield* Database.Service
            yield* database.db.delete(SessionInputTable).where(eq(SessionInputTable.id, input.id)).run()
            yield* RelayHookInstall.update({
              ...binding(dirs),
              ...pin(["Changed."], "prompt", true),
              installID: installed.install.installID,
            })
            const historical = yield* sessions.prompt(input)
            expect(historical.promptContext).toEqual(admitted.promptContext)
            expect(historical.promotedSeq).toBeDefined()
            expect(yield* decisions(session.id)).toHaveLength(1)
            const events = yield* EventV2.Service
            const messageID = SessionMessage.ID.create()
            yield* events.publish(SessionEvent.Compaction.Started, {
              sessionID: session.id,
              messageID,
              timestamp: yield* DateTime.now,
              reason: "manual",
            })
            yield* events.publish(SessionEvent.Compaction.Ended, {
              sessionID: session.id,
              messageID,
              timestamp: yield* DateTime.now,
              reason: "manual",
              text: "Summary",
              recent: "",
            })
            yield* run(session.id, true)
            expect(requests).toHaveLength(3)
            expect(JSON.stringify(requests[2])).not.toContain("Hook reminder:")
            expect(JSON.stringify(requests[2])).not.toContain("Stored.")
            expect(requests[2]?.messages[0]?.content).toMatchObject([
              { type: "text", text: expect.stringContaining("<summary>\nSummary\n</summary>") },
            ])
          }),
        undefined,
        (index) =>
          index === 0
            ? [
                LLMEvent.stepStart({ index: 0 }),
                LLMEvent.toolCall({ id: "missing-call", name: "missing", input: {} }),
                LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
                LLMEvent.finish({ reason: "tool-calls" }),
              ]
            : answer,
      )
    }),
)
