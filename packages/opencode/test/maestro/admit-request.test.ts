import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { decideAdmission, IntentAssessment, isIntentAssessment } from "../../src/maestro/admit-request"

const orient: IntentAssessment = {
  kind: "orient",
  known: [{ text: "Current branch is maestro-core.", source: "orientation" }],
  proposals: [],
  unknowns: [],
  uncertainty: "No work request detected.",
  activeWorkEffect: "none",
  reason: "User asked for current status.",
}

const work: IntentAssessment = {
  kind: "work",
  goal: "Add dark mode to settings.",
  known: [{ text: "Settings page exists.", source: "orientation" }],
  proposals: [{ text: "Draft settings scope before implementation.", source: "maestro" }],
  unknowns: [],
  uncertainty: "Theme persistence needs later inspection.",
  activeWorkEffect: "none",
  reason: "Goal is usable for a draft.",
}

describe("Maestro admit request", () => {
  test("returns ORIENT for valid orient assessment", () => {
    expect(decideAdmission(orient)).toMatchObject({ outcome: "ORIENT", assessment: orient })
    expect(
      decideAdmission({ ...orient, activeWorkEffect: "new-scope-or-revision", unknowns: ["Scope unclear."] }),
    ).toEqual({
      outcome: "ORIENT",
      assessment: { ...orient, activeWorkEffect: "new-scope-or-revision", unknowns: ["Scope unclear."] },
    })
  })

  test("clarifies work without usable goal", () => {
    expect(decideAdmission({ ...work, goal: "  " })).toMatchObject({
      outcome: "CLARIFY",
      reason: "missing-usable-goal",
    })
  })

  test("clarifies material blocker before draft", () => {
    expect(decideAdmission({ ...work, unknowns: ["Choose light-only or system-following theme."] })).toMatchObject({
      outcome: "CLARIFY",
      reason: "material-blocker",
    })
  })

  test("returns READY_TO_DRAFT while preserving labeled claims", () => {
    expect(decideAdmission(work)).toEqual({ outcome: "READY_TO_DRAFT", assessment: work })
  })

  test("invalid or partial assessment never reaches READY_TO_DRAFT", () => {
    expect(decideAdmission({ ...work, uncertainty: undefined })).toEqual({
      outcome: "CLARIFY",
      reason: "invalid-assessment",
    })
    expect(decideAdmission({ ...work, kind: "other" })).toEqual({
      outcome: "CLARIFY",
      reason: "invalid-assessment",
    })
  })

  test.each([
    ["known strings", { ...work, known: ["Settings page exists."] }],
    ["uncertainty array", { ...work, uncertainty: ["Theme persistence needs later inspection."] }],
    ["missing activeWorkEffect", { ...work, activeWorkEffect: undefined }],
  ])("rejects first pilot malformed %s in shared schema and admission", (_, input) => {
    expect(() => Schema.decodeUnknownSync(IntentAssessment)(input)).toThrow()
    expect(decideAdmission(input)).toEqual({ outcome: "CLARIFY", reason: "invalid-assessment" })
  })

  test.each(
    [
      { ...work, known: [{ text: " \n\t", source: "stakeholder" }] },
      { ...work, proposals: [{ text: "", source: "maestro" }] },
      { ...work, unknowns: [" "] },
      { ...work, uncertainty: "\n" },
      { ...work, reason: "\t" },
      { ...work, goal: null },
      null,
      [],
      "work",
    ].map((input) => ({ input })),
  )("fails closed on malformed assessment %#", (item) => {
    expect(isIntentAssessment(item.input)).toBe(false)
    expect(decideAdmission(item.input)).toEqual({ outcome: "CLARIFY", reason: "invalid-assessment" })
  })

  test("keeps optional goal and existing conflict, goal, blocker precedence", () => {
    expect(isIntentAssessment({ ...orient, goal: undefined })).toBe(true)
    expect(decideAdmission({ ...work, goal: undefined })).toEqual({
      outcome: "CLARIFY",
      reason: "missing-usable-goal",
    })
    expect(decideAdmission({ ...work, goal: " ", unknowns: ["Pick scope."] })).toEqual({
      outcome: "CLARIFY",
      reason: "missing-usable-goal",
    })
    expect(
      decideAdmission({ ...work, activeWorkEffect: "new-scope-or-revision", goal: " ", unknowns: ["Pick scope."] }),
    ).toEqual({ outcome: "CLARIFY", reason: "active-work-conflict" })
  })

  test("clarifies work that may redirect active approved work", () => {
    expect(decideAdmission({ ...work, activeWorkEffect: "new-scope-or-revision" })).toMatchObject({
      outcome: "CLARIFY",
      reason: "active-work-conflict",
    })
  })

  test("mutation probe: claim labels cannot cross fact and proposal boundary", () => {
    expect(decideAdmission({ ...work, known: [{ text: "Guess", source: "maestro" }] })).toEqual({
      outcome: "CLARIFY",
      reason: "invalid-assessment",
    })
    expect(decideAdmission({ ...work, proposals: [{ text: "Fact", source: "stakeholder" }] })).toEqual({
      outcome: "CLARIFY",
      reason: "invalid-assessment",
    })
  })
})
