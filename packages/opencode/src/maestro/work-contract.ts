export type WorkArtifactKind = "epic" | "issue" | "sub-issue" | "contract" | "task" | "work-package"

export type WorkContractSection =
  | "Definition of Done"
  | "Invariants"
  | "Quality Standards"
  | "Completeness Criteria"
  | "Success Criteria"

export type WorkContractHoldReason =
  | "unsupported-kind"
  | "missing-section"
  | "empty-section"
  | "malformed-heading"
  | "duplicate-section"

export type WorkContractValidation =
  | { status: "VALID"; sections: Record<WorkContractSection, string> }
  | { status: "HOLD"; reasons: WorkContractHoldReason[] }

const kinds: WorkArtifactKind[] = ["epic", "issue", "sub-issue", "contract", "task", "work-package"]

const sectionNames: WorkContractSection[] = [
  "Definition of Done",
  "Invariants",
  "Quality Standards",
  "Completeness Criteria",
  "Success Criteria",
]

function isKnownKind(value: unknown): value is WorkArtifactKind {
  return typeof value === "string" && kinds.includes(value as WorkArtifactKind)
}

function fenceMarker(line: string): { character: "`" | "~"; length: number } | undefined {
  const character = line[0]
  if (character !== "`" && character !== "~") return undefined

  let length = 0
  while (line[length] === character) length++
  if (length < 3) return undefined
  return { character, length }
}

function completeFences(lines: string[]): boolean[] {
  const ignored = Array<boolean>(lines.length).fill(false)

  for (let start = 0; start < lines.length; start++) {
    const opener = fenceMarker(lines[start])
    if (!opener) continue

    for (let end = start + 1; end < lines.length; end++) {
      const closer = fenceMarker(lines[end])
      if (!closer || closer.character !== opener.character || closer.length < opener.length) continue
      for (let index = start; index <= end; index++) ignored[index] = true
      start = end
      break
    }
  }

  return ignored
}

function headingLevel(line: string): number | undefined {
  let level = 0
  while (line[level] === "#") level++
  if (level === 0) return undefined
  if (line[level] !== undefined && line[level] !== " " && line[level] !== "\t") return undefined
  return level
}

function canonicalSection(line: string): WorkContractSection | undefined {
  return sectionNames.find((name) => line === `## ${name}`)
}

function isSpace(value: string | undefined): boolean {
  return value === " " || value === "\t"
}

function hasH2SectionSpacingVariant(line: string, name: WorkContractSection): boolean {
  if (!line.startsWith("##") || !isSpace(line[2])) return false

  let index = 2
  while (isSpace(line[index])) index++
  return (line[2] !== " " || index > 3) && line.slice(index).startsWith(name)
}

function hasUnspacedSectionHeading(line: string, name: WorkContractSection): boolean {
  let index = 0
  while (line[index] === "#") index++
  return index > 0 && line.slice(index).startsWith(name)
}

function hasPrefixedDelimiter(line: string, delimiter: string): boolean {
  let index = 0
  let prefixed = false

  while (index < line.length) {
    while (line[index] === " " || line[index] === "\t") {
      prefixed = true
      index++
    }

    if (line[index] === ">") {
      prefixed = true
      index++
      continue
    }

    if ((line[index] === "-" || line[index] === "*" || line[index] === "+") && isSpace(line[index + 1])) {
      prefixed = true
      index++
      continue
    }

    let digits = index
    while (line[digits] >= "0" && line[digits] <= "9") digits++
    if (
      digits > index &&
      (line[digits] === "." || line[digits] === ")") &&
      isSpace(line[digits + 1])
    ) {
      prefixed = true
      index = digits + 1
      continue
    }

    break
  }

  return prefixed && line.slice(index).startsWith(delimiter)
}

function malformedSection(line: string): WorkContractSection | undefined {
  for (const name of sectionNames) {
    const delimiter = `## ${name}`
    if (line.startsWith(delimiter)) return name
    if (hasH2SectionSpacingVariant(line, name)) return name
    if (hasUnspacedSectionHeading(line, name)) return name
    if (hasPrefixedDelimiter(line, delimiter)) return name

    const level = headingLevel(line)
    if (level === undefined || level === 2) continue
    const title = line.slice(level).trimStart()
    if (title.startsWith(name)) return name
  }
}

export function validateWorkContract(input: { kind: unknown; body: unknown }): WorkContractValidation {
  if (!isKnownKind(input.kind)) return { status: "HOLD", reasons: ["unsupported-kind"] }
  if (typeof input.body !== "string") return { status: "HOLD", reasons: ["malformed-heading"] }

  const lines = input.body.replaceAll("\r\n", "\n").split("\n")
  const ignored = completeFences(lines)
  const occurrences = new Map<WorkContractSection, string[][]>()
  const malformed = new Set<WorkContractSection>()
  let current: string[] | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const canonical = canonicalSection(line)
    if (ignored[index]) {
      if (canonical) malformed.add(canonical)
      continue
    }
    if (canonical) {
      const values = occurrences.get(canonical) ?? []
      current = []
      values.push(current)
      occurrences.set(canonical, values)
      continue
    }

    const level = headingLevel(line)
    if (level === 1 || level === 2) current = undefined
    if (current) current.push(line)

    const invalid = malformedSection(line)
    if (invalid) malformed.add(invalid)
  }

  const reasons: WorkContractHoldReason[] = []
  const sections = {} as Record<WorkContractSection, string>

  for (const name of sectionNames) {
    const values = occurrences.get(name) ?? []
    if (values.length === 0) {
      reasons.push(malformed.has(name) ? "malformed-heading" : "missing-section")
      continue
    }
    if (values.length > 1) reasons.push("duplicate-section")

    const extracted = values.map((value) => value.join("\n").trim())
    if (extracted.some((value) => value.length === 0)) reasons.push("empty-section")
    sections[name] = extracted[0]
  }

  const stableReasons = ([
    "unsupported-kind",
    "missing-section",
    "empty-section",
    "malformed-heading",
    "duplicate-section",
  ] as const).filter((reason) => reasons.includes(reason))

  if (stableReasons.length > 0) return { status: "HOLD", reasons: stableReasons }
  return { status: "VALID", sections }
}
