import { describe, expect, test } from "bun:test"
import { validateProjectConfig, type ProjectConfig, type ProjectConfigField } from "../../src/maestro/project-config"

const config: ProjectConfig = {
  owner: "gustavomhss",
  projectID: "PVT_kwHODZlCY84Bkufi",
  projectNumber: 2,
  fields: [
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeEZQ",
      name: "Status",
      type: "SingleSelect",
      options: [
        { id: "f75ad846", name: "Todo" },
        { id: "47fc9ee4", name: "In Progress" },
        { id: "98236657", name: "Done" },
      ],
    },
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeEfs",
      name: "CI",
      type: "SingleSelect",
      options: [
        { id: "5e5dc314", name: "Not required" },
        { id: "28f62ede", name: "Planned" },
        { id: "e9ba446f", name: "Pending" },
        { id: "b97c0da3", name: "Green" },
        { id: "c57b4aa7", name: "Red" },
        { id: "8fac1095", name: "Stale" },
      ],
    },
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeEf0",
      name: "Seat",
      type: "SingleSelect",
      options: [
        { id: "01b0cacc", name: "Maestro" },
        { id: "848d4e73", name: "Backend" },
        { id: "60a9b6ec", name: "Patty" },
        { id: "11dd93df", name: "Lucy" },
        { id: "37d9d703", name: "Bobby" },
        { id: "905fe6a8", name: "Billy" },
        { id: "ac92afd9", name: "Jimmy" },
        { id: "08feaad7", name: "Rosie" },
        { id: "bab8dcee", name: "Frankie" },
      ],
    },
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeEf4",
      name: "Priority",
      type: "SingleSelect",
      options: [
        { id: "74ef11b7", name: "P0" },
        { id: "a47b10e1", name: "P1" },
        { id: "69ca99ab", name: "P2" },
        { id: "c7286fe0", name: "P3" },
      ],
    },
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeEi8",
      name: "Risk",
      type: "SingleSelect",
      options: [
        { id: "5b547516", name: "Low" },
        { id: "6f6cc626", name: "Medium" },
        { id: "492b6113", name: "High" },
        { id: "fa5d760f", name: "Critical" },
      ],
    },
    {
      id: "PVTSSF_lAHODZlCY84BkufizhjeIiM",
      name: "Stage",
      type: "SingleSelect",
      options: [
        { id: "46904642", name: "Planned" },
        { id: "b2ba17b9", name: "Ready" },
        { id: "3634d6bb", name: "Running" },
        { id: "88760719", name: "Blocked" },
        { id: "1a300016", name: "Review" },
        { id: "63dffbae", name: "CI" },
        { id: "befe072e", name: "Merge Ready" },
        { id: "e411cd71", name: "Closed" },
        { id: "328f1833", name: "Cancelled" },
        { id: "e27ab734", name: "Superseded" },
      ],
    },
    { id: "PVTF_lAHODZlCY84BkufizhjeEi4", name: "Blocked reason", type: "ProjectV2Field" },
    { id: "PVTF_lAHODZlCY84BkufizhjeEZY", name: "Linked pull requests", type: "ProjectV2Field" },
  ],
}

