import { Effect, Fiber, Stream } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetyGit } from "@orchestra/core/tool-safety-git"
import { OutputInspector } from "@orchestra/core/output-inspector"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { createWriteStream } from "node:fs"
import { Tool } from "./tool"
import { InstanceState } from "@/effect/instance-state"

import { FSUtil } from "@orchestra/core/fs-util"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Shell } from "@orchestra/core/shell"
import { ShellID } from "./shell/id"
import { ShellScan } from "./shell/scan"

import { Truncate } from "./truncate"
import { Plugin } from "@/plugin"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { ShellPrompt, type Parameters } from "./shell/prompt"
import { Agent } from "@/agent/agent"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitProject } from "@orchestra/core/backend-toolkit/project-version"
import path from "path"
import { Seats } from "@/maestro/seats"

export { Parameters } from "./shell/prompt"

const MAX_METADATA_LENGTH = 30_000
type Chunk = {
  text: string
  size: number
}

function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  return "...\n\n" + text.slice(-MAX_METADATA_LENGTH)
}

function tail(text: string, maxLines: number, maxBytes: number) {
  const lines = text.split("\n")
  if (lines.length <= maxLines && Buffer.byteLength(text, "utf-8") <= maxBytes) {
    return {
      text,
      cut: false,
    }
  }

  const out: string[] = []
  let bytes = 0
  for (let i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
    if (bytes + size > maxBytes) {
      if (out.length === 0) {
        const buf = Buffer.from(lines[i], "utf-8")
        let start = buf.length - maxBytes
        if (start < 0) start = 0
        while (start < buf.length && (buf[start] & 0xc0) === 0x80) start++
        out.unshift(buf.subarray(start).toString("utf-8"))
      }
      break
    }
    out.unshift(lines[i])
    bytes += size
  }
  return {
    text: out.join("\n"),
    cut: true,
  }
}

function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false,
    })
  }

  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}
