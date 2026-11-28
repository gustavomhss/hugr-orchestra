import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema, Tracer } from "effect"
import { eq } from "drizzle-orm"
import { SessionTable } from "@orchestra/core/session/sql"
import { ReviewHistory } from "@orchestra/core/review-toolkit/history"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath } from "./fixture/lucy-engagement"
import { blobRoot, cache, canonical, decoded, digest, reader, refused } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, history, request, retained, script } from "./fixture/lucy-history"

test("H06 retained history replays byte-for-byte after graph close, live mutation and deletion of its original Git blob", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const input = request("history-durable-replay", "diligence")
    const ancestorBlob = yield* root.git("rev-parse", root.base + ":" + sourcePath)
    const provider = script([code, { id: "ancestor", name: "review_history",
      input: { op: "show", path: sourcePath, rev: root.base } }])
    const original = yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const output = yield* host.invoke(input)
      const report = decoded(output)
      yield* completed(host, report.sessionID, code.id)
      expect((yield* history(host, report, "ancestor")).value.text).toContain("ENGAGEMENT-BASE")
      const evidence = yield* retained(host, report)
      expect(evidence.proofs).toHaveLength(1)
      return { output, report, evidence, temporary: cache(host, input), requests: root.requests.length }
    }), variantAdapter(provider.stream))
    yield* Effect.promise(async () => {
      await fs.rm(original.temporary, { recursive: true, force: true })
      await fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "AFTER-HISTORY-PUBLICATION"\n')
    })
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "history replay must never read this commit")
    const object = path.join(root.directory, ".git", "objects", ancestorBlob.slice(0, 2), ancestorBlob.slice(2))
    expect((yield* Effect.promise(() => fs.stat(object))).isFile()).toBe(true)
    yield* Effect.promise(() => fs.unlink(object))
    const gitCalls: string[][] = []
    const processes = { started: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "ResearchProcess.run") processes.started++
      return new Tracer.NativeSpan(options)
    } })
    yield* root.open((host) => Effect.gen(function* () {
      // The public legacy history API runs a real Git metadata read through ResearchProcess.run.
      // It proves the observer works without importing an unexported internal process module.
      const controls = processes.started
      const control = yield* ReviewHistory.run({ op: "log", rev: root.head },
        { repository: root.directory, executionSessionID: original.report.sessionID })
      expect(control.argv[0]).toBe("git")
      expect(control.raw).toContain(root.head)
      expect(control.truncated).toBe(false)
      expect(processes.started).toBe(controls + 1)
      const before = gitCalls.length
      const beforeProcesses = processes.started
      const output = yield* host.invoke(input)
      expect(output.text).toBe(original.output.text)
      const report = decoded(output)
      expect(report.source).toEqual(original.report.source)
      expect(report.budget).toEqual(original.report.budget)
      const evidence = yield* retained(host, report)
      expect(evidence.index).toEqual(original.evidence.index)
      expect(evidence.bytes).toEqual(original.evidence.bytes)
      expect(evidence.proofs.map((item) => item.bytes)).toEqual(original.evidence.proofs.map((item) => item.bytes))
      expect(root.requests.length).toBe(original.requests)
      expect(gitCalls.length).toBe(before)
      expect(processes.started).toBe(beforeProcesses)
      expect(yield* Effect.promise(() => fs.stat(original.temporary).then(() => true, () => false))).toBe(false)
      expect(yield* Effect.promise(() => fs.stat(object).then(() => true, () => false))).toBe(false)
    }), { onGit: (args) => { gitCalls.push([...args]) },
      stream: () => { throw new Error("completed replay tried to execute a provider") } }).pipe(Effect.withTracer(tracer))
  })))
}, 150_000)

