import { expect, test } from "bun:test"
import { Schema } from "effect"
import { stringify } from "yaml"
import { FabricWorkspace } from "@orchestra/schema/fabric-workspace"
import { catalog, document } from "./fixture/declaration"

test("SEAM01 JSON, YAML and direct admission share the same effective declaration without authority", async () => {
  const { parse } = await import("../src/parse")
  const { compile } = await import("../src/declaration")
  const value = document()
  const direct = compile(value, catalog, { runs: "denied" })
  expect(direct.ok).toBe(true)
  ;(["json", "yaml"] as const).forEach((format) => {
    const admitted = parse(format === "json" ? JSON.stringify(value) : stringify(value), format)
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    const compiled = compile(admitted.value, catalog, { runs: "denied" })
    expect(compiled).toEqual(direct)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    expect(compiled.availability.runs).toBe("denied")
    const encoded = Schema.encodeSync(FabricWorkspace.Document)(compiled.document)
    const again = compile(encoded, catalog, { runs: "denied" })
    expect(again.ok).toBe(true)
    if (again.ok) {
      expect(again.document).toEqual(compiled.document)
      expect(again.normalizations).toEqual([])
    }
  })
  expect(value.layout.overrides).toEqual({})
})
