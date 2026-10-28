export * as PlaybookContent from "./playbook-content"

import { SeatSkillContent } from "./seat-skill-content"

// This is the required source inventory, independent of whatever a build happened to find on disk.
export const names = ["frame-request", "maestro-composer", "maestro-plan", "maestro-repo", "maestro-run"] as const

export const files = [
  ...names.map((name) => `${name}/SKILL.md`),
  "maestro-plan/contract/SKILL.md",
  "maestro-plan/decompose/SKILL.md",
  "maestro-plan/decompose/suite-review/SKILL.md",
  "maestro-plan/pack/SKILL.md",
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
