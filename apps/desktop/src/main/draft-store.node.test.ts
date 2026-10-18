// Runs under Node with node --test (see package.json): node:sqlite exists in Node and Electron, not in Bun.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFileSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { backup, DatabaseSync } from "node:sqlite"
import { test, type TestContext } from "node:test"
import { createDesktopDraftStore } from "./draft-store.ts"

test("flushes the latest buffered draft and stores blobs", (t) => {
  const store = createDesktopDraftStore(":memory:")
  t.after(() => store.close())
  store.set("prompt", "first")
  store.set("prompt", "latest")
  assert.equal(store.get("prompt"), "latest")
  store.flush()
  assert.equal(store.get("prompt"), "latest")

  const bytes = new TextEncoder().encode("image")
  const id = store.putBlob(bytes)
  assert.deepEqual(new Uint8Array(store.getBlob(id) ?? []), bytes)
})

test("a main-file-only WAL copy misses the committed blob while the draft is buffered", { timeout: 30_000 }, (t) => {
  const fixture = createWalFixture(t)
  assert.equal(fixture.writer.get("prompt"), fixture.document)
  assert.equal(fixture.native.prepare("SELECT value FROM document WHERE key = ?").get("prompt"), undefined)

  const committed = fixture.native.prepare("SELECT data FROM blob WHERE id = ?").get(fixture.id)
  assert.ok(committed?.data instanceof Uint8Array && committed.data.byteLength > 0)
  assert.deepEqual(committed.data, fixture.bytes)
  assert.equal(createHash("sha256").update(committed.data).digest("hex"), fixture.id)
  assert.ok(statSync(`${fixture.filename}-wal`).size > 0)

  // Keep the writer open: copying only the checkpointed main file deliberately omits newer WAL commits.
  const filename = join(fixture.directory, "main-only.sqlite")
  copyFileSync(fixture.filename, filename)
  const copy = new DatabaseSync(filename, { readOnly: true })
  try {
    // Both queries also prove that the copy contains a usable initial schema.
    assert.equal(copy.prepare("SELECT data FROM blob WHERE id = ?").get(fixture.id), undefined)
    assert.equal(copy.prepare("SELECT value FROM document WHERE key = ?").get("prompt"), undefined)
  } finally {
    copy.close()
  }
})

test("restores a flushed WAL snapshot with exact document and blob bytes and hashes", { timeout: 30_000 }, async (t) => {
  const fixture = createWalFixture(t)
  fixture.writer.flush()
  assert.equal(
    fixture.native.prepare("SELECT value FROM document WHERE key = ?").get("prompt")?.value,
    fixture.document,
  )

  const filename = join(fixture.directory, "snapshot.sqlite")
  await backup(fixture.native, filename)
  assert.ok(statSync(filename).size > 0)
  const restored = createDesktopDraftStore(filename)
  try {
    const document = restored.get("prompt")
    assert.ok(document !== null && document.length > 0)
    assert.deepEqual(Buffer.from(document, "utf8"), Buffer.from(fixture.document, "utf8"))
    assert.equal(
      createHash("sha256").update(document).digest("hex"),
      createHash("sha256").update(fixture.document).digest("hex"),
    )

    const bytes = restored.getBlob(fixture.id)
    assert.ok(bytes !== null && bytes.byteLength > 0)
    assert.deepEqual(new Uint8Array(bytes), fixture.bytes)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.id)
  } finally {
    restored.close()
  }
})

test(
  "preserves a new document and both referenced blobs after restoration and relaunch",
  { timeout: 30_000 },
  async (t) => {
    const fixture = createWalFixture(t)
    fixture.writer.flush()
    const filename = join(fixture.directory, "snapshot.sqlite")
    await backup(fixture.native, filename)

    const bytes = new Uint8Array([255, 0, 128, 2, 78, 69, 87, 10])
    assert.ok(bytes.byteLength > 0)
    const id = createHash("sha256").update(bytes).digest("hex")
    assert.notEqual(id, fixture.id)
    const document = JSON.stringify({
      text: "Draft written after restoration — café",
      attachments: [{ blob: { id: fixture.id } }, { blob: { id } }],
    })
    assert.ok(Buffer.byteLength(document, "utf8") > 0)

    const restored = createDesktopDraftStore(filename)
    try {
      assert.equal(restored.get("prompt"), fixture.document)
      assert.equal(restored.putBlob(bytes), id)
      restored.set("after-restore", document)
      assert.equal(restored.get("after-restore"), document)
      restored.flush()
    } finally {
      restored.close()
    }

    const relaunched = createDesktopDraftStore(filename)
    try {
      assert.equal(relaunched.get("prompt"), fixture.document)
      assert.equal(relaunched.get("after-restore"), document)

      const original = relaunched.getBlob(fixture.id)
      assert.ok(original !== null && original.byteLength > 0)
      assert.deepEqual(new Uint8Array(original), fixture.bytes)
      assert.equal(createHash("sha256").update(original).digest("hex"), fixture.id)

      const added = relaunched.getBlob(id)
      assert.ok(added !== null && added.byteLength > 0)
      assert.deepEqual(new Uint8Array(added), bytes)
      assert.equal(createHash("sha256").update(added).digest("hex"), id)
    } finally {
      relaunched.close()
    }
  },
)

function createWalFixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "desktop-draft-store-"))
  const handles: { close(): void }[] = []
  t.after(() => {
    handles.reverse().forEach((handle) => handle.close())
    rmSync(directory, { recursive: true, force: true })
  })

  const filename = join(directory, "source.sqlite")
  const writer = createDesktopDraftStore(filename)
  handles.push(writer)
  const native = new DatabaseSync(filename)
  handles.push(native)
  assert.equal(native.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal")
  const checkpoint = native.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()
  assert.equal(checkpoint?.busy, 0)
  assert.equal(checkpoint?.log, 0)
  assert.equal(checkpoint?.checkpointed, 0)
  assert.equal(statSync(`${filename}-wal`).size, 0)

  const bytes = new Uint8Array([0, 255, 1, 128, 68, 82, 65, 70, 84, 10])
  assert.ok(bytes.byteLength > 0)
  const id = writer.putBlob(bytes)
  assert.equal(id, createHash("sha256").update(bytes).digest("hex"))
  const document = JSON.stringify({
    text: "Draft before snapshot — café",
    attachments: [{ blob: { id } }],
  })
  assert.ok(Buffer.byteLength(document, "utf8") > 0)
  writer.set("prompt", document)
  return { directory, filename, writer, native, bytes, id, document }
}
