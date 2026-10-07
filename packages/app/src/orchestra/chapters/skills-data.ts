export type SkillEntry = {
  name: string
  description?: string | null
  location: string
  content: string
  mtime?: number | null
}

export type SkillSource = "project" | "global" | "builtin"
/** Mirrors the server's write rule: only the project's own skill folders change, never Atlas-governed skills. */
export type SkillAccess = "edit" | "builtin" | "global" | "governed" | "fixed"

const PROJECT_ROOTS = [".orchestra/skills/", ".orchestra/skill/", ".claude/skills/", ".agents/skills/"]
const GOVERNED_ROOT = ".orchestra/skills/own/"

const SOURCE_ORDER: SkillSource[] = ["project", "global", "builtin"]

export function filterSkills(skills: SkillEntry[], query: string) {
  const search = query.trim().toLowerCase()
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.location].some((value) => value.toLowerCase().includes(search)),
  )
}

// A server's built-in skills: V1 reports them as `<built-in>`, V2 under the virtual absolute path /builtin/.
// Orchestra's own server ships none (playbooks are files), but other servers may.
export function skillSource(location: string, directory: string): SkillSource {
  if (location === "<built-in>" || location.startsWith("/builtin/")) return "builtin"
  return slash(location).startsWith(root(directory)) ? "project" : "global"
}

export function skillAccess(location: string, directory: string): SkillAccess {
  const source = skillSource(location, directory)
  if (source !== "project") return source
  const relative = slash(location).slice(root(directory).length)
  if (relative.startsWith(GOVERNED_ROOT)) return "governed"
  if (!relative.endsWith(".md") || !PROJECT_ROOTS.some((item) => relative.startsWith(item))) return "fixed"
  return "edit"
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

const slash = (value: string) => value.replaceAll("\\", "/")
const root = (directory: string) => slash(directory).replace(/\/*$/, "/")
