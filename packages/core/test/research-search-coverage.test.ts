import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// Frozen against docs/specs/lucy/search-completeness-contract.md. Every observed result comes from the
// real AppProcess. The cap case changes only the secondary stdout ceiling, never command or output.
const it = testEffect(LayerNode.compile(LayerNode.group([
  AppProcess.node,
  RipgrepBinary.nodeWith({ download: false }),
])))
const input = { pattern: "needle", paths: ["**"], limit: 20, offset: 0, context: 0 }
const cap = 8 * 1024 * 1024

type Call = {
  readonly command: ChildProcess.Command
  readonly requested: AppProcess.RunOptions | undefined
  readonly forwarded: AppProcess.RunOptions | undefined
  readonly result: AppProcess.RunResult
}

const NativeEvent = Schema.fromJsonString(Schema.Struct({
  type: Schema.String,
  data: Schema.Struct({
    path: Schema.optional(Schema.Struct({ text: Schema.optional(Schema.String) })),
    line_number: Schema.optional(Schema.Number),
    lines: Schema.optional(Schema.Struct({ text: Schema.optional(Schema.String) })),
    binary_offset: Schema.optional(Schema.NullOr(Schema.Number)),
  }),
}))
const decode = Schema.decodeUnknownSync(NativeEvent)
const normalize = (file: string) => file.replace(/^(?:\.[\\/])+/u, "").replaceAll("\\", "/")

const withTree = <A, E, R>(files: Record<string, string>, use: (cwd: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(async () => {
      for (const [file, bytes] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(tmp.path, file)), { recursive: true })
        await fs.writeFile(path.join(tmp.path, file), bytes)
      }
    }).pipe(Effect.andThen(use(tmp.path))),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const runtime = Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const binary = yield* RipgrepBinary.Service
  const executable = yield* binary.filepath
  const version = yield* processes.run(ChildProcess.make(executable, ["--version"], {
    extendEnv: true, stdin: "ignore",
  }), { maxOutputBytes: 4096, maxErrorBytes: 4096 })
  expect(version.exitCode).toBe(0)
  expect(version.stdoutTruncated || version.stderrTruncated || version.outputTruncated === true).toBe(false)
  expect(version.stdout.toString("utf8")).toMatch(/^ripgrep \S+/u)
  console.info("[CodeSearch runtime]", JSON.stringify({
    executable, version: version.stdout.toString("utf8").trim(), platform: process.platform, arch: process.arch,
  }))
  return { processes, executable }
})

function observe(real: AppProcess.Interface, secondaryCap?: number) {
  const calls: Call[] = []
  return {
    calls,
    service: AppProcess.Service.of({
      ...real,
      run: (command, options) => {
        const secondary = command._tag === "StandardCommand" && command.args.includes("--files-with-matches")
        const forwarded = secondary && secondaryCap !== undefined ? { ...options, maxOutputBytes: secondaryCap } : options
        return real.run(command, forwarded).pipe(Effect.tap((result) => Effect.sync(() => {
          calls.push({ command, requested: options, forwarded, result })
          console.info("[CodeSearch native]", JSON.stringify({
            command: command._tag === "StandardCommand" ? command.command : command._tag,
            args: command._tag === "StandardCommand" ? command.args : [],
            requested: { stdout: options?.maxOutputBytes, stderr: options?.maxErrorBytes },
            forwarded: { stdout: forwarded?.maxOutputBytes, stderr: forwarded?.maxErrorBytes },
            exitCode: result.exitCode, stdoutBytes: result.stdout.length, stderr: result.stderr.toString("utf8"),
            stdoutTruncated: result.stdoutTruncated, stderrTruncated: result.stderrTruncated,
            outputTruncated: result.outputTruncated ?? false,
          }))
        })))
      },
    }),
  }
}

