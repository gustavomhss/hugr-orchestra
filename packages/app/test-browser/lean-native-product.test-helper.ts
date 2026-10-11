import { expect } from "bun:test"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import type { LeanMetrics } from "@orchestra/schema/lean-metrics"
import type { ToolPart } from "@orchestra/sdk/v2/client"

// Exercise the actual profile collector with the fetched durable native part, not a UI clone.
export async function verifyProfileRows(scope: LeanDashboard.Scope, tool: ToolPart, metric: LeanMetrics.Decision) {
  const { LeanProject } = await import("../../orchestra/src/session/lean-project")
  if (tool.state.status !== "completed") throw new Error("Expected completed durable ToolPart")
  const row = {
    sessionID: tool.sessionID, messageID: tool.messageID, partID: tool.id, callID: tool.callID,
    status: tool.state.status, command: tool.state.input.command, commandLength: String(tool.state.input.command).length,
    exit: tool.state.metadata.exit, time: tool.state.time.end, created: tool.state.time.start,
    metrics: JSON.stringify(metric), revert: null, boundaryTime: null, boundaryPart: null,
  }
  const project = (metrics: unknown) => LeanProject.projectRows(scope, [{ ...row, metrics: metrics === undefined ? null : JSON.stringify(metrics) }], true)
  const positive = () => expect(project(metric).executions).toHaveLength(1)
  positive()
  expect(LeanProject.projectRows(scope, [row, row], true).executions).toHaveLength(1)
  const reject = (metrics: unknown) => {
    const result = project(metrics)
    expect(result.executions).toHaveLength(0)
    expect(JSON.stringify(result)).not.toContain("PRIVATE MUST_NOT_RENDER")
    positive()
  }
  for (const key of ["projectID", "location", "sessionID", "callID"] as const)
    reject({ ...metric, owner: { ...metric.owner, [key]: "foreign-native-owner" } })
  for (const field of ["command", "output"]) {
    reject({ ...metric, [field]: "PRIVATE MUST_NOT_RENDER" })
    for (const nested of ["owner", "model", "bytes", "tokens"] as const)
      reject({ ...metric, [nested]: { ...metric[nested], [field]: "PRIVATE MUST_NOT_RENDER" } })
  }
  reject(undefined)
  const { Schema } = await import("effect")
  const { LeanDashboard } = await import("@orchestra/schema/lean-dashboard")
  const decode = Schema.decodeUnknownSync(LeanDashboard.Execution, { onExcessProperty: "error" })
  const execution = project(metric).executions[0]!
  expect(decode({ ...execution, exit: null, bytesSaved: null, tokensSaved: null })).toMatchObject({ exit: null, bytesSaved: null, tokensSaved: null })
  for (const field of ["exit", "bytesSaved", "tokensSaved"])
    expect(() => decode({ ...execution, [field]: undefined })).toThrow()
}
