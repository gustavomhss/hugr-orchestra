import { expect } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Fiber, Result, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { testEffect } from "@orchestra/core/test/lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const evidenceSchema = Schema.Struct({ pid: Schema.Number, profileID: Schema.String, recordID: Schema.String, segmentID: Schema.String, sha256: Schema.String, node: Schema.String })
const reopenedSchema = Schema.Struct({ kind: Schema.Literal("live-outbox-reopened"), pid: Schema.Number, profileID: Schema.String, recordID: Schema.String, segmentID: Schema.String, sha256: Schema.String, pendingCount: Schema.Number, rememberedCount: Schema.Number, node: Schema.String })

it.live("actual Node abrupt death after committed append preserves profile, IDs, digest and pending body", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const node = Bun.which("node")
  expect(node, "Hosted Node is required; Bun SQLite is not this persistence proof").not.toBeNull()
  if (!node) return yield* Effect.die("Hosted Node executable missing")
  const directory = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "live-outbox-crash-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const marker = join(directory, "committed.json")
  const proc = yield* AppProcess.Service
  const run = (mode: "commit" | "reopen") => Effect.scoped(Effect.gen(function* () {
    const child = yield* proc.spawn(ChildProcess.make(node, ["--experimental-strip-types", join(import.meta.dir, "live-outbox-crash.fixture.ts"), mode, directory, marker], {
      cwd: directory, env: {}, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    }))
    const output = yield* Stream.runCollect(child.stdout).pipe(Effect.forkChild)
    const errors = yield* Stream.runCollect(child.stderr).pipe(Effect.forkChild)
    return yield* Effect.gen(function* () {
      const evidence = mode === "commit" ? yield* Effect.raceFirst(
        Effect.gen(function* () {
          while (!(yield* Effect.promise(() => Bun.file(marker).exists()))) yield* Effect.sleep("10 millis")
          return Schema.decodeUnknownSync(evidenceSchema)(JSON.parse(yield* Effect.promise(() => readFile(marker, "utf8"))))
        }),
        child.exitCode.pipe(Effect.result, Effect.andThen(Effect.die("Node fixture exited before parent could validate COMMITTED and kill"))),
      ) : undefined
      if (evidence) {
        expect(evidence.pid).toBe(Number(child.pid))
        expect(yield* child.isRunning).toBe(true)
      }
      const killPerformed = mode === "commit" ? yield* child.kill({ killSignal: "SIGKILL" }).pipe(Effect.as(true)) : false
      // Exit numbers/signals are diagnostic only. Validated live PID + explicit parent kill + absent normal-exit witnesses prove this path.
      const exit = yield* child.exitCode.pipe(Effect.result)
      const stdout = Buffer.concat([...(yield* Fiber.join(output))]).toString("utf8")
      const stderr = Buffer.concat([...(yield* Fiber.join(errors))]).toString("utf8")
      expect(yield* child.isRunning).toBe(false)
      if (mode === "commit") {
        expect(killPerformed).toBe(true)
        expect(stdout).not.toContain("live-outbox-normal-exit")
        expect(yield* Effect.promise(() => Bun.file(`${marker}.normal-exit`).exists())).toBe(false)
      }
      return { exit, stdout, stderr, evidence, killPerformed }
    }).pipe(Effect.timeout("3 seconds"), Effect.ensuring(
      child.isRunning.pipe(Effect.flatMap((running) => running ? child.kill({ forceKillAfter: "1 second" }) : Effect.void),
        Effect.andThen(child.isRunning), Effect.flatMap((running) => running ? Effect.die("Owned Node fixture still running") : Effect.void),
        Effect.andThen(Fiber.await(output)), Effect.andThen(Fiber.await(errors)), Effect.timeout("2 seconds"), Effect.orDie),
    ))
  }))
  const crashed = yield* run("commit")
  const evidence = crashed.evidence
  if (!evidence) return yield* Effect.die("Missing validated COMMITTED evidence")
  expect(evidence.pid).toBeGreaterThan(0)
  expect(evidence.node).toMatch(/^v24\./)
  expect(crashed.killPerformed).toBe(true)
  const recovered = yield* run("reopen")
  expect(Result.isSuccess(recovered.exit) && recovered.exit.success === 0, recovered.stderr).toBe(true)
  const report = Schema.decodeUnknownSync(reopenedSchema)(JSON.parse(recovered.stdout.trim()))
  expect(report.pid).not.toBe(evidence.pid)
  expect(report).toMatchObject({ kind: "live-outbox-reopened", profileID: evidence.profileID, recordID: evidence.recordID, segmentID: evidence.segmentID, sha256: evidence.sha256, pendingCount: 1, rememberedCount: 1, node: evidence.node })
  console.log(JSON.stringify({ kind: "live-outbox-crash-proof", committed: true, parentKilled: crashed.killPerformed, exit: Result.isSuccess(crashed.exit) ? crashed.exit.success : "non-numeric", childDeadBeforeReopen: true, pendingCount: report.pendingCount, rememberedCount: report.rememberedCount, node: report.node }))
}), 8000)
