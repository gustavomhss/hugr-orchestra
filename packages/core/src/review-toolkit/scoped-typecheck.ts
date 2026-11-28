export * as ReviewScopedTypecheck from "./scoped-typecheck"

import path from "path"
import os from "os"
import { createHash } from "crypto"
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import { ResearchToolkit } from "../research-toolkit"
import { ResearchProcess } from "../research-toolkit/process"
import { ProbeTypecheck } from "../research-toolkit/probe/typecheck"
import { Probe } from "../research-toolkit/probe/types"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ReviewProbe } from "./probe"

export type Diagnostic = { readonly line: number; readonly column: number; readonly code: string }
export type Observation = {
  readonly status: "pass" | "fail"
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly recipe: { readonly template: "typescript-scoped-typecheck-v1"; readonly version: "6.0.3"; readonly target: "linux-x64"; readonly runtimeSha256: string; readonly compilerSha256: string; readonly configSha256: string }
  readonly diagnostics: readonly Diagnostic[]
}

const CONFIG = JSON.stringify({ compilerOptions: { strict: true, noEmit: true, noResolve: true, target: "ES2022", module: "ESNext", types: [] }, files: ["input.ts"] })
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
export const configSha256 = hash(CONFIG)

/** Accept only complete, file-local tsc diagnostics and their indented continuations. */
export function diagnostics(stdout: string, exitCode: number, stderr: string): readonly Diagnostic[] | undefined {
  if (stderr) return undefined
  if (exitCode === 0) return stdout === "" ? [] : undefined
  if (exitCode !== 2 || !stdout.endsWith("\n")) return undefined
  const lines = stdout.slice(0, -1).split("\n")
  const result: Diagnostic[] = []
  for (const line of lines) {
    const found = /^input\.ts\(([1-9]\d*),([1-9]\d*)\): error (TS\d+): .+$/.exec(line)
    if (found) {
      result.push({ line: Number(found[1]), column: Number(found[2]), code: found[3] })
      continue
    }
    if (!result.length || !/^\s+\S/.test(line)) return undefined
  }
  return result.length ? result : undefined
}

