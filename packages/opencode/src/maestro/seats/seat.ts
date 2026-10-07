import path from "path"

/**
 * A native team seat built on the seat framework (specs/seat-framework/README.md). One file per seat under `seats/`,
 * listed once in `seats/index.ts`; `script/seat.ts add` writes both. The display label is not here: every roster
 * member's default label lives in maestro/roster.ts.
 */
export type Seat = {
  /** Stable id: roster member id, agent id, native profile name and config key `agent.<id>`. */
  readonly id: string
  readonly role: string
  readonly abilityClass: string
  /** The charter's `Return card:` line; with `workResult`, also the tag of the fenced card the host parses. */
  readonly returnCard: string
  /** The charter's `Forbidden:` line, item by item. */
  readonly forbiddenActions: readonly string[]
  /** The charter, a label template (roster.ts `LABEL`). */
  readonly prompt: string
  /** The shared base profile (roster.ts `baseProfiles`) the seat's own grants extend. */
  readonly profile: "execution" | "review"
  /** How the task tool lists the seat to Maestro: role, access and return, never the label. */
  readonly description: string
  /** Environment variable that overrides the display label over config `agent.<id>.name`. */
  readonly labelEnv?: string
  /** Entry skills, one directory each under `skillSource(id)`; granted to this seat only, with a read-only root. */
  readonly skills: readonly string[]
  /** Work-result schema id: the Task tool parses the seat's return card into `metadata.workResult`. */
  readonly workResult?: string
  /** Task binds `writePaths` as host-enforced write roots; without them the child is read-only. */
  readonly writeRoots: boolean
  /** A `task_id` resume must name a retained logical task of this seat (strict LogicalTask resolution). */
  readonly strictResume: boolean
  /** Atlas Memory: recall/emit tools, the running header and resume admission. Single owner, see AtlasMemory.MEMBER. */
  readonly atlasMemory: boolean
  /** The shell fetches the backend toolkit's pinned engines for this seat's commands. */
  readonly toolkit: boolean
}

export function define<const T extends Seat>(seat: T) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(seat.id) || reserved.has(seat.id))
    throw new Error(`Invalid native seat id: ${seat.id}`)
  if (seat.atlasMemory && seat.id !== "backend")
    throw new Error(`Atlas Memory supports only the backend owner: ${seat.id}`)
  if (seat.toolkit && seat.id !== "backend")
    throw new Error(`The backend toolkit supports only the backend seat: ${seat.id}`)
  if (seat.writeRoots && seat.profile !== "execution")
    throw new Error(`Write roots require an execution profile: ${seat.id}`)
  if (seat.workResult !== undefined && (!seat.workResult.trim() || !/^[a-z]+(?:-[a-z]+)*$/.test(seat.returnCard)))
    throw new Error(`Work result requires a fenced return-card tag: ${seat.id}`)
  if (seat.skills.some((skill) => !skill.startsWith(`${seat.id}-`) || !/^[a-z]+(?:-[a-z]+)*$/.test(skill)) ||
    new Set(seat.skills).size !== seat.skills.length)
    throw new Error(`Entry skills must be unique and seat-scoped: ${seat.id}`)
  if (seat.labelEnv !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(seat.labelEnv))
    throw new Error(`Invalid native seat label environment variable: ${seat.id}`)
  Object.freeze(seat.skills)
  Object.freeze(seat.forbiddenActions)
  return Object.freeze(seat)
}

const reserved = new Set(["maestro", "general", "explore", "build", "plan", "title", "summary", "compaction", "execution", "review", "seat", "index", "constructor"])

// The authored skill tree of a seat. Running from source reads it in place; compiled builds embed it
// (script/seat-skills.ts). `import.meta.dirname` works under Bun and the desktop Node sidecar.
export function skillSource(id: string) {
  return path.resolve(import.meta.dirname, "../../../..", `${id}-specialist`, "skills")
}
