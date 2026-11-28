import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Board } from "@orchestra/schema/board"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { Config } from "@orchestra/core/config"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Tool } from "@orchestra/core/tool/tool"
import { run, sourcePath } from "./fixture/lucy-engagement"
import { blobRoot, blobs, cache, codeStream, decoded, digest, manifest, nativeCode,
  reader, receipt, refused, request } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { StateV1 } from "./fixture/lucy-variant-schema"

test("completed evidence survives deletion of review temporaries, live HEAD changes and real SQLite graph reopening", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const input = request("reopen-evidence")
    const provider = codeStream()
    const original = yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const output = yield* host.invoke(input)
      const report = decoded(output)
      expect((yield* nativeCode(host, report.sessionID)).every((call) => call.status === "completed")).toBe(true)
      const evidence = yield* receipt(host, report)
      const temporary = cache(host, input)
      expect((yield* Effect.promise(() => fs.readdir(temporary))).length).toBeGreaterThan(0)
      return { output, report, evidence, temporary, requests: root.requests.length }
    }), variantAdapter(provider.stream))
    yield* Effect.promise(async () => {
      await fs.rm(original.temporary, { recursive: true, force: true })
      await fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "LATER-LIVE-HEAD"\n')
    })
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "move-live-source-after-evidence-publication")
    expect(yield* root.git("rev-parse", "HEAD")).not.toBe(original.report.source?.commit)
    let configuration = 0
    const gitCalls: string[][] = []
    yield* root.open((host) => Effect.gen(function* () {
      const nativeReads = yield* Effect.scoped(Effect.gen(function* () {
        const config = Context.get(host.context, Config.Service)
        const control = (before: Effect.Effect<unknown>) => Tool.make({
          description: "Calibrate native output settings independently of engagement replay.",
          input: Schema.Struct({}), output: Schema.String,
          execute: () => before.pipe(Effect.as(original.output.text)),
        })
        yield* host.registry.register({ evidence_settlement_control: control(Effect.void),
          evidence_extra_configuration_control: control(config.entries()) })
        const before = configuration
        const settled = yield* host.call("evidence_settlement_control", {})
        expect(settled.text).toBe(original.output.text)
        const reads = configuration - before
        expect(reads).toBeGreaterThan(0)
        const second = configuration
        expect((yield* host.call("evidence_extra_configuration_control", {})).text).toBe(original.output.text)
        expect(configuration - second).toBe(reads + 1)
        return reads
      }))
      yield* host.db.insert(BoardProjectTable).values({
        id: Board.ProjectID.create(), key: "EVIDENCE", name: "Evidence", goal: "Changed settings after publication.",
        status: "active", github_state: "off", next_issue_number: 1, next_epic_number: 1,
        repo_project_id: host.parent.projectID, review_tier: "quick", review_accepted_unavailable: ["no-build"],
      }).run().pipe(Effect.orDie)
      const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const before = gitCalls.length
      const reads = configuration
      const output = yield* host.invoke(input)
      expect(output.text).toBe(original.output.text)
      expect(configuration - reads).toBe(nativeReads)
      const evidence = yield* receipt(host, decoded(output))
      expect(evidence.index).toEqual(original.evidence.index)
      expect(evidence.bytes).toEqual(original.evidence.bytes)
      expect([...evidence.bodies]).toEqual([...original.evidence.bodies])
      expect(root.requests.length).toBe(original.requests)
      expect(gitCalls.length).toBe(before)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
      expect(yield* Effect.promise(() => fs.stat(original.temporary).then(() => true, () => false))).toBe(false)
      expect(decoded(output).budget).toEqual(original.report.budget)
    }), { onGit: (args) => { gitCalls.push([...args]) }, onConfig: () => { configuration++ } })
  })))
}, 150_000)

