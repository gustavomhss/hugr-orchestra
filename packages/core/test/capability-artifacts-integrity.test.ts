import { describe, expect } from "bun:test"
import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { basename, dirname, join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Layer, Ref } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { it, allow, input, fixture, expectCode } from "./fixture/capability-artifacts"

describe("CapabilityArtifacts durable lifecycle", () => {
  it.live("last pinned Session deletion retains independent pin and immutable bytes after TTL", () => Effect.gen(function* () {
    const f = yield* fixture()
    const other = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root, scratchTTL: 1 })
    const ref = yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, input)
      yield* store.pin(f.context, ref, true)
      yield* store.share(f.context, ref, other.context.sessionID)
      return ref
    }))
    yield* CapabilityInvocation.withContext(other.binding, Effect.gen(function* () {
      yield* store.pin(other.context, ref, false)
      yield* store.deleteReference(other.context, ref)
    }))
    const pins = yield* f.database.db.select().from(CapabilityArtifactPinTable)
    expect(pins).toEqual([expect.objectContaining({
      artifact_id: ref.id, revision: ref.revision, session_id: f.context.sessionID, owner: f.binding.owner,
    })])
    const record = yield* f.database.db.select().from(CapabilityArtifactTable).get()
    if (!record) return yield* Effect.die("Expected pinned artifact")
    yield* f.database.db.update(CapabilityArtifactTable).set({ time_created: 1 }).run()
    yield* fs.utimes(join(f.root, record.hash), new Date(1), new Date(1))
    yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* store.cleanup()
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toEqual([])
    expect(yield* f.database.db.select().from(CapabilityArtifactPinTable)).toEqual(pins)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    expect(yield* fs.readFile(join(f.root, record.hash))).toEqual(input.data)
  }), 30_000)

  it.live("two real databases share Global.data but GC cannot touch another database's linked pins; reopen stable root", () => Effect.gen(function* () {
    const f = yield* fixture()
    const global = yield* Global.Service
    const placement = yield* Location.Service
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ scratchTTL: 1 })
    const first = yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, input)
      yield* store.pin(f.context, ref, true)
      return yield* store.read(f.context, ref)
    }))
    yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run()
    const firstRoot = join(global.data, "capability-artifacts", createHash("sha256").update(f.database.storageID ?? "missing").digest("hex"))
    yield* fs.utimes(join(firstRoot, first.metadata.hash), new Date(1), new Date(1))
    const otherLayer = AppNodeBuilder.build(LayerNode.group([
      Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
      AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node,
    ]), [
      [Database.node, Database.layerFromPath(join(placement.directory, "other.sqlite"))],
      [Location.node, Layer.succeed(Location.Service, placement)],
      [Global.node, Layer.succeed(Global.Service, global)],
    ])
    const other = yield* Effect.gen(function* () {
      const g = yield* fixture()
      const db = yield* Database.Service
      expect(db.storageID).not.toBe(f.database.storageID)
      const second = yield* CapabilityArtifacts.make({ scratchTTL: 1 })
      const ref = yield* CapabilityInvocation.withContext(g.binding, second.publish(g.context, {
        ...input, data: new TextEncoder().encode("other database linked bytes"),
      }))
      yield* CapabilityInvocation.withContext(g.binding, second.pin(g.context, ref, true))
      const found = yield* CapabilityInvocation.withContext(g.binding, second.read(g.context, ref))
      const root = join(global.data, "capability-artifacts", createHash("sha256").update(db.storageID ?? "missing").digest("hex"))
      yield* fs.utimes(join(root, found.metadata.hash), new Date(1), new Date(1))
      yield* store.cleanup()
      expect((yield* CapabilityInvocation.withContext(g.binding, second.read(g.context, ref))).data).toEqual(found.data)
      yield* second.cleanup()
      expect(yield* fs.readFile(join(firstRoot, first.metadata.hash))).toEqual(input.data)
      const collision = yield* CapabilityArtifacts.make({ root: firstRoot })
      expectCode(yield* CapabilityInvocation.withContext(g.binding, collision.publish(g.context, input)).pipe(Effect.flip), "artifact_io_failed")
      return { context: g.context, binding: g.binding, ref, data: found.data, storageID: db.storageID }
    }).pipe(Effect.provide(Layer.fresh(otherLayer)))
    yield* Effect.gen(function* () {
      const db = yield* Database.Service
      yield* CapabilityPolicyFixture.setRules(allow)
      expect(db.storageID).toBe(other.storageID)
      const reopened = yield* CapabilityArtifacts.make()
      expect((yield* CapabilityInvocation.withContext(other.binding, reopened.read(other.context, other.ref))).data).toEqual(other.data)
    }).pipe(Effect.provide(Layer.fresh(otherLayer)))
  }), 30_000)

  it.live("closed MIME formats use byte structure, reject binary lies and trailing newline, allow explicit opaque bytes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE8sAAAAASUVORK5CYII=", "base64")
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
    // Standard ZIP-generated OOXML container fixture. This is not an Excel semantic/decoder oracle.
    const xlsx = Buffer.from("UEsDBBQAAAAIACeHSF2U7PTVoAAAANQAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbF2PwQ6CMBBEf4X0augSDx4McPGuHvyBtV2ggXabdkX8ewFvniaTybzJ1I9PpFwsfgq5UYNIPANkM5DHrDlSWJOOk0dZbeohohmxJzhW1QkMB6EgpWwM1da3mVJyloo7Jrmip0bBMsGb0/hkHvXKUsXlV9p2G4UxTs6gOA4wB/u3WHLXOUOWzcuvFZ1jIrR5IBI/6V21RxcOGxjaGvYz7RdQSwMEFAAAAAgAJ4dIXYWgN+RUAAAAYAAAAA8AAAB4bC93b3JrYm9vay54bWw1jEEKgCAQAL8SPqCVDh3C/IvVlqHrirtQzy+CjjMD4y5uaWFO3U25yGyiap0AZI1IQXquWN6yc6OgL7YDpDYMm0REpQyDtSNQOIvx7nMC3sF/9Q9QSwECFAMUAAAACAAnh0hdlOz01aAAAADUAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIACeHSF2FoDfkVAAAAGAAAAAPAAAAAAAAAAAAAACAAdEAAAB4bC93b3JrYm9vay54bWxQSwUGAAAAAAIAAgB+AAAAUgEAAAAA", "base64")
    const good = [
      { mime: "image/png", data: png }, { mime: "image/gif", data: gif },
      { mime: "application/pdf", data: Buffer.from("%PDF-1.7\nstartxref\n0\n%%EOF\n") },
      { mime: "application/json; charset=utf-8", data: Buffer.from('{"ok":true}') },
      { mime: "application/zip", data: xlsx },
      { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: xlsx },
      { mime: "application/octet-stream", data: Buffer.from([0, 255]) },
    ]
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      yield* Effect.forEach(good, (value) => Effect.gen(function* () {
        const ref = yield* store.publish(f.context, { ...input, ...value })
        expect(Array.from((yield* store.read(f.context, ref)).data)).toEqual(Array.from(value.data))
      }))
      const bad = [
        { mime: "image/png", data: Buffer.from("not PNG") }, { mime: "image/png", data: png.subarray(0, 33) },
        { mime: "application/pdf", data: Buffer.from("%PDF-1.7\nmissing footer") },
        { mime: "image/jpeg", data: Buffer.from([255, 216, 255, 0]) },
        { mime: "image/gif", data: gif.subarray(0, gif.length - 1) },
        { mime: "application/zip", data: xlsx.subarray(0, xlsx.length - 1) },
        { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: xlsx },
        { mime: "application/x-unregistered", data: input.data }, { mime: "text/plain\n", data: input.data },
      ]
      yield* Effect.forEach(bad, (value) => store.publish(f.context, { ...input, ...value }).pipe(
        Effect.flip, Effect.tap((error) => Effect.sync(() => expectCode(error, "invalid_input"))),
      ))
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(good.length)
    }))
  }), 30_000)

  it.live("XML root lexical checks reject illegal names, malformed headers and entity declarations without resources", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      yield* Effect.forEach([
        "< >", "<123>", "<root invalid>", "<root a='x' a='y'/>", "<root a='unclosed>",
        "<root></other>", "<root>&external;</root>",
        '<!DOCTYPE root [<!ENTITY external SYSTEM "file:///unread">]><root>&external;</root>',
        `<root a="${"x".repeat(64 * 1024)}"/>`,
      ], (text) => store.publish(f.context, { ...input, mime: "application/xml", data: Buffer.from(text) }).pipe(
        Effect.flip, Effect.tap((error) => Effect.sync(() => expectCode(error, "invalid_input"))),
      ))
      expect(yield* fs.exists(f.root)).toBe(false)
      const good = [
        { mime: "application/xml", text: "<root/>" },
        { mime: "application/xml", text: '<root data="a > b" />' },
        { mime: "text/xml", text: '<?xml version="1.0" encoding="UTF-8"?><r a="x &amp; y"><child/></r>' },
        { mime: "application/xml", text: '<p:根 xmlns:p="urn:scope"/>' },
        { mime: "image/svg+xml", text: '<svg xmlns="http://www.w3.org/2000/svg" width="1"></svg>' },
      ]
      yield* Effect.forEach(good, (value) => Effect.gen(function* () {
        const ref = yield* store.publish(f.context, { ...input, mime: value.mime, data: Buffer.from(value.text) })
        expect(new TextDecoder().decode((yield* store.read(f.context, ref)).data)).toBe(value.text)
      }))
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(good.length)
    }))
  }), 30_000)

  Array.of("root", "staging").forEach((replacement) => it.live(
    `scratch finalizer leaves replacement ${replacement} untouched and later verified GC removes original scratch`,
    () => Effect.gen(function* () {
      const f = yield* fixture()
      const fs = yield* FSUtil.Service
      const placement = yield* Location.Service
      const removed = yield* Ref.make<string[]>([])
      const stage = yield* Ref.make<string | undefined>(undefined)
      const gcRoot = replacement === "root" ? join(placement.directory, "moved-artifacts") : f.root
      const observed = {
        ...fs, remove: (path: string, options?: Parameters<FSUtil.Interface["remove"]>[1]) =>
          Ref.update(removed, (paths) => [...paths, path]).pipe(Effect.andThen(fs.remove(path, options))),
      }
      const normal = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.provideService(FSUtil.Service, observed))
      yield* CapabilityInvocation.withContext(f.binding, normal.publish(f.context, {
        ...input, data: Buffer.from("retained normal publication"),
      }))
      const normalRemovals = yield* Ref.get(removed)
      expect(normalRemovals).toHaveLength(1)
      expect(yield* fs.exists(normalRemovals[0])).toBe(false)
      yield* Ref.set(removed, [])
      const store = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.provideService(FSUtil.Service, {
        ...observed, link: (from, to) => Effect.gen(function* () {
          yield* fs.link(from, to)
          yield* Ref.set(stage, dirname(from))
          yield* fs.rename(replacement === "root" ? f.root : dirname(from), replacement === "root"
            ? gcRoot : join(f.root, `stage-retained-${basename(dirname(from))}`))
          if (replacement === "root") yield* fs.makeDirectory(f.root, { mode: 0o700 })
          yield* fs.makeDirectory(dirname(from), { mode: 0o700 })
          yield* fs.writeFileString(join(dirname(from), "sentinel"), "replacement must survive")
        }),
      }))
      expectCode(yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input)).pipe(Effect.flip), "artifact_io_failed")
      const path = yield* Ref.get(stage)
      if (!path) return yield* Effect.die("Expected actual staging path")
      const original = replacement === "root" ? join(gcRoot, basename(path))
        : join(f.root, `stage-retained-${basename(path)}`)
      expect(yield* fs.readFileString(join(path, "sentinel"))).toBe("replacement must survive")
      expect(yield* fs.readFile(join(original, "blob"))).toEqual(input.data)
      expect(yield* Ref.get(removed)).toEqual([])
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
      yield* fs.utimes(original, new Date(1), new Date(1))
      yield* fs.utimes(join(gcRoot, createHash("sha256").update(input.data).digest("hex")), new Date(1), new Date(1))
      const gc = yield* CapabilityArtifacts.make({ root: gcRoot, scratchTTL: 60_000 })
      yield* gc.cleanup()
      expect(yield* fs.exists(original)).toBe(false)
      expect(yield* fs.readFileString(join(path, "sentinel"))).toBe("replacement must survive")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    }), 30_000,
  ))

  Array.of("before cleanup check", "after scratch removal").forEach((timing) => it.live(
    `publication fails when finalization replaces root ${timing} with matching readonly marker and blob`,
    () => Effect.gen(function* () {
      const f = yield* fixture()
      const fs = yield* FSUtil.Service
      const placement = yield* Location.Service
      const moved = join(placement.directory, "finalization-original")
      const originalStage = yield* Ref.make<string | undefined>(undefined)
      const replaced = yield* Ref.make(false)
      const removals = yield* Ref.make<string[]>([])
      const hash = createHash("sha256").update(input.data).digest("hex")
      const replace = Effect.gen(function* () {
        yield* fs.rename(f.root, moved)
        yield* fs.makeDirectory(f.root, { mode: 0o700 })
        yield* fs.copyFile(join(moved, ".store"), join(f.root, ".store"))
        yield* fs.copyFile(join(moved, hash), join(f.root, hash))
        yield* fs.chmod(join(f.root, ".store"), 0o400)
        yield* fs.chmod(join(f.root, hash), 0o400)
        expect(yield* fs.readFile(join(f.root, hash))).toEqual(input.data)
        expect(yield* fs.readFile(join(f.root, ".store"))).toEqual(yield* fs.readFile(join(moved, ".store")))
        yield* Ref.set(replaced, true)
      })
      const store = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.provideService(FSUtil.Service, {
        ...fs,
        remove: (path, options) => Effect.gen(function* () {
          yield* Ref.update(removals, (paths) => [...paths, path])
          yield* fs.remove(path, options)
          if (timing === "after scratch removal") yield* replace
        }),
        link: (from, to) => Effect.gen(function* () {
          yield* fs.link(from, to)
          yield* Ref.set(originalStage, join(moved, basename(dirname(from))))
          // LIFO scope cleanup runs this after linked-byte verification, before the store's scratch finalizer.
          if (timing === "before cleanup check") yield* Effect.addFinalizer(() => replace.pipe(Effect.orDie))
        }),
      }))
      expectCode(yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input)).pipe(Effect.flip), "artifact_io_failed")
      expect(yield* Ref.get(replaced)).toBe(true)
      const stage = yield* Ref.get(originalStage)
      if (!stage) return yield* Effect.die("Expected original staging path")
      if (timing === "before cleanup check") expect(yield* fs.readFile(join(stage, "blob"))).toEqual(input.data)
      if (timing === "after scratch removal") expect(yield* fs.exists(stage)).toBe(false)
      expect(yield* Ref.get(removals)).toHaveLength(timing === "before cleanup check" ? 0 : 1)
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual([])
      expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toEqual([])
      // Replacement has valid bytes/marker/permissions: a fresh factory could otherwise silently adopt it.
      const control = yield* CapabilityArtifacts.make({ root: f.root })
      const ref = yield* CapabilityInvocation.withContext(f.binding, control.publish(f.context, input))
      expect((yield* CapabilityInvocation.withContext(f.binding, control.read(f.context, ref))).data).toEqual(input.data)
    }), 30_000,
  ))

  it.live("symlink matching external bytes and symlink roots are rejected; writable or foreign hard-linked dedup fails", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const placement = yield* Location.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, input)
      const found = yield* store.read(f.context, ref)
      const path = join(f.root, found.metadata.hash)
      yield* fs.chmod(path, 0o600)
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      yield* fs.chmod(path, 0o400)
      const external = join(placement.directory, "external")
      yield* fs.link(path, external)
      expectCode(yield* store.publish(f.context, input).pipe(Effect.flip), "artifact_corrupt")
      yield* fs.remove(external)
      expect((yield* store.read(f.context, ref)).data).toEqual(input.data)
      yield* fs.writeFile(external, input.data, { mode: 0o400 })
      yield* fs.remove(path)
      yield* fs.symlink(external, path)
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.describe(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.publish(f.context, input).pipe(Effect.flip), "artifact_corrupt")
      expect(yield* fs.readFile(external)).toEqual(input.data)
      const moved = join(placement.directory, "moved-root")
      yield* fs.rename(f.root, moved)
      yield* fs.symlink(moved, f.root)
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.publish(f.context, input).pipe(Effect.flip), "artifact_io_failed")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    }))
  }), 30_000)

  it.live("bounded same-descriptor reads reject grown files and oversized persisted byte claims", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root, boundedBytes: 8 })
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, { ...input, data, mime: "application/octet-stream", metadata: null })
      const found = yield* store.read(f.context, ref)
      expect(found.data).toEqual(data)
      const grown = new Uint8Array(64).fill(42)
      grown.set(data)
      const path = join(f.root, found.metadata.hash)
      yield* fs.chmod(path, 0o600)
      yield* fs.writeFile(path, grown)
      yield* fs.chmod(path, 0o400)
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      const hash = createHash("sha256").update(grown).digest("hex")
      yield* fs.writeFile(join(f.root, hash), grown, { mode: 0o400 })
      yield* f.database.db.update(CapabilityArtifactTable).set({ hash, bytes: grown.length }).run()
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.describe(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
    }))
  }), 30_000)

  it.live("input bytes and JSON are snapshotted before real approval waits", () => Effect.gen(function* () {
    const f = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    const data = Buffer.from("before")
    const metadata = { title: "before" }
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const pending = yield* CapabilityInvocation.withContext({ ...f.binding, effectiveRules: [] },
      store.publish(f.context, { ...input, data, metadata })).pipe(Effect.forkChild)
    const request = yield* Deferred.await(observation.first)
    data.fill(120)
    metadata.title = "after"
    yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    const ref = yield* Fiber.join(pending)
    const found = yield* CapabilityInvocation.withContext(f.binding, store.read(f.context, ref))
    expect(new TextDecoder().decode(found.data)).toBe("before")
    expect(found.metadata.metadata).toEqual({ title: "before" })
  }).pipe(Effect.timeout("20 seconds")), 30_000)

  it.live("missing storageID fixture adapters share identity by real DB object, not artifact factory", () => Effect.gen(function* () {
    const f = yield* fixture()
    // Omit only storageID. Commits still require the real transaction identity and die closed without it.
    const adapter = { db: f.database.db, inTransaction: f.database.inTransaction }
    const first = yield* CapabilityArtifacts.make().pipe(Effect.provideService(Database.Service, adapter))
    const ref = yield* CapabilityInvocation.withContext(f.binding, first.publish(f.context, input))
    const second = yield* CapabilityArtifacts.make().pipe(Effect.provideService(Database.Service, adapter))
    expect((yield* CapabilityInvocation.withContext(f.binding, second.read(f.context, ref))).data).toEqual(input.data)
  }), 30_000)

  it.live("actual FS publication holds actor state through SQLite commit; revocation waits and then blocks writes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const agents = yield* AgentV2.Service
    const linked = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const attempted = yield* Deferred.make<void>()
    const revoked = yield* Ref.make(false)
    // This barrier delegates to the real filesystem link; only scheduling is controlled.
    const store = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.provideService(FSUtil.Service, {
      ...fs, link: (from, to) => fs.link(from, to).pipe(
        Effect.andThen(Deferred.succeed(linked, undefined)), Effect.andThen(Deferred.await(release)),
      ),
    }))
    const pending = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input)).pipe(Effect.forkChild)
    yield* Deferred.await(linked)
    const revocation = yield* Effect.gen(function* () {
      yield* Deferred.succeed(attempted, undefined)
      yield* agents.transform((editor) => editor.update(f.context.agent, (agent) => {
        agent.permissions = [{ action: "artifact.*", resource: "*", effect: "deny" }]
      }))
      yield* Ref.set(revoked, true)
    }).pipe(Effect.forkChild)
    yield* Deferred.await(attempted)
    yield* Effect.yieldNow
    expect(yield* Ref.get(revoked)).toBe(false)
    yield* Deferred.succeed(release, undefined)
    const ref = yield* Fiber.join(pending)
    yield* Fiber.join(revocation)
    expect(yield* Ref.get(revoked)).toBe(true)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    expectCode(yield* CapabilityInvocation.withContext(f.binding, store.pin(f.context, ref, true)).pipe(Effect.flip), "target_denied")
  }).pipe(Effect.timeout("20 seconds")), 30_000)
})
