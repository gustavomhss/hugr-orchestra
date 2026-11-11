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
    expect(await monitor.inspect(id)).toBe(true)
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
    expect(await monitor.inspect(id)).toBe(true)
    const ended = (await monitor.snapshot()).records.find((row) => row.recordID === id)
    expect(ended?.state).toBe("gone")
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
        if (key === "treeId") return undefined
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
    expect(await monitor.inspect(id)).toBe(true)
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
        if (key === "processes")
          return () => {
            counts.inspections++
            return target.processes()
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
    expect(await monitor.inspect(id)).toBe(true)
    expect(counts.inspections).toBe(1)
    await child.closeStdin()
    await child.wait()
    const stale = (await monitor.snapshot()).records.find((row) => row.recordID === id)
    expect(stale?.state).toBe("unknown")
    expect(stale?.members?.length).toBeGreaterThan(0)
    expect(counts.inspections).toBe(1)
    expect(await monitor.inspect(id)).toBe(true)
    expect((await monitor.snapshot()).records.find((row) => row.recordID === id)?.state).toBe("gone")
    expect(counts.inspections).toBe(2)
    expect(observed.pid).toBe(child.pid)
  }, 30_000)
})
