import { afterEach, expect } from "bun:test"
import path from "node:path"
import { readFile, readdir, rm, writeFile } from "node:fs/promises"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Relay } from "@orchestra/core/relay"
import { AbsolutePath } from "@orchestra/core/schema"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { MessageID, PartID } from "../../src/session/schema"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry, Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Permission } from "@/permission"
import { disposeAllInstances, TestInstance, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { relayFor } from "./relay-fixture"

// WP18: Maestro's binding conditions (port plan §9) through the native Task tool, on the Relay arm.
afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([filesystem, Agent.node, BackgroundJob.node, EventV2Bridge.node, Git.node, Config.node,
      CrossSpawnSpawner.node, Session.node, SessionProjector.node, SessionRunState.node, SessionStatus.node, Truncate.node,
      ToolRegistry.node, Database.node, RuntimeFlags.node, Ripgrep.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)
const live = testEffect(Layer.empty)

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const assistant = (sessionID: SessionV1.Assistant["sessionID"], parentID: SessionV1.Assistant["parentID"], agent: string) =>
  ({
    id: MessageID.ascending(), role: "assistant", parentID, sessionID, mode: agent, agent, cost: 0,
    path: { cwd: "/tmp", root: "/tmp" }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...model, time: { created: Date.now() }, finish: "stop",
  }) satisfies SessionV1.Assistant

// A worker that finishes at once; `count` is how many workers were spent.
const workers = () => {
  const spent = { count: 0 }
  const ops: TaskPromptOps = {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        spent.count++
        return { info: assistant(input.sessionID, input.messageID ?? MessageID.ascending(), "general"), parts: [] }
      }),
  }
  return { spent, ops }
}

const parkedText = (gate: string, failing: string) =>
  `Tool safety HOLD: completion-parked-awaiting-owner. Gate '${gate}' is parked awaiting the owner because its retry ` +
  `budget is spent. Failing: ${failing}. Do not dispatch again; tell the owner what failed and why. Only the owner can ` +
  `release or cancel it, and a release resets the retry budget of gate '${gate}' only.`

// Maestro's session dispatching Tasks under one armed contract. Check `x` passes while `x.txt` in the project says
// "pass"; `ran` lists every check run.
const governed = (contract: { readonly retryBudget?: number; readonly chain: ReadonlyArray<{ readonly id: string; readonly checks: ReadonlyArray<{ readonly id: string; readonly hostCheck: string }> }> }) =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({ title: "Maestro" })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: chat.id,
      agent: "maestro", model, time: { created: Date.now() } })
    const caller = yield* sessions.updateMessage(assistant(chat.id, user.id, "maestro"))
    const stateDirectory = yield* tmpdirScoped()
    const token = "arm-relay"
    yield* Effect.promise(async () => {
      const directory = path.join(stateDirectory, chat.projectID, "completion")
      await Bun.write(path.join(directory, `${token}.json`), JSON.stringify({ schema: 1, projectID: chat.projectID,
        contract: { sessionID: chat.id, label: "conditions", ...contract } }))
    })
    const relay = yield* relayFor({ directory: instance.directory, projectID: chat.projectID })
    const ran: string[] = []
    const names = [...new Set(contract.chain.flatMap((gate) => gate.checks.map((check) => check.hostCheck)))]
    const host: ArsenalCompletion.Host = {
      resolve: (dispatch) => Effect.succeed({ ...dispatch, planID: "plan", token, stateDirectory, ownedPaths: [] }),
      checks: new Map(names.map((name): [string, ArsenalCompletion.HostCheck] => [name, () =>
        Effect.promise(() => readFile(path.join(instance.directory, `${name}.txt`), "utf8").catch(() => "")).pipe(
          Effect.map((text) => {
            ran.push(name)
            return { status: text === "pass" ? "pass" as const : "fail" as const, exitCode: text === "pass" ? 0 : 1 }
          }),
        )])),
      relay: () => Effect.succeed(relay),
      observe: () => Effect.void,
    }
    const tool = yield* TaskTool.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host))
    const def = yield* tool.init()
    const work = workers()
    const calls = { count: 0 }
    const dispatch = Effect.suspend(() =>
      Effect.exit(def.execute({ description: "fix it", prompt: "fix it", subagent_type: "general" }, {
        sessionID: chat.id, messageID: caller.id, callID: `call-${++calls.count}`, agent: "maestro", agentID: "maestro",
        abort: new AbortController().signal, extra: { promptOps: work.ops }, messages: [], metadata: () => Effect.void,
        ask: () => Effect.void,
      })),
    )
    // The HOLD text a dispatch failed with, or undefined when it passed.
    const held = dispatch.pipe(Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : undefined))
    const set = (name: string, text: string) => Effect.promise(() => writeFile(path.join(instance.directory, `${name}.txt`), text))
    return { relay, token, ran, spent: work.spent, dispatch, held, set }
  })

