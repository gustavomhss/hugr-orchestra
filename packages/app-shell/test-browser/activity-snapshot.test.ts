import { expect, test } from "bun:test"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { createStore } from "solid-js/store"
import { applySnapshot } from "../src/orchestra/chapters/activity/snapshot"

const firstID = "00000000-0000-4000-8000-000000000001"
const secondID = "00000000-0000-4000-8000-000000000002"
const cpu = { source: "node.os.cpus", percent: 50, windowMs: 1000, sampledAt: 1000 } as const

function snapshot(instanceID: string): ActivityMonitor.Snapshot {
  return {
    instanceID,
    readAt: 1000,
    source: "orchestra.omni.ledger",
    coverage: "server-pipe-spawns",
    retired: 0,
    records: [
      {
        recordID: "00000000-0000-4000-8000-000000000003",
        pid: 42,
        executable: "bun",
        owner: "recorded session",
        startedAt: 10,
        state: "alive",
        inspectionFailed: false,
      },
    ],
  }
}

test("the first snapshot leaves missing CPU unread and preserves other UI state", () => {
  const [state, setState] = createStore({ snapshot: undefined as ActivityMonitor.Snapshot | undefined, busy: true })
  setState(applySnapshot(snapshot(firstID)))
  expect(state.snapshot?.instanceID).toBe(firstID)
  expect(Object.hasOwn(state.snapshot!, "cpu")).toBe(false)
  expect(state.busy).toBe(true)
})

test("refreshing one instance preserves record identity and removes absent readings", () => {
  const initial = snapshot(firstID)
  const [state, setState] = createStore<{ snapshot: ActivityMonitor.Snapshot }>({ snapshot: { ...initial, cpu } })
  const before = state.snapshot.records[0]
  setState(applySnapshot({ ...initial, readAt: 2000, records: [{ ...initial.records[0]!, state: "unknown" }] }))
  expect(state.snapshot.records[0]).toBe(before)
  expect(state.snapshot.records[0]?.state).toBe("unknown")
  expect(state.snapshot.readAt).toBe(2000)
  expect(Object.hasOwn(state.snapshot, "cpu")).toBe(false)
})

test("a new instance discards old CPU and record identity even when record ids are reused", () => {
  const [state, setState] = createStore<{ snapshot: ActivityMonitor.Snapshot }>({
    snapshot: { ...snapshot(firstID), cpu },
  })
  const before = state.snapshot.records[0]
  setState(applySnapshot(snapshot(secondID)))
  expect(state.snapshot.instanceID).toBe(secondID)
  expect(Object.hasOwn(state.snapshot, "cpu")).toBe(false)
  expect(state.snapshot.records[0]?.recordID).toBe(before?.recordID)
  expect(state.snapshot.records[0]).not.toBe(before)
})