test("missing or corrupt required bodies and receipt fail reads and exact retry without replacement or rerun", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = codeStream()
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const input = request("corrupt-required-evidence")
      const output = yield* host.invoke(input)
      const report = decoded(output)
      const evidence = yield* receipt(host, report)
      const artifact = evidence.value.artifacts.find((artifact) => artifact.kind === "code-result")
      if (!artifact) return yield* Effect.die("required CODE body missing from positive receipt")
      const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.die("durable lead missing")
      const calls = root.requests.length
      for (const target of [artifact, evidence.index.manifest]) {
        const filename = path.join(blobRoot(root, host), target.sha256)
        const original = yield* Effect.promise(() => fs.readFile(filename))
        expect(digest(original)).toBe(target.sha256)
        for (const damage of ["delete", "corrupt"] as const) {
          yield* Effect.gen(function* () {
            yield* Effect.promise(async () => {
              await fs.chmod(filename, 0o600)
              if (damage === "delete") return fs.unlink(filename)
              const changed = Buffer.from(original)
              changed[0] = changed[0] ^ 1
              await fs.writeFile(filename, changed)
              await fs.chmod(filename, 0o400)
            })
            refused(yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: target.artifactID }), "engagement-evidence-corrupt")
            refused(yield* host.invoke(input), "engagement-evidence-corrupt")
            expect(root.requests.length).toBe(calls)
            expect((yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie))?.metadata).toEqual(row.metadata)
          }).pipe(Effect.ensuring(Effect.promise(async () => {
            await fs.chmod(filename, 0o600).catch((error: unknown) => {
              if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return
              throw error
            })
            await fs.writeFile(filename, original, { mode: 0o600 })
            await fs.chmod(filename, 0o400)
          })))
          expect((yield* host.invoke(input)).text).toBe(output.text)
          expect((yield* manifest(host, report.reportID)).value).toEqual(evidence.index)
        }
      }
      expect(root.requests.length).toBe(calls)
    }), variantAdapter(provider.stream))
  }))
}, 150_000)

test("a constructed strict legacy v1 record replays its bytes while v3 cannot downgrade a missing required receipt", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = codeStream()
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const input = request("receipt-migration")
      const output = yield* host.invoke(input)
      const report = decoded(output)
      const original = yield* receipt(host, report)
      const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie)
      const stored = row?.metadata?.lucyEngagementV1
      if (!row || !stored || typeof stored !== "object" || Array.isArray(stored)) return yield* Effect.die("owned durable record missing")
      const record = Object.fromEntries(Object.entries(stored))
      expect(record.schema).toBe("review-engagement-state-v3")
      expect(record.evidence).toEqual({ policy: "required-completed-v1", receiptID: original.index.receiptID, bytes: original.index.manifest.bytes })
      const metadata = { ...row.metadata, unrelatedEvidenceFixture: { keep: true } }
      const calls = root.requests.length
      const { evidence, variants, ...legacy } = record
      expect(evidence).toBeDefined()
      expect(variants).toBeDefined()
      const legacyState = Schema.decodeUnknownSync(StateV1)({ ...legacy, schema: "review-engagement-state-v1" },
        { onExcessProperty: "error" })
      yield* Effect.gen(function* () {
        yield* host.db.update(SessionTable).set({ metadata: { ...metadata,
          lucyEngagementV1: legacyState } }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
        expect((yield* host.invoke(input)).text).toBe(output.text)
        const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
        refused(unavailable, "engagement-evidence-unavailable")
        expect(unavailable.text).toContain("legacy-record")
        yield* host.db.update(SessionTable).set({ metadata: { ...metadata,
          lucyEngagementV1: { ...record, evidence: { policy: "required-completed-v1" } } } }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
        refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-missing")
        refused(yield* host.invoke(input), "engagement-evidence-missing")
        expect((yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie))?.metadata?.unrelatedEvidenceFixture).toEqual({ keep: true })
        expect(root.requests.length).toBe(calls)
      }).pipe(Effect.ensuring(host.db.update(SessionTable).set({ metadata: { ...metadata, lucyEngagementV1: record } })
        .where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)))
      expect((yield* receipt(host, decoded(yield* host.invoke(input)))).index).toEqual(original.index)
    }), variantAdapter(provider.stream))
  }))
}, 150_000)