export const run = Effect.fn("ReviewScopedTypecheck.run")(function* (input: { readonly path: string; readonly oid: string; readonly bytes: Uint8Array }) {
  const refused = (reason: string) => ({ status: "not-run" as const, reason })
  if (process.platform !== "linux" || process.arch !== "x64") return refused("unsupported-platform")
  if (!input.path.endsWith(".ts") || input.path.endsWith(".d.ts") || input.bytes.length > 65536) return refused("invalid-input")
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.oid)) return refused("invalid-oid")
  const bytes = Uint8Array.from(input.bytes)
  const oid = createHash(input.oid.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
  if (oid !== input.oid) return refused("input-identity")
  const text = new TextDecoder("utf-8", { fatal: true })
  const source = yield* Effect.try({ try: () => text.decode(bytes), catch: () => "invalid-utf8" }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (source === undefined) return refused("invalid-utf8")
  // This deliberately rejects more than module syntax, including escaped identifiers and all reference directives.
  if (/@ts-(?:no(?:check)?|ignore|expect-error)\b/i.test(source) || /\\|\b(?:import|require|declare|module|namespace)\b|\/\/\//.test(source)) return refused("external-syntax")
  const state = (yield* ResearchToolkit.status("typescript"))[0]
  if (!state || state.status !== "ready" || state.version !== "6.0.3") return refused("typescript-not-ready")
  const root = yield* ResearchToolkit.Root
  const runtimes = yield* BackendToolkit.Runtimes
  if (runtimes.node.version !== "22.23.2" || runtimes.node.targets["linux-x64"].executable !== "bin/node") return refused("node-version")
  const node = path.join(root, "runtimes", "node", "22.23.2-linux-x64", "bin/node")
  const lib = path.join(state.directory, "node_modules", "typescript", "lib")
  const tsc = path.join(lib, "tsc.js")
  const implementation = path.join(lib, "_tsc.js")
  const identify = async () => {
    const base = await realpath(root).catch(() => undefined)
    const library = await realpath(lib).catch(() => undefined)
    const runtime = await realpath(path.join(root, "runtimes", "node", "22.23.2-linux-x64")).catch(() => undefined)
    const engine = await realpath(state.directory).catch(() => undefined)
    const names = await readdir(lib).catch(() => undefined)
    if (!base || !library || !runtime || !engine || !runtime.startsWith(`${base}${path.sep}`) || !engine.startsWith(`${base}${path.sep}`) || !library.startsWith(`${engine}${path.sep}`) || !names) return undefined
    const libraries = names.filter((name) => /^lib(?:\.[a-z0-9.]+)?\.d\.ts$/.test(name)).sort()
    if (!libraries.includes("lib.d.ts")) return undefined
    const files = [node, tsc, implementation, ...libraries.map((name) => path.join(lib, name))]
    const paths = await Promise.all(files.map((file) => realpath(file).catch(() => undefined)))
    if (paths.some((file) => !file || !file.startsWith(`${base}${path.sep}`))) return undefined
    if (!paths[0]?.startsWith(`${runtime}${path.sep}`)) return undefined
    if (paths.slice(1).some((file) => !file?.startsWith(`${library}${path.sep}`))) return undefined
    const contents = await Promise.all(files.map((file) => readFile(file).catch(() => undefined)))
    if (contents.some((file) => !file)) return undefined
    const compiler = createHash("sha256")
    files.slice(1).forEach((file, index) => {
      const bytes = contents[index + 1]!
      compiler.update(`${path.basename(file)}\0${bytes.length}\0`).update(bytes)
    })
    return { runtime: hash(contents[0]!), compiler: compiler.digest("hex") }
  }
  const identity = yield* Effect.promise(identify)
  if (!identity) return refused("tool-identity")
  const { preProcessFile } = yield* Effect.promise(() => import("typescript"))
  const scan = preProcessFile(source, true, true)
  if (scan.importedFiles.length || scan.referencedFiles.length || scan.typeReferenceDirectives.length || scan.libReferenceDirectives.length || scan.isLibFile) return refused("external-syntax")
  return yield* Effect.scoped(Effect.gen(function* () {
    if (!(yield* ReviewProbe.acquireHostPermit(Probe.Limits.queueSeconds))) return refused("host-capacity")
    const scratch = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "lucy-typecheck-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    yield* Effect.promise(() => Promise.all([writeFile(path.join(scratch, "input.ts"), bytes), writeFile(path.join(scratch, "tsconfig.json"), CONFIG)]))
    const argv = ProbeTypecheck.argv({ node, tsc, project: path.join(scratch, "tsconfig.json"), heapMiB: Probe.Limits.heapMiB })
    const env = { PATH: "/usr/bin:/bin", HOME: scratch, LANG: "C", LC_ALL: "C" }
    const launch = yield* ToolSafetySandbox.confine({ command: argv[0], args: argv.slice(1), cwd: scratch, env, write: [], acquire: false }).pipe(Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }))
    if (!launch) return refused("sandbox-unavailable")
    const outcome = yield* ResearchProcess.run({ command: launch.command, args: launch.args, cwd: scratch, env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), timeoutMs: 30_000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes })
    if (outcome.timedOut || outcome.memoryExceeded || outcome.overflow || outcome.failure || outcome.stdout.truncated || outcome.stderr.truncated || outcome.exitCode === null) return refused("process-incomplete")
    const after = yield* Effect.promise(identify)
    if (!after || after.runtime !== identity.runtime || after.compiler !== identity.compiler) return refused("tool-identity-changed")
    const stdout = outcome.stdout.data.toString("utf8")
    const stderr = outcome.stderr.data.toString("utf8")
    const found = diagnostics(stdout, outcome.exitCode, stderr)
    if (!found) return refused(`inconsistent-diagnostics:exit-${outcome.exitCode}:stdout-${outcome.stdout.bytes}:stderr-${outcome.stderr.bytes}`)
    return { status: outcome.exitCode === 0 ? "pass" as const : "fail" as const, exitCode: outcome.exitCode, stdout, stderr, diagnostics: found, recipe: { template: "typescript-scoped-typecheck-v1" as const, version: "6.0.3" as const, target: "linux-x64" as const, runtimeSha256: identity.runtime, compilerSha256: identity.compiler, configSha256 } }
  }))
})
