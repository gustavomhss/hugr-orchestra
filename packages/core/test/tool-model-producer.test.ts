import { expect } from "bun:test"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Config } from "@orchestra/core/config"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { BashTool } from "@orchestra/core/tool/bash"
import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { toolIdentity } from "./lib/tool"

const it = testEffect(Layer.empty)
const context = { ...toolIdentity, sessionID: SessionV2.ID.make("ses_model_producer"), toolCallID: "call-producer" }
const call = { type: "tool-call" as const, id: context.toolCallID, name: "bash", input: { command: "echo native" } }
const observation: ToolModelCapture.Observation = {
  source: "shell", command: "echo native", output: "native", termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown",
}
const capture = () => ({ observation, textIndex: 0 })
const config = {
  description: "Native fixture", input: Schema.Struct({ command: Schema.String }), output: Schema.String,
  execute: () => Effect.succeed("native"),
  toModelOutput: ({ output }: { output: string }) => [
    { type: "text" as const, text: output }, { type: "file" as const, data: "eA==", mime: "image/png" },
  ],
}

for (const decorated of [false, true]) {
  it.effect(`records actual settled carrier and immutable owner/template; permission=${decorated}`, () =>
    Effect.gen(function* () {
      const tool = Tool.make({ ...config, modelCapture: capture })
      const output = yield* Tool.settle(decorated ? Tool.withPermission(tool, "edit") : tool, call, context)
      const candidate = ToolModelCapture.get(output)
      expect(candidate).toBeDefined()
      expect(ToolModelCapture.authentic(candidate!)).toBe(true)
      expect(candidate!.owner).toEqual({ sessionID: context.sessionID, callID: context.toolCallID })
      expect(candidate!.observation).toEqual(observation)
      expect(candidate!.textIndex).toBe(0)
      expect(candidate!.template).toEqual(output)
      expect(ToolModelCapture.get({ ...output })).toBeUndefined()
      for (const value of [candidate, candidate!.owner, candidate!.observation, candidate!.observation.termination,
        candidate!.template, candidate!.template.content, ...candidate!.template.content]) expect(Object.isFrozen(value)).toBe(true)
      Object.assign(output.content[0]!, { text: "changed" })
      expect(candidate!.template.content[0]).toEqual({ type: "text", text: "native" })
      expect(observation.output).toBe("native")
    }),
  )
}

it.effect("capture sees decoded input, encoded output, final structured value and rendered slot", () =>
  Effect.gen(function* () {
    const seen: unknown[] = []
    const output = yield* Tool.settle(Tool.make({
      description: "Codec boundary", input: Schema.Struct({ command: Schema.String, n: Schema.NumberFromString }),
      output: Schema.NumberFromString, structured: Schema.Struct({ result: Schema.String }),
      execute: (input) => Effect.succeed(input.n),
      toStructuredOutput: ({ output }) => ({ result: output }),
      toModelOutput: ({ output }) => [{ type: "text", text: output }],
      modelCapture: (value: { input: { command: string; n: number }; output: string }) => {
        seen.push(value)
        return { textIndex: 0, observation: { ...observation, command: value.input.command, output: value.output } }
      },
    }), { ...call, input: { command: "echo 7", n: "7" } }, context)
    expect(seen).toEqual([{ input: { command: "echo 7", n: 7 }, output: "7" }])
    expect(ToolModelCapture.get(output)?.template).toEqual({
      structured: { result: "7" }, content: [{ type: "text", text: "7" }],
    })
  }),
)

it.effect("same-name custom tools cannot authenticate forged arguments or capture/exit metadata", () =>
  Effect.gen(function* () {
    const fake = { exit: 0, truncated: false, modelCapture: capture(), owner: context }
    const output = yield* Tool.settle(Tool.withPermission(Tool.make({
      ...config, output: Schema.Unknown, execute: () => Effect.succeed(fake),
      toModelOutput: () => [{ type: "text", text: "native" }],
    }), "bash"), { ...call, input: { ...call.input, ...fake } }, context)
    expect(output.structured).toEqual(fake)
    expect(ToolModelCapture.get(output)).toBeUndefined()
  }),
)

