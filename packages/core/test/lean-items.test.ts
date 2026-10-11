import { expect, test } from "bun:test"
import path from "node:path"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { LeanTelemetry } from "../src/tool/lean-telemetry"

const input: LeanTelemetry.Input = {
  owner: { projectID: "project", location: "/repo/profile", sessionID: "session", callID: "call" },
  model: { provider: "provider", id: "model" }, producer: "native-shell", eligible: true,
  itemID: "cargo", status: "passthrough", reason: "item_disabled", before: "😀😀", after: "😀😀", durationMs: 0,
}

test("disabled item has exact whole-view bytes, current engine and no fictional filter profile", () => {
  const result = LeanTelemetry.measure(input)
  expect(result?.engine).toBe(LeanEngine.current)
  expect(result?.itemID).toBe("cargo")
  expect(result?.filterProfile).toBeUndefined()
  expect(result?.bytes).toEqual({ before: 8, after: 8, saved: 0 })
  expect(result?.tokens).toEqual({ kind: "estimated", counter: "chars-per-token-4", before: 1, after: 1, saved: 0 })
  expect(Object.isFrozen(result)).toBe(true)
  expect(result?.owner).not.toBe(input.owner)
  expect(JSON.stringify(result)).not.toContain("😀")
})

test("invalid itemID and counter failures cannot yield usable metrics", () => {
  expect(LeanTelemetry.measure({ ...input, itemID: "cargo test" as typeof input.itemID })).toBeUndefined()
  const descriptor = Object.getOwnPropertyDescriptor(Math, "round")!
  try {
    Object.defineProperty(Math, "round", { configurable: true, value: () => { throw new Error("counter failed") } })
    expect(LeanTelemetry.measure(input)).toBeUndefined()
  } finally {
    Object.defineProperty(Math, "round", descriptor)
  }
  expect(LeanTelemetry.measure(input)?.itemID).toBe("cargo")
})

test("measurement reads itemID once and rejects contradictory eligible unverified passthrough", () => {
  const reads = { count: 0 }
  expect(LeanTelemetry.measure({ ...input, get itemID() {
    if (++reads.count !== 1) throw new Error("itemID read twice")
    return "go" as const
  } })?.itemID).toBe("go")
  expect(reads.count).toBe(1)
  expect(LeanTelemetry.measure({ ...input, producer: "unverified" })).toBeUndefined()
})

test("measurement rejects cross-item filter attribution and accepts coherent current provenance", () => {
  expect(LeanTelemetry.measure({ ...input, filterProfile: "pytest" })).toBeUndefined()
  expect(LeanTelemetry.measure({ ...input, filterProfile: "cargo-test" })?.itemID).toBe("cargo")
})

test("full schema and core typechecks on CI", async () => {
  for (const name of ["schema", "core"]) {
    const compiler = Bun.spawn([process.execPath, "run", "typecheck"], {
      cwd: path.join(import.meta.dir, "../..", name), stdout: "pipe", stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      compiler.exited, new Response(compiler.stdout).text(), new Response(compiler.stderr).text(),
    ])
    if (code !== 0) throw new Error(`${name} typecheck failed (${code})\n${stdout}${stderr}`)
    expect(code).toBe(0)
  }
}, 180_000)
