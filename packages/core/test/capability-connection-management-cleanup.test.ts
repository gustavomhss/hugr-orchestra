import { expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { CapabilityConnectionTable } from "../src/capability/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

// A child-process watchdog bounds even the deliberate cleanup-removal mutation. An Effect timeout
// cannot itself recover a SQL waiter whose scope is closing uninterruptibly behind a held writer.
if (process.env.ORCHESTRA_MANAGEMENT_CLEANUP_WORKER !== "1") {
  it.live("early assertion/failure/timeout cleanup regression completes bounded and frees writer gate", () => Effect.scoped(Effect.gen(function* () {
    const child = yield* Effect.acquireRelease(Effect.sync(() => Bun.spawn({
      cmd: [process.execPath, "test", "./test/capability-connection-management-cleanup.test.ts", "-t", "cleanup worker", "--timeout", "15000"],
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, ORCHESTRA_LOCAL_TESTS: "1", ORCHESTRA_MANAGEMENT_CLEANUP_WORKER: "1", NO_COLOR: "1" },
      stdout: "pipe", stderr: "pipe",
    })), (child) => Effect.promise(async () => {
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }))
    const result = yield* Effect.promise(() => Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]))
    if (result[0] !== 0) return yield* Effect.die(new Error(`Cleanup worker exited ${result[0]}:\n${result[1]}${result[2]}`))
    expect(result[0]).toBe(0)
    expect(result[1] + result[2]).toContain("1 pass")
    expect(result[1] + result[2]).toContain("cleanup worker")
  })).pipe(Effect.timeout("5 seconds")), 10000)
}

if (process.env.ORCHESTRA_MANAGEMENT_CLEANUP_WORKER === "1") {
  it.live("cleanup worker releases SQL writer and settles pending fibers on early assertion/failure and timeout", () => Effect.forEach(
    ["assertion", "failure", "timeout"] as const, (mode) => Effect.gen(function* () {
      const f = yield* CapabilityConnectionManagementFixture.fixture()
      const hold = yield* CapabilityConnectionManagementFixture.writerCheckpoint(f.database, () => Effect.void)
      const sentinel = new Error("EARLY_CASE_FAILURE")
      const exit = yield* hold.protect(Effect.gen(function* () {
        const pending = yield* hold.start(f.run(f.management.createTarget({ connection: f.parent,
          input: { environment: "cleanup", resource: {} } })).pipe(Effect.exit))
        yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(Effect.andThen(Effect.die("CLEANUP_WRITER_NOT_HELD"))))
        expect(hold.state.starts).toBe(1)
        expect(yield* Deferred.isDone(hold.release)).toBe(false)
        if (mode === "assertion") return yield* Effect.sync(() => expect(hold.state.starts).toBe(2))
        if (mode === "failure") return yield* Effect.fail(sentinel)
        return yield* Effect.never
      })).pipe(Effect.timeout(mode === "timeout" ? "100 millis" : "1 second"), Effect.exit)
      const cause = CapabilityConnectionManagementFixture.failed(exit)
      expect(cause.reasons).toHaveLength(1)
      const reason = cause.reasons[0]
      expect(reason._tag).toBe(mode === "assertion" ? "Die" : "Fail")
      if (reason._tag === "Die") expect(reason.defect).toBeInstanceOf(Error)
      if (mode === "failure") expect(cause.reasons).toEqual(Cause.fail(sentinel).reasons)
      if (mode === "timeout") {
        if (reason._tag !== "Fail") return yield* Effect.die("Missing timeout Failure")
        expect(reason.error).toBeInstanceOf(Cause.TimeoutError)
      }
      expect(yield* Deferred.isDone(hold.entered)).toBe(true)
      expect(yield* Deferred.isDone(hold.release)).toBe(true)
      if (!hold.state.writer || !hold.state.pending) return yield* Effect.die("Missing cleanup fibers")
      expect(Exit.isSuccess(yield* Fiber.await(hold.state.writer))).toBe(true)
      expect(hold.state.pending.pollUnsafe()).toBeDefined()
      // Positive control: a new real immediate writer must acquire the same gate and perform SQL.
      expect((yield* f.database.db.transaction((tx) => tx.select().from(CapabilityConnectionTable).all(),
        { behavior: "immediate" }).pipe(Effect.timeout("1 second"))).some((row) => row.id === f.parent.id)).toBe(true)
    })), 10000)
}
