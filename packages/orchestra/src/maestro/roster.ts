import path from "path"
import { Seats, type Seat } from "./seats"
import { SeatSkillRoot } from "./seat-skill-root"
import { TRUNCATION_DIR } from "../tool/truncation-dir"

// The backend specialist's packaged skills (F6.2): the source tree, or the copy a compiled build extracts from its embed.
export const backendSkills = Object.freeze({
  root: SeatSkillRoot.roots.backend,
  names: Seats.all.backend.skills,
})

// The backend seat's default display label, its only literal name in the repository (F1.2): config
// `agent.backend.name` or HUGR_BACKEND_NAME replaces it, and test/agent/specialist-name-guard.test.ts pins it.
export const BACKEND_DEFAULT_LABEL = "Charlie"

// Data written before the backend seat got its stable `backend` id carries its former id, which was the lowercased
// default label. It is derived, never spelled, and only read: `canonicalMemberId` maps it to `backend` wherever a stored
// or user-supplied member id enters, and every write uses `backend`.
export const LEGACY_BACKEND_ID = BACKEND_DEFAULT_LABEL.toLowerCase()

export function canonicalMemberId(id: string): string
export function canonicalMemberId(id: string | undefined): string | undefined
export function canonicalMemberId(id: string | undefined) {
  return id === LEGACY_BACKEND_ID ? "backend" : id
}

// Seats never get a permission prompt, so what asks the owner elsewhere, reading .env files and publishing, is denied.
export const baseProfiles = Object.freeze({
  execution: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    bash: Object.freeze({ "*": "allow", ...publishRules("deny") }),
    edit: "allow",
  } as const),
  // A truncated tool result points at its saved full output, so review seats may read that directory. External access
  // also covers bash and edit, so only this profile, which holds neither, gets it; the others get no saved-file hint.
  review: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    maestro_record_review: "allow",
    external_directory: Object.freeze({ "*": "deny", [path.join(TRUNCATION_DIR, "*")]: "allow" } as const),
  } as const),
} as const)

type NativeProfile = Readonly<Record<string, "allow" | "deny" | Readonly<Record<string, "allow" | "deny">>>>

// These seats historically hashed their shared profile name. Keep that projection exactly; new seats use their id.
const historicalProfiles: Readonly<Record<string, Seat["profile"]>> = {
  patty: "execution", lucy: "review", bobby: "review", billy: "review", jimmy: "review", rosie: "execution", frankie: "review",
}

export const nativeProfiles: Readonly<Record<string, NativeProfile>> = Object.freeze({
  ...baseProfiles,
  ...Object.fromEntries(Object.values(Seats.all).map((seat) => [seat.id, seatProfile(seat)])),
})

// Seat-specific grants extend the unchanged base. The root edit deny is worktree-relative and added by Agent.
function seatProfile(seat: Seat): NativeProfile {
  const root = SeatSkillRoot.roots[seat.id]
  if (seat.skills.length > 0 && !root) throw new Error(`Missing native seat skill root: ${seat.id}`)
  return Object.freeze({
    ...baseProfiles[seat.profile],
    ...(seat.atlasMemory ? { atlas_memory_recall: "allow" as const, atlas_memory_emit: "allow" as const } : {}),
    ...(seat.skills.length > 0 ? {
      skill: Object.freeze({ "*": "deny" as const, ...Object.fromEntries(seat.skills.map((name) => [name, "allow" as const])) }),
      external_directory: Object.freeze({
        ...(seat.profile === "review" ? baseProfiles.review.external_directory : { "*": "deny" as const }),
        [path.join(root, "*")]: "allow" as const,
      }),
    } : {}),
  })
}

// Reads every file but .env files, which hold secrets; .env.example stays readable.
// Mirrors the github.com/github/gitignore Node.gitignore pattern for .env files.
export function envRead<Action extends "ask" | "deny">(action: Action) {
  return Object.freeze({ "*": "allow", "*.env": action, "*.env.*": action, "*.env.example": "allow" } as const)
}

// Commands that publish work. Maestro and general ask the owner before them; seats and explore are denied them.
export function publishRules<Action extends "ask" | "deny">(action: Action) {
  return Object.fromEntries(
    ["git push *", "git -C * push *", "gh pr create *", "gh pr merge *", "gh release *"].map(
      (command) => [command, action] as const,
    ),
  )
}

export type RosterMember = {
  readonly displayName: string
  readonly memberId: string
  readonly role: string
  readonly abilityClass: string
  readonly returnCard: string
  readonly forbiddenActions: readonly string[]
  readonly nativeProfile?: string
  readonly prompt?: string
}

export type Roster = readonly RosterMember[]

// Seat prompts are label templates: the host renders the configured display label (F1.2), so the roster holds none.
export const LABEL = "{{label}}"

export function renderPrompt(member: RosterMember, label: string) {
  return member.prompt?.replaceAll(LABEL, label)
}

export type RosterLookup =
  | { status: "FOUND"; member: RosterMember }
  | { status: "HOLD"; reason: "malformed-member-id" | "unknown-member-id" }

export const roster = createRoster([
  {
    displayName: "Maestro",
    memberId: "maestro",
    role: "conductor/integrator",
    abilityClass: "lifecycle, routing, reconcile, integration",
    returnCard: "transition/Project/merge receipt",
    forbiddenActions: ["product implementation", "self-approval", "self-review"],
  },
  ...Object.values(Seats.all).map(seatMember),
])

function seatMember(seat: Seat): RosterMember {
  const labels: Readonly<Record<string, string>> = {
    backend: BACKEND_DEFAULT_LABEL, patty: "Patty", lucy: "Lucy", bobby: "Bobby", billy: "Billy", jimmy: "Jimmy", rosie: "Rosie", frankie: "Frankie",
  }
  return {
    displayName: labels[seat.id] ?? seat.id,
    memberId: seat.id,
    role: seat.role,
    abilityClass: seat.abilityClass,
    returnCard: seat.returnCard,
    forbiddenActions: seat.forbiddenActions,
    nativeProfile: historicalProfiles[seat.id] ?? seat.id,
    prompt: seat.prompt,
  }
}

export function createRoster(members: readonly RosterMember[]): Roster {
  const memberIds = new Set<string>()
  return Object.freeze(
    members.map((member) => {
      if (!wellFormedMemberId(member.memberId)) throw new Error(`Roster memberId must be canonical: ${member.memberId}`)
      if (memberIds.has(member.memberId)) throw new Error(`Roster memberId must be unique: ${member.memberId}`)
      memberIds.add(member.memberId)
      // Windows checkouts may convert prompt files to CRLF; prompts and their hashes must not depend on the checkout.
      return Object.freeze({
        ...member,
        ...(member.prompt === undefined ? {} : { prompt: member.prompt.replaceAll("\r\n", "\n") }),
        forbiddenActions: Object.freeze([...member.forbiddenActions]),
      })
    }),
  )
}

export function lookupRosterMember(memberId: unknown, members: Roster = roster): RosterLookup {
  if (!wellFormedMemberId(memberId)) {
    return { status: "HOLD", reason: "malformed-member-id" }
  }
  const member = members.find((candidate) => candidate.memberId === canonicalMemberId(memberId))
  if (!member) return { status: "HOLD", reason: "unknown-member-id" }
  return { status: "FOUND", member }
}

function wellFormedMemberId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+(?:-[a-z]+)*$/.test(value)
}
