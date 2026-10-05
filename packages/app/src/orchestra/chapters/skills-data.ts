export type SkillEntry = {
  name: string
  description?: string | null
  location: string
  content: string
}

export type SkillSource = "project" | "global" | "builtin"

const SOURCE_ORDER: SkillSource[] = ["project", "global", "builtin"]

export function filterSkills(skills: SkillEntry[], query: string) {
  const search = query.trim().toLowerCase()
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.location].some((value) => value.toLowerCase().includes(search)),
  )
}

// V1 reports the bundled skill as `<built-in>`; V2 gives it a virtual absolute path under /builtin/.
export function skillSource(location: string, directory: string): SkillSource {
  if (location === "<built-in>" || location.startsWith("/builtin/")) return "builtin"
  const path = location.replaceAll("\\", "/")
  const root = directory.replaceAll("\\", "/").replace(/\/*$/, "/")
  return path.startsWith(root) ? "project" : "global"
}

/** Project skills first, then the user's global skills, then built-ins; names break ties. */
export function sortSkills(skills: SkillEntry[], directory: string) {
  return skills.toSorted(
    (a, b) =>
      SOURCE_ORDER.indexOf(skillSource(a.location, directory)) -
        SOURCE_ORDER.indexOf(skillSource(b.location, directory)) || a.name.localeCompare(b.name),
  )
}

/** Reads the message from a V1 `{ data: { message } }` or V2 `{ message }` error body. */
export function skillErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return
  if ("data" in error && error.data && typeof error.data === "object" && "message" in error.data)
    return typeof error.data.message === "string" ? error.data.message : undefined
  if ("message" in error && typeof error.message === "string") return error.message
}
