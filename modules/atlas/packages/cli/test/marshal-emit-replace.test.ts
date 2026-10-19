import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { marshalArgs } from "../src/marshal.js"

describe("marshal emit replace (R8)", () => {
  it("marshal emit replace", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-marshal-"))
    const f = join(dir, "fact.json")
    writeFileSync(f, JSON.stringify({ kind: "advisory", claimNorm: "c" }))

    expect(marshalArgs("emit", [f], { at: "abc" })).toEqual({
      ok: true,
      args: { node: { kind: "advisory", claimNorm: "c" }, at: "abc" },
    })

    expect(marshalArgs("emit", [f], { at: "abc", replace: "true" })).toEqual({
      ok: true,
      args: { node: { kind: "advisory", claimNorm: "c" }, at: "abc", replace: true },
    })

    const bad = marshalArgs("emit", [f], { at: "abc", replace: "false" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain("'--replace' is a bare flag")

    // draft envelope
    const envFile = join(dir, "env.json")
    writeFileSync(envFile, JSON.stringify({ fact: { kind: "advisory" }, rev: "abc" }))
    expect(marshalArgs("emit", [envFile], { at: "abc", replace: "true" })).toEqual({
      ok: true,
      args: { node: { kind: "advisory" }, at: "abc", replace: true },
    })
  })
})
