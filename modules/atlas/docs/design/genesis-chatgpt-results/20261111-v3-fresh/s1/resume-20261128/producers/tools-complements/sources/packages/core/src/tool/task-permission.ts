export * as TaskPermission from "./task-permission"

import type { Permission } from "@orchestra/schema/permission"
import type { Config } from "../config"

// Kept apart from the task tool so the Session runner, which the task tool depends on, can derive a child's rules too.
/**
 * The rules every Task child inherits, as the earlier runtime derived them: the parent Session's deny and `external_directory` rules, so a
 * child is never more permissive than its parent on a denied pattern, then a deny of each `experimental.primary_tools`
 * tool, which only primary agents may use.
 */
export function inheritedPermissions(parent: Permission.Ruleset, primary: ReadonlyArray<string>): Permission.Ruleset {
  const inherited = parent.filter((rule) => rule.action === "external_directory" || rule.effect === "deny")
  return [
    ...inherited,
    ...primary
      .map((action) => ({ action, resource: "*", effect: "deny" as const }))
      .filter((deny) => !inherited.some((rule) => rule.action === deny.action && rule.resource === deny.resource && rule.effect === deny.effect)),
  ]
}

/** The configured `experimental.primary_tools`, from the highest-priority document that sets it. */
export function primaryTools(entries: ReadonlyArray<Config.Entry>) {
  return (
    entries
      .filter((entry): entry is Config.Document => entry.type === "document")
      .findLast((entry) => entry.info.experimental?.primary_tools !== undefined)?.info.experimental?.primary_tools ?? []
  )
}
