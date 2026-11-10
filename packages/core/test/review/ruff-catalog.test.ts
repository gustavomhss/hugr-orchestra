import { describe, expect, test } from "bun:test"
import ruffPin from "../../src/backend-toolkit/packs/ruff"
import { ruff } from "../../src/review/catalog/ruff"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewRuffReport } from "../../src/review-toolkit/packs/ruff-report"

const catalog = ReviewCatalog.current
const settings = { acceptedUnavailable: [] }

describe("ruff catalog", () => {
  test("the pack reuses the backend pin and stays a no-build Python probation check", () => {
    const pack = catalog.packs.find((entry) => entry.id === "ruff")
    expect(pack).toMatchObject({
      id: "ruff",
      tool: "ruff",
      version: "0.17.3",
      licence: "pinned",
      backend: "pinned",
      languages: ["python"],
      detection: { manifests: [], extensions: [".py", ".pyi"], absent: [] },
      lane: "no-build",
      tiers: ["standard", "deep"],
      output: { format: "json", parser: "ruff" },
      cost: "low",
      network: { kind: "none" },
      scratchWrites: false,
      template: "ruff-curated-json",
      lenses: ["correctness-logic"],
      status: "probation",
    })
    expect(pack?.version).toBe(ruffPin.version)
    expect(pack?.pin).toEqual({
      source: "backend-toolkit/packs/ruff",
      integrity: Object.fromEntries(Object.entries(ruffPin.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    })
    expect(Object.keys(pack?.pin?.integrity ?? {}).sort()).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])
    expect(pack?.tiers).not.toContain("quick")
    if (!pack) throw new Error("missing ruff pack")
    expect(pack).toEqual(ruff.pack)
  })

  test("python detection already includes .py and .pyi and names the sourced team-stack leaf", () => {
    expect(catalog.languages.find((entry) => entry.id === "python")).toMatchObject({
      node: "team-stack-python",
      detection: {
        manifests: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock", "uv.lock"],
        extensions: [".py", ".pyi"],
        absent: [],
      },
    })
  })

  test("the two native rules are F821 and F823, and no tool:ruff option is offered", () => {
    const rules = catalog.rules.filter((entry) => entry.pack === "ruff")
    expect(ruff.rules.map((entry) => entry.rule)).toEqual(["F821", "F823"])
    expect([...ReviewRuffReport.RULES]).toEqual(["F821", "F823"])
    expect(rules.map((entry) => entry.rule)).toEqual(["F821", "F823"])
    for (const entry of rules) {
      expect(entry).toMatchObject({
        pack: "ruff",
        class: "logic.invariant",
        lens: "correctness-logic",
        severity: { "*": "P2" },
        status: "probation",
      })
      expect(entry.triage.length).toBeLessThanOrEqual(240)
      expect(entry.triage.startsWith(`${entry.rule}:`)).toBe(true)
    }
    expect(rules.find((entry) => entry.rule === "F821")?.triage).toContain("py311")
    expect(rules.find((entry) => entry.rule === "F821")?.triage).toContain("deployed")
    expect(rules.find((entry) => entry.rule === "F823")?.triage).toContain("local-before-assignment")
    expect(rules.find((entry) => entry.rule === "F823")?.triage).toContain("shadowing")
    expect(catalog.options.map((option) => option.id)).not.toContain("tool:ruff")
  })

  test("Standard routes ruff for .py and .pyi, not for SQL or TypeScript, and Quick does not", () => {
    const py = route("standard", "src/a.py", "value = 1")
    expect(py.languages).toContainEqual({ id: "python", source: "path", signal: "src/a.py" })
    expect(py.packs).toContainEqual({ id: "ruff", source: "catalog", lane: "no-build", status: "routed" })
    const pyi = route("standard", "src/a.pyi", "x: int")
    expect(pyi.languages).toContainEqual({ id: "python", source: "path", signal: "src/a.pyi" })
    expect(pyi.packs).toContainEqual({ id: "ruff", source: "catalog", lane: "no-build", status: "routed" })
    const ts = route("standard", "src/app.ts", "const n = 1")
    expect(ts.languages.some((language) => language.id === "python")).toBe(false)
    expect(ts.packs.some((pack) => pack.id === "ruff")).toBe(false)
    const sql = route("standard", "db/migrate.sql", "select 1;")
    expect(sql.languages.some((language) => language.id === "python")).toBe(false)
    expect(sql.packs.some((pack) => pack.id === "ruff")).toBe(false)
    const sqlWithManifest = ReviewRoute.route(
      { stage: "code", tier: "standard", settings },
      { files: ["pyproject.toml"] },
      { files: ["db/migrate.sql"], changes: [{ path: "db/migrate.sql", added: [{ line: 1, text: "select 1;" }], removed: 0 }] },
      catalog,
    )
    expect(sqlWithManifest.languages).toContainEqual({ id: "python", source: "path", signal: "pyproject.toml" })
    expect(sqlWithManifest.packs.some((pack) => pack.id === "ruff")).toBe(false)
    const quick = route("quick", "src/a.py", "value = 1")
    expect(quick.tier.id).toBe("quick")
    expect(quick.packs.some((pack) => pack.id === "ruff")).toBe(false)
  })
})

function route(tier: string, file: string, text: string) {
  return ReviewRoute.route(
    { stage: "code", tier, settings },
    { files: [] },
    { files: [file], changes: [{ path: file, added: [{ line: 1, text }], removed: 0 }] },
    catalog,
  )
}
