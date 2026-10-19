import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildOwnExport } from "../src/own-export.js"
import type { OwnLeg } from "../src/own-source.js"

let tmp = ""

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-own-export-"))
  const src = join(tmp, "packages", "a", "src")
  const bsrc = join(tmp, "packages", "b", "src")
  const atlas = join(tmp, "packages", "a", ".atlas")
  mkdirSync(src, { recursive: true })
  mkdirSync(bsrc, { recursive: true })
  mkdirSync(atlas, { recursive: true })
  writeFileSync(join(tmp, "packages", "a", "src", "x.ts"), "export const a = 1\n")
  writeFileSync(join(tmp, "packages", "a", ".atlas", "cas.json"), "{}\n")
  writeFileSync(join(tmp, "packages", "b", "src", "y.ts"), "export const b = 1\n")
  execFileSync("git", ["-C", tmp, "init"], { stdio: "ignore" })
  execFileSync("git", ["-C", tmp, "add", "."], { stdio: "ignore" })
  execFileSync("git", ["-C", tmp, "-c", "user.name=Own", "-c", "user.email=own@test.invalid", "commit", "-m", "seed"], {
    stdio: "ignore",
  })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const git = (...args: string[]) => execFileSync("git", ["-C", tmp, ...args], { encoding: "utf8" }).trim()

const packFor = (unit: string, freshness = "FRESH") => ({
  unit: `${unit} owns its files.`,
  invariants: [{ nodeId: `${unit}:inv`, tier: "T1", claim: "It holds.", freshness }],
  shape: { contents: [`${unit}/src`], owner: "backend", tier: "T1" },
  edges: { dependents: [], dependencies: [] },
  gotchas: [],
  memory: null,
  drill: { finer: [], refresh: { pull: `poke:${unit}` }, complement: { pull: `relate:${unit}` } },
  grounding: { source: "tree" },
  tokenEstimate: 8,
  manifest: { pointers: [], truncated: false },
  pullReachable: [],
  advisory: [],
  advisoryDropped: 0,
})

const legOf = (freshness = "FRESH"): OwnLeg => (scope) => ({ tool: `own_${scope}`, pack: packFor(scope, freshness) as never })

describe("buildOwnExport", () => {
  it("case 1: builds one unit from HEAD", () => {
    const result = buildOwnExport(tmp, legOf(), ["packages/a"])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    const head = git("rev-parse", "HEAD")
    expect(result.snapshot.sourceRevision).toBe(head)
    expect(result.snapshot.snapshot).toBe(`atlas-own-export:${head}`)
    const unit = result.snapshot.units[0]
    if (unit === undefined) throw new Error("expected unit")
    expect(unit.unit).toEqual({ level: "module", id: "packages/a", grounding: git("rev-parse", "HEAD:packages/a") })
    expect(unit.sourceBlobs).toEqual({ "packages/a/src/x.ts": git("hash-object", "packages/a/src/x.ts") })
    expect(result.rebuilt).toEqual(["packages/a"])
    expect(result.carried).toEqual([])
  })

  it("case 2: carries committed units that are not named", () => {
    const b = buildOwnExport(tmp, legOf(), ["packages/b"])
    expect(b.ok).toBe(true)
    if (!b.ok) throw new Error("expected ok")
    writeFileSync(join(tmp, "OWN-SNAPSHOT.json"), JSON.stringify(b.snapshot))
    const a = buildOwnExport(tmp, legOf(), ["packages/a"])
    expect(a.ok).toBe(true)
    if (!a.ok) throw new Error("expected ok")
    expect(a.snapshot.units.map((entry) => entry.unit.id)).toEqual(["packages/a", "packages/b"])
    const carried = a.snapshot.units.find((entry) => entry.unit.id === "packages/b")
    const original = b.snapshot.units.find((entry) => entry.unit.id === "packages/b")
    if (carried === undefined || original === undefined) throw new Error("expected carried unit")
    expect(carried).toEqual(original)
    expect(a.carried).toEqual(["packages/b"])
  })

  it("case 3: de-duplicates named units", () => {
    const result = buildOwnExport(tmp, legOf(), ["packages/a", "packages/a"])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.snapshot.units).toHaveLength(1)
    expect(result.rebuilt).toEqual(["packages/a"])
  })

  it("case 4: refuses non-fresh packs", () => {
    const result = buildOwnExport(tmp, legOf("STALE"), ["packages/a"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("not FRESH: packages/a packages/a:inv (STALE)")
  })

  it("case 5: refuses a unit with no tracked file", () => {
    const result = buildOwnExport(tmp, legOf(), ["packages/zzz"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("no tracked file at HEAD under: packages/zzz")
  })

  it("case 6: refuses a malformed committed snapshot", () => {
    writeFileSync(join(tmp, "OWN-SNAPSHOT.json"), "{")
    const result = buildOwnExport(tmp, legOf(), ["packages/a"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("does not parse")
  })

  it("case 7: refuses a repository without HEAD", () => {
    const empty = mkdtempSync(join(tmpdir(), "atlas-own-export-empty-"))
    execFileSync("git", ["-C", empty, "init"], { stdio: "ignore" })
    const result = buildOwnExport(empty, legOf(), ["packages/a"])
    rmSync(empty, { recursive: true, force: true })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("has no readable HEAD commit")
  })
})
