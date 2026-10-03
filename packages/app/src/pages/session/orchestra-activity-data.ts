import type { JanitorReport } from "@/utils/janitor-report"
import type { DockSnapshot } from "./orchestra-dock-snapshot"
import { newest, type TasksItem } from "./tasks-data"

/**
 * One typed Activity row. Agents and shells are the Tasks projection's own items; the Dock row is
 * this window's snapshot and the Janitor row the current server's report. None of them is a person
 * or a presence: there is no "online" here.
 */
export type ActivityItem =
  | { key: string; kind: "agent" | "shell"; scope: "session"; rank: number; time?: number; task: TasksItem }
  | { key: string; kind: "dock"; scope: "window"; rank: number; dock: DockSnapshot }
  | { key: string; kind: "janitor"; scope: "server"; rank: number; time?: number; findings?: number }

export type ActivityInput = {
  tasks: { running: TasksItem[]; finished: TasksItem[] }
  dock?: DockSnapshot
  janitor: { report: JanitorReport | null; source: string | null }
  /** The server this session belongs to; a Janitor report counts only when it names this server. */
  server: string
}

const order = { agent: 0, shell: 1, dock: 2, janitor: 3 } as const

/**
 * Intervention and errors first, then work in progress, then recent events with a known time,
 * then the rest; ties by kind and key. A Dock observation never outranks a pending request.
 */
export function deriveActivity(input: ActivityInput): ActivityItem[] {
  const tasks = [...input.tasks.running, ...input.tasks.finished].map(
    (task): ActivityItem => ({
      key: task.key,
      kind: task.kind,
      scope: "session",
      rank: taskRank(task),
      time: task.state === "running" || task.state === "needs-input" ? task.startTime : task.endTime,
      task,
    }),
  )
  const dock: ActivityItem[] = input.dock
    ? [
        {
          key: `dock:${input.dock.profile ?? ""}`,
          kind: "dock",
          scope: "window",
          rank: dockRank(input.dock),
          dock: input.dock,
        },
      ]
    : []
  return [...tasks, ...dock, janitorItem(input)].toSorted(
    (a, b) =>
      a.rank - b.rank || newest(time(a), time(b)) || order[a.kind] - order[b.kind] || a.key.localeCompare(b.key),
  )
}

// A report without the current server as its source is not attributed to this session's server,
// and no report is "no report", never a clean bill of health.
function janitorItem(input: ActivityInput): ActivityItem {
  const report = input.janitor.source === input.server ? input.janitor.report : null
  if (!report) return { key: "janitor", kind: "janitor", scope: "server", rank: 3 }
  const created = Date.parse(report.createdAt)
  return {
    key: "janitor",
    kind: "janitor",
    scope: "server",
    rank: report.findings.some((finding) => finding.severity === "urgent") ? 0 : 2,
    time: Number.isNaN(created) ? undefined : created,
    findings: report.findings.length,
  }
}

function taskRank(task: TasksItem) {
  if (task.state === "needs-input" || task.state === "error") return 0
  if (task.state === "running") return 1
  return task.endTime === undefined ? 3 : 2
}

function dockRank(dock: DockSnapshot) {
  if (dock.state === "crashed" || dock.state === "failed" || dock.state === "navigation-error") return 0
  if (dock.state === "restoring" || dock.state === "loading") return 1
  return 3
}

function time(item: ActivityItem) {
  return item.kind === "dock" ? undefined : item.time
}
