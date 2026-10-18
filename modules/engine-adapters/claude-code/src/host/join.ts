export * as ClaudeHostJoin from "./join"

// One host session's identity join for Claude Code's subagent runs (spike S3). The stream frame `system/task_started`
// is the only place that carries both the Agent `tool_use_id` and Claude Code's subagent id (`task_id`). That id is
// byte-equal to the hook `agent_id` (SubagentStart, SubagentStop, the child's PreToolUse) and to `AgentOutput.agentId`.
// HOST's stream consumer feeds the stream side; the hooks read and write the rest. Ids always come from Claude Code:
// nothing here infers or invents one, and any disagreement HOLDs the dispatch.
import type { SDKTaskNotificationMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionSchema } from "@orchestra/core/session"

export type Entry = {
  readonly toolUseID: string
  /** Claude Code's subagent id, from `task_started`. */
  taskID?: string
  /** The seat id, for an Orchestra seat; absent for Claude Code's own subagent types. */
  seat?: string
  grantID?: string
  child?: SessionSchema.ID
  hold?: string
}

export type Join = ReturnType<typeof make>

export function make() {
  const entries = new Map<string, Entry>()
  const tasks = new Map<string, string>()
  const delivered = new Set<string>()
  const listeners = new Set<(frame: SDKTaskNotificationMessage) => void>()
  const notices = new Map<string, SDKTaskNotificationMessage>()

  // A notification cannot establish identity; only task_started can do that. Reject a crossed pair without
  // poisoning the established mapping, so the task's later legitimate notification can still be retained.
  const notification = (frame: SDKTaskNotificationMessage) => {
    const toolUseID = tasks.get(frame.task_id)
    const item = toolUseID ? entries.get(toolUseID) : undefined
    if (!item || item.hold || item.taskID !== frame.task_id ||
      (frame.tool_use_id !== undefined && frame.tool_use_id !== toolUseID)) return undefined
    return toolUseID
  }

  const entry = (toolUseID: string) => {
    const existing = entries.get(toolUseID)
    if (existing) return existing
    const created: Entry = { toolUseID }
    entries.set(toolUseID, created)
    return created
  }

  return {
    /** Stream side: `system/task_started`. A second, different id for either side of the pair HOLDs the dispatch. */
    taskStarted: (frame: { readonly toolUseID?: string; readonly taskID: string }) => {
      if (!frame.toolUseID) return
      const item = entry(frame.toolUseID)
      const other = tasks.get(frame.taskID)
      if ((item.taskID && item.taskID !== frame.taskID) || (other && other !== frame.toolUseID)) {
        item.hold = `Claude Code reported conflicting subagent ids for ${frame.toolUseID} (${item.taskID ?? other}, ${frame.taskID})`
        return
      }
      item.taskID = frame.taskID
      tasks.set(frame.taskID, frame.toolUseID)
    },
    /**
     * Stream side: `system/task_notification`, the only delivery of a background run (spike S12). Deduplication
     * starts only after successful retention. Until then, repeats may retry processing and notices stay pending.
     */
    taskNotification: (frame: SDKTaskNotificationMessage) => {
      if (!notification(frame) || delivered.has(frame.task_id)) return
      const pending = notices.get(frame.task_id) ?? frame
      notices.set(frame.task_id, pending)
      listeners.forEach((listener) => listener(pending))
    },
    /** Resolve only an established, agreeing task/call pair, including task-only notifications. */
    notification,
    /** Hook side: acknowledge a validated notification only after its delivery was durably retained. */
    retained: (frame: SDKTaskNotificationMessage) => {
      if (!notification(frame)) return
      delivered.add(frame.task_id)
      notices.delete(frame.task_id)
    },
    /** Hook side, `PreToolUse[Agent]`: what Orchestra bound to the call. */
    dispatched: (toolUseID: string, fields: Pick<Entry, "seat" | "grantID" | "child">) => {
      Object.assign(entry(toolUseID), fields)
    },
    /** The Agent call a subagent id belongs to, once `task_started` has been seen. */
    toolUse: (agentID: string) => tasks.get(agentID),
    get: (toolUseID: string): Readonly<Entry> | undefined => entries.get(toolUseID),
    child: (toolUseID: string) => entries.get(toolUseID)?.child,
    /** Ownership lookup for Tasks-panel interruption, including children with no stream frames yet. */
    children: () => [...entries.values()].flatMap((item) => item.child ? [[item.toolUseID, item.child] as const] : []),
    /** Every id Claude Code reported for one run must be the same one; otherwise the run HOLDs. */
    confirm: (toolUseID: string, reported: readonly (string | undefined)[]): { readonly agentID: string } | { readonly hold: string } => {
      const item = entries.get(toolUseID)
      if (item?.hold) return { hold: item.hold }
      if (!item?.taskID) return { hold: `Claude Code reported no task_started for ${toolUseID}, so its subagent id is unknown` }
      const taskID = item.taskID
      const differs = reported.filter((id) => id !== undefined && id !== taskID)
      if (differs.length) {
        item.hold = `the subagent ids disagree for ${toolUseID} (task_started ${taskID}, reported ${differs.join(", ")})`
        return { hold: item.hold }
      }
      return { agentID: taskID }
    },
    hold: (toolUseID: string, reason: string) => {
      entry(toolUseID).hold = reason
    },
    subscribe: (listener: (frame: SDKTaskNotificationMessage) => void) => {
      listeners.add(listener)
      notices.forEach(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
