export * as ReviewSyft from "./syft"

import os from "os"
import path from "path"
import { mkdtemp, rm } from "fs/promises"
import { Effect, Option, Schema } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import pinned from "../backend-toolkit/packs/syft"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewTypeAware } from "./type-aware"
import type { ReviewAnalyze } from "./analyze"

// Closed review argv at tag v1.57.1, against the scratch copy only:
// `syft scan dir:<copy> --base-path <copy> -o syft-json`.
// Never --enrich, never an image or registry scheme, and the SBOM is not written into the copy.

const TEMPLATE = "syft-dir-json"
const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024
const LOCKFILE = new Set([
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "uv.lock",
  "poetry.lock",
  "pylock.toml",
  "go.sum",
])

type Launch = {
  readonly argv: ReadonlyArray<string>
  readonly cwd: string
  readonly write: ReadonlyArray<string>
  readonly env: Record<string, string>
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly tailBytes?: number
}
type Ran = { readonly outcome: ResearchProcess.Outcome } | { readonly denied: string }
type Confine<R> = (input: Launch) => Effect.Effect<Ran, never, R>

export function argv(bin: string, copy: string) {
  return [bin, "scan", `dir:${copy}`, "--base-path", copy, "-o", "syft-json"]
}

export function lockfiles(changed: readonly string[]) {
  return changed.filter(lockfile).sort()
}

export function run<R>(
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine<R>,
) {
  return Effect.gen(function* () {
    if (pack.template !== TEMPLATE) return finished(pack, "not-run", false, "not-built")
    if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
    if (lockfiles(Object.keys(context.input.changed)).length === 0) return finished(pack, "not-run", false, "target-missing: lockfile")
    const located = yield* binary()
    if (!located.ok) return finished(pack, "not-run", false, located.reason)
    const head = yield* context.head
    if ("failed" in head) return finished(pack, "not-run", false, head.failed)
    return yield* scan(pack, context.write, confine, located.executable, head.snapshot.root)
  })
}

export function scan<R>(
  pack: ReviewAnalyze.Pack,
  write: ReviewAnalyze.RunContext["write"],
  confine: Confine<R>,
  executable: string,
  copy: string,
) {
  return Effect.gen(function* () {
    const home = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "syft-")))
    return yield* Effect.gen(function* () {
      const command = argv(executable, copy)
      const ran = yield* confine({
        argv: command,
        cwd: home,
        write: [home],
        env: environment(home),
        timeoutMs: TIMEOUT_MS,
        maxBytes: OUTPUT_BYTES,
        tailBytes: Probe.Limits.outputBytes,
      })
      if ("denied" in ran) return finished(pack, "not-run", false, ran.denied)
      const stdout = ran.outcome.stdout.data.toString("utf8")
      const stderr = ran.outcome.stderr.data.toString("utf8")
      const text = [`$ ${command.join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
      const uri = yield* write("raw/syft.log", text)
      const unsettled = settle(ran.outcome)
      if (unsettled) return finished(pack, unsettled.status, true, unsettled.reason, uri)
      if (ran.outcome.exitCode === 0 && jsonObject(stdout)) return finished(pack, "pass", true, undefined, uri)
      return finished(pack, "acquisition-error", true, ran.outcome.exitCode === 0 ? "not-json-object" : `exit ${ran.outcome.exitCode}`, uri)
    }).pipe(Effect.ensuring(Effect.promise(() => rm(home, { recursive: true, force: true }))))
  })
}

export const binary = Effect.fnUntraced(function* () {
  if (process.platform !== "linux" || process.arch !== "x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const ready = yield* BackendToolkit.ensure<string>(pinned.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.map((installed) => installed.executable),
    Effect.catch((error) => Effect.succeed(error)),
  )
  if (typeof ready !== "string") return { ok: false as const, reason: `${pinned.id} absent: ${cause(ready)}` }
  return { ok: true as const, executable: ready }
})

function environment(home: string) {
  const inherited = Object.fromEntries(Object.entries(ResearchProcess.environment()).filter(([key]) => !key.startsWith("SYFT_")))
  return {
    ...inherited,
    SYFT_CHECK_FOR_APP_UPDATE: "false",
    HOME: home,
    XDG_CONFIG_HOME: home,
  }
}

function lockfile(file: string) {
  return !file.split("/").includes("..") && !file.includes("\0") && LOCKFILE.has(path.posix.basename(file))
}

function jsonObject(text: string) {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(decoded)) return false
  return typeof decoded.value === "object" && decoded.value !== null && !Array.isArray(decoded.value)
}

function cause(error: unknown) {
  if (error && typeof error === "object" && "reason" in error && typeof error.reason === "string") return error.reason
  return "fetch-failed"
}

function settle(outcome: ResearchProcess.Outcome) {
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory cap" }
  if (outcome.overflow) return { status: "acquisition-error" as const, reason: "output cap" }
  if (outcome.failure !== undefined) return { status: "acquisition-error" as const, reason: outcome.failure }
  return undefined
}

function finished(
  pack: ReviewAnalyze.Pack,
  status: ReviewAnalyze.Status,
  workspaceExecuted: boolean,
  reason?: string,
  uri?: string,
): ReviewAnalyze.Outcome {
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version: pack.version,
      lane: pack.lane,
      status,
      ...(reason === undefined ? {} : { reason }),
      workspaceExecuted,
      ...(uri === undefined ? {} : { uri }),
    }],
    head: [],
    base: [],
  }
}