describe("maestro.project-config", () => {
  test("binds Seat options by option id and member id, not by label", () => {
    const relabel = (rename: (option: { id: string; name: string }) => { id: string; name: string }) =>
      config.fields.map((field) =>
        field.name === "Seat"
          ? { ...field, options: field.options?.map((option) => rename({ id: option.id, name: option.name ?? "" })) }
          : field,
      )
    const renamed = relabel((option) => (option.id === "848d4e73" ? { ...option, name: "Pikachu" } : option))
    const result = validateProjectConfig({ ...config, fields: renamed })
    if (result.status !== "VALID") throw new Error("expected a relabeled Seat option to validate")
    const seat = result.config.fields.find((field) => field.name === "Seat")
    expect(seat?.options?.find((option) => option.memberId === "backend")?.id).toBe("848d4e73")
    expect(seat?.options?.every((option) => option.name === undefined)).toBe(true)
    const moved = relabel((option) => (option.id === "848d4e73" ? { ...option, id: "deadbeef" } : option))
    expect(validateProjectConfig({ ...config, fields: moved })).toEqual({ status: "HOLD", reason: "field-mismatch" })
  })

  test("validates full 19-field census with unrelated fields", () => {
    const fields = [
      ...config.fields,
      ...Array.from({ length: 11 }, (_, index) => ({
        id: `extra-${index}`,
        name: `Extra ${index}`,
        type: "ProjectV2Field",
      })),
    ]
    expect(validateProjectConfig({ ...config, fields }).status).toBe("VALID")
  })

  test("holds malformed input and wrong Project identity", () => {
    expect(validateProjectConfig(null)).toEqual({ status: "HOLD", reason: "invalid-config" })
    expect(validateProjectConfig({ ...config, fields: null })).toEqual({ status: "HOLD", reason: "invalid-config" })
    expect(validateProjectConfig({ ...config, owner: "other" })).toEqual({
      status: "HOLD",
      reason: "project-owner-mismatch",
    })
    expect(validateProjectConfig({ ...config, projectID: "other" })).toEqual({
      status: "HOLD",
      reason: "project-id-mismatch",
    })
    expect(validateProjectConfig({ ...config, projectNumber: 3 })).toEqual({
      status: "HOLD",
      reason: "project-number-mismatch",
    })
  })

  test("holds malformed unrelated census fields", () => {
    for (const malformed of [
      null,
      1,
      { id: "", name: "Extra", type: "ProjectV2Field" },
      { id: "extra", name: "", type: "ProjectV2Field" },
      { id: "extra", name: "Extra", type: "" },
      { id: "extra", name: "Extra", type: "ProjectV2Field", options: null },
      { id: "extra", name: "Extra", type: "ProjectV2Field", options: [null] },
      { id: "extra", name: "Extra", type: "ProjectV2Field", options: [{ id: "", name: "Option" }] },
      { id: "extra", name: "Extra", type: "ProjectV2Field", options: [{ id: "option", name: "" }] },
    ]) {
      expect(validateProjectConfig({ ...config, fields: [...config.fields, malformed] })).toEqual({
        status: "HOLD",
        reason: "invalid-config",
      })
    }
  })

  test("holds missing and duplicate fields", () => {
    expect(validateProjectConfig({ ...config, fields: config.fields.slice(1) })).toEqual({
      status: "HOLD",
      reason: "missing-field",
    })
    expect(validateProjectConfig({ ...config, fields: [...config.fields, config.fields[0]] })).toEqual({
      status: "HOLD",
      reason: "duplicate-field",
    })
  })

  test("holds field ID, name, and type mismatches", () => {
    for (const fields of [
      [{ ...config.fields[0], id: "wrong" }, ...config.fields.slice(1)],
      [{ ...config.fields[0], name: "wrong" }, ...config.fields.slice(1)],
      [{ ...config.fields[0], type: "wrong" }, ...config.fields.slice(1)],
    ]) {
      expect(validateProjectConfig({ ...config, fields })).toEqual({ status: "HOLD", reason: "field-mismatch" })
    }
  })

  test("holds missing, extra, renamed, and ID-drifted SingleSelect options", () => {
    const status = config.fields[0] as ProjectConfigField & { options: NonNullable<ProjectConfigField["options"]> }
    for (const options of [
      status.options.slice(1),
      [...status.options, { id: "extra", name: "Extra" }],
      [{ ...status.options[0], name: "Renamed" }, ...status.options.slice(1)],
      [{ ...status.options[0], id: "drifted" }, ...status.options.slice(1)],
    ]) {
      expect(validateProjectConfig({ ...config, fields: [{ ...status, options }, ...config.fields.slice(1)] })).toEqual(
        {
          status: "HOLD",
          reason: "field-mismatch",
        },
      )
    }
  })
})
