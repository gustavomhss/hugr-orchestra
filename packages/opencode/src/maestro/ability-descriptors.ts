import type { AbilityDescriptor } from "./ability-registry"

type StaticAbilityDescriptor = AbilityDescriptor & {
  readonly phases: readonly [string, ...string[]]
  readonly unavailableReason: string
}

export const abilityDescriptors = [
  {
    id: "repository",
    summary: "Manage repository state.",
    phases: ["slice", "delegate"],
    requiredConfig: ["workspace"],
    allowedSeats: ["maestro", "charlie", "patty", "rosie"],
    unavailableReason: "Workspace configuration is required.",
    tools: [],
  },
  {
    id: "github",
    summary: "Coordinate GitHub work.",
    phases: ["reconcile", "close"],
    requiredConfig: ["project-config"],
    allowedSeats: ["maestro"],
    unavailableReason: "Project configuration is required.",
    tools: [],
  },
  {
    id: "tests",
    summary: "Run verification work.",
    phases: ["verify"],
    requiredConfig: ["verification-plan"],
    allowedSeats: ["maestro", "charlie", "lucy"],
    unavailableReason: "Verification plan is required.",
    tools: [],
  },
  {
    id: "ci",
    summary: "Coordinate continuous integration.",
    phases: ["verify"],
    requiredConfig: ["github-project"],
    allowedSeats: ["maestro"],
    unavailableReason: "GitHub project configuration is required.",
    tools: [],
  },
  {
    id: "relay",
    summary: "Reserve delegated tasks.",
    phases: ["delegate"],
    requiredConfig: ["task-reservation"],
    allowedSeats: ["maestro"],
    unavailableReason: "Task reservation configuration is required.",
    tools: [],
  },
  {
    id: "atlas",
    summary: "Use Atlas project services.",
    phases: ["ground", "assemble-context"],
    requiredConfig: ["atlas-provider"],
    allowedSeats: ["maestro", "jimmy"],
    unavailableReason: "Atlas provider configuration is required.",
    tools: [],
  },
] as const satisfies readonly StaticAbilityDescriptor[]
