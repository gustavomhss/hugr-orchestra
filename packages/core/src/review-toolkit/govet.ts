export * as ReviewGoVet from "./govet"

import path from "path"
import { mkdir } from "fs/promises"
import { Effect } from "effect"
import { ResearchProcess } from "../research-toolkit/process"
import { Probe } from "../research-toolkit/probe/types"
import type { ReviewAnalyze } from "./analyze"

// Design §7.4: `go vet` on the changed packages. The host fixes the argv. No extra vet flag, no install,
// no toolchain download, no module proxy. Caches stay in the scratch copy.

const TEMPLATE = "go-vet"
const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024

type Confine = ReviewAnalyze.Confine

/** Package args for changed Go files. A file at the module root is `.`; anything else is `./dir`. */
export function packages(files: readonly string[]) {
  return [...new Set(files.flatMap((file) => {
    if (!file.endsWith(".go") || file.split("/").includes("..")) return []
    const dir = path.posix.dirname(file)
    return [dir === "." ? "." : `./${dir}`]
  }))].sort()
}

/** Closed argv. The only arguments are `vet` and the host-chosen packages. */
export function argv(go: string, pkgs: readonly string[]) {
  return [go, "vet", ...pkgs]
}

export const run = Effect.fn("ReviewGoVet.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (context.input.lane !== "build") return finished(pack, "not-run", false, `lane: build is above ${context.input.lane}`)
  if (!context.input.trusted) return finished(pack, "not-run", false, "build lane off (D6)")
  if (pack.template !== TEMPLATE) return finished(pack, "not-run", false, "not-built")
  if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
  const pkgs = packages(Object.keys(context.input.changed))
  if (pkgs.length === 0) return finished(pack, "not-run", false, "target-missing: go")
  const head = yield* context.head
  if ("failed" in head) return finished(pack, "not-run", false, head.failed)
  const root = head.snapshot.root
  const env = ResearchProcess.environment()
  const go = Bun.which("go", { PATH: env.PATH ?? "" })
  if (!go) return finished(pack, "not-run", false, "go absent")
  // Inside the copy, which is discarded. A cache outside it is not a confine write.
  const cache = path.join(root, ".review-go-cache")
  yield* Effect.promise(() => mkdir(path.join(cache, "build"), { recursive: true }).then(() => mkdir(path.join(cache, "mod"), { recursive: true })))
  const command = argv(go, pkgs)
  const ran = yield* confine({
    argv: command,
    cwd: root,
    write: [root],
    env: {
      ...env,
      GOTOOLCHAIN: "local",
      GOPROXY: "off",
      GOFLAGS: "-mod=readonly",
      GOCACHE: path.join(cache, "build"),
      GOMODCACHE: path.join(cache, "mod"),
    },
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return finished(pack, "not-run", false, ran.denied)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${command.map((arg) => arg.split(cache).join("<scratch>")).join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write("raw/go-vet.log", text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, true, unsettled.reason, uri)
  if (ran.outcome.exitCode === 127) return finished(pack, "not-run", true, "go absent", uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", true, undefined, uri)
  return finished(pack, "fail", true, `exit ${ran.outcome.exitCode}`, uri)
})

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
