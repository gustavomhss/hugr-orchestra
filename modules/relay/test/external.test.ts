import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Schema } from "effect"
import { RelayExternal } from "@orchestra/schema/relay-external"
import { LedgerVerify } from "../src/ledger/verify"

// Relay for LangGraph: external-run goldens in the Python library's ledger format.
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
    expect(RelayExternal.runFromLedger(expected.run.runID, lines.map((line) => decode(line)))).toEqual(expected.run)
  })

  test("a ledger that does not start with run.start rebuilds nothing", () => {
    expect(RelayExternal.runFromLedger("t", [])).toBeUndefined()
    expect(
      RelayExternal.runFromLedger("t", [{ event: "sprint-complete", key: "t/__end__/0/sprint-complete", at: 0 }]),
    ).toBeUndefined()
  })
})
