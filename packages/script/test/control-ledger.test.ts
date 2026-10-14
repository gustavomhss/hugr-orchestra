import { expect, test } from "bun:test"
import { controlLedger } from "../../../nix/scripts/control-ledger.ts"

test("control ledger preserves real LF and CRLF payloads", async () => {
  const source = await Bun.file(new URL("../../../nix/scripts/probe-distribution.ts", import.meta.url)).text()
  const ledger = controlLedger(source)
  expect(Object.keys(ledger).length).toBeGreaterThan(0)
  expect(ledger["unchanged-real-copy"]).toBeNull()
  expect(ledger["mutated-bytes"]).toBe("ARTIFACT_DIGEST_MISMATCH")
  expect(controlLedger(source.replace(/\r?\n/g, "\r\n"))).toEqual(ledger)
})

test("control ledger rejects missing markers without matching parser string literals", async () => {
  const source = await Bun.file(new URL("../../../nix/scripts/probe-distribution.ts", import.meta.url)).text()
  const parser = '\nconst region = source.split("/* CONTROL_LEDGER_BEGIN")[1]?.split("CONTROL_LEDGER_END */")\n'
  expect(() => controlLedger(source.replace("/* CONTROL_LEDGER_BEGIN", "/* removed") + parser))
    .toThrow("CONTROL_LEDGER_MISSING")
  expect(() => controlLedger(source.replace("CONTROL_LEDGER_END */", "removed */") + parser))
    .toThrow("CONTROL_LEDGER_MISSING")
  expect(() => controlLedger(source + "\n/* CONTROL_LEDGER_BEGIN\n{}\nCONTROL_LEDGER_END */\n"))
    .toThrow("CONTROL_LEDGER_MISSING")
})

test("control ledger names whitespace-empty, empty-object and malformed failures", () => {
  const frame = (payload: string) => `/* CONTROL_LEDGER_BEGIN\r\n${payload}\r\nCONTROL_LEDGER_END */\r\n`
  expect(() => controlLedger(frame(" \r\n "))).toThrow("CONTROL_LEDGER_MISSING")
  expect(() => controlLedger(frame("{}"))).toThrow("CONTROL_LEDGER_EMPTY")
  ;['"scalar"', "[]", "{", '{"control":17}'].forEach((payload) => {
    expect(() => controlLedger(frame(payload))).toThrow("CONTROL_LEDGER_INVALID")
  })
})
