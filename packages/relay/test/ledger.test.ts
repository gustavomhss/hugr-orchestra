import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Effect, Fiber, Redacted, Result } from "effect"
import { RelayJson } from "../src/json"
import { LedgerChain } from "../src/ledger/chain"
import { LedgerRead } from "../src/ledger/read"
import { LedgerVerify } from "../src/ledger/verify"

// WP1 parity. The G1 goldens (test/golden/{json,ledger}) are the oracle's exact output; their paths are relative to
// packages/relay, where every oracle ran, so the tests run there too. Tables marked CPython were recorded from the
// CPython 3.14 standard library the verifier runs on (json, the UTF-8 codec, repr), for paths no golden reaches.
const root = path.join(import.meta.dir, "..")
const golden = path.join(root, "test", "golden")
const origin = process.cwd()
const scratch: string[] = []
const KEY = Redacted.make("relay-golden-ledger-key")

beforeAll(() => process.chdir(root))
afterAll(async () => {
  process.chdir(origin)
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })))
})

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const attempt = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect))

async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-ledger-"))
  scratch.push(dir)
  return dir
}

// Bun.file(...).exists() is false for a directory, and the chain lock is one.
function present(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function optional(file: string) {
  return (await Bun.file(file).exists()) ? Bun.file(file).text() : ""
}

async function goldenCases(prefix: (name: string) => boolean) {
  return (await readdir(path.join(golden, "ledger"))).filter(prefix).sort()
}

// Bodies sealed by hand with Node's crypto, an implementation independent of LedgerChain.mac.
function sealLine(body: string, key?: string) {
  const digest = key
    ? createHmac("sha256", key).update(body).digest("hex")
    : createHash("sha256").update(body).digest("hex")
  return `${body.slice(0, -1)},"h":"${digest}"}`
}

function seeded(seed: number) {
  const state = { value: seed }
  return () => {
    state.value = (state.value * 1103515245 + 12345) % 2 ** 31
    return state.value / 2 ** 31
  }
}

const CHARACTERS = ["a", "Z", " ", '"', "\\", "/", "\u0000", "\b", "\t", "\n", "\u001f", "\u007f", "é", " ", "😀"]

function randomValue(next: () => number, depth: number): unknown {
  const pick = Math.floor(next() * (depth > 2 ? 4 : 6))
  if (pick === 0) return null
  if (pick === 1) return next() < 0.5
  if (pick === 2) return Math.floor((next() - 0.5) * 2 * Number.MAX_SAFE_INTEGER)
  if (pick === 3)
    return Array.from(
      { length: Math.floor(next() * 6) },
      () => CHARACTERS[Math.floor(next() * CHARACTERS.length)],
    ).join("")
  if (pick === 4) return Array.from({ length: Math.floor(next() * 4) }, () => randomValue(next, depth + 1))
  return Object.fromEntries(
    Array.from({ length: Math.floor(next() * 4) }, (_, index) => [
      `k${index}${String(randomValue(next, 3))}`,
      randomValue(next, depth + 1),
    ]),
  )
}

describe("RelayJson goldens", () => {
  test("escape table: jq -c prints every code point, surrogate escape and --arg byte sequence as recorded", async () => {
    const rows: Array<{ input?: string; arg?: { base64: string }; output?: string; error?: string }> = await Bun.file(
      path.join(golden, "json", "escape.json"),
    ).json()
    // 145 code points, 6 extra strings and 6 --arg byte sequences.
    expect(rows.length).toBe(157)
    for (const row of rows) {
      if (row.arg) {
        expect(await run(RelayJson.compact(RelayJson.argText(Buffer.from(row.arg.base64, "base64"))))).toBe(row.output!)
        continue
      }
      const read = RelayJson.read(row.input!, { flavor: "jq" })
      if (row.error !== undefined) {
        expect(Result.isFailure(read)).toBe(true)
        continue
      }
      expect(RelayJson.compactNode(Result.getOrThrow(read))).toBe(row.output!)
      expect(await run(RelayJson.compact(JSON.parse(row.input!)))).toBe(row.output!)
    }
  })

  test("number table: literals print in jq's canonical form; compact writes safe integers only", async () => {
    const rows: Array<{ input: string; literal: string; computed: string }> = await Bun.file(
      path.join(golden, "json", "numbers.json"),
    ).json()
    expect(rows.length).toBe(34)
    for (const row of rows) {
      expect(RelayJson.compactNode(Result.getOrThrow(RelayJson.read(row.input, { flavor: "jq" })))).toBe(row.literal)
      const value = Number(row.input)
      // PARITY-EXCEPTIONS WP1-6: a JS number has no literal, and the ledger's numbers are integers.
      if (/^-?\d+$/.test(row.input) && Number.isSafeInteger(value)) {
        expect(await run(RelayJson.compact(value))).toBe(row.computed)
        continue
      }
      expect(Result.isFailure(await attempt(RelayJson.compact(value)))).toBe(true)
    }
  })

  test("object table: member order, repeated keys and escaped keys as jq prints them", async () => {
    const rows: Array<{ input: string; output: string }> = await Bun.file(
      path.join(golden, "json", "objects.json"),
    ).json()
    expect(rows.length).toBe(17)
    for (const row of rows) {
      expect(RelayJson.compactNode(Result.getOrThrow(RelayJson.read(row.input, { flavor: "jq" })))).toBe(row.output)
      const written = await attempt(RelayJson.compact(JSON.parse(row.input)))
      // A JS object moves integer-like keys first, so compact refuses them instead of reordering.
      if (/"\d+":/.test(row.input)) expect(Result.isFailure(written)).toBe(true)
      else expect(Result.getOrThrow(written)).toBe(row.output)
    }
  })

  test("relay_json_string table", async () => {
    const rows: Array<{ input: string; ok: boolean; value?: string }> = await Bun.file(
      path.join(golden, "json", "string.json"),
    ).json()
    expect(rows.length).toBe(22)
    for (const row of rows) {
      const decoded = await attempt(RelayJson.decodeString(row.input))
      if (row.ok) expect(Result.getOrThrow(decoded)).toBe(row.value!)
      else expect(Result.isFailure(decoded)).toBe(true)
    }
  })

  test("strict_json_loads table, with Python's messages", async () => {
    const rows: Array<{ input: string; ok: boolean; error?: string }> = await Bun.file(
      path.join(golden, "json", "decode.json"),
    ).json()
    expect(rows.length).toBe(33)
    for (const row of rows) {
      const read = RelayJson.read(row.input)
      if (row.ok) expect(Result.isSuccess(read)).toBe(true)
      else expect(Result.isFailure(read) && read.failure.reason).toBe(row.error!)
    }
  })
})

describe("RelayJson", () => {
  test("decoder errors are CPython's str(error), positions in code points", () => {
    const table: Array<[string, string]> = [
      ["", "Expecting value: line 1 column 1 (char 0)"],
      [" ", "Expecting value: line 1 column 2 (char 1)"],
      ["[", "Expecting value: line 1 column 2 (char 1)"],
      ["{", "Expecting property name enclosed in double quotes: line 1 column 2 (char 1)"],
      ['{"a"', "Expecting ':' delimiter: line 1 column 5 (char 4)"],
      ['{"a":}', "Expecting value: line 1 column 6 (char 5)"],
      ['{"a":1', "Expecting ',' delimiter: line 1 column 7 (char 6)"],
      ['{"a":1,}', "Illegal trailing comma before end of object: line 1 column 7 (char 6)"],
      ["[1,]", "Illegal trailing comma before end of array: line 1 column 3 (char 2)"],
      ["[1 2]", "Expecting ',' delimiter: line 1 column 4 (char 3)"],
      ['"abc', "Unterminated string starting at: line 1 column 1 (char 0)"],
      ['"abc\\', "Unterminated string starting at: line 1 column 1 (char 0)"],
      ['"a\\x"', "Invalid \\escape: line 1 column 3 (char 2)"],
      ['"\\u12"', "Invalid \\uXXXX escape: line 1 column 3 (char 2)"],
      ['"\\ud800\\u12g4"', "Invalid \\uXXXX escape: line 1 column 9 (char 8)"],
      ['"é\\u00e9', "Invalid \\uXXXX escape: line 1 column 4 (char 3)"],
      ['"a\tb"', "Invalid control character at: line 1 column 3 (char 2)"],
      ['"😀\\q"', "Invalid \\escape: line 1 column 3 (char 2)"],
      ["01", "Extra data: line 1 column 2 (char 1)"],
      ["1e", "Extra data: line 1 column 2 (char 1)"],
      ["-", "Expecting value: line 1 column 1 (char 0)"],
      ["[-]", "Expecting value: line 1 column 2 (char 1)"],
      ['{"a":1}\n x', "Extra data: line 2 column 2 (char 9)"],
      ["\n\n  [", "Expecting value: line 3 column 4 (char 5)"],
      ['{"x":1, "y": [1, {"z": nan}]}', "Expecting value: line 1 column 24 (char 23)"],
      ["﻿{}", "Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)"],
      ['{"a":1,"a":{"b":1,"b":2}}', "duplicate JSON key 'b'"],
      ['{"a":1,"a":2,]', "Expecting property name enclosed in double quotes: line 1 column 14 (char 13)"],
      ["[Infinity]", "non-JSON constant 'Infinity'"],
      [
        "1".repeat(4301),
        "Exceeds the limit (4300 digits) for integer string conversion: value has 4301 digits; use sys.set_int_max_str_digits() to increase the limit",
      ],
    ]
    for (const [input, message] of table) {
      const read = RelayJson.read(input)
      expect(Result.isFailure(read) && read.failure.reason).toBe(message)
    }
    expect(Result.isSuccess(RelayJson.read(`-${"1".repeat(4300)}`))).toBe(true)
  })

  test("repr is CPython's, for strings, floats and containers", () => {
    const repr = (text: string) => RelayJson.repr(Result.getOrThrow(RelayJson.read(text)))
    expect(repr('"a\'b"')).toBe(`"a'b"`)
    expect(repr('"a\\"b"')).toBe(`'a"b'`)
    expect(repr('"a\'\\"b"')).toBe(`'a\\'"b'`)
    expect(
      repr('"\\u0000\\u001f\\u007f\\u0080\\u00a0\\u00ad é\\u2028\\ufeff😀\\ud800\\udb40\\udc01\\t\\n\\r\\\\"'),
    ).toBe("'\\x00\\x1f\\x7f\\x80\\xa0\\xad é\\u2028\\ufeff😀\\ud800\\U000e0001\\t\\n\\r\\\\'")
    expect(repr("[1e16, 1e15, 0.0001, 0.00001, 1.5e300, -0.0, 1e999, 123456789.123, 1e22, 5e-324]")).toBe(
      "[1e+16, 1000000000000000.0, 0.0001, 1e-05, 1.5e+300, -0.0, inf, 123456789.123, 1e+22, 5e-324]",
    )
    expect(repr('{"a": [1, true, null, 1.0, "x"], "b": {}, "c": -0}')).toBe(
      "{'a': [1, True, None, 1.0, 'x'], 'b': {}, 'c': 0}",
    )
  })

  test("decode gives plain values; __proto__ stays an own key", async () => {
    const value = await run(RelayJson.decode('{"__proto__":{"x":1},"n":[1,2.5,1e999]}'))
    expect(Object.keys(value as object)).toEqual(["__proto__", "n"])
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect((value as { n: unknown }).n).toEqual([1, 2.5, Infinity])
    expect(Result.isFailure(await attempt(RelayJson.decode('{"a":[{"n":1,"\\u006e":2}]}')))).toBe(true)
  })

  test("the jq flavor keeps a repeated key's first place and last value", () => {
    const read = RelayJson.read('{"a":1,"b":2,"a":3}', { flavor: "jq" })
    expect(RelayJson.compactNode(Result.getOrThrow(read))).toBe('{"a":3,"b":2}')
    expect(Result.isFailure(RelayJson.read('{"a":1,"b":2,"a":3}'))).toBe(true)
  })

  // PARITY-EXCEPTIONS WP1-4.
  test("nesting deeper than 1000 levels is refused instead of exhausting the stack", () => {
    const read = RelayJson.read(`${"[".repeat(1001)}${"]".repeat(1001)}`)
    expect(Result.isFailure(read) && read.failure.reason).toBe("maximum nesting depth exceeded")
    expect(Result.isSuccess(RelayJson.read(`${"[".repeat(1000)}${"]".repeat(1000)}`))).toBe(true)
  })

  test("compact keeps key order, skips undefined members and refuses what jq could not print the same", async () => {
    expect(await run(RelayJson.compact({ b: 1, a: [true, null, "x"], skipped: undefined, "01": 0, "-1": 0 }))).toBe(
      '{"b":1,"a":[true,null,"x"],"01":0,"-1":0}',
    )
    expect(await run(RelayJson.compact("lone \ud800 surrogate"))).toBe('"lone � surrogate"')
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const refused = [
      { 1: "reordered" },
      [undefined],
      new Date(0),
      new Map(),
      cycle,
      1.5,
      Number.NaN,
      2 ** 53,
      1n,
      undefined,
    ]
    for (const value of refused) expect(Result.isFailure(await attempt(RelayJson.compact(value)))).toBe(true)
  })

  test("compact round-trips through JSON.parse and the strict decoder (seeded)", async () => {
    const next = seeded(20261006)
    for (const _ of Array.from({ length: 300 })) {
      const value = randomValue(next, 0)
      const written = await run(RelayJson.compact(value))
      expect(JSON.parse(written)).toEqual(value)
      expect(RelayJson.plain(Result.getOrThrow(RelayJson.read(written)))).toEqual(value)
    }
  })

  test("every fixture line is already jq's compact form", async () => {
    const files = [...new Bun.Glob("*.ledger.jsonl").scanSync(path.join(root, "test", "fixtures"))]
    expect(files.length).toBe(15)
    const lines = (
      await Promise.all(files.map((file) => Bun.file(path.join(root, "test", "fixtures", file)).text()))
    ).flatMap((text) => text.split("\n").filter(Boolean))
    expect(lines.length).toBe(2427)
    for (const line of lines) {
      expect(RelayJson.compactNode(Result.getOrThrow(RelayJson.read(line)))).toBe(line)
      expect(await run(RelayJson.compact(JSON.parse(line)))).toBe(line)
    }
  })
})

describe("LedgerVerify goldens", () => {
  test("every fixture and mutant verifies exactly as verify_ledger.py, in every recorded mode", async () => {
    const cases = await goldenCases((name) => !name.startsWith("writer-"))
    // 15 fixtures and 49 mutants.
    expect(cases.length).toBe(64)
    expect(cases).toContain("gate-race-forked-chain")
    expect(cases).toContain("mutant-sealed-keyed")
    const modes = { count: 0 }
    for (const name of cases) {
      const dir = path.join(golden, "ledger", name)
      const spec: { ledger: string; keys: Record<string, string> } = await Bun.file(path.join(dir, "case.json")).json()
      for (const [stem, key] of [
        ["verify", undefined] as const,
        ...Object.entries(spec.keys).map(([mode, key]) => [`verify.${mode}`, key] as const),
      ]) {
        const result = await run(LedgerVerify.verify(spec.ledger, key === undefined ? undefined : Redacted.make(key)))
        const actual: { name: string; exit: number; stdout: string; stderr: string } = {
          name: `${name}/${stem}`,
          ...result,
        }
        expect(actual).toEqual({
          name: `${name}/${stem}`,
          exit: Number((await Bun.file(path.join(dir, `${stem}.exit`)).text()).trim()),
          stdout: await Bun.file(path.join(dir, `${stem}.stdout`)).text(),
          stderr: await optional(path.join(dir, `${stem}.stderr`)),
        })
        modes.count++
      }
    }
    expect(modes.count).toBe(75)
  })
})

describe("LedgerVerify", () => {
  test("a missing ledger exits 2 on stderr; an empty key verifies as plain", async () => {
    const dir = await directory()
    expect(await run(LedgerVerify.verify(path.join(dir, "absent.jsonl")))).toEqual({
      exit: 2,
      stdout: "",
      stderr: `no ledger at ${path.join(dir, "absent.jsonl")}\n`,
    })
    const plain = "test/fixtures/fanout-armA.ledger.jsonl"
    expect(await run(LedgerVerify.verify(plain, Redacted.make("")))).toEqual(await run(LedgerVerify.verify(plain)))
  })

  test.skipIf(process.platform === "win32")("an unreadable path reports Python's OSError text", async () => {
    const dir = await directory()
    expect(await run(LedgerVerify.verify(dir))).toEqual({
      exit: 1,
      stdout: `BROKEN ledger: cannot read ${dir} ([Errno 21] Is a directory: '${dir}')\n`,
      stderr: "",
    })
  })

  test("a deep nesting is a BROKEN line, not a crash (PARITY-EXCEPTIONS WP1-4)", async () => {
    const ledger = path.join(await directory(), "ledger.jsonl")
    await writeFile(
      ledger,
      `${sealLine(`{"event":"note","data":${"[".repeat(1000)}${"]".repeat(1000)},"gen":0,"prev":"GENESIS","seq":0,"mac":"sha256"}`)}\n`,
    )
    expect((await run(LedgerVerify.verify(ledger))).stdout).toBe(
      "BROKEN line 1: invalid or ambiguous JSON (maximum nesting depth exceeded)\n",
    )
  })

  test("any single flipped content byte is detected, plain and keyed", async () => {
    for (const key of [undefined, KEY]) {
      const ledger = path.join(await directory(), "ledger.jsonl")
      for (const body of [
        '{"event":"note","text":"café 😀"}',
        '{"event":"checklist-item","n":[1,-2]}',
        '{"event":"sprint-complete"}',
      ])
        await run(LedgerChain.append({ ledger, body, gen: 3, key }))
      const bytes = await Bun.file(ledger).bytes()
      expect((await run(LedgerVerify.verify(ledger, key))).exit).toBe(0)
      const flipped = { count: 0 }
      for (const [index, byte] of bytes.entries()) {
        if (byte === 0x0a) continue
        const copy = Uint8Array.from(bytes)
        copy[index] = byte ^ 0x01
        await Bun.write(ledger, copy)
        expect({ index, exit: (await run(LedgerVerify.verify(ledger, key))).exit }).toEqual({ index, exit: 1 })
        flipped.count++
      }
      expect(flipped.count).toBeGreaterThan(400)
    }
  })

  test("append then verify round-trips in plain and HMAC modes (seeded)", async () => {
    for (const [key, mode] of [
      [undefined, "PLAIN (SHA-256)"],
      [KEY, "KEYED (HMAC-SHA256)"],
    ] as const) {
      const ledger = path.join(await directory(), "ledger.jsonl")
      const next = seeded(key ? 7 : 11)
      const appended = []
      for (const index of Array.from({ length: 40 }, (_, index) => index)) {
        const body = await run(
          RelayJson.compact({ event: index === 39 ? "escalate" : "note", value: randomValue(next, 1) }),
        )
        appended.push(await run(LedgerChain.append({ ledger, body, gen: 0, key })))
      }
      expect(appended.map((entry) => entry.seq)).toEqual(Array.from({ length: 40 }, (_, index) => index))
      expect(await run(LedgerVerify.verify(ledger, key))).toEqual({
        exit: 0,
        stdout: `LEDGER INTACT — 40 chained entries [${mode}], chain head ${appended[39]!.h.slice(0, 12)}…\n${
          key
            ? ""
            : "  NOTE: plain mode is tamper-evident, not unforgeable. Set RELAY_LEDGER_KEY for an adversary-resistant (keyed) chain.\n"
        }`,
        stderr: "",
      })
    }
  })
})

describe("LedgerChain goldens", () => {
  test("relay-note appends: the same refusals and the same ledger bytes", async () => {
    const cases = await goldenCases((name) => name.startsWith("writer-"))
    expect(cases.length).toBe(9)
    for (const name of cases) {
      const dir = path.join(golden, "ledger", name)
      const spec = Result.getOrThrow(
        RelayJson.read(await Bun.file(path.join(dir, "case.json")).text(), { flavor: "jq" }),
      )
      const fields = RelayJson.plain(spec) as { key: string | null; bodies: string[] }
      const outcomes: Array<{ exit: number }> = await Bun.file(path.join(dir, "outcomes.json")).json()
      const ledger = path.join(await directory(), "ledger.jsonl")
      const key = fields.key === null ? undefined : Redacted.make(fields.key)
      const gen = LedgerChain.generation((spec as RelayJson.Members).get("sprint"))
      for (const [index, body] of fields.bodies.entries()) {
        const appended = await attempt(LedgerChain.append({ ledger, body, gen, key }))
        expect({ name, index, appended: Result.isSuccess(appended) }).toEqual({
          name,
          index,
          appended: outcomes[index]!.exit === 0,
        })
        if (Result.isFailure(appended)) expect(appended.failure.reason).toBe("body")
      }
      expect({ name, ledger: await optional(ledger) }).toEqual({
        name,
        ledger: await Bun.file(path.join(dir, "ledger.jsonl")).text(),
      })
      const verified = await run(LedgerVerify.verify(ledger, key))
      const actual: { name: string; exit: number; stdout: string } = {
        name,
        exit: verified.exit,
        stdout: verified.stdout,
      }
      expect(actual).toEqual({
        name,
        exit: Number((await Bun.file(path.join(dir, "verify.exit")).text()).trim()),
        stdout: await Bun.file(path.join(dir, "verify.stdout")).text(),
      })
      expect(await present(path.join(path.dirname(ledger), LedgerChain.LOCK))).toBe(false)
    }
  })

  test("re-sealing every intact fixture's bodies reproduces it byte for byte", async () => {
    const names = (await goldenCases((name) => !name.startsWith("writer-") && !name.startsWith("mutant-"))).filter(
      (name) => name !== "gate-race-forked-chain",
    )
    expect(names.length).toBe(14)
    for (const name of names) {
      const original = await Bun.file(path.join(root, "test", "fixtures", `${name}.ledger.jsonl`)).text()
      const ledger = path.join(await directory(), "ledger.jsonl")
      for (const line of original.split("\n").filter(Boolean)) {
        const entry = Result.getOrThrow(RelayJson.read(line)) as RelayJson.Members
        const body = new RelayJson.Members(
          entry.entries.filter((member) => !["gen", "prev", "seq", "mac", "h"].includes(member[0])),
        )
        const gen = entry.get("gen") as RelayJson.Int
        await run(LedgerChain.append({ ledger, body: RelayJson.compactNode(body), gen: Number(gen.digits) }))
      }
      expect({ name, bytes: await Bun.file(ledger).text() }).toEqual({ name, bytes: original })
    }
  })
})

describe("LedgerChain", () => {
  test("the signed body is the compact body plus gen, prev, seq and mac; h is the final member", async () => {
    for (const key of [undefined, "test-secret"]) {
      const ledger = path.join(await directory(), "ledger.jsonl")
      const body = await run(RelayJson.compact({ event: "note", text: "café\tline\n" }))
      const appended = await run(
        LedgerChain.append({ ledger, body, gen: 0, key: key === undefined ? undefined : Redacted.make(key) }),
      )
      const signed = `{"event":"note","text":"café\\tline\\n","gen":0,"prev":"GENESIS","seq":0,"mac":"${key ? "hmac-sha256" : "sha256"}"}`
      expect(appended.line).toBe(sealLine(signed, key))
      expect(await Bun.file(ledger).text()).toBe(`${appended.line}\n`)
      await writeFile(ledger, `${appended.line.replace('"event":"note"', '"event":"edit"')}\n`)
      expect(
        (await run(LedgerVerify.verify(ledger, key === undefined ? undefined : Redacted.make(key)))).stdout,
      ).toStartWith("TAMPERED line 1: MAC mismatch")
    }
  })

  test("a malformed body or a top-level h appends nothing and leaves no lock; nested h is data", async () => {
    for (const key of [undefined, KEY]) {
      const dir = await directory()
      const ledger = path.join(dir, "ledger.jsonl")
      for (const body of ["{broken", "", "null", "[]", '{"event":"a"} {"event":"b"}', '{"event":"x","v":NaN}']) {
        const refused = await attempt(LedgerChain.append({ ledger, body, gen: 0, key }))
        expect(Result.isFailure(refused) && refused.failure.reason).toBe("body")
      }
      expect(await Bun.file(ledger).exists()).toBe(false)
      const seed = await run(
        LedgerChain.append({ ledger, body: '{"event":"note","data":{"h":"nested-data"}}', gen: 0, key }),
      )
      const before = await Bun.file(ledger).text()
      for (const claimed of ["null", '""', '"supplied-hash"']) {
        const refused = await attempt(
          LedgerChain.append({ ledger, body: `{"event":"note","h":${claimed}}`, gen: 0, key }),
        )
        expect(Result.isFailure(refused) && refused.failure.reason).toBe("body")
      }
      expect(await Bun.file(ledger).text()).toBe(before)
      expect(await present(path.join(dir, LedgerChain.LOCK))).toBe(false)
      const following = await run(LedgerChain.append({ ledger, body: '{"event":"sprint-complete"}', gen: 0, key }))
      expect(following.seq).toBe(1)
      expect(following.line).toContain(`"prev":"${seed.h}"`)
      expect((await run(LedgerVerify.verify(ledger, key))).exit).toBe(0)
    }
  })

  test("a failed write appends nothing and releases the lock", async () => {
    const dir = await directory()
    const ledger = path.join(dir, "ledger-is-a-directory")
    await mkdir(ledger)
    const failed = await attempt(LedgerChain.append({ ledger, body: '{"event":"note"}', gen: 0 }))
    expect(Result.isFailure(failed) && failed.failure.reason).toBe("write")
    expect(await present(path.join(dir, LedgerChain.LOCK))).toBe(false)
  })

  test("a lock held by another writer fails after 200 tries and stays its owner's", async () => {
    const dir = await directory()
    await mkdir(path.join(dir, LedgerChain.LOCK))
    const started = Date.now()
    const failed = await attempt(
      LedgerChain.append({ ledger: path.join(dir, "ledger.jsonl"), body: '{"event":"note"}', gen: 0 }),
    )
    expect(Result.isFailure(failed) && failed.failure.reason).toBe("lock")
    expect(Date.now() - started).toBeGreaterThanOrEqual((LedgerChain.LOCK_ATTEMPTS - 1) * LedgerChain.LOCK_INTERVAL_MS)
    expect((await stat(path.join(dir, LedgerChain.LOCK))).isDirectory()).toBe(true)
    expect(await Bun.file(path.join(dir, "ledger.jsonl")).exists()).toBe(false)
  }, 30_000)

  // PARITY-EXCEPTIONS WP1-3.
  test("a missing ledger directory fails the lock at once", async () => {
    const started = Date.now()
    const failed = await attempt(
      LedgerChain.append({
        ledger: path.join(await directory(), "absent", "ledger.jsonl"),
        body: '{"event":"note"}',
        gen: 0,
      }),
    )
    expect(Result.isFailure(failed) && failed.failure.reason).toBe("lock")
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test("an append interrupted while it waits for the lock stops at once and leaves the owner's lock", async () => {
    const dir = await directory()
    await mkdir(path.join(dir, LedgerChain.LOCK))
    const fiber = Effect.runFork(
      LedgerChain.append({ ledger: path.join(dir, "ledger.jsonl"), body: '{"event":"note"}', gen: 0 }),
    )
    await Bun.sleep(120)
    const started = Date.now()
    await run(Fiber.interrupt(fiber))
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await present(path.join(dir, LedgerChain.LOCK))).toBe(true)
    expect(await Bun.file(path.join(dir, "ledger.jsonl")).exists()).toBe(false)
  })

  // The known effect 4.0.0-beta.83 trap: an interrupted fiber drops the async steps of its release.
  test("interrupting concurrent appenders at any moment never leaks the lock or forks the chain", async () => {
    for (const delay of [0, 1, 3, 10, 30]) {
      const dir = await directory()
      const ledger = path.join(dir, "ledger.jsonl")
      const fiber = Effect.runFork(
        Effect.all(
          Array.from({ length: 20 }, (_, writer) =>
            LedgerChain.append({ ledger, body: `{"event":"note","writer":${writer}}`, gen: 0 }),
          ),
          { concurrency: "unbounded" },
        ),
      )
      await Bun.sleep(delay)
      await run(Fiber.interrupt(fiber))
      expect({ delay, lock: await present(path.join(dir, LedgerChain.LOCK)) }).toEqual({ delay, lock: false })
      const verified = await run(LedgerVerify.verify(ledger))
      expect({ delay, exit: verified.exit }).toEqual({ delay, exit: (await Bun.file(ledger).exists()) ? 0 : 2 })
    }
  })

  test("20 concurrent appends in one process leave an intact chain", async () => {
    const dir = await directory()
    const ledger = path.join(dir, "ledger.jsonl")
    await run(
      Effect.all(
        Array.from({ length: 20 }, (_, writer) =>
          LedgerChain.append({ ledger, body: `{"event":"note","writer":${writer}}`, gen: 0 }),
        ),
        { concurrency: "unbounded" },
      ),
    )
    await expectContiguous(dir, ledger)
  })

  test("20 processes appending at once leave an intact chain", async () => {
    const dir = await directory()
    const ledger = path.join(dir, "ledger.jsonl")
    const worker = [
      'const { Effect } = await import("effect")',
      `const { LedgerChain } = await import(${JSON.stringify(pathToFileURL(path.join(root, "src", "ledger", "chain.ts")).href)})`,
      "await Effect.runPromise(LedgerChain.append({ ledger: process.env.RELAY_TEST_LEDGER, body: process.env.RELAY_TEST_BODY, gen: 0 }))",
    ].join("\n")
    const exits = await Promise.all(
      Array.from(
        { length: 20 },
        (_, writer) =>
          Bun.spawn([process.execPath, "-e", worker], {
            cwd: root,
            env: { ...process.env, RELAY_TEST_LEDGER: ledger, RELAY_TEST_BODY: `{"event":"note","writer":${writer}}` },
            stdout: "ignore",
            stderr: "inherit",
          }).exited,
      ),
    )
    expect(exits).toEqual(Array.from({ length: 20 }, () => 0))
    await expectContiguous(dir, ledger)
  }, 60_000)

  test("the tail is read as `tail -1 | jq` reads it", async () => {
    const dir = await directory()
    const ledger = path.join(dir, "ledger.jsonl")
    const first = sealLine('{"event":"note","gen":0,"prev":"GENESIS","seq":0,"mac":"sha256"}')
    const h = (Result.getOrThrow(RelayJson.read(first)) as RelayJson.Members).get("h")
    const append = () => run(LedgerChain.append({ ledger, body: '{"event":"next"}', gen: 0 }))
    // A blank last line is what `tail -1` prints, so the writer starts over at GENESIS.
    await writeFile(ledger, `${first}\n\n`)
    expect((await append()).line).toContain('"prev":"GENESIS","seq":0')
    // An unreadable tail links from GENESIS; a repeated key counts with its last value, as jq reads it.
    await writeFile(ledger, "{broken\n")
    expect((await append()).line).toContain('"prev":"GENESIS","seq":0')
    // PARITY-EXCEPTIONS WP1-2: jq would read the NaN; the strict reader finds no usable tail.
    await writeFile(ledger, `{"seq":3,"h":${JSON.stringify(h)},"v":NaN}\n`)
    expect((await append()).line).toContain('"prev":"GENESIS","seq":0')
    await writeFile(ledger, `{"event":"x","seq":1,"seq":4,"h":"stale","h":${JSON.stringify(h)}}\r\n`)
    expect((await append()).line).toContain(`"prev":${JSON.stringify(h)},"seq":5`)
  })

  // PARITY-EXCEPTIONS WP1-1.
  test("a tail whose seq or h bash could not use refuses the append and releases the lock", async () => {
    for (const tail of [
      '{"seq":"5","h":"x"}',
      '{"seq":true,"h":"x"}',
      '{"seq":1.0,"h":"x"}',
      '{"seq":1,"h":1.5}',
      '{"seq":1,"h":{"a":1}}',
    ]) {
      const dir = await directory()
      const ledger = path.join(dir, "ledger.jsonl")
      await writeFile(ledger, `${tail}\n`)
      const refused = await attempt(LedgerChain.append({ ledger, body: '{"event":"note"}', gen: 0 }))
      expect({ tail, reason: Result.isFailure(refused) && refused.failure.reason }).toEqual({ tail, reason: "write" })
      expect(await Bun.file(ledger).text()).toBe(`${tail}\n`)
      expect(await present(path.join(dir, LedgerChain.LOCK))).toBe(false)
    }
  })

  test("generation is what `jq -r '.gen // 0'` prints when that is all digits", () => {
    const generation = (sprint: string) =>
      LedgerChain.generation(Result.getOrThrow(RelayJson.read(sprint, { flavor: "jq" })))
    expect(generation('{"gen":7}')).toBe(7)
    expect(generation('{"gen":"7\\n"}')).toBe(7)
    expect(generation('{"gen":7.0}')).toBe(0)
    expect(generation('{"gen":1e2}')).toBe(0)
    expect(generation('{"gen":-1}')).toBe(0)
    expect(generation('{"gen":true}')).toBe(0)
    expect(generation('{"gen":null}')).toBe(0)
    expect(generation("[]")).toBe(0)
    expect(LedgerChain.generation(undefined)).toBe(0)
    // PARITY-EXCEPTIONS WP1-5.
    expect(generation('{"gen":"99999999999999999999"}')).toBe(0)
  })
})

describe("LedgerRead", () => {
  test("lines: universal newlines, Python-blank lines skipped, content kept as written", async () => {
    const ledger = path.join(await directory(), "ledger.jsonl")
    await writeFile(ledger, "﻿{a}\r\n \u001c  \r{b} \t\n\n\t\n{c}\r{d}")
    expect(await run(LedgerRead.lines(ledger))).toEqual(["﻿{a}", "{b} \t", "{c}", "{d}"])
  })

  test("entries: line numbers count blank lines, reasons are Python's", async () => {
    const dir = await directory()
    const ledger = path.join(dir, "ledger.jsonl")
    await writeFile(ledger, '\n {"__proto__":1,"n":2} \n\n')
    expect(await run(LedgerRead.entries(ledger))).toEqual([
      Object.fromEntries([
        ["__proto__", 1],
        ["n", 2],
      ]),
    ])
    for (const [text, line, reason] of [
      ['{"a":1}\n\n{"a":', 3, "Expecting value: line 1 column 6 (char 5)"],
      ['{"a":1}\n[1]\n', 2, "line 2: entry must be a JSON object"],
      ['{"d":{"n":1,"\\u006e":2}}', 1, "duplicate JSON key 'n'"],
    ] as const) {
      await writeFile(ledger, text)
      const failed = await attempt(LedgerRead.entries(ledger))
      expect(Result.isFailure(failed) && failed.failure).toMatchObject({ _tag: "LedgerRead.ReadError", line, reason })
    }
    const missing = await attempt(LedgerRead.entries(path.join(dir, "absent")))
    expect(Result.isFailure(missing) && missing.failure._tag).toBe("LedgerRead.Missing")
  })

  test("invalid UTF-8 fails with CPython's message, positioned in its 8192-byte read chunks", async () => {
    const dir = await directory()
    const x = (count: number) => Array.from({ length: count }, () => 0x78)
    const table: Array<[number[], string]> = [
      [[...Buffer.from('{"a":1}\n'), 0xff, 0x0a], "byte 0xff in position 8: invalid start byte"],
      [[...x(9000), 0xff], "byte 0xff in position 808: invalid start byte"],
      [[...x(8191), 0xe2, 0x82, 0xac, 0xff], "byte 0xff in position 3: invalid start byte"],
      [[...x(8191), 0xe2, 0x41], "byte 0xe2 in position 0: invalid continuation byte"],
      [[...x(8190), 0xe2, 0x82, 0x41], "bytes in position 0-1: invalid continuation byte"],
      [[...x(8190), 0xed, 0xa0, 0x80], "byte 0xed in position 0: invalid continuation byte"],
      [[...x(10), 0xe2, 0x82], "bytes in position 0-1: unexpected end of data"],
      [[...x(10), 0xe2], "byte 0xe2 in position 0: unexpected end of data"],
      [[...x(10), 0xf0, 0x9f, 0x98], "bytes in position 0-2: unexpected end of data"],
      [[...x(10), 0xe2, 0x82, 0x41], "bytes in position 10-11: invalid continuation byte"],
      [[...x(10), 0xc0, 0x80], "byte 0xc0 in position 10: invalid start byte"],
      [[...x(10), 0xed, 0xa0, 0x80], "byte 0xed in position 10: invalid continuation byte"],
      [[...x(10), 0xf4, 0x90, 0x80, 0x80], "byte 0xf4 in position 10: invalid continuation byte"],
      [[...x(16380), 0xf0, 0x9f, 0x98, 0x80, 0x80], "byte 0x80 in position 0: invalid start byte"],
      [[...x(8189), 0xf0, 0x9f, 0x98, 0x41], "bytes in position 0-2: invalid continuation byte"],
    ]
    for (const [index, [bytes, message]] of table.entries()) {
      const ledger = path.join(dir, `${index}.jsonl`)
      await Bun.write(ledger, new Uint8Array(bytes))
      const failed = await attempt(LedgerRead.lines(ledger))
      expect({ index, failure: Result.isFailure(failed) && failed.failure }).toMatchObject({
        index,
        failure: { _tag: "LedgerRead.ReadError", reason: `'utf-8' codec can't decode ${message}` },
      })
    }
  })

  test("resolve: the run-dir ledger, then the arm-dir ledger, joined without normalizing", async () => {
    const dir = await directory()
    const join = (...names: string[]) => [dir, ...names].join(path.sep)
    expect(await run(LedgerRead.resolve(dir))).toBe(join(".relay-state", "ledger.jsonl"))
    await writeFile(join("ledger.jsonl"), "")
    expect(await run(LedgerRead.resolve(dir))).toBe(join("ledger.jsonl"))
    expect(await run(LedgerRead.resolve(`${dir}${path.sep}`))).toBe(join("ledger.jsonl"))
    await mkdir(join(".relay-state"))
    await writeFile(join(".relay-state", "ledger.jsonl"), "")
    expect(await run(LedgerRead.resolve(dir))).toBe(join(".relay-state", "ledger.jsonl"))
    expect(await run(LedgerRead.resolve(join("ledger.jsonl")))).toBe(join("ledger.jsonl"))
    expect(await run(LedgerRead.resolve(join("absent")))).toBe(join("absent"))
  })
})

async function expectContiguous(dir: string, ledger: string) {
  const entries = await run(LedgerRead.entries(ledger))
  expect(entries.map((entry) => entry.seq)).toEqual(Array.from({ length: 20 }, (_, index) => index))
  expect(entries.map((entry) => entry.writer).sort((a, b) => Number(a) - Number(b))).toEqual(
    Array.from({ length: 20 }, (_, index) => index),
  )
  expect(entries.map((entry) => entry.prev)).toEqual(["GENESIS", ...entries.slice(0, -1).map((entry) => entry.h)])
  expect((await run(LedgerVerify.verify(ledger))).stdout).toStartWith("LEDGER INTACT — 20 chained entries")
  expect(await present(path.join(dir, LedgerChain.LOCK))).toBe(false)
}
