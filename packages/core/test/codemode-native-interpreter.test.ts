import { expect } from "bun:test"
import { Context, Effect, Schema } from "effect"
import { CodeMode, Tool } from "@orchestra/codemode"
import { CodeModeNativeRegex } from "../src/codemode-native-regex"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { Omni } from "../src/omni"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const limits = { timeoutMs: 10_000 }
class Witness extends Context.Service<Witness, { label: string }>()("NativeInterpreterWitness") {}

// Public interpreter parity, with actual Core provider children. This does not qualify a production caller.
const cases = [
  {
    name: "literal, constructor and copy constructor reset only the copied index",
    code: String.raw`const r = /a/g; const hit = r.exec("aa"); const copy = new RegExp(r);
      const changed = new RegExp(r, "i"); const made = new RegExp("", "ig");
      return [hit.index, r.lastIndex, copy.lastIndex, copy.source, copy.flags,
        changed.flags, changed.lastIndex, made.source, made.flags, copy.test("a")];`,
    expected: [0, 1, 0, "a", "g", "i", 0, "(?:)", "gi", true],
  },
  {
    name: "String match, matchAll, search and split preserve UTF-16 and undefined captures",
    code: String.raw`const m = "😀a".match(/(?<word>a)(b)?/);
      const all = "😀a a".matchAll(/(?<word>a)(b)?/g);
      const split = "a,b".split(/(,)|(x)/, 3);
      return { match: [m[0], m[1], m[2] === undefined, m.index, m.groups.word],
        global: "😀aa".match(/a/g), all: all.map((x) => [x.index, x[2] === undefined, x.groups.word]),
        search: "😀a".search(/a/g), split: [split[0], split[1], split[2] === undefined] };`,
    expected: { match: ["a", "a", true, 2, "a"], global: ["a", "a"], all: [[2, true, "a"], [4, true, "a"]], search: 2, split: ["a", ",", true] },
  },
  {
    name: "String replace and replaceAll retain native replacement syntax",
    code: String.raw`return ["😀a a".replace(/(a)/, "[$1]"), "😀a a".replaceAll(/(a)/g, "[$1]")];`,
    expected: ["😀[a] a", "😀[a] [a]"],
  },
  {
    name: "replacement callback receives exact original subject, offsets and absent captures/groups",
    code: String.raw`const seen = []; const subject = "😀b ab";
      const output = subject.replaceAll(/(?<word>a)?b/g, (match, capture, offset, original, groups) => {
        seen.push([match, capture === undefined, offset, original === subject, groups.word === undefined]);
        return "[" + match + "]";
      });
      const absent = "a".replace(/a/, (...args) => { seen.push([args.length, args[1], args[2]]); return "z"; });
      return { output, absent, seen };`,
    expected: { output: "😀[b] [ab]", absent: "z", seen: [["b", true, 2, true, true], ["ab", false, 4, true, false], [3, 0, "a"]] },
  },
  {
    name: "metadata, coercion and opacity survive finite execution and lastIndex stays read-only",
    code: String.raw`const r = /a/gimsuy; const refused = [];
      try { r.lastIndex = 3; } catch { refused.push("assign"); }
      try { r.lastIndex++; } catch { refused.push("increment"); }
      try { r.lastIndex += 2; } catch { refused.push("compound"); }
      return { source: r.source, flags: r.flags, index: r.lastIndex,
        properties: [r.global, r.ignoreCase, r.multiline, r.sticky, r.unicode, r.dotAll],
        text: String(r), method: r.toString(), arrayText: String([r]),
        nan: Number.isNaN(Number(r)), keys: Object.keys(r), spread: { ...r }, value: r, refused };`,
    expected: { source: "a", flags: "gimsuy", index: 0, properties: [true, true, true, true, true, true], text: "/a/gimsuy", method: "/a/gimsuy", arrayText: "/a/gimsuy", nan: true, keys: [], spread: {}, value: {}, refused: ["assign", "increment", "compound"] },
  },
  {
    name: "named captures filter blocked keys without exposing blocked property access",
    code: String.raw`const r = /(?<constructor>a)(?<prototype>b)(?<__proto__>c)(?<safe>d)/g;
      const m = r.exec("😀abcd"); const seen = [];
      const replaced = "abcd".replace(r, (match, a, b, c, d, offset, subject, groups) => {
        seen.push(Object.keys(groups)); return groups.safe;
      });
      return [Object.keys(m.groups), m.groups.safe, m.index, replaced, seen];`,
    expected: [["safe"], "d", 2, "d", [["safe"]]],
  },
  {
    name: "outer replacement commits before callbacks and never overwrites their later alias mutations",
    code: String.raw`const r = /a/g; const seen = [];
      const output = "a a".replace(r, () => { const m = r.exec("a a"); seen.push(m.index); return "x"; });
      return [output, seen, r.lastIndex];`,
    expected: ["x x", [0, 2], 3],
  },
  {
    name: "concurrent async callbacks construct shared-alias requests only after preceding commit",
    code: String.raw`const r = /a/g;
      const indices = await Promise.all([0, 1].map(async () => { await Promise.resolve(); return r.exec("aa").index; }));
      return [indices, r.lastIndex];`,
    expected: [[0, 1], 2],
  },
  {
    name: "invalid pattern and flags remain catchable SyntaxError values",
    code: String.raw`const names = [];
      try { new RegExp("["); } catch (error) { names.push(error.name); }
      try { new RegExp("a", "gg"); } catch (error) { names.push(error.name); }
      return names;`,
    expected: ["SyntaxError", "SyntaxError"],
  },
]

