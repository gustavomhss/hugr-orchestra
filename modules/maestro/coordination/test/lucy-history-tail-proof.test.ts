import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { blobRoot, canonical, decoded, digest, reader, refused } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { history, native, request, retained, script } from "./fixture/lucy-history"

test("H06 full retained history remains bound to native settlement beyond the model-visible prefix", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prefix = "// HISTORY-TAIL-PROOF-PREFIX\n".repeat(4000)
    const originalTail = "// ORIGINAL_HISTORY_TAIL\n"
    const alteredTail = "// TAMPERED_HISTORY_TAIL\n"
    const large = prefix + originalTail
    expect(Buffer.byteLength(prefix)).toBeGreaterThan(32768)
    expect(Buffer.byteLength(originalTail)).toBe(Buffer.byteLength(alteredTail))
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), large))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "large historical tail proof")
    const revision = yield* root.git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), sourceText))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "restore current captured source")
    const input = request("history-tail-substitution", "diligence")
    const provider = script([{ id: "large", name: "review_history",
      input: { op: "show", path: sourcePath, rev: revision } }])
    yield* root.open((host) => Effect.gen(function* () {
      const output = yield* host.invoke(input)
      const report = decoded(output)
      const observed = yield* history(host, report, "large")
      expect(observed.value.truncated).toBe(true)
      expect(observed.value.complete).toBe(false)
      expect(observed.value.notExamined.length).toBeGreaterThan(0)
      expect(observed.value.text.length).toBeGreaterThan(0)
      expect(large.startsWith(observed.value.text)).toBe(true)
      expect(observed.event.text).not.toContain(originalTail.trim())
      expect(observed.event.text).not.toContain(alteredTail.trim())
      const evidence = yield* retained(host, report)
      expect(evidence.proofs).toHaveLength(1)
      const original = evidence.proofs[0]
      expect(original.proof.result.text).toBe(large)
      expect(original.proof.result.complete).toBe(true)
      expect(original.proof.result.truncated).toBe(false)
      expect(original.artifact.complete).toBe(true)
      expect(original.artifact.bytes).toBeGreaterThan(32768)
      expect(original.proof.result.selection).toEqual({ endCommit: revision })
      const unchangedNative = canonical(yield* native(host, report.sessionID))
      const requests = root.requests.length
      const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, report.sessionID)).get().pipe(Effect.orDie)
      if (!row?.metadata?.lucyEngagementV1) throw new Error("durable request state is absent")
      const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(row.metadata.lucyEngagementV1)
      const manifestObject = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        JSON.parse(evidence.bytes.toString("utf8")))

      // Only unseen safe text changes. Identity, input, source, selection, flags and native events stay fixed.
      const altered = prefix + alteredTail
      expect(altered.slice(0, observed.value.text.length)).toBe(observed.value.text)
      expect(Buffer.byteLength(altered)).toBe(Buffer.byteLength(large))
      expect(large.indexOf(originalTail)).toBeGreaterThan(observed.value.text.length)
      const proof = { ...original.proof, result: { ...original.proof.result, text: altered } }
      const bytes = Buffer.from(canonical(proof))
      expect(bytes.byteLength).toBe(original.bytes.byteLength)
      expect(digest(bytes)).not.toBe(original.artifact.sha256)
      const { artifactID, ...oldDescriptor } = original.artifact
      expect(artifactID).toBe(digest(canonical(oldDescriptor)))
      const descriptor = { ...oldDescriptor, sha256: digest(bytes), bytes: bytes.byteLength }
      const artifact = { artifactID: digest(canonical(descriptor)), ...descriptor }
      const changedManifest = { ...manifestObject,
        artifacts: evidence.value.artifacts.map((item) => item.artifactID === artifactID ? artifact : item)
          .sort((left, right) => left.artifactID < right.artifactID ? -1 : left.artifactID > right.artifactID ? 1 : 0),
        history: evidence.value.history.map((reference) => reference.artifactID === artifactID
          ? { ...reference, artifactID: artifact.artifactID } : reference),
      }
      const receiptBytes = Buffer.from(canonical(changedManifest))
      const receiptID = digest(receiptBytes)
      expect(receiptID).not.toBe(evidence.index.receiptID)
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
        expect(canonical(yield* native(host, report.sessionID))).toBe(unchangedNative)
        refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-corrupt")
        refused(yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: artifact.artifactID }),
          "engagement-evidence-corrupt")
        refused(yield* host.invoke(input), "engagement-evidence-corrupt")
        expect(canonical(yield* native(host, report.sessionID))).toBe(unchangedNative)
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
      const restored = yield* retained(host, report)
      expect(restored.bytes).toEqual(evidence.bytes)
      expect(restored.proofs[0].bytes).toEqual(original.bytes)
      expect(canonical(yield* native(host, report.sessionID))).toBe(unchangedNative)
      expect(root.requests.length).toBe(requests)
    }), variantAdapter(provider.stream))
  })))
}, 180_000)
