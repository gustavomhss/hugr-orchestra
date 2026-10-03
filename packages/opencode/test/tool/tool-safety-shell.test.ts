import { expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { ArsenalOutcome } from "@/maestro/arsenal-outcome"
import { ShellTool } from "@/tool/shell"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Instruction } from "@/session/instruction"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, SessionID } from "@/session/schema"
import { TestConfig } from "../fixture/config"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([
  FSUtil.node, CrossSpawnSpawner.node, Truncate.node, Agent.node, Plugin.node, Permission.node, Config.node, RuntimeFlags.node, Instruction.node,
]), [
  [Config.node, TestConfig.layer({ get: () => Effect.succeed({ shell: process.platform === "win32" ? process.env.COMSPEC ?? "cmd.exe" : "/bin/sh" }), directories: () => Effect.succeed([]) })],
  [RuntimeFlags.node, RuntimeFlags.layer()],
]))

const nodeCommand = (script: string) => `"${process.execPath}" -e "eval(Buffer.from('${Buffer.from(`(async () => { ${script} })()`).toString("base64")}','base64').toString())"`

it.instance("actual V1 split credential prefix stays out of retained artifact and progress; safe overflow remains usable", () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    const fs = yield* FSUtil.Service
    const instance = yield* TestInstance
    const truncate = yield* Truncate.Service
    const info = yield* ShellTool
    const tool = yield* Tool.init(info)
    const sessionID = SessionID.descending()
    const progress: string[] = []
    const context: Tool.Context = {
      sessionID, messageID: MessageID.ascending(), callID: "fixture-stream", agent: "build",
      abort: new AbortController().signal, messages: [], metadata: () => Effect.void,
      ask: (request) => permission.ask({ ...request, sessionID, ruleset: [{ permission: "*", pattern: "*", action: "allow" }] }).pipe(Effect.orDie),
    }
    const ordinary = yield* tool.execute({ command: nodeCommand("process.stdout.write('ordinary')"), timeout: 5000 }, context)
    expect(ordinary.output).toContain("ordinary")
    const limits = yield* truncate.limits()
    const repeats = Math.ceil((limits.maxBytes + 1) / "ordinary\n".length)
    const beforeOverflow = yield* fs.readDirectory(Truncate.DIR).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed([] as string[])),
    )
    const overflowScript = `process.stdout.write('ordinary\\n'.repeat(${repeats}))`
    const overflow = yield* tool.execute({
      command: nodeCommand(overflowScript), timeout: 5000,
    }, context)
    expect(overflow.metadata.truncated).toBe(true)
    if (!overflow.metadata.outputPath) throw new Error("safe foreground overflow did not retain an artifact")
    const outputPath = overflow.metadata.outputPath
    yield* Effect.addFinalizer(() => fs.remove(outputPath).pipe(Effect.orDie))
    expect(yield* fs.readFileString(outputPath)).toBe("ordinary\n".repeat(repeats))
    expect((yield* fs.readDirectory(Truncate.DIR)).filter((file) => !beforeOverflow.includes(file))).toHaveLength(1)
    const before = yield* fs.readDirectory(Truncate.DIR).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed([] as string[])),
    )
    const secret = "gh" + "p_" + "x".repeat(40)
    expect((yield* Effect.flip(ToolSafety.inspect(secret))).reason).toBe("recognized-secret-output")
    // Acknowledge the reader's real progress callbacks, including its quarantined prefix chunk.
    const script = `async function wait(name) { while (!(await Bun.file(name).exists())) await Bun.sleep(5) } process.stdout.write('ordinary\\n'.repeat(${repeats})+'!'.repeat(64)); await wait('ordinary-read'); process.stdout.write(${JSON.stringify(secret.slice(0, 12))}); await wait('prefix-read'); process.stdout.write(${JSON.stringify(secret.slice(12))})`
    const command = nodeCommand(script)
    const outcome = yield* Effect.exit(tool.execute({ command, timeout: 5000 }, {
      ...context,
      metadata: (input) => {
        const output = input.metadata?.output
        if (typeof output !== "string") return Effect.void
        progress.push(output)
        if (output.endsWith("\n") || output.endsWith("!".repeat(64))) return fs.writeFileString(`${instance.directory}/ordinary-read`, "ready").pipe(Effect.orDie)
        if (output.endsWith(secret.slice(0, 12)) || output.endsWith("!".repeat(12))) return fs.writeFileString(`${instance.directory}/prefix-read`, "ready").pipe(Effect.orDie)
        return Effect.void
      },
    }))
    expect(Exit.isFailure(outcome)).toBe(true)
    if (Exit.isFailure(outcome)) expect(Cause.pretty(outcome.cause)).toContain("recognized-secret-output")
    const files = (yield* fs.readDirectory(Truncate.DIR)).filter((file) => !before.includes(file))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const full = `${Truncate.DIR}/${file}`
      yield* Effect.addFinalizer(() => fs.remove(full).pipe(Effect.orDie))
      const retained = yield* fs.readFileString(full)
      expect(retained).toContain("ordinary")
      expect(retained.includes(secret.slice(0, 12))).toBe(false)
      expect(retained.includes(secret)).toBe(false)
    }
    expect(progress.some((text) => text.includes(secret.slice(0, 12)))).toBe(false)
  }),
)

it.instance("actual V1 timeout settles failure; nonzero fails and cancellation stays cancelled", () =>
  Effect.gen(function* () {
    const safety = yield* ToolSafety.make
    const instance = yield* InstanceState.context
    const definition = yield* ShellTool
    const shell = yield* Tool.init(definition)
    const observations: string[] = []
    const context: Tool.Context = {
      sessionID: SessionID.descending(), messageID: MessageID.ascending(), callID: "outcome", agent: "build",
      abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: () => Effect.void,
    }
    const run = (command: string, timeout: number, abort = context.abort) => safety.run({
      tool: "bash", args: { command, timeout }, sessionID: context.sessionID, callID: command,
      directory: instance.directory, projectID: instance.project.id,
    }, shell.execute({ command, timeout }, { ...context, abort }),
    (value) => Effect.sync(() => { observations.push(value.outcome) }),
    (value) => ArsenalOutcome.classifyOutcome(value, abort.aborted))
    expect(ArsenalOutcome.classifyOutcome(yield* run(nodeCommand("process.stdout.write('ordinary')"), 5000))).toBe("success")
    expect(ArsenalOutcome.classifyOutcome(yield* run(nodeCommand("process.exit(7)"), 5000))).toBe("failure")
    const timeout = yield* run(nodeCommand("await Bun.sleep(2000)"), 5)
    expect(timeout.metadata.exit).toBeNull()
    expect(ArsenalOutcome.classifyOutcome(timeout)).toBe("failure")
    expect(timeout.metadata).toMatchObject({ timeout: true, aborted: false })
    const abort = new AbortController()
    abort.abort()
    const cancelled = yield* run(nodeCommand("await Bun.sleep(2000)"), 5000, abort.signal)
    expect(ArsenalOutcome.classifyOutcome(cancelled)).toBe("cancelled")
    expect(ArsenalOutcome.classifyOutcome(cancelled, true)).toBe("cancelled")
    expect(observations).toEqual(["started", "success", "started", "failure", "started", "failure", "started", "cancelled"])
  }),
)
