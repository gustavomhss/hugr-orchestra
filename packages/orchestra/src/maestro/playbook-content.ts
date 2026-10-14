export * as PlaybookContent from "./playbook-content"

import { SeatSkillContent } from "./seat-skill-content"

// This is the required source inventory, independent of whatever a build happened to find on disk.
export const names = [
  "frame-request",
  "maestro-arsenal-operators",
  "maestro-composer",
  "maestro-contract",
  "maestro-decompose",
  "maestro-governed",
  "maestro-loop",
  "maestro-pack",
  "maestro-repo-maintenance",
  "maestro-verify",
] as const

export const files = [
  ...names.map((name) => `${name}/SKILL.md`),
  "maestro-decompose/suite-review.md",
  "maestro-repo-maintenance/reviewer-brief.md",
  "maestro-verify/review-checks.md",
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
