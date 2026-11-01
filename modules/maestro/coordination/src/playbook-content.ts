export * as PlaybookContent from "./playbook-content"

import { SeatSkillContent } from "./seat-skill-content"

// This is the required source inventory, independent of whatever a build happened to find on disk.
export const names = ["frame-request", "maestro-orchestra", "maestro-plan", "maestro-repo", "maestro-run"] as const

/** Maestro's Orchestra guide under `maestro-orchestra/`: each group and its leaves, in the order Maestro sees them. */
export const guide = {
  start: ["orchestra", "architecture", "install"],
  agents: ["team", "custom", "skills"],
  engines: ["models", "claude-mode", "relay"],
  tools: ["dock", "mcp", "atlas", "capabilities", "context", "arsenal", "terminal"],
  work: ["board", "merge-queue", "workflows", "sessions", "hygiene"],
  setup: ["config", "credentials", "permissions", "backups", "composer"],
  errors: ["app", "config", "mcp"],
} as const

export const files = [
  ...names.map((name) => `${name}/SKILL.md`),
  ...Object.entries(guide).flatMap(([group, leaves]) => [
    `maestro-orchestra/${group}/SKILL.md`,
    ...leaves.map((leaf) => `maestro-orchestra/${group}/${leaf}/SKILL.md`),
  ]),
  "maestro-repo/arsenal-operators/SKILL.md",
  "maestro-repo/maintenance/SKILL.md",
  "maestro-repo/maintenance/reviewer-brief/SKILL.md",
  "maestro-run/governed/SKILL.md",
  "maestro-run/loop/SKILL.md",
  "maestro-run/verify/SKILL.md",
  "maestro-run/verify/review-checks/SKILL.md",
].toSorted()

export function validate(tree: Record<string, string>) {
  SeatSkillContent.validate("maestro", tree, names)
  if (JSON.stringify(Object.keys(tree).toSorted()) !== JSON.stringify(files))
    throw new SeatSkillContent.PackagingError("Maestro playbook files differ from required source inventory")
}

export async function read(root: string) {
  const tree = await SeatSkillContent.read("maestro", root, names)
  validate(tree)
  return tree
}
