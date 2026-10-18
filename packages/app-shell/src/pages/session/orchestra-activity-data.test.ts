import { describe, expect, test } from "bun:test"
import type { JanitorReport } from "@/utils/janitor-report"
import { deriveActivity, type ActivityInput } from "./orchestra-activity-data"
import type { TasksItem } from "./tasks-data"

const server = "http://127.0.0.1:4096"

function task(key: string, state: TasksItem["state"], extra: Partial<TasksItem> = {}): TasksItem {
  return { key, kind: "agent", headline: key, state, sessionId: "ses_parent", ...extra }
}

function input(extra: Partial<ActivityInput> = {}): ActivityInput {
  return { tasks: { running: [], finished: [] }, janitor: { report: null, source: null }, server, ...extra }
}

const report = (severity: "attention" | "urgent"): JanitorReport => ({
  createdAt: "2026-10-01T10:00:00.000Z",
  findings: [{ kind: "disk", severity, summary: "Disk is filling up", evidence: "", suggestion: "" }],
})

describe("deriveActivity", () => {
  test("orders intervention, then work in progress, then recent events, then the rest", () => {
    const items = deriveActivity(
      input({
        tasks: {
          running: [task("running", "running", { startTime: 5 }), task("asks", "needs-input", { startTime: 1 })],
          finished: [task("done", "completed", { endTime: 9 }), task("silent", "unknown"), task("failed", "error")],
        },
        dock: { profile: "repo-a", state: "ready", tab: { tabID: "tab-1", generation: 1 }, title: "Docs" },
      }),
    )
    expect(items.map((item) => item.key)).toEqual([
      "asks",
      "failed",
      "running",
      "done",
      "silent",
      "dock:repo-a",
      "janitor",
    ])
  })

  test("only the latest failure outranks work in progress; older failures never hide it", () => {
    const failures = [4, 3, 2, 1].map((end) => task(`failed-${end}`, "error", { endTime: end }))
    const items = deriveActivity(
      input({ tasks: { running: [task("running", "running", { startTime: 5 })], finished: failures } }),
    )
    // Every failure stays in the list, and so in its count; the older ones read as past events.
    expect(items.map((item) => [item.key, item.rank])).toEqual([
      ["failed-4", 0],
      ["running", 1],
      ["failed-3", 2],
      ["failed-2", 2],
      ["failed-1", 2],
      ["janitor", 3],
    ])
  })

  test("a failure without an end time can be the latest, and otherwise never sinks below completed work", () => {
    const old = task("failed-old", "error", { startTime: 1, endTime: 5 })
    const completed = task("done", "completed", { endTime: 9 })
    const running = task("running", "running", { startTime: 2 })
    // A child transcript can prove a failure without stamping when it ended.
    const latest = deriveActivity(
      input({
        tasks: { running: [running], finished: [old, completed, task("failed-new", "error", { startTime: 10 })] },
      }),
    )
    expect(latest.map((item) => [item.key, item.rank])).toEqual([
      ["failed-new", 0],
      ["running", 1],
      ["done", 2],
      ["failed-old", 2],
      ["janitor", 3],
    ])

    const older = deriveActivity(
      input({
        tasks: {
          running: [running],
          finished: [
            task("failed-last", "error", { startTime: 15, endTime: 20 }),
            completed,
            task("failed-unstamped", "error", { startTime: 12 }),
            task("silent", "unknown"),
          ],
        },
      }),
    )
    expect(older.map((item) => [item.key, item.rank])).toEqual([
      ["failed-last", 0],
      ["running", 1],
      ["failed-unstamped", 2],
      ["done", 2],
      ["silent", 3],
      ["janitor", 3],
    ])
  })

  test("a Dock observation never outranks a pending request, but a crashed tab joins the errors", () => {
    const pending = task("asks", "needs-input", { startTime: 1 })
    const crashed = deriveActivity(
      input({
        tasks: { running: [pending], finished: [] },
        dock: { profile: "repo-a", state: "crashed", tab: { tabID: "tab-1", generation: 2 } },
      }),
    )
    expect(crashed.map((item) => item.key)).toEqual(["asks", "dock:repo-a", "janitor"])
    const restoring = deriveActivity(
      input({ tasks: { running: [pending], finished: [] }, dock: { state: "restoring" } }),
    )
    expect(restoring.map((item) => [item.key, item.rank])).toEqual([
      ["asks", 0],
      ["dock:", 1],
      ["janitor", 3],
    ])
  })

  test("agents and shells keep their kind; nothing reads as a person online", () => {
    const items = deriveActivity(
      input({ tasks: { running: [task("a", "running"), task("s", "running", { kind: "shell" })], finished: [] } }),
    )
    expect(items.map((item) => [item.kind, item.scope])).toEqual([
      ["agent", "session"],
      ["shell", "session"],
      ["janitor", "server"],
    ])
  })

  test("a Janitor report counts only when it names this server", () => {
    const bound = deriveActivity(input({ janitor: { report: report("urgent"), source: server } })).at(-1)
    expect(bound).toMatchObject({ kind: "janitor", rank: 0, findings: 1, time: Date.parse("2026-10-01T10:00:00.000Z") })

    // A legacy report without a source, or one from another server, is not attributed here.
    for (const source of [null, "http://127.0.0.1:4097"]) {
      const unbound = deriveActivity(input({ janitor: { report: report("urgent"), source } })).at(-1)
      expect(unbound).toEqual({ key: "janitor", kind: "janitor", scope: "server", rank: 3 })
    }
  })

  test("no report is no report, not zero findings", () => {
    const item = deriveActivity(input()).at(-1)
    expect(item).toEqual({ key: "janitor", kind: "janitor", scope: "server", rank: 3 })
    expect(item && "findings" in item).toBe(false)
  })
})
