export * as MaestroSkillSourcesV2 from "./skill-sources"

import type { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { PlaybookContent } from "../playbook-content"

/**
 * Maestro's bundled playbooks (`SeatSkillRoot.playbooks`) as a skill source. It goes before every other source, so a
 * skill of the same name from anywhere else replaces a playbook, as in V1.
 */
export function playbooks(root: string) {
  return (draft: SkillV2.Draft) =>
    draft.source(SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(root) }), { first: true })
}

/** Playbooks are Maestro's procedures: every other agent is denied loading one, which also leaves it off their list. */
export const denied: PermissionV2.Ruleset = PlaybookContent.names.map((name) => ({
  action: "skill",
  resource: name,
  effect: "deny",
}))
