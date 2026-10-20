import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OwnExport } from "@atlas/adapter-io"
import { runOwnExport, ownExportPorts, type OwnExportPorts } from "../src/own-export-cli.js"
import { OPS_COMMANDS } from "../src/ops-cli.js"

let tmp = ""
let calls: (readonly string[])[] = []

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-own-export-cli-"))
  calls = []
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const SNAP = { schemaVersion: 1, snapshot: "atlas-own-export:abc", sourceRevision: "a".repeat(40), units: [] } as never

const ports = (result: OwnExport | undefined): OwnExportPorts => ({
  repoPath: tmp,
  exportUnits: result === undefined ? undefined : (units) => {
    calls.push(units)
    return result
  },
})

const OK: OwnExport = { ok: true, snapshot: SNAP, rebuilt: ["packages/a"], carried: ["packages/b"] }

describe("own-export-cli", () => {
  it("case 1: requires at least one unit", () => {
    const r = runOwnExport(ports(OK), [], { out: "r.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("own-export requires at least one <unit>")
  })

  it("case 2: requires --out", () => {
    const r1 = runOwnExport(ports(OK), ["packages/a"], {})
    expect(r1.exitCode).toBe(1)
    expect(r1.stdout).toContain("requires --out <file>")
    const r2 = runOwnExport(ports(OK), ["packages/a"], { out: "true" })
    expect(r2.exitCode).toBe(1)
    expect(r2.stdout).toContain("requires --out <file>")
  })

  it("case 3: refuses --out inside .atlas", () => {
    const r = runOwnExport(ports(OK), ["packages/a"], { out: ".atlas/r.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("may not be inside .atlas")
    expect(calls).toEqual([])
  })

  it("case 4: refuses when runtime is not composed", () => {
    const r = runOwnExport(ports(undefined), ["packages/a"], { out: "r.json" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("atlas runtime is not composed yet")
  })

  it("case 5: propagates a governed refusal without writing", () => {
    const r = runOwnExport(
      ports({ ok: false, reason: "Own snapshot export requires fresh reviewed packs; not FRESH: packages/a a:inv (STALE)" }),
      ["packages/a"],
      { out: "r.json" },
    )
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(r.stdout).toContain("not FRESH: packages/a a:inv (STALE)")
    expect(existsSync(join(tmp, "r.json"))).toBe(false)
  })

  it("case 6: writes the reviewed snapshot", () => {
    const r = runOwnExport(ports(OK), ["packages/a"], { out: "r.json" })
    expect(r.exitCode).toBe(0)
    expect(readFileSync(join(tmp, "r.json"), "utf8")).toBe(`${JSON.stringify(SNAP, null, 2)}\n`)
    expect(r.stdout).toContain("rebuilt packages/a")
    expect(r.stdout).toContain("carried packages/b — unchanged from the committed OWN-SNAPSHOT.json")
    expect(calls).toEqual([["packages/a"]])
  })

  it("case 7: ownExportPorts wiring", () => {
    expect(ownExportPorts({} as never).exportUnits).toBeUndefined()
    expect(typeof ownExportPorts({ own: (() => ({})) as never } as never).exportUnits).toBe("function")
    expect(ownExportPorts({} as never).repoPath).toBe(process.cwd())
  })

  it("case 8: OPS_COMMANDS registration", () => {
    expect(typeof OPS_COMMANDS["own-export"]).toBe("function")
  })
})