test("deleting an actually captured required CODE body before the final card prevents completed publication", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const provider = codeStream({ beforeFinish: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))) })
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const input = request("delete-before-publication")
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
        expect(provider.acknowledged.size).toBe(1)
        const lead = [...provider.acknowledged][0]
        expect((yield* nativeCode(host, lead)).map((call) => call.status)).toEqual(["completed", "completed", "completed"])
        const captured = yield* blobs(blobRoot(root, host))
        const body = captured.find((blob) => blob.bytes.toString("utf8").includes('"op":"code_search"'))
        expect(body, "required CODE bytes must be durable before the completed card is accepted").toBeDefined()
        if (!body) return yield* Effect.die("captured body unavailable")
        yield* Effect.promise(async () => {
          const filename = path.join(blobRoot(root, host), body.sha256)
          await fs.chmod(filename, 0o600)
          await fs.unlink(filename)
        })
        yield* Deferred.succeed(release, undefined)
        refused(yield* Fiber.join(pending), "engagement-evidence-corrupt")
        const stopped = decoded(yield* host.invoke(input))
        expect(stopped.status).toBe("failed")
        expect(stopped.report).toBeUndefined()
        expect(stopped.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "failure" })
        const unavailable = yield* host.call(reader, { op: "manifest", reportID: stopped.reportID })
        refused(unavailable, "engagement-evidence-unavailable")
        expect(unavailable.text).toContain("terminal-status")
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }), variantAdapter(provider.stream))
  })))
}, 150_000)

test("original expiry after real CODE capture cancels a later provider, survives waiter cancellation, and never publishes a receipt", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const input = { ...request("expire-evidence"), timeBoxMinutes: 1 }
    const provider = codeStream({ beforeFinish: () => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
    ) })
    const original = yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      const lead = [...provider.acknowledged][0]
      const actual = yield* nativeCode(host, lead)
      expect(actual).toHaveLength(3)
      expect(actual.every((call) => call.status === "completed")).toBe(true)
      const waiter = yield* host.invoke(input).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Fiber.interrupt(waiter)
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("59 seconds")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(pending)
      const report = decoded(output)
      expect(report.status).toBe("expired")
      expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
      expect(report.source?.commit).toBe(root.head)
      expect(report.report).toBeUndefined()
      expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "time-box" })
      expect((yield* host.execution.active).size).toBe(0)
      return { output, report, requests: root.requests.length }
    }), variantAdapter(provider.stream))
    yield* TestClock.adjust("120 seconds")
    yield* root.open((host) => Effect.gen(function* () {
      const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      expect((yield* host.invoke(input)).text).toBe(original.output.text)
      const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.report.reportID })
      refused(unavailable, "engagement-evidence-unavailable")
      expect(unavailable.text).toContain("terminal-status")
      expect(root.requests.length).toBe(original.requests)
      expect((yield* host.execution.active).size).toBe(0)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
    }))
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("owner interruption after actual CODE capture remains interrupted and leaves only immutable stopped replay", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const input = request("cancel-evidence")
    const provider = codeStream({ beforeFinish: () => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
    ) })
    const original = yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      const actual = yield* nativeCode(host, [...provider.acknowledged][0])
      expect(actual).toHaveLength(3)
      expect(actual.every((call) => call.status === "completed")).toBe(true)
      yield* Fiber.interrupt(pending)
      expect(yield* Deferred.isDone(released)).toBe(true)
      expect((yield* host.execution.active).size).toBe(0)
      const exit = pending.pollUnsafe()
      expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      const output = yield* host.invoke(input)
      const report = decoded(output)
      expect(report.status).toBe("cancelled")
      expect(report.report).toBeUndefined()
      expect(report.source?.commit).toBe(root.head)
      expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "cancelled" })
      return { output, report, requests: root.requests.length }
    }), variantAdapter(provider.stream))
    yield* TestClock.adjust("600 seconds")
    yield* root.open((host) => Effect.gen(function* () {
      expect((yield* host.invoke(input)).text).toBe(original.output.text)
      const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.report.reportID })
      refused(unavailable, "engagement-evidence-unavailable")
      expect(unavailable.text).toContain("terminal-status")
      expect(root.requests.length).toBe(original.requests)
      expect((yield* host.execution.active).size).toBe(0)
    }))
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)
