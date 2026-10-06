import { array, check, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

// Skill catalog and skill file write routes for V1 (/skill) and V2 (/api/skill).
const taken = ".opencode/skills/httpapi-taken/SKILL.md"
const takenText = "---\nname: httpapi-taken\ndescription: Seeded skill\n---\n# Taken\n"
const missing = `?${new URLSearchParams({ path: "/missing/SKILL.md" })}`

function created(name: string) {
  return (value: unknown) => {
    object(value)
    check(value.name === name, "skill save should return the saved skill")
    check(
      String(value.location).endsWith(`/.opencode/skills/${name}/SKILL.md`),
      "skill save should create a project skill file",
    )
  }
}

function located(validate: (value: unknown) => void) {
  return (body: unknown) => {
    object(body)
    object(body.location)
    validate(body.data)
  }
}

export const skillScenarios: Scenario[] = [
  http.protected.get("/skill", "app.skills").json(200, array, "status"),
  http.protected
    .put("/skill", "app.skillSave")
    .mutating()
    .at((ctx) => ({
      path: "/skill",
      headers: ctx.headers(),
      body: { name: "httpapi-skill", description: "Exercise skill", content: "# Exercise" },
    }))
    .json(200, created("httpapi-skill"), "status"),
  http.protected
    .put("/skill", "app.skillSave.conflict")
    .seeded((ctx) => ctx.file(taken, takenText))
    .at((ctx) => ({
      path: "/skill",
      headers: ctx.headers(),
      body: { name: "httpapi-taken", description: "Again", content: "" },
    }))
    .json(
      409,
      (body) => {
        object(body)
        check(body.name === "SkillConflictError", "V1 skill name conflicts should be typed conflicts")
      },
      "status",
    ),
  http.protected
    .delete("/skill", "app.skillRemove")
    .at((ctx) => ({ path: `/skill${missing}`, headers: ctx.headers() }))
    .status(400, undefined, "status"),
  http.protected.get("/api/skill", "v2.skill.list").json(200, located(array)),
  http.protected
    .put("/api/skill", "v2.skill.save")
    .mutating()
    .at((ctx) => ({
      path: "/api/skill",
      headers: ctx.headers(),
      body: { name: "httpapi-skill-v2", description: "Exercise skill", content: "# Exercise" },
    }))
    .json(200, located(created("httpapi-skill-v2")), "status"),
  http.protected
    .put("/api/skill", "v2.skill.save.conflict")
    .seeded((ctx) => ctx.file(taken, takenText))
    .at((ctx) => ({
      path: "/api/skill",
      headers: ctx.headers(),
      body: { name: "httpapi-taken", description: "Again", content: "" },
    }))
    .json(
      409,
      (body) => {
        object(body)
        check(body._tag === "ConflictError", "V2 skill name conflicts should be typed conflicts")
      },
      "status",
    ),
  http.protected
    .delete("/api/skill", "v2.skill.remove")
    .at((ctx) => ({ path: `/api/skill${missing}`, headers: ctx.headers() }))
    .status(400, undefined, "status"),
]