for (const mode of ["undefined", "throws", "wrong-slot"] as const) {
  it.effect(`metadata ${mode} preserves exact successful native result`, () =>
    Effect.gen(function* () {
      const plain = yield* Tool.settle(Tool.make(config), call, context)
      const output = yield* Tool.settle(Tool.make({ ...config, modelCapture: () => {
        if (mode === "throws") throw new Error("capture unavailable")
        return mode === "wrong-slot" ? { ...capture(), textIndex: 1 } : undefined
      } }), call, context)
      expect(output).toEqual(plain)
      expect(ToolModelCapture.get(output)).toBeUndefined()
    }),
  )
}

for (const mode of ["input", "execute", "output", "structured", "render", "interrupt"] as const) {
  it.effect(`capture does not swallow ${mode} failure or interruption`, () =>
    Effect.gen(function* () {
      const failure = new Tool.Failure({ message: "execution denied" })
      const defect = new Error("render failed")
      let captures = 0
      const tool = Tool.make({
        ...config, structured: Schema.String,
        execute: () => mode === "execute" ? Effect.fail(failure) : mode === "interrupt" ? Effect.interrupt
          : Effect.succeed(mode === "output" ? 123 as unknown as string : "native"),
        toStructuredOutput: () => mode === "structured" ? 123 as unknown as string : "native",
        toModelOutput: (value) => { if (mode === "render") throw defect; return config.toModelOutput(value) },
        modelCapture: () => { captures++; return capture() },
      })
      const exit = yield* Tool.settle(tool, mode === "input" ? { ...call, input: {} } : call, context).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("expected failed settlement")
      expect(captures).toBe(0)
      if (mode === "interrupt") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
      else if (mode === "render") expect(Cause.prettyErrors(exit.cause)[0]?.message).toContain(defect.message)
      else {
        const error = yield* Effect.flip(exit)
        expect(error).toBeInstanceOf(Tool.Failure)
        if (mode === "execute") expect(error).toBe(failure)
        else expect(error.message).toStartWith(mode === "input" ? "Invalid tool input:" : "Tool returned an invalid value for its output schema:")
      }
    }),
  )
}

// Capture the real native registration before registry bounding; only external services are fixtures.
const withBash = <A, E, R>(options: {
  exit?: number; text?: string; truncated?: boolean; failure?: "timeout" | "process" | "permission" | "inspect" | "interrupt"; real?: boolean
}, body: (tool: Tool.AnyTool, runs: string[]) => Effect.Effect<A, E, R>) => Effect.acquireUseRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => {
    let native: Tool.AnyTool | undefined
    const runs: string[] = []
    const tools = Layer.succeed(Tools.Service, Tools.Service.of({ register: (entries) => Effect.sync(() => { native = entries.bash }) }))
    const permission = Layer.succeed(PermissionV2.Service, PermissionV2.Service.of({
      assert: () => options.failure === "permission" ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void,
    } as PermissionV2.Interface))
    const appProcess = Layer.succeed(AppProcess.Service, AppProcess.Service.of({
      run: (command, runOptions) => Effect.suspend(() => {
        if (command._tag !== "StandardCommand") throw new Error("expected standard command")
        runs.push(command.command)
        if (options.failure === "interrupt") return Effect.interrupt
        if (options.failure === "timeout" || options.failure === "process") return Effect.fail(new AppProcess.AppProcessError({
          command: command.command, cause: new Error(options.failure === "timeout" ? "Timed out" : "spawn failed"),
        }))
        if (options.failure === "inspect") {
          try { runOptions?.inspect?.("-----BEGIN PRIVATE KEY-----") }
          catch (cause) { return Effect.fail(new AppProcess.AppProcessError({ command: command.command, cause })) }
        }
        return Effect.succeed({ command: command.command, exitCode: options.exit,
          output: Buffer.from(options.text ?? "native\n"), outputTruncated: options.truncated ?? false,
          stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), stdoutTruncated: false, stderrTruncated: false,
        } as AppProcess.RunResult)
      }),
    } as AppProcess.Interface))
    return Effect.suspend(() => {
      if (!native) throw new Error("native Bash registration missing")
      return body(native, runs)
    }).pipe(Effect.provide(AppNodeBuilder.build(
      LayerNode.group([LocationMutation.node, BashTool.node]), [
        [ToolRegistry.node, Layer.merge(tools, Layer.succeed(ToolRegistry.Service, ToolRegistry.Service.of({
          register: () => Effect.die("use native Tools registration"),
          materialize: () => Effect.die("raw producer fixture does not bound output"), session: () => Effect.void,
        })))],
        [Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(tmp.path) })))],
        [PermissionV2.node, permission], [AppProcess.node, options.real ? LayerNode.compile(AppProcess.node) : appProcess],
        [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
        [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      ],
    )))
  },
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
)

