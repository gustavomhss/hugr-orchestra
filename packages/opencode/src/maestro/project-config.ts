export type ProjectConfigField = {
  id: string
  name: string
  type: string
  options?: readonly ProjectConfigOption[]
}

export type ProjectConfigOption = {
  id: string
  name?: string
  // Seat options bind a board option to a stable member id (F1.1); the board's option label is presentation.
  memberId?: string
}

export type ProjectConfig = {
  owner: "gustavomhss"
  projectID: "PVT_kwHODZlCY84Bkufi"
  projectNumber: 2
  fields: readonly ProjectConfigField[]
}

export type ProjectConfigHoldReason =
  | "invalid-config"
  | "project-owner-mismatch"
  | "project-id-mismatch"
  | "project-number-mismatch"
  | "missing-field"
  | "duplicate-field"
  | "field-mismatch"

export type ProjectConfigValidation =
  | { status: "VALID"; config: ProjectConfig }
  | { status: "HOLD"; reason: ProjectConfigHoldReason }

const projectConfig: ProjectConfig = {
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
        { id: "01b0cacc", memberId: "maestro" },
        { id: "848d4e73", memberId: "charlie" },
        { id: "60a9b6ec", memberId: "patty" },
        { id: "11dd93df", memberId: "lucy" },
        { id: "37d9d703", memberId: "bobby" },
        { id: "905fe6a8", memberId: "billy" },
        { id: "ac92afd9", memberId: "jimmy" },
        { id: "08feaad7", memberId: "rosie" },
        { id: "bab8dcee", memberId: "frankie" },
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

export function validateProjectConfig(input: unknown): ProjectConfigValidation {
  if (!isRecord(input) || !Array.isArray(input.fields)) return { status: "HOLD", reason: "invalid-config" }
  if (input.owner !== projectConfig.owner) return { status: "HOLD", reason: "project-owner-mismatch" }
  if (input.projectID !== projectConfig.projectID) return { status: "HOLD", reason: "project-id-mismatch" }
  if (input.projectNumber !== projectConfig.projectNumber) return { status: "HOLD", reason: "project-number-mismatch" }
  if (!input.fields.every(isField)) return { status: "HOLD", reason: "invalid-config" }
  for (const expected of projectConfig.fields) {
    const matches = input.fields.filter(
      (field): field is ProjectConfigField => isField(field) && field.id === expected.id,
    )
    if (matches.length > 1) return { status: "HOLD", reason: "duplicate-field" }
    const field = matches[0]
    if (!field) {
      if (input.fields.some((field) => isField(field) && field.name === expected.name)) {
        return { status: "HOLD", reason: "field-mismatch" }
      }
      return { status: "HOLD", reason: "missing-field" }
    }
    if (field.name !== expected.name || field.type !== expected.type)
      return { status: "HOLD", reason: "field-mismatch" }
    if (!expected.options) continue
    const options = field.options
    if (!Array.isArray(options) || !options.every(isOption)) return { status: "HOLD", reason: "field-mismatch" }
    if (new Set(options.map((option) => option.id)).size !== options.length) {
      return { status: "HOLD", reason: "field-mismatch" }
    }
    if (options.length !== expected.options.length) return { status: "HOLD", reason: "field-mismatch" }
    if (
      expected.options.some(
        (expected) =>
          !options.some(
            (option) => option.id === expected.id && (expected.name === undefined || option.name === expected.name),
          ),
      )
    ) {
      return { status: "HOLD", reason: "field-mismatch" }
    }
  }

  return { status: "VALID", config: projectConfig }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isField(value: unknown): value is ProjectConfigField {
  return (
    isRecord(value) &&
    nonemptyString(value.id) &&
    nonemptyString(value.name) &&
    nonemptyString(value.type) &&
    (!Object.hasOwn(value, "options") || (Array.isArray(value.options) && value.options.every(isOption)))
  )
}

function isOption(value: unknown): value is ProjectConfigOption & { name: string } {
  return isRecord(value) && nonemptyString(value.id) && nonemptyString(value.name)
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
