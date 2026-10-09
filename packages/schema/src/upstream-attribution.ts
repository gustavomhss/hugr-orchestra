export * as UpstreamAttribution from "./upstream-attribution"

import { Schema } from "effect"
import { Agent } from "./agent"
import { Project } from "./project"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export interface V1 extends Schema.Schema.Type<typeof V1> {}
export const V1 = Schema.Struct({
  schema: Schema.Literal("maestro-upstream-attribution-v1"),
  projectID: Project.ID,
  memberID: Agent.ID.pipe(
    Schema.refine<typeof Agent.ID, Agent.ID & "walt">((id): id is Agent.ID & "walt" => id === "walt", {
      expected: '"walt"',
      // Effect resolves brand annotations from the newest check.
      brands: Agent.ID.ast.annotations?.brands,
    }),
  ),
  profile: Schema.Literal("upstream"),
  authorSessionID: SessionID,
  authorMessageID: SessionMessage.ID,
  parentSessionID: SessionID,
  parentMessageID: SessionMessage.ID,
  parentCallID: Schema.NonEmptyString,
  logicalTaskID: Schema.NonEmptyString,
})
  .check(
    // Project.ID intentionally accepts arbitrary strings; retain its identity and reject empty attribution references.
    Schema.makeFilter((attribution) =>
      attribution.projectID.length > 0 ? undefined : { path: ["projectID"], issue: "projectID must not be empty" },
    ),
  )
  .annotate({
    identifier: "Maestro.UpstreamAttribution.V1",
    description: "Upstream proposal references. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })
