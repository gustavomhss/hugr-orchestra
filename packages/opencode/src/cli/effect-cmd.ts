import { constants } from "node:os"
import { writeSync } from "node:fs"
import type { Argv } from "yargs"
import { Effect, Schema } from "effect"
import type { AppServices } from "@/effect/app-runtime"
import type { InstanceStore } from "@/project/instance-store"
import { cmd, type WithDoubleDash } from "./cmd/cmd"

/**
 * User-visible command failure. Throw via `fail("...")` from an effectCmd handler
 * to surface a printed message + non-zero exit. Recognised by the global error
 * formatter in `src/cli/error.ts` (FormatError), so the existing top-level
 * catch + cleanup in `src/index.ts` runs normally.
 */
export class CliError extends Schema.TaggedErrorClass<CliError>()("CliError", {
  message: Schema.String,
  exitCode: Schema.optional(Schema.Number),
}) {}

export const fail = (message: string, exitCode = 1) => Effect.fail(new CliError({ message, exitCode }))

interface EffectCmdOpts<Args, A> {
  command: string | readonly string[]
  aliases?: string | readonly string[]
  describe: string | false
  builder?: (yargs: Argv) => Argv<Args>
  /**
   * Whether the command needs a project InstanceContext. Defaults to true.
   *
   * `true` (default): wraps the handler in `InstanceStore.Service.provide({directory})`
   * so `InstanceRef` resolves to a loaded `InstanceContext`. Auto-disposes via
   * `Effect.ensuring(store.dispose(ctx))` on every Exit (matches the legacy
   * `bootstrap()` finally-disposal). Runs InstanceBootstrap (config + plugin
   * init + LSP/File/etc forks) eagerly.
   *
   * `false`: skip the instance entirely. Saves the InstanceBootstrap work and
   * suppresses the `server.instance.disposed` IPC event. The handler runs
   * directly under AppRuntime — it can yield any `AppServices` but must not
   * yield `InstanceRef` (it'd be undefined, causing a defect).
   *
   * Function form: `(args) => boolean` decides per-invocation. Useful for
   * commands like `run --attach <url>` where one flag flips between local
   * (needs instance) and remote (doesn't).
   *
   * Use `false` for commands that don't read project state (e.g. `models`,
   * `serve`, `web`, `account`, `db`, `upgrade`).
   */
  instance?: boolean | ((args: Args) => boolean)
  /** Defaults to process.cwd(). Override for commands that take a directory positional. */
  directory?: (args: Args) => string
  handler: (args: WithDoubleDash<Args>) => Effect.Effect<A, CliError, AppServices | InstanceStore.Service>
}

/**
 * Effect-native CLI command builder. Wraps yargs `cmd()` so the handler body is
 * an `Effect` with `InstanceRef` provided and any `AppServices` yieldable.
 *
 * The handler is wrapped in `Effect.ensuring(store.dispose(ctx))` so the loaded
 * InstanceContext is disposed (runDisposers + IPC `server.instance.disposed`)
 * on every Exit — success, typed failure, defect, or interruption. Matches the
 * legacy `bootstrap()` finally-disposal semantics without per-handler boilerplate.
 *
 * Errors propagate to the existing top-level handler in `src/index.ts`; use
 * `fail("...")` for user-visible domain failures (clean exit, formatted message).
 *
 * Handlers are typically `Effect.fn("Cli.<name>")(function*(args) { ... })`,
 * which adds a named tracing span per CLI invocation. Once all commands use
 * `effectCmd`, swapping the underlying `cmd()` factory for effect/cli's
 * `Command.make(...)` won't touch any handler bodies.
 */
export const effectCmd = <Args, A>(opts: EffectCmdOpts<Args, A>) =>
  cmd<{}, Args>({
    command: opts.command,
    aliases: opts.aliases,
    describe: opts.describe,
    builder: opts.builder as never,
    async handler(rawArgs) {
      const { AppRuntime } = await import("@/effect/app-runtime")
      // A signal would end the process before layer finalizers run, leaving in-flight tool calls projected as
      // running. Dispose the runtime first: instance disposal cancels Session runs and their cleanup marks the calls
      // interrupted. The timeout keeps a stuck finalizer from blocking the exit.
      let signalled = false
      for (const signal of ["SIGTERM", "SIGHUP"] as const)
        process.once(signal, () => {
          if (signalled) return
          signalled = true
          process.exitCode = 128 + constants.signals[signal]
          const started = Date.now()
          // Runtime logging is disposed along with the runtime. Keep shutdown evidence independent of its layers.
          const debug = (status: "started" | "disposed" | "timed-out" | "failed", error?: unknown) => {
            if (process.env.OPENCODE_LOG_LEVEL !== "DEBUG") return
            writeSync(2, `CLI_SHUTDOWN ${JSON.stringify({ event: "cli.shutdown", level: "DEBUG", pid: process.pid, signal, status, elapsedMs: Date.now() - started, ...(error === undefined ? {} : { error: String(error) }) })}\n`)
          }
          debug("started")
          void Promise.race([
            AppRuntime.dispose().then(() => "disposed" as const),
            Bun.sleep(5_000).then(() => "timed-out" as const),
          ]).then((status) => debug(status), (error) => debug("failed", error)).finally(() => process.exit())
        })
      // yargs typing wraps Args in ArgumentsCamelCase<WithDoubleDash<...>>; cast at the boundary.
      const args = rawArgs as unknown as WithDoubleDash<Args>
      const run = async () => {
        const useInstance = typeof opts.instance === "function" ? opts.instance(args) : opts.instance !== false
        if (!useInstance) {
          await AppRuntime.runPromise(opts.handler(args))
          return
        }
        const { InstanceStore } = await import("@/project/instance-store")
        const { InstanceRef } = await import("@/effect/instance-ref")
        const directory = opts.directory?.(args) ?? process.cwd()
        const { store, ctx } = await AppRuntime.runPromise(
          InstanceStore.Service.use((store) => store.load({ directory }).pipe(Effect.map((ctx) => ({ store, ctx })))),
        )
        try {
          await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))
        } finally {
          await AppRuntime.runPromise(store.dispose(ctx))
        }
      }
      // After a signal disposed the runtime, the interrupted command is the expected outcome, not a failure.
      await run().catch((error) => {
        if (!signalled) throw error
      })
    },
  })
