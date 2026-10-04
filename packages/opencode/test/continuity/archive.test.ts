import { describe, expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { systemError } from "effect/PlatformError"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Archive } from "@/continuity/archive"
import { chunks, transcript } from "@/continuity/transcript"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { testEffect } from "../lib/effect"
import { failure, fixture, instrument, payload, tool, user } from "./archive-fixture"

const it = testEffect(LayerNode.compile(FSUtil.node))

describe("hashed session archive on real filesystem", () => {
  it.live("publishes input chunks, restarts cold, remains idempotent and retains old references", () => Effect.gen(function* () {
    const f = yield* fixture()
    expect(yield* f.archive.list(f.sessionID)).toEqual([])
    const messages = [user(f.sessionID), tool(f.sessionID, "🧠\r\n".repeat(17000))]
    const values = yield* f.archive.publish({ sessionID: f.sessionID, messages })
    expect(values).toEqual(chunks(f.sessionID, messages))
    expect(values.length).toBeGreaterThan(2)
    expect(values.filter((value) => value.first === messages[1].info.id).map(payload).join("")).toBe(transcript([messages[1]]))
    const before = yield* f.fs.readFileString(f.index)
    const stat = yield* f.fs.stat(f.file(values[0].id))
    expect(yield* f.archive.publish({ sessionID: f.sessionID, messages })).toEqual(values)
    expect(yield* f.fs.readFileString(f.index)).toBe(before)
    expect((yield* f.fs.stat(f.file(values[0].id))).ino).toEqual(stat.ino)
    const cold = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)))
    expect(cold).not.toBe(f.archive)
    for (const value of values) expect(yield* cold.read({ sessionID: f.sessionID, id: value.id })).toEqual(value)
    const added = yield* cold.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "later")] })
    expect(added).toHaveLength(1)
    expect(yield* cold.publish({ sessionID: f.sessionID, messages: [] })).toEqual([])
    const refs = yield* cold.list(f.sessionID)
    expect(refs.map((ref) => ref.id)).toEqual([...values, ...added].map((value) => value.id))
    expect(yield* cold.read({ sessionID: f.sessionID, id: values[0].id })).toEqual(values[0])
    expect((yield* f.fs.readDirectory(f.dir)).sort()).toEqual([...refs.map((ref) => `${ref.id}.md`), "index.json"].sort())
  }))

  it.live("concurrent same-session publishers across service instances keep every reference", () => Effect.gen(function* () {
    const f = yield* fixture()
    const second = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)))
    expect(second).not.toBe(f.archive)
    const messages = Array.from({ length: 12 }, (_, index) => user(f.sessionID, `concurrent${index}`))
    const result = yield* Effect.all(messages.map((message, index) => (index % 2 ? f.archive : second).publish({
      sessionID: f.sessionID, messages: [message],
    })), { concurrency: "unbounded" })
    const expected = result.flat().map((value) => value.id).sort()
    expect(expected).toHaveLength(messages.length)
    expect((yield* second.list(f.sessionID)).map((ref) => ref.id).sort()).toEqual(expected)
    yield* Effect.all([f.archive, second].map((service) => service.publish({ sessionID: f.sessionID, messages })), { concurrency: "unbounded" })
    expect((yield* second.list(f.sessionID)).map((ref) => ref.id).sort()).toEqual(expected)
  }))

  it.live("unknown, foreign and traversal references never open model paths; forged ownership fails", () => Effect.gen(function* () {
    const f = yield* fixture()
    const foreign = yield* fixture()
    const [own] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const [other] = yield* foreign.archive.publish({ sessionID: foreign.sessionID, messages: [user(foreign.sessionID)] })
    expect(own.id).not.toBe(other.id)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: own.id })).toEqual(own)
    for (const id of [other.id, "0".repeat(64), "../../index.json", f.file(own.id), own.id.toUpperCase(), `${own.id}.md`])
      expect(yield* f.archive.read({ sessionID: f.sessionID, id })).toBeUndefined()
    yield* f.fs.writeFileString(f.file(other.id), other.markdown)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: other.id })).toBeUndefined()
    const { markdown, ...ref } = other
    yield* f.fs.writeFileString(f.index, JSON.stringify({ version: 1, sessionID: f.sessionID, references: [ref] }))
    yield* failure(f.archive.read({ sessionID: f.sessionID, id: other.id }), "archive-corrupt-content")
  }))

  it.live("validates every message and nested attachment before publication", () => Effect.gen(function* () {
    const f = yield* fixture()
    const valid = user(f.sessionID)
    const bad = user(SessionID.make("ses_foreign"), "bad")
    yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [valid, bad] }), "archive-foreign-session")
    expect(yield* f.fs.exists(f.dir)).toBe(false)
    const message = tool(f.sessionID)
    const part = message.parts[0]
    if (part.type !== "tool" || part.state.status !== "completed") throw new Error("expected tool")
    part.state.attachments = [{ type: "file", id: PartID.make("prt_attachment"), sessionID: f.sessionID,
      messageID: MessageID.make("msg_foreign"), mime: "image/png", url: "https://example.test/picture.png" }]
    yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [valid, message] }), "archive-foreign-part")
    expect(yield* f.fs.exists(f.dir)).toBe(false)
    yield* failure(f.archive.publish({ sessionID: "ses_../../escape" as SessionID, messages: [] }), "archive-invalid-identity")
    yield* failure(f.archive.list("../../escape" as SessionID), "archive-invalid-identity")
    valid.parts[0].id = "prt_../../escape" as PartID
    yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [valid] }), "archive-invalid-identity")
    expect(yield* f.fs.exists(f.dir)).toBe(false)
    valid.parts[0].id = PartID.make("prt_valid")
    yield* f.archive.publish({ sessionID: f.sessionID, messages: [valid] })
    expect(yield* f.fs.exists(f.dir)).toBe(true)
  }))

  it.live("missing requested file fails; metadata listing and unrelated publication remain available", () => Effect.gen(function* () {
    const f = yield* fixture()
    const input = { sessionID: f.sessionID, messages: [user(f.sessionID)] }
    const [value] = yield* f.archive.publish(input)
    const refs = yield* f.archive.list(f.sessionID)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: value.id })).toEqual(value)
    const index = yield* f.fs.readFileString(f.index)
    yield* f.fs.remove(f.file(value.id))
    yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-unavailable")
    expect(yield* f.archive.list(f.sessionID)).toEqual(refs)
    yield* failure(f.archive.publish(input), "archive-unavailable")
    expect(yield* f.fs.exists(f.file(value.id))).toBe(false)
    expect(yield* f.fs.readFileString(f.index)).toBe(index)
    const [added] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "unrelated")] })
    expect((yield* f.archive.list(f.sessionID)).map((ref) => ref.id)).toEqual([value.id, added.id])
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: added.id })).toEqual(added)
    yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-unavailable")
    expect(yield* f.fs.exists(f.file(value.id))).toBe(false)
  }))

  it.live("hash mutation control: same-size payload alteration fails without immutable repair", () => Effect.gen(function* () {
    const f = yield* fixture()
    const input = { sessionID: f.sessionID, messages: [user(f.sessionID)] }
    const [value] = yield* f.archive.publish(input)
    const refs = yield* f.archive.list(f.sessionID)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: value.id })).toEqual(value)
    const changed = value.markdown.replace("captured observation", "tampered observation")
    expect(changed).not.toBe(value.markdown)
    expect(Buffer.byteLength(changed)).toBe(value.bytes)
    yield* f.fs.writeFileString(f.file(value.id), changed)
    yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-corrupt-hash")
    expect(yield* f.archive.list(f.sessionID)).toEqual(refs)
    yield* failure(f.archive.publish(input), "archive-corrupt-hash")
    const [added] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "unrelated")] })
    expect((yield* f.archive.list(f.sessionID)).map((ref) => ref.id)).toEqual([value.id, added.id])
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: added.id })).toEqual(added)
    yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-corrupt-hash")
    expect(yield* f.fs.readFileString(f.file(value.id))).toBe(changed)
  }))

  it.live("unindexed immutable collisions are hash-checked, never rewritten", () => Effect.gen(function* () {
    const f = yield* fixture()
    const input = { sessionID: f.sessionID, messages: [user(f.sessionID)] }
    const [value] = yield* f.archive.publish(input)
    yield* f.fs.writeFileString(f.index, JSON.stringify({ version: 1, sessionID: f.sessionID, references: [] }))
    const changed = value.markdown.replace("captured observation", "tampered observation")
    yield* f.fs.writeFileString(f.file(value.id), changed)
    yield* failure(f.archive.publish(input), "archive-corrupt-hash")
    expect(yield* f.fs.readFileString(f.file(value.id))).toBe(changed)
    expect(yield* f.archive.list(f.sessionID)).toEqual([])
  }))

  it.live("strict index schema and descriptors reject malformed manifests", () => Effect.gen(function* () {
    const f = yield* fixture()
    const [value] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const { markdown, ...ref } = value
    const index = { version: 1, sessionID: f.sessionID, references: [ref] }
    const bad = [
      "{broken", "null", "[]", JSON.stringify({ ...index, version: 2 }),
      JSON.stringify({ ...index, unexpected: true }), JSON.stringify({ ...index, sessionID: "ses_foreign" }),
      JSON.stringify({ ...index, references: [ref, ref] }),
      ...[{ ...ref, bytes: "10" }, { ...ref, bytes: -1 }, { ...ref, id: "../escape" }, { ...ref, id: `${ref.id}\n` },
        { ...ref, first: "msg_trailing\n", last: "msg_trailing\n" }, { ...ref, extra: "value" },
        { ...ref, first: "not-message" }].map((item) => JSON.stringify({ ...index, references: [item] })),
    ]
    for (const text of bad) {
      yield* f.fs.writeFileString(f.index, text)
      yield* failure(f.archive.list(f.sessionID), "archive-corrupt-index")
      yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-corrupt-index")
      yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "unrelated")] }), "archive-corrupt-index")
      expect(yield* f.fs.readFileString(f.index)).toBe(text)
    }
    for (const item of [{ ...ref, bytes: ref.bytes + 1 }, { ...ref, title: "forged title" },
      { ...ref, first: "msg_forged", last: "msg_forged" }]) {
      yield* f.fs.writeFileString(f.index, JSON.stringify({ ...index, references: [item] }))
      yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-corrupt-content")
      // Listing validates descriptor shape, not its agreement with bytes in the fragment.
      expect(yield* f.archive.list(f.sessionID)).toEqual([item])
      yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] }), "archive-corrupt-content")
    }
    yield* f.fs.writeFileString(f.index, JSON.stringify(index))
    expect(yield* f.archive.list(f.sessionID)).toEqual([ref])
  }))

  it.live("file, index and dangling symlinks cannot escape the session directory", () => Effect.gen(function* () {
    const f = yield* fixture()
    const [value] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const outside = yield* f.fs.makeTempDirectoryScoped()
    for (const target of [f.file(value.id), f.index]) {
      const original = yield* f.fs.readFileString(target)
      const other = path.join(outside, path.basename(target))
      yield* f.fs.writeFileString(other, original)
      yield* f.fs.remove(target)
      yield* f.fs.symlink(other, target)
      yield* failure(f.archive.read({ sessionID: f.sessionID, id: value.id }), "archive-unsafe-path")
      yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] }), "archive-unsafe-path")
      expect(yield* f.fs.readFileString(other)).toBe(original)
      yield* f.fs.remove(target)
      yield* f.fs.symlink(path.join(outside, "missing"), target)
      if (target === f.index) yield* failure(f.archive.list(f.sessionID), "archive-unsafe-path")
      if (target !== f.index) expect(yield* f.archive.list(f.sessionID)).toHaveLength(1)
      yield* f.fs.remove(target)
      yield* f.fs.writeFileString(target, original)
    }
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: value.id })).toEqual(value)
  }))

  it.live("session directory symlink cannot redirect reads or writes", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const outside = yield* f.fs.makeTempDirectoryScoped()
    const moved = path.join(outside, "retained")
    yield* f.fs.rename(f.dir, moved)
    yield* f.fs.symlink(moved, f.dir)
    yield* failure(f.archive.list(f.sessionID), "archive-unsafe-path")
    yield* failure(f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "new")] }), "archive-unsafe-path")
    expect((yield* f.fs.readDirectory(moved)).sort()).toHaveLength(2)
    yield* f.fs.remove(f.dir)
    yield* f.fs.rename(moved, f.dir)
    expect(yield* f.archive.list(f.sessionID)).toHaveLength(1)
  }))

  it.live("rechecks target real paths even when a symlink replaces an inventoried file", () => Effect.gen(function* () {
    const f = yield* fixture()
    const [value] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const outside = yield* f.fs.makeTempDirectoryScoped()
    const target = path.join(outside, "same-content.md")
    yield* f.fs.writeFileString(target, value.markdown)
    const changed = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)), Effect.provideService(FSUtil.Service, {
      ...f.fs,
      readDirectoryEntries: (dir) => Effect.gen(function* () {
        const entries = yield* f.fs.readDirectoryEntries(dir)
        if (dir === f.dir) {
          yield* f.fs.remove(f.file(value.id))
          yield* f.fs.symlink(target, f.file(value.id))
        }
        return entries
      }),
    }))
    yield* failure(changed.read({ sessionID: f.sessionID, id: value.id }), "archive-unsafe-path")
    expect(yield* f.fs.readFileString(target)).toBe(value.markdown)
  }))

  it.live("I/O budget stays fixed as retained history grows; real filesystem counters are calibrated", () => Effect.gen(function* () {
    const measurements: { retained: number; operation: string; scans: number; sessionScans: number; fragmentReads: number }[] = []
    for (const retained of [4, 64]) {
      const f = yield* fixture()
      const old = yield* f.archive.publish({ sessionID: f.sessionID,
        messages: Array.from({ length: retained }, (_, index) => user(f.sessionID, `old${index}`)) })
      expect(old).toHaveLength(retained)
      const meter = instrument(f.fs)
      expect(yield* meter.fs.readDirectoryEntries(f.dir)).toHaveLength(retained + 1)
      expect(Buffer.from(yield* meter.fs.readFile(f.file(old[0].id))).toString()).toBe(old[0].markdown)
      expect(meter.calls).toEqual({ scans: [f.dir], reads: [f.file(old[0].id)] })
      const measured = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)), Effect.provideService(FSUtil.Service, meter.fs))
      const measure = Effect.fnUntraced(function* (operation: string, work: Effect.Effect<unknown, Archive.ArchiveError>, ids: string[]) {
        meter.reset()
        const result = yield* work
        const sessionScans = meter.calls.scans.filter((dir) => dir === f.dir).length
        const fragmentReads = meter.calls.reads.filter((file) => file.endsWith(".md")).length
        measurements.push({ retained, operation, scans: meter.calls.scans.length, sessionScans, fragmentReads })
        expect(sessionScans).toBe(1)
        expect(meter.calls.scans.length).toBeLessThanOrEqual(5)
        expect([...meter.calls.reads].sort()).toEqual([f.index, ...ids.map(f.file)].sort())
        return result
      })
      const messages = Array.from({ length: 5 }, (_, index) => user(f.sessionID, `new${index}`))
      const expected = chunks(f.sessionID, messages)
      const input = { sessionID: f.sessionID, messages }
      expect(yield* measure("append", measured.publish(input), expected.map((value) => value.id))).toEqual(expected)
      expect(yield* measure("retry", measured.publish(input), expected.map((value) => value.id))).toEqual(expected)
      expect(yield* measure("list", measured.list(f.sessionID), [])).toHaveLength(retained + expected.length)
      expect(yield* measure("read", measured.read({ sessionID: f.sessionID, id: old[0].id }), [old[0].id])).toEqual(old[0])
      expect(yield* measure("unknown", measured.read({ sessionID: f.sessionID, id: "0".repeat(64) }), [])).toBeUndefined()
    }
    console.info("archive-io-measurements", JSON.stringify(measurements))
  }))

  it.live("index interruption exposes no partial batch and old references survive restart", () => Effect.gen(function* () {
    const f = yield* fixture()
    const [old] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const original = yield* f.fs.readFileString(f.index)
    const ready = yield* Deferred.make<void>()
    const blocked = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)), Effect.provideService(FSUtil.Service, {
      ...f.fs,
      rename: (from, to) => to === f.index ? Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)) : f.fs.rename(from, to),
    }))
    const messages = [user(f.sessionID, "next"), tool(f.sessionID, "second batch", "nexttool")]
    const expected = chunks(f.sessionID, messages)
    const fiber = yield* blocked.publish({ sessionID: f.sessionID, messages }).pipe(Effect.forkChild)
    yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"))
    for (const value of expected) expect(yield* f.fs.readFileString(f.file(value.id))).toBe(value.markdown)
    expect(yield* f.fs.readFileString(f.index)).toBe(original)
    expect(yield* f.archive.list(f.sessionID)).toHaveLength(1)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: expected[0].id })).toBeUndefined()
    yield* Fiber.interrupt(fiber)
    const cold = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)))
    expect(cold).not.toBe(f.archive)
    expect(yield* cold.read({ sessionID: f.sessionID, id: old.id })).toEqual(old)
    expect(yield* cold.publish({ sessionID: f.sessionID, messages })).toEqual(expected)
    expect(yield* cold.list(f.sessionID)).toHaveLength(3)
    expect((yield* f.fs.readDirectory(f.dir)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  }))

  it.live("failed immutable publication preserves previous index and supports exact retry", () => Effect.gen(function* () {
    const f = yield* fixture()
    const [old] = yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID)] })
    const original = yield* f.fs.readFileString(f.index)
    const messages = [user(f.sessionID, "first"), user(f.sessionID, "second")]
    const expected = chunks(f.sessionID, messages)
    const broken = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)), Effect.provideService(FSUtil.Service, {
      ...f.fs,
      link: (from, to) => to === f.file(expected[1].id)
        ? Effect.fail(systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "injected publication failure" })) : f.fs.link(from, to),
    }))
    yield* failure(broken.publish({ sessionID: f.sessionID, messages }), "archive-unavailable")
    expect(yield* f.fs.readFileString(f.file(expected[0].id))).toBe(expected[0].markdown)
    expect(yield* f.fs.exists(f.file(expected[1].id))).toBe(false)
    expect(yield* f.fs.readFileString(f.index)).toBe(original)
    expect(yield* f.archive.read({ sessionID: f.sessionID, id: old.id })).toEqual(old)
    expect(yield* f.archive.publish({ sessionID: f.sessionID, messages })).toEqual(expected)
    expect(yield* f.archive.list(f.sessionID)).toHaveLength(3)
  }))
})