test("H06 self-consistent rehashed history substitutions fail source/native identity validation", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const input = request("history-rehashed-substitution", "diligence")
    const provider = script([code, { id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const output = yield* host.invoke(input)
      const report = decoded(output)
      yield* completed(host, report.sessionID, code.id)
      yield* history(host, report, "show")
      const evidence = yield* retained(host, report)
      const original = evidence.proofs[0]
      const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie)
      if (!row?.metadata?.lucyEngagementV1) throw new Error("durable request state is absent")
      const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(row.metadata.lucyEngagementV1)
      const manifestObject = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        JSON.parse(evidence.bytes.toString("utf8")))
      const changes = [
        { name: "session", proof: { ...original.proof, sessionID: "ses_not_the_owned_lead" } },
        { name: "source", proof: { ...original.proof, sourceSha256: "0".repeat(64),
          result: { ...original.proof.result, sourceSha256: "0".repeat(64) } } },
        { name: "path", proof: { ...original.proof, input: { op: "show", path: "outside/private.ts" },
          result: { ...original.proof.result, path: "outside/private.ts" } } },
        { name: "selection", proof: { ...original.proof, input: { op: "show", path: sourcePath, rev: root.base },
          result: { ...original.proof.result, selection: { endCommit: root.base } } } },
        { name: "settlement", proof: { ...original.proof,
          nativeSettlement: { status: "completed" as const, messageID: "msg_not_the_native_settlement" } } },
      ]
      const requests = root.requests.length
      for (const change of changes) {
        const changedID = digest(canonical({ schema: "review-engagement-history-operation-v1",
          inputHash: report.inputHash, sourceSha256: change.proof.sourceSha256, sessionID: change.proof.sessionID,
          assistantMessageID: change.proof.assistantMessageID, toolCallID: change.proof.toolCallID, name: "review_history" }))
        const proof = { ...change.proof, historyID: changedID, result: { ...change.proof.result, historyID: changedID } }
        const bytes = Buffer.from(canonical(proof))
        const { artifactID, ...oldDescriptor } = original.artifact
        expect(artifactID).toBe(digest(canonical(oldDescriptor)))
        const descriptor = { ...oldDescriptor, sha256: digest(bytes), bytes: bytes.byteLength,
          ...(oldDescriptor.uri === undefined ? {} : { uri: oldDescriptor.uri.replace(original.proof.historyID, changedID) }) }
        const artifact = { artifactID: digest(canonical(descriptor)), ...descriptor }
        const changedManifest = { ...manifestObject,
          artifacts: evidence.value.artifacts.map((item) => item.artifactID === original.artifact.artifactID ? artifact : item)
            .sort((left, right) => left.artifactID < right.artifactID ? -1 : left.artifactID > right.artifactID ? 1 : 0),
          history: [{ historyID: changedID, artifactID: artifact.artifactID }],
        }
        const receiptBytes = Buffer.from(canonical(changedManifest))
        const receiptID = digest(receiptBytes)
        const directory = blobRoot(root, host)
        const proofFile = path.join(directory, descriptor.sha256)
        const receiptFile = path.join(directory, receiptID)
        yield* Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.writeFile(proofFile, bytes, { mode: 0o400 })
            await fs.writeFile(receiptFile, receiptBytes, { mode: 0o400 })
          })
          yield* host.db.update(SessionTable).set({ metadata: { ...row.metadata,
            lucyEngagementV1: { ...record, evidence: { policy: "required-completed-v1", receiptID, bytes: receiptBytes.byteLength } },
          } }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
          const read = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
          expect(read.type, change.name + ": " + read.text).toBe("error")
          expect(read.text).toContain("engagement-evidence-corrupt")
          refused(yield* host.invoke(input), "engagement-evidence-corrupt")
          expect(root.requests.length).toBe(requests)
        }).pipe(Effect.ensuring(Effect.gen(function* () {
          yield* host.db.update(SessionTable).set({ metadata: row.metadata })
            .where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
          yield* Effect.promise(async () => {
            for (const filename of [proofFile, receiptFile]) {
              await fs.chmod(filename, 0o600)
              await fs.unlink(filename)
            }
          })
        })))
        expect((yield* host.invoke(input)).text).toBe(output.text)
        expect((yield* retained(host, report)).bytes).toEqual(evidence.bytes)
      }
    }), variantAdapter(provider.stream))
  }))
}, 180_000)


test("H06 missing or altered history body rejects public reads and exact replay without replacing evidence", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const input = request("history-corrupt-evidence", "diligence")
    const provider = script([code, { id: "show", name: "review_history", input: { op: "show", path: sourcePath } }])
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const output = yield* host.invoke(input)
      const report = decoded(output)
      yield* completed(host, report.sessionID, code.id)
      yield* history(host, report, "show")
      const evidence = yield* retained(host, report)
      const artifact = evidence.proofs[0].artifact
      const filename = path.join(blobRoot(root, host), artifact.sha256)
      const original = yield* Effect.promise(() => fs.readFile(filename))
      expect(digest(original)).toBe(artifact.sha256)
      const calls = root.requests.length
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
          refused(yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: artifact.artifactID }),
            "engagement-evidence-corrupt")
          refused(yield* host.invoke(input), "engagement-evidence-corrupt")
          expect(root.requests.length).toBe(calls)
        }).pipe(Effect.ensuring(Effect.promise(async () => {
          await fs.chmod(filename, 0o600).catch((error: unknown) => {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return
            throw error
          })
          await fs.writeFile(filename, original, { mode: 0o600 })
          await fs.chmod(filename, 0o400)
        })))
        expect((yield* host.invoke(input)).text).toBe(output.text)
        expect((yield* retained(host, report)).bytes).toEqual(evidence.bytes)
      }
    }), variantAdapter(provider.stream))
  }))
}, 150_000)

