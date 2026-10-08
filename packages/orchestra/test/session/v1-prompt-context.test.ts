import { expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { MessageTable, PartTable } from "@orchestra/core/session/sql"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { SessionV1 } from "@orchestra/core/v1/session"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionPrompt } from "@/session/prompt"
import { PromptIdentity } from "@/session/prompt-identity"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const reads: string[] = []
const filesystem: Layer.Layer<FSUtil.Service> = Layer.effect(
  FSUtil.Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return FSUtil.Service.of({
      ...fs,
      readFile: (file: string) =>
        Effect.sync(() => {
          reads.push(file)
        }).pipe(Effect.andThen(fs.readFile(file))),
    })
  }),
).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))
const it = testEffect(
  makeHttp({
    replacements: [
      [FSUtil.node, filesystem],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })],
    ],
  }),
)
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function hook(name: string, actions: ReadonlyArray<{ type: RelayHook.NodeType; message: string }>) {
  return {
    schema: "relay.hook.v1",
    name,
    binding: "host-required",
    installed: false,
    nodes: [
      {
        id: "event",
        name: "Prompt",
        type: RelayHook.NodeType.trigger,
        position: [0, 0],
        parameters: { operation: "prompt", timing: "before" },
      },
      ...actions.map((action, index) => ({
        id: `note-${index}`,
        name: `Note ${index}`,
        type: action.type,
        position: [index + 1, 0],
        parameters: { message: action.message },
      })),
    ],
    connections: actions.map((_, index) => ({
      from: index === 0 ? "event" : `note-${index - 1}`,
      port: 0,
      to: `note-${index}`,
    })),
  }
}
const install = Effect.fn("test.installPromptHook")(function* (
  session: Session.Info,
  snapshot: ReturnType<typeof hook>,
) {
  const binding = { data: Global.Path.data, projectID: session.projectID, principal: "user:test" }
  const installed = yield* Effect.acquireRelease(
    RelayHookInstall.install({
      ...binding,
      document: snapshot.name,
      version: "v1",
      snapshot,
      sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    }),
    (result) =>
      RelayHookInstall.read(binding).pipe(
        Effect.flatMap((items) =>
          items.installs.some((item) => item.installID === result.install.installID)
            ? RelayHookInstall.uninstall({ ...binding, installID: result.install.installID }).pipe(Effect.asVoid)
            : Effect.void,
        ),
        Effect.orDie,
      ),
  )
  return { ...binding, installID: installed.install.installID }
})
const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(EventTable).all()
})

test("original prompt identity sorts objects, preserves bytes/order/absence and excludes only scheduling and IDs", () => {
  const sessionID = SessionID.make("ses_identity")
  const input = {
    sessionID,
    model,
    parts: [
      { type: "text" as const, text: " first\n" },
      { type: "text" as const, text: "second\t" },
    ],
    tools: { z: false, a: true },
    format: SessionV1.OutputFormatText.make({ type: "text" }),
  }
  const identity = (input: SessionPrompt.PromptInput) =>
    PromptIdentity.fromEncoded(Schema.encodeSync(SessionPrompt.PromptInput)(input))
  expect(identity(input)).toBe(
    identity({ ...input, messageID: MessageID.ascending(), noReply: true, tools: { a: true, z: false } }),
  )
  expect(identity(input)).not.toBe(identity({ ...input, parts: [...input.parts].reverse() }))
  expect(identity(input)).not.toBe(identity({ ...input, system: "" }))
  expect(identity(input)).not.toBe(identity({ ...input, agent: "maestro" }))
  expect(identity(input)).not.toBe(identity({ ...input, variant: "default" }))
  expect(identity(input)).not.toBe(identity({ ...input, model: { ...model, modelID: ModelV2.ID.make("other") } }))
  expect(identity(input)).not.toBe(
    identity({
      ...input,
      parts: [
        { type: "text", text: "first\n" },
        { type: "text", text: "second\t" },
      ],
    }),
  )
  const forged = { ...input, promptContext: { reminders: ["caller"] } }
  expect(identity(forged)).toBe(identity(input))
  expect(Schema.encodeSync(SessionPrompt.PromptInput)(forged)).not.toHaveProperty("promptContext")
})

