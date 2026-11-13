import { expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { NativeRegex } from "@orchestra/codemode"
import { CodeModeNativeRegex } from "../src/codemode-native-regex"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { Omni } from "../src/omni"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const undefinedCapture = { kind: "undefined" }
const a = { kind: "text", value: "a" }
const matched = { captures: [a, a, undefinedCapture], index: 2, groups: { word: a } }
const cases: Array<{ name: string; request: NativeRegex.Request; state: NativeRegex.State; result: unknown }> = [
  {
    name: "construct canonical flags and empty source",
    request: { version: 1, operation: "construct", pattern: "", flags: "ig" },
    state: { source: "(?:)", flags: "gi", lastIndex: 0 }, result: { kind: "constructed" },
  },
  {
    name: "test advances global lastIndex in UTF-16 units",
    request: { version: 1, operation: "test", regex: { source: "a", flags: "g", lastIndex: 2 }, subject: "😀a" },
    state: { source: "a", flags: "g", lastIndex: 3 }, result: { kind: "boolean", value: true },
  },
  {
    name: "exec retains undefined captures and named groups",
    request: { version: 1, operation: "exec", regex: { source: "(?<word>a)(b)?", flags: "g", lastIndex: 0 }, subject: "😀a" },
    state: { source: "(?<word>a)(b)?", flags: "g", lastIndex: 3 }, result: { kind: "match", value: matched },
  },
  {
    name: "nonglobal match retains match metadata and lastIndex",
    request: { version: 1, operation: "match", regex: { source: "(?<word>a)(b)?", flags: "", lastIndex: 7 }, subject: "😀a" },
    state: { source: "(?<word>a)(b)?", flags: "", lastIndex: 7 }, result: { kind: "match", value: matched },
  },
  {
    name: "global match returns strings and resets lastIndex",
    request: { version: 1, operation: "match", regex: { source: "a", flags: "g", lastIndex: 7 }, subject: "aa" },
    state: { source: "a", flags: "g", lastIndex: 0 }, result: { kind: "strings", value: ["a", "a"] },
  },
  {
    name: "matchAll clones and preserves original lastIndex",
    request: { version: 1, operation: "matchAll", regex: { source: "a", flags: "g", lastIndex: 2 }, subject: "a😀a" },
    state: { source: "a", flags: "g", lastIndex: 2 }, result: { kind: "matches", value: [{ captures: [a], index: 3 }] },
  },
  {
    name: "search restores lastIndex",
    request: { version: 1, operation: "search", regex: { source: "a", flags: "g", lastIndex: 7 }, subject: "😀a" },
    state: { source: "a", flags: "g", lastIndex: 7 }, result: { kind: "number", value: 2 },
  },
  {
    name: "split preserves undefined separators, uint32 limit and lastIndex",
    request: { version: 1, operation: "split", regex: { source: "(,)|(x)", flags: "g", lastIndex: 7 }, subject: "a,b", limit: 3 },
    state: { source: "(,)|(x)", flags: "g", lastIndex: 7 },
    result: { kind: "split", value: [a, { kind: "text", value: "," }, undefinedCapture] },
  },
  ...(["replace", "replaceAll"] as const).map((operation) => ({
    name: `${operation} applies native replacement syntax`,
    request: { version: 1 as const, operation, regex: { source: "(a)", flags: "g", lastIndex: 7 }, subject: "😀a", replacement: "[$1]" },
    state: { source: "(a)", flags: "g", lastIndex: 0 }, result: { kind: "string", value: "😀[a]" },
  })),
  ...(["collectReplace", "collectReplaceAll"] as const).map((operation) => ({
    name: `${operation} enumerates callback arguments without repeating subject`,
    request: { version: 1 as const, operation, regex: { source: "(?<word>a)?b", flags: "g", lastIndex: 7 }, subject: "😀b ab" },
    state: { source: "(?<word>a)?b", flags: "g", lastIndex: 0 },
    result: { kind: "replacements", value: [
      { match: "b", offset: 2, captures: [undefinedCapture], groups: { word: undefinedCapture } },
      { match: "ab", offset: 4, captures: [a], groups: { word: a } },
    ] },
  })),
  {
    name: "empty Unicode matchAll advances by code point and preserves lastIndex",
    request: { version: 1, operation: "matchAll", regex: { source: "(?:)", flags: "gu", lastIndex: 0 }, subject: "😀" },
    state: { source: "(?:)", flags: "gu", lastIndex: 0 }, result: { kind: "matches", value: [
      { captures: [{ kind: "text", value: "" }], index: 0 }, { captures: [{ kind: "text", value: "" }], index: 2 },
    ] },
  },
  {
    name: "sticky exec starts at the supplied index",
    request: { version: 1, operation: "exec", regex: { source: "a", flags: "y", lastIndex: 2 }, subject: "😀a" },
    state: { source: "a", flags: "y", lastIndex: 3 }, result: { kind: "match", value: { captures: [a], index: 2 } },
  },
  {
    name: "failed sticky exec resets lastIndex",
    request: { version: 1, operation: "exec", regex: { source: "a", flags: "y", lastIndex: 1 }, subject: "😀a" },
    state: { source: "a", flags: "y", lastIndex: 0 }, result: { kind: "match", value: null },
  },
  {
    name: "wire preserves blocked named groups for parent-side filtering",
    request: { version: 1, operation: "exec", regex: { source: "(?<constructor>a)", flags: "", lastIndex: 0 }, subject: "a" },
    state: { source: "(?<constructor>a)", flags: "", lastIndex: 0 },
    result: { kind: "match", value: { captures: [a, a], index: 0, groups: { constructor: a } } },
  },
]

// Provider boundary only: real AppProcess/Omni and child native operations, no interpreter or callback parity claim.
for (const entry of cases) {
  it.live(`isolated native regex provider: ${entry.name}`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const provider = yield* CodeModeNativeRegex.make
    const before = Omni.snapshot().spawns
    const reply = NativeRegex.decodeReply(entry.request, yield* provider.run(entry.request, 5000))
    expect<unknown>(reply).toEqual({ version: 1, ok: true, operation: entry.request.operation, regex: entry.state, result: entry.result })
    expect(Omni.snapshot().spawns).toBeGreaterThan(before)
  }))
}