function only(calls: ReadonlyArray<Call>, secondary: boolean) {
  expect(calls).toHaveLength(2)
  const selected = calls.filter((call) => call.command._tag === "StandardCommand" &&
    call.command.args.includes("--files-with-matches") === secondary)
  expect(selected).toHaveLength(1)
  const call = selected[0]
  if (!call || call.command._tag !== "StandardCommand") throw new Error("missing actual ripgrep invocation")
  expect(call.command.args.slice(-2)).toEqual(["--", "."])
  expect(call.requested?.maxOutputBytes).toBe(cap)
  expect(call.requested?.maxErrorBytes).toBe(8 * 1024)
  return { ...call, command: call.command }
}

function complete(call: Call, exitCode = 0) {
  expect(call.result.exitCode).toBe(exitCode)
  expect(call.result.stdoutTruncated).toBe(false)
  expect(call.result.stderrTruncated).toBe(false)
  expect(call.result.outputTruncated ?? false).toBe(false)
}

function events(call: Call) {
  return call.result.stdout.toString("utf8").split(/\r?\n/u).filter(Boolean).map((row) => decode(row))
}

function paths(call: ReturnType<typeof only>) {
  // Observe the framing that the real command requested: baseline LF and corrected --null both remain native.
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(call.result.stdout)
  if (!text) return []
  const nul = call.command.args.includes("--null")
  expect(text.endsWith(nul ? "\0" : "\n")).toBe(true)
  const names = (nul ? text.slice(0, -1).split("\0") : text.trimEnd().split(/\r?\n/u)).map(normalize)
  expect(names.every((name) => name.length > 0)).toBe(true)
  return names.toSorted()
}

