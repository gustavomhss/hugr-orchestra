import type { AtlasMember, AtlasMemberId, AtlasMemoryTask, AtlasModel } from "../atlas-model"
import type { AtlasRoute } from "../atlas-route"

// The memory pages (specs/atlas-ui/mock/views-memory.js) over the records of .atlas/memory.jsonl (D3b). Session
// transcripts are not served (D12), so a task is only its checkpoints: no calls, times or tokens.

// What the member page hands its sections (memory.tsx, memory-project.tsx). Dismissed proposals live in the page.
export type MemoryMemberProps = {
  model: AtlasModel
  route: AtlasRoute
  member: AtlasMemberId
  dismissed: readonly string[]
  onDismiss: (lesson: string) => void
}

export type MemoryStatus = "done" | "paused" | "blocked"
export const MEMORY_STATUSES: readonly MemoryStatus[] = ["done", "paused", "blocked"]
// [tone, icon, chip word, KPI dot word] per status (mock views-memory.js:16-22, 35).
export const MEMORY_STATUS = {
  done: ["good", "checkc", "orchestra.atlas.memory.status.done", "orchestra.atlas.memory.dot.done"],
  paused: ["warm", "clock", "orchestra.atlas.memory.status.paused", "orchestra.atlas.memory.dot.paused"],
  blocked: ["bad", "xc", "orchestra.atlas.memory.status.blocked", "orchestra.atlas.memory.dot.blocked"],
} as const

// One memory-log entry per task id, in first-seen order; `latest` is the task's last record.
export function taskLog(member: AtlasMember) {
  return [...new Set(member.tasks.map((record) => record.taskId))].map((taskId) => {
    const records = member.tasks.filter((record) => record.taskId === taskId)
    return { taskId, records, latest: records[records.length - 1] }
  })
}

// The interface's reading of a task's latest checkpoint; Atlas has no task status (mock views-memory.js:16).
export function taskStatus(latest: AtlasMemoryTask): MemoryStatus {
  if (latest.failedWith.length) return "blocked"
  if (/both phases complete|phase 2 (done|complete)/i.test(latest.stoppedAt)) return "done"
  return "paused"
}

// Proposals: each distinct lesson, linked to the last task that wrote it, minus the dismissed ones and the lessons
// a rule was already written from (mock views-memory.js:25, 46-47).
export function lessons(member: AtlasMember, dismissed: readonly string[]) {
  const written = new Set(member.rules.map((rule) => rule.from))
  return [
    ...new Map(
      member.tasks
        .filter((record) => record.lesson)
        .map((record) => [record.lesson, { lesson: record.lesson, unit: record.taskId }] as const),
    ).values(),
  ].filter((item) => !dismissed.includes(item.lesson) && !written.has(item.lesson))
}

// Project memory, counted the way Atlas counts it: whitespace words (mock views-memory.js:43-53).
export function projectMemory(model: AtlasModel, member: AtlasMemberId, dismissed: readonly string[]) {
  const header = model.header(member)
  const used = header.injected.reduce((n, rule) => n + model.words(rule.rule), 0)
  const text = model.headerText(member)
  return {
    indexed: header.injected,
    archived: header.evicted,
    proposals: lessons(model.memory[member], dismissed),
    used,
    lifetime: model.memory[member].rules.reduce((n, rule) => n + model.words(rule.rule), 0),
    text,
    shared: model.words(text) - used,
  }
}
