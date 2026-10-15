import { describe, expect, it } from "vitest"
import { createTerritoryCatalog } from "../src/territory-catalog.js"

const territory = (name: string) => ({ name, owner: "seat:atlas", tier: "T1" as const, globs: [`${name}/**`] })

describe("territory catalog boundary", () => {
  it("returns an immutable catalog by explicit project id and version", () => {
    const api = createTerritoryCatalog([
      { projectId: "project-a", catalogVersion: "catalog-1", territories: [territory("core")] },
    ])

    const result = api.territoryCatalog("project-a")
    expect(result).toMatchObject({ projectId: "project-a", catalogVersion: "catalog-1" })
    expect(result.territories.map((item) => item.name)).toEqual(["core"])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.territories)).toBe(true)
    expect(Object.isFrozen(result.territories[0])).toBe(true)
  })

  it("rejects duplicate project catalogs and duplicate territory names", () => {
    expect(() =>
      createTerritoryCatalog([
        { projectId: "project-a", catalogVersion: "catalog-1", territories: [] },
        { projectId: "project-a", catalogVersion: "catalog-2", territories: [] },
      ]),
    ).toThrow("duplicate project catalog")
    expect(() =>
      createTerritoryCatalog([
        { projectId: "project-a", catalogVersion: "catalog-1", territories: [territory("core"), territory("core")] },
      ]),
    ).toThrow("duplicate territory name")
  })

  it("rejects unknown projects and malformed catalog records", () => {
    const api = createTerritoryCatalog([])
    expect(() => api.territoryCatalog("missing")).toThrow("unknown project catalog")
    expect(() => createTerritoryCatalog([{ projectId: "", catalogVersion: "catalog-1", territories: [] }])).toThrow(
      "requires projectId",
    )
    expect(() =>
      createTerritoryCatalog([
        {
          projectId: "project-a",
          catalogVersion: "catalog-1",
          territories: [{ ...territory("core"), tier: "T9" as never }],
        },
      ]),
    ).toThrow("invalid territory fields")
  })
})
