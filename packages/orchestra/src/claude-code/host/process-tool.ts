export * as ClaudeHostProcess from "./process-tool"

// The additive `process` MCP tool (meta-harness PLAN §6): start, tail, stop and list long-running or background
// processes. Claude Code's native Bash reports no output until a command ends and no process tree for background
// shells (13-ui-inventory GAP-1, GAP-2). A tree this tool starts is adopted by the same BackgroundProcess registry the
// shell tool hands its background trees to, so it shows in the Processes panel with its pid, process tree and live
// tail, and the panel's stop works on it. Claude Code's Bash stays enabled for ordinary commands.
import { Effect, Option, Schema, Stream } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Shell } from "@orchestra/core/shell"
import { OmniBackground } from "@orchestra/core/omni-background"
import { BackgroundProcess } from "@/background/process"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { ShellScan } from "@/tool/shell/scan"
import { ShellExecution } from "@/tool/shell/execution"
import { Tool } from "@/tool/tool"

export const ID = "process"

/** How long `start` waits for early output, or for a short command to end, before it returns. */
export const WAIT_MS = 3_000
export const MAX_WAIT_MS = 30_000
/** Bytes of output `start` and `tail` return unless asked for more. */
export const TAIL_BYTES = 4 * 1024

export const Parameters = Schema.Struct({
  action: Schema.Literals(["start", "tail", "stop", "list"]).annotate({
    description: "start a command in the background, tail its output, stop its process tree, or list this session's processes.",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "start: the shell command, such as `bun run dev`." }),
  workdir: Schema.optional(Schema.String).annotate({ description: "start: working directory; default the project directory." }),
  wait: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: MAX_WAIT_MS }))).annotate({
    description: `start: milliseconds to wait for early output before returning (default ${WAIT_MS}).`,
  }),
  id: Schema.optional(Schema.String).annotate({ description: "tail, stop: the process id start or list returned." }),
  bytes: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: OmniBackground.RING_BYTES }))).annotate({
    description: `tail: bytes of the latest output to return (default ${TAIL_BYTES}).`,
  }),
})

const DESCRIPTION = [
  "Run a long-running or background command, such as a dev server, a watcher or a slow build, and watch it. `start`",
  "returns after the early output with the process id while the command keeps running; the owner sees it, with its",
  "live output, in the Processes panel. `tail` returns its latest output, `stop` ends it with every process it",
  "started, `list` shows this session's running processes. Use Bash for ordinary commands that finish on their own.",
].join(" ")

export const ProcessTool = Tool.define(
  ID,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const spawner = yield* ChildProcessSpawner
    const processes = yield* BackgroundProcess.Service
    const fs = yield* FSUtil.Service
    const scanned = <A, E>(effect: Effect.Effect<A, E, FSUtil.Service | ChildProcessSpawner>) =>
      effect.pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(ChildProcessSpawner, spawner))

    const start = Effect.fn("ClaudeHostProcess.start")(function* (params: typeof Parameters.Type, ctx: Tool.Context): Effect.fn.Return<Tool.ExecuteResult, unknown> {
      const command = params.command?.trim()
      if (!command) return yield* Effect.die(new Error("process start needs a command"))
      const instance = yield* InstanceState.context
      const shell = Shell.acceptable((yield* config.get()).shell)
      const cwd = params.workdir
        ? yield* scanned(ShellScan.resolvePath(params.workdir, instance.directory, shell))
        : instance.directory
      // The shell tool's own checks and asks: the command is a shell command, under the same `bash` permission.
      const approved = yield* ShellExecution.approve(fs, spawner, { command, cwd, shell }, ctx)
      const early = yield* Effect.scoped(Effect.gen(function* () {
        const handle = yield* ShellExecution.spawn(fs, spawner, processes.adoptable, {
          command, shell, cwd, env: process.env, prepareParents: approved.prepareParents,
        }, ctx)
        const seen = { text: "" }
        yield* Effect.forkScoped(Stream.runForEach(Stream.decodeText(handle.all), (chunk) => Effect.suspend(() => {
          seen.text = (seen.text + chunk).slice(-TAIL_BYTES)
          return ctx.metadata({ metadata: { output: seen.text } })
        })).pipe(Effect.ignore))
        const exit = yield* handle.exitCode.pipe(Effect.orDie, Effect.timeoutOption(params.wait ?? WAIT_MS))
        // Like the shell tool: a failed root never leaves a tree behind to adopt.
        if (Option.isSome(exit) && exit.value !== 0) yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.ignore)
        return { pid: Number(handle.pid), code: Option.isSome(exit) ? Number(exit.value) : undefined, output: seen.text }
      }))
      // Closing the spawn scope with the tree alive hands it to the BackgroundProcess registry.
      const entry = (yield* processes.list(ctx.sessionID, 0)).find((item) => item.pid === early.pid)
      const output = early.output || "(no output yet)"
      if (entry) return {
        title: approved.command,
        output: `Started process ${entry.id} (pid ${entry.pid}). It keeps running; tail or stop it with id ${entry.id}.\n\n${output}`,
        metadata: { id: entry.id, pid: entry.pid, output: early.output, exit: null },
      }
      if (early.code !== undefined) return {
        title: approved.command,
        output: `The command ended with exit code ${early.code} before it went to the background.\n\n${output}`,
        metadata: { output: early.output, exit: early.code },
      }
      return {
        title: approved.command,
        output: `The command was still running but this host could not keep it in the background, so it was stopped.\n\n${output}`,
        metadata: { output: early.output, exit: null },
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: typeof Parameters.Type, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult> => Effect.gen(function* () {
        if (params.action === "start") return yield* start(params, ctx)
        if (params.action === "list") {
          const listed = yield* processes.list(ctx.sessionID, 0)
          return {
            title: "Background processes",
            output: listed.length
              ? listed.map((item) => `${item.id} pid ${item.pid} since ${new Date(item.started).toISOString()}: ${item.title}`).join("\n")
              : "No background processes are running in this session.",
            metadata: { processes: listed.map((item) => ({ id: item.id, pid: item.pid, title: item.title })) },
          }
        }
        const id = params.id
        if (!id) return yield* Effect.die(new Error(`process ${params.action} needs the id that start or list returned`))
        if (params.action === "stop") {
          const stopped = yield* processes.stop(ctx.sessionID, id)
          return {
            title: `Stop ${id}`,
            output: stopped ? `Stopped ${id} and every process it started.` : `No running process ${id} in this session.`,
            metadata: { id, stopped },
          }
        }
        const entry = (yield* processes.list(ctx.sessionID, params.bytes ?? TAIL_BYTES)).find((item) => item.id === id)
        if (!entry) return { title: `Tail ${id}`, output: `No running process ${id} in this session.`, metadata: { id, running: false } }
        return {
          title: entry.title,
          output: entry.output || "(no output since it went to the background)",
          metadata: { id, running: true, pid: entry.pid, written: entry.written,
            processes: entry.processes.map((node) => node.pid) },
        }
      }).pipe(Effect.orDie),
    }
  }),
)
