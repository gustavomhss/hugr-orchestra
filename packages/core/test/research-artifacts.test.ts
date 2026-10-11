import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { Capability } from "@orchestra/schema/capability"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { callFrame, researchFixture } from "./research-binding.test"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
describe("research immutable artifacts", () => {
  it.live("stable publication intent preserves original metadata; pre-ledger variant retry conflicts", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const artifacts = yield* ResearchArtifacts.Service
      const records = yield* ResearchRecords.Service
      const input = { origin: { kind: "url", uri: "https://fixture.invalid/historical", revision: "original" },
        representation: "text", mediaType: "text/plain", content: "original body", complete: true } satisfies ResearchRecords.CaptureInput
      const operation = ResearchLedger.operation(fixture.context, "capture:text")
      const inputHash = ResearchLedger.digest(ResearchLedger.canonical({ ...input, content: ResearchLedger.digest(input.content) }))
      const receipt: Research.SourceReceipt = {
        binding: fixture.binding, origin: input.origin, capturedAt: 5, mediaType: input.mediaType, bytes: Buffer.byteLength(input.content), complete: true,
        ref: { artifact: { id: Capability.ArtifactID.make(`cart_${ResearchLedger.digest(ResearchLedger.canonical([fixture.binding, operation])).slice(0, 26)}`), revision: 1 },
          digest: ResearchLedger.digest(input.content), representation: "text" },
      }
      yield* artifacts.prepare(fixture.binding, { id: ResearchLedger.eventID(fixture.binding, `source:${operation}`), type: "research.source.admitted",
        data: { binding: fixture.binding, sessionID: fixture.binding.executionSessionID, operation, inputHash, receipt } })
      yield* artifacts.put(fixture.binding, { content: input.content, representation: input.representation, artifact: receipt.ref.artifact }, operation)
      expect((yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        ...input, origin: { ...input.origin, revision: "forged-after-crash" },
      })).pipe(Effect.flip)).code).toBe("conflict")
      const recovered = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, input))
      expect(recovered).toEqual(receipt)
      expect((yield* artifacts.read(fixture.binding, recovered.ref.artifact)).text).toBe(input.content)
    }),
  ))

  it.live("file-before-event recovery uses stable operation; a file/ref alone grants no read", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const artifacts = yield* ResearchArtifacts.Service
      const records = yield* ResearchRecords.Service
      const operation = ResearchLedger.operation(fixture.context, "capture:text")
      const first = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text" }, operation)
      expect((yield* artifacts.read(fixture.binding, first.ref).pipe(Effect.flip)).code).toBe("not_found")
      const replay = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text", artifact: first.ref }, operation)
      expect(replay).toEqual(first)
      const changed = yield* artifacts.put(fixture.binding, { content: "new live bytes", representation: "text", artifact: first.ref }, operation).pipe(Effect.flip)
      expect(changed.code).toBe("conflict")
      const wrongRef = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text", artifact: { id: Capability.ArtifactID.create(), revision: 1 } }, operation).pipe(Effect.flip)
      expect(wrongRef.code).toBe("conflict")
      const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "url", uri: "https://fixture.invalid/versioned" }, representation: "text", mediaType: "text/plain", content: "historical bytes", complete: true,
      }))
      expect(receipt.ref.artifact).toEqual(first.ref)
      const page = yield* artifacts.read(fixture.binding, receipt.ref.artifact)
      expect(page.text).toBe("historical bytes")
      expect(page.receipt).toEqual(receipt)
      expect(page.complete).toBe(true)
      expect((yield* artifacts.read({ ...fixture.binding, taskId: "guessed-task" }, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("binding_mismatch")
    }),
  ))

  it.live("UTF-8 pages remain <=16KiB and exact; cursor cannot select another admitted artifact", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const text = "a" + "😀".repeat(10000) + " decisive qualifier"
      const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "fixture.txt", revision: "dirty-observed" }, representation: "text", mediaType: "text/plain", content: text, complete: false,
      }))
      const first = yield* artifacts.read(fixture.binding, receipt.ref.artifact)
      expect(Buffer.byteLength(first.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
      expect(first.cursor).toBeDefined()
      if (!first.cursor) throw new Error("Expected bounded continuation")
      const second = yield* artifacts.read(fixture.binding, receipt.ref.artifact, first.cursor)
      expect(Buffer.byteLength(second.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
      if (!second.cursor) throw new Error("Expected second continuation")
      const third = yield* artifacts.read(fixture.binding, receipt.ref.artifact, second.cursor)
      expect(Buffer.byteLength(third.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
      expect(first.text + second.text + third.text).toBe(text)
      expect(third.complete).toBe(false)
      expect(third.cursor).toBeUndefined()
      const context = yield* fixture.call()
      const other = yield* callFrame(fixture.binding, context, records.capture(fixture.binding, context, {
        origin: { kind: "file", uri: "other.txt" }, representation: "text", mediaType: "text/plain", content: "other", complete: true,
      }))
      expect((yield* artifacts.read(fixture.binding, other.ref.artifact, first.cursor).pipe(Effect.flip)).code).toBe("reference_invalid")
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact, "not-json").pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))

  it.live("old captures retain task lifetime; corrupt/missing bytes and symlinked roots are unavailable", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "retained.txt" }, representation: "text", mediaType: "text/plain", content: "exact capture", complete: true,
      }))
      const root = path.join(fixture.root, "research", ResearchLedger.digest(fixture.binding.projectID), ResearchLedger.digest(fixture.binding.taskId))
      const filename = path.join(root, `${receipt.ref.artifact.id}-1.body`)
      yield* Effect.promise(() => fs.utimes(filename, new Date(0), new Date(0)))
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact)).text).toBe("exact capture")
      yield* Effect.promise(() => fs.writeFile(filename, "same-length!!"))
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
      yield* Effect.promise(() => fs.unlink(filename))
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
      yield* Effect.promise(() => fs.rename(root, root + "-owned"))
      yield* Effect.promise(() => fs.symlink(root + "-owned", root, process.platform === "win32" ? "junction" : "dir"))
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
    }),
  ))

  it.live("unsupported binary is retained without replacement decoding; oversized bytes fail before authorization/publication", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "url", uri: "https://fixture.invalid/binary" }, representation: "received", mediaType: "application/octet-stream", content: Uint8Array.of(255, 254), complete: true,
      }))
      expect(receipt.bytes).toBe(2)
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("unsupported")
      expect((yield* artifacts.put({ ...fixture.binding, taskId: "unbound" }, {
        content: new Uint8Array(Research.Limits.sourceBytes + 1), representation: "received",
      }, "over-cap").pipe(Effect.flip)).code).toBe("over_cap")
    }),
  ))

  it.live("explicit host task removal deletes owned artifacts and makes retained receipts unavailable", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "remove.txt" }, representation: "text", mediaType: "text/plain", content: "owned bytes", complete: true,
      }))
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact)).text).toBe("owned bytes")
      expect((yield* artifacts.remove({ ...fixture.binding, taskId: "foreign" }).pipe(Effect.flip)).code).toBe("binding_mismatch")
      yield* artifacts.remove(fixture.binding)
      yield* artifacts.remove(fixture.binding)
      expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
    }),
  ))
})
