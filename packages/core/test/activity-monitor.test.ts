import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { make } from "../src/activity-monitor"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Omni } from "../src/omni"
import { Flag } from "../src/flag/flag"
import { expectSpawn } from "./fixture/omni-expect"

describe.skipIf(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off")("activity observer", () => {
  test("reads real supervisor membership without consuming output or changing child lifetime", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    await using child = binding.spawn(process.execPath, ["-e", 'console.log("ready"); process.stdin.resume()'], {
      stdin: "pipe",
    })
    Omni.count("spawns")
    const monitor = make()
    const provenance = { sessionID: "ses_recorded", agentID: "backend", tool: "bash", callID: "call-1" }
    const id = monitor.observe(child, "/path/to/runtime", "Recorded session", provenance)
    provenance.sessionID = "ses_changed"
    for await (const line of child.lines()) {
      expect(line.text).toBe("ready")
      break
    }
    const first = Schema.decodeUnknownSync(ActivityMonitor.Snapshot)(await monitor.snapshot())
    expect(Object.hasOwn(first, "cpu")).toBe(false)
    expect(first.records.find((row) => row.recordID === id)?.members).toBeUndefined()
    expect(await monitor.inspect(id)).toBeDefined()
    const snapshot = Schema.decodeUnknownSync(ActivityMonitor.Snapshot)(await monitor.snapshot())
    const record = snapshot.records.find((row) => row.recordID === id)
    expect(record?.pid).toBe(child.pid)
    expect(record?.recordID).not.toBe(String(child.pid))
    expect(record?.owner).toBe("Recorded session")
    expect(record?.sessionID).toBe("ses_recorded")
    expect(record?.executable).toBe("runtime")
    expect(record?.state).toBe("alive")
    expect(record?.members?.some((member) => member.pid === child.pid)).toBe(true)
    expect(record?.sampledAt).toBeGreaterThanOrEqual(record?.startedAt ?? Infinity)
    expect(record?.inspectionFailed).toBe(false)
    expect(record?.supervisorID).toBe(child.treeId)
    expect(record?.supervisorID).toMatch(/^\d+:\d+$/)
    expect(record?.supervisorID).not.toBe(record?.recordID)
    expect(record?.supervisorID).not.toBe(String(child.pid))
    expect((await monitor.snapshot()).instanceID).toBe(snapshot.instanceID)
    expect((await make().snapshot()).instanceID).not.toBe(snapshot.instanceID)
    await child.stop({ graceMs: 0 })
    expect(await monitor.inspect(id)).toBeDefined()
    const ended = (await monitor.snapshot()).records.find((row) => row.recordID === id)
    expect(ended?.state).toBe("unknown")
    expect(ended?.members).toEqual([])
    expect(ended?.owner).toBe("Recorded session")
    expect(ended?.supervisorID).toBe(child.treeId)
  }, 30_000)

  test("an older binding stays observable with its supervisor identity explicitly missing", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    await using child = binding.spawn(process.execPath, ["-e", 'console.log("ready"); process.stdin.resume()'], {
      stdin: "pipe",
    })
    Omni.count("spawns")
    // Only hide the additive getter; all process lifecycle and membership calls go to the real child.
    const legacy = new Proxy(child, {
      get(target, key) {
        if (key === "treeId" || key === "observeTree") return undefined
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const monitor = make()
    const id = monitor.observe(legacy, "runtime", "")
    for await (const line of child.lines()) {
      expect(line.text).toBe("ready")
      break
    }
    expect(await monitor.inspect(id)).toBeDefined()
    const row = (await monitor.snapshot()).records.find((record) => record.recordID === id)
    expect(row?.pid).toBe(child.pid)
    expect(row?.state).toBe("alive")
    expect(row?.members?.some((member) => member.pid === child.pid)).toBe(true)
    expect(row?.supervisorID).toBeUndefined()
    expect(legacy.pid).toBe(child.pid)
  }, 30_000)

  test("does not invent owners or expose the observer's mutable state", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    await using child = binding.spawn(process.execPath, ["-e", 'console.log("ready"); process.stdin.resume()'], {
      stdin: "pipe",
    })
    Omni.count("spawns")
    const monitor = make()
    const id = monitor.observe(child, "runtime", "")
    for await (const line of child.lines()) {
      expect(line.text).toBe("ready")
      break
    }
    const snapshot = await monitor.snapshot()
    expect(snapshot.source).toBe("orchestra.omni.ledger")
    expect(snapshot.coverage).toBe("server-pipe-spawns")
    const row = snapshot.records.find((row) => row.recordID === id)
    expect(row?.owner).toBe("")
    expect(row?.sessionID).toBeUndefined()
    Object.assign(row ?? {}, { owner: "forged" })
    expect((await monitor.snapshot()).records.find((row) => row.recordID === id)?.owner).toBe("")
  }, 30_000)

  test("refresh and root exit never enumerate OS membership; inspection is explicit", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    await using child = binding.spawn(process.execPath, ["-e", 'console.log("ready"); process.stdin.resume()'], {
      stdin: "pipe",
    })
    Omni.count("spawns")
    const counts = { inspections: 0 }
    const observed = new Proxy(child, {
      get(target, key) {
        if (key === "observeTree") return undefined
        if (key === "observeProcesses")
          return () => {
            counts.inspections++
            return target.observeProcesses()
          }
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const monitor = make()
    const id = monitor.observe(observed, "runtime", "")
    for await (const line of child.lines()) {
      expect(line.text).toBe("ready")
      break
    }
    await monitor.snapshot()
    await monitor.snapshot()
    expect(counts.inspections).toBe(0)
    expect(await monitor.inspect(id)).toBeDefined()
    expect(counts.inspections).toBe(1)
    await child.closeStdin()
    await child.wait()
    const stale = (await monitor.snapshot()).records.find((row) => row.recordID === id)
    expect(stale?.state).toBe("unknown")
    expect(stale?.members?.length).toBeGreaterThan(0)
    expect(counts.inspections).toBe(1)
    expect(await monitor.inspect(id)).toBeDefined()
    expect((await monitor.snapshot()).records.find((row) => row.recordID === id)?.state).toBe("unknown")
    expect(counts.inspections).toBe(2)
    expect(await monitor.inspect(id)).toBeDefined()
    expect(counts.inspections).toBe(3)
    expect(observed.pid).toBe(child.pid)
  }, 30_000)
})

describe.skipIf(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off")("physical footprint ledger", () => {
  test("requires durable matching completion and a continuous complete tree series", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    // Root exit clears the series, so the process has to outlive the samples. A timer keeps the
    // event loop up if the stdin pipe closes.
    await using child = binding.spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], { stdin: "pipe" })
    Omni.count("spawns")
    const sample = { identity: "tree-a", bytes: 100, members: [{ pid: child.pid, parentPid: null, name: "runtime" }] }
    const observed = new Proxy(child, {
      get(target, key) {
        if (key === "observeTree") return async () => ({ members: sample.members, physicalFootprintBytes: sample.bytes, footprintIdentity: sample.identity })
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const monitor = make()
    const identity = { sessionID: "ses_a", assistantMessageID: "msg_a", tool: "bash", callID: "call_a" }
    // The monitor keeps a weak handle. The array is the test's reference until the last read.
    const held = [observed]
    const id = monitor.observe(held[0], "runtime", "", { ...identity, agentID: "backend" })
    const row = () => monitor.snapshot().records.find((record) => record.recordID === id)
    expect(row()?.footprint).toBeUndefined()
    await monitor.inspect(id)
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    monitor.complete({ ...identity, sessionID: "other", finishedAt: Date.now() })
    monitor.complete({ ...identity, assistantMessageID: "other", finishedAt: Date.now() })
    monitor.complete({ ...identity, tool: "other", finishedAt: Date.now() })
    monitor.complete({ ...identity, callID: "other", finishedAt: Date.now() })
    await waitForClock()
    sample.bytes = 200
    await monitor.inspect(id)
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    monitor.complete({ ...identity, finishedAt: Date.now() })
    for (const bytes of [300, 400, 500]) {
      await waitForClock()
      sample.bytes = bytes
      await monitor.inspect(id)
    }
    expect(row()?.footprint?.hypothesis).toBe("compatible-with-logical-leak")
    const previous = row()?.footprint
    if (!previous) throw new Error("Missing complete footprint before the invalid sample")
    sample.bytes = NaN
    await monitor.inspect(id)
    expect(row()?.footprint).toEqual({ ...previous, hypothesis: "insufficient" })
    await waitForClock()
    sample.bytes = 600
    await monitor.inspect(id)
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    sample.identity = ""
    for (const bytes of [700, 800, 900]) {
      await waitForClock()
      sample.bytes = bytes
      await monitor.inspect(id)
    }
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    sample.identity = "tree-b"
    await waitForClock()
    await monitor.inspect(id)
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    sample.members = [{ pid: child.pid + 1, parentPid: null, name: "other" }]
    await waitForClock()
    await monitor.inspect(id)
    expect(row()?.footprint?.hypothesis).toBe("insufficient")
    expect(await readTree(held[0])).toBe(sample.identity)
  }, 30_000)

  test("a same-millisecond reading keeps the pre-completion baseline", async () => {
    expectSpawn(import.meta.path)
    const binding = await Omni.load()
    await using child = binding.spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], { stdin: "pipe" })
    Omni.count("spawns")
    let now = 1_000
    const sample = { identity: "tree-a", bytes: 100, members: [{ pid: child.pid, parentPid: null, name: "runtime" }] }
    const observed = new Proxy(child, {
      get(target, key) {
        if (key === "observeTree") return async () => ({ members: sample.members, physicalFootprintBytes: sample.bytes, footprintIdentity: sample.identity })
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const held = [observed]
    const monitor = make(() => now)
    const identity = { sessionID: "ses_a", assistantMessageID: "msg_a", tool: "bash", callID: "call_a" }
    const id = monitor.observe(held[0], "runtime", "", { ...identity, agentID: "backend" })
    const row = () => monitor.snapshot().records.find((record) => record.recordID === id)
    await monitor.inspect(id)
    now = 2_000
    sample.bytes = 200
    await monitor.inspect(id)
    monitor.complete({ ...identity, finishedAt: now })
    sample.bytes = 300
    await monitor.inspect(id)
    expect(row()?.footprint?.bytes).toBe(200)
    for (const bytes of [400, 500, 600]) {
      now += 1
      sample.bytes = bytes
      await monitor.inspect(id)
    }
    expect(row()?.footprint?.hypothesis).toBe("compatible-with-logical-leak")
    expect(await readTree(held[0])).toBe(sample.identity)
  }, 30_000)
})

async function readTree(handle: object) {
  const read = Reflect.get(handle, "observeTree") as () => Promise<{ footprintIdentity?: string }>
  return (await read()).footprintIdentity
}

// Date.now() on a runner can stay on the same millisecond across a 2ms sleep. The ledger
// only accepts a strictly later sample, so the test waits until the clock actually moves.
async function waitForClock() {
  const seen = Date.now()
  while (Date.now() <= seen) await Bun.sleep(5)
}
