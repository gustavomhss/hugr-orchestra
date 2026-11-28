import { describe, expect, test } from "bun:test"
import { ActivityQuarantineExecutor } from "../src/activity-quarantine-executor"

const target = { id: "one", generation: "1", identity: "inode" }
const absent = { state: "absent" } as const
const present = { state: "present", identity: "inode" } as const
const other = { state: "present", identity: "other" } as const
const unavailable = { state: "unavailable" } as const
const before = { original: present, quarantine: absent }
const after = { original: absent, quarantine: present }

describe("quarantine executor", () => {
  test("requires a fresh matching read after exactly one mutation", async () => {
    const calls: string[] = []
    const adapter: ActivityQuarantineExecutor.Adapter = {
      prepare: async () => { calls.push("prepare"); return { facts: before, claimant: "absent", mutation: async () => { calls.push("mutate"); return "accepted" } } },
      reread: async () => { calls.push("reread"); return after },
    }
    expect(await ActivityQuarantineExecutor.execute(adapter, target, "apply")).toBe("Verified")
    expect(calls).toEqual(["prepare", "mutate", "reread"])
    expect(await ActivityQuarantineExecutor.execute({ ...adapter, reread: async () => before }, target, "apply")).toBe("Unknown")
    expect(await ActivityQuarantineExecutor.execute({ ...adapter, reread: async () => { throw new Error("read") } }, target, "apply")).toBe("Unknown")
  })

  test("refuses missing capability, claimant, identity mismatch, and occupied or unreadable destinations before mutation", async () => {
    const calls: string[] = []
    const mutation = async () => { calls.push("mutate"); return "accepted" as const }
    const cases = [
      { facts: before, claimant: "present" as const, mutation },
      { facts: before, claimant: "unknown" as const, mutation },
      { facts: before, claimant: "absent" as const },
      { facts: { original: other, quarantine: absent }, claimant: "absent" as const, mutation },
      { facts: { original: present, quarantine: other }, claimant: "absent" as const, mutation },
      { facts: { original: present, quarantine: unavailable }, claimant: "absent" as const, mutation },
    ]
    for (const item of cases) {
      expect(await ActivityQuarantineExecutor.execute({ prepare: async () => item, reread: async () => after }, target, "apply")).toBe("Refused")
    }
    expect(calls).toEqual([])
    expect(await ActivityQuarantineExecutor.execute({ prepare: async () => { throw new Error("prepare") }, reread: async () => after }, target, "apply")).toBe("Refused")
  })

  test("distinguishes a guaranteed refusal from an uncertain effect", async () => {
    const adapter: ActivityQuarantineExecutor.Adapter = { prepare: async () => ({ facts: before, claimant: "absent", mutation: async () => "refused" }), reread: async () => after }
    expect(await ActivityQuarantineExecutor.execute(adapter, target, "apply")).toBe("Refused")
    expect(await ActivityQuarantineExecutor.execute({ ...adapter, prepare: async () => ({ facts: before, claimant: "absent", mutation: async () => { throw new Error("effect") } }) }, target, "apply")).toBe("Unknown")
    expect(await ActivityQuarantineExecutor.execute({ ...adapter, prepare: async () => ({ facts: before, claimant: "absent", mutation: async () => "unknown" }) }, target, "apply")).toBe("Unknown")
    expect(await ActivityQuarantineExecutor.execute({ ...adapter, prepare: async () => ({ facts: after, claimant: "absent", mutation: async () => "accepted" }), reread: async () => before }, target, "restore")).toBe("Verified")
    expect(await ActivityQuarantineExecutor.execute(adapter, target, "empty")).toBe("Refused")
  })

  test("empty admits the entire current selection before effects and stops on uncertainty", async () => {
    const targets = [target, { ...target, id: "two" }]
    const rows = targets.map((item) => ({ id: item.id, kind: "quarantine" as const, state: "ready" as const }))
    const calls: string[] = []
    const adapter: ActivityQuarantineExecutor.Adapter = {
      prepare: async (item) => { calls.push(`prepare:${item.id}`); return { facts: after, claimant: "absent", mutation: async () => { calls.push(`mutate:${item.id}`); return "accepted" } } },
      reread: async (item) => { calls.push(`read:${item.id}`); return { original: absent, quarantine: item.id === "one" ? unavailable : absent } },
    }
    expect(await ActivityQuarantineExecutor.executeEmpty(adapter, targets, rows)).toBe("Unknown")
    expect(calls).toEqual(["prepare:one", "prepare:two", "mutate:one", "read:one"])
    calls.length = 0
    expect(await ActivityQuarantineExecutor.executeEmpty(adapter, [target], rows)).toBe("Refused")
    expect(await ActivityQuarantineExecutor.executeEmpty(adapter, targets, [...rows, { id: "three", kind: "quarantine", state: "refused" }])).toBe("Refused")
    expect(await ActivityQuarantineExecutor.executeEmpty({ ...adapter, prepare: async (item) => item.id === "two" ? undefined : adapter.prepare(item, "empty") }, targets, rows)).toBe("Refused")
    expect(calls).toEqual(["prepare:one"])
  })
})
