import { expect } from "bun:test"
import os from "node:os"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetyProfile } from "@orchestra/core/tool-safety-profile"
import { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import type { InstanceContext } from "@/project/instance-context"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionProcessor } from "@/session/processor"
import { SessionTools } from "@/session/tools"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { testEffect } from "../lib/effect"

// WP13: V1 Sessions, child Sessions included, see installed Relay hooks at the session tools boundary, with the
// profile loader and native approval host their prompt binds. Real hooks.json, profile loader and durable events.
const projectID = "v1-hooks"
const ran: Array<string> = []

const leaf = (id: string, output: (args: Record<string, unknown>) => string): Tool.Def => ({
  id,
  description: id,
  parameters: Schema.Struct({}),
  jsonSchema: { type: "object", properties: {} },
  execute: (args) =>
    Effect.sync(() => {
      const text = output(args as Record<string, unknown>)
      ran.push(text)
      return { title: id, metadata: {}, output: text }
    }),
})

const layer = Layer.mergeAll(
  Layer.succeed(
    Plugin.Service,
    Plugin.Service.of({
      init: () => Effect.void,
      list: () => Effect.succeed([]),
      trigger: (_name, _input, output) => Effect.succeed(output),
    } satisfies Plugin.Interface),
  ),
  Layer.succeed(
    Permission.Service,
    Permission.Service.of({
      ask: () => Effect.void,
      reply: () => Effect.void,
      list: () => Effect.succeed([]),
    } satisfies Permission.Interface),
  ),
  Layer.succeed(
    MCP.Service,
    MCP.Service.of({
      tools: () => Effect.succeed({}),
      clients: () => Effect.succeed({}),
    } as Partial<MCP.Interface> as MCP.Interface),
  ),
  Layer.succeed(
    Truncate.Service,
    Truncate.Service.of({
      cleanup: () => Effect.void,
      write: () => Effect.succeed("output.txt"),
      output: (text: string) => Effect.succeed({ content: text, truncated: false }),
      limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
    } satisfies Truncate.Interface),
  ),
  RuntimeFlags.layer(),
  Layer.succeed(
    ToolRegistry.Service,
    ToolRegistry.Service.of({
      ids: () => Effect.succeed(["write", "bash"]),
      all: () => Effect.succeed([]),
      named: () => Effect.die("unused"),
      tools: () =>
        Effect.succeed([
          leaf("write", (args) => `wrote ${path.basename(String(args.filePath))}`),
          leaf("bash", (args) => `ran ${String(args.command)}`),
        ]),
    }),
  ),
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, FSUtil.node])),
)

const it = testEffect(layer)

