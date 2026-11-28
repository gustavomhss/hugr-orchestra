export * as ReviewScopedTypecheck from "./scoped-typecheck"

import path from "path"
import os from "os"
import { createHash } from "crypto"
import { mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { pathToFileURL } from "url"
import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import { ResearchToolkit } from "../research-toolkit"
import { ResearchProcess } from "../research-toolkit/process"
import { ProbeTypecheck } from "../research-toolkit/probe/typecheck"
import { Probe } from "../research-toolkit/probe/types"
import { ToolSafetySandbox } from "../tool-safety-sandbox"

export type Diagnostic = { readonly line: number; readonly column: number; readonly code: string }
export type Observation = {
  readonly status: "pass" | "fail"
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly recipe: { readonly template: "typescript-scoped-typecheck-v1"; readonly version: "6.0.3"; readonly target: "linux-x64"; readonly runtimeSha256: string; readonly compilerSha256: string; readonly configSha256: string }
  readonly diagnostics: readonly Diagnostic[]
}

const CONFIG = JSON.stringify({ compilerOptions: { strict: true, noEmit: true, noResolve: true, types: [] }, files: ["input.ts"] })
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")

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
  const oid = createHash(input.oid.length === 40 ? "sha1" : "sha256").update(`blob ${input.bytes.length}\0`).update(input.bytes).digest("hex")
  if (oid !== input.oid) return refused("input-identity")
  const text = new TextDecoder("utf-8", { fatal: true })
  const source = yield* Effect.try({ try: () => text.decode(input.bytes), catch: () => "invalid-utf8" }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (source === undefined) return refused("invalid-utf8")
  // This deliberately rejects more than module syntax, including escaped identifiers and all reference directives.
  if (/\\|\b(?:import|export|require|declare|module|namespace)\b|\/\/\//.test(source)) return refused("external-syntax")
  const state = (yield* ResearchToolkit.status("typescript"))[0]
  if (!state || state.status !== "ready" || state.version !== "6.0.3" || state.target !== "linux-x64") return refused("typescript-not-ready")
  const root = yield* ResearchToolkit.Root
  const runtimes = yield* BackendToolkit.Runtimes
  const node = path.join(root, "runtimes", "node", `${runtimes.node.version}-linux-x64`, runtimes.node.targets["linux-x64"].executable)
  const lib = path.join(state.directory, "node_modules", "typescript", "lib")
  const tsc = path.join(lib, "tsc.js")
  const implementation = path.join(lib, "_tsc.js")
  const api = path.join(lib, "typescript.js")
  const identity = yield* Effect.promise(async () => {
    const base = await realpath(root).catch(() => undefined)
    const paths = await Promise.all([node, tsc, implementation, api].map((file) => realpath(file).catch(() => undefined)))
    if (!base || paths.some((file) => !file || !file.startsWith(`${base}${path.sep}`))) return undefined
    const files = await Promise.all([node, tsc, implementation, api].map((file) => readFile(file).catch(() => undefined)))
    if (files.some((file) => !file)) return undefined
    return { runtime: hash(files[0]!), compiler: hash(Buffer.concat(files.slice(1) as Buffer[])) }
  })
  if (!identity) return refused("tool-identity")
  const parsed = yield* Effect.promise(async () => {
    const ts: typeof import("typescript") = await import(pathToFileURL(api).href)
    if (ts.version !== "6.0.3") return false
    const scan = ts.preProcessFile(source, true, true)
    return !scan.importedFiles.length && !scan.referencedFiles.length && !scan.typeReferenceDirectives.length && !scan.libReferenceDirectives.length && !scan.isLibFile
  }).pipe(Effect.catchDefect(() => Effect.succeed(false)))
  if (!parsed) return refused("external-syntax")
  const scratch = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "lucy-typecheck-")))
  return yield* Effect.gen(function* () {
    yield* Effect.promise(() => Promise.all([writeFile(path.join(scratch, "input.ts"), input.bytes), writeFile(path.join(scratch, "tsconfig.json"), CONFIG)]))
    const argv = ProbeTypecheck.argv({ node, tsc, project: path.join(scratch, "tsconfig.json"), heapMiB: Probe.Limits.heapMiB })
    const env = { PATH: "", HOME: scratch, LANG: "C", LC_ALL: "C" }
    const launch = yield* ToolSafetySandbox.confine({ command: argv[0], args: argv.slice(1), cwd: scratch, env, write: [] }).pipe(Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }))
    if (!launch) return refused("sandbox-unavailable")
    const outcome = yield* ResearchProcess.run({ command: launch.command, args: launch.args, cwd: scratch, env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), timeoutMs: 30_000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes })
    if (outcome.timedOut || outcome.memoryExceeded || outcome.overflow || outcome.failure || outcome.stdout.truncated || outcome.stderr.truncated || outcome.exitCode === null) return refused("process-incomplete")
    const stdout = outcome.stdout.data.toString("utf8")
    const stderr = outcome.stderr.data.toString("utf8")
    const found = diagnostics(stdout, outcome.exitCode, stderr)
    if (!found) return refused("inconsistent-diagnostics")
    return { status: outcome.exitCode === 0 ? "pass" as const : "fail" as const, exitCode: outcome.exitCode, stdout, stderr, diagnostics: found, recipe: { template: "typescript-scoped-typecheck-v1" as const, version: "6.0.3" as const, target: "linux-x64" as const, runtimeSha256: identity.runtime, compilerSha256: identity.compiler, configSha256: hash(CONFIG) } }
  }).pipe(Effect.ensuring(Effect.promise(() => rm(scratch, { recursive: true, force: true }))))
})
