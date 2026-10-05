import { expect, test } from "bun:test"
import {
  inspectOwnSnapshot,
  publishTerritoryCatalog,
  territoryCatalog,
  verifyHostContext,
} from "../src/generated/boundary.js"

const territories = [{ name: "billing", owner: "charlie", tier: "T1", globs: ["src/**"] }] as const

test("canonical installed producer binds exact project and immutable content version", () => {
  const catalog = publishTerritoryCatalog("project-a", territories)
  expect(territoryCatalog("project-a", JSON.parse(JSON.stringify(catalog)))).toEqual(catalog)
  expect(catalog.catalogVersion).toMatch(/^[a-f0-9]{64}$/)
  expect(publishTerritoryCatalog("project-a", territories)).toEqual(catalog)
  expect(publishTerritoryCatalog("project-b", territories).catalogVersion).not.toBe(catalog.catalogVersion)
  expect(publishTerritoryCatalog("project-a", [{ ...territories[0], owner: "patty" }]).catalogVersion).not.toBe(
    catalog.catalogVersion,
  )
  expect(() => territoryCatalog("project-b", catalog)).toThrow("project mismatch")
  expect(() =>
    territoryCatalog("project-a", { ...catalog, territories: [{ ...territories[0], owner: "patty" }] }),
  ).toThrow("version mismatch")
  expect(Object.isFrozen(catalog)).toBe(true)
  expect(Object.isFrozen(catalog.territories[0])).toBe(true)
})

test("empty, duplicate, malformed and unavailable catalogs fail closed", () => {
  expect(() => publishTerritoryCatalog("project-a", [])).toThrow("empty")
  expect(() => publishTerritoryCatalog("project-a", [...territories, ...territories])).toThrow("duplicate")
  expect(() => publishTerritoryCatalog("project-a", [{ ...territories[0], name: "" }])).toThrow("non-canonical")
  expect(() => territoryCatalog("project-a", undefined)).toThrow()
  expect(() => territoryCatalog("", publishTerritoryCatalog("project-a", territories))).toThrow("missing project")
  expect(() =>
    territoryCatalog("project-a", {
      projectId: "project-a",
      catalogVersion: "version",
      territories: [{ name: "billing", owner: "charlie", tier: "BAD", globs: [] }],
    }),
  ).toThrow("invalid territory")
})

test("malformed or empty Own state is HOLD, never unseeded or empty readiness", () => {
  expect(inspectOwnSnapshot("{}").status).toBe("HOLD")
  expect(
    verifyHostContext({
      projectId: "project-a",
      catalog: publishTerritoryCatalog("project-a", territories),
      snapshotContent: "{}",
      files: [],
      currentBlobs: {},
    }),
  ).toMatchObject({ status: "HOLD", reason: "snapshot-invalid" })
})
