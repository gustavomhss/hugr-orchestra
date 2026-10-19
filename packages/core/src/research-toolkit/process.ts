export * as ResearchProcess from "./process"

import { Duration, Effect, Option, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../process"
import { OmniSpawner } from "../omni-spawner"
import { ToolSafetySandbox } from "../tool-safety-sandbox"

// T-P1, from A/engine/process.ts:13-14: the research seat's fixed processes (history, indexer, probe) run with a
// sanitized environment, a timeout, bounded capture and named outcomes, always through AppProcess (omni under its flag).

// CI=true and ORCHESTRA_LOCAL_TESTS=1 switch off script/test-guard.ts; the host never hands a child either (J4.8).
const STRIPPED = ["NODE_OPTIONS", "NODE_PATH", "ORCHESTRA_LOCAL_TESTS", "CI"]

export function environment(input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(ToolSafetySandbox.environment(input)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("GIT_") && !STRIPPED.includes(entry[0]))),
    GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  }
}

export type Captured = { readonly data: Buffer; readonly bytes: number; readonly truncated: boolean }

export type Outcome = {
  readonly exitCode: number | null
  readonly durationMs: number
  readonly timedOut: boolean
  /** A stream passed maxBytes; the process was stopped there. */
  readonly overflow: boolean
  /** The tree went over maxRssBytes and omni killed it. */
  readonly memoryExceeded: boolean
  /** The process could not be started or supervised. */
  readonly failure?: string
  readonly stdout: Captured
  readonly stderr: Captured
}

export class Failed extends Schema.TaggedErrorClass<Failed>()("ResearchProcess.Failed", {
  command: Schema.String,
  detail: Schema.String,
}) {}

class Overflow extends Schema.TaggedErrorClass<Overflow>()("ResearchProcess.Overflow", {}) {}

/** Runs one fixed command. Each stream keeps its last `tailBytes` (default all of `maxBytes`); past `maxBytes` the run stops. */
export const run = Effect.fn("ResearchProcess.run")(function* (input: {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Record<string, string>
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly tailBytes?: number
  /** Resident bytes of the whole tree; omni kills it above (J4.7). */
  readonly maxRssBytes?: number
}) {
  const processes = yield* AppProcess.Service
  const started = Date.now()
  const stdout = sink(input.tailBytes ?? input.maxBytes)
  const stderr = sink(input.tailBytes ?? input.maxBytes)
  const settled = yield* Effect.scoped(Effect.gen(function* () {
    const handle = yield* processes.spawn(ChildProcess.make(input.command, [...input.args], {
      cwd: input.cwd, env: input.env, extendEnv: false, stdin: "ignore",
    })).pipe(Effect.provideService(OmniSpawner.MemoryCap, input.maxRssBytes))
    const all = yield* Effect.all([drain(handle.stdout, stdout, input.maxBytes), drain(handle.stderr, stderr, input.maxBytes), handle.exitCode],
      { concurrency: "unbounded" })
    return { exitCode: Number(all[2]) as number | null, timedOut: false, overflow: false, memoryExceeded: false, failure: undefined as string | undefined }
  })).pipe(
    // Closing the scope stops the child; omni stops its whole tree.
    Effect.timeoutOption(Duration.millis(input.timeoutMs)),
    Effect.map(Option.getOrElse(() => ({ exitCode: null, timedOut: true, overflow: false, memoryExceeded: false, failure: undefined }))),
    Effect.catch((error) => Effect.succeed(error instanceof Overflow
      ? { exitCode: null, timedOut: false, overflow: true, memoryExceeded: false, failure: undefined }
      : memory(error)
        ? { exitCode: null, timedOut: false, overflow: false, memoryExceeded: true, failure: undefined }
        : { exitCode: null, timedOut: false, overflow: false, memoryExceeded: false, failure: error.message })),
  )
  return { ...settled, durationMs: Date.now() - started, stdout: stdout.captured(), stderr: stderr.captured() } satisfies Outcome
})

/** A host-side git read with the sanitized environment; non-zero exit fails with its stderr. */
export const git = Effect.fn("ResearchProcess.git")(function* (cwd: string, args: ReadonlyArray<string>) {
  const outcome = yield* run({ command: "git", args: ["-C", cwd, ...args], cwd, env: environment(), timeoutMs: 120_000, maxBytes: 256 * 1024 * 1024 })
  if (outcome.exitCode === 0) return outcome.stdout.data
  return yield* new Failed({
    command: `git ${args.join(" ")}`,
    detail: outcome.failure ?? (outcome.timedOut ? "timed out" : outcome.overflow ? "output cap" : outcome.stderr.data.toString("utf8").trim()),
  })
})

// Omni fails the exit code with a PlatformError whose cause chain holds MemoryExceeded.
function memory(error: unknown): boolean {
  if (error instanceof OmniSpawner.MemoryExceeded) return true
  return error instanceof Error && error.cause !== undefined && memory(error.cause)
}

function sink(keep: number) {
  const state = { chunks: [] as Uint8Array[], kept: 0, bytes: 0 }
  return {
    push(chunk: Uint8Array) {
      state.bytes += chunk.length
      state.chunks.push(chunk)
      state.kept += chunk.length
      // Trim only when twice over, so a chatty child does not pay a copy per chunk.
      if (state.kept <= keep * 2) return
      const tail = Buffer.concat(state.chunks).subarray(-keep)
      state.chunks = [tail]
      state.kept = tail.length
    },
    get bytes() {
      return state.bytes
    },
    captured(): Captured {
      const data = Buffer.concat(state.chunks).subarray(-keep)
      return { data, bytes: state.bytes, truncated: state.bytes > data.length }
    },
  }
}

const drain = <E>(stream: Stream.Stream<Uint8Array, E>, into: ReturnType<typeof sink>, max: number) =>
  Stream.runForEach(stream, (chunk) => {
    if (into.bytes + chunk.length > max) return Effect.fail(new Overflow())
    into.push(chunk)
    return Effect.void
  })
