import { resolve } from "node:path"
import { type GovernanceContext, requireValue } from "./contracts.ts"
export const PROCESS_BYTES = 512 * 1024
export async function processBytes(context: GovernanceContext, directory: string, argv: string[], stdin?: string, beforeSpawn?: () => Promise<void>) {
  await context.authorize({ effect: "process", paths: [directory], commands: [argv.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ")] })
  if (beforeSpawn) await beforeSpawn()
  const child = await Promise.resolve().then(() => Bun.spawn(argv, { cwd: directory, stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
  })).catch((error: unknown) => { throw new Error(`PROCESS_LAUNCH_FAILED: ${error instanceof Error ? error.message : String(error)}`) })
  const state = { timedOut: false }
  const timer = setTimeout(() => { state.timedOut = true; child.kill() }, 15000)
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    const state = { bytes: 0 }
    return Promise.resolve().then(async () => {
      while (true) {
        const next = await reader.read()
        if (next.done) return Buffer.concat(chunks)
        state.bytes += next.value.byteLength
        if (state.bytes > PROCESS_BYTES) { child.kill(); throw new Error("PROCESS_OUTPUT_OVERFLOW") }
        chunks.push(next.value)
      }
    }).finally(() => reader.releaseLock())
  }
  return Promise.all([collect(child.stdout), collect(child.stderr), child.exited]).then(([stdout, stderr, exitCode]) => {
    requireValue(!state.timedOut, `PROCESS_TIMEOUT: ${argv[0]}`)
    requireValue(exitCode === 0, `PROCESS_ACQUISITION_FAILED: ${argv[0]} (${exitCode}): ${stderr.toString("utf8").slice(0, 2048)}`)
    return stdout
  }).finally(async () => { clearTimeout(timer); await child.exited })
}
export async function processOutput(context: GovernanceContext, directory: string, argv: string[], stdin?: string, beforeSpawn?: () => Promise<void>) {
  return (await processBytes(context, directory, argv, stdin, beforeSpawn)).toString("utf8")
}
const gitPrefix = ["git", "--no-pager", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"]
export async function git(context: GovernanceContext, root: string, args: string[]) {
  return processOutput(context, root, [...gitPrefix, ...args])
}
export async function gitBytes(context: GovernanceContext, root: string, args: string[]) {
  return processBytes(context, root, [...gitPrefix, ...args])
}
// Git for Windows prints the toplevel with forward slashes; resolve() restores the native spelling.
export async function gitToplevel(context: GovernanceContext, root: string) {
  return resolve((await git(context, root, ["rev-parse", "--show-toplevel"])).trim())
}
export async function requireGitRoot(context: GovernanceContext, root: string) {
  requireValue(await gitToplevel(context, root) === root, "GIT_REPOSITORY_ROOT_OUTSIDE_CONTEXT")
}
