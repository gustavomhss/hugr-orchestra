import type { Readable, Writable } from "node:stream"
import { Effect, Exit, Scope } from "effect"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { Process } from "@/util/process"

/** A language server process: Process.Child with all three pipes (legacy ChildProcess or the omni adapter). */
export type Child = Process.Child & { stdin: Writable; stdout: Readable; stderr: Readable }

export function spawn(cmd: string, args: string[], opts?: Process.Options): Child
export function spawn(cmd: string, opts?: Process.Options): Child
export function spawn(cmd: string, argsOrOpts?: string[] | Process.Options, opts?: Process.Options) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : []
  const cfg = Array.isArray(argsOrOpts) ? opts : argsOrOpts
  const proc = Process.spawn([cmd, ...args], {
    ...cfg,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  }) as Child

  if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available")

  return proc
}

/**
 * Built-in language servers run workspace-controlled code (binaries, configs, plugins, build scripts), so they start
 * only inside ToolSafetySandbox.confine. Where it refuses, the launch rejects with its ToolSafety.Denied reason.
 */
export async function confined(cmd: string, args: string[], opts?: Process.Options): Promise<Child>
export async function confined(cmd: string, opts?: Process.Options): Promise<Child>
export async function confined(cmd: string, argsOrOpts?: string[] | Process.Options, opts?: Process.Options) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : []
  const cfg = (Array.isArray(argsOrOpts) ? opts : argsOrOpts) ?? {}
  const scope = Scope.makeUnsafe()
  const close = () => Effect.runPromise(Scope.close(scope, Exit.void))
  const launch = await Effect.runPromise(
    ToolSafetySandbox.confine({ command: cmd, args, cwd: cfg.cwd ?? process.cwd(), env: cfg.env ?? process.env }).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  ).catch(async (error) => {
    await close()
    throw error
  })
  const proc = await Promise.resolve()
    .then(() => spawn(launch.command, launch.args, { ...cfg, env: launch.env }))
    .catch(async (error) => {
      await close()
      throw error
    })
  void proc.exited.finally(close)
  return proc
}
