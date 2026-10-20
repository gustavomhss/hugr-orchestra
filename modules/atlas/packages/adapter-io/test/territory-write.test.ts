import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { declareTerritory, TERRITORY_CATALOG_FILE } from "../src/territory-write.js"
import { territoryCatalog } from "@atlas/retrieval"

const API = { name: "api", owner: "backend", tier: "T1" as const, globs: ["packages/api/**"] }

let tmp = ""

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-territory-"))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const file = () => join(tmp, TERRITORY_CATALOG_FILE)

describe("declareTerritory", () => {
  it("refuses without a project when no catalog exists", () => {
    const result = declareTerritory(tmp, { ...API })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("--project <id>")
    expect(existsSync(file())).toBe(false)
  })

  it("creates a catalog and returns a matching catalogVersion", () => {
    const result = declareTerritory(tmp, { ...API, projectId: "proj-1" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.replaced).toBe(false)
    expect(readFileSync(file(), "utf8").endsWith("}\n")).toBe(true)
    const parsed = JSON.parse(readFileSync(file(), "utf8")) as { catalogVersion: string }
    expect(
      territoryCatalog("proj-1", JSON.parse(readFileSync(file(), "utf8"))).territories,
    ).toEqual([{ name: "api", owner: "backend", tier: "T1", globs: ["packages/api/**"] }])
    expect(result.catalog.catalogVersion).toBe(parsed.catalogVersion)
  })

  it("appends a second territory in declaration order", () => {
    declareTerritory(tmp, { ...API, projectId: "proj-1" })
    const result = declareTerritory(tmp, { name: "web", owner: "jimmy", tier: "T2", globs: ["packages/web/**"] })
    expect(result.ok).toBe(true)
    const parsed = JSON.parse(readFileSync(file(), "utf8")) as { territories?: Array<{ name: string }> }
    expect(parsed.territories?.map((territory) => territory.name)).toEqual(["api", "web"])
  })

  it("replaces an existing territory in place and changes the version", () => {
    declareTerritory(tmp, { ...API, projectId: "proj-1" })
    declareTerritory(tmp, { name: "web", owner: "jimmy", tier: "T2", globs: ["packages/web/**"] })
    const before = JSON.parse(readFileSync(file(), "utf8")) as { catalogVersion: string }
    const result = declareTerritory(tmp, { ...API, owner: "archie" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.replaced).toBe(true)
    const parsed = JSON.parse(readFileSync(file(), "utf8")) as { territories?: Array<{ name: string; owner: string }> }
    expect(parsed.territories?.map((territory) => territory.name)).toEqual(["api", "web"])
    const api = parsed.territories?.[0]
    if (api === undefined) throw new Error("missing api")
    expect(api.owner).toBe("archie")
    const after = JSON.parse(readFileSync(file(), "utf8")) as { catalogVersion: string }
    expect(after.catalogVersion).not.toBe(before.catalogVersion)
  })

  it("refuses a mismatched projectId and leaves bytes unchanged", () => {
    declareTerritory(tmp, { ...API, projectId: "proj-1" })
    const beforeBytes = readFileSync(file())
    const result = declareTerritory(tmp, { ...API, projectId: "proj-2" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("is the catalog of project 'proj-1', not 'proj-2'")
    expect(readFileSync(file())).toEqual(beforeBytes)
  })

  it("refuses a hand-edited catalog and leaves bytes unchanged", () => {
    declareTerritory(tmp, { ...API, projectId: "proj-1" })
    const parsed = JSON.parse(readFileSync(file(), "utf8")) as { territories?: Array<{ owner: string }> }
    const territories = parsed.territories
    if (territories === undefined) throw new Error("missing territories")
    const first = territories[0]
    if (first === undefined) throw new Error("missing territory")
    first.owner = "mallory"
    const handEdited = JSON.stringify(parsed, null, 2)
    writeFileSync(file(), handEdited)
    const result = declareTerritory(tmp, { name: "web", owner: "jimmy", tier: "T2", globs: ["packages/web/**"] })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("does not verify")
    expect(readFileSync(file(), "utf8")).toBe(handEdited)
  })

  it("refuses malformed JSON", () => {
    writeFileSync(file(), "{")
    const result = declareTerritory(tmp, { ...API, projectId: "proj-1" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("does not verify")
  })

  it("refuses a non-canonical territory name without writing", () => {
    const result = declareTerritory(tmp, { ...API, name: "   ", projectId: "proj-1" })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected refusal")
    expect(result.reason).toContain("non-canonical territory catalog")
    expect(existsSync(file())).toBe(false)
  })
})
