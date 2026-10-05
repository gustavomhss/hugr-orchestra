import path from "path"
import PROMPT_BILLY from "../agent/prompt/billy.txt"
import PROMPT_BOBBY from "../agent/prompt/bobby.txt"
import PROMPT_CHARLIE from "../agent/prompt/charlie.txt"
import PROMPT_FRANKIE from "../agent/prompt/frankie.txt"
import PROMPT_JIMMY from "../agent/prompt/jimmy.txt"
import PROMPT_LUCY from "../agent/prompt/lucy.txt"
import PROMPT_PATTY from "../agent/prompt/patty.txt"
import PROMPT_ROSIE from "../agent/prompt/rosie.txt"
import { CharlieSkillRoot } from "./charlie-skill-root"

// Charlie's packaged skills (F6.2): the source tree, or the copy a compiled build extracts from its embed.
export const charlieSkills = Object.freeze({
  root: CharlieSkillRoot.root,
  names: Object.freeze([
    "backend-implement",
    "backend-api",
    "backend-data",
    "backend-concurrency",
    "backend-refactor",
    "backend-check",
  ] as const),
})

export const nativeProfiles = Object.freeze({
  execution: Object.freeze({
    "*": "deny",
    read: "allow",
    glob: "allow",
    grep: "allow",
    bash: "allow",
    edit: "allow",
  } as const),
  // Charlie-only (F1.8): the execution set plus its six entry skills and access to their packaged root. Agent
  // registration adds the worktree-relative edit deny that keeps that root read-only.
  charlie: Object.freeze({
    "*": "deny",
    read: "allow",
    glob: "allow",
    grep: "allow",
    bash: "allow",
    edit: "allow",
    skill: Object.freeze({
      "*": "deny",
      ...Object.fromEntries(charlieSkills.names.map((name) => [name, "allow" as const])),
    }),
    external_directory: Object.freeze({ "*": "deny", [path.join(charlieSkills.root, "*")]: "allow" } as const),
  } as const),
  review: Object.freeze({
    "*": "deny",
    read: "allow",
    glob: "allow",
    grep: "allow",
    maestro_record_review: "allow",
  } as const),
} as const)

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
    returnCard: "charlie-result",
    // Single source of the charter's Forbidden line; native-team.test.ts asserts the prompt renders it verbatim.
    forbiddenActions: [
      "investigation or diagnosis",
      "architecture or scope decisions",
      "delegation",
      "self-review",
      "claims of verification or acceptance",
      "commit, push, branch, merge or pull request",
      "installing tools",
      "working around permission denials or safety holds",
      "editing Atlas memory files",
    ],
    nativeProfile: "charlie",
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
    role: "cold review",
    abilityClass: "read-only artifact review",
    returnCard: "cited APPROVE/FIX_FIRST/REJECT card",
    forbiddenActions: ["edit implementation", "receive author transcript", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_LUCY,
  },
  {
    displayName: "Bobby",
    memberId: "bobby",
    role: "architecture",
    abilityClass: "read-only contract review",
    returnCard: "seam/contract verdict",
    forbiddenActions: ["implement product", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_BOBBY,
  },
  {
    displayName: "Billy",
    memberId: "billy",
    role: "security",
    abilityClass: "read-only threat review",
    returnCard: "threat verdict and cited controls",
    forbiddenActions: ["implement product", "merge"],
    nativeProfile: "review",
    prompt: PROMPT_BILLY,
  },
  {
    displayName: "Jimmy",
    memberId: "jimmy",
    role: "exploration",
    abilityClass: "read-only discovery",
    returnCard: "grounded findings card",
    forbiddenActions: ["ratify alone", "edit product"],
    nativeProfile: "review",
    prompt: PROMPT_JIMMY,
  },
  {
    displayName: "Rosie",
    memberId: "rosie",
    role: "documentation",
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
