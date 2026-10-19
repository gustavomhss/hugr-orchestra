// @atlas/cli — test/territory-cli.test.ts  (R4 / B-R4-01b — `atlas territory` runner)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { runTerritory, territoryPorts, type TerritoryPorts } from "../src/territory-cli.js"
import { OPS_COMMANDS } from "../src/ops-cli.js"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-territory-cli-"))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

const ports = (ratifyToken: string | undefined): TerritoryPorts => ({ repoPath: tmp, ratifyToken })
const API = ["api", "packages/api/**", "packages/api-types/**"]
const T1 = { owner: "backend", tier: "T1", project: "proj-1" }
const catalogFile = () => join(tmp, "TERRITORY-CATALOG.json")

describe("territory-cli", () => {
  it("case 1: requires name and glob", () => {
    const r = runTerritory(ports("gus"), ["api"], T1)
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("territory requires <name> and at least one <glob>")
  })

  it("case 2: requires owner", () => {
    const r1 = runTerritory(ports("gus"), API, { tier: "T1" })
    expect(r1.exitCode).toBe(1)
    expect(r1.stdout).toContain("territory requires --owner <seat>")
    const r2 = runTerritory(ports("gus"), API, { owner: "true", tier: "T1" })
    expect(r2.exitCode).toBe(1)
    expect(r2.stdout).toContain("territory requires --owner <seat>")
  })

  it("case 3: requires tier", () => {
    const r = runTerritory(ports("gus"), API, { owner: "backend", tier: "T3" })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("territory requires --tier <T0|T1|T2>")
  })

  it("case 4: refusal without token", () => {
    const r1 = runTerritory(ports(undefined), API, T1)
    expect(r1.exitCode).toBe(2)
    expect(r1.stdout).toContain("status: rejected")
    expect(r1.stdout).toContain("set ATLAS_RATIFY_TOKEN")
    expect(existsSync(catalogFile())).toBe(false)
    const r2 = runTerritory(ports("  "), API, T1)
    expect(r2.exitCode).toBe(2)
    expect(r2.stdout).toContain("status: rejected")
    expect(r2.stdout).toContain("set ATLAS_RATIFY_TOKEN")
    expect(existsSync(catalogFile())).toBe(false)
  })

  it("case 5: T0 needs billy", () => {
    const r1 = runTerritory(ports("gus"), API, { ...T1, tier: "T0" })
    expect(r1.exitCode).toBe(2)
    expect(r1.stdout).toContain("needs ATLAS_RATIFY_TOKEN=billy")
    const r2 = runTerritory(ports("billy"), API, { ...T1, tier: "T0" })
    expect(r2.exitCode).toBe(0)
  })

  it("case 6: declared", () => {
    const r = runTerritory(ports("gus"), API, T1)
    expect(r.exitCode).toBe(0)
    expect(r.stdout.startsWith("status: ok\n")).toBe(true)
    expect(r.stdout).toContain("'api' is declared in TERRITORY-CATALOG.json")
    expect(r.stdout).toContain("globs packages/api/** packages/api-types/**")
    const raw: unknown = JSON.parse(readFileSync(catalogFile(), "utf8"))
    const parsed = raw as { projectId: string; territories: { globs: string[] }[] }
    const first = parsed.territories[0]
    if (first === undefined) throw new Error("expected territory")
    expect(first.globs).toEqual(["packages/api/**", "packages/api-types/**"])
    expect(parsed.projectId).toBe("proj-1")
  })

  it("case 7: replaced on second call", () => {
    runTerritory(ports("gus"), API, T1)
    const r = runTerritory(ports("gus"), API, T1)
    expect(r.stdout).toContain("'api' is replaced")
  })

  it("case 8: no project refusal", () => {
    const r = runTerritory(ports("gus"), API, { owner: "backend", tier: "T1" })
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("--project <id>")
  })

  it("case 9: territoryPorts reads env", () => {
    vi.stubEnv("ATLAS_RATIFY_TOKEN", "gus")
    expect(territoryPorts().ratifyToken).toBe("gus")
    expect(territoryPorts().repoPath).toBe(process.cwd())
  })

  it("case 10: OPS_COMMANDS.territory is function", () => {
    expect(typeof OPS_COMMANDS.territory).toBe("function")
  })
})