describe("CodeSearch native binary completeness", () => {
  it.live("text matches and a nonmatching NUL file stay complete, including a clean zero", () => {
    expectSpawn(import.meta.path)
    return withTree({
      "a.ts": "needle-one\n",
      "b.ts": "padding\nneedle-two\n",
      "needle-name.bin": "unrelated\0bytes\n",
    }, (cwd) => Effect.gen(function* () {
      const host = yield* runtime
      const observed = observe(host.processes)
      const result = yield* CodeSearch.run(input, { cwd }).pipe(Effect.provideService(AppProcess.Service, observed.service))
      const primary = only(observed.calls, false)
      const secondary = only(observed.calls, true)
      complete(primary)
      complete(secondary)
      expect(primary.command.command).toBe(host.executable)
      expect(secondary.command.command).toBe(host.executable)
      expect(paths(secondary)).toEqual(["a.ts", "b.ts"])
      expect(events(primary).filter((row) => row.type === "match").map((row) => normalize(row.data.path?.text ?? "")))
        .toEqual(["a.ts", "b.ts"])
      expect(result.matches.map((match) => `${match.path}:${match.line}`)).toEqual(["a.ts:1", "b.ts:2"])
      expect(result.basis.coverage.binariesSkipped).toBe(0)
      expect(result.basis.coverage.complete).toBe(true)
      expect(result.basis.coverage.skipped).toEqual([])
      expect(result.next).toBeUndefined()
      expect(result.basis.bounds.truncated).toBe(false)

      const zeroObserved = observe(host.processes)
      const zero = yield* CodeSearch.run({ ...input, pattern: "absent" }, { cwd })
        .pipe(Effect.provideService(AppProcess.Service, zeroObserved.service))
      complete(only(zeroObserved.calls, false), 1)
      const zeroProbe = only(zeroObserved.calls, true)
      complete(zeroProbe, 1)
      expect(paths(zeroProbe)).toEqual([])
      expect(zero.matches).toEqual([])
      expect(zero.basis.coverage.binariesSkipped).toBe(0)
      expect(zero.basis.coverage.complete).toBe(true)
      expect(zero.next).toBeUndefined()
      expect(zero.basis.bounds.truncated).toBe(false)
    }))
  })

  it.live("an actual early binary match keeps its count and makes the search incomplete", () => {
    expectSpawn(import.meta.path)
    return withTree({ "a-seed.ts": "needle seed\n", "b-early.bin": "needle\0tail\n" }, (cwd) => Effect.gen(function* () {
      const host = yield* runtime
      const observed = observe(host.processes)
      const result = yield* CodeSearch.run(input, { cwd }).pipe(Effect.provideService(AppProcess.Service, observed.service))
      const primary = only(observed.calls, false)
      const secondary = only(observed.calls, true)
      complete(primary)
      complete(secondary)
      expect(events(primary).filter((row) => row.type === "match").map((row) => normalize(row.data.path?.text ?? "")))
        .toEqual(["a-seed.ts"])
      expect(paths(secondary)).toEqual(["a-seed.ts", "b-early.bin"])
      expect(result.matches.map((match) => `${match.path}:${match.line}`)).toEqual(["a-seed.ts:1"])
      expect(result.basis.coverage.binariesSkipped).toBe(1)
      expect(result.next).toBeUndefined()
      expect(result.basis.bounds.truncated).toBe(false)
      expect(result.basis.coverage.complete).toBe(false)
    }))
  })

  it.live("a real match before late NUL detection remains visible and counts as unresolved binary coverage", () => {
    expectSpawn(import.meta.path)
    const before = `needle-before\n${"padding\n".repeat(40_000)}`
    expect(Buffer.byteLength(before)).toBeGreaterThan(256 * 1024)
    return withTree({ "a-seed.ts": "needle seed\n", "b-late.bin": `${before}\0needle-after\n` }, (cwd) => Effect.gen(function* () {
      const host = yield* runtime
      const observed = observe(host.processes)
      const result = yield* CodeSearch.run(input, { cwd }).pipe(Effect.provideService(AppProcess.Service, observed.service))
      const primary = only(observed.calls, false)
      const secondary = only(observed.calls, true)
      complete(primary)
      complete(secondary)
      const rows = events(primary)
      const lateMatches = rows.filter((row) => row.type === "match" && normalize(row.data.path?.text ?? "") === "b-late.bin")
      expect(lateMatches.map((row) => ({ line: row.data.line_number, text: row.data.lines?.text })))
        .toEqual([{ line: 1, text: "needle-before\n" }])
      const ends = rows.filter((row) => row.type === "end" && normalize(row.data.path?.text ?? "") === "b-late.bin")
      expect(ends).toHaveLength(1)
      const offset = ends[0]?.data.binary_offset
      expect(typeof offset).toBe("number")
      if (typeof offset !== "number") throw new Error("native ripgrep did not report late binary detection")
      expect(offset).toBeGreaterThan(256 * 1024)
      console.info("[CodeSearch late binary]", JSON.stringify({ matches: lateMatches, binaryOffset: offset }))
      expect(paths(secondary)).toEqual(["a-seed.ts", "b-late.bin"])
      expect(result.matches.map((match) => ({ path: match.path, line: match.line, text: match.text }))).toEqual([
        { path: "a-seed.ts", line: 1, text: "needle seed" },
        { path: "b-late.bin", line: 1, text: "needle-before" },
      ])
      expect(result.next).toBeUndefined()
      expect(result.basis.bounds.truncated).toBe(false)
      expect(result.basis.coverage.binariesSkipped).toBe(1)
      expect(result.basis.coverage.complete).toBe(false)
    }))
  })

  it.live("real secondary stdout truncation preserves primary matches and reports uncertified binary coverage", () => {
    expectSpawn(import.meta.path)
    return withTree({ "a-regular.ts": "needle first\n", "b-regular.ts": "needle second\n" }, (cwd) => Effect.gen(function* () {
      const host = yield* runtime
      const options = { cwd, signal: new AbortController().signal }
      const ordinary = observe(host.processes)
      const control = yield* CodeSearch.run(input, options).pipe(Effect.provideService(AppProcess.Service, ordinary.service))
      const ordinaryPrimary = only(ordinary.calls, false)
      const ordinarySecondary = only(ordinary.calls, true)
      complete(ordinaryPrimary)
      complete(ordinarySecondary)
      expect(paths(ordinarySecondary)).toEqual(["a-regular.ts", "b-regular.ts"])
      expect(control.matches.map((match) => match.path)).toEqual(["a-regular.ts", "b-regular.ts"])
      expect(control.basis.coverage.binariesSkipped).toBe(0)
      expect(control.basis.coverage.complete).toBe(true)
      expect(control.basis.coverage.skipped).toEqual([])

      const capped = observe(host.processes, 1)
      const result = yield* CodeSearch.run(input, options).pipe(Effect.provideService(AppProcess.Service, capped.service))
      const primary = only(capped.calls, false)
      const secondary = only(capped.calls, true)
      complete(primary)
      expect(primary.command.command).toBe(ordinaryPrimary.command.command)
      expect(primary.command.args).toEqual(ordinaryPrimary.command.args)
      expect(primary.command.options).toEqual(ordinaryPrimary.command.options)
      expect(primary.forwarded).toBe(primary.requested)
      expect(secondary.command.command).toBe(ordinarySecondary.command.command)
      expect(secondary.command.args).toEqual(ordinarySecondary.command.args)
      expect(secondary.command.options).toEqual(ordinarySecondary.command.options)
      expect(secondary.requested).toEqual(ordinarySecondary.requested)
      expect(secondary.forwarded?.maxOutputBytes).toBe(1)
      expect({ ...secondary.forwarded, maxOutputBytes: secondary.requested?.maxOutputBytes }).toEqual(secondary.requested)
      expect(secondary.forwarded?.signal).toBe(options.signal)
      expect(secondary.result.exitCode).toBe(0)
      expect(secondary.result.stdoutTruncated).toBe(true)
      expect(secondary.result.stdout.length).toBe(1)
      expect(secondary.result.stderrTruncated).toBe(false)
      expect(secondary.result.outputTruncated ?? false).toBe(false)
      expect(result.matches).toEqual(control.matches)
      expect(result.next).toBe(control.next)
      expect(result.basis.bounds).toEqual(control.basis.bounds)
      expect(result.basis.coverage.complete).toBe(false)
      expect(result.basis.coverage.binariesSkipped).toBe(0)
      expect(result.basis.coverage.skipped).toEqual([
        { path: ".", reason: "ripgrep binary coverage output ceiling reached" },
      ])
    }))
  })

  it.live("a real invalid glob makes the secondary exit a named failure after an ordinary positive", () => {
    expectSpawn(import.meta.path)
    return withTree({ "seed.ts": "needle seed\n" }, (cwd) => Effect.gen(function* () {
      const host = yield* runtime
      const ordinary = observe(host.processes)
      const control = yield* CodeSearch.run(input, { cwd }).pipe(Effect.provideService(AppProcess.Service, ordinary.service))
      complete(only(ordinary.calls, false))
      const ordinarySecondary = only(ordinary.calls, true)
      complete(ordinarySecondary)
      expect(paths(ordinarySecondary)).toEqual(["seed.ts"])
      expect(control.matches.map((match) => `${match.path}:${match.line}`)).toEqual(["seed.ts:1"])
      expect(control.basis.coverage.complete).toBe(true)

      const observed = observe(host.processes)
      const result = yield* CodeSearch.run({ ...input, paths: ["[z-a]"] }, { cwd })
        .pipe(Effect.provideService(AppProcess.Service, observed.service), Effect.result)
      const primary = only(observed.calls, false)
      const secondary = only(observed.calls, true)
      expect(primary.command.args).toContain("--glob=[z-a]")
      expect(secondary.command.args).toContain("--glob=[z-a]")
      expect(primary.forwarded).toBe(primary.requested)
      expect(secondary.forwarded).toBe(secondary.requested)
      complete(primary, 2)
      complete(secondary, 2)
      const stderr = secondary.result.stderr.toString("utf8").trim()
      expect(stderr.length).toBeGreaterThan(0)
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("secondary exit 2 was returned as successful coverage")
      expect(result.failure).toBeInstanceOf(CodeSearch.Failure)
      expect(result.failure.reason).toBe("search_failed")
      expect(result.failure.message).toBe(`ripgrep binary coverage probe exited 2: ${stderr}`)
    }))
  })
})
