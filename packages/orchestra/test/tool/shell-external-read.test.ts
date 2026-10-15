import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Cause, Effect, Exit, Fiber } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import type { Tool as AITool } from "ai"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionTools } from "@/session/tools"
import { Skill } from "@/skill"
import { type TaskPromptOps } from "@/tool/task"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TRUNCATION_DIR } from "@/tool/truncation-dir"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { backendSkills } from "@/maestro/roster"
import { Git } from "@/git"
import { Shell } from "@orchestra/core/shell"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { seatShellRuns } from "../fixture/seat-sandbox"
import { pollWithTimeout, testEffect } from "../lib/effect"

// The real shell tool, resolved for a real agent the way a Session resolves it, with the real permission service:
// shell operands outside the workspace get the same external_directory decision as the read tool.

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      MCP.node,
      Permission.node,
      Plugin.node,
      Ripgrep.node,
      RuntimeFlags.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Skill.node,
      ToolRegistry.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

const promptOps: TaskPromptOps = {
  cancel: () => Effect.void,
  resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
  prompt: () => Effect.die("no subagent prompt in this test"),
}

const shellFor = (id: string) =>
  Effect.gen(function* () {
    const agent = yield* (yield* Agent.Service).get(id)
    const sessions = yield* Session.Service
    const directory = (yield* TestInstance).directory
    const session = yield* sessions.create({})
    const message: SessionV1.Assistant = {
      id: MessageID.ascending(),
      sessionID: session.id,
      parentID: MessageID.ascending(),
      role: "assistant",
      agent: id,
      mode: id,
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test-model"),
      providerID: ProviderV2.ID.make("test"),
      time: { created: Date.now() },
    }
    yield* sessions.updateMessage(message)
    const tools = yield* SessionTools.resolve({
      agent,
      model,
      session,
      processor: { message, updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void },
      bypassAgentCheck: true,
      messages: [],
      promptOps,
    })
    return tools.bash
  })

const run = (tool: AITool | undefined, command: string) =>
  Effect.tryPromise(async () => {
    if (!tool?.execute) throw new Error("bash tool missing")
    return tool.execute({ command, description: "probe" }, {
      toolCallId: `call_${Math.random().toString(36).slice(2)}`,
      abortSignal: new AbortController().signal,
      messages: [],
    }) as Promise<{ output: string; metadata: { exit: number | null } }>
  }).pipe(Effect.exit)

// Commands take forward slashes on every shell this suite meets. The session runs the default shell, so each case is
// spelled for it: POSIX shells, PowerShell and cmd.exe.
const slash = (file: string) => file.replaceAll("\\", "/")
const shell = Shell.acceptable()
const kind = Shell.ps(shell) ? "ps" : Shell.name(shell) === "cmd" ? "cmd" : "posix"
const list = kind === "cmd" ? "dir" : "ls"
const read = kind === "cmd" ? "type" : "cat"

const outsideDir = Effect.gen(function* () {
  const outer = yield* tmpdirScoped()
  yield* Effect.promise(() => fs.writeFile(path.join(outer, "secret.txt"), "s3cr3t-body"))
  return outer
})

it.instance("a seat's ls, cat, find, grep and redirection outside the workspace are refused", () =>
  Effect.gen(function* () {
    const outer = yield* outsideDir
    const bash = yield* shellFor("backend")
    const extra = {
      posix: [
        "ls ~/",
        `find "${slash(outer)}" -name "*.txt"`,
        `grep -r s3cr3t "${slash(outer)}"`,
        `cat --number "${slash(outer)}"/*.txt`,
        `grep --file="${slash(outer)}/secret.txt" README`,
        `wc -l < "${slash(outer)}/secret.txt"`,
      ],
      ps: [`Get-ChildItem -Recurse "${slash(outer)}"`, `Select-String s3cr3t "${slash(outer)}/secret.txt"`],
      cmd: [`findstr s3cr3t "${slash(outer)}/secret.txt"`],
    }[kind]
    for (const command of [`${list} "${slash(outer)}"`, `${read} "${slash(outer)}/secret.txt"`, `${list} ..`, ...extra]) {
      const exit = yield* run(bash, command)
      if (Exit.isSuccess(exit)) throw new Error(`${command} ran for a seat: ${exit.value.output}`)
      const failure = Cause.pretty(exit.cause)
      expect(failure).toContain("PermissionDeniedError")
      expect(failure).toContain("is outside the workspace")
      expect(failure).not.toContain("s3cr3t-body")
    }
  }),
)

