import { describe, expect, test } from "bun:test"
import squawk from "../../src/backend-toolkit/packs/squawk"
import { phase4 } from "../../src/review/catalog/phase4"
import { ReviewSquawkReport } from "../../src/review-toolkit/packs/squawk-report"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"

// An independent inventory checks both the declarative catalog and the parser.

const RULES = [
  "require-concurrent-index-creation", "require-concurrent-index-deletion", "constraint-missing-not-valid",
  "adding-field-with-default", "adding-foreign-key-constraint", "changing-column-type",
  "adding-not-nullable-field", "adding-serial-primary-key-field", "renaming-column", "renaming-table",
  "disallowed-unique-constraint", "ban-drop-database", "prefer-bigint-over-int", "prefer-bigint-over-smallint",
  "prefer-identity", "prefer-repack", "prefer-robust-stmts", "prefer-text-field", "prefer-timestamp-tz",
  "ban-char-field", "ban-drop-column", "ban-drop-table", "ban-drop-not-null", "transaction-nesting",
  "adding-required-field", "ban-concurrent-index-creation-in-transaction", "unused-ignore",
  "ban-create-domain-with-constraint", "ban-alter-domain-with-add-constraint", "ban-truncate-cascade",
  "require-timeout-settings", "ban-uncommitted-transaction", "require-enum-value-ordering",
  "require-table-schema", "identifier-too-long", "require-concurrent-partition-detach",
  "require-concurrent-reindex", "require-lock-timeout", "require-statement-timeout",
  "ban-duplicate-column-assignments", "ban-drop-view", "ban-drop-function", "ban-drop-type",
  "ban-drop-default", "ban-drop-trigger",
] as const

const catalog = ReviewCatalog.current
const settings = { acceptedUnavailable: [] }

describe("squawk catalog", () => {
  test("the pack reuses the backend pin and stays a no-build SQL probation check", () => {
    const pack = catalog.packs.find((entry) => entry.id === "squawk")
    expect(pack).toMatchObject({
      id: "squawk",
      tool: "squawk",
      version: "2.67.0",
      licence: "pinned",
      backend: "pinned",
      languages: ["sql"],
      detection: { manifests: [], extensions: [".sql"], absent: [] },
      lane: "no-build",
      tiers: ["standard", "deep"],
      output: { format: "json", parser: "squawk" },
      cost: "low",
      network: { kind: "none" },
      scratchWrites: false,
      template: "squawk-json",
      lenses: ["contracts"],
      status: "probation",
    })
    expect(pack?.version).toBe(squawk.version)
    expect(pack?.pin).toEqual({
      source: "backend-toolkit/packs/squawk",
      integrity: Object.fromEntries(Object.entries(squawk.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    })
    expect(pack?.tiers).not.toContain("quick")
  })

  test("sql detection is extension-only and names the sourced team-stack leaf", () => {
    const language = catalog.languages.find((entry) => entry.id === "sql")
    expect(language?.detection).toEqual({ manifests: [], extensions: [".sql"], absent: [] })
    expect(language?.node).toBe("team-stack-sql")
  })

  test("all 45 native rules map to contracts.data at P2 probation with their own triage", () => {
    const rules = catalog.rules.filter((entry) => entry.pack === "squawk")
    expect(phase4.rules.map((entry) => entry.rule)).toEqual([...RULES])
    expect([...ReviewSquawkReport.RULES]).toEqual([...RULES])
    expect(rules.map((entry) => entry.rule)).toEqual([...RULES])
    expect(new Set(rules.map((entry) => entry.rule)).size).toBe(45)
    expect(new Set(rules.map((entry) => entry.triage)).size).toBe(45)
    for (const entry of rules) {
      expect(entry).toMatchObject({ pack: "squawk", class: "contracts.data", lens: "contracts", severity: { "*": "P2" }, status: "probation" })
      expect(entry.triage.startsWith(`${entry.rule}:`)).toBe(true)
      expect(entry.triage.length).toBeLessThanOrEqual(240)
      expect(entry.triage).not.toContain("all 45")
    }
    expect(catalog.options.map((option) => option.id)).not.toContain("tool:squawk")
    const triage = (rule: string) => rules.find((entry) => entry.rule === rule)?.triage ?? ""
    expect(triage("ban-char-field")).toContain("actual harm")
    expect(triage("prefer-identity")).toContain("actual harm")
    expect(triage("require-timeout-settings")).toContain("deprecated alias")
    expect(triage("require-timeout-settings")).toContain("not claim a distinct rule is emitted by default")
    expect(triage("require-table-schema")).toContain("Opt-in")
    expect(triage("ban-drop-trigger")).toContain("Opt-in")
    expect(triage("unused-ignore")).toContain("unknown suppression-rule name")
    expect(catalog.overlays.find((overlay) => overlay.id === "data-migration")?.checks).toEqual(["squawk"])
  })

  test("a standard .sql change routes sql and squawk; a .ts change does not", () => {
    const sql = route("standard", "src/schema.sql", "select 1;")
    expect(sql.languages).toContainEqual({ id: "sql", source: "path", signal: "src/schema.sql" })
    expect(sql.packs).toContainEqual({ id: "squawk", source: "catalog", lane: "no-build", status: "routed" })
    expect(sql.overlays.find((overlay) => overlay.id === "data-migration")).toBeUndefined()
    const ts = route("standard", "src/app.ts", "const n = 1")
    expect(ts.languages.some((language) => language.id === "sql")).toBe(false)
    expect(ts.packs.some((pack) => pack.id === "squawk")).toBe(false)
  })

  test("a migrations path binds squawk; added-line content does not", () => {
    const bound = route("standard", "db/migrations/001.sql", "select 1;")
    expect(bound.overlays).toContainEqual({ id: "data-migration", source: "path", signal: "db/migrations/001.sql" })
    expect(bound.packs).toContainEqual({ id: "squawk", source: "path", lane: "no-build", status: "routed" })
    const suggested = route("standard", "src/notes.ts", "ALTER TABLE job ADD COLUMN x INTEGER;")
    expect(suggested.overlays.find((overlay) => overlay.id === "data-migration")).toEqual({
      id: "data-migration",
      source: "content",
      signal: "src/notes.ts:1 alter-table",
    })
    expect(suggested.packs.some((pack) => pack.id === "squawk")).toBe(false)
  })

  test("Quick skips an ordinary .sql file and still requires squawk on a migrations path", () => {
    const plain = route("quick", "src/schema.sql", "select 1;")
    expect(plain.tier.id).toBe("quick")
    expect(plain.packs.some((pack) => pack.id === "squawk")).toBe(false)
    const required = route("quick", "db/migrations/001.sql", "select 1;")
    expect(required.tier.id).toBe("quick")
    expect(required.overlays).toContainEqual({ id: "data-migration", source: "path", signal: "db/migrations/001.sql" })
    expect(required.packs).toContainEqual({ id: "squawk", source: "path", lane: "no-build", status: "routed" })
    const waived = ReviewRoute.route(
      { stage: "code", tier: "quick", settings: { acceptedUnavailable: ["squawk"] }, text: ["skip squawk", "no migration review"] },
      { files: [] },
      { files: ["db/migrations/001.sql"], changes: [{ path: "db/migrations/001.sql", added: [{ line: 1, text: "select 1;" }], removed: 0 }] },
      catalog,
    )
    expect(waived.packs).toContainEqual({ id: "squawk", source: "path", lane: "no-build", status: "routed" })
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
