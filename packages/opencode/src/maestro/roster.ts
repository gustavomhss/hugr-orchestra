import PROMPT_BILLY from "../agent/prompt/billy.txt"
import PROMPT_BOBBY from "../agent/prompt/bobby.txt"
import PROMPT_CHARLIE from "../agent/prompt/charlie.txt"
import PROMPT_FRANKIE from "../agent/prompt/frankie.txt"
import PROMPT_JIMMY from "../agent/prompt/jimmy.txt"
import PROMPT_LUCY from "../agent/prompt/lucy.txt"
import PROMPT_PATTY from "../agent/prompt/patty.txt"
import PROMPT_ROSIE from "../agent/prompt/rosie.txt"

// Seats never get a permission prompt, so what asks the owner elsewhere, reading .env files and publishing, is denied.
export const nativeProfiles = Object.freeze({
  execution: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    bash: Object.freeze({ "*": "allow", ...publishRules("deny") }),
    edit: "allow",
  } as const),
  review: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    maestro_record_review: "allow",
  } as const),
} as const)

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
  readonly nativeProfile?: keyof typeof nativeProfiles
  readonly prompt?: string
}

export type Roster = readonly RosterMember[]

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
  {
    displayName: "Charlie",
    memberId: "charlie",
    role: "backend execution",
    abilityClass: "scoped repository write",
    returnCard: "implementation card, gates, diff receipt",
    forbiddenActions: ["approve", "review own work", "merge"],
    nativeProfile: "execution",
    prompt: PROMPT_CHARLIE,
  },
  {
    displayName: "Patty",
    memberId: "patty",
    role: "frontend execution",
    abilityClass: "scoped repository write",
    returnCard: "implementation card, sensory evidence, diff receipt",
    forbiddenActions: ["approve", "review own work", "merge"],
    nativeProfile: "execution",
    prompt: PROMPT_PATTY,
  },
  {
    displayName: "Lucy",
    memberId: "lucy",
    role: "cold code review; records governed reviews",
    abilityClass: "read-only artifact review",
    returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
    forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_LUCY,
  },
  {
    displayName: "Bobby",
    memberId: "bobby",
    role: "architecture review",
    abilityClass: "read-only contract review",
    returnCard: "seam/contract verdict",
    forbiddenActions: ["implement product", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_BOBBY,
  },
  {
    displayName: "Billy",
    memberId: "billy",
    role: "security review",
    abilityClass: "read-only threat review",
    returnCard: "threat verdict and cited controls",
    forbiddenActions: ["implement product", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_BILLY,
  },
  {
    displayName: "Jimmy",
    memberId: "jimmy",
    role: "codebase exploration",
    abilityClass: "read-only discovery",
    returnCard: "grounded findings card",
    forbiddenActions: ["ratify alone", "edit product"],
    nativeProfile: "review",
    prompt: PROMPT_JIMMY,
  },
  {
    displayName: "Rosie",
    memberId: "rosie",
    role: "documentation changes",
    abilityClass: "scoped docs write",
    returnCard: "docs evidence card",
    forbiddenActions: ["decide product behavior"],
    nativeProfile: "execution",
    prompt: PROMPT_ROSIE,
  },
  {
    displayName: "Frankie",
    memberId: "frankie",
    role: "process audit",
    abilityClass: "read-only process/ledger audit",
    returnCard: "audit verdict",
    forbiddenActions: ["implement product", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_FRANKIE,
  },
])

export function createRoster(members: readonly RosterMember[]): Roster {
  const memberIds = new Set<string>()
  return Object.freeze(
    members.map((member) => {
      if (!canonicalMemberId(member.memberId)) throw new Error(`Roster memberId must be canonical: ${member.memberId}`)
      if (memberIds.has(member.memberId)) throw new Error(`Roster memberId must be unique: ${member.memberId}`)
      memberIds.add(member.memberId)
      return Object.freeze({ ...member, forbiddenActions: Object.freeze([...member.forbiddenActions]) })
    }),
  )
}

export function lookupRosterMember(memberId: unknown, members: Roster = roster): RosterLookup {
  if (!canonicalMemberId(memberId)) {
    return { status: "HOLD", reason: "malformed-member-id" }
  }
  const member = members.find((candidate) => candidate.memberId === memberId)
  if (!member) return { status: "HOLD", reason: "unknown-member-id" }
  return { status: "FOUND", member }
}

function canonicalMemberId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+(?:-[a-z]+)*$/.test(value)
}