it.live("isolated native regex provider returns catchable constructor SyntaxError", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const provider = yield* CodeModeNativeRegex.make
  const request: NativeRegex.Request = { version: 1, operation: "construct", pattern: "[", flags: "" }
  const reply = NativeRegex.decodeReply(request, yield* provider.run(request, 5000))
  expect(reply.ok).toBe(false)
  if (reply.ok) throw new Error("Expected native constructor failure reply")
  expect(reply.name).toBe("SyntaxError")
  expect(reply.message.length).toBeGreaterThan(0)
}))

it.live("isolated native regex provider refuses explicit Omni off without fallback", Effect.gen(function* () {
  const previous = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
  yield* Effect.acquireUseRelease(
    Effect.sync(() => { process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "0" }),
    () => Effect.gen(function* () {
      const provider = yield* CodeModeNativeRegex.make
      const before = Omni.snapshot().spawns
      const outcome = yield* provider.run({ version: 1, operation: "construct", pattern: "a", flags: "" }, 5000).pipe(Effect.exit)
      expect(Exit.isFailure(outcome)).toBe(true)
      if (Exit.isSuccess(outcome)) throw new Error("Expected explicit Omni refusal")
      expect(Cause.pretty(outcome.cause)).toMatch(/omni.*(off|disabled|unavailable)/i)
      expect(Omni.snapshot().spawns).toBe(before)
    }),
    () => Effect.sync(() => {
      if (previous === undefined) delete process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
      else process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = previous
    }),
  )
}))
