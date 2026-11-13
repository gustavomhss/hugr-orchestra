import type {
  Agent,
} from "./config"

export type MaestroContextToolPlan = {
  version: "context-tool-plan-v1"
  actor: {
    projectId: string
    sessionId: string
    memberId: string
  }
  actorBytes: string
  planRevision: {
    id: string
    hash: string
  }
  catalogVersion: string
  headSnapshot: string
  sourceRevision: string
  territories: Array<string>
  actions: Array<{
    unit: string
    skillName: string
    operation: "load-skill"
    path: string
    contentHash: string
    receiptHash: string
  }>
  pointers: Array<{
    unit: string
    drillUnits: Array<string>
    manifest: Array<{
      kind: "pack" | "memory" | "knowledge" | "drill"
      name: string
      digest: string
      pull: string
      hits: number
    }>
    pullReachable: Array<string>
  }>
  hash: string
}
export type MaestroGrounding = {
  catalogVersion: string
  snapshot: string
  sourceRevision: string
  sourceIdentityHash: string
  units: Array<string>
}
export type MaestroLoadedOwnSkill = {
  unit: string
  name: string
  content: string
  contentHash: string
  receiptHash: string
}
export type MaestroUpstreamAttributionClaudeCodeAgentDispatch = {
  kind: "claude-code-agent"
  tool: "Agent" | "Task"
  subagentType: "orchestra:archie"
  executor: "claude-code-host"
  agentID: string
  grantID: string
}
export type MaestroUpstreamAttributionOrchestraTaskDispatch = {
  kind: "orchestra-task"
}
export type MaestroUpstreamAttributionV1 = {
  schema: "maestro-upstream-attribution-v1"
  projectID: string
  memberID: string
  profile: "upstream"
  authorSessionID: string
  authorMessageID: string
  parentSessionID: string
  parentMessageID: string
  parentCallID: string
  logicalTaskID: string
}
export type MaestroUpstreamAttributionV2 = {
  schema: "maestro-upstream-attribution-v2"
  projectID: string
  memberID: string
  profile: "upstream"
  authorSessionID: string
  authorMessageID: string
  parentSessionID: string
  parentMessageID: string
  parentCallID: string
  logicalTaskID: string
  dispatch: MaestroUpstreamAttributionOrchestraTaskDispatch | MaestroUpstreamAttributionClaudeCodeAgentDispatch
}
