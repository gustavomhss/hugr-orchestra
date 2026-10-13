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
    Schema.refine<typeof Agent.ID, Agent.ID & "archie">((id): id is Agent.ID & "archie" => id === "archie", {
      expected: '"archie"',
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

/** Orchestra executed the dispatch itself: a non-provider-executed native `task` call. */
export const OrchestraTaskDispatch = Schema.Struct({ kind: Schema.Literal("orchestra-task") }).annotate({
  identifier: "Maestro.UpstreamAttribution.OrchestraTaskDispatch",
  parseOptions: { onExcessProperty: "error" },
})

/** Claude Code executed its own subagent tool; Orchestra only witnessed it in-process through hooks. */
export const ClaudeCodeAgentDispatch = Schema.Struct({
  kind: Schema.Literal("claude-code-agent"),
  // The raw observed tool name: current binaries call it "Agent", older ones "Task".
  tool: Schema.Literals(["Agent", "Task"]),
  // Plugin-scoped seat name; it maps to native "archie".
  subagentType: Schema.Literal("orchestra:archie"),
  executor: Schema.Literal("claude-code-host"),
  agentID: Schema.NonEmptyString,
  // Orchestra write-root grant bound to this tool use.
  grantID: Schema.NonEmptyString,
}).annotate({
  identifier: "Maestro.UpstreamAttribution.ClaudeCodeAgentDispatch",
  parseOptions: { onExcessProperty: "error" },
})

export interface V2 extends Schema.Schema.Type<typeof V2> {}
export const V2 = Schema.Struct({
  ...V1.fields,
  schema: Schema.Literal("maestro-upstream-attribution-v2"),
  // parentCallID (from V1) carries the Claude Code tool_use_id for claude-code-agent.
  dispatch: Schema.Union([OrchestraTaskDispatch, ClaudeCodeAgentDispatch]),
})
  .check(
    Schema.makeFilter((attribution) =>
      attribution.projectID.length > 0 ? undefined : { path: ["projectID"], issue: "projectID must not be empty" },
    ),
  )
  .annotate({
    identifier: "Maestro.UpstreamAttribution.V2",
    description: "Upstream proposal references with the observed dispatch kind. Structural validation does not establish host-verified authorship.",
    parseOptions: { onExcessProperty: "error" },
  })

/** Persisted attributions accept every version; historical V1 events keep decoding. */
export type Any = V1 | V2
export const Any = Schema.Union([V1, V2])