for (const entry of cases) {
  it.live(`finite native interpreter: ${entry.name}`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const before = Omni.snapshot().spawns
    const result = yield* CodeMode.execute({ tools: {}, code: entry.code, limits })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`)
    expect<unknown>(result.value).toEqual(entry.expected)
    expect(Omni.snapshot().spawns).toBeGreaterThan(before)
  }).pipe(Effect.provide(CodeModeNativeRegex.layer)), 15_000)
}

it.live("finite native interpreter callbacks and tool hooks keep the actual caller service and Scope", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const scope = yield* Effect.scope
  const receipts: string[] = []
  const scopes: unknown[] = []
  const result = yield* CodeMode.execute({
    limits,
    code: String.raw`return await Promise.all(["a", "b"].map(async (text) => {
      const matched = /(?<word>[ab])/.exec(text);
      return await tools.witness({ text: matched.groups.word });
    }));`,
    tools: { witness: Tool.make({
      description: "Record the actual parent service from a model callback",
      input: Schema.Struct({ text: Schema.String }), output: Schema.String,
      run: (input) => Effect.gen(function* () {
        const witness = yield* Witness
        scopes.push(yield* Effect.scope)
        receipts.push(`body:${witness.label}:${input.text}`)
        return `${witness.label}:${input.text}`
      }),
    }) },
    onToolCallStart: () => Effect.gen(function* () {
      const witness = yield* Witness
      scopes.push(yield* Effect.scope)
      receipts.push(`start:${witness.label}`)
    }),
    onToolCallEnd: (call) => Effect.gen(function* () {
      const witness = yield* Witness
      scopes.push(yield* Effect.scope)
      receipts.push(`end:${witness.label}:${call.outcome}`)
    }),
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value).toEqual(["parent:a", "parent:b"])
  expect(result.toolCalls).toEqual([{ name: "witness" }, { name: "witness" }])
  expect(receipts.filter((value) => value === "start:parent")).toHaveLength(2)
  expect(receipts.filter((value) => value === "end:parent:success")).toHaveLength(2)
  expect(receipts.filter((value) => value.startsWith("body:")).sort()).toEqual(["body:parent:a", "body:parent:b"])
  expect(scopes).toHaveLength(6)
  scopes.forEach((value) => expect(value).toBe(scope))
}).pipe(Effect.provideService(Witness, { label: "parent" }), Effect.provide(CodeModeNativeRegex.layer)), 15_000)

it.live("finite regex without a provider fails explicitly unavailable, rather than timing out or falling back", Effect.gen(function* () {
  const before = Omni.snapshot().spawns
  const result = yield* CodeMode.execute({ tools: {}, code: "return /a/.test('a')", limits })
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("Finite regex unexpectedly used a native fallback")
  expect(result.error.kind).toBe("ExecutionFailure")
  expect(result.error.message).toMatch(/unavailable/i)
  expect(Omni.snapshot().spawns).toBe(before)
}))

it.live("untimed regex retains the legacy native path without a provider", Effect.gen(function* () {
  const before = Omni.snapshot().spawns
  const result = yield* CodeMode.execute({ tools: {}, code: "const r = /a/g; return [r.exec('aa').index, r.lastIndex, 'aa'.replaceAll(r, 'b')];" })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value).toEqual([0, 1, "bb"])
  expect(Omni.snapshot().spawns).toBe(before)
}))

it.live("reused and concurrent finite execution effects acquire distinct actual caller services", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const receipts: string[] = []
  const program = CodeMode.execute({
    limits, code: "const r = /a/g; return [r.exec('aa').index, await tools.witness({})];",
    tools: { witness: Tool.make({
      description: "Observe each execution caller independently", input: Schema.Struct({}), output: Schema.String,
      run: () => Effect.gen(function* () {
        const witness = yield* Witness
        receipts.push(witness.label)
        return witness.label
      }),
    }) },
  })
  const before = Omni.snapshot().spawns
  const first = yield* program.pipe(Effect.provideService(Witness, { label: "first" }))
  const second = yield* program.pipe(Effect.provideService(Witness, { label: "second" }))
  const concurrent = yield* Effect.all([
    program.pipe(Effect.provideService(Witness, { label: "left" })),
    program.pipe(Effect.provideService(Witness, { label: "right" })),
  ], { concurrency: "unbounded" })
  const outcomes = [first, second, ...concurrent]
  expect(outcomes.every((result) => result.ok)).toBe(true)
  expect(outcomes.map((result) => result.ok ? result.value : result.error)).toEqual([
    [0, "first"], [0, "second"], [0, "left"], [0, "right"],
  ])
  expect(receipts.slice(0, 2)).toEqual(["first", "second"])
  expect(receipts.slice(2).sort()).toEqual(["left", "right"])
  expect(Omni.snapshot().spawns - before).toBeGreaterThanOrEqual(8)
}).pipe(Effect.provide(CodeModeNativeRegex.layer)), 30_000)