export const ShellTool = Tool.define(
  ShellID.ToolID,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const spawner = yield* ChildProcessSpawner
    const fs = yield* FSUtil.Service
    const trunc = yield* Truncate.Service
    const plugin = yield* Plugin.Service
    const flags = yield* RuntimeFlags.Service
    const agents = yield* Agent.Service
    const defaultTimeoutMs = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000
    // The scan runs inside execute, whose environment is empty: give it the services captured here.
    const scanned = <A, E>(effect: Effect.Effect<A, E, FSUtil.Service | ChildProcessSpawner>) =>
      effect.pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner))

    const shellEnv = Effect.fn("ShellTool.shellEnv")(function* (ctx: Tool.Context, cwd: string) {
      const extra = yield* plugin.trigger(
        "shell.env",
        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },
        { env: {} },
      )
      return {
        ...process.env,
        ...extra.env,
      }
    })

    const run = Effect.fn("ShellTool.run")(function* (
      input: {
        shell: string
        command: string
        cwd: string
        env: NodeJS.ProcessEnv
        timeout: number
      },
      ctx: Tool.Context,
    ) {
      const limits = yield* trunc.limits()
      const profile = yield* ToolSafety.RuntimeProfile
      const instance = yield* InstanceState.context
      const env = ToolSafetySandbox.environment(input.env)
      yield* ToolSafetyGit.before({ command: input.command, directory: instance.directory,
        projectDirectory: instance.worktree === "/" ? instance.directory : instance.worktree,
        cwd: input.cwd, env, managedPaths: profile?.managedPaths, neverTouch: profile?.neverTouch,
      }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provide(LayerNode.compile(AppProcess.node)), Effect.orDie)
      const keep = limits.maxBytes * 2
      let full = ""
      let last = ""
      const list: Chunk[] = []
      let used = 0
      let file = ""
      let sink: ReturnType<typeof createWriteStream> | undefined
      let cut = false
      let expired = false
      let aborted = false

      const closeSink = Effect.fnUntraced(function* () {
        const stream = sink
        if (!stream) return
        sink = undefined
        if (stream.destroyed || stream.closed) return
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              let settled = false
              const done = () => {
                if (settled) return
                settled = true
                stream.off("close", done)
                stream.off("error", done)
                stream.off("finish", done)
                resolve()
              }
              stream.once("close", done)
              stream.once("error", done)
              stream.once("finish", done)
              stream.end(done)
            }),
        ).pipe(Effect.catch(() => Effect.void))
      })

      yield* ctx.metadata({
        metadata: {
          output: "",
        },
      })

      const code: number | null = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.addFinalizer(closeSink)
          const wrapped = yield* ToolSafetySandbox.wrap(cmd(input.shell, input.command, input.cwd, env), { prepareParents: true }).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.provideService(ToolSafety.NativeContext, { directory: instance.directory, projectID: instance.project.id }),
          )
          const handle = yield* spawner.spawn(wrapped)
          const inspection = OutputInspector.quarantine()

          const retain = (chunk: string) =>
            Effect.suspend(() => {
              if (!chunk) return ctx.metadata({ metadata: { output: last } })
              const size = Buffer.byteLength(chunk, "utf-8")
              list.push({ text: chunk, size })
              used += size
              while (used > keep && list.length > 1) {
                const item = list.shift()
                if (!item) break
                used -= item.size
                cut = true
              }

              last = preview(last + chunk)

              if (file) {
                sink?.write(chunk)
              } else {
                full += chunk
                if (Buffer.byteLength(full, "utf-8") > limits.maxBytes) {
                  return trunc.write(full).pipe(
                    Effect.andThen((next) =>
                      Effect.sync(() => {
                        file = next
                        cut = true
                        sink = createWriteStream(next, { flags: "a" })
                        full = ""
                      }),
                    ),
                    Effect.andThen(
                      ctx.metadata({
                        metadata: {
                          output: last,
                        },
                      }),
                    ),
                  )
                }
              }

              return ctx.metadata({
                metadata: {
                  output: last,
                },
              })
            })
          const reader = yield* Effect.forkScoped(
            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
              Effect.suspend(() => {
                const inspected = inspection.push(chunk)
                return inspected.reason
                  ? Effect.die(new ToolSafety.Denied({ reason: inspected.reason }))
                  : retain(inspected.text)
              }),
            ).pipe(
              Effect.andThen(Effect.suspend(() => {
                const inspected = inspection.finish()
                return inspected.reason
                  ? Effect.die(new ToolSafety.Denied({ reason: inspected.reason }))
                  : retain(inspected.text)
              })),
            ),
          )

          const abort = Effect.callback<void>((resume) => {
            if (ctx.abort.aborted) return resume(Effect.void)
            const handler = () => resume(Effect.void)
            ctx.abort.addEventListener("abort", handler, { once: true })
            return Effect.sync(() => ctx.abort.removeEventListener("abort", handler))
          })

          const timeout = Effect.sleep(`${input.timeout + 100} millis`)

          const exit = yield* Effect.raceAll([
            handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code }))),
            abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null }))),
            timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null }))),
            Fiber.join(reader).pipe(Effect.andThen(Effect.never)),
          ])

          if (exit.kind === "abort") {
            aborted = true
            yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
          }
          if (exit.kind === "timeout") {
            expired = true
            yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
          }

          if (exit.kind === "exit") yield* Fiber.join(reader)
          return exit.kind === "exit" ? exit.code : null
        }),
      ).pipe(Effect.orDie)

      const meta: string[] = []
      if (expired) {
        meta.push(
          `shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds.`,
        )
      }
      if (aborted) meta.push("User aborted the command")
      const raw = list.map((item) => item.text).join("")
      const end = tail(raw, limits.maxLines, limits.maxBytes)
      if (end.cut) cut = true
      if (!file && end.cut) {
        file = yield* trunc.write(raw)
      }

      let output = end.text
      if (!output) output = "(no output)"

      // Timeout and abort already explain themselves below. This note goes first because the app's
      // test evidence cards parse the end of the output, where runners print their summaries.
      if (code !== null && code !== 0) output = `<shell_metadata>\nexit code: ${code}\n</shell_metadata>\n\n${output}`

      if (cut && file) {
        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
      }

      if (meta.length > 0) {
        output += "\n\n<shell_metadata>\n" + meta.join("\n") + "\n</shell_metadata>"
      }
      return {
        title: input.command,
        metadata: {
          output: last || preview(output),
          exit: code,
          timeout: expired,
          aborted,
          truncated: cut,
          ...(cut && file ? { outputPath: file } : {}),
        },
        output,
      }
    })

    return () =>
      Effect.gen(function* () {
        const cfg = yield* config.get()
        const shell = Shell.acceptable(cfg.shell)
        const name = Shell.name(shell)
        const limits = yield* trunc.limits()
        const prompt = ShellPrompt.render(name, process.platform, limits, defaultTimeoutMs)
        yield* Effect.logInfo("shell tool using shell", { shell })

        return {
          description: prompt.description,
          parameters: prompt.parameters,
          execute: (params: Parameters, ctx: Tool.Context) =>
            Effect.gen(function* () {
              const instanceCtx = yield* InstanceState.context
              const cwd = params.workdir
                ? yield* scanned(ShellScan.resolvePath(params.workdir, instanceCtx.directory, shell))
                : instanceCtx.directory
              if (params.timeout !== undefined && params.timeout < 0) {
                throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
              }
              const timeout = params.timeout ?? defaultTimeoutMs
              yield* scanned(ShellScan.approve(ctx, { command: params.command, cwd, shell }))

              // Only the native backend seat gets its toolkit engines fetched; a blocked engine is the tool's output.
              const seat = Seats.find(ctx.agentID)?.toolkit ? yield* agents.get(ctx.agentID ?? ctx.agent) : undefined
              const blocked = seat?.native === true ? yield* Effect.gen(function* () {
                const root = yield* BackendToolkit.Root
                const owned = yield* ShellScan.ownedToolArgv({ command: params.command, shell, toolkitBin: path.join(root, "bin") })
                if (owned.blocked) return owned.blocked
                yield* Effect.forEach(owned.calls ?? [], (call) => BackendToolkitProject.checkProjectVersion({
                  ...call, cwd, projectDirectory: instanceCtx.worktree === "/" ? instanceCtx.directory : instanceCtx.worktree,
                }), { discard: true })
                // Temporary seam until prepare accepts parsed engine IDs; ensure's installed cache avoids refetching.
                if (owned.calls?.length) yield* BackendToolkit.ensure("openapi-generator")
              }).pipe(Effect.catch((error) => Effect.succeed(error.reason))) : undefined
              if (blocked)
                return { title: params.command, output: blocked, metadata: { output: blocked, exit: null, timeout: false, aborted: false, truncated: false } }
              const toolkit = seat?.native === true ? yield* BackendToolkit.prepare(params.command) : undefined
              if (toolkit?.blocked)
                return { title: params.command, output: toolkit.blocked, metadata: { output: toolkit.blocked, exit: null, timeout: false, aborted: false, truncated: false } }
              return yield* run(
                {
                  shell,
                  command: params.command,
                  cwd,
                  env: { ...(yield* shellEnv(ctx, cwd)), ...toolkit?.env },
                  timeout,
                },
                ctx,
              )
            }),
        }
      })
  }),
)
