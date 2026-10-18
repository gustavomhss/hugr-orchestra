import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { Effect, Schema } from "effect"
import { RelayExternal } from "@orchestra/schema/relay-external"
import { LedgerVerify } from "../src/ledger/verify"

// Relay for LangGraph WP0: the external-run goldens written by test/golden/generate/external.ts.
const golden = path.join(import.meta.dir, "golden", "external")
const CASES = ["valid/pass", "valid/approval", "valid/escalate", "mutant/byte-flip"]

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(RelayExternal.Body))

describe("external run goldens", () => {
  test.each(CASES)("%s: verify.ts reaches the expected outcome", async (name) => {
    const expected = await Bun.file(path.join(golden, name, "expected.json")).json()
    const result = await Effect.runPromise(LedgerVerify.verify(path.join(golden, name, "ledger.jsonl")))
    expect(result.exit).toBe(expected.verify.exit)
    const broken = /^\w+ line (\d+):/.exec(result.stdout)
    expect(broken ? Number(broken[1]) : null).toBe(expected.verify.line)
  })

  test.each(CASES.filter((name) => name.startsWith("valid/")))("%s: runFromLedger rebuilds the run", async (name) => {
    const expected = await Bun.file(path.join(golden, name, "expected.json")).json()
    const lines = (await Bun.file(path.join(golden, name, "ledger.jsonl")).text()).split("\n").filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    expect(RelayExternal.runFromLedger(lines.map((line) => decode(line)))).toEqual(expected.run)
  })

  test("a ledger that does not start with run.start rebuilds nothing", () => {
    expect(RelayExternal.runFromLedger([])).toBeUndefined()
    expect(
      RelayExternal.runFromLedger([{ event: "sprint-complete", key: "t/__end__/0/sprint-complete", at: 0 }]),
    ).toBeUndefined()
  })
})

describe("runIDFromThread", () => {
  const hashed = (thread: string) => `t_${createHash("sha256").update(thread, "utf8").digest("hex").slice(0, 32)}`

  test("a thread ID that is already a run ID is kept", () => {
    expect(RelayExternal.runIDFromThread("thread-pass_1")).toBe("thread-pass_1")
    expect(RelayExternal.runIDFromThread("a".repeat(64))).toBe("a".repeat(64))
  })

  test("any other thread ID is hashed into a valid run ID", () => {
    const threads = ["", "a".repeat(65), "thread:escalate/1", "é/ü", "😀 space", "x".repeat(200), "\u0000", "a\nb"]
    threads.forEach((thread) => {
      expect(RelayExternal.runIDFromThread(thread)).toBe(hashed(thread))
      expect(RelayExternal.RUN_ID.test(RelayExternal.runIDFromThread(thread))).toBe(true)
    })
    expect(RelayExternal.runIDFromThread("")).toBe("t_e3b0c44298fc1c149afbf4c8996fb924")
  })

  test("the hash matches SHA-256 across padding boundaries", () => {
    Array.from({ length: 140 }, (_, length) => "/".repeat(length)).forEach((thread) =>
      expect(RelayExternal.runIDFromThread(thread)).toBe(hashed(thread)),
    )
  })
})
