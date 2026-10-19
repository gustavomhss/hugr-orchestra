import { describe, expect, test } from "bun:test"
import { type AtlasMember, type AtlasMemoryTask, createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { lessons, projectMemory, taskLog, taskStatus } from "./memory-data"

const record = (taskId: string, extra: Partial<AtlasMemoryTask> = {}): AtlasMemoryTask => ({
  taskId,
  attempted: [],
  failedWith: [],
  stoppedAt: "",
  lesson: "",
  ref: `ref-${taskId}`,
  source: "memory.jsonl",
  ...extra,
})
// The fixture's memory is empty, so the member is built by hand.
const member: AtlasMember = {
  bound: true,
  tasks: [
    record("t1", { stoppedAt: "Phase 1 done", lesson: "Run the tests first." }),
    record("t2", { stoppedAt: "Both phases complete", lesson: "Keep packets short." }),
    record("t1", { stoppedAt: "Phase 2 done" }),
    record("t3", { failedWith: ["tsc exited 2"], stoppedAt: "Phase 2 done", lesson: "Run the tests first." }),
  ],
  prs: [],
  rules: [{ rule: "Keep packets short.", scope: "*", age: 0, from: "Keep packets short." }],
}

describe("atlas memory data", () => {
  test("groups records by task id, in first-seen order", () => {
    const log = taskLog(member)
    expect(log.map((task) => task.taskId)).toEqual(["t1", "t2", "t3"])
    expect(log[0].records.length).toBe(2)
    expect(log[0].latest.stoppedAt).toBe("Phase 2 done")
    expect(taskLog({ ...member, tasks: [] })).toEqual([])
  })

  test("reads a status from the latest record", () => {
    expect(taskLog(member).map((task) => taskStatus(task.latest))).toEqual(["done", "done", "blocked"])
    expect(taskStatus(record("t9", { stoppedAt: "Phase 1 (now)" }))).toBe("paused")
    expect(taskStatus(record("t9", { stoppedAt: "phase 2 complete" }))).toBe("done")
  })

  test("proposes each lesson once, minus dismissed and written ones", () => {
    expect(lessons(member, [])).toEqual([{ lesson: "Run the tests first.", unit: "t3" }])
    expect(lessons(member, ["Run the tests first."])).toEqual([])
    expect(lessons({ ...member, rules: [] }, [])).toEqual([
      { lesson: "Run the tests first.", unit: "t3" },
      { lesson: "Keep packets short.", unit: "t2" },
    ])
  })

  test("counts project memory over the empty fixture memory", () => {
    const model = createAtlasModel(atlasFixture())
    expect(projectMemory(model, "backend", [])).toEqual({
      indexed: [],
      archived: [],
      proposals: [],
      used: 0,
      lifetime: 0,
      text: model.headerText("backend"),
      shared: 28,
    })
  })
})
