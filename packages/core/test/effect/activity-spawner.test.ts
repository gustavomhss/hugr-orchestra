import { expect } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ActivityMonitor } from "../../src/activity-monitor"
import { ProcessProvenance } from "../../src/process-provenance"
import { expectSpawn } from "../fixture/omni-expect"
import { exiting, fx, mode, ready, Spawner } from "./omni-spawner-fixture"
import { tree } from "../fixture/process-tree"

fx.live.skipIf(mode === "off")(
  "real spawns retain invocation provenance without inferring a session name",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const spawner = yield* Spawner
      const handle = yield* spawner
        .spawn(ChildProcess.make(process.execPath, ["-e", 'console.log("ready"); setInterval(() => {}, 1000)']))
        .pipe(
          Effect.provideService(ProcessProvenance.Current, {
            sessionID: "ses_observed",
            agentID: "backend",
            tool: "bash",
            callID: "call-observed",
          }),
        )
      yield* ready(handle, "ready")
      const before = yield* Effect.promise(() => ActivityMonitor.snapshot())
      const recordID = before.records.find((entry) => entry.pid === handle.pid)?.recordID
      expect(recordID).toBeDefined()
      expect(yield* Effect.promise(() => ActivityMonitor.inspect(recordID!))).toBe(true)
      const snapshot = yield* Effect.promise(() => ActivityMonitor.snapshot())
      const row = snapshot.records.find((entry) => entry.pid === handle.pid)
      expect(row?.sessionID).toBe("ses_observed")
      expect(row?.agentID).toBe("backend")
      expect(row?.callID).toBe("call-observed")
      expect(row?.tool).toBe("bash")
      expect(row?.owner).toBe("")
      expect(row?.state).toBe("alive")
      expect(row?.supervisorID).toMatch(/^\d+:\d+$/)
      expect(row?.supervisorID).not.toBe(String(handle.pid))
      expect(row?.members?.some((member) => member.pid === handle.pid)).toBe(true)
      yield* handle.kill()
    }),
  30_000,
)

fx.live.skipIf(mode === "off")(
  "a root exit does not mark a supervised descendant tree gone",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const spawner = yield* Spawner
      const fixture = tree(1)
      const handle = yield* spawner.spawn(exiting(fixture, "ignore"))
      yield* handle.exitCode
      const before = yield* Effect.promise(() => ActivityMonitor.snapshot())
      const recordID = before.records.find((entry) => entry.pid === handle.pid)?.recordID
      expect(recordID).toBeDefined()
      expect(yield* Effect.promise(() => ActivityMonitor.inspect(recordID!))).toBe(true)
      const snapshot = yield* Effect.promise(() => ActivityMonitor.snapshot())
      const row = snapshot.records.find((entry) => entry.pid === handle.pid)
      expect(row?.state).toBe("alive")
      expect(row?.members?.length).toBeGreaterThan(0)
      expect(row?.members?.some((member) => member.pid === handle.pid)).toBe(false)
      yield* handle.kill()
      expect(yield* Effect.promise(() => ActivityMonitor.inspect(recordID!))).toBe(true)
      const stopped = yield* Effect.promise(() => ActivityMonitor.snapshot())
      expect(stopped.records.find((entry) => entry.recordID === row?.recordID)?.state).toBe("gone")
    }),
  30_000,
)
