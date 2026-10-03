import { describe, expect, test } from "bun:test"
import { filterSkills, selectSkill } from "./skills-data"

const skills = [
  { name: "Review", description: "Check boundaries", location: "/repo/review/SKILL.md", content: "  <b>review</b>\n" },
  { name: "Docs", location: "/shared/writing/SKILL.md", content: "# Write\n" },
]

describe("skills catalog", () => {
  test("filters names ignoring case and surrounding whitespace", () => {
    expect(filterSkills(skills, "  dOCS  ")).toEqual([skills[1]])
  })
  test("filters optional descriptions", () => {
    expect(filterSkills(skills, "BOUNDARIES")).toEqual([skills[0]])
  })
  test("filters exact locations", () => {
    expect(filterSkills(skills, "/SHARED/")).toEqual([skills[1]])
  })
  test("returns no entries for an unmatched query", () => {
    expect(filterSkills(skills, "missing")).toEqual([])
  })
  test("returns every entry for a blank query", () => {
    expect(filterSkills(skills, " ")).toEqual(skills)
  })
  test("selects by exact location", () => {
    expect(selectSkill(skills, skills[1].location)).toBe(skills[1])
  })
  test("falls back to the first entry for an absent selection", () => {
    expect(selectSkill(skills, "/missing")).toBe(skills[0])
  })
  test("falls back within the filtered catalog", () => {
    expect(selectSkill(filterSkills(skills, "Docs"), skills[0].location)).toBe(skills[1])
  })
  test("has no selection in an empty catalog", () => {
    expect(selectSkill([])).toBeUndefined()
  })
})
