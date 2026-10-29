import path from "path"

/**
 * A native team seat built on the seat framework (docs/specs/seat-framework/README.md). One file per seat under `seats/`,
 * listed once in `seats/index.ts`; `script/seat.ts add` writes both. The display label is not here: every roster
 * member's default label lives in maestro/roster.ts.
 */
export type Seat = {
  /** Stable id: roster member id, agent id and config key `agent.<id>`. */
  readonly id: string
  readonly role: string
  readonly abilityClass: string
  /** The charter's `Return card:` line; with `workResult`, also the tag of the fenced card the host parses. Empty for a direct seat. */
  readonly returnCard: string
  /** The charter's `Forbidden:` line, item by item. */
  readonly forbiddenActions: readonly string[]
  /** The charter, a label template (roster.ts `LABEL`). */
  readonly prompt: string
  /** The shared base profile (roster.ts `baseProfiles`) the seat's own grants extend. */
  readonly profile: "execution" | "review" | "discovery" | "direct"
  /** Optional stable profile projection, independent of agent routing and the shared permission base. */
  readonly profileKey?: string
  /** How the task tool lists the seat to Maestro: role, access and return, never the label. */
  readonly description: string
  /** Environment variable that overrides the display label over config `agent.<id>.name`. */
  readonly labelEnv?: string
  /** Root skills, one directory each under `skillSource(id)`, or under `sharedSource()` for a `team-*` root; each grants its whole tree. */
  readonly skills: readonly string[]
  /** Work-result schema id: the Task tool parses the seat's return card into `metadata.workResult`. */
  readonly workResult?: string
  /** Task binds `writePaths` as host-enforced write roots; without them the child is read-only. */
  readonly writeRoots: boolean
  /** A `task_id` resume must name a retained logical task of this seat (strict LogicalTask resolution). */
  readonly strictResume: boolean
  /** Atlas Memory: recall/emit tools, running header and resume admission. Only approved native owners. */
  readonly atlasMemory: boolean
  /** The shell fetches the backend toolkit's pinned engines for this seat's commands. */
  readonly toolkit: boolean
  /** Configured MCP servers (`mcp.servers.<name>`) whose tools the seat may call over its floor. */
  readonly mcp?: readonly string[]
  /** The research engine's seat: its tools come from @orchestra/core/research/seat-tools, and Claude mode dispatches it per tier. */
  readonly research?: boolean
  /**
   * The owner talks to the seat directly: it is a primary agent, the task tool never lists it, and it returns no card.
   * Only `live` today (docs/specs/live-seat).
   */
  readonly direct?: boolean
}

export function define<const T extends Seat>(seat: T) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(seat.id) || reserved.has(seat.id))
    throw new Error(`Invalid native seat id: ${seat.id}`)
  if (!seat.role.trim() || !seat.description.trim())
    throw new Error(`Native seat role and description must be nonempty: ${seat.id}`)
  if (seat.profileKey !== undefined && (!/^[a-z]+(?:-[a-z]+)*$/.test(seat.profileKey) || reserved.has(seat.profileKey)))
    throw new Error(`Invalid native seat profile key: ${seat.profileKey}`)
  if (seat.atlasMemory && seat.id !== "backend" && seat.id !== "jimmy" && seat.id !== "archie" && seat.id !== "live")
    throw new Error(`Atlas Memory supports only backend, jimmy, archie and live owners: ${seat.id}`)
  if (seat.direct && seat.id !== "live") throw new Error(`Direct seats support only the live seat: ${seat.id}`)
  if ((seat.direct === true) !== (seat.profile === "direct"))
    throw new Error(`A direct seat and the direct profile go together: ${seat.id}`)
  if (seat.direct && (seat.returnCard !== "" || seat.workResult !== undefined || seat.writeRoots || seat.strictResume))
    throw new Error(`Direct seats return no card and take no task: ${seat.id}`)
  if (seat.toolkit && seat.id !== "backend")
    throw new Error(`The backend toolkit supports only the backend seat: ${seat.id}`)
  if (seat.research && seat.id !== "jimmy")
    throw new Error(`The research engine supports only the jimmy seat: ${seat.id}`)
  if (seat.writeRoots && seat.profile !== "execution")
    throw new Error(`Write roots require an execution profile: ${seat.id}`)
  if (seat.profile === "execution" && seat.skills.length > 0 && !seat.writeRoots)
    throw new Error(`Execution seats with entry skills require write roots: ${seat.id}`)
  if (seat.workResult !== undefined && (!seat.workResult.trim() || !/^[a-z]+(?:-[a-z]+)*$/.test(seat.returnCard)))
    throw new Error(`Work result requires a fenced return-card tag: ${seat.id}`)
  if (seat.skills.some((skill) => !(skill.startsWith(`${seat.id}-`) || skill.startsWith("team-")) || !/^[a-z]+(?:-[a-z]+)*$/.test(skill)) ||
    new Set(seat.skills).size !== seat.skills.length)
    throw new Error(`Entry skills must be unique and seat-scoped: ${seat.id}`)
  if (seat.labelEnv !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(seat.labelEnv))
    throw new Error(`Invalid native seat label environment variable: ${seat.id}`)
  Object.freeze(seat.skills)
  Object.freeze(seat.forbiddenActions)
  return Object.freeze(seat)
}

const reserved = new Set(["maestro", "general", "explore", "build", "plan", "title", "summary", "compaction", "execution", "review", "direct", "seat", "index", "constructor", "con", "prn", "aux", "nul"])

export function validateInstalled(seat: Seat) {
  define(seat)
  if (!seat.prompt.trim()) throw new Error(`Native seat prompt must be nonempty: ${seat.id}`)
}

// The authored skill tree of a seat. Running from source reads it in place; compiled builds embed it
// (script/seat-skills.ts). `import.meta.dirname` works under Bun and the desktop Node sidecar.
export function skillSource(id: string) {
  if (id === "backend" || id === "archie")
    return path.resolve(import.meta.dirname, "../../../../../modules/specialists", id, "skills")
  return path.resolve(import.meta.dirname, "../../../../../packages", `${id}-specialist`, "skills")
}

// The shared skill trees (`team-*` roots), authored once for every seat that declares one of them.
export function sharedSource() {
  return path.resolve(import.meta.dirname, "../../../../../modules/specialists/team/skills")
}
