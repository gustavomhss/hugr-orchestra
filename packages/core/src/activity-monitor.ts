export * as ActivityMonitor from "./activity-monitor"

import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { Child } from "./omni"
import type { ProcessProvenance } from "./process-provenance"
import { ActivityCPU } from "./activity-cpu"
import { ActivityFootprintHypothesis } from "./activity-footprint-hypothesis"

const FINISHED_KEPT = 32
type Entry = {
  child: WeakRef<Child>
  record: ActivityMonitor.Record
  assistantMessageID?: string
  workFinishedAt?: number
  footprintMembers?: string
  footprintSamples: ActivityFootprintHypothesis.Sample[]
  closed?: number
  rootSettled: boolean
  sampling?: Promise<void>
  inspections: number
}

function invalidateFootprint(entry: Entry) {
  entry.footprintMembers = undefined
  entry.footprintSamples = []
  if (entry.record.footprint?.hypothesis === "compatible-with-logical-leak")
    entry.record = { ...entry.record, footprint: { ...entry.record.footprint, hypothesis: "insufficient" } }
}

/** An observer never owns a child or changes its I/O, stop policy, adoption or lifetime. */
export function make() {
  const entries = new Map<string, Entry>()
  const cpu = ActivityCPU.make()
  const status = { instanceID: crypto.randomUUID(), retired: 0, closure: 0 }

  const retire = () => {
    const closed = [...entries.values()]
      .filter((entry) => entry.closed !== undefined && entry.inspections === 0)
      .sort((a, b) => (a.closed ?? 0) - (b.closed ?? 0))
    closed.slice(0, Math.max(0, closed.length - FINISHED_KEPT)).forEach((entry) => {
      entries.delete(entry.record.recordID)
      collected.unregister(entry)
      status.retired++
    })
  }

  // Collection means the observation handle is unavailable, never proof that the native tree exited.
  // Retire such metadata even when no Monitor window is open; the observer must not accumulate dead handles.
  const collected = new FinalizationRegistry<Entry>((entry) => {
    invalidateFootprint(entry)
    entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
    entry.closed ??= ++status.closure
    retire()
  })

  const sample = (entry: Entry): Promise<void> => {
    if (entry.sampling) return entry.sampling
    const child = entry.child.deref()
    if (!child) {
      // Losing an observation handle does not prove the tree exited.
      invalidateFootprint(entry)
      entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
      entry.closed ??= ++status.closure
      return Promise.resolve()
    }
    // Older installed bindings cannot safely perform this observation.
    const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
    entry.sampling = Promise.race([
      Promise.resolve().then(() => {
        const tree = child as Child & { observeTree?: () => Promise<{ members: ActivityMonitor.Member[]; physicalFootprintBytes?: number; footprintIdentity?: string }> }
        return tree.observeTree ? tree.observeTree() : child.observeProcesses().then((members) => ({ members, physicalFootprintBytes: undefined, footprintIdentity: undefined }))
      }),
      new Promise<never>((_, reject) => {
        timer.id = setTimeout(() => reject(new Error("Process observation timed out")), 2000)
      }),
    ])
      .then(
        (observation) => {
          const sampledAt = Date.now()
          const members = observation.members
          const bytes = observation.physicalFootprintBytes
          const complete = entry.record.supervisorID && members.length > 0 &&
            members.every((member) => Number.isSafeInteger(member.pid) && member.pid > 0 &&
              (member.parentPid === null || Number.isSafeInteger(member.parentPid) && member.parentPid > 0)) &&
            new Set(members.map((member) => member.pid)).size === members.length &&
            Number.isSafeInteger(bytes) && bytes !== undefined && bytes >= 0
          if (complete && bytes !== undefined) {
            const identity = observation.footprintIdentity
              ? JSON.stringify([observation.footprintIdentity, members.map((member) => [member.pid, member.parentPid]).sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))])
              : undefined
            if (!identity || entry.footprintMembers !== identity || (entry.footprintSamples.at(-1)?.sampledAt ?? -1) >= sampledAt)
              entry.footprintSamples = []
            entry.footprintMembers = identity
            entry.footprintSamples.push({ source: "footprint", bytes, sampledAt })
            entry.footprintSamples = entry.footprintSamples.slice(-64)
            entry.record = { ...entry.record, footprint: { source: "omni.darwin.phys-footprint", bytes, sampledAt,
              hypothesis: ActivityFootprintHypothesis.evaluate({ samples: entry.footprintSamples, workFinishedAt: entry.workFinishedAt }) } }
          } else invalidateFootprint(entry)
          entry.record = {
            ...entry.record,
            state: members.length ? "alive" : "unknown",
            inspectionFailed: false,
            source: "omni.processes",
            sampledAt,
            members,
          }
          entry.closed = members.length === 0 && entry.rootSettled ? ++status.closure : undefined
        },
        () => {
          invalidateFootprint(entry)
          // Inspection failure is unknown; preserve the last measured members and their timestamp.
          entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
          entry.closed = entry.rootSettled ? ++status.closure : undefined
        },
      )
      .finally(() => {
        clearTimeout(timer.id)
        entry.sampling = undefined
      })
    return entry.sampling
  }

  function snapshot(): ActivityMonitor.Snapshot {
    // A paint/refresh reads only the ledger and logical-CPU counters; it never enumerates OS processes.
    entries.forEach((entry) => {
      if (entry.closed === undefined && !entry.child.deref()) {
        invalidateFootprint(entry)
        entry.record = { ...entry.record, state: "unknown", inspectionFailed: true }
        entry.closed = ++status.closure
      }
    })
    retire()
    const reading = cpu()
    return structuredClone({
      instanceID: status.instanceID,
      ...(reading ? { cpu: reading } : {}),
      readAt: Date.now(),
      source: "orchestra.omni.ledger" as const,
      coverage: "server-pipe-spawns" as const,
      retired: status.retired,
      records: [...entries.values()].map((entry) => entry.record),
    })
  }

  return {
    observe(child: Child, executable: string, owner: string, provenance?: ProcessProvenance.Info) {
      // An older installed addon has no getter. Absence never becomes a PID or an observation UUID.
      const supervisorID = child.treeId
      const entry: Entry = {
        child: new WeakRef(child),
        record: {
          recordID: crypto.randomUUID(),
          ...(typeof supervisorID === "string" && supervisorID.length > 0 ? { supervisorID } : {}),
          pid: child.pid,
          executable: executable.split(/[/\\]/).at(-1) ?? executable,
          ...(provenance
            ? {
                sessionID: provenance.sessionID,
                agentID: provenance.agentID,
                tool: provenance.tool,
                callID: provenance.callID,
              }
            : {}),
          owner,
          startedAt: Date.now(),
          state: "alive",
          inspectionFailed: false,
        },
        assistantMessageID: provenance?.assistantMessageID,
        footprintSamples: [],
        rootSettled: false,
        inspections: 0,
      }
      entries.set(entry.record.recordID, entry)
      collected.register(child, entry, entry)
      // Root exit is not tree exit. Membership remains an explicitly requested reading.
      const rootExited = () => {
        entry.rootSettled = true
        invalidateFootprint(entry)
        entry.record = { ...entry.record, state: "unknown" }
      }
      void child.wait().then(rootExited, rootExited)
      return entry.record.recordID
    },
    complete(input: { sessionID: string; assistantMessageID: string; tool: string; callID: string; finishedAt: number }) {
      if (!Number.isFinite(input.finishedAt)) return
      entries.forEach((entry) => {
        if (entry.record.sessionID !== input.sessionID || entry.assistantMessageID !== input.assistantMessageID ||
          entry.record.tool !== input.tool || entry.record.callID !== input.callID || entry.workFinishedAt !== undefined) return
        entry.workFinishedAt = input.finishedAt
      })
    },
    async control(recordID: string) {
      const entry = entries.get(recordID)
      const child = entry?.child.deref()
      const identity = entry?.record.supervisorID
      if (!entry || !child || !identity || entry.rootSettled || child.treeId !== identity) return
      const native = child as Child & {
        controlMembers?: () => Promise<readonly string[]>
        stopSelected?: (members: readonly string[]) => Promise<readonly ("exited" | "unknown")[]>
      }
      if (!native.controlMembers || !native.stopSelected) return
      try {
        const members = await native.controlMembers()
        if (entries.get(recordID) !== entry || entry.child.deref() !== child || entry.rootSettled || child.treeId !== identity ||
          !Array.isArray(members) || !members.length || members.length > 256 ||
          members.some((member) => typeof member !== "string" || !/^[1-9][0-9]{0,9}:[1-9][0-9]{0,19}$/.test(member)) ||
          new Set(members).size !== members.length) return
        return {
          identity,
          label: entry.record.executable,
          owner: entry.record.owner,
          members,
          stop: async (selected: readonly string[]) => {
            if (entries.get(recordID) !== entry || entry.child.deref() !== child || entry.rootSettled || child.treeId !== identity)
              return selected.map(() => "unknown" as const)
            const result = await native.stopSelected!(selected)
            // The approved stop can settle the root before its native receipt reaches us.
            if (entries.get(recordID) !== entry || entry.child.deref() !== child || child.treeId !== identity)
              return selected.map(() => "unknown" as const)
            return result
          },
        }
      } catch {
        return
      }
    },
    async inspect(recordID: string) {
      const entry = entries.get(recordID)
      if (!entry) return
      entry.inspections++
      try {
        await sample(entry)
        return snapshot()
      } finally {
        entry.inspections--
        retire()
      }
    },
    snapshot,
  }
}

const monitor = make()
export const observe = monitor.observe
export const snapshot = monitor.snapshot
export const inspect = monitor.inspect
export const complete = monitor.complete
export const control = monitor.control
