import { describe, expect, test } from "bun:test"
import {
  validateWorkContract,
  type WorkArtifactKind,
  type WorkContractSection,
} from "../../src/maestro/work-contract"

const kinds: WorkArtifactKind[] = ["epic", "issue", "sub-issue", "contract", "task", "work-package"]

const sections: Record<WorkContractSection, string> = {
  "Definition of Done": "observable completion",
  Invariants: "state remains true",
  "Quality Standards": "tests pass",
  "Completeness Criteria": "all paths covered",
  "Success Criteria": "user outcome reached",
}

const names = Object.keys(sections) as WorkContractSection[]

function contractBody(options: { omit?: WorkContractSection; empty?: WorkContractSection; malformed?: WorkContractSection } = {}) {
  return names
    .filter((name) => name !== options.omit)
    .map((name) => {
      if (name === options.malformed) return `# ${name}\n${sections[name]}`
      return `## ${name}\n${name === options.empty ? "" : sections[name]}`
    })
    .join("\n\n")
}

describe("maestro.work-contract", () => {
  for (const kind of kinds) {
    test(`validates and extracts ${kind}`, () => {
      expect(validateWorkContract({ kind, body: contractBody() })).toEqual({ status: "VALID", sections })
    })

    test(`holds ${kind} with missing section`, () => {
      expect(validateWorkContract({ kind, body: contractBody({ omit: "Success Criteria" }) })).toEqual({
        status: "HOLD",
        reasons: ["missing-section"],
      })
    })

    test(`holds ${kind} with empty section`, () => {
      expect(validateWorkContract({ kind, body: contractBody({ empty: "Definition of Done" }) })).toEqual({
        status: "HOLD",
        reasons: ["empty-section"],
      })
    })

    test(`holds ${kind} with malformed section`, () => {
      expect(validateWorkContract({ kind, body: contractBody({ malformed: "Definition of Done" }) })).toEqual({
        status: "HOLD",
        reasons: ["malformed-heading"],
      })
    })

    test(`holds ${kind} with duplicate section`, () => {
      const body = `${contractBody()}\n\n## Definition of Done\nsecond completion condition`
      expect(validateWorkContract({ kind, body })).toEqual({
        status: "HOLD",
        reasons: ["duplicate-section"],
      })
    })
  }

  test("holds unknown kinds and non-string bodies with exact reasons", () => {
    expect(validateWorkContract({ kind: "feature", body: contractBody() })).toEqual({
      status: "HOLD",
      reasons: ["unsupported-kind"],
    })
    expect(validateWorkContract({ kind: "issue", body: null })).toEqual({
      status: "HOLD",
      reasons: ["malformed-heading"],
    })
  })

  test("normalizes CRLF, ignores complete fences, and ends sections at non-canonical H2", () => {
    const body = [
      "## Definition of Done",
      "observable completion",
      "```markdown",
      "## Invariants",
      "ignored code content",
      "```",
      "## Context",
      "not definition content",
      "## Invariants",
      "state remains true",
      "## Quality Standards",
      "tests pass",
      "## Completeness Criteria",
      "all paths covered",
      "## Success Criteria",
      "user outcome reached",
    ].join("\r\n")

    expect(validateWorkContract({ kind: "issue", body })).toEqual({ status: "VALID", sections })
  })

  test("treats canonical text only inside a complete fence as malformed", () => {
    const body = `\`\`\`markdown\n## Definition of Done\nignored\n\`\`\`\n\n${contractBody({ omit: "Definition of Done" })}`
    expect(validateWorkContract({ kind: "issue", body })).toEqual({
      status: "HOLD",
      reasons: ["malformed-heading"],
    })
  })

  test("treats canonical text only inside a complete tilde fence as malformed", () => {
    const body = `~~~markdown\n## Definition of Done\nignored\n~~~\n\n${contractBody({ omit: "Definition of Done" })}`
    expect(validateWorkContract({ kind: "issue", body })).toEqual({
      status: "HOLD",
      reasons: ["malformed-heading"],
    })
  })

  test("allows a longer tilde run to close a complete fence", () => {
    const body = `~~~~markdown\n## Definition of Done\nignored\n~~~~~\n\n${contractBody({ omit: "Definition of Done" })}`
    expect(validateWorkContract({ kind: "issue", body })).toEqual({
      status: "HOLD",
      reasons: ["malformed-heading"],
    })
  })

  test("does not close a four-backtick fence with three backticks", () => {
    const body = [
      "````markdown",
      "## Definition of Done",
      "first ignored heading",
      "```",
      "## Definition of Done",
      "second ignored heading",
      "````",
      "## Invariants",
      "state remains true",
      "## Quality Standards",
      "tests pass",
      "## Completeness Criteria",
      "all paths covered",
      "## Success Criteria",
      "user outcome reached",
    ].join("\n")

    expect(validateWorkContract({ kind: "issue", body })).toEqual({
      status: "HOLD",
      reasons: ["malformed-heading"],
    })
  })

  test("ends sections at column-zero H1 headings", () => {
    const body = [
      "## Definition of Done",
      "observable completion",
      "# Context",
      "not definition content",
      "## Invariants",
      "state remains true",
      "## Quality Standards",
      "tests pass",
      "## Completeness Criteria",
      "all paths covered",
      "## Success Criteria",
      "user outcome reached",
    ].join("\n")

    expect(validateWorkContract({ kind: "issue", body })).toEqual({ status: "VALID", sections })
  })

  test("returns compound hold reasons in stable order", () => {
    const body = [
      "## Definition of Done",
      "first completion condition",
      "## Definition of Done",
      "second completion condition",
      "## Invariants",
      "# Quality Standards",
      "malformed quality heading",
      "## Completeness Criteria",
      "all paths covered",
    ].join("\n")

    expect(validateWorkContract({ kind: "issue", body })).toEqual({
      status: "HOLD",
      reasons: ["missing-section", "empty-section", "malformed-heading", "duplicate-section"],
    })
  })

  test("holds malformed canonical appearances outside fences", () => {
    const malformedBodies = [
      contractBody({ malformed: "Definition of Done" }).replace("# ", "### "),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "  ## Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "> ## Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "- ## Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "## Definition of Done #\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "## Definition of Done \nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "##\tDefinition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "##  Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "#Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "##Definition of Done\nwrong\n\n## Invariants"),
      contractBody({ omit: "Definition of Done" }).replace("## Invariants", "###Definition of Done\nwrong\n\n## Invariants"),
    ]

    for (const body of malformedBodies) {
      expect(validateWorkContract({ kind: "issue", body })).toEqual({
        status: "HOLD",
        reasons: ["malformed-heading"],
      })
    }
  })
})
