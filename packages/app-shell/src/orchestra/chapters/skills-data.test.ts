import { describe, expect, test } from "bun:test"
import { filterSkills, readSkills, skillAccess, skillErrorMessage, skillSource, sortSkills } from "./skills-data"

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
  test("marks V1 and V2 built-in skills as built in", () => {
    expect(skillSource("<built-in>", "/repo")).toBe("builtin")
    expect(skillSource("/builtin/style-guide.md", "/repo")).toBe("builtin")
  })
  test("marks files inside the profile directory as project skills", () => {
    expect(skillSource("/repo/.orchestra/skills/review/SKILL.md", "/repo")).toBe("project")
    expect(skillSource("/repo/.orchestra/skills/review/SKILL.md", "/repo/")).toBe("project")
    expect(skillSource("C:\\repo\\.orchestra\\skills\\a\\SKILL.md", "C:\\repo")).toBe("project")
  })
  test("does not treat a sibling directory sharing the prefix as the project", () => {
    expect(skillSource("/repo-other/.orchestra/skills/a/SKILL.md", "/repo")).toBe("global")
    expect(skillSource("/home/me/.config/orchestra/skills/a/SKILL.md", "/repo")).toBe("global")
  })
  test("orders project, then global, then built-in, then by name", () => {
    const entry = (name: string, location: string) => ({ name, location, content: "" })
    expect(
      sortSkills(
        [
          entry("zeta", "<built-in>"),
          entry("beta", "/home/me/.claude/skills/beta/SKILL.md"),
          entry("gamma", "/repo/.orchestra/skills/gamma/SKILL.md"),
          entry("alpha", "/home/me/.config/orchestra/skills/alpha/SKILL.md"),
          entry("delta", "/repo/.orchestra/skills/delta/SKILL.md"),
        ],
        "/repo",
      ).map((skill) => skill.name),
    ).toEqual(["delta", "gamma", "alpha", "beta", "zeta"])
  })
})

describe("skill access", () => {
  test("allows edits only in the project's own skill folders", () => {
    for (const folder of [".orchestra/skills", ".orchestra/skill", ".claude/skills", ".agents/skills"])
      expect(skillAccess(`/repo/${folder}/review/SKILL.md`, "/repo")).toBe("edit")
    expect(skillAccess("/repo/.orchestra/skills/flat.md", "/repo")).toBe("edit")
  })
  test("keeps Atlas-governed skills read-only", () => {
    expect(skillAccess("/repo/.orchestra/skills/own/own_policy/SKILL.md", "/repo")).toBe("governed")
  })
  test("keeps project skills outside the skill folders read-only", () => {
    expect(skillAccess("/repo/docs/skills/review/SKILL.md", "/repo")).toBe("fixed")
    expect(skillAccess("/repo/.orchestra/skills/review/SKILL.txt", "/repo")).toBe("fixed")
  })
  test("keeps global and built-in skills read-only", () => {
    expect(skillAccess("/home/me/.config/orchestra/skills/a/SKILL.md", "/repo")).toBe("global")
    expect(skillAccess("/repo-other/.orchestra/skills/a/SKILL.md", "/repo")).toBe("global")
    expect(skillAccess("<built-in>", "/repo")).toBe("builtin")
    expect(skillAccess("/builtin/style-guide.md", "/repo")).toBe("builtin")
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

describe("skills reply", () => {
  test("reads V1 and V2 catalogs, with or without descriptions and times", () => {
    const entries = [...skills, { ...skills[0], description: null, mtime: 12 }]
    expect(readSkills(entries)).toEqual(entries)
  })
  test("rejects a malformed catalog so the page shows its error instead of crashing in render", () => {
    for (const reply of [
      {},
      undefined,
      [{ location: "/repo/a/SKILL.md", content: "" }],
      [{ ...skills[0], mtime: "now" }],
    ])
      expect(() => readSkills(reply)).toThrow("Skills response is malformed")
  })
})