it.instance("a seat fails closed on a read path only the running shell resolves", () =>
  Effect.gen(function* () {
    const bash = yield* shellFor("backend")
    const exit = yield* run(bash, { posix: `cat "$SECRET_PATH"`, ps: "cat $secretPath", cmd: "type %SECRET_PATH%" }[kind])
    if (Exit.isSuccess(exit)) throw new Error(`a runtime path ran for a seat: ${exit.value.output}`)
    expect(Cause.pretty(exit.cause)).toContain("cannot be checked against the workspace boundary")
  }),
)

it.instance("Maestro is asked before listing a directory outside the workspace", () =>
  Effect.gen(function* () {
    const outer = yield* outsideDir
    const permission = yield* Permission.Service
    const bash = yield* shellFor("maestro")
    const call = yield* run(bash, `${list} "${slash(outer)}"`).pipe(Effect.forkChild)
    const request = yield* pollWithTimeout(
      permission.list().pipe(Effect.map((list) => list.find((item) => item.permission === "external_directory"))),
      "Maestro was not asked for the outside directory",
      "30 seconds",
    )
    expect(request.patterns.map((item) => slash(item).toLowerCase())).toContain(`${slash(outer)}/*`.toLowerCase())
    yield* permission.reply({ requestID: request.id, reply: "reject" })
    const exit = yield* Fiber.join(call)
    expect(Exit.isFailure(exit)).toBe(true)
  }),
)

// A seat's shell runs only where its read sandbox can (test/fixture/seat-sandbox.ts).
const seatRuns = seatShellRuns() ? it.instance : it.instance.skip

seatRuns("a seat's in-workspace reads and granted directories still run", () =>
  Effect.gen(function* () {
    const directory = (yield* TestInstance).directory
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "inside.txt"), "inside-text"))
    const seat = yield* shellFor("backend")
    // On Linux, srt guards missing dotfiles such as .bashrc in a writable root with unopenable placeholders, which a
    // recursive grep of . would report, so it searches the visible entries.
    const local = kind === "posix" ? ["grep -r inside-text *", "cat ./inside.txt > /dev/null 2>&1"] : []
    for (const command of [list, `${read} inside.txt`, ...local]) {
      const exit = yield* run(seat, command)
      if (Exit.isFailure(exit)) throw new Error(`${command} failed for a seat: ${Cause.pretty(exit.cause)}`)
      expect(exit.value.metadata.exit, `${command}: ${exit.value.output}`).toBe(0)
    }
    // The backend seat is granted its skill root, outside this workspace.
    const skills = yield* run(seat, `${list} "${slash(backendSkills.root)}"`)
    if (Exit.isFailure(skills)) throw new Error(`skill root refused: ${Cause.pretty(skills.cause)}`)
    expect(skills.value.output).toContain("backend-implement")
  }),
)

it.instance("Maestro reads saved tool output without being asked", () =>
  Effect.gen(function* () {
    const saved = path.join(TRUNCATION_DIR, `shell-external-read-${Math.random().toString(36).slice(2)}.txt`)
    yield* Effect.promise(() => fs.mkdir(TRUNCATION_DIR, { recursive: true }))
    yield* Effect.promise(() => fs.writeFile(saved, "saved-output"))
    yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(saved, { force: true })))
    const permission = yield* Permission.Service
    const maestro = yield* shellFor("maestro")
    const exit = yield* run(maestro, `${read} "${slash(saved)}"`).pipe(Effect.timeout("30 seconds"))
    expect(yield* permission.list()).toEqual([])
    if (Exit.isFailure(exit)) throw new Error(`saved output refused: ${Cause.pretty(exit.cause)}`)
    expect(exit.value.output).toContain("saved-output")
  }),
)
