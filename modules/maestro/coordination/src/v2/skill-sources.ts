export * as MaestroSkillSourcesV2 from "./skill-sources"

import type { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { PlaybookContent } from "../playbook-content"
import { Seats } from "../seats"

/**
 * Maestro's bundled playbooks (`SeatSkillRoot.playbooks`) as a skill source. Their names are reserved: a project or
 * user skill named like a playbook or one of its nodes is dropped with a warning, so Maestro's procedures and its
 * Orchestra guide always load as shipped.
 */
export function playbooks(root: string) {
  return (draft: SkillV2.Draft) =>
    draft.source(SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(root) }), {
      first: true,
      reserved: true,
    })
}

/**
 * Every native seat's skill tree (`SeatSkillRoot.roots`) as a skill source, so the `skill` tool can load a seat's own
 * skills. Like the playbooks they go first: a same-name skill from configuration replaces one.
 */
export function seats(roots: Readonly<Record<string, string>>) {
  return (draft: SkillV2.Draft) =>
    Object.values(roots)
      .toReversed()
      .forEach((root) =>
        draft.source(SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(root) }), {
          first: true,
        }),
      )
}

/** A seat's skills belong to that seat: every other agent, Maestro included, is denied loading them. */
export function foreign(id: string): PermissionV2.Ruleset {
  const own = Seats.find(id)?.skills ?? []
  return Object.values(Seats.all)
    .filter((seat) => seat.id !== id)
    .flatMap((seat) => seat.skills.filter((name) => !own.includes(name)))
    .flatMap((name) => [name, `${name}-*`])
    .map((resource) => ({ action: "skill", resource, effect: "deny" as const }))
}

/** Playbooks are Maestro's procedures: every other agent is denied loading one, which also leaves it off their list. */
export const denied: PermissionV2.Ruleset = PlaybookContent.names
  .flatMap((name) => [name, `${name}-*`])
  .map((resource) => ({ action: "skill", resource, effect: "deny" as const }))
