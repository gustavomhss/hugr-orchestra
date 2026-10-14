import { expect, test } from "bun:test"
import { join, resolve } from "node:path"
import { calibrateCompilerEdge, compilerInputEdge } from "../distribution-provider-compiler-edge"

// R6 receipt relationship, with portable canonical paths and no filesystem or
// build dependency: ../core/src/omni.ts -> import-statement:./omni.ts.
const root = resolve(import.meta.dirname, "recorded-checkout")
const importer = join(root, "packages/core/src/omni.ts")
const key = "../core/src/omni.ts"
const decoy = join(root, "packages/core/src/pty/omni.ts")
const captured = new Map([[importer, [key]], [decoy, ["../core/src/pty/omni.ts"]]])

test("compiler self edge uses importer directory, not receipt cwd or basename", () => {
  expect(compilerInputEdge(importer, "./omni.ts", captured)).toBe(key)
  expect(compilerInputEdge(importer, importer, captured)).toBe(key)
  expect(compilerInputEdge(decoy, "./omni.ts", captured)).toBe("../core/src/pty/omni.ts")
  expect(compilerInputEdge(importer, "./omni.ts", new Map([[decoy, [key]]]))).toBeUndefined()
  expect(compilerInputEdge(importer, "./wrong-parent/omni.ts", captured)).toBeUndefined()
  expect(compilerInputEdge(importer, "./omni", captured)).toBeUndefined()
  expect(compilerInputEdge(importer, "effect", captured)).toBeUndefined()
  expect(compilerInputEdge(importer, "./not-recorded.ts", captured)).toBeUndefined()
})

test("ambiguous or empty canonical capture never selects an arbitrary key", () => {
  for (const keys of [[], [key, "duplicate-key"]]) {
    expect(() => compilerInputEdge(importer, "./omni.ts", new Map([[importer, keys]])))
      .toThrow(new Error("PROVIDER_COMPILER_EDGE_PATH_AMBIGUOUS"))
  }
})

test("actual compiler-edge calibration rejects four named mutations and restores genuine index", async () => {
  const before = structuredClone(captured)
  const result = await calibrateCompilerEdge({ key, path: importer }, "./omni.ts", captured)
  expect(result.accepted).toBe(key)
  expect(result.restored).toBe(key)
  expect(result.rejected.map((control) => [control.name, control.observed])).toEqual([
    ["same-basename-only", "PROVIDER_COMPILER_EDGE_NOT_CAPTURED"],
    ["wrong-parent", "PROVIDER_COMPILER_EDGE_NOT_CAPTURED"],
    ["unrecorded-edge", "PROVIDER_COMPILER_EDGE_NOT_CAPTURED"],
    ["ambiguous-canonical-input", "PROVIDER_COMPILER_EDGE_PATH_AMBIGUOUS"],
  ])
  expect(captured).toEqual(before)
})

test("calibration cannot pass without genuine acceptance or same-basename decoy", async () => {
  await expect(calibrateCompilerEdge({ key: "wrong-key", path: importer }, "./omni.ts", captured))
    .rejects.toThrow(new Error("PROVIDER_COMPILER_SELF_EDGE_CONTROL_NOT_ACCEPTED"))
  await expect(calibrateCompilerEdge({ key, path: importer }, "./omni.ts", new Map([[importer, [key]]])))
    .rejects.toThrow(new Error("PROVIDER_COMPILER_SAME_BASENAME_CONTROL_MISSING"))
})