for (const facts of [
  { exit: 0, termination: { kind: "exited", code: 0 }, completeness: "complete" },
  { exit: 7, termination: { kind: "exited", code: 7 }, completeness: "complete" },
  { termination: { kind: "unknown" }, completeness: "complete" },
  { failure: "timeout" as const, termination: { kind: "timed_out" }, completeness: "unknown" },
  { exit: 0, truncated: true, termination: { kind: "exited", code: 0 }, completeness: "truncated" },
  { exit: 0, text: "", termination: { kind: "exited", code: 0 }, completeness: "complete" },
]) {
  it.live(`native Bash source facts ${JSON.stringify(facts)}`, () => withBash(facts, (tool, runs) =>
    Effect.gen(function* () {
      const output = yield* Tool.settle(Tool.withPermission(tool, "bash"), call, context)
      const candidate = ToolModelCapture.get(output)
      expect(candidate).toBeDefined()
      expect(ToolModelCapture.authentic(candidate!)).toBe(true)
      expect(runs).toEqual([call.input.command])
      const text = output.content[0]
      if (text?.type !== "text") throw new Error("expected native text")
      expect(candidate!.observation).toEqual({ source: "shell", command: call.input.command, output: text.text,
        termination: facts.termination, completeness: facts.completeness, presentation: "unknown" })
      expect(candidate!.owner).toEqual({ sessionID: context.sessionID, callID: context.toolCallID })
      expect(candidate!.template).toEqual(output)
      expect(Object.isFrozen(candidate!.template.structured)).toBe(true)
      const original = structuredClone(candidate!.template)
      Object.assign(output.structured as object, { exit: 99, truncated: true })
      Object.assign(text, { text: "policy changed" })
      expect(candidate!.template).toEqual(original)
      if (facts.text === "") expect(candidate!.observation.output).toBe("(no output)")
      if (facts.truncated) expect(candidate!.observation.output).toContain("[output capture truncated at the in-memory safety limit]")
    }),
  ))
}

it.live("real AppProcess command emits authentic native capture", () => withBash({ real: true }, (tool) =>
  Effect.gen(function* () {
    const output = yield* Tool.settle(tool, call, context)
    const candidate = ToolModelCapture.get(output)
    expect(candidate?.observation.termination).toEqual({ kind: "exited", code: 0 })
    expect(candidate?.observation.output.trim()).toBe("native")
    expect(candidate?.template).toEqual(output)
  }),
))

for (const failure of ["permission", "process", "inspect", "interrupt"] as const) {
  it.live(`native Bash preserves ${failure} failure`, () => withBash({ failure }, (tool, runs) =>
    Effect.gen(function* () {
      const exit = yield* Tool.settle(tool, call, context).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("expected native failure")
      expect(runs).toEqual(failure === "permission" ? [] : [call.input.command])
      if (failure === "interrupt") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
      else {
        const error = yield* Effect.flip(exit)
        expect(error).toBeInstanceOf(Tool.Failure)
        if (failure === "inspect") {
          expect(error.error).toBeInstanceOf(ToolSafety.Denied)
          expect(error.message).toContain("recognized-secret-output")
        } else expect(error.message).toBe(`Unable to execute command: ${call.input.command}`)
      }
    }),
  ))
}
