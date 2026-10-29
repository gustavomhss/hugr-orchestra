import { Effect } from "effect"
import type { IssueRow, ProjectRow } from "./shared"
import { affected, insertNote } from "./queue-shared"
import type { Deps } from "./queue-shared"

/**
 * Section 4.4's plan drift: a card whose real affected set left its planned `area` raises one `integration` line for
 * Maestro to send to `archie` as a plan revision. It never refuses: the card queues under its real set. Without an
 * `area`, or without `turbo`, there is nothing to compare and no line.
 */
export const drift = Effect.fnUntraced(function* (deps: Deps, project: ProjectRow, issue: IssueRow, directory: string, base: string, head: string) {
  if (!issue.area) return
  const real = yield* affected(deps, directory, `origin/${base}`, head)
  const extra = real?.filter((name) => !issue.area?.includes(name)) ?? []
  if (extra.length === 0) return
  const ref = `${project.key}-${issue.number}`
  const text = `${ref} left its planned area: it also affects ${extra.join(", ")}, which its plan did not list. Send it to archie as a plan revision; the card still queues.`
  const done = yield* deps.quiet((tx) => insertNote(tx, project, issue, text))
  yield* deps.publish(done)
  yield* Effect.logWarning(`integration: ${text}`)
})
