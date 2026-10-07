import path from "path"
import PROMPT_BILLY from "../agent/prompt/billy.txt"
import PROMPT_BOBBY from "../agent/prompt/bobby.txt"
import PROMPT_BACKEND from "../agent/prompt/backend.txt"
import PROMPT_FRANKIE from "../agent/prompt/frankie.txt"
import PROMPT_JIMMY from "../agent/prompt/jimmy.txt"
import PROMPT_LUCY from "../agent/prompt/lucy.txt"
import PROMPT_PATTY from "../agent/prompt/patty.txt"
import PROMPT_ROSIE from "../agent/prompt/rosie.txt"
import { BackendSkillRoot } from "./backend-skill-root"
import { TRUNCATION_DIR } from "../tool/truncation-dir"

// The backend specialist's packaged skills (F6.2): the source tree, or the copy a compiled build extracts from its embed.
export const backendSkills = Object.freeze({
  root: BackendSkillRoot.root,
  names: Object.freeze([
    "backend-implement",
    "backend-api",
    "backend-data",
    "backend-concurrency",
    "backend-refactor",
    "backend-check",
  ] as const),
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
export const nativeProfiles = Object.freeze({
  execution: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    bash: Object.freeze({ "*": "allow", ...publishRules("deny") }),
    edit: "allow",
  } as const),
  // Backend-specialist-only (F1.8): the execution set plus its bound Atlas Memory tools (F3 clause 29), its six entry
  // skills and access to their packaged root. Agent registration adds the worktree-relative edit deny that keeps that
  // root read-only.
  backend: Object.freeze({
    "*": "deny",
    read: envRead("deny"),
    glob: "allow",
    grep: "allow",
    bash: Object.freeze({ "*": "allow", ...publishRules("deny") }),
    edit: "allow",
    atlas_memory_recall: "allow",
    atlas_memory_emit: "allow",
    skill: Object.freeze({
      "*": "deny",
      ...Object.fromEntries(backendSkills.names.map((name) => [name, "allow" as const])),
    }),
    external_directory: Object.freeze({ "*": "deny", [path.join(backendSkills.root, "*")]: "allow" } as const),
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
  {
    displayName: BACKEND_DEFAULT_LABEL,
    memberId: "backend",
    role: "backend execution",
    abilityClass: "scoped repository write",
    returnCard: "backend-result",
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
    nativeProfile: "backend",
    prompt: PROMPT_BACKEND,
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