const fixture = Effect.acquireRelease(
  Effect.promise(async () => realpath(await mkdtemp(path.join(os.tmpdir(), "orchestra-v1-hooks-")))),
  (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
).pipe(
  Effect.map((dir) => {
    const dirs = { data: path.join(dir, "data"), work: path.join(dir, "work") }
    mkdirSync(dirs.work)
    mkdirSync(MaestroArsenal.stateDirectory(dirs.data, projectID), { recursive: true })
    return dirs
  }),
)

function step(id: string, type: RelayHook.NodeType, parameters: Record<string, unknown>) {
  return { id, name: `Step ${id}`, type, position: [0, 0], parameters }
}

// One hook whose trigger fires on `event`, its steps following as a chain; after a condition, its Yes port.
function hook(name: string, event: string, steps: ReadonlyArray<ReturnType<typeof step>>) {
  const [operation, timing] = event.split(".")
  return {
    schema: "relay.hook.v1",
    name,
    nodes: [step("event", RelayHook.NodeType.trigger, { operation, timing }), ...steps],
    connections: steps.map((item, index) => ({
      from: index === 0 ? "event" : steps[index - 1]!.id,
      port: 0,
      to: item.id,
    })),
    binding: "host-required",
    installed: false,
  }
}

const install = (data: string, snapshot: { readonly name: string }) =>
  RelayHookInstall.install({
    data,
    projectID,
    document: `doc-${snapshot.name}`,
    version: "v1",
    snapshot,
    sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    principal: "user:test",
  })

const agent: Agent.Info = {
  id: "maestro",
  name: "maestro",
  mode: "primary",
  options: {},
  permission: [{ permission: "*", pattern: "*", action: "allow" }],
}

const model = { providerID: ProviderV2.ID.make("test"), api: { id: "test-model" } } as Provider.Model

it.live("V1 tools enforce installed hooks once, with each hook's words, under the native host's wrapper", () =>
  Effect.gen(function* () {
    ran.length = 0
    const dirs = yield* fixture
    yield* install(
      dirs.data,
      hook("No secrets", "write.before", [
        step("secret", RelayHook.NodeType.condition, { field: "path", pattern: "secret/**" }),
        step("block", RelayHook.NodeType.block, { message: "Keep secrets out." }),
      ]),
    )
    yield* install(
      dirs.data,
      hook("Changelog", "write.after", [step("note", RelayHook.NodeType.remind, { message: "Update the changelog." })]),
    )
    yield* install(
      dirs.data,
      hook("Commands", "command.before", [step("ask", RelayHook.NodeType.approve, { message: "Confirm it." })]),
    )

    const sessionID = SessionID.make(`ses_v1hooks_${randomUUID().replaceAll("-", "")}`)
    const messageID = MessageID.ascending()
    const part: SessionV1.ToolPart = {
      id: PartID.ascending(),
      sessionID,
      messageID,
      type: "tool",
      tool: "write",
      callID: "call",
      state: { status: "running", input: {}, time: { start: 1 } },
    }
    const processor = {
      message: {
        id: messageID,
        sessionID,
        role: "assistant",
        parentID: MessageID.ascending(),
        agent: "maestro",
        mode: "maestro",
        path: { cwd: dirs.work, root: dirs.work },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: 1 },
      } satisfies SessionV1.Assistant,
      updateToolCall: (_callID, update) => Effect.sync(() => update(part)),
      completeToolCall: () => Effect.void,
    } satisfies Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall">
    const fs = yield* FSUtil.Service
    const load = ToolSafetyProfile.makeLoader(fs, {
      directory: dirs.work,
      stateDirectory: MaestroArsenal.stateDirectory(dirs.data, projectID),
      projectID,
    })
    const asks: Array<ToolSafety.Approval> = []
    const host = { ask: (request: ToolSafety.Approval) => Effect.sync(() => void asks.push(request)) }
    // What the V1 prompt binds around the loop: the Instance, the project's profile loader and the approval host.
    const tools = yield* SessionTools.resolve({
      agent,
      model,
      session: { id: sessionID, directory: dirs.work, permission: [] } as unknown as Session.Info,
      processor,
      bypassAgentCheck: false,
      messages: [],
      promptOps: {} as never,
    }).pipe(
      Effect.provideService(InstanceRef, {
        directory: dirs.work,
        worktree: dirs.work,
        project: { id: projectID },
      } as unknown as InstanceContext),
      Effect.provideService(ToolSafety.RuntimeProfileLoader, load),
      Effect.provideService(ToolSafety.NativeHost, host),
    )
    const execute = (name: string, args: Record<string, unknown>, toolCallId = `call-${randomUUID()}`) =>
      Effect.tryPromise({
        try: () => tools[name]!.execute!(args, { toolCallId, abortSignal: new AbortController().signal, messages: [] }),
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      }).pipe(Effect.map((value) => Schema.decodeUnknownSync(Schema.Struct({ output: Schema.String }))(value).output))

    const blocked = yield* execute("write", { filePath: path.join(dirs.work, "secret/key.txt") }).pipe(Effect.flip)
    expect(blocked).toContain(
      new ToolSafety.Denied({ reason: "relay-hook-block", detail: "Blocked by hook 'No secrets': Keep secrets out." })
        .message,
    )
    // A reminder after the effect reaches the model in the V1 output text.
    expect(yield* execute("write", { filePath: path.join(dirs.work, "src/app.ts") })).toBe(
      "wrote app.ts\n\nHook 'Changelog': Update the changelog.",
    )

    // The native host's wrapper runs the same call again outside; it leaves the hooks to the boundary inside.
    const outer = yield* ToolSafety.make
    const callID = `call-${randomUUID()}`
    const wrapped = yield* outer
      .run(
        { tool: "bash", args: { command: "ls" }, sessionID, callID, directory: dirs.work, projectID },
        execute("bash", { command: "ls" }, callID).pipe(Effect.orDie),
        () => Effect.void,
      )
      .pipe(
        Effect.provideService(ToolSafety.HookedCall, callID),
        Effect.provideService(ToolSafety.RuntimeProfileLoader, load),
        Effect.provideService(ToolSafety.NativeHost, host),
      )
    expect(wrapped).toBe("ran ls")
    expect(ran).toEqual(["wrote app.ts", "ran ls"])
    expect(
      asks.map((request) => [
        request.action,
        request.message,
        request.invocation.callID,
        request.invocation.assistantMessageID,
        request.invocation.agent,
      ]),
    ).toEqual([["relay_hook", "Hook 'Commands' asks for approval: Confirm it.", callID, messageID, "maestro"]])

    const decided = yield* Database.Service.use(({ db }) =>
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
        .pipe(Effect.orDie),
    )
    expect(
      decided
        .map((row) => Schema.decodeUnknownSync(RelayHook.Decided.data)(row.data))
        .map((item) => [item.action, item.outcome, item.trigger, item.subject, item.assistantMessageID]),
    ).toEqual([
      ["block", "blocked", "write.before", "secret/key.txt", messageID],
      ["remind", "reminded", "write.after", "src/app.ts", messageID],
      ["approve", "approved", "command.before", createHash("sha256").update("ls").digest("hex"), messageID],
    ])
  }),
)
