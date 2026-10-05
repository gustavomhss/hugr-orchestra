import { describe, expect, test } from "bun:test"
import { filterSkills, skillErrorMessage, skillSource, sortSkills } from "./skills-data"

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
})

describe("skill source", () => {
  test("marks the V1 and V2 bundled skill as built in", () => {
    expect(skillSource("<built-in>", "/repo")).toBe("builtin")
    expect(skillSource("/builtin/customize-opencode.md", "/repo")).toBe("builtin")
  })
  test("marks files inside the profile directory as project skills", () => {
    expect(skillSource("/repo/.opencode/skills/review/SKILL.md", "/repo")).toBe("project")
    expect(skillSource("/repo/.opencode/skills/review/SKILL.md", "/repo/")).toBe("project")
    expect(skillSource("C:\\repo\\.opencode\\skills\\a\\SKILL.md", "C:\\repo")).toBe("project")
  })
  test("does not treat a sibling directory sharing the prefix as the project", () => {
    expect(skillSource("/repo-other/.opencode/skills/a/SKILL.md", "/repo")).toBe("global")
    expect(skillSource("/home/me/.config/opencode/skills/a/SKILL.md", "/repo")).toBe("global")
  })
  test("orders project, then global, then built-in, then by name", () => {
    const entry = (name: string, location: string) => ({ name, location, content: "" })
    expect(
      sortSkills(
        [
          entry("zeta", "<built-in>"),
          entry("beta", "/home/me/.claude/skills/beta/SKILL.md"),
          entry("gamma", "/repo/.opencode/skills/gamma/SKILL.md"),
          entry("alpha", "/home/me/.config/opencode/skills/alpha/SKILL.md"),
          entry("delta", "/repo/.opencode/skills/delta/SKILL.md"),
        ],
        "/repo",
      ).map((skill) => skill.name),
    ).toEqual(["delta", "gamma", "alpha", "beta", "zeta"])
  })
})

describe("skill write errors", () => {
  test("reads the V1 error body", () => {
    expect(skillErrorMessage({ name: "SkillWriteError", data: { message: "Taken", reason: "conflict" } })).toBe("Taken")
  })
  test("reads the V2 error body", () => {
    expect(skillErrorMessage({ _tag: "InvalidRequestError", message: "Bad name" })).toBe("Bad name")
  })
  test("returns nothing for bodies without a message", () => {
    expect(skillErrorMessage("oops")).toBeUndefined()
    expect(skillErrorMessage({ data: { message: 1 } })).toBeUndefined()
    expect(skillErrorMessage(undefined)).toBeUndefined()
  })
})