it.instance("conditions 1 and 3: a spent budget parks with the exact text, and a parked dispatch spends no worker", () =>
  Effect.gen(function* () {
    const arm = yield* governed({ retryBudget: 1, chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    expect(yield* arm.held).toContain("Tool safety HOLD: completion-checks-not-passing")
    expect(yield* arm.held).toContain(parkedText("A", "a"))
    expect([arm.spent.count, arm.ran.length]).toEqual([2, 2])
    // The world passing does not unpark it: the dispatch HOLDs before any worker or check runs.
    yield* arm.set("a", "pass")
    expect(yield* arm.held).toContain(parkedText("A", "a"))
    expect([arm.spent.count, arm.ran.length]).toEqual([2, 2])
    // Relay's keyed ledger of the parked arm verifies, and ends on the escalation.
    expect(yield* arm.relay.audit(arm.token)).toMatchObject({ chain_intact: true, escalated: true, last_event: "escalate" })
  }),
  { git: true },
  60000,
)

it.instance("condition 4: retryBudget 0 parks on the first failure", () =>
  Effect.gen(function* () {
    const arm = yield* governed({ retryBudget: 0, chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    expect(yield* arm.held).toContain(parkedText("A", "a"))
    expect(arm.spent.count).toBe(1)
  }),
  { git: true },
  60000,
)

it.instance("condition 4: without retryBudget a gate takes 3 failing completions and parks on the 4th", () =>
  Effect.gen(function* () {
    const arm = yield* governed({ chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    for (const _ of [1, 2, 3]) expect(yield* arm.held).toContain("Tool safety HOLD: completion-checks-not-passing")
    expect(yield* arm.held).toContain(parkedText("A", "a"))
    expect(arm.spent.count).toBe(4)
  }),
  { git: true },
  60000,
)

it.instance("condition 4: the budget is per gate; a later gate does not inherit an earlier gate's failures", () =>
  Effect.gen(function* () {
    const arm = yield* governed({ retryBudget: 1, chain: [
      { id: "A", checks: [{ id: "a", hostCheck: "a" }] }, { id: "B", checks: [{ id: "b", hostCheck: "b" }] },
    ] })
    expect(yield* arm.held).toContain("Tool safety HOLD: completion-checks-not-passing")
    yield* arm.set("a", "pass")
    // A spent its one retry; B starts with its own.
    expect(yield* arm.held).toContain("Tool safety HOLD: completion-checks-not-passing")
    expect(yield* arm.held).toContain(parkedText("B", "b"))
    yield* arm.set("b", "pass")
    expect(yield* arm.held).toContain(parkedText("B", "b"))
    expect(arm.spent.count).toBe(3)
  }),
  { git: true },
  60000,
)

live.live(
  "condition 2: only the owner's native approval releases a parked arm; the model's release request alone never does",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await AppRuntime.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const instances = yield* InstanceStore.Service
            const instance = yield* instances.load({ directory: tmp.path })
            yield* Effect.gen(function* () {
              const git = (...args: string[]) =>
                Effect.promise(async () => {
                  const child = Bun.spawn(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                    "-c", "commit.gpgsign=false", ...args], { cwd: tmp.path, stdout: "ignore", stderr: "ignore" })
                  expect(await child.exited).toBe(0)
                })
              // git-clean passes on a committed tree and fails while dirty.txt is untracked.
              yield* git("add", "-A")
              yield* git("commit", "-q", "-m", "fixture")
              const dirty = (on: boolean) =>
                Effect.promise(() => on ? writeFile(path.join(tmp.path, "dirty.txt"), "dirty") : rm(path.join(tmp.path, "dirty.txt")))
              const sessions = yield* Session.Service
              const permissions = yield* Permission.Service
              const parent = yield* sessions.create({ agent: "maestro" })
              const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: parent.id,
                agent: "maestro", model, time: { created: Date.now() } })
              const message = yield* sessions.updateMessage({ ...assistant(parent.id, user.id, "maestro"),
                path: { cwd: tmp.path, root: tmp.path } })
              const registry = yield* Service
              const definitions = yield* registry.all()
              const describe = definitions.find((definition) => definition.id === MaestroArsenal.names.describe)
              const execute = definitions.find((definition) => definition.id === MaestroArsenal.names.execute)
              if (!describe || !execute) throw new Error("Native Arsenal tools missing")
              const context = (callID: string): Tool.Context => ({
                sessionID: parent.id, messageID: message.id, callID, agent: "maestro", abort: new AbortController().signal,
                messages: [], ask: () => Effect.void, metadata: () => Effect.void,
              })
              yield* describe.execute({ name: "relay-arm" }, context("native-describe"))
              yield* execute.execute({ name: "relay-arm", arguments: { action: "arm", contract: {
                sessionID: parent.id, label: "owner release", retryBudget: 0,
                chain: [{ id: "gate", checks: [{ id: "clean", hostCheck: "git-clean" }] }],
              } } }, context("native-arm"))
              const stateDirectory = path.join(MaestroArsenal.stateDirectory(Global.Path.data, parent.projectID), parent.projectID, "completion")
              const [file] = yield* Effect.promise(() => readdir(stateDirectory))
              const token = file!.replace(/\.json$/, "")

              const runtime = yield* ArsenalBindings.make
              const tool = yield* runtime.construct(TaskTool).pipe(Effect.provide(LayerNode.compile(filesystem)))
              const def = yield* tool.init()
              const work = workers()
              const calls = { count: 0 }
              // Each dispatch is the native task call Maestro's message records.
              const held = Effect.gen(function* () {
                const callID = `task-${++calls.count}`
                yield* sessions.updatePart({ id: PartID.ascending(), messageID: message.id, sessionID: parent.id, type: "tool",
                  tool: "task", callID, state: { status: "running", input: { subagent_type: "general" }, time: { start: Date.now() } } })
                const exit = yield* Effect.exit(def.execute({ description: "clean up", prompt: "clean up", subagent_type: "general" }, {
                  ...context(callID), agentID: "maestro", extra: { promptOps: work.ops },
                }))
                return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : undefined
              })
              // The model's release request, answered by the owner in the UI.
              const release = (callID: string, answer: "once" | "reject") =>
                Effect.gen(function* () {
                  const pending = yield* Effect.forkChild(Effect.exit(execute.execute({ name: "relay-arm",
                    arguments: { action: "release", token, reason: "the owner fixed the tree" } }, context(callID))))
                  const asked = yield* pollWithTimeout(permissions.list().pipe(Effect.map((items) =>
                    items.find((item) => item.metadata.action === "completion_release"))), "Owner approval was not asked")
                  // The maestro agent allows everything, and still nothing is released until the owner answers.
                  expect(asked).toMatchObject({ sessionID: parent.id, patterns: [`relay-arm:${token}`] })
                  yield* permissions.reply({ requestID: asked.id, reply: answer })
                  const exit = yield* Fiber.join(pending)
                  return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : undefined
                })

              yield* dirty(true)
              expect(yield* held).toContain(parkedText("gate", "clean"))
              expect(yield* held).toContain(parkedText("gate", "clean"))
              expect(work.spent.count).toBe(1)
              yield* dirty(false)
              expect(yield* release("native-release-1", "reject")).toContain("COMPLETION_RELEASE_REJECTED")
              expect(yield* held).toContain(parkedText("gate", "clean"))
              expect(work.spent.count).toBe(1)
              // A token this session never armed is refused before anyone is asked.
              const forged = yield* Effect.exit(execute.execute({ name: "relay-arm",
                arguments: { action: "release", token: "arm-forged", reason: "skip it" } }, context("native-release-2")))
              expect(Exit.isFailure(forged) ? Cause.pretty(forged.cause) : "").toContain("COMPLETION_RELEASE_TOKEN_UNBOUND")
              expect(yield* release("native-release-3", "once")).toBeUndefined()
              expect(yield* held).toBeUndefined()
              expect(work.spent.count).toBe(2)

              const locations = yield* LocationServiceMap.Service
              const relay = yield* Effect.gen(function* () {
                return yield* Relay.Service
              }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(instance.directory) }))))
              const audit = yield* relay.audit(token)
              expect(audit).toMatchObject({ chain_intact: true, result: "PASS" })
              const ledger = yield* Effect.promise(() => readFile(path.join(relay.paths.arms, token, "ledger.jsonl"), "utf8"))
              expect(ledger.split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.event === "human-release"))
                .toMatchObject([{ wp: "gate", reason: "owner: the owner fixed the tree" }])
              expect(yield* permissions.list()).toEqual([])
            }).pipe(Effect.provideService(InstanceRef, instance))
          }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([AppProcess.node, Global.node])))),
        ),
      )
    }),
  120000,
)