it.instance(
  "installed prompt notes bind final ID and ordered raw text; retry skips changed and uninstalled hooks",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const prompts = yield* SessionPrompt.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const binding = yield* install(
        session,
        hook("Notes", [
          { type: RelayHook.NodeType.remind, message: "First." },
          { type: RelayHook.NodeType.remind, message: "Second." },
        ]),
      )
      const request = {
        sessionID: session.id,
        messageID: MessageID.ascending(),
        model,
        noReply: true,
        parts: [
          { type: "text" as const, text: " first\n" },
          { type: "file" as const, mime: "text/plain", url: "data:text/plain,attachment-content" },
          { type: "text" as const, text: "second\t" },
        ],
        promptContext: { reminders: ["caller"] },
      }
      const winner = yield* prompts.prompt(request)
      expect(winner.info).toMatchObject({
        id: request.messageID,
        role: "user",
        sessionID: session.id,
        promptContext: { reminders: ["Hook 'Notes': First.", "Hook 'Notes': Second."] },
      })
    expect(winner.parts.flatMap((part) => part.type === "text" && !part.synthetic ? [part.text] : [])).toEqual([
        " first\n",
        "second\t",
      ])
      const decisions = (yield* rows).filter((row) => row.type === "relay.hook.decided.1")
      expect(decisions).toHaveLength(2)
      decisions.forEach((row) =>
        expect(row.data).toMatchObject({
          messageID: request.messageID,
          subject: createHash("sha256").update(" first\n\nsecond\t").digest("hex"),
        }),
      )
      const blocked = hook("Notes", [{ type: RelayHook.NodeType.block, message: "New version denies." }])
      yield* RelayHookInstall.update({
        ...binding,
        version: "v2",
        snapshot: blocked,
        sha256: createHash("sha256").update(JSON.stringify(blocked)).digest("hex"),
      })
      const before = yield* rows
      expect(yield* prompts.prompt(request)).toEqual(winner)
      yield* RelayHookInstall.uninstall(binding)
      expect(yield* prompts.prompt(request)).toEqual(winner)
      expect(yield* rows).toEqual(before)
      const database = yield* Database.Service
      expect((yield* PromptAdmission.find(database.db, request.messageID))?.snapshot).toEqual(winner)
    }),
  { git: true },
)

it.instance(
  "conflicting and cross-Session retries fail before installed hook decisions or Session mutations",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const prompts = yield* SessionPrompt.Service
      const session = yield* sessions.create()
      const request = {
        sessionID: session.id,
        messageID: MessageID.ascending(),
        model,
        noReply: true,
        parts: [{ type: "text" as const, text: "original" }],
      }
      yield* prompts.prompt(request)
      yield* install(session, hook("Deny", [{ type: RelayHook.NodeType.block, message: "Denied." }]))
      const other = yield* sessions.create()
      const before = yield* rows
      expect(
        yield* prompts.prompt({ ...request, parts: [{ type: "text", text: "changed" }] }).pipe(Effect.flip),
      ).toBeInstanceOf(PromptAdmission.Conflict)
      expect(yield* prompts.prompt({ ...request, sessionID: other.id }).pipe(Effect.flip)).toBeInstanceOf(
        PromptAdmission.Conflict,
      )
      expect(yield* rows).toEqual(before)
      expect((yield* sessions.get(other.id)).model).toBeUndefined()
    }),
  { git: true },
)

it.instance(
  "installed Block stops attachment reads, plugin/User admission and Session selection/touch",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const prompts = yield* SessionPrompt.Service
      const instance = yield* TestInstance
      const file = path.join(instance.directory, "binary.dat")
      yield* Effect.promise(() => Bun.write(file, "real attachment"))
      const session = yield* sessions.create()
      const binding = yield* install(
        session,
        hook("Block", [{ type: RelayHook.NodeType.block, message: "No admission." }]),
      )
      const before = yield* sessions.get(session.id)
      const request = {
        sessionID: session.id,
        messageID: MessageID.ascending(),
        model,
        variant: "explicit",
        noReply: true,
        tools: { write: true },
        parts: [
          { type: "text" as const, text: "raw" },
          { type: "file" as const, url: pathToFileURL(file).href, mime: "application/octet-stream" },
        ],
      }
      // Avoid Bun's recursive matcher expanding Effect's yieldable error classes during typechecking.
      const denied: unknown = yield* prompts.prompt(request).pipe(Effect.result)
      expect(denied).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "ToolSafety.Denied", reason: "relay-hook-block" },
      })
      expect(reads.filter((item) => item === file)).toEqual([])
      expect(yield* sessions.get(session.id)).toEqual(before)
      const database = yield* Database.Service
      expect(yield* database.db.select().from(MessageTable).all()).toEqual([])
      expect(yield* database.db.select().from(PartTable).all()).toEqual([])
      expect((yield* rows).filter((row) => row.type === "session.v1.prompt.admitted.1")).toEqual([])
      yield* RelayHookInstall.uninstall(binding)
      const admitted = yield* prompts.prompt(request)
      expect(admitted.info.role).toBe("user")
      expect(reads.filter((item) => item === file)).toHaveLength(1)
    }),
  { git: true },
)
