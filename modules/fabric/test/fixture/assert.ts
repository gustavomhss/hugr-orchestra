import { expect } from "bun:test"
import { FabricObservation } from "@orchestra/schema/fabric-observation"
import type { Admission, Compilation } from "../../src/contracts"
import type { Normalization } from "../../src/contracts"
import { isDeepStrictEqual } from "node:util"

export function failure(result: Admission | Compilation) {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(Object.keys(result).sort()).toEqual(["diagnostics", "ok"])
  expect(result.diagnostics.length).toBeGreaterThan(0)
  result.diagnostics.forEach((diagnostic) => {
    expect(Object.keys(diagnostic).sort()).toEqual(["code", "messageKey", "path"])
    expect(typeof diagnostic.path).toBe("string")
    expect(diagnostic.path === "" || diagnostic.path.startsWith("/")).toBe(true)
    expect(FabricObservation.Problem.fields.code.literals).toContain(diagnostic.code)
    expect(diagnostic.messageKey).toStartWith("fabric.")
  })
  expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO")
}

export function ledger(before: object, after: object, changes: readonly Normalization[]) {
  const original = new Map<string, unknown>(Object.entries(before))
  const effective = new Map<string, unknown>(Object.entries(after))
  const changed = [...new Set([...original.keys(), ...effective.keys()])]
    .filter((key) => !isDeepStrictEqual(original.get(key), effective.get(key)))
  expect(changes).toHaveLength(changed.length)
  expect(new Set(changes.map((change) => change.path)).size).toBe(changes.length)
  changed.forEach((key) => {
    const entry = changes.find((change) => change.path === `/layout/overrides/${key}`)
    expect(entry).toBeDefined()
    if (!entry) return
    expect(Object.keys(entry).sort()).toEqual(original.has(key)
      ? ["after", "before", "messageKey", "path"] : ["after", "messageKey", "path"])
    expect(entry?.messageKey).toBe("fabric.declaration.default")
    expect(isDeepStrictEqual(entry.after, effective.get(key))).toBe(true)
    if (original.has(key)) expect(isDeepStrictEqual(entry.before, original.get(key))).toBe(true)
    if (!original.has(key)) expect(entry).not.toHaveProperty("before")
  })
}
